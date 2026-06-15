'use client';

import { useEffect, useRef, useState } from 'react';

import { apiAuthBlob, apiAuthForm, apiAuthGet, apiAuthJson } from '../../lib/api';
import type { Locale } from '../../lib/i18n-config';
import { useI18n } from '../../lib/i18n';
import { useToast } from './ToastProvider';

type Theme = 'dark' | 'light' | 'construction';

const THEME_STORAGE_KEY = 'sa_theme';
const LOCALES: Locale[] = ['de', 'en', 'ar'];
const APP_VERSION = 'v1.0.0.0';

const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  ar: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',
};

const THEME_DETAILS: Record<Theme, { tone: string; description: string }> = {
  dark: { tone: '01', description: 'Default UI' },
  construction: { tone: '02', description: 'Warm site UI' },
  light: { tone: '03', description: 'Bright UI' },
};

type AppSettingsMenuProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type BackupInfo = {
  fileName: string;
  sizeBytes: number;
  createdAt?: string | null;
  uploadFileCount?: number;
};

function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (saved === 'dark' || saved === 'light' || saved === 'construction') return saved;
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

export function AppSettingsMenu({ open, onOpenChange }: AppSettingsMenuProps = {}) {
  const { locale, setLocale, messages } = useI18n();
  const { showToast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOpen = open ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }
    setInternalOpen(nextOpen);
  }

  useEffect(() => {
    setMounted(true);
    const nextTheme = getInitialTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    loadBackups();
  }, [isOpen]);

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  }

  async function loadBackups() {
    try {
      const result = await apiAuthGet<{ items: BackupInfo[] }>('/system/backups');
      setBackups(result.items || []);
    } catch {
      setBackups([]);
    }
  }

  function formatSize(bytes: number) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(value?: string | null) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadBackup(fileName: string) {
    try {
      const blob = await apiAuthBlob(`/system/backups/${encodeURIComponent(fileName)}`);
      downloadBlob(blob, fileName);
    } catch (error: any) {
      showToast(error?.message || t.backupFailed, 'error');
    }
  }

  async function createBackup() {
    setBackupBusy(true);
    try {
      const backup = await apiAuthJson<BackupInfo>('/system/backups', 'POST');
      setBackups((current) => [backup, ...current.filter((item) => item.fileName !== backup.fileName)]);
      const blob = await apiAuthBlob(`/system/backups/${encodeURIComponent(backup.fileName)}`);
      downloadBlob(blob, backup.fileName);
      showToast(t.backupReady, 'success');
    } catch (error: any) {
      showToast(error?.message || t.backupFailed, 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup() {
    if (!restoreFile || !restoreConfirmed) {
      showToast(t.restoreConfirmRequired, 'error');
      return;
    }
    setRestoreBusy(true);
    try {
      const body = new FormData();
      body.append('backupFile', restoreFile);
      body.append('confirmation', 'RESTORE');
      await apiAuthForm('/system/restore', 'POST', body);
      setRestoreFile(null);
      setRestoreConfirmed(false);
      await loadBackups();
      showToast(t.restoreComplete, 'success');
    } catch (error: any) {
      showToast(error?.message || t.restoreFailed, 'error');
    } finally {
      setRestoreBusy(false);
    }
  }

  const t = locale === 'ar'
    ? { settings: 'الإعدادات', systemSettings: 'إعدادات النظام', description: 'المظهر، اللغة، والإصدار', build: 'الإصدار', dark: 'الواجهة الافتراضية', construction: 'واجهة الورش الدافئة', light: 'واجهة فاتحة', backupTitle: 'النسخ الاحتياطي والاستعادة', backupDesc: 'احفظ قاعدة البيانات والملفات المرفوعة في ملف واحد.', createBackup: 'إنشاء نسخة احتياطية', creatingBackup: 'جار الإنشاء...', recentBackups: 'النسخ الأخيرة', download: 'تحميل', noBackups: 'لا توجد نسخ احتياطية بعد.', chooseBackup: 'اختيار ملف نسخة احتياطية', restoreBackup: 'استعادة النسخة', restoringBackup: 'جار الاستعادة...', restoreWarning: 'أفهم أن الاستعادة ستستبدل البيانات الحالية.', backupReady: 'تم إنشاء النسخة الاحتياطية وتحميلها.', backupFailed: 'فشل إنشاء النسخة الاحتياطية.', restoreComplete: 'تمت الاستعادة. أعد تحميل الصفحة إذا لم تظهر البيانات فوراً.', restoreFailed: 'فشلت الاستعادة.', restoreConfirmRequired: 'اختر ملف النسخة وفعّل التأكيد أولاً.' }
    : locale === 'de'
      ? { settings: 'Einstellungen', systemSettings: 'Systemeinstellungen', description: 'Darstellung, Sprache und Version', build: 'Build', dark: 'Standard UI', construction: 'Warme Baustellen-UI', light: 'Helle UI', backupTitle: 'Backup & Wiederherstellung', backupDesc: 'Datenbank und Upload-Dateien in einer Datei sichern.', createBackup: 'Backup erstellen', creatingBackup: 'Erstelle...', recentBackups: 'Letzte Backups', download: 'Download', noBackups: 'Noch keine Backups vorhanden.', chooseBackup: 'Backup-Datei auswaehlen', restoreBackup: 'Backup wiederherstellen', restoringBackup: 'Stelle wieder her...', restoreWarning: 'Ich verstehe, dass die Wiederherstellung aktuelle Daten ersetzt.', backupReady: 'Backup wurde erstellt und heruntergeladen.', backupFailed: 'Backup konnte nicht erstellt werden.', restoreComplete: 'Wiederherstellung abgeschlossen. Lade die Seite neu, falls Daten nicht sofort sichtbar sind.', restoreFailed: 'Wiederherstellung fehlgeschlagen.', restoreConfirmRequired: 'Bitte Backup-Datei waehlen und Bestaetigung aktivieren.' }
      : { settings: 'Settings', systemSettings: 'System settings', description: 'Appearance, language, and version', build: 'Build', dark: 'Default UI', construction: 'Warm site UI', light: 'Bright UI', backupTitle: 'Backup & Restore', backupDesc: 'Save the database and uploaded files in one backup file.', createBackup: 'Create backup', creatingBackup: 'Creating...', recentBackups: 'Recent backups', download: 'Download', noBackups: 'No backups yet.', chooseBackup: 'Choose backup file', restoreBackup: 'Restore backup', restoringBackup: 'Restoring...', restoreWarning: 'I understand restore replaces current data.', backupReady: 'Backup created and downloaded.', backupFailed: 'Backup could not be created.', restoreComplete: 'Restore complete. Refresh the page if data does not appear immediately.', restoreFailed: 'Restore failed.', restoreConfirmRequired: 'Choose a backup file and confirm restore first.' };

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        className="btn settings-menu-trigger"
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg className="settings-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1H4a2 2 0 1 1 0-4h.06a1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6V4a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.8 1.8 0 0 0 19.4 9c.22.36.44.7.6 1H20a2 2 0 1 1 0 4h-.06a1.8 1.8 0 0 0-.54 1Z" />
        </svg>
        <span>{t.settings}</span>
      </button>

      {isOpen && (
        <div className="settings-menu-panel" role="menu">
          <div className="settings-menu-header">
            <div>
              <strong>{t.systemSettings}</strong>
              <small>{t.description}</small>
            </div>
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
                className={mounted && theme === 'dark' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('dark')}
                role="menuitem"
              >
                <span><em>{THEME_DETAILS.dark.tone}</em>{messages.theme.original}</span>
                <small>{t.dark}</small>
              </button>
              <button
                className={mounted && theme === 'construction' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('construction')}
                role="menuitem"
              >
                <span><em>{THEME_DETAILS.construction.tone}</em>{messages.theme.construction}</span>
                <small>{t.construction}</small>
              </button>
              <button
                className={mounted && theme === 'light' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('light')}
                role="menuitem"
              >
                <span><em>{THEME_DETAILS.light.tone}</em>{messages.theme.light}</span>
                <small>{t.light}</small>
              </button>
            </div>
          </div>
          <div className="settings-menu-section settings-backup-section">
            <div className="settings-menu-title">{t.backupTitle}</div>
            <p className="settings-backup-desc">{t.backupDesc}</p>
            <button className="btn primary settings-backup-main" type="button" onClick={createBackup} disabled={backupBusy}>
              {backupBusy ? t.creatingBackup : t.createBackup}
            </button>

            <div className="settings-backup-list">
              <strong>{t.recentBackups}</strong>
              {backups.length ? backups.slice(0, 3).map((backup) => (
                <div key={backup.fileName} className="settings-backup-item">
                  <div>
                    <span>{formatDate(backup.createdAt) || backup.fileName}</span>
                    <small>{formatSize(backup.sizeBytes)} · {backup.uploadFileCount || 0} files</small>
                  </div>
                  <button className="btn" type="button" onClick={() => downloadBackup(backup.fileName)}>
                    {t.download}
                  </button>
                </div>
              )) : (
                <small className="settings-backup-empty">{t.noBackups}</small>
              )}
            </div>

            <div className="settings-restore-box">
              <label className="settings-restore-file">
                <span>{restoreFile?.name || t.chooseBackup}</span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => setRestoreFile(event.target.files?.[0] || null)}
                />
              </label>
              <label className="settings-restore-confirm">
                <input
                  type="checkbox"
                  checked={restoreConfirmed}
                  onChange={(event) => setRestoreConfirmed(event.target.checked)}
                />
                <span>{t.restoreWarning}</span>
              </label>
              <button className="btn danger" type="button" onClick={restoreBackup} disabled={restoreBusy || !restoreFile || !restoreConfirmed}>
                {restoreBusy ? t.restoringBackup : t.restoreBackup}
              </button>
            </div>
          </div>
          <div className="settings-menu-version">
            <span>{t.build}</span>
            <strong>{APP_VERSION}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

