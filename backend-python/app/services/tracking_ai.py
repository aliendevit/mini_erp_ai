from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from .gemini_client import generate_text

logger = logging.getLogger(__name__)

_VALID_HEALTH = {"healthy", "watch", "at_risk", "blocked"}
_LOCALE_NAMES = {"ar": "Arabic", "de": "German", "en": "English"}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value or "").strip()


def _strip_code_fences(value: str) -> str:
    candidate = value.strip()
    if not candidate.startswith("```"):
        return candidate
    lines = candidate.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _warning_context(warning: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": warning.get("type"),
        "severity": warning.get("severity"),
        "siteName": warning.get("siteName"),
        "message": warning.get("message"),
        "recommendedAction": warning.get("recommendedAction"),
        "fixArea": warning.get("fixArea"),
    }


def _site_context(site: dict[str, Any]) -> dict[str, Any]:
    workshops = []
    for assignment in _as_list(site.get("scheduledWorkshops") or site.get("workshopAssignments")):
        workshop = assignment.get("workshop") or {}
        workshops.append(
            {
                "workshopName": workshop.get("name"),
                "availabilityStatus": workshop.get("availabilityStatus"),
                "coveredSkills": assignment.get("coveredSkills") or [],
                "status": assignment.get("status"),
                "scheduleStatus": assignment.get("scheduleStatus"),
                "startDate": assignment.get("startDate"),
                "endDate": assignment.get("endDate"),
            }
        )
    return {
        "siteName": site.get("siteName"),
        "currentStatus": site.get("currentStatus"),
        "progressPercent": site.get("progressPercent"),
        "actualProgressPercent": site.get("actualProgressPercent"),
        "plannedProgressPercent": site.get("plannedProgressPercent"),
        "progressDeltaPercent": site.get("progressDeltaPercent"),
        "baselineStartDate": site.get("baselineStartDate"),
        "baselineEndDate": site.get("baselineEndDate"),
        "baselineStatus": site.get("baselineStatus"),
        "predictedFinishDate": site.get("predictedFinishDate"),
        "delayDays": site.get("delayDays"),
        "delayStatus": site.get("delayStatus"),
        "lastUpdateDate": site.get("lastUpdateDate"),
        "openBlockerCount": len(_as_list(site.get("openBlockers"))),
        "latestPhotoCount": len(_as_list(site.get("latestPhotos"))),
        "workshops": workshops,
        "warnings": [_warning_context(warning) for warning in _as_list(site.get("scheduleWarnings"))],
    }


