'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { appConfirm } from '../../lib/dialog';
import { apiGet, apiJson } from '../../lib/api';
import { toYMD } from '../../lib/date';
import { DateInput } from '../ui/DateInput';
import { ListPager } from '../ui/ListPager';

type Customer = { id: string; companyName: string };

type Invoice = {
  id: string;
  status: string;
  invoiceNumber?: string | null;
  customer: Customer;
  createdAt: string;
  issueDate?: string | null;
  dueDate?: string | null;
  totalHours?: number;
  lineCount?: number;
  pauschalAmount?: string | number | null;
  totalAmount?: number;
  overdue?: boolean;
  paymentSummary?: {
    paidAmount: number;
    remainingBalance: number;
  };
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  metrics?: {
    total: number;
    draft: number;
    sent: number;
    partialPaid: number;
    paid: number;
    overdue: number;
    outstandingBalance: number;
    paidAmount: number;
    currency: string;
  };
};

const LIST_PAGE_SIZE = 12;

export default function InvoicesPage() {
  const { locale, messages: m } = useI18n();
  const [items, setItems] = useState<Invoice[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [metrics, setMetrics] = useState<PaginatedResponse<Invoice>['metrics'] | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const pageCopy = locale === 'ar'
    ? { kicker: 'الفوترة', description: 'مراجعة حالة الفواتير وتصفيتها وفتح مستندات الفوترة بسرعة.', createWorkshopInvoice: 'إنشاء فاتورة ورشة' }
    : locale === 'de'
      ? { kicker: 'Abrechnung', description: 'Rechnungsstatus pr?fen, nach Zeitraum filtern und Rechnungsdokumente schnell ?ffnen.', createWorkshopInvoice: 'Werkstattrechnung erstellen' }
      : { kicker: 'Billing', description: 'Review invoice status, filter by period, and open billing documents quickly.', createWorkshopInvoice: 'Create workshop invoice' };

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', toYMD(from));
    if (to) params.set('to', toYMD(to));
    params.set('paginated', 'true');
    params.set('page', String(page));
    params.set('pageSize', String(LIST_PAGE_SIZE));
    const search = params.toString();
    return search ? `?${search}` : '';
  }, [status, from, to, page]);

  async function load() {
    const data = await apiGet<PaginatedResponse<Invoice>>(`/invoices${query}`);
    setItems(data.items);
    setTotalItems(data.total);
    setMetrics(data.metrics || null);
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function del(id: string) {
    if (!(await appConfirm(m.common.deleteConfirm))) return;
    try {
      await apiJson(`/invoices/${id}`, 'DELETE');
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  }

  function resetPageAndSetStatus(value: string) {
    setPage(1);
    setStatus(value);
  }

  function resetDateRange() {
    setPage(1);
    setFrom(undefined);
    setTo(undefined);
  }

  function statusLabel(statusValue?: string | null) {
    if (!statusValue) return m.common.none;
    return m.statuses.invoice[statusValue as keyof typeof m.statuses.invoice] ?? statusValue;
  }

  return (
    <div className="entity-page invoices-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">{pageCopy.kicker}</div>
          <h1>{m.invoicesPage.heading}</h1>
          <p>{pageCopy.description}</p>
        </div>
        <div className="entity-hero-stats">
            <div className="entity-stat"><strong>{metrics?.total ?? totalItems}</strong><span>{m.nav.invoices}</span></div>
            <div className="entity-stat"><strong>{metrics?.draft ?? 0}</strong><span>{m.statuses.invoice.draft}</span></div>
            <div className="entity-stat"><strong>{metrics?.overdue ?? 0}</strong><span>Overdue</span></div>
            <div className="entity-stat"><strong>{Number(metrics?.outstandingBalance ?? 0).toFixed(2)}</strong><span>Outstanding</span></div>
        </div>
      </section>

      <div className="card entity-panel">
      <h2>{m.invoicesPage.heading}</h2>

      <div className="row">
        <div>
          <label>{m.invoicesPage.statusFilter}</label>
          <select value={status} onChange={(event) => resetPageAndSetStatus(event.target.value)}>
            <option value="">{m.invoicesPage.all}</option>
            <option value="draft">{m.statuses.invoice.draft}</option>
            <option value="final">{m.statuses.invoice.final}</option>
            <option value="sent">{m.statuses.invoice.sent}</option>
            <option value="partial_paid">Partial paid</option>
            <option value="paid">{m.statuses.invoice.paid}</option>
            <option value="canceled">{m.statuses.invoice.canceled}</option>
          </select>
        </div>

        <DateInput label={m.common.start} value={from} onChange={(value) => { setPage(1); setFrom(value); }} />
        <DateInput label={m.common.end} value={to} onChange={(value) => { setPage(1); setTo(value); }} />

        <div style={{ alignSelf: 'end' }}>
          <button className="btn" type="button" onClick={resetDateRange}>
            {m.common.reset}
          </button>
        </div>

        <div style={{ alignSelf: 'end' }}>
          <Link className="btn" href="/invoices/drafts">
            {m.invoicesPage.toDrafts}
          </Link>
        </div>

        <div style={{ alignSelf: 'end' }}>
          <Link className="btn primary" href="/invoices/new">
            {pageCopy.createWorkshopInvoice}
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
            <th>{m.common.amount}</th>
            <th>Paid / Due</th>
            <th>Due date</th>
            <th>{m.common.created}</th>
            <th style={{ width: 260 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.invoiceNumber || m.common.none}</td>
              <td>{invoice.customer?.companyName || m.common.none}</td>
              <td>{invoice.overdue ? 'Overdue' : statusLabel(invoice.status)}</td>
              <td>{Number(invoice.totalHours ?? 0).toFixed(2)}</td>
              <td>{invoice.lineCount ?? m.common.none}</td>
              <td>{Number(invoice.totalAmount ?? invoice.pauschalAmount ?? 0).toFixed(2)}</td>
              <td>{Number(invoice.paymentSummary?.paidAmount ?? 0).toFixed(2)} / {Number(invoice.paymentSummary?.remainingBalance ?? 0).toFixed(2)}</td>
              <td>{invoice.dueDate?.substring(0, 10) || m.common.none}</td>
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
              <td colSpan={10} className="muted">{m.invoicesPage.noInvoices}</td>
            </tr>
          )}
        </tbody>
      </table>
      <ListPager page={page} total={totalItems} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />

      <div className="spacer" />
      <div className="muted">{m.invoicesPage.deleteHint}</div>
      </div>
    </div>
  );
}
