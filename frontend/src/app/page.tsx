'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiGet } from '../lib/api';
import { hasPermission, readStoredAccessUser } from '../lib/access';
import { useI18n } from '../lib/i18n';
import { InvoiceSequenceSetting } from './ui/InvoiceSequenceSetting';

type DashboardOrder = {
  id: string;
  title: string;
  status: string;
  customer?: { companyName?: string | null } | null;
};

type TrackingPayload = {
  dashboard: {
    overallStatus: string;
    overallProgressPercent: number;
    warnings?: Array<{ type?: string; severity?: string; message?: string }>;
  };
};

type AlertPayload = {
  items?: Array<{ id: string; status: string }>;
};

type RiskBriefItem = {
  orderId: string;
  href: string;
  title: string;
  customer: string;
  level: 'high' | 'medium' | 'low';
  progress: number;
  warningCount: number;
  openAlertCount: number;
  summary: string;
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

function dashboardLabels(locale: string) {
  if (locale === 'ar') {
    return {
      eyebrow: '\u0644\u0648\u062d\u0629 \u0642\u064a\u0627\u062f\u0629 \u062a\u0646\u0641\u064a\u0630\u064a\u0629',
      title: '\u0645\u0631\u0643\u0632 \u0627\u0644\u062a\u062d\u0643\u0645 \u0628\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639 \u0648\u0627\u0644\u0648\u0631\u0634 \u0648\u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631',
      subtitle: '\u0627\u0628\u062f\u0623 \u0645\u0646 \u0645\u062d\u0627\u062f\u062b\u0629 \u0630\u0643\u064a\u0629\u060c \u062d\u0648\u0651\u0644 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0625\u0644\u0649 \u0639\u0631\u0636\u060c \u0639\u064a\u0651\u0646 \u0627\u0644\u0648\u0631\u0634\u060c \u062b\u0645 \u062a\u0627\u0628\u0639 \u0627\u0644\u062a\u0646\u0641\u064a\u0630 \u0648\u0627\u0644\u0645\u062e\u0627\u0637\u0631 \u0648\u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631 \u0645\u0646 \u0645\u0643\u0627\u0646 \u0648\u0627\u062d\u062f.',
      primaryAction: '\u0627\u0628\u062f\u0623 \u0627\u0633\u062a\u0642\u0628\u0627\u0644 \u0630\u0643\u064a',
      secondaryAction: '\u0627\u0641\u062a\u062d \u0627\u0644\u0637\u0644\u0628\u0627\u062a',
      workflowTitle: '\u0645\u0633\u0627\u0631 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0631\u0626\u064a\u0633\u064a',
      workflowSubtitle: '\u0627\u0644\u0635\u0641\u062d\u0629 \u062a\u062c\u0645\u0639 \u0623\u0647\u0645 \u0623\u062c\u0632\u0627\u0621 \u0627\u0644\u0646\u0638\u0627\u0645 \u0628\u0634\u0643\u0644 \u0633\u0631\u064a\u0639 \u0648\u0648\u0627\u0636\u062d \u0644\u0644\u0645\u062f\u064a\u0631.',
      aiTitle: 'AI Intake',
      aiDesc: '\u064a\u062c\u0645\u0639 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0645\u0646 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0648\u064a\u062d\u0648\u0651\u0644\u0647\u0627 \u0625\u0644\u0649 \u0645\u0633\u0648\u062f\u0629 \u0639\u0631\u0636 \u0648\u0645\u0648\u0627\u0642\u0639 \u0639\u0645\u0644.',
      workshopsTitle: 'Workshop Execution',
      workshopsDesc: '\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0648\u0631\u0634 \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0643\u0644 \u0645\u0648\u0642\u0639 \u0648\u062a\u062a\u0628\u0639 \u0645\u0633\u0624\u0648\u0644\u064a\u0627\u062a \u0627\u0644\u062a\u0646\u0641\u064a\u0630.',
      trackingTitle: 'Project Tracking',
      trackingDesc: '\u0635\u0648\u0631\u060c \u0645\u0647\u0627\u0645\u060c \u0645\u0634\u0627\u0643\u0644\u060c \u0645\u0648\u0627\u062f\u060c \u0648\u062c\u062f\u0648\u0644\u0629 \u062a\u0646\u0641\u064a\u0630 \u0644\u0643\u0644 \u0645\u0648\u0642\u0639.',
      monitoringTitle: 'AI Monitoring',
      monitoringDesc: '\u062a\u062d\u0644\u064a\u0644 \u062a\u0642\u062f\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639\u060c \u0627\u0644\u062a\u062d\u0630\u064a\u0631\u0627\u062a\u060c \u0648\u0645\u062e\u0627\u0637\u0631 \u0627\u0644\u062a\u0623\u062e\u064a\u0631 \u0628\u0646\u0627\u0621\u064b \u0639\u0644\u0649 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062a\u062a\u0628\u0639.',
      quickAccess: '\u0648\u0635\u0648\u0644 \u0633\u0631\u064a\u0639',
      billingSetup: '\u0625\u0639\u062f\u0627\u062f \u0627\u0644\u0641\u0648\u062a\u0631\u0629',
      billingDesc: '\u0625\u062f\u0627\u0631\u0629 \u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 \u0627\u0644\u062a\u0627\u0644\u064a \u0628\u0634\u0643\u0644 \u0645\u0646\u0641\u0635\u0644 \u0648\u0645\u0646\u0638\u0645.',
      setupTitle: '\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629',
      setupDesc: '\u0623\u0636\u0641 \u0623\u0648 \u062d\u062f\u0651\u062b \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0627\u0644\u062d\u0633\u0627\u0628.',
      launch: '\u0641\u062a\u062d',
      stats: [
        { value: '8', label: '\u0635\u0641\u062d\u0627\u062a \u062a\u0634\u063a\u064a\u0644 \u0631\u0626\u064a\u0633\u064a\u0629' },
        { value: 'AI', label: '\u0627\u0633\u062a\u0642\u0628\u0627\u0644 \u0648\u0645\u0631\u0627\u0642\u0628\u0629 \u0630\u0643\u064a\u0629' },
        { value: 'PDF', label: '\u0639\u0631\u0648\u0636 \u0648\u0641\u0648\u0627\u062a\u064a\u0631 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062a\u0635\u062f\u064a\u0631' },
      ],
    };
  }
  if (locale === 'en') {
    return {
      eyebrow: 'Executive Workspace',
      title: 'Project, workshop, and billing control center',
      subtitle: 'Start with AI intake, turn details into a proposal, assign workshops, then monitor execution, risks, photos, and invoices from one place.',
      primaryAction: 'Start AI Intake',
      secondaryAction: 'Open Orders',
      workflowTitle: 'Main Workflow',
      workflowSubtitle: 'A focused entry point for the manager?s daily project operations.',
      aiTitle: 'AI Intake',
      aiDesc: 'Captures project details from chat and generates proposal drafts with work sites.',
      workshopsTitle: 'Workshop Execution',
      workshopsDesc: 'Assign trusted workshops to each site and clarify execution responsibility.',
      trackingTitle: 'Project Tracking',
      trackingDesc: 'Track photos, tasks, issues, materials, and schedules per site.',
      monitoringTitle: 'AI Monitoring',
      monitoringDesc: 'Analyze progress, warnings, delay risks, and missing information from tracking data.',
      quickAccess: 'Quick Access',
      billingSetup: 'Billing Setup',
      billingDesc: 'Manage the next invoice sequence in a dedicated control panel.',
      setupTitle: 'Company info',
      setupDesc: 'Add or update the company profile connected to this account.',
      launch: 'Open',
      stats: [
        { value: '8', label: 'Core operation pages' },
        { value: 'AI', label: 'Intake and monitoring support' },
        { value: 'PDF', label: 'Proposal and invoice exports' },
      ],
    };
  }
  return {
    eyebrow: 'Executive Workspace',
    title: 'Projekt-, Workshop- und Rechnungszentrale',
    subtitle: 'Starte mit KI-Intake, erstelle Vorschlaege, ordne Workshops zu und ueberwache Ausfuehrung, Risiken, Fotos und Rechnungen zentral.',
    primaryAction: 'AI Intake starten',
    secondaryAction: 'Auftraege oeffnen',
    workflowTitle: 'Hauptprozess',
    workflowSubtitle: 'Ein klarer Einstiegspunkt fuer die taegliche Projektsteuerung.',
    aiTitle: 'AI Intake',
    aiDesc: 'Erfasst Projektdaten aus dem Chat und erzeugt Vorschlagsentwuerfe mit Baustellen.',
    workshopsTitle: 'Workshop-Ausfuehrung',
    workshopsDesc: 'Vertrauenswuerdige Workshops je Baustelle zuordnen und Verantwortung klaeren.',
    trackingTitle: 'Projekttracking',
    trackingDesc: 'Fotos, Aufgaben, Probleme, Materialien und Zeitplaene je Baustelle verfolgen.',
    monitoringTitle: 'KI-Monitoring',
    monitoringDesc: 'Fortschritt, Warnungen, Verzoegerungsrisiken und fehlende Informationen analysieren.',
    quickAccess: 'Schnellzugriff',
    billingSetup: 'Rechnungseinstellung',
    billingDesc: 'Naechste Rechnungsnummer in einem separaten Kontrollbereich verwalten.',
    setupTitle: 'Firmendaten',
    setupDesc: 'Firmendaten fuer dieses Konto anlegen oder aktualisieren.',
    launch: 'Oeffnen',
    stats: [
      { value: '8', label: 'Kernseiten fuer Betrieb' },
      { value: 'KI', label: 'Intake und Monitoring' },
      { value: 'PDF', label: 'Angebote und Rechnungen' },
    ],
  };
}

function cardIcon(href: string) {
  if (href.includes('ai-intake')) return 'AI';
  if (href.includes('workshops')) return 'WK';
  if (href.includes('orders')) return 'OR';
  if (href.includes('sites')) return 'ST';
  if (href.includes('customers')) return 'CU';
  if (href.includes('invoices')) return 'IN';
  return 'ERP';
}

function riskLevel(status: string, warnings: Array<{ severity?: string }> = [], openAlertCount = 0): RiskBriefItem['level'] {
  const normalized = String(status || '').toLowerCase();
  const hasHighWarning = warnings.some((warning) => String(warning.severity || '').toLowerCase() === 'high');
  if (normalized.includes('blocked') || hasHighWarning || openAlertCount > 0) return 'high';
  if (warnings.length > 0 || normalized.includes('paused') || normalized.includes('at_risk')) return 'medium';
  return 'low';
}

function riskSummary(item: RiskBriefItem) {
  if (item.level === 'high') return item.openAlertCount > 0 ? `${item.openAlertCount} open alert(s) need review.` : 'High-risk warning found.';
  if (item.level === 'medium') return `${item.warningCount} warning(s), follow up soon.`;
  return 'No urgent risk detected.';
}

export default function Page() {
  const { locale, messages } = useI18n();
  const [riskBriefOpen, setRiskBriefOpen] = useState(false);
  const [riskBriefLoading, setRiskBriefLoading] = useState(false);
  const [riskBriefItems, setRiskBriefItems] = useState<RiskBriefItem[]>([]);
  const labels = dashboardLabels(locale);
  const authButtonLabel = locale === 'ar' ? 'تسجيل الدخول' : locale === 'de' ? 'Anmelden' : 'Login';
  const workflowCards = [
    { title: labels.aiTitle, desc: labels.aiDesc, badge: '01', href: '/ai-intake' },
    { title: labels.workshopsTitle, desc: labels.workshopsDesc, badge: '02', href: '/workshops' },
    { title: labels.trackingTitle, desc: labels.trackingDesc, badge: '03', href: '/orders' },
    { title: labels.monitoringTitle, desc: labels.monitoringDesc, badge: '04', href: '/monitoring' },
  ];

  useEffect(() => {
    const user = readStoredAccessUser();
    if (!user || user.accountLevel !== 'company_manager' || !hasPermission(user, 'view_projects')) return;
    const canOpenMonitoring = hasPermission(user, 'use_ai_monitoring');
    let cancelled = false;
    setRiskBriefLoading(true);
    apiGet<PaginatedResponse<DashboardOrder>>('/orders?paginated=true&page=1&pageSize=50&status=open')
      .then(async (data) => {
        const rows = await Promise.all((data.items || []).map(async (order) => {
          try {
            const [tracking, alerts] = await Promise.all([
              apiGet<TrackingPayload>(`/orders/${order.id}/tracking`),
              apiGet<AlertPayload>(`/orders/${order.id}/tracking/alerts?status=open&syncCurrent=false`),
            ]);
            const warnings = tracking.dashboard.warnings || [];
            const openAlertCount = alerts.items?.length || 0;
            const level = riskLevel(tracking.dashboard.overallStatus || order.status, warnings, openAlertCount);
            const item: RiskBriefItem = {
              orderId: order.id,
              href: canOpenMonitoring ? `/orders/${order.id}/monitoring` : `/orders/${order.id}`,
              title: order.title,
              customer: order.customer?.companyName || 'No customer',
              level,
              progress: Number(tracking.dashboard.overallProgressPercent || 0),
              warningCount: warnings.length,
              openAlertCount,
              summary: '',
            };
            item.summary = riskSummary(item);
            return item;
          } catch {
            return {
              orderId: order.id,
              href: canOpenMonitoring ? `/orders/${order.id}/monitoring` : `/orders/${order.id}`,
              title: order.title,
              customer: order.customer?.companyName || 'No customer',
              level: 'medium' as const,
              progress: 0,
              warningCount: 0,
              openAlertCount: 0,
              summary: 'Tracking data needs review.',
            };
          }
        }));
        if (cancelled) return;
        const sorted = rows.sort((a, b) => {
          const weight = { high: 3, medium: 2, low: 1 };
          return weight[b.level] - weight[a.level] || b.openAlertCount - a.openAlertCount || b.warningCount - a.warningCount;
        });
        setRiskBriefItems(sorted.slice(0, 5));
        setRiskBriefOpen(sorted.length > 0);
      })
      .catch(() => {
        if (!cancelled) setRiskBriefItems([]);
      })
      .finally(() => {
        if (!cancelled) setRiskBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="dashboard-shell">
      {riskBriefOpen ? (
        <div className="risk-brief-backdrop" role="dialog" aria-modal="true" aria-labelledby="risk-brief-title">
          <section className="risk-brief-card card">
            <div className="risk-brief-head">
              <div>
                <span className="entity-kicker">Manager brief</span>
                <h2 id="risk-brief-title">Project risk summary</h2>
                <p>Short project signals for quick prioritization. High-risk rows are shown first.</p>
              </div>
              <button className="btn" type="button" onClick={() => setRiskBriefOpen(false)}>Close</button>
            </div>
            {riskBriefLoading ? <div className="muted">Loading project signals...</div> : null}
            <div className="risk-brief-list">
              {riskBriefItems.map((item) => (
                <Link key={item.orderId} href={item.href} className={`risk-brief-row ${item.level}`} onClick={() => setRiskBriefOpen(false)}>
                  <span className="risk-brief-dot" aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.customer}</small>
                  </div>
                  <div>
                    <b>{item.level.toUpperCase()}</b>
                    <small>{item.summary}</small>
                  </div>
                  <div>
                    <b>{item.progress}%</b>
                    <small>{item.warningCount} warnings · {item.openAlertCount} alerts</small>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <section className="dashboard-hero card">
        <div className="dashboard-hero-content">
          <div className="eyebrow">{labels.eyebrow}</div>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
          <div className="dashboard-hero-actions">
            <Link className="btn primary" href="/ai-intake">{labels.primaryAction}</Link>
            <Link className="btn" href="/orders">{labels.secondaryAction}</Link>
          </div>
        </div>
        <div className="dashboard-stats">
          {labels.stats.map((item) => (
            <div key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section-header">
        <div>
          <h2>{labels.workflowTitle}</h2>
          <div className="muted">{labels.workflowSubtitle}</div>
        </div>
      </section>

      <section className="dashboard-workflow-grid">
        {workflowCards.map((card) => (
          <Link key={`${card.title}-${card.badge}`} className="dashboard-workflow-card card" href={card.href}>
            <span>{card.badge}</span>
            <strong>{card.title}</strong>
            <small>{card.desc}</small>
          </Link>
        ))}
      </section>

      <section className="dashboard-section-header">
        <div>
          <h2>{labels.quickAccess}</h2>
          <div className="muted">{messages.dashboard.cards.length} modules</div>
        </div>
      </section>

      <section className="dashboard-module-grid">
        {messages.dashboard.cards.map((card) => (
          <Link key={card.href} href={card.href} className="dashboard-module-card card">
            <span>{cardIcon(card.href)}</span>
            <div>
              <strong>{card.title}</strong>
              <small>{card.desc}</small>
            </div>
            <b>{labels.launch}</b>
          </Link>
        ))}
        <Link href="/setup" className="dashboard-module-card card">
          <span>SET</span>
          <div>
            <strong>{labels.setupTitle}</strong>
            <small>{labels.setupDesc}</small>
          </div>
          <b>{labels.launch}</b>
        </Link>
      </section>

      <section className="dashboard-billing-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>{labels.billingSetup}</h2>
            <div className="muted">{labels.billingDesc}</div>
          </div>
        </div>
        <InvoiceSequenceSetting />
      </section>
    </div>
  );
}
