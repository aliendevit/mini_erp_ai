from __future__ import annotations

import json
import logging
from time import monotonic, sleep
from typing import Any
from urllib import error, request

from fastapi import HTTPException

from ..settings import get_settings


logger = logging.getLogger(__name__)
TRANSCRIPTION_PROVIDER = "assemblyai"
_LOCALE_HINTS = {
    "de": "de",
    "en": "en",
    "ar": "ar",
}
_DEFAULT_SPEECH_MODELS = ["universal-3-pro", "universal-2"]


def ensure_assemblyai_ready() -> tuple[str, str]:
    settings = get_settings()
    api_key = settings.assemblyai_api_key.strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing ASSEMBLYAI_API_KEY. Add it to backend-python/.env.")
    return api_key, settings.assemblyai_api_base


def _request_json(method: str, url: str, *, api_key: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {
        "Authorization": api_key,
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url, data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"AssemblyAI request failed: {detail or exc.reason}") from exc
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"AssemblyAI request failed: {exc.reason}") from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AssemblyAI returned invalid JSON.") from exc


def _upload_audio(audio_bytes: bytes, *, api_key: str, api_base: str) -> str:
    req = request.Request(
        f"{api_base}/v2/upload",
        data=audio_bytes,
        method="POST",
        headers={
            "Authorization": api_key,
            "Content-Type": "application/octet-stream",
            "Accept": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=120) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"AssemblyAI upload failed: {detail or exc.reason}") from exc
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"AssemblyAI upload failed: {exc.reason}") from exc

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AssemblyAI upload returned invalid JSON.") from exc

    upload_url = str(payload.get("upload_url") or "").strip()
    if not upload_url:
        raise HTTPException(status_code=502, detail="AssemblyAI upload did not return an upload URL.")
    return upload_url


def _response_debug_text(payload: dict[str, Any]) -> str:
    parts = [
        f"status={payload.get('status')}",
        f"languageCode={payload.get('language_code')}",
        f"speechModel={payload.get('speech_model_used') or payload.get('speech_model')}",
        f"speechModels={payload.get('speech_models')}",
        f"audioDuration={payload.get('audio_duration')}",
        f"confidence={payload.get('confidence')}",
    ]
    error_text = payload.get("error")
    if error_text:
        parts.append(f"error={error_text}")
    return "; ".join(parts)


def transcribe_audio(audio_bytes: bytes, mime_type: str, locale_hint: str | None = None) -> dict[str, Any]:
    api_key, api_base = ensure_assemblyai_ready()
    upload_url = _upload_audio(audio_bytes, api_key=api_key, api_base=api_base)

    transcript_request: dict[str, Any] = {
        "audio_url": upload_url,
        "speech_models": ["universal-3-pro", "universal-2"],
        "format_text": True,
    }
    language_code = _LOCALE_HINTS.get((locale_hint or "").lower())
    if language_code:
        transcript_request["language_code"] = language_code
    else:
        transcript_request["language_detection"] = True

    submitted = _request_json(
        "POST",
        f"{api_base}/v2/transcript",
        api_key=api_key,
        payload=transcript_request,
    )
    transcript_id = str(submitted.get("id") or "").strip()
    if not transcript_id:
        raise HTTPException(status_code=502, detail="AssemblyAI transcript request did not return an ID.")

    deadline = monotonic() + 120.0
    latest = submitted
    while True:
        latest = _request_json("GET", f"{api_base}/v2/transcript/{transcript_id}", api_key=api_key)
        status = str(latest.get("status") or "").lower()
        if status == "completed":
            break
        if status == "error":
            debug_text = _response_debug_text(latest)
            logger.warning("AssemblyAI transcription error: %s", debug_text)
            raise HTTPException(status_code=502, detail=f"AssemblyAI transcription failed. {debug_text}")
        if monotonic() >= deadline:
            raise HTTPException(status_code=504, detail="Timed out while waiting for AssemblyAI transcription.")
        sleep(1.0)

    transcript = str(latest.get("text") or "").strip()
    debug_text = _response_debug_text(latest)
    if not transcript:
        logger.warning("AssemblyAI transcription returned no transcript. %s", debug_text)

    return {
        "transcript": transcript,
        "detectedLanguage": latest.get("language_code"),
        "provider": TRANSCRIPTION_PROVIDER,
        "debug": latest,
        "debugText": debug_text,
    }
