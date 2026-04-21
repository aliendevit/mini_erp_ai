'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { useI18n } from '../../lib/i18n';
import { apiGet, apiJson } from '../../lib/api';
import { inDateRange, parseApiDateLocal } from '../../lib/date';
import { DateInput } from '../ui/DateInput';

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
  dayType?: DayType;
  isSick: boolean;
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
  description: '',
};

export default function WorkEntriesPage() {
  const { messages: m } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [items, setItems] = useState<WorkEntry[]>([]);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const [form, setForm] = useState<any>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  function statusLabel(dayType?: DayType, isSick?: boolean) {
    const resolved = dayType || (isSick ? 'sick' : 'work');
    if (resolved === 'work') return null;
    return m.statuses.workDay[resolved];
  }

  async function load() {
    const [nextEmployees, nextOrders, nextSites, nextEntries] = await Promise.all([
      apiGet<Employee[]>('/employees'),
      apiGet<Order[]>('/orders'),
      apiGet<Site[]>('/sites'),
      apiGet<WorkEntry[]>('/work-entries'),
    ]);

    setEmployees(nextEmployees);
    setOrders(nextOrders);
    setSites(nextSites);
    setItems(nextEntries);

    setForm((current: any) => {
      const next = { ...current };
      if (!next.employeeId && nextEmployees[0]) next.employeeId = nextEmployees[0].id;
      if (!next.orderId && nextOrders[0]) next.orderId = nextOrders[0].id;
      if (next.orderId && !next.siteId) {
        const firstSite = nextSites.find((site) => site.orderId === next.orderId) || nextSites[0];
        if (firstSite) next.siteId = firstSite.id;
      }
      if (!next.dayType) next.dayType = 'work';
      return next;
    });
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
  }, []);

  const filteredSites = useMemo(() => sites.filter((site) => !form.orderId || site.orderId === form.orderId), [sites, form.orderId]);

  const visibleItems = useMemo(() => {
    if (!from && !to) return items;
    return items.filter((entry) => {
      const date = parseApiDateLocal(entry.workDate);
      if (!date) return false;
      return inDateRange(date, from, to);
    });
  }, [items, from, to]);

  useEffect(() => {
    if (!form.orderId) return;
    const validSite = sites.find((site) => site.id === form.siteId && site.orderId === form.orderId);
    if (!validSite) {
      const firstSite = sites.find((site) => site.orderId === form.orderId);
      if (firstSite && firstSite.id !== form.siteId) {
        setForm((current: any) => ({ ...current, siteId: firstSite.id }));
      }
    }
  }, [form.orderId, form.siteId, sites]);

  function startNew() {
    setEditingId(null);
    setForm((current: any) => {
      const employeeId = current.employeeId || employees[0]?.id || '';
      const orderId = current.orderId || orders[0]?.id || '';
      const currentSite = sites.find((site) => site.id === current.siteId && site.orderId === orderId);
      const siteId = currentSite?.id || sites.find((site) => site.orderId === orderId)?.id || '';

      return {
        ...empty,
        workDate: current.workDate || empty.workDate,
        employeeId,
        orderId,
        siteId,
        hours: '1.0',
        dayType: 'work',
        description: '',
      };
    });
  }

  function startEdit(entry: WorkEntry) {
    const nextDayType: DayType = (entry.dayType as DayType) || (entry.isSick ? 'sick' : 'work');
    setEditingId(entry.id);
    setForm({
      workDate: entry.workDate.substring(0, 10),
      employeeId: entry.employeeId,
      orderId: entry.orderId,
      siteId: entry.siteId,
      dayType: nextDayType,
      hours: nextDayType === 'work' ? entry.hours : '0',
      description: entry.description || '',
    });
  }

  async function save() {
    if (!form.employeeId || !form.orderId || !form.siteId) return alert(m.workEntriesPage.requiredSelection);
    if (!form.workDate) return alert(m.workEntriesPage.requiredDate);

    const dayType: DayType = (form.dayType || 'work') as DayType;
    const isAbsence = dayType !== 'work';
    let hoursNum = Number(form.hours);
    if (isAbsence) {
      hoursNum = 0;
    } else if (!hoursNum || hoursNum <= 0) {
      return alert(m.workEntriesPage.positiveHours);
    }

    const payload = {
      ...form,
      dayType,
      isSick: dayType === 'sick',
      hours: String(hoursNum),
    };

    try {
      if (editingId) {
        await apiJson(`/work-entries/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/work-entries', 'POST', payload);
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
      await apiJson(`/work-entries/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  const isAbsence = (form.dayType || 'work') !== 'work';
  const radioRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '18px auto',
    alignItems: 'center',
    columnGap: 10,
    justifyContent: 'start',
    width: 'max-content',
    cursor: 'pointer',
  };

  return (
    <div className="card">
      <h2>{m.workEntriesPage.heading}</h2>
      <div className="muted">{m.workEntriesPage.description}</div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.common.date} *</label>
          <input type="date" value={form.workDate || ''} onChange={(event) => setForm({ ...form, workDate: event.target.value })} />
        </div>
        <div>
          <label>{m.common.employee} *</label>
          <select value={form.employeeId || ''} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
              </option>
            ))}
            {employees.length === 0 && <option value="">{m.workEntriesPage.noEmployeesOption}</option>}
          </select>
        </div>
        <div>
          <label>{m.common.order} *</label>
          <select value={form.orderId || ''} onChange={(event) => setForm({ ...form, orderId: event.target.value })}>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.title} ({order.customer?.companyName || m.common.none})
              </option>
            ))}
            {orders.length === 0 && <option value="">{m.workEntriesPage.noOrdersOption}</option>}
          </select>
        </div>
        <div>
          <label>{m.common.site} *</label>
          <select value={form.siteId || ''} onChange={(event) => setForm({ ...form, siteId: event.target.value })}>
            {filteredSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.siteName}
              </option>
            ))}
            {filteredSites.length === 0 && <option value="">{m.workEntriesPage.noSitesOption}</option>}
          </select>
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.common.hours} *</label>
          <input value={form.hours || ''} disabled={isAbsence} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
        </div>
        <div>
          <label>{m.workEntriesPage.workStatus}</label>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, paddingTop: 6 }}>
            {(['work', 'sick', 'vacation', 'holiday'] as DayType[]).map((entryType) => (
              <label key={entryType} style={radioRowStyle}>
                <input
                  type="radio"
                  name="dayType"
                  checked={(form.dayType || 'work') === entryType}
                  onChange={() =>
                    setForm((current: any) => ({
                      ...current,
                      dayType: entryType,
                      hours: entryType === 'work' ? (current.hours && Number(current.hours) > 0 ? current.hours : '1.0') : '0',
                    }))
                  }
                />
                <span>{m.statuses.workDay[entryType]}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ gridColumn: 'span 2' as const }}>
          <label>{m.common.description}</label>
          <input value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}>{editingId ? m.common.save : m.common.create}</button>
        <button className="btn" onClick={startNew}>{m.common.createNew}</button>
      </div>

      <div className="spacer" />

      <h3>{m.workEntriesPage.filterHeading}</h3>
      <div className="row">
        <DateInput label={m.common.start} value={from} onChange={setFrom} />
        <DateInput label={m.common.end} value={to} onChange={setTo} />
        <div style={{ alignSelf: 'end' }}>
          <button className="btn" type="button" onClick={() => { setFrom(undefined); setTo(undefined); }}>
            {m.common.reset}
          </button>
        </div>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>{m.common.date}</th>
            <th>{m.common.employee}</th>
            <th>{m.common.order}</th>
            <th>{m.common.site}</th>
            <th>{m.workEntriesPage.statusHours}</th>
            <th>{m.workEntriesPage.draftInvoice}</th>
            <th style={{ width: 240 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((entry) => {
            const invoice = entry.invoiceLines?.[0]?.invoice;
            const currentStatus = statusLabel(entry.dayType, entry.isSick);
            return (
              <tr key={entry.id}>
                <td>{entry.workDate.substring(0, 10)}</td>
                <td>{entry.employee.firstName} {entry.employee.lastName}</td>
                <td>{entry.order.title}</td>
                <td>{entry.site.siteName}</td>
                <td>{currentStatus || entry.hours}</td>
                <td>{invoice ? <Link href={`/invoices/${invoice.id}`}>{invoice.id.substring(0, 8)}…</Link> : m.common.none}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => startEdit(entry)}>{m.common.edit}</button>
                    <button className="btn danger" onClick={() => del(entry.id)}>{m.common.delete}</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {visibleItems.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">{m.workEntriesPage.noEntries}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.workEntriesPage.deleteHint}</div>
    </div>
  );
}
