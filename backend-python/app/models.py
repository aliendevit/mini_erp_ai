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
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    assignments: Mapped[list["EmployeeAssignment"]] = relationship(back_populates="employee")
    work_entries: Mapped[list["WorkEntry"]] = relationship(back_populates="employee")


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
