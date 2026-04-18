'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../../lib/api';
import { DateInput } from '../../ui/DateInput';
import { toYMD } from '../../../lib/date';

type Row = { keyId: string; keyName: string; totalHours: number };

type Payload = { groupBy: string; rows: Row[] };

export default function HoursReportPage() {
  const [groupBy, setGroupBy] = useState<'employee' | 'site' | 'order'>('employee');
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('groupBy', groupBy);
    if (from) p.set('from', toYMD(from));
    if (to) p.set('to', toYMD(to));
    return p.toString();
  }, [groupBy, from, to]);

  async function load() {
    const data = await apiGet<Payload>(`/reports/hours?${query}`);
    setRows(data.rows);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="card">
      <h2>Stundenübersicht</h2>

      <div className="row">
        <div>
          <label>Aggregation nach</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
            <option value="employee">Mitarbeiter</option>
            <option value="site">Baustelle</option>
            <option value="order">Auftrag</option>
          </select>
        </div>

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
            <th>{groupBy === 'employee' ? 'Mitarbeiter' : groupBy === 'site' ? 'Baustelle' : 'Auftrag'}</th>
            <th style={{ textAlign: 'right' }}>Stunden gesamt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.keyId}>
              <td>{r.keyName}</td>
              <td style={{ textAlign: 'right' }}>{Number(r.totalHours).toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">Keine Arbeitszeiten vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">Quelle: Arbeitszeiten (Work Entries).</div>
    </div>
  );
}
