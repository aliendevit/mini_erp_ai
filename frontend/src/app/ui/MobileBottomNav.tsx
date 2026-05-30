'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';

type IconName = 'dashboard' | 'orders' | 'intake' | 'monitoring' | 'more' | 'customers' | 'sites' | 'workshops' | 'drafts' | 'invoices';

function MobileNavIcon({ name }: { name: IconName }) {
  if (name === 'dashboard') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
  }
  if (name === 'orders') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l2 3v13H5V7l2-3Z" /><path d="M7 8h10" /><path d="M8 12h8" /><path d="M8 16h6" /></svg>;
  }
  if (name === 'intake') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H8l-3 3V5Z" /><path d="M8 9h8" /><path d="M8 12h5" /></svg>;
  }
  if (name === 'monitoring') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 4-7" /><path d="M17 6h3v3" /></svg>;
  }
  if (name === 'customers') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0" /><path d="M17 10a2.5 2.5 0 1 0 0-5" /><path d="M15 15.5c2.8.2 5 2 5.5 4.5" /></svg>;
  }
  if (name === 'sites') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" /><path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /></svg>;
  }
  if (name === 'workshops') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5 4.5 4.5" /><path d="m16 3-5 5 5 5 5-5-5-5Z" /><path d="M3 21l8.5-8.5" /><path d="m5 19 4-4" /></svg>;
  }
  if (name === 'drafts') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3Z" /><path d="M14 3v5h4" /><path d="M9.5 13h5" /><path d="M9.5 16h4" /></svg>;
  }
  if (name === 'invoices') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01" /><path d="M12 12h.01" /><path d="M19 12h.01" /></svg>;
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/invoices') return pathname === '/invoices' || (pathname.startsWith('/invoices/') && !pathname.startsWith('/invoices/drafts'));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const { locale, messages } = useI18n();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreLabel = locale === 'ar' ? '\u0627\u0644\u0645\u0632\u064a\u062f' : locale === 'de' ? 'Mehr' : 'More';

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const primaryItems = [
    { href: '/', label: messages.nav.dashboard, icon: 'dashboard' as IconName },
    { href: '/orders', label: messages.nav.orders, icon: 'orders' as IconName },
    { href: '/ai-intake', label: messages.nav.aiIntake, icon: 'intake' as IconName },
    { href: '/monitoring', label: messages.nav.aiMonitoring, icon: 'monitoring' as IconName },
  ];
  const moreItems = [
    { href: '/customers', label: messages.nav.customers, icon: 'customers' as IconName },
    { href: '/sites', label: messages.nav.sites, icon: 'sites' as IconName },
    { href: '/workshops', label: messages.nav.workshops, icon: 'workshops' as IconName },
    { href: '/invoices/drafts', label: messages.nav.invoiceDrafts, icon: 'drafts' as IconName },
    { href: '/invoices', label: messages.nav.invoices, icon: 'invoices' as IconName },
  ];
  const moreActive = moreItems.some((item) => isActive(pathname, item.href));

  return (
    <>
      {moreOpen && <button type="button" className="mobile-bottom-nav-backdrop" aria-label="Close menu" onClick={() => setMoreOpen(false)} />}
      <div className={`mobile-more-sheet ${moreOpen ? 'open' : ''}`} aria-hidden={!moreOpen}>
        <div className="mobile-more-handle" />
        <div className="mobile-more-title">{moreLabel}</div>
        <div className="mobile-more-grid">
          {moreItems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
              <MobileNavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <div className="mobile-bottom-nav-bar">
          {primaryItems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
              <MobileNavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
          <button type="button" className={moreOpen || moreActive ? 'active' : undefined} onClick={() => setMoreOpen((current) => !current)}>
            <MobileNavIcon name="more" />
            <span>{moreLabel}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
