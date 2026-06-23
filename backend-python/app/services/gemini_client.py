from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
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


def _e2e_fake_ai_enabled() -> bool:
    return os.getenv("E2E_FAKE_AI", "").strip().lower() in {"1", "true", "yes", "on"}


def _e2e_manager_message(prompt: str) -> str:
    marker = "Manager message:"
    if marker not in prompt:
        return ""
    return prompt.split(marker, 1)[1].strip()


def _e2e_generate_text(prompt: str, response_mime_type: str | None = None) -> str:
    message = _e2e_manager_message(prompt) or prompt.strip()
    if response_mime_type == "application/json":
        return json.dumps(
            {
                "save": bool(message),
                "facts": [f"E2E captured manager input: {message[:240]}"] if message else [],
            }
        )
    return "E2E assistant captured the project details for RAG storage."


def _looks_like_quota_error(exc: Exception) -> bool:
    detail = getattr(exc, "detail", None)
    text = f"{detail or ''} {str(exc)}".lower()
    return any(token in text for token in ("429", "quota", "rate limit", "resource exhausted"))


def _looks_like_missing_gemini(exc: Exception) -> bool:
    detail = getattr(exc, "detail", None)
    text = f"{detail or ''} {str(exc)}".lower()
    return "missing gemini_api_key" in text or "google-generativeai is not installed" in text


def _openrouter_enabled() -> bool:
    return bool(get_settings().openrouter_api_key)


def _openrouter_headers() -> dict[str, str]:
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    if settings.openrouter_site_url:
        headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        headers["X-Title"] = settings.openrouter_app_name
    return headers


def _strip_code_fences(text: str) -> str:
    candidate = text.strip()
    if not candidate.startswith("```"):
        return candidate
    lines = candidate.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _openrouter_generate_text(prompt: str, response_mime_type: str | None = None) -> str:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=502,
            detail="Gemini quota was reached and OPENROUTER_API_KEY is missing. Add it to backend-python/.env.",
        )

    messages: list[dict[str, str]] = []
    if response_mime_type == "application/json":
        messages.append(
            {
                "role": "system",
                "content": (
                    "You are a strict JSON API. Return exactly one valid JSON object only. "
                    "Do not use markdown, code fences, comments, prose, or explanations. "
                    "Use null, empty strings, or empty arrays when information is missing."
                ),
            }
        )
    messages.append({"role": "user", "content": prompt})

    payload: dict[str, Any] = {
        "model": settings.openrouter_model or "openrouter/free",
        "messages": messages,
        "temperature": 0.0 if response_mime_type == "application/json" else 0.2,
    }
    if response_mime_type == "application/json" and settings.openrouter_model != "openrouter/free":
        payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        f"{settings.openrouter_api_base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=_openrouter_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"OpenRouter fallback failed: {exc.code} {body}") from exc
    except Exception as exc:  # pragma: no cover - network errors vary
        raise HTTPException(status_code=502, detail=f"OpenRouter fallback failed: {exc}") from exc

    try:
        data = json.loads(raw)
        content = str(data["choices"][0]["message"].get("content") or "")
        return _strip_code_fences(content)
    except Exception as exc:
        logger.warning("OpenRouter fallback returned an invalid response body: %s", raw[:500])
        raise HTTPException(status_code=502, detail="OpenRouter fallback returned an invalid response.") from exc


def _fallback_text_if_possible(exc: Exception, prompt: str, response_mime_type: str | None = None) -> str | None:
    if not (_looks_like_quota_error(exc) or _looks_like_missing_gemini(exc)):
        return None
    if not _openrouter_enabled():
        return None
    logger.warning("Gemini unavailable/quota-limited; using OpenRouter fallback.")
    return _openrouter_generate_text(prompt, response_mime_type=response_mime_type)


def ensure_gemini_ready():
    settings = get_settings()
    if _e2e_fake_ai_enabled():
        return None, settings
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
    if _e2e_fake_ai_enabled():
        return _e2e_generate_text(prompt, response_mime_type=response_mime_type)
    try:
        model = _get_model(response_mime_type=response_mime_type)
        response = model.generate_content(prompt)
        text = _extract_response_text(response)
        if text:
            return text
        debug_text = _debug_text(_response_debug_summary(response))
        logger.warning("Gemini returned an empty text response. %s", debug_text)
        raise HTTPException(
            status_code=502,
            detail=(
                "AI provider returned no text. Try a shorter message, remove unusual formatting, "
                "or retry the request."
            ),
        )
    except Exception as exc:  # pragma: no cover - provider/library errors vary
        fallback = _fallback_text_if_possible(exc, prompt, response_mime_type=response_mime_type)
        if fallback is not None:
            return fallback
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def stream_text(prompt: str) -> Iterable[str]:
    if _e2e_fake_ai_enabled():
        reply = _e2e_generate_text(prompt)
        midpoint = max(1, len(reply) // 2)
        yield reply[:midpoint]
        yield reply[midpoint:]
        return
    try:
        model = _get_model()
        response = model.generate_content(prompt, stream=True)
        yielded = False
        for chunk in response:
            text = _extract_response_text(chunk)
            if text:
                yielded = True
                yield text
        if not yielded:
            logger.warning("Gemini stream returned no text chunks.")
            raise HTTPException(
                status_code=502,
                detail=(
                    "AI provider returned no text. Try a shorter message, remove unusual formatting, "
                    "or retry the request."
                ),
            )
    except Exception as exc:  # pragma: no cover - provider/library errors vary
        fallback = _fallback_text_if_possible(exc, prompt)
        if fallback is not None:
            yield fallback
            return
        if isinstance(exc, HTTPException):
            raise
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
