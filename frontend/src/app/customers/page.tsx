'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';

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
  notes: ''
};

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [form, setForm] = useState<Partial<Customer>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const data = await apiGet<Customer[]>('/customers');
    setItems(data);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  function startNew() {
    setEditingId(null);
    setForm({ ...empty });
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({ ...c });
  }

  async function save() {
    if (!form.companyName?.trim()) return alert('Firmenname ist erforderlich.');
    setLoading(true);
    try {
      if (editingId) {
        await apiJson(`/customers/${editingId}`, 'PUT', form);
      } else {
        await apiJson('/customers', 'POST', form);
      }
      await load();
      startNew();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function del(id: string) {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/customers/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Kunden</h2>

      <div className="row">
        <div>
          <label>Firmenname *</label>
          <input value={form.companyName || ''} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </div>
        <div>
          <label>USt-IdNr</label>
          <input value={form.vatId || ''} onChange={(e) => setForm({ ...form, vatId: e.target.value })} />
        </div>
        <div>
          <label>Land</label>
          <input value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Straße</label>
          <input value={form.street || ''} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        </div>
        <div>
          <label>PLZ</label>
          <input value={form.zipCode || ''} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
        </div>
        <div>
          <label>Stadt</label>
          <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Ansprechpartner</label>
          <input value={form.contactName || ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        </div>
        <div>
          <label>Telefon</label>
          <input value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>
        <div>
          <label>E-Mail</label>
          <input value={form.contactEmail || ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>Notizen</label>
        <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div className="spacer" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save} disabled={loading}>
          {editingId ? 'Speichern' : 'Anlegen'}
        </button>
        <button className="btn" onClick={startNew} disabled={loading}>
          Neu
        </button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Firma</th>
            <th>Ort</th>
            <th>Kontakt</th>
            <th style={{ width: 220 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td>{c.companyName}</td>
              <td>{[c.zipCode, c.city].filter(Boolean).join(' ') || '—'}</td>
              <td>{c.contactName || '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => startEdit(c)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => del(c.id)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">Keine Kunden vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
