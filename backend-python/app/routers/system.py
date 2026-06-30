from __future__ import annotations

import json
import os
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, desc, func, or_, select

from ..database import SessionLocal, engine, init_db
from ..models import AuditLog, SaasTenant, UserAccount
from ..routers.auth import _bearer_token, _hash_token, require_any_permission, require_permission
from ..services.audit import record_audit
from ..settings import get_settings

router = APIRouter(prefix="/system", tags=["system"])

ROOT = Path(__file__).resolve().parents[2]
BACKUP_ROOT = ROOT / "backups"
UPLOADS_ROOT = ROOT / "uploads"
BACKUP_PREFIX = "omran-backup-"
BACKUP_SUFFIX = ".zip"
AUDIT_ACTIONS = {
    "platform.company.created",
    "platform.manager_password.reset",
    "platform.invoice.created",
    "platform.invoice.updated",
    "platform.invoice.deleted",
    "platform.invoice.payment.added",
    "platform.invoice.payment.deleted",
    "user.created",
    "user.ai_permissions.updated",
    "user.password.changed",
    "invoice.updated",
    "invoice.deleted",
    "invoice.payment.added",
    "invoice.payment.deleted",
    "order.created",
    "order.updated",
    "order.deleted",
    "ai.proposal.confirmed",
    "ai_intake.confirmed",
    "tracking.baseline.updated",
    "tracking.progress.created",
    "tracking.progress.updated",
    "tracking.progress.deleted",
    "tracking.task.created",
    "tracking.task.updated",
    "tracking.task.deleted",
    "tracking.issue.created",
    "tracking.issue.updated",
    "tracking.issue.deleted",
    "tracking.material.created",
    "tracking.material.updated",
    "tracking.material.deleted",
    "backup.restored",
    "monitoring.alert.updated",
    "monitoring_alert.updated",
}


def _sqlite_path() -> Path:
    database_url = get_settings().database_url
    if not database_url.startswith("sqlite:///"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Current database is not SQLite.",
        )
    raw = database_url.replace("sqlite:///", "", 1)
    path = Path(raw)
    return path if path.is_absolute() else ROOT / path


def _database_url() -> str:
    return get_settings().database_url


def _database_kind(database_url: str | None = None) -> str:
    url = database_url or _database_url()
    if url.startswith("sqlite:///"):
        return "sqlite"
    if url.startswith("postgresql://") or url.startswith("postgresql+pg8000://"):
        return "postgresql"
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported database type for backup/restore.")


def _postgres_connection_parts(database_url: str | None = None) -> dict[str, str]:
    url = (database_url or _database_url()).replace("postgresql+pg8000://", "postgresql://", 1)
    parsed = urlparse(url)
    database = parsed.path.lstrip("/")
    if parsed.scheme != "postgresql" or not parsed.hostname or not parsed.username or not database:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "PostgreSQL DATABASE_URL is incomplete.")
    return {
        "host": parsed.hostname,
        "port": str(parsed.port or 5432),
        "user": unquote(parsed.username),
        "password": unquote(parsed.password or ""),
        "database": unquote(database),
    }


def _run_postgres_tool(args: list[str], password: str) -> None:
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    try:
        subprocess.run(args, check=True, capture_output=True, text=True, env=env)
    except FileNotFoundError as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "PostgreSQL backup tools are not installed. Install pg_dump/pg_restore or use the Docker backend image.",
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"PostgreSQL backup command failed: {detail}") from exc


def _dump_postgres_database(target: Path) -> None:
    parts = _postgres_connection_parts()
    _run_postgres_tool(
        [
            "pg_dump",
            "--format=custom",
            "--no-owner",
            "--host",
            parts["host"],
            "--port",
            parts["port"],
            "--username",
            parts["user"],
            "--dbname",
            parts["database"],
            "--file",
            str(target),
        ],
        parts["password"],
    )


def _reset_postgres_public_schema(parts: dict[str, str]) -> None:
    _run_postgres_tool(
        [
            "psql",
            "--host",
            parts["host"],
            "--port",
            parts["port"],
            "--username",
            parts["user"],
            "--dbname",
            parts["database"],
            "--command",
            (
                'DROP SCHEMA IF EXISTS public CASCADE; '
                'CREATE SCHEMA public; '
                f'GRANT ALL ON SCHEMA public TO "{parts["user"]}"; '
                "GRANT ALL ON SCHEMA public TO public;"
            ),
        ],
        parts["password"],
    )


