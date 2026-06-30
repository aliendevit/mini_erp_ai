'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { apiAuthGet, apiAuthJson, apiGet, apiJson } from '../../lib/api';
import { readStoredAccessUser, type StoredAccessUser } from '../../lib/access';
import { appAlert } from '../../lib/dialog';
import { useI18n } from '../../lib/i18n';

type AiFeature = {
  key: string;
  title: string;
  description: string;
  permission: string;
  enabled: boolean;
};

type ControlUser = {
  id: string;
  email: string;
  phone?: string | null;
  accountLevel: string;
  role: string;
  tenantName?: string | null;
  permissions: string[];
  aiFeatures: AiFeature[];
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
};

type CompanyProfile = {
  companyName?: string | null;
  legalName?: string | null;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

type AccountControlResponse = {
  currentUser: ControlUser;
  companyProfile?: CompanyProfile | null;
  companyUsers: ControlUser[];
  canManageUsers: boolean;
  userLimit?: number | null;
  userUsed: number;
};

type InvoiceSequenceState = {
  year: number;
  dbNextSeq: number;
  configuredNextSeq?: number | null;
  effectiveNextSeq: number;
  effectiveInvoiceNumber: string;
};

function copy(locale: string) {
  if (locale === 'ar') {
    return {
      eyebrow: 'مركز التحكم بالحساب',
      managerTitle: 'تحكم بصلاحيات الذكاء الاصطناعي للمستخدمين',
      userTitle: 'صلاحياتك وأدواتك المتاحة',
      subtitle: 'راجع الحساب والشركة وأدوات الذكاء الاصطناعي المفعلة بدون تغيير تصميم لوحة التحكم الرئيسية.',
      company: 'الشركة',
      account: 'الحساب',
      role: 'الدور',
      status: 'الحالة',
      active: 'نشط',
      inactive: 'متوقف',
      aiAccess: 'صلاحيات الذكاء الاصطناعي',
      teamUsers: 'مستخدمو الشركة',
      managerOnly: 'المدير يستطيع تفعيل أو تعطيل أدوات الذكاء الاصطناعي للمستخدم العادي.',
      enabled: 'مفعل',
      disabled: 'غير مفعل',
      open: 'فتح',
      saving: 'جار الحفظ',
      saved: 'تم الحفظ',
      failed: 'فشل الحفظ',
      noUsers: 'لا يوجد مستخدمون عاديون في هذه الشركة بعد.',
      signIn: 'تسجيل الدخول',
      loading: 'جار تحميل بيانات الحساب',
      denied: 'هذه الصفحة تحتاج تسجيل دخول.',
      lastLogin: 'آخر دخول',
      contact: 'بيانات التواصل',
    };
  }
  if (locale === 'de') {
    return {
      eyebrow: 'Account Control',
      managerTitle: 'KI-Zugriffe fuer Teamnutzer steuern',
      userTitle: 'Deine Berechtigungen und verfuegbaren Tools',
      subtitle: 'Account, Firma und KI-Zugriffe verwalten, ohne das originale Dashboard-Design zu veraendern.',
      company: 'Firma',
      account: 'Konto',
      role: 'Rolle',
      status: 'Status',
      active: 'Aktiv',
      inactive: 'Inaktiv',
      aiAccess: 'KI-Zugriff',
      teamUsers: 'Company Users',
      managerOnly: 'Manager koennen KI-Tools fuer normale Nutzer aktivieren oder deaktivieren.',
      enabled: 'Aktiv',
      disabled: 'Aus',
      open: 'Oeffnen',
      saving: 'Speichert',
      saved: 'Gespeichert',
      failed: 'Speichern fehlgeschlagen',
      noUsers: 'Noch keine normalen Nutzer in dieser Firma.',
      signIn: 'Anmelden',
      loading: 'Account-Daten werden geladen',
      denied: 'Diese Seite benoetigt eine Anmeldung.',
      lastLogin: 'Letzter Login',
      contact: 'Kontakt',
    };
  }
  return {
    eyebrow: 'Account Control',
    managerTitle: 'Control AI access for company users',
    userTitle: 'Your permissions and available tools',
    subtitle: 'Manage account, company, and AI access without changing the original dashboard design.',
    company: 'Company',
    account: 'Account',
    role: 'Role',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    aiAccess: 'AI Access',
    teamUsers: 'Company Users',
    managerOnly: 'Managers can enable or disable AI tools for normal users.',
    enabled: 'Enabled',
    disabled: 'Off',
    open: 'Open',
    saving: 'Saving',
    saved: 'Saved',
    failed: 'Save failed',
    noUsers: 'No normal users in this company yet.',
    signIn: 'Sign in',
    loading: 'Loading account data',
    denied: 'This page requires sign in.',
    lastLogin: 'Last login',
    contact: 'Contact',
  };
}

function featureHref(permission: string) {
  if (permission === 'use_ai_monitoring') return '/monitoring';
  return '/ai-intake';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AccountControlPage() {
  const { locale } = useI18n();
  const labels = copy(locale);
  const [storedUser, setStoredUser] = useState<StoredAccessUser | null>(null);
  const [data, setData] = useState<AccountControlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [invoiceSettingsLoading, setInvoiceSettingsLoading] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSequenceState | null>(null);
  const [invoiceSettingsDraft, setInvoiceSettingsDraft] = useState({
    prefix: 'RE',
    currency: 'EUR',
    nextSeq: '',
    footer: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    phone: '',
    accountLevel: 'company_user',
  });

  useEffect(() => {
    const user = readStoredAccessUser();
    setStoredUser(user);
    if (!user) {
      setLoading(false);
      return;
    }
    apiAuthGet<AccountControlResponse>('/auth/account-control')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : labels.failed))
      .finally(() => setLoading(false));
  }, [labels.failed]);

  useEffect(() => {
    if (!storedUser) return;
    apiGet<InvoiceSequenceState>('/settings/invoice-sequence')
      .then((state) => {
        setInvoiceSettings(state);
        setInvoiceSettingsDraft((current) => ({ ...current, nextSeq: String(state.effectiveNextSeq || '') }));
      })
      .catch(() => undefined);
  }, [storedUser]);

  const currentUser = data?.currentUser;
  const enabledCount = useMemo(
    () => currentUser?.aiFeatures.filter((feature) => feature.enabled).length || 0,
    [currentUser]
  );
  const totalAiCount = currentUser?.aiFeatures.length || 0;
  const companyAddress = data?.companyProfile
    ? [data.companyProfile.street, [data.companyProfile.zipCode, data.companyProfile.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : '';
  const companyContact = data?.companyProfile
    ? [data.companyProfile.email, data.companyProfile.phone, data.companyProfile.website].filter(Boolean).join(' · ')
    : '';

  async function toggleAiPermission(user: ControlUser, feature: AiFeature) {
    if (!data?.canManageUsers || savingKey) return;
    const nextPermissions = new Set(user.aiFeatures.filter((item) => item.enabled).map((item) => item.permission));
    if (feature.enabled) nextPermissions.delete(feature.permission);
    else nextPermissions.add(feature.permission);

    const key = `${user.id}:${feature.permission}`;
    setSavingKey(key);
    setSavedKey('');
    setError('');
    try {
      const updated = await apiAuthJson<ControlUser>(
        `/auth/account-control/users/${user.id}/ai-permissions`,
        'PATCH',
        { permissions: Array.from(nextPermissions) }
      );
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          companyUsers: current.companyUsers.map((item) => (item.id === updated.id ? updated : item)),
        };
      });
      setSavedKey(key);
      window.setTimeout(() => setSavedKey(''), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.failed);
    } finally {
      setSavingKey('');
    }
  }

  async function createCompanyUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);
    setError('');
    try {
      const created = await apiAuthJson<ControlUser>('/auth/account-control/users', 'POST', {
        email: newUser.email,
        password: newUser.password,
        phone: newUser.phone || undefined,
        accountLevel: newUser.accountLevel,
      });
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          companyUsers: [...current.companyUsers, created],
          userUsed: current.userUsed + 1,
        };
      });
      setNewUser({ email: '', password: '', phone: '', accountLevel: 'company_user' });
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.failed);
    } finally {
      setCreatingUser(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await apiAuthJson('/auth/change-password', 'POST', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      appAlert('Password changed successfully.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.failed);
    } finally {
      setChangingPassword(false);
    }
  }

  async function saveInvoiceSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvoiceSettingsLoading(true);
    setError('');
    try {
      const state = await apiJson<InvoiceSequenceState>('/settings/invoice-sequence', 'PUT', {
        nextSeq: invoiceSettingsDraft.nextSeq ? Number(invoiceSettingsDraft.nextSeq) : null,
      });
      setInvoiceSettings(state);
      setInvoiceSettingsDraft((current) => ({ ...current, nextSeq: String(state.effectiveNextSeq || current.nextSeq) }));
      appAlert('Invoice settings saved.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.failed);
    } finally {
      setInvoiceSettingsLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="account-control-page">
        <section className="account-control-hero">
          <span>{labels.eyebrow}</span>
          <h1>{labels.loading}</h1>
        </section>
      </main>
    );
  }

  if (!storedUser || !currentUser) {
    return (
      <main className="account-control-page">
        <section className="account-control-hero">
          <span>{labels.eyebrow}</span>
          <h1>{labels.denied}</h1>
          <Link className="btn primary" href="/auth">{labels.signIn}</Link>
        </section>
      </main>
    );
  }

  const isManager = currentUser.accountLevel === 'company_manager';

  return (
    <main className="account-control-page">
      <section className="account-control-hero">
        <div>
          <span>{labels.eyebrow}</span>
          <h1>{isManager ? labels.managerTitle : labels.userTitle}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <div className="account-control-identity">
          <strong>{currentUser.email}</strong>
          <span>{currentUser.role}</span>
          <small>{currentUser.tenantName || data.companyProfile?.companyName || '-'}</small>
        </div>
      </section>

      {error ? <div className="form-error account-control-error">{error}</div> : null}

      <section className="account-control-metrics">
        <div>
          <span>{labels.aiAccess}</span>
          <strong>{enabledCount}/{totalAiCount}</strong>
        </div>
        <div>
          <span>{labels.status}</span>
          <strong>{currentUser.isActive ? labels.active : labels.inactive}</strong>
        </div>
        <div>
          <span>{labels.teamUsers}</span>
          <strong>{data.userUsed}/{data.userLimit ?? '-'}</strong>
        </div>
      </section>

      <section className="account-control-grid">
        <article className="account-control-panel">
          <div className="account-control-section-title">
            <div>
              <span>{labels.account}</span>
              <h2>{currentUser.email}</h2>
            </div>
            <strong>{currentUser.accountLevel}</strong>
          </div>
          <div className="account-control-info-list">
            <div><span>{labels.role}</span><strong>{currentUser.role}</strong></div>
            <div><span>{labels.status}</span><strong>{currentUser.isActive ? labels.active : labels.inactive}</strong></div>
            <div><span>{labels.lastLogin}</span><strong>{formatDate(currentUser.lastLoginAt)}</strong></div>
            {currentUser.phone ? <div><span>{labels.contact}</span><strong>{currentUser.phone}</strong></div> : null}
          </div>
        </article>

        <article className="account-control-panel">
          <div className="account-control-section-title">
            <div>
              <span>{labels.company}</span>
              <h2>{data.companyProfile?.companyName || currentUser.tenantName || '-'}</h2>
            </div>
          </div>
          <div className="account-control-info-list">
            {data.companyProfile?.legalName ? <div><span>Legal</span><strong>{data.companyProfile.legalName}</strong></div> : null}
            {companyAddress ? <div><span>Address</span><strong>{companyAddress}</strong></div> : null}
            {companyContact ? <div><span>{labels.contact}</span><strong>{companyContact}</strong></div> : null}
          </div>
        </article>
      </section>

      <section className="account-control-panel account-control-wide">
        <div className="account-control-section-title">
          <div>
            <span>Security</span>
            <h2>Change password</h2>
          </div>
          <strong>Global policy</strong>
        </div>
        <form className="account-control-create-user" onSubmit={changePassword}>
          <label>
            <span>Current password</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>New password</span>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              placeholder="Min 8 chars, number, special"
              required
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              required
            />
          </label>
          <button className="btn primary" type="submit" disabled={changingPassword}>
            {changingPassword ? labels.saving : 'Update password'}
          </button>
        </form>
        <p className="muted">All companies use the same password rule: at least 8 characters, one number, and one special character.</p>
      </section>

      <section className="account-control-panel account-control-wide">
        <div className="account-control-section-title">
          <div>
            <span>Invoice settings</span>
            <h2>Company billing defaults</h2>
          </div>
          <strong>{invoiceSettings?.effectiveInvoiceNumber || 'RE YY-0001'}</strong>
        </div>
        <form className="account-control-create-user" onSubmit={saveInvoiceSettings}>
          <label>
            <span>Prefix</span>
            <input value={invoiceSettingsDraft.prefix} onChange={(event) => setInvoiceSettingsDraft((current) => ({ ...current, prefix: event.target.value }))} disabled />
          </label>
          <label>
            <span>Next invoice sequence</span>
            <input type="number" min={invoiceSettings?.dbNextSeq || 1} max="9999" value={invoiceSettingsDraft.nextSeq} onChange={(event) => setInvoiceSettingsDraft((current) => ({ ...current, nextSeq: event.target.value }))} />
          </label>
          <label>
            <span>Default currency</span>
            <input value={invoiceSettingsDraft.currency} onChange={(event) => setInvoiceSettingsDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
          </label>
          <label>
            <span>VAT / tax mode</span>
            <select defaultValue="manual">
              <option value="manual">Manual / future setup</option>
            </select>
          </label>
          <label>
            <span>Footer / payment instructions</span>
            <input value={invoiceSettingsDraft.footer} onChange={(event) => setInvoiceSettingsDraft((current) => ({ ...current, footer: event.target.value }))} placeholder="Shown in a future invoice template step" />
          </label>
          <button className="btn primary" type="submit" disabled={invoiceSettingsLoading}>{invoiceSettingsLoading ? labels.saving : 'Save invoice settings'}</button>
        </form>
        <p className="muted">This controls the next invoice number now. Currency, VAT mode, and footer are prepared as company-facing settings for the next document-template step.</p>
      </section>

      <section className="account-control-panel account-control-wide">
        <div className="account-control-section-title">
          <div>
            <span>{labels.aiAccess}</span>
            <h2>{isManager ? labels.managerTitle : labels.userTitle}</h2>
          </div>
        </div>
        <div className="account-control-feature-grid">
          {currentUser.aiFeatures.map((feature) => (
            <article key={feature.permission} className={`account-control-feature ${feature.enabled ? 'enabled' : 'disabled'}`}>
              <div>
                <strong>{feature.title}</strong>
                <p>{feature.description}</p>
              </div>
              <span>{feature.enabled ? labels.enabled : labels.disabled}</span>
              {feature.enabled ? <Link className="btn" href={featureHref(feature.permission)}>{labels.open}</Link> : null}
            </article>
          ))}
        </div>
      </section>

      {data.canManageUsers ? (
        <section className="account-control-panel account-control-wide">
          <div className="account-control-section-title">
            <div>
              <span>{labels.teamUsers}</span>
              <h2>{labels.managerOnly}</h2>
            </div>
          </div>
          <form className="account-control-create-user" onSubmit={createCompanyUser}>
            <label>
              <span>Email</span>
              <input type="email" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} required />
            </label>
            <label>
              <span>Password</span>
              <input type="text" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} placeholder="Min 8 chars, number, special" required />
            </label>
            <label>
              <span>Phone</span>
              <input value={newUser.phone} onChange={(event) => setNewUser((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              <span>Mode</span>
              <select value={newUser.accountLevel} onChange={(event) => setNewUser((current) => ({ ...current, accountLevel: event.target.value }))}>
                <option value="company_user">Normal user</option>
                <option value="company_viewer">Viewer</option>
              </select>
            </label>
            <button className="btn primary" type="submit" disabled={creatingUser || (data.userLimit !== null && data.userLimit !== undefined && data.userUsed >= data.userLimit)}>
              {creatingUser ? labels.saving : 'Create user'}
            </button>
          </form>
          {data.companyUsers.length ? (
            <div className="account-control-user-list">
              {data.companyUsers.map((user) => (
                <article key={user.id} className="account-control-user-card">
                  <div className="account-control-user-head">
                    <div>
                      <strong>{user.email}</strong>
                      <span>{user.role} · {user.isActive ? labels.active : labels.inactive}</span>
                    </div>
                    <small>{formatDate(user.lastLoginAt)}</small>
                  </div>
                  <div className="account-control-toggle-grid">
                    {user.accountLevel === 'company_viewer' ? (
                      <div className="account-control-viewer-note">
                        <strong>Viewer mode</strong>
                        <span>Read-only access. AI tools and edit actions are not available.</span>
                      </div>
                    ) : user.aiFeatures.map((feature) => {
                      const key = `${user.id}:${feature.permission}`;
                      const busy = savingKey === key;
                      return (
                        <button
                          key={feature.permission}
                          type="button"
                          className={`account-control-toggle ${feature.enabled ? 'enabled' : ''}`}
                          onClick={() => toggleAiPermission(user, feature)}
                          disabled={Boolean(savingKey)}
                          aria-pressed={feature.enabled}
                        >
                          <span>
                            <strong>{feature.title}</strong>
                            <small>{busy ? labels.saving : savedKey === key ? labels.saved : feature.enabled ? labels.enabled : labels.disabled}</small>
                          </span>
                          <i aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{labels.noUsers}</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
