from __future__ import annotations

import logging
from collections.abc import Iterable
from io import BytesIO
from time import monotonic, sleep
from typing import Any

from fastapi import HTTPException

from ..settings import get_settings


logger = logging.getLogger(__name__)
TRANSCRIPTION_PROVIDER = "gemini"
_LOCALE_HINTS = {
    "de": "German",
    "en": "English",
    "ar": "Arabic",
}


def ensure_gemini_ready():
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="Missing GEMINI_API_KEY. Add it to backend-python/.env.")

    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="google-generativeai is not installed.") from exc

    genai.configure(api_key=settings.gemini_api_key)
    return genai, settings


def _get_model(response_mime_type: str | None = None):
    genai, settings = ensure_gemini_ready()
    generation_config = {"response_mime_type": response_mime_type} if response_mime_type else None
    return genai.GenerativeModel(settings.gemini_model, generation_config=generation_config)


def generate_text(prompt: str, response_mime_type: str | None = None) -> str:
    model = _get_model(response_mime_type=response_mime_type)
    try:
        response = model.generate_content(prompt)
    except Exception as exc:  # pragma: no cover - provider/library errors vary
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return (getattr(response, "text", "") or "").strip()


def stream_text(prompt: str) -> Iterable[str]:
    model = _get_model()
    try:
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            text = getattr(chunk, "text", None)
            if text:
                yield text
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - provider/library errors vary
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _wait_for_uploaded_file_ready(genai: Any, uploaded: Any, timeout_seconds: float = 30.0) -> Any:
    file_name = getattr(uploaded, "name", None)
    if not file_name:
        return uploaded

    current = uploaded
    deadline = monotonic() + timeout_seconds
    while True:
        state = getattr(current, "state", None)
        state_name = getattr(state, "name", state)
        if not state_name or state_name == "ACTIVE":
            return current
        if state_name == "FAILED":
            raise HTTPException(status_code=502, detail="Gemini could not process the uploaded audio.")
        if monotonic() >= deadline:
            raise HTTPException(status_code=504, detail="Timed out while Gemini processed the uploaded audio.")
        sleep(0.5)
        try:
            current = genai.get_file(file_name)
        except Exception:
            logger.warning("Gemini get_file() failed while polling uploaded audio readiness.", exc_info=True)
            return uploaded


def _extract_response_text(response: Any) -> str:
    parts_text: list[str] = []
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            text = getattr(part, "text", None)
            if text:
                parts_text.append(str(text))
    if parts_text:
        return "".join(parts_text).strip()

    try:
        return (getattr(response, "text", "") or "").strip()
    except ValueError:
        return ""


def _response_debug_summary(response: Any, uploaded: Any | None = None) -> dict[str, Any]:
    prompt_feedback = getattr(response, "prompt_feedback", None)
    block_reason = getattr(prompt_feedback, "block_reason", None)
    block_reason_name = getattr(block_reason, "name", block_reason)

    candidates_summary: list[dict[str, Any]] = []
    for index, candidate in enumerate(getattr(response, "candidates", None) or []):
        finish_reason = getattr(candidate, "finish_reason", None)
        finish_reason_name = getattr(finish_reason, "name", finish_reason)
        content = getattr(candidate, "content", None)
        parts = list(getattr(content, "parts", None) or [])
        text_part_count = sum(1 for part in parts if getattr(part, "text", None))
        candidates_summary.append(
            {
                "index": index,
                "finishReason": finish_reason_name,
                "partCount": len(parts),
                "textPartCount": text_part_count,
            }
        )

    uploaded_state = None
    if uploaded is not None:
        state = getattr(uploaded, "state", None)
        uploaded_state = getattr(state, "name", state)

    return {
        "uploadedState": uploaded_state,
        "promptBlockReason": block_reason_name,
        "candidateCount": len(candidates_summary),
        "candidates": candidates_summary,
    }


def _debug_text(debug: dict[str, Any]) -> str:
    candidate_parts = []
    for candidate in debug.get("candidates", []):
        candidate_parts.append(
            f"candidate{candidate.get('index')}:finish={candidate.get('finishReason')},parts={candidate.get('partCount')},textParts={candidate.get('textPartCount')}"
        )

    parts = [
        f"uploadedState={debug.get('uploadedState')}",
        f"promptBlockReason={debug.get('promptBlockReason')}",
        f"candidateCount={debug.get('candidateCount')}",
    ]
    parts.extend(candidate_parts)
    return "; ".join(parts)


def transcribe_audio(audio_bytes: bytes, mime_type: str, locale_hint: str | None = None) -> dict[str, Any]:
    genai, settings = ensure_gemini_ready()
    model = genai.GenerativeModel(
        settings.gemini_model,
        generation_config={"response_mime_type": "text/plain"},
    )

    locale_text = _LOCALE_HINTS.get((locale_hint or "").lower())
    prompt = (
        "Transcribe the spoken audio exactly as text. "
        "Return only the transcript with no summary, no markdown, no speaker labels, and no extra explanation. "
        "Keep the transcript in the original spoken language. "
        "If the speech is unclear or empty, return an empty string."
    )
    if locale_text:
        prompt += f" The expected spoken language is mostly {locale_text}."

    audio_file = BytesIO(audio_bytes)
    audio_file.name = "ai-intake.wav"
    uploaded = None

    try:
        uploaded = genai.upload_file(
            audio_file,
            mime_type=mime_type,
            display_name="ai-intake-audio",
            resumable=False,
        )
        uploaded = _wait_for_uploaded_file_ready(genai, uploaded)
        response = model.generate_content([prompt, uploaded])
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - provider/library errors vary
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        if uploaded is not None:
            try:
                genai.delete_file(uploaded)
            except Exception:
                logger.warning("Gemini delete_file() failed for uploaded audio.", exc_info=True)

    transcript = _extract_response_text(response)
    debug = _response_debug_summary(response, uploaded)
    debug_text = _debug_text(debug)
    if not transcript:
        logger.warning("Gemini transcription returned no transcript. %s", debug_text)

    return {
        "transcript": transcript,
        "detectedLanguage": None,
        "provider": TRANSCRIPTION_PROVIDER,
        "debug": debug,
        "debugText": debug_text,
    }
