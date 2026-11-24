'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '../../lib/i18n';
import { AuthForm } from '../../components/auth/AuthForm';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const { locale, messages } = useI18n();
  const pathname = usePathname();
  const msgs = messages as any;
  const publicRegistrationEnabled = process.env.NEXT_PUBLIC_ALLOW_PUBLIC_REGISTRATION === 'true';
  const [mode, setMode] = useState<AuthMode>(publicRegistrationEnabled && (pathname.includes('register') || pathname.includes('registration')) ? 'signup' : 'login');
  const premiumCopy = locale === 'ar'
    ? { eyebrow: 'بوابة عمران', title: 'دخول آمن لإدارة الأعمال', line1: 'حساب الشركة', line2: 'صلاحيات العمل', line3: 'سجل التدقيق' }
    : locale === 'de'
      ? { eyebrow: 'Omran Portal', title: 'Sicherer Zugang fuer den Betrieb', line1: 'Firmenkonto', line2: 'Arbeitsrechte', line3: 'Audit Log' }
      : { eyebrow: 'Omran Portal', title: 'Secure access for operations', line1: 'Company account', line2: 'Work permissions', line3: 'Audit log' };
  const tabItems: Array<{ id: AuthMode; label: string }> = [
    { id: 'login', label: msgs.authPage.loginTab },
    ...(publicRegistrationEnabled ? [{ id: 'signup' as const, label: msgs.authPage.signupTab }] : []),
  ];

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-layout">
            <aside className="auth-visual-panel" aria-label={premiumCopy.eyebrow}>
              <div className="auth-visual-brand">
                <img src="/omran-logo.png" alt={messages.app.title} />
                <span>Operational intelligence</span>
              </div>
              <div>
                <span>{premiumCopy.eyebrow}</span>
                <strong>{premiumCopy.title}</strong>
                <p>One protected workspace for projects, finance, teams and AI-assisted decisions.</p>
              </div>
              <div className="auth-visual-lines" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="auth-visual-steps">
                <span><i>01</i>{premiumCopy.line1}</span>
                <span><i>02</i>{premiumCopy.line2}</span>
                <span><i>03</i>{premiumCopy.line3}</span>
              </div>
              <div className="auth-visual-footnote">Private by design <b>2026</b></div>
            </aside>

            <section className="auth-form-panel">
              <div className={`auth-brand ${locale === 'ar' ? 'text-right' : 'text-center'}`}>
                <p>{messages.app.brand}</p>
                <h1>{msgs.authPage.pageTitle}</h1>
              </div>

              <div className="auth-tabs" role="tablist" aria-label="Auth tabs">
                {tabItems.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id)}
                    className={`tab-button ${mode === tab.id ? 'active' : ''}`}
                    aria-pressed={mode === tab.id}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="auth-section">
                <AuthForm mode={mode} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
