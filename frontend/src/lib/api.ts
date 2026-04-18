export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api';

export const DELETE_CONFIRM =
  'Wirklich löschen? Wenn dieser Eintrag noch verknüpft ist, ist das Löschen nicht möglich.';

async function safeMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.message) return String(data.message);
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    const msg = await safeMessage(res);
    throw new Error(msg);
  }
  return res.json();
}

export async function apiJson<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: any
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await safeMessage(res);
    throw new Error(msg);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}
