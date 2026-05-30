'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { apiGet, apiJson } from '../../lib/api';

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

const empty: Partial<Site> = {
  orderId: '',
  siteName: '',
  street: '',
  zipCode: '',
  city: '',
  notes: '',
  isActive: true,
};

export default function SitesPage() {
  const { messages: m } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Site[]>([]);
  const [form, setForm] = useState<Partial<Site>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const [nextOrders, nextSites] = await Promise.all([apiGet<Order[]>('/orders'), apiGet<Site[]>('/sites')]);
    setOrders(nextOrders);
    setItems(nextSites);
    if (!editingId && !form.orderId && nextOrders.length > 0) {
      setForm((current) => ({ ...current, orderId: nextOrders[0].id }));
    }
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId(null);
    setForm({ ...empty, orderId: orders[0]?.id || '' });
  }

  function startEdit(site: Site) {
    setEditingId(site.id);
    setForm({ ...site, street: site.street || '', zipCode: site.zipCode || '', city: site.city || '', notes: site.notes || '' });
  }

  async function save() {
    if (!form.orderId) return alert(m.sitesPage.orderRequired);
    if (!form.siteName?.trim()) return alert(m.sitesPage.siteNameRequired);
    try {
      const payload = {
        orderId: form.orderId,
        siteName: form.siteName,
        street: form.street || null,
        zipCode: form.zipCode || null,
        city: form.city || null,
        notes: form.notes || null,
        isActive: true,
      };
      if (editingId) {
        await apiJson(`/sites/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/sites', 'POST', payload);
      }
      await load();
      startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function del(id: string) {
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/sites/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="entity-page sites-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">Work Areas</div>
          <h1>{m.sitesPage.heading}</h1>
          <p>Organize project locations and connect each site back to its active order.</p>
        </div>
        <div className="entity-hero-stats">
            <div className="entity-stat"><strong>{items.length}</strong><span>{m.nav.sites}</span></div>
            <div className="entity-stat"><strong>{items.filter((item) => item.isActive).length}</strong><span>{m.common.status}</span></div>
            <div className="entity-stat"><strong>{orders.length}</strong><span>{m.nav.orders}</span></div>
        </div>
      </section>

      <div className="card entity-panel">
      <h2>{m.sitesPage.heading}</h2>
      <div className="muted">{m.sitesPage.description}</div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.common.order} *</label>
          <select value={form.orderId || ''} onChange={(event) => setForm({ ...form, orderId: event.target.value })}>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.title} ({order.customer?.companyName || m.common.none})
              </option>
            ))}
            {orders.length === 0 && <option value="">{m.sitesPage.noOrdersOption}</option>}
          </select>
        </div>
        <div>
          <label>{m.common.name} *</label>
          <input value={form.siteName || ''} onChange={(event) => setForm({ ...form, siteName: event.target.value })} />
        </div>
        <div>
          <label>{m.common.city}</label>
          <input value={form.city || ''} onChange={(event) => setForm({ ...form, city: event.target.value })} />
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
          <label>{m.common.notes}</label>
          <input value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}>{editingId ? m.common.save : m.common.create}</button>
        <button className="btn" onClick={startNew}>{m.common.createNew}</button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>{m.common.site}</th>
            <th>{m.common.order}</th>
            <th>{m.common.customer}</th>
            <th style={{ width: 260 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((site) => (
            <tr key={site.id}>
              <td>{site.siteName}</td>
              <td>{site.order?.title || m.common.none}</td>
              <td>{site.order?.customer?.companyName || m.common.none}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={`/orders/${site.orderId}`}>{m.sitesPage.toOrder}</Link>
                  <button className="btn" onClick={() => startEdit(site)}>{m.common.edit}</button>
                  <button className="btn danger" onClick={() => del(site.id)}>{m.common.delete}</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">{m.sitesPage.noSites}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.sitesPage.deleteHint}</div>
      </div>
    </div>
  );
}
