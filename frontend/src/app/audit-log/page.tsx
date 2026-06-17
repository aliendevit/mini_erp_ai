'use client';

import { useEffect, useMemo, useState } from 'react';

import { apiGet } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { ListPager } from '../ui/ListPager';

type AuditLogItem = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  summary?: string | null;
  details?: Record<string, unknown>;
  createdAt?: string | null;
};

type AuditResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
  stats: {
    total: number;
    invoiceChanges: number;
    backupRestores: number;
    monitoringResolutions: number;
    aiConfirmations: number;
  };
};

const PAGE_SIZE = 12;
const actionOptions = [
  'all',
  'invoice.updated',
  'invoice.deleted',
  'order.created',
  'order.deleted',
  'ai.proposal.confirmed',
  'backup.restored',
  'monitoring.alert.updated',
] as const;

const entityOptions = ['all', 'Invoice', 'Order', 'Proposal', 'SystemBackup', 'ProjectMonitoringAlert'] as const;

const copy = {
  de: {
    nav: 'Audit Log',
    kicker: 'Sicherheitsprotokoll',
    title: 'Audit Log',
    description: 'Nachvollziehen, wer kritische Geschaeftsdaten geaendert, geloescht oder bestaetigt hat.',
    search: 'Suchen nach Aktion, Benutzer, Objekt oder Zusammenfassung',
    action: 'Aktion',
    entity: 'Objekt',
    all: 'Alle',
    refresh: 'Aktualisieren',
    loading: 'Audit Log wird geladen...',
    noRows: 'Keine Protokolleintraege gefunden.',
    actor: 'Benutzer',
    systemUser: 'System / unbekannt',
    objectId: 'Objekt-ID',
    createdAt: 'Zeitpunkt',
    summary: 'Zusammenfassung',
    details: 'Details',
    total: 'Eintraege gesamt',
    invoiceChanges: 'Rechnungsaenderungen',
    backupRestores: 'Wiederherstellungen',
    monitoringResolutions: 'Monitoring geloest',
    aiConfirmations: 'AI Bestaetigungen',
    latestActivity: 'Letzte Aktivitaet',
    filters: 'Filter',
    important: 'Wichtige Ereignisse',
    actionLabels: {
      all: 'Alle Aktionen',
      'invoice.updated': 'Rechnung bearbeitet',
      'invoice.deleted': 'Rechnung geloescht',
      'order.created': 'Auftrag erstellt',
      'order.deleted': 'Auftrag geloescht',
      'ai.proposal.confirmed': 'AI Vorschlag bestaetigt',
      'backup.restored': 'Backup wiederhergestellt',
      'monitoring.alert.updated': 'Monitoring-Alert aktualisiert',
    },
    entityLabels: {
      all: 'Alle Objekte',
      Invoice: 'Rechnung',
      Order: 'Auftrag',
      Proposal: 'AI Vorschlag',
      SystemBackup: 'Backup',
      ProjectMonitoringAlert: 'Monitoring Alert',
    },
  },
  en: {
    nav: 'Audit Log',
    kicker: 'Security trail',
    title: 'Audit Log',
    description: 'See who changed, deleted, confirmed, restored, or resolved important business records.',
    search: 'Search by action, user, entity, or summary',
    action: 'Action',
    entity: 'Entity',
    all: 'All',
    refresh: 'Refresh',
    loading: 'Loading audit log...',
    noRows: 'No audit events found.',
    actor: 'User',
    systemUser: 'System / unknown',
    objectId: 'Object ID',
    createdAt: 'Time',
    summary: 'Summary',
    details: 'Details',
    total: 'Total events',
    invoiceChanges: 'Invoice changes',
    backupRestores: 'Backup restores',
    monitoringResolutions: 'Monitoring resolved',
    aiConfirmations: 'AI confirmations',
    latestActivity: 'Latest activity',
    filters: 'Filters',
    important: 'Important events',
    actionLabels: {
      all: 'All actions',
      'invoice.updated': 'Invoice edited',
      'invoice.deleted': 'Invoice deleted',
      'order.created': 'Order created',
      'order.deleted': 'Order deleted',
      'ai.proposal.confirmed': 'AI proposal confirmed',
      'backup.restored': 'Backup restored',
      'monitoring.alert.updated': 'Monitoring alert updated',
    },
    entityLabels: {
      all: 'All entities',
      Invoice: 'Invoice',
      Order: 'Order',
      Proposal: 'AI proposal',
      SystemBackup: 'Backup',
      ProjectMonitoringAlert: 'Monitoring alert',
    },
  },
  ar: {
    nav: 'سجل التدقيق',
    kicker: 'مسار الأمان',
    title: 'سجل التدقيق',
    description: 'اعرف من عدل أو حذف أو أكد أو استعاد أو عالج السجلات المهمة في النظام.',
    search: 'ابحث حسب الإجراء أو المستخدم أو السجل أو الملخص',
    action: 'الإجراء',
    entity: 'السجل',
    all: 'الكل',
    refresh: 'تحديث',
    loading: 'جار تحميل سجل التدقيق...',
    noRows: 'لا توجد أحداث تدقيق.',
    actor: 'المستخدم',
    systemUser: 'النظام / غير معروف',
    objectId: 'معرف السجل',
    createdAt: 'الوقت',
    summary: 'الملخص',
    details: 'التفاصيل',
    total: 'إجمالي الأحداث',
    invoiceChanges: 'تغييرات الفواتير',
    backupRestores: 'استعادة النسخ',
    monitoringResolutions: 'معالجة التنبيهات',
    aiConfirmations: 'تأكيدات الذكاء',
    latestActivity: 'آخر نشاط',
    filters: 'التصفية',
    important: 'الأحداث المهمة',
    actionLabels: {
      all: 'كل الإجراءات',
      'invoice.updated': 'تم تعديل فاتورة',
      'invoice.deleted': 'تم حذف فاتورة',
      'order.created': 'تم إنشاء طلب',
      'order.deleted': 'تم حذف طلب',
      'ai.proposal.confirmed': 'تم تأكيد مقترح الذكاء',
      'backup.restored': 'تمت استعادة نسخة احتياطية',
      'monitoring.alert.updated': 'تم تحديث تنبيه مراقبة',
    },
    entityLabels: {
      all: 'كل السجلات',
      Invoice: 'فاتورة',
      Order: 'طلب',
      Proposal: 'مقترح ذكاء',
      SystemBackup: 'نسخة احتياطية',
      ProjectMonitoringAlert: 'تنبيه مراقبة',
    },
  },
} as const;

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actionTone(action: string) {
  if (action.includes('deleted') || action.includes('restored')) return 'critical';
  if (action.includes('updated')) return 'warning';
  if (action.includes('confirmed') || action.includes('created')) return 'success';
  return 'neutral';
}

