from __future__ import annotations

from collections.abc import Iterable

from fastapi import HTTPException

from ..settings import get_settings


def _get_model(response_mime_type: str | None = None):
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="Missing GEMINI_API_KEY. Add it to backend-python/.env.")

    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="google-generativeai is not installed.") from exc

    genai.configure(api_key=settings.gemini_api_key)
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
