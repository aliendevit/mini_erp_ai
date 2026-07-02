'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useI18n } from '../../../lib/i18n';
import { appConfirm } from '../../../lib/dialog';
import { apiGet, apiJson } from '../../../lib/api';
import { hasPermission, readStoredAccessUser } from '../../../lib/access';

type Customer = { id: string; companyName: string };

type Workshop = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  specialties: string[];
  notes?: string | null;
  availabilityStatus?: 'available' | 'not_available';
  availabilityNote?: string | null;
  isActive: boolean;
};

type WorkshopAssignment = {
  id: string;
  orderId: string;
  siteId: string;
  workshopId: string;
  coveredSkills: string[];
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  notes?: string | null;
  workshop?: Workshop | null;
  site?: { id: string; siteName: string } | null;
};

type Site = {
  id: string;
  orderId: string;
  siteName: string;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  notes?: string | null;
  isActive: boolean;
  assignments?: unknown[];
  workshopAssignments?: WorkshopAssignment[];
};

type Order = {
  id: string;
  customerId: string;
  customer?: Customer;
  orderNumber?: string | null;
  title: string;
  description?: string | null;
  status: string;
  defaultHourlyRate?: string | null;
  currency: string;
  sites: Site[];
};

type AssignmentForm = {
  siteId: string;
  workshopId: string;
  coveredSkills: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
};

const emptyOrder: Partial<Order> = {
  customerId: '',
  orderNumber: '',
  title: '',
  description: '',
  status: 'open',
  defaultHourlyRate: '',
};

const emptySite: Partial<Site> = {
  siteName: '',
  street: '',
  zipCode: '',
  city: '',
  notes: '',
  isActive: true,
};

const emptyAssignment: AssignmentForm = {
  siteId: '',
  workshopId: '',
  coveredSkills: '',
  startDate: '',
  endDate: '',
  status: 'assigned',
  notes: '',
};

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(values?: string[] | null): string {
  return (values || []).join(', ');
}

function dateInputValue(value?: string | null): string {
  return value ? String(value).substring(0, 10) : '';
}

