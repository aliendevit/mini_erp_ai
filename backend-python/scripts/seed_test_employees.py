from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models import Employee, EmployeeAvailabilityBlock, EmployeeSkill  # noqa: E402


TEST_EMPLOYEES = [
    {
        "first_name": "Ahmad",
        "last_name": "Maler",
        "email": "ahmad.maler@test.local",
        "phone": "0170 1000001",
        "city": "Bremen",
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
        "default_hourly_rate": "55",
        "weekly_capacity_hours": "35",
        "skills": ["Feuchtigkeitsschutz", "Malerarbeiten", "Trockenbau"],
        "certifications": [],
        "availability_blocks": [],
    },
    {
        "first_name": "Yousef",
        "last_name": "Allrounder",
        "email": "yousef.allrounder@test.local",
        "phone": "0170 1000004",
        "city": "Bremen",
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
        "default_hourly_rate": "49",
        "weekly_capacity_hours": "40",
        "skills": ["Malerarbeiten", "Feuchtigkeitsschutz"],
        "certifications": [],
        "availability_blocks": [
            {
                "start_date": datetime(2026, 5, 7, tzinfo=timezone.utc),
                "end_date": datetime(2026, 5, 13, tzinfo=timezone.utc),
                "reason": "Urlaub",
            }
        ],
    },
]


def upsert_employee(db, payload: dict) -> tuple[str, str]:
    employee = (
        db.query(Employee)
        .filter(Employee.email == payload["email"])
        .one_or_none()
    )
    action = "updated" if employee else "created"
    if employee is None:
        employee = Employee(email=payload["email"])
        db.add(employee)

    employee.first_name = payload["first_name"]
    employee.last_name = payload["last_name"]
    employee.phone = payload["phone"]
    employee.city = payload["city"]
    employee.is_active = True
    employee.default_hourly_rate = Decimal(payload["default_hourly_rate"])
    employee.weekly_capacity_hours = Decimal(payload["weekly_capacity_hours"])

    employee.skill_records.clear()
    employee.availability_blocks.clear()

    for name in payload["skills"]:
        employee.skill_records.append(EmployeeSkill(kind="skill", name=name))
    for name in payload["certifications"]:
        employee.skill_records.append(EmployeeSkill(kind="certification", name=name))
    for block in payload["availability_blocks"]:
        employee.availability_blocks.append(
            EmployeeAvailabilityBlock(
                start_date=block["start_date"],
                end_date=block["end_date"],
                reason=block["reason"],
            )
        )

    return action, f"{employee.first_name} {employee.last_name}"


def main() -> None:
    db = SessionLocal()
    try:
        results = [upsert_employee(db, payload) for payload in TEST_EMPLOYEES]
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    for action, name in results:
        print(f"{action}: {name}")
    print(f"total: {len(results)}")


if __name__ == "__main__":
    main()
