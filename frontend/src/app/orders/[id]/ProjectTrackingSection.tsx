'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { API_BASE, apiForm, apiGet, apiJson } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';

type TrackingPhoto = {
  id: string;
  originalFilename?: string | null;
  contentType: string;
  sizeBytes: number;
  tag?: string | null;
  caption?: string | null;
  photoUrl: string;
  createdAt: string;
};

type TrackingUpdate = {
  id: string;
  siteId?: string | null;
  site?: { siteName?: string | null } | null;
  title: string;
  description?: string | null;
  status: string;
  progressPercent?: number | null;
  nextAction?: string | null;
  updateDate: string;
  photos: TrackingPhoto[];
};

type TrackingTask = {
  id: string;
  siteId?: string | null;
  site?: { siteName?: string | null } | null;
  taskName: string;
  status: string;
  weightPercent?: number | null;
  progressPercent?: number | null;
  responsibleType: string;
  responsibleName?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

type TrackingIssue = {
  id: string;
  siteId?: string | null;
  site?: { siteName?: string | null } | null;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  responsibleType: string;
  responsibleName?: string | null;
  resolutionNote?: string | null;
};

type TrackingMaterial = {
  id: string;
  siteId?: string | null;
  site?: { siteName?: string | null } | null;
  materialName: string;
  quantity?: string | null;
  status: string;
  notes?: string | null;
};

type TrackingWarning = {
  type: string;
  severity: string;
  message: string;
  siteId?: string | null;
  siteName?: string | null;
  recommendedAction?: string | null;
  fixArea?: string | null;
};

type WorkshopAssignment = {
  id: string;
  workshop?: {
    name?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    availabilityStatus?: string | null;
    isActive?: boolean | null;
  } | null;
  coveredSkills: string[];
  status: string;
  notes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  scheduleStatus?: string | null;
};

type SiteCard = {
  siteId: string;
  siteName: string;
  currentStatus: string;
  progressPercent: number;
  actualProgressPercent?: number | null;
  plannedProgressPercent?: number | null;
  progressDeltaPercent?: number | null;
  baselinePlan?: { notes?: string | null } | null;
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
  baselineStatus?: string | null;
  predictedFinishDate?: string | null;
  delayDays?: number | null;
  delayStatus?: string | null;
  lastUpdateDate?: string | null;
  workshopAssignments: WorkshopAssignment[];
  scheduledWorkshops?: WorkshopAssignment[];
  scheduleWarnings?: TrackingWarning[];
  externalWorkshopCoveredSkills: string[];
  openBlockers: TrackingIssue[];
  latestPhotos: TrackingPhoto[];
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
    upcomingActions: string[];
    warnings?: TrackingWarning[];
  };
  siteCards: SiteCard[];
  updates: TrackingUpdate[];
  photos: TrackingPhoto[];
  tasks: TrackingTask[];
  issues: TrackingIssue[];
  materials: TrackingMaterial[];
};

type FormState = Record<string, string>;
type Labels = Record<string, string>;
type TabKey = 'overview' | 'baseline' | 'timeline' | 'photos' | 'tasks' | 'issues' | 'materials' | 'team';

const emptyUpdateForm: FormState = {
  siteId: '',
  title: '',
  description: '',
  status: 'in_progress',
  progressPercent: '',
  nextAction: '',
  updateDate: '',
  photoTag: 'during',
  photoCaption: '',
};
const emptyTaskForm: FormState = {
  siteId: '',
  taskName: '',
  status: 'not_started',
  weightPercent: '',
  progressPercent: '',
  responsibleType: 'not_assigned',
  responsibleName: '',
  dueDate: '',
  notes: '',
};
const emptyIssueForm: FormState = {
  siteId: '',
  title: '',
  description: '',
  severity: 'medium',
  status: 'open',
  responsibleType: 'not_assigned',
  responsibleName: '',
  resolutionNote: '',
};
const emptyMaterialForm: FormState = { siteId: '', materialName: '', quantity: '', status: 'needed', notes: '' };

const tabKeys: TabKey[] = ['overview', 'baseline', 'timeline', 'photos', 'tasks', 'issues', 'materials', 'team'];
const siteStatusOptions = ['not_started', 'in_progress', 'waiting_materials', 'blocked', 'needs_review', 'completed'];
const taskStatusOptions = ['not_started', 'in_progress', 'completed'];
const issueStatusOptions = ['open', 'in_progress', 'resolved'];
const issueSeverityOptions = ['low', 'medium', 'high'];
const materialStatusOptions = ['needed', 'ordered', 'delivered', 'used'];
const photoTagOptions = ['before', 'during', 'after', 'issue', 'material', 'inspection'];
const backendBase = API_BASE.replace(/\/api$/, '');

const STATUS_STYLES: Record<string, { color: string; background: string; border: string }> = {
  not_started: { color: '#64748b', background: 'rgba(100,116,139,.12)', border: 'rgba(100,116,139,.35)' },
  in_progress: { color: '#2563eb', background: 'rgba(37,99,235,.12)', border: 'rgba(37,99,235,.35)' },
  waiting_materials: { color: '#d97706', background: 'rgba(217,119,6,.14)', border: 'rgba(217,119,6,.38)' },
  blocked: { color: '#dc2626', background: 'rgba(220,38,38,.12)', border: 'rgba(220,38,38,.35)' },
  needs_review: { color: '#7c3aed', background: 'rgba(124,58,237,.12)', border: 'rgba(124,58,237,.35)' },
  completed: { color: '#16a34a', background: 'rgba(22,163,74,.12)', border: 'rgba(22,163,74,.35)' },
  open: { color: '#dc2626', background: 'rgba(220,38,38,.12)', border: 'rgba(220,38,38,.35)' },
  resolved: { color: '#16a34a', background: 'rgba(22,163,74,.12)', border: 'rgba(22,163,74,.35)' },
  needed: { color: '#d97706', background: 'rgba(217,119,6,.14)', border: 'rgba(217,119,6,.38)' },
  ordered: { color: '#2563eb', background: 'rgba(37,99,235,.12)', border: 'rgba(37,99,235,.35)' },
  delivered: { color: '#16a34a', background: 'rgba(22,163,74,.12)', border: 'rgba(22,163,74,.35)' },
  used: { color: '#475569', background: 'rgba(71,85,105,.12)', border: 'rgba(71,85,105,.35)' },
  low: { color: '#16a34a', background: 'rgba(22,163,74,.12)', border: 'rgba(22,163,74,.35)' },
  medium: { color: '#d97706', background: 'rgba(217,119,6,.14)', border: 'rgba(217,119,6,.38)' },
  high: { color: '#dc2626', background: 'rgba(220,38,38,.12)', border: 'rgba(220,38,38,.35)' },
  missing_schedule: { color: '#d97706', background: 'rgba(217,119,6,.14)', border: 'rgba(217,119,6,.38)' },
  active: { color: '#16a34a', background: 'rgba(22,163,74,.12)', border: 'rgba(22,163,74,.35)' },
  upcoming: { color: '#2563eb', background: 'rgba(37,99,235,.12)', border: 'rgba(37,99,235,.35)' },
  past: { color: '#64748b', background: 'rgba(100,116,139,.12)', border: 'rgba(100,116,139,.35)' },
};

