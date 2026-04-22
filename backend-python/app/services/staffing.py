from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Customer, CustomerWorkshop, Employee, EmployeeAssignment, EmployeeAvailabilityBlock, Proposal, WorkEntry
from .proposals import calculate_price_from_assignments, proposal_external_workshops, proposal_required_certifications, proposal_required_skills, proposal_sites, proposal_window


DEFAULT_WEEKLY_CAPACITY = 40.0
ASSIGNMENT_PRESSURE_HOURS_PER_WEEK = 4.0


_SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    "maler": (
        "maler",
        "malerarbeiten",
        "lackierer",
        "painting",
        "painter",
        "decorator",
        "dehan",
        "????",
        "????",
    ),
    "spachteln": (
        "spachteln",
        "spachtel",
        "filling",
        "filler",
        "?????",
    ),
    "schleifen": (
        "schleifen",
        "schleif",
        "sanding",
        "sand",
        "?????",
    ),
    "trockenbau-reparaturen": (
        "trockenbau-reparaturen",
        "trockenbaureparaturen",
        "drywall repair",
        "drywall repairs",
        "drywall repair specialist",
        "??????? ?????",
        "??????? ?????",
        "????? ?????",
        "????? ?????",
    ),
    "trockenbau": (
        "trockenbau",
        "drywall",
        "drywall worker",
        "drywall work",
        "??? ????",
        "???",
        "???? ???",
    ),
    "feuchtigkeitsschutz": (
        "feuchtigkeitsschutz",
        "abdichtung",
        "moisture protection",
        "damp-proof",
        "damp proof",
        "moisture protection / damp-proof coating",
        "????? ?? ???????",
        "???????",
        "??? ?????",
        "??? ???????",
    ),
}


