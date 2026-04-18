'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  defaultHourlyRate?: string | null;
};

const empty: Partial<Employee> = {
  firstName: '',
  lastName: '',
  birthDate: '',
  street: '',
  zipCode: '',
  city: '',
  phone: '',
  email: '',
  isActive: true,
  defaultHourlyRate: ''
};

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [form, setForm] = useState<Partial<Employee>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setItems(await apiGet<Employee[]>('/employees'));
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  function startNew() {
    setEditingId(null);
    setForm({ ...empty });
  }

  function startEdit(e: Employee) {
    setEditingId(e.id);
    setForm({ ...e, birthDate: e.birthDate ? e.birthDate.substring(0, 10) : '' });
  }

  async function save() {
    if (!form.firstName?.trim() || !form.lastName?.trim()) return alert('Vorname und Nachname sind erforderlich.');
    setLoading(true);
    try {
      const payload = {
        ...form,
        birthDate: form.birthDate ? new Date(form.birthDate as string).toISOString() : null
      };
      if (editingId) {
        await apiJson(`/employees/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/employees', 'POST', payload);
      }
      await load();
      startNew();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function del(id: string) {
    if (!confirm(DELETE_CONFIRM)) return;
    try {
      await apiJson(`/employees/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Mitarbeiter</h2>

      <div className="row">
        <div>
          <label>Vorname *</label>
          <input value={form.firstName || ''} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div>
          <label>Nachname *</label>
          <input value={form.lastName || ''} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div>
          <label>Geburtsdatum</label>
          <input type="date" value={(form.birthDate as string) || ''} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Telefon</label>
          <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label>E-Mail</label>
          <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label>Standard-Stundensatz (€)</label>
          <input value={(form.defaultHourlyRate as any) || ''} onChange={(e) => setForm({ ...form, defaultHourlyRate: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Straße</label>
          <input value={form.street || ''} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        </div>
        <div>
          <label>PLZ</label>
          <input value={form.zipCode || ''} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
        </div>
        <div>
          <label>Stadt</label>
          <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save} disabled={loading}>{editingId ? 'Speichern' : 'Anlegen'}</button>
        <button className="btn" onClick={startNew} disabled={loading}>Neu</button>
      </div>

      <div className="spacer" />

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kontakt</th>
            <th>Stundensatz</th>
            <th style={{ width: 220 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.firstName} {it.lastName}</td>
              <td>{it.phone || '—'}</td>
              <td>{it.defaultHourlyRate ? `${it.defaultHourlyRate} €` : '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => startEdit(it)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => del(it.id)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">Keine Mitarbeiter vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