function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

function formatProgressPercent(value: number | null | undefined, none: string) {
  const percent = clampPercent(value);
  return percent === null ? none : `${Math.round(percent)}%`;
}

function progressDeltaTone(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'neutral';
  if (value < -15) return 'danger';
  if (value < -5) return 'warning';
  return 'good';
}

function ProgressChart({
  title,
  actual,
  planned,
  delta,
  labels,
  none,
  compact = false,
}: {
  title: string;
  actual?: number | null;
  planned?: number | null;
  delta?: number | null;
  labels: Labels;
  none: string;
  compact?: boolean;
}) {
  const actualPercent = clampPercent(actual);
  const plannedPercent = clampPercent(planned);
  const deltaTone = progressDeltaTone(delta);

  return (
    <div className={`progress-chart ${compact ? 'compact' : ''} progress-chart-${deltaTone}`}>
      <div className="progress-chart-header">
        <div>
          <strong>{title}</strong>
          <span>{labels.actualProgress}: {formatProgressPercent(actualPercent, none)}</span>
        </div>
        <div className="progress-chart-value">{formatProgressPercent(actualPercent, none)}</div>
      </div>
      <div className="progress-chart-track" aria-label={title}>
        {plannedPercent !== null && <div className="progress-chart-planned" style={{ width: `${plannedPercent}%` }} />}
        <div className="progress-chart-actual" style={{ width: `${actualPercent ?? 0}%` }} />
      </div>
      <div className="progress-chart-footer">
        <span>{labels.plannedProgress}: {formatProgressPercent(plannedPercent, none)}</span>
        <span>{labels.progressDelta}: {delta === null || delta === undefined ? none : `${delta > 0 ? '+' : ''}${Math.round(delta)}%`}</span>
      </div>
    </div>
  );
}
function displayLabel(value: string | null | undefined, labels: Labels, none: string) {
  if (!value) return none;
  const key = value.trim().toLowerCase();
  return labels[key] || key.replace(/[_-]+/g, ' ');
}

function shortDate(value: string | null | undefined, none: string) {
  return value ? value.substring(0, 10) : none;
}

function dateInputValue(value: string | null | undefined) {
  return value ? value.substring(0, 10) : '';
}

function photoSrc(photo: TrackingPhoto) {
  return photo.photoUrl.startsWith('/api') ? `${backendBase}${photo.photoUrl}` : photo.photoUrl;
}

function siteName(item: { site?: { siteName?: string | null } | null }, fallback: string) {
  return item.site?.siteName || fallback;
}

function joinList(values: string[] | null | undefined, none: string) {
  return values && values.length ? values.join(', ') : none;
}

function warningText(warning: TrackingWarning, labels: Labels) {
  const base = labels[warning.type] || warning.message;
  return warning.siteName ? `${base}: ${warning.siteName}` : base;
}

function warningGuidanceText(warning: TrackingWarning, labels: Labels) {
  const guidance = labels[`${warning.type}_action`] || warning.recommendedAction || warning.message;
  return warning.siteName ? `${guidance}

${labels.siteArea}: ${warning.siteName}` : guidance;
}

function showWarningGuidance(warning: TrackingWarning, labels: Labels) {
  const title = labels.whatToDo || 'What should I do?';
  window.alert(`${title}

${warningGuidanceText(warning, labels)}`);
}


function warningTargetTab(warning: TrackingWarning): TabKey {
  if (warning.fixArea && tabKeys.includes(warning.fixArea as TabKey)) return warning.fixArea as TabKey;
  if (warning.type === 'overdue_task') return 'tasks';
  if (warning.type === 'high_issue' || warning.type === 'blocked_site') return 'issues';
  if (warning.type === 'missing_workshop_schedule' || warning.type === 'workshop_unavailable' || warning.type === 'no_workshop_assigned') return 'team';
  if (warning.type === 'progress_status_mismatch') return 'timeline';
  return 'overview';
}

