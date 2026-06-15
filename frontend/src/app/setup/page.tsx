'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiAuthGet, apiAuthJson } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../ui/ToastProvider';

type CompanyState = {
  companyName: string;
  street: string;
  zipCode: string;
  city: string;
  vatId: string;
  phone: string;
  email: string;
};

type CompanyProfile = {
  companyName?: string | null;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  vatId?: string | null;
  phone?: string | null;
  email?: string | null;
};

const initialState: CompanyState = {
  companyName: '',
  street: '',
  zipCode: '',
  city: '',
  vatId: '',
  phone: '',
  email: '',
};

function copy(locale: string) {
  if (locale === 'ar') {
    return {
      kicker: 'إعداد الشركة',
      title: 'بيانات الشركة',
      desc: 'أدخل بيانات شركتك حتى يكون الحساب والفواتير والملفات مرتبطة بالشركة الصحيحة.',
      companyName: 'اسم الشركة',
      street: 'الشارع',
      zipCode: 'الرمز البريدي',
      city: 'المدينة',
      vatId: 'الرقم الضريبي',
      phone: 'الهاتف',
      email: 'البريد الإلكتروني',
      save: 'حفظ بيانات الشركة',
      saving: 'جار الحفظ...',
      required: 'أكمل جميع الحقول المطلوبة. الرمز البريدي والرقم الضريبي اختياريان.',
      signInRequired: 'يجب تسجيل الدخول قبل حفظ بيانات الشركة.',
      saved: 'تم حفظ بيانات الشركة.',
      dashboard: 'فتح لوحة التحكم',
      requiredMark: 'مطلوب',
      optionalMark: 'اختياري',
    };
  }
  if (locale === 'de') {
    return {
      kicker: 'Firmeneinrichtung',
      title: 'Firmendaten',
      desc: 'Speichere deine Firmendaten, damit Konto, Rechnungen und Unterlagen korrekt zur Firma gehoeren.',
      companyName: 'Firmenname',
      street: 'Strasse',
      zipCode: 'PLZ',
      city: 'Stadt',
      vatId: 'USt-IdNr.',
      phone: 'Telefon',
      email: 'E-Mail',
      save: 'Firmendaten speichern',
      saving: 'Speichern...',
      required: 'Bitte alle Pflichtfelder ausfuellen. PLZ und USt-IdNr. sind optional.',
      signInRequired: 'Bitte zuerst anmelden, um Firmendaten zu speichern.',
      saved: 'Firmendaten wurden gespeichert.',
      dashboard: 'Dashboard oeffnen',
      requiredMark: 'Pflichtfeld',
      optionalMark: 'Optional',
    };
  }
  return {
    kicker: 'Company setup',
    title: 'Company info',
    desc: 'Save your company information so the account, invoices, and documents belong to the correct company.',
    companyName: 'Company name',
    street: 'Street',
    zipCode: 'ZIP code',
    city: 'City',
    vatId: 'VAT ID',
    phone: 'Phone',
    email: 'Email',
    save: 'Save company info',
    saving: 'Saving...',
    required: 'Fill all required fields. ZIP code and VAT ID are optional.',
    signInRequired: 'Sign in before saving company info.',
    saved: 'Company info saved.',
    dashboard: 'Open dashboard',
    requiredMark: 'Required',
    optionalMark: 'Optional',
  };
}

export default function SetupPage() {
  const { locale } = useI18n();
  const t = copy(locale);
  const { showToast } = useToast();
  const [form, setForm] = useState<CompanyState>(initialState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('omran_auth_token')) return;
    apiAuthGet<CompanyProfile | null>('/auth/company-profile')
      .then((profile) => {
        if (!profile) return;
        setForm({
          companyName: profile.companyName || '',
          street: profile.street || '',
          zipCode: profile.zipCode || '',
          city: profile.city || '',
          vatId: profile.vatId || '',
          phone: profile.phone || '',
          email: profile.email || '',
        });
      })
      .catch(() => {
        // Saving shows the actionable auth error if the session is missing.
      });
  }, []);

  function update(key: keyof CompanyState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function missingRequiredFields() {
    return !form.companyName.trim() || !form.street.trim() || !form.city.trim() || !form.phone.trim() || !form.email.trim();
  }

  async function saveCompany() {
    if (missingRequiredFields()) return showToast(t.required, 'error');
    if (!localStorage.getItem('omran_auth_token')) return showToast(t.signInRequired, 'error');
    setSaving(true);
    try {
      await apiAuthJson('/auth/company-profile', 'PUT', {
        companyName: form.companyName.trim(),
        street: form.street.trim(),
        zipCode: form.zipCode.trim() || null,
        city: form.city.trim(),
        country: 'DE',
        vatId: form.vatId.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      const rawUser = localStorage.getItem('omran_auth_user');
      if (rawUser) {
        const user = JSON.parse(rawUser);
        localStorage.setItem('omran_auth_user', JSON.stringify({ ...user, companyProfileComplete: true }));
        window.dispatchEvent(new Event('omran-auth-changed'));
      }
      showToast(t.saved, 'success');
    } catch (error: any) {
      showToast(error?.message || t.required, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup-page setup-company-page">
      <section className="setup-hero setup-company-hero">
        <div>
          <div className="entity-kicker">{t.kicker}</div>
          <h1>{t.title}</h1>
          <p>{t.desc}</p>
        </div>
        <div className="setup-actions">
          <Link className="btn" href="/">{t.dashboard}</Link>
        </div>
      </section>

      <section className="setup-company-shell">
        <form className="setup-card setup-company-card" onSubmit={(event) => { event.preventDefault(); saveCompany(); }}>
          <div className="setup-card-header">
            <div>
              <span>{t.kicker}</span>
              <h2>{t.title}</h2>
            </div>
            <strong>{t.requiredMark}</strong>
          </div>

          <div className="setup-form-grid">
            <div className="setup-field setup-field-wide">
              <label>{t.companyName} *</label>
              <input required value={form.companyName} onChange={(event) => update('companyName', event.target.value)} />
            </div>
            <div className="setup-field setup-field-wide">
              <label>{t.street} *</label>
              <input required value={form.street} onChange={(event) => update('street', event.target.value)} />
            </div>
            <div className="setup-field">
              <label>{t.zipCode} <small>{t.optionalMark}</small></label>
              <input value={form.zipCode} onChange={(event) => update('zipCode', event.target.value)} />
            </div>
            <div className="setup-field">
              <label>{t.city} *</label>
              <input required value={form.city} onChange={(event) => update('city', event.target.value)} />
            </div>
            <div className="setup-field">
              <label>{t.phone} *</label>
              <input required type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            </div>
            <div className="setup-field">
              <label>{t.email} *</label>
              <input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            </div>
            <div className="setup-field setup-field-wide">
              <label>{t.vatId} <small>{t.optionalMark}</small></label>
              <input value={form.vatId} onChange={(event) => update('vatId', event.target.value)} />
            </div>
          </div>

          <button className="btn primary setup-save-button" type="submit" disabled={saving}>
            {saving ? t.saving : t.save}
          </button>
        </form>
      </section>
    </div>
  );
}
