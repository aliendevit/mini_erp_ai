from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from math import ceil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import (
    Customer,
    CustomerWorkshop,
    Employee,
    EmployeeAssignment,
    EmployeeAvailabilityBlock,
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
    Site,
    Workshop,
    WorkshopSiteAssignment,
    WorkEntry,
)
from ..schemas import (
    AssignmentPayload,
    AssignmentUpdatePayload,
    CustomerPayload,
    CustomerWorkshopPayload,
    EmployeePayload,
    InvoiceSequenceUpdatePayload,
    OrderPayload,
    PaymentRecordPayload,
    ProjectIssuePayload,
    ProjectMaterialLogPayload,
    ProjectMonitoringAlertUpdatePayload,
    ProjectProgressUpdatePayload,
    ProjectSiteBaselinePayload,
    ProjectTaskPayload,
    SitePayload,
    WorkshopPayload,
    WorkshopSiteAssignmentPayload,
    WorkEntryPayload,
)
from ..services.tracking_ai import analyze_tracking
from ..services.timesheets import compute_timesheet_data
from ..services.timesheet_documents import build_timesheet_docx, build_timesheet_pdf
from ..utils import (
    as_date_only,
    as_datetime,
    assignment_payload,
    customer_payload,
    customer_workshop_payload,
    decimal_or_none,
    employee_payload,
    end_of_utc_day,
    ensure,
    german_error,
    get_invoice_sequence_state,
    invoice_payload,
    normalize_day_type,
    not_found,
    order_payload,
    parse_seq,
    parse_year,
    payment_record_payload,
    progress_photo_payload,
    progress_update_payload,
    project_issue_payload,
    project_material_log_payload,
    project_monitoring_alert_payload,
    project_monitoring_report_payload,
    project_site_baseline_payload,
    project_task_payload,
    parse_ymd_to_utc_start,
    raise_delete_error,
    raise_unique_error,
    site_payload,
    workshop_payload,
    workshop_site_assignment_payload,
    work_entry_payload,
    json_dumps,
)

router = APIRouter()

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "project-progress"
ALLOWED_PROGRESS_PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_PROGRESS_PHOTO_BYTES = 8 * 1024 * 1024
MAX_PROGRESS_PHOTOS_PER_UPDATE = 10


def _apply_workshop_payload(item: CustomerWorkshop, payload: CustomerWorkshopPayload) -> CustomerWorkshop:
    item.name = payload.name.strip()
    item.contact_name = payload.contactName
    item.phone = payload.phone
    item.email = payload.email
    item.specialties_json = json_dumps(sorted({value.strip() for value in payload.specialties if value and value.strip()}))
    item.notes = payload.notes
    item.relationship_status = payload.relationshipStatus or "known"
    item.is_active = payload.isActive
    return item




def _clean_string_list(values: list[str]) -> list[str]:
    return sorted({value.strip() for value in values if value and value.strip()})


def _apply_global_workshop_payload(item: Workshop, payload: WorkshopPayload) -> Workshop:
    item.name = payload.name.strip()
    item.contact_name = payload.contactName
    item.phone = payload.phone
    item.email = payload.email
    item.specialties_json = json_dumps(_clean_string_list(payload.specialties))
    item.notes = payload.notes
    item.availability_status = payload.availabilityStatus or "available"
    item.availability_note = payload.availabilityNote
    item.is_active = payload.isActive
    return item


def _apply_workshop_assignment_payload(item: WorkshopSiteAssignment, payload: WorkshopSiteAssignmentPayload, order_id: str) -> WorkshopSiteAssignment:
    item.order_id = order_id
    item.site_id = payload.siteId
    item.workshop_id = payload.workshopId
    item.covered_skills_json = json_dumps(_clean_string_list(payload.coveredSkills))
    item.start_date = as_datetime(payload.startDate)
    item.end_date = as_datetime(payload.endDate)
    ensure(not item.start_date or not item.end_date or item.start_date <= item.end_date, "Workshop-Enddatum darf nicht vor dem Startdatum liegen.")
    item.status = payload.status or "assigned"
    item.notes = payload.notes
    return item


def _ensure_assignable_workshop(workshop: Workshop | None) -> Workshop:
    ensure(workshop is not None, "Workshop nicht gefunden.", 404)
    ensure(bool(workshop.is_active), "Workshop ist inaktiv und kann nicht zugeordnet werden.", 400)
    ensure(workshop.availability_status == "available", "Workshop ist aktuell nicht verfuegbar.", 400)
    return workshop


