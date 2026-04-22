from __future__ import annotations

import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import Customer, CustomerWorkshop, Employee, EmployeeAvailabilityBlock, EmployeeSkill, PaymentRecord, Proposal, ProposalFact, ProposalMessage
from app.schemas import ProposalDraftPayload
from app.services.proposals import (
    ExtractedProposal,
    apply_proposal_update,
    build_intake_chat_prompt,
    build_proposal_prompt,
    confirm_proposal,
    extract_proposal_from_messages,
    refresh_proposal_memory,
    sanitize_intake_assistant_reply,
)
from app.services.staffing import recommend_staff_for_proposal


def build_employee(name: str, skill: str, rate: str = "50", capacity: str = "40") -> Employee:
    first_name, last_name = name.split(" ", 1)
    employee = Employee(
        first_name=first_name,
        last_name=last_name,
        is_active=True,
        default_hourly_rate=Decimal(rate),
        weekly_capacity_hours=Decimal(capacity),
    )
    employee.skill_records.append(EmployeeSkill(kind="skill", name=skill))
    return employee


class ProposalAndStaffingTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite:///:memory:", future=True)
        TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=engine)
        self.db: Session = TestingSession()

    def tearDown(self) -> None:
        self.db.close()

    def test_apply_proposal_update_normalizes_lists(self) -> None:
        proposal = Proposal(status="intake")
        payload = ProposalDraftPayload(
            customerCompanyName="ACME",
            orderTitle="Sanierung",
            summary="Kurzfassung",
            requiredSkills=["Maler", "Maler", " Elektrik "],
            proposedSites=[
                {
                    "siteName": "Baustelle 1",
                    "requiredSkills": ["Maler", "Maler"],
                    "requiredCertifications": ["SCC"],
                    "estimatedHours": 12,
                }
            ],
        )

        apply_proposal_update(proposal, payload)

        self.assertEqual(proposal.customer_company_name, "ACME")
        self.assertEqual(proposal.order_title, "Sanierung")
        self.assertEqual(proposal.status, "draft")
        self.assertIn("Elektrik", proposal.required_skills_json or "")
        self.assertIn("Baustelle 1", proposal.proposed_sites_json or "")

    def test_arabic_conversation_prompts_force_arabic_output(self) -> None:
        proposal = Proposal(status="intake", customer_company_name="\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0648\u0631")
        messages = [ProposalMessage(role="user", content="\u0645\u0631\u062d\u0628\u0627\u060c \u0646\u062d\u062a\u0627\u062c \u0625\u0644\u0649 \u0639\u0631\u0636 \u062a\u0631\u0645\u064a\u0645 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.")]

        chat_prompt = build_intake_chat_prompt(proposal, messages)
        proposal_prompt = build_proposal_prompt(messages)

        self.assertIn("reply entirely in Arabic", chat_prompt)
        self.assertIn("Write all human-readable proposal values in Arabic", proposal_prompt)

    def test_intake_chat_prompt_forbids_self_dialogue(self) -> None:
        prompt = build_intake_chat_prompt(Proposal(status="intake"), [ProposalMessage(role="user", content="Please update the kitchen site.")])

        self.assertIn("Never write role labels", prompt)
        self.assertIn("Never continue the conversation", prompt)
        self.assertIn("Never create fake future turns", prompt)

    def test_sanitize_intake_assistant_reply_removes_hallucinated_turns(self) -> None:
        raw = "?? ????? ???? ??????.\nManager: ????? ?????.\nAssistant: ???? ??? ?????."

        cleaned = sanitize_intake_assistant_reply(raw)

        self.assertEqual(cleaned, "?? ????? ???? ??????.")

    def test_sanitize_intake_assistant_reply_removes_leading_label(self) -> None:
        cleaned = sanitize_intake_assistant_reply("Assistant: ?? ????? ?????.")

        self.assertEqual(cleaned, "?? ????? ?????.")

    def test_extract_proposal_falls_back_for_invalid_provider_json(self) -> None:
        proposal = Proposal(status="intake", order_title="Fallback Angebot")
        message = ProposalMessage(role="user", content="Wir brauchen Malerarbeiten in Bremen. Zeitraum 01-05-2026 bis 07-05-2026. Aufwand 24 Stunden.")

        with patch("app.services.proposals.generate_text", return_value="not-json"):
            extracted = extract_proposal_from_messages(proposal, [message])

        self.assertEqual(extracted.orderTitle, "Fallback Angebot")
        self.assertEqual(extracted.estimatedHours, 24.0)
        self.assertTrue(extracted.proposedSites)

    def test_extract_proposal_accepts_fenced_json_from_fallback_provider(self) -> None:
        proposal = Proposal(status="intake")
        message = ProposalMessage(role="user", content="Create a renovation proposal.")
        provider_payload = """```json
{
  "summary": "Kurzfassung",
  "orderTitle": "Sanierung",
  "estimatedHours": 16,
  "proposedSites": [{"siteName": "Treppenhaus", "estimatedHours": 16}]
}
```"""

        with patch("app.services.proposals.generate_text", return_value=provider_payload):
            extracted = extract_proposal_from_messages(proposal, [message])

        self.assertEqual(extracted.orderTitle, "Sanierung")
        self.assertEqual(extracted.proposedSites[0].siteName, "Treppenhaus")

    def test_extract_proposal_falls_back_when_provider_request_fails(self) -> None:
        proposal = Proposal(status="intake", order_title="Fallback Angebot")
        message = ProposalMessage(role="user", content="Wir brauchen Malerarbeiten in Bremen. Aufwand 24 Stunden.")

        with patch("app.services.proposals.generate_text", side_effect=HTTPException(status_code=502, detail="OpenRouter fallback failed")):
            extracted = extract_proposal_from_messages(proposal, [message])

        self.assertEqual(extracted.orderTitle, "Fallback Angebot")
        self.assertEqual(extracted.estimatedHours, 24.0)

    def test_refresh_proposal_memory_uses_local_fallback_when_provider_fails(self) -> None:
        proposal = Proposal(status="intake", customer_company_name="Alpha GmbH")
        self.db.add(proposal)
        self.db.flush()
        message = ProposalMessage(proposal_id=proposal.id, role="user", content="Alpha paid a 500 EUR deposit.")
        self.db.add(message)
        self.db.commit()

        with patch("app.services.proposals.generate_text", side_effect=HTTPException(status_code=502, detail="OpenRouter fallback failed")):
            refresh_proposal_memory(self.db, proposal, [message])

        facts = self.db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal.id).all()
        self.assertTrue(facts)
        self.assertIn("500", proposal.payment_drafts_json or "")

    def test_refresh_proposal_memory_stores_facts_per_proposal(self) -> None:
        proposal_a = Proposal(status="intake", customer_company_name="Alpha GmbH")
        proposal_b = Proposal(status="intake", customer_company_name="Beta GmbH")
        self.db.add_all([proposal_a, proposal_b])
        self.db.flush()
        message = ProposalMessage(proposal_id=proposal_a.id, role="user", content="Alpha paid a 500 EUR deposit.")
        self.db.add(message)
        self.db.commit()

        gemini_payload = """{
            "facts": [{"category": "payment", "key": "deposit", "value": {"amount": 500, "currency": "EUR"}, "confidence": 0.9}],
            "memorySummary": {"payments": [{"amount": 500, "currency": "EUR"}]},
            "paymentDrafts": [{"type": "deposit", "status": "received", "amount": 500, "currency": "EUR"}],
            "externalWorkshops": [],
            "staffingPlan": null
        }"""

        with patch("app.services.proposals.generate_text", return_value=gemini_payload):
            refresh_proposal_memory(self.db, proposal_a, [message])
            self.db.commit()

        facts_a = self.db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal_a.id).all()
        facts_b = self.db.query(ProposalFact).filter(ProposalFact.proposal_id == proposal_b.id).all()
        self.assertEqual(len(facts_a), 1)
        self.assertEqual(facts_a[0].category, "payment")
        self.assertEqual(facts_b, [])

    def test_extracted_proposal_defaults_null_currency_and_lists(self) -> None:
        extracted = ExtractedProposal.model_validate(
            {
                "summary": "Kurzfassung",
                "orderTitle": "Sanierung",
                "currency": None,
                "requiredSkills": None,
                "requiredCertifications": None,
                "proposedSites": None,
            }
        )

        self.assertEqual(extracted.currency, "EUR")
        self.assertEqual(extracted.requiredSkills, [])
        self.assertEqual(extracted.requiredCertifications, [])
        self.assertEqual(extracted.proposedSites, [])

    def test_extracted_proposal_distributes_site_hours_when_missing(self) -> None:
        extracted = ExtractedProposal.model_validate(
            {
                "summary": "Kurzfassung",
                "orderTitle": "Sanierung",
                "estimatedHours": 120,
                "proposedSites": [
                    {"siteName": "Treppenhaus", "estimatedHours": None},
                    {"siteName": "Kellerflur", "estimatedHours": None},
                ],
            }
        )

        self.assertEqual(extracted.proposedSites[0].estimatedHours, 60.0)
        self.assertEqual(extracted.proposedSites[1].estimatedHours, 60.0)

    def test_apply_proposal_update_serializes_payment_dates(self) -> None:
        proposal = Proposal(status="draft")
        payload = ProposalDraftPayload(
            customerCompanyName="ACME",
            orderTitle="Sanierung",
            summary="Kurzfassung",
            paymentDrafts=[
                {
                    "type": "deposit",
                    "status": "received",
                    "amount": 1000,
                    "currency": "USD",
                    "paidDate": datetime(2026, 5, 10, tzinfo=timezone.utc),
                }
            ],
        )

        apply_proposal_update(proposal, payload)

        self.assertIn("2026-05-10", proposal.payment_drafts_json or "")
        self.assertIn("USD", proposal.payment_drafts_json or "")

    def test_extracted_proposal_fills_remaining_site_hours(self) -> None:
        extracted = ExtractedProposal.model_validate(
            {
                "summary": "Kurzfassung",
                "orderTitle": "Sanierung",
                "estimatedHours": 120,
                "proposedSites": [
                    {"siteName": "Treppenhaus", "estimatedHours": 70},
                    {"siteName": "Kellerflur", "estimatedHours": None},
                ],
            }
        )

        self.assertEqual(extracted.proposedSites[0].estimatedHours, 70.0)
        self.assertEqual(extracted.proposedSites[1].estimatedHours, 50.0)

    def test_recommend_staff_filters_blocked_and_prefers_matching_employee(self) -> None:
        available = build_employee("Anna Maler", "Maler")
        blocked = build_employee("Ben Elektrik", "Elektrik")
        blocked.availability_blocks.append(
            EmployeeAvailabilityBlock(
                start_date=datetime(2026, 4, 20, tzinfo=timezone.utc),
                end_date=datetime(2026, 4, 25, tzinfo=timezone.utc),
                reason="Urlaub",
            )
        )
        self.db.add_all([available, blocked])

        proposal = Proposal(status="draft", order_title="Innenausbau", estimated_hours=Decimal("16.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Innenausbau",
                summary="Wohnung renovieren",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 4, 24, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "Wohnung",
                        "requiredSkills": ["Maler"],
                        "estimatedHours": 16,
                    }
                ],
                requiredSkills=["Maler"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        site = recommendations["sites"][0]
        self.assertEqual(site["recommendations"][0]["employeeId"], available.id)
        self.assertEqual(site["excludedEmployees"][0]["employeeId"], blocked.id)
        self.assertIsNotNone(recommendations["pricePreview"])

    def test_recommend_staff_matches_arabic_skill_terms(self) -> None:
        painter = build_employee("Amina Team", "Malerarbeiten")
        self.db.add(painter)

        proposal = Proposal(status="draft", order_title="?????", estimated_hours=Decimal("8.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="???? ?????",
                orderTitle="?????",
                summary="????? ?????",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 4, 22, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "??????",
                        "requiredSkills": ["????"],
                        "estimatedHours": 8,
                    }
                ],
                requiredSkills=["????"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        self.assertEqual(recommendations["sites"][0]["recommendations"][0]["employeeId"], painter.id)

    def test_recommend_staff_includes_known_customer_workshops(self) -> None:
        customer = Customer(company_name="Workshop Kunde GmbH")
        workshop = CustomerWorkshop(
            customer=customer,
            name="Preferred Maler Team",
            specialties_json='["Maler"]',
            relationship_status="preferred",
            is_active=True,
        )
        employee = build_employee("Dora Intern", "Maler", rate="45")
        self.db.add_all([customer, workshop, employee])

        proposal = Proposal(status="draft", customer_company_name="Workshop Kunde GmbH", order_title="Renovierung", estimated_hours=Decimal("8.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="Workshop Kunde GmbH",
                orderTitle="Renovierung",
                summary="Malerarbeiten",
                preferredStartDate=datetime(2026, 5, 1, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 5, 2, tzinfo=timezone.utc),
                proposedSites=[{"siteName": "Treppenhaus", "requiredSkills": ["Maler"], "estimatedHours": 8}],
                requiredSkills=["Maler"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        site = recommendations["sites"][0]
        self.assertTrue(site["recommendations"])
        self.assertEqual(site["workshopRecommendations"][0]["name"], "Preferred Maler Team")

    def test_confirm_proposal_creates_customer_order_site_and_assignments(self) -> None:
        employee = build_employee("Clara Team", "Maler", rate="50")
        self.db.add(employee)

        proposal = Proposal(status="draft")
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="Neukunde GmbH",
                contactName="Max Kunde",
                contactEmail="kunde@example.com",
                orderTitle="Badsanierung",
                orderDescription="Komplette Badsanierung",
                summary="Bad renovieren",
                proposedSites=[
                    {
                        "siteName": "Bad 1",
                        "city": "Bremen",
                        "requiredSkills": ["Maler"],
                        "estimatedHours": 16,
                    }
                ],
                estimatedHours=16,
                preferredStartDate=datetime(2026, 5, 1, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 5, 7, tzinfo=timezone.utc),
                paymentDrafts=[{"type": "deposit", "status": "received", "amount": 250, "currency": "EUR"}],
                externalWorkshops=[{"name": "Bremen Drywall Team", "specialties": ["Trockenbau"], "relationshipStatus": "known"}],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        result = confirm_proposal(self.db, proposal, existing_customer_id=None, site_assignments={0: [employee.id]})
        self.db.commit()

        self.assertTrue(result["customerId"])
        self.assertTrue(result["orderId"])
        self.assertTrue(result["siteIds"])
        self.assertEqual(proposal.status, "converted")
        self.assertEqual(float(proposal.estimated_price or 0), 800.0)
        self.assertEqual(self.db.query(PaymentRecord).filter(PaymentRecord.proposal_id == proposal.id).count(), 1)
        self.assertEqual(self.db.query(CustomerWorkshop).count(), 1)


if __name__ == "__main__":
    unittest.main()
