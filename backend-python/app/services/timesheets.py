from __future__ import annotations

import calendar
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Employee, WorkEntry
from ..utils import german_error

MONTH_NAMES = [
    "Januar",
    "Februar",
    "Maerz",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
]


def format_hours_de(hours: float) -> str:
    if hours.is_integer():
        return f"{int(hours)}"
    return f"{hours:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def _is_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5


def _minutes_to_hhmm(total_minutes: int) -> str:
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours:02d}:{minutes:02d}"


def _compute_end_time(hours: float) -> str:
    start = 7 * 60
    work_minutes = round(hours * 60)
    end = start + work_minutes + 60
    return _minutes_to_hhmm(end)


def _label_for_kind(kind: str, hours: float) -> str:
    if kind == "sick":
        return "Krank"
    if kind == "vacation":
        return "Urlaub"
    if kind == "holiday":
        return "Feiertag"
    if kind == "weekend":
        return "Wochenende"
    return format_hours_de(hours)


def compute_timesheet_data(db: Session, employee_id: str, year: int, month: int) -> dict:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise german_error("Mitarbeiter nicht gefunden.", 404)
    if year < 2000 or year > 2100:
        raise german_error("Ungueltiges Jahr.")
    if month < 1 or month > 12:
        raise german_error("Ungueltiger Monat.")

    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_exclusive = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_exclusive = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    last_day = calendar.monthrange(year, month)[1]

    entries = db.scalars(
        select(WorkEntry).where(
            WorkEntry.employee_id == employee_id,
            WorkEntry.work_date >= start,
            WorkEntry.work_date < end_exclusive,
        )
    ).all()

    by_day: dict[str, dict[str, float | str | None]] = {}

    def precedence(value: str | None) -> int:
        if value == "holiday":
            return 3
        if value == "vacation":
            return 2
        if value == "sick":
            return 1
        return 0

    for entry in entries:
        ymd = entry.work_date.date().isoformat()
        current = by_day.setdefault(ymd, {"sumWorkHours": 0.0, "absence": None})
        is_absence = entry.is_sick or entry.day_type in {"sick", "vacation", "holiday"}
        if is_absence:
            absence = "holiday" if entry.day_type == "holiday" else "vacation" if entry.day_type == "vacation" else "sick"
            if precedence(absence) > precedence(current["absence"]):
                current["absence"] = absence
        else:
            current["sumWorkHours"] = float(current["sumWorkHours"]) + float(entry.hours)

    rows: list[dict] = []
    total_hours = 0.0

    for day in range(1, last_day + 1):
        current = datetime(year, month, day, tzinfo=timezone.utc)
        ymd = current.date().isoformat()
        day_data = by_day.get(ymd)

        if _is_weekend(current):
            kind = "weekend"
        elif day_data and day_data["absence"]:
            kind = str(day_data["absence"])
        else:
            kind = "work"

        hours = float(day_data["sumWorkHours"]) if kind == "work" and day_data else 0.0
        if kind == "work":
            total_hours += hours

        has_work = kind == "work" and hours > 0
        rows.append(
            {
                "ymd": ymd,
                "dateLabel": current.strftime("%d.%m.%Y"),
                "workLabel": _label_for_kind(kind, hours),
                "begin": "07:00" if has_work else "--",
                "end": _compute_end_time(hours) if has_work else "--",
                "kind": kind,
                "hours": round(hours, 2),
            }
        )

    return {
        "employee": {
            "id": employee.id,
            "firstName": employee.first_name,
            "lastName": employee.last_name,
        },
        "month": month,
        "year": year,
        "monthName": MONTH_NAMES[month - 1],
        "rows": rows,
        "totalHours": round(total_hours, 2),
        "totalHoursLabel": format_hours_de(total_hours),
    }

