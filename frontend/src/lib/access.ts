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

export type RouteAccessRule = {
  title: string;
  permissions?: string[];
  accountLevels?: string[];
  authenticated?: boolean;
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

export function hasAnyPermission(user: StoredAccessUser | null | undefined, permissions: string[] = []): boolean {
  if (!permissions.length) return true;
  return permissions.some((permission) => hasPermission(user, permission));
}

const protectedRoutes: Array<{ matcher: (path: string) => boolean; rule: RouteAccessRule }> = [
  { matcher: (path) => path === '/platform-dashboard' || path.startsWith('/platform-dashboard/'), rule: { title: 'OMRAN Platform Console', permissions: ['manage_platform'], accountLevels: ['platform_admin'] } },
  { matcher: (path) => path === '/customers' || path.startsWith('/customers/'), rule: { title: 'Customers', permissions: ['manage_company'] } },
  { matcher: (path) => path === '/workshops' || path.startsWith('/workshops/'), rule: { title: 'Workshops', permissions: ['manage_company'] } },
  { matcher: (path) => path === '/employees' || path.startsWith('/employees/'), rule: { title: 'Employees', permissions: ['manage_users'] } },
  { matcher: (path) => path === '/work-entries' || path.startsWith('/work-entries/'), rule: { title: 'Work entries', permissions: ['manage_users'] } },
  { matcher: (path) => path === '/reports/hours' || path.startsWith('/reports/hours/'), rule: { title: 'Hours report', permissions: ['manage_company'] } },
  { matcher: (path) => path === '/invoices' || path.startsWith('/invoices/'), rule: { title: 'Invoices', permissions: ['manage_invoices'] } },
  { matcher: (path) => path === '/ai-intake' || path.startsWith('/ai-intake/'), rule: { title: 'AI Intake', permissions: ['use_ai_intake'] } },
  { matcher: (path) => path === '/monitoring' || path.startsWith('/monitoring/'), rule: { title: 'AI Monitoring', permissions: ['use_ai_monitoring'] } },
  { matcher: (path) => /^\/orders\/[^/]+\/monitoring(?:\/|$)/.test(path), rule: { title: 'Project AI Monitoring', permissions: ['use_ai_monitoring'] } },
  { matcher: (path) => path === '/orders' || path.startsWith('/orders/'), rule: { title: 'Projects and orders', permissions: ['view_projects'] } },
  { matcher: (path) => path === '/sites' || path.startsWith('/sites/'), rule: { title: 'Sites', permissions: ['view_projects'] } },
  { matcher: (path) => path === '/audit-log' || path.startsWith('/audit-log/'), rule: { title: 'Audit Log', permissions: ['view_audit_log', 'view_platform_audit'] } },
  { matcher: (path) => path === '/account-control' || path.startsWith('/account-control/'), rule: { title: 'Account Control', authenticated: true } },
  { matcher: (path) => path === '/setup' || path.startsWith('/setup/'), rule: { title: 'Company setup', authenticated: true } },
  { matcher: (path) => path === '/user-dashboard' || path.startsWith('/user-dashboard/'), rule: { title: 'User Dashboard', accountLevels: ['company_user'] } },
];

export function accessRuleForPath(pathname: string): RouteAccessRule | null {
  const cleanPath = pathname.split('?')[0] || '/';
  return protectedRoutes.find((entry) => entry.matcher(cleanPath))?.rule || null;
}

export function accessDecisionForPath(pathname: string, user: StoredAccessUser | null | undefined): { allowed: boolean; reason: string; rule: RouteAccessRule | null } {
  const rule = accessRuleForPath(pathname);
  if (!rule) return { allowed: true, reason: '', rule: null };
  if (!user) {
    return { allowed: false, reason: 'You must sign in before opening this page.', rule };
  }
  if (rule.accountLevels?.length && !rule.accountLevels.includes(String(user.accountLevel || ''))) {
    return { allowed: false, reason: `This page is only available for ${rule.accountLevels.join(', ')} accounts.`, rule };
  }
  if (rule.permissions?.length && !hasAnyPermission(user, rule.permissions)) {
    return { allowed: false, reason: `Missing permission: ${rule.permissions.join(' or ')}.`, rule };
  }
  return { allowed: true, reason: '', rule };
}
