'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useI18n } from '../../../lib/i18n';
import { API_BASE, apiGet, apiJson } from '../../../lib/api';

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
  const { messages: m } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [status, setStatus] = useState('draft');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');

  const totalAmount = useMemo(() => {
    if (!invoice) return 0;
    const lineTotal = invoice.lines.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0);
    return lineTotal > 0 ? lineTotal : Number(invoice.pauschalAmount || 0);
  }, [invoice]);

  async function load() {
    const nextInvoice = await apiGet<Invoice>(`/invoices/${id}`);
    setInvoice(nextInvoice);
    setInvoiceNumber(nextInvoice.invoiceNumber || '');
    setStatus(nextInvoice.status);
    setIssueDate(nextInvoice.issueDate ? nextInvoice.issueDate.substring(0, 10) : new Date().toISOString().substring(0, 10));
    setNotes(nextInvoice.notes || '');
    setFixedAmount(nextInvoice.pauschalAmount ? String(nextInvoice.pauschalAmount) : '');
  }

  useEffect(() => {
    if (!id) return;
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!invoice) return;
    setLoading(true);
    try {
      await apiJson(`/invoices/${invoice.id}`, 'PUT', {
        status,
        issueDate: issueDate || null,
        notes: notes || null,
        pauschalAmount: fixedAmount === '' ? null : Number(fixedAmount),
      });
      await load();
      alert(m.common.updateSuccess);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function del() {
    if (!invoice) return;
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/invoices/${invoice.id}`, 'DELETE');
      router.push('/invoices');
    } catch (error: any) {
      alert(error.message);
    }
  }

  if (!invoice) {
    return <div className="card"><div className="muted">{m.common.loading}</div></div>;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>{m.invoiceDetailPage.heading}</h2>
          <div className="muted">{m.common.id}: {invoice.id}</div>
          <div className="muted">{m.invoiceDetailPage.customer}: {invoice.customer?.companyName || m.common.none}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/invoices">{m.common.back}</Link>
          {invoice.status !== 'draft' && (
            <>
              <a className="btn" href={`${API_BASE}/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">{m.invoiceDetailPage.detailedPdf}</a>
              <a className="btn" href={`${API_BASE}/invoices/${invoice.id}/pdf/pauschal`} target="_blank" rel="noreferrer">{m.invoiceDetailPage.fixedPdf}</a>
              <a className="btn" href={`${API_BASE}/invoices/${invoice.id}/word`} target="_blank" rel="noreferrer">{m.invoiceDetailPage.detailedWord}</a>
              <a className="btn" href={`${API_BASE}/invoices/${invoice.id}/word/pauschal`} target="_blank" rel="noreferrer">{m.invoiceDetailPage.fixedWord}</a>
            </>
          )}
          {invoice.status === 'draft' && <button className="btn danger" onClick={del}>{m.common.delete}</button>}
        </div>
      </div>

      {invoice.status === 'draft' && (
        <>
          <div className="spacer" />
          <div className="muted">{m.invoiceDetailPage.draftHint}</div>
        </>
      )}

      <div className="spacer" />

      <h3>{m.invoiceDetailPage.editHeading}</h3>
      <div className="row">
        <div>
          <label>{m.invoiceDetailPage.invoiceNumber}</label>
          <input value={invoiceNumber} disabled />
        </div>
        <div>
          <label>{m.common.status}</label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="draft">{m.statuses.invoice.draft}</option>
            <option value="final">{m.statuses.invoice.final}</option>
            <option value="sent">{m.statuses.invoice.sent}</option>
            <option value="paid">{m.statuses.invoice.paid}</option>
            <option value="canceled">{m.statuses.invoice.canceled}</option>
          </select>
        </div>
        <div>
          <label>{m.invoiceDetailPage.issueDate}</label>
          <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
        </div>
        <div>
          <label>{m.invoiceDetailPage.fixedAmount}</label>
          <input
            type="number"
            step="0.01"
            value={fixedAmount}
            onChange={(event) => setFixedAmount(event.target.value)}
            placeholder={m.invoiceDetailPage.fixedAmountPlaceholder}
          />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>{m.common.notes}</label>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>

      <div className="spacer" />
      <button className="btn primary" onClick={save} disabled={loading}>{m.common.save}</button>

      <div className="spacer" />
      <hr />

      <h3>{m.invoiceDetailPage.positions}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>{m.common.date}</th>
            <th>{m.common.description}</th>
            <th>{m.common.employee}</th>
            <th>{m.common.order}</th>
            <th>{m.common.site}</th>
            <th style={{ textAlign: 'right' }}>{m.common.hours}</th>
            <th style={{ textAlign: 'right' }}>{m.common.rate}</th>
            <th style={{ textAlign: 'right' }}>{m.common.amount}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.serviceDate?.substring(0, 10)}</td>
              <td>{line.description || m.common.none}</td>
              <td>{line.workEntry?.employee ? `${line.workEntry.employee.firstName} ${line.workEntry.employee.lastName}` : m.common.none}</td>
              <td>{line.workEntry?.order?.title || m.common.none}</td>
              <td>{line.workEntry?.site?.siteName || m.common.none}</td>
              <td style={{ textAlign: 'right' }}>{Number(line.hoursAllocated).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{line.unitRate ? `${Number(line.unitRate).toFixed(2)} EUR` : m.common.none}</td>
              <td style={{ textAlign: 'right' }}>{line.lineAmount ? `${Number(line.lineAmount).toFixed(2)} EUR` : m.common.none}</td>
            </tr>
          ))}
          {invoice.lines.length === 0 && (
            <tr><td colSpan={8} className="muted">{m.invoiceDetailPage.noLines}</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div><b>{m.invoiceDetailPage.totalHours}:</b> {Number(invoice.totalHours ?? 0).toFixed(2)}</div>
        <div><b>{m.invoiceDetailPage.totalAmount}:</b> {totalAmount.toFixed(2)} EUR</div>
      </div>

      <div className="spacer" />
      <div className="muted">{m.invoiceDetailPage.deleteHint}</div>
    </div>
  );
}
