from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import Invoice, InvoiceLine, Order, PaymentRecord, WorkEntry
from ..routers.auth import get_current_user, require_permission, tenant_id_for_user
from ..schemas import InvoiceMergePayload, InvoiceUpdatePayload, PaymentRecordPayload, WorkshopInvoiceCreatePayload
from ..services.audit import actor_id, record_audit
from ..services.invoice_documents import build_invoice_docx, build_invoice_pdf
from ..services.invoice_totals import recalc_invoice_totals
from ..utils import (
    as_datetime,
    decimal_or_none,
    end_of_utc_day,
    ensure,
    ensure_invoice_has_number_and_date,
    german_error,
    get_next_invoice_number_for_year,
    invoice_payload,
    not_found,
    parse_ymd_to_utc_start,
    payment_record_payload,
    raise_delete_error,
    work_entry_payload,
)

router = APIRouter(dependencies=[Depends(get_current_user), Depends(require_permission("manage_invoices"))])


def _page_params(page: int, page_size: int) -> tuple[int, int]:
    safe_page = max(1, int(page or 1))
    safe_page_size = min(100, max(1, int(page_size or 25)))
    return safe_page, safe_page_size


def _paginated_response(items: list[dict], total: int, page: int, page_size: int) -> dict:
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "hasNext": page < total_pages,
        "hasPrev": page > 1,
    }


def _tenant_id(user) -> str | None:
    return tenant_id_for_user(user)


def _ensure_same_tenant(item, user) -> None:
    tenant_id = _tenant_id(user)
    if tenant_id and getattr(item, "tenant_id", None) != tenant_id:
        raise not_found()


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


def _invoice_effective_totals(db: Session, invoice: Invoice) -> dict[str, float]:
    totals = recalc_invoice_totals(db, invoice.id)
    fixed_amount = float(invoice.pauschal_amount or 0)
    if totals["totalAmount"] <= 0 and fixed_amount > 0:
        totals["totalAmount"] = round(fixed_amount, 2)
    return totals


def _invoice_payments(db: Session, invoice_id: str) -> list[PaymentRecord]:
    return list(
        db.scalars(
            select(PaymentRecord)
            .where(PaymentRecord.invoice_id == invoice_id)
            .order_by(PaymentRecord.paid_date.desc().nullslast(), PaymentRecord.created_at.desc())
        ).all()
    )


def _invoice_payment_summary(total_amount: float, payments: list[PaymentRecord]) -> dict[str, float]:
    today = datetime.now(timezone.utc).date()
    paid_amount = 0.0
    refunded_amount = 0.0
    deposit_amount = 0.0
    paid_today = 0.0
    planned_amount = 0.0

    for payment in payments:
        amount = float(payment.amount or 0)
        if payment.status == "planned":
            planned_amount += amount
        if payment.status == "received":
            paid_amount += amount
            if payment.payment_type == "deposit":
                deposit_amount += amount
            if payment.paid_date and payment.paid_date.date() == today:
                paid_today += amount
        if payment.status == "refunded":
            refunded_amount += amount

    net_paid = max(0.0, paid_amount - refunded_amount)
    return {
        "totalAmount": round(total_amount, 2),
        "paidAmount": round(net_paid, 2),
        "depositAmount": round(deposit_amount, 2),
        "paidToday": round(paid_today, 2),
        "plannedAmount": round(planned_amount, 2),
        "refundedAmount": round(refunded_amount, 2),
        "remainingBalance": round(max(total_amount - net_paid, 0.0), 2),
    }


def _invoice_detail_payload(db: Session, invoice_id: str) -> dict:
    invoice = _get_invoice_with_details(db, invoice_id)
    totals = _invoice_effective_totals(db, invoice)
    payments = _invoice_payments(db, invoice.id)
    payload = invoice_payload(invoice, include_customer=True, include_lines=True)
    payload.update(totals)
    payload["payments"] = [payment_record_payload(payment) for payment in payments]
    payload["paymentSummary"] = _invoice_payment_summary(totals["totalAmount"], payments)
    payload["overdue"] = bool(
        invoice.due_date
        and invoice.due_date < datetime.now(timezone.utc)
        and payload["paymentSummary"]["remainingBalance"] > 0
        and invoice.status not in {"draft", "paid", "canceled"}
    )
    return payload


