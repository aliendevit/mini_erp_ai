'use client';

import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../lib/i18n';
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
  const { messages: m } = useI18n();
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
      const nextState = await apiGet<SeqState>(`/settings/invoice-sequence?year=${year}`);
      setState(nextState);
      setValue(String(nextState.effectiveNextSeq));
    } catch (error: any) {
      setError(error?.message || m.invoiceSequence.loadError);
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
      const nextValue = Number(value);
      const payload = { year, nextSeq: Number.isFinite(nextValue) ? Math.floor(nextValue) : value };
      const nextState = await apiJson<SeqState>(`/settings/invoice-sequence`, 'PUT', payload);
      setState(nextState);
      setValue(String(nextState.effectiveNextSeq));
      setOk(m.invoiceSequence.saved);
    } catch (error: any) {
      setError(error?.message || m.invoiceSequence.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h2>{m.invoiceSequence.heading}</h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        {m.invoiceSequence.description}
      </div>

      <div className="row" style={{ alignItems: 'end' }}>
        <div>
          <label>{m.common.year}</label>
          <input value={String(year)} disabled />
        </div>

        <div>
          <label>{m.invoiceSequence.nextSeqLabel}</label>
          <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" disabled={loading || saving} />
        </div>

        <div>
          <label>{m.common.preview}</label>
          <input value={state?.effectiveInvoiceNumber || ''} disabled />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" type="button" onClick={save} disabled={loading || saving}>
            {saving ? `${m.common.save}...` : m.common.save}
          </button>
          <button className="btn" type="button" onClick={load} disabled={loading || saving}>
            {m.common.refresh}
          </button>
        </div>
      </div>

      {loading && <div className="muted" style={{ marginTop: 10 }}>{m.common.loading}</div>}
      {error && <div style={{ marginTop: 10 }}>{error}</div>}
      {ok && <div className="muted" style={{ marginTop: 10 }}>{ok}</div>}

      {state && (
        <div className="muted" style={{ marginTop: 10 }}>
          {m.invoiceSequence.dbNext}: {state.dbNextSeq}{' '}
          {state.configuredNextSeq ? `• ${m.invoiceSequence.configured}: ${state.configuredNextSeq}` : ''}
        </div>
      )}
    </div>
  );
}
