from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CustomerPayload(BaseModel):
    companyName: str
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    country: str | None = "DE"
    vatId: str | None = None
    contactName: str | None = None
    contactPhone: str | None = None
    contactEmail: str | None = None
    notes: str | None = None


class EmployeePayload(BaseModel):
    firstName: str
    lastName: str
    birthDate: datetime | date | None = None
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    phone: str | None = None
    email: str | None = None
    isActive: bool = True
    defaultHourlyRate: float | None = None


class OrderPayload(BaseModel):
    customerId: str
    orderNumber: str | None = None
    title: str
    description: str | None = None
    status: str = "open"
    startDate: datetime | date | None = None
    endDate: datetime | date | None = None
    defaultHourlyRate: float | None = None
    currency: str = "EUR"


class SitePayload(BaseModel):
    orderId: str
    siteName: str
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    notes: str | None = None
    isActive: bool = True


class AssignmentPayload(BaseModel):
    employeeId: str
    siteId: str
    startDate: datetime | date | None = None
    endDate: datetime | date | None = None
    notes: str | None = None


class AssignmentUpdatePayload(BaseModel):
    startDate: datetime | date | None = None
    endDate: datetime | date | None = None
    notes: str | None = None


class WorkEntryPayload(BaseModel):
    workDate: datetime | date | str
    employeeId: str
    orderId: str
    siteId: str
    hours: float | int | None = None
    dayType: Literal["work", "sick", "vacation", "holiday", "arbeit", "krank", "urlaub", "feiertag"] | None = None
    isSick: bool | None = None
    description: str | None = None


class InvoiceUpdatePayload(BaseModel):
    status: Literal["draft", "final", "sent", "paid", "canceled"] | None = None
    issueDate: datetime | date | None = None
    notes: str | None = None
    pauschalAmount: float | None = None


class InvoiceMergePayload(BaseModel):
    groupBy: Literal["employee", "site", "order"]
    key: str
    sourceInvoiceIds: list[str]
    splits: list[float] | None = None


class InvoiceSequenceUpdatePayload(BaseModel):
    year: int | None = None
    nextSeq: int | None = None


class AIWorkSummaryPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    employeeId: str | None = None
    orderId: str | None = None
    siteId: str | None = None
    from_date: date | None = Field(default=None, alias="from")
    to_date: date | None = Field(default=None, alias="to")
    question: str | None = None

