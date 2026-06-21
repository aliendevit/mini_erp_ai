from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class InvoiceStatus(str, Enum):
    draft = "draft"
    final = "final"
    sent = "sent"
    paid = "paid"
    canceled = "canceled"


class WorkDayType(str, Enum):
    work = "work"
    sick = "sick"
    vacation = "vacation"
    holiday = "holiday"


class ProposalStatus(str, Enum):
    intake = "intake"
    draft = "draft"
    reviewed = "reviewed"
    converted = "converted"
    rejected = "rejected"


class EmployeeSkillKind(str, Enum):
    skill = "skill"
    certification = "certification"


class UserAccount(Base):
    __tablename__ = "UserAccount"
    __table_args__ = (
        UniqueConstraint("email", name="UserAccount_email_key"),
        Index("UserAccount_email_idx", "email"),
        Index("UserAccount_sessionTokenHash_idx", "sessionTokenHash"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column("passwordHash", String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String)
    session_token_hash: Mapped[str | None] = mapped_column("sessionTokenHash", String)
    session_created_at: Mapped[datetime | None] = mapped_column("sessionCreatedAt", DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column("lastLoginAt", DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    company_profile: Mapped["CompanyProfile | None"] = relationship(
        back_populates="owner", uselist=False, cascade="all, delete-orphan"
    )


class CompanyProfile(Base):
    __tablename__ = "CompanyProfile"
    __table_args__ = (
        UniqueConstraint("ownerUserId", name="CompanyProfile_ownerUserId_key"),
        Index("CompanyProfile_ownerUserId_idx", "ownerUserId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_user_id: Mapped[str] = mapped_column("ownerUserId", String(36), ForeignKey("UserAccount.id"), nullable=False)
    company_name: Mapped[str] = mapped_column("companyName", String, nullable=False)
    legal_name: Mapped[str | None] = mapped_column("legalName", String)
    street: Mapped[str | None] = mapped_column(String)
    zip_code: Mapped[str | None] = mapped_column("zipCode", String)
    city: Mapped[str | None] = mapped_column(String)
    country: Mapped[str] = mapped_column(String, nullable=False, default="DE", server_default="DE")
    vat_id: Mapped[str | None] = mapped_column("vatId", String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    website: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[UserAccount] = relationship(back_populates="company_profile")


class AuditLog(Base):
    __tablename__ = "AuditLog"
    __table_args__ = (
        Index("AuditLog_action_idx", "action"),
        Index("AuditLog_entity_idx", "entityType", "entityId"),
        Index("AuditLog_actorUserId_idx", "actorUserId"),
        Index("AuditLog_createdAt_idx", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    action: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column("entityType", String, nullable=False)
    entity_id: Mapped[str | None] = mapped_column("entityId", String)
    actor_user_id: Mapped[str | None] = mapped_column("actorUserId", String(36))
    summary: Mapped[str | None] = mapped_column(Text)
    details_json: Mapped[str | None] = mapped_column("detailsJson", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())


class Customer(Base):
    __tablename__ = "Customer"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_name: Mapped[str] = mapped_column("companyName", String, nullable=False)
    street: Mapped[str | None] = mapped_column(String)
    zip_code: Mapped[str | None] = mapped_column("zipCode", String)
    city: Mapped[str | None] = mapped_column(String)
    country: Mapped[str] = mapped_column(String, nullable=False, default="DE", server_default="DE")
    vat_id: Mapped[str | None] = mapped_column("vatId", String)
    contact_name: Mapped[str | None] = mapped_column("contactName", String)
    contact_phone: Mapped[str | None] = mapped_column("contactPhone", String)
    contact_email: Mapped[str | None] = mapped_column("contactEmail", String)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    orders: Mapped[list["Order"]] = relationship(back_populates="customer")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="customer")
    workshops: Mapped[list["CustomerWorkshop"]] = relationship(back_populates="customer")


class CustomerWorkshop(Base):
    __tablename__ = "CustomerWorkshop"
    __table_args__ = (Index("CustomerWorkshop_customerId_idx", "customerId"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    customer_id: Mapped[str] = mapped_column("customerId", String(36), ForeignKey("Customer.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    contact_name: Mapped[str | None] = mapped_column("contactName", String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    specialties_json: Mapped[str | None] = mapped_column("specialtiesJson", Text)
    notes: Mapped[str | None] = mapped_column(Text)
    relationship_status: Mapped[str] = mapped_column(
        "relationshipStatus", String, nullable=False, default="known", server_default="known"
    )
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped[Customer] = relationship(back_populates="workshops")


class Workshop(Base):
    __tablename__ = "Workshop"
    __table_args__ = (Index("Workshop_name_idx", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    contact_name: Mapped[str | None] = mapped_column("contactName", String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    specialties_json: Mapped[str | None] = mapped_column("specialtiesJson", Text)
    notes: Mapped[str | None] = mapped_column(Text)
    availability_status: Mapped[str] = mapped_column(
        "availabilityStatus", String, nullable=False, default="available", server_default="available"
    )
    availability_note: Mapped[str | None] = mapped_column("availabilityNote", Text)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    assignments: Mapped[list["WorkshopSiteAssignment"]] = relationship(back_populates="workshop")


class WorkshopSiteAssignment(Base):
    __tablename__ = "WorkshopSiteAssignment"
    __table_args__ = (
        Index("WorkshopSiteAssignment_orderId_idx", "orderId"),
        Index("WorkshopSiteAssignment_siteId_idx", "siteId"),
        Index("WorkshopSiteAssignment_workshopId_idx", "workshopId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str] = mapped_column("siteId", String(36), ForeignKey("Site.id"), nullable=False)
    workshop_id: Mapped[str] = mapped_column("workshopId", String(36), ForeignKey("Workshop.id"), nullable=False)
    covered_skills_json: Mapped[str | None] = mapped_column("coveredSkillsJson", Text)
    start_date: Mapped[datetime | None] = mapped_column("startDate", DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column("endDate", DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, nullable=False, default="assigned", server_default="assigned")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped["Order"] = relationship(back_populates="workshop_assignments")
    site: Mapped["Site"] = relationship(back_populates="workshop_assignments")
    workshop: Mapped[Workshop] = relationship(back_populates="assignments")


class Order(Base):
    __tablename__ = "Order"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    customer_id: Mapped[str] = mapped_column("customerId", String(36), ForeignKey("Customer.id"), nullable=False)
    order_number: Mapped[str | None] = mapped_column("orderNumber", String, unique=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open", server_default="open")
    start_date: Mapped[datetime | None] = mapped_column("startDate", DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column("endDate", DateTime(timezone=True))
    default_hourly_rate: Mapped[Decimal | None] = mapped_column("defaultHourlyRate", Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String, nullable=False, default="EUR", server_default="EUR")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped[Customer] = relationship(back_populates="orders")
    sites: Mapped[list["Site"]] = relationship(back_populates="order")
    work_entries: Mapped[list["WorkEntry"]] = relationship(back_populates="order")
    progress_updates: Mapped[list["ProjectProgressUpdate"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    tracking_tasks: Mapped[list["ProjectTask"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    tracking_issues: Mapped[list["ProjectIssue"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    material_logs: Mapped[list["ProjectMaterialLog"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    workshop_assignments: Mapped[list["WorkshopSiteAssignment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    site_baselines: Mapped[list["ProjectSiteBaseline"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    monitoring_reports: Mapped[list["ProjectMonitoringReport"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    monitoring_alerts: Mapped[list["ProjectMonitoringAlert"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class Site(Base):
    __tablename__ = "Site"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_name: Mapped[str] = mapped_column("siteName", String, nullable=False)
    street: Mapped[str | None] = mapped_column(String)
    zip_code: Mapped[str | None] = mapped_column("zipCode", String)
    city: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="sites")
    assignments: Mapped[list["EmployeeAssignment"]] = relationship(back_populates="site")
    work_entries: Mapped[list["WorkEntry"]] = relationship(back_populates="site")
    progress_updates: Mapped[list["ProjectProgressUpdate"]] = relationship(back_populates="site")
    tracking_tasks: Mapped[list["ProjectTask"]] = relationship(back_populates="site")
    tracking_issues: Mapped[list["ProjectIssue"]] = relationship(back_populates="site")
    material_logs: Mapped[list["ProjectMaterialLog"]] = relationship(back_populates="site")
    workshop_assignments: Mapped[list["WorkshopSiteAssignment"]] = relationship(
        back_populates="site", cascade="all, delete-orphan"
    )
    baseline_plan: Mapped["ProjectSiteBaseline | None"] = relationship(
        back_populates="site", cascade="all, delete-orphan", uselist=False
    )
    monitoring_alerts: Mapped[list["ProjectMonitoringAlert"]] = relationship(back_populates="site")


class ProjectSiteBaseline(Base):
    __tablename__ = "ProjectSiteBaseline"
    __table_args__ = (
        UniqueConstraint("orderId", "siteId", name="ProjectSiteBaseline_orderId_siteId_key"),
        Index("ProjectSiteBaseline_orderId_idx", "orderId"),
        Index("ProjectSiteBaseline_siteId_idx", "siteId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str] = mapped_column("siteId", String(36), ForeignKey("Site.id"), nullable=False)
    planned_start_date: Mapped[datetime | None] = mapped_column("plannedStartDate", DateTime(timezone=True))
    planned_end_date: Mapped[datetime | None] = mapped_column("plannedEndDate", DateTime(timezone=True))
    baseline_status: Mapped[str] = mapped_column(
        "baselineStatus", String, nullable=False, default="draft", server_default="draft"
    )
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual", server_default="manual")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="site_baselines")
    site: Mapped[Site] = relationship(back_populates="baseline_plan")


class Employee(Base):
    __tablename__ = "Employee"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    first_name: Mapped[str] = mapped_column("firstName", String, nullable=False)
    last_name: Mapped[str] = mapped_column("lastName", String, nullable=False)
    birth_date: Mapped[datetime | None] = mapped_column("birthDate", DateTime(timezone=True))
    street: Mapped[str | None] = mapped_column(String)
    zip_code: Mapped[str | None] = mapped_column("zipCode", String)
    city: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    default_hourly_rate: Mapped[Decimal | None] = mapped_column("defaultHourlyRate", Numeric(10, 2))
    weekly_capacity_hours: Mapped[Decimal | None] = mapped_column("weeklyCapacityHours", Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    assignments: Mapped[list["EmployeeAssignment"]] = relationship(back_populates="employee")
    work_entries: Mapped[list["WorkEntry"]] = relationship(back_populates="employee")
    skill_records: Mapped[list["EmployeeSkill"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    availability_blocks: Mapped[list["EmployeeAvailabilityBlock"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )


class EmployeeSkill(Base):
    __tablename__ = "EmployeeSkill"
    __table_args__ = (
        UniqueConstraint("employeeId", "kind", "name", name="EmployeeSkill_employeeId_kind_name_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    employee_id: Mapped[str] = mapped_column("employeeId", String(36), ForeignKey("Employee.id"), nullable=False)
    kind: Mapped[EmployeeSkillKind] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped[Employee] = relationship(back_populates="skill_records")


class EmployeeAvailabilityBlock(Base):
    __tablename__ = "EmployeeAvailabilityBlock"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    employee_id: Mapped[str] = mapped_column("employeeId", String(36), ForeignKey("Employee.id"), nullable=False)
    start_date: Mapped[datetime] = mapped_column("startDate", DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column("endDate", DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped[Employee] = relationship(back_populates="availability_blocks")


class EmployeeAssignment(Base):
    __tablename__ = "EmployeeAssignment"
    __table_args__ = (UniqueConstraint("employeeId", "siteId", name="EmployeeAssignment_employeeId_siteId_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    employee_id: Mapped[str] = mapped_column("employeeId", String(36), ForeignKey("Employee.id"), nullable=False)
    site_id: Mapped[str] = mapped_column("siteId", String(36), ForeignKey("Site.id"), nullable=False)
    start_date: Mapped[datetime | None] = mapped_column("startDate", DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column("endDate", DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped[Employee] = relationship(back_populates="assignments")
    site: Mapped[Site] = relationship(back_populates="assignments")


class WorkEntry(Base):
    __tablename__ = "WorkEntry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    work_date: Mapped[datetime] = mapped_column("workDate", DateTime(timezone=True), nullable=False)
    employee_id: Mapped[str] = mapped_column("employeeId", String(36), ForeignKey("Employee.id"), nullable=False)
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str] = mapped_column("siteId", String(36), ForeignKey("Site.id"), nullable=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    day_type: Mapped[WorkDayType] = mapped_column("dayType", String, nullable=False, default=WorkDayType.work.value)
    is_sick: Mapped[bool] = mapped_column("isSick", Boolean, nullable=False, default=False, server_default="false")
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped[Employee] = relationship(back_populates="work_entries")
    order: Mapped[Order] = relationship(back_populates="work_entries")
    site: Mapped[Site] = relationship(back_populates="work_entries")
    invoice_lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="work_entry")



class ProjectProgressUpdate(Base):
    __tablename__ = "ProjectProgressUpdate"
    __table_args__ = (
        Index("ProjectProgressUpdate_orderId_idx", "orderId"),
        Index("ProjectProgressUpdate_siteId_idx", "siteId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, nullable=False, default="in_progress", server_default="in_progress")
    progress_percent: Mapped[int | None] = mapped_column("progressPercent", Integer)
    next_action: Mapped[str | None] = mapped_column("nextAction", Text)
    update_date: Mapped[datetime] = mapped_column("updateDate", DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="progress_updates")
    site: Mapped[Site | None] = relationship(back_populates="progress_updates")
    photos: Mapped[list["ProjectProgressPhoto"]] = relationship(
        back_populates="update", cascade="all, delete-orphan", order_by="ProjectProgressPhoto.created_at"
    )


class ProjectProgressPhoto(Base):
    __tablename__ = "ProjectProgressPhoto"
    __table_args__ = (Index("ProjectProgressPhoto_updateId_idx", "updateId"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    update_id: Mapped[str] = mapped_column(
        "updateId", String(36), ForeignKey("ProjectProgressUpdate.id"), nullable=False
    )
    original_filename: Mapped[str | None] = mapped_column("originalFilename", String)
    stored_filename: Mapped[str] = mapped_column("storedFilename", String, nullable=False)
    content_type: Mapped[str] = mapped_column("contentType", String, nullable=False)
    size_bytes: Mapped[int] = mapped_column("sizeBytes", Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column("storagePath", Text, nullable=False)
    tag: Mapped[str | None] = mapped_column(String)
    caption: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())

    update: Mapped[ProjectProgressUpdate] = relationship(back_populates="photos")


class ProjectTask(Base):
    __tablename__ = "ProjectTask"
    __table_args__ = (
        Index("ProjectTask_orderId_idx", "orderId"),
        Index("ProjectTask_siteId_idx", "siteId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    task_name: Mapped[str] = mapped_column("taskName", String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="not_started", server_default="not_started")
    weight_percent: Mapped[Decimal | None] = mapped_column("weightPercent", Numeric(6, 2))
    progress_percent: Mapped[int | None] = mapped_column("progressPercent", Integer)
    responsible_type: Mapped[str] = mapped_column(
        "responsibleType", String, nullable=False, default="not_assigned", server_default="not_assigned"
    )
    responsible_name: Mapped[str | None] = mapped_column("responsibleName", String)
    due_date: Mapped[datetime | None] = mapped_column("dueDate", DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="tracking_tasks")
    site: Mapped[Site | None] = relationship(back_populates="tracking_tasks")


class ProjectIssue(Base):
    __tablename__ = "ProjectIssue"
    __table_args__ = (
        Index("ProjectIssue_orderId_idx", "orderId"),
        Index("ProjectIssue_siteId_idx", "siteId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String, nullable=False, default="medium", server_default="medium")
    status: Mapped[str] = mapped_column(String, nullable=False, default="open", server_default="open")
    responsible_type: Mapped[str] = mapped_column(
        "responsibleType", String, nullable=False, default="not_assigned", server_default="not_assigned"
    )
    responsible_name: Mapped[str | None] = mapped_column("responsibleName", String)
    resolution_note: Mapped[str | None] = mapped_column("resolutionNote", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="tracking_issues")
    site: Mapped[Site | None] = relationship(back_populates="tracking_issues")


class ProjectMaterialLog(Base):
    __tablename__ = "ProjectMaterialLog"
    __table_args__ = (
        Index("ProjectMaterialLog_orderId_idx", "orderId"),
        Index("ProjectMaterialLog_siteId_idx", "siteId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    material_name: Mapped[str] = mapped_column("materialName", String, nullable=False)
    quantity: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default="needed", server_default="needed")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="material_logs")
    site: Mapped[Site | None] = relationship(back_populates="material_logs")


class ProjectMonitoringReport(Base):
    __tablename__ = "ProjectMonitoringReport"
    __table_args__ = (Index("ProjectMonitoringReport_orderId_idx", "orderId"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False, default="ai", server_default="ai")
    health_status: Mapped[str] = mapped_column("healthStatus", String, nullable=False, default="watch", server_default="watch")
    summary: Mapped[str | None] = mapped_column(Text)
    analysis_json: Mapped[str | None] = mapped_column("analysisJson", Text)
    warnings_json: Mapped[str | None] = mapped_column("warningsJson", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="monitoring_reports")


class ProjectMonitoringAlert(Base):
    __tablename__ = "ProjectMonitoringAlert"
    __table_args__ = (
        Index("ProjectMonitoringAlert_orderId_idx", "orderId"),
        Index("ProjectMonitoringAlert_siteId_idx", "siteId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column("orderId", String(36), ForeignKey("Order.id"), nullable=False)
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    alert_type: Mapped[str] = mapped_column("alertType", String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False, default="medium", server_default="medium")
    status: Mapped[str] = mapped_column(String, nullable=False, default="open", server_default="open")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_action: Mapped[str | None] = mapped_column("recommendedAction", Text)
    source: Mapped[str] = mapped_column(String, nullable=False, default="tracking_rule", server_default="tracking_rule")
    resolution_note: Mapped[str | None] = mapped_column("resolutionNote", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column("resolvedAt", DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="monitoring_alerts")
    site: Mapped[Site | None] = relationship(back_populates="monitoring_alerts")


class Invoice(Base):
    __tablename__ = "Invoice"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    invoice_number: Mapped[str | None] = mapped_column("invoiceNumber", String, unique=True)
    status: Mapped[InvoiceStatus] = mapped_column(String, nullable=False, default=InvoiceStatus.draft.value)
    customer_id: Mapped[str] = mapped_column("customerId", String(36), ForeignKey("Customer.id"), nullable=False)
    issue_date: Mapped[datetime | None] = mapped_column("issueDate", DateTime(timezone=True))
    period_start: Mapped[datetime | None] = mapped_column("periodStart", DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column("periodEnd", DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    pauschal_amount: Mapped[Decimal | None] = mapped_column("pauschalAmount", Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped[Customer] = relationship(back_populates="invoices")
    lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="invoice")


class PaymentRecord(Base):
    __tablename__ = "PaymentRecord"
    __table_args__ = (
        Index("PaymentRecord_proposalId_idx", "proposalId"),
        Index("PaymentRecord_customerId_idx", "customerId"),
        Index("PaymentRecord_orderId_idx", "orderId"),
        Index("PaymentRecord_invoiceId_idx", "invoiceId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    proposal_id: Mapped[str | None] = mapped_column("proposalId", String(36), ForeignKey("Proposal.id"))
    customer_id: Mapped[str | None] = mapped_column("customerId", String(36), ForeignKey("Customer.id"))
    order_id: Mapped[str | None] = mapped_column("orderId", String(36), ForeignKey("Order.id"))
    invoice_id: Mapped[str | None] = mapped_column("invoiceId", String(36), ForeignKey("Invoice.id"))
    payment_type: Mapped[str] = mapped_column("type", String, nullable=False, default="deposit", server_default="deposit")
    status: Mapped[str] = mapped_column(String, nullable=False, default="planned", server_default="planned")
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String, nullable=False, default="EUR", server_default="EUR")
    due_date: Mapped[datetime | None] = mapped_column("dueDate", DateTime(timezone=True))
    paid_date: Mapped[datetime | None] = mapped_column("paidDate", DateTime(timezone=True))
    method: Mapped[str | None] = mapped_column(String)
    reference: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InvoiceLine(Base):
    __tablename__ = "InvoiceLine"
    __table_args__ = (
        Index("InvoiceLine_invoiceId_idx", "invoiceId"),
        Index("InvoiceLine_workEntryId_idx", "workEntryId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    invoice_id: Mapped[str] = mapped_column("invoiceId", String(36), ForeignKey("Invoice.id"), nullable=False)
    work_entry_id: Mapped[str] = mapped_column("workEntryId", String(36), ForeignKey("WorkEntry.id"), nullable=False)
    service_date: Mapped[datetime] = mapped_column("serviceDate", DateTime(timezone=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    hours_allocated: Mapped[Decimal] = mapped_column("hoursAllocated", Numeric(10, 2), nullable=False)
    unit_rate: Mapped[Decimal | None] = mapped_column("unitRate", Numeric(10, 2))
    line_amount: Mapped[Decimal | None] = mapped_column("lineAmount", Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    work_entry: Mapped[WorkEntry] = relationship(back_populates="invoice_lines")


class InvoiceSequence(Base):
    __tablename__ = "InvoiceSequence"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_seq: Mapped[int] = mapped_column("nextSeq", Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Proposal(Base):
    __tablename__ = "Proposal"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    status: Mapped[ProposalStatus] = mapped_column(String, nullable=False, default=ProposalStatus.intake.value)
    customer_company_name: Mapped[str | None] = mapped_column("customerCompanyName", String)
    customer_street: Mapped[str | None] = mapped_column("customerStreet", String)
    customer_zip_code: Mapped[str | None] = mapped_column("customerZipCode", String)
    customer_city: Mapped[str | None] = mapped_column("customerCity", String)
    customer_country: Mapped[str | None] = mapped_column("customerCountry", String, default="DE")
    contact_name: Mapped[str | None] = mapped_column("contactName", String)
    contact_phone: Mapped[str | None] = mapped_column("contactPhone", String)
    contact_email: Mapped[str | None] = mapped_column("contactEmail", String)
    summary: Mapped[str | None] = mapped_column(Text)
    order_title: Mapped[str | None] = mapped_column("orderTitle", String)
    order_description: Mapped[str | None] = mapped_column("orderDescription", Text)
    proposed_sites_json: Mapped[str | None] = mapped_column("proposedSitesJson", Text)
    required_skills_json: Mapped[str | None] = mapped_column("requiredSkillsJson", Text)
    required_certifications_json: Mapped[str | None] = mapped_column("requiredCertificationsJson", Text)
    preferred_start_date: Mapped[datetime | None] = mapped_column("preferredStartDate", DateTime(timezone=True))
    preferred_end_date: Mapped[datetime | None] = mapped_column("preferredEndDate", DateTime(timezone=True))
    estimated_hours: Mapped[Decimal | None] = mapped_column("estimatedHours", Numeric(10, 2))
    estimated_price: Mapped[Decimal | None] = mapped_column("estimatedPrice", Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String, nullable=False, default="EUR", server_default="EUR")
    recommended_team_json: Mapped[str | None] = mapped_column("recommendedTeamJson", Text)
    memory_summary_json: Mapped[str | None] = mapped_column("memorySummaryJson", Text)
    payment_drafts_json: Mapped[str | None] = mapped_column("paymentDraftsJson", Text)
    external_workshops_json: Mapped[str | None] = mapped_column("externalWorkshopsJson", Text)
    staffing_plan_json: Mapped[str | None] = mapped_column("staffingPlanJson", Text)
    converted_customer_id: Mapped[str | None] = mapped_column("convertedCustomerId", String(36), ForeignKey("Customer.id"))
    converted_order_id: Mapped[str | None] = mapped_column("convertedOrderId", String(36), ForeignKey("Order.id"))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["ProposalMessage"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalMessage.created_at"
    )
    facts: Mapped[list["ProposalFact"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalFact.created_at"
    )


class ProposalFact(Base):
    __tablename__ = "ProposalFact"
    __table_args__ = (Index("ProposalFact_proposalId_idx", "proposalId"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    proposal_id: Mapped[str] = mapped_column("proposalId", String(36), ForeignKey("Proposal.id"), nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    fact_key: Mapped[str] = mapped_column("key", String, nullable=False)
    value_json: Mapped[str | None] = mapped_column("valueJson", Text)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    source_message_ids_json: Mapped[str | None] = mapped_column("sourceMessageIdsJson", Text)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    proposal: Mapped[Proposal] = relationship(back_populates="facts")


class ProposalMessage(Base):
    __tablename__ = "ProposalMessage"
    __table_args__ = (Index("ProposalMessage_proposalId_idx", "proposalId"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    proposal_id: Mapped[str] = mapped_column("proposalId", String(36), ForeignKey("Proposal.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())

    proposal: Mapped[Proposal] = relationship(back_populates="messages")


class RagSource(Base):
    __tablename__ = "RagSource"
    __table_args__ = (
        Index("RagSource_proposalId_idx", "proposalId"),
        Index("RagSource_orderId_idx", "orderId"),
        Index("RagSource_customerId_idx", "customerId"),
        Index("RagSource_siteId_idx", "siteId"),
        Index("RagSource_status_idx", "ingestionStatus"),
        Index("RagSource_entity_idx", "sourceEntityType", "sourceEntityId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    proposal_id: Mapped[str | None] = mapped_column("proposalId", String(36), ForeignKey("Proposal.id"))
    order_id: Mapped[str | None] = mapped_column("orderId", String(36), ForeignKey("Order.id"))
    customer_id: Mapped[str | None] = mapped_column("customerId", String(36), ForeignKey("Customer.id"))
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    source_type: Mapped[str] = mapped_column("sourceType", String, nullable=False)
    source_entity_type: Mapped[str | None] = mapped_column("sourceEntityType", String)
    source_entity_id: Mapped[str | None] = mapped_column("sourceEntityId", String(36))
    document_type: Mapped[str | None] = mapped_column("documentType", String)
    title: Mapped[str | None] = mapped_column(String)
    original_file_name: Mapped[str | None] = mapped_column("originalFileName", String)
    mime_type: Mapped[str | None] = mapped_column("mimeType", String)
    storage_path: Mapped[str | None] = mapped_column("storagePath", Text)
    file_hash: Mapped[str | None] = mapped_column("fileHash", String)
    language: Mapped[str | None] = mapped_column(String)
    ingestion_status: Mapped[str] = mapped_column(
        "ingestionStatus", String, nullable=False, default="pending", server_default="pending"
    )
    extraction_method: Mapped[str | None] = mapped_column("extractionMethod", String)
    extractor_version: Mapped[str | None] = mapped_column("extractorVersion", String)
    metadata_json: Mapped[str | None] = mapped_column("metadataJson", Text)
    created_by_user_id: Mapped[str | None] = mapped_column("createdByUserId", String(36))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    chunks: Mapped[list["RagChunk"]] = relationship(back_populates="source", cascade="all, delete-orphan")
    ingestion_jobs: Mapped[list["RagIngestionJob"]] = relationship(back_populates="source", cascade="all, delete-orphan")


class RagChunk(Base):
    __tablename__ = "RagChunk"
    __table_args__ = (
        Index("RagChunk_sourceId_idx", "sourceId"),
        Index("RagChunk_proposalId_idx", "proposalId"),
        Index("RagChunk_orderId_idx", "orderId"),
        Index("RagChunk_customerId_idx", "customerId"),
        Index("RagChunk_siteId_idx", "siteId"),
        Index("RagChunk_entity_idx", "sourceEntityType", "sourceEntityId"),
        Index("RagChunk_active_scope_idx", "isActive", "proposalId", "orderId", "sourceType", "trustLevel"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_id: Mapped[str] = mapped_column(
        "sourceId", String(36), ForeignKey("RagSource.id", ondelete="CASCADE"), nullable=False
    )
    proposal_id: Mapped[str | None] = mapped_column("proposalId", String(36), ForeignKey("Proposal.id"))
    order_id: Mapped[str | None] = mapped_column("orderId", String(36), ForeignKey("Order.id"))
    customer_id: Mapped[str | None] = mapped_column("customerId", String(36), ForeignKey("Customer.id"))
    site_id: Mapped[str | None] = mapped_column("siteId", String(36), ForeignKey("Site.id"))
    source_type: Mapped[str] = mapped_column("sourceType", String, nullable=False)
    source_entity_type: Mapped[str | None] = mapped_column("sourceEntityType", String)
    source_entity_id: Mapped[str | None] = mapped_column("sourceEntityId", String(36))
    chunk_type: Mapped[str] = mapped_column("chunkType", String, nullable=False)
    trust_level: Mapped[str] = mapped_column("trustLevel", String, nullable=False)
    chunk_text: Mapped[str] = mapped_column("chunkText", Text, nullable=False)
    chunk_text_hash: Mapped[str] = mapped_column("chunkTextHash", String, nullable=False)
    chunk_index: Mapped[int] = mapped_column("chunkIndex", Integer, nullable=False)
    token_count: Mapped[int | None] = mapped_column("tokenCount", Integer)
    language: Mapped[str | None] = mapped_column(String)
    page_start: Mapped[int | None] = mapped_column("pageStart", Integer)
    page_end: Mapped[int | None] = mapped_column("pageEnd", Integer)
    bounding_boxes_json: Mapped[str | None] = mapped_column("boundingBoxesJson", Text)
    layout_json: Mapped[str | None] = mapped_column("layoutJson", Text)
    heading_path_json: Mapped[str | None] = mapped_column("headingPathJson", Text)
    metadata_json: Mapped[str | None] = mapped_column("metadataJson", Text)
    embedding_model: Mapped[str] = mapped_column("embeddingModel", String, nullable=False)
    embedding_dim: Mapped[int] = mapped_column("embeddingDim", Integer, nullable=False, default=768, server_default="768")
    embedding_json: Mapped[str | None] = mapped_column("embeddingJson", Text)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True, server_default="true")
    superseded_by_chunk_id: Mapped[str | None] = mapped_column("supersededByChunkId", String(36))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    source: Mapped[RagSource] = relationship(back_populates="chunks")


class RagIngestionJob(Base):
    __tablename__ = "RagIngestionJob"
    __table_args__ = (
        Index("RagIngestionJob_sourceId_idx", "sourceId"),
        Index("RagIngestionJob_status_idx", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_id: Mapped[str] = mapped_column(
        "sourceId", String(36), ForeignKey("RagSource.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", server_default="pending")
    stage: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column("errorMessage", Text)
    started_at: Mapped[datetime | None] = mapped_column("startedAt", DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column("finishedAt", DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    source: Mapped[RagSource] = relationship(back_populates="ingestion_jobs")
