'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { API_BASE } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { AppSettingsMenu } from './AppSettingsMenu';

type StoredAuthUser = {
  id?: string;
  email?: string;
  phone?: string | null;
};

export function AppHeader() {
  const { locale, messages } = useI18n();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authUser, setAuthUser] = useState<StoredAuthUser | null>(null);
  const navItems = [
    { href: '/', label: messages.nav.dashboard },
    { href: '/customers', label: messages.nav.customers },
    { href: '/orders', label: messages.nav.orders },
    { href: '/sites', label: messages.nav.sites },
    { href: '/workshops', label: messages.nav.workshops },
    { href: '/invoices/drafts', label: messages.nav.invoiceDrafts },
    { href: '/invoices', label: messages.nav.invoices },
    { href: '/ai-intake', label: messages.nav.aiIntake },
    { href: '/monitoring', label: messages.nav.aiMonitoring },
  ];

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountOpen(false);
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

  const headerCopy = locale === 'ar'
    ? { brand: 'بوابة عمران الإدارية المدعومة بالذكاء الاصطناعي', powered: 'مدعوم بالذكاء الاصطناعي', menu: 'القائمة', nav: 'التنقل الرئيسي', account: 'الحساب', signedIn: 'مسجل الدخول', signIn: 'تسجيل الدخول', logout: 'تسجيل الخروج', phone: 'الهاتف' }
    : locale === 'de'
      ? { brand: 'Omran Verwaltungsportal mit KI', powered: 'Powered by AI', menu: 'Menü', nav: 'Hauptnavigation', account: 'Konto', signedIn: 'Angemeldet', signIn: 'Anmelden', logout: 'Abmelden', phone: 'Telefon' }
      : { brand: 'Omran management portal powered by AI', powered: 'Powered by AI', menu: 'Menu', nav: 'Main navigation', account: 'Account', signedIn: 'Signed in', signIn: 'Sign in', logout: 'Logout', phone: 'Phone' };

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    if (href === '/invoices') return pathname === '/invoices' || pathname.startsWith('/invoices/') && !pathname.startsWith('/invoices/drafts');
    return pathname === href || pathname.startsWith(`${href}/`);
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
  }

  const accountInitial = authUser?.email?.trim()?.[0]?.toUpperCase() || 'U';

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <Link href="/" className="brand-logo-link" aria-label={messages.app.title}>
          <img className="brand-logo-image" src="/omran-logo.png" alt={messages.app.title} />
        </Link>
        <div className="brand-copy brand-copy-compact" aria-label={headerCopy.brand}>
          <div className="brand-title-small">بوابة الإدارة</div>
          <div className="brand-powered">{headerCopy.powered}</div>
        </div>
      </div>

      <div className="app-header-actions">
        <div className="app-header-toggles">
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
          <div className="app-account-menu">
            <button
              type="button"
              className={`btn app-account-trigger ${authUser ? 'signed-in' : ''}`}
              onClick={() => setAccountOpen((current) => !current)}
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
                      {authUser.phone ? <small>{headerCopy.phone}: {authUser.phone}</small> : null}
                    </div>
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
          <AppSettingsMenu />
        </div>
        <nav id="app-mobile-nav" className={`app-nav ${mobileNavOpen ? 'open' : ''}`} aria-label={headerCopy.nav}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}



