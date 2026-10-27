'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { apiAuthBlob, apiAuthForm, apiAuthGet, apiAuthJson } from '../../lib/api';
import { readStoredAccessUser } from '../../lib/access';
import type { Locale } from '../../lib/i18n-config';
import { useI18n } from '../../lib/i18n';
import { useToast } from './ToastProvider';

type Theme = 'dark' | 'light' | 'construction';

const THEME_STORAGE_KEY = 'sa_theme';
const LOCALES: Locale[] = ['de', 'en', 'ar'];
const APP_VERSION = 'v1.7.1.0';

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
  recordCount?: number;
  scope?: 'platform' | 'company';
};

type BackupScope = 'platform' | 'company' | null;

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
  const [restorePassword, setRestorePassword] = useState('');
  const [backupScope, setBackupScope] = useState<BackupScope>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; offset: number } | null>(null);
  const isOpen = open ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setDragOffset(0);
      setIsDragging(false);
      dragRef.current = null;
    }
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
    function refreshAccess() {
      const user = readStoredAccessUser();
      const nextScope = user?.accountLevel === 'platform_admin'
        ? 'platform'
        : user?.accountLevel === 'company_manager'
          ? 'company'
          : null;
      setBackupScope(nextScope);
      setBackups([]);
    }

    refreshAccess();
    window.addEventListener('omran-auth-changed', refreshAccess);
    return () => window.removeEventListener('omran-auth-changed', refreshAccess);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !backupScope) return;
    loadBackups();
  }, [isOpen, backupScope]);

  useEffect(() => {
    if (!isOpen || !window.matchMedia('(max-width: 760px)').matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('settings-sheet-open');
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove('settings-sheet-open');
    };
  }, [isOpen]);

  function startSheetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, offset: 0 };
    setIsDragging(true);
  }

  function moveSheetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const offset = Math.min(280, Math.max(0, event.clientY - drag.startY));
    drag.offset = offset;
    setDragOffset(offset);
  }

  function endSheetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (drag.offset >= 96) {
      setOpen(false);
      return;
    }
    setDragOffset(0);
  }

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  }

  async function loadBackups() {
    try {
      const path = backupScope === 'company' ? '/system/company-backups' : '/system/backups';
      const result = await apiAuthGet<{ items: BackupInfo[] }>(path);
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
      const path = backupScope === 'company' ? '/system/company-backups' : '/system/backups';
      const blob = await apiAuthBlob(`${path}/${encodeURIComponent(fileName)}`);
      downloadBlob(blob, fileName);
    } catch (error: any) {
      showToast(error?.message || t.backupFailed, 'error');
    }
  }

  async function createBackup() {
    setBackupBusy(true);
    try {
      const path = backupScope === 'company' ? '/system/company-backups' : '/system/backups';
      const backup = await apiAuthJson<BackupInfo>(path, 'POST');
      setBackups((current) => [backup, ...current.filter((item) => item.fileName !== backup.fileName)]);
      const blob = await apiAuthBlob(`${path}/${encodeURIComponent(backup.fileName)}`);
      downloadBlob(blob, backup.fileName);
      showToast(t.backupReady, 'success');
    } catch (error: any) {
      showToast(error?.message || t.backupFailed, 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup() {
    if (!restoreFile || !restoreConfirmed || !restorePassword) {
      showToast(t.restoreConfirmRequired, 'error');
      return;
    }
    setRestoreBusy(true);
    try {
      const body = new FormData();
      body.append('backupFile', restoreFile);
      body.append('confirmation', 'RESTORE');
      body.append('currentPassword', restorePassword);
      const path = backupScope === 'company' ? '/system/company-restore' : '/system/restore';
      await apiAuthForm(path, 'POST', body);
      setRestoreFile(null);
      setRestoreConfirmed(false);
      setRestorePassword('');
      await loadBackups();
      showToast(t.restoreComplete, 'success');
    } catch (error: any) {
      showToast(error?.message || t.restoreFailed, 'error');
    } finally {
      setRestoreBusy(false);
    }
  }

  const t = locale === 'ar'
    ? {
        settings: 'الإعدادات', systemSettings: 'إعدادات النظام', description: 'المظهر، اللغة، والإصدار', close: 'إغلاق', build: 'الإصدار', dark: 'الواجهة الافتراضية', construction: 'واجهة الورش الدافئة', light: 'واجهة فاتحة',
        backupTitle: 'النسخ الاحتياطي الكامل للمنصة', companyBackupTitle: 'نسخ الشركة واستعادتها',
        backupDesc: 'احفظ قاعدة بيانات المنصة وكل الملفات المرفوعة في ملف واحد.', companyBackupDesc: 'احفظ واستعد سجلات وملفات شركتك فقط. لا تشمل النسخة الشركات الأخرى أو فواتير المنصة أو حسابات تسجيل الدخول.',
        createBackup: 'إنشاء نسخة احتياطية', creatingBackup: 'جار الإنشاء...', recentBackups: 'النسخ الأخيرة', download: 'تحميل', noBackups: 'لا توجد نسخ احتياطية بعد.', chooseBackup: 'اختيار ملف نسخة احتياطية', restorePassword: 'كلمة مرور حسابك الحالية', restoreBackup: 'استعادة النسخة', restoringBackup: 'جار الاستعادة...', filesLabel: 'ملفات', recordsLabel: 'سجلات',
        restoreWarning: 'أفهم أن الاستعادة ستستبدل بيانات المنصة الحالية.', companyRestoreWarning: 'أفهم أن الاستعادة ستستبدل سجلات وملفات شركتي الحالية فقط.',
        backupReady: 'تم إنشاء النسخة الاحتياطية وتحميلها.', backupFailed: 'فشل إنشاء النسخة الاحتياطية.', restoreComplete: 'تمت الاستعادة. أعد تحميل الصفحة إذا لم تظهر البيانات فوراً.', restoreFailed: 'فشلت الاستعادة.', restoreConfirmRequired: 'اختر ملف النسخة وأدخل كلمة المرور وفعّل التأكيد.'
      }
    : locale === 'de'
      ? {
          settings: 'Einstellungen', systemSettings: 'Systemeinstellungen', description: 'Darstellung, Sprache und Version', close: 'Schliessen', build: 'Build', dark: 'Standard UI', construction: 'Warme Baustellen-UI', light: 'Helle UI',
          backupTitle: 'Vollstaendiges Plattform-Backup', companyBackupTitle: 'Firmen-Backup & Wiederherstellung',
          backupDesc: 'Plattform-Datenbank und alle Uploads in einer Datei sichern.', companyBackupDesc: 'Nur Geschaeftsdaten und Dateien Ihrer Firma sichern und wiederherstellen. Andere Firmen, Plattformabrechnung und Anmeldekonten bleiben unberuehrt.',
          createBackup: 'Backup erstellen', creatingBackup: 'Erstelle...', recentBackups: 'Letzte Backups', download: 'Download', noBackups: 'Noch keine Backups vorhanden.', chooseBackup: 'Backup-Datei auswaehlen', restorePassword: 'Aktuelles Kontopasswort', restoreBackup: 'Backup wiederherstellen', restoringBackup: 'Stelle wieder her...', filesLabel: 'Dateien', recordsLabel: 'Datensaetze',
          restoreWarning: 'Ich verstehe, dass die Wiederherstellung aktuelle Plattformdaten ersetzt.', companyRestoreWarning: 'Ich verstehe, dass nur die aktuellen Daten und Dateien meiner Firma ersetzt werden.',
          backupReady: 'Backup wurde erstellt und heruntergeladen.', backupFailed: 'Backup konnte nicht erstellt werden.', restoreComplete: 'Wiederherstellung abgeschlossen. Lade die Seite neu, falls Daten nicht sofort sichtbar sind.', restoreFailed: 'Wiederherstellung fehlgeschlagen.', restoreConfirmRequired: 'Bitte Backup-Datei und Passwort angeben und Bestaetigung aktivieren.'
        }
      : {
          settings: 'Settings', systemSettings: 'System settings', description: 'Appearance, language, and version', close: 'Close settings', build: 'Build', dark: 'Default UI', construction: 'Warm site UI', light: 'Bright UI',
          backupTitle: 'Full Platform Backup & Restore', companyBackupTitle: 'Company Backup & Restore',
          backupDesc: 'Save the platform database and all uploaded files in one backup.', companyBackupDesc: 'Save and restore only your company business records and files. Other companies, platform billing, and sign-in accounts are never included.',
          createBackup: 'Create backup', creatingBackup: 'Creating...', recentBackups: 'Recent backups', download: 'Download', noBackups: 'No backups yet.', chooseBackup: 'Choose backup file', restorePassword: 'Current account password', restoreBackup: 'Restore backup', restoringBackup: 'Restoring...', filesLabel: 'files', recordsLabel: 'records',
          restoreWarning: 'I understand restore replaces current platform data.', companyRestoreWarning: 'I understand restore replaces only my company records and files.',
          backupReady: 'Backup created and downloaded.', backupFailed: 'Backup could not be created.', restoreComplete: 'Restore complete. Refresh the page if data does not appear immediately.', restoreFailed: 'Restore failed.', restoreConfirmRequired: 'Choose a backup file, enter your password, and confirm restore.'
        };

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        className="btn settings-menu-trigger"
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t.settings}
      >
        <svg className="settings-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1H4a2 2 0 1 1 0-4h.06a1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6V4a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.8 1.8 0 0 0 19.4 9c.22.36.44.7.6 1H20a2 2 0 1 1 0 4h-.06a1.8 1.8 0 0 0-.54 1Z" />
        </svg>
        <span>{t.settings}</span>
      </button>

      {isOpen && (
        <>
          <button className="settings-menu-backdrop" type="button" aria-label={t.close} onClick={() => setOpen(false)} />
          <div
            className={`settings-menu-panel${isDragging ? ' is-dragging' : ''}`}
            role="dialog"
            aria-label={t.systemSettings}
            style={{ '--settings-sheet-drag': `${dragOffset}px` } as CSSProperties}
            onPointerMove={moveSheetDrag}
            onPointerUp={endSheetDrag}
            onPointerCancel={endSheetDrag}
          >
          <div
            className="settings-sheet-handle"
            onPointerDown={startSheetDrag}
            aria-hidden="true"
          >
            <span />
          </div>
          <div className="settings-menu-header">
            <div>
              <strong>{t.systemSettings}</strong>
              <small>{t.description}</small>
            </div>
            <div className="settings-menu-header-actions">
              <span>{APP_VERSION}</span>
              <button className="settings-menu-close" type="button" onClick={() => setOpen(false)} aria-label={t.close} title={t.close}>
                &#215;
              </button>
            </div>
          </div>
          <div className="settings-menu-scroll">
          <div className="settings-menu-section">
            <div className="settings-menu-title">{messages.language.switchTitle}</div>
            <div className="settings-menu-options" aria-label={messages.language.switchTitle}>
              {LOCALES.map((entry) => (
                <button
                  key={entry}
                  className={locale === entry ? 'active' : undefined}
                  type="button"
                  onClick={() => setLocale(entry)}
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
              >
                <span><em>{THEME_DETAILS.dark.tone}</em>{messages.theme.original}</span>
                <small>{t.dark}</small>
              </button>
              <button
                className={mounted && theme === 'construction' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('construction')}
              >
                <span><em>{THEME_DETAILS.construction.tone}</em>{messages.theme.construction}</span>
                <small>{t.construction}</small>
              </button>
              <button
                className={mounted && theme === 'light' ? 'active' : undefined}
                type="button"
                onClick={() => selectTheme('light')}
              >
                <span><em>{THEME_DETAILS.light.tone}</em>{messages.theme.light}</span>
                <small>{t.light}</small>
              </button>
            </div>
          </div>
          {backupScope && <div className="settings-menu-section settings-backup-section">
            <div className="settings-menu-title">{backupScope === 'company' ? t.companyBackupTitle : t.backupTitle}</div>
            <p className="settings-backup-desc">{backupScope === 'company' ? t.companyBackupDesc : t.backupDesc}</p>
            <button className="btn primary settings-backup-main" type="button" onClick={createBackup} disabled={backupBusy}>
              {backupBusy ? t.creatingBackup : t.createBackup}
            </button>

            <div className="settings-backup-list">
              <strong>{t.recentBackups}</strong>
              {backups.length ? backups.slice(0, 3).map((backup) => (
                <div key={backup.fileName} className="settings-backup-item">
                  <div>
                    <span>{formatDate(backup.createdAt) || backup.fileName}</span>
                    <small>
                      {formatSize(backup.sizeBytes)} · {backup.uploadFileCount || 0} {t.filesLabel}
                      {backup.recordCount !== undefined ? ` · ${backup.recordCount} ${t.recordsLabel}` : ''}
                    </small>
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
              <input
                type="password"
                autoComplete="current-password"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
                placeholder={t.restorePassword}
              />
              <label className="settings-restore-confirm">
                <input
                  type="checkbox"
                  checked={restoreConfirmed}
                  onChange={(event) => setRestoreConfirmed(event.target.checked)}
                />
                <span>{backupScope === 'company' ? t.companyRestoreWarning : t.restoreWarning}</span>
              </label>
              <button className="btn danger" type="button" onClick={restoreBackup} disabled={restoreBusy || !restoreFile || !restoreConfirmed || !restorePassword}>
                {restoreBusy ? t.restoringBackup : t.restoreBackup}
              </button>
            </div>
          </div>}
          <div className="settings-menu-version">
            <span>{t.build}</span>
            <strong>{APP_VERSION}</strong>
          </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

