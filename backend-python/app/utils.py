from __future__ import annotations

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
    Employee,
    EmployeeAssignment,
    Invoice,
    InvoiceLine,
    InvoiceSequence,
    Order,
    Site,
    WorkEntry,
)


def decimal_or_none(value: float | int | Decimal | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


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


def employee_payload(employee: Employee) -> dict[str, Any]:
    return jsonable_encoder(
        {
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
            "createdAt": employee.created_at,
            "updatedAt": employee.updated_at,
        }
    )


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


def site_payload(site: Site, include_order: bool = False, include_assignments: bool = False) -> dict[str, Any]:
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
        data["sites"] = [site_payload(site, include_assignments=True) for site in order.sites]
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
