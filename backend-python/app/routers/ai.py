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
from ..models import Proposal
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
    maybe_build_scope_first_reply,
    sanitize_intake_assistant_reply,
)
from ..services.staffing import build_staffing_explanation_context, format_staffing_explanation, recommend_staff_for_proposal
from ..utils import as_datetime, decimal_or_none, end_of_utc_day, ensure, json_dumps, not_found, proposal_payload

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
    deterministic_reply = maybe_build_scope_first_reply(proposal, proposal.messages)
    if deterministic_reply:
        append_message(db, proposal, "assistant", deterministic_reply)
        db.commit()
        return StreamingResponse(iter([deterministic_reply]), media_type="text/plain; charset=utf-8", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    ensure_gemini_ready()

    def generate() -> Iterable[str]:
        assistant_parts: list[str] = []
        try:
            prompt = build_intake_chat_prompt(proposal, proposal.messages)
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


@router.post("/ai/intakes/{proposal_id}/recommend-assignments")
def recommend_assignments(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    recommendations = recommend_staff_for_proposal(db, proposal)
    proposal.recommended_team_json = json_dumps(recommendations)
    if recommendations.get("pricePreview") is not None:
        proposal.estimated_price = decimal_or_none(recommendations["pricePreview"])
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
    recommendations = recommend_staff_for_proposal(db, proposal)
    try:
        context = build_staffing_explanation_context(proposal, recommendations, site_index)
    except IndexError as exc:
        raise not_found() from exc

    response_locale = locale or ("ar" if any("؀" <= char <= "ۿ" for message in proposal.messages for char in (message.content or "")) else "de")
    fallback_text = format_staffing_explanation(context, response_locale)

    def generate() -> Iterable[str]:
        emitted = False
        try:
            prompt = _staffing_explanation_prompt(context, response_locale)
            for chunk in stream_text(prompt):
                if chunk:
                    emitted = True
                    yield chunk
        except Exception as exc:
            logger.warning(
                "Staffing explanation AI stream failed; using deterministic fallback: proposal_id=%s site_index=%s error=%s",
                proposal_id,
                site_index,
                exc,
            )
        if not emitted:
            for chunk in _fallback_stream_chunks(fallback_text):
                yield chunk

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8", headers=headers)


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
