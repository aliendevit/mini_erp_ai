from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from fastapi import HTTPException, Response
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import database
from app.bootstrap import create_first_admin
from app.database import Base
from app.models import CompanyProfile, Customer, Employee, Invoice, InvoiceLine, Order, Proposal, SaasTenant, Site, UserAccount, WorkEntry
from app.routers.ai import intake_message_stream
from app.routers.auth import login
from app.routers.invoices import merge_invoices
from app.schemas import AIIntakeMessagePayload, AuthLoginPayload, InvoiceMergePayload
from app.services.gemini_client import ensure_text_ai_ready, stream_text
from app.services.invoice_documents import build_invoice_docx, build_invoice_pdf, invoice_issuer
from app.services import proposal_documents
from app.settings import get_settings


class RuntimeFixTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        self.tenant = SaasTenant(id='tenant-one', company_name='First Company')
        self.user = UserAccount(id='manager-one', email='manager@example.com', password_hash='unused', tenant_id=self.tenant.id, account_level='company_manager')
        self.customer = Customer(id='customer', company_name='Customer', tenant_id=self.tenant.id)
        employee = Employee(id='employee', first_name='Test', last_name='Worker', tenant_id=self.tenant.id, default_hourly_rate=Decimal('50'))
        order = Order(id='order', customer_id=self.customer.id, title='Renovation', tenant_id=self.tenant.id)
        site = Site(id='site', order_id=order.id, site_name='Ground floor')
        now = datetime.now(timezone.utc)
        entry = WorkEntry(id='entry', work_date=now, employee_id=employee.id, order_id=order.id, site_id=site.id, hours=Decimal('8'))
        self.invoice = Invoice(id='invoice', customer_id=self.customer.id, tenant_id=self.tenant.id, status='draft')
        line = InvoiceLine(invoice_id=self.invoice.id, work_entry_id=entry.id, service_date=now, hours_allocated=Decimal('8'))
        self.db.add_all([self.tenant, self.user, self.customer, employee, order, site, entry, self.invoice, line])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def merge(self, splits=None):
        return merge_invoices(InvoiceMergePayload(groupBy='order', key='order', sourceInvoiceIds=['invoice'], splits=splits), db=self.db, current_user=self.user)

    def test_merge_creates_unique_tenant_invoices_and_preserves_hours_and_rates(self):
        result = self.merge([3, 5])
        invoices = self.db.scalars(select(Invoice).where(Invoice.id.in_(result['createdInvoiceIds']))).all()
        self.assertEqual(len(invoices), 2)
        self.assertEqual(len({item.invoice_number for item in invoices}), 2)
        self.assertTrue(all(item.tenant_id == self.tenant.id and item.status == 'final' for item in invoices))
        self.assertEqual(self.db.scalar(select(func.sum(InvoiceLine.hours_allocated))), Decimal('8'))
        self.assertEqual(self.db.scalar(select(func.sum(InvoiceLine.line_amount))), Decimal('400'))
        self.assertIsNone(self.db.get(Invoice, 'invoice', populate_existing=True))

    def test_merge_rejects_split_short_by_one_cent_instead_of_looping(self):
        with self.assertRaises(HTTPException):
            self.merge([7.99])
        self.assertIsNotNone(self.db.get(Invoice, 'invoice'))

    def test_merge_rejects_nonfinite_or_overprecise_splits(self):
        for splits in ([float('inf')], [3.001, 4.999]):
            with self.subTest(splits=splits), self.assertRaises(HTTPException):
                self.merge(splits)

    def test_first_admin_can_login_and_cannot_be_recreated(self):
        admin = create_first_admin(self.db, 'ADMIN@example.com', 'StrongPassword1!')
        self.assertEqual(admin.account_level, 'platform_admin')
        response = Response()
        result = login(AuthLoginPayload(email='admin@example.com', password='StrongPassword1!'), response=response, db=self.db)
        self.assertEqual(result.user.id, admin.id)
        self.assertIn('omran_session=', response.headers['set-cookie'])
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        with self.assertRaises(ValueError):
            create_first_admin(self.db, 'another@example.com', 'StrongPassword2!')

    def test_first_admin_rejects_weak_password(self):
        with self.assertRaises(HTTPException):
            create_first_admin(self.db, 'admin@example.com', 'weak')
        self.assertEqual(self.db.scalar(select(func.count()).select_from(UserAccount).where(UserAccount.account_level == 'platform_admin')), 0)

    def profile(self, owner_id, name, iban):
        profile = CompanyProfile(owner_user_id=owner_id, company_name=name, street='Company Street 1', city='Berlin', phone='+491234567890', email='office@example.com', iban=iban, bic='TESTBIC1', tax_number='TAX-123')
        self.db.add(profile)
        self.db.commit()
        return profile

    def test_invoice_issuer_and_word_output_are_tenant_specific(self):
        self.profile(self.user.id, 'First & Company', 'FIRST-ACCOUNT')
        other = SaasTenant(id='tenant-two', company_name='Second Company')
        owner = UserAccount(id='manager-two', email='second@example.com', password_hash='unused', account_level='company_manager', tenant_id=other.id)
        self.db.add_all([other, owner]); self.db.commit()
        self.profile(owner.id, 'Second Company', 'SECOND-ACCOUNT')
        other_customer = Customer(company_name='Second Customer', tenant_id=other.id)
        self.db.add(other_customer); self.db.flush()
        other_invoice = Invoice(tenant_id=other.id, customer=other_customer, status='final')
        for invoice, expected, unexpected in ((self.invoice, 'FIRST-ACCOUNT', 'SECOND-ACCOUNT'), (other_invoice, 'SECOND-ACCOUNT', 'FIRST-ACCOUNT')):
            issuer = invoice_issuer(self.db, invoice)
            docx = build_invoice_docx(invoice, issuer=issuer)
            with ZipFile(BytesIO(docx)) as archive:
                text = '\n'.join(archive.read(name).decode() for name in archive.namelist() if name.startswith('word/') and name.endswith('.xml'))
            self.assertIn(expected, text)
            self.assertNotIn(unexpected, text)
            self.assertNotIn('Zyad', text)
            self.assertTrue(build_invoice_pdf(invoice, issuer=issuer).startswith(b'%PDF'))

    def test_invoice_export_requires_own_company_profile(self):
        with self.assertRaises(HTTPException) as caught:
            invoice_issuer(self.db, self.invoice)
        self.assertEqual(caught.exception.status_code, 409)

    def test_openrouter_only_chat_passes_preflight_and_uses_fallback(self):
        proposal = Proposal(tenant_id=self.tenant.id)
        self.db.add(proposal); self.db.commit()
        settings = get_settings()
        with patch.object(settings, 'gemini_api_key', ''), patch.object(settings, 'openrouter_api_key', 'test-placeholder'), patch.dict(os.environ, {'E2E_FAKE_AI': '0'}), patch('app.services.gemini_client._openrouter_generate_text', return_value='Provider reply'):
            ensure_text_ai_ready()
            response = intake_message_stream(proposal.id, AIIntakeMessagePayload(content='Hello'), db=self.db, current_user=self.user)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(''.join(stream_text('Hello')), 'Provider reply')

    def test_normal_startup_neither_seeds_nor_resets_demo_company(self):
        factory = sessionmaker(bind=self.engine)
        with patch.multiple(database, engine=self.engine, SessionLocal=factory), patch.dict(os.environ, {'ENABLE_DEMO_SEED': 'false'}):
            database.init_db()
            self.assertIsNone(self.db.scalar(select(SaasTenant).where(SaasTenant.company_name == 'OMRAN Demo Company')))
            demo = SaasTenant(company_name='OMRAN Demo Company', status='suspended', user_count=15)
            self.db.add(demo); self.db.commit()
            database.init_db(); self.db.refresh(demo)
            self.assertEqual((demo.status, demo.user_count), ('suspended', 15))

    def test_demo_seeding_does_not_overwrite_existing_records(self):
        factory = sessionmaker(bind=self.engine)
        with patch.multiple(database, engine=self.engine, SessionLocal=factory), patch.dict(os.environ, {'ENABLE_DEMO_SEED': 'true'}):
            database.init_db()
            demo = self.db.scalar(select(SaasTenant).where(SaasTenant.company_name == 'OMRAN Demo Company'))
            demo.status='suspended'; demo.user_count=15
            self.db.commit()
            database.init_db(); self.db.refresh(demo)
            self.assertEqual((demo.status, demo.user_count), ('suspended', 15))

    def test_linux_font_search_includes_dejavu_pair(self):
        with patch.object(Path, 'exists', lambda path: path.as_posix().startswith('/usr/share/fonts/truetype/dejavu/')):
            regular, bold = proposal_documents._resolve_font_paths()
        self.assertEqual(regular.name, 'DejaVuSans.ttf')
        self.assertEqual(bold.name, 'DejaVuSans-Bold.ttf')

    def test_existing_profile_gets_payment_columns_without_losing_data(self):
        legacy = create_engine('sqlite:///:memory:')
        try:
            with legacy.begin() as conn:
                conn.exec_driver_sql('CREATE TABLE "CompanyProfile" (id VARCHAR PRIMARY KEY, "companyName" VARCHAR)')
                conn.exec_driver_sql('INSERT INTO "CompanyProfile" VALUES (\'legacy\', \'Keep Company\')')
            with patch.object(database, 'engine', legacy):
                database._ensure_company_payment_columns()
                database._ensure_company_payment_columns()
            with legacy.connect() as conn:
                row = conn.exec_driver_sql('SELECT "companyName", iban FROM "CompanyProfile"').first()
            self.assertEqual(tuple(row), ('Keep Company', None))
        finally:
            legacy.dispose()
