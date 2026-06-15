from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys

from sqlalchemy import or_, select


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import SessionLocal, init_db  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    Employee,
    EmployeeAssignment,
    EmployeeAvailabilityBlock,
    EmployeeSkill,
    Invoice,
    InvoiceLine,
    Order,
    Proposal,
    ProposalMessage,
    ProjectIssue,
    ProjectMaterialLog,
    ProjectMonitoringAlert,
    ProjectMonitoringReport,
    ProjectProgressPhoto,
    ProjectProgressUpdate,
    ProjectSiteBaseline,
    ProjectTask,
    Site,
    Workshop,
    WorkshopSiteAssignment,
    WorkEntry,
)


DEMO_TAG = "[demo-seed]"
DEMO_PHOTO_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def utc(year: int, month: int, day: int, hour: int = 8, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def dump_json(value) -> str:
    return json.dumps(value, ensure_ascii=False)


CUSTOMERS = [
    {
        "company_name": "Elbe Immobilien GmbH",
        "street": "Berliner Straße 44",
        "zip_code": "28199",
        "city": "Bremen",
        "country": "DE",
        "vat_id": "DE813456701",
        "contact_name": "Sara Yilmaz",
        "contact_phone": "0160 1112233",
        "contact_email": "sara.yilmaz@elbe-immobilien.de",
        "notes": f"{DEMO_TAG} Testkunde fuer Wohnungs- und Sanierungsauftraege.",
    },
    {
        "company_name": "HanseBau Verwaltung GmbH",
        "street": "Admiralstraße 12",
        "zip_code": "28215",
        "city": "Bremen",
        "country": "DE",
        "vat_id": "DE812345670",
        "contact_name": "Mariam Al Hassan",
        "contact_phone": "0173 8801122",
        "contact_email": "m.alhassan@hansebau-verwaltung.de",
        "notes": f"{DEMO_TAG} Testkunde fuer Treppenhaus-, Keller- und Feuchtigkeitsschutz-Projekte.",
    },
    {
        "company_name": "Weser Office Solutions GmbH",
        "street": "Konsul-Smidt-Straße 8",
        "zip_code": "28217",
        "city": "Bremen",
        "country": "DE",
        "vat_id": "DE811234569",
        "contact_name": "Jonas Becker",
        "contact_phone": "0421 556677",
        "contact_email": "jonas.becker@weser-office.de",
        "notes": f"{DEMO_TAG} Testkunde fuer abgeschlossene Buero-Instandsetzungen.",
    },
]


EMPLOYEES = [
    {
        "first_name": "Ahmad",
        "last_name": "Maler",
        "email": "ahmad.maler@test.local",
        "phone": "0170 1000001",
        "city": "Bremen",
        "street": "Woltmershauser Straße 91",
        "zip_code": "28197",
        "is_active": True,
        "default_hourly_rate": "48",
        "weekly_capacity_hours": "40",
        "skills": ["Malerarbeiten", "Spachteln", "Schleifen"],
        "certifications": [],
        "availability_blocks": [],
    },
    {
        "first_name": "Bilal",
        "last_name": "Trockenbau",
        "email": "bilal.trockenbau@test.local",
        "phone": "0170 1000002",
        "city": "Bremen",
        "street": "Neustadtswall 42",
        "zip_code": "28199",
        "is_active": True,
        "default_hourly_rate": "52",
        "weekly_capacity_hours": "40",
        "skills": ["Trockenbau", "Trockenbau-Reparaturen", "Spachteln"],
        "certifications": [],
        "availability_blocks": [],
    },
    {
        "first_name": "Samir",
        "last_name": "Feuchtigkeit",
        "email": "samir.feuchtigkeit@test.local",
        "phone": "0170 1000003",
        "city": "Bremen",
        "street": "Buntentorsteinweg 119",
        "zip_code": "28201",
        "is_active": True,
        "default_hourly_rate": "55",
        "weekly_capacity_hours": "35",
        "skills": ["Feuchtigkeitsschutz", "Malerarbeiten", "Trockenbau"],
        "certifications": ["SCC"],
        "availability_blocks": [],
    },
    {
        "first_name": "Yousef",
        "last_name": "Allrounder",
        "email": "yousef.allrounder@test.local",
        "phone": "0170 1000004",
        "city": "Bremen",
        "street": "Nordstraße 55",
        "zip_code": "28217",
        "is_active": True,
        "default_hourly_rate": "50",
        "weekly_capacity_hours": "32",
        "skills": ["Malerarbeiten", "Trockenbau", "Schleifen", "Spachteln"],
        "certifications": [],
        "availability_blocks": [],
    },
    {
        "first_name": "Tariq",
        "last_name": "Urlaub",
        "email": "tariq.urlaub@test.local",
        "phone": "0170 1000005",
        "city": "Bremen",
        "street": "Gröpelinger Heerstraße 120",
        "zip_code": "28237",
        "is_active": True,
        "default_hourly_rate": "49",
        "weekly_capacity_hours": "40",
        "skills": ["Malerarbeiten", "Feuchtigkeitsschutz"],
        "certifications": [],
        "availability_blocks": [
            {
                "start_date": utc(2026, 5, 7, 0),
                "end_date": utc(2026, 5, 13, 23, 59),
                "reason": "Urlaub",
            }
        ],
    },
    {
        "first_name": "Noura",
        "last_name": "Elektro",
        "email": "noura.elektro@demo.local",
        "phone": "0170 1000006",
        "city": "Bremen",
        "street": "Findorffstraße 18",
        "zip_code": "28215",
        "is_active": True,
        "default_hourly_rate": "58",
        "weekly_capacity_hours": "38",
        "skills": ["Elektro", "Kleinreparaturen", "Fehlerdiagnose"],
        "certifications": ["Elektrofachkraft"],
        "availability_blocks": [],
    },
    {
        "first_name": "Lina",
        "last_name": "Reinigung",
        "email": "lina.reinigung@demo.local",
        "phone": "0170 1000007",
        "city": "Bremen",
        "street": "Delmestraße 7",
        "zip_code": "28199",
        "is_active": True,
        "default_hourly_rate": "36",
        "weekly_capacity_hours": "30",
        "skills": ["Endreinigung", "Baustellenreinigung"],
        "certifications": [],
        "availability_blocks": [],
    },
    {
        "first_name": "Omar",
        "last_name": "Inaktiv",
        "email": "omar.inaktiv@demo.local",
        "phone": "0170 1000008",
        "city": "Bremen",
        "street": "Hafenstraße 3",
        "zip_code": "28217",
        "is_active": False,
        "default_hourly_rate": "46",
        "weekly_capacity_hours": "40",
        "skills": ["Malerarbeiten", "Trockenbau"],
        "certifications": [],
        "availability_blocks": [],
    },
]


ORDERS = [
    {
        "key": "elbe-renovation",
        "customer_company_name": "Elbe Immobilien GmbH",
        "order_number": "DEMO-ELB-001",
        "title": "Wohnungssanierung Berliner Straße 44",
        "description": f"{DEMO_TAG} Maler-, Bad- und Abschlussarbeiten in einer vermieteten Wohnung.",
        "status": "open",
        "start_date": utc(2026, 5, 5),
        "end_date": utc(2026, 5, 28),
        "default_hourly_rate": "58",
        "currency": "EUR",
        "sites": [
            {
                "site_name": "Wohnung 2. OG",
                "street": "Berliner Straße 44",
                "zip_code": "28199",
                "city": "Bremen",
                "notes": f"{DEMO_TAG} Wohn- und Flurbereich.",
            },
            {
                "site_name": "Badezimmer",
                "street": "Berliner Straße 44",
                "zip_code": "28199",
                "city": "Bremen",
                "notes": f"{DEMO_TAG} Bad mit Teilreparaturen und Endreinigung.",
            },
        ],
    },
    {
        "key": "hansebau-stairwell",
        "customer_company_name": "HanseBau Verwaltung GmbH",
        "order_number": "DEMO-HBV-001",
        "title": "Treppenhaus und Keller Admiralstraße 12",
        "description": f"{DEMO_TAG} Treppenhaus- und Kellergangsanierung mit Feuchtigkeitsschutz.",
        "status": "open",
        "start_date": utc(2026, 5, 6),
        "end_date": utc(2026, 5, 22),
        "default_hourly_rate": "62",
        "currency": "EUR",
        "sites": [
            {
                "site_name": "Treppenhaus",
                "street": "Admiralstraße 12",
                "zip_code": "28215",
                "city": "Bremen",
                "notes": f"{DEMO_TAG} Begehbar waehrend der Arbeiten.",
            },
            {
                "site_name": "Kellergang",
                "street": "Admiralstraße 12",
                "zip_code": "28215",
                "city": "Bremen",
                "notes": f"{DEMO_TAG} Feuchtigkeitsschutz und Trockenbau-Reparaturen.",
            },
        ],
    },
    {
        "key": "weser-office",
        "customer_company_name": "Weser Office Solutions GmbH",
        "order_number": "DEMO-WOS-001",
        "title": "Büroinstandsetzung Konsul-Smidt-Straße",
        "description": f"{DEMO_TAG} Abgeschlossener Referenzauftrag fuer Bueroflaechen.",
        "status": "completed",
        "start_date": utc(2025, 11, 1),
        "end_date": utc(2025, 11, 10),
        "default_hourly_rate": "55",
        "currency": "EUR",
        "sites": [
            {
                "site_name": "Empfang",
                "street": "Konsul-Smidt-Straße 8",
                "zip_code": "28217",
                "city": "Bremen",
                "notes": f"{DEMO_TAG} Empfangsbereich und Zugang.",
            },
            {
                "site_name": "Bürotrakt A",
                "street": "Konsul-Smidt-Straße 8",
                "zip_code": "28217",
                "city": "Bremen",
                "notes": f"{DEMO_TAG} Buero- und Nebenraeume.",
            },
        ],
    },
]


ASSIGNMENTS = [
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "start_date": utc(2026, 5, 5),
        "end_date": utc(2026, 5, 20),
        "notes": f"{DEMO_TAG} Leitender Maler fuer Wohnbereich.",
    },
    {
        "employee_email": "yousef.allrounder@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "start_date": utc(2026, 5, 5),
        "end_date": utc(2026, 5, 20),
        "notes": f"{DEMO_TAG} Unterstuetzung Wohnbereich und Flur.",
    },
    {
        "employee_email": "bilal.trockenbau@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "start_date": utc(2026, 5, 6),
        "end_date": utc(2026, 5, 16),
        "notes": f"{DEMO_TAG} Bad und Trockenbau-Reparaturen.",
    },
    {
        "employee_email": "lina.reinigung@demo.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "start_date": utc(2026, 5, 18),
        "end_date": utc(2026, 5, 22),
        "notes": f"{DEMO_TAG} Abschluss- und Bauendreinigung.",
    },
    {
        "employee_email": "samir.feuchtigkeit@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "start_date": utc(2026, 5, 6),
        "end_date": utc(2026, 5, 20),
        "notes": f"{DEMO_TAG} Feuchtigkeitsschutz und Materialauswahl.",
    },
    {
        "employee_email": "bilal.trockenbau@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "start_date": utc(2026, 5, 6),
        "end_date": utc(2026, 5, 20),
        "notes": f"{DEMO_TAG} Trockenbau- und Reparaturarbeiten Keller.",
    },
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "start_date": utc(2026, 5, 7),
        "end_date": utc(2026, 5, 20),
        "notes": f"{DEMO_TAG} Anstriche Treppenhaus.",
    },
    {
        "employee_email": "tariq.urlaub@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "start_date": utc(2026, 5, 6),
        "end_date": utc(2026, 5, 20),
        "notes": f"{DEMO_TAG} Reservemannschaft, derzeit blockiert.",
    },
    {
        "employee_email": "noura.elektro@demo.local",
        "order_key": "weser-office",
        "site_name": "Empfang",
        "start_date": utc(2025, 11, 1),
        "end_date": utc(2025, 11, 10),
        "notes": f"{DEMO_TAG} Elektro-Nacharbeiten Empfang.",
    },
]


