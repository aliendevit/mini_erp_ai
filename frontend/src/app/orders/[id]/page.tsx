'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../../lib/api';

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
  defaultHourlyRate: ''
};

const emptySite: Partial<Site> = {
  siteName: '',
  street: '',
  zipCode: '',
  city: '',
  notes: '',
  isActive: true
};

export default function OrderDetailPage() {
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
    const [o, cs, es] = await Promise.all([
      apiGet<Order>(`/orders/${id}`),
      apiGet<Customer[]>('/customers'),
      apiGet<Employee[]>('/employees')
    ]);
    setOrder(o);
    setCustomers(cs);
    setEmployees(es);
    setOrderForm({
      id: o.id,
      customerId: o.customerId,
      orderNumber: o.orderNumber || '',
      title: o.title,
      description: o.description || '',
      status: o.status || 'open',
      defaultHourlyRate: o.defaultHourlyRate || ''
    });

    // defaults for assignment dropdowns
    const firstSite = o.sites[0]?.id || '';
    const firstEmp = es[0]?.id || '';
    setAssignSiteId((prev) => prev || firstSite);
    setAssignEmployeeId((prev) => prev || firstEmp);
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveOrder() {
    if (!orderForm.customerId) return alert('Bitte Kunde auswählen.');
    if (!orderForm.title?.trim()) return alert('Titel ist erforderlich.');

    try {
      await apiJson(`/orders/${id}`, 'PUT', {
        customerId: orderForm.customerId,
        orderNumber: orderForm.orderNumber || null,
        title: orderForm.title,
        description: orderForm.description || null,
        status: orderForm.status || 'open',
        defaultHourlyRate: orderForm.defaultHourlyRate || null,
        currency: 'EUR'
      });
      await load();
      alert('Gespeichert.');
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteOrder() {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/orders/${id}`, 'DELETE');
      router.push('/orders');
    } catch (e: any) {
      alert(e.message);
    }
  }

  function startNewSite() {
    setEditingSiteId(null);
    setSiteForm({ ...emptySite });
  }

  function startEditSite(s: Site) {
    setEditingSiteId(s.id);
    setSiteForm({
      id: s.id,
      siteName: s.siteName,
      street: s.street || '',
      zipCode: s.zipCode || '',
      city: s.city || '',
      notes: s.notes || '',
      isActive: s.isActive
    });
  }

  async function saveSite() {
    if (!siteForm.siteName?.trim()) return alert('Baustellenname ist erforderlich.');
    try {
      const payload = {
        orderId: id,
        siteName: siteForm.siteName,
        street: siteForm.street || null,
        zipCode: siteForm.zipCode || null,
        city: siteForm.city || null,
        notes: siteForm.notes || null,
        isActive: siteForm.isActive !== undefined ? Boolean(siteForm.isActive) : true
      };
      if (editingSiteId) {
        await apiJson(`/sites/${editingSiteId}`, 'PUT', payload);
      } else {
        await apiJson('/sites', 'POST', payload);
      }
      await load();
      startNewSite();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteSite(siteId: string) {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/sites/${siteId}`, 'DELETE');
      await load();
      if (editingSiteId === siteId) startNewSite();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function addAssignment() {
    if (!assignSiteId) return alert('Bitte Baustelle auswählen.');
    if (!assignEmployeeId) return alert('Bitte Mitarbeiter auswählen.');
    try {
      await apiJson('/assignments', 'POST', {
        siteId: assignSiteId,
        employeeId: assignEmployeeId,
        startDate: null,
        endDate: null,
        notes: null
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/assignments/${assignmentId}`, 'DELETE');
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!order) {
    return <div className="card"><div className="muted">Lade…</div></div>;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Auftrag: {order.title}</h2>
          <div className="muted">ID: {order.id}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/orders">Zurück</Link>
          <button className="btn danger" onClick={deleteOrder}>Auftrag löschen</button>
        </div>
      </div>

      <div className="spacer" />

      <h3>Auftrag bearbeiten</h3>
      <div className="row">
        <div>
          <label>Kunde *</label>
          <select value={orderForm.customerId || ''} onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            {customers.length === 0 && <option value="">(Bitte zuerst Kunden anlegen)</option>}
          </select>
        </div>
        <div>
          <label>Auftragsnummer</label>
          <input value={(orderForm.orderNumber as string) || ''} onChange={(e) => setOrderForm({ ...orderForm, orderNumber: e.target.value })} />
        </div>
        <div>
          <label>Status</label>
          <select value={orderForm.status || 'open'} onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value })}>
            <option value="open">offen</option>
            <option value="paused">pausiert</option>
            <option value="closed">geschlossen</option>
          </select>
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <label>Titel *</label>
          <input value={orderForm.title || ''} onChange={(e) => setOrderForm({ ...orderForm, title: e.target.value })} />
        </div>
        <div>
          <label>Standard-Stundensatz (€)</label>
          <input value={(orderForm.defaultHourlyRate as any) || ''} onChange={(e) => setOrderForm({ ...orderForm, defaultHourlyRate: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>Beschreibung</label>
        <textarea value={orderForm.description || ''} onChange={(e) => setOrderForm({ ...orderForm, description: e.target.value })} />
      </div>

      <div className="spacer" />
      <button className="btn primary" onClick={saveOrder}>Speichern</button>

      <div className="spacer" />
      <hr />

      <h3>Baustellen</h3>

      <div className="row">
        <div>
          <label>Baustellenname *</label>
          <input value={siteForm.siteName || ''} onChange={(e) => setSiteForm({ ...siteForm, siteName: e.target.value })} />
        </div>
        <div>
          <label>Straße</label>
          <input value={(siteForm.street as string) || ''} onChange={(e) => setSiteForm({ ...siteForm, street: e.target.value })} />
        </div>
        <div>
          <label>PLZ</label>
          <input value={(siteForm.zipCode as string) || ''} onChange={(e) => setSiteForm({ ...siteForm, zipCode: e.target.value })} />
        </div>
        <div>
          <label>Stadt</label>
          <input value={(siteForm.city as string) || ''} onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>Notizen</label>
        <textarea value={(siteForm.notes as string) || ''} onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })} />
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={saveSite}>{editingSiteId ? 'Speichern' : 'Baustelle anlegen'}</button>
        <button className="btn" onClick={startNewSite}>Neu</button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Baustelle</th>
            <th>Adresse</th>
            <th>Mitarbeiter</th>
            <th style={{ width: 260 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {order.sites.map((s) => (
            <tr key={s.id}>
              <td>{s.siteName}</td>
              <td>{[s.street, [s.zipCode, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</td>
              <td>
                {s.assignments.length > 0
                  ? s.assignments.map((a) => (
                      <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>{a.employee.firstName} {a.employee.lastName}</span>
                        <button className="btn danger secondary" onClick={() => removeAssignment(a.id)}>Entfernen</button>
                      </div>
                    ))
                  : '—'}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => startEditSite(s)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => deleteSite(s.id)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
          {order.sites.length === 0 && (
            <tr><td colSpan={4} className="muted">Keine Baustellen vorhanden.</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div className="muted">Hinweis: Löschen ist nur möglich, wenn keine Arbeitszeiten/Rechnungspositionen/Zuordnungen existieren (FK-Regeln).</div>

      <div className="spacer" />
      <hr />

      <h3>Mitarbeiter zuweisen</h3>
      <div className="row">
        <div>
          <label>Baustelle *</label>
          <select value={assignSiteId} onChange={(e) => setAssignSiteId(e.target.value)}>
            {siteOptions.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
            {siteOptions.length === 0 && <option value="">(Bitte zuerst Baustelle anlegen)</option>}
          </select>
        </div>
        <div>
          <label>Mitarbeiter *</label>
          <select value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            {employees.length === 0 && <option value="">(Bitte zuerst Mitarbeiter anlegen)</option>}
          </select>
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button className="btn primary" onClick={addAssignment} disabled={!assignSiteId || !assignEmployeeId}>Zuweisen</button>
        </div>
      </div>

      <div className="spacer" />
      <div className="muted">Hinweis: Eine Zuordnung kann nicht gelöscht werden, wenn bereits Arbeitszeiten für diese Baustelle erfasst wurden (FK-Regeln).</div>
    </div>
  );
}
