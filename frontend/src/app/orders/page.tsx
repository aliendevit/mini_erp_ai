'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';

type Customer = { id: string; companyName: string };

type Order = {
  id: string;
  customerId: string;
  customer?: Customer;
  orderNumber?: string | null;
  title: string;
  description?: string | null;
  status: string;
  defaultHourlyRate?: string | null;
  createdAt?: string;
};

const empty: Partial<Order> = {
  customerId: '',
  orderNumber: '',
  title: '',
  description: '',
  status: 'open',
  defaultHourlyRate: ''
};

export default function OrdersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Order[]>([]);
  const [form, setForm] = useState<Partial<Order>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [cs, os] = await Promise.all([
      apiGet<Customer[]>('/customers'),
      apiGet<Order[]>('/orders')
    ]);
    setCustomers(cs);
    setItems(os);
    if (!editingId && !form.customerId && cs.length > 0) {
      setForm((f) => ({ ...f, customerId: cs[0].id }));
    }
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId(null);
    setForm((f) => ({ ...empty, customerId: customers[0]?.id || '' }));
  }

  function startEdit(o: Order) {
    setEditingId(o.id);
    setForm({
      id: o.id,
      customerId: o.customerId,
      orderNumber: o.orderNumber || '',
      title: o.title,
      description: o.description || '',
      status: o.status || 'open',
      defaultHourlyRate: o.defaultHourlyRate || ''
    });
  }

  async function save() {
    if (!form.customerId) return alert('Bitte Kunde auswählen.');
    if (!form.title?.trim()) return alert('Titel ist erforderlich.');
    setLoading(true);
    try {
      const payload = {
        customerId: form.customerId,
        orderNumber: form.orderNumber || null,
        title: form.title,
        description: form.description || null,
        status: form.status || 'open',
        defaultHourlyRate: form.defaultHourlyRate || null,
        currency: 'EUR'
      };
      if (editingId) {
        await apiJson(`/orders/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/orders', 'POST', payload);
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
      await apiJson(`/orders/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Aufträge</h2>

      <div className="row">
        <div>
          <label>Kunde *</label>
          <select value={form.customerId || ''} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
            {customers.length === 0 && <option value="">(Bitte zuerst Kunden anlegen)</option>}
          </select>
        </div>
        <div>
          <label>Auftragsnummer</label>
          <input value={(form.orderNumber as string) || ''} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} />
        </div>
        <div>
          <label>Status</label>
          <select value={form.status || 'open'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="open">offen</option>
            <option value="paused">pausiert</option>
            <option value="closed">geschlossen</option>
          </select>
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Titel *</label>
          <input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label>Standard-Stundensatz (€)</label>
          <input value={(form.defaultHourlyRate as any) || ''} onChange={(e) => setForm({ ...form, defaultHourlyRate: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>Beschreibung</label>
        <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save} disabled={loading}>{editingId ? 'Speichern' : 'Anlegen'}</button>
        <button className="btn" onClick={startNew} disabled={loading}>Neu</button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Kunde</th>
            <th>Status</th>
            <th style={{ width: 280 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id}>
              <td>{o.title}</td>
              <td>{o.customer?.companyName || '—'}</td>
              <td>{o.status}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={`/orders/${o.id}`}>Öffnen</Link>
                  <button className="btn" onClick={() => startEdit(o)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => del(o.id)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} className="muted">Keine Aufträge vorhanden.</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">Hinweis: Löschen ist nur möglich, wenn keine Baustellen/Arbeitszeiten existieren (FK-Regeln).</div>
    </div>
  );
}