export default function ProjectTrackingSection({ orderId }: { orderId: string }) {
  const { locale, messages } = useI18n();
  const x = messages.trackingPage;
  const labels = x.labels;
  const [tracking, setTracking] = useState<TrackingPayload | null>(null);
  const [suggestingBaseline, setSuggestingBaseline] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [saving, setSaving] = useState(false);
  const [baselineForms, setBaselineForms] = useState<Record<string, FormState>>({});
  const [taskEditForms, setTaskEditForms] = useState<Record<string, FormState>>({});
  const [updateForm, setUpdateForm] = useState<FormState>(emptyUpdateForm);
  const [taskForm, setTaskForm] = useState<FormState>(emptyTaskForm);
  const [issueForm, setIssueForm] = useState<FormState>(emptyIssueForm);
  const [materialForm, setMaterialForm] = useState<FormState>(emptyMaterialForm);
  const [photos, setPhotos] = useState<FileList | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);

  const siteCards = tracking?.siteCards || [];
  const selectedPhotos = useMemo(() => Array.from(photos || []), [photos]);
  const siteOptions = useMemo(() => siteCards.map((site) => ({ id: site.siteId, name: site.siteName })), [siteCards]);

  function syncBaselineForms(data: TrackingPayload) {
    setBaselineForms(() => {
      const next: Record<string, FormState> = {};
      for (const site of data.siteCards || []) {
        next[site.siteId] = {
          plannedStartDate: dateInputValue(site.baselineStartDate),
          plannedEndDate: dateInputValue(site.baselineEndDate),
          baselineStatus: site.baselineStatus || 'draft',
          notes: site.baselinePlan?.notes || '',
        };
      }
      return next;
    });
  }

  function syncTaskEditForms(data: TrackingPayload) {
    setTaskEditForms(() => {
      const next: Record<string, FormState> = {};
      for (const task of data.tasks || []) {
        next[task.id] = {
          status: task.status || 'not_started',
          weightPercent: task.weightPercent === null || task.weightPercent === undefined ? '' : String(task.weightPercent),
          progressPercent: task.progressPercent === null || task.progressPercent === undefined ? '' : String(task.progressPercent),
        };
      }
      return next;
    });
  }

  function applyTracking(data: TrackingPayload) {
    setTracking(data);
    syncBaselineForms(data);
    syncTaskEditForms(data);
  }

  async function loadTracking() {
    const data = await apiGet<TrackingPayload>(`/orders/${orderId}/tracking`);
    applyTracking(data);
  }

  async function suggestBaseline() {
    setSuggestingBaseline(true);
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/tracking/baseline/suggest`, 'POST');
      applyTracking(data);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSuggestingBaseline(false);
    }
  }

  async function saveBaseline(site: SiteCard, status?: 'draft' | 'confirmed') {
    const form = baselineForms[site.siteId] || {};
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/tracking/baseline/${site.siteId}`, 'PUT', {
        plannedStartDate: form.plannedStartDate || null,
        plannedEndDate: form.plannedEndDate || null,
        baselineStatus: status || form.baselineStatus || 'draft',
        source: 'manual',
        notes: form.notes || null,
      });
      applyTracking(data);
    } catch (error: any) {
      alert(error.message);
    }
  }

  useEffect(() => {
    loadTracking().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function submitProgressUpdate() {
    setSaving(true);
    try {
      const form = new FormData();
      Object.entries(updateForm).forEach(([key, value]) => {
        if (value) form.append(key, value);
      });
      Array.from(photos || []).forEach((file) => form.append('photos', file));
      const data = await apiForm<TrackingPayload>(`/orders/${orderId}/progress-updates`, 'POST', form);
      applyTracking(data);
      setUpdateForm(emptyUpdateForm);
      setPhotos(null);
      setPhotoInputKey((value) => value + 1);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function createTask() {
    if (!taskForm.taskName.trim()) return alert(`${labels.task} ${labels.needed}`);
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/tasks`, 'POST', {
        ...taskForm,
        siteId: taskForm.siteId || null,
        dueDate: taskForm.dueDate || null,
        weightPercent: taskForm.weightPercent || null,
        progressPercent: taskForm.progressPercent || null,
      });
      applyTracking(data);
      setTaskForm(emptyTaskForm);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function createIssue() {
    if (!issueForm.title.trim()) return alert(`${labels.issue} ${labels.needed}`);
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/issues`, 'POST', { ...issueForm, siteId: issueForm.siteId || null });
      applyTracking(data);
      setIssueForm(emptyIssueForm);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function createMaterial() {
    if (!materialForm.materialName.trim()) return alert(`${labels.materialName} ${labels.needed}`);
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/materials`, 'POST', { ...materialForm, siteId: materialForm.siteId || null });
      applyTracking(data);
      setMaterialForm(emptyMaterialForm);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function deleteItem(path: string) {
    if (!confirm(x.deleteConfirm)) return;
    try {
      const data = await apiJson<TrackingPayload>(path, 'DELETE');
      applyTracking(data);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function saveTask(task: TrackingTask, forcedStatus?: string) {
    const form = taskEditForms[task.id] || {};
    const status = forcedStatus || form.status || task.status;
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/tasks/${task.id}`, 'PATCH', {
        siteId: task.siteId || null,
        taskName: task.taskName,
        status,
        weightPercent: form.weightPercent === '' || form.weightPercent === undefined ? null : form.weightPercent,
        progressPercent: form.progressPercent === '' || form.progressPercent === undefined ? null : form.progressPercent,
        responsibleType: task.responsibleType,
        responsibleName: task.responsibleName,
        dueDate: task.dueDate,
        notes: task.notes,
      });
      applyTracking(data);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function updateIssueStatus(issue: TrackingIssue, status: string) {
    try {
      let resolutionNote = issue.resolutionNote || '';
      if (status === 'resolved' && !resolutionNote.trim()) {
        resolutionNote = window.prompt(labels.notes, '') || '';
      }
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/issues/${issue.id}`, 'PATCH', {
        siteId: issue.siteId || null,
        title: issue.title,
        description: issue.description,
        severity: issue.severity,
        status,
        responsibleType: issue.responsibleType,
        responsibleName: issue.responsibleName,
        resolutionNote,
      });
      applyTracking(data);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function updateMaterialStatus(material: TrackingMaterial, status: string) {
    try {
      const data = await apiJson<TrackingPayload>(`/orders/${orderId}/materials/${material.id}`, 'PATCH', {
        siteId: material.siteId || null,
        materialName: material.materialName,
        quantity: material.quantity,
        status,
        notes: material.notes,
      });
      applyTracking(data);
    } catch (error: any) {
      alert(error.message);
    }
  }

  if (!tracking) {
    return (
      <div className="card">
        <h3>{x.heading}</h3>
        <div className="muted">{x.loading}</div>
      </div>
    );
  }

  const actionCopy = locale === 'ar'
    ? { order: 'طلب', ai: 'ذكاء', sync: 'تحديث' }
    : locale === 'de'
      ? { order: 'AUFTRAG', ai: 'KI', sync: 'SYNC' }
      : { order: 'ORDER', ai: 'AI', sync: 'SYNC' };

  return (
    <div className="card tracking-page">
      <div className="tracking-hero">
        <div>
          <h3>{x.heading}</h3>
          <div className="muted">{x.description}</div>
        </div>
        <div className="project-page-actions">
          <Link className="project-page-action" href={`/orders/${orderId}`}>
            <span>{actionCopy.order}</span>
            <strong>{messages.common.back}</strong>
          </Link>
          <Link className="project-page-action monitoring" href={`/orders/${orderId}/monitoring`}>
            <span>{actionCopy.ai}</span>
            <strong>{labels.openMonitoring || x.aiAnalysis.title}</strong>
          </Link>
          <button className="project-page-action" onClick={loadTracking}>
            <span>{actionCopy.sync}</span>
            <strong>{x.refresh}</strong>
          </button>
        </div>
      </div>

      <div className="spacer" />
      <div className="tracking-tabs">
        {tabKeys.map((tab) => <button key={tab} className={`btn ${activeTab === tab ? 'primary' : ''}`} onClick={() => setActiveTab(tab)}>{x.tabs[tab]}</button>)}
      </div>

      <div className="spacer" />

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="row">
            <MetricCard title={x.metrics.overallStatus} subtitle={x.metrics.overallStatusSub} value={<StatusBadge value={tracking.dashboard.overallStatus} labels={labels} none={x.none} size="md" />} />
            <MetricCard title={x.metrics.overallProgress} subtitle={x.metrics.overallProgressSub} value={`${tracking.dashboard.overallProgressPercent}%`} accent="#2563eb" />
            <MetricCard title={x.metrics.openIssues} subtitle={x.metrics.openIssuesSub} value={tracking.dashboard.openIssueCount} accent="#dc2626" />
            <MetricCard title={x.metrics.tasksCompleted} subtitle={x.metrics.tasksCompletedSub} value={`${tracking.dashboard.completedTaskCount}/${tracking.dashboard.totalTaskCount}`} accent="#16a34a" />
          </div>
          <div className="row">
            <MetricCard title={labels.plannedProgress} subtitle={labels.baseline} value={tracking.dashboard.plannedProgressPercent === null || tracking.dashboard.plannedProgressPercent === undefined ? x.none : `${tracking.dashboard.plannedProgressPercent}%`} accent="#7c3aed" />
            <MetricCard title={labels.actualProgress} subtitle={labels.weightedProgress} value={`${tracking.dashboard.actualProgressPercent ?? tracking.dashboard.overallProgressPercent}%`} accent="#2563eb" />
            <MetricCard title={labels.behindScheduleSites} subtitle={labels.delayPrediction} value={tracking.dashboard.behindScheduleSiteCount ?? 0} accent="#d97706" />
          </div>

          <div className="card">
            <strong>{x.metrics.warnings}</strong>
            <div className="spacer" />
            <WarningList warnings={tracking.dashboard.warnings || []} labels={labels} emptyLabel={x.metrics.noWarnings} onOpenAction={(warning) => setActiveTab(warningTargetTab(warning))} onRefresh={loadTracking} />
          </div>

          <div className="card">
            <strong>{x.metrics.upcomingActions}</strong>
            <div className="spacer" />
            {tracking.dashboard.upcomingActions.length ? <ul>{tracking.dashboard.upcomingActions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ul> : <div className="muted">{x.metrics.noUpcomingActions}</div>}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {siteCards.map((site) => (
              <div key={site.siteId} className="card tracking-site-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{site.siteName}</div>
                    <div className="muted">{labels.lastUpdate}: {shortDate(site.lastUpdateDate, x.none)}</div>
                  </div>
                  <StatusBadge value={site.currentStatus} labels={labels} none={x.none} />
                </div>
                <div className="spacer" />
                <ProgressChart
                  title={labels.weightedProgress || labels.progress || labels.complete}
                  actual={site.actualProgressPercent ?? site.progressPercent}
                  planned={site.plannedProgressPercent}
                  delta={site.progressDeltaPercent}
                  labels={labels}
                  none={x.none}
                />
                <div className="muted" style={{ marginTop: 8 }}>
                  {labels.delayStatus}: {displayLabel(site.delayStatus, labels, x.none)}
                </div>
                <div className="spacer" />
                <div className="row">
                  <div><label>{labels.assignedWorkshops}</label><div>{site.workshopAssignments.length ? site.workshopAssignments.map((item) => item.workshop?.name || labels.workshop).join(', ') : x.none}</div></div>
                  <div><label>{labels.coveredTrades}</label><div>{joinList(site.externalWorkshopCoveredSkills, x.none)}</div></div>
                  <div><label>{labels.openBlockers}</label><div>{site.openBlockers.length}</div></div>
                </div>
                <div className="spacer" />
                <div className="card" style={{ background: 'rgba(15,23,42,.02)' }}>
                  <strong>{labels.scheduledWorkshops}</strong>
                  <div className="spacer" />
                  <WorkshopScheduleList assignments={site.scheduledWorkshops || site.workshopAssignments} labels={labels} none={x.none} />
                </div>
                {(site.scheduleWarnings || []).length > 0 && (
                  <>
                    <div className="spacer" />
                    <div className="card" style={{ background: 'rgba(217,119,6,.06)' }}>
                      <strong>{labels.scheduleWarnings}</strong>
                      <div className="spacer" />
                      <WarningList warnings={site.scheduleWarnings || []} labels={labels} emptyLabel={x.metrics.noWarnings} onOpenAction={(warning) => setActiveTab(warningTargetTab(warning))} onRefresh={loadTracking} />
                    </div>
                  </>
                )}
                {site.latestPhotos.length > 0 && <><div className="spacer" /><PhotoGrid photos={site.latestPhotos} labels={labels} none={x.none} /></>}
              </div>
            ))}
            {siteCards.length === 0 && <div className="muted">{labels.noSites}</div>}
          </div>
        </div>
      )}

      {activeTab === 'baseline' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <strong>{labels.baseline}</strong>
                <div className="muted">{labels.baselineDescription}</div>
              </div>
              <button className="btn primary" onClick={suggestBaseline} disabled={suggestingBaseline}>{suggestingBaseline ? labels.suggestingBaseline : labels.suggestBaseline}</button>
            </div>
          </div>
          {siteCards.map((site) => {
            const form = baselineForms[site.siteId] || {};
            return (
              <div key={`baseline-${site.siteId}`} className="card tracking-baseline-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{site.siteName}</div>
                    <div className="muted">{labels.baselineStatus}: {displayLabel(site.baselineStatus, labels, x.none)}</div>
                  </div>
                  <StatusBadge value={site.delayStatus || 'unknown'} labels={labels} none={x.none} />
                </div>
                <div className="spacer" />
                <div className="row">
                  <Field label={labels.baselineStartDate}><input type="date" value={form.plannedStartDate || ''} onChange={(event) => setBaselineForms({ ...baselineForms, [site.siteId]: { ...form, plannedStartDate: event.target.value } })} /></Field>
                  <Field label={labels.baselineEndDate}><input type="date" value={form.plannedEndDate || ''} onChange={(event) => setBaselineForms({ ...baselineForms, [site.siteId]: { ...form, plannedEndDate: event.target.value } })} /></Field>
                  <Field label={labels.notes}><input value={form.notes || ''} onChange={(event) => setBaselineForms({ ...baselineForms, [site.siteId]: { ...form, notes: event.target.value } })} /></Field>
                </div>
                <div className="spacer" />
                <ProgressChart
                  title={labels.baseline}
                  actual={site.actualProgressPercent ?? site.progressPercent}
                  planned={site.plannedProgressPercent}
                  delta={site.progressDeltaPercent}
                  labels={labels}
                  none={x.none}
                  compact
                />
                <div className="spacer" />
                <div className="row">
                  <div><label>{labels.predictedFinish}</label><div>{shortDate(site.predictedFinishDate, x.none)}</div></div>
                  <div><label>{labels.delayDays}</label><div>{site.delayDays === null || site.delayDays === undefined ? x.none : site.delayDays}</div></div>
                  <div><label>{labels.delayStatus}</label><div>{displayLabel(site.delayStatus, labels, x.none)}</div></div>
                </div>
                <div className="spacer" />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => saveBaseline(site, 'draft')}>{labels.saveBaseline}</button>
                  <button className="btn primary" onClick={() => saveBaseline(site, 'confirmed')}>{labels.confirmBaseline}</button>
                </div>
              </div>
            );
          })}
          {siteCards.length === 0 && <div className="muted">{labels.noSites}</div>}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <TrackingFormCard title={labels.addProgressUpdate}>
            <TrackingSiteSelect value={updateForm.siteId} sites={siteOptions} onChange={(siteId) => setUpdateForm({ ...updateForm, siteId })} labelText={labels.siteArea} generalText={x.generalProjectUpdate} />
            <div className="row">
              <Field label={labels.title}><input value={updateForm.title} onChange={(event) => setUpdateForm({ ...updateForm, title: event.target.value })} /></Field>
              <Field label={labels.status}><OptionSelect value={updateForm.status} options={siteStatusOptions} labels={labels} none={x.none} onChange={(status) => setUpdateForm({ ...updateForm, status })} /></Field>
              <Field label={labels.progressPercent}><input type="number" min="0" max="100" value={updateForm.progressPercent} onChange={(event) => setUpdateForm({ ...updateForm, progressPercent: event.target.value })} /></Field>
              <Field label={labels.updateDate}><input type="date" value={updateForm.updateDate} onChange={(event) => setUpdateForm({ ...updateForm, updateDate: event.target.value })} /></Field>
            </div>
            <div className="spacer" />
            <label>{labels.description}</label>
            <textarea value={updateForm.description} onChange={(event) => setUpdateForm({ ...updateForm, description: event.target.value })} />
            <div className="spacer" />
            <label>{labels.nextAction}</label>
            <input value={updateForm.nextAction} onChange={(event) => setUpdateForm({ ...updateForm, nextAction: event.target.value })} />
            <div className="spacer" />
            <PhotoInputBlock form={updateForm} setForm={setUpdateForm} labels={labels} none={x.none} selectedPhotos={selectedPhotos} setPhotos={setPhotos} photoInputKey={photoInputKey} selectedPhotosLabel={x.selectedPhotos} />
            <div className="spacer" />
            <button className="btn primary" onClick={submitProgressUpdate} disabled={saving}>{saving ? x.actions.saving : x.actions.addUpdate}</button>
          </TrackingFormCard>

          {tracking.updates.map((update) => (
            <div key={update.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div><div style={{ fontWeight: 800 }}>{update.title}</div><div className="muted">{siteName(update, x.generalProjectUpdate)} | {shortDate(update.updateDate, x.none)}</div></div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><StatusBadge value={update.status} labels={labels} none={x.none} /><button className="btn danger secondary" onClick={() => deleteItem(`/orders/${orderId}/progress-updates/${update.id}`)}>{x.actions.delete}</button></div>
              </div>
              {update.progressPercent !== null && update.progressPercent !== undefined && <div className="muted">{labels.progress}: {update.progressPercent}%</div>}
              {update.description && <p>{update.description}</p>}
              {update.nextAction && <div className="card">{labels.nextActionPrefix}: {update.nextAction}</div>}
              {update.photos.length > 0 && <><div className="spacer" /><PhotoGrid photos={update.photos} labels={labels} none={x.none} /></>}
            </div>
          ))}
          {tracking.updates.length === 0 && <div className="muted">{labels.noProgressUpdates}</div>}
        </div>
      )}

      {activeTab === 'photos' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <TrackingFormCard title={labels.uploadPhotos}>
            <TrackingSiteSelect value={updateForm.siteId} sites={siteOptions} onChange={(siteId) => setUpdateForm({ ...updateForm, siteId })} labelText={labels.siteArea} generalText={x.generalProjectUpdate} />
            <div className="row">
              <Field label={labels.title}><input value={updateForm.title} placeholder={labels.photoUpdate} onChange={(event) => setUpdateForm({ ...updateForm, title: event.target.value })} /></Field>
              <Field label={labels.photoTag}><OptionSelect value={updateForm.photoTag} options={photoTagOptions} labels={labels} none={x.none} onChange={(photoTag) => setUpdateForm({ ...updateForm, photoTag })} /></Field>
              <Field label={labels.caption}><input value={updateForm.photoCaption} onChange={(event) => setUpdateForm({ ...updateForm, photoCaption: event.target.value })} /></Field>
            </div>
            <div className="spacer" />
            <label>{labels.photos}</label>
            <input key={`photos-${photoInputKey}`} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => setPhotos(event.target.files)} />
            <SelectedPhotoPreview files={selectedPhotos} labelText={x.selectedPhotos} />
            <div className="spacer" />
            <button className="btn primary" onClick={submitProgressUpdate} disabled={saving || selectedPhotos.length === 0}>{saving ? x.actions.uploading : x.actions.uploadPhotos}</button>
          </TrackingFormCard>
          <PhotoGrid photos={tracking.photos} labels={labels} none={x.none} />
          {tracking.photos.length === 0 && <div className="muted">{labels.noPhotos}</div>}
        </div>
      )}

      {activeTab === 'tasks' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <TrackingFormCard title={labels.addTask}>
            <TrackingSiteSelect value={taskForm.siteId} sites={siteOptions} onChange={(siteId) => setTaskForm({ ...taskForm, siteId })} labelText={labels.siteArea} generalText={x.generalProjectUpdate} />
            <div className="row">
              <Field label={labels.task}><input value={taskForm.taskName} onChange={(event) => setTaskForm({ ...taskForm, taskName: event.target.value })} /></Field>
              <Field label={labels.status}><OptionSelect value={taskForm.status} options={taskStatusOptions} labels={labels} none={x.none} onChange={(status) => setTaskForm({ ...taskForm, status })} /></Field>
              <Field label={labels.weightPercent}><input type="number" min="0" max="100" value={taskForm.weightPercent} onChange={(event) => setTaskForm({ ...taskForm, weightPercent: event.target.value })} /></Field>
              <Field label={labels.taskProgressPercent}><input type="number" min="0" max="100" value={taskForm.progressPercent} onChange={(event) => setTaskForm({ ...taskForm, progressPercent: event.target.value })} /></Field>
              <Field label={labels.responsible}><OptionSelect value={taskForm.responsibleType} options={['not_assigned', 'workshop']} labels={labels} none={x.none} onChange={(responsibleType) => setTaskForm({ ...taskForm, responsibleType })} /></Field>
              <Field label={labels.dueDate}><input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} /></Field>
            </div>
            <div className="spacer" />
            <div className="row">
              <Field label={labels.responsibleName}><input value={taskForm.responsibleName} onChange={(event) => setTaskForm({ ...taskForm, responsibleName: event.target.value })} /></Field>
              <Field label={labels.notes}><input value={taskForm.notes} onChange={(event) => setTaskForm({ ...taskForm, notes: event.target.value })} /></Field>
            </div>
            <div className="spacer" />
            <button className="btn primary" onClick={createTask}>{x.actions.addTask}</button>
          </TrackingFormCard>
          <TrackingTable headers={[labels.task, labels.siteArea, labels.status, labels.weightPercent, labels.taskProgressPercent, labels.responsible, labels.dueDate, labels.actions]} emptyLabel={x.noRecords} rows={tracking.tasks.map((task) => {
            const form = taskEditForms[task.id] || {};
            const updateTaskForm = (patch: FormState) => setTaskEditForms({ ...taskEditForms, [task.id]: { ...form, ...patch } });
            return [
              task.taskName,
              siteName(task, x.generalProjectUpdate),
              <OptionSelect key="status" value={form.status || task.status} options={taskStatusOptions} labels={labels} none={x.none} onChange={(status) => updateTaskForm({ status })} />,
              <input key="weight" type="number" min="0" max="100" value={form.weightPercent ?? ''} onChange={(event) => updateTaskForm({ weightPercent: event.target.value })} style={{ maxWidth: 90 }} />,
              <input key="progress" type="number" min="0" max="100" value={form.progressPercent ?? ''} onChange={(event) => updateTaskForm({ progressPercent: event.target.value })} style={{ maxWidth: 90 }} />,
              `${displayLabel(task.responsibleType, labels, x.none)}${task.responsibleName ? `: ${task.responsibleName}` : ''}`,
              shortDate(task.dueDate, x.none),
              <div key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn secondary" onClick={() => saveTask(task)}>{x.actions.saveTask}</button>
                <button className="btn secondary" onClick={() => saveTask(task, 'completed')}>{x.actions.complete}</button>
                <button className="btn danger secondary" onClick={() => deleteItem(`/orders/${orderId}/tasks/${task.id}`)}>{x.actions.delete}</button>
              </div>,
            ];
          })} />
        </div>
      )}

      {activeTab === 'issues' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <TrackingFormCard title={labels.addIssue}>
            <TrackingSiteSelect value={issueForm.siteId} sites={siteOptions} onChange={(siteId) => setIssueForm({ ...issueForm, siteId })} labelText={labels.siteArea} generalText={x.generalProjectUpdate} />
            <div className="row">
              <Field label={labels.issue}><input value={issueForm.title} onChange={(event) => setIssueForm({ ...issueForm, title: event.target.value })} /></Field>
              <Field label={labels.severity}><OptionSelect value={issueForm.severity} options={issueSeverityOptions} labels={labels} none={x.none} onChange={(severity) => setIssueForm({ ...issueForm, severity })} /></Field>
              <Field label={labels.status}><OptionSelect value={issueForm.status} options={issueStatusOptions} labels={labels} none={x.none} onChange={(status) => setIssueForm({ ...issueForm, status })} /></Field>
              <Field label={labels.responsible}><OptionSelect value={issueForm.responsibleType} options={['not_assigned', 'workshop']} labels={labels} none={x.none} onChange={(responsibleType) => setIssueForm({ ...issueForm, responsibleType })} /></Field>
              <Field label={labels.responsibleName}><input value={issueForm.responsibleName} onChange={(event) => setIssueForm({ ...issueForm, responsibleName: event.target.value })} /></Field>
            </div>
            <div className="spacer" />
            <label>{labels.description}</label>
            <textarea value={issueForm.description} onChange={(event) => setIssueForm({ ...issueForm, description: event.target.value })} />
            <div className="spacer" />
            <label>{labels.notes}</label>
            <input value={issueForm.resolutionNote} onChange={(event) => setIssueForm({ ...issueForm, resolutionNote: event.target.value })} />
            <div className="spacer" />
            <button className="btn primary" onClick={createIssue}>{x.actions.addIssue}</button>
          </TrackingFormCard>
          <TrackingTable headers={[labels.issue, labels.siteArea, labels.description, labels.severity, labels.status, labels.responsible, labels.notes, labels.actions]} emptyLabel={x.noRecords} rows={tracking.issues.map((issue) => [
            issue.title,
            siteName(issue, x.generalProjectUpdate),
            issue.description || x.none,
            <StatusBadge key="severity" value={issue.severity} labels={labels} none={x.none} />,
            <StatusBadge key="status" value={issue.status} labels={labels} none={x.none} />,
            `${displayLabel(issue.responsibleType, labels, x.none)}${issue.responsibleName ? `: ${issue.responsibleName}` : ''}`,
            issue.resolutionNote || x.none,
            <div key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {issue.status === 'resolved'
                ? <button className="btn secondary" onClick={() => updateIssueStatus(issue, 'open')}>{labels.open}</button>
                : <button className="btn secondary" onClick={() => updateIssueStatus(issue, 'resolved')}>{x.actions.resolve}</button>}
              <button className="btn danger secondary" onClick={() => deleteItem(`/orders/${orderId}/issues/${issue.id}`)}>{x.actions.delete}</button>
            </div>,
          ])} />
        </div>
      )}

      {activeTab === 'materials' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <TrackingFormCard title={labels.addMaterial}>
            <TrackingSiteSelect value={materialForm.siteId} sites={siteOptions} onChange={(siteId) => setMaterialForm({ ...materialForm, siteId })} labelText={labels.siteArea} generalText={x.generalProjectUpdate} />
            <div className="row">
              <Field label={labels.materialName}><input value={materialForm.materialName} onChange={(event) => setMaterialForm({ ...materialForm, materialName: event.target.value })} /></Field>
              <Field label={labels.quantity}><input value={materialForm.quantity} onChange={(event) => setMaterialForm({ ...materialForm, quantity: event.target.value })} /></Field>
              <Field label={labels.status}><OptionSelect value={materialForm.status} options={materialStatusOptions} labels={labels} none={x.none} onChange={(status) => setMaterialForm({ ...materialForm, status })} /></Field>
              <Field label={labels.notes}><input value={materialForm.notes} onChange={(event) => setMaterialForm({ ...materialForm, notes: event.target.value })} /></Field>
            </div>
            <div className="spacer" />
            <button className="btn primary" onClick={createMaterial}>{x.actions.addMaterial}</button>
          </TrackingFormCard>
          <TrackingTable headers={[labels.materialName, labels.siteArea, labels.quantity, labels.status, labels.notes, labels.actions]} emptyLabel={x.noRecords} rows={tracking.materials.map((material) => [
            material.materialName,
            siteName(material, x.generalProjectUpdate),
            material.quantity || x.none,
            <StatusBadge key="status" value={material.status} labels={labels} none={x.none} />,
            material.notes || x.none,
            <div key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn secondary" onClick={() => updateMaterialStatus(material, 'delivered')}>{x.actions.delivered}</button><button className="btn danger secondary" onClick={() => deleteItem(`/orders/${orderId}/materials/${material.id}`)}>{x.actions.delete}</button></div>,
          ])} />
        </div>
      )}

      {activeTab === 'team' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {siteCards.map((site) => (
            <div key={site.siteId} className="card">
              <div style={{ fontWeight: 800 }}>{site.siteName}</div>
              <div className="spacer" />
              {site.workshopAssignments.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {site.workshopAssignments.map((assignment) => (
                    <div key={assignment.id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{assignment.workshop?.name || labels.workshop}</strong>
                        <StatusBadge value={assignment.status} labels={labels} none={x.none} />
                      </div>
                      <div className="muted">{labels.schedule}: {assignment.startDate && assignment.endDate ? `${shortDate(assignment.startDate, x.none)} - ${shortDate(assignment.endDate, x.none)}` : labels.scheduleMissing}</div>
                      <div className="muted">{labels.coveredTrades}: {joinList(assignment.coveredSkills, labels.noCoveredTrades)}</div>
                      {assignment.notes && <div className="muted">{labels.notes}: {assignment.notes}</div>}
                    </div>
                  ))}
                </div>
              ) : <div className="muted">{labels.noWorkshopAssigned}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionSelect({ value, options, labels, none, onChange }: { value: string; options: string[]; labels: Labels; none: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{displayLabel(option, labels, none)}</option>)}</select>;
}

function StatusBadge({ value, labels, none, size = 'sm' }: { value?: string | null; labels: Labels; none: string; size?: 'sm' | 'md' }) {
  const normalized = (value || 'not_started').toLowerCase();
  const style = STATUS_STYLES[normalized] || STATUS_STYLES.not_started;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${style.border}`, background: style.background, color: style.color, borderRadius: 999, padding: size === 'md' ? '6px 12px' : '3px 9px', fontSize: size === 'md' ? 13 : 12, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: style.color, display: 'inline-block' }} />
      {displayLabel(normalized, labels, none)}
    </span>
  );
}

function WarningList({ warnings, labels, emptyLabel, onOpenAction, onRefresh }: { warnings: TrackingWarning[]; labels: Labels; emptyLabel: string; onOpenAction?: (warning: TrackingWarning) => void; onRefresh?: () => void }) {
  if (!warnings.length) return <div className="muted">{emptyLabel}</div>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {warnings.map((warning, index) => (
        <div key={`${warning.type}-${warning.siteId || 'general'}-${index}`} style={{ border: warning.severity === 'high' ? '1px solid rgba(220,38,38,.35)' : '1px solid rgba(217,119,6,.35)', background: warning.severity === 'high' ? 'rgba(220,38,38,.08)' : 'rgba(217,119,6,.08)', borderRadius: 12, padding: '9px 11px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <strong>{displayLabel(warning.severity, labels, '')}</strong> - {warningText(warning, labels)}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '0 0 auto' }}>
              <button type="button" className="btn secondary" style={{ padding: '4px 8px', fontSize: 12, lineHeight: 1 }} title={labels.whatToDo || 'What should I do?'} onClick={() => showWarningGuidance(warning, labels)}>
                {labels.info || 'Info'}
              </button>
              {onOpenAction && <button type="button" className="btn secondary" style={{ padding: '4px 8px', fontSize: 12, lineHeight: 1 }} onClick={() => onOpenAction(warning)}>{labels.openFix || 'فتح الحل'}</button>}
              {onRefresh && <button type="button" className="btn secondary" style={{ padding: '4px 8px', fontSize: 12, lineHeight: 1 }} onClick={onRefresh}>{labels.refreshWarnings || 'إعادة الفحص'}</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkshopScheduleList({ assignments, labels, none }: { assignments: WorkshopAssignment[]; labels: Labels; none: string }) {
  if (!assignments.length) return <div className="muted">{labels.noWorkshopAssigned}</div>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {assignments.map((assignment) => (
        <div key={assignment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid rgba(148,163,184,.18)', paddingBottom: 8 }}>
          <div>
            <strong>{assignment.workshop?.name || labels.workshop}</strong>
            <div className="muted">{labels.coveredTrades}: {joinList(assignment.coveredSkills, labels.noCoveredTrades)}</div>
            <div className="muted">{labels.schedule}: {assignment.startDate && assignment.endDate ? `${shortDate(assignment.startDate, none)} - ${shortDate(assignment.endDate, none)}` : labels.scheduleMissing}</div>
          </div>
          <StatusBadge value={assignment.scheduleStatus || assignment.status} labels={labels} none={none} />
        </div>
      ))}
    </div>
  );
}

function MetricCard({ title, subtitle, value, accent = '#334155' }: { title: string; subtitle: string; value: ReactNode; accent?: string }) {
  return (
    <div className="card tracking-metric-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: '#64748b' }}>{title}</div><div className="muted" style={{ marginTop: 4 }}>{subtitle}</div></div>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: accent, marginTop: 3 }} />
      </div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label>{label}</label>{children}</div>;
}

function TrackingSiteSelect({ value, sites, onChange, labelText, generalText }: { value: string; sites: Array<{ id: string; name: string }>; onChange: (value: string) => void; labelText: string; generalText: string }) {
  return (
    <>
      <label>{labelText}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{generalText}</option>
        {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
      <div className="spacer" />
    </>
  );
}

function TrackingFormCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card tracking-form-card"><strong>{title}</strong><div className="spacer" />{children}</div>;
}

function PhotoInputBlock({ form, setForm, labels, none, selectedPhotos, setPhotos, photoInputKey, selectedPhotosLabel }: { form: FormState; setForm: (form: FormState) => void; labels: Labels; none: string; selectedPhotos: File[]; setPhotos: (files: FileList | null) => void; photoInputKey: number; selectedPhotosLabel: string }) {
  return (
    <div className="row">
      <Field label={labels.photoTag}><OptionSelect value={form.photoTag} options={photoTagOptions} labels={labels} none={none} onChange={(photoTag) => setForm({ ...form, photoTag })} /></Field>
      <Field label={labels.photoCaption}><input value={form.photoCaption} onChange={(event) => setForm({ ...form, photoCaption: event.target.value })} /></Field>
      <Field label={labels.photos}><input key={photoInputKey} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => setPhotos(event.target.files)} /><SelectedPhotoPreview files={selectedPhotos} labelText={selectedPhotosLabel} /></Field>
    </div>
  );
}

function PhotoGrid({ photos, labels, none }: { photos: TrackingPhoto[]; labels: Labels; none: string }) {
  return (
    <div className="tracking-photo-grid">
      {photos.map((photo) => (
        <a key={photo.id} href={photoSrc(photo)} target="_blank" rel="noreferrer" className="card tracking-photo-card">
          <img src={photoSrc(photo)} alt={photo.caption || photo.originalFilename || labels.projectPhoto} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8 }} />
          <div className="muted" style={{ marginTop: 6 }}>{displayLabel(photo.tag, labels, none)}</div>
          {photo.caption && <div>{photo.caption}</div>}
        </a>
      ))}
    </div>
  );
}

function TrackingTable({ headers, rows, emptyLabel }: { headers: string[]; rows: ReactNode[][]; emptyLabel: string }) {
  return (
    <div className="tracking-table-wrap"><table className="table tracking-table">
      <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}
        {rows.length === 0 && <tr><td colSpan={headers.length} className="muted">{emptyLabel}</td></tr>}
      </tbody>
    </table></div>
  );
}

function SelectedPhotoPreview({ files, labelText }: { files: File[]; labelText: string }) {
  if (!files.length) return null;
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="muted">{labelText}: {files.length}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {files.map((file) => <span key={`${file.name}-${file.size}`} className="muted" style={{ border: '1px solid rgba(148,163,184,.4)', borderRadius: 999, padding: '4px 8px' }}>{file.name} ({Math.round(file.size / 1024)} KB)</span>)}
      </div>
    </div>
  );
}


