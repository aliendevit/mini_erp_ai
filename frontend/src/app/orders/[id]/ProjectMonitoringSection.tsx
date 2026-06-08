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
  progressSource?: string | null;
  progressConfidence?: string | null;
  progressSignals?: string[];
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
  reportId?: string | null;
  alerts?: MonitoringAlert[];
};

type MonitoringReport = {
  id: string;
  provider: string;
  healthStatus: string;
  summary?: string | null;
  createdAt?: string | null;
};

type MonitoringAlert = {
  id: string;
  siteId?: string | null;
  alertType: string;
  severity: string;
  status: string;
  message: string;
  recommendedAction?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
  site?: { id: string; siteName: string } | null;
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

function monitoringClampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

function monitoringDeltaChartTone(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'neutral';
  if (value < -15) return 'danger';
  if (value < -5) return 'warning';
  return 'good';
}

function MonitoringProgressChart({
  title,
  actual,
  planned,
  delta,
  labels,
  none,
}: {
  title: string;
  actual?: number | null;
  planned?: number | null;
  delta?: number | null;
  labels: Labels;
  none: string;
}) {
  const actualPercent = monitoringClampPercent(actual);
  const plannedPercent = monitoringClampPercent(planned);
  const tone = monitoringDeltaChartTone(delta);

  return (
    <div className={`progress-chart monitoring-progress-chart progress-chart-${tone}`}>
      <div className="progress-chart-header">
        <div>
          <strong>{title}</strong>
          <span>{labels.actualProgress}: {formatPercent(actualPercent, none)}</span>
        </div>
        <div className="progress-chart-value">{formatPercent(actualPercent, none)}</div>
      </div>
      <div className="progress-chart-track" aria-label={title}>
        {plannedPercent !== null && <div className="progress-chart-planned" style={{ width: `${plannedPercent}%` }} />}
        <div className="progress-chart-actual" style={{ width: `${actualPercent ?? 0}%` }} />
      </div>
      <div className="progress-chart-footer">
        <span>{labels.plannedProgress}: {formatPercent(plannedPercent, none)}</span>
        <span>{labels.progressDelta}: {deltaText(delta, none)}</span>
      </div>
    </div>
  );
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

function AnalysisProgressSnapshot({
  actual,
  planned,
  delta,
  sites,
  labels,
  none,
}: {
  actual: number | null | undefined;
  planned: number | null | undefined;
  delta: number | null | undefined;
  sites: SiteCard[];
  labels: Labels;
  none: string;
}) {
  return (
    <div className="monitoring-analysis-progress-card">
      <div className="monitoring-section-header">
        <div>
          <strong>{labels.progressSnapshot || `${labels.actualProgress} / ${labels.plannedProgress}`}</strong>
          <div className="muted">{labels.delayPrediction}: {labels.plannedProgress} vs {labels.actualProgress}</div>
        </div>
        <strong className={`monitoring-delta-${deltaTone(delta)}`}>{deltaText(delta, none)}</strong>
      </div>
      <MonitoringProgressChart
        title={`${labels.actualProgress} / ${labels.plannedProgress}`}
        actual={actual}
        planned={planned}
        delta={delta}
        labels={labels}
        none={none}
      />
      <div className="monitoring-progress-breakdown">
        {sites.map((site) => (
          <div key={`analysis-progress-${site.siteId}`} className="monitoring-progress-breakdown-row">
            <span>{site.siteName}</span>
            <div className="monitoring-progress-breakdown-values">
              <strong>{formatPercent(site.actualProgressPercent ?? 0, none)}</strong>
              <span>{labels.plannedProgress}: {formatPercent(site.plannedProgressPercent, none)}</span>
              <span className={`monitoring-delta-${deltaTone(site.progressDeltaPercent)}`}>{deltaText(site.progressDeltaPercent, none)}</span>
            </div>
          </div>
        ))}
        {sites.length === 0 && <div className="muted">{labels.noSites}</div>}
      </div>
    </div>
  );
}

function SiteHealthCard({ site, labels, none }: { site: SiteCard; labels: Labels; none: string }) {
  const signals = site.progressSignals || [];
  return (
    <div className={`monitoring-site-card monitoring-site-${site.delayStatus || 'unknown'}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong>{site.siteName}</strong>
          <div className="muted">{labels.baselineStatus}: {displayLabel(site.baselineStatus, labels, none)}</div>
        </div>
        <StatusBadge value={site.delayStatus || 'unknown'} labels={labels} none={none} />
      </div>
      <MonitoringProgressChart
        title={labels.delayPrediction || site.siteName}
        actual={site.actualProgressPercent ?? 0}
        planned={site.plannedProgressPercent}
        delta={site.progressDeltaPercent}
        labels={labels}
        none={none}
      />
      <div className="muted">{labels.predictedFinish}: {shortDate(site.predictedFinishDate, none)} - {labels.delayDays}: {site.delayDays ?? none}</div>
      <div className="muted">{labels.progressConfidence || 'Progress confidence'}: {displayLabel(site.progressConfidence, labels, none)}</div>
      {signals.length > 0 && (
        <div className="monitoring-signal-list">
          {signals.slice(0, 3).map((signal, index) => <span key={`${site.siteId}-signal-${index}`}>{signal}</span>)}
        </div>
      )}
      {!!site.scheduleWarnings?.length && (
        <div className="monitoring-site-warning">{site.scheduleWarnings.length} {labels.scheduleWarnings}</div>
      )}
    </div>
  );
}

function AlertsPanel({
  alerts,
  labels,
  none,
  resolvingId,
  onResolve,
}: {
  alerts: MonitoringAlert[];
  labels: Labels;
  none: string;
  resolvingId: string | null;
  onResolve: (alert: MonitoringAlert) => void;
}) {
  if (!alerts.length) return <div className="muted">{labels.noOpenAlerts || none}</div>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {alerts.map((alert) => (
        <div key={alert.id} className={`monitoring-warning monitoring-warning-${alert.severity || 'medium'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>{displayLabel(alert.alertType, labels, alert.alertType)}</strong>
            <StatusBadge value={alert.severity} labels={labels} none={none} />
          </div>
          <div className="muted">{alert.site?.siteName ? `${alert.site.siteName} - ` : ''}{alert.message}</div>
          {alert.recommendedAction && <div className="muted">{alert.recommendedAction}</div>}
          <div className="spacer" />
          <button className="btn small" onClick={() => onResolve(alert)} disabled={resolvingId === alert.id}>
            {resolvingId === alert.id ? (labels.saving || 'Saving...') : (labels.resolveAlert || 'Resolve alert')}
          </button>
        </div>
      ))}
    </div>
  );
}

function HistoryPanel({ reports, labels, none }: { reports: MonitoringReport[]; labels: Labels; none: string }) {
  if (!reports.length) return <div className="muted">{labels.noMonitoringHistory || none}</div>;
  return (
    <div className="monitoring-list">
      {reports.slice(0, 6).map((report, index) => (
        <div key={report.id} className="monitoring-list-item">
          <span>{index + 1}</span>
          <p>
            <strong>{shortDate(report.createdAt, none)} - {displayLabel(report.healthStatus, labels, none)}</strong>
            <br />
            {report.summary || none}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ProjectMonitoringSection({ orderId }: { orderId: string }) {
  const { messages, locale } = useI18n();
  const x = messages.trackingPage;
  const labels = x.labels;
  const [tracking, setTracking] = useState<TrackingPayload | null>(null);
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [history, setHistory] = useState<MonitoringReport[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);

  async function loadTracking() {
    setLoading(true);
    try {
      const [data, historyData, alertData] = await Promise.all([
        apiGet<TrackingPayload>(`/orders/${orderId}/tracking`),
        apiGet<{ items: MonitoringReport[] }>(`/orders/${orderId}/tracking/monitoring-history`),
        apiGet<{ items: MonitoringAlert[] }>(`/orders/${orderId}/tracking/alerts?status=open`),
      ]);
      setTracking(data);
      setHistory(historyData.items || []);
      setAlerts(alertData.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeProjectTracking() {
    setAnalyzing(true);
    try {
      const data = await apiJson<TrackingAnalysis>(`/orders/${orderId}/tracking/analyze?locale=${locale}`, 'POST');
      setAnalysis(data);
      setAlerts(data.alerts || []);
      const historyData = await apiGet<{ items: MonitoringReport[] }>(`/orders/${orderId}/tracking/monitoring-history`);
      setHistory(historyData.items || []);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function resolveAlert(item: MonitoringAlert) {
    setResolvingAlertId(item.id);
    try {
      await apiJson<MonitoringAlert>(`/orders/${orderId}/tracking/alerts/${item.id}`, 'PATCH', {
        status: 'resolved',
        resolutionNote: locale === 'ar'
          ? 'تم إغلاق التنبيه من واجهة المراقبة.'
          : locale === 'de'
            ? 'Warnung wurde im Monitoring geschlossen.'
            : 'Alert resolved from monitoring.',
      });
      await loadTracking();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setResolvingAlertId(null);
    }
  }

  if (loading && !tracking) return <div className="card">{x.loading}</div>;
  if (!tracking) return <div className="card">{x.noRecords}</div>;

  const actionCopy = locale === 'ar'
    ? { kicker: 'المراقبة الذكية', order: 'طلب', track: 'تتبع', sync: 'تحديث', ai: 'ذكاء' }
    : locale === 'de'
      ? { kicker: 'KI-MONITORING', order: 'AUFTRAG', track: 'TRACK', sync: 'SYNC', ai: 'KI' }
      : { kicker: 'AI MONITORING', order: 'ORDER', track: 'TRACK', sync: 'SYNC', ai: 'AI' };

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
          <div className="monitoring-kicker">{actionCopy.kicker}</div>
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
            <span>{actionCopy.order}</span>
            <strong>{messages.common.back}</strong>
          </Link>
          <Link className="project-page-action tracking" href={`/orders/${orderId}/tracking`}>
            <span>{actionCopy.track}</span>
            <strong>{labels.openTracking || x.heading}</strong>
          </Link>
          <button className="project-page-action" onClick={loadTracking}>
            <span>{actionCopy.sync}</span>
            <strong>{x.refresh}</strong>
          </button>
          <button className="project-page-action primary" onClick={analyzeProjectTracking} disabled={analyzing}>
            <span>{actionCopy.ai}</span>
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
              <strong>{labels.openAlerts || 'Open alerts'}</strong>
              <div className="muted">{labels.openAlertsDescription || 'Automatically created from delay, blocker, and missing-data warnings.'}</div>
            </div>
            <span className="monitoring-count">{alerts.length}</span>
          </div>
          <AlertsPanel alerts={alerts} labels={labels} none={x.none} resolvingId={resolvingAlertId} onResolve={resolveAlert} />
        </div>
      </section>

      <section className="monitoring-layout">
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

        <div className="monitoring-panel">
          <div className="monitoring-section-header">
            <div>
              <strong>{labels.monitoringHistory || 'Monitoring history'}</strong>
              <div className="muted">{labels.monitoringHistoryDescription || 'Saved AI monitoring reports for this order.'}</div>
            </div>
            <span className="monitoring-count">{history.length}</span>
          </div>
          <HistoryPanel reports={history} labels={labels} none={x.none} />
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
            <AnalysisProgressSnapshot
              actual={actual}
              planned={planned}
              delta={overallDelta}
              sites={tracking.siteCards}
              labels={labels}
              none={x.none}
            />
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

