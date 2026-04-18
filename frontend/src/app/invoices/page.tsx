'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';
import { DateInput } from '../ui/DateInput';
import { toYMD } from '../../lib/date';

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

const STATUS_DE: Record<string, string> = {
  draft: 'Entwurf',
  final: 'Final',
  sent: 'Gesendet',
  paid: 'Bezahlt',
  canceled: 'Storniert'
};

function statusLabel(status?: string | null) {
  if (!status) return '—';
  return STATUS_DE[status] ?? status;
}

export default function InvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<string>('');
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (from) p.set('from', toYMD(from));
    if (to) p.set('to', toYMD(to));
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [status, from, to]);

  async function load() {
    setItems(await apiGet<Invoice[]>(`/invoices${query}`));
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function del(id: string) {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/invoices/${id}`, 'DELETE');
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Rechnungen</h2>

      <div className="row">
        <div>
          <label>Status-Filter</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">(alle)</option>
            <option value="draft">Entwurf</option>
            <option value="final">Final</option>
            <option value="sent">Gesendet</option>
            <option value="paid">Bezahlt</option>
            <option value="canceled">Storniert</option>
          </select>
        </div>

        <DateInput label="Von" value={from} onChange={setFrom} />
        <DateInput label="Bis" value={to} onChange={setTo} />
        <div style={{ alignSelf: 'end' }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setFrom(undefined);
              setTo(undefined);
            }}
          >
            Zurücksetzen
          </button>
        </div>

        <div style={{ alignSelf: 'end' }}>
          <Link className="btn" href="/invoices/drafts">
            Zu Entwürfen
          </Link>
        </div>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Nr</th>
            <th>Kunde</th>
            <th>Status</th>
            <th>Stunden</th>
            <th>Positionen</th>
            <th>Erstellt</th>
            <th style={{ width: 260 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.invoiceNumber || '—'}</td>
              <td>{inv.customer?.companyName || '—'}</td>
              <td>{statusLabel(inv.status)}</td>
              <td>{Number(inv.totalHours ?? 0).toFixed(2)}</td>
              <td>{inv.lineCount ?? '—'}</td>
              <td>{inv.createdAt?.substring(0, 10)}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={`/invoices/${inv.id}`}>
                    Öffnen
                  </Link>
                  {inv.status === 'draft' && (
                    <button className="btn danger" onClick={() => del(inv.id)}>
                      Löschen
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                Keine Rechnungen vorhanden.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">Hinweis: Löschen ist nur für Entwurf-Rechnungen möglich.</div>
    </div>
  );
}
