'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API_BASE, apiGet, apiJson } from '../../lib/api';

type Customer = {
  id: string;
  companyName: string;
};

type ProposalMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ProposalSite = {
  siteName: string;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  notes?: string | null;
  requiredSkills: string[];
  requiredCertifications: string[];
  estimatedHours?: number | null;
};

type RecommendationEmployee = {
  employeeId: string;
  employeeName: string;
  score: number;
  matchedSkills: string[];
  matchedCertifications: string[];
  scoreBreakdown: {
    skills: number;
    capacity: number;
    history: number;
  };
  capacity: {
    weeklyCapacityHours: number;
    capacityDefaulted: boolean;
    loggedHours: number;
    assignmentPressureHours: number;
    remainingHours: number;
  };
  recentEntries: number;
  activeAssignmentCount: number;
};

type RecommendationSite = {
  siteIndex: number;
  siteName: string;
  requiredSkills: string[];
  requiredCertifications: string[];
  estimatedHours: number;
  recommendations: RecommendationEmployee[];
  excludedEmployees: Array<{
    employeeId: string;
    employeeName: string;
    reason: string;
    details: string;
  }>;
};

type RecommendationPayload = {
  window: {
    startDate: string;
    endDate: string;
    weeks: number;
  };
  sites: RecommendationSite[];
  pricePreview?: number | null;
  currency?: string | null;
};

type ProposalDraft = {
  id: string;
  status: string;
  customerCompanyName?: string | null;
  customerStreet?: string | null;
  customerZipCode?: string | null;
  customerCity?: string | null;
  customerCountry?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  summary?: string | null;
  orderTitle?: string | null;
  orderDescription?: string | null;
  proposedSites: ProposalSite[];
  requiredSkills: string[];
  requiredCertifications: string[];
  preferredStartDate?: string | null;
  preferredEndDate?: string | null;
  estimatedHours?: string | number | null;
  estimatedPrice?: string | number | null;
  currency?: string | null;
  recommendedTeam?: RecommendationPayload | null;
  convertedCustomerId?: string | null;
  convertedOrderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  messages?: ProposalMessage[];
};

const emptyDraft: Partial<ProposalDraft> = {
  status: 'intake',
  customerCompanyName: '',
  customerStreet: '',
  customerZipCode: '',
  customerCity: '',
  customerCountry: 'DE',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  summary: '',
  orderTitle: '',
  orderDescription: '',
  proposedSites: [],
  requiredSkills: [],
  requiredCertifications: [],
  preferredStartDate: '',
  preferredEndDate: '',
  estimatedHours: '',
  estimatedPrice: '',
  currency: 'EUR',
  recommendedTeam: null,
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

function normalizeRecommendations(value: unknown): RecommendationPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RecommendationPayload>;
  if (!candidate.window || typeof candidate.window !== 'object') return null;
  if (!Array.isArray(candidate.sites)) return null;

  const { startDate, endDate, weeks } = candidate.window as RecommendationPayload['window'];
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || typeof weeks !== 'number') return null;

  return candidate as RecommendationPayload;
}

async function safeMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.message) return String(data.message);
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

