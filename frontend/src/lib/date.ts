export type DateRange = {
  from?: Date;
  to?: Date;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * Format a Date as YYYY-MM-DD using LOCAL date parts.
 * (Safer than toISOString() for date-only filtering.)
 */
export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format a Date as TT.MM.JJJJ using local date parts. */
export function formatDE(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Parse TT.MM.JJJJ into a local Date (00:00 local). Returns undefined if invalid. */
export function parseDE(text: string): Date | undefined {
  const t = text.trim();
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(t)) return undefined;
  const [ddS, mmS, yyyyS] = t.split('.');
  const dd = Number(ddS);
  const mm = Number(mmS);
  const yyyy = Number(yyyyS);
  if (!dd || !mm || !yyyy) return undefined;
  const d = new Date(yyyy, mm - 1, dd);
  // validate overflow (e.g., 31.02.2026)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return undefined;
  return d;
}

/** Parse YYYY-MM-DD to local Date. Returns undefined if invalid. */
export function parseYMD(ymd: string): Date | undefined {
  const t = (ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const [yS, mS, dS] = t.split('-');
  const y = Number(yS);
  const m = Number(mS);
  const d = Number(dS);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

/**
 * For ISO datetimes (or dates) coming from the backend, use only the date part
 * (YYYY-MM-DD) and parse as local date to avoid timezone shifts.
 */
export function parseApiDateLocal(value: string): Date | undefined {
  if (!value) return undefined;
  const ymd = String(value).substring(0, 10);
  return parseYMD(ymd);
}

/** Inclusive date range check (date-only). */
export function inDateRange(d: Date, from?: Date, to?: Date): boolean {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (from) {
    const f = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    if (day < f) return false;
  }
  if (to) {
    const t = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    if (day > t) return false;
  }
  return true;
}
