from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Customer, CustomerWorkshop, Employee, EmployeeAssignment, Order, PaymentRecord, Proposal, ProposalFact, ProposalMessage, ProposalStatus, Site
from ..schemas import ProposalDraftPayload
from ..utils import as_datetime, decimal_or_none, ensure, json_dumps, json_loads
from .gemini_client import generate_text


logger = logging.getLogger(__name__)


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


def _contains_arabic(text: str) -> bool:
    for char in text:
        codepoint = ord(char)
        if (0x0600 <= codepoint <= 0x06FF) or (0x0750 <= codepoint <= 0x077F) or (0x08A0 <= codepoint <= 0x08FF):
            return True
    return False


def _manager_messages(messages: list[ProposalMessage]) -> list[str]:
    return [message.content for message in messages if message.role == "user" and message.content]


def _latest_manager_message(messages: list[ProposalMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user" and message.content:
            return message.content
    return ""


def _conversation_language_mode(messages: list[ProposalMessage]) -> str:
    latest_manager_message = _latest_manager_message(messages)
    manager_text = "\n".join(_manager_messages(messages))
    if _contains_arabic(latest_manager_message) or _contains_arabic(manager_text):
        return "arabic"
    return "default"


_ROLE_CONTINUATION_RE = re.compile(
    r"(?:^|\n)\s*(?:Manager|User|Assistant|Human|System|\u0627\u0644\u0645\u062f\u064a\u0631|\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645|\u0627\u0644\u0645\u0633\u0627\u0639\u062f)\s*[:\uff1a]",
    flags=re.IGNORECASE,
)
_LEADING_ASSISTANT_LABEL_RE = re.compile(
    r"^\s*(?:Assistant|\u0627\u0644\u0645\u0633\u0627\u0639\u062f)\s*[:\uff1a]\s*",
    flags=re.IGNORECASE,
)


def sanitize_intake_assistant_reply(text: str) -> str:
    """Keep only the next assistant reply, not hallucinated transcript turns."""
    candidate = _LEADING_ASSISTANT_LABEL_RE.sub("", text.strip())
    match = _ROLE_CONTINUATION_RE.search(candidate)
    if match:
        candidate = candidate[: match.start()]
    return candidate.strip()


def construction_scope_guidance() -> str:
    """Hidden renovation checklist used only to guide AI scope questions and proposals."""
    return "\n".join(
        [
            "Construction scope checklist / \u0642\u0627\u0626\u0645\u0629 \u062a\u062f\u0642\u064a\u0642 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062a\u0631\u0645\u064a\u0645 (hidden guidance, not UI text):",
            "- Flooring/tile / \u0627\u0644\u0628\u0644\u0627\u0637 \u0648\u0627\u0644\u0623\u0631\u0636\u064a\u0627\u062a: material granite/ceramic/marble/porcelain/parquet; tile size; stairs/edges/corners; remove old flooring vs install over old; normal/leveled/decorative installation.",
            "- Painting / \u0627\u0644\u062f\u0647\u0627\u0646: simple paint without putty; partial/full putty; decorative texture/glitter/antique/epoxy; number of coats; interior vs exterior/facade.",
            "- Electrical / \u0627\u0644\u0643\u0647\u0631\u0628\u0627\u0621: full rewiring vs added points; standard/smart panel; LED decorative/standard lighting; internet/cameras/fire alarm; smart controls.",
            "- Plumbing/sanitary / \u0627\u0644\u0635\u062d\u064a\u0629: fixture replacement only; full/partial water and drainage pipes; standard/mid/luxury quality; central/separate heaters; filtration/desalination.",
            "- Aluminum/carpentry / \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0646\u062c\u0627\u0631\u0629: aluminum windows with/without shutters; single/double glazing; glass/iron/MDF/PVC; built-in cabinets; railings/fences/gates.",
            "- Insulation / \u0627\u0644\u0639\u0632\u0644: waterproofing for roofs/bathrooms/kitchens/balconies; thermal foam/XPS/walls/roofs/panels; sound insulation; bitumen/foam/compressed boards.",
            "- Gypsum/decor / \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062c\u0628\u0633 \u0648\u0627\u0644\u062f\u064a\u0643\u0648\u0631: flat/decorative gypsum ceilings; cornices; gypsum board partitions; fireplace/facade decor.",
            "- Civil/structural renovation / \u0623\u0639\u0645\u0627\u0644 \u0645\u062f\u0646\u064a\u0629 \u0648\u0647\u064a\u0643\u0644\u064a\u0629: cracks in walls/ceilings; column/beam reinforcement with engineering review; demolition/openings/arches; facade renovation and external insulation.",
            "Use this checklist selectively: do not ask every checklist question at once; ask only relevant missing items; ask maximum 2-4 practical follow-up questions per reply; never invent materials, quantities, grades, or installation methods.",
            "For proposals, include known checklist details in site notes/orderDescription and mark important missing details as to be confirmed.",
        ]
    )


def _strip_json_code_fence(text: str) -> str:
    candidate = text.strip()
    if not candidate.startswith("```"):
        return candidate
    lines = candidate.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_json_object(text: str) -> dict[str, Any]:
    candidate = _strip_json_code_fence(text)
    try:
        data = json.loads(candidate)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise HTTPException(status_code=502, detail="AI provider did not return a valid JSON object.")

    try:
        data = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AI provider returned malformed JSON.") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI provider JSON response was not an object.")
    return data


def _distribute_hours(total_hours: float, buckets: int) -> list[float]:
    if buckets <= 0:
        return []
    if total_hours <= 0:
        return [0.0 for _ in range(buckets)]

    rounded_total = round(float(total_hours), 2)
    base_value = round(rounded_total / buckets, 2)
    values = [base_value for _ in range(buckets)]
    correction = round(rounded_total - sum(values), 2)
    values[-1] = round(values[-1] + correction, 2)
    return values


class ExtractedProposalSite(BaseModel):
    siteName: str
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    notes: str | None = None
    requiredSkills: list[str] = Field(default_factory=list)
    requiredCertifications: list[str] = Field(default_factory=list)
    estimatedHours: float | None = None
    recommendedHeadcount: int | None = None
    resourceStrategy: str | None = None

    @field_validator("requiredSkills", "requiredCertifications", mode="before")
    @classmethod
    def _coerce_list_fields(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return list(value)


class ExtractedPaymentDraft(BaseModel):
    type: str = "deposit"
    status: str = "planned"
    amount: float | None = None
    currency: str = "EUR"
    dueDate: datetime | None = None
    paidDate: datetime | None = None
    method: str | None = None
    reference: str | None = None
    notes: str | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def _default_currency(cls, value: Any) -> str:
        return str(value or "EUR").strip().upper() or "EUR"


class ExtractedExternalWorkshop(BaseModel):
    name: str
    contactName: str | None = None
    phone: str | None = None
    email: str | None = None
    specialties: list[str] = Field(default_factory=list)
    suggestedFor: list[str] = Field(default_factory=list)
    relationshipStatus: str = "known"
    notes: str | None = None

    @field_validator("specialties", "suggestedFor", mode="before")
    @classmethod
    def _coerce_lists(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return [str(item).strip() for item in list(value) if str(item).strip()]


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
    paymentDrafts: list[ExtractedPaymentDraft] = Field(default_factory=list)
    externalWorkshops: list[ExtractedExternalWorkshop] = Field(default_factory=list)
    staffingPlan: dict[str, Any] | None = None

    @field_validator("proposedSites", "requiredSkills", "requiredCertifications", "paymentDrafts", "externalWorkshops", mode="before")
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

    @model_validator(mode="after")
    def _fill_missing_site_hours(self) -> "ExtractedProposal":
        total_hours = float(self.estimatedHours or 0)
        if total_hours <= 0 or not self.proposedSites:
            return self

        known_indices: list[int] = []
        missing_indices: list[int] = []
        known_total = 0.0

        for index, site in enumerate(self.proposedSites):
            try:
                hours = float(site.estimatedHours) if site.estimatedHours is not None else None
            except (TypeError, ValueError):
                hours = None

            if hours is None or hours <= 0:
                missing_indices.append(index)
            else:
                known_indices.append(index)
                known_total += hours

        if not missing_indices:
            return self

        if known_total <= 0:
            allocations = _distribute_hours(total_hours, len(self.proposedSites))
            for index, hours in enumerate(allocations):
                self.proposedSites[index].estimatedHours = hours
            return self

        remaining = round(total_hours - known_total, 2)
        if remaining <= 0:
            return self

        allocations = _distribute_hours(remaining, len(missing_indices))
        for index, hours in zip(missing_indices, allocations):
            self.proposedSites[index].estimatedHours = hours
        return self


FACT_CATEGORIES = {
    "customer",
    "contact",
    "project",
    "site",
    "work_package",
    "contractor_workshop",
    "external_team",
    "internal_staffing_need",
    "payment",
    "open_question",
}


class ExtractedFact(BaseModel):
    category: str
    key: str
    value: Any
    confidence: float | None = 0.7
    sourceMessageIds: list[str] = Field(default_factory=list)

    @field_validator("category", mode="before")
    @classmethod
    def _normalize_category(cls, value: Any) -> str:
        normalized = str(value or "").strip().lower()
        return normalized if normalized in FACT_CATEGORIES else "project"

    @field_validator("key", mode="before")
    @classmethod
    def _normalize_key(cls, value: Any) -> str:
        return str(value or "fact").strip() or "fact"

    @field_validator("sourceMessageIds", mode="before")
    @classmethod
    def _coerce_sources(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return [str(item) for item in list(value)]


class ExtractedMemory(BaseModel):
    facts: list[ExtractedFact] = Field(default_factory=list)
    memorySummary: dict[str, Any] = Field(default_factory=dict)
    paymentDrafts: list[ExtractedPaymentDraft] = Field(default_factory=list)
    externalWorkshops: list[ExtractedExternalWorkshop] = Field(default_factory=list)
    staffingPlan: dict[str, Any] | None = None

    @field_validator("facts", "paymentDrafts", "externalWorkshops", mode="before")
    @classmethod
    def _coerce_collections(cls, value: Any) -> list[Any]:
        if value is None:
            return []
        return list(value)


def _chat_lines(messages: list[ProposalMessage]) -> str:
    lines: list[str] = []
    for message in messages:
        role = "Manager" if message.role == "user" else "Assistant"
        lines.append(f"{role}: {message.content}")
    return "\n".join(lines)


def _safe_json(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (dict, list)):
        return value
    return json_loads(str(value), default)


def _facts_for_prompt(proposal: Proposal) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for fact in getattr(proposal, "facts", []) or []:
        if not fact.is_active:
            continue
        result.append(
            {
                "category": fact.category,
                "key": fact.fact_key,
                "value": _safe_json(fact.value_json, None),
                "confidence": float(fact.confidence or 0),
            }
        )
    return result


def build_memory_extraction_prompt(proposal: Proposal, messages: list[ProposalMessage]) -> str:
    schema = {
        "facts": [
            {
                "category": "customer|contact|project|site|work_package|contractor_workshop|external_team|internal_staffing_need|payment|open_question",
                "key": "short stable key",
                "value": "string, number, object, or array",
                "confidence": "0.0-1.0",
                "sourceMessageIds": ["message ids if known"],
            }
        ],
        "memorySummary": {
            "customer": "object|null",
            "project": "object|null",
            "sites": ["object"],
            "contractorWorkshops": ["object"],
            "payments": ["object"],
            "openQuestions": ["string"],
        },
        "paymentDrafts": [
            {
                "type": "deposit|advance|installment|final|other",
                "status": "planned|received|refunded|canceled",
                "amount": "number|null",
                "currency": "string",
                "dueDate": "ISO-8601 datetime|null",
                "paidDate": "ISO-8601 datetime|null",
                "method": "string|null",
                "reference": "string|null",
                "notes": "string|null",
            }
        ],
        "externalWorkshops": [
            {
                "name": "string",
                "contactName": "string|null",
                "phone": "string|null",
                "email": "string|null",
                "specialties": ["string"],
                "suggestedFor": ["site or work package name"],
                "relationshipStatus": "known|preferred|one_time|blocked",
                "notes": "string|null",
            }
        ],
        "staffingPlan": "object|null",
    }
    return "\n".join(
        [
            "Extract isolated memory for this one ERP intake chat only.",
            "Return only valid JSON. Do not wrap it in markdown.",
            "Do not use knowledge from any other chat, customer, or proposal.",
            "Contractor context: the customer/contractor may mention workshops they already work with. If a workshop is an external team/subcontractor/company, put it in externalWorkshops and contractor_workshop/external_team facts. If it is a physical work area, room, site, or task package, put it in site/work_package facts instead.",
            "Payments: capture deposits, advance payments, installments, paid amounts, due payments, methods, and references.",
            "Internal employees must not be invented. Store only staffing needs or external teams mentioned by the manager.",
            f"Required JSON schema: {json.dumps(schema, ensure_ascii=True)}",
            "",
            "Current proposal id:",
            proposal.id,
            "",
            "Transcript for this intake only:",
            _chat_lines(messages),
        ]
    )


def _json_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _normalize_payment_drafts(raw_items: list[Any]) -> list[dict[str, Any]]:
    allowed_types = {"deposit", "advance", "installment", "final", "other"}
    allowed_statuses = {"planned", "received", "refunded", "canceled"}
    result: list[dict[str, Any]] = []
    for item in raw_items:
        if hasattr(item, "model_dump"):
            data = item.model_dump()
        elif isinstance(item, dict):
            data = dict(item)
        else:
            continue
        payment_type = str(data.get("type") or "deposit").strip().lower()
        status = str(data.get("status") or "planned").strip().lower()
        result.append(
            {
                "type": payment_type if payment_type in allowed_types else "other",
                "status": status if status in allowed_statuses else "planned",
                "amount": data.get("amount"),
                "currency": str(data.get("currency") or "EUR").strip().upper() or "EUR",
                "dueDate": _json_date(data.get("dueDate")),
                "paidDate": _json_date(data.get("paidDate")),
                "method": data.get("method") or None,
                "reference": data.get("reference") or None,
                "notes": data.get("notes") or None,
            }
        )
    return result


def _normalize_external_workshops(raw_items: list[Any]) -> list[dict[str, Any]]:
    allowed_statuses = {"known", "preferred", "one_time", "blocked"}
    result: list[dict[str, Any]] = []
    for item in raw_items:
        if hasattr(item, "model_dump"):
            data = item.model_dump()
        elif isinstance(item, dict):
            data = dict(item)
        else:
            continue
        name = str(data.get("name") or "").strip()
        if not name:
            continue
        relationship_status = str(data.get("relationshipStatus") or "known").strip().lower()
        result.append(
            {
                "name": name,
                "contactName": data.get("contactName") or None,
                "phone": data.get("phone") or None,
                "email": data.get("email") or None,
                "specialties": _dedupe_strings([str(value) for value in data.get("specialties") or []]),
                "suggestedFor": _dedupe_strings([str(value) for value in data.get("suggestedFor") or []]),
                "relationshipStatus": relationship_status if relationship_status in allowed_statuses else "known",
                "notes": data.get("notes") or None,
            }
        )
    return result


def clear_proposal_memory(db: Session, proposal: Proposal) -> None:
    db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).delete(synchronize_session=False)
    proposal.memory_summary_json = None
    proposal.payment_drafts_json = None
    proposal.external_workshops_json = None
    proposal.staffing_plan_json = None
    db.add(proposal)
    db.flush()


def _add_local_fact(facts: list[ExtractedFact], category: str, key: str, value: Any, message_id: str) -> None:
    facts.append(
        ExtractedFact(
            category=category,
            key=key,
            value=value,
            confidence=0.6,
            sourceMessageIds=[message_id] if message_id else [],
        )
    )


def refresh_proposal_memory_locally(db: Session, proposal: Proposal, messages: list[ProposalMessage]) -> None:
    """Cheap fallback memory pass that avoids an extra Gemini request per chat message."""
    if not messages:
        clear_proposal_memory(db, proposal)
        return

    facts: list[ExtractedFact] = []
    payment_drafts: list[dict[str, Any]] = []
    external_workshops: list[dict[str, Any]] = []
    open_questions: list[str] = []

    for message in messages:
        if message.role != "user" or not message.content:
            continue
        content = message.content.strip()
        lower = content.lower()
        emails = re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", content, flags=re.IGNORECASE)
        for email in emails:
            _add_local_fact(facts, "contact", "email", email, message.id)

        phones = re.findall(r"(?:\+?\d[\d\s()./-]{5,}\d)", content)
        for phone in phones[:3]:
            _add_local_fact(facts, "contact", "phone", phone.strip(), message.id)

        payment_terms = [
            "deposit",
            "advance",
            "anzahlung",
            "vorauszahlung",
            "\u062f\u0641\u0639\u0629",
            "\u0639\u0631\u0628\u0648\u0646",
            "\u0645\u0642\u062f\u0645",
            "\u0639 \u0627\u0644\u062d\u0633\u0627\u0628",
        ]
        if any(term in lower for term in payment_terms):
            amount_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(eur|euro|usd|dollar|\$)", content, flags=re.IGNORECASE)
            if not amount_match:
                amount_match = re.search(r"(eur|euro|usd|dollar|\$)\s*(\d+(?:[.,]\d+)?)", content, flags=re.IGNORECASE)
            amount = None
            currency = "EUR"
            if amount_match:
                groups = [group for group in amount_match.groups() if group]
                number_value = next((group for group in groups if re.match(r"^\d", group)), None)
                currency_value = next((group for group in groups if not re.match(r"^\d", group)), "EUR")
                amount = float(str(number_value).replace(",", ".")) if number_value else None
                currency = "USD" if str(currency_value).lower() in {"usd", "dollar", "$"} else "EUR"
            draft = {
                "type": "deposit" if any(term in lower for term in ["deposit", "anzahlung", "\u062f\u0641\u0639\u0629", "\u0639\u0631\u0628\u0648\u0646", "\u0645\u0642\u062f\u0645"]) else "advance",
                "status": "received" if any(term in lower for term in ["paid", "received", "bezahlt", "gezahlt", "\u0627\u062e\u062f", "\u0623\u062e\u0630", "\u0627\u0633\u062a\u0644\u0645"]) else "planned",
                "amount": amount,
                "currency": currency,
                "dueDate": None,
                "paidDate": None,
                "method": "bank transfer" if any(term in lower for term in ["bank", "transfer", "ueberweisung", "\u00fcberweisung", "\u062a\u062d\u0648\u064a\u0644"]) else None,
                "reference": None,
                "notes": content[:500],
            }
            payment_drafts.append(draft)
            _add_local_fact(facts, "payment", draft["type"], draft, message.id)

        workshop_terms = [
            "workshop",
            "subcontractor",
            "external team",
            "subunternehmer",
            "\u0648\u0631\u0634\u0629",
            "\u0648\u0631\u0634",
            "\u0641\u0631\u064a\u0642 \u062e\u0627\u0631\u062c\u064a",
            "\u0645\u0642\u0627\u0648\u0644 \u0641\u0631\u0639\u064a",
        ]
        if any(term in lower for term in workshop_terms):
            name_match = re.search("(?:named|called|name is|\u0627\u0633\u0645\u0647\u0627|\u0627\u0633\u0645\u0647|\u0627\u0633\u0645)\\s+([^,.\\n]+)", content, flags=re.IGNORECASE)
            name = name_match.group(1).strip() if name_match else "External workshop/team"
            workshop = {
                "name": name[:120],
                "contactName": None,
                "phone": None,
                "email": emails[0] if emails else None,
                "specialties": [],
                "suggestedFor": [],
                "relationshipStatus": "known",
                "notes": content[:500],
            }
            external_workshops.append(workshop)
            _add_local_fact(facts, "contractor_workshop", "external_workshop", workshop, message.id)

        if "?" in content or "?" in content:
            open_questions.append(content[:300])

    db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).delete(synchronize_session=False)
    for fact in facts:
        db.add(
            ProposalFact(
                proposal_id=proposal.id,
                category=fact.category,
                fact_key=fact.key,
                value_json=json_dumps(fact.value),
                confidence=decimal_or_none(fact.confidence),
                source_message_ids_json=json_dumps(fact.sourceMessageIds),
                is_active=True,
            )
        )

    proposal.memory_summary_json = json_dumps(
        {
            "source": "local_fallback",
            "factCount": len(facts),
            "payments": payment_drafts,
            "contractorWorkshops": external_workshops,
            "openQuestions": open_questions,
        }
    )
    if payment_drafts:
        proposal.payment_drafts_json = json_dumps(_normalize_payment_drafts(payment_drafts))
    if external_workshops:
        proposal.external_workshops_json = json_dumps(_normalize_external_workshops(external_workshops))
    db.add(proposal)
    db.flush()


def refresh_proposal_memory(db: Session, proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedMemory | None:
    if not messages:
        clear_proposal_memory(db, proposal)
        return None

    prompt = build_memory_extraction_prompt(proposal, messages)
    try:
        raw_text = generate_text(prompt, response_mime_type="application/json")
        extracted = ExtractedMemory.model_validate(_extract_json_object(raw_text))
    except (HTTPException, ValidationError) as exc:
        logger.warning("AI memory extraction failed; using local isolated memory fallback: %s", exc)
        refresh_proposal_memory_locally(db, proposal, messages)
        return None

    db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).delete(synchronize_session=False)
    for fact in extracted.facts:
        db.add(
            ProposalFact(
                proposal_id=proposal.id,
                category=fact.category,
                fact_key=fact.key,
                value_json=json_dumps(fact.value),
                confidence=decimal_or_none(fact.confidence),
                source_message_ids_json=json_dumps(fact.sourceMessageIds),
                is_active=True,
            )
        )

    proposal.memory_summary_json = json_dumps(extracted.memorySummary or {})
    proposal.payment_drafts_json = json_dumps(_normalize_payment_drafts(extracted.paymentDrafts))
    proposal.external_workshops_json = json_dumps(_normalize_external_workshops(extracted.externalWorkshops))
    proposal.staffing_plan_json = json_dumps(extracted.staffingPlan) if extracted.staffingPlan is not None else None
    db.add(proposal)
    db.flush()
    return extracted


def build_intake_chat_prompt(proposal: Proposal, messages: list[ProposalMessage]) -> str:
    known_customer = proposal.customer_company_name or "unknown"
    known_title = proposal.order_title or "unknown"
    language_mode = _conversation_language_mode(messages)
    language_rules = [
        "- Reply in the same language as the manager's latest message.",
        "- If the manager writes in Arabic, reply entirely in Arabic.",
        "- Keep phone numbers, email addresses, street addresses, and company names exactly as provided.",
    ]
    if language_mode == "arabic":
        language_rules.append("- The current manager language is Arabic, so your full reply must be Arabic.")
        language_rules.append("- Do not mix in Chinese, German, or English text except exact names, addresses, emails, and technical company names from the transcript.")

    current_facts = _facts_for_prompt(proposal)
    memory_summary = _safe_json(proposal.memory_summary_json, {})
    payment_drafts = _safe_json(proposal.payment_drafts_json, [])
    external_workshops = _safe_json(proposal.external_workshops_json, [])

    return "\n".join(
        [
            "You are an ERP intake assistant for a German construction company.",
            "Your job is to help a manager capture one contractor/client project intake as clearly as possible.",
            "Memory isolation rules:",
            "- Use only the current proposal fields, facts, memory summary, and transcript below.",
            "- Never use customer, payment, workshop, or project facts from another chat.",
            "- If the manager starts a different project in a new intake, treat it as empty memory.",
            "Contractor and workshop rules:",
            "- A contractor may have known workshops, subcontractor teams, or external crews they already work with.",
            "- Keep external workshops separate from internal ERP employees.",
            "- If a workshop means a physical work area or work package, ask/record it as a site or work package, not as an employee.",
            "Payment rules:",
            "- Ask about deposits, advance payments, installments, paid amounts, due dates, methods, and references when payment info is missing or mentioned.",
            "Construction scope guidance rules:",
            "- Use the hidden construction checklist below silently to decide which scope details are relevant.",
            "- Do not show the full checklist to the manager unless explicitly asked.",
            "- Ask only relevant missing checklist details and never more than 2-4 practical questions per reply.",
            "- For kitchen renovation, prioritize flooring, plumbing/sanitary, carpentry/shelves, and insulation/waterproofing only when missing.",
            "- For painting, prioritize putty, coat count, decorative/normal type, and interior/exterior only when missing.",
            "- For flooring, prioritize material, size, old-floor removal vs over-installation, stairs/edges, and installation type only when missing.",
            "Hidden construction checklist:",
            construction_scope_guidance(),
            "Chat rules:",
            "- You are writing only the next assistant reply, not a transcript.",
            "- Never write role labels such as Manager:, User:, Assistant:, Human:, System:, ??????:, ????????:, or ???????:.",
            "- Never continue the conversation by inventing what the manager/user might say next.",
            "- Never create fake future turns, approvals, confirmations, or self-dialogue.",
            "- Ask concise follow-up questions when scope, dates, site details, payment details, workshops, or staffing needs are missing.",
            "- If the manager corrects a site or work package, acknowledge the correction and update that item directly.",
            "- Use plain business language.",
            "- Do not invent facts that are not present in this intake.",
            "- Keep replies short and practical.",
            *language_rules,
            f"Known customer: {known_customer}",
            f"Known order title: {known_title}",
            "",
            "Current intake memory summary:",
            json.dumps(memory_summary, ensure_ascii=True),
            "",
            "Current intake facts:",
            json.dumps(current_facts, ensure_ascii=True),
            "",
            "Current intake payment drafts:",
            json.dumps(payment_drafts, ensure_ascii=True),
            "",
            "Current intake external workshops:",
            json.dumps(external_workshops, ensure_ascii=True),
            "",
            "Conversation so far for this intake only:",
            _chat_lines(messages),
            "",
            "Assistant:",
        ]
    )


def build_proposal_prompt(messages: list[ProposalMessage], proposal: Proposal | None = None) -> str:
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
                "recommendedHeadcount": "number|null",
                "resourceStrategy": "internal|external|mixed|null",
            }
        ],
        "requiredSkills": ["string"],
        "requiredCertifications": ["string"],
        "preferredStartDate": "ISO-8601 datetime|null",
        "preferredEndDate": "ISO-8601 datetime|null",
        "estimatedHours": "number|null",
        "currency": "string",
        "paymentDrafts": [
            {
                "type": "deposit|advance|installment|final|other",
                "status": "planned|received|refunded|canceled",
                "amount": "number|null",
                "currency": "string",
                "dueDate": "ISO-8601 datetime|null",
                "paidDate": "ISO-8601 datetime|null",
                "method": "string|null",
                "reference": "string|null",
                "notes": "string|null",
            }
        ],
        "externalWorkshops": [
            {
                "name": "string",
                "contactName": "string|null",
                "phone": "string|null",
                "email": "string|null",
                "specialties": ["string"],
                "suggestedFor": ["site or work package name"],
                "relationshipStatus": "known|preferred|one_time|blocked",
                "notes": "string|null",
            }
        ],
        "staffingPlan": "object|null",
    }
    language_mode = _conversation_language_mode(messages)
    language_rules = [
        "Keep phone numbers, email addresses, street addresses, and company names exactly as provided.",
    ]
    if language_mode == "arabic":
        language_rules.extend(
            [
                "Write all human-readable proposal values in Arabic.",
                "This includes summary, orderTitle, orderDescription, proposed site names, site notes, requiredSkills, and requiredCertifications.",
                "Do not switch proposal wording to German or English when the manager's conversation is Arabic.",
            ]
        )
    else:
        language_rules.append("Prefer German business wording inside summary and orderDescription.")
    memory_summary = _safe_json(proposal.memory_summary_json, {}) if proposal else {}
    current_facts = _facts_for_prompt(proposal) if proposal else []
    payment_drafts = _safe_json(proposal.payment_drafts_json, []) if proposal else []
    external_workshops = _safe_json(proposal.external_workshops_json, []) if proposal else []
    return "\n".join(
        [
            "You convert one isolated client intake transcript into a structured proposal draft.",
            "Return only valid JSON. Do not wrap it in markdown.",
            "Do not invent missing facts. Use null or empty arrays instead.",
            "Use only the current intake transcript, facts, and memory below. Never use data from another chat.",
            "Use EUR as currency unless the transcript explicitly states another currency.",
            "Use DE as customerCountry when the project is clearly in Germany and no other country is stated.",
            "If total estimatedHours is known and there is more than one proposed site, always provide estimatedHours for every site.",
            "When exact per-site hours are not stated, infer a reasonable split from scope, area, and task complexity.",
            "The sum of proposedSites[].estimatedHours should match the top-level estimatedHours whenever possible.",
            "Classify contractor-provided workshops carefully: physical work areas become proposedSites/work packages; external teams or subcontractors become externalWorkshops.",
            "If deposits, advance payments, installments, paid amounts, or due payments are mentioned, include them in paymentDrafts.",
            "Suggest recommendedHeadcount and resourceStrategy per site when enough scope is known.",
            "Use the hidden construction checklist below to enrich orderDescription, proposedSites[].notes, and requiredSkills.",
            "Never invent checklist details. If a critical construction detail is unknown, write it as to be confirmed in notes/orderDescription.",
            "Map mentioned checklist categories to practical requiredSkills such as flooring, painting, electrical, plumbing, waterproofing, gypsum board, carpentry, insulation, or structural renovation.",
            *language_rules,
            "",
            "Hidden construction checklist:",
            construction_scope_guidance(),
            "",
            f"Required JSON schema: {json.dumps(schema, ensure_ascii=True)}",
            "",
            "Current intake memory summary:",
            json.dumps(memory_summary, ensure_ascii=True),
            "",
            "Current intake facts:",
            json.dumps(current_facts, ensure_ascii=True),
            "",
            "Current intake payment drafts:",
            json.dumps(payment_drafts, ensure_ascii=True),
            "",
            "Current intake external workshops:",
            json.dumps(external_workshops, ensure_ascii=True),
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
                "recommendedHeadcount": raw_site.get("recommendedHeadcount"),
                "resourceStrategy": raw_site.get("resourceStrategy") or None,
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
    if "memorySummary" in data:
        memory_summary = data.get("memorySummary")
        proposal.memory_summary_json = json_dumps(memory_summary) if memory_summary is not None else proposal.memory_summary_json
    if "paymentDrafts" in data:
        proposal.payment_drafts_json = json_dumps(_normalize_payment_drafts(data.get("paymentDrafts") or []))
    if "externalWorkshops" in data:
        proposal.external_workshops_json = json_dumps(_normalize_external_workshops(data.get("externalWorkshops") or []))
    if "staffingPlan" in data:
        staffing_plan = data.get("staffingPlan")
        proposal.staffing_plan_json = json_dumps(staffing_plan) if staffing_plan is not None else None
    return proposal


def _proposal_from_local_memory(proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedProposal:
    manager_text = "\n".join(_manager_messages(messages))
    memory = _safe_json(proposal.memory_summary_json, {})
    facts = _facts_for_prompt(proposal)
    payment_drafts = _normalize_payment_drafts(_safe_json(proposal.payment_drafts_json, []))
    external_workshops = _normalize_external_workshops(_safe_json(proposal.external_workshops_json, []))

    contact_email = None
    contact_phone = None
    for fact in facts:
        if fact.get("category") == "contact" and fact.get("key") == "email" and not contact_email:
            contact_email = str(fact.get("value") or "") or None
        if fact.get("category") == "contact" and fact.get("key") == "phone" and not contact_phone:
            contact_phone = str(fact.get("value") or "") or None

    site_names: list[str] = []
    site_terms = [
        "stair",
        "basement",
        "entrance",
        "treppen",
        "keller",
        "\u0628\u064a\u062a \u0627\u0644\u062f\u0631\u062c",
        "\u0645\u0645\u0631 \u0627\u0644\u0642\u0628\u0648",
        "\u0645\u062f\u062e\u0644",
    ]
    for line in manager_text.splitlines():
        cleaned = line.strip().strip("-?")
        if not cleaned:
            continue
        if any(term in cleaned.lower() for term in site_terms):
            cleaned = re.sub(r"^\d+[.)]\s*", "", cleaned).strip()
            if len(cleaned) <= 80:
                site_names.append(cleaned)
    if not site_names:
        site_names = ["Baustelle 1"]

    total_hours = None
    hours_match = re.search("(\\d+(?:[.,]\\d+)?)\\s*(?:hours|stunden|\u0633\u0627\u0639\u0629|\u0633\u0627\u0639\u0627\u062a)", manager_text, flags=re.IGNORECASE)
    if hours_match:
        total_hours = float(hours_match.group(1).replace(",", "."))

    start_date = None
    end_date = None
    dates = re.findall(r"\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b", manager_text)
    parsed_dates: list[datetime] = []
    for day, month, year in dates:
        full_year = int(year) + 2000 if len(year) == 2 else int(year)
        try:
            parsed_dates.append(datetime(full_year, int(month), int(day), tzinfo=timezone.utc))
        except ValueError:
            continue
    if parsed_dates:
        start_date = min(parsed_dates)
        end_date = max(parsed_dates)

    company_match = re.search("(?:company|firma|\u0634\u0631\u0643\u0629|\u0627\u0644\u0634\u0631\u0643\u0629)\\s+([^\\n,.]+)", manager_text, flags=re.IGNORECASE)
    contact_match = re.search("(?:contact|ansprechpartner|\u0645\u0633\u0624\u0648\u0644|\u0627\u0644\u0634\u062e\u0635 \u0627\u0644\u0645\u0633\u0624\u0648\u0644|\u062c\u0647\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644)\\s+(?:is\\s+|\u0647\u0648\\s+)?([^\u060c,\\n]+)", manager_text, flags=re.IGNORECASE)

    return ExtractedProposal(
        customerCompanyName=(company_match.group(1).strip() if company_match else proposal.customer_company_name),
        contactName=(contact_match.group(1).strip() if contact_match else proposal.contact_name),
        contactPhone=contact_phone or proposal.contact_phone,
        contactEmail=contact_email or proposal.contact_email,
        summary=(manager_text[:600] if manager_text else proposal.summary or "AI intake proposal"),
        orderTitle=proposal.order_title or ("Project proposal" if _conversation_language_mode(messages) != "arabic" else "\u0639\u0631\u0636 \u0645\u0634\u0631\u0648\u0639"),
        orderDescription=manager_text or proposal.order_description,
        proposedSites=[
            ExtractedProposalSite(siteName=name, requiredSkills=proposal_required_skills(proposal), estimatedHours=None)
            for name in dict.fromkeys(site_names)
        ],
        requiredSkills=proposal_required_skills(proposal),
        requiredCertifications=proposal_required_certifications(proposal),
        preferredStartDate=start_date,
        preferredEndDate=end_date,
        estimatedHours=total_hours,
        currency=proposal.currency or "EUR",
        paymentDrafts=[ExtractedPaymentDraft.model_validate(item) for item in payment_drafts],
        externalWorkshops=[ExtractedExternalWorkshop.model_validate(item) for item in external_workshops],
        staffingPlan=memory.get("staffingPlan") if isinstance(memory, dict) else None,
    )


def extract_proposal_from_messages(proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedProposal:
    prompt = build_proposal_prompt(messages, proposal)
    try:
        raw_text = generate_text(prompt, response_mime_type="application/json")
        extracted = ExtractedProposal.model_validate(_extract_json_object(raw_text))
    except (HTTPException, ValidationError) as exc:
        logger.warning("AI proposal extraction failed; using local transcript fallback: %s", exc)
        extracted = _proposal_from_local_memory(proposal, messages)

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


def proposal_payment_drafts(proposal: Proposal) -> list[dict[str, Any]]:
    return list(json_loads(proposal.payment_drafts_json, []))


def proposal_external_workshops(proposal: Proposal) -> list[dict[str, Any]]:
    return list(json_loads(proposal.external_workshops_json, []))


def _find_existing_workshop(db: Session, customer_id: str, name: str) -> CustomerWorkshop | None:
    normalized = name.strip().lower()
    if not normalized:
        return None
    return db.scalar(
        select(CustomerWorkshop)
        .where(CustomerWorkshop.customer_id == customer_id)
        .where(func.lower(CustomerWorkshop.name) == normalized)
        .limit(1)
    )


def create_confirmed_workshops(db: Session, proposal: Proposal, customer: Customer) -> list[str]:
    created_or_linked: list[str] = []
    for workshop_data in proposal_external_workshops(proposal):
        name = str(workshop_data.get("name") or "").strip()
        if not name:
            continue
        workshop = _find_existing_workshop(db, customer.id, name)
        if workshop is None:
            workshop = CustomerWorkshop(
                customer_id=customer.id,
                name=name,
                contact_name=workshop_data.get("contactName"),
                phone=workshop_data.get("phone"),
                email=workshop_data.get("email"),
                specialties_json=json_dumps(_dedupe_strings([str(value) for value in workshop_data.get("specialties") or []])),
                notes=workshop_data.get("notes"),
                relationship_status=workshop_data.get("relationshipStatus") or "known",
                is_active=True,
            )
            db.add(workshop)
            db.flush()
        created_or_linked.append(workshop.id)
    return created_or_linked


def create_confirmed_payment_records(
    db: Session,
    proposal: Proposal,
    customer: Customer,
    order: Order,
    payment_drafts: list[dict[str, Any]] | None = None,
) -> list[str]:
    created_ids: list[str] = []
    drafts = payment_drafts if payment_drafts is not None else proposal_payment_drafts(proposal)
    for draft in drafts:
        amount = decimal_or_none(draft.get("amount"))
        if amount is None or amount <= 0:
            continue
        payment = PaymentRecord(
            proposal_id=proposal.id,
            customer_id=customer.id,
            order_id=order.id,
            invoice_id=None,
            payment_type=draft.get("type") or "deposit",
            status=draft.get("status") or "planned",
            amount=amount,
            currency=draft.get("currency") or proposal.currency or "EUR",
            due_date=as_datetime(draft.get("dueDate")),
            paid_date=as_datetime(draft.get("paidDate")),
            method=draft.get("method"),
            reference=draft.get("reference"),
            notes=draft.get("notes"),
        )
        db.add(payment)
        db.flush()
        created_ids.append(payment.id)
    return created_ids


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
    payment_drafts: list[dict[str, Any]] | None = None,
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

    workshop_ids = create_confirmed_workshops(db, proposal, customer)

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

    payment_record_ids = create_confirmed_payment_records(db, proposal, customer, order, payment_drafts=payment_drafts)

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
        "workshopIds": workshop_ids,
        "paymentRecordIds": payment_record_ids,
        "estimatedPrice": proposal.estimated_price,
        "currency": proposal.currency,
    }
