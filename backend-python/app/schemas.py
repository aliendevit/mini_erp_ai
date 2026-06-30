from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AuthRegisterPayload(BaseModel):
    email: str
    password: str
    phone: str | None = None


class AuthLoginPayload(BaseModel):
    email: str
    password: str


class AuthChangePasswordPayload(BaseModel):
    currentPassword: str
    newPassword: str


class CompanyProfilePayload(BaseModel):
    companyName: str
    legalName: str | None = None
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    country: str | None = "DE"
    vatId: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    notes: str | None = None


class CompanyProfileResponse(CompanyProfilePayload):
    id: str
    ownerUserId: str
    createdAt: datetime | None = None
    updatedAt: datetime | None = None


class AuthUserResponse(BaseModel):
    id: str
    email: str
    phone: str | None = None
    tenantId: str | None = None
    accountLevel: str = "company_manager"
    tenantName: str | None = None
    role: str = "company_manager"
    permissions: list[str] = Field(default_factory=list)
    createdAt: datetime | None = None
    lastLoginAt: datetime | None = None
    companyProfileComplete: bool = False


class AuthResponse(BaseModel):
    token: str
    user: AuthUserResponse


class AccountControlFeatureResponse(BaseModel):
    key: str
    title: str
    description: str
    permission: str
    enabled: bool


class AccountControlUserResponse(BaseModel):
    id: str
    email: str
    phone: str | None = None
    accountLevel: str
    role: str
    tenantName: str | None = None
    permissions: list[str] = Field(default_factory=list)
    aiFeatures: list[AccountControlFeatureResponse] = Field(default_factory=list)
    isActive: bool = True
    lastLoginAt: datetime | None = None
    createdAt: datetime | None = None


class AccountControlResponse(BaseModel):
    currentUser: AccountControlUserResponse
    companyProfile: CompanyProfileResponse | None = None
    companyUsers: list[AccountControlUserResponse] = Field(default_factory=list)
    canManageUsers: bool = False
    userLimit: int | None = None
    userUsed: int = 0


class AccountControlPermissionsPayload(BaseModel):
    permissions: list[str] = Field(default_factory=list)


class ManagerCreateUserPayload(BaseModel):
    email: str
    password: str
    phone: str | None = None
    accountLevel: Literal["company_user", "company_viewer"] = "company_user"


class PlatformCreateCompanyPayload(BaseModel):
    companyName: str
    managerEmail: str | None = None
    managerPassword: str | None = None
    contactEmail: str | None = None
    planName: str = "AI Business"
    status: Literal["active", "trial", "suspended"] = "active"
    userLimit: int = Field(default=2, ge=0, le=500)
    subscriptionAmount: float | None = Field(default=None, ge=0)


class PlatformCreateCompanyResponse(BaseModel):
    tenantId: str
    companyName: str
    userLimit: int
    manager: AuthUserResponse
    managerEmail: str
    managerPassword: str


class PlatformResetManagerPasswordPayload(BaseModel):
    password: str | None = None


class PlatformResetManagerPasswordResponse(BaseModel):
    tenantId: str
    companyName: str
    managerEmail: str
    managerPassword: str


class PlatformSaasInvoicePayload(BaseModel):
    tenantId: str
    amount: float = Field(ge=0)
    currency: str = "EUR"
    periodLabel: str | None = None
    issueDate: datetime | date | None = None
    dueDate: datetime | date | None = None
    status: Literal["draft", "sent", "paid", "canceled"] = "sent"
    notes: str | None = None


class PlatformSaasPaymentPayload(BaseModel):
    amount: float = Field(ge=0)
    currency: str = "EUR"
    paidDate: datetime | date | None = None
    method: str | None = None
    reference: str | None = None
    notes: str | None = None


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


class CustomerWorkshopPayload(BaseModel):
    name: str
    contactName: str | None = None
    phone: str | None = None
    email: str | None = None
    specialties: list[str] = Field(default_factory=list)
    notes: str | None = None
    relationshipStatus: Literal["known", "preferred", "one_time", "blocked"] = "known"
    isActive: bool = True


class WorkshopPayload(BaseModel):
    name: str
    contactName: str | None = None
    phone: str | None = None
    email: str | None = None
    specialties: list[str] = Field(default_factory=list)
    notes: str | None = None
    availabilityStatus: Literal["available", "not_available"] = "available"
    availabilityNote: str | None = None
    isActive: bool = True


class WorkshopSiteAssignmentPayload(BaseModel):
    siteId: str
    workshopId: str
    coveredSkills: list[str] = Field(default_factory=list)
    startDate: datetime | date | None = None
    endDate: datetime | date | None = None
    status: Literal["planned", "assigned", "in_progress", "blocked", "completed", "canceled"] = "assigned"
    notes: str | None = None


class PaymentRecordPayload(BaseModel):
    proposalId: str | None = None
    customerId: str | None = None
    orderId: str | None = None
    invoiceId: str | None = None
    type: Literal["deposit", "advance", "installment", "final", "other"] = "deposit"
    status: Literal["planned", "received", "refunded", "canceled"] = "planned"
    amount: float | None = None
    currency: str = "EUR"
    dueDate: datetime | date | None = None
    paidDate: datetime | date | None = None
    method: str | None = None
    reference: str | None = None
    notes: str | None = None


class EmployeeAvailabilityBlockPayload(BaseModel):
    id: str | None = None
    startDate: datetime | date | None = None
    endDate: datetime | date | None = None
    reason: str | None = None


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
    weeklyCapacityHours: float | None = None
    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    availabilityBlocks: list[EmployeeAvailabilityBlockPayload] = Field(default_factory=list)


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


