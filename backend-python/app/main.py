from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .routers import ai, core, invoices
from .settings import get_settings

app = FastAPI(title="Simple Accounting Python Backend")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"message": "Interner Serverfehler."})


assets_dir = Path(__file__).resolve().parents[2] / "backend" / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/api/health")
def health() -> dict:
    from datetime import datetime, timezone

    return {"ok": True, "time": datetime.now(timezone.utc).isoformat()}


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(core.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
