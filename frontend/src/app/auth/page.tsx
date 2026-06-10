'use client';

import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { AuthForm } from '../../components/auth/AuthForm';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const { locale, messages } = useI18n();
  const msgs = messages as any;
  const [mode, setMode] = useState<AuthMode>('login');
  const tabItems = [
    { id: 'login', label: msgs.authPage.loginTab },
    { id: 'signup', label: msgs.authPage.signupTab },
  ] as const;

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
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
        </div>
      </div>
    </div>
  );
}
