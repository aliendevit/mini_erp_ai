'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';

type Customer = { id: string; companyName: string };

type Order = { id: string; title: string; customer?: Customer };

type Site = {
  id: string;
  orderId: string;
  order?: Order;
  siteName: string;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  notes?: string | null;
  isActive: boolean;
};

const empty: Partial<Site> = { orderId: '', siteName: '', street: '', zipCode: '', city: '', notes: '', isActive: true };

export default function SitesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Site[]>([]);
  const [form, setForm] = useState<Partial<Site>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const [os, ss] = await Promise.all([
      apiGet<Order[]>('/orders'),
      apiGet<Site[]>('/sites')
    ]);
    setOrders(os);
    setItems(ss);
    if (!editingId && !form.orderId && os.length > 0) setForm((f) => ({ ...f, orderId: os[0].id }));
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId(null);
    setForm((f) => ({ ...empty, orderId: orders[0]?.id || '' }));
  }

  function startEdit(s: Site) {
    setEditingId(s.id);
    setForm({ ...s, street: s.street || '', zipCode: s.zipCode || '', city: s.city || '', notes: s.notes || '' });
  }

  async function save() {
    if (!form.orderId) return alert('Bitte Auftrag auswählen.');
    if (!form.siteName?.trim()) return alert('Baustellenname ist erforderlich.');
    try {
      const payload = {
        orderId: form.orderId,
        siteName: form.siteName,
        street: form.street || null,
        zipCode: form.zipCode || null,
        city: form.city || null,
        notes: form.notes || null,
        isActive: true
      };
      if (editingId) {
        await apiJson(`/sites/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/sites', 'POST', payload);
      }
      await load();
      startNew();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function del(id: string) {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/sites/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Baustellen</h2>
      <div className="muted">Stand-alone Übersicht + CRUD. Zusätzlich findest du Baustellen auch im jeweiligen Auftrag.</div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Auftrag *</label>
          <select value={form.orderId || ''} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{o.title} ({o.customer?.companyName || '—'})</option>
            ))}
            {orders.length === 0 && <option value="">(Bitte zuerst Auftrag anlegen)</option>}
          </select>
        </div>
        <div>
          <label>Name *</label>
          <input value={form.siteName || ''} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
        </div>
        <div>
          <label>Stadt</label>
          <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
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
          <label>Notizen</label>
          <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}>{editingId ? 'Speichern' : 'Anlegen'}</button>
        <button className="btn" onClick={startNew}>Neu</button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Baustelle</th>
            <th>Auftrag</th>
            <th>Kunde</th>
            <th style={{ width: 260 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>{s.siteName}</td>
              <td>{s.order?.title || '—'}</td>
              <td>{s.order?.customer?.companyName || '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={`/orders/${s.orderId}`}>Zum Auftrag</Link>
                  <button className="btn" onClick={() => startEdit(s)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => del(s.id)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} className="muted">Keine Baustellen vorhanden.</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">Hinweis: Löschen ist nur möglich, wenn keine Arbeitszeiten/Zuordnungen existieren (FK-Regeln).</div>
    </div>
  );
}