WORK_ENTRIES = [
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "work_date": utc(2026, 5, 6),
        "hours": "8",
        "day_type": "work",
        "description": f"Wandflächen vorbereitet und gespachtelt. {DEMO_TAG}",
        "invoice_group": "elbe-ahmad",
    },
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "work_date": utc(2026, 5, 7),
        "hours": "7.5",
        "day_type": "work",
        "description": f"Erster Weißanstrich im Wohnbereich. {DEMO_TAG}",
        "invoice_group": "elbe-ahmad",
    },
    {
        "employee_email": "bilal.trockenbau@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "work_date": utc(2026, 5, 7),
        "hours": "6",
        "day_type": "work",
        "description": f"Trockenbau-Reparatur am Installationsschacht. {DEMO_TAG}",
        "invoice_group": "elbe-bilal",
    },
    {
        "employee_email": "yousef.allrounder@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "work_date": utc(2026, 5, 8),
        "hours": "8",
        "day_type": "work",
        "description": f"Schleifarbeiten und Nachspachteln im Flur. {DEMO_TAG}",
        "invoice_group": "elbe-yousef",
    },
    {
        "employee_email": "lina.reinigung@demo.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "work_date": utc(2026, 5, 12),
        "hours": "4",
        "day_type": "work",
        "description": f"Endreinigung nach Malerarbeiten. {DEMO_TAG}",
        "invoice_group": "elbe-lina",
    },
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "work_date": utc(2026, 5, 11),
        "hours": "0",
        "day_type": "sick",
        "description": f"Krankmeldung. {DEMO_TAG}",
        "invoice_group": None,
    },
    {
        "employee_email": "samir.feuchtigkeit@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "work_date": utc(2026, 5, 6),
        "hours": "8",
        "day_type": "work",
        "description": f"Feuchtigkeitsschutz-Grundierung im Kellergang aufgetragen. {DEMO_TAG}",
        "invoice_group": "hanse-samir",
    },
    {
        "employee_email": "bilal.trockenbau@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "work_date": utc(2026, 5, 7),
        "hours": "8",
        "day_type": "work",
        "description": f"Trockenbau-Reparaturen an Wandflächen durchgeführt. {DEMO_TAG}",
        "invoice_group": "hanse-bilal",
    },
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "work_date": utc(2026, 5, 8),
        "hours": "6",
        "day_type": "work",
        "description": f"Zweiter Anstrich im Treppenhaus. {DEMO_TAG}",
        "invoice_group": "hanse-ahmad",
    },
    {
        "employee_email": "yousef.allrounder@test.local",
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "work_date": utc(2026, 5, 13),
        "hours": "7",
        "day_type": "work",
        "description": f"Spachtel- und Schleifarbeiten im Treppenhaus. {DEMO_TAG}",
        "invoice_group": "hanse-yousef",
    },
    {
        "employee_email": "lina.reinigung@demo.local",
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "work_date": utc(2026, 5, 14),
        "hours": "0",
        "day_type": "vacation",
        "description": f"Urlaub. {DEMO_TAG}",
        "invoice_group": None,
    },
    {
        "employee_email": "noura.elektro@demo.local",
        "order_key": "weser-office",
        "site_name": "Empfang",
        "work_date": utc(2025, 11, 3),
        "hours": "5",
        "day_type": "work",
        "description": f"Beleuchtung und Steckdosen geprüft. {DEMO_TAG}",
        "invoice_group": "weser-paid",
    },
    {
        "employee_email": "yousef.allrounder@test.local",
        "order_key": "weser-office",
        "site_name": "Empfang",
        "work_date": utc(2025, 11, 3),
        "hours": "7",
        "day_type": "work",
        "description": f"Empfangsbereich gestrichen und ausgebessert. {DEMO_TAG}",
        "invoice_group": "weser-paid",
    },
    {
        "employee_email": "lina.reinigung@demo.local",
        "order_key": "weser-office",
        "site_name": "Bürotrakt A",
        "work_date": utc(2025, 11, 4),
        "hours": "4",
        "day_type": "work",
        "description": f"Baureinigung nach Abschluss der Arbeiten. {DEMO_TAG}",
        "invoice_group": "weser-paid",
    },
    {
        "employee_email": "ahmad.maler@test.local",
        "order_key": "weser-office",
        "site_name": "Bürotrakt A",
        "work_date": utc(2025, 11, 5),
        "hours": "6",
        "day_type": "work",
        "description": f"Wandflächen im Bürotrakt A ausgebessert. {DEMO_TAG}",
        "invoice_group": "weser-paid",
    },
]


