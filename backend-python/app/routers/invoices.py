from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import Invoice, InvoiceLine, Order, WorkEntry
from ..schemas import InvoiceMergePayload, InvoiceUpdatePayload
from ..services.invoice_documents import build_invoice_docx, build_invoice_pdf
from ..services.invoice_totals import recalc_invoice_totals
from ..utils import (
    as_datetime,
    end_of_utc_day,
    ensure,
    ensure_invoice_has_number_and_date,
    german_error,
    get_next_invoice_number_for_year,
    invoice_payload,
    not_found,
    parse_ymd_to_utc_start,
    raise_delete_error,
    work_entry_payload,
)

router = APIRouter()


def _sum_hours(lines: list[InvoiceLine]) -> float:
    return round(sum(float(line.hours_allocated or 0) for line in lines), 2)


def _service_date_bounds(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
    start = parse_ymd_to_utc_start(from_date)
    end_start = parse_ymd_to_utc_start(to_date)
    end = end_of_utc_day(end_start) if end_start else None
    return start, end


def _invoice_detail_stmt(invoice_id: str):
    return (
        select(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.employee),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.order),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.site),
        )
        .where(Invoice.id == invoice_id)
    )


def _get_invoice_with_details(db: Session, invoice_id: str) -> Invoice:
    invoice = db.execute(_invoice_detail_stmt(invoice_id)).unique().scalar_one_or_none()
    if not invoice:
        raise not_found()
    return invoice


def _ensure_exportable_invoice(db: Session, invoice_id: str) -> Invoice:
    invoice = _get_invoice_with_details(db, invoice_id)
    ensure(invoice.status != "draft", "Export ist erst nach dem Zusammenfuehren / Finalisieren moeglich.", 409)
    if not invoice.invoice_number or not invoice.issue_date:
        ensure_invoice_has_number_and_date(db, invoice.id)
        db.commit()
        invoice = _get_invoice_with_details(db, invoice_id)
    return invoice


@router.get("/invoices/drafts/groups")
def invoice_draft_groups(
    groupBy: str = Query(default="employee"),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
) -> dict:
    ensure(groupBy in {"employee", "site", "order"}, "Ungueltiges groupBy.")
    from_dt, to_dt = _service_date_bounds(from_date, to_date)

    stmt = (
        select(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.employee),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.site),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.order),
        )
        .where(Invoice.status == "draft")
    )
    drafts = db.execute(stmt).unique().scalars().all()

    groups: dict[str, dict] = {}
    for invoice in drafts:
        lines = []
        for line in invoice.lines:
            if from_dt and line.service_date < from_dt:
                continue
            if to_dt and line.service_date > to_dt:
                continue
            lines.append(line)
        if not lines:
            continue

        first = lines[0].work_entry
        if groupBy == "employee":
            key_id = first.employee_id
            key_name = f"{first.employee.first_name} {first.employee.last_name}"
        elif groupBy == "site":
            key_id = first.site_id
            key_name = first.site.site_name
        else:
            key_id = first.order_id
            key_name = first.order.title

        group = groups.setdefault(key_id, {"keyId": key_id, "keyName": key_name, "totalHours": 0.0, "invoiceCount": 0})
        group["totalHours"] += _sum_hours(lines)
        group["invoiceCount"] += 1

    return {"groupBy": groupBy, "groups": sorted(groups.values(), key=lambda item: item["totalHours"], reverse=True)}


@router.get("/invoices/drafts/group")
def invoice_draft_group(
    groupBy: str = Query(default="employee"),
    key: str = Query(...),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
) -> dict:
    ensure(groupBy in {"employee", "site", "order"}, "Ungueltiges groupBy.")
    from_dt, to_dt = _service_date_bounds(from_date, to_date)

    stmt = (
        select(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.employee),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.site),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.order),
        )
        .where(Invoice.status == "draft")
        .order_by(Invoice.created_at.asc())
    )
    drafts = db.execute(stmt).unique().scalars().all()

    out = []
    key_name = "-"
    for invoice in drafts:
        lines = []
        for line in invoice.lines:
            entry = line.work_entry
            matches = (
                entry.employee_id == key if groupBy == "employee" else entry.site_id == key if groupBy == "site" else entry.order_id == key
            )
            if not matches:
                continue
            if from_dt and line.service_date < from_dt:
                continue
            if to_dt and line.service_date > to_dt:
                continue
            lines.append(line)

        if not lines:
            continue

        first = lines[0].work_entry
        if groupBy == "employee":
            key_name = f"{first.employee.first_name} {first.employee.last_name}"
        elif groupBy == "site":
            key_name = first.site.site_name
        else:
            key_name = first.order.title

        payload = invoice_payload(invoice, include_customer=True)
        payload["lineCount"] = len(lines)
        payload["totalHours"] = _sum_hours(lines)
        payload["lines"] = [
            {
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
                "workEntry": work_entry_payload(line.work_entry, include_invoice_lines=False),
            }
            for line in lines
        ]
        out.append(payload)

    return {"groupBy": groupBy, "key": key, "keyName": key_name, "invoices": out}


