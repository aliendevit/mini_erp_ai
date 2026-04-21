'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, apiGet, apiJson } from '../../lib/api';
import { type BrowserSpeechRecognition, getSpeechRecognitionCtor, isSpeechRecognitionSupported, localeToSpeechRecognitionLang } from '../../lib/browser-speech';
import { type NativeAudioRecordingSession, isNativeAudioRecordingSupported, startNativeAudioRecording } from '../../lib/native-audio-recorder';
import { useI18n } from '../../lib/i18n';
import { type WavRecordingSession, isWavRecordingSupported, startMonoWavRecording } from '../../lib/wav-recorder';

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

type TranscriptionResponse = {
  transcript: string;
  detectedLanguage?: string | null;
  durationMs?: number | null;
  provider: string;
};

type RecordingPreview = {
  url: string;
  durationMs: number;
  sizeBytes: number;
  peak: number | null;
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

const MAX_RECORDING_MS = 90_000;

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
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.detail === 'string') return data.detail;
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function AIIntakePage() {
  const { locale, messages: m } = useI18n();
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
  const [voiceNotice, setVoiceNotice] = useState('');
  const [recordingPreview, setRecordingPreview] = useState<RecordingPreview | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<WavRecordingSession | NativeAudioRecordingSession | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechTranscriptRef = useRef('');
  const speechCancelledRef = useRef(false);
  const speechErrorRef = useRef<string | null>(null);
  const speechAutoStoppedRef = useRef(false);
  const speechStopRequestedRef = useRef(false);
  const speechRetryCountRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const supportsBrowserSpeech = useMemo(() => isSpeechRecognitionSupported(), []);
  const supportsNativeRecording = useMemo(() => isNativeAudioRecordingSupported(), []);
  const supportsWavRecording = useMemo(() => isWavRecordingSupported(), []);
  const supportsVoice = supportsNativeRecording || supportsBrowserSpeech || supportsWavRecording;
  const interactionLocked = busy || streaming || recording || transcribing;

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

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (!startedAt) return;
      const elapsed = Date.now() - startedAt;
      setRecordingElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS && (recorderRef.current || speechRecognitionRef.current)) {
        void stopRecording(true);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) {
        void recorder.cancel();
      }
      const recognition = speechRecognitionRef.current;
      speechRecognitionRef.current = null;
      if (recognition) {
        try {
          recognition.abort();
        } catch {}
      }
      setRecordingPreview((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url);
        }
        return null;
      });
    };
  }, []);

  function clearVoiceFeedback() {
    setChatError('');
    setVoiceNotice('');
  }

  function replaceRecordingPreview(next: RecordingPreview | null) {
    setRecordingPreview((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return next;
    });
  }

  function recordingErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return m.aiIntakePage.voicePermissionDenied;
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return m.aiIntakePage.voiceNoMicrophone;
    }
    if (error instanceof Error) {
      if (error.message === 'UNSUPPORTED') return m.aiIntakePage.voiceUnsupported;
      if (error.message === 'NO_MICROPHONE') return m.aiIntakePage.voiceNoMicrophone;
      return error.message;
    }
    return m.aiIntakePage.voiceTranscriptionFailed;
  }

  function speechRecognitionErrorMessage(errorCode: string | null | undefined): string {
    if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') return m.aiIntakePage.voicePermissionDenied;
    if (errorCode === 'audio-capture') return m.aiIntakePage.voiceNoMicrophone;
    if (errorCode === 'no-speech') return m.aiIntakePage.voiceNoSpeech;
    if (errorCode === 'aborted') return '';
    return m.aiIntakePage.voiceTranscriptionFailed;
  }

  async function ensureSelectedIntakeId(): Promise<string | null> {
    if (selectedId) return selectedId;
    setBusy(true);
    try {
      const created = await createIntakeRecord();
      await loadLists(created.id);
      return created.id;
    } catch (error: any) {
      setChatError(error.message || m.aiIntakePage.createIntakeFailed);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function finalizeSpeechRecognition() {
    const transcript = speechTranscriptRef.current.trim();
    const cancelled = speechCancelledRef.current;
    const errorCode = speechErrorRef.current;
    const autoStopped = speechAutoStoppedRef.current;

    speechRecognitionRef.current = null;
    speechTranscriptRef.current = '';
    speechCancelledRef.current = false;
    speechErrorRef.current = null;
    speechAutoStoppedRef.current = false;
    speechStopRequestedRef.current = false;
    speechRetryCountRef.current = 0;
    recordingStartedAtRef.current = null;
    setRecording(false);
    setRecordingElapsedMs(0);

    if (cancelled) {
      return;
    }

    if (transcript) {
      setChatInput((current) => (current.trim() ? `${current.trimEnd()}\n${transcript}` : transcript));
      setVoiceNotice(
        autoStopped ? `${m.aiIntakePage.voiceTooLong} ${m.aiIntakePage.voiceReviewHint}` : m.aiIntakePage.voiceReviewHint
      );
      return;
    }

    if (!errorCode) {
      setChatError(m.aiIntakePage.voiceNoSpeech);
      return;
    }

    const message = speechRecognitionErrorMessage(errorCode);
    if (message) {
      setChatError(message);
    } else if (autoStopped) {
      setVoiceNotice(m.aiIntakePage.voiceTooLong);
    }
  }

  async function startRecording() {
    clearVoiceFeedback();
    replaceRecordingPreview(null);
    if (!supportsVoice) {
      setChatError(m.aiIntakePage.voiceUnsupported);
      return;
    }

    if (supportsNativeRecording) {
      try {
        const recorder = await startNativeAudioRecording();
        recorderRef.current = recorder;
        recordingStartedAtRef.current = Date.now();
        setRecordingElapsedMs(0);
        setRecording(true);
        return;
      } catch (error) {
        recorderRef.current = null;
        setRecording(false);
        setChatError(recordingErrorMessage(error));
        return;
      }
    }

    if (supportsBrowserSpeech) {
      const RecognitionCtor = getSpeechRecognitionCtor();
      if (!RecognitionCtor) {
        setChatError(m.aiIntakePage.voiceUnsupported);
        return;
      }

      try {
        const recognition = new RecognitionCtor();
        speechRecognitionRef.current = recognition;
        speechTranscriptRef.current = '';
        speechCancelledRef.current = false;
        speechErrorRef.current = null;
        speechAutoStoppedRef.current = false;
        speechStopRequestedRef.current = false;
        speechRetryCountRef.current = 0;
        recognition.lang = localeToSpeechRecognitionLang(locale);
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.onresult = (event) => {
          const transcripts: string[] = [];
          for (const result of Array.from(event.results || [])) {
            const firstAlternative = result?.[0];
            if (firstAlternative?.transcript) {
              transcripts.push(firstAlternative.transcript);
            }
          }
          speechTranscriptRef.current = transcripts.join(' ').trim();
        };
        recognition.onerror = (event) => {
          speechErrorRef.current = event.error || 'unknown';
        };
        recognition.onend = () => {
          const elapsed = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 0;
          const shouldRetryNoSpeech =
            !speechStopRequestedRef.current &&
            !speechCancelledRef.current &&
            !speechTranscriptRef.current.trim() &&
            speechErrorRef.current === 'no-speech' &&
            elapsed < MAX_RECORDING_MS &&
            speechRetryCountRef.current < 2;

          if (shouldRetryNoSpeech) {
            speechRetryCountRef.current += 1;
            speechErrorRef.current = null;
            try {
              recognition.start();
              return;
            } catch {}
          }

          finalizeSpeechRecognition();
        };
        recordingStartedAtRef.current = Date.now();
        setRecordingElapsedMs(0);
        setRecording(true);
        recognition.start();
        return;
      } catch (error) {
        speechRecognitionRef.current = null;
        setRecording(false);
        setChatError(recordingErrorMessage(error));
        return;
      }
    }

    try {
      const recorder = await startMonoWavRecording();
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingElapsedMs(0);
      setRecording(true);
    } catch (error) {
      recorderRef.current = null;
      setRecording(false);
      setChatError(recordingErrorMessage(error));
    }
  }

  async function cancelRecording() {
    replaceRecordingPreview(null);
    clearVoiceFeedback();

    const recognition = speechRecognitionRef.current;
    if (recognition) {
      speechCancelledRef.current = true;
      speechErrorRef.current = 'aborted';
      speechAutoStoppedRef.current = false;
      speechStopRequestedRef.current = true;
      recordingStartedAtRef.current = null;
      setRecording(false);
      setRecordingElapsedMs(0);
      try {
        recognition.abort();
      } catch {}
      return;
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;
    recordingStartedAtRef.current = null;
    setRecording(false);
    setRecordingElapsedMs(0);
    if (!recorder) return;
    try {
      await recorder.cancel();
    } catch {}
  }

  async function stopRecording(autoStopped = false) {
    const recognition = speechRecognitionRef.current;
    if (recognition) {
      speechAutoStoppedRef.current = autoStopped;
      speechStopRequestedRef.current = true;
      try {
        recognition.stop();
      } catch {}
      return;
    }

    const recorder = recorderRef.current;
    if (!recorder) return;

    recorderRef.current = null;
    recordingStartedAtRef.current = null;
    setRecording(false);
    clearVoiceFeedback();

    try {
      const result = await recorder.stop();
      setRecordingElapsedMs(result.durationMs);
      replaceRecordingPreview({
        url: URL.createObjectURL(result.blob),
        durationMs: result.durationMs,
        sizeBytes: result.blob.size,
        peak: result.peak,
      });
      if (!result.blob.size || result.durationMs <= 0 || (typeof result.peak === 'number' && result.peak < 0.003)) {
        setChatError(m.aiIntakePage.voiceNoSpeech);
        if (autoStopped) setVoiceNotice(m.aiIntakePage.voiceTooLong);
        return;
      }

      const intakeId = await ensureSelectedIntakeId();
      if (!intakeId) return;

      const file = new File([result.blob], result.fileName || 'ai-intake.webm', { type: result.mimeType || 'audio/webm' });
      const formData = new FormData();
      formData.set('audio', file);
      formData.set('localeHint', locale);
      formData.set('durationMs', String(result.durationMs));

      setTranscribing(true);
      const res = await fetch(`${API_BASE}/ai/intakes/${intakeId}/messages/transcribe`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await safeMessage(res));

      const payload = (await res.json()) as TranscriptionResponse;
      const transcript = String(payload.transcript || '').trim();
      if (!transcript) {
        throw new Error(m.aiIntakePage.voiceNoSpeech);
      }

      setChatInput((current) => (current.trim() ? `${current.trimEnd()}\n${transcript}` : transcript));
      setVoiceNotice(
        autoStopped ? `${m.aiIntakePage.voiceTooLong} ${m.aiIntakePage.voiceReviewHint}` : m.aiIntakePage.voiceReviewHint
      );
    } catch (error) {
      setChatError(recordingErrorMessage(error));
    } finally {
      setTranscribing(false);
    }
  }

  async function clearMessages() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
    if (!messages.length) return;
    if (!window.confirm(m.aiIntakePage.clearConversationConfirm)) return;

    setBusy(true);
    try {
      const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}/messages`, 'DELETE');
      setMessages(updated.messages || []);
      setChatInput('');
      clearVoiceFeedback();
      replaceRecordingPreview(null);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

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
    const content = chatInput.trim();
    if (!content || recording || transcribing) return;
    clearVoiceFeedback();

    const intakeId = await ensureSelectedIntakeId();
    if (!intakeId) return;

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
        throw new Error(m.aiIntakePage.browserStreamingUnsupported);
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
        setChatError(full.replace(/^\s*\[ERROR\]\s*/, '').trim() || m.aiIntakePage.responseFailed);
        return;
      }

      await loadIntake(intakeId);
      await loadLists(intakeId);
    } catch (error: any) {
      setChatError(error.message || m.aiIntakePage.messageSendFailed);
      await loadIntake(intakeId).catch(() => undefined);
    } finally {
      setStreaming(false);
    }
  }

  async function generateProposal() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
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
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
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
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
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
      alert(m.aiIntakePage.convertedAlert);
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
          <h2>{m.aiIntakePage.intake}</h2>
          <button className="btn primary" onClick={createIntake} disabled={interactionLocked}>
            {m.common.createNew}
          </button>
        </div>
        <div className="spacer" />
        <div className="muted">{m.aiIntakePage.flow}</div>
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
              disabled={interactionLocked}
            >
              <div style={{ fontWeight: 700 }}>{item.orderTitle || m.aiIntakePage.unnamed}</div>
              <div className="muted">{item.customerCompanyName || m.aiIntakePage.noCustomer}</div>
              <div className="muted">
                {m.common.status}: {item.status}
              </div>
            </button>
          ))}
          {intakes.length === 0 && <div className="muted">{m.aiIntakePage.noIntakes}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>{m.aiIntakePage.conversation}</h2>
              <div className="muted">{m.aiIntakePage.conversationDesc}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={generateProposal} disabled={!selectedId || interactionLocked}>
                {m.aiIntakePage.generateProposal}
              </button>
              <button className="btn" onClick={saveDraft} disabled={!selectedId || interactionLocked}>
                {m.aiIntakePage.saveDraft}
              </button>
              <button className="btn" onClick={clearMessages} disabled={!selectedId || interactionLocked || messages.length === 0}>
                {m.aiIntakePage.clearConversation}
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
                <div style={{ fontWeight: 700 }}>
                  {message.role === 'assistant' ? m.aiIntakePage.assistant : m.aiIntakePage.manager}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
              </div>
            ))}
            {messages.length === 0 && <div className="muted">{m.aiIntakePage.noConversation}</div>}
          </div>

          <div className="spacer" />
          <textarea
            value={chatInput}
            onChange={(event) => {
              setChatInput(event.target.value);
              if (voiceNotice) setVoiceNotice('');
            }}
            placeholder={m.aiIntakePage.messagePlaceholder}
          />
          <div className="spacer" />
          {supportsVoice ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {!recording ? (
                <button className="btn" onClick={startRecording} disabled={interactionLocked}>
                  {m.aiIntakePage.voiceStart}
                </button>
              ) : (
                <>
                  <button className="btn" onClick={() => void stopRecording()} disabled={transcribing}>
                    {m.aiIntakePage.voiceStop}
                  </button>
                  <button className="btn" onClick={() => void cancelRecording()} disabled={transcribing}>
                    {m.aiIntakePage.voiceCancel}
                  </button>
                  <span className="muted">
                    {m.aiIntakePage.voiceRecording}: {formatDuration(recordingElapsedMs)}
                  </span>
                </>
              )}
              {transcribing && <span className="muted">{m.aiIntakePage.voiceTranscribing}</span>}
            </div>
          ) : (
            <div className="muted">{m.aiIntakePage.voiceUnsupported}</div>
          )}
          {voiceNotice && (
            <>
              <div className="spacer" />
              <div className="muted">{voiceNotice}</div>
            </>
          )}
          {recordingPreview && (
            <>
              <div className="spacer" />
              <div className="card" style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{m.aiIntakePage.recordingPreview}</div>
                <audio controls src={recordingPreview.url} style={{ width: '100%' }} />
                <div className="muted">
                  {m.aiIntakePage.recordingDuration}: {formatDuration(recordingPreview.durationMs)} |{' '}
                  {m.aiIntakePage.recordingPeak}: {recordingPreview.peak == null ? '-' : recordingPreview.peak.toFixed(3)} |{' '}
                  {m.aiIntakePage.recordingSize}: {(recordingPreview.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
            </>
          )}
          {chatError && (
            <>
              <div className="spacer" />
              <div className="card" style={{ borderColor: 'rgba(255,80,80,0.5)', color: '#b91c1c' }}>
                {chatError}
              </div>
            </>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={sendMessage} disabled={interactionLocked || !chatInput.trim()}>
            {streaming ? m.aiIntakePage.streaming : m.aiIntakePage.sendMessage}
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>{m.aiIntakePage.proposal}</h2>
              <div className="muted">{m.aiIntakePage.proposalDesc}</div>
            </div>
            <div className="muted">
              {m.common.status}: {draft.status || 'intake'}
            </div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>{m.aiIntakePage.companyName}</label>
              <input
                value={draft.customerCompanyName || ''}
                onChange={(event) => setDraft((current) => ({ ...current, customerCompanyName: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.contactName}</label>
              <input
                value={draft.contactName || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactName: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.contactPhone}</label>
              <input
                value={draft.contactPhone || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactPhone: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.contactEmail}</label>
              <input
                value={draft.contactEmail || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactEmail: event.target.value }))}
              />
            </div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>{m.aiIntakePage.orderTitle}</label>
              <input
                value={draft.orderTitle || ''}
                onChange={(event) => setDraft((current) => ({ ...current, orderTitle: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.periodStart}</label>
              <input
                type="date"
                value={draft.preferredStartDate ? String(draft.preferredStartDate).substring(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preferredStartDate: event.target.value || null }))
                }
              />
            </div>
            <div>
              <label>{m.aiIntakePage.periodEnd}</label>
              <input
                type="date"
                value={draft.preferredEndDate ? String(draft.preferredEndDate).substring(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preferredEndDate: event.target.value || null }))
                }
              />
            </div>
            <div>
              <label>{m.aiIntakePage.totalHours}</label>
              <input
                value={draft.estimatedHours ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, estimatedHours: event.target.value }))}
              />
            </div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>{m.aiIntakePage.requiredSkills}</label>
              <textarea
                value={listText(draft.requiredSkills)}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, requiredSkills: parseList(event.target.value) }))
                }
              />
            </div>
            <div>
              <label>{m.aiIntakePage.requiredCertifications}</label>
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
            <label>{m.common.summary}</label>
            <textarea
              value={draft.summary || ''}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
            />
          </div>

          <div className="spacer" />
          <div>
            <label>{m.aiIntakePage.orderDescription}</label>
            <textarea
              value={draft.orderDescription || ''}
              onChange={(event) => setDraft((current) => ({ ...current, orderDescription: event.target.value }))}
            />
          </div>

          <div className="spacer" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h2>{m.common.sites}</h2>
            <button className="btn" onClick={addSite}>{m.aiIntakePage.addSite}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.proposedSites || []).map((site, index) => (
              <div key={`${site.siteName}-${index}`} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>
                    {m.aiIntakePage.siteLabel} {index + 1}
                  </div>
                  <button className="btn danger" onClick={() => removeSite(index)}>{m.common.remove}</button>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{m.common.name}</label>
                    <input
                      value={site.siteName || ''}
                      onChange={(event) => updateSite(index, { siteName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{m.common.street}</label>
                    <input
                      value={site.street || ''}
                      onChange={(event) => updateSite(index, { street: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{m.common.zipCode}</label>
                    <input
                      value={site.zipCode || ''}
                      onChange={(event) => updateSite(index, { zipCode: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{m.common.city}</label>
                    <input
                      value={site.city || ''}
                      onChange={(event) => updateSite(index, { city: event.target.value })}
                    />
                  </div>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{m.common.skills}</label>
                    <textarea
                      value={listText(site.requiredSkills)}
                      onChange={(event) => updateSite(index, { requiredSkills: parseList(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label>{m.common.certifications}</label>
                    <textarea
                      value={listText(site.requiredCertifications)}
                      onChange={(event) =>
                        updateSite(index, { requiredCertifications: parseList(event.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label>{m.common.hours}</label>
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
                <label>{m.common.notes}</label>
                <textarea
                  value={site.notes || ''}
                  onChange={(event) => updateSite(index, { notes: event.target.value })}
                />
              </div>
            ))}
            {siteCount === 0 && <div className="muted">{m.aiIntakePage.noSites}</div>}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>{m.aiIntakePage.recommendations}</h2>
              <div className="muted">{m.aiIntakePage.recommendationsDesc}</div>
            </div>
            <button className="btn primary" onClick={recommendAssignments} disabled={!selectedId || interactionLocked}>
              {m.aiIntakePage.calculateRecommendations}
            </button>
          </div>

          {recommendations ? (
            <>
              <div className="spacer" />
              <div className="muted">
                {m.aiIntakePage.timeframe}: {recommendations.window.startDate.substring(0, 10)} -{' '}
                {recommendations.window.endDate.substring(0, 10)} ({recommendations.window.weeks} {m.aiIntakePage.weeksUnit})
              </div>
              {recommendations.pricePreview != null && (
                <div className="muted">
                  {m.aiIntakePage.pricePreview}: {recommendations.pricePreview} {recommendations.currency || 'EUR'}
                </div>
              )}
              <div className="spacer" />
              <div style={{ display: 'grid', gap: 12 }}>
                {recommendations.sites.map((site) => (
                  <div key={site.siteIndex} className="card">
                    <div style={{ fontWeight: 700 }}>{site.siteName}</div>
                    <div className="muted">
                      {m.common.hours}: {site.estimatedHours} | {m.common.skills}: {listText(site.requiredSkills)} | {m.common.certifications}:{' '}
                      {listText(site.requiredCertifications)}
                    </div>
                    <div className="spacer" />
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{m.aiIntakePage.select}</th>
                          <th>{m.common.employee}</th>
                          <th>{m.aiIntakePage.score}</th>
                          <th>{m.aiIntakePage.reason}</th>
                          <th>{m.aiIntakePage.capacity}</th>
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
                              {m.common.skills}: {listText(employee.matchedSkills)}
                              <br />
                              {m.common.certifications}: {listText(employee.matchedCertifications)}
                              <br />
                              {m.aiIntakePage.history}: {employee.recentEntries} {m.aiIntakePage.entries}
                            </td>
                            <td>
                              {m.aiIntakePage.freeHours}: {employee.capacity.remainingHours}h
                              {employee.capacity.capacityDefaulted ? ` (${m.aiIntakePage.defaultCapacity})` : ''}
                              <br />
                              {m.aiIntakePage.bookedHours}: {employee.capacity.loggedHours}h
                              <br />
                              {m.aiIntakePage.assignmentPressure}: {employee.capacity.assignmentPressureHours}h
                            </td>
                          </tr>
                        ))}
                        {site.recommendations.length === 0 && (
                          <tr>
                            <td colSpan={5} className="muted">{m.aiIntakePage.noMatchingEmployees}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {site.excludedEmployees.length > 0 && (
                      <>
                        <div className="spacer" />
                        <div className="muted">
                          {m.aiIntakePage.excluded}: {site.excludedEmployees.map((employee) => `${employee.employeeName} (${employee.details})`).join(', ')}
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
              <div className="muted">{m.aiIntakePage.noRecommendations}</div>
            </>
          )}
        </div>

        <div className="card">
          <h2>{m.aiIntakePage.confirmation}</h2>
          <div className="row">
            <div>
              <label>{m.aiIntakePage.useExistingCustomer}</label>
              <select value={existingCustomerId} onChange={(event) => setExistingCustomerId(event.target.value)}>
                <option value="">{m.aiIntakePage.createNewCustomer}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>{m.aiIntakePage.estimatedPrice}</label>
              <input
                value={draft.estimatedPrice ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, estimatedPrice: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.currency}</label>
              <input
                value={draft.currency || 'EUR'}
                onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}
              />
            </div>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={confirmProposal} disabled={!selectedId || interactionLocked}>
            {m.aiIntakePage.confirm}
          </button>
          {lastResult?.orderId && (
            <>
              <div className="spacer" />
              <div className="muted">
                {m.aiIntakePage.orderCreated}:{' '}
                <Link href={`/orders/${lastResult.orderId}`}>{m.aiIntakePage.openOrder}</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