def _comparison_datetime(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _ranges_overlap(start_a: datetime | None, end_a: datetime | None, start_b: datetime | None, end_b: datetime | None) -> bool:
    if not start_a or not end_a or not start_b or not end_b:
        return False
    left_start = _comparison_datetime(start_a)
    left_end = _comparison_datetime(end_a)
    right_start = _comparison_datetime(start_b)
    right_end = _comparison_datetime(end_b)
    return bool(left_start and left_end and right_start and right_end and left_start <= right_end and right_start <= left_end)


def _ensure_no_site_workshop_overlap(
    db: Session,
    *,
    site_id: str,
    workshop_id: str,
    start_date: datetime | None,
    end_date: datetime | None,
    exclude_assignment_id: str | None = None,
) -> None:
    if not start_date or not end_date:
        return
    stmt = select(WorkshopSiteAssignment).where(WorkshopSiteAssignment.site_id == site_id)
    if exclude_assignment_id:
        stmt = stmt.where(WorkshopSiteAssignment.id != exclude_assignment_id)
    existing_items = db.scalars(stmt).all()
    for existing in existing_items:
        if existing.workshop_id == workshop_id:
            continue
        if _ranges_overlap(start_date, end_date, existing.start_date, existing.end_date):
            raise HTTPException(
                status_code=409,
                detail="Eine andere Werkstatt ist in diesem Zeitraum bereits fuer diese Baustelle eingeplant.",
            )


def _assignment_order_for_site(db: Session, site_id: str) -> str:
    site = db.get(Site, site_id)
    if not site:
        raise not_found()
    return site.order_id


def _apply_payment_payload(item: PaymentRecord, payload: PaymentRecordPayload) -> PaymentRecord:
    item.proposal_id = payload.proposalId
    item.customer_id = payload.customerId
    item.order_id = payload.orderId
    item.invoice_id = payload.invoiceId
    item.payment_type = payload.type or "deposit"
    item.status = payload.status or "planned"
    item.amount = decimal_or_none(payload.amount)
    item.currency = payload.currency or "EUR"
    item.due_date = as_datetime(payload.dueDate)
    item.paid_date = as_datetime(payload.paidDate)
    item.method = payload.method
    item.reference = payload.reference
    item.notes = payload.notes
    return item


def _create_draft_invoice(db: Session, customer_id: str) -> Invoice:
    invoice = Invoice(
        status="draft",
        customer_id=customer_id,
        invoice_number=None,
        issue_date=None,
        period_start=None,
        period_end=None,
        notes=None,
    )
    db.add(invoice)
    db.flush()
    return invoice


def _compute_rate(db: Session, employee_id: str, order_id: str) -> Decimal:
    employee = db.get(Employee, employee_id)
    order = db.get(Order, order_id)
    rate = (order.default_hourly_rate if order else None) or (employee.default_hourly_rate if employee else None)
    return Decimal("0") if rate is None else Decimal(str(rate))


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _progress_percent(value: int | None) -> int | None:
    if value is None:
        return None
    ensure(0 <= int(value) <= 100, "Fortschritt muss zwischen 0 und 100 liegen.")
    return int(value)


def _task_weight_percent(value: float | int | None) -> Decimal | None:
    parsed = decimal_or_none(value)
    if parsed is None:
        return None
    ensure(Decimal("0") <= parsed <= Decimal("100"), "Aufgabengewicht muss zwischen 0 und 100 liegen.")
    return parsed


def _progress_photo_type_and_suffix(file: UploadFile) -> tuple[str, str]:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    suffix = Path(file.filename or "").suffix.lower()
    suffix_map = {".jpg": ("image/jpeg", ".jpg"), ".jpeg": ("image/jpeg", ".jpg"), ".png": ("image/png", ".png"), ".webp": ("image/webp", ".webp")}
    if content_type in ALLOWED_PROGRESS_PHOTO_TYPES:
        return content_type, ALLOWED_PROGRESS_PHOTO_TYPES[content_type]
    if suffix in suffix_map:
        return suffix_map[suffix]
    ensure(False, "Nur JPG, PNG oder WEBP Fotos sind erlaubt.")
    return "image/jpeg", ".jpg"


def _ensure_site_belongs_to_order(db: Session, order_id: str, site_id: str | None) -> None:
    if not site_id:
        return
    site = db.get(Site, site_id)
    ensure(site is not None and site.order_id == order_id, "Die Baustelle gehoert nicht zum Auftrag.")


def _delete_local_photo_file(photo: ProjectProgressPhoto) -> None:
    try:
        path = Path(photo.storage_path).resolve()
        root = UPLOAD_ROOT.resolve()
        if root not in path.parents:
            return
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        return


def _load_tracking_parts(db: Session, order_id: str) -> tuple[
    Order,
    list[ProjectProgressUpdate],
    list[ProjectTask],
    list[ProjectIssue],
    list[ProjectMaterialLog],
]:
    order = db.execute(
        select(Order)
        .options(
            joinedload(Order.customer),
            selectinload(Order.sites).selectinload(Site.assignments).joinedload(EmployeeAssignment.employee),
            selectinload(Order.sites).selectinload(Site.workshop_assignments).joinedload(WorkshopSiteAssignment.workshop),
            selectinload(Order.sites).joinedload(Site.baseline_plan),
        )
        .where(Order.id == order_id)
    ).unique().scalar_one_or_none()
    if not order:
        raise not_found()

    updates = db.execute(
        select(ProjectProgressUpdate)
        .options(joinedload(ProjectProgressUpdate.site), selectinload(ProjectProgressUpdate.photos))
        .where(ProjectProgressUpdate.order_id == order_id)
        .order_by(ProjectProgressUpdate.update_date.desc(), ProjectProgressUpdate.created_at.desc())
    ).unique().scalars().all()
    tasks = db.execute(
        select(ProjectTask)
        .options(joinedload(ProjectTask.site))
        .where(ProjectTask.order_id == order_id)
        .order_by(ProjectTask.created_at.desc())
    ).unique().scalars().all()
    issues = db.execute(
        select(ProjectIssue)
        .options(joinedload(ProjectIssue.site))
        .where(ProjectIssue.order_id == order_id)
        .order_by(ProjectIssue.created_at.desc())
    ).unique().scalars().all()
    materials = db.execute(
        select(ProjectMaterialLog)
        .options(joinedload(ProjectMaterialLog.site))
        .where(ProjectMaterialLog.order_id == order_id)
        .order_by(ProjectMaterialLog.created_at.desc())
    ).unique().scalars().all()
    return order, updates, tasks, issues, materials


_WARNING_FIX_AREAS: dict[str, str] = {
    "blocked_site": "issues",
    "missing_workshop_schedule": "team",
    "workshop_unavailable": "team",
    "high_issue": "issues",
    "overdue_task": "tasks",
    "no_workshop_assigned": "team",
    "progress_status_mismatch": "timeline",
    "baseline_missing": "baseline",
    "baseline_not_confirmed": "baseline",
    "behind_schedule": "baseline",
    "predicted_delay": "baseline",
    "no_progress_velocity": "baseline",
    "task_weights_missing": "tasks",
}

_WARNING_ACTIONS: dict[str, str] = {
    "blocked_site": "Review the blocker, set the responsible workshop, and add a new progress update when the site can continue.",
    "missing_workshop_schedule": "Edit the existing workshop assignment and add start/end dates.",
    "workshop_unavailable": "Update workshop availability or assign another available workshop.",
    "high_issue": "Open the issue, add the responsible party and resolution note, then resolve it after the fix is done.",
    "overdue_task": "Update the task due date or mark the task as completed if the work is done.",
    "no_workshop_assigned": "Assign a workshop to this site before execution starts.",
    "progress_status_mismatch": "Add a progress update so the site status and completion percentage match.",
    "baseline_missing": "Create or confirm a baseline plan for this site.",
    "baseline_not_confirmed": "Review the draft baseline dates and confirm them before using them for schedule control.",
    "behind_schedule": "Review site progress and update tasks, blockers, materials, or workshop dates.",
    "predicted_delay": "Review the predicted finish date and adjust the plan or execution actions.",
    "no_progress_velocity": "Add task progress or progress updates so the system can forecast completion.",
    "task_weights_missing": "Add task weights to improve automatic progress calculation.",
}


def _warning_payload(kind: str, severity: str, message: str, site: Site | None = None) -> dict:
    return {
        "type": kind,
        "severity": severity,
        "message": message,
        "siteId": site.id if site else None,
        "siteName": site.site_name if site else None,
        "recommendedAction": _WARNING_ACTIONS.get(kind),
        "fixArea": _WARNING_FIX_AREAS.get(kind, "overview"),
    }


def _schedule_status(assignment: WorkshopSiteAssignment, now: datetime) -> str:
    if not assignment.start_date or not assignment.end_date:
        return "missing_schedule"
    start_date = _comparison_datetime(assignment.start_date)
    end_date = _comparison_datetime(assignment.end_date)
    current = _comparison_datetime(now)
    if not start_date or not end_date or not current:
        return "missing_schedule"
    if end_date < current:
        return "past"
    if start_date > current:
        return "upcoming"
    return "active"


def _scheduled_workshop_payload(assignment: WorkshopSiteAssignment, now: datetime) -> dict:
    data = workshop_site_assignment_payload(assignment)
    data["scheduleStatus"] = _schedule_status(assignment, now)
    return data


def _effective_task_weights(tasks: list[ProjectTask]) -> tuple[dict[str, float], bool]:
    if not tasks:
        return {}, False

    explicit: dict[str, float] = {}
    missing: list[ProjectTask] = []
    for task in tasks:
        if task.weight_percent is None:
            missing.append(task)
            continue
        weight = max(0.0, float(task.weight_percent))
        if weight > 0:
            explicit[task.id] = weight
        else:
            missing.append(task)

    if not explicit:
        even = 100.0 / len(tasks)
        return {task.id: even for task in tasks}, True

    remaining = max(0.0, 100.0 - sum(explicit.values()))
    missing_weight = remaining / len(missing) if missing else 0.0
    weights = dict(explicit)
    for task in missing:
        weights[task.id] = missing_weight
    return weights, bool(missing)


def _task_completion_percent(task: ProjectTask) -> float:
    if task.status in {"completed", "done"}:
        return 100.0
    if task.status == "in_progress":
        return float(_progress_percent(task.progress_percent) or 0)
    return 0.0


def _actual_site_progress(site_tasks: list[ProjectTask], latest_site_update: ProjectProgressUpdate | None) -> tuple[int, bool]:
    if not site_tasks:
        if latest_site_update and latest_site_update.progress_percent is not None:
            return _progress_percent(latest_site_update.progress_percent) or 0, False
        return 0, False

    weights, weights_missing = _effective_task_weights(site_tasks)
    total_weight = sum(weights.values())
    if total_weight <= 0:
        return 0, weights_missing

    progress = sum((weights.get(task.id, 0.0) * _task_completion_percent(task)) / 100.0 for task in site_tasks)
    return max(0, min(100, round((progress / total_weight) * 100))), weights_missing


def _actual_site_progress_detail(
    site_tasks: list[ProjectTask],
    latest_site_update: ProjectProgressUpdate | None,
    site_issues: list[ProjectIssue],
    site_materials: list[ProjectMaterialLog],
    now: datetime,
) -> dict:
    progress, weights_missing = _actual_site_progress(site_tasks, latest_site_update)
    signals: list[str] = []
    confidence = "low"
    source = "none"

    if site_tasks:
        source = "weighted_tasks"
        confidence = "medium" if weights_missing else "high"
        completed_count = len([task for task in site_tasks if task.status in {"completed", "done"}])
        in_progress_count = len([task for task in site_tasks if task.status == "in_progress"])
        signals.append(f"{completed_count} completed task(s), {in_progress_count} in progress task(s).")
        signals.append(
            "Task weights were missing, so equal/remaining distribution was used."
            if weights_missing
            else "Explicit task weights were used for actual progress."
        )
    elif latest_site_update and latest_site_update.progress_percent is not None:
        source = "manual_update"
        confidence = "medium"
        signals.append("No site tasks exist, so the latest manual progress update was used.")
    else:
        signals.append("No task progress or manual progress update is available yet.")

    if latest_site_update and latest_site_update.update_date:
        update_date = _comparison_datetime(latest_site_update.update_date)
        current = _comparison_datetime(now)
        if update_date and current:
            age_days = max(0, (current - update_date).days)
            signals.append(f"Latest progress update is {age_days} day(s) old.")
            if age_days > 7 and confidence == "high":
                confidence = "medium"
            elif age_days > 7 and confidence == "medium":
                confidence = "low"

    open_blockers = [issue for issue in site_issues if issue.status in {"open", "in_progress"}]
    high_blockers = [issue for issue in open_blockers if issue.severity == "high"]
    if high_blockers:
        signals.append(f"{len(high_blockers)} high severity open issue(s) may affect progress reliability.")
        if confidence == "high":
            confidence = "medium"
    elif open_blockers:
        signals.append(f"{len(open_blockers)} open issue(s) are still active.")

    needed_materials = [material for material in site_materials if material.status in {"needed", "ordered"}]
    if needed_materials:
        signals.append(f"{len(needed_materials)} material item(s) are still needed or ordered.")

    return {
        "actualProgressPercent": progress,
        "taskWeightsMissing": weights_missing,
        "progressSource": source,
        "progressConfidence": confidence,
        "progressSignals": signals,
    }


def _baseline_plan_payload(item: ProjectSiteBaseline | None) -> dict | None:
    return project_site_baseline_payload(item)


def _linear_planned_progress(baseline: ProjectSiteBaseline | None, now: datetime) -> int | None:
    if not baseline or not baseline.planned_start_date or not baseline.planned_end_date:
        return None
    start = _comparison_datetime(baseline.planned_start_date)
    end = _comparison_datetime(baseline.planned_end_date)
    current = _comparison_datetime(now)
    if not start or not end or not current:
        return None
    if end <= start:
        return 100 if current >= end else 0
    if current <= start:
        return 0
    if current >= end:
        return 100
    return max(0, min(100, round(((current - start).total_seconds() / (end - start).total_seconds()) * 100)))


def _delay_forecast(baseline: ProjectSiteBaseline | None, actual_progress: int, now: datetime) -> dict:
    empty = {"predictedFinishDate": None, "delayDays": None, "delayStatus": "unknown"}
    if not baseline or baseline.baseline_status != "confirmed" or not baseline.planned_start_date or not baseline.planned_end_date:
        return empty

    start = _comparison_datetime(baseline.planned_start_date)
    end = _comparison_datetime(baseline.planned_end_date)
    current = _comparison_datetime(now)
    if not start or not end or not current:
        return empty

    if current < start:
        return {"predictedFinishDate": baseline.planned_end_date, "delayDays": 0, "delayStatus": "on_track"}

    if actual_progress >= 100:
        delay_days = max(0, ceil((current - end).total_seconds() / 86400))
        return {
            "predictedFinishDate": now,
            "delayDays": delay_days,
            "delayStatus": "delayed" if delay_days > 0 else "on_track",
        }

    elapsed_days = max((current - start).total_seconds() / 86400, 0.0)
    if elapsed_days <= 0 or actual_progress <= 0:
        if current > end:
            return {"predictedFinishDate": None, "delayDays": ceil((current - end).total_seconds() / 86400), "delayStatus": "delayed"}
        return empty

    daily_progress = actual_progress / elapsed_days
    if daily_progress <= 0:
        return empty
    remaining_days = (100 - actual_progress) / daily_progress
    predicted = now + timedelta(days=remaining_days)
    delay_days = max(0, ceil((_comparison_datetime(predicted) - end).total_seconds() / 86400))
    if delay_days == 0:
        status = "on_track"
    elif delay_days <= 2:
        status = "watch"
    else:
        status = "delayed"
    return {"predictedFinishDate": predicted, "delayDays": delay_days, "delayStatus": status}


def _tracking_response(db: Session, order_id: str) -> dict:
    order, updates, tasks, issues, materials = _load_tracking_parts(db, order_id)
    completed_task_statuses = {"completed", "done"}
    open_issue_statuses = {"open", "in_progress"}
    completed_tasks = [task for task in tasks if task.status in completed_task_statuses]
    open_issues = [issue for issue in issues if issue.status in open_issue_statuses]
    latest_update = updates[0] if updates else None
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day)
    dashboard_warnings: list[dict] = []
    site_actual_values: list[int] = []
    site_planned_values: list[int] = []
    behind_schedule_site_count = 0

    site_cards = []
    for site in order.sites:
        site_updates = [item for item in updates if item.site_id == site.id]
        site_tasks = [item for item in tasks if item.site_id == site.id]
        site_materials = [item for item in materials if item.site_id == site.id]
        site_issues = [item for item in issues if item.site_id == site.id and item.status in open_issue_statuses]
        latest_site_update = site_updates[0] if site_updates else None
        progress_detail = _actual_site_progress_detail(site_tasks, latest_site_update, site_issues, site_materials, now)
        actual_progress_percent = int(progress_detail["actualProgressPercent"])
        task_weights_missing = bool(progress_detail["taskWeightsMissing"])
        progress_percent = actual_progress_percent
        current_status = latest_site_update.status if latest_site_update else "not_started"
        baseline_plan = site.baseline_plan
        confirmed_baseline_plan = baseline_plan if baseline_plan and baseline_plan.baseline_status == "confirmed" else None
        planned_progress_percent = _linear_planned_progress(confirmed_baseline_plan, now)
        progress_delta_percent = (
            actual_progress_percent - planned_progress_percent if planned_progress_percent is not None else None
        )
        forecast = _delay_forecast(confirmed_baseline_plan, actual_progress_percent, now)
        site_actual_values.append(actual_progress_percent)
        if planned_progress_percent is not None:
            site_planned_values.append(planned_progress_percent)
        if progress_delta_percent is not None and progress_delta_percent < -10:
            behind_schedule_site_count += 1

        latest_photos: list[dict] = []
        for update in site_updates:
            for photo in update.photos:
                latest_photos.append(progress_photo_payload(photo))
            if len(latest_photos) >= 4:
                break

        scheduled_workshops = [_scheduled_workshop_payload(assignment, now) for assignment in site.workshop_assignments]
        scheduled_workshops.sort(key=lambda item: (item.get("startDate") is None, str(item.get("startDate") or "")))
        workshop_assignments = scheduled_workshops
        workshop_names = [item.get("workshop", {}).get("name") for item in workshop_assignments if item.get("workshop", {}).get("name")]
        workshop_skills = sorted({skill for item in workshop_assignments for skill in item.get("coveredSkills", [])})
        schedule_warnings: list[dict] = []
        site_has_execution_data = bool(site_updates or site_tasks or site_materials or site_issues or site.workshop_assignments)
        if site.is_active and site_has_execution_data and not baseline_plan:
            schedule_warnings.append(_warning_payload("baseline_missing", "medium", f"Site {site.site_name} has no baseline schedule.", site))
        elif baseline_plan and baseline_plan.baseline_status != "confirmed":
            schedule_warnings.append(_warning_payload("baseline_not_confirmed", "low", f"Site {site.site_name} has a draft baseline schedule.", site))
        if progress_delta_percent is not None and progress_delta_percent < -10:
            schedule_warnings.append(_warning_payload("behind_schedule", "medium", f"Site {site.site_name} is {abs(progress_delta_percent)}% behind planned progress.", site))
        if forecast.get("delayStatus") in {"watch", "delayed"} and forecast.get("delayDays"):
            severity = "high" if forecast.get("delayStatus") == "delayed" else "medium"
            schedule_warnings.append(_warning_payload("predicted_delay", severity, f"Site {site.site_name} is predicted to finish {forecast.get('delayDays')} day(s) late.", site))
        if site_has_execution_data and baseline_plan and baseline_plan.baseline_status == "confirmed" and forecast.get("delayStatus") == "unknown":
            start = _comparison_datetime(baseline_plan.planned_start_date)
            if start and _comparison_datetime(now) and _comparison_datetime(now) > start and actual_progress_percent <= 0:
                schedule_warnings.append(_warning_payload("no_progress_velocity", "medium", f"Site {site.site_name} has no measurable progress velocity.", site))
        if task_weights_missing:
            schedule_warnings.append(_warning_payload("task_weights_missing", "low", f"Site {site.site_name} has tasks without weight values.", site))
        if site.is_active and site_has_execution_data and not site.workshop_assignments:
            schedule_warnings.append(_warning_payload("no_workshop_assigned", "medium", f"Site {site.site_name} has tracking work but no workshop assignment.", site))
        latest_blocked = current_status == "blocked"
        if latest_blocked:
            schedule_warnings.append(_warning_payload("blocked_site", "high", f"Site {site.site_name} is currently blocked.", site))
        if site_has_execution_data and progress_percent >= 100 and current_status not in {"completed", "done"}:
            schedule_warnings.append(_warning_payload("progress_status_mismatch", "low", f"Site {site.site_name} is 100% complete but status is {current_status}.", site))
        if site_has_execution_data and current_status in {"completed", "done"} and progress_percent < 100:
            schedule_warnings.append(_warning_payload("progress_status_mismatch", "medium", f"Site {site.site_name} is marked completed but progress is {progress_percent}%.", site))
        for assignment in site.workshop_assignments:
            workshop_name = assignment.workshop.name if assignment.workshop else "Workshop"
            if not assignment.start_date or not assignment.end_date:
                schedule_warnings.append(_warning_payload("missing_workshop_schedule", "medium", f"Workshop {workshop_name} has no scheduled start/end date.", site))
            if assignment.workshop and (not assignment.workshop.is_active or assignment.workshop.availability_status != "available"):
                schedule_warnings.append(_warning_payload("workshop_unavailable", "high", f"Workshop {workshop_name} is currently not available.", site))
        for issue in site_issues:
            if issue.severity == "high":
                schedule_warnings.append(_warning_payload("high_issue", "high", f"High severity issue is open: {issue.title}", site))
        for task in site_tasks:
            due_date = _comparison_datetime(task.due_date)
            if due_date and due_date < today_start and task.status not in completed_task_statuses:
                schedule_warnings.append(_warning_payload("overdue_task", "medium", f"Task is overdue: {task.task_name}", site))
        dashboard_warnings.extend(schedule_warnings)

        site_cards.append(
            {
                "siteId": site.id,
                "siteName": site.site_name,
                "currentStatus": current_status,
                "progressPercent": progress_percent,
                "actualProgressPercent": actual_progress_percent,
                "progressSource": progress_detail["progressSource"],
                "progressConfidence": progress_detail["progressConfidence"],
                "progressSignals": progress_detail["progressSignals"],
                "plannedProgressPercent": planned_progress_percent,
                "progressDeltaPercent": progress_delta_percent,
                "baselinePlan": _baseline_plan_payload(baseline_plan),
                "baselineStartDate": baseline_plan.planned_start_date if baseline_plan else None,
                "baselineEndDate": baseline_plan.planned_end_date if baseline_plan else None,
                "baselineStatus": baseline_plan.baseline_status if baseline_plan else None,
                "predictedFinishDate": forecast.get("predictedFinishDate"),
                "delayDays": forecast.get("delayDays"),
                "delayStatus": forecast.get("delayStatus"),
                "lastUpdateDate": latest_site_update.update_date if latest_site_update else None,
                "assignedEmployees": [],
                "workshopAssignments": workshop_assignments,
                "scheduledWorkshops": scheduled_workshops,
                "scheduleWarnings": schedule_warnings,
                "externalWorkshopName": ", ".join(workshop_names) if workshop_names else None,
                "externalWorkshopCoveredSkills": workshop_skills,
                "openBlockers": [project_issue_payload(issue) for issue in site_issues],
                "latestPhotos": latest_photos[:4],
            }
        )

    for issue in open_issues:
        if issue.site_id is None and issue.severity == "high":
            dashboard_warnings.append(_warning_payload("high_issue", "high", f"High severity issue is open: {issue.title}"))
    for task in tasks:
        due_date = _comparison_datetime(task.due_date)
        if task.site_id is None and due_date and due_date < today_start and task.status not in completed_task_statuses:
            dashboard_warnings.append(_warning_payload("overdue_task", "medium", f"Task is overdue: {task.task_name}"))

    all_photos = [progress_photo_payload(photo) for update in updates for photo in update.photos]
    total_tasks = len(tasks)
    dashboard_progress = round(sum(site_actual_values) / len(site_actual_values)) if site_actual_values else (round((len(completed_tasks) / total_tasks) * 100) if total_tasks else 0)
    dashboard_planned_progress = round(sum(site_planned_values) / len(site_planned_values)) if site_planned_values else None
    next_actions = [
        update.next_action for update in updates if update.next_action and update.status not in {"completed", "done"}
    ][:5]

    return {
        "order": order_payload(order, include_customer=True, include_sites=True),
        "dashboard": {
            "overallStatus": "blocked" if open_issues else (latest_update.status if latest_update else order.status),
            "overallProgressPercent": dashboard_progress,
            "plannedProgressPercent": dashboard_planned_progress,
            "actualProgressPercent": dashboard_progress,
            "behindScheduleSiteCount": behind_schedule_site_count,
            "openIssueCount": len(open_issues),
            "completedTaskCount": len(completed_tasks),
            "totalTaskCount": total_tasks,
            "latestUpdateDate": latest_update.update_date if latest_update else None,
            "upcomingActions": next_actions,
            "warnings": dashboard_warnings[:20],
        },
        "siteCards": site_cards,
        "updates": [progress_update_payload(update) for update in updates],
        "photos": all_photos,
        "tasks": [project_task_payload(task) for task in tasks],
        "issues": [project_issue_payload(issue) for issue in issues],
        "materials": [project_material_log_payload(material) for material in materials],
    }


