'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { dashboardPathForUser, readStoredAccessUser } from '../../lib/access';
import { useI18n } from '../../lib/i18n';

function AccessDeniedContent() {
  const { locale } = useI18n();
  const params = useSearchParams();
  const feature = params.get('feature') || 'Protected page';
  const reason = params.get('reason') || 'You do not have access to this page.';
  const from = params.get('from') || '';
  const user = readStoredAccessUser();
  const dashboardHref = user ? dashboardPathForUser(user) : '/auth';

  const copy = locale === 'ar'
    ? {
        kicker: 'صلاحية مطلوبة',
        title: 'لا يمكنك فتح هذه الصفحة',
        feature: 'الصفحة',
        reason: 'السبب',
        path: 'الرابط المطلوب',
        dashboard: user ? 'العودة للوحة التحكم' : 'تسجيل الدخول',
        account: 'فتح الحساب',
        help: 'إذا كنت تحتاج هذه الميزة، اطلب من المدير تفعيل الصلاحية المناسبة لحسابك.',
      }
    : locale === 'de'
      ? {
          kicker: 'Zugriff eingeschraenkt',
          title: 'Diese Seite kann nicht geoeffnet werden',
          feature: 'Bereich',
          reason: 'Grund',
          path: 'Angeforderter Link',
          dashboard: user ? 'Zurueck zum Dashboard' : 'Anmelden',
          account: 'Konto oeffnen',
          help: 'Wenn Sie diese Funktion benoetigen, bitten Sie den Manager, die passende Berechtigung fuer Ihr Konto zu aktivieren.',
        }
      : {
          kicker: 'Access required',
          title: 'You cannot open this page',
          feature: 'Feature',
          reason: 'Reason',
          path: 'Requested link',
          dashboard: user ? 'Back to dashboard' : 'Sign in',
          account: 'Open account',
          help: 'If you need this feature, ask the manager to enable the correct permission for your account.',
        };

  return (
    <main className="access-denied-page">
      <section className="access-denied-card card">
        <div className="access-denied-mark" aria-hidden="true">!</div>
        <div>
          <div className="entity-kicker">{copy.kicker}</div>
          <h1>{copy.title}</h1>
          <p>{copy.help}</p>
        </div>
        <div className="access-denied-details">
          <div>
            <span>{copy.feature}</span>
            <strong>{feature}</strong>
          </div>
          <div>
            <span>{copy.reason}</span>
            <strong>{reason}</strong>
          </div>
          {from ? (
            <div>
              <span>{copy.path}</span>
              <strong>{from}</strong>
            </div>
          ) : null}
        </div>
        <div className="access-denied-actions">
          <Link className="btn primary" href={dashboardHref}>{copy.dashboard}</Link>
          {user ? <Link className="btn" href="/account-control">{copy.account}</Link> : null}
        </div>
      </section>
    </main>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense fallback={<main className="access-denied-page"><section className="access-denied-card card">Checking access...</section></main>}>
      <AccessDeniedContent />
    </Suspense>
  );
}
