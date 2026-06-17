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
  const [mode, setMode] = useState<AuthMode>(pathname.includes('register') || pathname.includes('registration') ? 'signup' : 'login');
  const premiumCopy = locale === 'ar'
    ? { eyebrow: 'بوابة عمران', title: 'دخول آمن لإدارة الأعمال', line1: 'حساب الشركة', line2: 'صلاحيات العمل', line3: 'سجل التدقيق' }
    : locale === 'de'
      ? { eyebrow: 'Omran Portal', title: 'Sicherer Zugang fuer den Betrieb', line1: 'Firmenkonto', line2: 'Arbeitsrechte', line3: 'Audit Log' }
      : { eyebrow: 'Omran Portal', title: 'Secure access for operations', line1: 'Company account', line2: 'Work permissions', line3: 'Audit log' };
  const tabItems = [
    { id: 'login', label: msgs.authPage.loginTab },
    { id: 'signup', label: msgs.authPage.signupTab },
  ] as const;

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-layout">
            <aside className="auth-visual-panel" aria-label={premiumCopy.eyebrow}>
              <img src="/omran-logo.png" alt={messages.app.title} />
              <div>
                <span>{premiumCopy.eyebrow}</span>
                <strong>{premiumCopy.title}</strong>
              </div>
              <div className="auth-visual-lines" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="auth-visual-steps">
                <span>{premiumCopy.line1}</span>
                <span>{premiumCopy.line2}</span>
                <span>{premiumCopy.line3}</span>
              </div>
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
