from __future__ import annotations

import io
import logging
import unicodedata
import wave
from datetime import datetime, timezone
from collections.abc import Iterable
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Proposal, ProposalMessage, Workshop
from ..schemas import (
    AIIntakeConfirmPayload,
    AIIntakeCreatePayload,
    AIIntakeMessagePayload,
    AIWorkSummaryPayload,
    ProposalDraftPayload,
)
from ..services.ai_summary import build_work_summary
from ..services.assemblyai_client import transcribe_audio
from ..services.gemini_client import ensure_gemini_ready, stream_text
from ..services.proposal_documents import build_proposal_pdf
from ..services.proposals import (
    append_message,
    apply_proposal_update,
    build_intake_chat_prompt,
    clear_proposal_memory,
    confirm_proposal,
    extract_proposal_from_messages,
    refresh_proposal_memory,
    refresh_proposal_memory_locally,
    intake_assistant_source_text,
    sanitize_intake_assistant_reply,
)
from ..utils import as_datetime, end_of_utc_day, ensure, json_dumps, json_loads, not_found, proposal_payload

router = APIRouter()
logger = logging.getLogger(__name__)

SUPPORTED_WAV_CONTENT_TYPES = {
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/vnd.wave",
}
SUPPORTED_AUDIO_CONTENT_TYPES = SUPPORTED_WAV_CONTENT_TYPES | {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/x-m4a",
    "audio/mp4a-latm",
}
MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_AUDIO_DURATION_MS = 90_000


def _proposal_query():
    return select(Proposal).options(selectinload(Proposal.messages), selectinload(Proposal.facts)).order_by(Proposal.updated_at.desc())


def _get_proposal(db: Session, proposal_id: str) -> Proposal:
    proposal = db.execute(_proposal_query().where(Proposal.id == proposal_id)).scalar_one_or_none()
    if not proposal:
        raise not_found()
    return proposal


def _wav_duration_ms(audio_bytes: bytes) -> int | None:
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
            frame_count = wav_file.getnframes()
            frame_rate = wav_file.getframerate()
    except (wave.Error, EOFError):
        return None

    if frame_count <= 0 or frame_rate <= 0:
        return None
    return int((frame_count / float(frame_rate)) * 1000)


def _staffing_explanation_prompt(context: dict, locale: str) -> str:
    language_map = {"ar": "Arabic", "de": "German", "en": "English"}
    language_name = language_map.get(locale, "English")
    return "\n".join(
        [
            "You explain ERP staffing recommendations to a manager.",
            "Do not reveal chain-of-thought or hidden reasoning.",
            "Provide a short decision explanation only, based strictly on the provided facts.",
            "Mention the workshop impact, the remaining internal skills, the hours/window, and why the recommended count is appropriate.",
            "If a value is missing, say it was not mentioned.",
            f"Respond in {language_name}.",
            "Keep the answer concise, practical, and professional.",
            "Explanation data:",
            json_dumps(context),
        ]
    )


def _fallback_stream_chunks(text: str):
    for line in text.splitlines(True):
        if line:
            yield line


def _contains_arabic_text(value: str) -> bool:
    return any("؀" <= char <= "ۿ" for char in value)


def _proposal_pdf_filename(proposal: Proposal) -> str:
    base = (proposal.order_title or proposal.customer_company_name or proposal.id or "proposal").strip()
    normalized = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode("ascii")
    safe = "".join(char if char.isalnum() or char in ("-", "_") else "-" for char in normalized).strip("-_")
    if not safe:
        suffix = (proposal.id or "draft").replace("-", "")[:8]
        safe = f"proposal-{suffix}" if suffix else "proposal"
    return f"{safe[:64]}.pdf"


def _workshop_specialties(workshop: Workshop) -> list[str]:
    return [str(value).strip() for value in json_loads(workshop.specialties_json, []) if str(value).strip()]


