'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale, isLocale, localeDir } from './i18n-config';
import { messages } from './messages';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isRtl: boolean;
  messages: (typeof messages)[Locale];
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) {
      return saved;
    }
  } catch {}
  return DEFAULT_LOCALE;
}

function applyLocale(locale: Locale) {
  try {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDir(locale);
    root.dataset.locale = locale;
  } catch {}
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const initial = getInitialLocale();
    setLocaleState(initial);
    applyLocale(initial);
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    applyLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {}
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      isRtl: locale === 'ar',
      messages: messages[locale],
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside LocaleProvider.');
  }
  return context;
}
