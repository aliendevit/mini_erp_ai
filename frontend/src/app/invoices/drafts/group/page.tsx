'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(',', '.'));
  return cleaned.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

export default function DraftGroupPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const groupBy = (sp.get('groupBy') || 'employee') as 'employee' | 'site' | 'order';
  const key = sp.get('key') || '';
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';

  const [data, setData] = useState<Payload | null>(null);
  const [splitsText, setSplitsText] = useState('');
  const [working, setWorking] = useState(false);

  async function load() {
    if (!key) return;
    const p = new URLSearchParams({ groupBy, key });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const d = await apiGet<Payload>(`/invoices/drafts/group?${p.toString()}`);
    setData(d);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, key, from, to]);

  const totalHours = useMemo(() => {
    if (!data) return 0;
    return data.invoices.reduce((acc, i) => acc + Number(i.totalHours || 0), 0);
  }, [data]);

  const allLines = useMemo(() => {
    if (!data) return [] as InvoiceLine[];
    const lines = data.invoices.flatMap((i) => i.lines);
    return lines.sort((a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime());
  }, [data]);

  async function merge() {
    if (!data) return;
    const sourceInvoiceIds = data.invoices.map((i) => i.id);
    if (sourceInvoiceIds.length === 0) return alert('Keine Entwürfe gefunden.');

    const splits = splitsText.trim() ? parseSplits(splitsText) : undefined;

    setWorking(true);
    try {
      const resp = await apiJson<{ createdInvoiceIds: string[] }>(
        '/invoices/merge',
        'POST',
        {
          groupBy,
          key,
          sourceInvoiceIds,
          splits
        }
      );
      alert(`Zusammengeführt. Neue Rechnung(en): ${resp.createdInvoiceIds.join(', ')}`);
      router.push('/invoices');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWorking(false);
    }
  }

  if (!key) {
    return (
      <div className="card">
        <h2>Entwurf-Gruppe</h2>
        <div className="muted">Fehlender Parameter: key</div>
        <div className="spacer" />
        <Link className="btn" href="/invoices/drafts">Zurück</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <h2>Entwurf-Gruppe</h2>
        <div className="muted">Lade…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Entwurf-Gruppe</h2>
          <div className="muted">Gruppierung: {groupBy} · Gruppe: {data.keyName}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/invoices/drafts">Zurück</Link>
          <Link className="btn" href="/invoices">Alle Rechnungen</Link>
        </div>
      </div>

      <div className="spacer" />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div><b>Anzahl Entwürfe:</b> {data.invoices.length}</div>
        <div><b>Gesamtstunden:</b> {totalHours.toFixed(2)}</div>
      </div>

      <div className="spacer" />
      <hr />

      <h3>Entwürfe</h3>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Erstellt</th>
            <th style={{ textAlign: 'right' }}>Positionen</th>
            <th style={{ textAlign: 'right' }}>Stunden</th>
          </tr>
        </thead>
        <tbody>
          {data.invoices.map((i) => (
            <tr key={i.id}>
              <td>{i.id}</td>
              <td>{String(i.createdAt).substring(0, 10)}</td>
              <td style={{ textAlign: 'right' }}>{i.lineCount}</td>
              <td style={{ textAlign: 'right' }}>{Number(i.totalHours).toFixed(2)}</td>
            </tr>
          ))}
          {data.invoices.length === 0 && <tr><td colSpan={4} className="muted">Keine Entwürfe.</td></tr>}
        </tbody>
      </table>

      <div className="spacer" />
      <hr />

      <h3>Positionen (Details)</h3>
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
          {allLines.map((l) => (
            <tr key={l.id}>
              <td>{String(l.serviceDate).substring(0, 10)}</td>
              <td>{l.description || '—'}</td>
              <td>{l.workEntry?.employee ? `${l.workEntry.employee.firstName} ${l.workEntry.employee.lastName}` : '—'}</td>
              <td>{l.workEntry?.order?.title || '—'}</td>
              <td>{l.workEntry?.site?.siteName || '—'}</td>
              <td style={{ textAlign: 'right' }}>{Number(l.hoursAllocated).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{l.unitRate ? `${Number(l.unitRate).toFixed(2)} €` : '—'}</td>
              <td style={{ textAlign: 'right' }}>{l.lineAmount ? `${Number(l.lineAmount).toFixed(2)} €` : '—'}</td>
            </tr>
          ))}
          {allLines.length === 0 && <tr><td colSpan={8} className="muted">Keine Positionen.</td></tr>}
        </tbody>
      </table>

      <div className="spacer" />
      <hr />

      <h3>Zusammenführen</h3>
      <div className="row">
        <div>
          <label>Anzahl Ziel-Rechnungen</label>
          <div className="muted">Leer lassen = automatisch 1 Rechnung mit allen Stunden.</div>
        </div>
      </div>
      <div className="row">
        <div>
          <label>Stunden pro Rechnung (nur wenn Anzahl {'>'} 1)</label>
          <input
            value={splitsText}
            onChange={(e) => setSplitsText(e.target.value)}
            placeholder="z.B. 4, 6"
          />
          <div className="muted">Hinweis: Die Summe der Splits muss {totalHours.toFixed(2)} ergeben.</div>
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button className="btn primary" onClick={merge} disabled={working || data.invoices.length === 0}>
            Zusammenführen
          </button>
        </div>
      </div>

      <div className="spacer" />
      <div className="muted">
        Hinweis: Das Löschen einzelner Entwürfe ist möglich über „Rechnungen“ (nur Status Entwurf). In V2 sind FK-Regeln aktiv.
      </div>
    </div>
  );
}
