from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import DateTime, Numeric, delete, insert, or_, select, text, update
from sqlalchemy.orm import Session

from .. import models as model_registry  # noqa: F401 - registers every mapped table
from ..database import Base
from ..models import CompanyProfile, UserAccount
from .audit import record_audit

COMPANY_BACKUP_FORMAT = "omran-company-backup"
COMPANY_BACKUP_VERSION = 1
COMPANY_BACKUP_PREFIX = "omran-company-"
COMPANY_BACKUP_SUFFIX = ".zip"
COMPANY_DATA_FILE = "data.json"
MAX_COMPANY_BACKUP_RECORDS = 1_000_000
MAX_COMPANY_DATA_BYTES = 256 * 1024 * 1024
MAX_COMPANY_BACKUP_FILES = max(1, int(os.getenv("MAX_COMPANY_BACKUP_FILES", "10")))
MAX_COMPANY_BACKUP_TOTAL_BYTES = max(
    1,
    int(os.getenv("MAX_COMPANY_BACKUP_TOTAL_BYTES", str(5 * 1024 * 1024 * 1024))),
)

# Platform ownership, authentication, billing, and audit history are never part
# of a company restore.
EXCLUDED_TABLES = {
    "AuditLog",
    "InvoiceSequence",
    "SaasInvoice",
    "SaasPayment",
    "SaasTenant",
    "UserAccount",
}

TENANT_ROOT_TABLES = {
    "Customer",
    "Employee",
    "Invoice",
    "Order",
    "PaymentRecord",
    "Proposal",
    "RagSource",
    "Workshop",
}

TABLES_IN_ORDER = tuple(table for table in Base.metadata.sorted_tables if table.name not in EXCLUDED_TABLES)
TABLE_BY_NAME = {table.name: table for table in TABLES_IN_ORDER}
ALLOWED_TABLES = frozenset(TABLE_BY_NAME)


