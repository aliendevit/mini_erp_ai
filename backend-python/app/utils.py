from __future__ import annotations

import json
import re
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import (
    Customer,
    CustomerWorkshop,
    Employee,
    EmployeeAvailabilityBlock,
    EmployeeAssignment,
    EmployeeSkill,
    Invoice,
    InvoiceLine,
    InvoiceSequence,
    Order,
    PaymentRecord,
    ProjectIssue,
    ProjectMaterialLog,
    ProjectMonitoringAlert,
    ProjectMonitoringReport,
    ProjectProgressPhoto,
    ProjectProgressUpdate,
    ProjectSiteBaseline,
    ProjectTask,
    Proposal,
    ProposalFact,
    ProposalMessage,
    Site,
    Workshop,
    WorkshopSiteAssignment,
    WorkEntry,
)


def decimal_or_none(value: float | int | Decimal | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True)


def json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def as_datetime(value: datetime | date | str | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    text = str(value).strip()
    if len(text) == 10:
        return datetime.fromisoformat(f"{text}T00:00:00+00:00")
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def as_date_only(value: datetime | date | str) -> datetime:
    parsed = as_datetime(value)
    if parsed is None:
        raise HTTPException(status_code=400, detail="workDate fehlt.")
    return datetime(parsed.year, parsed.month, parsed.day, tzinfo=timezone.utc)


def parse_ymd_to_utc_start(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    try:
        return datetime.fromisoformat(f"{text}T00:00:00+00:00")
    except ValueError:
        return None


def end_of_utc_day(value: datetime) -> datetime:
    return value + timedelta(days=1) - timedelta(milliseconds=1)


def german_error(message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


def not_found() -> HTTPException:
    return german_error("Nicht gefunden.", 404)


def _sqlstate(exc: IntegrityError) -> str | None:
    orig = getattr(exc, "orig", None)
    return getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)


def raise_delete_error(exc: IntegrityError, entity_german: str, hints_german: str | None = None) -> None:
    if _sqlstate(exc) == "23503":
        suffix = f" {hints_german}" if hints_german else ""
        raise german_error(f"Loeschen nicht moeglich: {entity_german} ist noch verknuepft.{suffix}", 409)
    raise german_error("Interner Serverfehler.", 500)


def raise_unique_error(exc: IntegrityError, message: str) -> None:
    if _sqlstate(exc) == "23505":
        raise german_error(message, 409)
    raise german_error("Speichern fehlgeschlagen.", 400)


def ensure(condition: bool, message: str, status_code: int = 400) -> None:
    if not condition:
        raise german_error(message, status_code)


def pad4(value: int) -> str:
    return str(value).zfill(4)


def yy_from_year(year: int) -> str:
    return str(year % 100).zfill(2)


def format_invoice_number(year: int, seq: int) -> str:
    return f"RE {yy_from_year(year)}-{pad4(seq)}"


def get_invoice_sequence_state(db: Session, year: int) -> dict[str, int | None]:
    prefix = f"RE {yy_from_year(year)}-"
    last = db.scalar(
        select(Invoice).where(Invoice.invoice_number.like(f"{prefix}%")).order_by(Invoice.invoice_number.desc()).limit(1)
    )
    last_seq = int(last.invoice_number[-4:]) if last and last.invoice_number else 0
    db_next_seq = last_seq + 1
    seq_row = db.get(InvoiceSequence, year)
    configured_next_seq = seq_row.next_seq if seq_row else None
    effective_next_seq = max(db_next_seq, configured_next_seq or 0)
    return {
        "year": year,
        "dbNextSeq": db_next_seq,
        "configuredNextSeq": configured_next_seq,
        "effectiveNextSeq": effective_next_seq,
    }


def get_next_invoice_number_for_year(db: Session, year: int) -> str:
    state = get_invoice_sequence_state(db, year)
    next_seq = int(state["effectiveNextSeq"])
    if next_seq > 9999:
        raise german_error(f"Invoice sequence exceeded for year {year}.", 500)
    return format_invoice_number(year, next_seq)


def ensure_invoice_has_number_and_date(db: Session, invoice_id: str) -> Invoice | None:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        return None
    issue_date = invoice.issue_date or invoice.created_at
    if issue_date is None:
        issue_date = datetime.now(timezone.utc)
    year = issue_date.year
    changed = False
    if not invoice.invoice_number:
        invoice.invoice_number = get_next_invoice_number_for_year(db, year)
        changed = True
    if not invoice.issue_date:
        invoice.issue_date = issue_date
        changed = True
    if changed:
        db.flush()
    return invoice


def sum_hours(lines: list[InvoiceLine]) -> float:
    return round(sum(float(line.hours_allocated or 0) for line in lines), 2)


def normalize_day_type(day_type: str | None, is_sick: bool | None) -> str:
    normalized = (day_type or "").strip().lower()
    if normalized in {"work", "arbeit"}:
        return "work"
    if normalized in {"sick", "krank"}:
        return "sick"
    if normalized in {"vacation", "urlaub"}:
        return "vacation"
    if normalized in {"holiday", "feiertag"}:
        return "holiday"
    if is_sick is True:
        return "sick"
    return "work"


def customer_payload(customer: Customer) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": customer.id,
            "companyName": customer.company_name,
            "street": customer.street,
            "zipCode": customer.zip_code,
            "city": customer.city,
            "country": customer.country,
            "vatId": customer.vat_id,
            "contactName": customer.contact_name,
            "contactPhone": customer.contact_phone,
            "contactEmail": customer.contact_email,
            "notes": customer.notes,
            "createdAt": customer.created_at,
            "updatedAt": customer.updated_at,
        }
    )