export default function AIIntakePage() {
  const [intakes, setIntakes] = useState<ProposalDraft[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Partial<ProposalDraft>>(emptyDraft);
  const [messages, setMessages] = useState<ProposalMessage[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationPayload | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState('');
  const [siteSelections, setSiteSelections] = useState<Record<number, string[]>>({});
  const [existingCustomerId, setExistingCustomerId] = useState('');
  const [lastResult, setLastResult] = useState<{ orderId?: string; customerId?: string } | null>(null);

  async function loadLists(preferredId?: string) {
    const [intakeRows, customerRows] = await Promise.all([
      apiGet<ProposalDraft[]>('/ai/intakes'),
      apiGet<Customer[]>('/customers'),
    ]);
    setIntakes(intakeRows);
    setCustomers(customerRows);
    const nextId = preferredId || selectedId || intakeRows[0]?.id || '';
    if (nextId) {
      await loadIntake(nextId);
    } else {
      setSelectedId('');
      setDraft({ ...emptyDraft });
      setMessages([]);
      setRecommendations(null);
      setExistingCustomerId('');
    }
  }

  async function loadIntake(id: string) {
    const intake = await apiGet<ProposalDraft>(`/ai/intakes/${id}`);
    setSelectedId(id);
    setDraft({
      ...emptyDraft,
      ...intake,
      proposedSites: intake.proposedSites || [],
      requiredSkills: intake.requiredSkills || [],
      requiredCertifications: intake.requiredCertifications || [],
      currency: intake.currency || 'EUR',
    });
    setMessages(intake.messages || []);
    const nextRecommendations = normalizeRecommendations(intake.recommendedTeam);
    setRecommendations(nextRecommendations);
    setSiteSelections({});
    setExistingCustomerId(intake.convertedCustomerId || '');
    setLastResult(
      intake.convertedOrderId ? { orderId: intake.convertedOrderId, customerId: intake.convertedCustomerId || undefined } : null
    );
  }

  useEffect(() => {
    loadLists().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recommendations) return;
    setSiteSelections((current) => {
      const next = { ...current };
      for (const site of recommendations.sites) {
        if (!next[site.siteIndex] || next[site.siteIndex].length === 0) {
          next[site.siteIndex] = site.recommendations[0] ? [site.recommendations[0].employeeId] : [];
        }
      }
      return next;
    });
  }, [recommendations]);

  const siteCount = useMemo(() => (draft.proposedSites || []).length, [draft.proposedSites]);

  async function createIntake() {
    setBusy(true);
    try {
      const created = await createIntakeRecord();
      await loadLists(created.id);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createIntakeRecord(): Promise<ProposalDraft> {
    return apiJson<ProposalDraft>('/ai/intakes', 'POST', {
      customerCompanyName: draft.customerCompanyName || null,
      orderTitle: draft.orderTitle || null,
    });
  }

  async function saveDraft() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const payload = {
        ...draft,
        estimatedHours: draft.estimatedHours === '' ? null : Number(draft.estimatedHours),
        estimatedPrice: draft.estimatedPrice === '' ? null : Number(draft.estimatedPrice),
      };
      const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}`, 'PUT', payload);
      setDraft({ ...emptyDraft, ...updated, proposedSites: updated.proposedSites || [] });
      setMessages(updated.messages || []);
      await loadLists(selectedId);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    let intakeId = selectedId;
    const content = chatInput.trim();
    if (!content) return;
    setChatError('');

    if (!intakeId) {
      setBusy(true);
      try {
        const created = await createIntakeRecord();
        intakeId = created.id;
        await loadLists(intakeId);
      } catch (error: any) {
        setChatError(error.message || 'Intake konnte nicht angelegt werden.');
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    const userMessage: ProposalMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);
    setChatInput('');
    setStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/ai/intakes/${intakeId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        throw new Error(await safeMessage(res));
      }
      if (!res.body) {
        throw new Error('Streaming wird von diesem Browser nicht unterstuetzt.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let full = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((item) => (item.id === assistantId ? { ...item, content: full } : item))
        );
      }

      const normalized = full.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('[ERROR]')) {
        setChatError(full.replace(/^\s*\[ERROR\]\s*/, '').trim() || 'Gemini-Antwort fehlgeschlagen.');
        return;
      }

      await loadIntake(intakeId);
      await loadLists(intakeId);
    } catch (error: any) {
      setChatError(error.message || 'Nachricht konnte nicht gesendet werden.');
      await loadIntake(intakeId).catch(() => undefined);
    } finally {
      setStreaming(false);
    }
  }

  async function generateProposal() {
    if (!selectedId) return alert('Bitte zuerst einen Intake anlegen.');
    setBusy(true);
    try {
      const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}/proposal`, 'POST');
      setDraft({ ...emptyDraft, ...updated, proposedSites: updated.proposedSites || [] });
      setMessages(updated.messages || []);
      setRecommendations(normalizeRecommendations(updated.recommendedTeam));
      await loadLists(selectedId);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function recommendAssignments() {
    if (!selectedId) return alert('Bitte zuerst einen Intake anlegen.');
    await saveDraft();
    setBusy(true);
    try {
      const response = await apiJson<{ proposal: ProposalDraft; recommendations: RecommendationPayload }>(
        `/ai/intakes/${selectedId}/recommend-assignments`,
        'POST'
      );
      setDraft({
        ...emptyDraft,
        ...response.proposal,
        proposedSites: response.proposal.proposedSites || [],
      });
      setRecommendations(normalizeRecommendations(response.recommendations));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal() {
    if (!selectedId) return alert('Bitte zuerst einen Intake anlegen.');
    await saveDraft();
    setBusy(true);
    try {
      const response = await apiJson<{ proposal: ProposalDraft; result: { orderId: string; customerId: string } }>(
        `/ai/intakes/${selectedId}/confirm`,
        'POST',
        {
          existingCustomerId: existingCustomerId || null,
          manualEstimatedPrice:
            draft.estimatedPrice === '' || draft.estimatedPrice == null ? null : Number(draft.estimatedPrice),
          siteAssignments: Object.entries(siteSelections).map(([siteIndex, employeeIds]) => ({
            siteIndex: Number(siteIndex),
            employeeIds,
          })),
        }
      );
      setDraft({
        ...emptyDraft,
        ...response.proposal,
        proposedSites: response.proposal.proposedSites || [],
      });
      setLastResult(response.result);
      alert('Vorschlag wurde in Kunden-/Auftragsdaten umgewandelt.');
      await loadLists(selectedId);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  function updateSite(index: number, patch: Partial<ProposalSite>) {
    setDraft((current) => {
      const nextSites = [...(current.proposedSites || [])];
      nextSites[index] = { ...nextSites[index], ...patch };
      return { ...current, proposedSites: nextSites };
    });
  }

  function addSite() {
    setDraft((current) => ({
      ...current,
      proposedSites: [
        ...(current.proposedSites || []),
        {
          siteName: '',
          street: '',
          zipCode: '',
          city: '',
          notes: '',
          requiredSkills: [],
          requiredCertifications: [],
          estimatedHours: null,
        },
      ],
    }));
  }

  function removeSite(index: number) {
    setDraft((current) => ({
      ...current,
      proposedSites: (current.proposedSites || []).filter((_, itemIndex) => itemIndex !== index),
    }));
    setSiteSelections((current) => {
      const next: Record<number, string[]> = {};
      Object.entries(current).forEach(([key, value]) => {
        const numericKey = Number(key);
        if (numericKey < index) next[numericKey] = value;
        if (numericKey > index) next[numericKey - 1] = value;
      });
      return next;
    });
  }

  function toggleEmployee(siteIndex: number, employeeId: string) {
    setSiteSelections((current) => {
      const currentSelection = current[siteIndex] || [];
      const exists = currentSelection.includes(employeeId);
      return {
        ...current,
        [siteIndex]: exists
          ? currentSelection.filter((value) => value !== employeeId)
          : [...currentSelection, employeeId],
      };
    });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'start' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <h2>AI Intake</h2>
          <button className="btn primary" onClick={createIntake} disabled={busy || streaming}>
            Neu
          </button>
        </div>
        <div className="spacer" />
        <div className="muted">Chat -&gt; Vorschlag -&gt; Team -&gt; Auftragsanlage</div>
        <div className="spacer" />
        <div style={{ display: 'grid', gap: 8 }}>
          {intakes.map((item) => (
            <button
              key={item.id}
              className="btn"
              style={{
                textAlign: 'left',
                borderColor: item.id === selectedId ? 'rgba(125,180,255,0.7)' : undefined,
              }}
              onClick={() => loadIntake(item.id).catch((error) => alert(error.message))}
            >
              <div style={{ fontWeight: 700 }}>{item.orderTitle || 'Unbenannter Intake'}</div>
              <div className="muted">{item.customerCompanyName || 'Kein Kunde'}</div>
              <div className="muted">Status: {item.status}</div>
            </button>
          ))}
          {intakes.length === 0 && <div className="muted">Noch keine Intakes vorhanden.</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>Konversation</h2>
              <div className="muted">Erfasste Anforderungen mit Gemini-Unterstuetzung</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={generateProposal} disabled={!selectedId || busy || streaming}>
                Vorschlag erzeugen
              </button>
              <button className="btn" onClick={saveDraft} disabled={!selectedId || busy || streaming}>
                Entwurf speichern
              </button>
            </div>
          </div>

          <div className="spacer" />
          <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {messages.map((message) => (
              <div
                key={message.id}
                className="card"
                style={{
                  background: message.role === 'assistant' ? 'rgba(125,180,255,0.08)' : 'transparent',
                }}
              >
                <div style={{ fontWeight: 700 }}>{message.role === 'assistant' ? 'Assistent' : 'Manager'}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
              </div>
            ))}
            {messages.length === 0 && <div className="muted">Noch keine Unterhaltung.</div>}
          </div>

          <div className="spacer" />
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Neue Nachricht an den Intake-Assistenten..."
          />
          {chatError && (
            <>
              <div className="spacer" />
              <div className="card" style={{ borderColor: 'rgba(255,80,80,0.5)', color: '#b91c1c' }}>
                {chatError}
              </div>
            </>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={sendMessage} disabled={busy || streaming || !chatInput.trim()}>
            {streaming ? 'Streaming...' : 'Nachricht senden'}
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>Vorschlag</h2>
              <div className="muted">Manuell pruefen und korrigieren, bevor Daten angelegt werden.</div>
            </div>
            <div className="muted">Status: {draft.status || 'intake'}</div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>Firmenname</label>
              <input
                value={draft.customerCompanyName || ''}
                onChange={(event) => setDraft((current) => ({ ...current, customerCompanyName: event.target.value }))}
              />
            </div>
            <div>
              <label>Kontaktname</label>
              <input
                value={draft.contactName || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactName: event.target.value }))}
              />
            </div>
            <div>
              <label>Kontakttelefon</label>
              <input
                value={draft.contactPhone || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactPhone: event.target.value }))}
              />
            </div>
            <div>
              <label>Kontakt-E-Mail</label>
              <input
                value={draft.contactEmail || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactEmail: event.target.value }))}
              />
            </div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>Auftragstitel</label>
              <input
                value={draft.orderTitle || ''}
                onChange={(event) => setDraft((current) => ({ ...current, orderTitle: event.target.value }))}
              />
            </div>
            <div>
              <label>Zeitraum Start</label>
              <input
                type="date"
                value={draft.preferredStartDate ? String(draft.preferredStartDate).substring(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preferredStartDate: event.target.value || null }))
                }
              />
            </div>
            <div>
              <label>Zeitraum Ende</label>
              <input
                type="date"
                value={draft.preferredEndDate ? String(draft.preferredEndDate).substring(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preferredEndDate: event.target.value || null }))
                }
              />
            </div>
            <div>
              <label>Gesamtstunden</label>
              <input
                value={draft.estimatedHours ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, estimatedHours: event.target.value }))}
              />
            </div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>Benoetigte Skills</label>
              <textarea
                value={listText(draft.requiredSkills)}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, requiredSkills: parseList(event.target.value) }))
                }
              />
            </div>
            <div>
              <label>Benoetigte Zertifikate</label>
              <textarea
                value={listText(draft.requiredCertifications)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    requiredCertifications: parseList(event.target.value),
                  }))
                }
              />
            </div>
          </div>

          <div className="spacer" />
          <div>
            <label>Zusammenfassung</label>
            <textarea
              value={draft.summary || ''}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
            />
          </div>

          <div className="spacer" />
          <div>
            <label>Auftragsbeschreibung</label>
            <textarea
              value={draft.orderDescription || ''}
              onChange={(event) => setDraft((current) => ({ ...current, orderDescription: event.target.value }))}
            />
          </div>

          <div className="spacer" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h2>Baustellen</h2>
            <button className="btn" onClick={addSite}>Baustelle hinzufuegen</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.proposedSites || []).map((site, index) => (
              <div key={`${site.siteName}-${index}`} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>Baustelle {index + 1}</div>
                  <button className="btn danger" onClick={() => removeSite(index)}>Entfernen</button>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>Name</label>
                    <input
                      value={site.siteName || ''}
                      onChange={(event) => updateSite(index, { siteName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>Strasse</label>
                    <input
                      value={site.street || ''}
                      onChange={(event) => updateSite(index, { street: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>PLZ</label>
                    <input
                      value={site.zipCode || ''}
                      onChange={(event) => updateSite(index, { zipCode: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>Stadt</label>
                    <input
                      value={site.city || ''}
                      onChange={(event) => updateSite(index, { city: event.target.value })}
                    />
                  </div>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>Skills</label>
                    <textarea
                      value={listText(site.requiredSkills)}
                      onChange={(event) => updateSite(index, { requiredSkills: parseList(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label>Zertifikate</label>
                    <textarea
                      value={listText(site.requiredCertifications)}
                      onChange={(event) =>
                        updateSite(index, { requiredCertifications: parseList(event.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label>Stunden</label>
                    <input
                      value={site.estimatedHours ?? ''}
                      onChange={(event) =>
                        updateSite(index, {
                          estimatedHours: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="spacer" />
                <label>Notizen</label>
                <textarea
                  value={site.notes || ''}
                  onChange={(event) => updateSite(index, { notes: event.target.value })}
                />
              </div>
            ))}
            {siteCount === 0 && <div className="muted">Noch keine Baustellen im Vorschlag.</div>}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>Personalvorschlaege</h2>
              <div className="muted">Deterministische Auswahl nach Skills, Kapazitaet und Historie.</div>
            </div>
            <button className="btn primary" onClick={recommendAssignments} disabled={!selectedId || busy || streaming}>
              Empfehlungen berechnen
            </button>
          </div>

          {recommendations ? (
            <>
              <div className="spacer" />
              <div className="muted">
                Zeitraum: {recommendations.window.startDate.substring(0, 10)} bis{' '}
                {recommendations.window.endDate.substring(0, 10)} ({recommendations.window.weeks} Wochen)
              </div>
              {recommendations.pricePreview != null && (
                <div className="muted">
                  Preisvorschau: {recommendations.pricePreview} {recommendations.currency || 'EUR'}
                </div>
              )}
              <div className="spacer" />
              <div style={{ display: 'grid', gap: 12 }}>
                {recommendations.sites.map((site) => (
                  <div key={site.siteIndex} className="card">
                    <div style={{ fontWeight: 700 }}>{site.siteName}</div>
                    <div className="muted">
                      Stunden: {site.estimatedHours} | Skills: {listText(site.requiredSkills)} | Zertifikate:{' '}
                      {listText(site.requiredCertifications)}
                    </div>
                    <div className="spacer" />
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Auswahl</th>
                          <th>Mitarbeiter</th>
                          <th>Score</th>
                          <th>Grund</th>
                          <th>Kapazitaet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {site.recommendations.map((employee) => (
                          <tr key={employee.employeeId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={(siteSelections[site.siteIndex] || []).includes(employee.employeeId)}
                                onChange={() => toggleEmployee(site.siteIndex, employee.employeeId)}
                              />
                            </td>
                            <td>{employee.employeeName}</td>
                            <td>{employee.score}</td>
                            <td>
                              Skills: {listText(employee.matchedSkills)}
                              <br />
                              Zertifikate: {listText(employee.matchedCertifications)}
                              <br />
                              Historie: {employee.recentEntries} Eintraege
                            </td>
                            <td>
                              Frei: {employee.capacity.remainingHours}h
                              {employee.capacity.capacityDefaulted ? ' (Default 40h)' : ''}
                              <br />
                              Gebucht: {employee.capacity.loggedHours}h
                              <br />
                              Druck aus Zuweisungen: {employee.capacity.assignmentPressureHours}h
                            </td>
                          </tr>
                        ))}
                        {site.recommendations.length === 0 && (
                          <tr>
                            <td colSpan={5} className="muted">Keine geeigneten Mitarbeiter gefunden.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {site.excludedEmployees.length > 0 && (
                      <>
                        <div className="spacer" />
                        <div className="muted">
                          Ausgeschlossen: {site.excludedEmployees.map((employee) => `${employee.employeeName} (${employee.details})`).join(', ')}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="spacer" />
              <div className="muted">Noch keine Empfehlungen berechnet.</div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Bestaetigung</h2>
          <div className="row">
            <div>
              <label>Bestehenden Kunden verwenden (optional)</label>
              <select value={existingCustomerId} onChange={(event) => setExistingCustomerId(event.target.value)}>
                <option value="">Neuen Kunden aus Vorschlag anlegen</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Geschaetzter Preis</label>
              <input
                value={draft.estimatedPrice ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, estimatedPrice: event.target.value }))}
              />
            </div>
            <div>
              <label>Waehrung</label>
              <input
                value={draft.currency || 'EUR'}
                onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}
              />
            </div>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={confirmProposal} disabled={!selectedId || busy || streaming}>
            Vorschlag in Auftrag umwandeln
          </button>
          {lastResult?.orderId && (
            <>
              <div className="spacer" />
              <div className="muted">
                Angelegt: <Link href={`/orders/${lastResult.orderId}`}>Auftrag oeffnen</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
