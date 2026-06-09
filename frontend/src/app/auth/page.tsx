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
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex h-screen w-full items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full mx-auto max-w-lg rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-8 sm:p-10 shadow-lg">
          <div className={`mb-6 ${locale === 'ar' ? 'text-right' : 'text-center'}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">{messages.app.brand}</p>
            <h1 className="mt-4 text-2xl font-semibold text-white sm:text-3xl">{msgs.authPage.pageTitle}</h1>
          </div>

          <div className="rounded-lg bg-transparent p-0">
            <div className={`flex justify-center gap-2 rounded-full bg-white/10 p-1 shadow-sm shadow-black/10`}>
              {tabItems.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id)}
                  className={`btn ${mode === tab.id ? 'primary' : ''} rounded-full px-4 py-2 text-sm font-semibold`}
                  aria-pressed={mode === tab.id}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <AuthForm mode={mode} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