def _warning_alert_key(warning: dict) -> tuple[str | None, str, str]:
    return (
        warning.get("siteId"),
        str(warning.get("type") or ""),
        str(warning.get("message") or ""),
    )


def _sync_monitoring_alerts(db: Session, order_id: str, warnings: list[dict]) -> list[ProjectMonitoringAlert]:
    all_existing = db.scalars(
        select(ProjectMonitoringAlert)
        .options(joinedload(ProjectMonitoringAlert.site))
        .where(ProjectMonitoringAlert.order_id == order_id)
    ).all()
    open_existing = [item for item in all_existing if item.status == "open"]
    existing_keys = {_warning_alert_key({"siteId": item.site_id, "type": item.alert_type, "message": item.message}) for item in all_existing}
    created: list[ProjectMonitoringAlert] = []
    for warning in warnings:
        key = _warning_alert_key(warning)
        if key in existing_keys:
            continue
        alert = ProjectMonitoringAlert(
            order_id=order_id,
            site_id=warning.get("siteId"),
            alert_type=str(warning.get("type") or "tracking_warning"),
            severity=str(warning.get("severity") or "medium"),
            status="open",
            message=str(warning.get("message") or warning.get("type") or "Tracking warning"),
            recommended_action=warning.get("recommendedAction"),
            source="tracking_rule",
        )
        db.add(alert)
        created.append(alert)
        existing_keys.add(key)
    if created:
        db.flush()
        for alert in created:
            db.refresh(alert)
    return sorted([*open_existing, *created], key=lambda item: item.created_at or datetime.min, reverse=True)