class ProjectProgressUpdatePayload(BaseModel):
    siteId: str | None = None
    title: str | None = None
    description: str | None = None
    status: str | None = None
    progressPercent: int | None = None
    nextAction: str | None = None
    updateDate: datetime | date | None = None


class ProjectSiteBaselinePayload(BaseModel):
    plannedStartDate: datetime | date | None = None
    plannedEndDate: datetime | date | None = None
    baselineStatus: Literal["draft", "confirmed"] = "draft"
    source: Literal["ai_suggested", "manual"] = "manual"
    notes: str | None = None


class ProjectTaskPayload(BaseModel):
    siteId: str | None = None
    taskName: str
    status: str = "not_started"
    weightPercent: float | int | None = None
    progressPercent: int | None = None
    responsibleType: str = "not_assigned"
    responsibleName: str | None = None
    dueDate: datetime | date | None = None
    notes: str | None = None


class ProjectIssuePayload(BaseModel):
    siteId: str | None = None
    title: str
    description: str | None = None
    severity: str = "medium"
    status: str = "open"
    responsibleType: str = "not_assigned"
    responsibleName: str | None = None
    resolutionNote: str | None = None


class ProjectMaterialLogPayload(BaseModel):
    siteId: str | None = None
    materialName: str
    quantity: str | None = None
    status: str = "needed"
    notes: str | None = None


class ProjectMonitoringAlertUpdatePayload(BaseModel):
    status: Literal["open", "resolved", "dismissed"]
    resolutionNote: str | None = None


class InvoiceUpdatePayload(BaseModel):
    status: Literal["draft", "final", "sent", "partial_paid", "paid", "canceled"] | None = None
    issueDate: datetime | date | None = None
    dueDate: datetime | date | None = None
    notes: str | None = None
    pauschalAmount: float | None = None


class WorkshopInvoiceItemPayload(BaseModel):
    siteId: str | None = None
    description: str
    quantity: float = 1
    unitPrice: float | None = None
    totalAmount: float | None = None
    workshopName: str | None = None
    notes: str | None = None


class WorkshopInvoiceCreatePayload(BaseModel):
    orderId: str
    status: Literal["draft", "final", "sent", "paid"] = "final"
    issueDate: datetime | date | None = None
    currency: str | None = None
    notes: str | None = None
    items: list[WorkshopInvoiceItemPayload]


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


class AIIntakeCreatePayload(BaseModel):
    customerCompanyName: str | None = None
    orderTitle: str | None = None


class AIIntakeMessagePayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class ProposalPaymentDraftPayload(BaseModel):
    type: Literal["deposit", "advance", "installment", "final", "other"] = "deposit"
    status: Literal["planned", "received", "refunded", "canceled"] = "planned"
    amount: float | None = None
    currency: str = "EUR"
    dueDate: datetime | date | None = None
    paidDate: datetime | date | None = None
    method: str | None = None
    reference: str | None = None
    notes: str | None = None


class ProposalExternalWorkshopDraftPayload(BaseModel):
    name: str = ""
    contactName: str | None = None
    phone: str | None = None
    email: str | None = None
    specialties: list[str] = Field(default_factory=list)
    suggestedFor: list[str] = Field(default_factory=list)
    relationshipStatus: Literal["known", "preferred", "one_time", "blocked"] = "known"
    notes: str | None = None


class ProposalSiteDraftPayload(BaseModel):
    siteName: str = ""
    street: str | None = None
    zipCode: str | None = None
    city: str | None = None
    notes: str | None = None
    requiredSkills: list[str] = Field(default_factory=list)
    requiredCertifications: list[str] = Field(default_factory=list)
    estimatedHours: float | None = None
    recommendedHeadcount: int | None = None
    selectedInternalHeadcount: int | None = None
    assignedWorkshopName: str | None = None
    workshopCoveredSkills: list[str] = Field(default_factory=list)
    coverageType: Literal["internal_only", "mixed_with_workshop", "workshop_only"] | None = None
    resourceStrategy: str | None = None


class ProposalDraftPayload(BaseModel):
    status: Literal["intake", "draft", "reviewed", "converted", "rejected"] | None = None
    customerCompanyName: str | None = None
    customerStreet: str | None = None
    customerZipCode: str | None = None
    customerCity: str | None = None
    customerCountry: str | None = None
    contactName: str | None = None
    contactPhone: str | None = None
    contactEmail: str | None = None
    summary: str | None = None
    orderTitle: str | None = None
    orderDescription: str | None = None
    proposedSites: list[ProposalSiteDraftPayload] = Field(default_factory=list)
    requiredSkills: list[str] = Field(default_factory=list)
    requiredCertifications: list[str] = Field(default_factory=list)
    preferredStartDate: datetime | date | None = None
    preferredEndDate: datetime | date | None = None
    estimatedHours: float | None = None
    estimatedPrice: float | None = None
    currency: str | None = None
    recommendedTeam: dict | None = None
    memorySummary: dict[str, Any] | None = None
    paymentDrafts: list[ProposalPaymentDraftPayload] = Field(default_factory=list)
    externalWorkshops: list[ProposalExternalWorkshopDraftPayload] = Field(default_factory=list)
    staffingPlan: dict[str, Any] | None = None


class ProposalSiteAssignmentPayload(BaseModel):
    siteIndex: int
    employeeIds: list[str] = Field(default_factory=list)


class AIIntakeConfirmPayload(BaseModel):
    existingCustomerId: str | None = None
    siteAssignments: list[ProposalSiteAssignmentPayload] = Field(default_factory=list)
    manualEstimatedPrice: float | None = None
    paymentDrafts: list[ProposalPaymentDraftPayload] | None = None


class RagQueryPayload(BaseModel):
    proposalId: str | None = None
    orderId: str | None = None
    question: str = Field(..., min_length=1, max_length=10000)
    limit: int = Field(default=8, ge=1, le=20)