@router.post("/invoices/merge")
def merge_invoices(payload: InvoiceMergePayload, db: Session = Depends(get_db)) -> dict:
    ensure(payload.groupBy in {"employee", "site", "order"}, "Ungueltiges groupBy.")
    ensure(bool(payload.key), "key fehlt.")
    ensure(len(payload.sourceInvoiceIds) >= 1, "sourceInvoiceIds fehlt.")

    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.employee),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.site),
            selectinload(Invoice.lines)
            .joinedload(InvoiceLine.work_entry)
            .joinedload(WorkEntry.order),
        )
        .where(Invoice.id.in_(payload.sourceInvoiceIds))
    )
    invoices = db.execute(stmt).unique().scalars().all()
    ensure(len(invoices) == len(payload.sourceInvoiceIds), "Mindestens eine Rechnung wurde nicht gefunden.")
    ensure(all(invoice.status == "draft" for invoice in invoices), "Nur Entwurf-Rechnungen koennen zusammengefuehrt werden.", 409)

    customer_id = invoices[0].customer_id
    source_lines = []
    for invoice in invoices:
        ensure(invoice.customer_id == customer_id, "Zusammenfuehren nicht moeglich: Rechnungen haben unterschiedliche Kunden.", 409)
        ensure(bool(invoice.lines), "Zusammenfuehren nicht moeglich: Leere Rechnung.", 409)
        for line in invoice.lines:
            entry = line.work_entry
            key_id = entry.employee_id if payload.groupBy == "employee" else entry.site_id if payload.groupBy == "site" else entry.order_id
            ensure(key_id == payload.key, "Zusammenfuehren nicht moeglich: Gruppe passt nicht.", 409)
            source_lines.append(
                {
                    "sourceInvoiceId": invoice.id,
                    "workEntryId": line.work_entry_id,
                    "serviceDate": line.service_date,
                    "description": line.description,
                    "hours": float(line.hours_allocated),
                    "rate": float(line.unit_rate or 0),
                }
            )

    source_lines.sort(key=lambda item: item["serviceDate"])
    total_hours = round(sum(line["hours"] for line in source_lines), 2)
    splits = payload.splits if payload.splits else [total_hours]
    split_total = round(sum(float(value) for value in splits), 2)
    ensure(abs(split_total - total_hours) <= 0.01, f"Summe der Splits ({split_total:.2f}) muss Total ({total_hours:.2f}) entsprechen.")
    ensure(all(float(value) > 0 for value in splits), "Splits muessen > 0 sein.")

    created_invoice_ids = []
    try:
        new_invoices = []
        for _ in splits:
            issue_date = datetime.now(timezone.utc)
            invoice = Invoice(
                status="final",
                customer_id=customer_id,
                issue_date=issue_date,
                invoice_number=get_next_invoice_number_for_year(db, issue_date.year),
                period_start=None,
                period_end=None,
                notes=None,
            )
            db.add(invoice)
            db.flush()
            new_invoices.append(invoice)
            created_invoice_ids.append(invoice.id)

        out_index = 0
        remaining_split = float(splits[out_index])
        for line in source_lines:
            remaining_line = float(line["hours"])
            while remaining_line > 0.0001:
                take = min(remaining_line, remaining_split)
                rate = Decimal(str(line["rate"]))
                db.add(
                    InvoiceLine(
                        invoice_id=new_invoices[out_index].id,
                        work_entry_id=line["workEntryId"],
                        service_date=line["serviceDate"],
                        description=line["description"],
                        hours_allocated=Decimal(str(round(take, 2))),
                        unit_rate=rate if rate > 0 else None,
                        line_amount=(rate * Decimal(str(round(take, 2)))) if rate > 0 else None,
                    )
                )
                remaining_line -= take
                remaining_split -= take
                if remaining_split <= 0.0001 and out_index < len(new_invoices) - 1:
                    out_index += 1
                    remaining_split = float(splits[out_index])

        db.query(InvoiceLine).filter(InvoiceLine.invoice_id.in_(payload.sourceInvoiceIds)).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.id.in_(payload.sourceInvoiceIds)).delete(synchronize_session=False)
        db.commit()
        return {"ok": True, "createdInvoiceIds": created_invoice_ids}
    except Exception:
        db.rollback()
        raise