WORKSHOPS = [
    {
        "key": "nord-fliesen",
        "name": "Nord Fliesen & Abdichtung",
        "contact_name": "Mehmet Kaya",
        "phone": "0176 22004411",
        "email": "planung@nord-fliesen.demo",
        "specialties": ["Fliesen", "Abdichtung", "Bad"],
        "availability_status": "available",
        "availability_note": "Kapazitaet fuer Badarbeiten diese Woche bestaetigt.",
        "notes": f"{DEMO_TAG} Deutsche Demo-Werkstatt fuer Bad und Abdichtung.",
    },
    {
        "key": "weser-maler",
        "name": "Weser Malerteam GmbH",
        "contact_name": "Klaus Berger",
        "phone": "0421 440077",
        "email": "einsatz@weser-maler.demo",
        "specialties": ["Malerarbeiten", "Spachteln", "Schleifen"],
        "availability_status": "available",
        "availability_note": "Team ist ab 13.05. wieder frei.",
        "notes": f"{DEMO_TAG} Deutsche Demo-Werkstatt fuer Malerarbeiten.",
    },
    {
        "key": "hanse-trockenbau",
        "name": "Hanse Trockenbau Service",
        "contact_name": "Mariam Haddad",
        "phone": "0172 3004550",
        "email": "service@hanse-trockenbau.demo",
        "specialties": ["Trockenbau", "Kellergang", "Feuchtigkeitsschutz"],
        "availability_status": "available",
        "availability_note": "Kellergang ist eingeplant, Materialfreigabe offen.",
        "notes": f"{DEMO_TAG} Deutsche Demo-Werkstatt fuer Trockenbau und Keller.",
    },
    {
        "key": "elektro-bremen",
        "name": "Elektro Bremen Schnellservice",
        "contact_name": "Noura Haddad",
        "phone": "0170 7700990",
        "email": "kontakt@elektro-bremen.demo",
        "specialties": ["Elektro", "Pruefung", "Kleinreparaturen"],
        "availability_status": "unavailable",
        "availability_note": "Bis 15.05. wegen Notdiensteinsatz nicht verfuegbar.",
        "notes": f"{DEMO_TAG} Deutsche Demo-Werkstatt mit Warnstatus fuer Monitoring.",
    },
]


WORKSHOP_ASSIGNMENTS = [
    {
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "workshop_key": "weser-maler",
        "covered_skills": ["Malerarbeiten", "Spachteln", "Schleifen"],
        "start_date": utc(2026, 5, 5),
        "end_date": utc(2026, 5, 18),
        "status": "assigned",
        "notes": f"{DEMO_TAG} Wohnbereich priorisieren, Abschluss vor Kundenabnahme.",
    },
    {
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "workshop_key": "nord-fliesen",
        "covered_skills": ["Fliesen", "Abdichtung", "Bad"],
        "start_date": utc(2026, 5, 8),
        "end_date": utc(2026, 5, 20),
        "status": "assigned",
        "notes": f"{DEMO_TAG} Abdichtung vor Fliesenfreigabe dokumentieren.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "workshop_key": "hanse-trockenbau",
        "covered_skills": ["Trockenbau", "Feuchtigkeitsschutz"],
        "start_date": utc(2026, 5, 6),
        "end_date": utc(2026, 5, 21),
        "status": "assigned",
        "notes": f"{DEMO_TAG} Feuchte Stellen zuerst behandeln, danach Trockenbau schliessen.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "workshop_key": "elektro-bremen",
        "covered_skills": ["Elektro", "Pruefung"],
        "start_date": utc(2026, 5, 12),
        "end_date": utc(2026, 5, 13),
        "status": "assigned",
        "notes": f"{DEMO_TAG} Bewusst nicht verfuegbar, damit Monitoring eine Warnung zeigt.",
    },
]


TRACKING_BASELINES = [
    {
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "planned_start_date": utc(2026, 5, 5),
        "planned_end_date": utc(2026, 5, 18),
        "baseline_status": "confirmed",
        "source": "manual",
        "notes": f"{DEMO_TAG} Geplanter Abschluss Wohnbereich vor Bad-Endmontage.",
    },
    {
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "planned_start_date": utc(2026, 5, 8),
        "planned_end_date": utc(2026, 5, 20),
        "baseline_status": "confirmed",
        "source": "manual",
        "notes": f"{DEMO_TAG} Bad ist kritisch wegen Abdichtung und Materialfreigabe.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "planned_start_date": utc(2026, 5, 6),
        "planned_end_date": utc(2026, 5, 18),
        "baseline_status": "confirmed",
        "source": "manual",
        "notes": f"{DEMO_TAG} Treppenhaus muss waehrend der Arbeiten begehbar bleiben.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "planned_start_date": utc(2026, 5, 6),
        "planned_end_date": utc(2026, 5, 22),
        "baseline_status": "confirmed",
        "source": "manual",
        "notes": f"{DEMO_TAG} Monitoring-Demo mit Risiko durch Feuchtigkeit und Material.",
    },
]