def _available_workshops_for_prompt(db: Session) -> list[dict]:
    workshops = db.scalars(
        select(Workshop)
        .where(Workshop.is_active.is_(True))
        .where(Workshop.availability_status == "available")
        .order_by(Workshop.name.asc())
    ).all()
    return [
        {
            "id": workshop.id,
            "name": workshop.name,
            "specialties": _workshop_specialties(workshop),
            "contactName": workshop.contact_name,
            "phone": workshop.phone,
            "email": workshop.email,
            "availabilityStatus": workshop.availability_status,
            "availabilityNote": workshop.availability_note,
            "notes": workshop.notes,
        }
        for workshop in workshops
    ]


@router.post("/ai/work-summary")
def work_summary(payload: AIWorkSummaryPayload, db: Session = Depends(get_db)) -> dict:
    return build_work_summary(
        db,
        employee_id=payload.employeeId,
        order_id=payload.orderId,
        site_id=payload.siteId,
        from_date=as_datetime(payload.from_date),
        to_date=end_of_utc_day(as_datetime(payload.to_date)) if payload.to_date else None,
        question=payload.question,
    )


@router.post("/ai/intakes", status_code=201)
def create_intake(payload: AIIntakeCreatePayload, db: Session = Depends(get_db)) -> dict:
    proposal = Proposal(
        status="intake",
        customer_company_name=payload.customerCompanyName,
        order_title=payload.orderTitle,
        currency="EUR",
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal)


@router.get("/ai/intakes")
def list_intakes(db: Session = Depends(get_db)) -> list[dict]:
    proposals = db.execute(_proposal_query()).scalars().all()
    return [proposal_payload(item) for item in proposals]


