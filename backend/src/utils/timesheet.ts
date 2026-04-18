import type { PrismaClient } from '@prisma/client';

export type TimesheetRowKind = 'work' | 'sick' | 'vacation' | 'holiday' | 'weekend';

export type TimesheetRow = {
  ymd: string;          // YYYY-MM-DD
  dateLabel: string;    // DD.MM.YYYY
  workLabel: string;    // "8,25" | "Krank" | "Urlaub" | "Feiertag" | "Wochenende" | "0"
  begin: string;        // "07:00" | "--"
  end: string;          // computed | "--"
  kind: TimesheetRowKind;
  hours: number;        // totals count only for kind=work
};

export type TimesheetData = {
  employee: { id: string; firstName: string; lastName: string };
  month: number;        // 1..12
  year: number;
  monthName: string;    // "Oktober"
  rows: TimesheetRow[];
  totalHours: number;
  totalHoursLabel: string;
};

export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateDDMMYYYY(d: Date) {
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export function formatHoursDe(hours: number) {
  return hours.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function isWeekendUtc(d: Date) {
  const dow = d.getUTCDay(); // 0=Sun,6=Sat
  return dow === 0 || dow === 6;
}

function minutesToHHMM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function computeEndTime(hours: number) {
  const start = 7 * 60;
  const workMins = Math.round(hours * 60);
  const end = start + workMins + 60; // +1h pause
  return minutesToHHMM(end);
}

function labelForKind(kind: TimesheetRowKind, hours: number) {
  if (kind === 'sick') return 'Krank';
  if (kind === 'vacation') return 'Urlaub';
  if (kind === 'holiday') return 'Feiertag';
  if (kind === 'weekend') return 'Wochenende';
  return formatHoursDe(hours);
}

export async function computeTimesheetData(
  prisma: PrismaClient,
  employeeId: string,
  year: number,
  month: number
): Promise<TimesheetData> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error('Mitarbeiter nicht gefunden.');

  if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new Error('Ungültiges Jahr.');
  if (!Number.isFinite(month) || month < 1 || month > 12) throw new Error('Ungültiger Monat.');

  const monthIdx = month - 1;
  const start = new Date(Date.UTC(year, monthIdx, 1));
  const endExclusive = new Date(Date.UTC(year, monthIdx + 1, 1));
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

  const entries = await prisma.workEntry.findMany({
    where: {
      employeeId,
      workDate: { gte: start, lt: endExclusive }
    },
    select: { workDate: true, hours: true, isSick: true, dayType: true }
  });

  // per-day aggregate
  const byDay: Record<
    string,
    {
      sumWorkHours: number;
      // strongest absence wins: holiday > vacation > sick
      absence: 'holiday' | 'vacation' | 'sick' | null;
    }
  > = {};

  const precedence = (t: string | null | undefined) => {
    if (t === 'holiday') return 3;
    if (t === 'vacation') return 2;
    if (t === 'sick') return 1;
    return 0;
  };

  for (const e of entries) {
    const ymd = e.workDate.toISOString().slice(0, 10);
    const cur = byDay[ymd] || { sumWorkHours: 0, absence: null as any };

    const dayType = (e.dayType as any) as string; // 'work'|'sick'|'vacation'|'holiday'
    const legacySick = e.isSick === true;

    const isAbsence = legacySick || dayType === 'sick' || dayType === 'vacation' || dayType === 'holiday';

    if (isAbsence) {
      const abs: any =
        dayType === 'holiday' ? 'holiday'
        : dayType === 'vacation' ? 'vacation'
        : 'sick';

      if (precedence(abs) > precedence(cur.absence)) {
        cur.absence = abs;
      }
      // absence day does not count hours
    } else {
      cur.sumWorkHours += Number(e.hours);
    }

    byDay[ymd] = cur;
  }

  const rows: TimesheetRow[] = [];
  let totalHours = 0;

  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(Date.UTC(year, monthIdx, day));
    const ymd = d.toISOString().slice(0, 10);

    const weekend = isWeekendUtc(d);
    const dayData = byDay[ymd];

    let kind: TimesheetRowKind = 'work';
    if (weekend) {
      kind = 'weekend';
    } else if (dayData?.absence) {
      kind = dayData.absence; // 'holiday' | 'vacation' | 'sick'
    } else {
      kind = 'work';
    }

    const hours = kind === 'work' ? (dayData?.sumWorkHours ?? 0) : 0;
    if (kind === 'work') totalHours += hours;

    const workLabel = labelForKind(kind, hours);

    // Begin/Ende only when actual hours > 0
    const hasWork = kind === 'work' && hours > 0;
    const begin = hasWork ? '07:00' : '--';
    const end = hasWork ? computeEndTime(hours) : '--';

    rows.push({
      ymd,
      dateLabel: formatDateDDMMYYYY(d),
      workLabel,
      begin,
      end,
      kind,
      hours
    });
  }

  return {
    employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName },
    month,
    year,
    monthName: MONTH_NAMES[monthIdx],
    rows,
    totalHours,
    totalHoursLabel: formatHoursDe(totalHours)
  };
}