def customer_workshop_payload(workshop: CustomerWorkshop) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": workshop.id,
            "customerId": workshop.customer_id,
            "name": workshop.name,
            "contactName": workshop.contact_name,
            "phone": workshop.phone,
            "email": workshop.email,
            "specialties": json_loads(workshop.specialties_json, []),
            "notes": workshop.notes,
            "relationshipStatus": workshop.relationship_status,
            "isActive": workshop.is_active,
            "createdAt": workshop.created_at,
            "updatedAt": workshop.updated_at,
        }
    )


def workshop_payload(workshop: Workshop) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": workshop.id,
            "name": workshop.name,
            "contactName": workshop.contact_name,
            "phone": workshop.phone,
            "email": workshop.email,
            "specialties": json_loads(workshop.specialties_json, []),
            "notes": workshop.notes,
            "availabilityStatus": workshop.availability_status,
            "availabilityNote": workshop.availability_note,
            "isActive": workshop.is_active,
            "createdAt": workshop.created_at,
            "updatedAt": workshop.updated_at,
        }
    )


def workshop_site_assignment_payload(assignment: WorkshopSiteAssignment) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": assignment.id,
        "orderId": assignment.order_id,
        "siteId": assignment.site_id,
        "workshopId": assignment.workshop_id,
        "coveredSkills": json_loads(assignment.covered_skills_json, []),
        "startDate": assignment.start_date,
        "endDate": assignment.end_date,
        "status": assignment.status,
        "notes": assignment.notes,
        "createdAt": assignment.created_at,
        "updatedAt": assignment.updated_at,
    }
    if assignment.workshop:
        data["workshop"] = workshop_payload(assignment.workshop)
    if assignment.site:
        data["site"] = {"id": assignment.site.id, "siteName": assignment.site.site_name}
    return jsonable_encoder(data)


def project_site_baseline_payload(item: ProjectSiteBaseline | None) -> dict[str, Any] | None:
    if not item:
        return None
    return jsonable_encoder(
        {
            "id": item.id,
            "orderId": item.order_id,
            "siteId": item.site_id,
            "plannedStartDate": item.planned_start_date,
            "plannedEndDate": item.planned_end_date,
            "baselineStatus": item.baseline_status,
            "source": item.source,
            "notes": item.notes,
            "createdAt": item.created_at,
            "updatedAt": item.updated_at,
        }
    )


def employee_skill_payload(skill: EmployeeSkill) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": skill.id,
            "employeeId": skill.employee_id,
            "kind": skill.kind,
            "name": skill.name,
            "createdAt": skill.created_at,
            "updatedAt": skill.updated_at,
        }
    )


