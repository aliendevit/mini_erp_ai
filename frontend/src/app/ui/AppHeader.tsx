'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { AppSettingsMenu } from './AppSettingsMenu';

export function AppHeader() {
  const { locale, messages } = useI18n();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  }, [pathname]);

  const headerCopy = locale === 'ar'
    ? { brand: 'بوابة عمران الإدارية المدعومة بالذكاء الاصطناعي', powered: 'مدعوم بالذكاء الاصطناعي', menu: 'القائمة', nav: 'التنقل الرئيسي' }
    : locale === 'de'
      ? { brand: 'Omran Verwaltungsportal mit KI', powered: 'Powered by AI', menu: 'Men?', nav: 'Hauptnavigation' }
      : { brand: 'Omran management portal powered by AI', powered: 'Powered by AI', menu: 'Menu', nav: 'Main navigation' };

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    if (href === '/invoices') return pathname === '/invoices' || pathname.startsWith('/invoices/') && !pathname.startsWith('/invoices/drafts');
    return pathname === href || pathname.startsWith(`${href}/`);
  }

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



