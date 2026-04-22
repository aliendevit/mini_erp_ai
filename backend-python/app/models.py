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
