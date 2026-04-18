'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE, apiGet, apiJson, DELETE_CONFIRM } from '../../../lib/api';

type Customer = { id: string; companyName: string };

type Employee = { id: string; firstName: string; lastName: string };

type Order = { id: string; title: string };

type Site = { id: string; siteName: string };

type WorkEntry = {
  id: string;
  workDate: string;
  employee: Employee;
  order: Order;
  site: Site;
};

type InvoiceLine = {
  id: string;
  serviceDate: string;
  description?: string | null;
  hoursAllocated: string;
  unitRate?: string | null;
  lineAmount?: string | null;
  workEntry: WorkEntry;
};

type Invoice = {
  id: string;
  status: string;
  invoiceNumber?: string | null;
  customer: Customer;
  issueDate?: string | null;
  notes?: string | null;
  pauschalAmount?: string | null;
  createdAt: string;
  totalHours?: number;
  lines: InvoiceLine[];
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [status, setStatus] = useState('draft');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [pauschalAmount, setPauschalAmount] = useState('');

  const totalAmount = useMemo(() => {
    if (!inv) return 0;
    return inv.lines.reduce((acc, l) => acc + Number(l.lineAmount || 0), 0);
  }, [inv]);

  async function load() {
    const data = await apiGet<Invoice>(`/invoices/${id}`);
    setInv(data);
    setInvoiceNumber(data.invoiceNumber || '');
    setStatus(data.status);
    const today = new Date().toISOString().substring(0, 10);
    setIssueDate(data.issueDate ? data.issueDate.substring(0, 10) : today);
    setNotes(data.notes || '');
    setPauschalAmount(data.pauschalAmount ? String(data.pauschalAmount) : '');
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!inv) return;
    setLoading(true);
    try {
      await apiJson(`/invoices/${inv.id}`, 'PUT', {
        status,
        issueDate: issueDate ? issueDate : null,
        notes: notes || null,
        pauschalAmount: pauschalAmount === '' ? null : Number(pauschalAmount)
      });
      await load();
      alert('Gespeichert.');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function del() {
    if (!inv) return;
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/invoices/${inv.id}`, 'DELETE');
      router.push('/invoices');
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!inv) {
    return <div className="card"><div className="muted">Lade…</div></div>;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Rechnung</h2>
          <div className="muted">ID: {inv.id}</div>
          <div className="muted">Kunde: {inv.customer?.companyName || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/invoices">Zurück</Link>
          {inv.status !== 'draft' && (
            <>
              <a className="btn" href={`${API_BASE}/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">PDF (detailliert)</a>
              <a className="btn" href={`${API_BASE}/invoices/${inv.id}/pdf/pauschal`} target="_blank" rel="noreferrer">PDF (Pauschal)</a>
              <a className="btn" href={`${API_BASE}/invoices/${inv.id}/word`} target="_blank" rel="noreferrer">Word (detailliert)</a>
              <a className="btn" href={`${API_BASE}/invoices/${inv.id}/word/pauschal`} target="_blank" rel="noreferrer">Word (Pauschal)</a>
            </>
          )}
          {inv.status === 'draft' && <button className="btn danger" onClick={del}>Löschen</button>}
        </div>
      </div>

      {inv.status === 'draft' && (
        <>
          <div className="spacer" />
          <div className="muted">
            Hinweis: Entwürfe bekommen keine Rechnungsnummer. Export ist erst nach „Zusammenführen" (Final) möglich.
          </div>
        </>
      )}

      <div className="spacer" />

      <h3>Rechnung bearbeiten</h3>
      <div className="row">
        <div>
          <label>Rechnungsnummer</label>
          <input value={invoiceNumber} disabled />
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Entwurf</option>
            <option value="final">Final</option>
            <option value="sent">Gesendet</option>
            <option value="paid">Bezahlt</option>
            <option value="canceled">Storniert</option>
          </select>
        </div>
        <div>
          <label>Rechnungsdatum</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <label>Pauschalbetrag (optional)</label>
          <input
            type="number"
            step="0.01"
            value={pauschalAmount}
            onChange={(e) => setPauschalAmount(e.target.value)}
            placeholder="z.B. 4400.00"
          />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>Notizen</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="spacer" />
      <button className="btn primary" onClick={save} disabled={loading}>Speichern</button>

      <div className="spacer" />
      <hr />

      <h3>Positionen</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Beschreibung</th>
            <th>Mitarbeiter</th>
            <th>Auftrag</th>
            <th>Baustelle</th>
            <th style={{ textAlign: 'right' }}>Stunden</th>
            <th style={{ textAlign: 'right' }}>Satz</th>
            <th style={{ textAlign: 'right' }}>Betrag</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.serviceDate?.substring(0, 10)}</td>
              <td>{l.description || '—'}</td>
              <td>{l.workEntry?.employee ? `${l.workEntry.employee.firstName} ${l.workEntry.employee.lastName}` : '—'}</td>
              <td>{l.workEntry?.order?.title || '—'}</td>
              <td>{l.workEntry?.site?.siteName || '—'}</td>
              <td style={{ textAlign: 'right' }}>{Number(l.hoursAllocated).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{l.unitRate ? `${Number(l.unitRate).toFixed(2)} €` : '—'}</td>
              <td style={{ textAlign: 'right' }}>{l.lineAmount ? `${Number(l.lineAmount).toFixed(2)} €` : '—'}</td>
            </tr>
          ))}
          {inv.lines.length === 0 && (
            <tr><td colSpan={8} className="muted">Keine Positionen.</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div><b>Summe Stunden:</b> {Number(inv.totalHours ?? 0).toFixed(2)}</div>
        <div><b>Summe Betrag:</b> {totalAmount.toFixed(2)} €</div>
      </div>

      <div className="spacer" />
      <div className="muted">Hinweis: Löschen ist nur für Entwurf-Rechnungen möglich.</div>
    </div>
  );
}
