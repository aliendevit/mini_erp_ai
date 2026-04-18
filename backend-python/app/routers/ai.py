from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Proposal
from ..schemas import (
    AIIntakeConfirmPayload,
    AIIntakeCreatePayload,
    AIIntakeMessagePayload,
    AIWorkSummaryPayload,
    ProposalDraftPayload,
)
from ..services.ai_summary import build_work_summary
from ..services.gemini_client import stream_text
from ..services.proposals import (
    append_message,
    apply_proposal_update,
    build_intake_chat_prompt,
    confirm_proposal,
    extract_proposal_from_messages,
)
from ..services.staffing import recommend_staff_for_proposal
from ..utils import as_datetime, decimal_or_none, end_of_utc_day, ensure, json_dumps, not_found, proposal_payload

router = APIRouter()


def _proposal_query():
    return select(Proposal).options(selectinload(Proposal.messages)).order_by(Proposal.updated_at.desc())


def _get_proposal(db: Session, proposal_id: str) -> Proposal:
    proposal = db.execute(_proposal_query().where(Proposal.id == proposal_id)).scalar_one_or_none()
    if not proposal:
        raise not_found()
    return proposal


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


@router.post("/ai/intakes", status_code=201)
def create_intake(payload: AIIntakeCreatePayload, db: Session = Depends(get_db)) -> dict:
    proposal = Proposal(
        status="intake",
        customer_company_name=payload.customerCompanyName,
        order_title=payload.orderTitle,
        currency="EUR",
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal)


@router.get("/ai/intakes")
def list_intakes(db: Session = Depends(get_db)) -> list[dict]:
    proposals = db.execute(_proposal_query()).scalars().all()
    return [proposal_payload(item) for item in proposals]


@router.get("/ai/intakes/{proposal_id}")
def get_intake(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    return proposal_payload(proposal, include_messages=True)


@router.put("/ai/intakes/{proposal_id}")
def update_intake(proposal_id: str, payload: ProposalDraftPayload, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    apply_proposal_update(proposal, payload)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal, include_messages=True)


@router.post("/ai/intakes/{proposal_id}/messages/stream")
def intake_message_stream(proposal_id: str, payload: AIIntakeMessagePayload, db: Session = Depends(get_db)) -> StreamingResponse:
    proposal = _get_proposal(db, proposal_id)
    append_message(db, proposal, "user", payload.content)
    db.commit()
    proposal = _get_proposal(db, proposal_id)

    def generate() -> Iterable[str]:
        assistant_parts: list[str] = []
        try:
            prompt = build_intake_chat_prompt(proposal, proposal.messages)
            for chunk in stream_text(prompt):
                assistant_parts.append(chunk)
                yield chunk
            assistant_text = "".join(assistant_parts).strip()
            if assistant_text:
                append_message(db, proposal, "assistant", assistant_text)
                db.commit()
        except Exception as exc:
            db.rollback()
            yield f"\n\n[ERROR] {str(exc)}\n"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8", headers=headers)


@router.post("/ai/intakes/{proposal_id}/proposal")
def generate_proposal(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    ensure(bool(proposal.messages), "Bitte zuerst eine Unterhaltung fuehren.")
    extract_proposal_from_messages(proposal, proposal.messages)
    db.commit()
    db.refresh(proposal)
    return proposal_payload(proposal, include_messages=True)


@router.post("/ai/intakes/{proposal_id}/recommend-assignments")
def recommend_assignments(proposal_id: str, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    recommendations = recommend_staff_for_proposal(db, proposal)
    proposal.recommended_team_json = json_dumps(recommendations)
    if recommendations.get("pricePreview") is not None:
        proposal.estimated_price = decimal_or_none(recommendations["pricePreview"])
    if proposal.status == "draft":
        proposal.status = "reviewed"
    db.commit()
    db.refresh(proposal)
    return {
        "proposal": proposal_payload(proposal),
        "recommendations": recommendations,
    }


@router.post("/ai/intakes/{proposal_id}/confirm")
def confirm_intake(proposal_id: str, payload: AIIntakeConfirmPayload, db: Session = Depends(get_db)) -> dict:
    proposal = _get_proposal(db, proposal_id)
    site_assignments = {item.siteIndex: item.employeeIds for item in payload.siteAssignments}
    result = confirm_proposal(
        db,
        proposal,
        existing_customer_id=payload.existingCustomerId,
        site_assignments=site_assignments,
        manual_estimated_price=payload.manualEstimatedPrice,
    )
    db.commit()
    db.refresh(proposal)
    return {
        "proposal": proposal_payload(proposal),
        "result": result,
    }
