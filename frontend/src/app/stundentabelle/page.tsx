'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE, apiGet } from '../../lib/api';

type Employee = { id: string; firstName: string; lastName: string };

type TimesheetRow = {
  ymd: string;
  dateLabel: string;
  workLabel: string;
  begin: string;
  end: string;
  kind: 'work' | 'sick' | 'vacation' | 'holiday' | 'weekend';
  hours: number;
};

type TimesheetData = {
  employee: Employee;
  month: number;
  year: number;
  monthName: string;
  rows: TimesheetRow[];
  totalHours: number;
  totalHoursLabel: string;
};

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

const YEARS = [2026, 2027, 2028, 2029, 2030];

export default function StundenTabellePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>('');

  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(2026);

  const [data, setData] = useState<TimesheetData | null>(null);
  const [loading, setLoading] = useState(false);

  const backendBase = useMemo(() => API_BASE.replace(/\/api$/, ''), []);
  const logoUrl = `${backendBase}/assets/zmd-deco-logo.png`;

  useEffect(() => {
    (async () => {
      const emps = await apiGet<Employee[]>('/employees');
      setEmployees(emps);
      if (!employeeId && emps[0]) setEmployeeId(emps[0].id);
    })().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTable() {
    if (!employeeId) return alert('Bitte Mitarbeiter auswählen.');
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        employeeId,
        month: String(month),
        year: String(year)
      });
      const d = await apiGet<TimesheetData>(`/timesheets?${qs.toString()}`);
      setData(d);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  const pdfHref = useMemo(() => {
    if (!employeeId) return '#';
    const qs = new URLSearchParams({ employeeId, month: String(month), year: String(year) });
    return `${API_BASE}/timesheets/pdf?${qs.toString()}`;
  }, [employeeId, month, year]);

  const wordHref = useMemo(() => {
    if (!employeeId) return '#';
    const qs = new URLSearchParams({ employeeId, month: String(month), year: String(year) });
    return `${API_BASE}/timesheets/word?${qs.toString()}`;
  }, [employeeId, month, year]);

  return (
    <div className="card">
      <h2>Stundentabelle</h2>
      <div className="muted">Monatsübersicht pro Mitarbeiter inkl. PDF- und Word-Export.</div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Mitarbeiter</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
            {employees.length === 0 && <option value="">(Bitte zuerst Mitarbeiter anlegen)</option>}
          </select>
        </div>

        <div>
          <label>Monat</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Year</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div style={{ alignSelf: 'end', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={loadTable} disabled={loading}>
            {loading ? 'Lade…' : 'Tabelle anzeigen'}
          </button>

          <a className="btn" href={pdfHref} target="_blank" rel="noreferrer" onClick={(e) => !employeeId && e.preventDefault()}>
            PDF
          </a>
          <a className="btn" href={wordHref} target="_blank" rel="noreferrer" onClick={(e) => !employeeId && e.preventDefault()}>
            Word
          </a>
        </div>
      </div>

      <div className="spacer" />

      {!data && <div className="muted">Bitte Auswahl treffen und „Tabelle anzeigen“ klicken.</div>}

      {data && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div />
            <div style={{ textAlign: 'right' as const }}>
              <img src={logoUrl} alt="Logo" style={{ width: 90, height: 'auto' }} />
              <div style={{ fontWeight: 600, marginTop: 6 }}>Z&amp;M Deco Bremen</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ fontWeight: 700 }}>
              Stunden Zettel: {data.monthName} {data.year}
            </div>
            <div style={{ fontWeight: 700 }}>Name: {data.employee.lastName}</div>
          </div>

          <div className="spacer" />

          <table className="table">
            <thead>
              <tr>
                <th>{data.monthName}</th>
                <th>
                  Arbeitszeit<br />
                  <span className="muted">(Abzüglich Pause)</span>
                </th>
                <th>Beginn</th>
                <th>Ende</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.ymd}>
                  <td>{r.dateLabel}</td>
                  <td>{r.workLabel}</td>
                  <td>{r.begin}</td>
                  <td>{r.end}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="spacer" />

          <div style={{ fontWeight: 700 }}>Gesamtstunden: {data.totalHoursLabel} Std</div>

          <div className="spacer" />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>Arbeitsnehmer:</div>
            <div>Arbeitsgeber:</div>
          </div>
        </>
      )}
    </div>
  );
}