def employee_availability_payload(block: EmployeeAvailabilityBlock) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": block.id,
            "employeeId": block.employee_id,
            "startDate": block.start_date,
            "endDate": block.end_date,
            "reason": block.reason,
            "createdAt": block.created_at,
            "updatedAt": block.updated_at,
        }
    )


def employee_payload(employee: Employee, include_staffing: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": employee.id,
        "firstName": employee.first_name,
        "lastName": employee.last_name,
        "birthDate": employee.birth_date,
        "street": employee.street,
        "zipCode": employee.zip_code,
        "city": employee.city,
        "phone": employee.phone,
        "email": employee.email,
        "isActive": employee.is_active,
        "defaultHourlyRate": employee.default_hourly_rate,
        "weeklyCapacityHours": employee.weekly_capacity_hours,
        "createdAt": employee.created_at,
        "updatedAt": employee.updated_at,
    }
    if include_staffing:
        skills = [item.name for item in employee.skill_records if item.kind == "skill"]
        certifications = [item.name for item in employee.skill_records if item.kind == "certification"]
        data["skills"] = sorted(skills)
        data["certifications"] = sorted(certifications)
        data["availabilityBlocks"] = [employee_availability_payload(item) for item in employee.availability_blocks]
        data["skillRecords"] = [employee_skill_payload(item) for item in employee.skill_records]
    return jsonable_encoder(data)


def assignment_payload(assignment: EmployeeAssignment, include_employee: bool = False, include_site: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": assignment.id,
        "employeeId": assignment.employee_id,
        "siteId": assignment.site_id,
        "startDate": assignment.start_date,
        "endDate": assignment.end_date,
        "notes": assignment.notes,
        "createdAt": assignment.created_at,
        "updatedAt": assignment.updated_at,
    }
    if include_employee and assignment.employee:
        data["employee"] = employee_payload(assignment.employee)
    if include_site and assignment.site:
        data["site"] = site_payload(assignment.site)
    return jsonable_encoder(data)


def site_payload(
    site: Site,
    include_order: bool = False,
    include_assignments: bool = False,
    include_workshops: bool = False,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": site.id,
        "orderId": site.order_id,
        "siteName": site.site_name,
        "street": site.street,
        "zipCode": site.zip_code,
        "city": site.city,
        "notes": site.notes,
        "isActive": site.is_active,
        "createdAt": site.created_at,
        "updatedAt": site.updated_at,
    }
    if include_order and site.order:
        data["order"] = order_payload(site.order, include_customer=True)
    if include_assignments:
        data["assignments"] = [assignment_payload(item, include_employee=True) for item in site.assignments]
    if include_workshops:
        data["workshopAssignments"] = [workshop_site_assignment_payload(item) for item in site.workshop_assignments]
    return jsonable_encoder(data)


def order_payload(order: Order, include_customer: bool = False, include_sites: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": order.id,
        "customerId": order.customer_id,
        "orderNumber": order.order_number,
        "title": order.title,
        "description": order.description,
        "status": order.status,
        "startDate": order.start_date,
        "endDate": order.end_date,
        "defaultHourlyRate": order.default_hourly_rate,
        "currency": order.currency,
        "createdAt": order.created_at,
        "updatedAt": order.updated_at,
    }
    if include_customer and order.customer:
        data["customer"] = customer_payload(order.customer)
    if include_sites:
        data["sites"] = [site_payload(site, include_assignments=True, include_workshops=True) for site in order.sites]
    return jsonable_encoder(data)


def invoice_line_payload(
    line: InvoiceLine, include_work_entry: bool = False, include_invoice: bool = False
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": line.id,
        "invoiceId": line.invoice_id,
        "workEntryId": line.work_entry_id,
        "serviceDate": line.service_date,
        "description": line.description,
        "hoursAllocated": line.hours_allocated,
        "unitRate": line.unit_rate,
        "lineAmount": line.line_amount,
        "createdAt": line.created_at,
        "updatedAt": line.updated_at,
    }
    if include_work_entry and line.work_entry:
        data["workEntry"] = work_entry_payload(line.work_entry, include_invoice_lines=False)
    if include_invoice and line.invoice:
        data["invoice"] = {
            "id": line.invoice.id,
            "status": line.invoice.status,
            "invoiceNumber": line.invoice.invoice_number,
        }
    return jsonable_encoder(data)