@router.get("/ai/intakes/{proposal_id}")
def get_intake(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    return proposal_payload(proposal, include_messages=True)


@router.get("/ai/intakes/{proposal_id}/pdf")
def get_intake_pdf(
    proposal_id: str,
    locale: Literal["de", "en", "ar"] | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    proposal = _get_proposal(db, proposal_id)
    pdf_bytes = build_proposal_pdf(proposal_payload(proposal, include_messages=True), locale=locale or "en")
    headers = {"Content-Disposition": f"inline; filename=\"{_proposal_pdf_filename(proposal)}\""}
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.put("/ai/intakes/{proposal_id}")
def update_intake(proposal_id: str, payload: ProposalDraftPayload, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    apply_proposal_update(proposal, payload)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal, include_messages=True)


@router.delete("/ai/intakes/{proposal_id}")
def delete_intake(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    db.delete(proposal)
    db.commit()
    return {"ok": True}


@router.delete("/ai/intakes/{proposal_id}/messages")
def clear_intake_messages(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    proposal.messages.clear()
    clear_proposal_memory(db, proposal)
    proposal.updated_at = datetime.now(timezone.utc)
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal, include_messages=True)


@router.delete("/ai/intakes/{proposal_id}/messages/{message_id}")
def delete_intake_message(proposal_id: str, message_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    message = db.get(ProposalMessage, message_id)
    if not message or message.proposal_id != proposal.id:
        raise not_found()

    proposal.messages.remove(message)
    db.flush()
    remaining_messages = list(
        db.scalars(
            select(ProposalMessage)
            .where(ProposalMessage.proposal_id == proposal.id)
            .order_by(ProposalMessage.created_at.asc(), ProposalMessage.id.asc())
        ).all()
    )

    # Deleted chat facts must not continue influencing proposal generation.
    clear_proposal_memory(db, proposal)
    refresh_proposal_memory_locally(db, proposal, remaining_messages)
    proposal.updated_at = datetime.now(timezone.utc)
    db.add(proposal)
    db.commit()
    return proposal_payload(_get_proposal(db, proposal_id), include_messages=True)


@router.post("/ai/intakes/{proposal_id}/messages/stream")
def intake_message_stream(proposal_id: str, payload: AIIntakeMessagePayload, db: Session = Depends(get_db)) -> StreamingResponse:
    proposal = _get_proposal(db, proposal_id)
    append_message(db, proposal, "user", payload.content)
    db.commit()
    proposal = _get_proposal(db, proposal_id)
    try:
        refresh_proposal_memory_locally(db, proposal, proposal.messages)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("AI intake memory refresh failed: proposal_id=%s error=%s", proposal_id, exc)
    proposal = _get_proposal(db, proposal_id)
    ensure_gemini_ready()

    def generate() -> Iterable[str]:
        assistant_parts: list[str] = []
        try:
            prompt = build_intake_chat_prompt(proposal, proposal.messages, _available_workshops_for_prompt(db))
            for chunk in stream_text(prompt):
                assistant_parts.append(chunk)

            assistant_text = sanitize_intake_assistant_reply("".join(assistant_parts), intake_assistant_source_text(proposal))
            if assistant_text:
                yield assistant_text
                append_message(db, proposal, "assistant", assistant_text)
                db.commit()
        except Exception as exc:
            db.rollback()
            yield f"\n\n[ERROR] {str(exc)}\n"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8", headers=headers)


@router.get("/ai/intakes/{proposal_id}/memory")
def get_intake_memory(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    payload = proposal_payload(proposal, include_messages=True)
    return {
        "proposalId": proposal.id,
        "facts": payload.get("facts", []),
        "memorySummary": payload.get("memorySummary"),
        "paymentDrafts": payload.get("paymentDrafts", []),
        "externalWorkshops": payload.get("externalWorkshops", []),
        "staffingPlan": payload.get("staffingPlan"),
    }


@router.post("/ai/intakes/{proposal_id}/memory/refresh")
def refresh_intake_memory(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    ensure(bool(proposal.messages), "Bitte zuerst eine Unterhaltung fuehren.")
    refresh_proposal_memory(db, proposal, proposal.messages)
    db.commit()
    proposal = _get_proposal(db, proposal_id)
    payload = proposal_payload(proposal, include_messages=True)
    return {
        "proposalId": proposal.id,
        "facts": payload.get("facts", []),
        "memorySummary": payload.get("memorySummary"),
        "paymentDrafts": payload.get("paymentDrafts", []),
        "externalWorkshops": payload.get("externalWorkshops", []),
        "staffingPlan": payload.get("staffingPlan"),
    }


@router.delete("/ai/intakes/{proposal_id}/memory")
def delete_intake_memory(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    clear_proposal_memory(db, proposal)
    proposal.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal, include_messages=True)


@router.post("/ai/intakes/{proposal_id}/messages/transcribe")
async def transcribe_intake_audio(
    proposal_id: str,
    audio: UploadFile = File(...),
    locale_hint: Literal["de", "en", "ar"] | None = Form(default=None, alias="localeHint"),
    duration_ms_hint: int | None = Form(default=None, alias="durationMs"),
    db: Session = Depends(get_db),
) -> dict:
    _get_proposal(db, proposal_id)

    try:
        raw_content_type = (audio.content_type or "").lower()
        content_type = raw_content_type.split(";", 1)[0].strip()
        ensure(content_type in SUPPORTED_AUDIO_CONTENT_TYPES, "Nur WAV-, WebM-, Ogg- oder MP4-Audio wird unterstuetzt.", 415)

        raw_audio = await audio.read(MAX_AUDIO_BYTES + 1)
        size_bytes = len(raw_audio)
        ensure(bool(raw_audio), "Die Audiodatei ist leer.", 400)
        ensure(size_bytes <= MAX_AUDIO_BYTES, "Die Audiodatei ist zu gross (max. 10 MB).", 413)

        if content_type in SUPPORTED_WAV_CONTENT_TYPES:
            duration_ms = _wav_duration_ms(raw_audio)
            ensure(duration_ms is not None, "Ungueltige WAV-Datei.", 400)
        else:
            duration_ms = duration_ms_hint
            ensure(duration_ms is not None and duration_ms > 0, "Die Audioaufnahme enthaelt keine gueltige Dauer.", 400)
        ensure(duration_ms <= MAX_AUDIO_DURATION_MS, "Die Aufnahme darf hoechstens 90 Sekunden lang sein.", 400)

        logger.info(
            "AI intake transcription request: proposal_id=%s locale_hint=%s content_type=%s raw_content_type=%s size_bytes=%s duration_ms=%s",
            proposal_id,
            locale_hint,
            content_type,
            raw_content_type,
            size_bytes,
            duration_ms,
        )

        result = transcribe_audio(raw_audio, mime_type=content_type or "application/octet-stream", locale_hint=locale_hint)
        transcript = str(result.get("transcript") or "").strip()
        debug_text = str(result.get("debugText") or "")
        provider = result.get("provider") or "assemblyai"

        if not transcript:
            logger.warning(
                "AI intake transcription blank: proposal_id=%s locale_hint=%s duration_ms=%s size_bytes=%s provider=%s debug=%s",
                proposal_id,
                locale_hint,
                duration_ms,
                size_bytes,
                provider,
                debug_text,
            )
            detail = "Kein verwertbarer Text in der Aufnahme erkannt."
            if debug_text:
                detail += f" Provider-Debug: {debug_text}"
            ensure(False, detail, 422)

        logger.info(
            "AI intake transcription success: proposal_id=%s locale_hint=%s duration_ms=%s transcript_chars=%s provider=%s",
            proposal_id,
            locale_hint,
            duration_ms,
            len(transcript),
            provider,
        )

        return {
            "transcript": transcript,
            "detectedLanguage": result.get("detectedLanguage"),
            "durationMs": duration_ms,
            "provider": provider,
        }
    finally:
        await audio.close()


@router.post("/ai/intakes/{proposal_id}/proposal")
def generate_proposal(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    ensure(bool(proposal.messages), "Bitte zuerst eine Unterhaltung fuehren.")
    try:
        refresh_proposal_memory_locally(db, proposal, proposal.messages)
    except Exception as exc:
        db.rollback()
        proposal = _get_proposal(db, proposal_id)
        logger.warning("AI intake local memory refresh before proposal failed: proposal_id=%s error=%s", proposal_id, exc)
    extract_proposal_from_messages(proposal, proposal.messages)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal, include_messages=True)


def _skill_matches(candidate: str, required: str) -> bool:
    candidate_key = candidate.strip().lower()
    required_key = required.strip().lower()
    return bool(candidate_key and required_key and (candidate_key == required_key or candidate_key in required_key or required_key in candidate_key))


def _workshop_recommendations_for_proposal(db: Session, proposal: Proposal) -> dict:
    payload = proposal_payload(proposal)
    sites = payload.get("proposedSites") or []
    draft_workshops = payload.get("externalWorkshops") or []
    global_workshops = db.scalars(select(Workshop).order_by(Workshop.name.asc())).all()
    unavailable_names = {
        workshop.name.strip().lower()
        for workshop in global_workshops
        if workshop.name and (not workshop.is_active or workshop.availability_status != "available")
    }

    candidates: list[dict] = []
    seen_names: set[str] = set()
    for workshop in global_workshops:
        if not workshop.is_active or workshop.availability_status != "available":
            continue
        name = workshop.name.strip()
        if not name:
            continue
        key = name.lower()
        seen_names.add(key)
        candidates.append(
            {
                "kind": "global_workshop",
                "workshopId": workshop.id,
                "draftIndex": None,
                "name": name,
                "specialties": _workshop_specialties(workshop),
                "suggestedFor": [],
                "relationshipStatus": "available",
                "availabilityStatus": workshop.availability_status,
                "availabilityNote": workshop.availability_note,
                "notes": workshop.notes,
                "source": "workshops",
            }
        )

    for draft_index, workshop in enumerate(draft_workshops):
        name = str(workshop.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen_names or key in unavailable_names:
            continue
        candidates.append(
            {
                "kind": "proposal_external_workshop",
                "workshopId": None,
                "draftIndex": draft_index,
                "name": name,
                "specialties": [str(value).strip() for value in workshop.get("specialties") or [] if str(value).strip()],
                "suggestedFor": [str(value).strip().lower() for value in workshop.get("suggestedFor") or [] if str(value).strip()],
                "relationshipStatus": workshop.get("relationshipStatus"),
                "availabilityStatus": "available",
                "availabilityNote": None,
                "notes": workshop.get("notes"),
                "source": "intake",
            }
        )

    now = datetime.now(timezone.utc)
    start_dt = proposal.preferred_start_date or now
    end_dt = proposal.preferred_end_date or start_dt
    try:
        days = max((end_dt.date() - start_dt.date()).days + 1, 1)
    except Exception:
        days = 1
    weeks = max((days + 6) // 7, 1)

    result_sites = []
    for index, site in enumerate(sites):
        site_name = str(site.get("siteName") or f"Site {index + 1}")
        required_skills = [str(value).strip() for value in site.get("requiredSkills") or [] if str(value).strip()]
        assigned_name = str(site.get("assignedWorkshopName") or "").strip()
        assigned_key = assigned_name.lower()
        covered_skills = [str(value).strip() for value in site.get("workshopCoveredSkills") or [] if str(value).strip()]

        suggestions = []
        for candidate in candidates:
            specialties = candidate["specialties"]
            matched = [specialty for specialty in specialties if any(_skill_matches(specialty, skill) for skill in required_skills)]
            site_match = any(token and token in site_name.lower() for token in candidate["suggestedFor"])
            assigned_match = bool(assigned_key and candidate["name"].strip().lower() == assigned_key)
            if matched or site_match or assigned_match:
                suggestions.append(
                    {
                        "kind": candidate["kind"],
                        "workshopId": candidate["workshopId"],
                        "draftIndex": candidate["draftIndex"],
                        "name": candidate["name"],
                        "score": len(matched) * 10 + (5 if site_match else 0) + (20 if assigned_match else 0),
                        "matchedSkills": matched,
                        "specialties": specialties,
                        "relationshipStatus": candidate["relationshipStatus"],
                        "availabilityStatus": candidate["availabilityStatus"],
                        "availabilityNote": candidate["availabilityNote"],
                        "reason": "Available workshop matches required site trades or was mentioned for this site.",
                        "notes": candidate["notes"],
                    }
                )
        suggestions.sort(key=lambda item: item["score"], reverse=True)

        assigned_unavailable = bool(assigned_key and assigned_key in unavailable_names)
        if assigned_name:
            coverage_type = str(site.get("coverageType") or "workshop_only")
            workshop_summary = {
                "name": assigned_name,
                "coveredSkills": covered_skills or required_skills,
                "coverageType": coverage_type,
                "matchedSkills": covered_skills or required_skills,
                "source": "proposal_site",
                "availabilityStatus": "not_available" if assigned_unavailable else "available",
            }
            coverage_note = "Workshop assigned for this site. Execution planning uses workshop partners only."
            warning = "Assigned workshop is currently inactive or not available; select an available workshop before execution." if assigned_unavailable else None
        else:
            coverage_type = "workshop_only"
            workshop_summary = None
            coverage_note = "Workshop needed / to be selected for this site."
            warning = "No available workshop is assigned yet; select a trusted available workshop before execution."

        result_sites.append(
            {
                "siteIndex": index,
                "siteName": site_name,
                "coverageType": coverage_type,
                "requiredSkills": required_skills,
                "requiredCertifications": [str(value).strip() for value in site.get("requiredCertifications") or [] if str(value).strip()],
                "internalRequiredSkills": [],
                "estimatedHours": float(site.get("estimatedHours") or 0),
                "recommendedHeadcount": 0,
                "selectedInternalHeadcount": 0,
                "autoSelectedEmployeeIds": [],
                "recommendations": [],
                "workshopRecommendations": suggestions,
                "workshopSummary": workshop_summary,
                "coverageNote": coverage_note,
                "staffingWarning": warning,
                "excludedEmployees": [],
            }
        )

    return {
        "window": {"startDate": start_dt.isoformat(), "endDate": end_dt.isoformat(), "weeks": weeks},
        "sites": result_sites,
        "pricePreview": float(proposal.estimated_price) if proposal.estimated_price is not None else None,
        "currency": proposal.currency or "EUR",
        "mode": "workshop_only",
    }


@router.post("/ai/intakes/{proposal_id}/recommend-assignments")
def recommend_assignments(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    recommendations = _workshop_recommendations_for_proposal(db, proposal)
    proposal.recommended_team_json = json_dumps(recommendations)
    if proposal.status == "draft":
        proposal.status = "reviewed"
    db.commit()
    db.refresh(proposal)
    return {
        "proposal": proposal_payload(proposal),
        "recommendations": recommendations,
    }


@router.post("/ai/intakes/{proposal_id}/recommend-assignments/{site_index}/explain/stream")
def explain_recommendation_stream(
    proposal_id: str,
    site_index: int,
    locale: Literal["de", "en", "ar"] | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    proposal = _get_proposal(db, proposal_id)
    recommendations = _workshop_recommendations_for_proposal(db, proposal)
    sites = recommendations.get("sites") or []
    if site_index < 0 or site_index >= len(sites):
        raise not_found()
    site = sites[site_index]
    response_locale = locale or "de"
    trades = ", ".join(site.get("requiredSkills") or []) or "not specified"
    workshop_name = (site.get("workshopSummary") or {}).get("name") or "not selected"
    suggestions = ", ".join(item.get("name", "") for item in site.get("workshopRecommendations") or [] if item.get("name")) or "none"
    if response_locale == "ar":
        fallback_text = f"\u062a\u0645 \u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u0645\u0648\u0642\u0639 \u0628\u0646\u0627\u0621\u064b \u0639\u0644\u0649 \u0627\u0644\u0645\u0647\u0646 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629: {trades}. \u0627\u0644\u0648\u0631\u0634\u0629 \u0627\u0644\u0645\u062d\u062f\u062f\u0629 \u062d\u0627\u0644\u064a\u0627\u064b: {workshop_name}. \u0627\u0644\u0648\u0631\u0634 \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629 \u0645\u0646 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629: {suggestions}. \u0647\u0630\u0627 \u0627\u0644\u062a\u062f\u0641\u0642 \u064a\u0639\u062a\u0645\u062f \u0639\u0644\u0649 \u0627\u0644\u0648\u0631\u0634 \u0641\u0642\u0637; \u064a\u062c\u0628 \u0627\u062e\u062a\u064a\u0627\u0631 \u0648\u0631\u0634\u0629 \u0645\u0648\u062b\u0648\u0642\u0629 \u0623\u0648 \u062a\u0631\u0643 \u0627\u0644\u0645\u0648\u0642\u0639 \u0643\u062d\u0627\u062c\u0629 \u0648\u0631\u0634\u0629 \u063a\u064a\u0631 \u0645\u062d\u062f\u062f\u0629."
    elif response_locale == "en":
        fallback_text = f"This site was reviewed by required trades: {trades}. Current assigned workshop: {workshop_name}. Available workshop suggestions: {suggestions}. This workflow uses workshop partners only; assign a trusted workshop or keep it marked as workshop needed."
    else:
        fallback_text = f"Diese Baustelle wurde nach benoetigten Gewerken bewertet: {trades}. Aktuell zugeordneter Workshop: {workshop_name}. Verfuegbare Workshop-Vorschlaege: {suggestions}. Dieser Ablauf nutzt nur Workshop-Partner; bitte einen vertrauenswuerdigen Workshop zuordnen oder als Workshop offen lassen."

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(_fallback_stream_chunks(fallback_text), media_type="text/plain; charset=utf-8", headers=headers)


@router.post("/ai/intakes/{proposal_id}/confirm")
def confirm_intake(proposal_id: str, payload: AIIntakeConfirmPayload, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    site_assignments = {item.siteIndex: item.employeeIds for item in payload.siteAssignments}
    result = confirm_proposal(
        db,
        proposal,
        existing_customer_id=payload.existingCustomerId,
        site_assignments=site_assignments,
        manual_estimated_price=payload.manualEstimatedPrice,
        payment_drafts=[item.model_dump() for item in payload.paymentDrafts] if payload.paymentDrafts is not None else None,
    )
    db.commit()
    db.refresh(proposal)
    return {
        "proposal": proposal_payload(proposal),
        "result": result,
    }
