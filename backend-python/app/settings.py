from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - fallback for environments without python-dotenv installed yet
    def load_dotenv(*args, **kwargs):  # type: ignore[no-redef]
        return False


ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
if not load_dotenv(ENV_FILE):
    if ENV_FILE.exists():
        for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    cors_origin: str = os.getenv("CORS_ORIGIN", "http://localhost:3000")
    log_level: str = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()
    assemblyai_api_key: str = os.getenv("ASSEMBLYAI_API_KEY", "").strip()
    assemblyai_api_base: str = os.getenv("ASSEMBLYAI_API_BASE", "https://api.assemblyai.com").rstrip("/")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "").strip()
    openrouter_api_base: str = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1").rstrip("/")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "openrouter/free").strip()
    openrouter_site_url: str = os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000").strip()
    openrouter_app_name: str = os.getenv("OPENROUTER_APP_NAME", "Mini ERP AI").strip()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
