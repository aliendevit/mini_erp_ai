"use client";

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { apiGet, apiJson } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { appConfirm } from '../../lib/dialog';
import { fieldClass, sanitizePhoneInput, validationCopy, WorkshopFormData, workshopSchema } from '../../lib/form-validation';
import { getPageSlice, ListPager } from '../ui/ListPager';

type Workshop = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  specialties: string[];
  notes?: string | null;
  availabilityStatus?: 'available' | 'not_available';
  availabilityNote?: string | null;
  isActive: boolean;
};

const LIST_PAGE_SIZE = 12;

const emptyForm: WorkshopFormData = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  specialties: '',
  notes: '',
  availabilityStatus: 'available',
  availabilityNote: '',
  isActive: true,
};

function parseList(value?: string): string[] {
  return (value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(values?: string[] | null): string {
  return (values || []).join(', ');
}

function OptionalBadge({ label }: { label: string }) {
  return <span className="optional-badge">{label}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <div className="field-error">{message}</div> : null;
}

export default function WorkshopsPage() {
  const { locale } = useI18n();
  const t = locale === 'ar'
    ? {
        deleteConfirm: '\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0648\u0631\u0634\u0629\u061f \u064a\u062c\u0628 \u0625\u0632\u0627\u0644\u0629 \u0627\u0631\u062a\u0628\u0627\u0637\u0627\u062a \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0623\u0648\u0644\u0627\u064b.',
        kicker: '\u0627\u0644\u0634\u0631\u0643\u0627\u0621', heading: '\u0648\u0631\u0634 \u0627\u0644\u062a\u0646\u0641\u064a\u0630', description: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0648\u0631\u0634 \u0627\u0644\u0645\u062a\u0639\u0627\u0642\u062f\u0629 \u0648\u0627\u0644\u0627\u062e\u062a\u0635\u0627\u0635\u0627\u062a \u0648\u062d\u0627\u0644\u0629 \u0627\u0644\u062a\u0648\u0641\u0631.', workshops: '\u0627\u0644\u0648\u0631\u0634', available: '\u0645\u062a\u0627\u062d\u0629', active: '\u0646\u0634\u0637\u0629', inactive: '\u063a\u064a\u0631 \u0646\u0634\u0637\u0629',
        panelDescription: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0648\u0631\u0634 \u0627\u0644\u0645\u0648\u062b\u0648\u0642\u0629 \u0648\u0627\u062e\u062a\u0635\u0627\u0635\u0627\u062a \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u062a\u064a \u062a\u063a\u0637\u064a\u0647\u0627.', newWorkshop: '\u0648\u0631\u0634\u0629 \u062c\u062f\u064a\u062f\u0629', name: '\u0627\u0644\u0627\u0633\u0645', contactPerson: '\u0627\u0644\u0634\u062e\u0635 \u0627\u0644\u0645\u0633\u0624\u0648\u0644', phone: '\u0627\u0644\u0647\u0627\u062a\u0641', email: '\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',
        specialties: '\u0627\u0644\u0627\u062e\u062a\u0635\u0627\u0635\u0627\u062a / \u0627\u0644\u0645\u0647\u0646', specialtiesPlaceholder: '\u062f\u0647\u0627\u0646\u060c \u0639\u0632\u0644\u060c \u0628\u0644\u0627\u0637', notes: '\u0645\u0644\u0627\u062d\u0638\u0627\u062a', availability: '\u0627\u0644\u062a\u0648\u0641\u0631', notAvailable: '\u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629', availabilityNote: '\u0645\u0644\u0627\u062d\u0638\u0629 \u0627\u0644\u062a\u0648\u0641\u0631', availabilityPlaceholder: '\u0645\u062b\u0644\u0627\u064b: \u0645\u0634\u063a\u0648\u0644\u0629 \u062d\u062a\u0649 \u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u0642\u0627\u062f\u0645',
        saving: '\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638...', saveWorkshop: '\u062d\u0641\u0638 \u0627\u0644\u0648\u0631\u0634\u0629', createWorkshop: '\u0625\u0646\u0634\u0627\u0621 \u0648\u0631\u0634\u0629', contact: '\u0627\u0644\u062a\u0648\u0627\u0635\u0644', status: '\u0627\u0644\u062d\u0627\u0644\u0629', actions: '\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a', edit: '\u062a\u0639\u062f\u064a\u0644', delete: '\u062d\u0630\u0641', none: '\u063a\u064a\u0631 \u0645\u0630\u0643\u0648\u0631', noWorkshops: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0648\u0631\u0634 \u0628\u0639\u062f.', loading: '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...'
      }
    : locale === 'de'
      ? {
        deleteConfirm: 'Diese Werkstatt loeschen? Bestehende Standortzuweisungen muessen zuerst entfernt werden.',
        kicker: 'Partner', heading: 'Werkstattpartner', description: 'Vertrauenswuerdige Subunternehmer-Werkstaetten, Gewerke und Verfuegbarkeit verwalten.', workshops: 'Werkstaetten', available: 'Verfuegbar', active: 'Aktiv', inactive: 'Inaktiv',
        panelDescription: 'Vertrauenswuerdige Werkstaetten und ihre Gewerke verwalten.', newWorkshop: 'Neue Werkstatt', name: 'Name', contactPerson: 'Ansprechpartner', phone: 'Telefon', email: 'E-Mail',
        specialties: 'Spezialisierungen / Gewerke', specialtiesPlaceholder: 'Maler, Abdichtung, Fliesen', notes: 'Notizen', availability: 'Verfuegbarkeit', notAvailable: 'Nicht verfuegbar', availabilityNote: 'Verfuegbarkeitshinweis', availabilityPlaceholder: 'z. B. bis naechste Woche ausgelastet',
        saving: 'Speichern...', saveWorkshop: 'Werkstatt speichern', createWorkshop: 'Werkstatt erstellen', contact: 'Kontakt', status: 'Status', actions: 'Aktionen', edit: 'Bearbeiten', delete: 'Loeschen', none: 'Keine', noWorkshops: 'Noch keine Werkstaetten.', loading: 'Wird geladen...'
      }
      : {
        deleteConfirm: 'Delete this workshop? Existing site assignments must be removed first.',
        kicker: 'Partners', heading: 'Workshop Partners', description: 'Manage trusted subcontractor workshops, trade coverage, and availability status.', workshops: 'Workshops', available: 'Available', active: 'Active', inactive: 'Inactive',
        panelDescription: 'Manage trusted subcontractor workshops and their trade specialties.', newWorkshop: 'New workshop', name: 'Name', contactPerson: 'Contact person', phone: 'Phone', email: 'Email',
        specialties: 'Specialties / trades', specialtiesPlaceholder: 'painting, waterproofing, tiles', notes: 'Notes', availability: 'Availability', notAvailable: 'Not available', availabilityNote: 'Availability note', availabilityPlaceholder: 'e.g. busy until next week',
        saving: 'Saving...', saveWorkshop: 'Save workshop', createWorkshop: 'Create workshop', contact: 'Contact', status: 'Status', actions: 'Actions', edit: 'Edit', delete: 'Delete', none: 'None', noWorkshops: 'No workshops yet.', loading: 'Loading...'
      };
  const [items, setItems] = useState<Workshop[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const v = validationCopy(locale);
  const schema = useMemo(() => workshopSchema(v, {
    name: t.name,
    contactName: t.contactPerson,
    phone: t.phone,
    email: t.email,
    specialties: t.specialties,
    notes: t.notes,
    availabilityNote: t.availabilityNote,
  }), [locale, t.name, t.phone, t.email]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<WorkshopFormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: emptyForm,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });
  const phoneField = register('phone');

  async function load() {
    setLoading(true);
    try {
      setItems(await apiGet<Workshop[]>('/workshops'));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setEditingId(null);
    reset({ ...emptyForm });
  }

  function startEdit(item: Workshop) {
    setEditingId(item.id);
    reset({
      name: item.name || '',
      contactName: item.contactName || '',
      phone: item.phone || '',
      email: item.email || '',
      specialties: listText(item.specialties),
      notes: item.notes || '',
      availabilityStatus: item.availabilityStatus || 'available',
      availabilityNote: item.availabilityNote || '',
      isActive: item.isActive,
    });
  }

  async function save(data: WorkshopFormData) {
    setSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        contactName: data.contactName || null,
        phone: data.phone || null,
        email: data.email || null,
        specialties: parseList(data.specialties),
        notes: data.notes || null,
        availabilityStatus: data.availabilityStatus,
        availabilityNote: data.availabilityNote || null,
        isActive: data.isActive,
      };
      if (editingId) {
        await apiJson(`/workshops/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/workshops', 'POST', payload);
      }
      await load();
      startNew();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await appConfirm(t.deleteConfirm))) return;
    try {
      await apiJson(`/workshops/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  const pagedItems = getPageSlice(items, page, LIST_PAGE_SIZE);

  return (
    <div className="entity-page workshops-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">{t.kicker}</div>
          <h1>{t.heading}</h1>
          <p>{t.description}</p>
        </div>
        <div className="entity-hero-stats">
          <div className="entity-stat"><strong>{items.length}</strong><span>{t.workshops}</span></div>
          <div className="entity-stat"><strong>{items.filter((item) => item.availabilityStatus !== 'not_available').length}</strong><span>{t.available}</span></div>
          <div className="entity-stat"><strong>{items.filter((item) => item.isActive).length}</strong><span>{t.active}</span></div>
        </div>
      </section>

      <form className="card entity-panel validated-form" onSubmit={handleSubmit(save)} noValidate>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2>{t.heading}</h2>
            <div className="muted">{t.panelDescription}</div>
          </div>
          <button className="btn" type="button" onClick={startNew}>{t.newWorkshop}</button>
        </div>
        <div className="form-required-note"><span>*</span> {v.requiredLabel}</div>

        <div className="spacer" />
        <div className="row">
          <div className="form-field">
            <label>{t.name} *</label>
            <input {...register('name')} className={fieldClass(!!errors.name)} aria-invalid={!!errors.name} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="form-field">
            <label>{t.contactPerson} *</label>
            <input {...register('contactName')} className={fieldClass(!!errors.contactName)} />
            <FieldError message={errors.contactName?.message} />
          </div>
          <div className="form-field">
            <label>{t.phone} *</label>
            <input
              {...phoneField}
              type="tel"
              inputMode="tel"
              className={fieldClass(!!errors.phone)}
              aria-invalid={!!errors.phone}
              onChange={(event) => {
                event.target.value = sanitizePhoneInput(event.target.value);
                phoneField.onChange(event);
              }}
            />
            <FieldError message={errors.phone?.message} />
          </div>
          <div className="form-field">
            <label>{t.email} <OptionalBadge label={v.optional} /></label>
            <input {...register('email')} type="email" className={fieldClass(!!errors.email)} aria-invalid={!!errors.email} />
            <FieldError message={errors.email?.message} />
          </div>
        </div>

        <div className="spacer" />
        <div className="row">
          <div className="form-field">
            <label>{t.specialties} *</label>
            <textarea {...register('specialties')} className={fieldClass(!!errors.specialties)} placeholder={t.specialtiesPlaceholder} />
            <FieldError message={errors.specialties?.message} />
          </div>
          <div className="form-field">
            <label>{t.notes} *</label>
            <textarea {...register('notes')} className={fieldClass(!!errors.notes)} />
            <FieldError message={errors.notes?.message} />
          </div>
          <div className="form-field">
            <label>{t.availability}</label>
            <select {...register('availabilityStatus')} className={fieldClass(!!errors.availabilityStatus)}>
              <option value="available">{t.available}</option>
              <option value="not_available">{t.notAvailable}</option>
            </select>
            <FieldError message={errors.availabilityStatus?.message} />
          </div>
          <label className="checkbox-field" style={{ alignSelf: 'end' }}>
            <input type="checkbox" {...register('isActive')} />
            {t.active}
          </label>
        </div>

        <div className="spacer" />
        <div className="form-field">
          <label>{t.availabilityNote} *</label>
          <input {...register('availabilityNote')} className={fieldClass(!!errors.availabilityNote)} placeholder={t.availabilityPlaceholder} />
          <FieldError message={errors.availabilityNote?.message} />
        </div>

        <div className="spacer" />
        <button className="btn primary" type="submit" disabled={saving}>{saving ? t.saving : editingId ? t.saveWorkshop : t.createWorkshop}</button>
      </form>

      <div className="card entity-panel">
        <table className="table">
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>{t.contact}</th>
              <th>{t.specialties}</th>
              <th>{t.status}</th>
              <th style={{ width: 220 }}>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{[item.contactName, item.phone, item.email].filter(Boolean).join(' | ') || t.none}</td>
                <td>{listText(item.specialties) || t.none}</td>
                <td>
                  <div>{item.isActive ? t.active : t.inactive}</div>
                  <div style={{ color: item.availabilityStatus === 'not_available' ? '#ff6b6b' : '#39d98a', fontWeight: 700 }}>
                    {item.availabilityStatus === 'not_available' ? t.notAvailable : t.available}
                  </div>
                  {item.availabilityNote && <div className="muted">{item.availabilityNote}</div>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => startEdit(item)}>{t.edit}</button>
                    <button className="btn danger" onClick={() => remove(item.id)}>{t.delete}</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="muted">{t.noWorkshops}</td></tr>}
            {loading && <tr><td colSpan={5} className="muted">{t.loading}</td></tr>}
          </tbody>
        </table>
        <ListPager page={page} total={items.length} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}

