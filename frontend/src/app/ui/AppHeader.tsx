'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { AppSettingsMenu } from './AppSettingsMenu';

export function AppHeader() {
  const { messages } = useI18n();
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

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    if (href === '/invoices') return pathname === '/invoices' || pathname.startsWith('/invoices/') && !pathname.startsWith('/invoices/drafts');
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <Link href="/" className="brand-mark" aria-label={messages.app.title}>
          ERP
        </Link>
        <div>
          <div className="brand-eyebrow">{messages.app.brand}</div>
          <h1>{messages.app.title}</h1>
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
            Menu
          </button>
          <AppSettingsMenu />
        </div>
        <nav id="app-mobile-nav" className={`app-nav ${mobileNavOpen ? 'open' : ''}`} aria-label="Main navigation">
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