def _save_monitoring_report(db: Session, order_id: str, analysis: dict, warnings: list[dict]) -> ProjectMonitoringReport:
    report = ProjectMonitoringReport(
        order_id=order_id,
        provider=str(analysis.get("provider") or "unknown"),
        health_status=str(analysis.get("healthStatus") or "watch"),
        summary=str(analysis.get("summary") or ""),
        analysis_json=json_dumps(analysis),
        warnings_json=json_dumps(warnings),
    )
    db.add(report)
    db.flush()
    db.refresh(report)
    return report


_TRADE_DURATION_DAYS = {
    "demolition": 1,
    "waterproofing": 2,
    "insulation": 2,
    "plumbing": 2,
    "electrical": 2,
    "flooring": 3,
    "tiles": 3,
    "painting": 2,
    "carpentry": 2,
    "gypsum": 2,
    "finishing": 1,
}


def _safe_json_list(value: str | None) -> list:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _site_trade_keywords(site: Site) -> list[str]:
    text_parts = [site.site_name or "", site.notes or ""]
    text_parts.extend(task.task_name or "" for task in getattr(site, "tracking_tasks", []) or [])
    text_parts.extend(material.material_name or "" for material in getattr(site, "material_logs", []) or [])
    text_parts.extend(str(skill) for assignment in site.workshop_assignments for skill in _safe_json_list(assignment.covered_skills_json) if skill)
    text = " ".join(text_parts).lower()
    mapping = [
        ("demolition", ("remove", "demolition", "hدم", "ازالة", "إزالة")),
        ("waterproofing", ("waterproof", "moisture", "abdichtung", "عزل", "تسرب")),
        ("insulation", ("insulation", "dämm", "عازل")),
        ("plumbing", ("plumbing", "sanitary", "wasser", "pipes", "مياه", "صحية", "سباكة")),
        ("electrical", ("electric", "electrical", "strom", "كهرب")),
        ("flooring", ("floor", "tile", "tiles", "fliesen", "ceramic", "سيراميك", "بلاط", "ارض")),
        ("painting", ("paint", "painting", "maler", "دهان", "معجون")),
        ("carpentry", ("carpentry", "wood", "cabinet", "نجارة", "خزائن", "رفوف")),
        ("gypsum", ("drywall", "gypsum", "trockenbau", "جبس")),
    ]
    trades = [trade for trade, keywords in mapping if any(keyword in text for keyword in keywords)]
    return trades or ["finishing"]


def _site_trade_sequence(trades: list[str]) -> list[str]:
    priority = ["demolition", "plumbing", "electrical", "waterproofing", "insulation", "gypsum", "flooring", "tiles", "carpentry", "painting", "finishing"]
    return [trade for trade in priority if trade in set(trades)]


def _baseline_note_for_site(site: Site, start: datetime, end: datetime) -> str:
    sequence = _site_trade_sequence(_site_trade_keywords(site))
    trade_text = " -> ".join(sequence)
    return (
        "Draft baseline suggested from order dates, workshop schedule, site tasks, and trade complexity. "
        f"Suggested trade sequence: {trade_text}. "
        f"Planned window: {start.date().isoformat()} to {end.date().isoformat()}. Manager confirmation required."
    )


def _suggest_site_baseline_dates(order: Order, sites: list[Site], site: Site, index: int, now: datetime) -> tuple[datetime, datetime]:
    dated_assignments = [
        item
        for item in site.workshop_assignments
        if item.start_date is not None and item.end_date is not None
    ]
    if dated_assignments:
        return min(item.start_date for item in dated_assignments if item.start_date), max(
            item.end_date for item in dated_assignments if item.end_date
        )

    order_start = order.start_date or now
    order_end = order.end_date or (order_start + timedelta(days=max(1, len(sites) * 3)))
    start = _comparison_datetime(order_start) or _comparison_datetime(now) or datetime.utcnow()
    end = _comparison_datetime(order_end) or start
    if end < start:
        end = start

    total_days = max(1, (end - start).days + 1)
    trades = _site_trade_keywords(site)
    complexity_days = max(1, min(10, sum(_TRADE_DURATION_DAYS.get(trade, 1) for trade in trades)))
    slot_days = max(complexity_days, ceil(total_days / max(1, len(sites))))
    site_start = start + timedelta(days=min(index * slot_days, total_days - 1))
    site_end = end if index == len(sites) - 1 else min(end, site_start + timedelta(days=slot_days - 1))
    return site_start.replace(tzinfo=timezone.utc), site_end.replace(tzinfo=timezone.utc)


def _upsert_site_baseline(
    db: Session,
    order_id: str,
    site_id: str,
    planned_start: datetime,
    planned_end: datetime,
    status: str,
    source: str,
    notes: str | None,
) -> ProjectSiteBaseline:
    ensure(planned_end >= planned_start, "Baseline-Enddatum muss nach dem Startdatum liegen.")
    item = db.scalar(
        select(ProjectSiteBaseline).where(
            ProjectSiteBaseline.order_id == order_id,
            ProjectSiteBaseline.site_id == site_id,
        )
    )
    if not item:
        item = ProjectSiteBaseline(order_id=order_id, site_id=site_id)
        db.add(item)
    item.planned_start_date = planned_start
    item.planned_end_date = planned_end
    item.baseline_status = status
    item.source = source
    item.notes = _normalize_optional_text(notes)
    return item



def _replace_employee_staffing(item: Employee, payload: EmployeePayload) -> None:
    item.skill_records.clear()
    item.availability_blocks.clear()

    for name in sorted({value.strip() for value in payload.skills if value and value.strip()}):
        item.skill_records.append(EmployeeSkill(kind="skill", name=name))
    for name in sorted({value.strip() for value in payload.certifications if value and value.strip()}):
        item.skill_records.append(EmployeeSkill(kind="certification", name=name))

    for block in payload.availabilityBlocks:
        start_date = as_datetime(block.startDate)
        end_date = as_datetime(block.endDate)
        if not start_date or not end_date:
            continue
        item.availability_blocks.append(
            EmployeeAvailabilityBlock(
                start_date=start_date,
                end_date=end_date,
                reason=block.reason,
            )
        )


def _can_modify_work_entry(db: Session, work_entry_id: str) -> dict:
    lines = db.scalars(
        select(InvoiceLine).options(joinedload(InvoiceLine.invoice)).where(InvoiceLine.work_entry_id == work_entry_id)
    ).all()
    if not lines:
        return {"ok": True}
    if len(lines) != 1:
        return {
            "ok": False,
            "reason": "Diese Arbeitszeit ist auf mehrere Rechnungen verteilt und kann nicht geaendert/geloescht werden.",
        }
    invoice = lines[0].invoice
    if invoice.status != "draft":
        return {
            "ok": False,
            "reason": "Diese Arbeitszeit ist bereits in einer nicht-Entwurf-Rechnung enthalten und kann nicht geaendert/geloescht werden.",
        }
    return {"ok": True, "invoiceLineId": lines[0].id, "invoiceId": invoice.id}


@router.get("/customers")
def list_customers(db: Session = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Customer).order_by(Customer.company_name.asc())).all()
    return [customer_payload(item) for item in items]


@router.get("/customers/{customer_id}")
def get_customer(customer_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Customer, customer_id)
    if not item:
        raise not_found()
    return customer_payload(item)


