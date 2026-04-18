'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';
import { DateInput } from '../ui/DateInput';
import { inDateRange, parseApiDateLocal } from '../../lib/date';

type Employee = { id: string; firstName: string; lastName: string };
type Customer = { id: string; companyName: string };
type Order = { id: string; title: string; customer?: Customer };
type Site = { id: string; orderId: string; siteName: string };
type InvoiceRef = { id: string; status: string };
type InvoiceLine = { invoice: InvoiceRef };

type DayType = 'work' | 'sick' | 'vacation' | 'holiday';

type WorkEntry = {
  id: string;
  workDate: string;
  employee: Employee;
  employeeId: string;
  order: Order;
  orderId: string;
  site: Site;
  siteId: string;
  hours: string;

  dayType?: DayType; // new
  isSick: boolean;   // legacy

  description?: string | null;
  invoiceLines: InvoiceLine[];
};

const empty = {
  workDate: new Date().toISOString().substring(0, 10),
  employeeId: '',
  orderId: '',
  siteId: '',
  hours: '1.0',
  dayType: 'work' as DayType,
  description: ''
};

function statusLabel(dayType?: DayType, isSick?: boolean) {
  const t = dayType || (isSick ? 'sick' : 'work');
  if (t === 'sick') return 'Krank';
  if (t === 'vacation') return 'Urlaub';
  if (t === 'holiday') return 'Feiertag';
  return null;
}