TRACKING_UPDATES = [
    {
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "title": "Wohnbereich vorbereitet",
        "description": f"{DEMO_TAG} Spachtel- und Schleifarbeiten abgeschlossen, erster Anstrich gestartet.",
        "status": "in_progress",
        "progress_percent": 58,
        "next_action": "Zweiten Anstrich bis Freitag abschliessen und danach Endreinigung einplanen.",
        "update_date": utc(2026, 5, 12, 15),
        "photos": [
            {"filename": "wohnzimmer-fortschritt.png", "tag": "during", "caption": "Wohnbereich nach dem ersten Anstrich."}
        ],
    },
    {
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "title": "Bad wartet auf Abdichtungsmaterial",
        "description": f"{DEMO_TAG} Trockenbau ist geschlossen, Abdichtungsmaterial fehlt noch.",
        "status": "waiting_materials",
        "progress_percent": 35,
        "next_action": "Materiallieferung bestaetigen und Abdichtung fotografisch dokumentieren.",
        "update_date": utc(2026, 5, 13, 14),
        "photos": [
            {"filename": "bad-material-wartet.png", "tag": "issue", "caption": "Badbereich vor Abdichtung, Material noch offen."}
        ],
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "title": "Feuchtigkeit im Kellergang sichtbar",
        "description": f"{DEMO_TAG} Grundierung begonnen, Wandbereich bleibt stellenweise feucht.",
        "status": "blocked",
        "progress_percent": 28,
        "next_action": "Feuchtepruefung wiederholen und Materialfreigabe vom Kunden einholen.",
        "update_date": utc(2026, 5, 14, 10),
        "photos": [
            {"filename": "kellergang-feuchte.png", "tag": "issue", "caption": "Feuchter Wandbereich im Kellergang."}
        ],
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "title": "Treppenhaus teilweise fertig",
        "description": f"{DEMO_TAG} Zweiter Anstrich in unteren Etagen fertig, Elektropruefung offen.",
        "status": "needs_review",
        "progress_percent": 62,
        "next_action": "Elektropruefung neu terminieren und Restarbeiten oben abschliessen.",
        "update_date": utc(2026, 5, 14, 16),
        "photos": [
            {"filename": "treppenhaus-anstrich.png", "tag": "during", "caption": "Treppenhaus nach zweitem Anstrich."}
        ],
    },
]


TRACKING_TASKS = [
    {
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "task_name": "Zweiter Anstrich Wohnbereich",
        "status": "in_progress",
        "weight_percent": "35",
        "progress_percent": 70,
        "responsible_type": "workshop",
        "responsible_name": "Weser Malerteam GmbH",
        "due_date": utc(2026, 5, 15),
        "notes": f"{DEMO_TAG} Restarbeiten an Fensterlaibungen pruefen.",
    },
    {
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "task_name": "Endreinigung Wohnbereich",
        "status": "not_started",
        "weight_percent": "15",
        "progress_percent": 0,
        "responsible_type": "workshop",
        "responsible_name": "Lina Reinigung",
        "due_date": utc(2026, 5, 19),
        "notes": f"{DEMO_TAG} Start erst nach Malerabnahme.",
    },
    {
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "task_name": "Abdichtung Bad dokumentieren",
        "status": "in_progress",
        "weight_percent": "30",
        "progress_percent": 25,
        "responsible_type": "workshop",
        "responsible_name": "Nord Fliesen & Abdichtung",
        "due_date": utc(2026, 5, 12),
        "notes": f"{DEMO_TAG} Ueberfaellig fuer Warnungs-Demo.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "task_name": "Feuchtigkeitsschutz zweite Lage",
        "status": "in_progress",
        "weight_percent": "45",
        "progress_percent": 30,
        "responsible_type": "workshop",
        "responsible_name": "Hanse Trockenbau Service",
        "due_date": utc(2026, 5, 13),
        "notes": f"{DEMO_TAG} Kritisch fuer KI-Monitoring.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "task_name": "Elektropruefung Treppenhaus",
        "status": "not_started",
        "weight_percent": "20",
        "progress_percent": 0,
        "responsible_type": "workshop",
        "responsible_name": "Elektro Bremen Schnellservice",
        "due_date": utc(2026, 5, 13),
        "notes": f"{DEMO_TAG} Werkstatt nicht verfuegbar.",
    },
]


TRACKING_ISSUES = [
    {
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "title": "Abdichtungsmaterial fehlt",
        "description": f"{DEMO_TAG} Lieferung nicht bestaetigt, Bad kann ohne Material nicht weiterlaufen.",
        "severity": "high",
        "status": "open",
        "responsible_type": "workshop",
        "responsible_name": "Nord Fliesen & Abdichtung",
        "resolution_note": None,
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "title": "Feuchte Stelle blockiert Trockenbau",
        "description": f"{DEMO_TAG} Untergrund bleibt feucht, zweite Lage muss warten.",
        "severity": "high",
        "status": "open",
        "responsible_type": "workshop",
        "responsible_name": "Hanse Trockenbau Service",
        "resolution_note": None,
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Treppenhaus",
        "title": "Elektropruefung muss neu terminiert werden",
        "description": f"{DEMO_TAG} Eingeteilte Werkstatt ist aktuell nicht verfuegbar.",
        "severity": "medium",
        "status": "in_progress",
        "responsible_type": "workshop",
        "responsible_name": "Elektro Bremen Schnellservice",
        "resolution_note": "Alternativtermin wird mit Kunde abgestimmt.",
    },
]


TRACKING_MATERIALS = [
    {
        "order_key": "elbe-renovation",
        "site_name": "Badezimmer",
        "material_name": "Dichtband und Fluessigfolie",
        "quantity": "12 m Dichtband, 2 Eimer",
        "status": "ordered",
        "notes": f"{DEMO_TAG} Lieferstatus offen, beeinflusst Bad-Fortschritt.",
    },
    {
        "order_key": "elbe-renovation",
        "site_name": "Wohnung 2. OG",
        "material_name": "Dispersionsfarbe weiss",
        "quantity": "4 Eimer",
        "status": "delivered",
        "notes": f"{DEMO_TAG} Reicht fuer zweiten Anstrich.",
    },
    {
        "order_key": "hansebau-stairwell",
        "site_name": "Kellergang",
        "material_name": "Feuchtigkeitssperre",
        "quantity": "3 Kanister",
        "status": "needed",
        "notes": f"{DEMO_TAG} Muss vor Fortsetzung freigegeben werden.",
    },
]


