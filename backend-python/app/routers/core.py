from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
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
    ProjectProgressPhoto,
    ProjectProgressUpdate,
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
    ProjectProgressUpdatePayload,
    ProjectTaskPayload,
    SitePayload,
    WorkshopPayload,
    WorkshopSiteAssignmentPayload,
    WorkEntryPayload,
)
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


def _warning_payload(kind: str, severity: str, message: str, site: Site | None = None) -> dict:
    return {
        "type": kind,
        "severity": severity,
        "message": message,
        "siteId": site.id if site else None,
        "siteName": site.site_name if site else None,
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

    site_cards = []
    for site in order.sites:
        site_updates = [item for item in updates if item.site_id == site.id]
        site_tasks = [item for item in tasks if item.site_id == site.id]
        site_issues = [item for item in issues if item.site_id == site.id and item.status in open_issue_statuses]
        latest_site_update = site_updates[0] if site_updates else None
        site_completed = [item for item in site_tasks if item.status in completed_task_statuses]
        if latest_site_update and latest_site_update.progress_percent is not None:
            progress_percent = latest_site_update.progress_percent
        elif site_tasks:
            progress_percent = round((len(site_completed) / len(site_tasks)) * 100)
        else:
            progress_percent = 0

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
        latest_blocked = bool(latest_site_update and latest_site_update.status == "blocked")
        if latest_blocked:
            schedule_warnings.append(_warning_payload("blocked_site", "high", f"Site {site.site_name} is currently blocked.", site))
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
                "currentStatus": latest_site_update.status if latest_site_update else "not_started",
                "progressPercent": progress_percent,
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

    all_photos = [progress_photo_payload(photo) for update in updates for photo in update.photos]
    total_tasks = len(tasks)
    dashboard_progress = round((len(completed_tasks) / total_tasks) * 100) if total_tasks else 0
    next_actions = [
        update.next_action for update in updates if update.next_action and update.status not in {"completed", "done"}
    ][:5]

    return {
        "order": order_payload(order, include_customer=True, include_sites=True),
        "dashboard": {
            "overallStatus": "blocked" if open_issues else (latest_update.status if latest_update else order.status),
            "overallProgressPercent": dashboard_progress,
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

