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
from .routers import ai, auth, core, invoices, platform, rag, system
from .settings import get_settings

app = FastAPI(title="Simple Accounting Python Backend")

settings = get_settings()
allowed_origins = [origin.strip().rstrip("/") for origin in settings.cors_origin.split(",") if origin.strip()]
if not allowed_origins:
    allowed_origins = ["http://localhost:3000"]
unsafe_methods = {"POST", "PUT", "PATCH", "DELETE"}
MAX_REQUEST_BODY_BYTES = 50 * 1024 * 1024


class RequestBodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        raw_content_length = scope.get("headers", [])
        content_length = next((value for key, value in raw_content_length if key.lower() == b"content-length"), None)
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    await JSONResponse(status_code=413, content={"message": "Request body is too large."})(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse(status_code=400, content={"message": "Invalid Content-Length header."})(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(status_code=413, detail="Request body is too large.")
            return message

        await self.app(scope, limited_receive, send)


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
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    start = time.perf_counter()
    response = None
    try:
        origin = (request.headers.get("origin") or "").rstrip("/")
        uses_session_cookie = bool(request.cookies.get(auth.SESSION_COOKIE_NAME))
        if (
            request.url.path.startswith("/api/")
            and request.method.upper() in unsafe_methods
            and uses_session_cookie
            and origin
            and origin not in allowed_origins
        ):
            response = JSONResponse(status_code=403, content={"message": "Invalid request origin."})
            return response
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
            if request.url.path.startswith("/api/"):
                response.headers["cache-control"] = "no-store"
                response.headers["x-content-type-options"] = "nosniff"
                response.headers["x-frame-options"] = "DENY"
                response.headers["referrer-policy"] = "no-referrer"


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail}, headers=exc.headers)


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


@app.get("/api/live")
def liveness() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/ready")
def readiness() -> dict:
    return health()


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(core.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(platform.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(system.router, prefix="/api")