function address(site: Site, fallback: string) {
  return [site.street, [site.zipCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || fallback;
}

export default function OrderDetailPage() {
  const { locale, messages: m } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [workshopAssignments, setWorkshopAssignments] = useState<WorkshopAssignment[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState<Partial<Order>>(emptyOrder);
  const [siteForm, setSiteForm] = useState<Partial<Site>>(emptySite);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(emptyAssignment);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [canManageCompany, setCanManageCompany] = useState(false);
  const [canManageInvoices, setCanManageInvoices] = useState(false);
  const [canUseAiMonitoring, setCanUseAiMonitoring] = useState(false);

  const siteOptions = useMemo(() => order?.sites || [], [order]);
  const activeWorkshops = useMemo(() => workshops.filter((workshop) => workshop.isActive && workshop.availabilityStatus !== 'not_available'), [workshops]);
  const workshopOptions = useMemo(() => {
    if (!editingAssignmentId) return activeWorkshops;
    const selected = workshops.find((workshop) => workshop.id === assignmentForm.workshopId);
    return selected && !activeWorkshops.some((workshop) => workshop.id === selected.id) ? [selected, ...activeWorkshops] : activeWorkshops;
  }, [activeWorkshops, assignmentForm.workshopId, editingAssignmentId, workshops]);

  async function load() {
    const user = readStoredAccessUser();
    const nextCanManageCompany = hasPermission(user, 'manage_company');
    setCanManageCompany(nextCanManageCompany);
    setCanManageInvoices(hasPermission(user, 'manage_invoices'));
    setCanUseAiMonitoring(hasPermission(user, 'use_ai_monitoring'));
    const [nextOrder, nextCustomers, nextWorkshops, nextWorkshopAssignments] = await Promise.all([
      apiGet<Order>(`/orders/${id}`),
      nextCanManageCompany ? apiGet<Customer[]>('/customers') : Promise.resolve([]),
      nextCanManageCompany ? apiGet<Workshop[]>('/workshops?activeOnly=true') : Promise.resolve([]),
      apiGet<WorkshopAssignment[]>(`/orders/${id}/workshop-assignments`),
    ]);
    setOrder(nextOrder);
    setCustomers(nextCanManageCompany ? nextCustomers : nextOrder.customer ? [nextOrder.customer] : []);
    setWorkshops(nextWorkshops);
    setWorkshopAssignments(nextWorkshopAssignments);
    setOrderForm({
      id: nextOrder.id,
      customerId: nextOrder.customerId,
      orderNumber: nextOrder.orderNumber || '',
      title: nextOrder.title,
      description: nextOrder.description || '',
      status: nextOrder.status || 'open',
      defaultHourlyRate: nextOrder.defaultHourlyRate || '',
    });

    setAssignmentForm((current) => ({
      ...current,
      siteId: current.siteId || nextOrder.sites[0]?.id || '',
      workshopId: current.workshopId || nextWorkshops.find((workshop) => workshop.isActive && workshop.availabilityStatus !== 'not_available')?.id || '',
    }));
  }

  useEffect(() => {
    if (!id) return;
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveOrder() {
    if (!canManageCompany) return;
    if (!orderForm.customerId) return alert(m.ordersPage.customerRequired);
    if (!orderForm.title?.trim()) return alert(m.ordersPage.titleRequired);

    try {
      await apiJson(`/orders/${id}`, 'PUT', {
        customerId: orderForm.customerId,
        orderNumber: orderForm.orderNumber || null,
        title: orderForm.title,
        description: orderForm.description || null,
        status: orderForm.status || 'open',
        defaultHourlyRate: orderForm.defaultHourlyRate || null,
        currency: 'EUR',
      });
      await load();
      alert(m.common.updateSuccess);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function deleteOrder() {
    if (!canManageCompany) return;
    if (!(await appConfirm(m.common.deleteConfirm))) return;
    try {
      await apiJson(`/orders/${id}`, 'DELETE');
      router.push('/orders');
    } catch (error: any) {
      alert(error.message);
    }
  }

  function startNewSite() {
    if (!canManageCompany) return;
    setEditingSiteId(null);
    setSiteForm({ ...emptySite });
  }

  function startEditSite(site: Site) {
    if (!canManageCompany) return;
    setEditingSiteId(site.id);
    setSiteForm({
      id: site.id,
      siteName: site.siteName,
      street: site.street || '',
      zipCode: site.zipCode || '',
      city: site.city || '',
      notes: site.notes || '',
      isActive: site.isActive,
    });
  }

  async function saveSite() {
    if (!canManageCompany) return;
    if (!siteForm.siteName?.trim()) return alert(m.orderDetailPage.siteNameRequired);
    try {
      const payload = {
        orderId: id,
        siteName: siteForm.siteName,
        street: siteForm.street || null,
        zipCode: siteForm.zipCode || null,
        city: siteForm.city || null,
        notes: siteForm.notes || null,
        isActive: siteForm.isActive !== undefined ? Boolean(siteForm.isActive) : true,
      };
      if (editingSiteId) {
        await apiJson(`/sites/${editingSiteId}`, 'PUT', payload);
      } else {
        await apiJson('/sites', 'POST', payload);
      }
      await load();
      startNewSite();
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function deleteSite(siteId: string) {
    if (!canManageCompany) return;
    if (!(await appConfirm(m.common.deleteConfirm))) return;
    try {
      await apiJson(`/sites/${siteId}`, 'DELETE');
      await load();
      if (editingSiteId === siteId) startNewSite();
    } catch (error: any) {
      alert(error.message);
    }
  }

  function startEditWorkshopAssignment(assignment: WorkshopAssignment) {
    if (!canManageCompany) return;
    setEditingAssignmentId(assignment.id);
    setAssignmentForm({
      siteId: assignment.siteId,
      workshopId: assignment.workshopId,
      coveredSkills: listText(assignment.coveredSkills),
      startDate: dateInputValue(assignment.startDate),
      endDate: dateInputValue(assignment.endDate),
      status: assignment.status || 'assigned',
      notes: assignment.notes || '',
    });
  }

  function cancelWorkshopAssignmentEdit() {
    if (!canManageCompany) return;
    setEditingAssignmentId(null);
    setAssignmentForm((current) => ({
      ...emptyAssignment,
      siteId: current.siteId || order?.sites[0]?.id || '',
      workshopId: activeWorkshops[0]?.id || '',
    }));
  }

  async function saveWorkshopAssignment() {
    if (!canManageCompany) return;
    if (!id) return;
    if (!assignmentForm.siteId) return alert(trackingLabels.selectSiteRequired || 'Please select a site.');
    if (!assignmentForm.workshopId) return alert(trackingLabels.selectWorkshopRequired || 'Please select a workshop.');
    if (!assignmentForm.startDate || !assignmentForm.endDate) return alert(trackingLabels.selectWorkshopDatesRequired || 'Please select workshop start and end dates.');
    const payload = {
      siteId: assignmentForm.siteId,
      workshopId: assignmentForm.workshopId,
      coveredSkills: parseList(assignmentForm.coveredSkills),
      startDate: assignmentForm.startDate || null,
      endDate: assignmentForm.endDate || null,
      status: assignmentForm.status || 'assigned',
      notes: assignmentForm.notes || null,
    };
    try {
      if (editingAssignmentId) {
        await apiJson(`/workshop-assignments/${editingAssignmentId}`, 'PUT', payload);
      } else {
        await apiJson(`/orders/${id}/workshop-assignments`, 'POST', payload);
      }
      await load();
      setEditingAssignmentId(null);
      setAssignmentForm((current) => ({ ...emptyAssignment, siteId: current.siteId, workshopId: activeWorkshops[0]?.id || current.workshopId }));
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function removeWorkshopAssignment(assignmentId: string) {
    if (!canManageCompany) return;
    if (!(await appConfirm(m.common.deleteConfirm))) return;
    try {
      await apiJson(`/workshop-assignments/${assignmentId}`, 'DELETE');
      if (editingAssignmentId === assignmentId) setEditingAssignmentId(null);
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  }

  function assignmentsForSite(siteId: string): WorkshopAssignment[] {
    return workshopAssignments.filter((assignment) => assignment.siteId === siteId);
  }

  if (!order) {
    return <div className="card"><div className="muted">{m.common.loading}</div></div>;
  }

  const statusLabels = m.statuses.order;
  const trackingLabels = m.trackingPage.labels;
  const actionCopy = locale === 'ar'
    ? { track: '????', ai: '????', bill: '??????', workshopInvoice: '?????? ????', workshopInvoiceDescription: '????? ?????? ????? ?????? ????? ???? ?????.' }
    : locale === 'de'
      ? { track: 'TRACK', ai: 'KI', bill: 'RECHNUNG', workshopInvoice: 'Werkstattrechnung', workshopInvoiceDescription: 'Pauschalrechnung f?r Standorte und Werkstatt-Leistungspakete erstellen.' }
      : { track: 'TRACK', ai: 'AI', bill: 'BILL', workshopInvoice: 'Workshop invoice', workshopInvoiceDescription: 'Create a fixed invoice for site and workshop work packages.' };
  const readOnlyCopy = locale === 'ar'
    ? { title: '\u0648\u0636\u0639 \u0627\u0644\u0639\u0631\u0636', body: '\u064a\u0645\u0643\u0646\u0643 \u0645\u0631\u0627\u062c\u0639\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0637\u0644\u0628 \u0648\u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0648\u0641\u062a\u062d \u0627\u0644\u062a\u062a\u0628\u0639. \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0648\u0627\u0644\u0648\u0631\u0634 \u0644\u0644\u0645\u062f\u064a\u0631 \u0641\u0642\u0637.' }
    : locale === 'de'
      ? { title: 'Lesemodus', body: 'Sie koennen Auftragsdaten, Standorte und Tracking oeffnen. Auftrags-, Standort- und Werkstattverwaltung ist nur fuer Manager verfuegbar.' }
      : { title: 'Read-only mode', body: 'You can review order data, sites, and tracking. Order, site, and workshop management is available only to managers.' };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>{m.orderDetailPage.headingPrefix}: {order.title}</h2>
          <div className="muted">{m.common.id}: {order.id}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/orders">{m.common.back}</Link>
          {canManageCompany && <button className="btn danger" onClick={deleteOrder}>{m.orderDetailPage.deleteOrder}</button>}
        </div>
      </div>

      <div className="spacer" />

      <div className="order-action-panel">
        <Link className="order-action-card tracking" href={`/orders/${order.id}/tracking`}>
          <span className="order-action-icon">{actionCopy.track}</span>
          <span>
            <strong>{trackingLabels.openTracking || m.trackingPage.heading}</strong>
            <small>{m.trackingPage.description}</small>
          </span>
          <b>{'>'}</b>
        </Link>
        {canUseAiMonitoring && (
          <Link className="order-action-card monitoring" href={`/orders/${order.id}/monitoring`}>
            <span className="order-action-icon">{actionCopy.ai}</span>
            <span>
              <strong>{trackingLabels.openMonitoring || m.trackingPage.aiAnalysis.title}</strong>
              <small>{m.trackingPage.aiAnalysis.description}</small>
            </span>
            <b>{'>'}</b>
          </Link>
        )}
        {canManageInvoices && (
          <Link className="order-action-card" href={`/invoices/new?orderId=${order.id}`}>
            <span className="order-action-icon">{actionCopy.bill}</span>
            <span>
              <strong>{actionCopy.workshopInvoice}</strong>
              <small>{actionCopy.workshopInvoiceDescription}</small>
            </span>
            <b>{'>'}</b>
          </Link>
        )}
      </div>

      <div className="spacer" />

      {canManageCompany ? (
        <>
          <h3>{m.orderDetailPage.editHeading}</h3>
          <div className="row">
            <div>
              <label>{m.common.customer} *</label>
              <select value={orderForm.customerId || ''} onChange={(event) => setOrderForm({ ...orderForm, customerId: event.target.value })}>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                {customers.length === 0 && <option value="">{m.orderDetailPage.noCustomersOption}</option>}
              </select>
            </div>
            <div>
              <label>{m.ordersPage.orderNumber}</label>
              <input value={(orderForm.orderNumber as string) || ''} onChange={(event) => setOrderForm({ ...orderForm, orderNumber: event.target.value })} />
            </div>
            <div>
              <label>{m.common.status}</label>
              <select value={orderForm.status || 'open'} onChange={(event) => setOrderForm({ ...orderForm, status: event.target.value })}>
                <option value="open">{statusLabels.open}</option>
                <option value="paused">{statusLabels.paused}</option>
                <option value="closed">{statusLabels.closed}</option>
              </select>
            </div>
          </div>

          <div className="spacer" />

          <div className="row">
            <div>
              <label>{m.common.title} *</label>
              <input value={orderForm.title || ''} onChange={(event) => setOrderForm({ ...orderForm, title: event.target.value })} />
            </div>
            <div>
              <label>{trackingLabels.fixedPriceNote || 'Fixed-price note / legacy hourly rate'}</label>
              <input value={(orderForm.defaultHourlyRate as string) || ''} onChange={(event) => setOrderForm({ ...orderForm, defaultHourlyRate: event.target.value })} />
            </div>
          </div>

          <div className="spacer" />
          <div>
            <label>{m.common.description}</label>
            <textarea value={orderForm.description || ''} onChange={(event) => setOrderForm({ ...orderForm, description: event.target.value })} />
          </div>

          <div className="spacer" />
          <button className="btn primary" onClick={saveOrder}>{m.common.save}</button>
        </>
      ) : (
        <div className="card">
          <h3>{readOnlyCopy.title}</h3>
          <div className="muted">{readOnlyCopy.body}</div>
        </div>
      )}

      <div className="spacer" />
      <hr />

      <h3>{m.common.sites}</h3>

      {canManageCompany && (
        <>
          <div className="row">
            <div>
              <label>{m.common.site} *</label>
              <input value={siteForm.siteName || ''} onChange={(event) => setSiteForm({ ...siteForm, siteName: event.target.value })} />
            </div>
            <div>
              <label>{m.common.street}</label>
              <input value={(siteForm.street as string) || ''} onChange={(event) => setSiteForm({ ...siteForm, street: event.target.value })} />
            </div>
            <div>
              <label>{m.common.zipCode}</label>
              <input value={(siteForm.zipCode as string) || ''} onChange={(event) => setSiteForm({ ...siteForm, zipCode: event.target.value })} />
            </div>
            <div>
              <label>{m.common.city}</label>
              <input value={(siteForm.city as string) || ''} onChange={(event) => setSiteForm({ ...siteForm, city: event.target.value })} />
            </div>
          </div>

          <div className="spacer" />
          <div>
            <label>{m.common.notes}</label>
            <textarea value={(siteForm.notes as string) || ''} onChange={(event) => setSiteForm({ ...siteForm, notes: event.target.value })} />
          </div>

          <div className="spacer" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={saveSite}>{editingSiteId ? m.common.save : m.orderDetailPage.addSite}</button>
            <button className="btn" onClick={startNewSite}>{m.orderDetailPage.newSite}</button>
          </div>

          <div className="spacer" />
        </>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>{m.common.site}</th>
            <th>{m.orderDetailPage.address}</th>
            <th>{trackingLabels.assignedWorkshops}</th>
            <th style={{ width: 260 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {order.sites.map((site) => {
            const siteAssignments = assignmentsForSite(site.id);
            return (
              <tr key={site.id}>
                <td>{site.siteName}</td>
                <td>{address(site, m.common.none)}</td>
                <td>
                  {siteAssignments.length > 0
                    ? siteAssignments.map((assignment) => (
                        <div key={assignment.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>{assignment.workshop?.name || trackingLabels.workshop}</span>
                          <span className="muted">{listText(assignment.coveredSkills) || trackingLabels.noCoveredTrades}</span>
                          <span className="muted">{assignment.startDate && assignment.endDate ? `${String(assignment.startDate).substring(0, 10)} - ${String(assignment.endDate).substring(0, 10)}` : trackingLabels.scheduleMissing}</span>
                          {canManageCompany && <button className="btn secondary" onClick={() => startEditWorkshopAssignment(assignment)}>{m.common.edit}</button>}
                          {canManageCompany && <button className="btn danger secondary" onClick={() => removeWorkshopAssignment(assignment.id)}>{m.common.remove}</button>}
                        </div>
                      ))
                    : m.common.none}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canManageCompany && <button className="btn" onClick={() => startEditSite(site)}>{m.common.edit}</button>}
                    {canManageCompany && <button className="btn danger" onClick={() => deleteSite(site.id)}>{m.common.delete}</button>}
                  </div>
                </td>
              </tr>
            );
          })}
          {order.sites.length === 0 && (
            <tr><td colSpan={4} className="muted">{m.orderDetailPage.noSites}</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.orderDetailPage.deleteSitesHint}</div>

      {canManageCompany && (
        <>
          <div className="spacer" />
          <hr />

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3>{editingAssignmentId ? trackingLabels.editWorkshopAssignment || 'Edit workshop assignment' : trackingLabels.workshopExecution || 'Workshop execution'}</h3>
                <div className="muted">{editingAssignmentId ? trackingLabels.editWorkshopAssignmentDescription || 'Update the existing workshop schedule, status, covered scope, or notes. This fixes schedule warnings without creating duplicate assignments.' : trackingLabels.workshopExecutionDescription || 'Assign trusted workshops to each site or work package. Employee assignment is no longer part of the main workflow.'}</div>
              </div>
              <Link className="btn" href="/workshops">{trackingLabels.manageWorkshops || 'Manage workshops'}</Link>
            </div>
            <div className="spacer" />
            <div className="row">
              <div>
                <label>{m.common.site} *</label>
                <select value={assignmentForm.siteId} onChange={(event) => setAssignmentForm({ ...assignmentForm, siteId: event.target.value })}>
                  {siteOptions.map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}
                  {siteOptions.length === 0 && <option value="">{m.orderDetailPage.noSitesOption}</option>}
                </select>
              </div>
              <div>
                <label>{trackingLabels.workshop} *</label>
                <select value={assignmentForm.workshopId} onChange={(event) => setAssignmentForm({ ...assignmentForm, workshopId: event.target.value })}>
                  {workshopOptions.map((workshop) => <option key={workshop.id} value={workshop.id}>{workshop.name}{workshop.availabilityStatus === 'not_available' ? ` (${trackingLabels.workshopUnavailable || 'not available'})` : ''}{workshop.specialties?.length ? ` (${listText(workshop.specialties)})` : ''}</option>)}
                  {workshopOptions.length === 0 && <option value="">{trackingLabels.noAvailableWorkshops || 'No available workshops'}</option>}
                </select>
              </div>
              <div>
                <label>{trackingLabels.status}</label>
                <select value={assignmentForm.status} onChange={(event) => setAssignmentForm({ ...assignmentForm, status: event.target.value })}>
                  <option value="planned">{trackingLabels.planned || 'Planned'}</option>
                  <option value="assigned">{trackingLabels.assigned || 'Assigned'}</option>
                  <option value="in_progress">{trackingLabels.in_progress}</option>
                  <option value="blocked">{trackingLabels.blocked}</option>
                  <option value="completed">{trackingLabels.completed}</option>
                  <option value="canceled">{trackingLabels.canceled || 'Canceled'}</option>
                </select>
              </div>
              <div>
                <label>{trackingLabels.startDate || 'Start date'} *</label>
                <input type="date" value={assignmentForm.startDate} onChange={(event) => setAssignmentForm({ ...assignmentForm, startDate: event.target.value })} />
              </div>
              <div>
                <label>{trackingLabels.endDate || 'End date'} *</label>
                <input type="date" value={assignmentForm.endDate} onChange={(event) => setAssignmentForm({ ...assignmentForm, endDate: event.target.value })} />
              </div>
            </div>
            <div className="spacer" />
            <div className="row">
              <div>
                <label>{trackingLabels.coveredTradesScope || trackingLabels.coveredTrades}</label>
                <textarea value={assignmentForm.coveredSkills} onChange={(event) => setAssignmentForm({ ...assignmentForm, coveredSkills: event.target.value })} placeholder={trackingLabels.coveredTradesPlaceholder || 'tiles, waterproofing, painting'} />
              </div>
              <div>
                <label>{m.common.notes}</label>
                <textarea value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} />
              </div>
            </div>
            <div className="spacer" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={saveWorkshopAssignment} disabled={!assignmentForm.siteId || !assignmentForm.workshopId || !assignmentForm.startDate || !assignmentForm.endDate}>{editingAssignmentId ? trackingLabels.saveWorkshopAssignment || 'Save workshop assignment' : trackingLabels.assignWorkshop || 'Assign workshop'}</button>
              {editingAssignmentId && <button className="btn" onClick={cancelWorkshopAssignmentEdit}>{trackingLabels.cancelEdit || 'Cancel edit'}</button>}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