MONITORING_REPORTS = [
    {
        "order_key": "elbe-renovation",
        "provider": "demo",
        "health_status": "at_risk",
        "summary": "Badbereich ist gefaehrdet, weil Abdichtungsmaterial fehlt und eine Aufgabe ueberfaellig ist. Wohnbereich liegt weitgehend im Plan.",
        "analysis": {
            "provider": "demo",
            "healthStatus": "at_risk",
            "summary": "Badbereich ist gefaehrdet, weil Abdichtungsmaterial fehlt und eine Aufgabe ueberfaellig ist. Wohnbereich liegt weitgehend im Plan.",
            "risks": [
                {"title": "Materialrisiko Bad", "severity": "high", "siteName": "Badezimmer", "reason": "Abdichtungsmaterial ist noch nicht geliefert."}
            ],
            "delays": [
                {"siteName": "Badezimmer", "reason": "Abdichtung kann nicht starten.", "impact": "Fliesenarbeiten verschieben sich."}
            ],
            "missingInformation": ["Liefertermin fuer Dichtband und Fluessigfolie fehlt."],
            "recommendedActions": [
                {"priority": "high", "siteName": "Badezimmer", "action": "Liefertermin klaeren und Ersatzmaterial pruefen."}
            ],
            "assumptions": ["Analyse basiert auf Demo-Trackingdaten."],
        },
        "warnings": [
            {"type": "high_issue", "severity": "high", "message": "Abdichtungsmaterial fehlt", "siteName": "Badezimmer"}
        ],
    },
    {
        "order_key": "hansebau-stairwell",
        "provider": "demo",
        "health_status": "blocked",
        "summary": "Kellergang ist blockiert und das Treppenhaus hat ein Terminrisiko wegen nicht verfuegbarer Elektro-Werkstatt.",
        "analysis": {
            "provider": "demo",
            "healthStatus": "blocked",
            "summary": "Kellergang ist blockiert und das Treppenhaus hat ein Terminrisiko wegen nicht verfuegbarer Elektro-Werkstatt.",
            "risks": [
                {"title": "Blocker Kellergang", "severity": "high", "siteName": "Kellergang", "reason": "Feuchte Stelle verhindert Trockenbau-Fortsetzung."},
                {"title": "Werkstatt nicht verfuegbar", "severity": "medium", "siteName": "Treppenhaus", "reason": "Elektro-Werkstatt ist aktuell nicht verfuegbar."},
            ],
            "delays": [
                {"siteName": "Kellergang", "reason": "Feuchtigkeitsschutz braucht Freigabe.", "impact": "Fertigstellung kann sich verschieben."}
            ],
            "missingInformation": ["Neuer Termin fuer Elektropruefung fehlt."],
            "recommendedActions": [
                {"priority": "high", "siteName": "Kellergang", "action": "Feuchtepruefung wiederholen und Freigabe dokumentieren."},
                {"priority": "medium", "siteName": "Treppenhaus", "action": "Alternative Elektro-Werkstatt oder Ersatztermin festlegen."},
            ],
            "assumptions": ["Analyse basiert auf Demo-Trackingdaten."],
        },
        "warnings": [
            {"type": "blocked_site", "severity": "high", "message": "Kellergang ist blockiert", "siteName": "Kellergang"},
            {"type": "workshop_unavailable", "severity": "high", "message": "Elektro-Werkstatt ist nicht verfuegbar", "siteName": "Treppenhaus"},
        ],
    },
]


PROPOSALS = [
    {
        "status": "reviewed",
        "customer_company_name": "Aster Wohnbau GmbH",
        "customer_street": "Lindenweg 7",
        "customer_zip_code": "28203",
        "customer_city": "Bremen",
        "customer_country": "DE",
        "contact_name": "Nadia Osman",
        "contact_phone": "0171 3300445",
        "contact_email": "nadia.osman@demo.local",
        "summary": f"Treppenhaussanierung mit Maler- und Trockenbauarbeiten. {DEMO_TAG}",
        "order_title": "Treppenhaussanierung Lindenweg 7",
        "order_description": "Sanierung des Treppenhauses mit Spachtel-, Schleif- und Anstricharbeiten in einem bewohnten Gebäude.",
        "proposed_sites": [
            {
                "siteName": "Treppenhaus",
                "street": "Lindenweg 7",
                "zipCode": "28203",
                "city": "Bremen",
                "notes": "Treppenhaus muss tagsüber begehbar bleiben.",
                "requiredSkills": ["Malerarbeiten", "Spachteln", "Schleifen", "Trockenbau-Reparaturen"],
                "requiredCertifications": [],
                "estimatedHours": 96,
            }
        ],
        "required_skills": ["Malerarbeiten", "Spachteln", "Schleifen", "Trockenbau-Reparaturen"],
        "required_certifications": [],
        "preferred_start_date": utc(2026, 6, 2),
        "preferred_end_date": utc(2026, 6, 16),
        "estimated_hours": "96",
        "estimated_price": "5088",
        "currency": "EUR",
        "recommended_team": {"sites": [{"siteIndex": 0, "employeeNames": ["Ahmad Maler", "Yousef Allrounder"]}]},
        "messages": [
            ("user", "Neuer Kunde fuer eine Treppenhaussanierung in Bremen."),
            ("assistant", "Welche Arbeiten, Termine und Flaechen sind vorgesehen?"),
            ("user", "Malerarbeiten, Spachteln und kleinere Trockenbau-Reparaturen. Ca. 96 Stunden im Juni."),
        ],
    },
    {
        "status": "converted",
        "customer_company_name": "Elbe Immobilien GmbH",
        "customer_street": "Berliner Straße 44",
        "customer_zip_code": "28199",
        "customer_city": "Bremen",
        "customer_country": "DE",
        "contact_name": "Sara Yilmaz",
        "contact_phone": "0160 1112233",
        "contact_email": "seed-converted@demo.local",
        "summary": f"Konvertierter Demo-Vorschlag fuer Wohnungssanierung. {DEMO_TAG}",
        "order_title": "Wohnungssanierung Berliner Straße 44",
        "order_description": "Bereits in einen Auftrag ueberfuehrt.",
        "proposed_sites": [
            {
                "siteName": "Wohnung 2. OG",
                "street": "Berliner Straße 44",
                "zipCode": "28199",
                "city": "Bremen",
                "notes": "Wohn- und Flurbereich.",
                "requiredSkills": ["Malerarbeiten", "Spachteln", "Schleifen"],
                "requiredCertifications": [],
                "estimatedHours": 72,
            }
        ],
        "required_skills": ["Malerarbeiten", "Spachteln", "Schleifen"],
        "required_certifications": [],
        "preferred_start_date": utc(2026, 5, 5),
        "preferred_end_date": utc(2026, 5, 28),
        "estimated_hours": "72",
        "estimated_price": "4176",
        "currency": "EUR",
        "recommended_team": {"sites": [{"siteIndex": 0, "employeeNames": ["Ahmad Maler", "Yousef Allrounder"]}]},
        "messages": [
            ("user", "Bitte Wohnungssanierung fuer Berliner Straße 44 anlegen."),
            ("assistant", "Vorschlag wurde erstellt und in einen Auftrag ueberfuehrt."),
        ],
    },
]


