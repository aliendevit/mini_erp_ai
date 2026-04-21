export const DEFAULT_LOCALE = 'de' as const;
export const LOCALE_STORAGE_KEY = 'sa_locale' as const;

export const LOCALES = ['de', 'en', 'ar'] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && LOCALES.includes(value as Locale);
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
