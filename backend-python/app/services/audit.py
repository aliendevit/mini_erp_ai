from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog, UserAccount
from ..utils import json_dumps


def actor_id(user: UserAccount | object | None) -> str | None:
    value = getattr(user, "id", None)
    return str(value) if value else None


def _tenant_from_related_record(db: Session, *, entity_type: str, entity_id: str | None, details: dict[str, Any]) -> str | None:
    from ..models import (
        Customer,
        Invoice,
        Order,
        PaymentRecord,
        ProjectIssue,
        ProjectMaterialLog,
        ProjectMonitoringAlert,
        ProjectProgressUpdate,
        ProjectSiteBaseline,
        ProjectTask,
        Proposal,
    )

    detail_tenant_id = details.get("tenantId")
    if detail_tenant_id:
        return str(detail_tenant_id)

    order_id = details.get("orderId")
    if order_id:
        order = db.get(Order, str(order_id))
        if order and order.tenant_id:
            return order.tenant_id

    invoice_id = details.get("invoiceId")
    if invoice_id:
        invoice = db.get(Invoice, str(invoice_id))
        if invoice and invoice.tenant_id:
            return invoice.tenant_id

    customer_id = details.get("customerId")
    if customer_id:
        customer = db.get(Customer, str(customer_id))
        if customer and customer.tenant_id:
            return customer.tenant_id

    proposal_id = details.get("proposalId")
    if proposal_id:
        proposal = db.get(Proposal, str(proposal_id))
        if proposal and proposal.tenant_id:
            return proposal.tenant_id

    if not entity_id:
        return None

    direct_models = {
        "Customer": Customer,
        "Order": Order,
        "Invoice": Invoice,
        "Proposal": Proposal,
    }
    direct_model = direct_models.get(entity_type)
    if direct_model:
        item = db.get(direct_model, entity_id)
        return getattr(item, "tenant_id", None) if item else None

    if entity_type == "UserAccount":
        user = db.get(UserAccount, entity_id)
        return user.tenant_id if user and user.account_level != "platform_admin" else None

    if entity_type == "PaymentRecord":
        payment = db.get(PaymentRecord, entity_id)
        if payment:
            for parent_model, parent_id in (
                (Invoice, payment.invoice_id),
                (Order, payment.order_id),
                (Proposal, payment.proposal_id),
                (Customer, payment.customer_id),
            ):
                if parent_id:
                    parent = db.get(parent_model, parent_id)
                    tenant_id = getattr(parent, "tenant_id", None) if parent else None
                    if tenant_id:
                        return tenant_id

    order_link_models = {
        "ProjectSiteBaseline": ProjectSiteBaseline,
        "ProjectProgressUpdate": ProjectProgressUpdate,
        "ProjectTask": ProjectTask,
        "ProjectIssue": ProjectIssue,
        "ProjectMaterialLog": ProjectMaterialLog,
        "ProjectMonitoringAlert": ProjectMonitoringAlert,
    }
    order_link_model = order_link_models.get(entity_type)
    if order_link_model:
        item = db.get(order_link_model, entity_id)
        if item and getattr(item, "order_id", None):
            order = db.get(Order, item.order_id)
            return order.tenant_id if order else None

    return None


def record_audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    actor_user_id: str | None = None,
    tenant_id: str | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    safe_details = details or {}
    resolved_tenant_id = tenant_id
    if resolved_tenant_id is None and actor_user_id:
        actor = db.get(UserAccount, actor_user_id)
        if actor and actor.account_level != "platform_admin":
            resolved_tenant_id = actor.tenant_id
    if resolved_tenant_id is None:
        resolved_tenant_id = _tenant_from_related_record(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            details=safe_details,
        )

    item = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        tenant_id=resolved_tenant_id,
        summary=summary,
        details_json=json_dumps(safe_details),
    )
    db.add(item)
    return item
