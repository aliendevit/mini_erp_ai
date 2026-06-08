"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useI18n } from '../../lib/i18n';
import { apiGet, apiJson } from '../../lib/api';
import { fieldClass, SiteFormData, siteSchema, validationCopy } from '../../lib/form-validation';
import { getPageSlice, ListPager } from '../ui/ListPager';

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

const LIST_PAGE_SIZE = 12;

const empty: SiteFormData = {
  orderId: '',
  siteName: '',
  street: '',
  zipCode: '',
  city: '',
  notes: '',
  isActive: true,
};

function OptionalBadge({ label }: { label: string }) {
  return <span className="optional-badge">{label}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <div className="field-error">{message}</div> : null;
}

export default function SitesPage() {
  const { locale, messages: m } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Site[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const v = validationCopy(locale);
  const schema = useMemo(() => siteSchema(v, {
    orderId: m.common.order,
    siteName: m.common.name,
    street: m.common.street,
    city: m.common.city,
    notes: m.common.notes,
  }), [locale, m]);
  const pageCopy = locale === 'ar'
    ? { kicker: '\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644', description: '\u062a\u0646\u0638\u064a\u0645 \u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0639\u0645\u0644 \u0648\u0631\u0628\u0637 \u0643\u0644 \u0645\u0648\u0642\u0639 \u0628\u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0646\u0634\u0637.' }
    : locale === 'de'
      ? { kicker: 'Arbeitsbereiche', description: 'Projektstandorte organisieren und jeden Standort mit dem aktiven Auftrag verbinden.' }
      : { kicker: 'Work Areas', description: 'Organize project locations and connect each site back to its active order.' };

  const { register, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<SiteFormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: empty,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  async function load() {
    const [nextOrders, nextSites] = await Promise.all([apiGet<Order[]>('/orders'), apiGet<Site[]>('/sites')]);
    setOrders(nextOrders);
    setItems(nextSites);
    if (!editingId && !getValues('orderId') && nextOrders.length > 0) {
      setValue('orderId', nextOrders[0].id, { shouldValidate: true });
    }
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId(null);
    reset({ ...empty, orderId: orders[0]?.id || '' });
  }

  function startEdit(site: Site) {
    setEditingId(site.id);
    reset({
      orderId: site.orderId,
      siteName: site.siteName || '',
      street: site.street || '',
      zipCode: site.zipCode || '',
      city: site.city || '',
      notes: site.notes || '',
      isActive: site.isActive,
    });
  }

  async function save(data: SiteFormData) {
    try {
      const payload = {
        orderId: data.orderId,
        siteName: data.siteName,
        street: data.street || null,
        zipCode: data.zipCode || null,
        city: data.city || null,
        notes: data.notes || null,
        isActive: data.isActive,
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

  const pagedItems = getPageSlice(items, page, LIST_PAGE_SIZE);

  return (
    <div className="entity-page sites-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">{pageCopy.kicker}</div>
          <h1>{m.sitesPage.heading}</h1>
          <p>{pageCopy.description}</p>
        </div>
        <div className="entity-hero-stats">
          <div className="entity-stat"><strong>{items.length}</strong><span>{m.nav.sites}</span></div>
          <div className="entity-stat"><strong>{items.filter((item) => item.isActive).length}</strong><span>{m.common.status}</span></div>
          <div className="entity-stat"><strong>{orders.length}</strong><span>{m.nav.orders}</span></div>
        </div>
      </section>

      <form className="card entity-panel validated-form" onSubmit={handleSubmit(save)} noValidate>
        <h2>{m.sitesPage.heading}</h2>
        <div className="muted">{m.sitesPage.description}</div>
        <div className="form-required-note"><span>*</span> {v.requiredLabel}</div>

        <div className="spacer" />

        <div className="row">
          <div className="form-field">
            <label>{m.common.order} *</label>
            <select {...register('orderId')} className={fieldClass(!!errors.orderId)} aria-invalid={!!errors.orderId}>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{order.title} ({order.customer?.companyName || m.common.none})</option>
              ))}
              {orders.length === 0 && <option value="">{m.sitesPage.noOrdersOption}</option>}
            </select>
            <FieldError message={errors.orderId?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.name} *</label>
            <input {...register('siteName')} className={fieldClass(!!errors.siteName)} aria-invalid={!!errors.siteName} />
            <FieldError message={errors.siteName?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.city} *</label>
            <input {...register('city')} className={fieldClass(!!errors.city)} />
            <FieldError message={errors.city?.message} />
          </div>
        </div>

        <div className="spacer" />

        <div className="row">
          <div className="form-field">
            <label>{m.common.street} *</label>
            <input {...register('street')} className={fieldClass(!!errors.street)} />
            <FieldError message={errors.street?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.zipCode} <OptionalBadge label={v.optional} /></label>
            <input {...register('zipCode')} className={fieldClass(!!errors.zipCode)} />
            <FieldError message={errors.zipCode?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.notes} *</label>
            <input {...register('notes')} className={fieldClass(!!errors.notes)} />
            <FieldError message={errors.notes?.message} />
          </div>
        </div>

        <div className="spacer" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" type="submit">{editingId ? m.common.save : m.common.create}</button>
          <button className="btn" type="button" onClick={startNew}>{m.common.createNew}</button>
        </div>
      </form>

      <div className="card entity-panel">
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
            {pagedItems.map((site) => (
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
            {items.length === 0 && <tr><td colSpan={4} className="muted">{m.sitesPage.noSites}</td></tr>}
          </tbody>
        </table>
        <ListPager page={page} total={items.length} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />
        <div className="spacer" />
        <div className="muted">{m.sitesPage.deleteHint}</div>
      </div>
    </div>
  );
}

