"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useI18n } from '../../lib/i18n';
import { appConfirm } from '../../lib/dialog';
import { apiGet, apiJson } from '../../lib/api';
import { fieldClass, OrderFormData, orderSchema, sanitizeDecimalInput, validationCopy } from '../../lib/form-validation';
import { ListPager } from '../ui/ListPager';

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

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const LIST_PAGE_SIZE = 12;

const empty: OrderFormData = {
  customerId: '',
  orderNumber: '',
  title: '',
  description: '',
  status: 'open',
  defaultHourlyRate: '',
};

function OptionalBadge({ label }: { label: string }) {
  return <span className="optional-badge">{label}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <div className="field-error">{message}</div> : null;
}

export default function OrdersPage() {
  const { locale, messages: m } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Order[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const v = validationCopy(locale);
  const schema = useMemo(() => orderSchema(v, {
    customerId: m.common.customer,
    orderNumber: m.ordersPage.orderNumber,
    title: m.common.title,
    description: m.common.description,
    defaultHourlyRate: m.ordersPage.hourlyRate,
  }), [locale, m]);
  const pageCopy = locale === 'ar'
    ? { kicker: '\u0627\u0644\u062a\u0646\u0641\u064a\u0630', description: '\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0641\u062a\u062d \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639 \u0648\u0631\u0628\u0637\u0647\u0627 \u0628\u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u0648\u0631\u0634.' }
    : locale === 'de'
      ? { kicker: 'Ausfuehrung', description: 'Auftraege erstellen, Projektdetails oeffnen und Tracking mit Werkstattausfuehrung verbinden.' }
      : { kicker: 'Execution', description: 'Create orders, open detailed project views, and connect tracking with workshop execution.' };

  const { register, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<OrderFormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: empty,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });
  const hourlyRateField = register('defaultHourlyRate');

  async function load() {
    const [nextCustomers, nextOrders] = await Promise.all([
      apiGet<Customer[]>('/customers'),
      apiGet<PaginatedResponse<Order>>(`/orders?paginated=true&page=${page}&pageSize=${LIST_PAGE_SIZE}`),
    ]);
    setCustomers(nextCustomers);
    setItems(nextOrders.items);
    setTotalItems(nextOrders.total);
    if (!editingId && !getValues('customerId') && nextCustomers.length > 0) {
      setValue('customerId', nextCustomers[0].id, { shouldValidate: true });
    }
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function startNew() {
    setEditingId(null);
    reset({ ...empty, customerId: customers[0]?.id || '' });
  }

  function startEdit(order: Order) {
    setEditingId(order.id);
    reset({
      customerId: order.customerId,
      orderNumber: order.orderNumber || '',
      title: order.title || '',
      description: order.description || '',
      status: (order.status as OrderFormData['status']) || 'open',
      defaultHourlyRate: order.defaultHourlyRate || '',
    });
  }

  async function save(data: OrderFormData) {
    setLoading(true);
    try {
      const payload = {
        customerId: data.customerId,
        orderNumber: data.orderNumber || null,
        title: data.title,
        description: data.description || null,
        status: data.status || 'open',
        defaultHourlyRate: data.defaultHourlyRate || null,
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
    if (!(await appConfirm(m.common.deleteConfirm))) return;
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
          <div className="entity-kicker">{pageCopy.kicker}</div>
          <h1>{m.ordersPage.heading}</h1>
          <p>{pageCopy.description}</p>
        </div>
        <div className="entity-hero-stats">
          <div className="entity-stat"><strong>{totalItems}</strong><span>{m.nav.orders}</span></div>
          <div className="entity-stat"><strong>{items.filter((item) => item.status === 'open').length}</strong><span>{m.statuses.order.open}</span></div>
          <div className="entity-stat"><strong>{customers.length}</strong><span>{m.nav.customers}</span></div>
        </div>
      </section>

      <form className="card entity-panel validated-form" onSubmit={handleSubmit(save)} noValidate>
        <h2>{m.ordersPage.heading}</h2>
        <div className="form-required-note"><span>*</span> {v.requiredLabel}</div>

        <div className="row">
          <div className="form-field">
            <label>{m.common.customer} *</label>
            <select {...register('customerId')} className={fieldClass(!!errors.customerId)} aria-invalid={!!errors.customerId}>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
              {customers.length === 0 && <option value="">{m.ordersPage.noCustomersOption}</option>}
            </select>
            <FieldError message={errors.customerId?.message} />
          </div>
          <div className="form-field">
            <label>{m.ordersPage.orderNumber} *</label>
            <input {...register('orderNumber')} className={fieldClass(!!errors.orderNumber)} />
            <FieldError message={errors.orderNumber?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.status}</label>
            <select {...register('status')} className={fieldClass(!!errors.status)}>
              <option value="open">{m.statuses.order.open}</option>
              <option value="paused">{m.statuses.order.paused}</option>
              <option value="closed">{m.statuses.order.closed}</option>
            </select>
            <FieldError message={errors.status?.message} />
          </div>
        </div>

        <div className="spacer" />

        <div className="row">
          <div className="form-field">
            <label>{m.common.title} *</label>
            <input {...register('title')} className={fieldClass(!!errors.title)} aria-invalid={!!errors.title} />
            <FieldError message={errors.title?.message} />
          </div>
          <div className="form-field">
            <label>{m.ordersPage.hourlyRate} <OptionalBadge label={v.optional} /></label>
            <input
              {...hourlyRateField}
              inputMode="decimal"
              className={fieldClass(!!errors.defaultHourlyRate)}
              aria-invalid={!!errors.defaultHourlyRate}
              onChange={(event) => {
                event.target.value = sanitizeDecimalInput(event.target.value);
                hourlyRateField.onChange(event);
              }}
            />
            <FieldError message={errors.defaultHourlyRate?.message} />
          </div>
        </div>

        <div className="spacer" />
        <div className="form-field">
          <label>{m.common.description} *</label>
          <textarea {...register('description')} className={fieldClass(!!errors.description)} />
          <FieldError message={errors.description?.message} />
        </div>

        <div className="spacer" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" type="submit" disabled={loading}>{editingId ? m.common.save : m.common.create}</button>
          <button className="btn" type="button" onClick={startNew} disabled={loading}>{m.common.createNew}</button>
        </div>
      </form>

      <div className="card entity-panel">
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
            {totalItems === 0 && <tr><td colSpan={4} className="muted">{m.ordersPage.noOrders}</td></tr>}
          </tbody>
        </table>
        <ListPager page={page} total={totalItems} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />
        <div className="spacer" />
        <div className="muted">{m.ordersPage.deleteHint}</div>
      </div>
    </div>
  );
}

