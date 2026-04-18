'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../../lib/api';
import { DateInput } from '../../ui/DateInput';
import { toYMD } from '../../../lib/date';

type Group = {
  keyId: string;
  keyName: string;
  totalHours: number;
  invoiceCount: number;
};

type Payload = { groupBy: string; groups: Group[] };

export default function DraftsPage() {
  const [groupBy, setGroupBy] = useState<'employee' | 'site' | 'order'>('employee');
  const [groups, setGroups] = useState<Group[]>([]);
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
    const data = await apiGet<Payload>(`/invoices/drafts/groups?${query}`);
    setGroups(data.groups);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="card">
      <h2>Entwurf-Rechnungen</h2>

      <div className="row">
        <div>
          <label>Gruppieren nach</label>
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

        <div style={{ alignSelf: 'end' }}>
          <Link className="btn" href="/invoices">Alle Rechnungen</Link>
        </div>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Gruppe</th>
            <th style={{ textAlign: 'right' }}>Entwürfe</th>
            <th style={{ textAlign: 'right' }}>Stunden gesamt</th>
            <th style={{ width: 260 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.keyId}>
              <td>{g.keyName}</td>
              <td style={{ textAlign: 'right' }}>{g.invoiceCount}</td>
              <td style={{ textAlign: 'right' }}>{Number(g.totalHours).toFixed(2)}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link
                    className="btn"
                    href={`/invoices/drafts/group?${new URLSearchParams({
                      groupBy,
                      key: g.keyId,
                      ...(from ? { from: toYMD(from) } : {}),
                      ...(to ? { to: toYMD(to) } : {})
                    }).toString()}`}
                  >
                    Öffnen & zusammenführen
                  </Link>
                </div>
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">Keine Entwurf-Rechnungen vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">
        Hinweis: Zusammenführen ist nur möglich, wenn alle Entwürfe denselben Kunden haben und zur gleichen Gruppe gehören.
      </div>
    </div>
  );
}