@router.post("/customers", status_code=201)
def create_customer(payload: CustomerPayload, db: Session = Depends(get_db)) -> dict:
    item = Customer(
        company_name=payload.companyName.strip(),
        street=payload.street,
        zip_code=payload.zipCode,
        city=payload.city,
        country=payload.country or "DE",
        vat_id=payload.vatId,
        contact_name=payload.contactName,
        contact_phone=payload.contactPhone,
        contact_email=payload.contactEmail,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return customer_payload(item)


@router.put("/customers/{customer_id}")
def update_customer(customer_id: str, payload: CustomerPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(Customer, customer_id)
    if not item:
        raise not_found()
    item.company_name = payload.companyName.strip()
    item.street = payload.street
    item.zip_code = payload.zipCode
    item.city = payload.city
    item.country = payload.country or "DE"
    item.vat_id = payload.vatId
    item.contact_name = payload.contactName
    item.contact_phone = payload.contactPhone
    item.contact_email = payload.contactEmail
    item.notes = payload.notes
    db.commit()
    db.refresh(item)
    return customer_payload(item)


@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Customer, customer_id)
    if not item:
        raise not_found()
    try:
        db.delete(item)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Kunde", "Bitte zuerst verknuepfte Auftraege/Rechnungen loeschen.")


@router.get("/customers/{customer_id}/workshops")
def list_customer_workshops(customer_id: str, db: Session = Depends(get_db)) -> list[dict]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise not_found()
    items = db.scalars(
        select(CustomerWorkshop)
        .where(CustomerWorkshop.customer_id == customer_id)
        .order_by(CustomerWorkshop.name.asc())
    ).all()
    return [customer_workshop_payload(item) for item in items]


@router.post("/customers/{customer_id}/workshops", status_code=201)
def create_customer_workshop(customer_id: str, payload: CustomerWorkshopPayload, db: Session = Depends(get_db)) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise not_found()
    ensure(bool(payload.name and payload.name.strip()), "Workshop-Name fehlt.")
    item = CustomerWorkshop(customer_id=customer_id, name=payload.name.strip())
    _apply_workshop_payload(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return customer_workshop_payload(item)


@router.put("/customers/{customer_id}/workshops/{workshop_id}")
def update_customer_workshop(customer_id: str, workshop_id: str, payload: CustomerWorkshopPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(CustomerWorkshop, workshop_id)
    if not item or item.customer_id != customer_id:
        raise not_found()
    ensure(bool(payload.name and payload.name.strip()), "Workshop-Name fehlt.")
    _apply_workshop_payload(item, payload)
    db.commit()
    db.refresh(item)
    return customer_workshop_payload(item)


@router.delete("/customers/{customer_id}/workshops/{workshop_id}")
def delete_customer_workshop(customer_id: str, workshop_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(CustomerWorkshop, workshop_id)
    if not item or item.customer_id != customer_id:
        raise not_found()
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/workshops")
def list_workshops(
    activeOnly: bool = Query(default=False),
    availableOnly: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(Workshop).order_by(Workshop.name.asc())
    if activeOnly:
        stmt = stmt.where(Workshop.is_active.is_(True))
    if availableOnly:
        stmt = stmt.where(Workshop.is_active.is_(True)).where(Workshop.availability_status == "available")
    return [workshop_payload(item) for item in db.scalars(stmt).all()]


@router.get("/workshops/{workshop_id}")
def get_workshop(workshop_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Workshop, workshop_id)
    if not item:
        raise not_found()
    return workshop_payload(item)


@router.post("/workshops", status_code=201)
def create_workshop(payload: WorkshopPayload, db: Session = Depends(get_db)) -> dict:
    ensure(bool(payload.name and payload.name.strip()), "Workshop-Name fehlt.")
    existing = db.scalar(select(Workshop).where(func.lower(Workshop.name) == payload.name.strip().lower()).limit(1))
    ensure(existing is None, "Workshop existiert bereits.", 409)
    item = Workshop(name=payload.name.strip())
    _apply_global_workshop_payload(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return workshop_payload(item)


@router.put("/workshops/{workshop_id}")
def update_workshop(workshop_id: str, payload: WorkshopPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(Workshop, workshop_id)
    if not item:
        raise not_found()
    ensure(bool(payload.name and payload.name.strip()), "Workshop-Name fehlt.")
    duplicate = db.scalar(
        select(Workshop)
        .where(func.lower(Workshop.name) == payload.name.strip().lower())
        .where(Workshop.id != workshop_id)
        .limit(1)
    )
    ensure(duplicate is None, "Workshop existiert bereits.", 409)
    _apply_global_workshop_payload(item, payload)
    db.commit()
    db.refresh(item)
    return workshop_payload(item)


@router.delete("/workshops/{workshop_id}")
def delete_workshop(workshop_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Workshop, workshop_id)
    if not item:
        raise not_found()
    linked = db.scalar(select(func.count()).select_from(WorkshopSiteAssignment).where(WorkshopSiteAssignment.workshop_id == workshop_id)) or 0
    ensure(linked == 0, "Workshop ist noch Baustellen zugeordnet. Bitte zuerst Zuordnungen entfernen.", 409)
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/orders/{order_id}/workshop-assignments")
def list_order_workshop_assignments(order_id: str, db: Session = Depends(get_db)) -> list[dict]:
    order = db.get(Order, order_id)
    if not order:
        raise not_found()
    items = db.execute(
        select(WorkshopSiteAssignment)
        .options(joinedload(WorkshopSiteAssignment.workshop), joinedload(WorkshopSiteAssignment.site))
        .where(WorkshopSiteAssignment.order_id == order_id)
        .order_by(WorkshopSiteAssignment.created_at.desc())
    ).unique().scalars().all()
    return [workshop_site_assignment_payload(item) for item in items]


@router.post("/orders/{order_id}/workshop-assignments", status_code=201)
def create_order_workshop_assignment(order_id: str, payload: WorkshopSiteAssignmentPayload, db: Session = Depends(get_db)) -> dict:
    order = db.get(Order, order_id)
    if not order:
        raise not_found()
    site = db.get(Site, payload.siteId)
    ensure(site is not None and site.order_id == order_id, "Die Baustelle gehoert nicht zum Auftrag.", 400)
    workshop = _ensure_assignable_workshop(db.get(Workshop, payload.workshopId))
    item = WorkshopSiteAssignment(order_id=order_id, site_id=payload.siteId, workshop_id=workshop.id)
    _apply_workshop_assignment_payload(item, payload, order_id)
    _ensure_no_site_workshop_overlap(
        db,
        site_id=item.site_id,
        workshop_id=item.workshop_id,
        start_date=item.start_date,
        end_date=item.end_date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    item = db.execute(
        select(WorkshopSiteAssignment)
        .options(joinedload(WorkshopSiteAssignment.workshop), joinedload(WorkshopSiteAssignment.site))
        .where(WorkshopSiteAssignment.id == item.id)
    ).unique().scalar_one()
    return workshop_site_assignment_payload(item)


@router.put("/workshop-assignments/{assignment_id}")
def update_workshop_assignment(assignment_id: str, payload: WorkshopSiteAssignmentPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkshopSiteAssignment, assignment_id)
    if not item:
        raise not_found()
    order_id = _assignment_order_for_site(db, payload.siteId)
    ensure(item.order_id == order_id, "Die Zuordnung gehoert nicht zu dieser Baustelle.", 400)
    _ensure_assignable_workshop(db.get(Workshop, payload.workshopId))
    _apply_workshop_assignment_payload(item, payload, order_id)
    _ensure_no_site_workshop_overlap(
        db,
        site_id=item.site_id,
        workshop_id=item.workshop_id,
        start_date=item.start_date,
        end_date=item.end_date,
        exclude_assignment_id=item.id,
    )
    db.commit()
    db.refresh(item)
    item = db.execute(
        select(WorkshopSiteAssignment)
        .options(joinedload(WorkshopSiteAssignment.workshop), joinedload(WorkshopSiteAssignment.site))
        .where(WorkshopSiteAssignment.id == assignment_id)
    ).unique().scalar_one()
    return workshop_site_assignment_payload(item)


@router.delete("/workshop-assignments/{assignment_id}")
def delete_workshop_assignment(assignment_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkshopSiteAssignment, assignment_id)
    if not item:
        raise not_found()
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/employees")
def list_employees(db: Session = Depends(get_db)) -> list[dict]:
    items = db.scalars(
        select(Employee)
        .options(selectinload(Employee.skill_records), selectinload(Employee.availability_blocks))
        .order_by(Employee.last_name.asc(), Employee.first_name.asc())
    ).all()
    return [employee_payload(item, include_staffing=True) for item in items]


@router.get("/employees/{employee_id}")
def get_employee(employee_id: str, db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(Employee)
        .options(selectinload(Employee.skill_records), selectinload(Employee.availability_blocks))
        .where(Employee.id == employee_id)
    )
    item = db.execute(stmt).scalar_one_or_none()
    if not item:
        raise not_found()
    return employee_payload(item, include_staffing=True)


@router.post("/employees", status_code=201)
def create_employee(payload: EmployeePayload, db: Session = Depends(get_db)) -> dict:
    item = Employee(
        first_name=payload.firstName.strip(),
        last_name=payload.lastName.strip(),
        birth_date=as_datetime(payload.birthDate),
        street=payload.street,
        zip_code=payload.zipCode,
        city=payload.city,
        phone=payload.phone,
        email=payload.email,
        is_active=payload.isActive,
        default_hourly_rate=decimal_or_none(payload.defaultHourlyRate),
        weekly_capacity_hours=decimal_or_none(payload.weeklyCapacityHours),
    )
    _replace_employee_staffing(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    item = db.execute(
        select(Employee)
        .options(selectinload(Employee.skill_records), selectinload(Employee.availability_blocks))
        .where(Employee.id == item.id)
    ).scalar_one()
    return employee_payload(item, include_staffing=True)


@router.put("/employees/{employee_id}")
def update_employee(employee_id: str, payload: EmployeePayload, db: Session = Depends(get_db)) -> dict:
    item = db.execute(
        select(Employee)
        .options(selectinload(Employee.skill_records), selectinload(Employee.availability_blocks))
        .where(Employee.id == employee_id)
    ).scalar_one_or_none()
    if not item:
        raise not_found()
    item.first_name = payload.firstName.strip()
    item.last_name = payload.lastName.strip()
    item.birth_date = as_datetime(payload.birthDate)
    item.street = payload.street
    item.zip_code = payload.zipCode
    item.city = payload.city
    item.phone = payload.phone
    item.email = payload.email
    item.is_active = payload.isActive
    item.default_hourly_rate = decimal_or_none(payload.defaultHourlyRate)
    item.weekly_capacity_hours = decimal_or_none(payload.weeklyCapacityHours)
    _replace_employee_staffing(item, payload)
    db.commit()
    db.refresh(item)
    return employee_payload(item, include_staffing=True)


@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Employee, employee_id)
    if not item:
        raise not_found()
    try:
        db.delete(item)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Mitarbeiter", "Bitte zuerst verknuepfte Zuordnungen/Arbeitszeiten loeschen.")


@router.get("/orders")
def list_orders(db: Session = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Order).options(joinedload(Order.customer)).order_by(Order.created_at.desc())).all()
    return [order_payload(item, include_customer=True) for item in items]


@router.get("/orders/{order_id}")
def get_order(order_id: str, db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(Order)
        .options(
            joinedload(Order.customer),
            selectinload(Order.sites).selectinload(Site.assignments).joinedload(EmployeeAssignment.employee),
            selectinload(Order.sites).selectinload(Site.workshop_assignments).joinedload(WorkshopSiteAssignment.workshop),
        )
        .where(Order.id == order_id)
    )
    item = db.execute(stmt).unique().scalar_one_or_none()
    if not item:
        raise not_found()
    return order_payload(item, include_customer=True, include_sites=True)


@router.post("/orders", status_code=201)
def create_order(payload: OrderPayload, db: Session = Depends(get_db)) -> dict:
    item = Order(
        customer_id=payload.customerId,
        order_number=payload.orderNumber or None,
        title=payload.title.strip(),
        description=payload.description,
        status=payload.status or "open",
        start_date=as_datetime(payload.startDate),
        end_date=as_datetime(payload.endDate),
        default_hourly_rate=decimal_or_none(payload.defaultHourlyRate),
        currency=payload.currency or "EUR",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return order_payload(item)


@router.put("/orders/{order_id}")
def update_order(order_id: str, payload: OrderPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(Order, order_id)
    if not item:
        raise not_found()
    item.customer_id = payload.customerId
    item.order_number = payload.orderNumber or None
    item.title = payload.title.strip()
    item.description = payload.description
    item.status = payload.status or "open"
    item.start_date = as_datetime(payload.startDate)
    item.end_date = as_datetime(payload.endDate)
    item.default_hourly_rate = decimal_or_none(payload.defaultHourlyRate)
    item.currency = payload.currency or "EUR"
    db.commit()
    db.refresh(item)
    return order_payload(item)


@router.delete("/orders/{order_id}")
def delete_order(order_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Order, order_id)
    if not item:
        raise not_found()
    try:
        db.delete(item)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Auftrag", "Bitte zuerst Baustellen/Arbeitszeiten loeschen.")


@router.get("/sites")
def list_sites(db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(Site)
        .options(
            joinedload(Site.order).joinedload(Order.customer),
            selectinload(Site.assignments).joinedload(EmployeeAssignment.employee),
            selectinload(Site.workshop_assignments).joinedload(WorkshopSiteAssignment.workshop),
        )
        .order_by(Site.created_at.desc())
    )
    items = db.execute(stmt).unique().scalars().all()
    return [site_payload(item, include_order=True, include_assignments=True, include_workshops=True) for item in items]


@router.get("/sites/{site_id}")
def get_site(site_id: str, db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(Site)
        .options(
            joinedload(Site.order).joinedload(Order.customer),
            selectinload(Site.assignments).joinedload(EmployeeAssignment.employee),
            selectinload(Site.workshop_assignments).joinedload(WorkshopSiteAssignment.workshop),
        )
        .where(Site.id == site_id)
    )
    item = db.execute(stmt).unique().scalar_one_or_none()
    if not item:
        raise not_found()
    return site_payload(item, include_order=True, include_assignments=True, include_workshops=True)


@router.post("/sites", status_code=201)
def create_site(payload: SitePayload, db: Session = Depends(get_db)) -> dict:
    item = Site(
        order_id=payload.orderId,
        site_name=payload.siteName.strip(),
        street=payload.street,
        zip_code=payload.zipCode,
        city=payload.city,
        notes=payload.notes,
        is_active=payload.isActive,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return site_payload(item)


@router.put("/sites/{site_id}")
def update_site(site_id: str, payload: SitePayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(Site, site_id)
    if not item:
        raise not_found()
    item.order_id = payload.orderId
    item.site_name = payload.siteName.strip()
    item.street = payload.street
    item.zip_code = payload.zipCode
    item.city = payload.city
    item.notes = payload.notes
    item.is_active = payload.isActive
    db.commit()
    db.refresh(item)
    return site_payload(item)


@router.get("/orders/{order_id}/tracking")
def get_order_tracking(order_id: str, db: Session = Depends(get_db)) -> dict:
    return _tracking_response(db, order_id)


@router.post("/orders/{order_id}/tracking/baseline/suggest")
def suggest_order_tracking_baseline(order_id: str, db: Session = Depends(get_db)) -> dict:
    order = db.execute(
        select(Order)
        .options(
            selectinload(Order.sites).joinedload(Site.baseline_plan),
            selectinload(Order.sites).selectinload(Site.workshop_assignments),
        )
        .where(Order.id == order_id)
    ).unique().scalar_one_or_none()
    if not order:
        raise not_found()

    sites = sorted([site for site in order.sites if site.is_active], key=lambda item: item.created_at)
    now = datetime.now(timezone.utc)
    for index, site in enumerate(sites):
        if site.baseline_plan and site.baseline_plan.baseline_status == "confirmed":
            continue
        planned_start, planned_end = _suggest_site_baseline_dates(order, sites, site, index, now)
        _upsert_site_baseline(
            db,
            order_id=order.id,
            site_id=site.id,
            planned_start=planned_start,
            planned_end=planned_end,
            status="draft",
            source="ai_suggested",
            notes=_baseline_note_for_site(site, planned_start, planned_end),
        )
    db.commit()
    return _tracking_response(db, order_id)


@router.put("/orders/{order_id}/tracking/baseline/{site_id}")
def update_order_site_tracking_baseline(
    order_id: str, site_id: str, payload: ProjectSiteBaselinePayload, db: Session = Depends(get_db)
) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, site_id)
    planned_start = as_datetime(payload.plannedStartDate)
    planned_end = as_datetime(payload.plannedEndDate)
    ensure(planned_start is not None and planned_end is not None, "Baseline-Start und -Ende sind erforderlich.")
    _upsert_site_baseline(
        db,
        order_id=order_id,
        site_id=site_id,
        planned_start=planned_start,
        planned_end=planned_end,
        status=payload.baselineStatus,
        source=payload.source,
        notes=payload.notes,
    )
    db.commit()
    return _tracking_response(db, order_id)


@router.post("/orders/{order_id}/tracking/analyze")
def analyze_order_tracking(order_id: str, locale: str = Query(default="en"), db: Session = Depends(get_db)) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    tracking = _tracking_response(db, order_id)
    analysis = analyze_tracking(tracking, locale=locale)
    warnings = list((tracking.get("dashboard") or {}).get("warnings") or [])
    alerts = _sync_monitoring_alerts(db, order_id, warnings)
    report = _save_monitoring_report(db, order_id, analysis, warnings)
    db.commit()
    db.refresh(report)
    return {
        **analysis,
        "reportId": report.id,
        "alerts": [project_monitoring_alert_payload(alert) for alert in alerts],
    }


@router.get("/orders/{order_id}/tracking/monitoring-history")
def list_order_monitoring_history(order_id: str, db: Session = Depends(get_db)) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    reports = db.scalars(
        select(ProjectMonitoringReport)
        .where(ProjectMonitoringReport.order_id == order_id)
        .order_by(ProjectMonitoringReport.created_at.desc())
    ).all()
    return {"items": [project_monitoring_report_payload(report) for report in reports]}


@router.get("/orders/{order_id}/tracking/alerts")
def list_order_monitoring_alerts(
    order_id: str,
    status: str | None = Query(default=None),
    syncCurrent: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    if syncCurrent:
        tracking = _tracking_response(db, order_id)
        _sync_monitoring_alerts(db, order_id, list((tracking.get("dashboard") or {}).get("warnings") or []))
        db.commit()
    stmt = (
        select(ProjectMonitoringAlert)
        .options(joinedload(ProjectMonitoringAlert.site))
        .where(ProjectMonitoringAlert.order_id == order_id)
        .order_by(ProjectMonitoringAlert.created_at.desc())
    )
    if status:
        stmt = stmt.where(ProjectMonitoringAlert.status == status)
    alerts = db.scalars(stmt).all()
    return {"items": [project_monitoring_alert_payload(alert) for alert in alerts]}


@router.patch("/orders/{order_id}/tracking/alerts/{alert_id}")
def update_order_monitoring_alert(
    order_id: str,
    alert_id: str,
    payload: ProjectMonitoringAlertUpdatePayload,
    db: Session = Depends(get_db),
) -> dict:
    alert = db.get(ProjectMonitoringAlert, alert_id)
    if not alert or alert.order_id != order_id:
        raise not_found()
    alert.status = payload.status
    alert.resolution_note = _normalize_optional_text(payload.resolutionNote)
    alert.resolved_at = datetime.now(timezone.utc) if payload.status in {"resolved", "dismissed"} else None
    db.commit()
    db.refresh(alert)
    return project_monitoring_alert_payload(alert)


@router.post("/orders/{order_id}/progress-updates", status_code=201)
async def create_progress_update(
    order_id: str,
    siteId: str | None = Form(default=None),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    status: str = Form(default="in_progress"),
    progressPercent: int | None = Form(default=None),
    nextAction: str | None = Form(default=None),
    updateDate: str | None = Form(default=None),
    photoTag: str | None = Form(default=None),
    photoCaption: str | None = Form(default=None),
    photos: list[UploadFile] | None = File(default=None),
    db: Session = Depends(get_db),
) -> dict:
    order = db.get(Order, order_id)
    if not order:
        raise not_found()
    site_id = _normalize_optional_text(siteId)
    _ensure_site_belongs_to_order(db, order_id, site_id)

    upload_files = [file for file in (photos or []) if file and file.filename]
    ensure(len(upload_files) <= MAX_PROGRESS_PHOTOS_PER_UPDATE, "Zu viele Fotos fuer ein Update.")
    clean_title = _normalize_optional_text(title)
    clean_description = _normalize_optional_text(description)
    ensure(bool(clean_title or clean_description or upload_files), "Bitte Text oder Fotos fuer das Update angeben.")

    update = ProjectProgressUpdate(
        order_id=order_id,
        site_id=site_id,
        title=clean_title or "Progress update",
        description=clean_description,
        status=_normalize_optional_text(status) or "in_progress",
        progress_percent=_progress_percent(progressPercent),
        next_action=_normalize_optional_text(nextAction),
        update_date=as_datetime(updateDate) or datetime.now(timezone.utc),
    )
    db.add(update)
    saved_paths: list[Path] = []

    try:
        db.flush()
        target_dir = UPLOAD_ROOT / order_id / update.id
        target_dir.mkdir(parents=True, exist_ok=True)
        for file in upload_files:
            content_type, suffix = _progress_photo_type_and_suffix(file)
            data = await file.read()
            ensure(0 < len(data) <= MAX_PROGRESS_PHOTO_BYTES, "Foto ist leer oder groesser als 8 MB.")
            stored_filename = f"{uuid4()}{suffix}"
            storage_path = target_dir / stored_filename
            storage_path.write_bytes(data)
            saved_paths.append(storage_path)
            db.add(
                ProjectProgressPhoto(
                    update_id=update.id,
                    original_filename=Path(file.filename or stored_filename).name,
                    stored_filename=stored_filename,
                    content_type=content_type,
                    size_bytes=len(data),
                    storage_path=str(storage_path),
                    tag=_normalize_optional_text(photoTag),
                    caption=_normalize_optional_text(photoCaption),
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        for path in saved_paths:
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                pass
        raise

    return _tracking_response(db, order_id)


@router.patch("/orders/{order_id}/progress-updates/{update_id}")
def update_progress_update(
    order_id: str, update_id: str, payload: ProjectProgressUpdatePayload, db: Session = Depends(get_db)
) -> dict:
    update = db.get(ProjectProgressUpdate, update_id)
    if not update or update.order_id != order_id:
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)

    update.site_id = _normalize_optional_text(payload.siteId)
    if payload.title is not None:
        update.title = _normalize_optional_text(payload.title) or "Progress update"
    if payload.description is not None:
        update.description = _normalize_optional_text(payload.description)
    if payload.status is not None:
        update.status = _normalize_optional_text(payload.status) or "in_progress"
    if payload.progressPercent is not None:
        update.progress_percent = _progress_percent(payload.progressPercent)
    if payload.nextAction is not None:
        update.next_action = _normalize_optional_text(payload.nextAction)
    if payload.updateDate is not None:
        update.update_date = as_datetime(payload.updateDate) or update.update_date
    db.commit()
    return _tracking_response(db, order_id)


@router.delete("/orders/{order_id}/progress-updates/{update_id}")
def delete_progress_update(order_id: str, update_id: str, db: Session = Depends(get_db)) -> dict:
    update = db.execute(
        select(ProjectProgressUpdate)
        .options(selectinload(ProjectProgressUpdate.photos))
        .where(ProjectProgressUpdate.id == update_id, ProjectProgressUpdate.order_id == order_id)
    ).scalar_one_or_none()
    if not update:
        raise not_found()
    for photo in update.photos:
        _delete_local_photo_file(photo)
    db.delete(update)
    db.commit()
    return _tracking_response(db, order_id)


@router.get("/progress-photos/{photo_id}")
def get_progress_photo(photo_id: str, db: Session = Depends(get_db)) -> FileResponse:
    photo = db.get(ProjectProgressPhoto, photo_id)
    if not photo:
        raise not_found()
    path = Path(photo.storage_path)
    if not path.exists():
        raise not_found()
    return FileResponse(path, media_type=photo.content_type, filename=photo.original_filename or photo.stored_filename)


@router.post("/orders/{order_id}/tasks", status_code=201)
def create_project_task(order_id: str, payload: ProjectTaskPayload, db: Session = Depends(get_db)) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)
    ensure(bool(payload.taskName.strip()), "Aufgabe fehlt.")
    item = ProjectTask(
        order_id=order_id,
        site_id=_normalize_optional_text(payload.siteId),
        task_name=payload.taskName.strip(),
        status=payload.status or "not_started",
        weight_percent=_task_weight_percent(payload.weightPercent),
        progress_percent=_progress_percent(payload.progressPercent),
        responsible_type=payload.responsibleType or "not_assigned",
        responsible_name=_normalize_optional_text(payload.responsibleName),
        due_date=as_datetime(payload.dueDate),
        notes=_normalize_optional_text(payload.notes),
    )
    db.add(item)
    db.commit()
    return _tracking_response(db, order_id)


@router.patch("/orders/{order_id}/tasks/{task_id}")
def update_project_task(order_id: str, task_id: str, payload: ProjectTaskPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(ProjectTask, task_id)
    if not item or item.order_id != order_id:
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)
    ensure(bool(payload.taskName.strip()), "Aufgabe fehlt.")
    item.site_id = _normalize_optional_text(payload.siteId)
    item.task_name = payload.taskName.strip()
    item.status = payload.status or "not_started"
    item.weight_percent = _task_weight_percent(payload.weightPercent)
    item.progress_percent = _progress_percent(payload.progressPercent)
    item.responsible_type = payload.responsibleType or "not_assigned"
    item.responsible_name = _normalize_optional_text(payload.responsibleName)
    item.due_date = as_datetime(payload.dueDate)
    item.notes = _normalize_optional_text(payload.notes)
    db.commit()
    return _tracking_response(db, order_id)


@router.delete("/orders/{order_id}/tasks/{task_id}")
def delete_project_task(order_id: str, task_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(ProjectTask, task_id)
    if not item or item.order_id != order_id:
        raise not_found()
    db.delete(item)
    db.commit()
    return _tracking_response(db, order_id)


@router.post("/orders/{order_id}/issues", status_code=201)
def create_project_issue(order_id: str, payload: ProjectIssuePayload, db: Session = Depends(get_db)) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)
    ensure(bool(payload.title.strip()), "Problem-Titel fehlt.")
    item = ProjectIssue(
        order_id=order_id,
        site_id=_normalize_optional_text(payload.siteId),
        title=payload.title.strip(),
        description=_normalize_optional_text(payload.description),
        severity=payload.severity or "medium",
        status=payload.status or "open",
        responsible_type=payload.responsibleType or "not_assigned",
        responsible_name=_normalize_optional_text(payload.responsibleName),
        resolution_note=_normalize_optional_text(payload.resolutionNote),
    )
    db.add(item)
    db.commit()
    return _tracking_response(db, order_id)


@router.patch("/orders/{order_id}/issues/{issue_id}")
def update_project_issue(
    order_id: str, issue_id: str, payload: ProjectIssuePayload, db: Session = Depends(get_db)
) -> dict:
    item = db.get(ProjectIssue, issue_id)
    if not item or item.order_id != order_id:
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)
    ensure(bool(payload.title.strip()), "Problem-Titel fehlt.")
    item.site_id = _normalize_optional_text(payload.siteId)
    item.title = payload.title.strip()
    item.description = _normalize_optional_text(payload.description)
    item.severity = payload.severity or "medium"
    item.status = payload.status or "open"
    item.responsible_type = payload.responsibleType or "not_assigned"
    item.responsible_name = _normalize_optional_text(payload.responsibleName)
    item.resolution_note = _normalize_optional_text(payload.resolutionNote)
    db.commit()
    return _tracking_response(db, order_id)


@router.delete("/orders/{order_id}/issues/{issue_id}")
def delete_project_issue(order_id: str, issue_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(ProjectIssue, issue_id)
    if not item or item.order_id != order_id:
        raise not_found()
    db.delete(item)
    db.commit()
    return _tracking_response(db, order_id)


@router.post("/orders/{order_id}/materials", status_code=201)
def create_project_material(order_id: str, payload: ProjectMaterialLogPayload, db: Session = Depends(get_db)) -> dict:
    if not db.get(Order, order_id):
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)
    ensure(bool(payload.materialName.strip()), "Materialname fehlt.")
    item = ProjectMaterialLog(
        order_id=order_id,
        site_id=_normalize_optional_text(payload.siteId),
        material_name=payload.materialName.strip(),
        quantity=_normalize_optional_text(payload.quantity),
        status=payload.status or "needed",
        notes=_normalize_optional_text(payload.notes),
    )
    db.add(item)
    db.commit()
    return _tracking_response(db, order_id)


@router.patch("/orders/{order_id}/materials/{material_id}")
def update_project_material(
    order_id: str, material_id: str, payload: ProjectMaterialLogPayload, db: Session = Depends(get_db)
) -> dict:
    item = db.get(ProjectMaterialLog, material_id)
    if not item or item.order_id != order_id:
        raise not_found()
    _ensure_site_belongs_to_order(db, order_id, payload.siteId)
    ensure(bool(payload.materialName.strip()), "Materialname fehlt.")
    item.site_id = _normalize_optional_text(payload.siteId)
    item.material_name = payload.materialName.strip()
    item.quantity = _normalize_optional_text(payload.quantity)
    item.status = payload.status or "needed"
    item.notes = _normalize_optional_text(payload.notes)
    db.commit()
    return _tracking_response(db, order_id)


@router.delete("/orders/{order_id}/materials/{material_id}")
def delete_project_material(order_id: str, material_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(ProjectMaterialLog, material_id)
    if not item or item.order_id != order_id:
        raise not_found()
    db.delete(item)
    db.commit()
    return _tracking_response(db, order_id)



@router.delete("/sites/{site_id}")
def delete_site(site_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(Site, site_id)
    if not item:
        raise not_found()
    try:
        db.delete(item)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Baustelle", "Bitte zuerst Arbeitszeiten/Zuordnungen loeschen.")


@router.get("/assignments")
def list_assignments(siteId: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(EmployeeAssignment)
        .options(joinedload(EmployeeAssignment.employee), joinedload(EmployeeAssignment.site))
        .order_by(EmployeeAssignment.created_at.desc())
    )
    if siteId:
        stmt = stmt.where(EmployeeAssignment.site_id == siteId)
    items = db.scalars(stmt).all()
    return [assignment_payload(item, include_employee=True, include_site=True) for item in items]


@router.post("/assignments", status_code=201)
def create_assignment(payload: AssignmentPayload, db: Session = Depends(get_db)) -> dict:
    item = EmployeeAssignment(
        employee_id=payload.employeeId,
        site_id=payload.siteId,
        start_date=as_datetime(payload.startDate),
        end_date=as_datetime(payload.endDate),
        notes=payload.notes,
    )
    try:
        db.add(item)
        db.commit()
        db.refresh(item)
        item = db.execute(
            select(EmployeeAssignment)
            .options(joinedload(EmployeeAssignment.employee), joinedload(EmployeeAssignment.site))
            .where(EmployeeAssignment.id == item.id)
        ).scalar_one()
        return assignment_payload(item, include_employee=True, include_site=True)
    except IntegrityError as exc:
        db.rollback()
        raise_unique_error(exc, "Diese Zuordnung existiert bereits.")


@router.put("/assignments/{assignment_id}")
def update_assignment(assignment_id: str, payload: AssignmentUpdatePayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(EmployeeAssignment, assignment_id)
    if not item:
        raise not_found()
    item.start_date = as_datetime(payload.startDate)
    item.end_date = as_datetime(payload.endDate)
    item.notes = payload.notes
    db.commit()
    db.refresh(item)
    return assignment_payload(item)


@router.delete("/assignments/{assignment_id}")
def delete_assignment(assignment_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(EmployeeAssignment, assignment_id)
    if not item:
        raise not_found()
    try:
        db.delete(item)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Zuordnung")


@router.get("/work-entries")
def list_work_entries(db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(WorkEntry)
        .options(
            joinedload(WorkEntry.employee),
            joinedload(WorkEntry.order).joinedload(Order.customer),
            joinedload(WorkEntry.site),
            selectinload(WorkEntry.invoice_lines).joinedload(InvoiceLine.invoice),
        )
        .order_by(WorkEntry.work_date.desc())
    )
    items = db.execute(stmt).unique().scalars().all()
    return [work_entry_payload(item) for item in items]


@router.get("/work-entries/{work_entry_id}")
def get_work_entry(work_entry_id: str, db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(WorkEntry)
        .options(
            joinedload(WorkEntry.employee),
            joinedload(WorkEntry.order).joinedload(Order.customer),
            joinedload(WorkEntry.site),
            selectinload(WorkEntry.invoice_lines).joinedload(InvoiceLine.invoice),
        )
        .where(WorkEntry.id == work_entry_id)
    )
    item = db.execute(stmt).unique().scalar_one_or_none()
    if not item:
        raise not_found()
    return work_entry_payload(item)


@router.post("/work-entries", status_code=201)
def create_work_entry(payload: WorkEntryPayload, db: Session = Depends(get_db)) -> dict:
    work_date = as_date_only(payload.workDate)
    site = db.get(Site, payload.siteId)
    order = db.get(Order, payload.orderId)
    ensure(site is not None and order is not None, "Ungueltige Auswahl (Auftrag/Baustelle).")
    ensure(site.order_id == payload.orderId, "Die Baustelle gehoert nicht zum Auftrag.")

    day_type = normalize_day_type(payload.dayType, payload.isSick)
    is_absence = day_type != "work"
    hours_num = 0 if is_absence else float(payload.hours or 0)
    ensure(is_absence or hours_num > 0, "Stunden muessen > 0 sein.")

    is_sick = day_type == "sick"
    rate = Decimal("0") if is_absence else _compute_rate(db, payload.employeeId, payload.orderId)

    try:
        item = WorkEntry(
            work_date=work_date,
            employee_id=payload.employeeId,
            order_id=payload.orderId,
            site_id=payload.siteId,
            hours=Decimal(str(hours_num)),
            day_type=day_type,
            is_sick=is_sick,
            description=payload.description,
        )
        db.add(item)
        db.flush()

        invoice = None
        if not is_absence:
            invoice = _create_draft_invoice(db, order.customer_id)
            db.add(
                InvoiceLine(
                    invoice_id=invoice.id,
                    work_entry_id=item.id,
                    service_date=work_date,
                    description=payload.description,
                    hours_allocated=Decimal(str(hours_num)),
                    unit_rate=rate if rate > 0 else None,
                    line_amount=(rate * Decimal(str(hours_num))) if rate > 0 else None,
                )
            )

        db.commit()
        item = db.execute(
            select(WorkEntry)
            .options(
                joinedload(WorkEntry.employee),
                joinedload(WorkEntry.order).joinedload(Order.customer),
                joinedload(WorkEntry.site),
                selectinload(WorkEntry.invoice_lines).joinedload(InvoiceLine.invoice),
            )
            .where(WorkEntry.id == item.id)
        ).unique().scalar_one()
        return {"workEntry": work_entry_payload(item), "invoice": invoice_payload(invoice) if invoice else None}
    except Exception:
        db.rollback()
        raise


@router.put("/work-entries/{work_entry_id}")
def update_work_entry(work_entry_id: str, payload: WorkEntryPayload, db: Session = Depends(get_db)) -> dict:
    check = _can_modify_work_entry(db, work_entry_id)
    if not check["ok"]:
        raise german_error(check["reason"], 409)

    item = db.get(WorkEntry, work_entry_id)
    if not item:
        raise not_found()

    work_date = as_date_only(payload.workDate)
    site = db.get(Site, payload.siteId)
    order = db.get(Order, payload.orderId)
    ensure(site is not None and order is not None, "Ungueltige Auswahl (Auftrag/Baustelle).")
    ensure(site.order_id == payload.orderId, "Die Baustelle gehoert nicht zum Auftrag.")

    day_type = normalize_day_type(payload.dayType, payload.isSick)
    is_absence = day_type != "work"
    hours_num = 0 if is_absence else float(payload.hours or 0)
    ensure(is_absence or hours_num > 0, "Stunden muessen > 0 sein.")

    rate = Decimal("0") if is_absence else _compute_rate(db, payload.employeeId, payload.orderId)
    item.work_date = work_date
    item.employee_id = payload.employeeId
    item.order_id = payload.orderId
    item.site_id = payload.siteId
    item.hours = Decimal(str(hours_num))
    item.day_type = day_type
    item.is_sick = day_type == "sick"
    item.description = payload.description

    try:
        invoice_line_id = check.get("invoiceLineId")
        invoice_id = check.get("invoiceId")

        if invoice_line_id and invoice_id:
            line = db.get(InvoiceLine, invoice_line_id)
            if is_absence:
                if line:
                    db.delete(line)
                remaining = db.scalar(select(func.count()).select_from(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id)) or 0
                if remaining == 0:
                    draft_invoice = db.get(Invoice, invoice_id)
                    if draft_invoice:
                        db.delete(draft_invoice)
            else:
                if line:
                    line.service_date = work_date
                    line.description = payload.description
                    line.hours_allocated = Decimal(str(hours_num))
                    line.unit_rate = rate if rate > 0 else None
                    line.line_amount = (rate * Decimal(str(hours_num))) if rate > 0 else None
                draft_invoice = db.get(Invoice, invoice_id)
                if draft_invoice:
                    draft_invoice.customer_id = order.customer_id
        elif not is_absence:
            draft_invoice = _create_draft_invoice(db, order.customer_id)
            db.add(
                InvoiceLine(
                    invoice_id=draft_invoice.id,
                    work_entry_id=item.id,
                    service_date=work_date,
                    description=payload.description,
                    hours_allocated=Decimal(str(hours_num)),
                    unit_rate=rate if rate > 0 else None,
                    line_amount=(rate * Decimal(str(hours_num))) if rate > 0 else None,
                )
            )

        db.commit()
        item = db.execute(
            select(WorkEntry)
            .options(
                joinedload(WorkEntry.employee),
                joinedload(WorkEntry.order).joinedload(Order.customer),
                joinedload(WorkEntry.site),
                selectinload(WorkEntry.invoice_lines).joinedload(InvoiceLine.invoice),
            )
            .where(WorkEntry.id == item.id)
        ).unique().scalar_one()
        return work_entry_payload(item)
    except Exception:
        db.rollback()
        raise


@router.delete("/work-entries/{work_entry_id}")
def delete_work_entry(work_entry_id: str, db: Session = Depends(get_db)) -> dict:
    check = _can_modify_work_entry(db, work_entry_id)
    if not check["ok"]:
        raise german_error(check["reason"], 409)

    item = db.get(WorkEntry, work_entry_id)
    if not item:
        raise not_found()

    try:
        invoice_line_id = check.get("invoiceLineId")
        if invoice_line_id:
            line = db.get(InvoiceLine, invoice_line_id)
            if line:
                invoice_id = line.invoice_id
                db.delete(line)
                db.flush()
                remaining = db.scalar(select(func.count()).select_from(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id)) or 0
                if remaining == 0:
                    draft_invoice = db.get(Invoice, invoice_id)
                    if draft_invoice:
                        db.delete(draft_invoice)

        db.delete(item)
        db.commit()
        return {"ok": True}
    except IntegrityError as exc:
        db.rollback()
        raise_delete_error(exc, "Arbeitszeit")


@router.get("/reports/hours")
def report_hours(
    groupBy: str = Query(default="employee"),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
) -> dict:
    ensure(groupBy in {"employee", "site", "order"}, "Ungueltiges groupBy.")

    from_dt = parse_ymd_to_utc_start(from_date)
    to_start = parse_ymd_to_utc_start(to_date)
    to_dt = end_of_utc_day(to_start) if to_start else None

    stmt = (
        select(WorkEntry)
        .options(joinedload(WorkEntry.employee), joinedload(WorkEntry.site), joinedload(WorkEntry.order))
        .order_by(WorkEntry.work_date.desc())
    )
    if from_dt:
        stmt = stmt.where(WorkEntry.work_date >= from_dt)
    if to_dt:
        stmt = stmt.where(WorkEntry.work_date <= to_dt)

    rows = {}
    for entry in db.scalars(stmt).all():
        if groupBy == "employee":
            key_id = entry.employee_id
            key_name = f"{entry.employee.first_name} {entry.employee.last_name}"
        elif groupBy == "site":
            key_id = entry.site_id
            key_name = entry.site.site_name
        else:
            key_id = entry.order_id
            key_name = entry.order.title

        row = rows.setdefault(key_id, {"keyId": key_id, "keyName": key_name, "totalHours": 0.0})
        row["totalHours"] += float(entry.hours)

    return {"groupBy": groupBy, "rows": sorted(rows.values(), key=lambda item: item["totalHours"], reverse=True)}


@router.get("/settings/invoice-sequence")
def get_invoice_sequence(year: int | None = Query(default=None), db: Session = Depends(get_db)) -> dict:
    value = parse_year(year)
    state = get_invoice_sequence_state(db, value)
    state["effectiveInvoiceNumber"] = f"RE {str(value % 100).zfill(2)}-{str(int(state['effectiveNextSeq'])).zfill(4)}"
    return state


@router.put("/settings/invoice-sequence")
def update_invoice_sequence(payload: InvoiceSequenceUpdatePayload, db: Session = Depends(get_db)) -> dict:
    year = parse_year(payload.year)
    raw = parse_seq(payload.nextSeq)
    state_before = get_invoice_sequence_state(db, year)
    min_allowed = int(state_before["dbNextSeq"])
    desired = min_allowed if raw is None or raw < min_allowed else min(raw, 9999)

    row = db.get(InvoiceSequence, year)
    if row:
        row.next_seq = desired
    else:
        row = InvoiceSequence(year=year, next_seq=desired)
        db.add(row)
    db.commit()

    state_after = get_invoice_sequence_state(db, year)
    state_after["effectiveInvoiceNumber"] = f"RE {str(year % 100).zfill(2)}-{str(int(state_after['effectiveNextSeq'])).zfill(4)}"
    return state_after


@router.get("/timesheets")
def get_timesheet(employeeId: str, month: int, year: int, db: Session = Depends(get_db)) -> dict:
    return compute_timesheet_data(db, employeeId, year, month)


@router.get("/timesheets/pdf")
def timesheet_pdf(employeeId: str, month: int, year: int, db: Session = Depends(get_db)) -> Response:
    data = compute_timesheet_data(db, employeeId, year, month)
    payload = build_timesheet_pdf(data)
    filename = f"stundenzettel-{data['employee']['lastName']}-{year}-{str(month).zfill(2)}.pdf"
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@router.get("/timesheets/word")
def timesheet_word(employeeId: str, month: int, year: int, db: Session = Depends(get_db)) -> Response:
    data = compute_timesheet_data(db, employeeId, year, month)
    payload = build_timesheet_docx(data)
    filename = f"stundenzettel-{data['employee']['lastName']}-{year}-{str(month).zfill(2)}.docx"
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/payments")
def list_payments(
    customer_id: str | None = Query(default=None, alias="customerId"),
    order_id: str | None = Query(default=None, alias="orderId"),
    invoice_id: str | None = Query(default=None, alias="invoiceId"),
    proposal_id: str | None = Query(default=None, alias="proposalId"),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(PaymentRecord).order_by(PaymentRecord.created_at.desc())
    if customer_id:
        stmt = stmt.where(PaymentRecord.customer_id == customer_id)
    if order_id:
        stmt = stmt.where(PaymentRecord.order_id == order_id)
    if invoice_id:
        stmt = stmt.where(PaymentRecord.invoice_id == invoice_id)
    if proposal_id:
        stmt = stmt.where(PaymentRecord.proposal_id == proposal_id)
    return [payment_record_payload(item) for item in db.scalars(stmt).all()]


@router.post("/payments", status_code=201)
def create_payment(payload: PaymentRecordPayload, db: Session = Depends(get_db)) -> dict:
    item = PaymentRecord()
    _apply_payment_payload(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return payment_record_payload(item)


@router.put("/payments/{payment_id}")
def update_payment(payment_id: str, payload: PaymentRecordPayload, db: Session = Depends(get_db)) -> dict:
    item = db.get(PaymentRecord, payment_id)
    if not item:
        raise not_found()
    _apply_payment_payload(item, payload)
    db.commit()
    db.refresh(item)
    return payment_record_payload(item)


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(PaymentRecord, payment_id)
    if not item:
        raise not_found()
    db.delete(item)
    db.commit()
    return {"ok": True}

