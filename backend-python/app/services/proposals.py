from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Customer, Employee, Order, PaymentRecord, Proposal, ProposalFact, ProposalMessage, ProposalStatus, Site, Workshop, WorkshopSiteAssignment
from ..schemas import ProposalDraftPayload
from ..utils import as_datetime, decimal_or_none, ensure, json_dumps, json_loads
from .gemini_client import generate_text


logger = logging.getLogger(__name__)


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _contains_arabic(text: str) -> bool:
    for char in text:
        codepoint = ord(char)
        if (0x0600 <= codepoint <= 0x06FF) or (0x0750 <= codepoint <= 0x077F) or (0x08A0 <= codepoint <= 0x08FF):
            return True
    return False


def _manager_messages(messages: list[ProposalMessage]) -> list[str]:
    return [message.content for message in messages if message.role == "user" and message.content]


def _latest_manager_message(messages: list[ProposalMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user" and message.content:
            return message.content
    return ""


_GERMAN_HINT_RE = re.compile(
    r"\b(?:und|mit|fuer|f?r|auftrag|angebot|kunde|firma|baustelle|renovierung|sanierung|bitte|treppenhaus|keller|rechnung|stunden|tage|arbeiter|mitarbeiter|maler|trockenbau)\b",
    flags=re.IGNORECASE,
)


def _conversation_language_mode(messages: list[ProposalMessage]) -> str:
    latest_manager_message = _latest_manager_message(messages)
    manager_text = "\n".join(_manager_messages(messages))
    combined_text = f"{latest_manager_message}\n{manager_text}"
    if _contains_arabic(combined_text):
        return "arabic"
    if re.search(r"[\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]", combined_text) or _GERMAN_HINT_RE.search(combined_text):
        return "german"
    return "english"


def _localized_default_site_name(language_mode: str) -> str:
    if language_mode == "arabic":
        return "\u0627\u0644\u0645\u0648\u0642\u0639 1"
    if language_mode == "german":
        return "Baustelle 1"
    return "Site 1"


def _localized_default_order_title(language_mode: str) -> str:
    if language_mode == "arabic":
        return "\u0639\u0631\u0636 \u0645\u0634\u0631\u0648\u0639"
    if language_mode == "german":
        return "Projektangebot"
    return "Project proposal"


def _localized_default_summary(language_mode: str) -> str:
    if language_mode == "arabic":
        return "\u0639\u0631\u0636 \u0645\u0634\u0631\u0648\u0639 \u0645\u0633\u062a\u062e\u0631\u062c \u0645\u0646 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629."
    if language_mode == "german":
        return "Projektangebot aus der Konversation."
    return "Project proposal generated from the conversation."


_SITE_SKILL_HINTS: dict[str, tuple[str, ...]] = {
    "maler": (
        "maler",
        "painting",
        "painter",
        "paint",
        "spachteln",
        "spachtel",
        "schleifen",
        "sanding",
        "putty",
        "plaster",
        "دهان",
        "طلاء",
        "معجون",
        "صنفرة",
    ),
    "trockenbau": (
        "trockenbau",
        "drywall",
        "gypsum",
        "gypsum board",
        "جبس",
        "جبس بورد",
    ),
    "feuchtigkeitsschutz": (
        "feuchtigkeitsschutz",
        "abdichtung",
        "waterproof",
        "waterproofing",
        "moisture",
        "moisture protection",
        "عزل",
        "عزل مائي",
        "رطوبة",
        "حماية من الرطوبة",
    ),
    "flooring": (
        "bodenbelag",
        "flooring",
        "tile",
        "tiles",
        "ceramic",
        "marble",
        "porcelain",
        "parquet",
        "بلاط",
        "أرضيات",
        "سيراميك",
        "رخام",
        "بورسلان",
    ),
    "plumbing": (
        "sanitar",
        "sanitaer",
        "sanitary",
        "plumbing",
        "pipes",
        "drain",
        "صحية",
        "سباكة",
        "مواسير",
        "صرف",
        "حوض",
        "مغسلة",
        "دش",
    ),
    "carpentry": (
        "carpentry",
        "schreinerei",
        "wood",
        "cabinet",
        "cabinets",
        "shelves",
        "mdf",
        "نجارة",
        "خزائن",
        "رفوف",
        "أبواب",
        "مفصلات",
    ),
    "supervision": (
        "supervision",
        "coordination",
        "monitoring",
        "oversight",
        "supervisor",
        "إشراف",
        "متابعة",
        "تنسيق",
    ),
    "electrical": (
        "electrical",
        "electric",
        "elektrik",
        "lighting",
        "led",
        "كهرباء",
        "إنارة",
    ),
    "plastering": (
        "plaster",
        "plastering",
        "putty",
        "plasterer",
        "لياسة",
        "معجون",
    ),
}

_ROLE_CONTINUATION_RE = re.compile(
    r"(?:^|\n)\s*(?:Manager|User|Assistant|Human|System|\u0627\u0644\u0645\u062f\u064a\u0631|\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645|\u0627\u0644\u0645\u0633\u0627\u0639\u062f)\s*[:\uff1a]",
    flags=re.IGNORECASE,
)
_LEADING_ASSISTANT_LABEL_RE = re.compile(
    r"^\s*(?:Assistant|\u0627\u0644\u0645\u0633\u0627\u0639\u062f)\s*[:\uff1a]\s*",
    flags=re.IGNORECASE,
)
_LEADING_LANGUAGE_META_RE = re.compile(
    r"^\s*(?:(?:\u0644?\u0644?\u0631\u062f|\u0627\u0644\u0631\u062f)\s+\u0628\u0627\u0644\u0644\u063a\u0629\s+\u0627\u0644\u0639\u0631\u0628\u064a\u0629|\u0628\u0627\u0644\u0644\u063a\u0629\s+\u0627\u0644\u0639\u0631\u0628\u064a\u0629|In\s+Arabic|Arabic\s+reply|Auf\s+Deutsch|German\s+reply)\s*[:\uff1a]\s*",
    flags=re.IGNORECASE,
)
_PHONE_CANDIDATE_RE = re.compile(
    r"(?<![\w@])(?:\+|[0-9\u0660-\u0669\u06f0-\u06f9])(?:[0-9\u0660-\u0669\u06f0-\u06f9\s()./\-]{5,}[0-9\u0660-\u0669\u06f0-\u06f9])"
)
_DIGIT_TRANSLATION = str.maketrans(
    "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9",
    "01234567890123456789",
)


def _normalized_phone_digits(value: str) -> str:
    return re.sub(r"\D", "", value.translate(_DIGIT_TRANSLATION))


def _looks_like_phone_number(raw_value: str) -> bool:
    digits = _normalized_phone_digits(raw_value)
    if len(digits) < 7:
        return False
    if re.fullmatch(r"[0-9\u0660-\u0669\u06f0-\u06f9]{1,2}[-/][0-9\u0660-\u0669\u06f0-\u06f9]{1,2}[-/][0-9\u0660-\u0669\u06f0-\u06f9]{2,4}", raw_value.strip()):
        return False
    return raw_value.strip().startswith("+") or digits.startswith(("0", "00", "49", "963"))


def _phone_is_allowed(digits: str, allowed_numbers: set[str]) -> bool:
    if digits in allowed_numbers:
        return True
    if len(digits) >= 7:
        return any(digits.endswith(allowed[-7:]) or allowed.endswith(digits[-7:]) for allowed in allowed_numbers if len(allowed) >= 7)
    return False


def _clean_phone_artifacts(text: str) -> str:
    cleaned_lines: list[str] = []
    for line in text.splitlines():
        line = re.sub(r"([:?])\s*[,?;?]+\s*", r"\1 ", line)
        line = re.sub(r"\s+([,?;?])", r"\1", line)
        line = re.sub(r"([,?;?])\s*([,?;?])+", r"\1", line)
        line = re.sub(r"[,?;?]\s*$", "", line).rstrip()
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def _strip_unsupported_phone_numbers(text: str, source_text: str | None) -> str:
    if not source_text:
        return text
    allowed_numbers = {
        digits
        for match in _PHONE_CANDIDATE_RE.finditer(source_text)
        if _looks_like_phone_number(match.group(0))
        for digits in [_normalized_phone_digits(match.group(0))]
        if digits
    }
    if not allowed_numbers:
        return text

    def replace(match: re.Match[str]) -> str:
        raw_value = match.group(0)
        if not _looks_like_phone_number(raw_value):
            return raw_value
        digits = _normalized_phone_digits(raw_value)
        return raw_value if _phone_is_allowed(digits, allowed_numbers) else ""

    return _clean_phone_artifacts(_PHONE_CANDIDATE_RE.sub(replace, text))


def intake_assistant_source_text(proposal: Proposal) -> str:
    """Facts that the assistant is allowed to repeat verbatim in the next chat reply."""
    parts: list[str] = []
    for value in (
        proposal.customer_company_name,
        proposal.customer_street,
        proposal.customer_zip_code,
        proposal.customer_city,
        proposal.contact_name,
        proposal.contact_phone,
        proposal.contact_email,
        proposal.order_title,
        proposal.summary,
    ):
        if value:
            parts.append(str(value))
    for message in proposal.messages:
        if message.role != "assistant" and message.content:
            parts.append(message.content)
    for fact in proposal.facts:
        if fact.is_active and fact.value_json:
            parts.append(fact.value_json)
    return "\n".join(parts)


def sanitize_intake_assistant_reply(text: str, source_text: str | None = None) -> str:
    """Keep only the next assistant reply, not hallucinated transcript turns."""
    candidate = text.strip()
    for _ in range(2):
        candidate = _LEADING_ASSISTANT_LABEL_RE.sub("", candidate)
        candidate = _LEADING_LANGUAGE_META_RE.sub("", candidate)
    match = _ROLE_CONTINUATION_RE.search(candidate)
    if match:
        candidate = candidate[: match.start()]
    candidate = _strip_unsupported_phone_numbers(candidate, source_text)
    return candidate.strip()


_PROJECT_CONTEXT_HINTS = (
    "project",
    "renovation",
    "renovate",
    "projekt",
    "sanierung",
    "renovierung",
    "\u0645\u0634\u0631\u0648\u0639",
    "\u062a\u0631\u0645\u064a\u0645",
)

_WORK_AREA_HINTS: tuple[tuple[str, tuple[str, ...], dict[str, str]], ...] = (
    (
        "kitchen",
        ("kitchen", "kuche", "kueche", "\u0645\u0637\u0628\u062e", "\u0627\u0644\u0645\u0637\u0628\u062e"),
        {"arabic": "\u0627\u0644\u0645\u0637\u0628\u062e", "german": "Kueche", "english": "kitchen"},
    ),
    (
        "bathroom",
        ("bathroom", "bath", "bad", "\u062d\u0645\u0627\u0645", "\u0627\u0644\u062d\u0645\u0627\u0645"),
        {"arabic": "\u0627\u0644\u062d\u0645\u0627\u0645", "german": "Bad", "english": "bathroom"},
    ),
    (
        "balcony",
        ("balcony", "terrace", "balkon", "\u0628\u0631\u0646\u062f\u0627", "\u0627\u0644\u0628\u0631\u0646\u062f\u0627", "\u0634\u0631\u0641\u0629", "\u0627\u0644\u0634\u0631\u0641\u0629"),
        {"arabic": "\u0627\u0644\u0628\u0631\u0646\u062f\u0627", "german": "Balkon", "english": "balcony"},
    ),
    (
        "living_room",
        ("living room", "wohnzimmer", "\u063a\u0631\u0641\u0629 \u0627\u0644\u0645\u0639\u064a\u0634\u0629", "\u063a\u0631\u0641\u0629 \u0627\u0644\u0642\u0639\u062f\u0629", "\u0635\u0627\u0644\u0648\u0646"),
        {"arabic": "\u063a\u0631\u0641\u0629 \u0627\u0644\u0645\u0639\u064a\u0634\u0629", "german": "Wohnzimmer", "english": "living room"},
    ),
    (
        "entrance",
        ("entrance", "entry", "eingang", "\u0645\u062f\u062e\u0644", "\u0627\u0644\u0645\u062f\u062e\u0644"),
        {"arabic": "\u0627\u0644\u0645\u062f\u062e\u0644", "german": "Eingang", "english": "entrance"},
    ),
)


def _mentioned_work_areas(text: str, language_mode: str) -> list[str]:
    normalized = _normalize_match_text(text)
    areas: list[str] = []
    for _key, hints, labels in _WORK_AREA_HINTS:
        if any(_normalize_match_text(hint) in normalized for hint in hints):
            areas.append(labels.get(language_mode) or labels["english"])
    return _dedupe_strings(areas)


_SKILL_REPLY_LABELS: dict[str, dict[str, str]] = {
    "flooring": {"arabic": "\u0623\u0631\u0636\u064a\u0627\u062a/\u0628\u0644\u0627\u0637", "german": "Boden/Fliesen", "english": "flooring/tiles"},
    "maler": {"arabic": "\u062f\u0647\u0627\u0646", "german": "Malerarbeiten", "english": "painting"},
    "plumbing": {"arabic": "\u0623\u0639\u0645\u0627\u0644 \u0635\u062d\u064a\u0629", "german": "Sanitaer", "english": "plumbing"},
    "feuchtigkeitsschutz": {"arabic": "\u0639\u0632\u0644", "german": "Abdichtung", "english": "waterproofing"},
    "carpentry": {"arabic": "\u0646\u062c\u0627\u0631\u0629", "german": "Schreinerarbeiten", "english": "carpentry"},
    "electrical": {"arabic": "\u0643\u0647\u0631\u0628\u0627\u0621", "german": "Elektro", "english": "electrical"},
    "trockenbau": {"arabic": "\u062c\u0628\u0633 \u0628\u0648\u0631\u062f", "german": "Trockenbau", "english": "drywall"},
}

def _localized_skill_labels(skills: list[str], language_mode: str) -> list[str]:
    labels: list[str] = []
    for skill in skills:
        label = _SKILL_REPLY_LABELS.get(skill, {}).get(language_mode) or _SKILL_REPLY_LABELS.get(skill, {}).get("english") or skill
        labels.append(label)
    return _dedupe_strings(labels)


def _latest_scope_turn_guidance(messages: list[ProposalMessage], language_mode: str) -> list[str]:
    manager_messages = _manager_messages(messages)
    if not manager_messages:
        return []

    manager_text = "\n".join(manager_messages).strip()
    latest_text = manager_messages[-1].strip()
    latest_skills = _infer_skills_from_text(latest_text)
    mentioned_areas = _mentioned_work_areas(manager_text, language_mode)
    guidance: list[str] = []

    if latest_skills:
        skill_labels = _localized_skill_labels(latest_skills, language_mode)
        if language_mode == "arabic":
            guidance.append("\u0622\u062e\u0631 \u0631\u0633\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u062f\u064a\u0631 \u062a\u062d\u062a\u0648\u064a \u0646\u0648\u0639 \u0639\u0645\u0644 \u0648\u0627\u0636\u062d\u061b \u0644\u0627 \u062a\u0633\u0623\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649: \u0645\u0627 \u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u061f")
            guidance.append("\u0627\u0639\u062a\u0631\u0641 \u0628\u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0641\u0647\u0648\u0645\u0629 \u0645\u0646 \u0622\u062e\u0631 \u0631\u0633\u0627\u0644\u0629: " + "\u060c ".join(skill_labels) + ".")
            if mentioned_areas:
                guidance.append("\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629 \u062d\u062a\u0649 \u0627\u0644\u0622\u0646: " + "\u060c ".join(mentioned_areas) + ".")
            guidance.append("\u0627\u0633\u0623\u0644 \u0641\u0642\u0637 \u0639\u0646 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u0627\u0644\u0639\u0645\u0644\u064a\u0629 \u0645\u062b\u0644 \u0627\u0644\u0645\u0627\u062f\u0629/\u0627\u0644\u0645\u0642\u0627\u0633/\u0627\u0644\u062a\u0634\u0637\u064a\u0628/\u0627\u0644\u0648\u0631\u0634\u0629\u060c \u0648\u0628\u062d\u062f \u0623\u0642\u0635\u0649 \u0633\u0624\u0627\u0644\u064a\u0646 \u0623\u0648 \u062b\u0644\u0627\u062b\u0629.")
        elif language_mode == "german":
            guidance.append("The latest manager message already contains concrete work types; do not ask again which work type is required.")
            guidance.append("Acknowledge the understood work types: " + ", ".join(skill_labels) + ".")
            if mentioned_areas:
                guidance.append("Known work areas so far: " + ", ".join(mentioned_areas) + ".")
            guidance.append("Ask only for practical missing details such as material, size, finish, or workshop, maximum two or three questions.")
        else:
            guidance.append("The latest manager message already contains concrete work types; do not ask again which work type is required.")
            guidance.append("Acknowledge the understood work types: " + ", ".join(skill_labels) + ".")
            if mentioned_areas:
                guidance.append("Known work areas so far: " + ", ".join(mentioned_areas) + ".")
            guidance.append("Ask only for practical missing details such as material, size, finish, or workshop, maximum two or three questions.")
    elif mentioned_areas and not _infer_skills_from_text(manager_text):
        if language_mode == "arabic":
            guidance.append("\u0627\u0644\u0645\u062f\u064a\u0631 \u0630\u0643\u0631 \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644 \u0641\u0642\u0637 \u0648\u0644\u0645 \u064a\u0630\u0643\u0631 \u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644 \u0628\u0639\u062f\u061b \u0627\u0633\u0623\u0644 \u0639\u0646 \u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644 \u0644\u0643\u0644 \u0645\u0646\u0637\u0642\u0629 \u0641\u0642\u0637 \u0648\u0644\u0627 \u062a\u0633\u0623\u0644 \u0639\u0646 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 \u0645\u0646 \u062c\u062f\u064a\u062f.")
        else:
            guidance.append("The manager mentioned work areas only and no work types yet; ask only for the work type per area and do not ask for basic project data again.")

    return guidance


def maybe_build_scope_first_reply(proposal: Proposal, messages: list[ProposalMessage]) -> str | None:
    """Return a deterministic first follow-up when project basics exist but scope is still unknown."""
    manager_text = "\n".join(_manager_messages(messages)).strip()
    if not manager_text:
        return None

    language_mode = _conversation_language_mode(messages)
    mentioned_areas = _mentioned_work_areas(manager_text, language_mode)
    manager_messages = _manager_messages(messages)
    last_manager_text = manager_messages[-1] if manager_messages else ""
    last_message_skills = _infer_skills_from_text(last_manager_text)
    if last_message_skills:
        skill_labels = _localized_skill_labels(last_message_skills, language_mode)
        areas_text = "\u060c ".join(mentioned_areas) if mentioned_areas else "\u0627\u0644\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629"
        skills_text = "\u060c ".join(skill_labels)
        if language_mode == "arabic":
            return (
                f"\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u062a\u062d\u062f\u064a\u062b \u0646\u0637\u0627\u0642 \u0627\u0644\u0639\u0645\u0644: {areas_text}.\n"
                f"\u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062a\u064a \u0641\u0647\u0645\u062a\u0647\u0627: {skills_text}.\n\n"
                "\u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u0641\u0642\u0637: \u0645\u0627 \u0645\u0627\u062f\u0629/\u0646\u0648\u0639 \u0627\u0644\u062a\u0634\u0637\u064a\u0628 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629\u061f \u0648\u0647\u0644 \u062a\u0648\u062c\u062f \u0648\u0631\u0634\u0629 \u0645\u062d\u062f\u062f\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0623\u0645 \u0646\u062a\u0631\u0643\u0647\u0627 \u0643\u0640 \u0648\u0631\u0634\u0629 \u0645\u0637\u0644\u0648\u0628\u0629\u061f"
            )
        if language_mode == "german":
            return (
                f"Der Leistungsumfang wurde aktualisiert: {areas_text}.\n"
                f"Erfasste Arbeiten: {skills_text}.\n\n"
                "Welche Materialien/Oberflaechen sind gewuenscht, und gibt es dafuer bereits eine bestimmte Werkstatt?"
            )
        return (
            f"The scope was updated for: {areas_text}.\n"
            f"Understood work types: {skills_text}.\n\n"
            "Which material/finish is required, and is there a specific workshop for this work or should it stay as workshop needed?"
        )

    normalized = _normalize_match_text(manager_text)
    has_project_context = any(_normalize_match_text(hint) in normalized for hint in _PROJECT_CONTEXT_HINTS)
    if not has_project_context:
        return None

    if _infer_skills_from_text(manager_text):
        return None

    if mentioned_areas:
        if language_mode == "arabic":
            return (
                "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644: "
                + "\u060c ".join(mentioned_areas)
                + ".\n\n\u0645\u0627 \u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0641\u064a \u0643\u0644 \u0645\u0646\u0637\u0642\u0629\u061f "
                "\u0645\u062b\u0644\u0627\u064b: \u0628\u0644\u0627\u0637\u060c \u062f\u0647\u0627\u0646\u060c \u0623\u0639\u0645\u0627\u0644 \u0635\u062d\u064a\u0629\u060c \u0639\u0632\u0644\u060c \u0623\u0648 \u0646\u062c\u0627\u0631\u0629."
            )
        if language_mode == "german":
            return (
                "Die Arbeitsbereiche wurden erfasst: "
                + ", ".join(mentioned_areas)
                + ".\n\nWelche Arbeiten sind pro Bereich erforderlich? Zum Beispiel Boden, Malerarbeiten, Sanitaer, Abdichtung oder Schreinerarbeiten."
            )
        return (
            "The work areas have been recorded: "
            + ", ".join(mentioned_areas)
            + ".\n\nWhat work type is required for each area? For example: flooring, painting, plumbing, waterproofing, or carpentry."
        )

    if language_mode == "arabic":
        return (
            "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 \u0627\u0644\u062a\u064a \u0630\u0643\u0631\u062a\u0647\u0627.\n\n"
            "\u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644\u060c \u0645\u0627 \u0647\u064a \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644 \u0648\u0646\u0648\u0639 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0641\u064a \u0643\u0644 \u0645\u0646\u0637\u0642\u0629\u061f\n"
            "\u0645\u062b\u0644\u0627\u064b: \u0627\u0644\u0645\u0637\u0628\u062e\u060c \u0627\u0644\u062d\u0645\u0627\u0645\u060c \u063a\u0631\u0641\u0629 \u0627\u0644\u0645\u0639\u064a\u0634\u0629\u060c \u0645\u0639 \u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644 \u0645\u062b\u0644 \u0623\u0631\u0636\u064a\u0627\u062a\u060c \u062f\u0647\u0627\u0646\u060c \u0623\u0639\u0645\u0627\u0644 \u0635\u062d\u064a\u0629 \u0623\u0648 \u0639\u0632\u0644."
        )
    if language_mode == "german":
        return (
            "Die grundlegenden Projektdaten wurden erfasst.\n\n"
            "Welche Arbeitsbereiche und Arbeiten sollen pro Bereich erfasst werden?\n"
            "Zum Beispiel: Kueche, Bad, Wohnzimmer, mit Arbeiten wie Boden, Malerarbeiten, Sanitaer oder Abdichtung."
        )
    return (
        "The basic project information has been recorded.\n\n"
        "To continue, which work areas and work types are required for each area?\n"
        "For example: kitchen, bathroom, living room, with work such as flooring, painting, plumbing, or waterproofing."
    )


def construction_scope_guidance() -> str:
    """Hidden renovation checklist used only to guide AI scope questions and proposals."""
    return "\n".join(
        [
            "Construction scope checklist / \u0642\u0627\u0626\u0645\u0629 \u062a\u062f\u0642\u064a\u0642 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062a\u0631\u0645\u064a\u0645 (hidden guidance, not UI text):",
            "- Flooring/tile / \u0627\u0644\u0628\u0644\u0627\u0637 \u0648\u0627\u0644\u0623\u0631\u0636\u064a\u0627\u062a: material granite/ceramic/marble/porcelain/parquet; tile size; stairs/edges/corners; remove old flooring vs install over old; normal/leveled/decorative installation.",
            "- Painting / \u0627\u0644\u062f\u0647\u0627\u0646: simple paint without putty; partial/full putty; decorative texture/glitter/antique/epoxy; number of coats; interior vs exterior/facade.",
            "- Electrical / \u0627\u0644\u0643\u0647\u0631\u0628\u0627\u0621: full rewiring vs added points; standard/smart panel; LED decorative/standard lighting; internet/cameras/fire alarm; smart controls.",
            "- Plumbing/sanitary / \u0627\u0644\u0635\u062d\u064a\u0629: fixture replacement only; full/partial water and drainage pipes; standard/mid/luxury quality; central/separate heaters; filtration/desalination.",
            "- Aluminum/carpentry / \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0646\u062c\u0627\u0631\u0629: aluminum windows with/without shutters; single/double glazing; glass/iron/MDF/PVC; built-in cabinets; railings/fences/gates.",
            "- Insulation / \u0627\u0644\u0639\u0632\u0644: waterproofing for roofs/bathrooms/kitchens/balconies; thermal foam/XPS/walls/roofs/panels; sound insulation; bitumen/foam/compressed boards.",
            "- Gypsum/decor / \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062c\u0628\u0633 \u0648\u0627\u0644\u062f\u064a\u0643\u0648\u0631: flat/decorative gypsum ceilings; cornices; gypsum board partitions; fireplace/facade decor.",
            "- Civil/structural renovation / \u0623\u0639\u0645\u0627\u0644 \u0645\u062f\u0646\u064a\u0629 \u0648\u0647\u064a\u0643\u0644\u064a\u0629: cracks in walls/ceilings; column/beam reinforcement with engineering review; demolition/openings/arches; facade renovation and external insulation.",
            "Use this checklist selectively: do not ask every checklist question at once; ask only relevant missing items; ask maximum 2-4 practical follow-up questions per reply; never invent materials, quantities, grades, or installation methods.",
            "For proposals, include known checklist details in site notes/orderDescription and mark important missing details as to be confirmed.",
        ]
    )


def _strip_json_code_fence(text: str) -> str:
    candidate = text.strip()
    if not candidate.startswith("```"):
        return candidate
    lines = candidate.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_json_object(text: str) -> dict[str, Any]:
    candidate = _strip_json_code_fence(text)
    try:
        data = json.loads(candidate)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise HTTPException(status_code=502, detail="AI provider did not return a valid JSON object.")

    try:
        data = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AI provider returned malformed JSON.") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI provider JSON response was not an object.")
    return data


def _distribute_hours(total_hours: float, buckets: int) -> list[float]:
    if buckets <= 0:
        return []
    if total_hours <= 0:
        return [0.0 for _ in range(buckets)]

    rounded_total = round(float(total_hours), 2)
    base_value = round(rounded_total / buckets, 2)
    values = [base_value for _ in range(buckets)]
    correction = round(rounded_total - sum(values), 2)
    values[-1] = round(values[-1] + correction, 2)
    return values


class ExtractedProposalSite(BaseModel):
    siteName: str
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
    coverageType: str | None = None
    resourceStrategy: str | None = None

    @field_validator("requiredSkills", "requiredCertifications", "workshopCoveredSkills", mode="before")
    @classmethod
    def _coerce_list_fields(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return list(value)

    @field_validator("recommendedHeadcount", "selectedInternalHeadcount", mode="before")
    @classmethod
    def _coerce_optional_headcount(cls, value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return None

    @field_validator("coverageType", mode="before")
    @classmethod
    def _normalize_coverage_type(cls, value: Any) -> str | None:
        normalized = str(value or "").strip().lower()
        if normalized in {"internal_only", "mixed_with_workshop", "workshop_only"}:
            return normalized
        return None


class ExtractedPaymentDraft(BaseModel):
    type: str = "deposit"
    status: str = "planned"
    amount: float | None = None
    currency: str = "EUR"
    dueDate: datetime | None = None
    paidDate: datetime | None = None
    method: str | None = None
    reference: str | None = None
    notes: str | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def _default_currency(cls, value: Any) -> str:
        return str(value or "EUR").strip().upper() or "EUR"


class ExtractedExternalWorkshop(BaseModel):
    name: str
    contactName: str | None = None
    phone: str | None = None
    email: str | None = None
    specialties: list[str] = Field(default_factory=list)
    suggestedFor: list[str] = Field(default_factory=list)
    relationshipStatus: str = "known"
    notes: str | None = None

    @field_validator("specialties", "suggestedFor", mode="before")
    @classmethod
    def _coerce_lists(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return [str(item).strip() for item in list(value) if str(item).strip()]


class ExtractedProposal(BaseModel):
    customerCompanyName: str | None = None
    customerStreet: str | None = None
    customerZipCode: str | None = None
    customerCity: str | None = None
    customerCountry: str | None = "DE"
    contactName: str | None = None
    contactPhone: str | None = None
    contactEmail: str | None = None
    summary: str
    orderTitle: str
    orderDescription: str | None = None
    proposedSites: list[ExtractedProposalSite] = Field(default_factory=list)
    requiredSkills: list[str] = Field(default_factory=list)
    requiredCertifications: list[str] = Field(default_factory=list)
    preferredStartDate: datetime | None = None
    preferredEndDate: datetime | None = None
    estimatedHours: float | None = None
    currency: str = "EUR"
    paymentDrafts: list[ExtractedPaymentDraft] = Field(default_factory=list)
    externalWorkshops: list[ExtractedExternalWorkshop] = Field(default_factory=list)
    staffingPlan: dict[str, Any] | None = None

    @field_validator("proposedSites", "requiredSkills", "requiredCertifications", "paymentDrafts", "externalWorkshops", mode="before")
    @classmethod
    def _coerce_collection_fields(cls, value: Any) -> list[Any]:
        if value is None:
            return []
        return list(value)

    @field_validator("customerCountry", mode="before")
    @classmethod
    def _default_country(cls, value: Any) -> str:
        if value is None or str(value).strip() == "":
            return "DE"
        return str(value).strip().upper()

    @field_validator("currency", mode="before")
    @classmethod
    def _default_currency(cls, value: Any) -> str:
        if value is None or str(value).strip() == "":
            return "EUR"
        return str(value).strip().upper()

    @model_validator(mode="after")
    def _fill_missing_site_hours(self) -> "ExtractedProposal":
        total_hours = float(self.estimatedHours or 0)
        if total_hours <= 0 or not self.proposedSites:
            return self

        known_indices: list[int] = []
        missing_indices: list[int] = []
        known_total = 0.0

        for index, site in enumerate(self.proposedSites):
            try:
                hours = float(site.estimatedHours) if site.estimatedHours is not None else None
            except (TypeError, ValueError):
                hours = None

            if hours is None or hours <= 0:
                missing_indices.append(index)
            else:
                known_indices.append(index)
                known_total += hours

        if not missing_indices:
            return self

        if known_total <= 0:
            allocations = _distribute_hours(total_hours, len(self.proposedSites))
            for index, hours in enumerate(allocations):
                self.proposedSites[index].estimatedHours = hours
            return self

        remaining = round(total_hours - known_total, 2)
        if remaining <= 0:
            return self

        allocations = _distribute_hours(remaining, len(missing_indices))
        for index, hours in zip(missing_indices, allocations):
            self.proposedSites[index].estimatedHours = hours
        return self


FACT_CATEGORIES = {
    "customer",
    "contact",
    "project",
    "site",
    "work_package",
    "contractor_workshop",
    "external_team",
    "workshop_need",
    "payment",
    "open_question",
}


class ExtractedFact(BaseModel):
    category: str
    key: str
    value: Any
    confidence: float | None = 0.7
    sourceMessageIds: list[str] = Field(default_factory=list)

    @field_validator("category", mode="before")
    @classmethod
    def _normalize_category(cls, value: Any) -> str:
        normalized = str(value or "").strip().lower()
        return normalized if normalized in FACT_CATEGORIES else "project"

    @field_validator("key", mode="before")
    @classmethod
    def _normalize_key(cls, value: Any) -> str:
        return str(value or "fact").strip() or "fact"

    @field_validator("sourceMessageIds", mode="before")
    @classmethod
    def _coerce_sources(cls, value: Any) -> list[str]:
        if value is None:
            return []
        return [str(item) for item in list(value)]


class ExtractedMemory(BaseModel):
    facts: list[ExtractedFact] = Field(default_factory=list)
    memorySummary: dict[str, Any] = Field(default_factory=dict)
    paymentDrafts: list[ExtractedPaymentDraft] = Field(default_factory=list)
    externalWorkshops: list[ExtractedExternalWorkshop] = Field(default_factory=list)
    staffingPlan: dict[str, Any] | None = None

    @field_validator("facts", "paymentDrafts", "externalWorkshops", mode="before")
    @classmethod
    def _coerce_collections(cls, value: Any) -> list[Any]:
        if value is None:
            return []
        return list(value)


def _chat_lines(messages: list[ProposalMessage]) -> str:
    lines: list[str] = []
    for message in messages:
        role = "Manager" if message.role == "user" else "Assistant"
        lines.append(f"{role}: {message.content}")
    return "\n".join(lines)


def _safe_json(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (dict, list)):
        return value
    return json_loads(str(value), default)


def _facts_for_prompt(proposal: Proposal) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for fact in getattr(proposal, "facts", []) or []:
        if not fact.is_active:
            continue
        result.append(
            {
                "category": fact.category,
                "key": fact.fact_key,
                "value": _safe_json(fact.value_json, None),
                "confidence": float(fact.confidence or 0),
            }
        )
    return result


def build_memory_extraction_prompt(proposal: Proposal, messages: list[ProposalMessage]) -> str:
    schema = {
        "facts": [
            {
                "category": "customer|contact|project|site|work_package|contractor_workshop|external_team|workshop_need|payment|open_question",
                "key": "short stable key",
                "value": "string, number, object, or array",
                "confidence": "0.0-1.0",
                "sourceMessageIds": ["message ids if known"],
            }
        ],
        "memorySummary": {
            "customer": "object|null",
            "project": "object|null",
            "sites": ["object"],
            "contractorWorkshops": ["object"],
            "payments": ["object"],
            "openQuestions": ["string"],
        },
        "paymentDrafts": [
            {
                "type": "deposit|advance|installment|final|other",
                "status": "planned|received|refunded|canceled",
                "amount": "number|null",
                "currency": "string",
                "dueDate": "ISO-8601 datetime|null",
                "paidDate": "ISO-8601 datetime|null",
                "method": "string|null",
                "reference": "string|null",
                "notes": "string|null",
            }
        ],
        "externalWorkshops": [
            {
                "name": "string",
                "contactName": "string|null",
                "phone": "string|null",
                "email": "string|null",
                "specialties": ["string"],
                "suggestedFor": ["site or work package name"],
                "relationshipStatus": "known|preferred|one_time|blocked",
                "notes": "string|null",
            }
        ],
        "staffingPlan": "null",
    }
    return "\n".join(
        [
            "Extract isolated memory for this one ERP intake chat only.",
            "Return only valid JSON. Do not wrap it in markdown.",
            "Do not use knowledge from any other chat, customer, or proposal.",
            "Contractor context: the customer/contractor may mention workshops they already work with. If a workshop is an external team/subcontractor/company, put it in externalWorkshops and contractor_workshop/external_team facts. If it is a physical work area, room, site, or task package, put it in site/work_package facts instead.",
            "Payments: capture deposits, advance payments, installments, paid amounts, due payments, methods, and references.",
            "This business executes projects through external workshops/subcontractors. Never ask for or invent internal employees or internal headcount. Store required workshop trades and external teams mentioned by the manager.",
            "staffingPlan must always be null. If execution responsibility is missing, store it as workshop_need / workshop to be selected, not as internal staffing.",
            f"Required JSON schema: {json.dumps(schema, ensure_ascii=True)}",
            "",
            "Current proposal id:",
            proposal.id,
            "",
            "Transcript for this intake only:",
            _chat_lines(messages),
        ]
    )


def _json_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _normalize_payment_drafts(raw_items: list[Any]) -> list[dict[str, Any]]:
    allowed_types = {"deposit", "advance", "installment", "final", "other"}
    allowed_statuses = {"planned", "received", "refunded", "canceled"}
    result: list[dict[str, Any]] = []
    for item in raw_items:
        if hasattr(item, "model_dump"):
            data = item.model_dump()
        elif isinstance(item, dict):
            data = dict(item)
        else:
            continue
        payment_type = str(data.get("type") or "deposit").strip().lower()
        status = str(data.get("status") or "planned").strip().lower()
        result.append(
            {
                "type": payment_type if payment_type in allowed_types else "other",
                "status": status if status in allowed_statuses else "planned",
                "amount": data.get("amount"),
                "currency": str(data.get("currency") or "EUR").strip().upper() or "EUR",
                "dueDate": _json_date(data.get("dueDate")),
                "paidDate": _json_date(data.get("paidDate")),
                "method": data.get("method") or None,
                "reference": data.get("reference") or None,
                "notes": data.get("notes") or None,
            }
        )
    return result


def _normalize_external_workshops(raw_items: list[Any]) -> list[dict[str, Any]]:
    allowed_statuses = {"known", "preferred", "one_time", "blocked"}
    result: list[dict[str, Any]] = []
    for item in raw_items:
        if hasattr(item, "model_dump"):
            data = item.model_dump()
        elif isinstance(item, dict):
            data = dict(item)
        else:
            continue
        name = str(data.get("name") or "").strip()
        if not name:
            continue
        relationship_status = str(data.get("relationshipStatus") or "known").strip().lower()
        result.append(
            {
                "name": name,
                "contactName": data.get("contactName") or None,
                "phone": data.get("phone") or None,
                "email": data.get("email") or None,
                "specialties": _dedupe_strings([str(value) for value in data.get("specialties") or []]),
                "suggestedFor": _dedupe_strings([str(value) for value in data.get("suggestedFor") or []]),
                "relationshipStatus": relationship_status if relationship_status in allowed_statuses else "known",
                "notes": data.get("notes") or None,
            }
        )
    return result


def clear_proposal_memory(db: Session, proposal: Proposal) -> None:
    db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).delete(synchronize_session=False)
    proposal.memory_summary_json = None
    proposal.payment_drafts_json = None
    proposal.external_workshops_json = None
    proposal.staffing_plan_json = None
    db.add(proposal)
    db.flush()


def _add_local_fact(facts: list[ExtractedFact], category: str, key: str, value: Any, message_id: str) -> None:
    facts.append(
        ExtractedFact(
            category=category,
            key=key,
            value=value,
            confidence=0.6,
            sourceMessageIds=[message_id] if message_id else [],
        )
    )


def refresh_proposal_memory_locally(db: Session, proposal: Proposal, messages: list[ProposalMessage]) -> None:
    """Cheap fallback memory pass that avoids an extra Gemini request per chat message."""
    if not messages:
        clear_proposal_memory(db, proposal)
        return

    facts: list[ExtractedFact] = []
    payment_drafts: list[dict[str, Any]] = []
    external_workshops: list[dict[str, Any]] = []
    open_questions: list[str] = []

    for message in messages:
        if message.role != "user" or not message.content:
            continue
        content = message.content.strip()
        lower = content.lower()
        emails = re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", content, flags=re.IGNORECASE)
        for email in emails:
            _add_local_fact(facts, "contact", "email", email, message.id)

        phones = re.findall(r"(?:\+?\d[\d\s()./-]{5,}\d)", content)
        for phone in phones[:3]:
            _add_local_fact(facts, "contact", "phone", phone.strip(), message.id)

        payment_terms = [
            "deposit",
            "advance",
            "anzahlung",
            "vorauszahlung",
            "\u062f\u0641\u0639\u0629",
            "\u0639\u0631\u0628\u0648\u0646",
            "\u0645\u0642\u062f\u0645",
            "\u0639 \u0627\u0644\u062d\u0633\u0627\u0628",
        ]
        if any(term in lower for term in payment_terms):
            amount_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(eur|euro|usd|dollar|\$)", content, flags=re.IGNORECASE)
            if not amount_match:
                amount_match = re.search(r"(eur|euro|usd|dollar|\$)\s*(\d+(?:[.,]\d+)?)", content, flags=re.IGNORECASE)
            amount = None
            currency = "EUR"
            if amount_match:
                groups = [group for group in amount_match.groups() if group]
                number_value = next((group for group in groups if re.match(r"^\d", group)), None)
                currency_value = next((group for group in groups if not re.match(r"^\d", group)), "EUR")
                amount = float(str(number_value).replace(",", ".")) if number_value else None
                currency = "USD" if str(currency_value).lower() in {"usd", "dollar", "$"} else "EUR"
            draft = {
                "type": "deposit" if any(term in lower for term in ["deposit", "anzahlung", "\u062f\u0641\u0639\u0629", "\u0639\u0631\u0628\u0648\u0646", "\u0645\u0642\u062f\u0645"]) else "advance",
                "status": "received" if any(term in lower for term in ["paid", "received", "bezahlt", "gezahlt", "\u0627\u062e\u062f", "\u0623\u062e\u0630", "\u0627\u0633\u062a\u0644\u0645"]) else "planned",
                "amount": amount,
                "currency": currency,
                "dueDate": None,
                "paidDate": None,
                "method": "bank transfer" if any(term in lower for term in ["bank", "transfer", "ueberweisung", "\u00fcberweisung", "\u062a\u062d\u0648\u064a\u0644"]) else None,
                "reference": None,
                "notes": content[:500],
            }
            payment_drafts.append(draft)
            _add_local_fact(facts, "payment", draft["type"], draft, message.id)

        workshop_terms = [
            "workshop",
            "subcontractor",
            "external team",
            "subunternehmer",
            "\u0648\u0631\u0634\u0629",
            "\u0648\u0631\u0634",
            "\u0641\u0631\u064a\u0642 \u062e\u0627\u0631\u062c\u064a",
            "\u0645\u0642\u0627\u0648\u0644 \u0641\u0631\u0639\u064a",
        ]
        if any(term in lower for term in workshop_terms):
            name_match = re.search("(?:named|called|name is|\u0627\u0633\u0645\u0647\u0627|\u0627\u0633\u0645\u0647|\u0627\u0633\u0645)\\s+([^,.\\n]+)", content, flags=re.IGNORECASE)
            name = name_match.group(1).strip() if name_match else "External workshop/team"
            workshop = {
                "name": name[:120],
                "contactName": None,
                "phone": None,
                "email": emails[0] if emails else None,
                "specialties": [],
                "suggestedFor": [],
                "relationshipStatus": "known",
                "notes": content[:500],
            }
            external_workshops.append(workshop)
            _add_local_fact(facts, "contractor_workshop", "external_workshop", workshop, message.id)

        if "?" in content or "?" in content:
            open_questions.append(content[:300])

    db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).delete(synchronize_session=False)
    for fact in facts:
        db.add(
            ProposalFact(
                proposal_id=proposal.id,
                category=fact.category,
                fact_key=fact.key,
                value_json=json_dumps(fact.value),
                confidence=decimal_or_none(fact.confidence),
                source_message_ids_json=json_dumps(fact.sourceMessageIds),
                is_active=True,
            )
        )

    proposal.memory_summary_json = json_dumps(
        {
            "source": "local_fallback",
            "factCount": len(facts),
            "payments": payment_drafts,
            "contractorWorkshops": external_workshops,
            "openQuestions": open_questions,
        }
    )
    if payment_drafts:
        proposal.payment_drafts_json = json_dumps(_normalize_payment_drafts(payment_drafts))
    if external_workshops:
        proposal.external_workshops_json = json_dumps(_normalize_external_workshops(external_workshops))
    db.add(proposal)
    db.flush()


def refresh_proposal_memory(db: Session, proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedMemory | None:
    if not messages:
        clear_proposal_memory(db, proposal)
        return None

    prompt = build_memory_extraction_prompt(proposal, messages)
    try:
        raw_text = generate_text(prompt, response_mime_type="application/json")
        extracted = ExtractedMemory.model_validate(_extract_json_object(raw_text))
    except (HTTPException, ValidationError) as exc:
        logger.warning("AI memory extraction failed; using local isolated memory fallback: %s", exc)
        refresh_proposal_memory_locally(db, proposal, messages)
        return None

    db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).delete(synchronize_session=False)
    for fact in extracted.facts:
        db.add(
            ProposalFact(
                proposal_id=proposal.id,
                category=fact.category,
                fact_key=fact.key,
                value_json=json_dumps(fact.value),
                confidence=decimal_or_none(fact.confidence),
                source_message_ids_json=json_dumps(fact.sourceMessageIds),
                is_active=True,
            )
        )

    proposal.memory_summary_json = json_dumps(extracted.memorySummary or {})
    proposal.payment_drafts_json = json_dumps(_normalize_payment_drafts(extracted.paymentDrafts))
    proposal.external_workshops_json = json_dumps(_normalize_external_workshops(extracted.externalWorkshops))
    proposal.staffing_plan_json = json_dumps(extracted.staffingPlan) if extracted.staffingPlan is not None else None
    db.add(proposal)
    db.flush()
    return extracted


def build_intake_chat_prompt(
    proposal: Proposal,
    messages: list[ProposalMessage],
    known_available_workshops: list[dict[str, Any]] | None = None,
) -> str:
    known_customer = proposal.customer_company_name or "unknown"
    known_title = proposal.order_title or "unknown"
    language_mode = _conversation_language_mode(messages)
    language_rules = [
        "- Reply in the same language as the manager's latest message.",
        "- If the manager writes in Arabic, reply entirely in Arabic.",
        "- Keep phone numbers, email addresses, street addresses, and company names exactly as provided.",
    ]
    if language_mode == "arabic":
        language_rules.append("- The current manager language is Arabic, so your full reply must be Arabic.")
        language_rules.append("- Do not mix in Chinese, German, or English text except exact names, addresses, emails, and technical company names from the transcript.")
    elif language_mode == "german":
        language_rules.append("- The current manager language is German, so your full reply must be German.")
    else:
        language_rules.append("- The current manager language is English, so your full reply must be English.")

    current_facts = _facts_for_prompt(proposal)
    memory_summary = _safe_json(proposal.memory_summary_json, {})
    payment_drafts = _safe_json(proposal.payment_drafts_json, [])
    external_workshops = _safe_json(proposal.external_workshops_json, [])
    known_available_workshops = known_available_workshops or []
    latest_turn_guidance = _latest_scope_turn_guidance(messages, language_mode)

    return "\n".join(
        [
            "You are an ERP intake assistant for a construction/renovation company that coordinates external workshops and subcontractors.",
            "Your job is to help a manager capture one client project intake as clearly as possible.",
            "Memory isolation rules:",
            "- Use only the current proposal fields, facts, memory summary, and transcript below.",
            "- Never use customer, payment, workshop, or project facts from another chat.",
            "- If the manager starts a different project in a new intake, treat it as empty memory.",
            "Contractor and workshop rules:",
            "- A contractor may have known workshops, subcontractor teams, or external crews they already work with.",
            "- This business executes sites through external workshops/subcontractors; do not ask about internal employees or internal headcount.",
            "- If a workshop means a physical work area or work package, ask/record it as a site or work package, not as an employee.",
            "- Known available workshop partners are listed below. Use them when the manager asks which workshop can cover a site/trade.",
            "- Suggest only active and currently available workshops from that known list; never suggest inactive or not-available workshops.",
            "- If no available known workshop matches the required trade, say the workshop is needed / to be selected instead of inventing a partner.",
            "Payment rules:",
            "- Ask about deposits, advance payments, installments, paid amounts, due dates, methods, and references when payment info is missing or mentioned.",
            "- If the manager already states a payment amount, currency, or method, repeat it exactly and ask only for the missing payment fields.",
            "- Never replace a stated cash payment with bank transfer, check, receipt, or other advice unless the manager says so.",
            "Construction scope guidance rules:",
            "- Use the hidden construction checklist below silently to decide which scope details are relevant.",
            "- Do not show the full checklist to the manager unless explicitly asked.",
            "- Ask only relevant missing checklist details and never more than 2-4 practical questions per reply.",
            "- Before asking any follow-up question, compare it against the current transcript, facts, and memory summary.",
            "- Do not ask for any detail the manager already stated.",
            "- If a detail is partially known, acknowledge the known part and ask only for the missing part.",
            "- When old-floor removal, waterproofing type, putty scope, paint coat count, dates, phone, or payment details are already stated, do not ask for those same details again.",
            "- For kitchen renovation, prioritize flooring, plumbing/sanitary, carpentry/shelves, and insulation/waterproofing only when missing.",
            "- For painting, prioritize putty, coat count, decorative/normal type, and interior/exterior only when missing.",
            "- For flooring, prioritize material, size, old-floor removal vs over-installation, stairs/edges, and installation type only when missing.",
            "Hidden construction checklist:",
            construction_scope_guidance(),
            "Latest manager turn guidance:",
            *(latest_turn_guidance or ["- No extra turn-specific guidance."]),
            "Chat rules:",
            "- Never ask the manager for internal employees, employee counts, capacity, availability, or internal staffing.",
            "- Ask which workshop/subcontractor will cover a site only when the execution partner is missing or unclear.",
            "- You are writing only the next assistant reply, not a transcript.",
            "- Never write role labels such as Manager:, User:, Assistant:, Human:, System:, ??????:, ????????:, or ???????:.",
            "- Never continue the conversation by inventing what the manager/user might say next.",
            "- Never create fake future turns, approvals, confirmations, or self-dialogue.",
            "- Ask concise follow-up questions when scope, dates, site details, payment details, workshop assignment, or access constraints are missing.",
            "- When the project scope is still unknown, ask only about work areas and required work types first.",
            "- Do not ask about payment, workshops, or structural details in the same reply while the basic scope is still unknown, unless the manager already mentioned those topics.",
            "- After work areas and work types are known, continue with the next missing group such as payments, workshop assignment, or access constraints.",
            "- If the manager corrects a site or work package, acknowledge the correction and update that item directly.",
            "- Use plain business language.",
            "- Do not answer with vague generic summaries such as 'details are necessary', 'quality will be ensured', or 'provide more details if needed'.",
            "- Every reply must either record concrete facts from the manager, ask specific missing questions, or both.",
            "- When facts are provided, summarize them with the actual values instead of generic wording.",
            "- If there are no important missing fields, say that the intake is ready for proposal generation instead of asking for unspecified more details.",
            "- Do not invent facts that are not present in this intake.",
            "- Never change numbers, amounts, currencies, dates, names, addresses, phone numbers, emails, payment methods, or workshop names from the manager's wording.",
            "- When listing contact information, include only the exact phone numbers, emails, and contact names provided in this intake; never add placeholder or example phone numbers.",
            "- Do not provide generic best-practice advice or recommended materials unless the manager explicitly asks for advice.",
            "- If a material, finish, grade, due date, workshop contact, or remaining payment schedule is unknown, say it is not mentioned or needs confirmation instead of inventing it.",
            "- Do not prefix the answer with meta text such as 'reply in Arabic', 'Arabic reply', or their Arabic equivalents.",
            "- Keep replies short and practical.",
            *language_rules,
            f"Known customer: {known_customer}",
            f"Known order title: {known_title}",
            "",
            "Current intake memory summary:",
            json.dumps(memory_summary, ensure_ascii=True),
            "",
            "Current intake facts:",
            json.dumps(current_facts, ensure_ascii=True),
            "",
            "Current intake payment drafts:",
            json.dumps(payment_drafts, ensure_ascii=True),
            "",
            "Current intake external workshops:",
            json.dumps(external_workshops, ensure_ascii=True),
            "",
            "Known available workshop partners:",
            json.dumps(known_available_workshops, ensure_ascii=True),
            "",
            "Conversation so far for this intake only:",
            _chat_lines(messages),
            "",
            "Assistant:",
        ]
    )


def build_proposal_prompt(messages: list[ProposalMessage], proposal: Proposal | None = None) -> str:
    schema = {
        "customerCompanyName": "string|null",
        "customerStreet": "string|null",
        "customerZipCode": "string|null",
        "customerCity": "string|null",
        "customerCountry": "string|null",
        "contactName": "string|null",
        "contactPhone": "string|null",
        "contactEmail": "string|null",
        "summary": "string",
        "orderTitle": "string",
        "orderDescription": "string|null",
        "proposedSites": [
            {
                "siteName": "string",
                "street": "string|null",
                "zipCode": "string|null",
                "city": "string|null",
                "notes": "string|null",
                "requiredSkills": ["string"],
                "requiredCertifications": ["string"],
                "estimatedHours": "number|null",
                "recommendedHeadcount": "null",
                "selectedInternalHeadcount": "null",
                "assignedWorkshopName": "string|null",
                "workshopCoveredSkills": ["string"],
                "coverageType": "workshop_only|null",
                "resourceStrategy": "external|null",
            }
        ],
        "requiredSkills": ["string"],
        "requiredCertifications": ["string"],
        "preferredStartDate": "ISO-8601 datetime|null",
        "preferredEndDate": "ISO-8601 datetime|null",
        "estimatedHours": "number|null",
        "currency": "string",
        "paymentDrafts": [
            {
                "type": "deposit|advance|installment|final|other",
                "status": "planned|received|refunded|canceled",
                "amount": "number|null",
                "currency": "string",
                "dueDate": "ISO-8601 datetime|null",
                "paidDate": "ISO-8601 datetime|null",
                "method": "string|null",
                "reference": "string|null",
                "notes": "string|null",
            }
        ],
        "externalWorkshops": [
            {
                "name": "string",
                "contactName": "string|null",
                "phone": "string|null",
                "email": "string|null",
                "specialties": ["string"],
                "suggestedFor": ["site or work package name"],
                "relationshipStatus": "known|preferred|one_time|blocked",
                "notes": "string|null",
            }
        ],
        "staffingPlan": "null",
    }
    language_mode = _conversation_language_mode(messages)
    language_rules = [
        "Write all human-readable proposal values in the same language as the manager's conversation.",
        "Keep phone numbers, email addresses, street addresses, and company names exactly as provided.",
    ]
    if language_mode == "arabic":
        language_rules.extend(
            [
                "Write all human-readable proposal values in Arabic.",
                "This includes summary, orderTitle, orderDescription, proposed site names, site notes, requiredSkills, and requiredCertifications.",
                "Do not switch proposal wording to German or English when the manager's conversation is Arabic.",
            ]
        )
    elif language_mode == "german":
        language_rules.append("The current manager language is German, so summary, orderTitle, orderDescription, proposed site names, site notes, requiredSkills, and requiredCertifications must be German.")
    else:
        language_rules.append("The current manager language is English, so summary, orderTitle, orderDescription, proposed site names, site notes, requiredSkills, and requiredCertifications must be English.")
    memory_summary = _safe_json(proposal.memory_summary_json, {}) if proposal else {}
    current_facts = _facts_for_prompt(proposal) if proposal else []
    payment_drafts = _safe_json(proposal.payment_drafts_json, []) if proposal else []
    external_workshops = _safe_json(proposal.external_workshops_json, []) if proposal else []
    return "\n".join(
        [
            "You convert one isolated client intake transcript into a structured proposal draft.",
            "Return only valid JSON. Do not wrap it in markdown.",
            "Do not invent missing facts. Use null or empty arrays instead.",
            "Use only the current intake transcript, facts, and memory below. Never use data from another chat.",
            "Use EUR as currency unless the transcript explicitly states another currency.",
            "Use DE as customerCountry when the project is clearly in Germany and no other country is stated.",
            "If total estimatedHours is known and there is more than one proposed site, always provide estimatedHours for every site.",
            "When exact per-site hours are not stated, infer a reasonable split from scope, area, and task complexity.",
            "The sum of proposedSites[].estimatedHours should match the top-level estimatedHours whenever possible.",
            "Classify contractor-provided workshops carefully: physical work areas become proposedSites/work packages; external teams or subcontractors become externalWorkshops.",
            "If deposits, advance payments, installments, paid amounts, or due payments are mentioned, include them in paymentDrafts.",
            "Always leave proposedSites[].recommendedHeadcount and proposedSites[].selectedInternalHeadcount null; internal employee planning is not part of this prototype flow.",
            "If the manager mentions worker counts, treat them only as context notes unless they refer to workshop capacity; do not create internal employee requirements.",
            "Identify the required workshop trades for each site and set assignedWorkshopName/workshopCoveredSkills only when the manager names a workshop.",
            "Use resourceStrategy=external when enough scope is known.",
            "Each proposed site must have its own requiredSkills subset. Do not copy the full project skill list into every site unless the transcript explicitly says the same scope applies to all sites.",
            "When a site is handled by a known external workshop or subcontractor, set proposedSites[].assignedWorkshopName, proposedSites[].workshopCoveredSkills, and proposedSites[].coverageType accordingly.",
            "Use coverageType=workshop_only for all sites in this prototype. If the manager did not name a workshop, leave assignedWorkshopName null and write 'workshop to be selected' / 'needs workshop assignment' in notes.",
            "Do not place workshop coverage only at the top level. Store workshop/site relationships inside the matching proposedSites[] item whenever the transcript makes the relationship clear.",
            "Use the hidden construction checklist below to enrich orderDescription, proposedSites[].notes, and requiredSkills.",
            "Never invent checklist details. If a critical construction detail is unknown, write it as to be confirmed in notes/orderDescription.",
            "Map mentioned checklist categories to practical requiredSkills such as flooring, painting, electrical, plumbing, waterproofing, gypsum board, carpentry, insulation, or structural renovation.",
            *language_rules,
            "",
            "Hidden construction checklist:",
            construction_scope_guidance(),
            "",
            f"Required JSON schema: {json.dumps(schema, ensure_ascii=True)}",
            "",
            "Current intake memory summary:",
            json.dumps(memory_summary, ensure_ascii=True),
            "",
            "Current intake facts:",
            json.dumps(current_facts, ensure_ascii=True),
            "",
            "Current intake payment drafts:",
            json.dumps(payment_drafts, ensure_ascii=True),
            "",
            "Current intake external workshops:",
            json.dumps(external_workshops, ensure_ascii=True),
            "",
            "Transcript:",
            _chat_lines(messages),
        ]
    )


def append_message(db: Session, proposal: Proposal, role: str, content: str) -> ProposalMessage:
    message = ProposalMessage(proposal_id=proposal.id, role=role, content=content.strip())
    db.add(message)
    db.flush()
    return message


def _normalize_optional_nonnegative_int(value: Any) -> int | None:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, normalized)


def _normalize_site_coverage_type(value: Any, assigned_workshop_name: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"internal_only", "mixed_with_workshop", "workshop_only"}:
        return normalized
    return "mixed_with_workshop" if assigned_workshop_name else "internal_only"


def _normalize_sites(raw_sites: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sites: list[dict[str, Any]] = []
    for raw_site in raw_sites:
        site_name = str(raw_site.get("siteName", "")).strip()
        if not site_name:
            continue
        assigned_workshop_name = str(raw_site.get("assignedWorkshopName") or "").strip() or None
        sites.append(
            {
                "siteName": site_name,
                "street": raw_site.get("street") or None,
                "zipCode": raw_site.get("zipCode") or None,
                "city": raw_site.get("city") or None,
                "notes": raw_site.get("notes") or None,
                "requiredSkills": _dedupe_strings(list(raw_site.get("requiredSkills") or [])),
                "requiredCertifications": _dedupe_strings(list(raw_site.get("requiredCertifications") or [])),
                "estimatedHours": raw_site.get("estimatedHours"),
                "recommendedHeadcount": _normalize_optional_nonnegative_int(raw_site.get("recommendedHeadcount")),
                "selectedInternalHeadcount": _normalize_optional_nonnegative_int(raw_site.get("selectedInternalHeadcount")),
                "assignedWorkshopName": assigned_workshop_name,
                "workshopCoveredSkills": _dedupe_strings(list(raw_site.get("workshopCoveredSkills") or [])),
                "coverageType": _normalize_site_coverage_type(raw_site.get("coverageType"), assigned_workshop_name),
                "resourceStrategy": raw_site.get("resourceStrategy") or None,
            }
        )
    return sites


def apply_proposal_update(proposal: Proposal, payload: ProposalDraftPayload | ExtractedProposal) -> Proposal:
    data = payload.model_dump()
    proposal.status = data.get("status") or (
        ProposalStatus.draft.value if data.get("summary") or data.get("orderTitle") else proposal.status
    )
    proposal.customer_company_name = data.get("customerCompanyName")
    proposal.customer_street = data.get("customerStreet")
    proposal.customer_zip_code = data.get("customerZipCode")
    proposal.customer_city = data.get("customerCity")
    proposal.customer_country = data.get("customerCountry") or proposal.customer_country or "DE"
    proposal.contact_name = data.get("contactName")
    proposal.contact_phone = data.get("contactPhone")
    proposal.contact_email = data.get("contactEmail")
    proposal.summary = data.get("summary")
    proposal.order_title = data.get("orderTitle")
    proposal.order_description = data.get("orderDescription")

    normalized_sites = _normalize_sites(data.get("proposedSites") or [])
    proposal.proposed_sites_json = json_dumps(normalized_sites)

    required_skills = _dedupe_strings(list(data.get("requiredSkills") or []))
    required_certifications = _dedupe_strings(list(data.get("requiredCertifications") or []))
    proposal.required_skills_json = json_dumps(required_skills)
    proposal.required_certifications_json = json_dumps(required_certifications)
    proposal.preferred_start_date = as_datetime(data.get("preferredStartDate"))
    proposal.preferred_end_date = as_datetime(data.get("preferredEndDate"))
    proposal.estimated_hours = decimal_or_none(data.get("estimatedHours"))
    proposal.estimated_price = decimal_or_none(data.get("estimatedPrice"))
    proposal.currency = data.get("currency") or proposal.currency or "EUR"
    if "recommendedTeam" in data:
        recommended_team = data.get("recommendedTeam")
        proposal.recommended_team_json = json_dumps(recommended_team) if recommended_team is not None else None
    if "memorySummary" in data:
        memory_summary = data.get("memorySummary")
        proposal.memory_summary_json = json_dumps(memory_summary) if memory_summary is not None else proposal.memory_summary_json
    if "paymentDrafts" in data:
        proposal.payment_drafts_json = json_dumps(_normalize_payment_drafts(data.get("paymentDrafts") or []))
    if "externalWorkshops" in data:
        proposal.external_workshops_json = json_dumps(_normalize_external_workshops(data.get("externalWorkshops") or []))
    if "staffingPlan" in data:
        staffing_plan = data.get("staffingPlan")
        proposal.staffing_plan_json = json_dumps(staffing_plan) if staffing_plan is not None else None
    return proposal


def _normalize_match_text(value: str) -> str:
    lowered = (value or "").casefold()
    replacements = {
        "\u0623": "\u0627",
        "\u0625": "\u0627",
        "\u0622": "\u0627",
        "\u0649": "\u064a",
        "\u0629": "\u0647",
        "\u0624": "\u0648",
        "\u0626": "\u064a",
    }
    for source, target in replacements.items():
        lowered = lowered.replace(source, target)
    lowered = re.sub(r"[^\w\u0600-\u06ff]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _normalized_tokens(value: str) -> list[str]:
    tokens: list[str] = []
    for token in _normalize_match_text(value).split():
        if not token:
            continue
        tokens.append(token)
        if token.startswith("\u0627\u0644") and len(token) > 3:
            tokens.append(token[2:])
    return tokens


def _contains_any_phrase(text: str, phrases: list[str]) -> bool:
    normalized = _normalize_match_text(text)
    return any(_normalize_match_text(phrase) in normalized for phrase in phrases if phrase)


def _normalized_text_match(haystack: str, needle: str) -> bool:
    haystack_normalized = _normalize_match_text(haystack)
    needle_normalized = _normalize_match_text(needle)
    if not haystack_normalized or not needle_normalized:
        return False
    if needle_normalized in haystack_normalized or haystack_normalized in needle_normalized:
        return True
    haystack_tokens = set(_normalized_tokens(haystack))
    needle_tokens = [token for token in _normalized_tokens(needle) if token]
    if not needle_tokens:
        return False
    overlap_count = sum(1 for token in needle_tokens if token in haystack_tokens)
    return overlap_count * 2 >= len(needle_tokens)


def _infer_skills_from_text(text: str) -> list[str]:
    lowered = _normalize_match_text(text)
    inferred: list[str] = []
    for canonical, hints in _SITE_SKILL_HINTS.items():
        if any(_normalize_match_text(hint) in lowered for hint in hints if hint):
            inferred.append(canonical)

    # Arabic construction phrases are often written conversationally, not as exact
    # catalog terms. Keep this deterministic so the intake does not repeat the
    # generic "which work type?" question after the manager already answered it.
    arabic_skill_hints: dict[str, tuple[str, ...]] = {
        "flooring": (
            "\u0623\u0631\u0636",
            "\u0627\u0631\u0636",
            "\u0627\u0644\u0623\u0631\u0636",
            "\u0627\u0644\u0627\u0631\u0636",
            "\u0623\u0631\u0636\u064a\u0629",
            "\u0627\u0631\u0636\u064a\u0647",
            "\u0623\u0631\u0636\u064a\u0627\u062a",
            "\u0627\u0631\u0636\u064a\u0627\u062a",
            "\u0628\u0644\u0627\u0637",
            "\u0633\u064a\u0631\u0627\u0645\u064a\u0643",
            "\u0628\u0648\u0631\u0633\u0644\u0627\u0646",
            "\u0631\u062e\u0627\u0645",
            "\u0628\u0627\u0631\u0643\u064a\u0647",
            "\u0642\u0644\u0639 \u0627\u0644\u0623\u0631\u0636",
            "\u0642\u0644\u0639 \u0627\u0644\u0627\u0631\u0636",
            "\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0623\u0631\u0636",
            "\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0627\u0631\u0636",
            "\u062a\u0628\u062f\u064a\u0644 \u0627\u0644\u0623\u0631\u0636",
            "\u062a\u0628\u062f\u064a\u0644 \u0627\u0644\u0627\u0631\u0636",
            "\u0641\u0631\u0634 \u0627\u0644\u0623\u0631\u0636",
            "\u0641\u0631\u0634 \u0627\u0644\u0627\u0631\u0636",
            "\u062a\u062c\u062f\u064a\u062f \u0627\u0644\u0623\u0631\u0636",
            "\u062a\u062c\u062f\u064a\u062f \u0627\u0644\u0627\u0631\u0636",
        ),
        "maler": ("\u062f\u0647\u0627\u0646", "\u062f\u0647\u0646", "\u0637\u0644\u0627\u0621", "\u0645\u0639\u062c\u0648\u0646", "\u0635\u0646\u0641\u0631\u0647", "\u0635\u0646\u0641\u0631\u0629"),
        "feuchtigkeitsschutz": ("\u0639\u0632\u0644", "\u0639\u0632\u0644 \u0645\u0627\u0626\u064a", "\u0631\u0637\u0648\u0628\u0647", "\u0631\u0637\u0648\u0628\u0629", "\u062a\u0633\u0631\u064a\u0628", "\u062a\u0633\u0631\u0628"),
        "plumbing": ("\u0635\u062d\u064a", "\u0635\u062d\u064a\u0647", "\u0635\u062d\u064a\u0629", "\u0633\u0628\u0627\u0643\u0647", "\u0633\u0628\u0627\u0643\u0629", "\u0645\u0648\u0627\u0633\u064a\u0631", "\u0635\u0631\u0641", "\u0645\u062c\u0644\u0649", "\u0645\u063a\u0633\u0644\u0647", "\u0645\u063a\u0633\u0644\u0629", "\u062f\u0634", "\u062e\u0644\u0627\u0637"),
        "carpentry": ("\u0646\u062c\u0627\u0631\u0647", "\u0646\u062c\u0627\u0631\u0629", "\u062e\u0634\u0628", "\u062e\u0632\u0627\u0626\u0646", "\u0631\u0641\u0648\u0641", "\u0627\u0628\u0648\u0627\u0628", "\u0623\u0628\u0648\u0627\u0628"),
        "electrical": ("\u0643\u0647\u0631\u0628\u0627\u0621", "\u0643\u0647\u0631\u0628\u0627", "\u062a\u0645\u062f\u064a\u062f \u0643\u0647\u0631\u0628\u0627\u0621", "\u0644\u0648\u062d\u0647 \u0643\u0647\u0631\u0628\u0627\u0626\u064a\u0647", "\u0644\u0648\u062d\u0629 \u0643\u0647\u0631\u0628\u0627\u0626\u064a\u0629", "\u0627\u0646\u0627\u0631\u0647", "\u0625\u0646\u0627\u0631\u0629", "\u0627\u0636\u0627\u0621\u0647", "\u0625\u0636\u0627\u0621\u0629"),
    }
    for canonical, hints in arabic_skill_hints.items():
        if any(_normalize_match_text(hint) in lowered for hint in hints):
            inferred.append(canonical)
    return _dedupe_strings(inferred)


def _infer_internal_count_from_text(text: str) -> int | None:
    normalized = _normalize_match_text(text)
    staff_term = r"(?:internal employees?|employees?|workers?|mitarbeiter|arbeiter|\u0645\u0648\u0638\u0641(?:\u064a\u0646)?|\u0639\u0645\u0627\u0644?)"
    qualifier = r"(?:internal|interne|internen|\u062f\u0627\u062e\u0644\u064a(?:\u064a\u0646)?|\u062f\u0627\u062e\u0644\u064a\u0648\u0646)?"
    for pattern in (
        rf"(?:^|\b)(\d+)\s*{qualifier}\s*{staff_term}",
        rf"(?:^|\b){staff_term}\s*{qualifier}\s*(\d+)",
    ):
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if match:
            return max(0, int(match.group(1)))

    word_numbers = {
        "one": 1,
        "two": 2,
        "three": 3,
        "eins": 1,
        "ein": 1,
        "zwei": 2,
        "drei": 3,
        "\u0648\u0627\u062d\u062f": 1,
        "\u0627\u062b\u0646\u064a\u0646": 2,
        "\u0627\u062a\u0646\u064a\u0646": 2,
        "\u062b\u0644\u0627\u062b\u0647": 3,
    }
    for word, value in word_numbers.items():
        if re.search(
            rf"(?:internal employees?|employees?|workers?|mitarbeiter|arbeiter|\u0645\u0648\u0638\u0641(?:\u064a\u0646)?|\u0639\u0645\u0627\u0644?)\s*(?:only|just)?\s*{re.escape(word)}\b",
            normalized,
            flags=re.IGNORECASE,
        ) or re.search(
            rf"\b{re.escape(word)}\s*(?:internal employees?|employees?|workers?|mitarbeiter|arbeiter|\u0645\u0648\u0638\u0641(?:\u064a\u0646)?|\u0639\u0645\u0627\u0644?)",
            normalized,
            flags=re.IGNORECASE,
        ):
            return value
    return None


def _extract_internal_needed_skills(context: str) -> list[str]:
    patterns = [
        r"still\s+need\s+internal\s+employees?\s+(?:for|with|to\s+cover)\s+([^\n\.,]+)",
        r"still\s+need\s+internal\s+([^\n\.,]+)",
        r"wir\s+brauchen\s+noch\s+interne\s+mitarbeiter\s+(?:fuer|f?r)\s+([^\n\.,]+)",
        r"wir\s+brauchen\s+noch\s+interne\s+([^\n\.,]+)",
        r"\u0645\u0627\s+\u0632\u0644\u0646\u0627\s+\u0646\u062d\u062a\u0627\u062c\s+\u0645\u0648\u0638\u0641(?:\u064a\u0646)?\s+\u062f\u0627\u062e\u0644\u064a(?:\u064a\u0646)?\s+\u0644(?:\u0640|-)?\s*([^\n\.,]+)",
        r"\u0646\u062d\u062a\u0627\u062c\s+\u0645\u0648\u0638\u0641(?:\u064a\u0646)?\s+\u062f\u0627\u062e\u0644\u064a(?:\u064a\u0646)?\s+\u0644(?:\u0640|-)?\s*([^\n\.,]+)",
    ]
    extracted: list[str] = []
    for pattern in patterns:
        for match in re.finditer(pattern, context, flags=re.IGNORECASE):
            extracted.extend(_infer_skills_from_text(match.group(1)))
    return _dedupe_strings(extracted)


def _enrich_extracted_sites_from_transcript(
    extracted: ExtractedProposal,
    proposal: Proposal,
    messages: list[ProposalMessage],
) -> ExtractedProposal:
    manager_lines = [line.strip() for line in "\n".join(_manager_messages(messages)).splitlines() if line.strip()]
    global_required_skills = _dedupe_strings(extracted.requiredSkills or proposal_required_skills(proposal))
    external_workshops = extracted.externalWorkshops or [ExtractedExternalWorkshop.model_validate(item) for item in _normalize_external_workshops(_safe_json(proposal.external_workshops_json, []))]
    workshop_by_name = {workshop.name.strip().lower(): workshop for workshop in external_workshops if workshop.name.strip()}

    for site in extracted.proposedSites:
        site_name = site.siteName.strip()
        if not site_name:
            continue
        matching_lines = [line for line in manager_lines if _normalized_text_match(line, site_name)]
        if not matching_lines and len(extracted.proposedSites) == 1:
            matching_lines = manager_lines
        if not matching_lines:
            continue
        context = "\n".join(matching_lines)
        inferred_skills = _infer_skills_from_text(context)

        assigned_workshop = site.assignedWorkshopName.strip() if site.assignedWorkshopName else ""
        if not assigned_workshop:
            for workshop in external_workshops:
                if workshop.name and workshop.name.strip() and _normalized_text_match(context, workshop.name.strip()):
                    assigned_workshop = workshop.name.strip()
                    site.assignedWorkshopName = assigned_workshop
                    break

        no_internal = _contains_any_phrase(
            context,
            [
                "\u0644\u0627 \u0646\u0631\u064a\u062f \u0645\u0648\u0638\u0641\u064a\u0646 \u062f\u0627\u062e\u0644\u064a\u064a\u0646",
                "\u0644\u0627 \u064a\u0644\u0632\u0645 \u0645\u0648\u0638\u0641\u0648\u0646 \u062f\u0627\u062e\u0644\u064a\u0648\u0646",
                "no internal employees",
                "without internal employees",
                "ohne interne mitarbeiter",
            ],
        )
        internal_only = _contains_any_phrase(
            context,
            [
                "\u0645\u0648\u0638\u0641\u064a\u0646 \u062f\u0627\u062e\u0644\u064a\u064a\u0646 \u0641\u0642\u0637",
                "\u0627\u0644\u0645\u0648\u0642\u0639 \u064a\u062d\u062a\u0627\u062c \u0645\u0648\u0638\u0641\u064a\u0646 \u062f\u0627\u062e\u0644\u064a\u064a\u0646 \u0641\u0642\u0637",
                "internal employees only",
                "nur interne mitarbeiter",
            ],
        )
        still_need_internal = _contains_any_phrase(
            context,
            [
                "\u0645\u0627 \u0632\u0644\u0646\u0627 \u0646\u062d\u062a\u0627\u062c \u0645\u0648\u0638\u0641\u064a\u0646 \u062f\u0627\u062e\u0644\u064a\u064a\u0646",
                "\u0646\u062d\u062a\u0627\u062c \u0645\u0648\u0638\u0641\u064a\u0646 \u062f\u0627\u062e\u0644\u064a\u064a\u0646",
                "still need internal employees",
                "still need internal staff",
                "still need internal",
                "wir brauchen noch interne mitarbeiter",
                "wir brauchen noch interne",
            ],
        )
        internal_needed_skills = _extract_internal_needed_skills(context)

        workshop_model = workshop_by_name.get(assigned_workshop.lower()) if assigned_workshop else None
        workshop_specialties = _dedupe_strings(list(workshop_model.specialties or [])) if workshop_model is not None else []
        workshop_confirmed_skills = _dedupe_strings(list(site.workshopCoveredSkills or []))
        site_specific_skills = _dedupe_strings(inferred_skills + internal_needed_skills + workshop_specialties + workshop_confirmed_skills)

        if (not site.requiredSkills or (len(extracted.proposedSites) > 1 and site.requiredSkills == global_required_skills)) and site_specific_skills:
            site.requiredSkills = site_specific_skills

        # Workshop-only pivot: do not convert manager wording into internal employee requirements.
        site.recommendedHeadcount = None
        site.selectedInternalHeadcount = None
        site.coverageType = "workshop_only"
        site.resourceStrategy = "external"

        if assigned_workshop:
            workshop_skills = _dedupe_strings(workshop_confirmed_skills + workshop_specialties)
            if not workshop_skills:
                workshop_skills = _dedupe_strings(inferred_skills)
            if not workshop_skills:
                workshop_skills = _dedupe_strings(site.requiredSkills or inferred_skills or global_required_skills)
            site.workshopCoveredSkills = workshop_skills

        site.selectedInternalHeadcount = None

    return extracted

def _proposal_from_local_memory(proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedProposal:
    manager_text = "\n".join(_manager_messages(messages))
    memory = _safe_json(proposal.memory_summary_json, {})
    facts = _facts_for_prompt(proposal)
    payment_drafts = _normalize_payment_drafts(_safe_json(proposal.payment_drafts_json, []))
    external_workshops = _normalize_external_workshops(_safe_json(proposal.external_workshops_json, []))

    contact_email = None
    contact_phone = None
    for fact in facts:
        if fact.get("category") == "contact" and fact.get("key") == "email" and not contact_email:
            contact_email = str(fact.get("value") or "") or None
        if fact.get("category") == "contact" and fact.get("key") == "phone" and not contact_phone:
            contact_phone = str(fact.get("value") or "") or None

    site_names: list[str] = []
    site_terms = [
        "stair",
        "basement",
        "entrance",
        "kitchen",
        "bathroom",
        "living room",
        "corridor",
        "treppen",
        "keller",
        "kuche",
        "bad",
        "wohnzimmer",
        "flur",
        "\u0628\u064a\u062a \u0627\u0644\u062f\u0631\u062c",
        "\u0645\u0645\u0631 \u0627\u0644\u0642\u0628\u0648",
        "\u0645\u062f\u062e\u0644",
        "\u0645\u0637\u0628\u062e",
        "\u062d\u0645\u0627\u0645",
        "\u063a\u0631\u0641\u0629 \u0627\u0644\u0645\u0639\u064a\u0634\u0629",
        "\u0645\u0645\u0631",
    ]
    for line in manager_text.splitlines():
        cleaned = line.strip().strip("-?")
        if not cleaned:
            continue
        if any(term in cleaned.lower() for term in site_terms):
            cleaned = re.sub(r"^\d+[.)]\s*", "", cleaned).strip()
            if len(cleaned) <= 80:
                site_names.append(cleaned)
    language_mode = _conversation_language_mode(messages)

    if not site_names:
        site_names = [_localized_default_site_name(language_mode)]

    total_hours = None
    hours_match = re.search("(\\d+(?:[.,]\\d+)?)\\s*(?:hours|stunden|\u0633\u0627\u0639\u0629|\u0633\u0627\u0639\u0627\u062a)", manager_text, flags=re.IGNORECASE)
    if hours_match:
        total_hours = float(hours_match.group(1).replace(",", "."))

    start_date = None
    end_date = None
    dates = re.findall(r"\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b", manager_text)
    parsed_dates: list[datetime] = []
    for day, month, year in dates:
        full_year = int(year) + 2000 if len(year) == 2 else int(year)
        try:
            parsed_dates.append(datetime(full_year, int(month), int(day), tzinfo=timezone.utc))
        except ValueError:
            continue
    if parsed_dates:
        start_date = min(parsed_dates)
        end_date = max(parsed_dates)

    company_match = re.search("(?:company|firma|\u0634\u0631\u0643\u0629|\u0627\u0644\u0634\u0631\u0643\u0629)\\s+([^\\n,.]+)", manager_text, flags=re.IGNORECASE)
    contact_match = re.search("(?:contact|ansprechpartner|\u0645\u0633\u0624\u0648\u0644|\u0627\u0644\u0634\u062e\u0635 \u0627\u0644\u0645\u0633\u0624\u0648\u0644|\u062c\u0647\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644)\\s+(?:is\\s+|\u0647\u0648\\s+)?([^\u060c,\\n]+)", manager_text, flags=re.IGNORECASE)

    extracted = ExtractedProposal(
        customerCompanyName=(company_match.group(1).strip() if company_match else proposal.customer_company_name),
        contactName=(contact_match.group(1).strip() if contact_match else proposal.contact_name),
        contactPhone=contact_phone or proposal.contact_phone,
        contactEmail=contact_email or proposal.contact_email,
        summary=(manager_text[:600] if manager_text else proposal.summary or "AI intake proposal"),
        orderTitle=proposal.order_title or ("Project proposal" if _conversation_language_mode(messages) != "arabic" else "\u0639\u0631\u0636 \u0645\u0634\u0631\u0648\u0639"),
        orderDescription=manager_text or proposal.order_description,
        proposedSites=[
            ExtractedProposalSite(siteName=name, requiredSkills=proposal_required_skills(proposal), estimatedHours=None)
            for name in dict.fromkeys(site_names)
        ],
        requiredSkills=proposal_required_skills(proposal),
        requiredCertifications=proposal_required_certifications(proposal),
        preferredStartDate=start_date,
        preferredEndDate=end_date,
        estimatedHours=total_hours,
        currency=proposal.currency or "EUR",
        paymentDrafts=[ExtractedPaymentDraft.model_validate(item) for item in payment_drafts],
        externalWorkshops=[ExtractedExternalWorkshop.model_validate(item) for item in external_workshops],
        staffingPlan=memory.get("staffingPlan") if isinstance(memory, dict) else None,
    )
    return _enrich_extracted_sites_from_transcript(extracted, proposal, messages)


def extract_proposal_from_messages(proposal: Proposal, messages: list[ProposalMessage]) -> ExtractedProposal:
    prompt = build_proposal_prompt(messages, proposal)
    try:
        raw_text = generate_text(prompt, response_mime_type="application/json")
        extracted = ExtractedProposal.model_validate(_extract_json_object(raw_text))
        extracted = _enrich_extracted_sites_from_transcript(extracted, proposal, messages)
    except (HTTPException, ValidationError) as exc:
        logger.warning("AI proposal extraction failed; using local transcript fallback: %s", exc)
        extracted = _proposal_from_local_memory(proposal, messages)

    if not extracted.proposedSites:
        extracted.proposedSites = [
            ExtractedProposalSite(
                siteName=extracted.customerCity or extracted.customerCompanyName or _localized_default_site_name(_conversation_language_mode(messages)),
                city=extracted.customerCity,
                requiredSkills=extracted.requiredSkills,
                requiredCertifications=extracted.requiredCertifications,
            )
        ]

    apply_proposal_update(proposal, extracted)
    proposal.status = ProposalStatus.draft.value
    return extracted


def proposal_sites(proposal: Proposal) -> list[dict[str, Any]]:
    return list(json_loads(proposal.proposed_sites_json, []))


def proposal_required_skills(proposal: Proposal) -> list[str]:
    return list(json_loads(proposal.required_skills_json, []))


def proposal_required_certifications(proposal: Proposal) -> list[str]:
    return list(json_loads(proposal.required_certifications_json, []))


def proposal_window(proposal: Proposal) -> tuple[datetime, datetime]:
    start = proposal.preferred_start_date or datetime.now(timezone.utc)
    end = proposal.preferred_end_date or (start + timedelta(days=14))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end < start:
        end = start
    return start, end


def _site_hours(site: dict[str, Any], fallback: float) -> float:
    try:
        hours = float(site.get("estimatedHours"))
    except (TypeError, ValueError):
        hours = fallback
    return max(hours, 0.0)


def proposal_payment_drafts(proposal: Proposal) -> list[dict[str, Any]]:
    return list(json_loads(proposal.payment_drafts_json, []))


def proposal_external_workshops(proposal: Proposal) -> list[dict[str, Any]]:
    return list(json_loads(proposal.external_workshops_json, []))


def _find_existing_workshop(db: Session, name: str) -> Workshop | None:
    normalized = name.strip().lower()
    if not normalized:
        return None
    return db.scalar(select(Workshop).where(func.lower(Workshop.name) == normalized).limit(1))


def _get_or_create_workshop(
    db: Session,
    name: str,
    specialties: list[str] | None = None,
    contact_name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    notes: str | None = None,
) -> Workshop:
    clean_name = name.strip()
    ensure(bool(clean_name), "Workshop-Name fehlt.")
    workshop = _find_existing_workshop(db, clean_name)
    if workshop is None:
        workshop = Workshop(
            name=clean_name,
            contact_name=contact_name,
            phone=phone,
            email=email,
            specialties_json=json_dumps(_dedupe_strings([str(value) for value in specialties or []])),
            notes=notes,
            is_active=True,
        )
        db.add(workshop)
        db.flush()
    else:
        known_specialties = _dedupe_strings([str(value) for value in json_loads(workshop.specialties_json, [])])
        merged_specialties = _dedupe_strings([*known_specialties, *[str(value) for value in specialties or []]])
        if merged_specialties != known_specialties:
            workshop.specialties_json = json_dumps(merged_specialties)
        workshop.contact_name = workshop.contact_name or contact_name
        workshop.phone = workshop.phone or phone
        workshop.email = workshop.email or email
        workshop.notes = workshop.notes or notes
        db.flush()
    return workshop


def create_confirmed_workshops(db: Session, proposal: Proposal, customer: Customer | None = None) -> dict[str, str]:
    created_or_linked: dict[str, str] = {}
    for workshop_data in proposal_external_workshops(proposal):
        name = str(workshop_data.get("name") or "").strip()
        if not name:
            continue
        workshop = _get_or_create_workshop(
            db,
            name,
            specialties=[str(value) for value in workshop_data.get("specialties") or []],
            contact_name=workshop_data.get("contactName"),
            phone=workshop_data.get("phone"),
            email=workshop_data.get("email"),
            notes=workshop_data.get("notes"),
        )
        created_or_linked[name.lower()] = workshop.id
    return created_or_linked


def create_confirmed_payment_records(
    db: Session,
    proposal: Proposal,
    customer: Customer,
    order: Order,
    payment_drafts: list[dict[str, Any]] | None = None,
) -> list[str]:
    created_ids: list[str] = []
    drafts = payment_drafts if payment_drafts is not None else proposal_payment_drafts(proposal)
    for draft in drafts:
        amount = decimal_or_none(draft.get("amount"))
        if amount is None or amount <= 0:
            continue
        payment = PaymentRecord(
            proposal_id=proposal.id,
            customer_id=customer.id,
            order_id=order.id,
            invoice_id=None,
            payment_type=draft.get("type") or "deposit",
            status=draft.get("status") or "planned",
            amount=amount,
            currency=draft.get("currency") or proposal.currency or "EUR",
            due_date=as_datetime(draft.get("dueDate")),
            paid_date=as_datetime(draft.get("paidDate")),
            method=draft.get("method"),
            reference=draft.get("reference"),
            notes=draft.get("notes"),
        )
        db.add(payment)
        db.flush()
        created_ids.append(payment.id)
    return created_ids


def calculate_price_from_assignments(
    db: Session,
    proposal: Proposal,
    site_assignments: dict[int, list[str]],
    manual_estimated_price: float | None = None,
) -> Decimal:
    if manual_estimated_price is not None:
        return Decimal(str(manual_estimated_price)).quantize(Decimal("0.01"))

    sites = proposal_sites(proposal)
    total_hours = float(proposal.estimated_hours or 0)
    fallback_hours = (total_hours / max(len(sites), 1)) if total_hours else 8.0
    total_price = Decimal("0")

    # Legacy compatibility: if old employee selections are still supplied, keep the previous
    # price preview behavior. The visible product flow no longer creates these selections.
    for site_index, site in enumerate(sites):
        selected_employee_ids = list(dict.fromkeys(site_assignments.get(site_index, [])))
        if not selected_employee_ids:
            continue
        employees = [db.get(Employee, employee_id) for employee_id in selected_employee_ids]
        ensure(all(employee is not None for employee in employees), "Ausgewaehlter Mitarbeiter existiert nicht.", 404)
        rates: list[Decimal] = []
        for employee in employees:
            if employee.default_hourly_rate is None:
                raise HTTPException(
                    status_code=400,
                    detail="Mindestens ein ausgewaehlter Mitarbeiter hat keinen Standard-Stundensatz. Bitte Preis manuell setzen.",
                )
            rates.append(Decimal(str(employee.default_hourly_rate)))
        average_rate = sum(rates, Decimal("0")) / Decimal(str(len(rates)))
        total_price += average_rate * Decimal(str(_site_hours(site, fallback_hours)))

    if total_price != Decimal("0"):
        return total_price.quantize(Decimal("0.01"))
    if proposal.estimated_price is not None:
        return Decimal(str(proposal.estimated_price)).quantize(Decimal("0.01"))
    return Decimal("0.00")


def confirm_proposal(
    db: Session,
    proposal: Proposal,
    existing_customer_id: str | None,
    site_assignments: dict[int, list[str]],
    manual_estimated_price: float | None = None,
    payment_drafts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ensure(proposal.status in {ProposalStatus.draft.value, ProposalStatus.reviewed.value}, "Vorschlag ist nicht bestaetigbar.")
    ensure(proposal.order_title and proposal.order_title.strip(), "Vorschlag hat keinen Auftragstitel.")

    sites = proposal_sites(proposal)
    ensure(bool(sites), "Vorschlag enthaelt keine Baustellen.")

    if existing_customer_id:
        customer = db.get(Customer, existing_customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Ausgewaehlter Kunde nicht gefunden.")
    else:
        ensure(bool(proposal.customer_company_name and proposal.customer_company_name.strip()), "Firmenname fuer neuen Kunden fehlt.")
        customer = Customer(
            company_name=proposal.customer_company_name.strip(),
            street=proposal.customer_street,
            zip_code=proposal.customer_zip_code,
            city=proposal.customer_city,
            country=proposal.customer_country or "DE",
            contact_name=proposal.contact_name,
            contact_phone=proposal.contact_phone,
            contact_email=proposal.contact_email,
            notes=f"Erstellt aus KI-Vorschlag {proposal.id}",
        )
        db.add(customer)
        db.flush()

    order = Order(
        customer_id=customer.id,
        title=proposal.order_title.strip(),
        description=proposal.order_description or proposal.summary,
        status="open",
        start_date=proposal.preferred_start_date,
        end_date=proposal.preferred_end_date,
        default_hourly_rate=None,
        currency=proposal.currency or "EUR",
    )
    db.add(order)
    db.flush()

    workshop_by_name = create_confirmed_workshops(db, proposal, customer)

    created_site_ids: list[str] = []
    created_workshop_ids: set[str] = set(workshop_by_name.values())
    for index, site_data in enumerate(sites):
        coverage_type = str(site_data.get("coverageType") or "workshop_only").strip().lower()
        workshop_name = str(site_data.get("assignedWorkshopName") or "").strip()
        workshop_covered_skills = [str(value).strip() for value in site_data.get("workshopCoveredSkills") or [] if str(value).strip()]
        required_skills = [str(value).strip() for value in site_data.get("requiredSkills") or [] if str(value).strip()]
        site_notes = site_data.get("notes")
        if workshop_name:
            workshop_note = f"Workshop: {workshop_name} | Coverage: {coverage_type}"
            if workshop_covered_skills:
                workshop_note += f" | Covered trades: {', '.join(workshop_covered_skills)}"
            site_notes = f"{site_notes}\n\n{workshop_note}" if site_notes else workshop_note
        elif coverage_type == "workshop_only":
            missing_note = "Workshop needed / to be selected."
            site_notes = f"{site_notes}\n\n{missing_note}" if site_notes else missing_note

        site = Site(
            order_id=order.id,
            site_name=site_data["siteName"],
            street=site_data.get("street"),
            zip_code=site_data.get("zipCode"),
            city=site_data.get("city"),
            notes=site_notes,
            is_active=True,
        )
        db.add(site)
        db.flush()
        created_site_ids.append(site.id)

        if workshop_name:
            workshop = _find_existing_workshop(db, workshop_name)
            if workshop is None:
                workshop = _get_or_create_workshop(db, workshop_name, specialties=workshop_covered_skills or required_skills)
            created_workshop_ids.add(workshop.id)
            db.add(
                WorkshopSiteAssignment(
                    order_id=order.id,
                    site_id=site.id,
                    workshop_id=workshop.id,
                    covered_skills_json=json_dumps(_dedupe_strings(workshop_covered_skills or required_skills)),
                    status="assigned",
                    notes=f"Created from AI proposal {proposal.id}",
                )
            )

    payment_record_ids = create_confirmed_payment_records(db, proposal, customer, order, payment_drafts=payment_drafts)

    proposal.estimated_price = calculate_price_from_assignments(
        db,
        proposal,
        site_assignments=site_assignments,
        manual_estimated_price=manual_estimated_price,
    )
    proposal.status = ProposalStatus.converted.value
    proposal.converted_customer_id = customer.id
    proposal.converted_order_id = order.id
    db.flush()

    return {
        "proposalId": proposal.id,
        "customerId": customer.id,
        "orderId": order.id,
        "siteIds": created_site_ids,
        "workshopIds": sorted(created_workshop_ids),
        "paymentRecordIds": payment_record_ids,
        "estimatedPrice": proposal.estimated_price,
        "currency": proposal.currency,
    }
