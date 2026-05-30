'use client';

import { useEffect, useState } from 'react';

import { apiGet, apiJson } from '../../lib/api';

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

type FormState = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  specialties: string;
  notes: string;
  availabilityStatus: 'available' | 'not_available';
  availabilityNote: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  specialties: '',
  notes: '',
  availabilityStatus: 'available',
  availabilityNote: '',
  isActive: true,
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

export default function WorkshopsPage() {
  const [items, setItems] = useState<Workshop[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await apiGet<Workshop[]>('/workshops'));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(item: Workshop) {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      contactName: item.contactName || '',
      phone: item.phone || '',
      email: item.email || '',
      specialties: listText(item.specialties),
      notes: item.notes || '',
      availabilityStatus: item.availabilityStatus || 'available',
      availabilityNote: item.availabilityNote || '',
      isActive: item.isActive,
    });
  }

  async function save() {
    if (!form.name.trim()) return alert('Workshop name is required.');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        contactName: form.contactName || null,
        phone: form.phone || null,
        email: form.email || null,
        specialties: parseList(form.specialties),
        notes: form.notes || null,
        availabilityStatus: form.availabilityStatus,
        availabilityNote: form.availabilityNote || null,
        isActive: form.isActive,
      };
      if (editingId) {
        await apiJson(`/workshops/${editingId}`, 'PUT', payload);
      } else {
        await apiJson('/workshops', 'POST', payload);
      }
      await load();
      startNew();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this workshop? Existing site assignments must be removed first.')) return;
    try {
      await apiJson(`/workshops/${id}`, 'DELETE');
      await load();
      if (editingId === id) startNew();
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="entity-page workshops-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">Partners</div>
          <h1>Workshop Partners</h1>
          <p>Manage trusted subcontractor workshops, trade coverage, and availability status.</p>
        </div>
        <div className="entity-hero-stats">
            <div className="entity-stat"><strong>{items.length}</strong><span>Workshops</span></div>
            <div className="entity-stat"><strong>{items.filter((item) => item.availabilityStatus !== 'not_available').length}</strong><span>Available</span></div>
            <div className="entity-stat"><strong>{items.filter((item) => item.isActive).length}</strong><span>Active</span></div>
        </div>
      </section>

      <div className="card entity-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Workshop Partners</h2>
          <div className="muted">Manage trusted subcontractor workshops and their trade specialties.</div>
        </div>
        <button className="btn" onClick={startNew}>New workshop</button>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Name *</label>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div>
          <label>Contact person</label>
          <input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
        </div>
        <div>
          <label>Phone</label>
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </div>
        <div>
          <label>Email</label>
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </div>
      </div>

      <div className="spacer" />
      <div className="row">
        <div>
          <label>Specialties / trades</label>
          <textarea value={form.specialties} onChange={(event) => setForm({ ...form, specialties: event.target.value })} placeholder="painting, waterproofing, tiles" />
        </div>
        <div>
          <label>Notes</label>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
        <div>
          <label>Availability</label>
          <select value={form.availabilityStatus} onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value as 'available' | 'not_available' })}>
            <option value="available">Available</option>
            <option value="not_available">Not available</option>
          </select>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'end' }}>
          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          Active
        </label>
      </div>

      <div className="spacer" />
      <div>
        <label>Availability note</label>
        <input value={form.availabilityNote} onChange={(event) => setForm({ ...form, availabilityNote: event.target.value })} placeholder="e.g. busy until next week" />
      </div>

      <div className="spacer" />
      <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save workshop' : 'Create workshop'}</button>

      <div className="spacer" />
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Contact</th>
            <th>Specialties</th>
            <th>Status</th>
            <th style={{ width: 220 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                {[item.contactName, item.phone, item.email].filter(Boolean).join(' | ') || 'None'}
              </td>
              <td>{listText(item.specialties) || 'None'}</td>
              <td>
                <div>{item.isActive ? 'Active' : 'Inactive'}</div>
                <div style={{ color: item.availabilityStatus === 'not_available' ? '#ff6b6b' : '#39d98a', fontWeight: 700 }}>
                  {item.availabilityStatus === 'not_available' ? 'Not available' : 'Available'}
                </div>
                {item.availabilityNote && <div className="muted">{item.availabilityNote}</div>}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => startEdit(item)}>Edit</button>
                  <button className="btn danger" onClick={() => remove(item.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {!loading && items.length === 0 && <tr><td colSpan={5} className="muted">No workshops yet.</td></tr>}
          {loading && <tr><td colSpan={5} className="muted">Loading...</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}
