'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '../../lib/i18n-config';
import { useI18n } from '../../lib/i18n';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'sa_theme';
const LOCALES: Locale[] = ['de', 'en', 'ar'];
const APP_VERSION = 'Prototype v1.0';

const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  ar: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',
};

function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (saved === 'dark' || saved === 'light') return saved;
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  try {
    document.documentElement.dataset.theme = theme;
  } catch {}
}

export function AppSettingsMenu() {
  const { locale, setLocale, messages } = useI18n();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const nextTheme = getInitialTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  }

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        className="btn settings-menu-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="settings-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1H4a2 2 0 1 1 0-4h.06a1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6V4a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.8 1.8 0 0 0 19.4 9c.22.36.44.7.6 1H20a2 2 0 1 1 0 4h-.06a1.8 1.8 0 0 0-.54 1Z" />
        </svg>
        <span>Settings</span>
      </button>

      {open && (
        <div className="settings-menu-panel" role="menu">
          <div className="settings-menu-header">
            <strong>System settings</strong>
            <span>{APP_VERSION}</span>
          </div>
          <div className="settings-menu-section">
            <div className="settings-menu-title">{messages.language.switchTitle}</div>
            <div className="settings-menu-options" aria-label={messages.language.switchTitle}>
              {LOCALES.map((entry) => (
                <button
                  key={entry}
                  className={locale === entry ? 'active' : undefined}
                  type="button"
                  onClick={() => setLocale(entry)}
                  role="menuitem"
                >
                  <span>{messages.language[entry]}</span>
                  <small>{LOCALE_NAMES[entry]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-menu-section">
            <div className="settings-menu-title">{messages.theme.switchTitle}</div>
            <div className="settings-menu-options" aria-label={messages.theme.switchTitle}>
              <button
                className={mounted && theme === 'light' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('light')}
                role="menuitem"
              >
                <span>{messages.theme.light}</span>
                <small>Bright UI</small>
              </button>
              <button
                className={mounted && theme === 'dark' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('dark')}
                role="menuitem"
              >
                <span>{messages.theme.dark}</span>
                <small>Low-light UI</small>
              </button>
            </div>
          </div>
          <div className="settings-menu-version">
            <span>Build</span>
            <strong>{APP_VERSION}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
