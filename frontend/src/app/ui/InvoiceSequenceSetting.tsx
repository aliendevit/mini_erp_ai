'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiJson } from '../../lib/api';

type SeqState = {
  year: number;
  dbNextSeq: number;
  configuredNextSeq: number | null;
  effectiveNextSeq: number;
  effectiveInvoiceNumber: string;
};

function currentYear() {
  return new Date().getFullYear();
}

export function InvoiceSequenceSetting() {
  const year = useMemo(() => currentYear(), []);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SeqState | null>(null);
  const [value, setValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [ok, setOk] = useState<string>('');

  async function load() {
    setLoading(true);
    setError('');
    setOk('');
    try {
      const s = await apiGet<SeqState>(`/settings/invoice-sequence?year=${year}`);
      setState(s);
      setValue(String(s.effectiveNextSeq));
    } catch (e: any) {
      setError(e?.message || 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setOk('');
    try {
      const n = Number(value);
      const payload = { year, nextSeq: Number.isFinite(n) ? Math.floor(n) : value };
      const s = await apiJson<SeqState>(`/settings/invoice-sequence`, 'PUT', payload);
      setState(s);
      setValue(String(s.effectiveNextSeq));
      setOk('Gespeichert.');
    } catch (e: any) {
      setError(e?.message || 'Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h2>Nächste Rechnungsnummer</h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        Setze hier bei Bedarf die nächste Seriennummer für dieses Jahr (z.B. wenn bisher manuell nummeriert wurde).
        Kleinere/ungültige Werte werden ignoriert.
      </div>

      <div className="row" style={{ alignItems: 'end' }}>
        <div>
          <label>Jahr</label>
          <input value={String(year)} disabled />
        </div>

        <div>
          <label>Nächste Seriennummer (XXXX)</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            disabled={loading || saving}
          />
        </div>

        <div>
          <label>Vorschau</label>
          <input value={state?.effectiveInvoiceNumber || ''} disabled />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" type="button" onClick={save} disabled={loading || saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button className="btn" type="button" onClick={load} disabled={loading || saving}>
            Aktualisieren
          </button>
        </div>
      </div>

      {loading && <div className="muted" style={{ marginTop: 10 }}>Lade…</div>}
      {error && <div style={{ marginTop: 10 }}>{error}</div>}
      {ok && <div className="muted" style={{ marginTop: 10 }}>{ok}</div>}

      {state && (
        <div className="muted" style={{ marginTop: 10 }}>
          DB-Nächste: {state.dbNextSeq} {state.configuredNextSeq ? `• Gesetzt: ${state.configuredNextSeq}` : ''}
        </div>
      )}
    </div>
  );
}
