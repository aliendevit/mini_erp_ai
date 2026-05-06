'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useI18n } from '../../../lib/i18n';
import { apiGet, apiJson } from '../../../lib/api';
import ProjectTrackingSection from './ProjectTrackingSection';

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

function address(site: Site, fallback: string) {
  return [site.street, [site.zipCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || fallback;
}

export default function OrderDetailPage() {
  const { messages: m } = useI18n();
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

  const siteOptions = useMemo(() => order?.sites || [], [order]);
  const activeWorkshops = useMemo(() => workshops.filter((workshop) => workshop.isActive && workshop.availabilityStatus !== 'not_available'), [workshops]);

  async function load() {
    const [nextOrder, nextCustomers, nextWorkshops, nextWorkshopAssignments] = await Promise.all([
      apiGet<Order>(`/orders/${id}`),
      apiGet<Customer[]>('/customers'),
      apiGet<Workshop[]>('/workshops?availableOnly=true'),
      apiGet<WorkshopAssignment[]>(`/orders/${id}/workshop-assignments`),
    ]);
    setOrder(nextOrder);
    setCustomers(nextCustomers);
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
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/orders/${id}`, 'DELETE');
      router.push('/orders');
    } catch (error: any) {
      alert(error.message);
    }
  }

  function startNewSite() {
    setEditingSiteId(null);
    setSiteForm({ ...emptySite });
  }

  function startEditSite(site: Site) {
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
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/sites/${siteId}`, 'DELETE');
      await load();
      if (editingSiteId === siteId) startNewSite();
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function addWorkshopAssignment() {
    if (!id) return;
    if (!assignmentForm.siteId) return alert('Please select a site.');
    if (!assignmentForm.workshopId) return alert('Please select a workshop.');
    if (!assignmentForm.startDate || !assignmentForm.endDate) return alert('Please select workshop start and end dates.');
    try {
      await apiJson(`/orders/${id}/workshop-assignments`, 'POST', {
        siteId: assignmentForm.siteId,
        workshopId: assignmentForm.workshopId,
        coveredSkills: parseList(assignmentForm.coveredSkills),
        startDate: assignmentForm.startDate || null,
        endDate: assignmentForm.endDate || null,
        status: assignmentForm.status || 'assigned',
        notes: assignmentForm.notes || null,
      });
      await load();
      setAssignmentForm((current) => ({ ...emptyAssignment, siteId: current.siteId, workshopId: current.workshopId }));
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function removeWorkshopAssignment(assignmentId: string) {
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/workshop-assignments/${assignmentId}`, 'DELETE');
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

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>{m.orderDetailPage.headingPrefix}: {order.title}</h2>
          <div className="muted">{m.common.id}: {order.id}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/orders">{m.common.back}</Link>
          <button className="btn danger" onClick={deleteOrder}>{m.orderDetailPage.deleteOrder}</button>
        </div>
      </div>

      <div className="spacer" />

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
          <label>Fixed-price note / legacy hourly rate</label>
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

      <div className="spacer" />
      <hr />

      <h3>{m.common.sites}</h3>

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

      <table className="table">
        <thead>
          <tr>
            <th>{m.common.site}</th>
            <th>{m.orderDetailPage.address}</th>
            <th>Assigned workshops</th>
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
                          <span>{assignment.workshop?.name || 'Workshop'}</span>
                          <span className="muted">{listText(assignment.coveredSkills) || 'No covered trades set'}</span>
                          <span className="muted">{assignment.startDate && assignment.endDate ? `${String(assignment.startDate).substring(0, 10)} - ${String(assignment.endDate).substring(0, 10)}` : 'Schedule missing'}</span>
                          <button className="btn danger secondary" onClick={() => removeWorkshopAssignment(assignment.id)}>{m.common.remove}</button>
                        </div>
                      ))
                    : m.common.none}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => startEditSite(site)}>{m.common.edit}</button>
                    <button className="btn danger" onClick={() => deleteSite(site.id)}>{m.common.delete}</button>
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

      <div className="spacer" />
      <hr />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3>Workshop execution</h3>
            <div className="muted">Assign trusted workshops to each site or work package. Employee assignment is no longer part of the main workflow.</div>
          </div>
          <Link className="btn" href="/workshops">Manage workshops</Link>
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
            <label>Workshop *</label>
            <select value={assignmentForm.workshopId} onChange={(event) => setAssignmentForm({ ...assignmentForm, workshopId: event.target.value })}>
              {activeWorkshops.map((workshop) => <option key={workshop.id} value={workshop.id}>{workshop.name}{workshop.specialties?.length ? ` (${listText(workshop.specialties)})` : ''}</option>)}
              {activeWorkshops.length === 0 && <option value="">No available workshops</option>}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={assignmentForm.status} onChange={(event) => setAssignmentForm({ ...assignmentForm, status: event.target.value })}>
              <option value="planned">Planned</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <div>
            <label>Start date *</label>
            <input type="date" value={assignmentForm.startDate} onChange={(event) => setAssignmentForm({ ...assignmentForm, startDate: event.target.value })} />
          </div>
          <div>
            <label>End date *</label>
            <input type="date" value={assignmentForm.endDate} onChange={(event) => setAssignmentForm({ ...assignmentForm, endDate: event.target.value })} />
          </div>
        </div>
        <div className="spacer" />
        <div className="row">
          <div>
            <label>Covered trades / scope</label>
            <textarea value={assignmentForm.coveredSkills} onChange={(event) => setAssignmentForm({ ...assignmentForm, coveredSkills: event.target.value })} placeholder="tiles, waterproofing, painting" />
          </div>
          <div>
            <label>{m.common.notes}</label>
            <textarea value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} />
          </div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={addWorkshopAssignment} disabled={!assignmentForm.siteId || !assignmentForm.workshopId || !assignmentForm.startDate || !assignmentForm.endDate}>Assign workshop</button>
      </div>

      <div className="spacer" />
      <hr />

      <ProjectTrackingSection orderId={order.id} />
    </div>
  );
}
