'use client';

import Link from 'next/link';

import { useI18n } from '../lib/i18n';
import { InvoiceSequenceSetting } from './ui/InvoiceSequenceSetting';

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

export default function Page() {
  const { locale, messages } = useI18n();
  const labels = dashboardLabels(locale);
  const workflowCards = [
    { title: labels.aiTitle, desc: labels.aiDesc, badge: '01', href: '/ai-intake' },
    { title: labels.workshopsTitle, desc: labels.workshopsDesc, badge: '02', href: '/workshops' },
    { title: labels.trackingTitle, desc: labels.trackingDesc, badge: '03', href: '/orders' },
    { title: labels.monitoringTitle, desc: labels.monitoringDesc, badge: '04', href: '/monitoring' },
  ];

  return (
    <div className="dashboard-shell">
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
