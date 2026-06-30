from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SaasInvoice, SaasPayment, SaasTenant, UserAccount
from ..routers.auth import MANAGER_DEFAULT_PERMISSIONS, _hash_password, _validate_email, _validate_password, get_current_user
from ..schemas import (
    PlatformCreateCompanyPayload,
    PlatformCreateCompanyResponse,
    PlatformResetManagerPasswordPayload,
    PlatformResetManagerPasswordResponse,
    PlatformSaasInvoicePayload,
    PlatformSaasPaymentPayload,
)
from ..services.audit import actor_id, record_audit
from ..utils import ensure

router = APIRouter(prefix="/platform", tags=["platform"])


def _money(value: Decimal | float | int | None) -> float:
    return round(float(value or 0), 2)


def _utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _ensure_platform_admin(user: UserAccount) -> None:
    if user.account_level == "platform_admin":
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform dashboard access is restricted to OMRAN admins.")


def _company_email_slug(company_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", ".", company_name.strip().lower())
    slug = re.sub(r"\.+", ".", slug).strip(".")
    return slug or "company"


def _generated_password() -> str:
    return f"Omran-{secrets.token_urlsafe(6)}1!"


def _next_subscription_invoice_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count()).select_from(SaasInvoice)) or 0
    return f"OMRAN-SUB-{year}-{int(count) + 1:04d}"


def _as_datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, datetime.min.time())


def _saas_payment_payload(payment: SaasPayment) -> dict:
    return {
        "id": payment.id,
        "tenantId": payment.tenant_id,
        "invoiceId": payment.invoice_id,
        "amount": _money(payment.amount),
        "currency": payment.currency,
        "paidDate": payment.paid_date,
        "method": payment.method,
        "reference": payment.reference,
        "notes": payment.notes,
        "createdAt": payment.created_at,
    }


def _saas_invoice_payload(tenant: SaasTenant, invoice: SaasInvoice, payments: list[SaasPayment]) -> dict:
    paid = round(sum(_money(payment.amount) for payment in payments), 2)
    amount = _money(invoice.amount)
    due = round(max(amount - paid, 0.0), 2)
    due_date = _utc_datetime(invoice.due_date)
    overdue = bool(due > 0 and due_date and due_date < datetime.now(timezone.utc) and invoice.status != "canceled")
    status_value = "paid" if due <= 0 and invoice.status != "canceled" else invoice.status
    return {
        "id": invoice.id,
        "tenantId": tenant.id,
        "companyName": tenant.company_name,
        "invoiceNumber": invoice.invoice_number,
        "status": status_value,
        "amount": amount,
        "paid": paid,
        "due": due,
        "currency": invoice.currency,
        "periodLabel": invoice.period_label,
        "issueDate": invoice.issue_date,
        "dueDate": invoice.due_date,
        "notes": invoice.notes,
        "overdue": overdue,
        "payments": [_saas_payment_payload(payment) for payment in payments],
    }


