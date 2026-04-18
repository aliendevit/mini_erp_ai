from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys

from sqlalchemy import or_, select


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
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
    Site,
    WorkEntry,
)


DEMO_TAG = "[demo-seed]"


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

        for payload in ASSIGNMENTS:
            create_assignment(
                db,
                employees_by_email[payload["employee_email"]],
                sites_by_key[(payload["order_key"], payload["site_name"])],
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
    print(f"- assignments: {len(ASSIGNMENTS)}")
    print(f"- work entries: {len(WORK_ENTRIES)}")
    print("- invoices: 9 (8 draft, 1 paid)")
    print(f"- proposals: {len(PROPOSALS)}")


if __name__ == "__main__":
    main()
