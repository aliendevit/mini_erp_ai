'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { apiGet, apiJson } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';

type TrackingWarning = {
  type: string;
  severity: string;
  message: string;
  siteName?: string | null;
  recommendedAction?: string | null;
};

type SiteCard = {
  siteId: string;
  siteName: string;
  currentStatus: string;
  actualProgressPercent?: number | null;
  plannedProgressPercent?: number | null;
  progressDeltaPercent?: number | null;
  baselineStatus?: string | null;
  predictedFinishDate?: string | null;
  delayDays?: number | null;
  delayStatus?: string | null;
  scheduleWarnings?: TrackingWarning[];
};

type TrackingPayload = {
  dashboard: {
    overallStatus: string;
    overallProgressPercent: number;
    plannedProgressPercent?: number | null;
    actualProgressPercent?: number | null;
    behindScheduleSiteCount?: number | null;
    openIssueCount: number;
    completedTaskCount: number;
    totalTaskCount: number;
    latestUpdateDate?: string | null;
    warnings?: TrackingWarning[];
  };
  siteCards: SiteCard[];
};

type TrackingAnalysis = {
  provider: string;
  healthStatus: string;
  summary: string;
  risks: Array<{ title?: string | null; severity?: string | null; siteName?: string | null; reason?: string | null }>;
  delays: Array<{ siteName?: string | null; reason?: string | null; impact?: string | null }>;
  missingInformation: string[];
  recommendedActions: Array<{ priority?: string | null; siteName?: string | null; action?: string | null }>;
  assumptions: string[];
  aiError?: string | null;
};

type Labels = Record<string, string>;

function displayLabel(value: string | null | undefined, labels: Labels, none: string) {
  if (!value) return none;
  return labels[value] || value;
}

function shortDate(value: string | null | undefined, none: string) {
  return value ? value.substring(0, 10) : none;
}

function formatPercent(value: number | null | undefined, none: string) {
  return value === null || value === undefined ? none : `${value}%`;
}

function deltaText(value: number | null | undefined, none: string) {
  if (value === null || value === undefined) return none;
  return `${value > 0 ? '+' : ''}${value}%`;
}

function deltaTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'unknown';
  if (value < -10) return 'bad';
  if (value < 0) return 'watch';
  return 'good';
}

function warningText(warning: TrackingWarning, labels: Labels) {
  const base = labels[warning.type] || warning.type;
  return warning.siteName ? `${base}: ${warning.siteName}` : base;
}

function guidanceText(warning: TrackingWarning, labels: Labels) {
  return labels[`${warning.type}_action`] || warning.recommendedAction || warning.message;
}

function StatusBadge({ value, labels, none }: { value?: string | null; labels: Labels; none: string }) {
  const text = displayLabel(value, labels, none);
  return <span className={`status-pill status-${value || 'unknown'}`}>{text}</span>;
}

function MetricCard({ title, subtitle, value, accent = '#334155' }: { title: string; subtitle: string; value: ReactNode; accent?: string }) {
  return (
    <div className="monitoring-metric">
      <div className="monitoring-metric-subtitle">{subtitle}</div>
      <div className="monitoring-metric-value" style={{ color: accent }}>{value}</div>
      <div className="monitoring-metric-title">{title}</div>
    </div>
  );
}

