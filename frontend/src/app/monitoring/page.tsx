'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { apiGet } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

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

type StatusFilter = 'all' | 'open' | 'paused' | 'closed';

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
    noDescription: 'Keine Beschreibung hinterlegt.',
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
    noDescription: 'No description added.',
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
    noDescription: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0648\u0635\u0641 \u0645\u0633\u062c\u0644.',
  },
} as const;

const filters: StatusFilter[] = ['all', 'open', 'paused', 'closed'];

export default function MonitoringIndexPage() {
  const { locale, messages: m } = useI18n();
  const t = copy[locale];
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<Order[]>('/orders')
      .then((items) => {
        if (!cancelled) {
          setOrders(items);
          setError(null);
        }
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
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatches = statusFilter === 'all' || order.status === statusFilter;
      if (!statusMatches) return false;
      if (!needle) return true;
      return [
        order.title,
        order.orderNumber || '',
        order.customer?.companyName || '',
        order.description || '',
        order.status || '',
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [orders, query, statusFilter]);

  const activeCount = orders.filter((order) => order.status !== 'closed').length;
  const closedCount = orders.filter((order) => order.status === 'closed').length;

  function statusLabel(status: string) {
    return m.statuses.order[(status as 'open' | 'paused' | 'closed') || 'open'] || status || m.common.none;
  }

  return (
    <div className="monitoring-picker-page">
      <section className="monitoring-picker-hero-simple card">
        <div className="monitoring-picker-hero-copy">
          <div className="entity-kicker">{t.kicker}</div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
          <div className="monitoring-picker-steps" aria-label="Monitoring flow">
            <span>1. {t.step1}</span>
            <span>2. {t.step2}</span>
            <span>3. {t.step3}</span>
          </div>
        </div>
        <div className="monitoring-picker-summary">
          <div><strong>{activeCount}</strong><span>{t.activeProjects}</span></div>
          <div><strong>{orders.length}</strong><span>{t.totalProjects}</span></div>
          <div><strong>{closedCount}</strong><span>{t.closedProjects}</span></div>
        </div>
      </section>

      <section className="card monitoring-picker-panel-simple">
        <div className="monitoring-picker-toolbar-simple">
          <div className="monitoring-picker-search">
            <label>{t.search}</label>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
          </div>
          <div className="monitoring-picker-filters" aria-label="Project status filter">
            {filters.map((filter) => (
              <button key={filter} type="button" className={statusFilter === filter ? 'active' : ''} onClick={() => setStatusFilter(filter)}>
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
              <div className="monitoring-project-main">
                <div className="monitoring-project-title-row">
                  <h3>{order.title}</h3>
                  <span className={`status-pill status-${(order.status || 'open').toLowerCase()}`}>{statusLabel(order.status)}</span>
                </div>
                <p>{order.description || t.noDescription}</p>
                <div className="monitoring-project-meta">
                  <span><b>{t.customer}</b>{order.customer?.companyName || m.common.none}</span>
                  <span><b>{t.orderNumber}</b>{order.orderNumber || m.common.none}</span>
                  <span><b>{t.status}</b>{statusLabel(order.status)}</span>
                </div>
              </div>
              <div className="monitoring-project-actions">
                <Link className="btn primary" href={`/orders/${order.id}/monitoring`}>{t.openMonitoring}</Link>
                <Link className="btn" href={`/orders/${order.id}/tracking`}>{t.openTracking}</Link>
                <Link className="btn secondary" href={`/orders/${order.id}`}>{t.details}</Link>
              </div>
            </article>
          ))}
        </div>

        {!loading && filtered.length === 0 && <div className="monitoring-empty-state"><strong>{t.noProjects}</strong></div>}
      </section>
    </div>
  );
}
