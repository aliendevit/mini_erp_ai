from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import Customer, CustomerWorkshop, Employee, EmployeeAvailabilityBlock, EmployeeSkill, Order, PaymentRecord, ProjectIssue, ProjectProgressUpdate, ProjectSiteBaseline, ProjectTask, Proposal, ProposalFact, ProposalMessage, Site, Workshop, WorkshopSiteAssignment
from app.schemas import ProjectIssuePayload, ProjectSiteBaselinePayload, ProjectTaskPayload, ProposalDraftPayload, WorkshopSiteAssignmentPayload
from app.routers.core import analyze_order_tracking, create_order_workshop_assignment, create_project_issue, create_project_task, suggest_order_tracking_baseline, update_order_site_tracking_baseline, update_project_issue, update_project_task, update_workshop_assignment, _tracking_response
from app.services.proposal_documents import _arabic_visual_text, build_proposal_pdf
from app.services.tracking_ai import analyze_tracking, build_tracking_analysis_context
from app.services.proposals import (
    ExtractedProposal,
    apply_proposal_update,
    build_intake_chat_prompt,
    build_proposal_prompt,
    confirm_proposal,
    construction_scope_guidance,
    extract_proposal_from_messages,
    refresh_proposal_memory,
    maybe_build_scope_first_reply,
    sanitize_intake_assistant_reply,
)
from app.services.staffing import build_staffing_explanation_context, format_staffing_explanation, recommend_staff_for_proposal
from app.routers.ai import _workshop_recommendations_for_proposal


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

    def _workshop_order_fixture(self):
        customer = Customer(company_name="Tracking Customer")
        order = Order(customer=customer, title="Tracking Order", status="open")
        site_a = Site(order=order, site_name="Kitchen")
        site_b = Site(order=order, site_name="Bathroom")
        workshop_a = Workshop(name="Workshop A", specialties_json='["tiles"]', availability_status="available", is_active=True)
        workshop_b = Workshop(name="Workshop B", specialties_json='["plumbing"]', availability_status="available", is_active=True)
        self.db.add_all([customer, order, site_a, site_b, workshop_a, workshop_b])
        self.db.commit()
        return order, site_a, site_b, workshop_a, workshop_b

    def _assignment_payload(self, site: Site, workshop: Workshop, start: datetime | None, end: datetime | None) -> WorkshopSiteAssignmentPayload:
        return WorkshopSiteAssignmentPayload(
            siteId=site.id,
            workshopId=workshop.id,
            coveredSkills=["tiles"],
            startDate=start,
            endDate=end,
            status="assigned",
        )

    def test_workshop_assignment_rejects_overlapping_different_workshop_on_same_site(self) -> None:
        order, site, _other_site, workshop_a, workshop_b = self._workshop_order_fixture()
        create_order_workshop_assignment(
            order.id,
            self._assignment_payload(
                site,
                workshop_a,
                datetime(2026, 6, 1, tzinfo=timezone.utc),
                datetime(2026, 6, 5, tzinfo=timezone.utc),
            ),
            self.db,
        )

        with self.assertRaises(HTTPException) as raised:
            create_order_workshop_assignment(
                order.id,
                self._assignment_payload(
                    site,
                    workshop_b,
                    datetime(2026, 6, 4, tzinfo=timezone.utc),
                    datetime(2026, 6, 7, tzinfo=timezone.utc),
                ),
                self.db,
            )

        self.assertEqual(raised.exception.status_code, 409)

    def test_workshop_assignment_allows_adjacent_or_different_site_dates(self) -> None:
        order, site_a, site_b, workshop_a, workshop_b = self._workshop_order_fixture()
        create_order_workshop_assignment(
            order.id,
            self._assignment_payload(
                site_a,
                workshop_a,
                datetime(2026, 6, 1, tzinfo=timezone.utc),
                datetime(2026, 6, 5, tzinfo=timezone.utc),
            ),
            self.db,
        )
        create_order_workshop_assignment(
            order.id,
            self._assignment_payload(
                site_a,
                workshop_b,
                datetime(2026, 6, 6, tzinfo=timezone.utc),
                datetime(2026, 6, 8, tzinfo=timezone.utc),
            ),
            self.db,
        )
        create_order_workshop_assignment(
            order.id,
            self._assignment_payload(
                site_b,
                workshop_b,
                datetime(2026, 6, 3, tzinfo=timezone.utc),
                datetime(2026, 6, 4, tzinfo=timezone.utc),
            ),
            self.db,
        )

        self.assertEqual(self.db.query(WorkshopSiteAssignment).count(), 3)

    def test_tracking_response_includes_smart_warnings(self) -> None:
        order, site, _other_site, workshop_a, _workshop_b = self._workshop_order_fixture()
        workshop_a.availability_status = "not_available"
        assignment = WorkshopSiteAssignment(order_id=order.id, site_id=site.id, workshop_id=workshop_a.id, covered_skills_json='["tiles"]')
        overdue = ProjectTask(
            order_id=order.id,
            site_id=site.id,
            task_name="Apply waterproofing",
            status="in_progress",
            due_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        issue = ProjectIssue(order_id=order.id, site_id=site.id, title="Leak still open", severity="high", status="open")
        self.db.add_all([assignment, overdue, issue])
        self.db.commit()

        result = _tracking_response(self.db, order.id)
        warning_types = {warning["type"] for warning in result["dashboard"]["warnings"]}
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        site_warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}

        self.assertIn("missing_workshop_schedule", warning_types)
        self.assertIn("workshop_unavailable", warning_types)
        self.assertIn("high_issue", warning_types)
        self.assertIn("overdue_task", warning_types)
        self.assertTrue(site_warning_types.issuperset(warning_types))
        self.assertEqual(site_card["scheduledWorkshops"][0]["scheduleStatus"], "missing_schedule")

    def test_task_completion_updates_site_progress_and_clears_overdue_warning(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        old_due_date = datetime(2026, 1, 1, tzinfo=timezone.utc)

        create_project_task(
            order.id,
            ProjectTaskPayload(
                siteId=site.id,
                taskName="Remove old tiles",
                status="in_progress",
                responsibleType="workshop",
                responsibleName="Workshop A",
                dueDate=old_due_date,
            ),
            self.db,
        )
        create_project_task(
            order.id,
            ProjectTaskPayload(
                siteId=site.id,
                taskName="Install new tiles",
                status="not_started",
                responsibleType="workshop",
                responsibleName="Workshop A",
            ),
            self.db,
        )

        task = self.db.query(ProjectTask).filter(ProjectTask.task_name == "Remove old tiles").one()
        before = _tracking_response(self.db, order.id)
        before_site = next(card for card in before["siteCards"] if card["siteId"] == site.id)
        before_warning_types = {warning["type"] for warning in before_site["scheduleWarnings"]}

        self.assertEqual(before_site["progressPercent"], 0)
        self.assertIn("overdue_task", before_warning_types)

        result = update_project_task(
            order.id,
            task.id,
            ProjectTaskPayload(
                siteId=site.id,
                taskName="Remove old tiles",
                status="completed",
                responsibleType="workshop",
                responsibleName="Workshop A",
                dueDate=old_due_date,
            ),
            self.db,
        )
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        site_warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}

        self.assertEqual(result["dashboard"]["completedTaskCount"], 1)
        self.assertEqual(result["dashboard"]["totalTaskCount"], 2)
        self.assertEqual(site_card["progressPercent"], 50)
        self.assertNotIn("overdue_task", site_warning_types)

    def test_issue_resolution_removes_open_blocker_and_warning(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()

        create_project_issue(
            order.id,
            ProjectIssuePayload(
                siteId=site.id,
                title="Water leak",
                description="Leak is blocking waterproofing.",
                severity="high",
                status="open",
                responsibleType="workshop",
                responsibleName="Workshop A",
            ),
            self.db,
        )

        issue = self.db.query(ProjectIssue).filter(ProjectIssue.title == "Water leak").one()
        before = _tracking_response(self.db, order.id)
        before_site = next(card for card in before["siteCards"] if card["siteId"] == site.id)
        before_warning_types = {warning["type"] for warning in before["dashboard"]["warnings"]}

        self.assertIn("high_issue", before_warning_types)
        self.assertEqual(before["dashboard"]["openIssueCount"], 1)
        self.assertEqual(len(before_site["openBlockers"]), 1)

        result = update_project_issue(
            order.id,
            issue.id,
            ProjectIssuePayload(
                siteId=site.id,
                title="Water leak",
                description="Leak is blocking waterproofing.",
                severity="high",
                status="resolved",
                responsibleType="workshop",
                responsibleName="Workshop A",
                resolutionNote="Leak repaired and checked.",
            ),
            self.db,
        )
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        warning_types = {warning["type"] for warning in result["dashboard"]["warnings"]}

        self.assertNotIn("high_issue", warning_types)
        self.assertEqual(result["dashboard"]["openIssueCount"], 0)
        self.assertEqual(site_card["openBlockers"], [])

    def test_general_tracking_items_create_dashboard_warnings(self) -> None:
        order, _site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()

        result = create_project_issue(
            order.id,
            ProjectIssuePayload(
                title="Missing access key",
                description="The building key is not available.",
                severity="high",
                status="open",
            ),
            self.db,
        )
        result = create_project_task(
            order.id,
            ProjectTaskPayload(
                taskName="Confirm material delivery",
                status="in_progress",
                dueDate=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            self.db,
        )
        warning_types = {warning["type"] for warning in result["dashboard"]["warnings"]}
        warning_site_ids = {warning["siteId"] for warning in result["dashboard"]["warnings"]}

        self.assertIn("high_issue", warning_types)
        self.assertIn("overdue_task", warning_types)
        self.assertIn(None, warning_site_ids)

    def test_tracking_response_warns_when_work_site_has_no_workshop(self) -> None:
        order, site, other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()

        result = create_project_task(
            order.id,
            ProjectTaskPayload(
                siteId=site.id,
                taskName="Prepare waterproofing",
                status="not_started",
                dueDate=datetime(2026, 12, 1, tzinfo=timezone.utc),
            ),
            self.db,
        )
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        other_card = next(card for card in result["siteCards"] if card["siteId"] == other_site.id)
        warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}
        dashboard_warning = next(warning for warning in result["dashboard"]["warnings"] if warning["type"] == "no_workshop_assigned")

        self.assertIn("no_workshop_assigned", warning_types)
        self.assertEqual(dashboard_warning["fixArea"], "team")
        self.assertTrue(dashboard_warning["recommendedAction"])
        self.assertEqual(other_card["scheduleWarnings"], [])

    def test_tracking_response_warns_when_progress_and_status_do_not_match(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        self.db.add_all(
            [
                ProjectTask(order_id=order.id, site_id=site.id, task_name="Task A", status="completed"),
                ProjectTask(order_id=order.id, site_id=site.id, task_name="Task B", status="completed"),
            ]
        )
        self.db.commit()

        result = _tracking_response(self.db, order.id)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        warning = next(warning for warning in site_card["scheduleWarnings"] if warning["type"] == "progress_status_mismatch")

        self.assertEqual(site_card["progressPercent"], 100)
        self.assertEqual(site_card["currentStatus"], "not_started")
        self.assertEqual(warning["fixArea"], "timeline")

    def test_tracking_response_warns_when_completed_status_has_low_progress(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        update = ProjectProgressUpdate(
            order_id=order.id,
            site_id=site.id,
            title="Final inspection",
            status="completed",
            progress_percent=50,
            update_date=datetime(2026, 6, 1, tzinfo=timezone.utc),
        )
        self.db.add(update)
        self.db.commit()

        result = _tracking_response(self.db, order.id)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}

        self.assertEqual(site_card["currentStatus"], "completed")
        self.assertEqual(site_card["progressPercent"], 50)
        self.assertIn("progress_status_mismatch", warning_types)

    def test_tracking_baseline_suggestion_creates_draft_plans(self) -> None:
        order, site, other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        order.start_date = datetime(2026, 6, 1, tzinfo=timezone.utc)
        order.end_date = datetime(2026, 6, 10, tzinfo=timezone.utc)
        self.db.commit()

        result = suggest_order_tracking_baseline(order.id, db=self.db)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        other_card = next(card for card in result["siteCards"] if card["siteId"] == other_site.id)

        self.assertEqual(site_card["baselineStatus"], "draft")
        self.assertEqual(other_card["baselineStatus"], "draft")
        self.assertIsNotNone(site_card["baselineStartDate"])
        self.assertIsNotNone(site_card["baselineEndDate"])
        self.assertIsNone(site_card["plannedProgressPercent"])
        self.assertIsNone(site_card["progressDeltaPercent"])
        self.assertEqual(site_card["delayStatus"], "unknown")

    def test_tracking_workshop_assignment_without_baseline_warns_missing_baseline(self) -> None:
        order, site, _other_site, workshop_a, _workshop_b = self._workshop_order_fixture()
        create_order_workshop_assignment(
            order.id,
            self._assignment_payload(
                site,
                workshop_a,
                datetime(2026, 6, 1, tzinfo=timezone.utc),
                datetime(2026, 6, 5, tzinfo=timezone.utc),
            ),
            self.db,
        )

        result = _tracking_response(self.db, order.id)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}

        self.assertIn("baseline_missing", warning_types)

    def test_tracking_weighted_progress_and_delay_prediction(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        now = datetime.now(timezone.utc)
        self.db.add(
            ProjectSiteBaseline(
                order_id=order.id,
                site_id=site.id,
                planned_start_date=now - timedelta(days=10),
                planned_end_date=now - timedelta(days=1),
                baseline_status="confirmed",
                source="manual",
            )
        )
        self.db.add_all(
            [
                ProjectTask(order_id=order.id, site_id=site.id, task_name="Remove old tiles", status="completed", weight_percent=Decimal("40")),
                ProjectTask(order_id=order.id, site_id=site.id, task_name="Install new tiles", status="in_progress", weight_percent=Decimal("60"), progress_percent=50),
            ]
        )
        self.db.commit()

        result = _tracking_response(self.db, order.id)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}

        self.assertEqual(site_card["actualProgressPercent"], 70)
        self.assertEqual(site_card["progressPercent"], 70)
        self.assertEqual(site_card["baselineStatus"], "confirmed")
        self.assertIn(site_card["delayStatus"], {"watch", "delayed"})
        self.assertIn("behind_schedule", warning_types)

    def test_tracking_task_weights_missing_warning_and_even_fallback(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        self.db.add_all(
            [
                ProjectTask(order_id=order.id, site_id=site.id, task_name="Task A", status="completed"),
                ProjectTask(order_id=order.id, site_id=site.id, task_name="Task B", status="not_started"),
            ]
        )
        self.db.commit()

        result = _tracking_response(self.db, order.id)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)
        warning_types = {warning["type"] for warning in site_card["scheduleWarnings"]}

        self.assertEqual(site_card["actualProgressPercent"], 50)
        self.assertIn("task_weights_missing", warning_types)

    def test_tracking_baseline_update_confirms_manager_dates(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        payload = ProjectSiteBaselinePayload(
            plannedStartDate=datetime(2026, 6, 1, tzinfo=timezone.utc),
            plannedEndDate=datetime(2026, 6, 5, tzinfo=timezone.utc),
            baselineStatus="confirmed",
            source="manual",
            notes="Approved baseline",
        )

        result = update_order_site_tracking_baseline(order.id, site.id, payload, db=self.db)
        site_card = next(card for card in result["siteCards"] if card["siteId"] == site.id)

        self.assertEqual(site_card["baselineStatus"], "confirmed")
        self.assertEqual(site_card["baselinePlan"]["notes"], "Approved baseline")

    def test_tracking_analysis_context_includes_rule_warnings(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        create_project_task(
            order.id,
            ProjectTaskPayload(siteId=site.id, taskName="Prepare surface", status="not_started"),
            self.db,
        )

        tracking = _tracking_response(self.db, order.id)
        context = build_tracking_analysis_context(tracking)
        warning_types = {warning["type"] for warning in context["dashboard"]["warnings"]}

        self.assertEqual(context["order"]["title"], order.title)
        self.assertIn("no_workshop_assigned", warning_types)
        self.assertEqual(context["sites"][0]["siteName"], site.site_name)

    def test_tracking_analysis_uses_ai_json_when_available(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        create_project_task(order.id, ProjectTaskPayload(siteId=site.id, taskName="Prepare surface"), self.db)
        tracking = _tracking_response(self.db, order.id)
        ai_json = """{
          "healthStatus": "watch",
          "summary": "Project needs workshop assignment.",
          "risks": [{"title":"No workshop","severity":"medium","siteName":"Kitchen","reason":"No workshop assigned"}],
          "delays": [],
          "missingInformation": ["Workshop assignment"],
          "recommendedActions": [{"priority":"medium","siteName":"Kitchen","action":"Assign workshop"}],
          "assumptions": ["Photo metadata only"]
        }"""

        with patch("app.services.tracking_ai.generate_text", return_value=ai_json):
            result = analyze_tracking(tracking, locale="en")

        self.assertEqual(result["provider"], "ai")
        self.assertEqual(result["healthStatus"], "watch")
        self.assertEqual(result["summary"], "Project needs workshop assignment.")
        self.assertTrue(result["sourceWarnings"])

    def test_tracking_analysis_endpoint_falls_back_when_ai_fails(self) -> None:
        order, site, _other_site, _workshop_a, _workshop_b = self._workshop_order_fixture()
        create_project_task(order.id, ProjectTaskPayload(siteId=site.id, taskName="Prepare surface"), self.db)

        with patch("app.services.tracking_ai.generate_text", side_effect=HTTPException(status_code=502, detail="quota")):
            result = analyze_order_tracking(order.id, locale="ar", db=self.db)

        self.assertEqual(result["provider"], "rule_fallback")
        self.assertIn(result["healthStatus"], {"watch", "at_risk", "blocked"})
        self.assertTrue(result["recommendedActions"])
        self.assertEqual(result["aiError"], "quota")

    def test_workshop_assignment_update_ignores_itself_for_overlap_check(self) -> None:
        order, site, _other_site, workshop_a, _workshop_b = self._workshop_order_fixture()
        created = create_order_workshop_assignment(
            order.id,
            self._assignment_payload(
                site,
                workshop_a,
                datetime(2026, 6, 1, tzinfo=timezone.utc),
                datetime(2026, 6, 5, tzinfo=timezone.utc),
            ),
            self.db,
        )

        updated = update_workshop_assignment(
            created["id"],
            self._assignment_payload(
                site,
                workshop_a,
                datetime(2026, 6, 2, tzinfo=timezone.utc),
                datetime(2026, 6, 6, tzinfo=timezone.utc),
            ),
            self.db,
        )

        self.assertEqual(updated["id"], created["id"])
        self.assertTrue(str(updated["startDate"]).startswith("2026-06-02T00:00:00"))
        self.assertTrue(str(updated["endDate"]).startswith("2026-06-06T00:00:00"))

    def test_build_proposal_pdf_returns_pdf_bytes(self) -> None:
        payload = {
            "id": "proposal-1",
            "status": "draft",
            "customerCompanyName": "ACME Bau",
            "contactName": "Ahmad Mansour",
            "contactPhone": "+49 176 44556677",
            "contactEmail": "ahmad@example.com",
            "orderTitle": "Renovation Proposal",
            "summary": "Kitchen renovation and guest bathroom work.",
            "preferredStartDate": "2026-05-06",
            "preferredEndDate": "2026-05-20",
            "estimatedHours": 140,
            "estimatedPrice": 7200,
            "currency": "EUR",
            "proposedSites": [
                {
                    "siteName": "Kitchen",
                    "requiredSkills": ["flooring", "plumbing"],
                    "requiredCertifications": [],
                    "estimatedHours": 55,
                    "coverageType": "mixed_with_workshop",
                    "assignedWorkshopName": "Hamburg Renovation Team",
                    "workshopCoveredSkills": ["flooring"],
                    "notes": "Manager wants internal plumbing support.",
                }
            ],
            "paymentDrafts": [{"type": "deposit", "amount": 1000, "currency": "EUR", "paidDate": "2026-05-10", "method": "cash"}],
            "externalWorkshops": [{"name": "Hamburg Renovation Team", "specialties": ["flooring"], "notes": "Optional external support"}],
            "recommendedTeam": {"sites": [{"siteIndex": 0, "siteName": "Kitchen", "recommendedHeadcount": 2, "recommendedTeam": [{"employeeName": "Ali Hassan"}, {"employeeName": "Omar Khaled"}]}]},
        }

        pdf_bytes = build_proposal_pdf(payload, locale="en")

        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
        self.assertGreater(len(pdf_bytes), 1500)

    def test_build_proposal_pdf_supports_arabic_locale(self) -> None:
        payload = {
            "id": "proposal-ar-1",
            "status": "draft",
            "customerCompanyName": "شركة النور",
            "contactName": "أحمد منصور",
            "summary": "ترميم مطبخ وحمام ضيوف",
            "orderTitle": "عرض مشروع",
            "proposedSites": [
                {
                    "siteName": "المطبخ",
                    "requiredSkills": ["بلاط", "صحية"],
                    "requiredCertifications": [],
                    "estimatedHours": 40,
                }
            ],
            "paymentDrafts": [],
            "externalWorkshops": [],
        }

        pdf_bytes = build_proposal_pdf(payload, locale="ar")

        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
        self.assertGreater(len(pdf_bytes), 1500)

    def test_arabic_pdf_text_is_shaped_for_reportlab(self) -> None:
        visual = _arabic_visual_text("\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0648\u0631")

        self.assertNotEqual(visual, "\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0648\u0631")
        self.assertTrue(any("\ufe80" <= char <= "\ufefc" for char in visual))

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

    def test_construction_guidance_is_hidden_and_bilingual(self) -> None:
        guidance = construction_scope_guidance()

        self.assertIn("Construction scope checklist", guidance)
        self.assertIn("Flooring/tile", guidance)
        self.assertIn("Painting", guidance)
        self.assertIn("Plumbing/sanitary", guidance)
        self.assertIn("\u0627\u0644\u0628\u0644\u0627\u0637", guidance)
        self.assertIn("maximum 2-4", guidance)
        self.assertIn("to be confirmed", guidance)

    def test_scope_first_reply_for_arabic_project_basics_does_not_ask_payment(self) -> None:
        proposal = Proposal(status="intake")
        messages = [
            ProposalMessage(
                role="user",
                content=(
                    "\u0639\u0646\u062f\u064a \u0645\u0634\u0631\u0648\u0639 \u062a\u0631\u0645\u064a\u0645 \u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0639\u0645\u0631\u0627\u0646 \u0627\u0644\u062d\u062f\u064a\u062b. "
                    "\u0627\u0644\u0645\u0648\u0642\u0639 \u0641\u064a \u0645\u062f\u064a\u0646\u0629 \u062d\u0644\u0628. "
                    "\u0628\u062f\u0646\u0627 \u0646\u0628\u062f\u0623 \u0645\u0646 \u0661\u0660-\u0660\u0665-\u0662\u0660\u0662\u0666."
                ),
            )
        ]

        reply = maybe_build_scope_first_reply(proposal, messages)

        self.assertIsNotNone(reply)
        self.assertIn("\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644", reply or "")
        self.assertIn("\u0646\u0648\u0639 \u0627\u0644\u0623\u0639\u0645\u0627\u0644", reply or "")
        self.assertNotIn("\u0627\u0644\u062f\u0641\u0639", reply or "")
        self.assertNotIn("\u0639\u0631\u0628\u0648\u0646", reply or "")

    def test_intake_chat_prompt_includes_selective_construction_guidance(self) -> None:
        prompt = build_intake_chat_prompt(Proposal(status="intake"), [ProposalMessage(role="user", content="Kitchen renovation with flooring and plumbing.")])

        self.assertIn("Hidden construction checklist", prompt)
        self.assertIn("kitchen renovation", prompt)
        self.assertIn("flooring", prompt)
        self.assertIn("plumbing", prompt)
        self.assertIn("never more than 2-4", prompt)
        self.assertIn("Do not show the full checklist", prompt)
        self.assertIn("Do not ask for any detail the manager already stated", prompt)
        self.assertIn("ask only for the missing part", prompt)
        self.assertIn("When the project scope is still unknown", prompt)
        self.assertIn("Do not ask about payment, workshops, or structural details", prompt)
        self.assertNotIn("staffing needs", prompt)
        self.assertIn("repeat it exactly and ask only for the missing payment fields", prompt)
        self.assertIn("Never change numbers, amounts, currencies", prompt)
        self.assertIn("never add placeholder or example phone numbers", prompt)
        self.assertIn("Do not provide generic best-practice advice", prompt)
        self.assertIn("not mentioned or needs confirmation", prompt)
        self.assertIn("Do not answer with vague generic summaries", prompt)
        self.assertIn("record concrete facts", prompt)
        self.assertIn("ready for proposal generation", prompt)

    def test_intake_chat_prompt_includes_known_available_workshops(self) -> None:
        prompt = build_intake_chat_prompt(
            Proposal(status="intake"),
            [ProposalMessage(role="user", content="Which workshop can handle electrical work?")],
            known_available_workshops=[{"name": "Elektro Partner", "specialties": ["electrical"], "availabilityStatus": "available"}],
        )

        self.assertIn("Known available workshop partners", prompt)
        self.assertIn("Elektro Partner", prompt)
        self.assertIn("never suggest inactive or not-available workshops", prompt)

    def test_proposal_prompt_includes_construction_guidance_for_notes_and_skills(self) -> None:
        prompt = build_proposal_prompt([ProposalMessage(role="user", content="We need painting and flooring.")])

        self.assertIn("Hidden construction checklist", prompt)
        self.assertIn("proposedSites[].notes", prompt)
        self.assertIn("requiredSkills", prompt)
        self.assertIn("to be confirmed", prompt)
        self.assertIn("flooring", prompt)
        self.assertIn("painting", prompt)

    def test_extract_proposal_accepts_construction_scope_details_from_ai(self) -> None:
        proposal = Proposal(status="intake")
        message = ProposalMessage(role="user", content="Kitchen renovation: flooring, sanitary repairs, shelves. Budget impact 1000 USD.")
        provider_payload = """{
          "summary": "Kitchen renovation addition",
          "orderTitle": "Kitchen renovation",
          "orderDescription": "Kitchen work includes flooring, sanitary repairs, and shelf renovation. Tile material and plumbing scope to be confirmed.",
          "proposedSites": [{
            "siteName": "Kitchen",
            "notes": "Flooring, sanitary repairs, and shelf/carpentry renovation. Tile material, old-floor removal, and exact pipe scope to be confirmed.",
            "requiredSkills": ["flooring", "plumbing", "carpentry"],
            "estimatedHours": 12
          }],
          "requiredSkills": ["flooring", "plumbing", "carpentry"],
          "currency": "USD"
        }"""

        with patch("app.services.proposals.generate_text", return_value=provider_payload):
            extracted = extract_proposal_from_messages(proposal, [message])

        self.assertEqual(extracted.proposedSites[0].siteName, "Kitchen")
        self.assertIn("flooring", extracted.requiredSkills)
        self.assertIn("plumbing", extracted.requiredSkills)
        self.assertIn("to be confirmed", extracted.proposedSites[0].notes or "")

    def test_sanitize_intake_assistant_reply_removes_hallucinated_turns(self) -> None:
        raw = "?? ????? ???? ??????.\nManager: ????? ?????.\nAssistant: ???? ??? ?????."

        cleaned = sanitize_intake_assistant_reply(raw)

        self.assertEqual(cleaned, "?? ????? ???? ??????.")

    def test_sanitize_intake_assistant_reply_removes_leading_label(self) -> None:
        cleaned = sanitize_intake_assistant_reply("Assistant: ?? ????? ?????.")

        self.assertEqual(cleaned, "?? ????? ?????.")

    def test_sanitize_intake_assistant_reply_removes_language_meta_prefix(self) -> None:
        cleaned = sanitize_intake_assistant_reply(
            "\u0644\u0631\u062f \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629: \u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u0641\u0639 \u0643\u0627\u0634."
        )

        self.assertEqual(cleaned, "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u0641\u0639 \u0643\u0627\u0634.")

    def test_sanitize_intake_assistant_reply_removes_unsupported_phone_numbers(self) -> None:
        source = "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641: \u0660\u0669\u0664\u0664\u0661\u0662\u0663\u0664\u0665\u0666"
        raw = "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641: \u0660\u0669\u0664\u0664\u0661\u0662\u0663\u0664\u0665\u0666\u060c \u0660\u0669\u0664-\u0660\u0660\u0660\u0660\u0660\u0660\u0660\u060c \u0660\u0669\u0665-\u0660\u0660\u0660\u0660\u0660\u0660\u0660"

        cleaned = sanitize_intake_assistant_reply(raw, source)

        self.assertIn("\u0660\u0669\u0664\u0664\u0661\u0662\u0663\u0664\u0665\u0666", cleaned)
        self.assertNotIn("\u0660\u0669\u0664-\u0660\u0660\u0660\u0660\u0660\u0660\u0660", cleaned)
        self.assertNotIn("\u0660\u0669\u0665-\u0660\u0660\u0660\u0660\u0660\u0660\u0660", cleaned)

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

    def test_apply_proposal_update_keeps_site_staffing_fields(self) -> None:
        proposal = Proposal(status="draft")
        payload = ProposalDraftPayload(
            customerCompanyName="ACME",
            orderTitle="Hybrid Staffing",
            summary="Kurzfassung",
            proposedSites=[
                {
                    "siteName": "Kellerflur",
                    "requiredSkills": ["Trockenbau", "Maler"],
                    "recommendedHeadcount": 2,
                    "selectedInternalHeadcount": 1,
                    "assignedWorkshopName": "Bremen Drywall Team",
                    "workshopCoveredSkills": ["Trockenbau"],
                    "coverageType": "mixed_with_workshop",
                }
            ],
        )

        apply_proposal_update(proposal, payload)

        self.assertIn("selectedInternalHeadcount", proposal.proposed_sites_json or "")
        self.assertIn("Bremen Drywall Team", proposal.proposed_sites_json or "")
        self.assertIn("mixed_with_workshop", proposal.proposed_sites_json or "")

    def test_proposal_prompt_includes_site_level_workshop_and_staffing_fields(self) -> None:
        prompt = build_proposal_prompt([ProposalMessage(role="user", content="Basement uses a workshop, internal painters still needed.")])

        self.assertIn("assignedWorkshopName", prompt)
        self.assertIn("workshopCoveredSkills", prompt)
        self.assertIn("coverageType", prompt)
        self.assertIn("selectedInternalHeadcount", prompt)
        self.assertIn("Do not place workshop coverage only at the top level", prompt)

    def test_extract_proposal_keeps_ai_site_workshop_and_staffing_fields(self) -> None:
        proposal = Proposal(status="intake")
        provider_payload = """{
          "summary": "Hybrid staffing project",
          "orderTitle": "Renovation",
          "proposedSites": [{
            "siteName": "Kellerflur",
            "requiredSkills": ["Trockenbau", "Feuchtigkeitsschutz", "Maler"],
            "recommendedHeadcount": 2,
            "selectedInternalHeadcount": 1,
            "assignedWorkshopName": "Hamburg Renovation Team",
            "workshopCoveredSkills": ["Trockenbau", "Feuchtigkeitsschutz"],
            "coverageType": "mixed_with_workshop"
          }],
          "requiredSkills": ["Trockenbau", "Feuchtigkeitsschutz", "Maler"],
          "currency": "EUR"
        }"""

        with patch("app.services.proposals.generate_text", return_value=provider_payload):
            extracted = extract_proposal_from_messages(
                proposal,
                [ProposalMessage(role="user", content="Kellerflur: Hamburg Renovation Team covers Trockenbau and Feuchtigkeitsschutz, but we still need internal Maler.")],
            )

        site = extracted.proposedSites[0]
        self.assertEqual(site.assignedWorkshopName, "Hamburg Renovation Team")
        self.assertEqual(site.coverageType, "workshop_only")
        self.assertIsNone(site.selectedInternalHeadcount)
        self.assertIn("Trockenbau", site.workshopCoveredSkills)

    def test_extract_proposal_enriches_partial_site_data_from_transcript(self) -> None:
        proposal = Proposal(status="intake")
        provider_payload = """{
          "summary": "Hybrid staffing project",
          "orderTitle": "Renovation",
          "proposedSites": [{
            "siteName": "??? ?????",
            "requiredSkills": [],
            "recommendedHeadcount": null,
            "selectedInternalHeadcount": null,
            "assignedWorkshopName": null,
            "workshopCoveredSkills": [],
            "coverageType": null
          }],
          "requiredSkills": ["Trockenbau", "Feuchtigkeitsschutz", "Maler"],
          "externalWorkshops": [{
            "name": "Hamburg Renovation Team",
            "specialties": ["Trockenbau", "Feuchtigkeitsschutz"],
            "relationshipStatus": "known"
          }],
          "currency": "EUR"
        }"""
        message = ProposalMessage(
            role="user",
            content="??? ????? ????? ???? ?????? ????? Hamburg Renovation Team ????? Trockenbau ? Feuchtigkeitsschutz? ????? ?? ???? ????? ?????? ??????? ??? Maler ?????????.",
        )

        with patch("app.services.proposals.generate_text", return_value=provider_payload):
            extracted = extract_proposal_from_messages(proposal, [message])

        site = extracted.proposedSites[0]
        self.assertEqual(site.assignedWorkshopName, "Hamburg Renovation Team")
        self.assertEqual(site.coverageType, "workshop_only")
        self.assertIn("Trockenbau", site.workshopCoveredSkills)
        self.assertIn("Feuchtigkeitsschutz", site.workshopCoveredSkills)
        self.assertTrue(site.requiredSkills)

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

    def test_recommend_staff_uses_full_auto_selected_team_for_price_preview(self) -> None:
        alice = build_employee("Alice Maler", "Maler", rate="40")
        bruno = build_employee("Bruno Maler", "Maler", rate="80")
        self.db.add_all([alice, bruno])

        proposal = Proposal(status="draft", order_title="Team Einsatz", estimated_hours=Decimal("10.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Team Einsatz",
                summary="Mehrere Maler",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 4, 22, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "Treppenhaus",
                        "requiredSkills": ["Maler"],
                        "estimatedHours": 10,
                        "recommendedHeadcount": 2,
                        "selectedInternalHeadcount": 2,
                    }
                ],
                requiredSkills=["Maler"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        site = recommendations["sites"][0]
        self.assertEqual(len(site["autoSelectedEmployeeIds"]), 2)
        self.assertEqual(recommendations["pricePreview"], 600.0)

    def test_recommend_staff_calculates_recommended_count_independently_from_manager_count(self) -> None:
        alice = build_employee("Alice Maler", "Maler")
        bruno = build_employee("Bruno Maler", "Maler")
        self.db.add_all([alice, bruno])

        proposal = Proposal(status="draft", order_title="Manager Count", estimated_hours=Decimal("10.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Manager Count",
                summary="Manager asked for two internal painters",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 4, 22, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "Bedroom",
                        "requiredSkills": ["Maler"],
                        "estimatedHours": 10,
                        "recommendedHeadcount": 2,
                        "selectedInternalHeadcount": 2,
                        "coverageType": "internal_only",
                    }
                ],
                requiredSkills=["Maler"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        site = recommendations["sites"][0]
        self.assertEqual(site["recommendedHeadcount"], 1)
        self.assertEqual(site["selectedInternalHeadcount"], 2)
        self.assertEqual(len(site["autoSelectedEmployeeIds"]), 2)

    def test_recommend_staff_derives_nonzero_headcount_when_saved_value_is_zero(self) -> None:
        employee = build_employee("Anna Maler", "Maler")
        self.db.add(employee)

        proposal = Proposal(status="draft", order_title="Zero Headcount", estimated_hours=Decimal("18.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Zero Headcount",
                summary="Saved zero should be recalculated",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 5, 10, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "Schlafzimmer",
                        "requiredSkills": ["Maler"],
                        "estimatedHours": 18,
                        "recommendedHeadcount": 0,
                        "selectedInternalHeadcount": 0,
                        "coverageType": "internal_only",
                    }
                ],
                requiredSkills=["Maler"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        site = recommendations["sites"][0]
        self.assertGreaterEqual(site["recommendedHeadcount"], 1)
        self.assertGreaterEqual(site["selectedInternalHeadcount"], 1)
        self.assertTrue(site["autoSelectedEmployeeIds"])

    def test_recommend_staff_handles_workshop_only_sites_without_internal_team(self) -> None:
        employee = build_employee("Clara Maler", "Maler")
        self.db.add(employee)

        proposal = Proposal(status="draft", order_title="Workshop Only", estimated_hours=Decimal("12.0"))
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Workshop Only",
                summary="Workshop uebernimmt alles",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 4, 24, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "Kueche",
                        "requiredSkills": ["Trockenbau"],
                        "estimatedHours": 12,
                        "assignedWorkshopName": "Kuechen Profi Team",
                        "workshopCoveredSkills": ["Trockenbau"],
                        "coverageType": "workshop_only",
                        "selectedInternalHeadcount": 0,
                    }
                ],
                requiredSkills=["Trockenbau"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)

        site = recommendations["sites"][0]
        self.assertEqual(site["coverageType"], "workshop_only")
        self.assertEqual(site["internalRequiredSkills"], [])
        self.assertEqual(site["autoSelectedEmployeeIds"], [])
        self.assertEqual(site["selectedInternalHeadcount"], 0)

    def test_ai_workshop_recommendations_exclude_unavailable_global_workshops(self) -> None:
        available = Workshop(
            name="Elektro Partner",
            specialties_json='["electrical"]',
            availability_status="available",
            is_active=True,
        )
        unavailable = Workshop(
            name="Busy Elektro",
            specialties_json='["electrical"]',
            availability_status="not_available",
            availability_note="Booked this week",
            is_active=True,
        )
        self.db.add_all([available, unavailable])

        proposal = Proposal(status="draft", order_title="Electrical site")
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Electrical site",
                summary="Electrical scope",
                proposedSites=[{"siteName": "Kitchen", "requiredSkills": ["electrical"], "estimatedHours": 8}],
                requiredSkills=["electrical"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = _workshop_recommendations_for_proposal(self.db, proposal)

        names = [item["name"] for item in recommendations["sites"][0]["workshopRecommendations"]]
        self.assertIn("Elektro Partner", names)
        self.assertNotIn("Busy Elektro", names)
        self.assertEqual(recommendations["sites"][0]["workshopRecommendations"][0]["availabilityStatus"], "available")

    def test_build_staffing_explanation_context_and_fallback_text(self) -> None:
        alice = build_employee("Alice Maler", "Maler")
        bruno = build_employee("Bruno Maler", "Maler")
        self.db.add_all([alice, bruno])

        proposal = Proposal(status="draft", order_title="Kellerflur")
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="ACME",
                orderTitle="Kellerflur",
                summary="Mixed workshop coverage",
                preferredStartDate=datetime(2026, 4, 21, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 4, 28, tzinfo=timezone.utc),
                proposedSites=[
                    {
                        "siteName": "Kellerflur",
                        "requiredSkills": ["Trockenbau", "Maler"],
                        "estimatedHours": 50,
                        "assignedWorkshopName": "Hamburg Renovation Team",
                        "workshopCoveredSkills": ["Trockenbau"],
                        "coverageType": "mixed_with_workshop",
                    }
                ],
                requiredSkills=["Trockenbau", "Maler"],
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        recommendations = recommend_staff_for_proposal(self.db, proposal)
        context = build_staffing_explanation_context(proposal, recommendations, 0)

        self.assertEqual(context["siteName"], "Kellerflur")
        self.assertEqual(context["assignedWorkshopName"], "Hamburg Renovation Team")
        self.assertEqual(context["internalRequiredSkills"], ["maler"])
        self.assertGreaterEqual(context["recommendedHeadcount"], 1)
        self.assertTrue(context["topCandidates"])

        explanation_en = format_staffing_explanation(context, "en")
        explanation_ar = format_staffing_explanation(context, "ar")

        self.assertIn("Assigned workshop: Hamburg Renovation Team", explanation_en)
        self.assertIn("Kellerflur", explanation_en)
        self.assertIn("\u0627\u0644\u0645\u0648\u0642\u0639:", explanation_ar)

    def test_confirm_proposal_allows_workshop_only_site_without_employees(self) -> None:
        proposal = Proposal(status="draft")
        apply_proposal_update(
            proposal,
            ProposalDraftPayload(
                customerCompanyName="Workshop Kunde",
                orderTitle="Werkstattprojekt",
                summary="Workshop only site",
                proposedSites=[
                    {
                        "siteName": "Kueche",
                        "requiredSkills": ["Trockenbau"],
                        "estimatedHours": 12,
                        "assignedWorkshopName": "Kuechen Profi Team",
                        "workshopCoveredSkills": ["Trockenbau"],
                        "coverageType": "workshop_only",
                        "selectedInternalHeadcount": 0,
                    }
                ],
                estimatedHours=12,
                preferredStartDate=datetime(2026, 5, 1, tzinfo=timezone.utc),
                preferredEndDate=datetime(2026, 5, 7, tzinfo=timezone.utc),
            ),
        )
        self.db.add(proposal)
        self.db.commit()

        result = confirm_proposal(self.db, proposal, existing_customer_id=None, site_assignments={})
        self.db.commit()

        self.assertTrue(result["orderId"])
        self.assertEqual(proposal.status, "converted")
        self.assertEqual(float(proposal.estimated_price or 0), 0.0)

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
                        "assignedWorkshopName": "Bremen Drywall Team",
                        "workshopCoveredSkills": ["Trockenbau"],
                        "coverageType": "workshop_only",
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
        self.assertEqual(self.db.query(Workshop).count(), 1)
        self.assertEqual(self.db.query(WorkshopSiteAssignment).count(), 1)
        self.assertEqual(self.db.query(CustomerWorkshop).count(), 0)


if __name__ == "__main__":
    unittest.main()