def _fail(message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> None:
    raise HTTPException(status_code=status_code, detail=message)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    return value


def _serialize_row(table, row: dict[str, Any]) -> dict[str, Any]:
    return {column.name: _serialize_value(row.get(column.name)) for column in table.columns}


def _deserialize_value(column, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, DateTime) and isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            _fail(f"Backup contains an invalid date in {column.table.name}.{column.name}.")
    if isinstance(column.type, Numeric):
        try:
            return Decimal(str(value))
        except Exception:
            _fail(f"Backup contains an invalid number in {column.table.name}.{column.name}.")
    return value


def _tenant_directory(backup_root: Path, tenant_id: str) -> Path:
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()
    path = (backup_root / "companies" / tenant_key).resolve()
    root = (backup_root / "companies").resolve()
    if root not in path.parents:
        _fail("Invalid company backup location.", status.HTTP_500_INTERNAL_SERVER_ERROR)
    return path


def safe_company_backup_path(backup_root: Path, tenant_id: str, file_name: str) -> Path:
    if (
        "/" in file_name
        or "\\" in file_name
        or not file_name.startswith(COMPANY_BACKUP_PREFIX)
        or not file_name.endswith(COMPANY_BACKUP_SUFFIX)
    ):
        _fail("Company backup not found.", status.HTTP_404_NOT_FOUND)
    directory = _tenant_directory(backup_root, tenant_id)
    path = (directory / file_name).resolve()
    if directory.resolve() not in path.parents or not path.is_file():
        _fail("Company backup not found.", status.HTTP_404_NOT_FOUND)
    return path


def _read_manifest(archive_path: Path) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            return json.loads(archive.read("manifest.json").decode("utf-8"))
    except Exception:
        return {}


def company_backup_info(archive_path: Path) -> dict[str, Any]:
    manifest = _read_manifest(archive_path)
    return {
        "fileName": archive_path.name,
        "sizeBytes": archive_path.stat().st_size,
        "createdAt": manifest.get("createdAt"),
        "uploadFileCount": manifest.get("uploadFileCount", 0),
        "recordCount": manifest.get("recordCount", 0),
        "companyName": manifest.get("companyName"),
        "scope": "company",
    }


def list_company_backups(backup_root: Path, tenant_id: str, limit: int = 20) -> list[dict[str, Any]]:
    directory = _tenant_directory(backup_root, tenant_id)
    if not directory.exists():
        return []
    archives = sorted(
        directory.glob(f"{COMPANY_BACKUP_PREFIX}*{COMPANY_BACKUP_SUFFIX}"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    items: list[dict[str, Any]] = []
    for archive_path in archives:
        manifest = _read_manifest(archive_path)
        if manifest.get("format") != COMPANY_BACKUP_FORMAT or manifest.get("tenantId") != tenant_id:
            continue
        items.append(company_backup_info(archive_path))
        if len(items) >= limit:
            break
    return items


def _prune_company_backups(directory: Path) -> None:
    archives = sorted(
        directory.glob(f"{COMPANY_BACKUP_PREFIX}*{COMPANY_BACKUP_SUFFIX}"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    retained_bytes = 0
    for index, candidate in enumerate(archives):
        candidate_size = candidate.stat().st_size
        if index < MAX_COMPANY_BACKUP_FILES and retained_bytes + candidate_size <= MAX_COMPANY_BACKUP_TOTAL_BYTES:
            retained_bytes += candidate_size
            continue
        candidate.unlink(missing_ok=True)


def _row_matches_tenant_graph(
    table,
    row: dict[str, Any],
    included_ids: dict[str, set[str]],
    tenant_id: str,
    manager_user_id: str,
) -> bool:
    for column in table.columns:
        value = row.get(column.name)
        if value is None:
            continue
        for foreign_key in column.foreign_keys:
            parent_name = foreign_key.column.table.name
            if parent_name == "SaasTenant":
                if value != tenant_id:
                    return False
            elif parent_name == "UserAccount":
                if table.name != "CompanyProfile" or value != manager_user_id:
                    return False
            elif value not in included_ids.get(parent_name, set()):
                return False
    return True


def collect_company_data(
    db: Session,
    *,
    tenant_id: str,
    manager_user_id: str,
) -> dict[str, list[dict[str, Any]]]:
    included_ids: dict[str, set[str]] = {}
    result: dict[str, list[dict[str, Any]]] = {table.name: [] for table in TABLES_IN_ORDER}

    for table in TABLES_IN_ORDER:
        if table.name == "CompanyProfile":
            rows = db.execute(
                select(table).where(table.c.ownerUserId == manager_user_id)
            ).mappings().all()
        elif table.name in TENANT_ROOT_TABLES:
            rows = db.execute(
                select(table).where(table.c.tenantId == tenant_id)
            ).mappings().all()
        else:
            parent_filters = []
            for column in table.columns:
                for foreign_key in column.foreign_keys:
                    parent_ids = included_ids.get(foreign_key.column.table.name, set())
                    if parent_ids:
                        parent_filters.append(column.in_(parent_ids))
            rows = db.execute(select(table).where(or_(*parent_filters))).mappings().all() if parent_filters else []

        serialized_rows: list[dict[str, Any]] = []
        for mapping in rows:
            raw_row = dict(mapping)
            if not _row_matches_tenant_graph(table, raw_row, included_ids, tenant_id, manager_user_id):
                _fail(
                    f"{table.name} contains a reference outside this company. Backup was stopped.",
                    status.HTTP_409_CONFLICT,
                )
            serialized_rows.append(_serialize_row(table, raw_row))
        result[table.name] = serialized_rows
        included_ids[table.name] = {
            str(row["id"]) for row in serialized_rows if row.get("id") is not None
        }

    return result


def _checked_existing_upload(path_value: str | None, uploads_root: Path) -> Path:
    if not path_value:
        _fail("A company upload is missing its storage path.", status.HTTP_409_CONFLICT)
    path = Path(path_value).resolve()
    root = uploads_root.resolve()
    if root not in path.parents or not path.is_file():
        _fail(
            "A company upload is missing or stored outside the managed uploads directory.",
            status.HTTP_409_CONFLICT,
        )
    return path


def _safe_relative_upload(relative_path: str) -> PurePosixPath:
    path = PurePosixPath(relative_path)
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        _fail("Backup contains an unsafe company file path.")
    if not path.parts or path.parts[0] not in {"project-progress", "rag"}:
        _fail("Backup contains a file outside the company upload scope.")
    return path


def _copy_company_files(
    tables: dict[str, list[dict[str, Any]]],
    *,
    work_dir: Path,
    uploads_root: Path,
) -> list[dict[str, Any]]:
    file_entries: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    updates = {row["id"]: row for row in tables.get("ProjectProgressUpdate", [])}

    for photo in tables.get("ProjectProgressPhoto", []):
        update_row = updates.get(photo.get("updateId"))
        if not update_row:
            _fail("A progress photo is not connected to a company project.", status.HTTP_409_CONFLICT)
        source = _checked_existing_upload(photo.get("storagePath"), uploads_root)
        relative = PurePosixPath(
            "project-progress",
            str(update_row["orderId"]),
            str(photo["updateId"]),
            str(photo["storedFilename"]),
        )
        photo["storagePath"] = relative.as_posix()
        file_entries.append(
            _copy_file_entry(
                source,
                relative,
                work_dir,
                record_type="ProjectProgressPhoto",
                record_id=str(photo["id"]),
                seen_paths=seen_paths,
            )
        )

    for source_row in tables.get("RagSource", []):
        storage_path = source_row.get("storagePath")
        if not storage_path:
            if source_row.get("sourceType") == "uploaded_file":
                _fail("An uploaded RAG source file is missing.", status.HTTP_409_CONFLICT)
            continue
        source = _checked_existing_upload(storage_path, uploads_root)
        relative = PurePosixPath("rag", str(source_row["id"]), source.name)
        source_row["storagePath"] = relative.as_posix()
        file_entries.append(
            _copy_file_entry(
                source,
                relative,
                work_dir,
                record_type="RagSource",
                record_id=str(source_row["id"]),
                seen_paths=seen_paths,
            )
        )

    return file_entries


def _copy_file_entry(
    source: Path,
    relative: PurePosixPath,
    work_dir: Path,
    *,
    record_type: str,
    record_id: str,
    seen_paths: set[str],
) -> dict[str, Any]:
    relative_string = relative.as_posix()
    if relative_string in seen_paths:
        _fail("Two company uploads use the same backup path.", status.HTTP_409_CONFLICT)
    seen_paths.add(relative_string)
    archive_relative = PurePosixPath("files") / relative
    target = work_dir.joinpath(*archive_relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    return {
        "recordType": record_type,
        "recordId": record_id,
        "relativePath": relative_string,
        "archivePath": archive_relative.as_posix(),
        "sizeBytes": target.stat().st_size,
        "sha256": _sha256(target),
    }


def create_company_backup(
    db: Session,
    *,
    tenant_id: str,
    manager_user_id: str,
    company_name: str,
    backup_root: Path,
    uploads_root: Path,
    label: str = "backup",
) -> dict[str, Any]:
    directory = _tenant_directory(backup_root, tenant_id)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safe_label = "pre-restore" if label == "pre-restore" else "backup"
    archive_path = directory / f"{COMPANY_BACKUP_PREFIX}{safe_label}-{stamp}-{uuid4().hex[:8]}.zip"
    work_dir = directory / f".tmp-{uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=False)

    try:
        tables = collect_company_data(db, tenant_id=tenant_id, manager_user_id=manager_user_id)
        file_entries = _copy_company_files(tables, work_dir=work_dir, uploads_root=uploads_root)
        data_payload = {
            "format": COMPANY_BACKUP_FORMAT,
            "version": COMPANY_BACKUP_VERSION,
            "tenantId": tenant_id,
            "tables": tables,
        }
        data_path = work_dir / COMPANY_DATA_FILE
        data_path.write_text(
            json.dumps(data_payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        table_counts = {name: len(rows) for name, rows in tables.items() if rows}
        record_count = sum(table_counts.values())
        manifest = {
            "format": COMPANY_BACKUP_FORMAT,
            "version": COMPANY_BACKUP_VERSION,
            "scope": "company",
            "tenantId": tenant_id,
            "companyName": company_name,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "dataFile": COMPANY_DATA_FILE,
            "dataSha256": _sha256(data_path),
            "recordCount": record_count,
            "tableCounts": table_counts,
            "uploadFileCount": len(file_entries),
            "files": file_entries,
            "excludes": ["platform billing", "user credentials", "sessions", "audit history", "other companies"],
        }
        (work_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for item in work_dir.rglob("*"):
                if item.is_file():
                    archive.write(item, item.relative_to(work_dir))
        if archive_path.stat().st_size > MAX_COMPANY_BACKUP_TOTAL_BYTES:
            archive_path.unlink(missing_ok=True)
            _fail(
                "Company backup is larger than the configured backup storage limit.",
                status.HTTP_507_INSUFFICIENT_STORAGE,
            )
        _prune_company_backups(directory)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    return company_backup_info(archive_path)


def _load_company_archive(
    db: Session,
    extract_dir: Path,
    *,
    tenant_id: str,
    manager_user_id: str,
    uploads_root: Path,
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]], dict[str, Any]]:
    manifest_path = extract_dir / "manifest.json"
    if not manifest_path.is_file():
        _fail("Company backup manifest is missing.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        _fail("Company backup manifest is invalid.")
    if manifest.get("format") != COMPANY_BACKUP_FORMAT or manifest.get("version") != COMPANY_BACKUP_VERSION:
        _fail("This is not a supported OMRAN company backup.")
    if manifest.get("scope") != "company" or manifest.get("tenantId") != tenant_id:
        _fail("This backup belongs to a different company.", status.HTTP_403_FORBIDDEN)
    if manifest.get("dataFile") != COMPANY_DATA_FILE:
        _fail("Company backup data reference is invalid.")

    data_path = extract_dir / COMPANY_DATA_FILE
    if not data_path.is_file() or data_path.stat().st_size > MAX_COMPANY_DATA_BYTES:
        _fail("Company backup data is missing or too large.")
    if _sha256(data_path) != manifest.get("dataSha256"):
        _fail("Company backup data failed its integrity check.")
    try:
        payload = json.loads(data_path.read_text(encoding="utf-8"))
    except Exception:
        _fail("Company backup data is invalid.")
    if (
        payload.get("format") != COMPANY_BACKUP_FORMAT
        or payload.get("version") != COMPANY_BACKUP_VERSION
        or payload.get("tenantId") != tenant_id
        or not isinstance(payload.get("tables"), dict)
    ):
        _fail("Company backup data scope is invalid.")

    raw_tables: dict[str, Any] = payload["tables"]
    unknown_tables = set(raw_tables) - ALLOWED_TABLES
    if unknown_tables:
        _fail("Company backup contains unsupported data tables.")
    decoded_tables: dict[str, list[dict[str, Any]]] = {name: [] for name in ALLOWED_TABLES}
    table_ids: dict[str, set[str]] = {}
    total_records = 0

    for table in TABLES_IN_ORDER:
        raw_rows = raw_tables.get(table.name, [])
        if not isinstance(raw_rows, list):
            _fail(f"Company backup table {table.name} is invalid.")
        allowed_columns = {column.name for column in table.columns}
        seen_ids: set[str] = set()
        rows: list[dict[str, Any]] = []
        for raw_row in raw_rows:
            if not isinstance(raw_row, dict) or set(raw_row) - allowed_columns:
                _fail(f"Company backup table {table.name} contains invalid fields.")
            row: dict[str, Any] = {}
            for column in table.columns:
                if column.name in raw_row:
                    row[column.name] = _deserialize_value(column, raw_row[column.name])
                elif column.nullable:
                    row[column.name] = None
                elif column.default is None and column.server_default is None:
                    _fail(f"Company backup table {table.name} is missing {column.name}.")
            record_id = row.get("id")
            if not record_id or str(record_id) in seen_ids:
                _fail(f"Company backup table {table.name} contains an invalid or duplicate ID.")
            seen_ids.add(str(record_id))
            if table.name in TENANT_ROOT_TABLES:
                if row.get("tenantId") != tenant_id:
                    _fail(f"Company backup table {table.name} has an invalid company scope.")
                row["tenantId"] = tenant_id
            if table.name == "CompanyProfile":
                row["ownerUserId"] = manager_user_id
            rows.append(row)
        decoded_tables[table.name] = rows
        table_ids[table.name] = seen_ids
        total_records += len(rows)

    if total_records > MAX_COMPANY_BACKUP_RECORDS or total_records != manifest.get("recordCount"):
        _fail("Company backup record count is invalid.")
    expected_counts = {name: len(rows) for name, rows in decoded_tables.items() if rows}
    if manifest.get("tableCounts") != expected_counts:
        _fail("Company backup table counts failed validation.")

    for table in TABLES_IN_ORDER:
        for row in decoded_tables[table.name]:
            for column in table.columns:
                value = row.get(column.name)
                if value is None:
                    continue
                for foreign_key in column.foreign_keys:
                    parent_name = foreign_key.column.table.name
                    if parent_name == "SaasTenant":
                        if value != tenant_id:
                            _fail("Company backup contains an external company reference.")
                    elif parent_name == "UserAccount":
                        if table.name != "CompanyProfile" or value != manager_user_id:
                            _fail("Company backup contains an external account reference.")
                    elif str(value) not in table_ids.get(parent_name, set()):
                        _fail(f"Company backup contains an invalid {parent_name} reference.")

    rag_chunk_ids = table_ids.get("RagChunk", set())
    for chunk in decoded_tables.get("RagChunk", []):
        superseded_id = chunk.get("supersededByChunkId")
        if superseded_id and str(superseded_id) not in rag_chunk_ids:
            _fail("Company backup contains an invalid RAG chunk reference.")
    tenant_user_ids = {
        str(user_id)
        for user_id in db.scalars(select(UserAccount.id).where(UserAccount.tenant_id == tenant_id)).all()
    }
    for source in decoded_tables.get("RagSource", []):
        creator_id = source.get("createdByUserId")
        if creator_id and str(creator_id) not in tenant_user_ids:
            source["createdByUserId"] = manager_user_id
    _validate_rag_entity_references(decoded_tables, table_ids)

    file_entries = _validate_company_files(
        extract_dir,
        manifest.get("files"),
        decoded_tables,
        uploads_root,
    )
    if len(file_entries) != manifest.get("uploadFileCount"):
        _fail("Company backup file count failed validation.")
    return decoded_tables, file_entries, manifest


def _validate_rag_entity_references(
    tables: dict[str, list[dict[str, Any]]], table_ids: dict[str, set[str]]
) -> None:
    entity_tables = {
        "customer": "Customer",
        "order": "Order",
        "proposal": "Proposal",
        "proposalmessage": "ProposalMessage",
        "site": "Site",
    }
    for table_name in ("RagSource", "RagChunk"):
        for row in tables.get(table_name, []):
            entity_type = str(row.get("sourceEntityType") or "").replace("_", "").lower()
            entity_id = row.get("sourceEntityId")
            target_table = entity_tables.get(entity_type)
            if target_table and entity_id and str(entity_id) not in table_ids.get(target_table, set()):
                _fail("Company backup contains an external RAG entity reference.")


def _validate_company_files(
    extract_dir: Path,
    raw_entries: Any,
    tables: dict[str, list[dict[str, Any]]],
    uploads_root: Path,
) -> list[dict[str, Any]]:
    if not isinstance(raw_entries, list):
        _fail("Company backup file manifest is invalid.")
    record_maps = {
        "ProjectProgressPhoto": {str(row["id"]): row for row in tables.get("ProjectProgressPhoto", [])},
        "RagSource": {str(row["id"]): row for row in tables.get("RagSource", [])},
    }
    updates = {str(row["id"]): row for row in tables.get("ProjectProgressUpdate", [])}
    seen_paths: set[str] = set()
    seen_records: set[tuple[str, str]] = set()
    entries: list[dict[str, Any]] = []

    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            _fail("Company backup file entry is invalid.")
        record_type = str(raw_entry.get("recordType") or "")
        record_id = str(raw_entry.get("recordId") or "")
        relative = _safe_relative_upload(str(raw_entry.get("relativePath") or ""))
        archive_relative = PurePosixPath(str(raw_entry.get("archivePath") or ""))
        if archive_relative != PurePosixPath("files") / relative:
            _fail("Company backup file location is invalid.")
        relative_string = relative.as_posix()
        record_key = (record_type, record_id)
        if relative_string in seen_paths or record_key in seen_records:
            _fail("Company backup contains duplicate files.")
        seen_paths.add(relative_string)
        seen_records.add(record_key)
        record = record_maps.get(record_type, {}).get(record_id)
        if not record:
            _fail("Company backup file is not connected to a company record.")

        if record_type == "ProjectProgressPhoto":
            update_row = updates.get(str(record.get("updateId")))
            expected = PurePosixPath(
                "project-progress",
                str(update_row.get("orderId") if update_row else ""),
                str(record.get("updateId") or ""),
                str(record.get("storedFilename") or ""),
            )
        else:
            expected = PurePosixPath("rag", record_id, relative.name)
        if relative != expected:
            _fail("Company backup file does not match its company record.")

        source_path = extract_dir.joinpath(*archive_relative.parts).resolve()
        root = extract_dir.resolve()
        if root not in source_path.parents or not source_path.is_file():
            _fail("Company backup file is missing.")
        if source_path.stat().st_size != raw_entry.get("sizeBytes") or _sha256(source_path) != raw_entry.get("sha256"):
            _fail("Company backup file failed its integrity check.")
        destination = uploads_root.resolve().joinpath(*relative.parts).resolve()
        if uploads_root.resolve() not in destination.parents:
            _fail("Company backup contains an unsafe destination path.")
        record["storagePath"] = str(destination)
        entries.append({**raw_entry, "relativePath": relative_string, "sourcePath": source_path})

    expected_records = {
        ("ProjectProgressPhoto", str(row["id"])) for row in tables.get("ProjectProgressPhoto", [])
    }
    expected_records.update(
        ("RagSource", str(row["id"]))
        for row in tables.get("RagSource", [])
        if row.get("storagePath") or row.get("sourceType") == "uploaded_file"
    )
    if seen_records != expected_records:
        _fail("Company backup is missing one or more uploaded files.")

    allowed_files = {"manifest.json", COMPANY_DATA_FILE}
    allowed_files.update(str(PurePosixPath(entry["archivePath"])) for entry in entries)
    actual_files = {
        item.relative_to(extract_dir).as_posix() for item in extract_dir.rglob("*") if item.is_file()
    }
    if actual_files != allowed_files:
        _fail("Company backup contains unexpected files.")
    return entries


def _preflight_restore(
    db: Session,
    restored: dict[str, list[dict[str, Any]]],
    current: dict[str, list[dict[str, Any]]],
) -> None:
    for table in TABLES_IN_ORDER:
        if table.name == "CompanyProfile":
            continue
        restored_ids = {str(row["id"]) for row in restored.get(table.name, [])}
        if not restored_ids:
            continue
        current_ids = {str(row["id"]) for row in current.get(table.name, [])}
        existing_ids = {
            str(value)
            for value in db.scalars(select(table.c.id).where(table.c.id.in_(restored_ids))).all()
        }
        if existing_ids - current_ids:
            _fail(
                f"Company backup conflicts with protected {table.name} data.",
                status.HTTP_409_CONFLICT,
            )

    for table_name, unique_column in (("Order", "orderNumber"), ("Invoice", "invoiceNumber")):
        table = TABLE_BY_NAME[table_name]
        values = {row.get(unique_column) for row in restored.get(table_name, []) if row.get(unique_column)}
        if not values:
            continue
        current_ids = {str(row["id"]) for row in current.get(table_name, [])}
        conflicts = db.execute(
            select(table.c.id, table.c[unique_column]).where(table.c[unique_column].in_(values))
        ).all()
        if any(str(record_id) not in current_ids for record_id, _ in conflicts):
            _fail(
                f"Company backup contains a {unique_column} already used outside this company.",
                status.HTTP_409_CONFLICT,
            )


def _upload_top_directories(
    tables: dict[str, list[dict[str, Any]]], file_entries: list[dict[str, Any]]
) -> set[PurePosixPath]:
    directories = {
        PurePosixPath("project-progress", str(row["id"])) for row in tables.get("Order", [])
    }
    directories.update(PurePosixPath("rag", str(row["id"])) for row in tables.get("RagSource", []))
    for entry in file_entries:
        relative = PurePosixPath(entry["relativePath"])
        directories.add(PurePosixPath(*relative.parts[:2]))
    return directories


def _checked_upload_destination(uploads_root: Path, relative: PurePosixPath) -> Path:
    _safe_relative_upload(relative.as_posix())
    root = uploads_root.resolve()
    destination = root.joinpath(*relative.parts).resolve()
    if root not in destination.parents:
        _fail("Invalid company upload destination.", status.HTTP_500_INTERNAL_SERVER_ERROR)
    return destination


def _replace_company_database_rows(
    db: Session,
    *,
    current: dict[str, list[dict[str, Any]]],
    restored: dict[str, list[dict[str, Any]]],
    manager_user_id: str,
) -> None:
    for table in reversed(TABLES_IN_ORDER):
        if table.name == "CompanyProfile":
            continue
        record_ids = [row["id"] for row in current.get(table.name, [])]
        if record_ids:
            db.execute(delete(table).where(table.c.id.in_(record_ids)))

    for table in TABLES_IN_ORDER:
        if table.name == "CompanyProfile":
            continue
        for row in restored.get(table.name, []):
            db.execute(insert(table).values(**row))

    profiles = restored.get("CompanyProfile", [])
    if len(profiles) > 1:
        _fail("Company backup contains more than one company profile.")
    if not profiles:
        return
    profile_values = dict(profiles[0])
    profile_values["ownerUserId"] = manager_user_id
    existing = db.scalar(select(CompanyProfile).where(CompanyProfile.owner_user_id == manager_user_id))
    if existing:
        profile_values.pop("id", None)
        profile_values.pop("ownerUserId", None)
        db.execute(update(CompanyProfile.__table__).where(CompanyProfile.id == existing.id).values(**profile_values))
        return
    if db.get(CompanyProfile, profile_values["id"]):
        profile_values["id"] = str(uuid4())
    db.execute(insert(CompanyProfile.__table__).values(**profile_values))


def _restore_pgvector_embeddings(
    db: Session,
    restored: dict[str, list[dict[str, Any]]],
) -> None:
    if db.get_bind().dialect.name != "postgresql":
        return
    for row in restored.get("RagChunk", []):
        try:
            embedding = json.loads(row.get("embeddingJson") or "[]")
            expected_dim = int(row.get("embeddingDim") or 0)
            values = [float(value) for value in embedding]
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if not values or len(values) != expected_dim or len(values) > 4096:
            continue
        if any(not math.isfinite(value) for value in values):
            continue
        vector_literal = "[" + ",".join(f"{value:.12g}" for value in values) + "]"
        db.execute(
            text('UPDATE "RagChunk" SET "embedding" = CAST(:embedding AS vector) WHERE id = :id'),
            {"embedding": vector_literal, "id": row["id"]},
        )


def restore_company_backup(
    db: Session,
    *,
    extract_dir: Path,
    original_file_name: str,
    tenant_id: str,
    manager_user_id: str,
    company_name: str,
    backup_root: Path,
    uploads_root: Path,
) -> dict[str, Any]:
    restored, file_entries, manifest = _load_company_archive(
        db,
        extract_dir,
        tenant_id=tenant_id,
        manager_user_id=manager_user_id,
        uploads_root=uploads_root,
    )
    current = collect_company_data(db, tenant_id=tenant_id, manager_user_id=manager_user_id)
    _preflight_restore(db, restored, current)
    safety_backup = create_company_backup(
        db,
        tenant_id=tenant_id,
        manager_user_id=manager_user_id,
        company_name=company_name,
        backup_root=backup_root,
        uploads_root=uploads_root,
        label="pre-restore",
    )

    company_directory = _tenant_directory(backup_root, tenant_id)
    rollback_root = company_directory / f".rollback-{uuid4().hex}"
    rollback_root.mkdir(parents=True, exist_ok=False)
    target_directories = _upload_top_directories(current, file_entries)
    moved_directories: list[tuple[Path, Path]] = []
    restored_directories: set[Path] = set()
    committed = False

    try:
        uploads_root.mkdir(parents=True, exist_ok=True)
        for relative in sorted(target_directories, key=lambda item: item.as_posix()):
            destination = _checked_upload_destination(uploads_root, relative)
            if destination.exists():
                rollback_destination = rollback_root.joinpath(*relative.parts)
                rollback_destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(destination), str(rollback_destination))
                moved_directories.append((destination, rollback_destination))

        for entry in file_entries:
            relative = PurePosixPath(entry["relativePath"])
            destination = _checked_upload_destination(uploads_root, relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(entry["sourcePath"], destination)
            restored_directories.add(_checked_upload_destination(uploads_root, PurePosixPath(*relative.parts[:2])))

        _replace_company_database_rows(
            db,
            current=current,
            restored=restored,
            manager_user_id=manager_user_id,
        )
        _restore_pgvector_embeddings(db, restored)
        record_audit(
            db,
            action="company.backup.restored",
            entity_type="CompanyBackup",
            entity_id=original_file_name,
            actor_user_id=manager_user_id,
            tenant_id=tenant_id,
            summary="Company backup restored",
            details={
                "fileName": original_file_name,
                "recordCount": manifest.get("recordCount", 0),
                "uploadFileCount": manifest.get("uploadFileCount", 0),
                "safetyBackup": safety_backup.get("fileName"),
                "scope": "company",
            },
        )
        db.commit()
        committed = True
    except Exception:
        db.rollback()
        for destination in restored_directories:
            if destination.exists():
                shutil.rmtree(destination, ignore_errors=True)
        for destination, rollback_destination in reversed(moved_directories):
            if rollback_destination.exists():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(rollback_destination), str(destination))
        raise
    finally:
        if committed:
            shutil.rmtree(rollback_root, ignore_errors=True)
        elif rollback_root.exists() and not any(rollback_root.rglob("*")):
            rollback_root.rmdir()

    return {
        "ok": True,
        "scope": "company",
        "recordCount": manifest.get("recordCount", 0),
        "uploadFileCount": manifest.get("uploadFileCount", 0),
        "safetyBackup": safety_backup,
    }
