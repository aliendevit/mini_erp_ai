'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { apiGet, apiJson } from '../../lib/api';

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
  defaultHourlyRate: '',
};

export default function OrdersPage() {
  const { messages: m } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Order[]>([]);
  const [form, setForm] = useState<Partial<Order>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [nextCustomers, nextOrders] = await Promise.all([
      apiGet<Customer[]>('/customers'),
      apiGet<Order[]>('/orders'),
    ]);
    setCustomers(nextCustomers);
    setItems(nextOrders);
    if (!editingId && !form.customerId && nextCustomers.length > 0) {
      setForm((current) => ({ ...current, customerId: nextCustomers[0].id }));
    }
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId(null);
    setForm({ ...empty, customerId: customers[0]?.id || '' });
  }

  function startEdit(order: Order) {
    setEditingId(order.id);
    setForm({
      id: order.id,
      customerId: order.customerId,
      orderNumber: order.orderNumber || '',
      title: order.title,
      description: order.description || '',
      status: order.status || 'open',
      defaultHourlyRate: order.defaultHourlyRate || '',
    });
  }

  async function save() {
    if (!form.customerId) return alert(m.ordersPage.customerRequired);
    if (!form.title?.trim()) return alert(m.ordersPage.titleRequired);

    setLoading(true);
    try {
      const payload = {
        customerId: form.customerId,
        orderNumber: form.orderNumber || null,
        title: form.title,
        description: form.description || null,
        status: form.status || 'open',
        defaultHourlyRate: form.defaultHourlyRate || null,
        currency: 'EUR',
      };
      if (editingId) {
        await apiJson(`/orders/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/orders', 'POST', payload);
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
      await apiJson(`/orders/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="entity-page orders-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">Execution</div>
          <h1>{m.ordersPage.heading}</h1>
          <p>Create orders, open detailed project views, and connect tracking with workshop execution.</p>
        </div>
        <div className="entity-hero-stats">
            <div className="entity-stat"><strong>{items.length}</strong><span>{m.nav.orders}</span></div>
            <div className="entity-stat"><strong>{items.filter((item) => item.status === 'open').length}</strong><span>{m.statuses.order.open}</span></div>
            <div className="entity-stat"><strong>{customers.length}</strong><span>{m.nav.customers}</span></div>
        </div>
      </section>

      <div className="card entity-panel">
      <h2>{m.ordersPage.heading}</h2>

      <div className="row">
        <div>
          <label>{m.common.customer} *</label>
          <select value={form.customerId || ''} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.companyName}</option>
            ))}
            {customers.length === 0 && <option value="">{m.ordersPage.noCustomersOption}</option>}
          </select>
        </div>
        <div>
          <label>{m.ordersPage.orderNumber}</label>
          <input value={(form.orderNumber as string) || ''} onChange={(event) => setForm({ ...form, orderNumber: event.target.value })} />
        </div>
        <div>
          <label>{m.common.status}</label>
          <select value={form.status || 'open'} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="open">{m.statuses.order.open}</option>
            <option value="paused">{m.statuses.order.paused}</option>
            <option value="closed">{m.statuses.order.closed}</option>
          </select>
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.common.title} *</label>
          <input value={form.title || ''} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </div>
        <div>
          <label>{m.ordersPage.hourlyRate}</label>
          <input value={(form.defaultHourlyRate as string) || ''} onChange={(event) => setForm({ ...form, defaultHourlyRate: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>{m.common.description}</label>
        <textarea value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save} disabled={loading}>{editingId ? m.common.save : m.common.create}</button>
        <button className="btn" onClick={startNew} disabled={loading}>{m.common.createNew}</button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>{m.common.title}</th>
            <th>{m.common.customer}</th>
            <th>{m.common.status}</th>
            <th style={{ width: 280 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id}>
              <td>{order.title}</td>
              <td>{order.customer?.companyName || m.common.none}</td>
              <td>{m.statuses.order[(order.status as 'open' | 'paused' | 'closed') || 'open'] || order.status}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={`/orders/${order.id}`}>{m.common.open}</Link>
                  <button className="btn" onClick={() => startEdit(order)}>{m.common.edit}</button>
                  <button className="btn danger" onClick={() => del(order.id)}>{m.common.delete}</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">{m.ordersPage.noOrders}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.ordersPage.deleteHint}</div>
      </div>
    </div>
  );
}