def _canonical_term(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        return ""
    for canonical, aliases in _SKILL_ALIASES.items():
        if normalized == canonical or normalized in aliases:
            return canonical
        if any(alias and alias in normalized for alias in aliases):
            return canonical
    return normalized


def _lower_terms(values: list[str]) -> set[str]:
    return {_canonical_term(value) for value in values if value and _canonical_term(value)}


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _overlaps(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    start_a = _as_utc(start_a)
    end_a = _as_utc(end_a)
    start_b = _as_utc(start_b)
    end_b = _as_utc(end_b)
    return start_a <= end_b and start_b <= end_a


def _availability_overlap(
    blocks: list[EmployeeAvailabilityBlock], window_start: datetime, window_end: datetime
) -> EmployeeAvailabilityBlock | None:
    for block in blocks:
        if _overlaps(window_start, window_end, block.start_date, block.end_date):
            return block
    return None


def _window_metrics(db: Session, employee: Employee, window_start: datetime, window_end: datetime) -> dict[str, float | int]:
    logged_hours = db.scalar(
        select(func.coalesce(func.sum(WorkEntry.hours), 0))
        .where(WorkEntry.employee_id == employee.id)
        .where(WorkEntry.work_date >= window_start)
        .where(WorkEntry.work_date <= window_end)
    )
    overlapping_assignments = db.scalar(
        select(func.count(EmployeeAssignment.id))
        .where(EmployeeAssignment.employee_id == employee.id)
        .where(
            func.coalesce(EmployeeAssignment.end_date, window_end) >= window_start,
        )
        .where(
            func.coalesce(EmployeeAssignment.start_date, window_start) <= window_end,
        )
    )
    recent_cutoff = max(window_start - timedelta(days=180), datetime(2000, 1, 1, tzinfo=timezone.utc))
    recent_entries = db.scalar(
        select(func.count(WorkEntry.id))
        .where(WorkEntry.employee_id == employee.id)
        .where(WorkEntry.work_date >= recent_cutoff)
        .where(WorkEntry.work_date <= window_end)
    )
    return {
        "loggedHours": float(logged_hours or 0),
        "overlappingAssignments": int(overlapping_assignments or 0),
        "recentEntries": int(recent_entries or 0),
    }


def _site_hour_target(site: dict[str, Any], proposal_hours: float, site_count: int) -> float:
    try:
        site_hours = float(site.get("estimatedHours"))
    except (TypeError, ValueError):
        site_hours = 0.0
    if site_hours > 0:
        return site_hours
    if proposal_hours > 0 and site_count > 0:
        return proposal_hours / site_count
    return 8.0


def _find_matching_customer(db: Session, proposal: Proposal) -> Customer | None:
    if proposal.converted_customer_id:
        customer = db.get(Customer, proposal.converted_customer_id)
        if customer:
            return customer
    name = (proposal.customer_company_name or "").strip().lower()
    if not name:
        return None
    return db.scalar(select(Customer).where(func.lower(Customer.company_name) == name).limit(1))


def _workshop_terms(workshop: CustomerWorkshop | dict[str, Any]) -> set[str]:
    if isinstance(workshop, CustomerWorkshop):
        values = []
        try:
            import json

            values = json.loads(workshop.specialties_json or "[]")
        except Exception:
            values = []
        return _lower_terms([str(value) for value in values])
    return _lower_terms([str(value) for value in workshop.get("specialties") or []])


def _rank_workshop_options(
    known_workshops: list[CustomerWorkshop],
    external_workshops: list[dict[str, Any]],
    required_skills: set[str],
    site_name: str | None,
) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    normalized_site = (site_name or "").strip().lower()

    for workshop in known_workshops:
        if not workshop.is_active or workshop.relationship_status == "blocked":
            continue
        terms = _workshop_terms(workshop)
        matched = sorted(skill for skill in required_skills if skill in terms)
        skill_score = (len(matched) / len(required_skills)) if required_skills else 0.6
        relationship_bonus = 0.2 if workshop.relationship_status == "preferred" else 0.1
        score = round(min(1.0, skill_score + relationship_bonus) * 100, 1)
        options.append(
            {
                "kind": "known_customer_workshop",
                "workshopId": workshop.id,
                "name": workshop.name,
                "score": score,
                "matchedSkills": matched,
                "relationshipStatus": workshop.relationship_status,
                "reason": "Known contractor workshop linked to this customer.",
                "notes": workshop.notes,
            }
        )

    for index, workshop in enumerate(external_workshops):
        terms = _workshop_terms(workshop)
        suggested_for = [str(value).strip().lower() for value in workshop.get("suggestedFor") or []]
        matched = sorted(skill for skill in required_skills if skill in terms)
        site_bonus = 0.2 if normalized_site and any(normalized_site in value or value in normalized_site for value in suggested_for) else 0.0
        skill_score = (len(matched) / len(required_skills)) if required_skills else 0.5
        score = round(min(1.0, skill_score + site_bonus) * 100, 1)
        options.append(
            {
                "kind": "transcript_external_workshop",
                "workshopId": None,
                "draftIndex": index,
                "name": workshop.get("name"),
                "score": score,
                "matchedSkills": matched,
                "relationshipStatus": workshop.get("relationshipStatus") or "known",
                "reason": "External workshop/team mentioned in this intake transcript.",
                "notes": workshop.get("notes"),
            }
        )

    options.sort(key=lambda item: (-float(item.get("score") or 0), str(item.get("name") or "")))
    return options


def recommend_staff_for_proposal(db: Session, proposal: Proposal) -> dict[str, Any]:
    window_start, window_end = proposal_window(proposal)
    days = max(1, (window_end.date() - window_start.date()).days + 1)
    weeks = max(1, math.ceil(days / 7))
    proposal_hours = float(proposal.estimated_hours or 0)
    global_required_skills = _lower_terms(proposal_required_skills(proposal))
    global_required_certs = _lower_terms(proposal_required_certifications(proposal))

    customer = _find_matching_customer(db, proposal)
    known_workshops = (
        db.scalars(
            select(CustomerWorkshop)
            .where(CustomerWorkshop.customer_id == customer.id)
            .where(CustomerWorkshop.is_active.is_(True))
            .where(CustomerWorkshop.relationship_status != "blocked")
            .order_by(CustomerWorkshop.name.asc())
        ).all()
        if customer
        else []
    )
    external_workshops = proposal_external_workshops(proposal)

    employees = db.scalars(
        select(Employee)
        .options(selectinload(Employee.skill_records), selectinload(Employee.availability_blocks))
        .where(Employee.is_active.is_(True))
        .order_by(Employee.last_name.asc(), Employee.first_name.asc())
    ).all()

    sites = proposal_sites(proposal)
    results: list[dict[str, Any]] = []
    preview_assignments: dict[int, list[str]] = {}

    for site_index, site in enumerate(sites):
        required_skills = _lower_terms(site.get("requiredSkills") or []) or global_required_skills
        required_certs = _lower_terms(site.get("requiredCertifications") or []) or global_required_certs
        hour_target = _site_hour_target(site, proposal_hours, len(sites))
        recommendations: list[dict[str, Any]] = []
        excluded: list[dict[str, Any]] = []
        workshop_recommendations = _rank_workshop_options(known_workshops, external_workshops, required_skills, site.get("siteName"))

        for employee in employees:
            employee_skills = _lower_terms([item.name for item in employee.skill_records if item.kind == "skill"])
            employee_certs = _lower_terms([item.name for item in employee.skill_records if item.kind == "certification"])
            overlap_block = _availability_overlap(employee.availability_blocks, window_start, window_end)
            if overlap_block:
                excluded.append(
                    {
                        "employeeId": employee.id,
                        "employeeName": f"{employee.first_name} {employee.last_name}",
                        "reason": "blocked",
                        "details": overlap_block.reason or "Abwesenheitsblock im gewaehlten Zeitraum.",
                    }
                )
                continue

            metrics = _window_metrics(db, employee, window_start, window_end)
            weekly_capacity = float(employee.weekly_capacity_hours or DEFAULT_WEEKLY_CAPACITY)
            capacity_defaulted = employee.weekly_capacity_hours is None
            assignment_penalty = metrics["overlappingAssignments"] * ASSIGNMENT_PRESSURE_HOURS_PER_WEEK * weeks
            available_hours = max(0.0, weekly_capacity * weeks - float(metrics["loggedHours"]) - assignment_penalty)
            if available_hours <= 0:
                excluded.append(
                    {
                        "employeeId": employee.id,
                        "employeeName": f"{employee.first_name} {employee.last_name}",
                        "reason": "capacity",
                        "details": "Keine verfuegbare Kapazitaet im Zeitraum.",
                    }
                )
                continue

            matched_skills = sorted(skill for skill in required_skills if skill in employee_skills)
            matched_certs = sorted(cert for cert in required_certs if cert in employee_certs)

            skill_ratio = (len(matched_skills) / len(required_skills)) if required_skills else 1.0
            cert_ratio = (len(matched_certs) / len(required_certs)) if required_certs else 1.0
            capability_score = (skill_ratio * 0.7) + (cert_ratio * 0.3)
            capacity_score = min(1.0, available_hours / max(hour_target, 8.0))
            history_score = min(1.0, int(metrics["recentEntries"]) / 20.0)
            total_score = round((capability_score * 0.6 + capacity_score * 0.3 + history_score * 0.1) * 100, 1)

            recommendations.append(
                {
                    "employeeId": employee.id,
                    "employeeName": f"{employee.first_name} {employee.last_name}",
                    "score": total_score,
                    "matchedSkills": matched_skills,
                    "matchedCertifications": matched_certs,
                    "scoreBreakdown": {
                        "skills": round(capability_score * 100, 1),
                        "capacity": round(capacity_score * 100, 1),
                        "history": round(history_score * 100, 1),
                    },
                    "capacity": {
                        "weeklyCapacityHours": weekly_capacity,
                        "capacityDefaulted": capacity_defaulted,
                        "loggedHours": round(float(metrics["loggedHours"]), 2),
                        "assignmentPressureHours": round(float(assignment_penalty), 2),
                        "remainingHours": round(float(available_hours), 2),
                    },
                    "recentEntries": int(metrics["recentEntries"]),
                    "activeAssignmentCount": int(metrics["overlappingAssignments"]),
                }
            )

        recommendations.sort(key=lambda item: (-item["score"], item["employeeName"]))
        if recommendations:
            preview_assignments[site_index] = [recommendations[0]["employeeId"]]
        results.append(
            {
                "siteIndex": site_index,
                "siteName": site.get("siteName"),
                "requiredSkills": sorted(required_skills),
                "requiredCertifications": sorted(required_certs),
                "estimatedHours": round(hour_target, 2),
                "recommendations": recommendations,
                "workshopRecommendations": workshop_recommendations,
                "excludedEmployees": excluded,
            }
        )

    price_preview: Decimal | None = None
    try:
        if preview_assignments:
            price_preview = calculate_price_from_assignments(db, proposal, preview_assignments)
    except Exception:
        price_preview = None

    return {
        "window": {
            "startDate": window_start.isoformat(),
            "endDate": window_end.isoformat(),
            "weeks": weeks,
        },
        "sites": results,
        "pricePreview": float(price_preview) if price_preview is not None else None,
        "currency": proposal.currency,
        "staffingPlan": getattr(proposal, "staffing_plan_json", None),
    }
