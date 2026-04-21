'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useI18n } from '../../../../lib/i18n';
import { apiGet, apiJson } from '../../../../lib/api';

type Customer = { id: string; companyName: string };
type Employee = { id: string; firstName: string; lastName: string };
type Site = { id: string; siteName: string };
type Order = { id: string; title: string };

type WorkEntry = {
  id: string;
  workDate: string;
  employee: Employee;
  site: Site;
  order: Order;
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

type DraftInvoice = {
  id: string;
  customer: Customer;
  createdAt: string;
  lineCount: number;
  totalHours: number;
  lines: InvoiceLine[];
};

type Payload = {
  groupBy: string;
  key: string;
  keyName: string;
  invoices: DraftInvoice[];
};

function parseSplits(text: string): number[] {
  const cleaned = text
    .split(/[;,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(',', '.'));
  return cleaned.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
}

function DraftGroupContent() {
  const { messages: m } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupBy = (searchParams.get('groupBy') || 'employee') as 'employee' | 'site' | 'order';
  const key = searchParams.get('key') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  const [data, setData] = useState<Payload | null>(null);
  const [splitsText, setSplitsText] = useState('');
  const [working, setWorking] = useState(false);

  async function load() {
    if (!key) return;
    const params = new URLSearchParams({ groupBy, key });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const nextData = await apiGet<Payload>(`/invoices/drafts/group?${params.toString()}`);
    setData(nextData);
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, key, from, to]);

  const totalHours = useMemo(() => {
    if (!data) return 0;
    return data.invoices.reduce((sum, invoice) => sum + Number(invoice.totalHours || 0), 0);
  }, [data]);

  const allLines = useMemo(() => {
    if (!data) return [] as InvoiceLine[];
    const lines = data.invoices.flatMap((invoice) => invoice.lines);
    return lines.sort((left, right) => new Date(left.serviceDate).getTime() - new Date(right.serviceDate).getTime());
  }, [data]);

  async function merge() {
    if (!data) return;
    const sourceInvoiceIds = data.invoices.map((invoice) => invoice.id);
    if (sourceInvoiceIds.length === 0) return alert(m.invoiceDraftGroupPage.noDraftFound);
    const splits = splitsText.trim() ? parseSplits(splitsText) : undefined;

    setWorking(true);
    try {
      const response = await apiJson<{ createdInvoiceIds: string[] }>('/invoices/merge', 'POST', {
        groupBy,
        key,
        sourceInvoiceIds,
        splits,
      });
      alert(`${m.invoiceDraftGroupPage.mergeSuccess} ${response.createdInvoiceIds.join(', ')}`);
      router.push('/invoices');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setWorking(false);
    }
  }

  if (!key) {
    return (
      <div className="card">
        <h2>{m.invoiceDraftGroupPage.heading}</h2>
        <div className="muted">{m.invoiceDraftGroupPage.missingKey}</div>
        <div className="spacer" />
        <Link className="btn" href="/invoices/drafts">{m.common.back}</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <h2>{m.invoiceDraftGroupPage.heading}</h2>
        <div className="muted">{m.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>{m.invoiceDraftGroupPage.heading}</h2>
          <div className="muted">{m.invoiceDraftGroupPage.grouping}: {m.statuses.groupBy[groupBy]} · {m.common.group}: {data.keyName}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/invoices/drafts">{m.common.back}</Link>
          <Link className="btn" href="/invoices">{m.invoiceDraftsPage.allInvoices}</Link>
        </div>
      </div>

      <div className="spacer" />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div><b>{m.invoiceDraftGroupPage.draftCount}:</b> {data.invoices.length}</div>
        <div><b>{m.invoiceDraftGroupPage.totalHours}:</b> {totalHours.toFixed(2)}</div>
      </div>

      <div className="spacer" />
      <hr />

      <h3>{m.invoiceDraftsPage.heading}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>{m.common.id}</th>
            <th>{m.common.created}</th>
            <th style={{ textAlign: 'right' }}>{m.invoicesPage.positions}</th>
            <th style={{ textAlign: 'right' }}>{m.common.hours}</th>
          </tr>
        </thead>
        <tbody>
          {data.invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.id}</td>
              <td>{String(invoice.createdAt).substring(0, 10)}</td>
              <td style={{ textAlign: 'right' }}>{invoice.lineCount}</td>
              <td style={{ textAlign: 'right' }}>{Number(invoice.totalHours).toFixed(2)}</td>
            </tr>
          ))}
          {data.invoices.length === 0 && <tr><td colSpan={4} className="muted">{m.invoiceDraftGroupPage.noDrafts}</td></tr>}
        </tbody>
      </table>

      <div className="spacer" />
      <hr />

      <h3>{m.invoiceDraftGroupPage.positionsDetail}</h3>
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
          {allLines.map((line) => (
            <tr key={line.id}>
              <td>{String(line.serviceDate).substring(0, 10)}</td>
              <td>{line.description || m.common.none}</td>
              <td>{line.workEntry?.employee ? `${line.workEntry.employee.firstName} ${line.workEntry.employee.lastName}` : m.common.none}</td>
              <td>{line.workEntry?.order?.title || m.common.none}</td>
              <td>{line.workEntry?.site?.siteName || m.common.none}</td>
              <td style={{ textAlign: 'right' }}>{Number(line.hoursAllocated).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{line.unitRate ? `${Number(line.unitRate).toFixed(2)} EUR` : m.common.none}</td>
              <td style={{ textAlign: 'right' }}>{line.lineAmount ? `${Number(line.lineAmount).toFixed(2)} EUR` : m.common.none}</td>
            </tr>
          ))}
          {allLines.length === 0 && <tr><td colSpan={8} className="muted">{m.invoiceDraftGroupPage.noLines}</td></tr>}
        </tbody>
      </table>

      <div className="spacer" />
      <hr />

      <h3>{m.invoiceDraftGroupPage.mergeHeading}</h3>
      <div className="row">
        <div>
          <label>{m.invoiceDraftGroupPage.targetCount}</label>
          <div className="muted">{m.invoiceDraftGroupPage.targetCountHint}</div>
        </div>
      </div>
      <div className="row">
        <div>
          <label>{m.invoiceDraftGroupPage.splitHours}</label>
          <input value={splitsText} onChange={(event) => setSplitsText(event.target.value)} placeholder={m.invoiceDraftGroupPage.splitPlaceholder} />
          <div className="muted">{m.invoiceDraftGroupPage.splitHint} {totalHours.toFixed(2)}.</div>
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button className="btn primary" onClick={merge} disabled={working || data.invoices.length === 0}>
            {m.invoiceDraftGroupPage.merge}
          </button>
        </div>
      </div>

      <div className="spacer" />
      <div className="muted">{m.invoiceDraftGroupPage.deleteHint}</div>
    </div>
  );
}

export default function DraftGroupPage() {
  const { messages: m } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="card">
          <h2>{m.invoiceDraftGroupPage.heading}</h2>
          <div className="muted">{m.common.loading}</div>
        </div>
      }
    >
      <DraftGroupContent />
    </Suspense>
  );
}