def get_or_create_customer(db, payload: dict) -> Customer:
    item = db.execute(select(Customer).where(Customer.company_name == payload["company_name"])).scalar_one_or_none()
    if item is None:
        item = Customer(company_name=payload["company_name"])
        db.add(item)
    item.street = payload["street"]
    item.zip_code = payload["zip_code"]
    item.city = payload["city"]
    item.country = payload["country"]
    item.vat_id = payload["vat_id"]
    item.contact_name = payload["contact_name"]
    item.contact_phone = payload["contact_phone"]
    item.contact_email = payload["contact_email"]
    item.notes = payload["notes"]
    return item


def get_or_create_employee(db, payload: dict) -> Employee:
    item = db.execute(select(Employee).where(Employee.email == payload["email"])).scalar_one_or_none()
    if item is None:
        item = Employee(email=payload["email"])
        db.add(item)
    item.first_name = payload["first_name"]
    item.last_name = payload["last_name"]
    item.phone = payload["phone"]
    item.city = payload["city"]
    item.street = payload["street"]
    item.zip_code = payload["zip_code"]
    item.is_active = payload["is_active"]
    item.default_hourly_rate = Decimal(payload["default_hourly_rate"])
    item.weekly_capacity_hours = Decimal(payload["weekly_capacity_hours"])

    existing_skills = db.scalars(select(EmployeeSkill).where(EmployeeSkill.employee_id == item.id)).all() if item.id else []
    for record in existing_skills:
        db.delete(record)

    existing_blocks = (
        db.scalars(select(EmployeeAvailabilityBlock).where(EmployeeAvailabilityBlock.employee_id == item.id)).all()
        if item.id
        else []
    )
    for block in existing_blocks:
        db.delete(block)
    db.flush()

    for skill_name in payload["skills"]:
        item.skill_records.append(EmployeeSkill(kind="skill", name=skill_name))
    for cert_name in payload["certifications"]:
        item.skill_records.append(EmployeeSkill(kind="certification", name=cert_name))
    for block in payload["availability_blocks"]:
        item.availability_blocks.append(
            EmployeeAvailabilityBlock(
                start_date=block["start_date"],
                end_date=block["end_date"],
                reason=block["reason"],
            )
        )
    return item


def get_or_create_order(db, customer: Customer, payload: dict) -> Order:
    item = db.execute(select(Order).where(Order.order_number == payload["order_number"])).scalar_one_or_none()
    if item is None:
        item = Order(order_number=payload["order_number"])
        db.add(item)
    item.customer_id = customer.id
    item.title = payload["title"]
    item.description = payload["description"]
    item.status = payload["status"]
    item.start_date = payload["start_date"]
    item.end_date = payload["end_date"]
    item.default_hourly_rate = Decimal(payload["default_hourly_rate"])
    item.currency = payload["currency"]
    return item


def get_or_create_site(db, order: Order, payload: dict) -> Site:
    item = db.execute(
        select(Site).where(Site.order_id == order.id).where(Site.site_name == payload["site_name"])
    ).scalar_one_or_none()
    if item is None:
        item = Site(order_id=order.id, site_name=payload["site_name"])
        db.add(item)
    item.street = payload["street"]
    item.zip_code = payload["zip_code"]
    item.city = payload["city"]
    item.notes = payload["notes"]
    item.is_active = True
    return item


def cleanup_demo_records(db) -> None:
    demo_alerts = db.scalars(select(ProjectMonitoringAlert).where(ProjectMonitoringAlert.message.contains(DEMO_TAG))).all()
    for item in demo_alerts:
        db.delete(item)

    demo_reports = db.scalars(select(ProjectMonitoringReport).where(ProjectMonitoringReport.summary.contains(DEMO_TAG))).all()
    for item in demo_reports:
        db.delete(item)

    demo_photos = db.scalars(select(ProjectProgressPhoto).where(ProjectProgressPhoto.caption.contains(DEMO_TAG))).all()
    for item in demo_photos:
        try:
            path = Path(item.storage_path)
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            pass
        db.delete(item)

    demo_updates = db.scalars(select(ProjectProgressUpdate).where(ProjectProgressUpdate.description.contains(DEMO_TAG))).all()
    for item in demo_updates:
        db.delete(item)

    demo_tasks = db.scalars(select(ProjectTask).where(ProjectTask.notes.contains(DEMO_TAG))).all()
    for item in demo_tasks:
        db.delete(item)

    demo_issues = db.scalars(select(ProjectIssue).where(ProjectIssue.description.contains(DEMO_TAG))).all()
    for item in demo_issues:
        db.delete(item)

    demo_materials = db.scalars(select(ProjectMaterialLog).where(ProjectMaterialLog.notes.contains(DEMO_TAG))).all()
    for item in demo_materials:
        db.delete(item)

    demo_baselines = db.scalars(select(ProjectSiteBaseline).where(ProjectSiteBaseline.notes.contains(DEMO_TAG))).all()
    for item in demo_baselines:
        db.delete(item)

    demo_workshop_assignments = db.scalars(select(WorkshopSiteAssignment).where(WorkshopSiteAssignment.notes.contains(DEMO_TAG))).all()
    for item in demo_workshop_assignments:
        db.delete(item)

    demo_workshops = db.scalars(select(Workshop).where(Workshop.notes.contains(DEMO_TAG))).all()
    for item in demo_workshops:
        db.delete(item)

    demo_lines = db.scalars(
        select(InvoiceLine).join(WorkEntry, InvoiceLine.work_entry_id == WorkEntry.id).where(WorkEntry.description.contains(DEMO_TAG))
    ).all()
    for line in demo_lines:
        db.delete(line)

    demo_work_entries = db.scalars(select(WorkEntry).where(WorkEntry.description.contains(DEMO_TAG))).all()
    for item in demo_work_entries:
        db.delete(item)

    demo_invoices = db.scalars(select(Invoice).where(Invoice.notes.contains(DEMO_TAG))).all()
    for invoice in demo_invoices:
        remaining_lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id)).all()
        for line in remaining_lines:
            db.delete(line)
        db.delete(invoice)

    demo_assignments = db.scalars(select(EmployeeAssignment).where(EmployeeAssignment.notes.contains(DEMO_TAG))).all()
    for item in demo_assignments:
        db.delete(item)

    demo_proposals = db.scalars(
        select(Proposal).where(
            or_(
                Proposal.contact_email.like("%@demo.local"),
                Proposal.summary.contains(DEMO_TAG),
            )
        )
    ).all()
    for item in demo_proposals:
        db.delete(item)

    db.flush()


def get_or_create_workshop(db, payload: dict) -> Workshop:
    item = db.execute(select(Workshop).where(Workshop.name == payload["name"])).scalar_one_or_none()
    if item is None:
        item = Workshop(name=payload["name"])
        db.add(item)
    item.contact_name = payload["contact_name"]
    item.phone = payload["phone"]
    item.email = payload["email"]
    item.specialties_json = dump_json(payload["specialties"])
    item.availability_status = payload["availability_status"]
    item.availability_note = payload["availability_note"]
    item.notes = payload["notes"]
    item.is_active = True
    return item


