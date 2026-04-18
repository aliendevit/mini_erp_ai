'use client';

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    setMounted(true);
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
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
    <button className="btn" type="button" onClick={toggle} title="Theme wechseln">
      {theme === 'dark' ? '☀️ Hell' : '🌙 Dunkel'}
    </button>
  );
}