def _load_saas_invoice(db: Session, invoice_id: str) -> tuple[SaasTenant, SaasInvoice, list[SaasPayment]]:
    invoice = db.get(SaasInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SaaS invoice not found.")
    tenant = db.get(SaasTenant, invoice.tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")
    payments = list(
        db.scalars(
            select(SaasPayment)
            .where(SaasPayment.invoice_id == invoice.id)
            .order_by(SaasPayment.paid_date.desc().nullslast(), SaasPayment.created_at.desc())
        ).all()
    )
    return tenant, invoice, payments


@router.get("/dashboard")
def platform_dashboard(
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> dict:
    _ensure_platform_admin(current_user)

    tenants = list(db.scalars(select(SaasTenant).order_by(SaasTenant.company_name)).all())
    invoices = list(db.scalars(select(SaasInvoice).order_by(SaasInvoice.issue_date.desc().nullslast())).all())
    payments = list(db.scalars(select(SaasPayment).order_by(SaasPayment.paid_date.desc().nullslast())).all())
    user_counts = dict(
        db.execute(
            select(UserAccount.tenant_id, func.count(UserAccount.id))
            .where(UserAccount.tenant_id.is_not(None), UserAccount.account_level.in_(["company_user", "company_viewer"]))
            .group_by(UserAccount.tenant_id)
        ).all()
    )

    paid_by_invoice: dict[str, float] = {}
    payments_by_invoice: dict[str, list[SaasPayment]] = {}
    for payment in payments:
        paid_by_invoice[payment.invoice_id] = paid_by_invoice.get(payment.invoice_id, 0.0) + _money(payment.amount)
        payments_by_invoice.setdefault(payment.invoice_id, []).append(payment)

    invoices_by_tenant: dict[str, list[SaasInvoice]] = {}
    for invoice in invoices:
        invoices_by_tenant.setdefault(invoice.tenant_id, []).append(invoice)

    now = datetime.now(timezone.utc)
    company_rows = []
    invoice_rows = []
    total_issued = 0.0
    total_paid = 0.0
    total_due = 0.0
    overdue_count = 0

    for tenant in tenants:
        tenant_invoices = invoices_by_tenant.get(tenant.id, [])
        tenant_issued = 0.0
        tenant_paid = 0.0
        tenant_due = 0.0
        tenant_overdue = 0

        for invoice in tenant_invoices:
            invoice_payments = payments_by_invoice.get(invoice.id, [])
            invoice_payload = _saas_invoice_payload(tenant, invoice, invoice_payments)
            amount = invoice_payload["amount"]
            paid = invoice_payload["paid"]
            due = invoice_payload["due"]
            is_overdue = invoice_payload["overdue"]
            tenant_issued += amount
            tenant_paid += paid
            tenant_due += due
            tenant_overdue += 1 if is_overdue else 0
            invoice_rows.append(invoice_payload)

        total_issued += tenant_issued
        total_paid += tenant_paid
        total_due += tenant_due
        overdue_count += tenant_overdue
        company_rows.append(
            {
                "id": tenant.id,
                "companyName": tenant.company_name,
                "contactEmail": tenant.contact_email,
                "planName": tenant.plan_name,
                "status": tenant.status,
                "userCount": tenant.user_count,
                "userLimit": tenant.user_count,
                "userUsed": int(user_counts.get(tenant.id, 0)),
                "invoiceTotal": round(tenant_issued, 2),
                "paidTotal": round(tenant_paid, 2),
                "dueTotal": round(tenant_due, 2),
                "overdueInvoices": tenant_overdue,
                "createdAt": tenant.created_at,
            }
        )

    return {
        "metrics": {
            "subscribedCompanies": len(tenants),
            "activeCompanies": sum(1 for tenant in tenants if tenant.status == "active"),
            "trialCompanies": sum(1 for tenant in tenants if tenant.status == "trial"),
            "suspendedCompanies": sum(1 for tenant in tenants if tenant.status == "suspended"),
            "saasInvoicesIssued": round(total_issued, 2),
            "paidToOmran": round(total_paid, 2),
            "openSubscriptionBalance": round(total_due, 2),
            "overdueInvoices": overdue_count,
            "currency": "EUR",
        },
        "companies": company_rows,
        "invoices": invoice_rows,
    }


@router.post("/companies", response_model=PlatformCreateCompanyResponse, status_code=status.HTTP_201_CREATED)
def create_platform_company(
    payload: PlatformCreateCompanyPayload,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> PlatformCreateCompanyResponse:
    _ensure_platform_admin(current_user)

    company_name = payload.companyName.strip()
    ensure(bool(company_name), "Company name is required.", 422)
    manager_email = _validate_email(payload.managerEmail or f"manager@{_company_email_slug(company_name)}.omran.local")
    manager_password = _validate_password(payload.managerPassword or _generated_password())
    existing_tenant = db.scalar(select(SaasTenant).where(func.lower(SaasTenant.company_name) == company_name.lower()))
    if existing_tenant:
        raise HTTPException(status.HTTP_409_CONFLICT, "Company already exists.")
    existing_user = db.scalar(select(UserAccount).where(UserAccount.email == manager_email))
    if existing_user:
        raise HTTPException(status.HTTP_409_CONFLICT, "Manager email is already registered.")

    tenant = SaasTenant(
        company_name=company_name,
        contact_email=payload.contactEmail or manager_email,
        plan_name=payload.planName.strip() or "AI Business",
        status=payload.status,
        user_count=payload.userLimit,
    )
    db.add(tenant)
    db.flush()

    manager = UserAccount(
        email=manager_email,
        password_hash=_hash_password(manager_password),
        tenant_id=tenant.id,
        account_level="company_manager",
        tenant_name=tenant.company_name,
        role="company_manager",
        permissions_json=json.dumps(MANAGER_DEFAULT_PERMISSIONS, separators=(",", ":")),
        is_active=True,
    )
    db.add(manager)

    if payload.subscriptionAmount is not None:
        amount = Decimal(str(payload.subscriptionAmount))
        invoice = SaasInvoice(
            tenant_id=tenant.id,
            invoice_number=_next_subscription_invoice_number(db),
            status="sent" if amount > 0 else "paid",
            amount=amount,
            currency="EUR",
            period_label=datetime.now(timezone.utc).strftime("%B %Y"),
            issue_date=datetime.now(timezone.utc),
            due_date=None,
        )
        db.add(invoice)

    record_audit(
        db,
        action="platform.company.created",
        entity_type="SaasTenant",
        entity_id=tenant.id,
        actor_user_id=actor_id(current_user),
        summary=f"Platform company created: {tenant.company_name}",
        details={"managerEmail": manager.email, "userLimit": tenant.user_count, "status": tenant.status},
    )
    db.commit()
    db.refresh(tenant)
    db.refresh(manager)
    from ..routers.auth import _user_response

    return PlatformCreateCompanyResponse(
        tenantId=tenant.id,
        companyName=tenant.company_name,
        userLimit=tenant.user_count,
        manager=_user_response(manager, db),
        managerEmail=manager.email,
        managerPassword=manager_password,
    )


@router.post("/companies/{tenant_id}/manager-password", response_model=PlatformResetManagerPasswordResponse)
def reset_company_manager_password(
    tenant_id: str,
    payload: PlatformResetManagerPasswordPayload | None = None,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> PlatformResetManagerPasswordResponse:
    _ensure_platform_admin(current_user)
    tenant = db.get(SaasTenant, tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")
    manager = db.scalar(
        select(UserAccount).where(
            UserAccount.tenant_id == tenant.id,
            UserAccount.account_level == "company_manager",
            UserAccount.is_active == True,
        )
    )
    if not manager:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company manager account not found.")

    manager_password = _validate_password(payload.password if payload and payload.password else _generated_password())
    manager.password_hash = _hash_password(manager_password)
    manager.updated_at = datetime.now(timezone.utc)
    record_audit(
        db,
        action="platform.manager_password.reset",
        entity_type="UserAccount",
        entity_id=manager.id,
        actor_user_id=actor_id(current_user),
        summary=f"Manager password reset for {tenant.company_name}",
        details={"tenantId": tenant.id, "managerEmail": manager.email},
    )
    db.commit()
    return PlatformResetManagerPasswordResponse(
        tenantId=tenant.id,
        companyName=tenant.company_name,
        managerEmail=manager.email,
        managerPassword=manager_password,
    )


@router.post("/saas-invoices", status_code=status.HTTP_201_CREATED)
def create_saas_invoice(
    payload: PlatformSaasInvoicePayload,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> dict:
    _ensure_platform_admin(current_user)
    tenant = db.get(SaasTenant, payload.tenantId)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")
    invoice = SaasInvoice(
        tenant_id=tenant.id,
        invoice_number=_next_subscription_invoice_number(db),
        status=payload.status,
        amount=Decimal(str(payload.amount)),
        currency=(payload.currency or "EUR").upper(),
        period_label=(payload.periodLabel or "").strip() or None,
        issue_date=_as_datetime(payload.issueDate) or datetime.now(timezone.utc),
        due_date=_as_datetime(payload.dueDate),
        notes=(payload.notes or "").strip() or None,
    )
    db.add(invoice)
    db.flush()
    record_audit(
        db,
        action="platform.invoice.created",
        entity_type="SaasInvoice",
        entity_id=invoice.id,
        actor_user_id=actor_id(current_user),
        summary=f"Platform invoice created: {invoice.invoice_number}",
        details={"tenantId": tenant.id, "amount": float(invoice.amount), "currency": invoice.currency},
    )
    db.commit()
    db.refresh(invoice)
    return _saas_invoice_payload(tenant, invoice, [])


@router.put("/saas-invoices/{invoice_id}")
def update_saas_invoice(
    invoice_id: str,
    payload: PlatformSaasInvoicePayload,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> dict:
    _ensure_platform_admin(current_user)
    tenant = db.get(SaasTenant, payload.tenantId)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")
    _, invoice, _ = _load_saas_invoice(db, invoice_id)
    invoice.tenant_id = tenant.id
    invoice.status = payload.status
    invoice.amount = Decimal(str(payload.amount))
    invoice.currency = (payload.currency or "EUR").upper()
    invoice.period_label = (payload.periodLabel or "").strip() or None
    invoice.issue_date = _as_datetime(payload.issueDate)
    invoice.due_date = _as_datetime(payload.dueDate)
    invoice.notes = (payload.notes or "").strip() or None
    record_audit(
        db,
        action="platform.invoice.updated",
        entity_type="SaasInvoice",
        entity_id=invoice.id,
        actor_user_id=actor_id(current_user),
        summary=f"Platform invoice updated: {invoice.invoice_number}",
        details={"tenantId": tenant.id, "status": invoice.status, "amount": float(invoice.amount), "currency": invoice.currency},
    )
    db.commit()
    tenant, invoice, payments = _load_saas_invoice(db, invoice.id)
    return _saas_invoice_payload(tenant, invoice, payments)


@router.delete("/saas-invoices/{invoice_id}")
def delete_saas_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> dict[str, bool]:
    _ensure_platform_admin(current_user)
    tenant, invoice, _ = _load_saas_invoice(db, invoice_id)
    record_audit(
        db,
        action="platform.invoice.deleted",
        entity_type="SaasInvoice",
        entity_id=invoice.id,
        actor_user_id=actor_id(current_user),
        summary=f"Platform invoice deleted: {invoice.invoice_number}",
        details={"tenantId": tenant.id, "status": invoice.status, "amount": float(invoice.amount), "currency": invoice.currency},
    )
    db.query(SaasPayment).filter(SaasPayment.invoice_id == invoice.id).delete(synchronize_session=False)
    db.delete(invoice)
    db.commit()
    return {"ok": True}


@router.post("/saas-invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
def add_saas_invoice_payment(
    invoice_id: str,
    payload: PlatformSaasPaymentPayload,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> dict:
    _ensure_platform_admin(current_user)
    tenant, invoice, _ = _load_saas_invoice(db, invoice_id)
    payment = SaasPayment(
        tenant_id=tenant.id,
        invoice_id=invoice.id,
        amount=Decimal(str(payload.amount)),
        currency=(payload.currency or invoice.currency or "EUR").upper(),
        paid_date=_as_datetime(payload.paidDate) or datetime.now(timezone.utc),
        method=(payload.method or "").strip() or None,
        reference=(payload.reference or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(payment)
    db.flush()
    record_audit(
        db,
        action="platform.invoice.payment.added",
        entity_type="SaasPayment",
        entity_id=payment.id,
        actor_user_id=actor_id(current_user),
        summary=f"Platform invoice payment added: {invoice.invoice_number}",
        details={"tenantId": tenant.id, "invoiceId": invoice.id, "amount": float(payment.amount), "currency": payment.currency},
    )
    db.commit()
    tenant, invoice, payments = _load_saas_invoice(db, invoice.id)
    return _saas_invoice_payload(tenant, invoice, payments)


@router.delete("/saas-invoices/{invoice_id}/payments/{payment_id}")
def delete_saas_invoice_payment(
    invoice_id: str,
    payment_id: str,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> dict:
    _ensure_platform_admin(current_user)
    tenant, invoice, _ = _load_saas_invoice(db, invoice_id)
    payment = db.get(SaasPayment, payment_id)
    if not payment or payment.invoice_id != invoice.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SaaS payment not found.")
    record_audit(
        db,
        action="platform.invoice.payment.deleted",
        entity_type="SaasPayment",
        entity_id=payment.id,
        actor_user_id=actor_id(current_user),
        summary=f"Platform invoice payment deleted: {invoice.invoice_number}",
        details={"tenantId": tenant.id, "invoiceId": invoice.id, "amount": float(payment.amount), "currency": payment.currency},
    )
    db.delete(payment)
    db.commit()
    tenant, invoice, payments = _load_saas_invoice(db, invoice.id)
    return _saas_invoice_payload(tenant, invoice, payments)


@router.get("/saas-invoices/{invoice_id}/pdf")
def saas_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
) -> Response:
    _ensure_platform_admin(current_user)
    tenant, invoice, payments = _load_saas_invoice(db, invoice_id)
    payload = _saas_invoice_payload(tenant, invoice, payments)
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "PDF generation is not available.") from exc

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=44, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("OMRAN SaaS Invoice", styles["Title"]),
        Paragraph(f"Invoice: {invoice.invoice_number}", styles["Normal"]),
        Paragraph(f"Company: {tenant.company_name}", styles["Normal"]),
        Paragraph(f"Period: {invoice.period_label or '-'}", styles["Normal"]),
        Paragraph(f"Issue date: {invoice.issue_date.date().isoformat() if invoice.issue_date else '-'}", styles["Normal"]),
        Paragraph(f"Due date: {invoice.due_date.date().isoformat() if invoice.due_date else '-'}", styles["Normal"]),
        Spacer(1, 16),
    ]
    table = Table(
        [
            ["Description", "Amount"],
            ["Subscription / platform services", f"{payload['amount']:.2f} {payload['currency']}"],
            ["Paid", f"{payload['paid']:.2f} {payload['currency']}"],
            ["Remaining", f"{payload['due']:.2f} {payload['currency']}"],
        ],
        colWidths=[330, 140],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (1, -1), "RIGHT"),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(table)
    if payments:
        story.append(Spacer(1, 16))
        story.append(Paragraph("Payments", styles["Heading2"]))
        payment_rows = [["Date", "Amount", "Method", "Reference"]]
        for payment in payments:
            payment_rows.append(
                [
                    payment.paid_date.date().isoformat() if payment.paid_date else "-",
                    f"{_money(payment.amount):.2f} {payment.currency}",
                    payment.method or "-",
                    payment.reference or "-",
                ]
            )
        payment_table = Table(payment_rows, colWidths=[100, 110, 120, 140])
        payment_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("PADDING", (0, 0), (-1, -1), 7)]))
        story.append(payment_table)
    if invoice.notes:
        story.append(Spacer(1, 16))
        story.append(Paragraph(f"Notes: {invoice.notes}", styles["Normal"]))
    doc.build(story)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={invoice.invoice_number}.pdf"},
    )