function AnalysisList({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);
  return (
    <div className="monitoring-analysis-card">
      <strong>{title}</strong>
      <div className="spacer" />
      {cleanItems.length ? (
        <div className="monitoring-list">
          {cleanItems.map((item, index) => (
            <div key={`${title}-${index}`} className="monitoring-list-item">
              <span>{index + 1}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      ) : <div className="muted">{emptyLabel}</div>}
    </div>
  );
}

function WarningPanel({ warnings, labels, none }: { warnings: TrackingWarning[]; labels: Labels; none: string }) {
  if (!warnings.length) return <div className="muted">{none}</div>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {warnings.map((warning, index) => (
        <div key={`${warning.type}-${index}`} className={`monitoring-warning monitoring-warning-${warning.severity || 'medium'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>{warningText(warning, labels)}</strong>
            <StatusBadge value={warning.severity} labels={labels} none={none} />
          </div>
          <div className="muted">{guidanceText(warning, labels)}</div>
        </div>
      ))}
    </div>
  );
}

function SiteHealthCard({ site, labels, none }: { site: SiteCard; labels: Labels; none: string }) {
  return (
    <div className={`monitoring-site-card monitoring-site-${site.delayStatus || 'unknown'}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong>{site.siteName}</strong>
          <div className="muted">{labels.baselineStatus}: {displayLabel(site.baselineStatus, labels, none)}</div>
        </div>
        <StatusBadge value={site.delayStatus || 'unknown'} labels={labels} none={none} />
      </div>
      <div className="monitoring-progress-row">
        <div>
          <label>{labels.plannedProgress}</label>
          <strong>{formatPercent(site.plannedProgressPercent, none)}</strong>
        </div>
        <div>
          <label>{labels.actualProgress}</label>
          <strong>{formatPercent(site.actualProgressPercent ?? 0, none)}</strong>
        </div>
        <div>
          <label>{labels.progressDelta}</label>
          <strong className={`monitoring-delta-${deltaTone(site.progressDeltaPercent)}`}>{deltaText(site.progressDeltaPercent, none)}</strong>
        </div>
      </div>
      <div className="muted">{labels.predictedFinish}: {shortDate(site.predictedFinishDate, none)} - {labels.delayDays}: {site.delayDays ?? none}</div>
      {!!site.scheduleWarnings?.length && (
        <div className="monitoring-site-warning">{site.scheduleWarnings.length} {labels.scheduleWarnings}</div>
      )}
    </div>
  );
}

export default function ProjectMonitoringSection({ orderId }: { orderId: string }) {
  const { messages, locale } = useI18n();
  const x = messages.trackingPage;
  const labels = x.labels;
  const [tracking, setTracking] = useState<TrackingPayload | null>(null);
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  async function loadTracking() {
    setLoading(true);
    try {
      const data = await apiGet<TrackingPayload>(`/orders/${orderId}/tracking`);
      setTracking(data);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeProjectTracking() {
    setAnalyzing(true);
    try {
      const data = await apiJson<TrackingAnalysis>(`/orders/${orderId}/tracking/analyze?locale=${locale}`, 'POST');
      setAnalysis(data);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    loadTracking().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading || !tracking) {
    return <div className="card"><div className="muted">{x.loading}</div></div>;
  }

  const warnings = tracking.dashboard.warnings || [];
  const planned = tracking.dashboard.plannedProgressPercent;
  const actual = tracking.dashboard.actualProgressPercent ?? tracking.dashboard.overallProgressPercent;
  const overallDelta = planned === null || planned === undefined ? null : actual - planned;
  const healthStatus = analysis?.healthStatus || tracking.dashboard.overallStatus;
  const primaryAction = warnings[0]?.recommendedAction || warnings[0]?.message || x.aiAnalysis.empty;

  return (
    <div className="monitoring-page">
      <section className={`monitoring-hero monitoring-hero-${healthStatus || 'unknown'}`}>
        <div className="monitoring-hero-main">
          <div className="monitoring-kicker">AI MONITORING</div>
          <h2>{x.aiAnalysis.title}</h2>
          <p>{x.aiAnalysis.description}</p>
          <div className="monitoring-hero-status">
            <StatusBadge value={healthStatus} labels={labels} none={x.none} />
            <span>{x.metrics.warnings}: {warnings.length}</span>
            <span>{labels.behindScheduleSites}: {tracking.dashboard.behindScheduleSiteCount ?? 0}</span>
          </div>
        </div>
        <div className="project-page-actions">
          <Link className="project-page-action" href={`/orders/${orderId}`}>
            <span>ORDER</span>
            <strong>{messages.common.back}</strong>
          </Link>
          <Link className="project-page-action tracking" href={`/orders/${orderId}/tracking`}>
            <span>TRACK</span>
            <strong>{labels.openTracking || x.heading}</strong>
          </Link>
          <button className="project-page-action" onClick={loadTracking}>
            <span>SYNC</span>
            <strong>{x.refresh}</strong>
          </button>
          <button className="project-page-action primary" onClick={analyzeProjectTracking} disabled={analyzing}>
            <span>AI</span>
            <strong>{analyzing ? x.aiAnalysis.analyzing : x.aiAnalysis.analyze}</strong>
          </button>
        </div>
      </section>

      <section className="monitoring-metrics-grid">
        <MetricCard title={x.metrics.overallStatus} subtitle={x.metrics.overallStatusSub} value={<StatusBadge value={tracking.dashboard.overallStatus} labels={labels} none={x.none} />} />
        <MetricCard title={labels.plannedProgress} subtitle={labels.baseline} value={formatPercent(planned, x.none)} accent="#7c3aed" />
        <MetricCard title={labels.actualProgress} subtitle={labels.weightedProgress} value={formatPercent(actual, x.none)} accent="#2563eb" />
        <MetricCard title={labels.progressDelta} subtitle={labels.delayPrediction} value={<span className={`monitoring-delta-${deltaTone(overallDelta)}`}>{deltaText(overallDelta, x.none)}</span>} accent="#d97706" />
      </section>

      <section className="monitoring-layout">
        <div className="monitoring-panel">
          <div className="monitoring-section-header">
            <div>
              <strong>{x.metrics.warnings}</strong>
              <div className="muted">{primaryAction}</div>
            </div>
            <span className="monitoring-count">{warnings.length}</span>
          </div>
          <WarningPanel warnings={warnings} labels={labels} none={x.metrics.noWarnings} />
        </div>

        <div className="monitoring-panel">
          <div className="monitoring-section-header">
            <div>
              <strong>{labels.delayPrediction}</strong>
              <div className="muted">{labels.plannedProgress} / {labels.actualProgress}</div>
            </div>
            <span className="monitoring-count">{tracking.siteCards.length}</span>
          </div>
          <div className="monitoring-sites-grid">
            {tracking.siteCards.map((site) => <SiteHealthCard key={site.siteId} site={site} labels={labels} none={x.none} />)}
            {tracking.siteCards.length === 0 && <div className="muted">{labels.noSites}</div>}
          </div>
        </div>
      </section>

      <section className="monitoring-analysis-panel">
        <div className="monitoring-section-header">
          <div>
            <strong>{x.aiAnalysis.title}</strong>
            <div className="muted">{x.aiAnalysis.provider}: {analysis?.provider || x.none}</div>
          </div>
          {analysis && <StatusBadge value={analysis.healthStatus} labels={labels} none={x.none} />}
        </div>
        {analysis ? (
          <div className="monitoring-analysis-content">
            <div className="monitoring-summary">{analysis.summary}</div>
            {analysis.aiError && <div className="muted">{x.aiAnalysis.fallbackNote}: {analysis.aiError}</div>}
            <AnalysisList title={x.aiAnalysis.risks} items={analysis.risks.map((item) => [item.siteName, item.title, item.reason].filter(Boolean).join(' - '))} emptyLabel={x.aiAnalysis.noRisks} />
            <AnalysisList title={x.aiAnalysis.delays || labels.delayPrediction} items={analysis.delays.map((item) => [item.siteName, item.reason, item.impact].filter(Boolean).join(' - '))} emptyLabel={x.aiAnalysis.noRisks} />
            <AnalysisList title={x.aiAnalysis.recommendedActions} items={analysis.recommendedActions.map((item) => [item.siteName, item.action].filter(Boolean).join(' - '))} emptyLabel={x.aiAnalysis.noActions} />
            <AnalysisList title={x.aiAnalysis.missingInformation} items={analysis.missingInformation} emptyLabel={x.aiAnalysis.noMissingInformation} />
            <AnalysisList title={x.aiAnalysis.assumptions || labels.notes} items={analysis.assumptions} emptyLabel={x.aiAnalysis.noMissingInformation} />
          </div>
        ) : (
          <div className="monitoring-empty-state">
            <strong>{x.aiAnalysis.empty}</strong>
            <div className="muted">{x.aiAnalysis.description}</div>
            <button className="btn primary" onClick={analyzeProjectTracking} disabled={analyzing}>{analyzing ? x.aiAnalysis.analyzing : x.aiAnalysis.analyze}</button>
          </div>
        )}
      </section>
    </div>
  );
}
