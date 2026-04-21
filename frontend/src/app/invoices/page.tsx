'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { apiGet, apiJson } from '../../lib/api';
import { toYMD } from '../../lib/date';
import { DateInput } from '../ui/DateInput';

type Customer = { id: string; companyName: string };

type Invoice = {
  id: string;
  status: string;
  invoiceNumber?: string | null;
  customer: Customer;
  createdAt: string;
  totalHours?: number;
  lineCount?: number;
};

export default function InvoicesPage() {
  const { messages: m } = useI18n();
  const [items, setItems] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<string>('');
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', toYMD(from));
    if (to) params.set('to', toYMD(to));
    const search = params.toString();
    return search ? `?${search}` : '';
  }, [status, from, to]);

  async function load() {
    setItems(await apiGet<Invoice[]>(`/invoices${query}`));
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function del(id: string) {
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/invoices/${id}`, 'DELETE');
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  }

  function statusLabel(statusValue?: string | null) {
    if (!statusValue) return m.common.none;
    return m.statuses.invoice[statusValue as keyof typeof m.statuses.invoice] ?? statusValue;
  }

  return (
    <div className="card">
      <h2>{m.invoicesPage.heading}</h2>

      <div className="row">
        <div>
          <label>{m.invoicesPage.statusFilter}</label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{m.invoicesPage.all}</option>
            <option value="draft">{m.statuses.invoice.draft}</option>
            <option value="final">{m.statuses.invoice.final}</option>
            <option value="sent">{m.statuses.invoice.sent}</option>
            <option value="paid">{m.statuses.invoice.paid}</option>
            <option value="canceled">{m.statuses.invoice.canceled}</option>
          </select>
        </div>

        <DateInput label={m.common.start} value={from} onChange={setFrom} />
        <DateInput label={m.common.end} value={to} onChange={setTo} />

        <div style={{ alignSelf: 'end' }}>
          <button className="btn" type="button" onClick={() => { setFrom(undefined); setTo(undefined); }}>
            {m.common.reset}
          </button>
        </div>

        <div style={{ alignSelf: 'end' }}>
          <Link className="btn" href="/invoices/drafts">
            {m.invoicesPage.toDrafts}
          </Link>
        </div>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>{m.invoicesPage.number}</th>
            <th>{m.common.customer}</th>
            <th>{m.common.status}</th>
            <th>{m.common.hours}</th>
            <th>{m.invoicesPage.positions}</th>
            <th>{m.common.created}</th>
            <th style={{ width: 260 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.invoiceNumber || m.common.none}</td>
              <td>{invoice.customer?.companyName || m.common.none}</td>
              <td>{statusLabel(invoice.status)}</td>
              <td>{Number(invoice.totalHours ?? 0).toFixed(2)}</td>
              <td>{invoice.lineCount ?? m.common.none}</td>
              <td>{invoice.createdAt?.substring(0, 10)}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={`/invoices/${invoice.id}`}>
                    {m.common.open}
                  </Link>
                  {invoice.status === 'draft' && (
                    <button className="btn danger" onClick={() => del(invoice.id)}>
                      {m.common.delete}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">{m.invoicesPage.noInvoices}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.invoicesPage.deleteHint}</div>
    </div>
  );
}
