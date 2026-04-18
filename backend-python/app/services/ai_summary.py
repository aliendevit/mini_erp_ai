from __future__ import annotations

from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..models import WorkEntry


def build_work_summary(
    db: Session,
    employee_id: str | None = None,
    order_id: str | None = None,
    site_id: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    question: str | None = None,
) -> dict:
    stmt = (
        select(WorkEntry)
        .options(
            joinedload(WorkEntry.employee),
            joinedload(WorkEntry.order),
            joinedload(WorkEntry.site),
        )
        .order_by(WorkEntry.work_date.desc())
    )

    if employee_id:
        stmt = stmt.where(WorkEntry.employee_id == employee_id)
    if order_id:
        stmt = stmt.where(WorkEntry.order_id == order_id)
    if site_id:
        stmt = stmt.where(WorkEntry.site_id == site_id)
    if from_date:
        stmt = stmt.where(WorkEntry.work_date >= from_date)
    if to_date:
        stmt = stmt.where(WorkEntry.work_date <= to_date)

    entries = db.scalars(stmt).all()
    total_hours = round(sum(float(entry.hours) for entry in entries if entry.day_type == "work"), 2)
    absence_count = sum(1 for entry in entries if entry.day_type != "work")
    employee_counter = Counter(f"{entry.employee.first_name} {entry.employee.last_name}" for entry in entries if entry.employee)
    site_counter = Counter(entry.site.site_name for entry in entries if entry.site)
    order_counter = Counter(entry.order.title for entry in entries if entry.order)

    top_employees = employee_counter.most_common(3)
    top_sites = site_counter.most_common(3)
    top_orders = order_counter.most_common(3)

    lines = [
        f"Arbeitszeiten im Filter: {len(entries)} Eintraege",
        f"Summe produktive Stunden: {total_hours}",
        f"Abwesenheitseintraege: {absence_count}",
    ]
    if top_employees:
        lines.append("Top Mitarbeiter: " + ", ".join(f"{name} ({count})" for name, count in top_employees))
    if top_sites:
        lines.append("Top Baustellen: " + ", ".join(f"{name} ({count})" for name, count in top_sites))
    if top_orders:
        lines.append("Top Auftraege: " + ", ".join(f"{name} ({count})" for name, count in top_orders))

    prompt = "\n".join(
        [
            "You are assisting with an ERP work-entry review.",
            f"Question: {question or 'Summarize the work data.'}",
            f"Entries: {len(entries)}",
            f"Productive hours: {total_hours}",
            f"Absence entries: {absence_count}",
            "Use concise business language and point out workload anomalies or missing patterns.",
        ]
    )

    return {
        "summary": "\n".join(lines),
        "stats": {
            "entryCount": len(entries),
            "productiveHours": total_hours,
            "absenceEntries": absence_count,
            "topEmployees": top_employees,
            "topSites": top_sites,
            "topOrders": top_orders,
        },
        "prompt": prompt,
        "providerReady": False,
    }
