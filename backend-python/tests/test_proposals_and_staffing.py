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
from app.models import Employee, EmployeeAvailabilityBlock, EmployeeSkill, Proposal, ProposalMessage
from app.schemas import ProposalDraftPayload
from app.services.proposals import ExtractedProposal, apply_proposal_update, confirm_proposal, extract_proposal_from_messages
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

    def test_extract_proposal_raises_for_invalid_gemini_json(self) -> None:
        proposal = Proposal(status="intake")
        message = ProposalMessage(role="user", content="Wir brauchen Malerarbeiten in Bremen.")

        with patch("app.services.proposals.generate_text", return_value="not-json"):
            with self.assertRaises(HTTPException) as context:
                extract_proposal_from_messages(proposal, [message])

        self.assertEqual(context.exception.status_code, 502)

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


if __name__ == "__main__":
    unittest.main()