def _restore_postgres_database(source: Path) -> None:
    parts = _postgres_connection_parts()
    engine.dispose()
    _reset_postgres_public_schema(parts)
    _run_postgres_tool(
        [
            "pg_restore",
            "--single-transaction",
            "--no-owner",
            "--host",
            parts["host"],
            "--port",
            parts["port"],
            "--username",
            parts["user"],
            "--dbname",
            parts["database"],
            str(source),
        ],
        parts["password"],
    )


def _zip_directory(source: Path, target: Path) -> int:
    count = 0
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in source.rglob("*"):
            if item.is_file():
                archive.write(item, item.relative_to(source))
                count += 1
    return count


def _safe_backup_path(file_name: str) -> Path:
    if "/" in file_name or "\\" in file_name or not file_name.startswith(BACKUP_PREFIX) or not file_name.endswith(BACKUP_SUFFIX):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found.")
    path = (BACKUP_ROOT / file_name).resolve()
    if BACKUP_ROOT.resolve() not in path.parents or not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found.")
    return path


def _read_manifest(archive_path: Path) -> dict:
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            with archive.open("manifest.json") as manifest_file:
                return json.loads(manifest_file.read().decode("utf-8"))
    except Exception:
        return {}


def _backup_info(archive_path: Path) -> dict:
    manifest = _read_manifest(archive_path)
    return {
        "fileName": archive_path.name,
        "sizeBytes": archive_path.stat().st_size,
        "createdAt": manifest.get("createdAt"),
        "databaseUrlKind": manifest.get("databaseUrlKind"),
        "databaseFile": manifest.get("databaseFile"),
        "uploadFileCount": manifest.get("uploadFileCount", 0),
    }


