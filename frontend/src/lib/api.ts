export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api';

export const DELETE_CONFIRM =
  'Wirklich löschen? Wenn dieser Eintrag noch verknüpft ist, ist das Löschen nicht möglich.';

async function safeMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.detail === 'string') return data.detail;
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('omran_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isPublicAuthPath(path: string) {
  return path === '/auth/login' || path === '/auth/register';
}

function handleAuthFailure(message = 'Please sign in again.') {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('omran_auth_token');
  localStorage.removeItem('omran_auth_user');
  window.dispatchEvent(new Event('omran-auth-changed'));
  window.dispatchEvent(new CustomEvent('omran:alert', { detail: { message, kind: 'error' } }));
  if (!['/auth', '/register', '/registration'].includes(window.location.pathname)) {
    window.location.replace('/auth');
  }
}

function headersForPath(path: string, extra: Record<string, string> = {}) {
  const headers = { ...extra, ...authHeaders() };
  if (!isPublicAuthPath(path) && typeof window !== 'undefined' && !headers.Authorization) {
    handleAuthFailure();
    throw new Error('Please sign in again.');
  }
  return headers;
}

async function handleResponseError(res: Response, path: string): Promise<never> {
  const msg = await safeMessage(res);
  if (!isPublicAuthPath(path) && res.status === 401) {
    handleAuthFailure(msg || 'Please sign in again.');
  }
  throw new Error(msg);
}

function downloadFileName(path: string, fallback = 'download') {
  const cleanPath = path.split('?')[0] || '';
  return cleanPath.split('/').filter(Boolean).pop() || fallback;
}

export async function openAuthBlob(path: string, fileName?: string): Promise<void> {
  const blob = await apiAuthBlob(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadAuthBlob(path: string, fileName?: string): Promise<void> {
  const blob = await apiAuthBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || downloadFileName(path);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', headers: headersForPath(path) });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  return res.json();
}

export async function apiAuthGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: headersForPath(path),
  });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function apiJson<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: any
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headersForPath(path, { 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function apiAuthJson<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: any
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headersForPath(path, { 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function apiAuthForm<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: FormData
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headersForPath(path),
    body,
  });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function apiAuthBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: headersForPath(path),
  });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  return res.blob();
}


export async function apiForm<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: FormData
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headersForPath(path),
    body,
  });
  if (!res.ok) {
    await handleResponseError(res, path);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}
