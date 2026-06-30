'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { API_BASE, apiAuthGet } from '../../lib/api';
import { dashboardPathForUser } from '../../lib/access';
import { useI18n } from '../../lib/i18n';
import { AppSettingsMenu } from './AppSettingsMenu';

type StoredAuthUser = {
  id?: string;
  email?: string;
  phone?: string | null;
  tenantId?: string | null;
  accountLevel?: string;
  tenantName?: string | null;
  role?: string | null;
  permissions?: string[];
  companyProfileComplete?: boolean;
};

type CompanyProfile = {
  companyName?: string | null;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
};

export function AppHeader() {
  const { locale, messages } = useI18n();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<StoredAuthUser | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [activeHash, setActiveHash] = useState('');
  const permissions = new Set(authUser?.permissions || []);
  const navItems = [
    { href: authUser ? dashboardPathForUser(authUser) : '/', label: messages.nav.dashboard, show: true },
    { href: '/customers', label: messages.nav.customers, show: permissions.has('manage_company') },
    { href: '/orders', label: messages.nav.orders, show: permissions.has('view_projects') },
    { href: '/sites', label: messages.nav.sites, show: permissions.has('view_projects') },
    { href: '/workshops', label: messages.nav.workshops, show: permissions.has('manage_company') },
    { href: '/invoices/drafts', label: messages.nav.invoiceDrafts, show: permissions.has('manage_invoices') },
    { href: '/invoices', label: messages.nav.invoices, show: permissions.has('manage_invoices') },
    { href: '/ai-intake', label: messages.nav.aiIntake, show: permissions.has('use_ai_intake') },
    { href: '/monitoring', label: messages.nav.aiMonitoring, show: permissions.has('use_ai_monitoring') },
  ].filter((item) => item.show);

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountOpen(false);
    setSettingsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function syncHash() {
      setActiveHash(window.location.hash || '');
    }

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  useEffect(() => {
    function readAuthUser() {
      try {
        const rawUser = localStorage.getItem('omran_auth_user');
        const token = localStorage.getItem('omran_auth_token');
        setAuthUser(rawUser && token ? JSON.parse(rawUser) : null);
      } catch {
        setAuthUser(null);
      }
    }

    readAuthUser();
    window.addEventListener('storage', readAuthUser);
    window.addEventListener('focus', readAuthUser);
    window.addEventListener('omran-auth-changed', readAuthUser);
    return () => {
      window.removeEventListener('storage', readAuthUser);
      window.removeEventListener('focus', readAuthUser);
      window.removeEventListener('omran-auth-changed', readAuthUser);
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setCompanyProfile(null);
      setCompanyLoaded(false);
      return;
    }
    setCompanyLoaded(false);
    apiAuthGet<CompanyProfile | null>('/auth/company-profile')
      .then((profile) => {
        setCompanyProfile(profile);
        setCompanyLoaded(true);
      })
      .catch(() => {
        setCompanyProfile(null);
        setCompanyLoaded(true);
      });
  }, [authUser?.id, authUser?.companyProfileComplete]);

  const headerCopy = locale === 'ar'
    ? { brand: 'بوابة عمران الإدارية المدعومة بالذكاء الاصطناعي', powered: 'مدعوم بالذكاء الاصطناعي', menu: 'القائمة', nav: 'التنقل الرئيسي', account: 'الحساب', signedIn: 'مسجل الدخول', signIn: 'تسجيل الدخول', logout: 'تسجيل الخروج', phone: 'الهاتف', company: 'الشركة', completeCompany: 'إكمال بيانات الشركة', loadingCompany: 'جار تحميل بيانات الشركة', auditLog: 'سجل التدقيق', accountControl: 'تحكم الحساب', accountControlHint: 'الصلاحيات وأدوات الذكاء الاصطناعي', role: 'الدور', tenant: 'الشركة / المستأجر' }
    : locale === 'de'
      ? { brand: 'Omran Verwaltungsportal mit KI', powered: 'Powered by AI', menu: 'Menü', nav: 'Hauptnavigation', account: 'Konto', signedIn: 'Angemeldet', signIn: 'Anmelden', logout: 'Abmelden', phone: 'Telefon', company: 'Firma', completeCompany: 'Firmendaten ergaenzen', loadingCompany: 'Firmendaten werden geladen', auditLog: 'Audit Log', accountControl: 'Account Control', accountControlHint: 'Berechtigungen und KI-Tools', role: 'Rolle', tenant: 'Firma / Tenant' }
      : { brand: 'Omran management portal powered by AI', powered: 'Powered by AI', menu: 'Menu', nav: 'Main navigation', account: 'Account', signedIn: 'Signed in', signIn: 'Sign in', logout: 'Logout', phone: 'Phone', company: 'Company', completeCompany: 'Complete company info', loadingCompany: 'Loading company info', auditLog: 'Audit Log', accountControl: 'Account Control', accountControlHint: 'Permissions and AI tools', role: 'Role', tenant: 'Company / tenant' };

  function isActive(href: string) {
    const baseHref = href.split('#')[0] || '/';
    const hash = href.includes('#') ? `#${href.split('#')[1]}` : '';
    if (hash) return pathname === baseHref && activeHash === hash;
    if (baseHref === '/') return pathname === '/';
    if (baseHref === '/invoices') return pathname === '/invoices' || pathname.startsWith('/invoices/') && !pathname.startsWith('/invoices/drafts');
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
  }

  async function logout() {
    const token = localStorage.getItem('omran_auth_token');
    try {
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Local logout should still work if the backend is unavailable.
    }
    localStorage.removeItem('omran_auth_token');
    localStorage.removeItem('omran_auth_user');
    setAuthUser(null);
    setAccountOpen(false);
    window.dispatchEvent(new Event('omran-auth-changed'));
    window.location.replace('/auth');
  }

  const accountInitial = authUser?.email?.trim()?.[0]?.toUpperCase() || 'U';
  const companyAddress = companyProfile
    ? [companyProfile.street, [companyProfile.zipCode, companyProfile.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : '';
  const companyContact = companyProfile
    ? [companyProfile.email, companyProfile.phone].filter(Boolean).join(' · ')
    : '';

  const platformCopy = locale === 'ar'
    ? { title: 'وحدة تحكم منصة عمران', subtitle: 'إدارة SaaS', nav: 'تنقل المنصة', dashboard: 'لوحة المنصة', tenants: 'الشركات', billing: 'الفوترة', audit: 'تدقيق المنصة', account: 'حساب المنصة', signedIn: 'مدير المنصة', logout: headerCopy.logout }
    : locale === 'de'
      ? { title: 'OMRAN Platform Console', subtitle: 'SaaS Administration', nav: 'Plattformnavigation', dashboard: 'Plattform', tenants: 'Tenants', billing: 'SaaS Billing', audit: 'Audit', account: 'Platform Account', signedIn: 'Platform Admin', logout: headerCopy.logout }
      : { title: 'OMRAN Platform Console', subtitle: 'SaaS Administration', nav: 'Platform navigation', dashboard: 'Platform', tenants: 'Tenants', billing: 'SaaS Billing', audit: 'Audit', account: 'Platform Account', signedIn: 'Platform Admin', logout: headerCopy.logout };

  const platformNavItems = [
    { href: '/platform-dashboard', label: platformCopy.dashboard },
    { href: '/platform-dashboard#tenants', label: platformCopy.tenants },
    { href: '/platform-dashboard#billing', label: platformCopy.billing },
    { href: '/audit-log', label: platformCopy.audit },
    { href: '/account-control', label: platformCopy.account },
  ];

  if (authUser?.accountLevel === 'platform_admin') {
    return (
      <header className="app-header platform-admin-header">
        <div className="app-header-brand platform-admin-brand">
          <Link href="/platform-dashboard" className="brand-logo-link" aria-label={platformCopy.title}>
            <img className="brand-logo-image" src="/omran-logo.png" alt={platformCopy.title} />
          </Link>
          <div className="brand-copy brand-copy-compact" aria-label={platformCopy.title}>
            <div className="brand-title-small">{platformCopy.title}</div>
            <div className="brand-powered">{platformCopy.subtitle}</div>
          </div>
        </div>
        <button
          type="button"
          className="btn app-mobile-menu-button platform-admin-menu-button"
          onClick={() => setMobileNavOpen((current) => !current)}
          aria-expanded={mobileNavOpen}
          aria-controls="platform-admin-nav"
        >
          <span className="app-mobile-menu-icon" aria-hidden="true" />
          {headerCopy.menu}
        </button>
        <nav id="platform-admin-nav" className={`app-nav platform-admin-nav ${mobileNavOpen ? 'open' : ''}`} aria-label={platformCopy.nav}>
          {platformNavItems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-utility-dock platform-admin-utility" aria-label={platformCopy.account}>
          <div className="app-header-toggles">
            <div className="app-account-menu">
              <button
                type="button"
                className="btn app-account-trigger signed-in platform-admin-account-trigger"
                onClick={() => {
                  setAccountOpen((current) => {
                    const nextOpen = !current;
                    if (nextOpen) setSettingsOpen(false);
                    return nextOpen;
                  });
                }}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span className="app-account-avatar" aria-hidden="true">{accountInitial}</span>
                <span className="app-account-label">{platformCopy.account}</span>
              </button>
              {accountOpen ? (
                <div className="app-account-panel" role="menu">
                  <div className="app-account-user">
                    <span>{platformCopy.signedIn}</span>
                    <strong>{authUser.email}</strong>
                    {authUser.role ? <small>{headerCopy.role}: {authUser.role}</small> : null}
                    {authUser.tenantName ? <small>{headerCopy.tenant}: {authUser.tenantName}</small> : null}
                  </div>
                  <Link href="/platform-dashboard" className="app-account-company app-account-audit-link">
                    <span>{platformCopy.dashboard}</span>
                    <strong>{platformCopy.title}</strong>
                  </Link>
                  <Link href="/audit-log" className="app-account-company app-account-audit-link">
                    <span>{platformCopy.audit}</span>
                    <strong>{platformCopy.audit}</strong>
                  </Link>
                  <Link href="/account-control" className="app-account-company app-account-audit-link">
                    <span>{headerCopy.accountControl}</span>
                    <strong>{headerCopy.accountControlHint}</strong>
                  </Link>
                  <button type="button" className="btn danger app-account-action" onClick={logout}>
                    {platformCopy.logout}
                  </button>
                </div>
              ) : null}
            </div>
            <AppSettingsMenu
              open={settingsOpen}
              onOpenChange={(nextOpen) => {
                setSettingsOpen(nextOpen);
                if (nextOpen) setAccountOpen(false);
              }}
            />
          </div>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-brand">
          <Link href="/" className="brand-logo-link" aria-label={messages.app.title}>
            <img className="brand-logo-image" src="/omran-logo.png" alt={messages.app.title} />
          </Link>
          <div className="brand-copy brand-copy-compact" aria-label={headerCopy.brand}>
            <div className="brand-title-small">{messages.app.title}</div>
            <div className="brand-powered">{headerCopy.powered}</div>
          </div>
        </div>
        <button
          type="button"
          className="btn app-mobile-menu-button"
          onClick={() => setMobileNavOpen((current) => !current)}
          aria-expanded={mobileNavOpen}
          aria-controls="app-mobile-nav"
        >
          <span className="app-mobile-menu-icon" aria-hidden="true" />
          {headerCopy.menu}
        </button>
        <nav id="app-mobile-nav" className={`app-nav ${mobileNavOpen ? 'open' : ''}`} aria-label={headerCopy.nav}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-utility-dock" aria-label={headerCopy.account}>
          <div className="app-header-toggles">
            <div className="app-account-menu">
              <button
                type="button"
                className={`btn app-account-trigger ${authUser ? 'signed-in' : ''}`}
                onClick={() => {
                  setAccountOpen((current) => {
                    const nextOpen = !current;
                    if (nextOpen) setSettingsOpen(false);
                    return nextOpen;
                  });
                }}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span className="app-account-avatar" aria-hidden="true">{authUser ? accountInitial : '↗'}</span>
                <span className="app-account-label">{authUser?.email || headerCopy.account}</span>
              </button>
              {accountOpen ? (
                <div className="app-account-panel" role="menu">
                  {authUser ? (
                    <>
                      <div className="app-account-user">
                        <span>{headerCopy.signedIn}</span>
                        <strong>{authUser.email}</strong>
                        {authUser.role ? <small>{headerCopy.role}: {authUser.role}</small> : null}
                        {authUser.tenantName ? <small>{headerCopy.tenant}: {authUser.tenantName}</small> : null}
                        {authUser.phone ? <small>{headerCopy.phone}: {authUser.phone}</small> : null}
                      </div>
                      {companyProfile?.companyName ? (
                        <div className="app-account-company">
                          <span>{headerCopy.company}</span>
                          <strong>{companyProfile.companyName}</strong>
                          {companyAddress ? <small>{companyAddress}</small> : null}
                          {companyContact ? <small>{companyContact}</small> : null}
                        </div>
                      ) : companyLoaded ? (
                        <Link href="/setup" className="app-account-company app-account-company-empty">
                          <span>{headerCopy.company}</span>
                          <strong>{headerCopy.completeCompany}</strong>
                        </Link>
                      ) : (
                        <div className="app-account-company">
                          <span>{headerCopy.company}</span>
                          <strong>{headerCopy.loadingCompany}</strong>
                        </div>
                      )}
                      <Link href="/audit-log" className="app-account-company app-account-audit-link">
                        <span>{headerCopy.auditLog}</span>
                        <strong>{headerCopy.auditLog}</strong>
                      </Link>
                      <Link href="/account-control" className="app-account-company app-account-audit-link">
                        <span>{headerCopy.accountControl}</span>
                        <strong>{headerCopy.accountControlHint}</strong>
                      </Link>
                      <button type="button" className="btn danger app-account-action" onClick={logout}>
                        {headerCopy.logout}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="app-account-user">
                        <span>{headerCopy.account}</span>
                        <strong>{headerCopy.signIn}</strong>
                      </div>
                      <Link href="/auth" className="btn primary app-account-action">
                        {headerCopy.signIn}
                      </Link>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <AppSettingsMenu
              open={settingsOpen}
              onOpenChange={(nextOpen) => {
                setSettingsOpen(nextOpen);
                if (nextOpen) setAccountOpen(false);
              }}
            />
          </div>
        </div>
      </header>
    </>
  );
}



