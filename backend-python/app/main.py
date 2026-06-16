from __future__ import annotations

import json
import logging
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .database import DATABASE_URL, engine, init_db
from .routers import ai, auth, core, invoices, system
from .settings import get_settings

app = FastAPI(title="Simple Accounting Python Backend")

settings = get_settings()


def configure_logging() -> logging.Logger:
    logs_dir = Path(__file__).resolve().parents[1] / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("omran")
    logger.setLevel(getattr(logging, settings.log_level, logging.INFO))
    logger.propagate = False
    if logger.handlers:
        return logger

    formatter = logging.Formatter("%(message)s")
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    file_handler = RotatingFileHandler(logs_dir / "app.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    logger.addHandler(file_handler)
    return logger


logger = configure_logging()


def log_event(level: int, event: str, **fields) -> None:
    payload = {"event": event, **fields}
    logger.log(level, json.dumps(payload, ensure_ascii=False, default=str))


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    start = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.exception(
            json.dumps(
                {
                    "event": "api_exception",
                    "requestId": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "durationMs": duration_ms,
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        raise
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        status_code = getattr(response, "status_code", 500)
        log_event(
            logging.INFO if status_code < 500 else logging.ERROR,
            "api_request",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            statusCode=status_code,
            durationMs=duration_ms,
        )
        if response is not None:
            response.headers["x-request-id"] = request_id


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log_event(logging.ERROR, "unhandled_exception", path=request.url.path, error=str(exc))
    return JSONResponse(status_code=500, content={"message": "Interner Serverfehler."})


assets_dir = Path(__file__).resolve().parents[2] / "backend" / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/api/health")
def health() -> dict:
    from datetime import datetime, timezone

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    database_kind = "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite"
    return {"ok": True, "database": database_kind, "time": datetime.now(timezone.utc).isoformat()}


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(core.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(system.router, prefix="/api")
