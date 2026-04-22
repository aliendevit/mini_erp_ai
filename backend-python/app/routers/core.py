from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response
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
    Site,
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
    SitePayload,
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
    parse_ymd_to_utc_start,
    raise_delete_error,
    raise_unique_error,
    site_payload,
    work_entry_payload,
    json_dumps,
)

router = APIRouter()



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
        .options(joinedload(Site.order).joinedload(Order.customer), selectinload(Site.assignments).joinedload(EmployeeAssignment.employee))
        .order_by(Site.created_at.desc())
    )
    items = db.execute(stmt).unique().scalars().all()
    return [site_payload(item, include_order=True, include_assignments=True) for item in items]


@router.get("/sites/{site_id}")
def get_site(site_id: str, db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(Site)
        .options(joinedload(Site.order).joinedload(Order.customer), selectinload(Site.assignments).joinedload(EmployeeAssignment.employee))
        .where(Site.id == site_id)
    )
    item = db.execute(stmt).unique().scalar_one_or_none()
    if not item:
        raise not_found()
    return site_payload(item, include_order=True, include_assignments=True)


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

