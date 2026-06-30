'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { apiGet, apiJson, openAuthBlob } from '../../lib/api';
import { dashboardPathForUser, readStoredAccessUser, type StoredAccessUser } from '../../lib/access';
import { appAlert, appConfirm } from '../../lib/dialog';

type PlatformCompany = {
  id: string;
  companyName: string;
  contactEmail?: string | null;
  planName: string;
  status: string;
  userCount: number;
  userLimit?: number;
  userUsed?: number;
  invoiceTotal: number;
  paidTotal: number;
  dueTotal: number;
  overdueInvoices: number;
};

type CreatedCompany = {
  tenantId: string;
  companyName: string;
  userLimit: number;
  managerEmail: string;
  managerPassword: string;
};

type ResetManagerPassword = {
  tenantId: string;
  companyName: string;
  managerEmail: string;
  managerPassword: string;
};

type PlatformInvoice = {
  id: string;
  tenantId: string;
  companyName: string;
  invoiceNumber: string;
  status: string;
  amount: number;
  paid: number;
  due: number;
  currency: string;
  periodLabel?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  overdue: boolean;
  payments?: Array<{
    id: string;
    amount: number;
    currency: string;
    paidDate?: string | null;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
  }>;
};

type PlatformDashboard = {
  metrics: {
    subscribedCompanies: number;
    activeCompanies: number;
    trialCompanies: number;
    suspendedCompanies: number;
    saasInvoicesIssued: number;
    paidToOmran: number;
    openSubscriptionBalance: number;
    overdueInvoices: number;
    currency: string;
  };
  companies: PlatformCompany[];
  invoices: PlatformInvoice[];
};

