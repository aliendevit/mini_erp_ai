from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog, UserAccount
from ..utils import json_dumps


def actor_id(user: UserAccount | object | None) -> str | None:
    value = getattr(user, "id", None)
    return str(value) if value else None


def record_audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    actor_user_id: str | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    item = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        summary=summary,
        details_json=json_dumps(details or {}),
    )
    db.add(item)
    return item