def invoice_payload(invoice: Invoice, include_customer: bool = False, include_lines: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": invoice.id,
        "invoiceNumber": invoice.invoice_number,
        "status": invoice.status,
        "customerId": invoice.customer_id,
        "issueDate": invoice.issue_date,
        "dueDate": getattr(invoice, "due_date", None),
        "periodStart": invoice.period_start,
        "periodEnd": invoice.period_end,
        "notes": invoice.notes,
        "pauschalAmount": invoice.pauschal_amount,
        "createdAt": invoice.created_at,
        "updatedAt": invoice.updated_at,
    }
    if include_customer and invoice.customer:
        data["customer"] = customer_payload(invoice.customer)
    if include_lines:
        data["lines"] = [invoice_line_payload(line, include_work_entry=True) for line in invoice.lines]
        data["totalHours"] = sum_hours(invoice.lines)
        data["lineCount"] = len(invoice.lines)
    return jsonable_encoder(data)


def payment_record_payload(payment: PaymentRecord) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": payment.id,
            "proposalId": payment.proposal_id,
            "customerId": payment.customer_id,
            "orderId": payment.order_id,
            "invoiceId": payment.invoice_id,
            "type": payment.payment_type,
            "status": payment.status,
            "amount": payment.amount,
            "currency": payment.currency,
            "dueDate": payment.due_date,
            "paidDate": payment.paid_date,
            "method": payment.method,
            "reference": payment.reference,
            "notes": payment.notes,
            "createdAt": payment.created_at,
            "updatedAt": payment.updated_at,
        }
    )


def work_entry_payload(work_entry: WorkEntry, include_invoice_lines: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": work_entry.id,
        "workDate": work_entry.work_date,
        "employeeId": work_entry.employee_id,
        "orderId": work_entry.order_id,
        "siteId": work_entry.site_id,
        "hours": work_entry.hours,
        "dayType": work_entry.day_type,
        "isSick": work_entry.is_sick,
        "description": work_entry.description,
        "createdAt": work_entry.created_at,
        "updatedAt": work_entry.updated_at,
    }
    if work_entry.employee:
        data["employee"] = employee_payload(work_entry.employee)
    if work_entry.order:
        data["order"] = order_payload(work_entry.order, include_customer=True)
    if work_entry.site:
        data["site"] = site_payload(work_entry.site)
    if include_invoice_lines:
        data["invoiceLines"] = [invoice_line_payload(line, include_invoice=True) for line in work_entry.invoice_lines]
    return jsonable_encoder(data)


def progress_photo_payload(photo: ProjectProgressPhoto) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": photo.id,
            "updateId": photo.update_id,
            "originalFilename": photo.original_filename,
            "storedFilename": photo.stored_filename,
            "contentType": photo.content_type,
            "sizeBytes": photo.size_bytes,
            "tag": photo.tag,
            "caption": photo.caption,
            "photoUrl": f"/api/progress-photos/{photo.id}",
            "createdAt": photo.created_at,
        }
    )


def progress_update_payload(update: ProjectProgressUpdate) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": update.id,
        "orderId": update.order_id,
        "siteId": update.site_id,
        "title": update.title,
        "description": update.description,
        "status": update.status,
        "progressPercent": update.progress_percent,
        "nextAction": update.next_action,
        "updateDate": update.update_date,
        "createdAt": update.created_at,
        "updatedAt": update.updated_at,
        "photos": [progress_photo_payload(photo) for photo in update.photos],
    }
    if update.site:
        data["site"] = site_payload(update.site)
    return jsonable_encoder(data)


def project_task_payload(task: ProjectTask) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": task.id,
        "orderId": task.order_id,
        "siteId": task.site_id,
        "taskName": task.task_name,
        "status": task.status,
        "weightPercent": float(task.weight_percent) if task.weight_percent is not None else None,
        "progressPercent": task.progress_percent,
        "responsibleType": task.responsible_type,
        "responsibleName": task.responsible_name,
        "dueDate": task.due_date,
        "notes": task.notes,
        "createdAt": task.created_at,
        "updatedAt": task.updated_at,
    }
    if task.site:
        data["site"] = site_payload(task.site)
    return jsonable_encoder(data)


