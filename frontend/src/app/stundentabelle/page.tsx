'use client';

import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { API_BASE, apiGet, downloadAuthBlob, openAuthBlob } from '../../lib/api';

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

const YEARS = [2026, 2027, 2028, 2029, 2030];

export default function StundenTabellePage() {
  const { messages: m } = useI18n();
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
      const nextEmployees = await apiGet<Employee[]>('/employees');
      setEmployees(nextEmployees);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    })().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTable() {
    if (!employeeId) return alert(m.timesheetPage.selectEmployee);
    setLoading(true);
    try {
      const query = new URLSearchParams({
        employeeId,
        month: String(month),
        year: String(year),
      });
      const nextData = await apiGet<TimesheetData>(`/timesheets?${query.toString()}`);
      setData(nextData);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  const documentQuery = useMemo(() => {
    if (!employeeId) return '';
    const query = new URLSearchParams({ employeeId, month: String(month), year: String(year) });
    return query.toString();
  }, [employeeId, month, year]);

  async function openTimesheetPdf() {
    if (!documentQuery) return;
    try {
      await openAuthBlob(`/timesheets/pdf?${documentQuery}`);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function downloadTimesheetWord() {
    if (!documentQuery) return;
    try {
      await downloadAuthBlob(`/timesheets/word?${documentQuery}`, `timesheet-${year}-${month}.docx`);
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="card">
      <h2>{m.timesheetPage.heading}</h2>
      <div className="muted">{m.timesheetPage.description}</div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>{m.common.employee}</label>
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
              </option>
            ))}
            {employees.length === 0 && <option value="">{m.timesheetPage.noEmployeesOption}</option>}
          </select>
        </div>

        <div>
          <label>{m.common.group}</label>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {m.timesheetPage.monthNames.map((monthName, index) => (
              <option key={monthName} value={index + 1}>
                {monthName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>{m.common.year}</label>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {YEARS.map((currentYear) => (
              <option key={currentYear} value={currentYear}>
                {currentYear}
              </option>
            ))}
          </select>
        </div>

        <div style={{ alignSelf: 'end', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={loadTable} disabled={loading}>
            {loading ? m.common.loading : m.timesheetPage.loadTable}
          </button>

          <button className="btn" type="button" disabled={!employeeId} onClick={openTimesheetPdf}>
            PDF
          </button>
          <button className="btn" type="button" disabled={!employeeId} onClick={downloadTimesheetWord}>
            Word
          </button>
        </div>
      </div>

      <div className="spacer" />

      {!data && <div className="muted">{m.timesheetPage.selectPrompt}</div>}

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
              {m.timesheetPage.sheetTitle}: {data.monthName} {data.year}
            </div>
            <div style={{ fontWeight: 700 }}>
              {m.common.name}: {data.employee.lastName}
            </div>
          </div>

          <div className="spacer" />

          <table className="table">
            <thead>
              <tr>
                <th>{data.monthName}</th>
                <th>
                  {m.timesheetPage.workingTime}
                  <br />
                  <span className="muted">{m.timesheetPage.breakDeducted}</span>
                </th>
                <th>{m.common.start}</th>
                <th>{m.common.end}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.ymd}>
                  <td>{row.dateLabel}</td>
                  <td>{row.workLabel}</td>
                  <td>{row.begin}</td>
                  <td>{row.end}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="spacer" />

          <div style={{ fontWeight: 700 }}>{m.timesheetPage.totalHours}: {data.totalHoursLabel} Std</div>

          <div className="spacer" />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>{m.timesheetPage.worker}:</div>
            <div>{m.timesheetPage.employer}:</div>
          </div>
        </>
      )}
    </div>
  );
}
