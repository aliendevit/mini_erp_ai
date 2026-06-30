'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { LocaleProvider } from '../../lib/i18n';
import { AppDialogProvider } from './AppDialogProvider';
import { ToastProvider } from './ToastProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <LocaleProvider>
      <ToastProvider>
        <AppDialogProvider>{mounted ? children : <div className="app-client-placeholder" suppressHydrationWarning />}</AppDialogProvider>
      </ToastProvider>
    </LocaleProvider>
  );
}
