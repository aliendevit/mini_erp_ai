'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { apiGet } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { ListPager } from '../ui/ListPager';

type Customer = {
  id: string;
  companyName: string;
};

type Order = {
  id: string;
  customerId: string;
  customer?: Customer | null;
  orderNumber?: string | null;
  title: string;
  description?: string | null;
  status: string;
  createdAt?: string | null;
};

type TrackingPayload = {
  dashboard: {
    overallStatus: string;
    overallProgressPercent: number;
    warnings?: Array<{ type: string; severity: string; message: string }>;
  };
};

type MonitoringReport = {
  id: string;
  healthStatus: string;
  summary?: string | null;
  createdAt?: string | null;
};

type MonitoringAlert = {
  id: string;
  status: string;
};

type MonitoringSummary = {
  healthStatus: string;
  progressPercent: number;
  warningCount: number;
  openAlertCount: number;
  latestSummary?: string | null;
  latestReportDate?: string | null;
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

type StatusFilter = 'all' | 'open' | 'paused' | 'closed';

const LIST_PAGE_SIZE = 8;

const copy = {
  de: {
    kicker: 'AI Monitoring',
    title: 'Projekt auswaehlen',
    description: 'Waehlen Sie den Auftrag, den die KI pruefen soll. Danach sehen Sie Fortschritt, Warnungen, Risiken und empfohlene Aktionen.',
    search: 'Nach Projekt, Kunde oder Auftragsnummer suchen',
    all: 'Alle',
    open: 'Offen',
    paused: 'Pausiert',
    closed: 'Geschlossen',
    openMonitoring: 'Monitoring oeffnen',
    openTracking: 'Tracking oeffnen',
    details: 'Details',
    noProjects: 'Keine passenden Projekte gefunden.',
    loading: 'Projekte werden geladen...',
    step1: 'Projekt waehlen',
    step2: 'KI prueft Trackingdaten',
    step3: 'Risiken und Aktionen ansehen',
    activeProjects: 'Aktive Projekte',
    totalProjects: 'Alle Projekte',
    closedProjects: 'Geschlossen',
    customer: 'Kunde',
    orderNumber: 'Auftrag',
    status: 'Status',
    health: 'KI-Status',
    progress: 'Fortschritt',
    warnings: 'Warnungen',
    openAlerts: 'Offene Alerts',
    latestReport: 'Letzter Monitoringbericht',
    noMonitoringData: 'Noch keine Monitoringdaten.',
    noDescription: 'Keine Beschreibung hinterlegt.',
    flowLabel: 'Monitoring Ablauf',
    statusFilterLabel: 'Projektstatus Filter',
  },
  en: {
    kicker: 'AI Monitoring',
    title: 'Choose a project',
    description: 'Select the order you want AI to review. Then you will see progress, warnings, risks, and recommended actions.',
    search: 'Search by project, customer, or order number',
    all: 'All',
    open: 'Open',
    paused: 'Paused',
    closed: 'Closed',
    openMonitoring: 'Open monitoring',
    openTracking: 'Open tracking',
    details: 'Details',
    noProjects: 'No matching projects found.',
    loading: 'Loading projects...',
    step1: 'Choose project',
    step2: 'AI checks tracking data',
    step3: 'Review risks and actions',
    activeProjects: 'Active projects',
    totalProjects: 'All projects',
    closedProjects: 'Closed',
    customer: 'Customer',
    orderNumber: 'Order',
    status: 'Status',
    health: 'AI status',
    progress: 'Progress',
    warnings: 'Warnings',
    openAlerts: 'Open alerts',
    latestReport: 'Latest monitoring report',
    noMonitoringData: 'No monitoring data yet.',
    noDescription: 'No description added.',
    flowLabel: 'Monitoring flow',
    statusFilterLabel: 'Project status filter',
  },
  ar: {
    kicker: '\u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0630\u0643\u064a\u0629',
    title: '\u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u0634\u0631\u0648\u0639',
    description: '\u0627\u062e\u062a\u0631 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0630\u064a \u062a\u0631\u064a\u062f \u0623\u0646 \u064a\u0631\u0627\u062c\u0639\u0647 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a. \u0628\u0639\u062f\u0647\u0627 \u0633\u062a\u0631\u0649 \u0627\u0644\u062a\u0642\u062f\u0645\u060c \u0627\u0644\u062a\u062d\u0630\u064a\u0631\u0627\u062a\u060c \u0627\u0644\u0645\u062e\u0627\u0637\u0631\u060c \u0648\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629.',
    search: '\u0627\u0628\u062d\u062b \u0628\u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0623\u0648 \u0627\u0644\u0639\u0645\u064a\u0644 \u0623\u0648 \u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628',
    all: '\u0627\u0644\u0643\u0644',
    open: '\u0645\u0641\u062a\u0648\u062d',
    paused: '\u0645\u062a\u0648\u0642\u0641',
    closed: '\u0645\u063a\u0644\u0642',
    openMonitoring: '\u0641\u062a\u062d \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629',
    openTracking: '\u0641\u062a\u062d \u0627\u0644\u062a\u062a\u0628\u0639',
    details: '\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644',
    noProjects: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0634\u0627\u0631\u064a\u0639 \u0645\u0637\u0627\u0628\u0642\u0629.',
    loading: '\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639...',
    step1: '\u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u0634\u0631\u0648\u0639',
    step2: '\u0627\u0644\u0630\u0643\u0627\u0621 \u064a\u0631\u0627\u062c\u0639 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062a\u062a\u0628\u0639',
    step3: '\u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u062e\u0627\u0637\u0631 \u0648\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a',
    activeProjects: '\u0645\u0634\u0627\u0631\u064a\u0639 \u0646\u0634\u0637\u0629',
    totalProjects: '\u0643\u0644 \u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639',
    closedProjects: '\u0645\u063a\u0644\u0642\u0629',
    customer: '\u0627\u0644\u0639\u0645\u064a\u0644',
    orderNumber: '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628',
    status: '\u0627\u0644\u062d\u0627\u0644\u0629',
    health: '\u062d\u0627\u0644\u0629 \u0627\u0644\u0630\u0643\u0627\u0621',
    progress: '\u0627\u0644\u062a\u0642\u062f\u0645',
    warnings: '\u0627\u0644\u062a\u062d\u0630\u064a\u0631\u0627\u062a',
    openAlerts: '\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0645\u0641\u062a\u0648\u062d\u0629',
    latestReport: '\u0622\u062e\u0631 \u062a\u0642\u0631\u064a\u0631 \u0645\u0631\u0627\u0642\u0628\u0629',
    noMonitoringData: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0631\u0627\u0642\u0628\u0629 \u0628\u0639\u062f.',
    noDescription: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0648\u0635\u0641 \u0645\u0633\u062c\u0644.',
    flowLabel: '\u062e\u0637\u0648\u0627\u062a \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629',
    statusFilterLabel: '\u062a\u0635\u0641\u064a\u0629 \u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0634\u0631\u0648\u0639',
  },
} as const;

const filters: StatusFilter[] = ['all', 'open', 'paused', 'closed'];

export default function MonitoringIndexPage() {
  const { locale, messages: m } = useI18n();
  const t = copy[locale];
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monitoringByOrder, setMonitoringByOrder] = useState<Record<string, MonitoringSummary>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      paginated: 'true',
      page: String(page),
      pageSize: String(LIST_PAGE_SIZE),
    });
    if (query.trim()) params.set('q', query.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    apiGet<PaginatedResponse<Order>>(`/orders?${params.toString()}`)
      .then((pageData) => {
        const items = pageData.items || [];
        if (!cancelled) {
          setOrders(items);
          setTotalOrders(pageData.total || 0);
          setError(null);
        }
        return Promise.all(
          items.map(async (order) => {
            try {
              const [tracking, historyData, alertData] = await Promise.all([
                apiGet<TrackingPayload>(`/orders/${order.id}/tracking`),
                apiGet<{ items: MonitoringReport[] }>(`/orders/${order.id}/tracking/monitoring-history`),
                apiGet<{ items: MonitoringAlert[] }>(`/orders/${order.id}/tracking/alerts?status=open&syncCurrent=false`),
              ]);
              const latest = historyData.items?.[0];
              return {
                orderId: order.id,
                summary: {
                  healthStatus: latest?.healthStatus || tracking.dashboard.overallStatus,
                  progressPercent: tracking.dashboard.overallProgressPercent,
                  warningCount: tracking.dashboard.warnings?.length || 0,
                  openAlertCount: alertData.items?.length || 0,
                  latestSummary: latest?.summary || null,
                  latestReportDate: latest?.createdAt || null,
                },
              };
            } catch {
              return null;
            }
          })
        );
      })
      .then((summaries) => {
        if (cancelled || !summaries) return;
        const next: Record<string, MonitoringSummary> = {};
        for (const item of summaries) {
          if (item) next[item.orderId] = item.summary;
        }
        setMonitoringByOrder(next);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, query, statusFilter]);

  const filtered = useMemo(() => {
    return orders;
  }, [orders]);

  const activeCount = orders.filter((order) => order.status !== 'closed').length;
  const closedCount = orders.filter((order) => order.status === 'closed').length;

  function statusLabel(status: string) {
    return m.statuses.order[(status as 'open' | 'paused' | 'closed') || 'open'] || status || m.common.none;
  }

  function monitoringStatusLabel(status: string | null | undefined) {
    if (!status) return m.common.none;
    return m.trackingPage.labels[status] || status.replace(/[_-]+/g, ' ');
  }

  return (
    <div className="monitoring-picker-page">
      <section className="monitoring-picker-hero-simple card">
        <div className="monitoring-picker-hero-copy">
          <div className="entity-kicker">{t.kicker}</div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
          <div className="monitoring-picker-steps" aria-label={t.flowLabel}>
            <span>1. {t.step1}</span>
            <span>2. {t.step2}</span>
            <span>3. {t.step3}</span>
          </div>
        </div>
        <div className="monitoring-picker-summary">
          <div><strong>{activeCount}</strong><span>{t.activeProjects}</span></div>
          <div><strong>{totalOrders}</strong><span>{t.totalProjects}</span></div>
          <div><strong>{closedCount}</strong><span>{t.closedProjects}</span></div>
        </div>
      </section>

      <section className="card monitoring-picker-panel-simple">
        <div className="monitoring-picker-toolbar-simple">
          <div className="monitoring-picker-search">
            <label>{t.search}</label>
            <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder={t.search} />
          </div>
          <div className="monitoring-picker-filters" aria-label={t.statusFilterLabel}>
            {filters.map((filter) => (
              <button key={filter} type="button" className={statusFilter === filter ? 'active' : ''} onClick={() => { setPage(1); setStatusFilter(filter); }}>
                {t[filter]}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="monitoring-picker-state">{t.loading}</div>}
        {error && <div className="monitoring-warning monitoring-warning-high">{error}</div>}

        <div className="monitoring-project-list">
          {filtered.map((order) => (
            <article key={order.id} className="monitoring-project-row card">
              {(() => {
                const monitoring = monitoringByOrder[order.id];
                return (
                  <>
                    <div className="monitoring-project-main">
                      <div className="monitoring-project-title-row">
                        <h3>{order.title}</h3>
                        <span className={`status-pill status-${(monitoring?.healthStatus || order.status || 'open').toLowerCase()}`}>
                          {monitoring ? monitoringStatusLabel(monitoring.healthStatus) : statusLabel(order.status)}
                        </span>
                      </div>
                      <p>{order.description || t.noDescription}</p>
                      <div className="monitoring-project-meta">
                        <span><b>{t.customer}</b>{order.customer?.companyName || m.common.none}</span>
                        <span><b>{t.orderNumber}</b>{order.orderNumber || m.common.none}</span>
                        <span><b>{t.status}</b>{statusLabel(order.status)}</span>
                        {monitoring && (
                          <>
                            <span><b>{t.progress}</b>{monitoring.progressPercent}%</span>
                            <span><b>{t.warnings}</b>{monitoring.warningCount}</span>
                            <span><b>{t.openAlerts}</b>{monitoring.openAlertCount}</span>
                          </>
                        )}
                      </div>
                      <div className="monitoring-project-meta">
                        <span>
                          <b>{t.latestReport}</b>
                          {monitoring?.latestSummary || t.noMonitoringData}
                        </span>
                      </div>
                    </div>
                    <div className="monitoring-project-actions">
                      <Link className="btn primary" href={`/orders/${order.id}/monitoring`}>{t.openMonitoring}</Link>
                      <Link className="btn" href={`/orders/${order.id}/tracking`}>{t.openTracking}</Link>
                      <Link className="btn secondary" href={`/orders/${order.id}`}>{t.details}</Link>
                    </div>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
        <ListPager page={page} total={totalOrders} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />

        {!loading && filtered.length === 0 && <div className="monitoring-empty-state"><strong>{t.noProjects}</strong></div>}
      </section>
    </div>
  );
}