def project_issue_payload(issue: ProjectIssue) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": issue.id,
        "orderId": issue.order_id,
        "siteId": issue.site_id,
        "title": issue.title,
        "description": issue.description,
        "severity": issue.severity,
        "status": issue.status,
        "responsibleType": issue.responsible_type,
        "responsibleName": issue.responsible_name,
        "resolutionNote": issue.resolution_note,
        "createdAt": issue.created_at,
        "updatedAt": issue.updated_at,
    }
    if issue.site:
        data["site"] = site_payload(issue.site)
    return jsonable_encoder(data)


def project_material_log_payload(material: ProjectMaterialLog) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": material.id,
        "orderId": material.order_id,
        "siteId": material.site_id,
        "materialName": material.material_name,
        "quantity": material.quantity,
        "status": material.status,
        "notes": material.notes,
        "createdAt": material.created_at,
        "updatedAt": material.updated_at,
    }
    if material.site:
        data["site"] = site_payload(material.site)
    return jsonable_encoder(data)


def project_monitoring_report_payload(report: ProjectMonitoringReport) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": report.id,
            "orderId": report.order_id,
            "provider": report.provider,
            "healthStatus": report.health_status,
            "summary": report.summary,
            "analysis": json_loads(report.analysis_json, {}),
            "warnings": json_loads(report.warnings_json, []),
            "createdAt": report.created_at,
        }
    )


def project_monitoring_alert_payload(alert: ProjectMonitoringAlert) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": alert.id,
        "orderId": alert.order_id,
        "siteId": alert.site_id,
        "alertType": alert.alert_type,
        "severity": alert.severity,
        "status": alert.status,
        "message": alert.message,
        "recommendedAction": alert.recommended_action,
        "source": alert.source,
        "resolutionNote": alert.resolution_note,
        "createdAt": alert.created_at,
        "updatedAt": alert.updated_at,
        "resolvedAt": alert.resolved_at,
    }
    if alert.site:
        data["site"] = {"id": alert.site.id, "siteName": alert.site.site_name}
    return jsonable_encoder(data)


def proposal_fact_payload(fact: ProposalFact) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": fact.id,
            "proposalId": fact.proposal_id,
            "category": fact.category,
            "key": fact.fact_key,
            "value": json_loads(fact.value_json, None),
            "confidence": fact.confidence,
            "sourceMessageIds": json_loads(fact.source_message_ids_json, []),
            "isActive": fact.is_active,
            "createdAt": fact.created_at,
            "updatedAt": fact.updated_at,
        }
    )


def proposal_message_payload(message: ProposalMessage) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": message.id,
            "proposalId": message.proposal_id,
            "role": message.role,
            "content": message.content,
            "createdAt": message.created_at,
        }
    )


def _list_count(value: Any) -> int:
    return len(value) if isinstance(value, list) else 0


def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return bool(value)
    return True


def _manager_text_for_proposal(proposal: Proposal) -> str:
    return "\n".join(message.content for message in proposal.messages if message.role == "user" and message.content)


def _active_fact_values(proposal: Proposal, category: str | None = None, key: str | None = None) -> list[Any]:
    values: list[Any] = []
    for fact in getattr(proposal, "facts", []) or []:
        if not fact.is_active:
            continue
        if category and fact.category != category:
            continue
        if key and fact.fact_key != key:
            continue
        values.append(json_loads(fact.value_json, None))
    return [value for value in values if _present(value)]


def _first_present(*values: Any) -> Any:
    for value in values:
        if _present(value):
            return value
    return None


def _extract_amount(text: str) -> str | None:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(eur|euro|usd|dollar|\$)", text, flags=re.IGNORECASE)
    if not match:
        match = re.search(r"(eur|euro|usd|dollar|\$)\s*(\d+(?:[.,]\d+)?)", text, flags=re.IGNORECASE)
    if not match:
        return None
    groups = [group for group in match.groups() if group]
    number_value = next((group for group in groups if re.match(r"^\d", group)), None)
    currency_value = next((group for group in groups if not re.match(r"^\d", group)), "EUR")
    if not number_value:
        return None
    currency = "USD" if str(currency_value).lower() in {"usd", "dollar", "$"} else "EUR"
    return f"{number_value} {currency}"


