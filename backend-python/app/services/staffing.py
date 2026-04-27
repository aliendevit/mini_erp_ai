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


def _safe_nonnegative_int(value: Any) -> int | None:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, normalized)


def _site_coverage_type(site: dict[str, Any]) -> str:
    assigned_workshop_name = str(site.get("assignedWorkshopName") or "").strip()
    raw = str(site.get("coverageType") or "").strip().lower()
    if raw in {"internal_only", "mixed_with_workshop", "workshop_only"}:
        if raw == "internal_only" and assigned_workshop_name:
            return "mixed_with_workshop"
        return raw
    return "mixed_with_workshop" if assigned_workshop_name else "internal_only"


def _derive_recommended_headcount(hour_target: float, weeks: int, internal_required_skills: set[str]) -> int:
    if not internal_required_skills:
        return 0
    capacity_per_employee = max(DEFAULT_WEEKLY_CAPACITY * max(weeks, 1), 8.0)
    return max(1, math.ceil(max(hour_target, 0.0) / capacity_per_employee))


def _assigned_workshop_summary(
    assigned_workshop_name: str | None,
    coverage_type: str,
    workshop_covered_skills: set[str],
    workshop_recommendations: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not assigned_workshop_name:
        return None
    normalized_name = assigned_workshop_name.strip().lower()
    matched = next((item for item in workshop_recommendations if str(item.get("name") or "").strip().lower() == normalized_name), None)
    return {
        "name": assigned_workshop_name,
        "coveredSkills": sorted(workshop_covered_skills),
        "coverageType": coverage_type,
        "relationshipStatus": matched.get("relationshipStatus") if matched else None,
        "matchedSkills": matched.get("matchedSkills") if matched else [],
        "source": matched.get("kind") if matched else None,
    }


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
        assigned_workshop_name = str(site.get("assignedWorkshopName") or "").strip() or None
        coverage_type = _site_coverage_type(site)
        workshop_covered_skills = _lower_terms(site.get("workshopCoveredSkills") or []) if assigned_workshop_name else set()
        workshop_recommendations = _rank_workshop_options(known_workshops, external_workshops, required_skills, site.get("siteName"))

        internal_required_skills = set(required_skills)
        coverage_note: str | None = None
        staffing_warning: str | None = None

        if assigned_workshop_name and coverage_type == "workshop_only":
            internal_required_skills = set()
            coverage_note = "This site is currently planned as workshop-only. Internal employees are optional."
            if not workshop_covered_skills:
                staffing_warning = "Workshop-only mode is selected, but no workshop-covered skills were confirmed yet."
        elif assigned_workshop_name and coverage_type == "mixed_with_workshop":
            if workshop_covered_skills:
                internal_required_skills = {skill for skill in required_skills if skill not in workshop_covered_skills}
                coverage_note = "Workshop-covered skills were removed from the internal staffing target."
                if not internal_required_skills:
                    coverage_note = "The confirmed workshop coverage currently covers all listed site skills."
            else:
                staffing_warning = "A workshop is selected, but no covered skills were confirmed. Internal ranking still uses the full site scope."

        # The recommended count is calculated by the staffing service.
        # Manager-stated counts are kept separate as selectedInternalHeadcount.
        if coverage_type == "workshop_only":
            recommended_headcount = 0
        else:
            recommended_headcount = _derive_recommended_headcount(hour_target, weeks, internal_required_skills)

        selected_headcount = _safe_nonnegative_int(site.get("selectedInternalHeadcount"))
        if coverage_type == "workshop_only":
            selected_headcount = 0
        elif selected_headcount is None or (selected_headcount == 0 and recommended_headcount > 0 and internal_required_skills):
            selected_headcount = recommended_headcount

        ranking_required_skills = set(internal_required_skills)
        if not ranking_required_skills and selected_headcount > 0:
            ranking_required_skills = set(required_skills)
            coverage_note = coverage_note or "No remaining internal trade was identified, so support candidates are shown against the full site scope."

        recommendations: list[dict[str, Any]] = []
        excluded: list[dict[str, Any]] = []

        should_rank_employees = bool(ranking_required_skills or required_certs or selected_headcount > 0 or coverage_type == "internal_only")
        if should_rank_employees:
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

                matched_skills = sorted(skill for skill in ranking_required_skills if skill in employee_skills)
                matched_certs = sorted(cert for cert in required_certs if cert in employee_certs)

                skill_ratio = (len(matched_skills) / len(ranking_required_skills)) if ranking_required_skills else 1.0
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
        auto_selected_employee_ids = [item["employeeId"] for item in recommendations[:selected_headcount]] if selected_headcount > 0 else []
        if auto_selected_employee_ids:
            preview_assignments[site_index] = auto_selected_employee_ids
        if selected_headcount > len(recommendations):
            shortage_message = f"Only {len(recommendations)} internal employees are currently available for the selected count of {selected_headcount}."
            staffing_warning = f"{staffing_warning} {shortage_message}".strip() if staffing_warning else shortage_message

        results.append(
            {
                "siteIndex": site_index,
                "siteName": site.get("siteName"),
                "coverageType": coverage_type,
                "requiredSkills": sorted(required_skills),
                "requiredCertifications": sorted(required_certs),
                "internalRequiredSkills": sorted(internal_required_skills),
                "estimatedHours": round(hour_target, 2),
                "recommendedHeadcount": recommended_headcount,
                "selectedInternalHeadcount": selected_headcount,
                "autoSelectedEmployeeIds": auto_selected_employee_ids,
                "recommendations": recommendations,
                "workshopRecommendations": workshop_recommendations,
                "workshopSummary": _assigned_workshop_summary(
                    assigned_workshop_name,
                    coverage_type,
                    workshop_covered_skills,
                    workshop_recommendations,
                ),
                "coverageNote": coverage_note,
                "staffingWarning": staffing_warning,
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

def build_staffing_explanation_context(proposal: Proposal, recommendations: dict[str, Any], site_index: int) -> dict[str, Any]:
    sites = list(recommendations.get("sites") or [])
    site = next((item for item in sites if int(item.get("siteIndex", -1)) == site_index), None)
    if site is None:
        raise IndexError("Site recommendation not found.")

    saved_sites = proposal_sites(proposal)
    saved_site = saved_sites[site_index] if 0 <= site_index < len(saved_sites) else {}
    window = recommendations.get("window") or {}
    weeks = max(1, int(window.get("weeks") or 1))
    estimated_hours = float(site.get("estimatedHours") or 0)
    required_skills = list(site.get("requiredSkills") or saved_site.get("requiredSkills") or [])
    required_certifications = list(site.get("requiredCertifications") or saved_site.get("requiredCertifications") or [])
    internal_required_skills = list(site.get("internalRequiredSkills") or [])
    workshop_summary = site.get("workshopSummary") or {}
    recommended_headcount = int(site.get("recommendedHeadcount") or 0)
    selected_headcount = int(site.get("selectedInternalHeadcount") or 0)

    capacity_per_employee_hours = max(DEFAULT_WEEKLY_CAPACITY * weeks, 8.0) if internal_required_skills else 0.0
    base_headcount = 0
    if internal_required_skills:
        base_headcount = max(1, math.ceil(max(estimated_hours, 0.0) / capacity_per_employee_hours))

    selected_ids = list(site.get("autoSelectedEmployeeIds") or [])
    ranked_employees = list(site.get("recommendations") or [])
    selected_employees = [employee for employee in ranked_employees if employee.get("employeeId") in selected_ids]
    if not selected_employees and selected_headcount > 0:
        selected_employees = ranked_employees[:selected_headcount]
    top_candidates = selected_employees or ranked_employees[: max(1, min(3, len(ranked_employees)))]
    excluded = list(site.get("excludedEmployees") or [])

    return {
        "siteIndex": site_index,
        "siteName": site.get("siteName") or saved_site.get("siteName") or f"Site {site_index + 1}",
        "coverageType": site.get("coverageType") or _site_coverage_type(saved_site),
        "estimatedHours": round(estimated_hours, 2),
        "projectWeeks": weeks,
        "window": {
            "startDate": window.get("startDate"),
            "endDate": window.get("endDate"),
        },
        "requiredSkills": required_skills,
        "requiredCertifications": required_certifications,
        "internalRequiredSkills": internal_required_skills,
        "assignedWorkshopName": workshop_summary.get("name") or saved_site.get("assignedWorkshopName"),
        "workshopCoveredSkills": list(workshop_summary.get("coveredSkills") or saved_site.get("workshopCoveredSkills") or []),
        "recommendedHeadcount": recommended_headcount,
        "selectedInternalHeadcount": selected_headcount,
        "baseHeadcount": base_headcount,
        "capacityPerEmployeeHours": round(capacity_per_employee_hours, 2) if capacity_per_employee_hours else 0.0,
        "coverageNote": site.get("coverageNote"),
        "staffingWarning": site.get("staffingWarning"),
        "topCandidates": [
            {
                "employeeId": employee.get("employeeId"),
                "employeeName": employee.get("employeeName"),
                "score": employee.get("score"),
                "matchedSkills": list(employee.get("matchedSkills") or []),
                "matchedCertifications": list(employee.get("matchedCertifications") or []),
                "remainingHours": ((employee.get("capacity") or {}).get("remainingHours")),
                "activeAssignmentCount": employee.get("activeAssignmentCount"),
            }
            for employee in top_candidates
        ],
        "excludedEmployees": excluded[:3],
    }


def _join_or_default(values: list[str], default_text: str) -> str:
    cleaned = [str(value).strip() for value in values if str(value).strip()]
    return ", ".join(cleaned) if cleaned else default_text


def format_staffing_explanation(context: dict[str, Any], locale: str = "en") -> str:
    locale_mode = (locale or "en").lower()
    site_name = str(context.get("siteName") or "Site")
    coverage_type = str(context.get("coverageType") or "internal_only")
    estimated_hours = context.get("estimatedHours") or 0
    project_weeks = int(context.get("projectWeeks") or 1)
    recommended_headcount = int(context.get("recommendedHeadcount") or 0)
    selected_headcount = int(context.get("selectedInternalHeadcount") or 0)
    base_headcount = int(context.get("baseHeadcount") or 0)
    capacity_per_employee_hours = context.get("capacityPerEmployeeHours") or 0
    workshop_name = str(context.get("assignedWorkshopName") or "").strip()
    workshop_skills = [str(value) for value in context.get("workshopCoveredSkills") or []]
    internal_skills = [str(value) for value in context.get("internalRequiredSkills") or []]
    selected_names = [
        str(item.get("employeeName") or "")
        for item in context.get("topCandidates") or []
        if str(item.get("employeeName") or "").strip()
    ]
    warning = str(context.get("staffingWarning") or "").strip()
    coverage_note = str(context.get("coverageNote") or "").strip()

    if locale_mode == "ar":
        coverage_map = {
            "internal_only": "موظفون داخليون فقط",
            "mixed_with_workshop": "ورشة مع موظفين داخليين",
            "workshop_only": "ورشة فقط",
        }
        lines = [
            f"الموقع: {site_name}",
            f"نوع التغطية: {coverage_map.get(coverage_type, coverage_type)}",
            f"الساعات المقدرة: {estimated_hours} ساعة ضمن {project_weeks} أسبوع/أسابيع.",
            f"المهارات الداخلية المتبقية: {_join_or_default(internal_skills, "غير مذكور")}",
        ]
        if workshop_name:
            lines.append(f"الورشة المعتمدة: {workshop_name} ({_join_or_default(workshop_skills, "غير مذكور")}).")
        if coverage_type == "workshop_only" or not internal_skills:
            lines.append("العدد المقترح للموظفين الداخليين هو 0 لأن تغطية الورشة الحالية تغطي نطاق العمل الداخلي المتبقي.")
        else:
            lines.append(
                f"تم اقتراح {recommended_headcount} موظف/موظفين داخليين لأن الأعمال الداخلية المتبقية ما زالت تحتاج تغطية ضمن المدة الحالية. السعة المفترضة تقارب {capacity_per_employee_hours} ساعة لكل موظف في هذه الفترة.",
            )
            if base_headcount and base_headcount != recommended_headcount:
                lines.append(f"العدد الأساسي المحسوب من الساعات والمدة هو {base_headcount}، ثم تم تعديله بحسب التغطية المتبقية أو الحاجة إلى دعم/متابعة إضافية.")
        if selected_headcount != recommended_headcount:
            lines.append(f"العدد الداخلي المحدد حالياً من المدير هو {selected_headcount}.")
        if selected_names:
            lines.append(f"أبرز المرشحين الحاليين: {_join_or_default(selected_names, "غير مذكور")}")
        if coverage_note:
            lines.append(f"ملاحظة التغطية: {coverage_note}")
        if warning:
            lines.append(f"تنبيه: {warning}")
        return "\n".join(lines)

    if locale_mode == "de":
        coverage_map = {
            "internal_only": "Nur interne Mitarbeiter",
            "mixed_with_workshop": "Workshop plus interne Mitarbeiter",
            "workshop_only": "Nur Workshop",
        }
        lines = [
            f"Baustelle: {site_name}",
            f"Abdeckungsmodus: {coverage_map.get(coverage_type, coverage_type)}",
            f"Geschaetzte Stunden: {estimated_hours} in {project_weeks} Woche(n).",
            f"Verbleibende interne Skills: {_join_or_default(internal_skills, 'Nicht erwaehnt')}",
        ]
        if workshop_name:
            lines.append(f"Zugeordneter Workshop: {workshop_name} ({_join_or_default(workshop_skills, 'Nicht erwaehnt')}).")
        if coverage_type == "workshop_only" or not internal_skills:
            lines.append("Es werden 0 interne Mitarbeiter vorgeschlagen, weil die aktuelle Workshop-Abdeckung den internen Bedarf bereits abdeckt.")
        else:
            lines.append(
                f"Vorgeschlagen werden {recommended_headcount} interne Mitarbeiter, weil die verbleibenden internen Arbeiten innerhalb des aktuellen Zeitfensters abgedeckt werden muessen. Die angenommene Kapazitaet liegt bei etwa {capacity_per_employee_hours} Stunden pro Mitarbeiter in diesem Zeitraum.",
            )
            if base_headcount and base_headcount != recommended_headcount:
                lines.append(f"Der Grundwert aus Stunden und Zeitfenster liegt bei {base_headcount}; danach wurde auf Basis der verbleibenden Abdeckung bzw. des Koordinationsbedarfs angepasst.")
        if selected_headcount != recommended_headcount:
            lines.append(f"Aktuell ausgewaehlte interne Mitarbeiterzahl: {selected_headcount}.")
        if selected_names:
            lines.append(f"Aktuell passende Top-Kandidaten: {_join_or_default(selected_names, 'Nicht erwaehnt')}")
        if coverage_note:
            lines.append(f"Abdeckungshinweis: {coverage_note}")
        if warning:
            lines.append(f"Warnung: {warning}")
        return "\n".join(lines)

    lines = [
        f"Site: {site_name}",
        f"Coverage type: {coverage_type}",
        f"Estimated hours: {estimated_hours} across {project_weeks} week(s).",
        f"Remaining internal skills: {_join_or_default(internal_skills, 'Not mentioned')}",
    ]
    if workshop_name:
        lines.append(f"Assigned workshop: {workshop_name} ({_join_or_default(workshop_skills, 'Not mentioned')}).")
    if coverage_type == "workshop_only" or not internal_skills:
        lines.append("The recommended internal headcount is 0 because the current workshop coverage already covers the internal scope.")
    else:
        lines.append(
            f"The recommended internal headcount is {recommended_headcount} because the remaining internal work still needs coverage within the current time window. The assumed capacity is about {capacity_per_employee_hours} hours per employee for this period.",
        )
        if base_headcount and base_headcount != recommended_headcount:
            lines.append(f"The base headcount from hours and schedule is {base_headcount}, then it is adjusted for the remaining coverage and support/co-ordination need.")
    if selected_headcount != recommended_headcount:
        lines.append(f"The current manually selected internal count is {selected_headcount}.")
    if selected_names:
        lines.append(f"Current top candidates: {_join_or_default(selected_names, 'Not mentioned')}")
    if coverage_note:
        lines.append(f"Coverage note: {coverage_note}")
    if warning:
        lines.append(f"Warning: {warning}")
    return "\n".join(lines)
