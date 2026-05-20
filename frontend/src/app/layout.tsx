import './globals.css';
import type { ReactNode } from 'react';

import { AppHeader } from './ui/AppHeader';
import { AppProviders } from './ui/AppProviders';

export const metadata = {
  title: 'Omran ',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const stripInjectedAttrs = () => {
      document.querySelectorAll('[fdprocessedid]').forEach((el) => {
        el.removeAttribute('fdprocessedid');
      });
    };

    const key = 'sa_theme';
    const localeKey = 'sa_locale';
    const saved = localStorage.getItem(key);
    const locale = localStorage.getItem(localeKey) || 'de';
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = saved || (prefersLight ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.locale = locale;

    stripInjectedAttrs();
    const observer = new MutationObserver(() => stripInjectedAttrs());
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      childList: true,
    });
    window.addEventListener('load', () => observer.disconnect(), { once: true });
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body>
        <AppProviders>
          <div className="container">
            <AppHeader />
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