export default function PlatformDashboardPage() {
  const [user, setUser] = useState<StoredAccessUser | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdCompany, setCreatedCompany] = useState<CreatedCompany | null>(null);
  const [resettingTenantId, setResettingTenantId] = useState('');
  const [resetCredentials, setResetCredentials] = useState<ResetManagerPassword | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState('');
  const [invoiceFilters, setInvoiceFilters] = useState({
    tenantId: '',
    status: '',
    overdueOnly: false,
    from: '',
    to: '',
  });
  const [invoiceForm, setInvoiceForm] = useState({
    tenantId: '',
    amount: '',
    currency: 'EUR',
    periodLabel: '',
    issueDate: new Date().toISOString().substring(0, 10),
    dueDate: '',
    status: 'sent',
    notes: '',
  });
  const [paymentDraft, setPaymentDraft] = useState({
    amount: '',
    currency: 'EUR',
    paidDate: new Date().toISOString().substring(0, 10),
    method: '',
    reference: '',
    notes: '',
  });
  const [form, setForm] = useState({
    companyName: '',
    managerEmail: '',
    userLimit: '2',
    planName: 'AI Business',
    status: 'active',
    subscriptionAmount: '',
  });

  useEffect(() => {
    const nextUser = readStoredAccessUser();
    setUser(nextUser);
    setReady(true);
    if (!nextUser) window.location.href = '/auth';
    else if (nextUser.accountLevel !== 'platform_admin') window.location.href = dashboardPathForUser(nextUser);
  }, []);

  function loadDashboard() {
    apiGet<PlatformDashboard>('/platform/dashboard')
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err: any) => setError(err?.message || 'Failed to load platform dashboard.'));
  }

  useEffect(() => {
    if (!ready || !user || user.accountLevel !== 'platform_admin') return;
    loadDashboard();
  }, [ready, user]);

  if (!ready || !user || user.accountLevel !== 'platform_admin') return null;

  const metrics = data?.metrics;
  const currency = metrics?.currency || 'EUR';
  const money = (value?: number) => `${Number(value || 0).toFixed(2)} ${currency}`;
  const invoiceMoney = (value?: number, invoiceCurrency = currency) => `${Number(value || 0).toFixed(2)} ${invoiceCurrency}`;
  const filteredInvoices = (data?.invoices || []).filter((invoice) => {
    if (invoiceFilters.tenantId && invoice.tenantId !== invoiceFilters.tenantId) return false;
    if (invoiceFilters.status && invoice.status !== invoiceFilters.status) return false;
    if (invoiceFilters.overdueOnly && !invoice.overdue) return false;
    if (invoiceFilters.from && invoice.issueDate && invoice.issueDate.substring(0, 10) < invoiceFilters.from) return false;
    if (invoiceFilters.to && invoice.issueDate && invoice.issueDate.substring(0, 10) > invoiceFilters.to) return false;
    return true;
  });

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreatedCompany(null);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        companyName: form.companyName,
        managerEmail: form.managerEmail || undefined,
        userLimit: Number(form.userLimit || 0),
        planName: form.planName,
        status: form.status,
      };
      if (form.subscriptionAmount.trim()) payload.subscriptionAmount = Number(form.subscriptionAmount);
      const created = await apiJson<CreatedCompany>('/platform/companies', 'POST', payload);
      setCreatedCompany(created);
      setForm({
        companyName: '',
        managerEmail: '',
        userLimit: '2',
        planName: 'AI Business',
        status: 'active',
        subscriptionAmount: '',
      });
      loadDashboard();
    } catch (err: any) {
      setError(err?.message || 'Failed to create company.');
    } finally {
      setCreating(false);
    }
  }

  async function resetManagerPassword(company: PlatformCompany) {
    setResettingTenantId(company.id);
    setResetCredentials(null);
    setError(null);
    try {
      const result = await apiJson<ResetManagerPassword>(`/platform/companies/${company.id}/manager-password`, 'POST', {});
      setResetCredentials(result);
      appAlert(`New manager password generated for ${company.companyName}.`, 'success');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset manager password.');
    } finally {
      setResettingTenantId('');
    }
  }

  function resetInvoiceForm() {
    setEditingInvoiceId('');
    setInvoiceForm({
      tenantId: '',
      amount: '',
      currency: 'EUR',
      periodLabel: '',
      issueDate: new Date().toISOString().substring(0, 10),
      dueDate: '',
      status: 'sent',
      notes: '',
    });
  }

  function editInvoice(invoice: PlatformInvoice) {
    setEditingInvoiceId(invoice.id);
    setInvoiceForm({
      tenantId: invoice.tenantId,
      amount: String(invoice.amount ?? ''),
      currency: invoice.currency || 'EUR',
      periodLabel: invoice.periodLabel || '',
      issueDate: invoice.issueDate ? invoice.issueDate.substring(0, 10) : new Date().toISOString().substring(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.substring(0, 10) : '',
      status: invoice.status === 'paid' && invoice.due <= 0 ? 'paid' : invoice.status || 'sent',
      notes: invoice.notes || '',
    });
    setExpandedInvoiceId(invoice.id);
  }

  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBillingBusy(true);
    setError(null);
    try {
      const payload = {
        tenantId: invoiceForm.tenantId,
        amount: Number(invoiceForm.amount || 0),
        currency: invoiceForm.currency || 'EUR',
        periodLabel: invoiceForm.periodLabel || undefined,
        issueDate: invoiceForm.issueDate || undefined,
        dueDate: invoiceForm.dueDate || undefined,
        status: invoiceForm.status,
        notes: invoiceForm.notes || undefined,
      };
      if (editingInvoiceId) {
        await apiJson(`/platform/saas-invoices/${editingInvoiceId}`, 'PUT', payload);
        appAlert('SaaS invoice updated.', 'success');
      } else {
        await apiJson('/platform/saas-invoices', 'POST', payload);
        appAlert('SaaS invoice created.', 'success');
      }
      resetInvoiceForm();
      loadDashboard();
    } catch (err: any) {
      setError(err?.message || 'Failed to save SaaS invoice.');
    } finally {
      setBillingBusy(false);
    }
  }

  async function deleteInvoice(invoice: PlatformInvoice) {
    if (!(await appConfirm(`Delete ${invoice.invoiceNumber}?`))) return;
    setBillingBusy(true);
    setError(null);
    try {
      await apiJson(`/platform/saas-invoices/${invoice.id}`, 'DELETE');
      appAlert('SaaS invoice deleted.', 'success');
      loadDashboard();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete SaaS invoice.');
    } finally {
      setBillingBusy(false);
    }
  }

  async function addPayment(invoice: PlatformInvoice) {
    if (!paymentDraft.amount) {
      appAlert('Payment amount is required.', 'error');
      return;
    }
    setBillingBusy(true);
    setError(null);
    try {
      await apiJson(`/platform/saas-invoices/${invoice.id}/payments`, 'POST', {
        amount: Number(paymentDraft.amount),
        currency: paymentDraft.currency || invoice.currency || 'EUR',
        paidDate: paymentDraft.paidDate || undefined,
        method: paymentDraft.method || undefined,
        reference: paymentDraft.reference || undefined,
        notes: paymentDraft.notes || undefined,
      });
      setPaymentDraft({ amount: '', currency: invoice.currency || 'EUR', paidDate: new Date().toISOString().substring(0, 10), method: '', reference: '', notes: '' });
      appAlert('Payment added.', 'success');
      loadDashboard();
    } catch (err: any) {
      setError(err?.message || 'Failed to add payment.');
    } finally {
      setBillingBusy(false);
    }
  }

  async function deletePayment(invoice: PlatformInvoice, paymentId: string) {
    if (!(await appConfirm('Delete this payment?'))) return;
    setBillingBusy(true);
    setError(null);
    try {
      await apiJson(`/platform/saas-invoices/${invoice.id}/payments/${paymentId}`, 'DELETE');
      appAlert('Payment deleted.', 'success');
      loadDashboard();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete payment.');
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <main className="saas-page">
      <section className="saas-hero">
        <div>
          <span>Level 1 - OMRAN Platform Admin</span>
          <h1>Control all subscribed companies from one platform dashboard.</h1>
          <p>Manage tenants, subscription invoices, SaaS payments, company access, platform audit, and system-level activity.</p>
        </div>
        <div className="saas-login-card">
          <strong>{user.email}</strong>
          <span>{user.role}</span>
          <small>{user.tenantName}</small>
        </div>
      </section>

      {error && <div className="card error">{error}</div>}
      {!data && !error && <div className="card muted">Loading platform dashboard...</div>}

      <section className="saas-metric-grid">
        <div><strong>{metrics?.subscribedCompanies ?? '-'}</strong><span>Subscribed companies</span></div>
        <div><strong>{money(metrics?.saasInvoicesIssued)}</strong><span>SaaS invoices issued</span></div>
        <div><strong>{money(metrics?.paidToOmran)}</strong><span>Paid to OMRAN</span></div>
        <div><strong>{money(metrics?.openSubscriptionBalance)}</strong><span>Open subscription balance</span></div>
      </section>

      <section className="saas-grid">
        <article className="saas-card wide platform-provision-card">
          <div className="saas-section-title">
            <div>
              <span>Company provisioning</span>
              <h2>Add subscribed company</h2>
            </div>
            <strong>Manager login generated</strong>
          </div>
          <form className="platform-provision-form" onSubmit={createCompany}>
            <label>
              <span>Company name</span>
              <input value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} required />
            </label>
            <label>
              <span>Manager email</span>
              <input type="email" value={form.managerEmail} onChange={(event) => setForm((current) => ({ ...current, managerEmail: event.target.value }))} placeholder="auto if empty" />
            </label>
            <label>
              <span>Users manager can add</span>
              <input type="number" min="0" max="500" value={form.userLimit} onChange={(event) => setForm((current) => ({ ...current, userLimit: event.target.value }))} required />
            </label>
            <label>
              <span>Plan</span>
              <input value={form.planName} onChange={(event) => setForm((current) => ({ ...current, planName: event.target.value }))} />
            </label>
            <label>
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="active">active</option>
                <option value="trial">trial</option>
                <option value="suspended">suspended</option>
              </select>
            </label>
            <label>
              <span>Subscription amount</span>
              <input type="number" min="0" step="0.01" value={form.subscriptionAmount} onChange={(event) => setForm((current) => ({ ...current, subscriptionAmount: event.target.value }))} placeholder="optional" />
            </label>
            <button className="btn primary" type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create company'}</button>
          </form>
          {createdCompany ? (
            <div className="platform-created-credentials">
              <span>Generated manager access</span>
              <strong>{createdCompany.companyName}</strong>
              <code>{createdCompany.managerEmail}</code>
              <code>{createdCompany.managerPassword}</code>
              <small>User allowance: {createdCompany.userLimit}</small>
            </div>
          ) : null}
          {resetCredentials ? (
            <div className="platform-created-credentials">
              <span>Reset manager access</span>
              <strong>{resetCredentials.companyName}</strong>
              <code>{resetCredentials.managerEmail}</code>
              <code>{resetCredentials.managerPassword}</code>
              <small>Give this password to the company manager. They can change it from Account Control.</small>
            </div>
          ) : null}
        </article>

        <article id="tenants" className="saas-card wide">
          <div className="saas-section-title">
            <div>
              <span>Subscribed companies</span>
              <h2>Tenant control</h2>
            </div>
            <Link className="btn" href="/audit-log">Platform audit</Link>
          </div>
          <div className="saas-table saas-tenant-table">
            <div className="saas-table-head">
              <span>Company</span><span>Plan</span><span>Status</span><span>Users</span><span>Paid</span><span>Due</span><span>Access</span>
            </div>
            {(data?.companies || []).map((company) => (
              <div key={company.id}>
                <strong>{company.companyName}</strong>
                <span>{company.planName}</span>
                <span>{company.status}{company.overdueInvoices ? ` / ${company.overdueInvoices} overdue` : ''}</span>
                <span>{company.userUsed ?? 0}/{company.userLimit ?? company.userCount}</span>
                <span>{money(company.paidTotal)}</span>
                <span>{money(company.dueTotal)}</span>
                <span>
                  <button className="btn" type="button" onClick={() => resetManagerPassword(company)} disabled={resettingTenantId === company.id}>
                    {resettingTenantId === company.id ? 'Generating...' : 'Reset manager password'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="saas-card">
          <span>OMRAN SaaS billing</span>
          <h2>Invoices from OMRAN to companies</h2>
          <p>Track subscription plan, amount paid, remaining balance, due date, overdue status, and active or suspended company access.</p>
        </article>

        <article className="saas-card">
          <span>Access control</span>
          <h2>Platform-only permissions</h2>
          <p>Only OMRAN admins should manage tenants, SaaS invoices, subscription status, and platform-level logs.</p>
        </article>

        <article id="billing" className="saas-card wide">
          <div className="saas-section-title">
            <div>
              <span>OMRAN invoices</span>
              <h2>Subscription invoice control</h2>
            </div>
            <strong>{metrics?.overdueInvoices || 0} overdue</strong>
          </div>
          <div className="platform-billing-grid">
            <form className="platform-provision-form platform-billing-form" onSubmit={saveInvoice}>
              <label>
                <span>Company</span>
                <select value={invoiceForm.tenantId} onChange={(event) => setInvoiceForm((current) => ({ ...current, tenantId: event.target.value }))} required>
                  <option value="">Select company</option>
                  {(data?.companies || []).map((company) => (
                    <option key={company.id} value={company.id}>{company.companyName}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Amount</span>
                <input type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={(event) => setInvoiceForm((current) => ({ ...current, amount: event.target.value }))} required />
              </label>
              <label>
                <span>Currency</span>
                <input value={invoiceForm.currency} onChange={(event) => setInvoiceForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
              </label>
              <label>
                <span>Period</span>
                <input value={invoiceForm.periodLabel} onChange={(event) => setInvoiceForm((current) => ({ ...current, periodLabel: event.target.value }))} placeholder="June 2026" />
              </label>
              <label>
                <span>Issue date</span>
                <input type="date" value={invoiceForm.issueDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, issueDate: event.target.value }))} />
              </label>
              <label>
                <span>Due date</span>
                <input type="date" value={invoiceForm.dueDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label>
                <span>Status</span>
                <select value={invoiceForm.status} onChange={(event) => setInvoiceForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="paid">paid</option>
                  <option value="canceled">canceled</option>
                </select>
              </label>
              <label className="platform-billing-notes">
                <span>Notes</span>
                <textarea value={invoiceForm.notes} onChange={(event) => setInvoiceForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <button className="btn primary" type="submit" disabled={billingBusy}>{billingBusy ? 'Saving...' : editingInvoiceId ? 'Update invoice' : 'Create invoice'}</button>
              {editingInvoiceId ? <button className="btn" type="button" onClick={resetInvoiceForm}>Cancel edit</button> : null}
            </form>

            <div className="platform-billing-list">
              <div className="platform-billing-filters">
                <select value={invoiceFilters.tenantId} onChange={(event) => setInvoiceFilters((current) => ({ ...current, tenantId: event.target.value }))}>
                  <option value="">All companies</option>
                  {(data?.companies || []).map((company) => (
                    <option key={company.id} value={company.id}>{company.companyName}</option>
                  ))}
                </select>
                <select value={invoiceFilters.status} onChange={(event) => setInvoiceFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">All status</option>
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="paid">paid</option>
                  <option value="canceled">canceled</option>
                </select>
                <input type="date" value={invoiceFilters.from} onChange={(event) => setInvoiceFilters((current) => ({ ...current, from: event.target.value }))} />
                <input type="date" value={invoiceFilters.to} onChange={(event) => setInvoiceFilters((current) => ({ ...current, to: event.target.value }))} />
                <label className="platform-billing-check">
                  <input type="checkbox" checked={invoiceFilters.overdueOnly} onChange={(event) => setInvoiceFilters((current) => ({ ...current, overdueOnly: event.target.checked }))} />
                  <span>Overdue only</span>
                </label>
              </div>

              <div className="platform-billing-rows">
                {filteredInvoices.map((invoice) => {
                  const expanded = expandedInvoiceId === invoice.id;
                  return (
                    <article key={invoice.id} className={`platform-billing-row ${invoice.overdue ? 'overdue' : ''}`}>
                      <button type="button" className="platform-billing-main" onClick={() => setExpandedInvoiceId(expanded ? '' : invoice.id)}>
                        <span>
                          <strong>{invoice.invoiceNumber}</strong>
                          <small>{invoice.companyName}</small>
                        </span>
                        <span>{invoice.periodLabel || '-'}</span>
                        <span>{invoice.overdue ? 'overdue' : invoice.status}</span>
                        <span>{invoiceMoney(invoice.paid, invoice.currency)} paid</span>
                        <span>{invoiceMoney(invoice.due, invoice.currency)} due</span>
                        <b>{expanded ? '-' : '+'}</b>
                      </button>
                      {expanded ? (
                        <div className="platform-billing-detail">
                          <div className="platform-billing-actions">
                            <button className="btn" type="button" onClick={() => editInvoice(invoice)}>Edit</button>
                            <button className="btn" type="button" onClick={() => openAuthBlob(`/platform/saas-invoices/${invoice.id}/pdf`)}>PDF</button>
                            <button className="btn danger" type="button" onClick={() => deleteInvoice(invoice)} disabled={billingBusy}>Delete</button>
                          </div>
                          <div className="platform-billing-summary">
                            <div><span>Amount</span><strong>{invoiceMoney(invoice.amount, invoice.currency)}</strong></div>
                            <div><span>Paid</span><strong>{invoiceMoney(invoice.paid, invoice.currency)}</strong></div>
                            <div><span>Remaining</span><strong>{invoiceMoney(invoice.due, invoice.currency)}</strong></div>
                            <div><span>Due date</span><strong>{invoice.dueDate?.substring(0, 10) || '-'}</strong></div>
                          </div>
                          <div className="platform-payment-form">
                            <input type="number" min="0" step="0.01" placeholder="Amount" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))} />
                            <input value={paymentDraft.currency} onChange={(event) => setPaymentDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                            <input type="date" value={paymentDraft.paidDate} onChange={(event) => setPaymentDraft((current) => ({ ...current, paidDate: event.target.value }))} />
                            <input placeholder="Method" value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value }))} />
                            <input placeholder="Reference" value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} />
                            <button className="btn primary" type="button" onClick={() => addPayment(invoice)} disabled={billingBusy}>Add payment</button>
                          </div>
                          <div className="platform-payment-list">
                            {(invoice.payments || []).map((payment) => (
                              <div key={payment.id}>
                                <strong>{invoiceMoney(payment.amount, payment.currency)}</strong>
                                <span>{payment.paidDate?.substring(0, 10) || '-'}</span>
                                <span>{payment.method || '-'}</span>
                                <span>{payment.reference || '-'}</span>
                                <button className="btn danger" type="button" onClick={() => deletePayment(invoice, payment.id)} disabled={billingBusy}>Delete</button>
                              </div>
                            ))}
                            {(invoice.payments || []).length === 0 ? <p className="muted">No payments recorded yet.</p> : null}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {filteredInvoices.length === 0 ? <div className="muted">No SaaS invoices found.</div> : null}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