def _extract_date_hint(text: str) -> str | None:
    match = re.search(r"\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b", text)
    return match.group(1) if match else None


def _extract_skill_hints(text: str) -> list[str]:
    terms = [
        ("waterproofing", ["waterproof", "waterproofing", "abdichtung", "عزل"]),
        ("tiling", ["tile", "tiling", "ceramic", "fliesen", "بلاط", "سيراميك"]),
        ("plumbing", ["plumbing", "pipe", "pipes", "sanitaer", "sanitär", "سباكة", "مواسير"]),
        ("painting", ["paint", "painting", "maler", "دهان", "طلاء"]),
        ("floor removal", ["floor removal", "remove floor", "boden entfernen", "إزالة الأرضيات"]),
        ("putty", ["putty", "spachtel", "معجون"]),
    ]
    lowered = text.lower()
    result = []
    for label, aliases in terms:
        if any(alias.lower() in lowered for alias in aliases):
            result.append(label)
    return result


def _extract_workshop_hints(text: str) -> list[str]:
    names: list[str] = []
    patterns = [
        r"Assign\s+([^.\n]+?)(?:\s+for|\.)",
        r"assign\s+([^.\n]+?)(?:\s+for|\.)",
        r"(Nord\s+Fliesen\s*&\s*Abdichtung)",
        r"(Weser\s+Malerteam\s+GmbH)",
        r"(Workshop\s+Al-[A-Za-z]+(?:\s+for\s+[A-Za-z\s]+)?)",
        r"(Workshop\s+Al-[A-Za-z]+)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            name = match.group(1).strip(" .")
            if name and len(name) <= 120 and name.lower() not in {item.lower() for item in names}:
                names.append(name)
    return names


def _extract_customer_hint(text: str) -> str | None:
    patterns = [
        r"(?:for|für|fuer)\s+([A-Z][A-Za-z0-9&.\- ]{2,80}?)(?:\.|,|\s+The contact|\s+contact|\s+in\s+)",
        r"(?:company|customer|client)\s+(?:is\s+)?([A-Z][A-Za-z0-9&.\- ]{2,80})(?:\.|,)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    return None


def _extract_site_count_hint(text: str) -> int:
    if re.search(r"\b(site|location|address|apartment|bathroom|kitchen|room|berlin|alexanderplatz|baustelle|wohnung|حمام|مطبخ|موقع)\b", text, flags=re.IGNORECASE):
        return 1
    return 0


# ASCII-safe overrides for multilingual A2UI fallback matching.
def _extract_skill_hints(text: str) -> list[str]:
    terms = [
        ("waterproofing", ["waterproof", "waterproofing", "abdichtung", "\u0639\u0632\u0644"]),
        ("tiling", ["tile", "tiling", "ceramic", "fliesen", "\u0628\u0644\u0627\u0637", "\u0633\u064a\u0631\u0627\u0645\u064a\u0643"]),
        ("plumbing", ["plumbing", "pipe", "pipes", "sanitaer", "sanit\u00e4r", "\u0633\u0628\u0627\u0643\u0629", "\u0645\u0648\u0627\u0633\u064a\u0631"]),
        ("painting", ["paint", "painting", "maler", "\u062f\u0647\u0627\u0646", "\u0637\u0644\u0627\u0621"]),
        ("floor removal", ["floor removal", "remove floor", "boden entfernen", "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0623\u0631\u0636\u064a\u0627\u062a"]),
        ("putty", ["putty", "spachtel", "\u0645\u0639\u062c\u0648\u0646"]),
    ]
    lowered = text.lower()
    return [label for label, aliases in terms if any(alias.lower() in lowered for alias in aliases)]


def _extract_customer_hint(text: str) -> str | None:
    patterns = [
        r"(?:for|f\u00fcr|fuer)\s+([A-Z][A-Za-z0-9&.\- ]{2,80}?)(?:\.|,|\s+The contact|\s+contact|\s+in\s+)",
        r"(?:company|customer|client)\s+(?:is\s+)?([A-Z][A-Za-z0-9&.\- ]{2,80})(?:\.|,)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    return None


def _extract_site_count_hint(text: str) -> int:
    site_terms = (
        r"site|location|address|apartment|bathroom|kitchen|room|berlin|alexanderplatz|"
        r"baustelle|wohnung|\u062d\u0645\u0627\u0645|\u0645\u0637\u0628\u062e|\u0645\u0648\u0642\u0639"
    )
    return 1 if re.search(rf"\b({site_terms})\b", text, flags=re.IGNORECASE) else 0


def _proposal_a2ui_blocks(proposal: Proposal) -> list[dict[str, Any]]:
    manager_text = _manager_text_for_proposal(proposal)
    memory_summary = json_loads(proposal.memory_summary_json, {})
    sites = json_loads(proposal.proposed_sites_json, [])
    skills = json_loads(proposal.required_skills_json, [])
    payment_drafts = json_loads(proposal.payment_drafts_json, [])
    external_workshops = json_loads(proposal.external_workshops_json, [])
    if not payment_drafts and isinstance(memory_summary, dict):
        payment_drafts = memory_summary.get("payments") or []
    if not external_workshops and isinstance(memory_summary, dict):
        external_workshops = memory_summary.get("contractorWorkshops") or []

    contact_values = _active_fact_values(proposal, "contact")
    inferred_customer = _extract_customer_hint(manager_text)
    inferred_skills = _extract_skill_hints(manager_text)
    inferred_workshops = _extract_workshop_hints(manager_text)
    inferred_site_count = _extract_site_count_hint(manager_text)
    if not skills and inferred_skills:
        skills = inferred_skills
    if not external_workshops and inferred_workshops:
        external_workshops = [{"name": name} for name in inferred_workshops]

    customer_value = _first_present(proposal.customer_company_name, inferred_customer)
    project_value = _first_present(proposal.order_title, "Mentioned in chat" if len(manager_text.strip()) > 20 else None)
    scope_value = _first_present(proposal.order_description, proposal.summary, "Mentioned in chat" if len(manager_text.strip()) > 20 else None)
    site_count = _list_count(sites) or inferred_site_count
    price_value = _first_present(proposal.estimated_price, _extract_amount(manager_text))
    start_value = _first_present(proposal.preferred_start_date, _extract_date_hint(manager_text))

    missing_items = []
    if not _present(customer_value):
        missing_items.append({"key": "customerCompanyName", "label": "Customer / company name", "severity": "required"})
    if not _present(proposal.contact_phone) and not _present(proposal.contact_email) and not contact_values:
        missing_items.append({"key": "contact", "label": "Customer phone or email", "severity": "recommended"})
    if not _present(project_value):
        missing_items.append({"key": "orderTitle", "label": "Project title", "severity": "required"})
    if not _present(scope_value):
        missing_items.append({"key": "scope", "label": "Project scope / work description", "severity": "required"})
    if site_count == 0:
        missing_items.append({"key": "sites", "label": "Project site or work area", "severity": "required"})
    if _list_count(skills) == 0:
        missing_items.append({"key": "skills", "label": "Required trades / skills", "severity": "recommended"})
    if not _present(start_value):
        missing_items.append({"key": "preferredStartDate", "label": "Preferred start date", "severity": "recommended"})
    if not _present(price_value):
        missing_items.append({"key": "estimatedPrice", "label": "Estimated price or budget", "severity": "recommended"})
    if _list_count(payment_drafts) == 0:
        missing_items.append({"key": "paymentDrafts", "label": "Payment or deposit information", "severity": "recommended"})
    if _list_count(external_workshops) == 0:
        missing_items.append({"key": "externalWorkshops", "label": "Workshop / subcontractor information", "severity": "optional"})

    completion_fields = [
        customer_value,
        project_value,
        scope_value,
        sites or (["site-mentioned"] if site_count else []),
        skills,
        start_value,
        price_value,
        payment_drafts,
        external_workshops,
    ]
    complete_count = sum(1 for item in completion_fields if _present(item))
    readiness = round((complete_count / len(completion_fields)) * 100)

    summary_items = [
        {"label": "Customer", "value": customer_value or "Not mentioned"},
        {"label": "Project", "value": project_value or "Not mentioned"},
        {"label": "Sites", "value": site_count},
        {"label": "Trades", "value": ", ".join(str(item) for item in skills[:5]) if skills else "Not mentioned"},
        {"label": "Payments", "value": _list_count(payment_drafts)},
        {"label": "Workshops", "value": _list_count(external_workshops)},
    ]

    next_actions = []
    if missing_items:
        next_actions.append("Complete the missing intake fields before generating the proposal.")
    if proposal.status == "intake":
        next_actions.append("Generate the proposal draft after the project details are complete.")
    elif proposal.status == "draft":
        next_actions.append("Review proposal details, payments, and workshop coverage.")
    elif proposal.status == "reviewed":
        next_actions.append("Confirm the intake when the proposal and workshops are approved.")
    if _list_count(sites) > 0 and _list_count(external_workshops) == 0:
        next_actions.append("Add or select workshops for site execution.")

    return [
        {
            "a2uiVersion": "0.1",
            "id": f"{proposal.id}-readiness",
            "type": "intakeReadiness",
            "title": "Intake readiness",
            "status": "ready" if not missing_items else "needs_input",
            "percent": readiness,
            "description": "Structured UI generated from the current AI intake state.",
        },
        {
            "a2uiVersion": "0.1",
            "id": f"{proposal.id}-summary",
            "type": "intakeSummary",
            "title": "Project snapshot",
            "items": summary_items,
        },
        {
            "a2uiVersion": "0.1",
            "id": f"{proposal.id}-missing",
            "type": "missingInfoChecklist",
            "title": "Missing information",
            "items": missing_items,
            "emptyText": "No major missing information detected.",
        },
        {
            "a2uiVersion": "0.1",
            "id": f"{proposal.id}-actions",
            "type": "nextActions",
            "title": "Recommended next actions",
            "items": next_actions or ["Continue reviewing the intake details."],
        },
    ]


def proposal_payload(proposal: Proposal, include_messages: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": proposal.id,
        "status": proposal.status,
        "customerCompanyName": proposal.customer_company_name,
        "customerStreet": proposal.customer_street,
        "customerZipCode": proposal.customer_zip_code,
        "customerCity": proposal.customer_city,
        "customerCountry": proposal.customer_country,
        "contactName": proposal.contact_name,
        "contactPhone": proposal.contact_phone,
        "contactEmail": proposal.contact_email,
        "summary": proposal.summary,
        "orderTitle": proposal.order_title,
        "orderDescription": proposal.order_description,
        "proposedSites": json_loads(proposal.proposed_sites_json, []),
        "requiredSkills": json_loads(proposal.required_skills_json, []),
        "requiredCertifications": json_loads(proposal.required_certifications_json, []),
        "preferredStartDate": proposal.preferred_start_date,
        "preferredEndDate": proposal.preferred_end_date,
        "estimatedHours": proposal.estimated_hours,
        "estimatedPrice": proposal.estimated_price,
        "currency": proposal.currency,
        "recommendedTeam": json_loads(proposal.recommended_team_json, None),
        "memorySummary": json_loads(proposal.memory_summary_json, None),
        "paymentDrafts": json_loads(proposal.payment_drafts_json, []),
        "externalWorkshops": json_loads(proposal.external_workshops_json, []),
        "knownCustomerWorkshops": [],
        "staffingPlan": json_loads(proposal.staffing_plan_json, None),
        "convertedCustomerId": proposal.converted_customer_id,
        "convertedOrderId": proposal.converted_order_id,
        "createdAt": proposal.created_at,
        "updatedAt": proposal.updated_at,
    }
    if include_messages:
        messages = [proposal_message_payload(item) for item in proposal.messages]
        for message in reversed(messages):
            if message.get("role") == "assistant":
                message["ui"] = _proposal_a2ui_blocks(proposal)
                break
        data["messages"] = messages
        data["facts"] = [proposal_fact_payload(item) for item in getattr(proposal, "facts", []) if item.is_active]
    return jsonable_encoder(data)


def parse_year(value: Any) -> int:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return datetime.now().year
    if year < 2000 or year > 9999:
        return datetime.now().year
    return year


def parse_seq(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
