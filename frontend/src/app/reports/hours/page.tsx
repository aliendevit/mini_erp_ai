'use client';

import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../lib/i18n';
import { apiGet } from '../../../lib/api';
import { toYMD } from '../../../lib/date';
import { DateInput } from '../../ui/DateInput';

type Row = { keyId: string; keyName: string; totalHours: number };
type Payload = { groupBy: string; rows: Row[] };

export default function HoursReportPage() {
  const { messages: m } = useI18n();
  const [groupBy, setGroupBy] = useState<'employee' | 'site' | 'order'>('employee');
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('groupBy', groupBy);
    if (from) params.set('from', toYMD(from));
    if (to) params.set('to', toYMD(to));
    return params.toString();
  }, [groupBy, from, to]);

  async function load() {
    const data = await apiGet<Payload>(`/reports/hours?${query}`);
    setRows(data.rows);
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="card">
      <h2>{m.hoursReportPage.heading}</h2>

      <div className="row">
        <div>
          <label>{m.hoursReportPage.aggregateBy}</label>
          <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as 'employee' | 'site' | 'order')}>
            <option value="employee">{m.statuses.groupBy.employee}</option>
            <option value="site">{m.statuses.groupBy.site}</option>
            <option value="order">{m.statuses.groupBy.order}</option>
          </select>
        </div>

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
            <th>{m.statuses.groupBy[groupBy]}</th>
            <th style={{ textAlign: 'right' }}>{m.hoursReportPage.totalHours}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.keyId}>
              <td>{row.keyName}</td>
              <td style={{ textAlign: 'right' }}>{Number(row.totalHours).toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">{m.hoursReportPage.noRows}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.hoursReportPage.source}</div>
    </div>
  );
}