def create_assignment(db, employee: Employee, site: Site, payload: dict) -> None:
    db.add(
        EmployeeAssignment(
            employee_id=employee.id,
            site_id=site.id,
            start_date=payload["start_date"],
            end_date=payload["end_date"],
            notes=payload["notes"],
        )
    )


def create_workshop_assignment(db, order: Order, site: Site, workshop: Workshop, payload: dict) -> None:
    db.add(
        WorkshopSiteAssignment(
            order_id=order.id,
            site_id=site.id,
            workshop_id=workshop.id,
            covered_skills_json=dump_json(payload["covered_skills"]),
            start_date=payload["start_date"],
            end_date=payload["end_date"],
            status=payload["status"],
            notes=payload["notes"],
        )
    )


def create_tracking_baseline(db, order: Order, site: Site, payload: dict) -> None:
    db.add(
        ProjectSiteBaseline(
            order_id=order.id,
            site_id=site.id,
            planned_start_date=payload["planned_start_date"],
            planned_end_date=payload["planned_end_date"],
            baseline_status=payload["baseline_status"],
            source=payload["source"],
            notes=payload["notes"],
        )
    )


def create_demo_photo(update: ProjectProgressUpdate, payload: dict) -> ProjectProgressPhoto:
    target_dir = ROOT / "uploads" / "project-progress" / update.order_id / update.id
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = payload["filename"]
    storage_path = target_dir / filename
    storage_path.write_bytes(DEMO_PHOTO_BYTES)
    return ProjectProgressPhoto(
        update_id=update.id,
        original_filename=filename,
        stored_filename=filename,
        content_type="image/png",
        size_bytes=len(DEMO_PHOTO_BYTES),
        storage_path=str(storage_path),
        tag=payload["tag"],
        caption=f'{payload["caption"]} {DEMO_TAG}',
    )


def create_tracking_update(db, order: Order, site: Site, payload: dict) -> None:
    item = ProjectProgressUpdate(
        order_id=order.id,
        site_id=site.id,
        title=payload["title"],
        description=payload["description"],
        status=payload["status"],
        progress_percent=payload["progress_percent"],
        next_action=payload["next_action"],
        update_date=payload["update_date"],
    )
    db.add(item)
    db.flush()
    for photo_payload in payload["photos"]:
        db.add(create_demo_photo(item, photo_payload))


def create_tracking_task(db, order: Order, site: Site, payload: dict) -> None:
    db.add(
        ProjectTask(
            order_id=order.id,
            site_id=site.id,
            task_name=payload["task_name"],
            status=payload["status"],
            weight_percent=Decimal(payload["weight_percent"]),
            progress_percent=payload["progress_percent"],
            responsible_type=payload["responsible_type"],
            responsible_name=payload["responsible_name"],
            due_date=payload["due_date"],
            notes=payload["notes"],
        )
    )


def create_tracking_issue(db, order: Order, site: Site, payload: dict) -> None:
    db.add(
        ProjectIssue(
            order_id=order.id,
            site_id=site.id,
            title=payload["title"],
            description=payload["description"],
            severity=payload["severity"],
            status=payload["status"],
            responsible_type=payload["responsible_type"],
            responsible_name=payload["responsible_name"],
            resolution_note=payload["resolution_note"],
        )
    )


def create_tracking_material(db, order: Order, site: Site, payload: dict) -> None:
    db.add(
        ProjectMaterialLog(
            order_id=order.id,
            site_id=site.id,
            material_name=payload["material_name"],
            quantity=payload["quantity"],
            status=payload["status"],
            notes=payload["notes"],
        )
    )


def create_monitoring_report(db, order: Order, payload: dict) -> None:
    summary = f'{payload["summary"]} {DEMO_TAG}'
    db.add(
        ProjectMonitoringReport(
            order_id=order.id,
            provider=payload["provider"],
            health_status=payload["health_status"],
            summary=summary,
            analysis_json=dump_json(payload["analysis"]),
            warnings_json=dump_json(payload["warnings"]),
        )
    )
    for warning in payload["warnings"]:
        site_name = warning.get("siteName")
        site = next((candidate for candidate in order.sites if candidate.site_name == site_name), None) if site_name else None
        db.add(
            ProjectMonitoringAlert(
                order_id=order.id,
                site_id=site.id if site else None,
                alert_type=warning["type"],
                severity=warning["severity"],
                status="open",
                message=f'{warning["message"]} {DEMO_TAG}',
                recommended_action=warning.get("recommendedAction") or "Bitte im Tracking pruefen und naechste Aktion dokumentieren.",
                source="demo_seed",
            )
        )


def create_work_entry(db, employee: Employee, order: Order, site: Site, payload: dict) -> WorkEntry:
    item = WorkEntry(
        work_date=payload["work_date"],
        employee_id=employee.id,
        order_id=order.id,
        site_id=site.id,
        hours=Decimal(payload["hours"]),
        day_type=payload["day_type"],
        is_sick=payload["day_type"] == "sick",
        description=payload["description"],
    )
    db.add(item)
    db.flush()
    return item


def compute_rate(order: Order, employee: Employee) -> Decimal:
    return Decimal(str(order.default_hourly_rate or employee.default_hourly_rate or 0))


def create_draft_invoice(db, customer: Customer, key: str, entries: list[WorkEntry], employees_by_id: dict[str, Employee], orders_by_id: dict[str, Order]) -> None:
    invoice = Invoice(
        status="draft",
        customer_id=customer.id,
        period_start=min(entry.work_date for entry in entries),
        period_end=max(entry.work_date for entry in entries),
        notes=f"{DEMO_TAG} Draft invoice group {key}",
    )
    db.add(invoice)
    db.flush()

    for entry in entries:
        employee = employees_by_id[entry.employee_id]
        order = orders_by_id[entry.order_id]
        rate = compute_rate(order, employee)
        hours = Decimal(str(entry.hours))
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                work_entry_id=entry.id,
                service_date=entry.work_date,
                description=entry.description,
                hours_allocated=hours,
                unit_rate=rate,
                line_amount=rate * hours,
            )
        )


def create_paid_invoice(db, customer: Customer, entries: list[WorkEntry], employees_by_id: dict[str, Employee], orders_by_id: dict[str, Order]) -> None:
    invoice = Invoice(
        invoice_number="RE 25-0901",
        status="paid",
        customer_id=customer.id,
        issue_date=utc(2025, 11, 10),
        period_start=min(entry.work_date for entry in entries),
        period_end=max(entry.work_date for entry in entries),
        notes=f"{DEMO_TAG} Paid reference invoice for completed office project",
    )
    db.add(invoice)
    db.flush()

    for entry in entries:
        employee = employees_by_id[entry.employee_id]
        order = orders_by_id[entry.order_id]
        rate = compute_rate(order, employee)
        hours = Decimal(str(entry.hours))
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                work_entry_id=entry.id,
                service_date=entry.work_date,
                description=entry.description,
                hours_allocated=hours,
                unit_rate=rate,
                line_amount=rate * hours,
            )
        )