def _create_backup_archive(label: str = "backup") -> dict:
    database_kind = _database_kind()

    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_name = f"{BACKUP_PREFIX}{label}-{stamp}{BACKUP_SUFFIX}"
    archive_path = BACKUP_ROOT / backup_name
    work_dir = BACKUP_ROOT / f".tmp-{uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=False)

    try:
        if database_kind == "sqlite":
            db_path = _sqlite_path()
            if not db_path.exists():
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Database file not found: {db_path}")
            db_target = work_dir / db_path.name
            shutil.copy2(db_path, db_target)
        else:
            db_target = work_dir / "database.dump"
            _dump_postgres_database(db_target)

        upload_file_count = 0
        uploads_zip = work_dir / "uploads.zip"
        if UPLOADS_ROOT.exists():
            upload_file_count = _zip_directory(UPLOADS_ROOT, uploads_zip)
        else:
            uploads_zip.write_bytes(b"")

        manifest = {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "databaseUrlKind": database_kind,
            "databaseFile": db_target.name,
            "uploadsArchive": uploads_zip.name,
            "uploadFileCount": upload_file_count,
        }
        (work_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for item in work_dir.rglob("*"):
                if item.is_file():
                    archive.write(item, item.relative_to(work_dir))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    return _backup_info(archive_path)


def _safe_extract(archive: zipfile.ZipFile, target_dir: Path) -> None:
    target_root = target_dir.resolve()
    for member in archive.infolist():
        member_path = (target_root / member.filename).resolve()
        if target_root != member_path and target_root not in member_path.parents:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Backup archive contains unsafe paths.")
    archive.extractall(target_root)


def _require_authenticated_user_id(authorization: str | None = Header(default=None)) -> str:
    token_hash = _hash_token(_bearer_token(authorization))
    db = SessionLocal()
    try:
        user = db.scalar(
            select(UserAccount.id).where(UserAccount.session_token_hash == token_hash, UserAccount.is_active == True)
        )
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
        return str(user)
    finally:
        db.close()


def _parse_positive_int(value: int, fallback: int, *, minimum: int = 1, maximum: int = 100) -> int:
    if value < minimum:
        return fallback
    return min(value, maximum)


def _audit_log_payload(item: AuditLog, actor_email: str | None) -> dict:
    try:
        details = json.loads(item.details_json or "{}")
    except Exception:
        details = {}
    return {
        "id": item.id,
        "action": item.action,
        "entityType": item.entity_type,
        "entityId": item.entity_id,
        "actorUserId": item.actor_user_id,
        "actorEmail": actor_email,
        "summary": item.summary,
        "details": details,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("/audit-scopes")
def list_audit_scopes(
    current_user: UserAccount = Depends(require_any_permission("view_audit_log", "view_platform_audit")),
) -> dict:
    db = SessionLocal()
    try:
        if current_user.account_level == "platform_admin":
            tenants = db.scalars(select(SaasTenant).order_by(SaasTenant.company_name)).all()
            return {
                "defaultScope": "platform",
                "scopes": [
                    {"id": "platform", "label": "OMRAN Platform", "kind": "platform"},
                    *[
                        {"id": tenant.id, "label": tenant.company_name, "kind": "company"}
                        for tenant in tenants
                    ],
                ],
            }
        if current_user.tenant_id:
            tenant = db.get(SaasTenant, current_user.tenant_id)
            return {
                "defaultScope": current_user.tenant_id,
                "scopes": [
                    {
                        "id": current_user.tenant_id,
                        "label": tenant.company_name if tenant else current_user.tenant_name or "Company",
                        "kind": "company",
                    }
                ],
            }
        return {
            "defaultScope": "my-account",
            "scopes": [{"id": "my-account", "label": current_user.email, "kind": "legacy"}],
        }
    finally:
        db.close()


@router.get("/backups")
def list_backups(_: UserAccount = Depends(require_permission("restore_backups"))) -> dict:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    backups = sorted(BACKUP_ROOT.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"), key=lambda item: item.stat().st_mtime, reverse=True)
    return {"items": [_backup_info(item) for item in backups[:20]]}


@router.get("/audit-logs")
def list_audit_logs(
    page: int = 1,
    pageSize: int = 20,
    action: str | None = None,
    entityType: str | None = None,
    scope: str | None = None,
    tenantId: str | None = None,
    q: str | None = None,
    _: UserAccount = Depends(require_any_permission("view_audit_log", "view_platform_audit")),
) -> dict:
    current_user = _
    page = max(page, 1)
    page_size = _parse_positive_int(pageSize, 20, maximum=50)
    db = SessionLocal()
    try:
        filters = []
        scope_filters = []
        requested_scope = tenantId or scope
        if current_user.account_level == "platform_admin":
            if requested_scope and requested_scope not in {"platform", "global"}:
                tenant = db.get(SaasTenant, requested_scope)
                if not tenant:
                    raise HTTPException(status.HTTP_404_NOT_FOUND, "Audit company scope not found.")
                scope_filters.append(
                    or_(
                        AuditLog.tenant_id == tenant.id,
                        and_(AuditLog.tenant_id.is_(None), UserAccount.tenant_id == tenant.id),
                    )
                )
            else:
                scope_filters.append(
                    and_(
                        AuditLog.tenant_id.is_(None),
                        or_(
                            AuditLog.actor_user_id.is_(None),
                            UserAccount.id.is_(None),
                            UserAccount.tenant_id.is_(None),
                            UserAccount.account_level == "platform_admin",
                        ),
                    )
                )
        elif current_user.tenant_id:
            scope_filters.append(
                or_(
                    AuditLog.tenant_id == current_user.tenant_id,
                    and_(AuditLog.tenant_id.is_(None), UserAccount.tenant_id == current_user.tenant_id),
                )
            )
        else:
            scope_filters.extend([AuditLog.tenant_id.is_(None), AuditLog.actor_user_id == current_user.id])
        if action and action != "all":
            filters.append(AuditLog.action == action)
        if entityType and entityType != "all":
            filters.append(AuditLog.entity_type == entityType)
        if q and q.strip():
            pattern = f"%{q.strip()}%"
            filters.append(
                or_(
                    AuditLog.action.ilike(pattern),
                    AuditLog.entity_type.ilike(pattern),
                    AuditLog.entity_id.ilike(pattern),
                    AuditLog.summary.ilike(pattern),
                    AuditLog.actor_user_id.ilike(pattern),
                    UserAccount.email.ilike(pattern),
                )
            )

        base_query = select(AuditLog, UserAccount.email).outerjoin(UserAccount, AuditLog.actor_user_id == UserAccount.id)
        count_query = select(func.count(AuditLog.id)).outerjoin(UserAccount, AuditLog.actor_user_id == UserAccount.id)
        if scope_filters or filters:
            base_query = base_query.where(*scope_filters, *filters)
            count_query = count_query.where(*scope_filters, *filters)

        total = db.scalar(count_query) or 0
        rows = db.execute(
            base_query.order_by(desc(AuditLog.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()

        def scoped_count(*extra_filters):
            return (
                db.scalar(
                    select(func.count(AuditLog.id))
                    .outerjoin(UserAccount, AuditLog.actor_user_id == UserAccount.id)
                    .where(*scope_filters, *extra_filters)
                )
                or 0
            )

        stats = {
            "total": scoped_count(),
            "invoiceChanges": scoped_count(
                AuditLog.action.in_(
                    ["invoice.updated", "invoice.deleted", "invoice.payment.added", "invoice.payment.deleted"]
                )
            ),
            "backupRestores": scoped_count(AuditLog.action == "backup.restored"),
            "monitoringResolutions": scoped_count(AuditLog.action.in_(["monitoring.alert.updated", "monitoring_alert.updated"])),
            "aiConfirmations": scoped_count(AuditLog.action.in_(["ai.proposal.confirmed", "ai_intake.confirmed"])),
        }

        return {
            "items": [_audit_log_payload(item, actor_email) for item, actor_email in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "actions": sorted(AUDIT_ACTIONS),
            "stats": stats,
        }
    finally:
        db.close()


@router.post("/backups", status_code=status.HTTP_201_CREATED)
def create_backup(_: UserAccount = Depends(require_permission("restore_backups"))) -> dict:
    return _create_backup_archive()


@router.get("/backups/{file_name}")
def download_backup(file_name: str, _: UserAccount = Depends(require_permission("restore_backups"))) -> FileResponse:
    path = _safe_backup_path(file_name)
    return FileResponse(path, media_type="application/zip", filename=path.name)


@router.post("/restore")
async def restore_backup(
    backupFile: UploadFile = File(...),
    confirmation: str = Form(...),
    current_user: UserAccount = Depends(require_permission("restore_backups")),
    current_user_id: str | None = None,
) -> dict:
    if confirmation != "RESTORE":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Restore confirmation is required.")
    if not backupFile.filename or not backupFile.filename.endswith(BACKUP_SUFFIX):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload a valid .zip backup file.")

    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    incoming_path = BACKUP_ROOT / f"incoming-restore-{uuid4().hex}{BACKUP_SUFFIX}"
    extract_dir = BACKUP_ROOT / f".restore-{uuid4().hex}"
    extract_dir.mkdir(parents=True, exist_ok=False)

    try:
        with incoming_path.open("wb") as target:
            shutil.copyfileobj(backupFile.file, target)

        with zipfile.ZipFile(incoming_path, "r") as archive:
            if "manifest.json" not in archive.namelist():
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Backup manifest is missing.")
            _safe_extract(archive, extract_dir)

        manifest = json.loads((extract_dir / "manifest.json").read_text(encoding="utf-8"))
        archive_database_kind = manifest.get("databaseUrlKind", "sqlite")
        current_database_kind = _database_kind()
        if archive_database_kind != current_database_kind:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Backup database type is {archive_database_kind}, but current database is {current_database_kind}.",
            )
        source_db = extract_dir / manifest.get("databaseFile", "")
        uploads_archive = extract_dir / manifest.get("uploadsArchive", "uploads.zip")
        if not source_db.exists():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Backup database file is missing.")

        safety_backup = _create_backup_archive("pre-restore")
        if current_database_kind == "sqlite":
            db_path = _sqlite_path()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            engine.dispose()
            shutil.copy2(source_db, db_path)
        else:
            _restore_postgres_database(source_db)
        init_db()

        if uploads_archive.exists():
            if UPLOADS_ROOT.exists():
                shutil.rmtree(UPLOADS_ROOT)
            UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(uploads_archive, "r") as uploads_zip:
                _safe_extract(uploads_zip, UPLOADS_ROOT)

        audit_db = SessionLocal()
        try:
            record_audit(
                audit_db,
                action="backup.restored",
                entity_type="SystemBackup",
                entity_id=backupFile.filename,
                actor_user_id=current_user_id or current_user.id,
                summary="Backup restored from uploaded archive",
                details={"fileName": backupFile.filename, "safetyBackup": safety_backup.get("fileName")},
            )
            audit_db.commit()
        finally:
            audit_db.close()

        return {"ok": True, "safetyBackup": safety_backup}
    finally:
        shutil.rmtree(extract_dir, ignore_errors=True)
        incoming_path.unlink(missing_ok=True)