@router.get("/invoices")
def list_invoices(
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
) -> list[dict]:
    from_dt, to_dt = _service_date_bounds(from_date, to_date)
    stmt = (
        select(Invoice)
        .options(joinedload(Invoice.customer), selectinload(Invoice.lines))
        .order_by(Invoice.created_at.desc())
    )
    if status:
        stmt = stmt.where(Invoice.status == status)
    else:
        stmt = stmt.where(Invoice.status != "draft")

    invoices = db.execute(stmt).unique().scalars().all()
    out = []
    for invoice in invoices:
        if from_dt or to_dt:
            filtered_lines = [
                line for line in invoice.lines if (not from_dt or line.service_date >= from_dt) and (not to_dt or line.service_date <= to_dt)
            ]
            if not filtered_lines:
                continue
        else:
            filtered_lines = list(invoice.lines)

        payload = invoice_payload(invoice, include_customer=True)
        totals = recalc_invoice_totals(db, invoice.id)
        payload["totalHours"] = totals["totalHours"] if not (from_dt or to_dt) else _sum_hours(filtered_lines)
        payload["lineCount"] = len(filtered_lines)
        out.append(payload)
    return out


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: str, db: Session = Depends(get_db)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    payload = build_invoice_pdf(invoice, kind="detailed")
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=invoice-{invoice.id}.pdf"},
    )


@router.get("/invoices/{invoice_id}/pdf/pauschal")
def invoice_pdf_pauschal(invoice_id: str, db: Session = Depends(get_db)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    payload = build_invoice_pdf(invoice, kind="pauschal")
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=invoice-{invoice.id}-pauschal.pdf"},
    )


@router.get("/invoices/{invoice_id}/word")
def invoice_word(invoice_id: str, db: Session = Depends(get_db)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    payload = build_invoice_docx(invoice, kind="detailed")
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice.id}.docx"},
    )


@router.get("/invoices/{invoice_id}/word/pauschal")
def invoice_word_pauschal(invoice_id: str, db: Session = Depends(get_db)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    payload = build_invoice_docx(invoice, kind="pauschal")
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice.id}-pauschal.docx"},
    )


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, db: Session = Depends(get_db)) -> dict:
    invoice = _get_invoice_with_details(db, invoice_id)

    if invoice.status != "draft" and (not invoice.invoice_number or not invoice.issue_date):
        ensure_invoice_has_number_and_date(db, invoice.id)
        db.commit()
        invoice = _get_invoice_with_details(db, invoice_id)

    payload = invoice_payload(invoice, include_customer=True, include_lines=True)
    payload.update(recalc_invoice_totals(db, invoice.id))
    return payload


@router.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: str, payload: InvoiceUpdatePayload, db: Session = Depends(get_db)) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise not_found()

    invoice.status = payload.status or invoice.status
    invoice.issue_date = as_datetime(payload.issueDate) if payload.issueDate is not None else None
    invoice.notes = payload.notes
    invoice.pauschal_amount = Decimal(str(payload.pauschalAmount)) if payload.pauschalAmount is not None else None

    try:
        db.flush()
        if invoice.status != "draft" and (not invoice.invoice_number or not invoice.issue_date):
            ensure_invoice_has_number_and_date(db, invoice.id)
        db.commit()
        db.refresh(invoice)
        return invoice_payload(invoice)
    except IntegrityError:
        db.rollback()
        raise german_error("Aktualisierung fehlgeschlagen.")


@router.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: str, db: Session = Depends(get_db)) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise not_found()
    ensure(invoice.status == "draft", "Nur Entwurf-Rechnungen koennen geloescht werden.", 409)

    try:
        db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete(synchronize_session=False)
        db.delete(invoice)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Rechnung")