function shortId(value: string | null | undefined) {
  if (!value) return '-';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export default function AuditLogPage() {
  const { locale } = useI18n();
  const t = copy[locale];
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<AuditResponse['stats']>({
    total: 0,
    invoiceChanges: 0,
    backupRestores: 0,
    monitoringResolutions: 0,
    aiConfirmations: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<(typeof actionOptions)[number]>('all');
  const [entityType, setEntityType] = useState<(typeof entityOptions)[number]>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (query.trim()) params.set('q', query.trim());
    if (action !== 'all') params.set('action', action);
    if (entityType !== 'all') params.set('entityType', entityType);

    apiGet<AuditResponse>(`/system/audit-logs?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setStats(data.stats);
        setTotal(data.total || 0);
        setError(null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Failed to load audit log');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, query, action, entityType, reloadKey]);

  const latest = items[0];
  const metricCards = useMemo(
    () => [
      { label: t.total, value: stats.total },
      { label: t.invoiceChanges, value: stats.invoiceChanges },
      { label: t.backupRestores, value: stats.backupRestores },
      { label: t.monitoringResolutions, value: stats.monitoringResolutions },
      { label: t.aiConfirmations, value: stats.aiConfirmations },
    ],
    [stats, t]
  );

  return (
    <div className="audit-page">
      <section className="audit-hero">
        <div className="audit-hero-copy">
          <div className="entity-kicker">{t.kicker}</div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
          <div className="audit-latest">
            <span>{t.latestActivity}</span>
            <strong>{latest ? t.actionLabels[latest.action as keyof typeof t.actionLabels] || latest.action : '-'}</strong>
            <small>{latest ? formatDate(latest.createdAt, locale) : '-'}</small>
          </div>
        </div>
        <div className="audit-hero-metrics">
          {metricCards.map((metric) => (
            <div key={metric.label} className="audit-metric">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="audit-panel">
        <div className="audit-panel-header">
          <div>
            <span>{t.filters}</span>
            <strong>{t.important}</strong>
          </div>
          <button type="button" className="btn" onClick={() => setReloadKey((current) => current + 1)}>
            {t.refresh}
          </button>
        </div>

        <div className="audit-toolbar">
          <label className="audit-search">
            <span>{t.search}</span>
            <input
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder={t.search}
            />
          </label>
          <label>
            <span>{t.action}</span>
            <select
              value={action}
              onChange={(event) => {
                setPage(1);
                setAction(event.target.value as (typeof actionOptions)[number]);
              }}
            >
              {actionOptions.map((option) => (
                <option key={option} value={option}>
                  {t.actionLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.entity}</span>
            <select
              value={entityType}
              onChange={(event) => {
                setPage(1);
                setEntityType(event.target.value as (typeof entityOptions)[number]);
              }}
            >
              {entityOptions.map((option) => (
                <option key={option} value={option}>
                  {t.entityLabels[option]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <div className="audit-state">{t.loading}</div> : null}
        {error ? <div className="monitoring-warning monitoring-warning-high">{error}</div> : null}

        <div className="audit-timeline">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const label = t.actionLabels[item.action as keyof typeof t.actionLabels] || item.action;
            const entityLabel = t.entityLabels[item.entityType as keyof typeof t.entityLabels] || item.entityType;
            const detailsText = JSON.stringify(item.details || {}, null, 2);
            return (
              <article key={item.id} className={`audit-row audit-row-${actionTone(item.action)}`}>
                <button type="button" className="audit-row-main" onClick={() => setExpandedId(expanded ? null : item.id)}>
                  <span className="audit-dot" aria-hidden="true" />
                  <span className="audit-row-content">
                    <span className="audit-row-title">
                      <strong>{label}</strong>
                      <em>{entityLabel}</em>
                    </span>
                    <span className="audit-row-summary">{item.summary || label}</span>
                    <span className="audit-row-meta">
                      <span><b>{t.actor}</b>{item.actorEmail || item.actorUserId || t.systemUser}</span>
                      <span><b>{t.objectId}</b>{shortId(item.entityId)}</span>
                      <span><b>{t.createdAt}</b>{formatDate(item.createdAt, locale)}</span>
                    </span>
                  </span>
                  <span className="audit-expand">{expanded ? '-' : '+'}</span>
                </button>
                {expanded ? (
                  <div className="audit-details">
                    <div>
                      <span>{t.summary}</span>
                      <p>{item.summary || '-'}</p>
                    </div>
                    <div>
                      <span>{t.details}</span>
                      <pre>{detailsText === '{}' ? '-' : detailsText}</pre>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {!loading && items.length === 0 ? <div className="audit-state">{t.noRows}</div> : null}
        <ListPager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </section>
    </div>
  );
}
