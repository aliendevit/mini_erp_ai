'use client';

import type { Locale } from '../../lib/i18n-config';
import { useI18n } from '../../lib/i18n';

export function LanguageToggle() {
  const { locale, setLocale, messages } = useI18n();

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label={messages.language.switchTitle}>
      {(['de', 'en', 'ar'] as Locale[]).map((entry) => (
        <button
          key={entry}
          className="btn"
          type="button"
          onClick={() => setLocale(entry)}
          title={messages.language.switchTitle}
          style={{
            borderColor: locale === entry ? 'rgba(125,180,255,0.7)' : undefined,
            fontWeight: locale === entry ? 700 : 500,
            minWidth: 48,
          }}
        >
          {messages.language[entry]}
        </button>
      ))}
    </div>
  );
}
