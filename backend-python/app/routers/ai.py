from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import AIWorkSummaryPayload
from ..services.ai_summary import build_work_summary
from ..utils import as_datetime, end_of_utc_day

router = APIRouter()


@router.post("/ai/work-summary")
def work_summary(payload: AIWorkSummaryPayload, db: Session = Depends(get_db)) -> dict:
    return build_work_summary(
        db,
        employee_id=payload.employeeId,
        order_id=payload.orderId,
        site_id=payload.siteId,
        from_date=as_datetime(payload.from_date),
        to_date=end_of_utc_day(as_datetime(payload.to_date)) if payload.to_date else None,
        question=payload.question,
    )
