from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import InvoiceLine


def recalc_invoice_totals(db: Session, invoice_id: str) -> dict[str, float]:
    lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id)).all()
    total_hours = 0.0
    total_amount = 0.0
    for line in lines:
        total_hours += float(line.hours_allocated or 0)
        total_amount += float(line.line_amount or 0)
    return {"totalHours": round(total_hours, 2), "totalAmount": round(total_amount, 2)}

