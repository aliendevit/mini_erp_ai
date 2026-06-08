'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../lib/i18n';
import { apiGet } from '../../../lib/api';
import { toYMD } from '../../../lib/date';
import { DateInput } from '../../ui/DateInput';

type Group = {
  keyId: string;
  keyName: string;
  totalHours: number;
  invoiceCount: number;
};

type Payload = { groupBy: string; groups: Group[] };

export default function DraftsPage() {
  const { locale, messages: m } = useI18n();
  const [groupBy, setGroupBy] = useState<'employee' | 'site' | 'order'>('employee');
  const [groups, setGroups] = useState<Group[]>([]);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const pageCopy = locale === 'ar'
    ? { kicker: 'مركز المسودات', description: 'تجميع مسودات الفواتير ومراجعة الإجماليات ودمجها في فواتير نهائية.' }
    : locale === 'de'
      ? { kicker: 'Entwurfszentrale', description: 'Rechnungsentw?rfe gruppieren, abrechenbare Summen pr?fen und in finale Rechnungen zusammenf?hren.' }
      : { kicker: 'Draft Center', description: 'Group draft invoice work, review billable totals, and merge into final invoices.' };

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('groupBy', groupBy);
    if (from) params.set('from', toYMD(from));
    if (to) params.set('to', toYMD(to));
    return params.toString();
  }, [groupBy, from, to]);

  async function load() {
    const data = await apiGet<Payload>(`/invoices/drafts/groups?${query}`);
    setGroups(data.groups);
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="entity-page drafts-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">{pageCopy.kicker}</div>
          <h1>{m.invoiceDraftsPage.heading}</h1>
          <p>{pageCopy.description}</p>
        </div>
        <div className="entity-hero-stats">
            <div className="entity-stat"><strong>{groups.length}</strong><span>{m.common.group}</span></div>
            <div className="entity-stat"><strong>{groups.reduce((sum, group) => sum + group.invoiceCount, 0)}</strong><span>{m.invoiceDraftsPage.draftCount}</span></div>
            <div className="entity-stat"><strong>{groups.reduce((sum, group) => sum + group.totalHours, 0).toFixed(1)}</strong><span>{m.common.hours}</span></div>
        </div>
      </section>

      <div className="card entity-panel">
      <h2>{m.invoiceDraftsPage.heading}</h2>

      <div className="row">
        <div>
          <label>{m.invoiceDraftsPage.groupBy}</label>
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

        <div style={{ alignSelf: 'end' }}>
          <Link className="btn" href="/invoices">
            {m.invoiceDraftsPage.allInvoices}
          </Link>
        </div>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>{m.common.group}</th>
            <th style={{ textAlign: 'right' }}>{m.invoiceDraftsPage.draftCount}</th>
            <th style={{ textAlign: 'right' }}>{m.invoiceDraftsPage.totalHours}</th>
            <th style={{ width: 260 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.keyId}>
              <td>{group.keyName}</td>
              <td style={{ textAlign: 'right' }}>{group.invoiceCount}</td>
              <td style={{ textAlign: 'right' }}>{Number(group.totalHours).toFixed(2)}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link
                    className="btn"
                    href={`/invoices/drafts/group?${new URLSearchParams({
                      groupBy,
                      key: group.keyId,
                      ...(from ? { from: toYMD(from) } : {}),
                      ...(to ? { to: toYMD(to) } : {}),
                    }).toString()}`}
                  >
                    {m.invoiceDraftsPage.openAndMerge}
                  </Link>
                </div>
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">{m.invoiceDraftsPage.noDrafts}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.invoiceDraftsPage.mergeHint}</div>
      </div>
    </div>
  );
}