def _invoice_list_payload(db: Session, invoice: Invoice, filtered_lines: list[InvoiceLine] | None = None) -> dict:
    payload = invoice_payload(invoice, include_customer=True)
    totals = _invoice_effective_totals(db, invoice)
    payments = _invoice_payments(db, invoice.id)
    summary = _invoice_payment_summary(totals["totalAmount"], payments)
    lines = list(filtered_lines) if filtered_lines is not None else list(invoice.lines)
    payload.update(totals)
    payload["totalHours"] = totals["totalHours"] if filtered_lines is None else _sum_hours(lines)
    payload["lineCount"] = len(lines)
    payload["paymentSummary"] = summary
    payload["overdue"] = bool(
        invoice.due_date
        and invoice.due_date < datetime.now(timezone.utc)
        and summary["remainingBalance"] > 0
        and invoice.status not in {"draft", "paid", "canceled"}
    )
    return payload


def _invoice_metrics(db: Session, tenant_id: str | None) -> dict:
    stmt = select(Invoice).options(selectinload(Invoice.lines))
    if tenant_id:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)
    invoices = db.execute(stmt).unique().scalars().all()
    metrics = {
        "total": len(invoices),
        "draft": 0,
        "final": 0,
        "sent": 0,
        "partialPaid": 0,
        "paid": 0,
        "canceled": 0,
        "overdue": 0,
        "outstandingBalance": 0.0,
        "paidAmount": 0.0,
        "currency": "EUR",
    }
    now = datetime.now(timezone.utc)
    for invoice in invoices:
        status_value = str(invoice.status)
        if status_value == "partial_paid":
            metrics["partialPaid"] += 1
        elif status_value in metrics:
            metrics[status_value] += 1
        totals = _invoice_effective_totals(db, invoice)
        summary = _invoice_payment_summary(totals["totalAmount"], _invoice_payments(db, invoice.id))
        metrics["outstandingBalance"] = round(metrics["outstandingBalance"] + summary["remainingBalance"], 2)
        metrics["paidAmount"] = round(metrics["paidAmount"] + summary["paidAmount"], 2)
        if invoice.due_date and invoice.due_date < now and summary["remainingBalance"] > 0 and status_value not in {"draft", "paid", "canceled"}:
            metrics["overdue"] += 1
    return metrics


def _first_invoice_order_id(invoice: Invoice) -> str | None:
    for line in invoice.lines:
        if line.work_entry and line.work_entry.order_id:
            return line.work_entry.order_id
    return None


