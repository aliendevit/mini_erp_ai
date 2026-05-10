'use client';

import Link from 'next/link';

import { useI18n } from '../../lib/i18n';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader() {
  const { messages } = useI18n();
  const navItems = [
    { href: '/', label: messages.nav.dashboard },
    { href: '/customers', label: messages.nav.customers },
    { href: '/orders', label: messages.nav.orders },
    { href: '/sites', label: messages.nav.sites },
    { href: '/workshops', label: messages.nav.workshops },
    { href: '/invoices/drafts', label: messages.nav.invoiceDrafts },
    { href: '/invoices', label: messages.nav.invoices },
    { href: '/ai-intake', label: messages.nav.aiIntake },
  ];

  return (
    <div className="header">
      <div>
        <div className="muted">{messages.app.brand}</div>
        <h1>{messages.app.title}</h1>
      </div>
      <div className="headerRight">
        <LanguageToggle />
        <ThemeToggle />
        <div className="nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
