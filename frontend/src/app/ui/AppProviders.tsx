'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { LocaleProvider } from '../../lib/i18n';
import { ToastProvider } from './ToastProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <LocaleProvider>
      <ToastProvider>{mounted ? children : <div className="app-client-placeholder" suppressHydrationWarning />}</ToastProvider>
    </LocaleProvider>
  );
}
