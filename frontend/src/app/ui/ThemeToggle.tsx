'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '../../lib/i18n';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'sa_theme';

function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
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

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const { messages } = useI18n();

  useEffect(() => {
    setMounted(true);
    const nextTheme = getInitialTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  if (!mounted) return null;

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  return (
    <button className="btn" type="button" onClick={toggle} title={messages.theme.switchTitle}>
      {theme === 'dark' ? `☀️ ${messages.theme.light}` : `🌙 ${messages.theme.dark}`}
    </button>
  );
}