def build_tracking_analysis_context(tracking: dict[str, Any]) -> dict[str, Any]:
    dashboard = tracking.get("dashboard") or {}
    order = tracking.get("order") or {}
    warnings = [_warning_context(warning) for warning in _as_list(dashboard.get("warnings"))]
    return {
        "order": {
            "id": order.get("id"),
            "title": order.get("title"),
            "status": order.get("status"),
            "customer": (order.get("customer") or {}).get("companyName"),
        },
        "dashboard": {
            "overallStatus": dashboard.get("overallStatus"),
            "overallProgressPercent": dashboard.get("overallProgressPercent"),
            "plannedProgressPercent": dashboard.get("plannedProgressPercent"),
            "actualProgressPercent": dashboard.get("actualProgressPercent"),
            "behindScheduleSiteCount": dashboard.get("behindScheduleSiteCount"),
            "openIssueCount": dashboard.get("openIssueCount"),
            "completedTaskCount": dashboard.get("completedTaskCount"),
            "totalTaskCount": dashboard.get("totalTaskCount"),
            "latestUpdateDate": dashboard.get("latestUpdateDate"),
            "upcomingActions": dashboard.get("upcomingActions") or [],
            "warnings": warnings,
        },
        "sites": [_site_context(site) for site in _as_list(tracking.get("siteCards"))],
        "tasks": [
            {
                "siteName": (task.get("site") or {}).get("siteName"),
                "taskName": task.get("taskName"),
                "status": task.get("status"),
                "weightPercent": task.get("weightPercent"),
                "progressPercent": task.get("progressPercent"),
                "dueDate": task.get("dueDate"),
                "responsibleType": task.get("responsibleType"),
                "responsibleName": task.get("responsibleName"),
            }
            for task in _as_list(tracking.get("tasks"))[:30]
        ],
        "issues": [
            {
                "siteName": (issue.get("site") or {}).get("siteName"),
                "title": issue.get("title"),
                "severity": issue.get("severity"),
                "status": issue.get("status"),
                "responsibleType": issue.get("responsibleType"),
                "responsibleName": issue.get("responsibleName"),
                "resolutionNote": issue.get("resolutionNote"),
            }
            for issue in _as_list(tracking.get("issues"))[:30]
        ],
        "materials": [
            {
                "siteName": (material.get("site") or {}).get("siteName"),
                "materialName": material.get("materialName"),
                "quantity": material.get("quantity"),
                "status": material.get("status"),
            }
            for material in _as_list(tracking.get("materials"))[:30]
        ],
        "photoMetadata": [
            {
                "tag": photo.get("tag"),
                "caption": photo.get("caption"),
                "createdAt": photo.get("createdAt"),
                "contentType": photo.get("contentType"),
            }
            for photo in _as_list(tracking.get("photos"))[:20]
        ],
    }


def _build_prompt(context: dict[str, Any], locale: str) -> str:
    language = _LOCALE_NAMES.get(locale, "English")
    return "\n".join(
        [
            "You are an AI project monitoring assistant for a renovation/workshop ERP.",
            f"Answer in {language}.",
            "Use only the JSON tracking context. Do not invent progress, dates, materials, workshops, photos, or issues.",
            "Planned progress, actual progress, progress delta, predicted finish, and delay days are backend-calculated values; explain them but do not recalculate or change them.",
            "Rule-based warnings are the source of truth. Prioritize them in risks and recommended actions.",
            "Photo data is metadata only. Do not claim visual inspection or image analysis.",
            "Return exactly one JSON object with this schema:",
            '{"healthStatus":"healthy|watch|at_risk|blocked","summary":"string","risks":[{"title":"string","severity":"low|medium|high","siteName":"string|null","reason":"string"}],"delays":[{"siteName":"string|null","reason":"string","impact":"string"}],"missingInformation":["string"],"recommendedActions":[{"priority":"low|medium|high","siteName":"string|null","action":"string"}],"assumptions":["string"]}',
            "Tracking context:",
            json.dumps(context, ensure_ascii=False, default=str),
        ]
    )


def _derive_health(warnings: list[dict[str, Any]]) -> str:
    types = {warning.get("type") for warning in warnings}
    severities = {warning.get("severity") for warning in warnings}
    if "blocked_site" in types:
        return "blocked"
    if "high" in severities or "high_issue" in types or "workshop_unavailable" in types:
        return "at_risk"
    if warnings:
        return "watch"
    return "healthy"


def _fallback_summary(context: dict[str, Any], locale: str, health: str) -> str:
    dashboard = context.get("dashboard") or {}
    warning_count = len(_as_list(dashboard.get("warnings")))
    progress = dashboard.get("overallProgressPercent")
    open_issues = dashboard.get("openIssueCount")
    if locale == "ar":
        return f"حالة المشروع {health}. التقدم العام {progress}%، وعدد المشاكل المفتوحة {open_issues}. يوجد {warning_count} تحذير يحتاج متابعة."
    if locale == "de":
        return f"Projektstatus: {health}. Gesamtfortschritt {progress}%, offene Probleme {open_issues}. {warning_count} Warnungen brauchen Pruefung."
    return f"Project health is {health}. Overall progress is {progress}%, with {open_issues} open issues and {warning_count} warnings to review."