def create_proposals(db, customers_by_name: dict[str, Customer], orders_by_key: dict[str, Order]) -> None:
    for payload in PROPOSALS:
        item = Proposal(
            status=payload["status"],
            customer_company_name=payload["customer_company_name"],
            customer_street=payload["customer_street"],
            customer_zip_code=payload["customer_zip_code"],
            customer_city=payload["customer_city"],
            customer_country=payload["customer_country"],
            contact_name=payload["contact_name"],
            contact_phone=payload["contact_phone"],
            contact_email=payload["contact_email"],
            summary=payload["summary"],
            order_title=payload["order_title"],
            order_description=payload["order_description"],
            proposed_sites_json=dump_json(payload["proposed_sites"]),
            required_skills_json=dump_json(payload["required_skills"]),
            required_certifications_json=dump_json(payload["required_certifications"]),
            preferred_start_date=payload["preferred_start_date"],
            preferred_end_date=payload["preferred_end_date"],
            estimated_hours=Decimal(payload["estimated_hours"]),
            estimated_price=Decimal(payload["estimated_price"]),
            currency=payload["currency"],
            recommended_team_json=dump_json(payload["recommended_team"]),
        )
        if payload["status"] == "converted":
            customer = customers_by_name["Elbe Immobilien GmbH"]
            order = orders_by_key["elbe-renovation"]
            item.converted_customer_id = customer.id
            item.converted_order_id = order.id
        db.add(item)
        db.flush()

        for role, content in payload["messages"]:
            db.add(ProposalMessage(proposal_id=item.id, role=role, content=content))


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        cleanup_demo_records(db)

        customers_by_name: dict[str, Customer] = {}
        for payload in CUSTOMERS:
            customer = get_or_create_customer(db, payload)
            db.flush()
            customers_by_name[payload["company_name"]] = customer

        employees_by_email: dict[str, Employee] = {}
        for payload in EMPLOYEES:
            employee = get_or_create_employee(db, payload)
            db.flush()
            employees_by_email[payload["email"]] = employee

        orders_by_key: dict[str, Order] = {}
        sites_by_key: dict[tuple[str, str], Site] = {}
        for payload in ORDERS:
            order = get_or_create_order(db, customers_by_name[payload["customer_company_name"]], payload)
            db.flush()
            orders_by_key[payload["key"]] = order
            for site_payload in payload["sites"]:
                site = get_or_create_site(db, order, site_payload)
                db.flush()
                sites_by_key[(payload["key"], site_payload["site_name"])] = site

        workshops_by_key: dict[str, Workshop] = {}
        for payload in WORKSHOPS:
            workshop = get_or_create_workshop(db, payload)
            db.flush()
            workshops_by_key[payload["key"]] = workshop

        for payload in ASSIGNMENTS:
            create_assignment(
                db,
                employees_by_email[payload["employee_email"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                payload,
            )
        db.flush()

        for payload in WORKSHOP_ASSIGNMENTS:
            create_workshop_assignment(
                db,
                orders_by_key[payload["order_key"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                workshops_by_key[payload["workshop_key"]],
                payload,
            )
        db.flush()

        work_entries_by_group: dict[str, list[WorkEntry]] = {}
        employees_by_id = {employee.id: employee for employee in employees_by_email.values()}
        orders_by_id = {order.id: order for order in orders_by_key.values()}
        for payload in WORK_ENTRIES:
            employee = employees_by_email[payload["employee_email"]]
            order = orders_by_key[payload["order_key"]]
            site = sites_by_key[(payload["order_key"], payload["site_name"])]
            entry = create_work_entry(db, employee, order, site, payload)
            group = payload["invoice_group"]
            if group:
                work_entries_by_group.setdefault(group, []).append(entry)

        create_draft_invoice(
            db,
            customers_by_name["Elbe Immobilien GmbH"],
            "elbe-ahmad",
            work_entries_by_group["elbe-ahmad"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["Elbe Immobilien GmbH"],
            "elbe-bilal",
            work_entries_by_group["elbe-bilal"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["Elbe Immobilien GmbH"],
            "elbe-yousef",
            work_entries_by_group["elbe-yousef"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["Elbe Immobilien GmbH"],
            "elbe-lina",
            work_entries_by_group["elbe-lina"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["HanseBau Verwaltung GmbH"],
            "hanse-samir",
            work_entries_by_group["hanse-samir"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["HanseBau Verwaltung GmbH"],
            "hanse-bilal",
            work_entries_by_group["hanse-bilal"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["HanseBau Verwaltung GmbH"],
            "hanse-ahmad",
            work_entries_by_group["hanse-ahmad"],
            employees_by_id,
            orders_by_id,
        )
        create_draft_invoice(
            db,
            customers_by_name["HanseBau Verwaltung GmbH"],
            "hanse-yousef",
            work_entries_by_group["hanse-yousef"],
            employees_by_id,
            orders_by_id,
        )
        create_paid_invoice(
            db,
            customers_by_name["Weser Office Solutions GmbH"],
            work_entries_by_group["weser-paid"],
            employees_by_id,
            orders_by_id,
        )

        create_proposals(db, customers_by_name, orders_by_key)

        for payload in TRACKING_BASELINES:
            create_tracking_baseline(
                db,
                orders_by_key[payload["order_key"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                payload,
            )

        for payload in TRACKING_UPDATES:
            create_tracking_update(
                db,
                orders_by_key[payload["order_key"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                payload,
            )

        for payload in TRACKING_TASKS:
            create_tracking_task(
                db,
                orders_by_key[payload["order_key"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                payload,
            )

        for payload in TRACKING_ISSUES:
            create_tracking_issue(
                db,
                orders_by_key[payload["order_key"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                payload,
            )

        for payload in TRACKING_MATERIALS:
            create_tracking_material(
                db,
                orders_by_key[payload["order_key"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
                payload,
            )

        db.flush()
        for payload in MONITORING_REPORTS:
            create_monitoring_report(db, orders_by_key[payload["order_key"]], payload)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("Demo seed imported:")
    print(f"- customers: {len(CUSTOMERS)}")
    print(f"- employees: {len(EMPLOYEES)}")
    print(f"- orders: {len(ORDERS)}")
    print(f"- workshops: {len(WORKSHOPS)}")
    print(f"- assignments: {len(ASSIGNMENTS)}")
    print(f"- workshop assignments: {len(WORKSHOP_ASSIGNMENTS)}")
    print(f"- work entries: {len(WORK_ENTRIES)}")
    print(f"- tracking baselines: {len(TRACKING_BASELINES)}")
    print(f"- tracking updates: {len(TRACKING_UPDATES)}")
    print(f"- tracking tasks: {len(TRACKING_TASKS)}")
    print(f"- tracking issues: {len(TRACKING_ISSUES)}")
    print(f"- tracking materials: {len(TRACKING_MATERIALS)}")
    print(f"- monitoring reports: {len(MONITORING_REPORTS)}")
    print("- invoices: 9 (8 draft, 1 paid)")
    print(f"- proposals: {len(PROPOSALS)}")


if __name__ == "__main__":
    main()
