from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from ..models import Customer, Employee, EmployeeAssignment, Order, Proposal, ProposalMessage, ProposalStatus, Site
from ..schemas import ProposalDraftPayload
from ..utils import as_datetime, decimal_or_none, ensure, json_dumps, json_loads
from .gemini_client import generate_text


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _extract_json_object(text: str) -> dict[str, Any]:
    candidate = text.strip()
    try:
        data = json.loads(candidate)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise HTTPException(status_code=502, detail="Gemini did not return a valid JSON object.")

    try:
        data = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Gemini returned malformed JSON.") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Gemini JSON response was not an object.")
    return data


class ExtractedProposalSite(BaseModel):
    siteName: str
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    notes: str | None = None
    requiredSkills: list[str] = Field(default_factory=list)
    requiredCertifications: list[str] = Field(default_factory=list)
    estimatedHours: float | None = None

    @field_validator("requiredSkills", "requiredCertifications", mode="before")
    @classmethod
    def _coerce_list_fields(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return list(value)


class ExtractedProposal(BaseModel):
    customerCompanyName: str | None = None
    customerStreet: str | None = None
    customerZipCode: str | None = None
    customerCity: str | None = None
    customerCountry: str | None = "DE"
    contactName: str | None = None
    contactPhone: str | None = None
    contactEmail: str | None = None
    summary: str
    orderTitle: str
    orderDescription: str | None = None
    proposedSites: list[ExtractedProposalSite] = Field(default_factory=list)
    requiredSkills: list[str] = Field(default_factory=list)
    requiredCertifications: list[str] = Field(default_factory=list)
    preferredStartDate: datetime | None = None
    preferredEndDate: datetime | None = None
    estimatedHours: float | None = None
    currency: str = "EUR"

    @field_validator("proposedSites", "requiredSkills", "requiredCertifications", mode="before")
    @classmethod
    def _coerce_collection_fields(cls, value: Any) -> list[Any]:
        if value is None:
            return []
        return list(value)

    @field_validator("customerCountry", mode="before")
    @classmethod
    def _default_country(cls, value: Any) -> str:
        if value is None or str(value).strip() == "":
            return "DE"
        return str(value).strip().upper()

    @field_validator("currency", mode="before")
    @classmethod
    def _default_currency(cls, value: Any) -> str:
        if value is None or str(value).strip() == "":
            return "EUR"
        return str(value).strip().upper()


def _chat_lines(messages: list[ProposalMessage]) -> str:
    lines: list[str] = []
    for message in messages:
        role = "Manager" if message.role == "user" else "Assistant"
        lines.append(f"{role}: {message.content}")
    return "\n".join(lines)


def build_intake_chat_prompt(proposal: Proposal, messages: list[ProposalMessage]) -> str:
    known_customer = proposal.customer_company_name or "unknown"
    known_title = proposal.order_title or "unknown"
    return "\n".join(
        [
            "You are an ERP intake assistant for a German construction company.",
            "Your job is to help a manager capture a client's requirements as clearly as possible.",
            "Rules:",
            "- Ask concise follow-up questions when scope, dates, site details, or staffing needs are missing.",
            "- Use plain business language.",
            "- Do not invent facts that are not present in the conversation.",
            "- Keep replies short and practical.",
            f"Known customer: {known_customer}",
            f"Known order title: {known_title}",
            "",
            "Conversation so far:",
            _chat_lines(messages),
            "",
            "Assistant:",
        ]
    )


def build_proposal_prompt(messages: list[ProposalMessage]) -> str:
    schema = {
        "customerCompanyName": "string|null",
        "customerStreet": "string|null",
        "customerZipCode": "string|null",
        "customerCity": "string|null",
        "customerCountry": "string|null",
        "contactName": "string|null",
        "contactPhone": "string|null",
        "contactEmail": "string|null",
        "summary": "string",
        "orderTitle": "string",
        "orderDescription": "string|null",
        "proposedSites": [
            {
                "siteName": "string",
                "street": "string|null",
                "zipCode": "string|null",
                "city": "string|null",
                "notes": "string|null",
                "requiredSkills": ["string"],
                "requiredCertifications": ["string"],
                "estimatedHours": "number|null",
            }
        ],
        "requiredSkills": ["string"],
        "requiredCertifications": ["string"],
        "preferredStartDate": "ISO-8601 datetime|null",
        "preferredEndDate": "ISO-8601 datetime|null",
        "estimatedHours": "number|null",
        "currency": "string",
    }
    return "\n".join(
        [
            "You convert a client intake transcript into a structured proposal draft.",
            "Return only valid JSON. Do not wrap it in markdown.",
            "Do not invent missing facts. Use null or empty arrays instead.",
            "Use EUR as currency unless the transcript explicitly states another currency.",
            "Use DE as customerCountry when the project is clearly in Germany and no other country is stated.",
            "Prefer German business wording inside summary and orderDescription.",
            "",
            f"Required JSON schema: {json.dumps(schema, ensure_ascii=True)}",
            "",
            "Transcript:",
            _chat_lines(messages),
        ]
    )


def append_message(db: Session, proposal: Proposal, role: str, content: str) -> ProposalMessage:
    message = ProposalMessage(proposal_id=proposal.id, role=role, content=content.strip())
    db.add(message)
    db.flush()
    return message


def _normalize_sites(raw_sites: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sites: list[dict[str, Any]] = []
    for raw_site in raw_sites:
        site_name = str(raw_site.get("siteName", "")).strip()
        if not site_name:
            continue
        sites.append(
            {
                "siteName": site_name,
                "street": raw_site.get("street") or None,
                "zipCode": raw_site.get("zipCode") or None,
                "city": raw_site.get("city") or None,
                "notes": raw_site.get("notes") or None,
                "requiredSkills": _dedupe_strings(list(raw_site.get("requiredSkills") or [])),
                "requiredCertifications": _dedupe_strings(list(raw_site.get("requiredCertifications") or [])),
                "estimatedHours": raw_site.get("estimatedHours"),
            }
        )
    return sites


def apply_proposal_update(proposal: Proposal, payload: ProposalDraftPayload | ExtractedProposal) -> Proposal:
    data = payload.model_dump()
    proposal.status = data.get("status") or (
        ProposalStatus.draft.value if data.get("summary") or data.get("orderTitle") else proposal.status
    )
    proposal.customer_company_name = data.get("customerCompanyName")
    proposal.customer_street = data.get("customerStreet")
    proposal.customer_zip_code = data.get("customerZipCode")
    proposal.customer_city = data.get("customerCity")
    proposal.customer_country = data.get("customerCountry") or proposal.customer_country or "DE"
    proposal.contact_name = data.get("contactName")
    proposal.contact_phone = data.get("contactPhone")
    proposal.contact_email = data.get("contactEmail")
    proposal.summary = data.get("summary")
    proposal.order_title = data.get("orderTitle")
    proposal.order_description = data.get("orderDescription")

    normalized_sites = _normalize_sites(data.get("proposedSites") or [])
    proposal.proposed_sites_json = json_dumps(normalized_sites)

    required_skills = _dedupe_strings(list(data.get("requiredSkills") or []))
    required_certifications = _dedupe_strings(list(data.get("requiredCertifications") or []))
    proposal.required_skills_json = json_dumps(required_skills)
    proposal.required_certifications_json = json_dumps(required_certifications)
    proposal.preferred_start_date = as_datetime(data.get("preferredStartDate"))
    proposal.preferred_end_date = as_datetime(data.get("preferredEndDate"))
    proposal.estimated_hours = decimal_or_none(data.get("estimatedHours"))
    proposal.estimated_price = decimal_or_none(data.get("estimatedPrice"))
    proposal.currency = data.get("currency") or proposal.currency or "EUR"
    if "recommendedTeam" in data:
        recommended_team = data.get("recommendedTeam")
        proposal.recommended_team_json = json_dumps(recommended_team) if recommended_team is not None else None
    return proposal


def extract_proposal_from_messages(proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedProposal:
    prompt = build_proposal_prompt(messages)
    raw_text = generate_text(prompt, response_mime_type="application/json")
    try:
        extracted = ExtractedProposal.model_validate(_extract_json_object(raw_text))
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini proposal output failed validation: {exc}") from exc

    if not extracted.proposedSites:
        extracted.proposedSites = [
            ExtractedProposalSite(
                siteName=extracted.customerCity or extracted.customerCompanyName or "Baustelle 1",
                city=extracted.customerCity,
                requiredSkills=extracted.requiredSkills,
                requiredCertifications=extracted.requiredCertifications,
            )
        ]

    apply_proposal_update(proposal, extracted)
    proposal.status = ProposalStatus.draft.value
    return extracted


def proposal_sites(proposal: Proposal) -> list[dict[str, Any]]:
    return list(json_loads(proposal.proposed_sites_json, []))


def proposal_required_skills(proposal: Proposal) -> list[str]:
    return list(json_loads(proposal.required_skills_json, []))


def proposal_required_certifications(proposal: Proposal) -> list[str]:
    return list(json_loads(proposal.required_certifications_json, []))


def proposal_window(proposal: Proposal) -> tuple[datetime, datetime]:
    start = proposal.preferred_start_date or datetime.now(timezone.utc)
    end = proposal.preferred_end_date or (start + timedelta(days=14))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end < start:
        end = start
    return start, end


def _site_hours(site: dict[str, Any], fallback: float) -> float:
    try:
        hours = float(site.get("estimatedHours"))
    except (TypeError, ValueError):
        hours = fallback
    return max(hours, 0.0)


def calculate_price_from_assignments(
    db: Session,
    proposal: Proposal,
    site_assignments: dict[int, list[str]],
    manual_estimated_price: float | None = None,
) -> Decimal:
    if manual_estimated_price is not None:
        return Decimal(str(manual_estimated_price))

    sites = proposal_sites(proposal)
    total_hours = float(proposal.estimated_hours or 0)
    fallback_hours = (total_hours / max(len(sites), 1)) if total_hours else 8.0
    total_price = Decimal("0")

    for site_index, site in enumerate(sites):
        selected_employee_ids = list(dict.fromkeys(site_assignments.get(site_index, [])))
        if not selected_employee_ids:
            continue
        employees = [db.get(Employee, employee_id) for employee_id in selected_employee_ids]
        ensure(all(employee is not None for employee in employees), "Ausgewaehlter Mitarbeiter existiert nicht.", 404)
        rates: list[Decimal] = []
        for employee in employees:
            if employee.default_hourly_rate is None:
                raise HTTPException(
                    status_code=400,
                    detail="Mindestens ein ausgewaehlter Mitarbeiter hat keinen Standard-Stundensatz. Bitte Preis manuell setzen.",
                )
            rates.append(Decimal(str(employee.default_hourly_rate)))
        average_rate = sum(rates, Decimal("0")) / Decimal(str(len(rates)))
        total_price += average_rate * Decimal(str(_site_hours(site, fallback_hours)))

    if total_price == Decimal("0"):
        raise HTTPException(status_code=400, detail="Keine gueltigen Mitarbeiterauswahlen fuer die Preisberechnung.")
    return total_price.quantize(Decimal("0.01"))


def confirm_proposal(
    db: Session,
    proposal: Proposal,
    existing_customer_id: str | None,
    site_assignments: dict[int, list[str]],
    manual_estimated_price: float | None = None,
) -> dict[str, Any]:
    ensure(proposal.status in {ProposalStatus.draft.value, ProposalStatus.reviewed.value}, "Vorschlag ist nicht bestaetigbar.")
    ensure(proposal.order_title and proposal.order_title.strip(), "Vorschlag hat keinen Auftragstitel.")

    sites = proposal_sites(proposal)
    ensure(bool(sites), "Vorschlag enthaelt keine Baustellen.")

    if existing_customer_id:
        customer = db.get(Customer, existing_customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Ausgewaehlter Kunde nicht gefunden.")
    else:
        ensure(bool(proposal.customer_company_name and proposal.customer_company_name.strip()), "Firmenname fuer neuen Kunden fehlt.")
        customer = Customer(
            company_name=proposal.customer_company_name.strip(),
            street=proposal.customer_street,
            zip_code=proposal.customer_zip_code,
            city=proposal.customer_city,
            country=proposal.customer_country or "DE",
            contact_name=proposal.contact_name,
            contact_phone=proposal.contact_phone,
            contact_email=proposal.contact_email,
            notes=f"Erstellt aus KI-Vorschlag {proposal.id}",
        )
        db.add(customer)
        db.flush()

    order = Order(
        customer_id=customer.id,
        title=proposal.order_title.strip(),
        description=proposal.order_description or proposal.summary,
        status="open",
        start_date=proposal.preferred_start_date,
        end_date=proposal.preferred_end_date,
        default_hourly_rate=None,
        currency=proposal.currency or "EUR",
    )
    db.add(order)
    db.flush()

    created_site_ids: list[str] = []
    for index, site_data in enumerate(sites):
        ensure(bool(site_assignments.get(index)), f"Bitte mindestens einen Mitarbeiter fuer Baustelle {index + 1} auswaehlen.")
        site = Site(
            order_id=order.id,
            site_name=site_data["siteName"],
            street=site_data.get("street"),
            zip_code=site_data.get("zipCode"),
            city=site_data.get("city"),
            notes=site_data.get("notes"),
            is_active=True,
        )
        db.add(site)
        db.flush()
        created_site_ids.append(site.id)

        for employee_id in dict.fromkeys(site_assignments.get(index, [])):
            employee = db.get(Employee, employee_id)
            if not employee:
                raise HTTPException(status_code=404, detail="Ausgewaehlter Mitarbeiter nicht gefunden.")
            assignment = EmployeeAssignment(
                employee_id=employee_id,
                site_id=site.id,
                start_date=proposal.preferred_start_date,
                end_date=proposal.preferred_end_date,
                notes=f"KI-Vorschlag {proposal.id}",
            )
            db.add(assignment)

    proposal.estimated_price = calculate_price_from_assignments(
        db,
        proposal,
        site_assignments=site_assignments,
        manual_estimated_price=manual_estimated_price,
    )
    proposal.status = ProposalStatus.converted.value
    proposal.converted_customer_id = customer.id
    proposal.converted_order_id = order.id
    db.flush()

    return {
        "proposalId": proposal.id,
        "customerId": customer.id,
        "orderId": order.id,
        "siteIds": created_site_ids,
        "estimatedPrice": proposal.estimated_price,
        "currency": proposal.currency,
    }
