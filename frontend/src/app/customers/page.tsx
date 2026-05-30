'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { apiGet, apiJson } from '../../lib/api';

type Customer = {
  id: string;
  companyName: string;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  country?: string | null;
  vatId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
};

const empty: Partial<Customer> = {
  companyName: '',
  street: '',
  zipCode: '',
  city: '',
  country: 'DE',
  vatId: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: '',
};

export default function CustomersPage() {
  const { messages: m } = useI18n();
  const [items, setItems] = useState<Customer[]>([]);
  const [form, setForm] = useState<Partial<Customer>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const data = await apiGet<Customer[]>('/customers');
    setItems(data);
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
  }, []);

  function startNew() {
    setEditingId(null);
    setForm({ ...empty });
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({ ...customer });
  }

  async function save() {
    if (!form.companyName?.trim()) return alert(m.customersPage.companyNameRequired);
    setLoading(true);
    try {
      if (editingId) {
        await apiJson(`/customers/${editingId}`, 'PUT', form);
      } else {
        await apiJson('/customers', 'POST', form);
      }
      await load();
      startNew();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function del(id: string) {
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/customers/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="entity-page customers-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">CRM</div>
          <h1>{m.customersPage.heading}</h1>
          <p>Manage customer profiles, contact details, and billing-ready business information.</p>
        </div>
        <div className="entity-hero-stats">
            <div className="entity-stat"><strong>{items.length}</strong><span>{m.nav.customers}</span></div>
            <div className="entity-stat"><strong>{items.filter((item) => item.contactEmail || item.contactPhone).length}</strong><span>{m.common.contact}</span></div>
            <div className="entity-stat"><strong>{editingId ? 'Edit' : 'New'}</strong><span>{m.common.status}</span></div>
        </div>
      </section>

      <div className="card entity-panel">
      <h2>{m.customersPage.heading}</h2>

      <div className="row">
        <div>
          <label>{m.customersPage.companyName} *</label>
          <input value={form.companyName || ''} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
        </div>
        <div>
          <label>{m.customersPage.vatId}</label>
          <input value={form.vatId || ''} onChange={(event) => setForm({ ...form, vatId: event.target.value })} />
        </div>
        <div>
          <label>{m.common.country}</label>
          <input value={form.country || ''} onChange={(event) => setForm({ ...form, country: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.common.street}</label>
          <input value={form.street || ''} onChange={(event) => setForm({ ...form, street: event.target.value })} />
        </div>
        <div>
          <label>{m.common.zipCode}</label>
          <input value={form.zipCode || ''} onChange={(event) => setForm({ ...form, zipCode: event.target.value })} />
        </div>
        <div>
          <label>{m.common.city}</label>
          <input value={form.city || ''} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.customersPage.contactName}</label>
          <input value={form.contactName || ''} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
        </div>
        <div>
          <label>{m.common.phone}</label>
          <input value={form.contactPhone || ''} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} />
        </div>
        <div>
          <label>{m.common.email}</label>
          <input value={form.contactEmail || ''} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>{m.common.notes}</label>
        <textarea value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </div>

      <div className="spacer" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save} disabled={loading}>
          {editingId ? m.common.save : m.common.create}
        </button>
        <button className="btn" onClick={startNew} disabled={loading}>
          {m.common.createNew}
        </button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>{m.customersPage.company}</th>
            <th>{m.customersPage.place}</th>
            <th>{m.common.contact}</th>
            <th style={{ width: 220 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.companyName}</td>
              <td>{[customer.zipCode, customer.city].filter(Boolean).join(' ') || m.common.none}</td>
              <td>{customer.contactName || m.common.none}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => startEdit(customer)}>{m.common.edit}</button>
                  <button className="btn danger" onClick={() => del(customer.id)}>{m.common.delete}</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">{m.customersPage.noCustomers}</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