export default function WorkEntriesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [items, setItems] = useState<WorkEntry[]>([]);

  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const [form, setForm] = useState<any>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const [emps, os, ss, wes] = await Promise.all([
      apiGet<Employee[]>('/employees'),
      apiGet<Order[]>('/orders'),
      apiGet<Site[]>('/sites'),
      apiGet<WorkEntry[]>('/work-entries')
    ]);

    setEmployees(emps);
    setOrders(os);
    setSites(ss);
    setItems(wes);

    setForm((f: any) => {
      const next = { ...f };
      if (!next.employeeId && emps[0]) next.employeeId = emps[0].id;
      if (!next.orderId && os[0]) next.orderId = os[0].id;
      if (next.orderId && !next.siteId) {
        const firstSite = ss.find((x) => x.orderId === next.orderId) || ss[0];
        if (firstSite) next.siteId = firstSite.id;
      }
      if (!next.dayType) next.dayType = 'work';
      return next;
    });
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  const filteredSites = useMemo(() => {
    return sites.filter((s) => !form.orderId || s.orderId === form.orderId);
  }, [sites, form.orderId]);

  const visibleItems = useMemo(() => {
    if (!from && !to) return items;
    return items.filter((we) => {
      const d = parseApiDateLocal(we.workDate);
      if (!d) return false;
      return inDateRange(d, from, to);
    });
  }, [items, from, to]);

  useEffect(() => {
    if (!form.orderId) return;
    const ok = sites.find((s) => s.id === form.siteId && s.orderId === form.orderId);
    if (!ok) {
      const first = sites.find((s) => s.orderId === form.orderId);
      if (first && first.id !== form.siteId) setForm((f: any) => ({ ...f, siteId: first.id }));
    }
  }, [form.orderId, form.siteId, sites]);

  function startNew() {
    setEditingId(null);
    setForm((f: any) => {
      const employeeId = f.employeeId || employees[0]?.id || '';
      const orderId = f.orderId || orders[0]?.id || '';
      const currentSiteOk = sites.find((s) => s.id === f.siteId && s.orderId === orderId);
      const siteId = currentSiteOk?.id || sites.find((s) => s.orderId === orderId)?.id || '';

      return {
        ...empty,
        workDate: f.workDate || empty.workDate,
        employeeId,
        orderId,
        siteId,
        hours: '1.0',
        dayType: 'work',
        description: ''
      };
    });
  }

  function startEdit(we: WorkEntry) {
    const dt: DayType = (we.dayType as DayType) || (we.isSick ? 'sick' : 'work');
    setEditingId(we.id);
    setForm({
      workDate: we.workDate.substring(0, 10),
      employeeId: we.employeeId,
      orderId: we.orderId,
      siteId: we.siteId,
      dayType: dt,
      hours: dt === 'work' ? we.hours : '0',
      description: we.description || ''
    });
  }

  async function save() {
    if (!form.employeeId || !form.orderId || !form.siteId) return alert('Bitte Mitarbeiter, Auftrag und Baustelle auswählen.');
    if (!form.workDate) return alert('Bitte Datum wählen.');

    const dayType: DayType = (form.dayType || 'work') as DayType;
    const isAbsence = dayType !== 'work';

    let hoursNum = Number(form.hours);
    if (isAbsence) {
      hoursNum = 0;
    } else {
      if (!hoursNum || hoursNum <= 0) return alert('Stunden müssen > 0 sein.');
    }

    const payload = {
      ...form,
      dayType,
      isSick: dayType === 'sick', // legacy compatibility
      hours: String(hoursNum)
    };

    try {
      if (editingId) {
        await apiJson(`/work-entries/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/work-entries', 'POST', payload);
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
      await apiJson(`/work-entries/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const isAbsence = (form.dayType || 'work') !== 'work';

  const radioRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '18px auto',
    alignItems: 'center',
    columnGap: 10,
    justifyContent: 'start',
    width: 'max-content',
    cursor: 'pointer'
  };

  return (
    <div className="card">
      <h2>Arbeitszeiten erfassen</h2>
      <div className="muted">Jeder Eintrag erzeugt automatisch eine Entwurf-Rechnung – außer „Krank/Urlaub/Feiertag“.</div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Datum *</label>
          <input type="date" value={form.workDate || ''} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
        </div>
        <div>
          <label>Mitarbeiter *</label>
          <select value={form.employeeId || ''} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
            {employees.length === 0 && <option value="">(Bitte zuerst Mitarbeiter anlegen)</option>}
          </select>
        </div>
        <div>
          <label>Auftrag *</label>
          <select value={form.orderId || ''} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.customer?.companyName || '—'})
              </option>
            ))}
            {orders.length === 0 && <option value="">(Bitte zuerst Auftrag anlegen)</option>}
          </select>
        </div>
        <div>
          <label>Baustelle *</label>
          <select value={form.siteId || ''} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
            {filteredSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.siteName}
              </option>
            ))}
            {filteredSites.length === 0 && <option value="">(Keine Baustelle für diesen Auftrag)</option>}
          </select>
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Stunden *</label>
          <input value={form.hours || ''} disabled={isAbsence} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
        </div>

        {/* FIXED ALIGNMENT */}
        <div>
          <label>Status</label>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, paddingTop: 6 }}>
            <label style={radioRowStyle}>
              <input
                type="radio"
                name="dayType"
                checked={(form.dayType || 'work') === 'work'}
                onChange={() =>
                  setForm((f: any) => ({
                    ...f,
                    dayType: 'work',
                    hours: f.hours && Number(f.hours) > 0 ? f.hours : '1.0'
                  }))
                }
              />
              <span>Arbeit</span>
            </label>

            <label style={radioRowStyle}>
              <input
                type="radio"
                name="dayType"
                checked={form.dayType === 'sick'}
                onChange={() => setForm((f: any) => ({ ...f, dayType: 'sick', hours: '0' }))}
              />
              <span>Krank</span>
            </label>

            <label style={radioRowStyle}>
              <input
                type="radio"
                name="dayType"
                checked={form.dayType === 'vacation'}
                onChange={() => setForm((f: any) => ({ ...f, dayType: 'vacation', hours: '0' }))}
              />
              <span>Urlaub</span>
            </label>

            <label style={radioRowStyle}>
              <input
                type="radio"
                name="dayType"
                checked={form.dayType === 'holiday'}
                onChange={() => setForm((f: any) => ({ ...f, dayType: 'holiday', hours: '0' }))}
              />
              <span>Feiertag</span>
            </label>
          </div>
        </div>

        <div style={{ gridColumn: 'span 2' as any }}>
          <label>Beschreibung</label>
          <input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}>
          {editingId ? 'Speichern' : 'Anlegen'}
        </button>
        <button className="btn" onClick={startNew}>
          Neu
        </button>
      </div>

      <div className="spacer" />

      <h3>Filter</h3>
      <div className="row">
        <DateInput label="Von" value={from} onChange={setFrom} />
        <DateInput label="Bis" value={to} onChange={setTo} />
        <div style={{ alignSelf: 'end' }}>
          <button className="btn" type="button" onClick={() => { setFrom(undefined); setTo(undefined); }}>
            Zurücksetzen
          </button>
        </div>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Mitarbeiter</th>
            <th>Auftrag</th>
            <th>Baustelle</th>
            <th>Stunden / Status</th>
            <th>Entwurf-Rechnung</th>
            <th style={{ width: 240 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((we) => {
            const inv = we.invoiceLines?.[0]?.invoice;
            const st = statusLabel(we.dayType, we.isSick);
            return (
              <tr key={we.id}>
                <td>{we.workDate.substring(0, 10)}</td>
                <td>{we.employee.firstName} {we.employee.lastName}</td>
                <td>{we.order.title}</td>
                <td>{we.site.siteName}</td>
                <td>{st ? st : we.hours}</td>
                <td>
                  {inv ? <Link href={`/invoices/${inv.id}`}>{inv.id.substring(0, 8)}…</Link> : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => startEdit(we)}>Bearbeiten</button>
                    <button className="btn danger" onClick={() => del(we.id)}>Löschen</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {visibleItems.length === 0 && (
            <tr><td colSpan={7} className="muted">Keine Arbeitszeiten vorhanden.</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">
        Hinweis: Bearbeiten/Löschen ist nur möglich, solange die Arbeitszeit nicht in eine nicht-Entwurf-Rechnung übernommen oder auf mehrere Rechnungen aufgeteilt wurde.
      </div>
    </div>
  );
}