def _apply_invoice_payment_payload(item: PaymentRecord, invoice: Invoice, payload: PaymentRecordPayload) -> PaymentRecord:
    item.proposal_id = payload.proposalId
    item.customer_id = invoice.customer_id
    item.order_id = payload.orderId or _first_invoice_order_id(invoice)
    item.invoice_id = invoice.id
    item.payment_type = payload.type or "deposit"
    item.status = payload.status or "planned"
    item.amount = decimal_or_none(payload.amount)
    item.currency = payload.currency or "EUR"
    item.due_date = as_datetime(payload.dueDate)
    item.paid_date = as_datetime(payload.paidDate)
    if item.status == "received" and item.paid_date is None:
        item.paid_date = datetime.now(timezone.utc)
    item.method = payload.method
    item.reference = payload.reference
    item.notes = payload.notes
    return item


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
def merge_invoices(
    payload: InvoiceMergePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
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
    for invoice in invoices:
        _ensure_same_tenant(invoice, current_user)
    ensure(all(invoice.status == "draft" for invoice in invoices), "Nur Entwurf-Rechnungen koennen zusammengefuehrt werden.", 409)

    customer_id = invoices[0].customer_id
    tenant_id = invoices[0].tenant_id
    source_lines = []
    for invoice in invoices:
        ensure(invoice.customer_id == customer_id, "Zusammenfuehren nicht moeglich: Rechnungen haben unterschiedliche Kunden.", 409)
        ensure(invoice.tenant_id == tenant_id, "Zusammenfuehren nicht moeglich: Rechnungen gehoeren zu unterschiedlichen Firmen.", 409)
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
                tenant_id=tenant_id,
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


@router.post("/invoices/workshop-fixed", status_code=201)
def create_workshop_fixed_invoice(
    payload: WorkshopInvoiceCreatePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    order = db.execute(
        select(Order)
        .options(joinedload(Order.customer), selectinload(Order.sites))
        .where(Order.id == payload.orderId)
    ).unique().scalar_one_or_none()
    if not order:
        raise not_found()
    _ensure_same_tenant(order, current_user)
    ensure(bool(payload.items), "Mindestens eine Rechnungsposition ist erforderlich.")

    site_names = {site.id: site.site_name for site in order.sites}
    total_amount = Decimal("0")
    note_lines: list[str] = []

    for index, item in enumerate(payload.items, start=1):
        description = (item.description or "").strip()
        ensure(bool(description), f"Beschreibung fehlt in Position {index}.")
        quantity = Decimal(str(item.quantity or 1))
        ensure(quantity > 0, f"Menge muss groesser als 0 sein in Position {index}.")
        if item.totalAmount is not None:
            line_total = Decimal(str(item.totalAmount))
        else:
            ensure(item.unitPrice is not None, f"Preis fehlt in Position {index}.")
            line_total = quantity * Decimal(str(item.unitPrice))
        ensure(line_total >= 0, f"Betrag darf nicht negativ sein in Position {index}.")
        total_amount += line_total

        site_label = site_names.get(item.siteId or "", "No site")
        workshop_label = (item.workshopName or "Workshop to be selected").strip()
        unit_label = "-" if item.unitPrice is None else f"{Decimal(str(item.unitPrice)):.2f}"
        note_lines.append(
            f"{index}. Site: {site_label} | Workshop: {workshop_label} | Description: {description} | "
            f"Qty: {quantity} | Unit: {unit_label} | Total: {line_total:.2f}"
        )
        if item.notes:
            note_lines.append(f"   Notes: {item.notes.strip()}")

    ensure(total_amount > 0, "Gesamtbetrag muss groesser als 0 sein.")
    invoice_notes_parts = [part.strip() for part in [payload.notes, "Workshop fixed invoice items:", *note_lines] if part and str(part).strip()]
    issue_date = as_datetime(payload.issueDate) if payload.issueDate else None
    if payload.status != "draft" and issue_date is None:
        issue_date = datetime.now(timezone.utc)

    invoice = Invoice(
        tenant_id=order.tenant_id,
        status=payload.status,
        customer_id=order.customer_id,
        issue_date=issue_date,
        period_start=order.start_date,
        period_end=order.end_date,
        notes="\n".join(invoice_notes_parts),
        pauschal_amount=total_amount,
    )
    db.add(invoice)
    db.flush()
    if invoice.status != "draft":
        ensure_invoice_has_number_and_date(db, invoice.id)
    db.commit()
    db.refresh(invoice)
    return {"invoice": invoice_payload(invoice, include_customer=True, include_lines=True), "orderId": order.id}


@router.get("/invoices")
def list_invoices(
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    paginated: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict] | dict:
    from_dt, to_dt = _service_date_bounds(from_date, to_date)
    stmt = (
        select(Invoice)
        .options(joinedload(Invoice.customer), selectinload(Invoice.lines))
        .order_by(Invoice.created_at.desc())
    )
    tenant_id = _tenant_id(current_user)
    if tenant_id:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Invoice.status == status)
    else:
        stmt = stmt.where(Invoice.status != "draft")

    if paginated and not (from_dt or to_dt):
        count_stmt = select(func.count()).select_from(Invoice)
        if tenant_id:
            count_stmt = count_stmt.where(Invoice.tenant_id == tenant_id)
        if status:
            count_stmt = count_stmt.where(Invoice.status == status)
        else:
            count_stmt = count_stmt.where(Invoice.status != "draft")
        safe_page, safe_page_size = _page_params(page, pageSize)
        total = db.scalar(count_stmt) or 0
        invoices = db.execute(stmt.offset((safe_page - 1) * safe_page_size).limit(safe_page_size)).unique().scalars().all()
    else:
        safe_page, safe_page_size, total = 1, pageSize, 0
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

        payload = _invoice_list_payload(db, invoice, filtered_lines if (from_dt or to_dt) else None)
        out.append(payload)
    if paginated:
        if from_dt or to_dt:
            safe_page, safe_page_size = _page_params(page, pageSize)
            total = len(out)
            start = (safe_page - 1) * safe_page_size
            out = out[start:start + safe_page_size]
        response = _paginated_response(out, total, safe_page, safe_page_size)
        response["metrics"] = _invoice_metrics(db, tenant_id)
        return response
    return out


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    _ensure_same_tenant(invoice, current_user)
    payload = build_invoice_pdf(invoice, kind="detailed")
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=invoice-{invoice.id}.pdf"},
    )


@router.get("/invoices/{invoice_id}/pdf/pauschal")
def invoice_pdf_pauschal(invoice_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    _ensure_same_tenant(invoice, current_user)
    payload = build_invoice_pdf(invoice, kind="pauschal")
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=invoice-{invoice.id}-pauschal.pdf"},
    )


@router.get("/invoices/{invoice_id}/word")
def invoice_word(invoice_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    _ensure_same_tenant(invoice, current_user)
    payload = build_invoice_docx(invoice, kind="detailed")
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice.id}.docx"},
    )


