export type AccountLevel = 'platform_admin' | 'company_manager' | 'company_user' | 'company_viewer' | string;

export type StoredAccessUser = {
  id?: string;
  email?: string;
  phone?: string | null;
  tenantId?: string | null;
  accountLevel?: AccountLevel;
  tenantName?: string | null;
  role?: string | null;
  permissions?: string[];
  companyProfileComplete?: boolean;
};

export function dashboardPathForUser(user?: StoredAccessUser | null): string {
  if (user?.accountLevel === 'platform_admin') return '/platform-dashboard';
  if (user?.accountLevel === 'company_user') return '/user-dashboard';
  if (user?.accountLevel === 'company_viewer') return '/viewer-dashboard';
  return '/';
}

export function readStoredAccessUser(): StoredAccessUser | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('omran_auth_token');
  const raw = localStorage.getItem('omran_auth_user');
  if (!token || !raw) return null;
  try {
    return JSON.parse(raw) as StoredAccessUser;
  } catch {
    return null;
  }
}

export function hasPermission(user: StoredAccessUser | null | undefined, permission: string): boolean {
  return Boolean(user?.permissions?.includes(permission));
}
