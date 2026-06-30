'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useI18n } from '../../lib/i18n';
import { appConfirm } from '../../lib/dialog';
import { apiGet, apiJson } from '../../lib/api';
import {
  CustomerFormData,
  customerSchema,
  fieldClass,
  sanitizePhoneInput,
  validationCopy,
} from '../../lib/form-validation';
import { ListPager } from '../ui/ListPager';

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

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const LIST_PAGE_SIZE = 12;

const empty: CustomerFormData = {
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

function toForm(customer: Customer): CustomerFormData {
  return {
    companyName: customer.companyName || '',
    street: customer.street || '',
    zipCode: customer.zipCode || '',
    city: customer.city || '',
    country: customer.country || 'DE',
    vatId: customer.vatId || '',
    contactName: customer.contactName || '',
    contactPhone: customer.contactPhone || '',
    contactEmail: customer.contactEmail || '',
    notes: customer.notes || '',
  };
}

function OptionalBadge({ label }: { label: string }) {
  return <span className="optional-badge">{label}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <div className="field-error">{message}</div> : null;
}

export default function CustomersPage() {
  const { locale, messages: m } = useI18n();
  const [items, setItems] = useState<Customer[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const v = validationCopy(locale);
  const schema = useMemo(() => customerSchema(v, {
    companyName: m.customersPage.companyName,
    street: m.common.street,
    city: m.common.city,
    country: m.common.country,
    vatId: m.customersPage.vatId,
    contactName: m.customersPage.contactName,
    contactPhone: m.common.phone,
    contactEmail: m.common.email,
    notes: m.common.notes,
  }), [locale, m]);
  const pageCopy = locale === 'ar'
    ? { kicker: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621', description: '\u0625\u062f\u0627\u0631\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u062a\u0648\u0627\u0635\u0644 \u0648\u0627\u0644\u0641\u0648\u062a\u0631\u0629.', edit: '\u062a\u0639\u062f\u064a\u0644', new: '\u062c\u062f\u064a\u062f' }
    : locale === 'de'
      ? { kicker: 'CRM', description: 'Kundenprofile, Kontaktdaten und abrechnungsbereite Geschaeftsinformationen verwalten.', edit: 'Bearbeiten', new: 'Neu' }
      : { kicker: 'CRM', description: 'Manage customer profiles, contact details, and billing-ready business information.', edit: 'Edit', new: 'New' };

  const { register, handleSubmit, reset, formState: { errors, touchedFields } } = useForm<CustomerFormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: empty,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });
  const phoneField = register('contactPhone');

  async function load() {
    const data = await apiGet<PaginatedResponse<Customer>>(`/customers?paginated=true&page=${page}&pageSize=${LIST_PAGE_SIZE}`);
    setItems(data.items);
    setTotalItems(data.total);
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
  }, [page]);

  function startNew() {
    setEditingId(null);
    reset({ ...empty });
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    reset(toForm(customer));
  }

  async function save(data: CustomerFormData) {
    setLoading(true);
    try {
      const payload = {
        ...data,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
      };
      if (editingId) {
        await apiJson(`/customers/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/customers', 'POST', payload);
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
          <div className="entity-kicker">{pageCopy.kicker}</div>
          <h1>{m.customersPage.heading}</h1>
          <p>{pageCopy.description}</p>
        </div>
        <div className="entity-hero-stats">
          <div className="entity-stat"><strong>{totalItems}</strong><span>{m.nav.customers}</span></div>
          <div className="entity-stat"><strong>{items.filter((item) => item.contactEmail || item.contactPhone).length}</strong><span>{m.common.contact}</span></div>
          <div className="entity-stat"><strong>{editingId ? pageCopy.edit : pageCopy.new}</strong><span>{m.common.status}</span></div>
        </div>
      </section>

      <form className="card entity-panel validated-form" onSubmit={handleSubmit(save)} noValidate>
        <h2>{m.customersPage.heading}</h2>
        <div className="form-required-note"><span>*</span> {v.requiredLabel}</div>

        <div className="row">
          <div className="form-field">
            <label>{m.customersPage.companyName} *</label>
            <input {...register('companyName')} className={fieldClass(!!errors.companyName)} aria-invalid={!!errors.companyName} />
            <FieldError message={errors.companyName?.message} />
          </div>
          <div className="form-field">
            <label>{m.customersPage.vatId} *</label>
            <input {...register('vatId')} className={fieldClass(!!errors.vatId)} />
            <FieldError message={errors.vatId?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.country} *</label>
            <input {...register('country')} className={fieldClass(!!errors.country)} />
            <FieldError message={errors.country?.message} />
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
            <label>{m.common.city} *</label>
            <input {...register('city')} className={fieldClass(!!errors.city)} />
            <FieldError message={errors.city?.message} />
          </div>
        </div>

        <div className="spacer" />

        <div className="row">
          <div className="form-field">
            <label>{m.customersPage.contactName} *</label>
            <input {...register('contactName')} className={fieldClass(!!errors.contactName)} />
            <FieldError message={errors.contactName?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.phone} *</label>
            <input
              {...phoneField}
              type="tel"
              inputMode="tel"
              className={fieldClass(!!errors.contactPhone)}
              aria-invalid={!!errors.contactPhone}
              onChange={(event) => {
                event.target.value = sanitizePhoneInput(event.target.value);
                phoneField.onChange(event);
              }}
            />
            <FieldError message={errors.contactPhone?.message} />
          </div>
          <div className="form-field">
            <label>{m.common.email} <OptionalBadge label={v.optional} /></label>
            <input {...register('contactEmail')} type="email" className={fieldClass(!!errors.contactEmail)} aria-invalid={!!errors.contactEmail} />
            <FieldError message={errors.contactEmail?.message} />
          </div>
        </div>

        <div className="spacer" />
        <div className="form-field">
          <label>{m.common.notes} *</label>
          <textarea {...register('notes')} className={fieldClass(!!errors.notes)} />
          <FieldError message={errors.notes?.message} />
        </div>

        <div className="spacer" />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" type="submit" disabled={loading}>
            {editingId ? m.common.save : m.common.create}
          </button>
          <button className="btn" type="button" onClick={startNew} disabled={loading}>
            {m.common.createNew}
          </button>
        </div>
      </form>

      <div className="card entity-panel">
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
            {totalItems === 0 && (
              <tr>
                <td colSpan={4} className="muted">{m.customersPage.noCustomers}</td>
              </tr>
            )}
          </tbody>
        </table>
        <ListPager page={page} total={totalItems} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}

