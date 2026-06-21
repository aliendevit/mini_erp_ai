from __future__ import annotations

import asyncio
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import wave

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import Headers, UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import Proposal, ProposalMessage
from app.routers.ai import clear_intake_messages, create_intake, delete_intake, delete_intake_message, generate_proposal, intake_message_stream, transcribe_intake_audio
from app.services.assemblyai_client import transcribe_audio
from app.services.proposals import build_proposal_prompt, refresh_proposal_memory_locally
from app.schemas import AIIntakeCreatePayload, AIIntakeMessagePayload
from app.utils import proposal_payload


async def _collect_streaming_response(response) -> str:
    chunks: list[str] = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk.decode("utf-8"))
        else:
            chunks.append(str(chunk))
    return "".join(chunks)


def _wav_bytes(duration_ms: int = 500, amplitude: int = 1200, sample_rate: int = 16_000) -> bytes:
    frame_count = int(sample_rate * duration_ms / 1000)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for index in range(frame_count):
            value = amplitude if index % 2 == 0 else -amplitude
            frames.extend(int(value).to_bytes(2, "little", signed=True))
        wav_file.writeframes(bytes(frames))
    return buffer.getvalue()


def _upload_file(content: bytes, content_type: str = "audio/wav", filename: str = "clip.wav") -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        size=len(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


class AIAssistantTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=engine)
        self.db: Session = TestingSession()

    def tearDown(self) -> None:
        self.db.close()

    def test_intake_message_stream_persists_both_messages(self) -> None:
        created = create_intake(
            AIIntakeCreatePayload(customerCompanyName="NorthBuild Property Services Ltd", orderTitle="Renovierung"),
            db=self.db,
        )
        proposal_id = created["id"]

        with patch("app.routers.ai.ensure_gemini_ready"), patch(
            "app.routers.ai.stream_text", return_value=iter(["Danke ", "fuer die Details."])
        ):
            response = intake_message_stream(
                proposal_id,
                AIIntakeMessagePayload(content="Hello, I have a new client."),
                db=self.db,
            )
            body = asyncio.run(_collect_streaming_response(response))

        self.assertEqual(body, "Danke fuer die Details.")

        messages = self.db.scalars(
            select(ProposalMessage).where(ProposalMessage.proposal_id == proposal_id).order_by(ProposalMessage.created_at.asc())
        ).all()
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0].role, "user")
        self.assertEqual(messages[0].content, "Hello, I have a new client.")
        self.assertEqual(messages[1].role, "assistant")
        self.assertEqual(messages[1].content, "Danke fuer die Details.")

    def test_a2ui_blocks_use_intake_memory_before_proposal_generation(self) -> None:
        created = create_intake(AIIntakeCreatePayload(), db=self.db)
        proposal = self.db.get(Proposal, created["id"])
        proposal.messages = [
            ProposalMessage(
                role="user",
                content=(
                    "I have a renovation project for Al Noor Properties in Berlin, Alexanderplatz 12. "
                    "Bathroom waterproofing, ceramic tiling, plumbing pipe replacement, full wall painting, "
                    "putty work, and floor removal are required. Budget is 12000 EUR. "
                    "The 3000 EUR deposit will be paid by bank transfer. Reference number DEP-ALNOOR-2026-001. "
                    "Assign Nord Fliesen & Abdichtung for tiling and waterproofing. "
                    "Assign Workshop Al-Nazafa for plumbing. Assign Weser Malerteam GmbH for painting."
                ),
            ),
            ProposalMessage(role="assistant", content="I captured the project details."),
        ]
        self.db.add(proposal)
        self.db.commit()

        proposal = self.db.get(Proposal, created["id"])
        refresh_proposal_memory_locally(self.db, proposal, proposal.messages)
        self.db.commit()

        payload = proposal_payload(self.db.get(Proposal, created["id"]), include_messages=True)
        assistant_message = payload["messages"][-1]
        blocks = {block["type"]: block for block in assistant_message["ui"]}

        self.assertGreaterEqual(blocks["intakeReadiness"]["percent"], 70)
        summary_values = {item["label"]: item["value"] for item in blocks["intakeSummary"]["items"]}
        self.assertEqual(summary_values["Customer"], "Al Noor Properties")
        self.assertGreaterEqual(summary_values["Payments"], 1)
        self.assertGreaterEqual(summary_values["Workshops"], 3)
        self.assertIn("tiling", summary_values["Trades"])
        missing_keys = {item["key"] for item in blocks["missingInfoChecklist"]["items"]}
        self.assertNotIn("customerCompanyName", missing_keys)
        self.assertNotIn("skills", missing_keys)

    def test_clear_intake_messages_removes_persisted_conversation(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Voice intake"), db=self.db)
        proposal_id = created["id"]

        proposal = self.db.get(Proposal, proposal_id)
        proposal.messages = [
            ProposalMessage(role="user", content="Hello"),
            ProposalMessage(role="assistant", content="Hi"),
        ]
        self.db.add(proposal)
        self.db.commit()

        payload = clear_intake_messages(proposal_id, db=self.db)

        self.assertEqual(payload["messages"], [])
        messages = self.db.scalars(select(ProposalMessage).where(ProposalMessage.proposal_id == proposal_id)).all()
        self.assertEqual(messages, [])

    def test_delete_intake_removes_session_and_related_messages(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Delete this intake"), db=self.db)
        keep = create_intake(AIIntakeCreatePayload(orderTitle="Keep this intake"), db=self.db)
        proposal_id = created["id"]

        proposal = self.db.get(Proposal, proposal_id)
        proposal.messages = [ProposalMessage(role="user", content="Temporary conversation")]
        self.db.add(proposal)
        self.db.commit()

        payload = delete_intake(proposal_id, db=self.db)

        self.assertEqual(payload, {"ok": True})
        self.assertIsNone(self.db.get(Proposal, proposal_id))
        self.assertEqual(self.db.scalars(select(ProposalMessage).where(ProposalMessage.proposal_id == proposal_id)).all(), [])
        self.assertIsNotNone(self.db.get(Proposal, keep["id"]))

    def test_delete_intake_message_removes_only_selected_message(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Selective cleanup"), db=self.db)
        proposal_id = created["id"]

        proposal = self.db.get(Proposal, proposal_id)
        first = ProposalMessage(role="user", content="Keep this project detail")
        selected = ProposalMessage(role="assistant", content="Delete this reply")
        last = ProposalMessage(role="user", content="Keep this payment detail")
        proposal.messages = [first, selected, last]
        self.db.add(proposal)
        self.db.commit()
        selected_id = selected.id

        payload = delete_intake_message(proposal_id, selected_id, db=self.db)

        self.assertEqual([message["content"] for message in payload["messages"]], [first.content, last.content])
        self.assertIsNone(self.db.get(ProposalMessage, selected_id))

    def test_generate_proposal_sets_site_hours_when_gemini_omits_them(self) -> None:
        created = create_intake(AIIntakeCreatePayload(), db=self.db)
        proposal_id = created["id"]

        proposal = self.db.get(Proposal, proposal_id)
        proposal.messages = [
            ProposalMessage(role="user", content="English intake about stairwell and basement corridor."),
            ProposalMessage(role="assistant", content="Please confirm total project hours and access constraints."),
        ]
        self.db.add(proposal)
        self.db.commit()

        gemini_json = """
        {
          "customerCompanyName": "NorthBuild Property Services Ltd",
          "contactName": "Mr. Karim Saleh",
          "contactEmail": "karim.saleh@northbuild.de",
          "summary": "Renovierung eines Wohngebaeudes in Bremen.",
          "orderTitle": "Renovierungsarbeiten Wohngebaeude",
          "orderDescription": "Umfassende Arbeiten in Treppenhaus und Kellerflur.",
          "proposedSites": [
            {
              "siteName": "Treppenhaus",
              "street": "Humboldtstra??e 18",
              "zipCode": "28203",
              "city": "Bremen",
              "requiredSkills": ["painting", "filling", "sanding", "drywall repair"],
              "estimatedHours": null
            },
            {
              "siteName": "Basement corridor",
              "street": "Humboldtstra??e 18",
              "zipCode": "28203",
              "city": "Bremen",
              "requiredSkills": ["drywall", "moisture protection", "painting"],
              "estimatedHours": null
            }
          ],
          "requiredSkills": ["painting", "drywall", "moisture protection"],
          "preferredStartDate": "2026-05-06T00:00:00Z",
          "preferredEndDate": "2026-05-20T00:00:00Z",
          "estimatedHours": 120,
          "currency": "EUR"
        }
        """

        with patch("app.services.proposals.generate_text", return_value=gemini_json):
            payload = generate_proposal(proposal_id, db=self.db)

        self.assertEqual(payload["status"], "draft")
        self.assertEqual(payload["estimatedHours"], 120)
        self.assertEqual(len(payload["proposedSites"]), 2)
        self.assertEqual(payload["proposedSites"][0]["estimatedHours"], 60.0)
        self.assertEqual(payload["proposedSites"][1]["estimatedHours"], 60.0)

    def test_transcribe_audio_returns_transcript_without_persisting_message(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Voice intake"), db=self.db)
        proposal_id = created["id"]
        upload = _upload_file(_wav_bytes())

        with patch("app.routers.ai.transcribe_audio", return_value={"transcript": "Hallo aus Bremen", "provider": "assemblyai"}):
            payload = asyncio.run(transcribe_intake_audio(proposal_id, audio=upload, locale_hint="de", db=self.db))

        self.assertEqual(payload["transcript"], "Hallo aus Bremen")
        self.assertEqual(payload["provider"], "assemblyai")
        self.assertGreater(payload["durationMs"], 0)

        messages = self.db.scalars(select(ProposalMessage).where(ProposalMessage.proposal_id == proposal_id)).all()
        self.assertEqual(messages, [])

    def test_transcribe_audio_rejects_unsupported_content_type(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Voice intake"), db=self.db)
        proposal_id = created["id"]
        upload = _upload_file(b"plain text", content_type="text/plain", filename="clip.txt")

        with self.assertRaises(HTTPException) as exc:
            asyncio.run(transcribe_intake_audio(proposal_id, audio=upload, locale_hint="de", db=self.db))

        self.assertEqual(exc.exception.status_code, 415)

    def test_transcribe_audio_rejects_recordings_over_duration_limit(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Voice intake"), db=self.db)
        proposal_id = created["id"]
        upload = _upload_file(_wav_bytes(duration_ms=91_000))

        with self.assertRaises(HTTPException) as exc:
            asyncio.run(transcribe_intake_audio(proposal_id, audio=upload, locale_hint="de", db=self.db))

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIn("90 Sekunden", exc.exception.detail)

    def test_transcribe_audio_rejects_empty_transcript(self) -> None:
        created = create_intake(AIIntakeCreatePayload(orderTitle="Voice intake"), db=self.db)
        proposal_id = created["id"]
        upload = _upload_file(_wav_bytes())

        with patch(
            "app.routers.ai.transcribe_audio",
            return_value={
                "transcript": "   ",
                "provider": "assemblyai",
                "debugText": "status=completed; languageCode=de; speechModel=universal-3-pro; speechModels=[\"universal-3-pro\", \"universal-2\"]; audioDuration=7500; confidence=None",
            },
        ), self.assertRaises(HTTPException) as exc:
            asyncio.run(transcribe_intake_audio(proposal_id, audio=upload, locale_hint="en", db=self.db))

        self.assertEqual(exc.exception.status_code, 422)
        self.assertIn("Provider-Debug", exc.exception.detail)

    def test_assemblyai_helper_returns_blank_transcript_when_provider_text_is_empty(self) -> None:
        submitted = {"id": "tx-123", "status": "queued"}
        completed = {
            "id": "tx-123",
            "status": "completed",
            "text": "",
            "language_code": "de",
            "speech_model_used": "universal-3-pro",
            "speech_models": ["universal-3-pro", "universal-2"],
            "audio_duration": 7500,
            "confidence": None,
        }
        submitted_retry = {"id": "tx-124", "status": "queued"}
        completed_retry = {
            "id": "tx-124",
            "status": "completed",
            "text": "",
            "language_code": "de",
            "speech_model_used": "universal-2",
            "speech_models": ["universal-3-pro", "universal-2"],
            "audio_duration": 7500,
            "confidence": 0.0,
        }

        with patch('app.services.assemblyai_client.ensure_assemblyai_ready', return_value=('token', 'https://api.assemblyai.com')),              patch('app.services.assemblyai_client._upload_audio', return_value='https://cdn.assemblyai.com/uploaded.wav'),              patch('app.services.assemblyai_client._request_json', side_effect=[submitted, completed, submitted_retry, completed_retry]):
            payload = transcribe_audio(_wav_bytes(), mime_type='audio/wav', locale_hint='de')

        self.assertEqual(payload['transcript'], '')
        self.assertEqual(payload['provider'], 'assemblyai')
        self.assertIn('autodetect=', payload['debugText'])


    def test_assemblyai_helper_retries_with_language_detection_when_hinted_attempt_is_blank(self) -> None:
        submitted_hinted = {"id": "tx-123", "status": "queued"}
        completed_hinted = {
            "id": "tx-123",
            "status": "completed",
            "text": "",
            "language_code": "ar",
            "speech_model_used": "universal-2",
            "speech_models": ["universal-3-pro", "universal-2"],
            "audio_duration": 7500,
            "confidence": 0.0,
        }
        submitted_detected = {"id": "tx-124", "status": "queued"}
        completed_detected = {
            "id": "tx-124",
            "status": "completed",
            "text": "\u0645\u0631\u062d\u0628\u0627 \u0645\u0646 \u0647\u0627\u0645\u0628\u0648\u0631\u063a",
            "language_code": "ar",
            "speech_model_used": "universal-2",
            "speech_models": ["universal-3-pro", "universal-2"],
            "audio_duration": 7500,
            "confidence": 0.84,
        }

        with patch('app.services.assemblyai_client.ensure_assemblyai_ready', return_value=('token', 'https://api.assemblyai.com')),              patch('app.services.assemblyai_client._upload_audio', return_value='https://cdn.assemblyai.com/uploaded.wav'),              patch('app.services.assemblyai_client._request_json', side_effect=[submitted_hinted, completed_hinted, submitted_detected, completed_detected]):
            payload = transcribe_audio(_wav_bytes(), mime_type='audio/wav', locale_hint='ar')

        self.assertEqual(payload['transcript'], '\u0645\u0631\u062d\u0628\u0627 \u0645\u0646 \u0647\u0627\u0645\u0628\u0648\u0631\u063a')
        self.assertEqual(payload['detectedLanguage'], 'ar')
        self.assertIn('autodetect=', payload['debugText'])

    def test_build_proposal_prompt_uses_manager_language_instead_of_forcing_german(self) -> None:
        prompt = build_proposal_prompt(
            [
                ProposalMessage(role='user', content='Please create the proposal in English for the kitchen and bathroom.'),
                ProposalMessage(role='assistant', content='Sure, I will keep collecting details.'),
            ]
        )

        self.assertIn("same language as the manager's conversation", prompt)
        self.assertIn('must be English', prompt)
        self.assertNotIn('Prefer German business wording', prompt)

    def test_generate_proposal_local_fallback_keeps_arabic_defaults(self) -> None:
        created = create_intake(AIIntakeCreatePayload(), db=self.db)
        proposal_id = created['id']

        proposal = self.db.get(Proposal, proposal_id)
        proposal.messages = [
            ProposalMessage(role='user', content='\u0639\u0646\u062f\u064a \u0645\u0634\u0631\u0648\u0639 \u062c\u062f\u064a\u062f \u064a\u0634\u0645\u0644 \u0627\u0644\u0645\u0637\u0628\u062e \u0648\u0627\u0644\u062d\u0645\u0627\u0645 \u0641\u064a \u0647\u0627\u0645\u0628\u0648\u0631\u063a.'),
            ProposalMessage(role='assistant', content='\u0645\u0627 \u0646\u0637\u0627\u0642 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u061f'),
        ]
        self.db.add(proposal)
        self.db.commit()

        with patch('app.services.proposals.generate_text', side_effect=HTTPException(status_code=502, detail='quota')):
            payload = generate_proposal(proposal_id, db=self.db)

        self.assertEqual(payload['orderTitle'], '\u0639\u0631\u0636 \u0645\u0634\u0631\u0648\u0639')
        self.assertTrue(payload['summary'].startswith('\u0639\u0646\u062f\u064a \u0645\u0634\u0631\u0648\u0639 \u062c\u062f\u064a\u062f'))
        self.assertNotEqual(payload['proposedSites'][0]['siteName'], 'Site 1')
        self.assertIn('\u0639', payload['orderTitle'])


if __name__ == "__main__":
    unittest.main()