def _fallback_analysis(context: dict[str, Any], locale: str, provider: str = "rule_fallback", error: str | None = None) -> dict[str, Any]:
    warnings = _as_list((context.get("dashboard") or {}).get("warnings"))
    health = _derive_health(warnings)
    risks = [
        {
            "title": _text(warning.get("type")).replace("_", " ").title(),
            "severity": warning.get("severity") or "medium",
            "siteName": warning.get("siteName"),
            "reason": warning.get("message") or warning.get("recommendedAction") or "Tracking warning needs review.",
        }
        for warning in warnings
    ]
    actions = [
        {
            "priority": warning.get("severity") or "medium",
            "siteName": warning.get("siteName"),
            "action": warning.get("recommendedAction") or warning.get("message") or "Review this warning.",
        }
        for warning in warnings
    ]
    missing = []
    if any(warning.get("type") == "missing_workshop_schedule" for warning in warnings):
        missing.append("Workshop start/end dates are missing for at least one site.")
    if any(warning.get("type") == "no_workshop_assigned" for warning in warnings):
        missing.append("At least one active site has tracking work without an assigned workshop.")
    return {
        "provider": provider,
        "healthStatus": health,
        "summary": _fallback_summary(context, locale, health),
        "risks": risks,
        "delays": [risk for risk in risks if risk.get("severity") in {"medium", "high"}],
        "missingInformation": missing,
        "recommendedActions": actions,
        "assumptions": ["This analysis is based on rule-based tracking data and photo metadata only."],
        "sourceWarnings": warnings,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "aiError": error,
    }


def _normalize_list_of_dicts(value: Any, allowed_keys: set[str]) -> list[dict[str, Any]]:
    items = []
    for item in _as_list(value):
        if not isinstance(item, dict):
            continue
        items.append({key: item.get(key) for key in allowed_keys})
    return items


def _normalize_analysis(data: dict[str, Any], context: dict[str, Any], locale: str) -> dict[str, Any]:
    warnings = _as_list((context.get("dashboard") or {}).get("warnings"))
    health = _text(data.get("healthStatus"))
    if health not in _VALID_HEALTH:
        health = _derive_health(warnings)
    summary = _text(data.get("summary")) or _fallback_summary(context, locale, health)
    return {
        "provider": "ai",
        "healthStatus": health,
        "summary": summary,
        "risks": _normalize_list_of_dicts(data.get("risks"), {"title", "severity", "siteName", "reason"}),
        "delays": _normalize_list_of_dicts(data.get("delays"), {"siteName", "reason", "impact"}),
        "missingInformation": [_text(item) for item in _as_list(data.get("missingInformation")) if _text(item)],
        "recommendedActions": _normalize_list_of_dicts(data.get("recommendedActions"), {"priority", "siteName", "action"}),
        "assumptions": [_text(item) for item in _as_list(data.get("assumptions")) if _text(item)],
        "sourceWarnings": warnings,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "aiError": None,
    }


def analyze_tracking(tracking: dict[str, Any], locale: str = "en") -> dict[str, Any]:
    normalized_locale = locale if locale in _LOCALE_NAMES else "en"
    context = build_tracking_analysis_context(tracking)
    prompt = _build_prompt(context, normalized_locale)
    try:
        raw = generate_text(prompt, response_mime_type="application/json")
        data = json.loads(_strip_code_fences(raw))
        if not isinstance(data, dict):
            raise ValueError("AI tracking analysis did not return a JSON object.")
        return _normalize_analysis(data, context, normalized_locale)
    except Exception as exc:  # Provider errors should not block tracking monitoring.
        detail = getattr(exc, "detail", None) if isinstance(exc, HTTPException) else None
        error = _text(detail or str(exc))
        logger.warning("AI tracking analysis failed; using rule-based fallback: %s", error)
        return _fallback_analysis(context, normalized_locale, error=error)