@router.get("/invoices/{invoice_id}/word/pauschal")
def invoice_word_pauschal(invoice_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> Response:
    invoice = _ensure_exportable_invoice(db, invoice_id)
    _ensure_same_tenant(invoice, current_user)
    payload = build_invoice_docx(invoice, kind="pauschal")
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice.id}-pauschal.docx"},
    )


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict:
    invoice = _get_invoice_with_details(db, invoice_id)
    _ensure_same_tenant(invoice, current_user)

    if invoice.status != "draft" and (not invoice.invoice_number or not invoice.issue_date):
        ensure_invoice_has_number_and_date(db, invoice.id)
        db.commit()
    return _invoice_detail_payload(db, invoice_id)


@router.post("/invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
def create_invoice_payment(
    invoice_id: str,
    payload: PaymentRecordPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    invoice = _get_invoice_with_details(db, invoice_id)
    _ensure_same_tenant(invoice, current_user)
    payment = PaymentRecord()
    _apply_invoice_payment_payload(payment, invoice, payload)
    db.add(payment)

    try:
        db.flush()
        record_audit(
            db,
            action="invoice.payment.added",
            entity_type="PaymentRecord",
            entity_id=payment.id,
            actor_user_id=actor_id(current_user),
            summary=f"Payment added to invoice: {invoice.invoice_number or invoice.id}",
            details={
                "invoiceId": invoice.id,
                "customerId": invoice.customer_id,
                "type": payment.payment_type,
                "status": payment.status,
                "amount": float(payment.amount or 0),
                "currency": payment.currency,
                "method": payment.method,
                "reference": payment.reference,
            },
        )
        db.commit()
        return _invoice_detail_payload(db, invoice_id)
    except IntegrityError:
        db.rollback()
        raise german_error("Zahlung konnte nicht gespeichert werden.")


@router.delete("/invoices/{invoice_id}/payments/{payment_id}")
def delete_invoice_payment(
    invoice_id: str,
    payment_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise not_found()
    _ensure_same_tenant(invoice, current_user)
    payment = db.get(PaymentRecord, payment_id)
    if not payment or payment.invoice_id != invoice_id:
        raise not_found()

    try:
        record_audit(
            db,
            action="invoice.payment.deleted",
            entity_type="PaymentRecord",
            entity_id=payment.id,
            actor_user_id=actor_id(current_user),
            summary=f"Payment deleted from invoice: {invoice.invoice_number or invoice.id}",
            details={
                "invoiceId": invoice.id,
                "customerId": invoice.customer_id,
                "type": payment.payment_type,
                "status": payment.status,
                "amount": float(payment.amount or 0),
                "currency": payment.currency,
                "method": payment.method,
                "reference": payment.reference,
            },
        )
        db.delete(payment)
        db.commit()
        return _invoice_detail_payload(db, invoice_id)
    except IntegrityError:
        db.rollback()
        raise german_error("Zahlung konnte nicht geloescht werden.")


@router.put("/invoices/{invoice_id}")
def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdatePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise not_found()
    _ensure_same_tenant(invoice, current_user)

    invoice.status = payload.status or invoice.status
    invoice.issue_date = as_datetime(payload.issueDate) if payload.issueDate is not None else None
    invoice.due_date = as_datetime(payload.dueDate) if payload.dueDate is not None else None
    invoice.notes = payload.notes
    invoice.pauschal_amount = Decimal(str(payload.pauschalAmount)) if payload.pauschalAmount is not None else None

    try:
        db.flush()
        if invoice.status != "draft" and (not invoice.invoice_number or not invoice.issue_date):
            ensure_invoice_has_number_and_date(db, invoice.id)
        record_audit(
            db,
            action="invoice.updated",
            entity_type="Invoice",
            entity_id=invoice.id,
            actor_user_id=actor_id(current_user),
            summary=f"Invoice updated: {invoice.invoice_number or invoice.id}",
            details={"status": invoice.status, "customerId": invoice.customer_id},
        )
        db.commit()
        db.refresh(invoice)
        return invoice_payload(invoice)
    except IntegrityError:
        db.rollback()
        raise german_error("Aktualisierung fehlgeschlagen.")


@router.delete("/invoices/{invoice_id}")
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise not_found()
    _ensure_same_tenant(invoice, current_user)
    ensure(invoice.status == "draft", "Nur Entwurf-Rechnungen koennen geloescht werden.", 409)

    try:
        record_audit(
            db,
            action="invoice.deleted",
            entity_type="Invoice",
            entity_id=invoice.id,
            actor_user_id=actor_id(current_user),
            summary=f"Invoice deleted: {invoice.invoice_number or invoice.id}",
            details={"status": invoice.status, "customerId": invoice.customer_id},
        )
        db.query(PaymentRecord).filter(PaymentRecord.invoice_id == invoice_id).delete(synchronize_session=False)
        db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete(synchronize_session=False)
        db.delete(invoice)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Rechnung")
