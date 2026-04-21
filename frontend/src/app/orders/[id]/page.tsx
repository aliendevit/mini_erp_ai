'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useI18n } from '../../../lib/i18n';
import { apiGet, apiJson } from '../../../lib/api';

type Customer = { id: string; companyName: string };
type Employee = { id: string; firstName: string; lastName: string };

type Assignment = {
  id: string;
  employee: Employee;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
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
  assignments: Assignment[];
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

export default function OrderDetailPage() {
  const { messages: m } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState<Partial<Order>>(emptyOrder);
  const [siteForm, setSiteForm] = useState<Partial<Site>>(emptySite);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [assignSiteId, setAssignSiteId] = useState<string>('');
  const [assignEmployeeId, setAssignEmployeeId] = useState<string>('');

  const siteOptions = useMemo(() => order?.sites || [], [order]);

  async function load() {
    const [nextOrder, nextCustomers, nextEmployees] = await Promise.all([
      apiGet<Order>(`/orders/${id}`),
      apiGet<Customer[]>('/customers'),
      apiGet<Employee[]>('/employees'),
    ]);
    setOrder(nextOrder);
    setCustomers(nextCustomers);
    setEmployees(nextEmployees);
    setOrderForm({
      id: nextOrder.id,
      customerId: nextOrder.customerId,
      orderNumber: nextOrder.orderNumber || '',
      title: nextOrder.title,
      description: nextOrder.description || '',
      status: nextOrder.status || 'open',
      defaultHourlyRate: nextOrder.defaultHourlyRate || '',
    });

    const firstSite = nextOrder.sites[0]?.id || '';
    const firstEmployee = nextEmployees[0]?.id || '';
    setAssignSiteId((current) => current || firstSite);
    setAssignEmployeeId((current) => current || firstEmployee);
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

  async function addAssignment() {
    if (!assignSiteId) return alert(m.orderDetailPage.assignmentSiteRequired);
    if (!assignEmployeeId) return alert(m.orderDetailPage.assignmentEmployeeRequired);
    try {
      await apiJson('/assignments', 'POST', {
        siteId: assignSiteId,
        employeeId: assignEmployeeId,
        startDate: null,
        endDate: null,
        notes: null,
      });
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!confirm(m.common.deleteConfirm)) return;
    try {
      await apiJson(`/assignments/${assignmentId}`, 'DELETE');
      await load();
    } catch (error: any) {
      alert(error.message);
    }
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
          <label>{m.ordersPage.hourlyRate}</label>
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
            <th>{m.orderDetailPage.assignedEmployees}</th>
            <th style={{ width: 260 }}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {order.sites.map((site) => (
            <tr key={site.id}>
              <td>{site.siteName}</td>
              <td>{[site.street, [site.zipCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || m.common.none}</td>
              <td>
                {site.assignments.length > 0
                  ? site.assignments.map((assignment) => (
                      <div key={assignment.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>{assignment.employee.firstName} {assignment.employee.lastName}</span>
                        <button className="btn danger secondary" onClick={() => removeAssignment(assignment.id)}>{m.common.remove}</button>
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
          ))}
          {order.sites.length === 0 && (
            <tr><td colSpan={4} className="muted">{m.orderDetailPage.noSites}</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">{m.orderDetailPage.deleteSitesHint}</div>

      <div className="spacer" />
      <hr />

      <h3>{m.orderDetailPage.assignmentHeading}</h3>
      <div className="row">
        <div>
          <label>{m.common.site} *</label>
          <select value={assignSiteId} onChange={(event) => setAssignSiteId(event.target.value)}>
            {siteOptions.map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}
            {siteOptions.length === 0 && <option value="">{m.orderDetailPage.noSitesOption}</option>}
          </select>
        </div>
        <div>
          <label>{m.common.employee} *</label>
          <select value={assignEmployeeId} onChange={(event) => setAssignEmployeeId(event.target.value)}>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
            {employees.length === 0 && <option value="">{m.orderDetailPage.noEmployeesOption}</option>}
          </select>
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button className="btn primary" onClick={addAssignment} disabled={!assignSiteId || !assignEmployeeId}>{m.common.create}</button>
        </div>
      </div>

      <div className="spacer" />
      <div className="muted">{m.orderDetailPage.deleteAssignmentsHint}</div>
    </div>
  );
}
