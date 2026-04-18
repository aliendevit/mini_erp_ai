'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiJson, DELETE_CONFIRM } from '../../lib/api';

type AvailabilityBlock = {
  id?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reason?: string | null;
};

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
  weeklyCapacityHours?: string | null;
  skills: string[];
  certifications: string[];
  availabilityBlocks: AvailabilityBlock[];
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
  defaultHourlyRate: '',
  weeklyCapacityHours: '40',
  skills: [],
  certifications: [],
  availabilityBlocks: [],
};

function parseList(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(values?: string[] | null): string {
  return (values || []).join(', ');
}

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [form, setForm] = useState<Partial<Employee>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setItems(await apiGet<Employee[]>('/employees'));
  }

  useEffect(() => {
    load().catch((error) => alert(error.message));
  }, []);

  function startNew() {
    setEditingId(null);
    setForm({ ...empty, availabilityBlocks: [] });
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setForm({
      ...employee,
      birthDate: employee.birthDate ? employee.birthDate.substring(0, 10) : '',
      weeklyCapacityHours: employee.weeklyCapacityHours || '40',
      availabilityBlocks: (employee.availabilityBlocks || []).map((block) => ({
        ...block,
        startDate: block.startDate ? block.startDate.substring(0, 10) : '',
        endDate: block.endDate ? block.endDate.substring(0, 10) : '',
      })),
    });
  }

  function updateAvailability(index: number, patch: Partial<AvailabilityBlock>) {
    setForm((current) => {
      const next = [...(current.availabilityBlocks || [])];
      next[index] = { ...next[index], ...patch };
      return { ...current, availabilityBlocks: next };
    });
  }

  function addAvailability() {
    setForm((current) => ({
      ...current,
      availabilityBlocks: [...(current.availabilityBlocks || []), { startDate: '', endDate: '', reason: '' }],
    }));
  }

  function removeAvailability(index: number) {
    setForm((current) => ({
      ...current,
      availabilityBlocks: (current.availabilityBlocks || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function save() {
    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      return alert('Vorname und Nachname sind erforderlich.');
    }
    const invalidBlock = (form.availabilityBlocks || []).find(
      (block) => (block.startDate && !block.endDate) || (!block.startDate && block.endDate)
    );
    if (invalidBlock) {
      return alert('Jeder Abwesenheitsblock braucht Start- und Enddatum.');
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        birthDate: form.birthDate ? new Date(form.birthDate as string).toISOString() : null,
        defaultHourlyRate: form.defaultHourlyRate === '' ? null : Number(form.defaultHourlyRate),
        weeklyCapacityHours: form.weeklyCapacityHours === '' ? null : Number(form.weeklyCapacityHours),
        skills: form.skills || [],
        certifications: form.certifications || [],
        availabilityBlocks: (form.availabilityBlocks || [])
          .filter((block) => block.startDate && block.endDate)
          .map((block) => ({
            startDate: new Date(block.startDate as string).toISOString(),
            endDate: new Date(block.endDate as string).toISOString(),
            reason: block.reason || null,
          })),
      };
      if (editingId) {
        await apiJson(`/employees/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/employees', 'POST', payload);
      }
      await load();
      startNew();
    } catch (error: any) {
      alert(error.message);
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
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="card">
      <h2>Mitarbeiter</h2>

      <div className="row">
        <div>
          <label>Vorname *</label>
          <input value={form.firstName || ''} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        </div>
        <div>
          <label>Nachname *</label>
          <input value={form.lastName || ''} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </div>
        <div>
          <label>Geburtsdatum</label>
          <input type="date" value={(form.birthDate as string) || ''} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Telefon</label>
          <input value={form.phone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </div>
        <div>
          <label>E-Mail</label>
          <input value={form.email || ''} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </div>
        <div>
          <label>Standard-Stundensatz (EUR)</label>
          <input
            value={(form.defaultHourlyRate as string) || ''}
            onChange={(event) => setForm({ ...form, defaultHourlyRate: event.target.value })}
          />
        </div>
        <div>
          <label>Wochenkapazitaet (h)</label>
          <input
            value={(form.weeklyCapacityHours as string) || ''}
            onChange={(event) => setForm({ ...form, weeklyCapacityHours: event.target.value })}
          />
        </div>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Strasse</label>
          <input value={form.street || ''} onChange={(event) => setForm({ ...form, street: event.target.value })} />
        </div>
        <div>
          <label>PLZ</label>
          <input value={form.zipCode || ''} onChange={(event) => setForm({ ...form, zipCode: event.target.value })} />
        </div>
        <div>
          <label>Stadt</label>
          <input value={form.city || ''} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Skills</label>
          <textarea
            value={listText(form.skills)}
            onChange={(event) => setForm({ ...form, skills: parseList(event.target.value) })}
          />
        </div>
        <div>
          <label>Zertifikate</label>
          <textarea
            value={listText(form.certifications)}
            onChange={(event) => setForm({ ...form, certifications: parseList(event.target.value) })}
          />
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2>Abwesenheitsbloecke</h2>
        <button className="btn" onClick={addAvailability}>Block hinzufuegen</button>
      </div>
      <div className="spacer" />
      <div style={{ display: 'grid', gap: 10 }}>
        {(form.availabilityBlocks || []).map((block, index) => (
          <div key={`${block.id || 'new'}-${index}`} className="card">
            <div className="row">
              <div>
                <label>Start</label>
                <input
                  type="date"
                  value={block.startDate || ''}
                  onChange={(event) => updateAvailability(index, { startDate: event.target.value })}
                />
              </div>
              <div>
                <label>Ende</label>
                <input
                  type="date"
                  value={block.endDate || ''}
                  onChange={(event) => updateAvailability(index, { endDate: event.target.value })}
                />
              </div>
              <div>
                <label>Grund</label>
                <input
                  value={block.reason || ''}
                  onChange={(event) => updateAvailability(index, { reason: event.target.value })}
                />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button className="btn danger" onClick={() => removeAvailability(index)}>Entfernen</button>
              </div>
            </div>
          </div>
        ))}
        {(form.availabilityBlocks || []).length === 0 && <div className="muted">Keine Abwesenheitsbloecke.</div>}
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
            <th>Skills</th>
            <th>Kapazitaet</th>
            <th style={{ width: 220 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.firstName} {item.lastName}
                <div className="muted">{listText(item.certifications)}</div>
              </td>
              <td>{item.phone || item.email || '-'}</td>
              <td>{listText(item.skills) || '-'}</td>
              <td>
                {item.weeklyCapacityHours || '40'} h/Woche
                <div className="muted">{item.availabilityBlocks.length} Bloecke</div>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => startEdit(item)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => del(item.id)}>Loeschen</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">Keine Mitarbeiter vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
