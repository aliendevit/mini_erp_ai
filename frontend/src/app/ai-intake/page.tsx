'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE, apiGet, apiJson } from '../../lib/api';
import { type BrowserSpeechRecognition } from '../../lib/browser-speech';
import { type NativeAudioRecordingSession, isNativeAudioRecordingSupported, startNativeAudioRecording } from '../../lib/native-audio-recorder';
import { useI18n } from '../../lib/i18n';
import { type WavRecordingSession, isWavRecordingSupported, startMonoWavRecording, transcodeBlobToMonoWav } from '../../lib/wav-recorder';

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

type ProposalCoverageType = 'internal_only' | 'mixed_with_workshop' | 'workshop_only';

type ProposalSite = {
  siteName: string;
  street?: string | null;
  zipCode?: string | null;
  city?: string | null;
  notes?: string | null;
  requiredSkills: string[];
  requiredCertifications: string[];
  estimatedHours?: number | null;
  recommendedHeadcount?: number | null;
  selectedInternalHeadcount?: number | null;
  assignedWorkshopName?: string | null;
  workshopCoveredSkills: string[];
  coverageType?: ProposalCoverageType | null;
  resourceStrategy?: string | null;
};

type ProposalFact = {
  id: string;
  category: string;
  key: string;
  value: unknown;
  confidence?: number | string | null;
};

type PaymentDraft = {
  type: string;
  status: string;
  amount?: number | string | null;
  currency?: string | null;
  dueDate?: string | null;
  paidDate?: string | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
};

type ExternalWorkshopDraft = {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  specialties: string[];
  suggestedFor: string[];
  relationshipStatus?: string | null;
  notes?: string | null;
};

type WorkshopRecommendation = {
  kind: string;
  workshopId?: string | null;
  draftIndex?: number | null;
  name: string;
  score: number;
  matchedSkills: string[];
  relationshipStatus?: string | null;
  availabilityStatus?: string | null;
  availabilityNote?: string | null;
  reason?: string | null;
  notes?: string | null;
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

type WorkshopSummary = {
  name: string;
  coveredSkills: string[];
  coverageType: ProposalCoverageType;
  relationshipStatus?: string | null;
  matchedSkills?: string[];
  source?: string | null;
};

type RecommendationSite = {
  siteIndex: number;
  siteName: string;
  coverageType: ProposalCoverageType;
  requiredSkills: string[];
  requiredCertifications: string[];
  internalRequiredSkills: string[];
  estimatedHours: number;
  recommendedHeadcount: number;
  selectedInternalHeadcount: number;
  autoSelectedEmployeeIds: string[];
  recommendations: RecommendationEmployee[];
  workshopRecommendations?: WorkshopRecommendation[];
  workshopSummary?: WorkshopSummary | null;
  coverageNote?: string | null;
  staffingWarning?: string | null;
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
  debugText?: string | null;
};

type VoiceDebugState = {
  mode: 'browser-speech' | 'native-audio' | 'wav-audio';
  mimeType?: string | null;
  durationMs?: number | null;
  peak?: number | null;
  sizeBytes?: number | null;
  provider?: string | null;
  detectedLanguage?: string | null;
  debugText?: string | null;
  lastError?: string | null;
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
  facts?: ProposalFact[];
  memorySummary?: Record<string, unknown> | null;
  paymentDrafts?: PaymentDraft[];
  externalWorkshops?: ExternalWorkshopDraft[];
  knownCustomerWorkshops?: unknown[];
  staffingPlan?: Record<string, unknown> | null;
  convertedCustomerId?: string | null;
  convertedOrderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  messages?: ProposalMessage[];
};

const SELECTED_INTAKE_STORAGE_KEY = 'ai_intake_selected_id';

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
  facts: [],
  memorySummary: null,
  paymentDrafts: [],
  externalWorkshops: [],
  knownCustomerWorkshops: [],
  staffingPlan: null,
};


type IconName =
  | 'plus'
  | 'send'
  | 'mic'
  | 'stop'
  | 'x'
  | 'file'
  | 'save'
  | 'trash'
  | 'sparkles'
  | 'wrench'
  | 'check'
  | 'info'
  | 'bill';

const ICON_PATHS: Record<IconName, string[]> = {
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['M22 2 11 13', 'M22 2 15 22 11 13 2 9 22 2'],
  mic: ['M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z', 'M19 10v1a7 7 0 0 1-14 0v-1', 'M12 18v4', 'M8 22h8'],
  stop: ['M7 7h10v10H7z'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h6'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
  sparkles: ['M12 3l1.7 4.8L18 10l-4.3 2.2L12 17l-1.7-4.8L6 10l4.3-2.2L12 3Z', 'M19 3v4', 'M17 5h4', 'M5 17v4', 'M3 19h4'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3 3-3Z'],
  check: ['M20 6 9 17l-5-5'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 16v-4', 'M12 8h.01'],
  bill: ['M6 2h12v20l-3-2-3 2-3-2-3 2V2Z', 'M9 7h6', 'M9 11h6', 'M9 15h4'],
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

const MAX_RECORDING_MS = 90_000;
const SHOW_AI_FACTS = process.env.NEXT_PUBLIC_SHOW_AI_FACTS === 'true';


function extraLabels(locale: string) {
  if (locale === 'ar') {
    return {
      memoryTitle: "\u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0648\u0627\u0644\u062d\u0642\u0627\u0626\u0642",
      memoryDesc: "\u0647\u0630\u0647 \u0627\u0644\u062d\u0642\u0627\u0626\u0642 \u0645\u062d\u0641\u0648\u0638\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0641\u0642\u0637 \u0648\u0644\u0627 \u062a\u0646\u062a\u0642\u0644 \u0625\u0644\u0649 \u0645\u062d\u0627\u062f\u062b\u0629 \u0623\u062e\u0631\u0649.",
      noFacts: "\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0642\u0627\u0626\u0642 \u0645\u062d\u0641\u0648\u0638\u0629 \u0628\u0639\u062f.",
      paymentDrafts: "\u0645\u0633\u0648\u062f\u0627\u062a \u0627\u0644\u062f\u0641\u0639\u0627\u062a / \u0627\u0644\u0639\u0631\u0628\u0648\u0646",
      externalWorkshops: "\u0648\u0631\u0634\u0627\u062a / \u0641\u0631\u0642 \u062e\u0627\u0631\u062c\u064a\u0629",
      noPayments: "\u0644\u0627 \u062a\u0648\u062c\u062f \u062f\u0641\u0639\u0627\u062a \u0623\u0648 \u0639\u0631\u0628\u0648\u0646 \u0645\u0630\u0643\u0648\u0631.",
      noWorkshops: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0648\u0631\u0634\u0627\u062a \u062e\u0627\u0631\u062c\u064a\u0629 \u0645\u0630\u0643\u0648\u0631\u0629.",
      addPayment: "\u0625\u0636\u0627\u0641\u0629 \u062f\u0641\u0639\u0629",
      addWorkshop: "\u0625\u0636\u0627\u0641\u0629 \u0648\u0631\u0634\u0629",
      paymentType: "\u0627\u0644\u0646\u0648\u0639",
      paymentStatus: "\u0627\u0644\u062d\u0627\u0644\u0629",
      amount: "\u0627\u0644\u0645\u0628\u0644\u063a",
      dueDate: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642",
      paidDate: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062f\u0641\u0639",
      method: "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639",
      reference: "\u0627\u0644\u0645\u0631\u062c\u0639",
      specialties: "\u0627\u0644\u062a\u062e\u0635\u0635\u0627\u062a",
      suggestedFor: "\u0645\u0642\u062a\u0631\u062d\u0629 \u0644\u0640",
      relation: "\u0627\u0644\u0639\u0644\u0627\u0642\u0629",
      workshopOptions: "\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0627\u0644\u0648\u0631\u0634\u0627\u062a / \u0627\u0644\u0641\u0631\u0642 \u0627\u0644\u062e\u0627\u0631\u062c\u064a\u0629",
      workshopReviewTitle: "\u0645\u0631\u0627\u062c\u0639\u0629 \u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u0648\u0631\u0634",
      workshopReviewDescription: "\u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0647\u0646 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0648\u0627\u0644\u0648\u0631\u0634 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 \u0648\u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062a \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u0644\u0643\u0644 \u0645\u0648\u0642\u0639. \u0647\u0630\u0627 \u0627\u0644\u062a\u062f\u0641\u0642 \u064a\u0639\u062a\u0645\u062f \u0639\u0644\u0649 \u0627\u0644\u0648\u0631\u0634 \u0641\u0642\u0637.",
      reviewWorkshopsButton: "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634",
      workshopReviewRunning: "\u062c\u0627\u0631\u064a \u0645\u0631\u0627\u062c\u0639\u0629 \u0645\u0647\u0646 \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0648\u062a\u063a\u0637\u064a\u0629 \u0627\u0644\u0648\u0631\u0634...",
      workshopReviewDone: "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634 \u062c\u0627\u0647\u0632\u0629. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u0639\u064a\u064a\u0646\u0627\u062a \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u0642\u0628\u0644 \u0627\u0644\u062a\u0623\u0643\u064a\u062f.",
      workshopReviewError: "\u062a\u0639\u0630\u0631\u062a \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634.",
      noWorkshopAssignedWarning: "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0639\u064a\u064a\u0646 \u0648\u0631\u0634\u0629 \u0628\u0639\u062f.",
      workshopAssignedForSite: "\u062a\u0645 \u062a\u0639\u064a\u064a\u0646 \u0648\u0631\u0634\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0642\u0639.",
      workshopNeeded: "\u062a\u062d\u062a\u0627\u062c \u0648\u0631\u0634\u0629 / \u0633\u064a\u062a\u0645 \u0627\u062e\u062a\u064a\u0627\u0631\u0647\u0627",
      explainWorkshopDecision: "\u0634\u0631\u062d \u0642\u0631\u0627\u0631 \u0627\u0644\u0648\u0631\u0634\u0629",
      availableLabel: "\u0645\u062a\u0627\u062d\u0629",
      workflowTitle: "\u0627\u0633\u062a\u0642\u0628\u0627\u0644 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a",
      workflowSubtitle: "\u0627\u0643\u062a\u0628 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0628\u0634\u0643\u0644 \u0637\u0628\u064a\u0639\u064a\u060c \u0648\u0627\u0644\u0635\u0641\u062d\u0629 \u062a\u0642\u0633\u0645\u0647\u0627 \u0625\u0644\u0649 \u0639\u0631\u0636 \u0642\u0627\u0628\u0644 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629.",
      stepChat: "\u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629",
      stepChatDesc: "\u0627\u062c\u0645\u0639 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0645\u0634\u0631\u0648\u0639",
      stepProposal: "\u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u0639\u0631\u0636",
      stepProposalDesc: "\u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0648\u0627\u0644\u062f\u0641\u0639\u0627\u062a",
      stepWorkshops: "\u0627\u0644\u0648\u0631\u0634",
      stepWorkshopsDesc: "\u062d\u062f\u062f \u0627\u0644\u0648\u0631\u0634\u0629 \u0644\u0643\u0644 \u0645\u0648\u0642\u0639",
      stepConfirm: "\u0627\u0644\u062a\u0623\u0643\u064a\u062f",
      stepConfirmDesc: "\u062d\u0648\u0651\u0644\u0647\u0627 \u0625\u0644\u0649 \u0637\u0644\u0628",
      quickExamplesTitle: "\u0623\u0645\u062b\u0644\u0629 \u0633\u0631\u064a\u0639\u0629 \u0644\u0644\u0628\u062f\u0621",
      quickExamplesDesc: "\u0627\u062e\u062a\u0631 \u0645\u062b\u0627\u0644\u0627\u064b \u0644\u062a\u0639\u0628\u0626\u0629 \u0645\u0631\u0628\u0639 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629.",
      exampleProjectBasics: "\u0639\u0646\u062f\u064a \u0645\u0634\u0631\u0648\u0639 \u062a\u0631\u0645\u064a\u0645 \u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0639\u0645\u0631\u0627\u0646 \u0627\u0644\u062d\u062f\u064a\u062b \u0641\u064a \u062f\u0645\u0634\u0642\u060c \u062d\u064a \u0627\u0644\u0645\u0627\u0644\u0643\u064a\u060c \u0628\u0646\u0627\u0621 \u0631\u0642\u0645 \u0661\u0665. \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0623\u062d\u0645\u062f \u0645\u0646\u0635\u0648\u0631\u060c \u0647\u0627\u062a\u0641 \u0660\u0669\u0663\u0663\u0664\u0664\u0665\u0665\u0666\u0666\u060c \u0648\u0627\u0644\u0628\u0631\u064a\u062f ahmad@example.com. \u0627\u0644\u062a\u0646\u0641\u064a\u0630 \u0645\u0646 10-06-2026 \u0625\u0644\u0649 25-06-2026.",
      exampleScope: "\u0627\u0644\u0645\u0637\u0628\u062e \u064a\u062d\u062a\u0627\u062c \u0625\u0632\u0627\u0644\u0629 \u0628\u0644\u0627\u0637 \u0648\u062a\u0631\u0643\u064a\u0628 \u0633\u064a\u0631\u0627\u0645\u064a\u0643 \u0642\u064a\u0627\u0633 \u0666\u0660 \u0641\u064a \u0666\u0660\u060c \u0648\u0625\u0635\u0644\u0627\u062d \u062a\u0645\u062f\u064a\u062f\u0627\u062a \u0627\u0644\u0645\u064a\u0627\u0647\u060c \u0648\u062a\u0631\u0645\u064a\u0645 \u062e\u0632\u0627\u0626\u0646 \u062e\u0634\u0628\u064a\u0629. \u0627\u0644\u062d\u0645\u0627\u0645 \u064a\u062d\u062a\u0627\u062c \u0639\u0632\u0644 \u0645\u0627\u0626\u064a \u0648\u062a\u0628\u062f\u064a\u0644 \u0645\u063a\u0633\u0644\u0629 \u0648\u062e\u0644\u0627\u0637 \u062f\u0634. \u063a\u0631\u0641\u0629 \u0627\u0644\u062c\u0644\u0648\u0633 \u062a\u062d\u062a\u0627\u062c \u062f\u0647\u0627\u0646 \u062f\u0627\u062e\u0644\u064a \u0645\u0639 \u0645\u0639\u062c\u0648\u0646 \u0643\u0627\u0645\u0644 \u0648\u0637\u0628\u0642\u062a\u064a\u0646.",
      examplePaymentWorkshop: "\u0627\u0644\u0639\u0631\u0628\u0648\u0646 2000 \u062f\u0648\u0644\u0627\u0631 \u0646\u0642\u062f\u0627\u064b \u0628\u062a\u0627\u0631\u064a\u062e \u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0645\u0634\u0631\u0648\u0639\u060c \u0648\u0627\u0644\u0628\u0627\u0642\u064a 7000 \u062f\u0648\u0644\u0627\u0631 \u0644\u0627\u062d\u0642\u0627\u064b. \u0648\u0631\u0634\u0629 \u0627\u0644\u0634\u0627\u0645 \u0644\u0644\u0628\u0644\u0627\u0637 \u0648\u0627\u0644\u0639\u0632\u0644 \u0633\u062a\u063a\u0637\u064a \u0627\u0644\u0628\u0644\u0627\u0637 \u0648\u0627\u0644\u0639\u0632\u0644\u060c \u0648\u0646\u062d\u062a\u0627\u062c \u0627\u062e\u062a\u064a\u0627\u0631 \u0648\u0631\u0634\u0629 \u062f\u0647\u0627\u0646 \u0645\u0646\u0627\u0633\u0628\u0629.",
      useExample: "\u0627\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0645\u062b\u0627\u0644",
      projectSnapshot: "\u0645\u0644\u062e\u0635 \u0633\u0631\u064a\u0639",
      conversationMessages: "\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629",
      sitesCount: "\u0639\u062f\u062f \u0627\u0644\u0645\u0648\u0627\u0642\u0639",
      missingWorkshops: "\u0648\u0631\u0634 \u063a\u064a\u0631 \u0645\u062d\u062f\u062f\u0629",
      paymentsCount: "\u0627\u0644\u062f\u0641\u0639\u0627\u062a",
      readyHint: "\u0643\u0644\u0645\u0627 \u0623\u0635\u0628\u062d\u062a \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0643\u0627\u0645\u0644\u0629\u060c \u064a\u0645\u0643\u0646\u0643 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636 \u0648\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634.",
      voiceDiagnostics: "\u062a\u0634\u062e\u064a\u0635 \u0627\u0644\u0635\u0648\u062a",
      importantOnly: "\u062a\u062f\u0641\u0642 \u0645\u0628\u0633\u0637",
      proposalGeneratingButton: "\u062c\u0627\u0631\u064a \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636...",
      proposalGenerating: "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0648\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636. \u0642\u062f \u064a\u0633\u062a\u063a\u0631\u0642 \u0647\u0630\u0627 \u0628\u0636\u0639 \u062b\u0648\u0627\u0646\u064d.",
      proposalGenerated: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636. \u064a\u0645\u0643\u0646\u0643 \u0645\u0631\u0627\u062c\u0639\u062a\u0647 \u0648\u062a\u0639\u062f\u064a\u0644\u0647 \u0627\u0644\u0622\u0646.",
      proposalGenerationFailed: "\u0641\u0634\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
      recommendationCalculatingButton: "\u062c\u0627\u0631\u064a \u062d\u0633\u0627\u0628 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a...",
      recommendationCalculating: "\u062c\u0627\u0631\u064a \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634 \u0648\u0627\u0644\u062a\u062e\u0635\u0635\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629.",
      recommendationCalculated: "\u062a\u0645\u062a \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634. \u0631\u0627\u062c\u0639 \u0627\u0644\u0628\u0637\u0627\u0642\u0627\u062a \u0648\u062d\u062f\u062f \u0627\u0644\u0648\u0631\u0634\u0629 \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0643\u0644 \u0645\u0648\u0642\u0639.",
      recommendationCalculationFailed: "\u062a\u0639\u0630\u0631\u062a \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
      proposalProgressSteps: [
        "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629...",
        "\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0627\u0644\u062d\u0642\u0627\u0626\u0642 \u0648\u062a\u0648\u0632\u064a\u0639 \u0627\u0644\u0645\u0648\u0627\u0642\u0639...",
        "\u062c\u0627\u0631\u064a \u0628\u0646\u0627\u0621 \u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u0639\u0631\u0636 \u0648\u0627\u0644\u062f\u0641\u0639\u0627\u062a..."
      ],
      recommendationProgressSteps: [
        "\u062c\u0627\u0631\u064a \u0645\u0631\u0627\u062c\u0639\u0629 \u0645\u062a\u0637\u0644\u0628\u0627\u062a \u0643\u0644 \u0645\u0648\u0642\u0639...",
        "\u062c\u0627\u0631\u064a \u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0645\u0647\u0646 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0645\u0639 \u0627\u0644\u0648\u0631\u0634 \u0627\u0644\u0645\u062a\u0627\u062d\u0629...",
        "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0627\u0644\u0648\u0631\u0634 \u0644\u0643\u0644 \u0645\u0648\u0642\u0639..."
      ],
      hiddenMemoryClear: "\u062d\u0630\u0641 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u064a\u0645\u0633\u062d \u0647\u0630\u0647 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0641\u0642\u0637.",
      messageHistory: "\u0633\u062c\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629",
      collapseHistory: "\u0637\u064a \u0627\u0644\u0633\u062c\u0644",
      expandHistory: "\u0639\u0631\u0636 \u0627\u0644\u0633\u062c\u0644",
      historyCollapsed: "\u062a\u0645 \u0637\u064a \u0633\u062c\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629. \u064a\u0645\u0643\u0646\u0643 \u0641\u062a\u062d\u0647 \u0639\u0646\u062f \u0627\u0644\u062d\u0627\u062c\u0629.",
      latestMessage: "\u0622\u062e\u0631 \u0631\u0633\u0627\u0644\u0629",
      staffingCoverage: "\u062a\u063a\u0637\u064a\u0629 \u0627\u0644\u062a\u0646\u0641\u064a\u0630",
      internalOnly: "\u0648\u0631\u0634\u0629 \u063a\u064a\u0631 \u0645\u062d\u062f\u062f\u0629",
      mixedWithWorkshop: "\u062a\u0648\u0632\u064a\u0639 \u0639\u0644\u0649 \u0623\u0643\u062b\u0631 \u0645\u0646 \u0648\u0631\u0634\u0629",
      workshopOnly: "\u0648\u0631\u0634\u0629 \u0641\u0642\u0637",
      assignedWorkshop: "\u0627\u0644\u0648\u0631\u0634\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629",
      noWorkshop: "\u0628\u062f\u0648\u0646 \u0648\u0631\u0634\u0629",
      workshopCoveredSkills: "\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u064a \u062a\u063a\u0637\u064a\u0647\u0627 \u0627\u0644\u0648\u0631\u0634\u0629",
      internalSkillsRemaining: "\u0627\u0644\u0645\u0647\u0646 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 / \u063a\u064a\u0631 \u0627\u0644\u0645\u063a\u0637\u0627\u0629",
      aiRecommendedCount: "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0631\u0634",
      selectedInternalCount: "\u0627\u0644\u062a\u0646\u0641\u064a\u0630 \u0639\u0628\u0631 \u0627\u0644\u0648\u0631\u0634",
      selectedTeam: "\u0627\u0644\u0648\u0631\u0634\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629",
      changeEmployees: "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0648\u0631\u0634\u0629",
      hideEmployees: "\u0625\u062e\u0641\u0627\u0621 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0648\u0631\u0634\u0629",
      noSelectedEmployees: "\u0647\u0630\u0627 \u0627\u0644\u062a\u062f\u0641\u0642 \u064a\u0639\u062a\u0645\u062f \u0639\u0644\u0649 \u0627\u0644\u0648\u0631\u0634 \u0641\u0642\u0637.",
      noInternalEmployeesNeeded: "\u0627\u0644\u062a\u0646\u0641\u064a\u0630 \u0639\u0628\u0631 \u0627\u0644\u0648\u0631\u0634 \u0641\u0642\u0637.",
      staffingCardDesc: "\u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u0631\u0634\u0629 \u0648\u062d\u062f\u062f \u0627\u0644\u0645\u0647\u0646 \u0627\u0644\u062a\u064a \u062a\u063a\u0637\u064a\u0647\u0627.",
      workshopSuggestionsCompact: "\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0627\u0644\u0648\u0631\u0634 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0648\u0642\u0639",
      alternativeEmployees: "\u0648\u0631\u0634 \u0628\u062f\u064a\u0644\u0629",
      explainRecommendation: "\u0644\u0645\u0627\u0630\u0627 \u0647\u0630\u0647 \u0627\u0644\u0648\u0631\u0634\u0629\u061f",
      explainingRecommendationButton: "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0633\u0628\u0628...",
      explanationTitle: "\u0634\u0631\u062d \u0642\u0631\u0627\u0631 \u0627\u0644\u0648\u0631\u0634\u0629",
      explanationStreaming: "\u062c\u0627\u0631\u064a \u062a\u0648\u0644\u064a\u062f \u0634\u0631\u062d \u0627\u0644\u0642\u0631\u0627\u0631...",
      explanationFailed: "\u062a\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0634\u0631\u062d \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d.",
      explanationEmpty: "\u0644\u0627 \u064a\u0648\u062c\u062f \u0634\u0631\u062d \u0645\u062a\u0627\u062d \u0628\u0639\u062f.",
      closeExplanation: "\u0625\u063a\u0644\u0627\u0642",
    };
  }
  if (locale === 'en') {
    return {
      memoryTitle: 'Chat Memory / Facts',
      memoryDesc: 'These facts belong only to this intake and are never shared with another chat.',
      noFacts: 'No stored facts yet.',
      paymentDrafts: 'Payment / deposit drafts',
      externalWorkshops: 'Workshops / external teams',
      noPayments: 'No deposits or payments mentioned.',
      noWorkshops: 'No external workshops mentioned.',
      addPayment: 'Add payment',
      addWorkshop: 'Add workshop',
      paymentType: 'Type',
      paymentStatus: 'Status',
      amount: 'Amount',
      dueDate: 'Due date',
      paidDate: 'Paid date',
      method: 'Method',
      reference: 'Reference',
      specialties: 'Specialties',
      suggestedFor: 'Suggested for',
      relation: 'Relationship',
      workshopOptions: 'Workshop / external team suggestions',
      workshopReviewTitle: 'Workshop execution review',
      workshopReviewDescription: 'Review required trades, assigned workshops, and missing workshop decisions per site. This flow uses workshop partners only.',
      reviewWorkshopsButton: 'Review workshops',
      workshopReviewRunning: 'Reviewing site trades and workshop coverage...',
      workshopReviewDone: 'Workshop review is ready. Check missing assignments before confirming.',
      workshopReviewError: 'Workshop review could not be calculated.',
      noWorkshopAssignedWarning: 'No workshop is assigned yet.',
      workshopAssignedForSite: 'Workshop assigned for this site.',
      workshopNeeded: 'Workshop needed / to be selected',
      explainWorkshopDecision: 'Explain workshop decision',
      availableLabel: 'available',
      workflowTitle: 'AI Project Intake',
      workflowSubtitle: 'Start with a short conversation, then review the proposal and workshops before converting it to an order.',
      stepChat: 'Chat',
      stepChatDesc: 'Capture project details',
      stepProposal: 'Proposal Draft',
      stepProposalDesc: 'Generate and review data',
      stepWorkshops: 'Workshops',
      stepWorkshopsDesc: 'Assign partner per site',
      stepConfirm: 'Confirm',
      stepConfirmDesc: 'Convert to order',
      quickExamplesTitle: 'Quick start examples',
      quickExamplesDesc: 'Use an example or write naturally.',
      exampleProjectBasics: 'I have a renovation project for Modern Building Company in Damascus, Al-Malki, building 15. Contact is Ahmad Mansour, phone 0933445566, email ahmad@example.com. Work starts 2026-06-10 and ends around 2026-06-25.',
      exampleScope: 'The kitchen needs old tile removal, new 60x60 ceramic tiles, and plumbing repair. The bathroom needs waterproofing and replacement of sink and shower mixer. The living room needs interior paint with full putty and two coats.',
      examplePaymentWorkshop: 'Payment is cash. Deposit is 2000 USD at project start, remaining amount is 7000 USD. Al-Sham Tile and Waterproofing Workshop covers tiles and waterproofing, and we need a painting workshop for the living room.',
      useExample: 'Use example',
      projectSnapshot: 'Project snapshot',
      conversationMessages: 'Conversation messages',
      sitesCount: 'Sites',
      missingWorkshops: 'Missing workshops',
      paymentsCount: 'Payments',
      readyHint: 'When the information is complete, generate the proposal draft and review workshops.',
      voiceDiagnostics: 'Voice diagnostics',
      importantOnly: 'Important only',
      proposalGeneratingButton: 'Generating proposal...',
      proposalGenerating: 'Analyzing the conversation and generating the proposal. This can take a few seconds.',
      proposalGenerated: 'Proposal generated. You can review and edit it now.',
      proposalGenerationFailed: 'Proposal generation failed. Check the error and try again.',
      recommendationCalculatingButton: 'Calculating suggestions...',
      recommendationCalculating: 'Reviewing workshop suggestions and trade coverage.',
      recommendationCalculated: 'Workshop review is ready. Review the site cards and assign the right workshop if needed.',
      recommendationCalculationFailed: 'Workshop review could not be calculated. Check the data and try again.',
      proposalProgressSteps: [
        'Analyzing the conversation...',
        'Extracting project facts and sites...',
        'Building the proposal draft and payments...'
      ],
      recommendationProgressSteps: [
        'Reviewing each site requirement...',
        'Matching required trades with available workshops...',
        'Preparing workshop suggestions for each site...'
      ],
      hiddenMemoryClear: 'Clearing removes only the current conversation.',
      messageHistory: 'Message history',
      collapseHistory: 'Collapse history',
      expandHistory: 'Show history',
      historyCollapsed: 'Message history is collapsed. Open it when you need to review the context.',
      latestMessage: 'Latest message',
      staffingCoverage: 'Execution coverage',
      internalOnly: 'Workshop needed',
      mixedWithWorkshop: 'Split between workshops',
      workshopOnly: 'Workshop only',
      assignedWorkshop: 'Assigned workshop',
      noWorkshop: 'No workshop',
      workshopCoveredSkills: 'Workshop-covered skills',
      internalSkillsRemaining: 'Required / uncovered trades',
      aiRecommendedCount: 'Workshop review',
      selectedInternalCount: 'Workshop execution',
      selectedTeam: 'Selected workshop',
      changeEmployees: 'Change workshop',
      hideEmployees: 'Hide workshop details',
      noSelectedEmployees: 'Workshop-only execution workflow.',
      noInternalEmployeesNeeded: 'Workshop-only execution selected.',
      staffingCardDesc: 'Choose the workshop partner and confirm which trades it covers.',
      workshopSuggestionsCompact: 'Workshop suggestions for this site',
      alternativeEmployees: 'Alternative workshops',
      explainRecommendation: 'Why this workshop?',
      explainingRecommendationButton: 'Explaining recommendation...',
      explanationTitle: 'Workshop decision explanation',
      explanationStreaming: 'Generating the decision explanation...',
      explanationFailed: 'Could not generate the recommendation explanation.',
      explanationEmpty: 'No explanation is available yet.',
      closeExplanation: 'Close',
    };
  }
  return {
    memoryTitle: 'Chat-Speicher / Fakten',
    memoryDesc: 'Diese Fakten gehoeren nur zu diesem Intake und werden nie in einen anderen Chat uebernommen.',
    noFacts: 'Noch keine gespeicherten Fakten.',
    paymentDrafts: 'Zahlungs-/Anzahlungsentwuerfe',
    externalWorkshops: 'Workshops / externe Teams',
    noPayments: 'Keine Anzahlung oder Zahlung erfasst.',
    noWorkshops: 'Keine externen Workshops erfasst.',
    addPayment: 'Zahlung hinzufuegen',
    addWorkshop: 'Workshop hinzufuegen',
    paymentType: 'Typ',
    paymentStatus: 'Status',
    amount: 'Betrag',
    dueDate: 'Faellig am',
    paidDate: 'Bezahlt am',
    method: 'Methode',
    reference: 'Referenz',
    specialties: 'Spezialisierungen',
    suggestedFor: 'Vorgeschlagen fuer',
    relation: 'Beziehung',
    workshopOptions: 'Workshop-/Teamvorschlaege',
    workshopReviewTitle: 'Workshop-Ausfuehrung pruefen',
    workshopReviewDescription: 'Pruefe benoetigte Gewerke, zugeordnete Workshops und offene Workshop-Entscheidungen je Baustelle. Dieser Ablauf nutzt nur Workshop-Partner.',
    reviewWorkshopsButton: 'Workshops pruefen',
    workshopReviewRunning: 'Baustellengewerke und Workshop-Abdeckung werden geprueft...',
    workshopReviewDone: 'Workshop-Pruefung ist bereit. Offene Zuordnungen vor der Bestaetigung pruefen.',
    workshopReviewError: 'Workshop-Pruefung konnte nicht berechnet werden.',
    noWorkshopAssignedWarning: 'Noch kein Workshop zugeordnet.',
    workshopAssignedForSite: 'Workshop fuer diese Baustelle zugeordnet.',
    workshopNeeded: 'Workshop offen / auszuwaehlen',
    explainWorkshopDecision: 'Workshop-Entscheidung erklaeren',
    availableLabel: 'verfuegbar',
    workflowTitle: 'KI-Projektaufnahme',
    workflowSubtitle: 'Starte mit einer kurzen Unterhaltung, pruefe danach Vorschlag und Workshops und wandle ihn in einen Auftrag um.',
    stepChat: 'Chat',
    stepChatDesc: 'Projektdaten erfassen',
    stepProposal: 'Vorschlagsentwurf',
    stepProposalDesc: 'Daten erzeugen und pruefen',
    stepWorkshops: 'Workshops',
    stepWorkshopsDesc: 'Partner je Baustelle zuordnen',
    stepConfirm: 'Bestaetigen',
    stepConfirmDesc: 'In Auftrag umwandeln',
    quickExamplesTitle: 'Schnellstart-Beispiele',
    quickExamplesDesc: 'Beispiel nutzen oder frei schreiben.',
    exampleProjectBasics: 'Ich habe ein Sanierungsprojekt fuer Modern Building Company in Damascus, Al-Malki, Gebaeude 15. Kontakt ist Ahmad Mansour, Telefon 0933445566, E-Mail ahmad@example.com. Start 2026-06-10, Ende ca. 2026-06-25.',
    exampleScope: 'Die Kueche braucht Fliesenabbruch, neue Keramikfliesen 60x60 und Sanitaer-Reparatur. Das Bad braucht Abdichtung und Austausch von Waschbecken und Duschmischer. Das Wohnzimmer braucht Innenanstrich mit Spachtel und zwei Schichten.',
    examplePaymentWorkshop: 'Zahlung bar. Anzahlung 2000 USD zum Projektstart, Restbetrag 7000 USD. Al-Sham Tile and Waterproofing Workshop uebernimmt Fliesen und Abdichtung, fuer das Wohnzimmer brauchen wir einen Maler-Workshop.',
    useExample: 'Beispiel nutzen',
    projectSnapshot: 'Projektueberblick',
    conversationMessages: 'Chat-Nachrichten',
    sitesCount: 'Baustellen',
    missingWorkshops: 'Offene Workshops',
    paymentsCount: 'Zahlungen',
    readyHint: 'Wenn die Informationen komplett sind, Vorschlagsentwurf erzeugen und Workshops pruefen.',
    voiceDiagnostics: 'Sprachdiagnose',
    importantOnly: 'Nur Wichtiges',
    proposalGeneratingButton: 'Vorschlag wird erzeugt...',
    proposalGenerating: 'Konversation wird analysiert und der Vorschlag wird erzeugt. Das kann einige Sekunden dauern.',
    proposalGenerated: 'Vorschlag wurde erzeugt. Du kannst ihn jetzt pruefen und bearbeiten.',
    proposalGenerationFailed: 'Vorschlag konnte nicht erzeugt werden. Fehler pruefen und erneut versuchen.',
    recommendationCalculatingButton: 'Vorschlaege werden berechnet...',
    recommendationCalculating: 'Workshop-Abdeckung wird geprueft.',
    recommendationCalculated: 'Die Workshop-Pruefung ist bereit. Baustellenkarten pruefen und Partner zuordnen.',
    recommendationCalculationFailed: 'Die Workshop-Pruefung konnte nicht berechnet werden. Daten pruefen und erneut versuchen.',
    proposalProgressSteps: [
      'Konversation wird analysiert...',
      'Projektfakten und Baustellen werden extrahiert...',
      'Angebotsentwurf und Zahlungen werden vorbereitet...'
    ],
    recommendationProgressSteps: [
      'Anforderungen je Baustelle werden geprueft...',
      'Benoetigte Gewerke werden mit verfuegbaren Workshops abgeglichen...',
      'Workshop-Vorschlaege je Baustelle werden vorbereitet...'
    ],
    hiddenMemoryClear: 'Loeschen entfernt nur die aktuelle Konversation.',
    messageHistory: 'Nachrichtenverlauf',
    collapseHistory: 'Verlauf einklappen',
    expandHistory: 'Verlauf anzeigen',
    historyCollapsed: 'Der Nachrichtenverlauf ist eingeklappt. Oeffne ihn bei Bedarf zur Kontextpruefung.',
    latestMessage: 'Letzte Nachricht',
    staffingCoverage: 'Abdeckungsmodus',
    internalOnly: 'Workshop offen',
    mixedWithWorkshop: 'Auf mehrere Workshops aufgeteilt',
    workshopOnly: 'Nur Workshop',
    assignedWorkshop: 'Zugeordneter Workshop',
    noWorkshop: 'Kein Workshop',
    workshopCoveredSkills: 'Vom Workshop abgedeckte Skills',
    internalSkillsRemaining: 'Benoetigte / offene Gewerke',
    aiRecommendedCount: 'Workshop-Pruefung',
    selectedInternalCount: 'Workshop-Ausfuehrung',
    selectedTeam: 'Ausgewaehlter Workshop',
    changeEmployees: 'Workshop anpassen',
    hideEmployees: 'Workshopdetails ausblenden',
    noSelectedEmployees: 'Dieser Ablauf nutzt nur Workshops.',
    noInternalEmployeesNeeded: 'Ausfuehrung ueber Workshops.',
    staffingCardDesc: 'Workshop-Partner waehlen und abgedeckte Gewerke festlegen.',
    workshopSuggestionsCompact: 'Workshop-Vorschlaege fuer diese Baustelle',
    alternativeEmployees: 'Alternative Workshops',
    explainRecommendation: 'Warum dieser Workshop?',
    explainingRecommendationButton: 'Erklaerung wird erstellt...',
    explanationTitle: 'Erklaerung der Workshop-Entscheidung',
    explanationStreaming: 'Entscheidungserklaerung wird erzeugt...',
    explanationFailed: 'Die Erklaerung zur Empfehlung konnte nicht erzeugt werden.',
    explanationEmpty: 'Noch keine Erklaerung verfuegbar.',
    closeExplanation: 'Schliessen',
  };
}

function parseList(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(values?: string[] | null): string {
  return (values || []).join(', ');
}

function normalizeCoverageType(
  value: ProposalCoverageType | string | null | undefined,
  assignedWorkshopName?: string | null
): ProposalCoverageType {
  const normalized = String(value || '').trim().toLowerCase();
  const hasWorkshop = Boolean((assignedWorkshopName || '').trim());
  if (normalized === 'mixed_with_workshop') return 'mixed_with_workshop';
  return 'workshop_only';
}

function normalizeProposalSite(site?: Partial<ProposalSite> | null): ProposalSite {
  const assignedWorkshopName = String(site?.assignedWorkshopName || '').trim();
  const coverageType = normalizeCoverageType(site?.coverageType, assignedWorkshopName);
  return {
    siteName: site?.siteName || '',
    street: site?.street || '',
    zipCode: site?.zipCode || '',
    city: site?.city || '',
    notes: site?.notes || '',
    requiredSkills: Array.isArray(site?.requiredSkills) ? site?.requiredSkills : [],
    requiredCertifications: Array.isArray(site?.requiredCertifications) ? site?.requiredCertifications : [],
    estimatedHours: site?.estimatedHours ?? null,
    recommendedHeadcount: site?.recommendedHeadcount ?? null,
    selectedInternalHeadcount: site?.selectedInternalHeadcount ?? null,
    assignedWorkshopName: assignedWorkshopName,
    workshopCoveredSkills: assignedWorkshopName && Array.isArray(site?.workshopCoveredSkills) ? site?.workshopCoveredSkills : [],
    coverageType,
    resourceStrategy: site?.resourceStrategy ?? null,
  };
}

function normalizeProposalSites(sites?: Array<Partial<ProposalSite> | ProposalSite> | null): ProposalSite[] {
  return (sites || []).map((site) => normalizeProposalSite(site));
}

function normalizeDraftValue(value: Partial<ProposalDraft> | ProposalDraft): Partial<ProposalDraft> {
  return {
    ...emptyDraft,
    ...value,
    proposedSites: normalizeProposalSites(value.proposedSites || []),
    requiredSkills: value.requiredSkills || [],
    requiredCertifications: value.requiredCertifications || [],
    facts: value.facts || [],
    memorySummary: value.memorySummary || null,
    paymentDrafts: value.paymentDrafts || [],
    externalWorkshops: value.externalWorkshops || [],
    knownCustomerWorkshops: value.knownCustomerWorkshops || [],
    staffingPlan: value.staffingPlan || null,
  };
}

function hasDraftContent(draft: Partial<ProposalDraft> | ProposalDraft): boolean {
  return Boolean(
    draft.orderTitle ||
      draft.customerCompanyName ||
      draft.summary ||
      draft.orderDescription ||
      (draft.proposedSites || []).length > 0 ||
      (draft.paymentDrafts || []).length > 0 ||
      (draft.externalWorkshops || []).length > 0 ||
      (draft.messages || []).length > 0
  );
}

function getStoredSelectedIntakeId(): string {
  try {
    return window.localStorage.getItem(SELECTED_INTAKE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeSelectedIntakeId(id: string) {
  try {
    if (id) window.localStorage.setItem(SELECTED_INTAKE_STORAGE_KEY, id);
    else window.localStorage.removeItem(SELECTED_INTAKE_STORAGE_KEY);
  } catch {}
}

function normalizeRecommendations(value: unknown): RecommendationPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RecommendationPayload>;
  if (!candidate.window || typeof candidate.window !== 'object') return null;
  if (!Array.isArray(candidate.sites)) return null;

  const { startDate, endDate, weeks } = candidate.window as RecommendationPayload['window'];
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || typeof weeks !== 'number') return null;

  return {
    window: { startDate, endDate, weeks },
    pricePreview: typeof candidate.pricePreview === 'number' ? candidate.pricePreview : null,
    currency: typeof candidate.currency === 'string' ? candidate.currency : null,
    sites: candidate.sites.map((rawSite, index) => {
      const site = (rawSite && typeof rawSite === 'object' ? rawSite : {}) as Partial<RecommendationSite>;
      return {
        siteIndex: typeof site.siteIndex === 'number' ? site.siteIndex : index,
        siteName: typeof site.siteName === 'string' ? site.siteName : `Site ${index + 1}`,
        coverageType: normalizeCoverageType(site.coverageType, site.workshopSummary?.name),
        requiredSkills: Array.isArray(site.requiredSkills) ? site.requiredSkills : [],
        requiredCertifications: Array.isArray(site.requiredCertifications) ? site.requiredCertifications : [],
        internalRequiredSkills: Array.isArray(site.internalRequiredSkills)
          ? site.internalRequiredSkills
          : Array.isArray(site.requiredSkills)
            ? site.requiredSkills
            : [],
        estimatedHours: typeof site.estimatedHours === 'number' ? site.estimatedHours : 0,
        recommendedHeadcount: typeof site.recommendedHeadcount === 'number' ? site.recommendedHeadcount : 0,
        selectedInternalHeadcount: typeof site.selectedInternalHeadcount === 'number' ? site.selectedInternalHeadcount : 0,
        autoSelectedEmployeeIds: Array.isArray(site.autoSelectedEmployeeIds) ? site.autoSelectedEmployeeIds : [],
        recommendations: Array.isArray(site.recommendations) ? site.recommendations : [],
        workshopRecommendations: Array.isArray(site.workshopRecommendations) ? site.workshopRecommendations : [],
        workshopSummary: site.workshopSummary && typeof site.workshopSummary === 'object'
          ? {
              name: typeof site.workshopSummary.name === 'string' ? site.workshopSummary.name : '',
              coveredSkills: Array.isArray(site.workshopSummary.coveredSkills) ? site.workshopSummary.coveredSkills : [],
              coverageType: normalizeCoverageType(site.workshopSummary.coverageType, site.workshopSummary.name),
              relationshipStatus: typeof site.workshopSummary.relationshipStatus === 'string' ? site.workshopSummary.relationshipStatus : null,
              matchedSkills: Array.isArray(site.workshopSummary.matchedSkills) ? site.workshopSummary.matchedSkills : [],
              source: typeof site.workshopSummary.source === 'string' ? site.workshopSummary.source : null,
            }
          : null,
        coverageNote: typeof site.coverageNote === 'string' ? site.coverageNote : null,
        staffingWarning: typeof site.staffingWarning === 'string' ? site.staffingWarning : null,
        excludedEmployees: Array.isArray(site.excludedEmployees) ? site.excludedEmployees : [],
      };
    }),
  };
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
  const x = useMemo(() => extraLabels(locale), [locale]);
  const [intakes, setIntakes] = useState<ProposalDraft[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Partial<ProposalDraft>>(emptyDraft);
  const [messages, setMessages] = useState<ProposalMessage[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [intakeListCollapsed, setIntakeListCollapsed] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationPayload | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [proposalGenerationStatus, setProposalGenerationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [recommendationStatus, setRecommendationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [proposalProgressStep, setProposalProgressStep] = useState(0);
  const [recommendationProgressStep, setRecommendationProgressStep] = useState(0);
  const [chatError, setChatError] = useState('');
  const [existingCustomerId, setExistingCustomerId] = useState('');
  const [lastResult, setLastResult] = useState<{ orderId?: string; customerId?: string } | null>(null);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [recordingPreview, setRecordingPreview] = useState<RecordingPreview | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceDebug, setVoiceDebug] = useState<VoiceDebugState | null>(null);
  const recorderRef = useRef<WavRecordingSession | NativeAudioRecordingSession | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechTranscriptRef = useRef('');
  const speechCancelledRef = useRef(false);
  const speechErrorRef = useRef<string | null>(null);
  const speechAutoStoppedRef = useRef(false);
  const speechStopRequestedRef = useRef(false);
  const speechRetryCountRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingModeRef = useRef<VoiceDebugState['mode'] | null>(null);
  const [supportsNativeRecording, setSupportsNativeRecording] = useState(false);
  const [supportsWavRecording, setSupportsWavRecording] = useState(false);
  const [voiceSupportChecked, setVoiceSupportChecked] = useState(false);
  const [explanationSite, setExplanationSite] = useState<{ siteIndex: number; siteName: string } | null>(null);
  const [explanationText, setExplanationText] = useState('');
  const [explanationStatus, setExplanationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [explanationError, setExplanationError] = useState('');
  const [portalReady, setPortalReady] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const supportsVoice = supportsNativeRecording || supportsWavRecording;
  const interactionLocked = busy || streaming || recording || transcribing || explanationStatus === 'running';
  const notMentioned = m.aiIntakePage.notMentioned;

  useEffect(() => {
    document.body.classList.add('ai-intake-page-active');
    return () => document.body.classList.remove('ai-intake-page-active');
  }, []);

  async function loadLists(preferredId?: string) {
    const [intakeRows, customerRows] = await Promise.all([
      apiGet<ProposalDraft[]>('/ai/intakes'),
      apiGet<Customer[]>('/customers'),
    ]);
    setIntakes(intakeRows);
    setCustomers(customerRows);
    const storedId = getStoredSelectedIntakeId();
    const rowIds = new Set(intakeRows.map((item) => item.id));
    const firstWithContent = intakeRows.find((item) => hasDraftContent(item));
    const nextId =
      (preferredId && rowIds.has(preferredId) ? preferredId : '') ||
      (selectedId && rowIds.has(selectedId) ? selectedId : '') ||
      (storedId && rowIds.has(storedId) ? storedId : '') ||
      firstWithContent?.id ||
      intakeRows[0]?.id ||
      '';
    if (nextId) {
      await loadIntake(nextId);
    } else {
      setProposalGenerationStatus('idle');
      setRecommendationStatus('idle');
      setExplanationSite(null);
      setExplanationText('');
      setExplanationError('');
      setExplanationStatus('idle');
      setSelectedId('');
      storeSelectedIntakeId('');
      setDraft(normalizeDraftValue({}));
      setMessages([]);
      setHistoryCollapsed(false);
      setRecommendations(null);
      setExistingCustomerId('');
    }
  }

  async function loadIntake(id: string) {
    const intake = await apiGet<ProposalDraft>(`/ai/intakes/${id}`);
    if (id !== selectedId) {
      setProposalGenerationStatus('idle');
      setRecommendationStatus('idle');
    }
    setExplanationSite(null);
    setExplanationText('');
    setExplanationError('');
    setExplanationStatus('idle');
    setSelectedId(id);
    storeSelectedIntakeId(id);
    setDraft(normalizeDraftValue({
      ...intake,
      currency: intake.currency || 'EUR',
    }));
    setMessages(intake.messages || []);
    setHistoryCollapsed(false);
    const nextRecommendations = normalizeRecommendations(intake.recommendedTeam);
    setRecommendations(nextRecommendations);
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
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobileLayout(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setSupportsNativeRecording(isNativeAudioRecordingSupported());
    setSupportsWavRecording(isWavRecordingSupported());
    setVoiceSupportChecked(true);
  }, []);

  useEffect(() => {
    if (proposalGenerationStatus !== 'running') {
      if (proposalGenerationStatus === 'idle') setProposalProgressStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      setProposalProgressStep((current) => (current + 1) % Math.max(1, x.proposalProgressSteps.length));
    }, 1600);
    return () => window.clearInterval(timer);
  }, [proposalGenerationStatus, x.proposalProgressSteps]);

  useEffect(() => {
    if (recommendationStatus !== 'running') {
      if (recommendationStatus === 'idle') setRecommendationProgressStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRecommendationProgressStep((current) => (current + 1) % Math.max(1, x.recommendationProgressSteps.length));
    }, 1600);
    return () => window.clearInterval(timer);
  }, [recommendationStatus, x.recommendationProgressSteps]);

  useEffect(() => {
    if (!recommendations) return;

    setDraft((current) => {
      const nextSites = normalizeProposalSites(current.proposedSites || []);
      let changed = false;

      for (const siteRecommendation of recommendations.sites) {
        const existing = nextSites[siteRecommendation.siteIndex] || normalizeProposalSite({ siteName: siteRecommendation.siteName });
        const merged = normalizeProposalSite({
          ...existing,
          siteName: existing.siteName || siteRecommendation.siteName,
          requiredSkills: existing.requiredSkills.length ? existing.requiredSkills : siteRecommendation.requiredSkills,
          requiredCertifications: existing.requiredCertifications.length
            ? existing.requiredCertifications
            : siteRecommendation.requiredCertifications,
          estimatedHours: existing.estimatedHours ?? siteRecommendation.estimatedHours,
          recommendedHeadcount: siteRecommendation.recommendedHeadcount,
          selectedInternalHeadcount:
            existing.selectedInternalHeadcount != null && !(
              existing.selectedInternalHeadcount === 0 &&
              siteRecommendation.coverageType !== 'workshop_only' &&
              siteRecommendation.selectedInternalHeadcount > 0
            )
              ? existing.selectedInternalHeadcount
              : siteRecommendation.selectedInternalHeadcount,
          assignedWorkshopName: existing.assignedWorkshopName || siteRecommendation.workshopSummary?.name || '',
          workshopCoveredSkills:
            existing.workshopCoveredSkills.length > 0
              ? existing.workshopCoveredSkills
              : siteRecommendation.workshopSummary?.coveredSkills || [],
          coverageType: existing.assignedWorkshopName
            ? existing.coverageType || siteRecommendation.coverageType
            : siteRecommendation.workshopSummary?.name
              ? siteRecommendation.coverageType
              : existing.coverageType || siteRecommendation.coverageType,
        });
        const currentSite = nextSites[siteRecommendation.siteIndex];
        if (JSON.stringify(currentSite) !== JSON.stringify(merged)) {
          nextSites[siteRecommendation.siteIndex] = merged;
          changed = true;
        }
      }

      return changed ? { ...current, proposedSites: nextSites } : current;
    });

  }, [recommendations]);

  const siteCount = useMemo(() => (draft.proposedSites || []).length, [draft.proposedSites]);
  const recommendationSiteMap = useMemo(() => new Map((recommendations?.sites || []).map((site) => [site.siteIndex, site])), [recommendations]);

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
      recordingModeRef.current = null;
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

  function formatVoiceDebugValue(value: string | number | null | undefined): string {
    if (value == null || value === '') return '-';
    return String(value);
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
      setVoiceDebug({
        mode: 'browser-speech',
        debugText: 'speech recognition ended without transcript or explicit error.',
        lastError: m.aiIntakePage.voiceNoSpeech,
      });
      setChatError(m.aiIntakePage.voiceNoSpeech);
      return;
    }

    const message = speechRecognitionErrorMessage(errorCode);
    if (message) {
      setVoiceDebug({
        mode: 'browser-speech',
        debugText: `speechError=${errorCode}`,
        lastError: message,
      });
      setChatError(message);
    } else if (autoStopped) {
      setVoiceNotice(m.aiIntakePage.voiceTooLong);
    }
  }

  async function startRecording() {
    clearVoiceFeedback();
    replaceRecordingPreview(null);
    setVoiceDebug(null);
    if (!supportsVoice) {
      setChatError(m.aiIntakePage.voiceUnsupported);
      return;
    }

    let lastError: unknown = new Error('UNSUPPORTED');
    const attemptDetails: string[] = [];
    let failedMode: VoiceDebugState['mode'] = supportsWavRecording ? 'wav-audio' : 'native-audio';

    if (supportsWavRecording) {
      try {
        const recorder = await startMonoWavRecording();
        recorderRef.current = recorder;
        recordingModeRef.current = 'wav-audio';
        setVoiceDebug({ mode: 'wav-audio', debugText: 'WAV recorder started.', lastError: null });
        recordingStartedAtRef.current = Date.now();
        setRecordingElapsedMs(0);
        setRecording(true);
        return;
      } catch (error) {
        recorderRef.current = null;
        setRecording(false);
        lastError = error;
        failedMode = 'wav-audio';
        attemptDetails.push(`wav-audio: ${recordingErrorMessage(error)}`);
      }
    }

    if (supportsNativeRecording) {
      try {
        const recorder = await startNativeAudioRecording();
        recorderRef.current = recorder;
        recordingModeRef.current = 'native-audio';
        setVoiceDebug({ mode: 'native-audio', debugText: 'Native audio recorder started as fallback.', lastError: null });
        recordingStartedAtRef.current = Date.now();
        setRecordingElapsedMs(0);
        setRecording(true);
        return;
      } catch (error) {
        recorderRef.current = null;
        setRecording(false);
        lastError = error;
        failedMode = 'native-audio';
        attemptDetails.push(`native-audio: ${recordingErrorMessage(error)}`);
      }
    }

    const message = recordingErrorMessage(lastError);
    setVoiceDebug({
      mode: failedMode,
      debugText: attemptDetails.join('\n') || 'No audio recorder could be started.',
      lastError: message,
    });
    setChatError(message);
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
    recordingModeRef.current = null;
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

    const currentRecordingMode = recordingModeRef.current || 'native-audio';
    recorderRef.current = null;
    recordingModeRef.current = null;
    recordingStartedAtRef.current = null;
    setRecording(false);
    clearVoiceFeedback();

    try {
      const result = await recorder.stop();
      setRecordingElapsedMs(result.durationMs);
      let uploadBlob = result.blob;
      let uploadMimeType = result.mimeType || 'audio/webm';
      let uploadFileName = result.fileName || 'ai-intake.webm';
      let uploadSizeBytes = result.blob.size;
      let previewPeak = result.peak;
      const debugNotes: string[] = [];

      if (typeof result.peak === 'number' && result.peak < 0.02) {
        debugNotes.push(`lowInputPeak=${result.peak.toFixed(3)}`);
      }

      if (currentRecordingMode === 'native-audio' && result.blob.size) {
        try {
          const transcoded = await transcodeBlobToMonoWav(result.blob);
          uploadBlob = transcoded.blob;
          uploadMimeType = transcoded.mimeType;
          uploadFileName = transcoded.fileName;
          uploadSizeBytes = transcoded.blob.size;
          previewPeak = transcoded.peak;
          debugNotes.push(
            `upload=wav gain=${transcoded.appliedGain.toFixed(2)} rawMime=${transcoded.originalMimeType} decodedPeak=${
              transcoded.originalPeak == null ? '-' : transcoded.originalPeak.toFixed(3)
            } uploadPeak=${transcoded.peak == null ? '-' : transcoded.peak.toFixed(3)}`
          );
        } catch (error) {
          debugNotes.push(`wavTranscodeFailed=${recordingErrorMessage(error)}`);
        }
      }

      replaceRecordingPreview({
        url: URL.createObjectURL(uploadBlob),
        durationMs: result.durationMs,
        sizeBytes: uploadSizeBytes,
        peak: previewPeak,
      });
      setVoiceDebug({
        mode: currentRecordingMode,
        mimeType: uploadMimeType,
        durationMs: result.durationMs,
        peak: previewPeak,
        sizeBytes: uploadSizeBytes,
        debugText: debugNotes.join(' | ') || null,
        lastError: null,
      });
      if (!result.blob.size || result.durationMs <= 0 || (typeof result.peak === 'number' && result.peak < 0.003)) {
        setChatError(m.aiIntakePage.voiceNoSpeech);
        if (autoStopped) setVoiceNotice(m.aiIntakePage.voiceTooLong);
        return;
      }

      const intakeId = await ensureSelectedIntakeId();
      if (!intakeId) return;

      const file = new File([uploadBlob], uploadFileName, { type: uploadMimeType });
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
      setVoiceDebug((current) => ({
        ...(current || { mode: currentRecordingMode }),
        mode: currentRecordingMode,
        provider: payload.provider,
        detectedLanguage: payload.detectedLanguage || null,
        durationMs: payload.durationMs ?? current?.durationMs ?? result.durationMs,
        debugText: [current?.debugText, payload.debugText].filter(Boolean).join(' | ') || null,
        lastError: null,
      }));
      const transcript = String(payload.transcript || '').trim();
      if (!transcript) {
        throw new Error(m.aiIntakePage.voiceNoSpeech);
      }

      setChatInput((current) => (current.trim() ? `${current.trimEnd()}\n${transcript}` : transcript));
      setVoiceNotice(
        autoStopped ? `${m.aiIntakePage.voiceTooLong} ${m.aiIntakePage.voiceReviewHint}` : m.aiIntakePage.voiceReviewHint
      );
    } catch (error) {
      const message = recordingErrorMessage(error);
      setVoiceDebug((current) => ({
        ...(current || { mode: currentRecordingMode }),
        mode: currentRecordingMode,
        lastError: message,
        debugText: [current?.debugText, error instanceof Error ? error.message : null].filter(Boolean).join(' | ') || null,
      }));
      setChatError(message);
    } finally {
      setTranscribing(false);
    }
  }

  async function clearMessages() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
    if (!window.confirm(m.aiIntakePage.clearConversationConfirm)) return;

    setBusy(true);
    try {
      const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}/messages`, 'DELETE');
      setDraft(normalizeDraftValue(updated));
      setMessages(updated.messages || []);
      setRecommendations(normalizeRecommendations(updated.recommendedTeam));
      setRecommendationStatus('idle');
      setProposalGenerationStatus('idle');
      closeRecommendationExplanation();
      setChatInput('');
      clearVoiceFeedback();
      replaceRecordingPreview(null);
      await loadLists(selectedId);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearAllFields() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
    if (!window.confirm(m.aiIntakePage.clearAllFieldsConfirm)) return;

    setBusy(true);
    try {
      const resetPayload = {
        status: 'intake',
        customerCompanyName: null,
        customerStreet: null,
        customerZipCode: null,
        customerCity: null,
        customerCountry: 'DE',
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        summary: null,
        orderTitle: null,
        orderDescription: null,
        proposedSites: [],
        requiredSkills: [],
        requiredCertifications: [],
        preferredStartDate: null,
        preferredEndDate: null,
        estimatedHours: null,
        estimatedPrice: null,
        currency: 'EUR',
        recommendedTeam: null,
        memorySummary: null,
        paymentDrafts: [],
        externalWorkshops: [],
        staffingPlan: null,
      };
      const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}`, 'PUT', resetPayload);
      setDraft(normalizeDraftValue(updated));
      setMessages(updated.messages || messages);
      setRecommendations(null);
      setRecommendationStatus('idle');
      setProposalGenerationStatus('idle');
      closeRecommendationExplanation();
      await loadLists(selectedId);
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
      setChatInput('');
      clearVoiceFeedback();
      replaceRecordingPreview(null);
      setRecommendations(null);
      setRecommendationStatus('idle');
      setProposalGenerationStatus('idle');
      closeRecommendationExplanation();
      await loadLists(created.id);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createIntakeRecord(): Promise<ProposalDraft> {
    return apiJson<ProposalDraft>('/ai/intakes', 'POST', {
      customerCompanyName: null,
      orderTitle: null,
    });
  }

  function buildDraftPayload() {
    return {
      ...draft,
      estimatedHours: draft.estimatedHours === '' ? null : Number(draft.estimatedHours),
      estimatedPrice: draft.estimatedPrice === '' ? null : Number(draft.estimatedPrice),
      paymentDrafts: (draft.paymentDrafts || []).map((payment) => ({
        ...payment,
        amount: payment.amount === '' || payment.amount == null ? null : Number(payment.amount),
        currency: payment.currency || draft.currency || 'EUR',
      })),
      externalWorkshops: draft.externalWorkshops || [],
    };
  }

  async function persistDraftSnapshot() {
    if (!selectedId) return null;
    const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}`, 'PUT', buildDraftPayload());
    setDraft(normalizeDraftValue(updated));
    setMessages(updated.messages || []);
    return updated;
  }

  async function saveDraft() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await persistDraftSnapshot();
      await loadLists(selectedId);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportProposalPdf() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
    const preview = typeof window !== 'undefined' ? window.open('', '_blank', 'noopener,noreferrer') : null;
    if (preview) {
      preview.document.write('<p style="font-family: sans-serif; padding: 16px;">Preparing PDF...</p>');
    }
    setBusy(true);
    try {
      await persistDraftSnapshot();
      const url = `${API_BASE}/ai/intakes/${selectedId}/pdf?locale=${encodeURIComponent(locale)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await safeMessage(res));
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (preview) {
        preview.location.href = objectUrl;
      } else if (typeof window !== 'undefined') {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error: any) {
      if (preview) {
        preview.close();
      }
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
    setStreamingAssistantId(assistantId);

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
      setStreamingAssistantId(null);
    }
  }

  async function generateProposal() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
    setProposalGenerationStatus('running');
    setProposalProgressStep(0);
    setBusy(true);
    try {
      const updated = await apiJson<ProposalDraft>(`/ai/intakes/${selectedId}/proposal`, 'POST');
      setDraft(normalizeDraftValue(updated));
      setMessages(updated.messages || []);
      setRecommendations(normalizeRecommendations(updated.recommendedTeam));
      setProposalGenerationStatus('done');
      await loadLists(selectedId);
    } catch (error: any) {
      setProposalGenerationStatus('error');
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function recommendAssignments() {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);
    await saveDraft();
    setRecommendationStatus('running');
    setRecommendationProgressStep(0);
    setBusy(true);
    try {
      const response = await apiJson<{ proposal: ProposalDraft; recommendations: RecommendationPayload }>(
        `/ai/intakes/${selectedId}/recommend-assignments`,
        'POST'
      );
      setDraft(normalizeDraftValue(response.proposal));
      setRecommendations(normalizeRecommendations(response.recommendations));
      setRecommendationStatus('done');
    } catch (error: any) {
      setRecommendationStatus('error');
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function explainRecommendation(siteIndex: number, siteName: string) {
    if (!selectedId) return alert(m.aiIntakePage.createIntakeFirst);

    setExplanationSite({ siteIndex, siteName });
    setExplanationText('');
    setExplanationError('');
    setExplanationStatus('running');
    setBusy(true);

    try {
      await persistDraftSnapshot();
      const response = await fetch(
        `${API_BASE}/ai/intakes/${selectedId}/recommend-assignments/${siteIndex}/explain/stream?locale=${encodeURIComponent(locale)}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error(await safeMessage(response));
      }
      if (!response.body) {
        throw new Error(m.aiIntakePage.browserStreamingUnsupported);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let full = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setExplanationText(full);
      }
      full += decoder.decode();
      setExplanationText(full);
      setExplanationStatus('done');
    } catch (error: any) {
      setExplanationStatus('error');
      setExplanationError(error.message || x.explanationFailed);
    } finally {
      setBusy(false);
    }
  }

  function closeRecommendationExplanation() {
    if (explanationStatus === 'running') return;
    setExplanationSite(null);
    setExplanationText('');
    setExplanationError('');
    setExplanationStatus('idle');
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
          siteAssignments: [],
          paymentDrafts: (draft.paymentDrafts || []).map((payment) => ({
            ...payment,
            amount: payment.amount === '' || payment.amount == null ? null : Number(payment.amount),
            currency: payment.currency || draft.currency || 'EUR',
          })),
        }
      );
      setDraft(normalizeDraftValue(response.proposal));
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
        normalizeProposalSite({
          estimatedHours: null,
          recommendedHeadcount: null,
          selectedInternalHeadcount: null,
          coverageType: 'workshop_only',
        }),
      ],
    }));
  }

  function removeSite(index: number) {
    setDraft((current) => ({
      ...current,
      proposedSites: (current.proposedSites || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }


  function updatePaymentDraft(index: number, patch: Partial<PaymentDraft>) {
    setDraft((current) => {
      const next = [...(current.paymentDrafts || [])];
      next[index] = { ...next[index], ...patch };
      return { ...current, paymentDrafts: next };
    });
  }

  function addPaymentDraft() {
    setDraft((current) => ({
      ...current,
      paymentDrafts: [
        ...(current.paymentDrafts || []),
        {
          type: 'deposit',
          status: 'planned',
          amount: '',
          currency: current.currency || 'EUR',
          dueDate: '',
          paidDate: '',
          method: '',
          reference: '',
          notes: '',
        },
      ],
    }));
  }

  function removePaymentDraft(index: number) {
    setDraft((current) => ({
      ...current,
      paymentDrafts: (current.paymentDrafts || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateExternalWorkshop(index: number, patch: Partial<ExternalWorkshopDraft>) {
    setDraft((current) => {
      const next = [...(current.externalWorkshops || [])];
      next[index] = { ...next[index], ...patch };
      return { ...current, externalWorkshops: next };
    });
  }

  function addExternalWorkshop() {
    setDraft((current) => ({
      ...current,
      externalWorkshops: [
        ...(current.externalWorkshops || []),
        {
          name: '',
          contactName: '',
          phone: '',
          email: '',
          specialties: [],
          suggestedFor: [],
          relationshipStatus: 'known',
          notes: '',
        },
      ],
    }));
  }

  function removeExternalWorkshop(index: number) {
    setDraft((current) => ({
      ...current,
      externalWorkshops: (current.externalWorkshops || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function formatFactValue(value: unknown): string {
    if (value == null) return '-';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function workshopOptionsForSite(siteIndex: number): WorkshopRecommendation[] {
    const suggestionMap = new Map<string, WorkshopRecommendation>();
    const recommendationSite = recommendationSiteMap.get(siteIndex);
    for (const workshop of recommendationSite?.workshopRecommendations || []) {
      if (workshop.name) suggestionMap.set(workshop.name, workshop);
    }
    for (const workshop of draft.externalWorkshops || []) {
      if (workshop.name && !suggestionMap.has(workshop.name)) {
        suggestionMap.set(workshop.name, {
          kind: 'draft_external_workshop',
          name: workshop.name,
          score: 0,
          matchedSkills: workshop.specialties || [],
          relationshipStatus: workshop.relationshipStatus || null,
          notes: workshop.notes || null,
          reason: null,
        });
      }
    }
    const currentSite = (draft.proposedSites || [])[siteIndex];
    const currentWorkshopName = String(currentSite?.assignedWorkshopName || '').trim();
    if (currentWorkshopName && !suggestionMap.has(currentWorkshopName)) {
      suggestionMap.set(currentWorkshopName, {
        kind: 'selected_workshop',
        name: currentWorkshopName,
        score: 0,
        matchedSkills: currentSite?.workshopCoveredSkills || [],
        relationshipStatus: null,
        notes: null,
        reason: null,
      });
    }
    return [...suggestionMap.values()];
  }

  function updateAssignedWorkshop(siteIndex: number, workshopName: string) {
    const currentSite = normalizeProposalSite((draft.proposedSites || [])[siteIndex]);
    const normalizedWorkshop = workshopName.trim();
    if (!normalizedWorkshop) {
      updateSite(siteIndex, {
        assignedWorkshopName: '',
        workshopCoveredSkills: [],
        coverageType: 'workshop_only',
      });
      return;
    }
    const matchedWorkshop = workshopOptionsForSite(siteIndex).find((item) => item.name === normalizedWorkshop);
    const coveredSkills = currentSite.workshopCoveredSkills.length
      ? currentSite.workshopCoveredSkills
      : matchedWorkshop?.matchedSkills || currentSite.requiredSkills || [];
    updateSite(siteIndex, {
      assignedWorkshopName: normalizedWorkshop,
      coverageType: currentSite.coverageType === 'mixed_with_workshop' ? 'mixed_with_workshop' : 'workshop_only',
      workshopCoveredSkills: coveredSkills,
      selectedInternalHeadcount: 0,
    });
  }

  function updateSiteCoverageType(siteIndex: number, coverageType: ProposalCoverageType) {
    updateSite(siteIndex, { coverageType, selectedInternalHeadcount: 0 });
  }

  const siteTotal = (draft.proposedSites || []).length;
  const missingWorkshopCount = (draft.proposedSites || []).filter((site) => !(site.assignedWorkshopName || '').trim()).length;
  const paymentDraftCount = (draft.paymentDrafts || []).length;
  const hasProposalDraft = Boolean(draft.orderTitle || draft.customerCompanyName || siteTotal > 0);
  const workflowSteps = [
    {
      label: x.stepChat,
      description: x.stepChatDesc,
      state: messages.length > 0 ? 'done' : 'active',
    },
    {
      label: x.stepProposal,
      description: x.stepProposalDesc,
      state: hasProposalDraft ? 'done' : messages.length > 0 ? 'active' : 'idle',
    },
    {
      label: x.stepWorkshops,
      description: x.stepWorkshopsDesc,
      state: recommendationStatus === 'done' || (missingWorkshopCount === 0 && siteTotal > 0) ? 'done' : hasProposalDraft ? 'active' : 'idle',
    },
    {
      label: x.stepConfirm,
      description: x.stepConfirmDesc,
      state: lastResult?.orderId ? 'done' : recommendationStatus === 'done' ? 'active' : 'idle',
    },
  ];
  const quickExamples = [x.exampleProjectBasics, x.exampleScope, x.examplePaymentWorkshop];
  const selectedIntake = intakes.find((item) => item.id === selectedId);

  const intakeSidebar = (
<div className="card ai-intake-sidebar">
    <div className="ai-intake-sidebar-header">
      <div>
        <h2>{m.aiIntakePage.intake}</h2>
        <div className="muted">{m.aiIntakePage.flow}</div>
      </div>
      <div className="ai-intake-sidebar-actions">
        <button
          className="btn with-icon"
          onClick={() => setIntakeListCollapsed((current) => !current)}
          disabled={intakes.length === 0}
        >
          <Icon name={intakeListCollapsed ? 'info' : 'x'} />
          {intakeListCollapsed ? x.expandHistory : x.collapseHistory}
        </button>
        <button className="btn primary with-icon" onClick={createIntake} disabled={interactionLocked}>
          <Icon name="plus" />
          {m.common.createNew}
        </button>
      </div>
    </div>
    <div className="spacer" />
    {intakeListCollapsed ? (
      <div className="ai-intake-list-collapsed">
        <strong>{x.historyCollapsed}</strong>
        <div className="muted">
          {selectedIntake?.orderTitle || selectedIntake?.customerCompanyName || m.aiIntakePage.unnamed}
        </div>
        <div className="muted">{intakes.length} {x.conversationMessages}</div>
      </div>
    ) : (
      <div className="ai-intake-list">
        {intakes.map((item) => (
          <button
            key={item.id}
            className="btn ai-intake-list-item"
            style={{
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
    )}
      </div>
  );

  return (
    <>
      {portalReady && !isMobileLayout && createPortal(intakeSidebar, document.body)}

      <div className="ai-intake-shell">
        {isMobileLayout && intakeSidebar}
        <div className="ai-intake-main">
        <section className="card ai-intake-hero">
          <div>
            <div className="eyebrow">{x.importantOnly}</div>
            <h1>{x.workflowTitle}</h1>
            <p>{x.workflowSubtitle}</p>
          </div>
          <div className="ai-intake-steps">
            {workflowSteps.map((step, index) => (
              <div key={step.label} className={`ai-intake-step ${step.state}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="ai-intake-snapshot">
            <div>
              <label>{x.conversationMessages}</label>
              <strong>{messages.length}</strong>
            </div>
            <div>
              <label>{x.sitesCount}</label>
              <strong>{siteTotal}</strong>
            </div>
            <div>
              <label>{x.missingWorkshops}</label>
              <strong>{missingWorkshopCount}</strong>
            </div>
            <div>
              <label>{x.paymentsCount}</label>
              <strong>{paymentDraftCount}</strong>
            </div>
          </div>
          <div className="muted">{x.readyHint}</div>
        </section>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>{m.aiIntakePage.conversation}</h2>
              <div className="muted">{m.aiIntakePage.conversationDesc}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn with-icon" onClick={generateProposal} disabled={!selectedId || interactionLocked}>
                <Icon name="sparkles" />
                {proposalGenerationStatus === 'running' ? x.proposalGeneratingButton : m.aiIntakePage.generateProposal}
              </button>
              <button className="btn with-icon" onClick={saveDraft} disabled={!selectedId || interactionLocked}>
                <Icon name="save" />
                {m.aiIntakePage.saveDraft}
              </button>
              <button className="btn with-icon" onClick={clearMessages} disabled={!selectedId || interactionLocked}>
                <Icon name="trash" />
                {m.aiIntakePage.clearConversation}
              </button>
              <button className="btn danger with-icon" onClick={clearAllFields} disabled={!selectedId || interactionLocked}>
                <Icon name="x" />
                {m.aiIntakePage.clearAllFields}
              </button>
            </div>
          </div>

          {proposalGenerationStatus !== 'idle' && (
            <>
              <div className="spacer" />
              <div
                className="card"
                aria-live="polite"
                style={{
                  borderColor:
                    proposalGenerationStatus === 'error'
                      ? 'rgba(255,80,80,0.5)'
                      : proposalGenerationStatus === 'done'
                        ? 'rgba(34,197,94,0.45)'
                        : 'rgba(96,165,250,0.45)',
                }}
              >
                {proposalGenerationStatus === 'running' && x.proposalProgressSteps[proposalProgressStep % x.proposalProgressSteps.length]}
                {proposalGenerationStatus === 'done' && x.proposalGenerated}
                {proposalGenerationStatus === 'error' && x.proposalGenerationFailed}
              </div>
            </>
          )}

          <div className="spacer" />
          {messages.length === 0 && (
            <div className="ai-quick-prompts">
              <div>
                <strong>{x.quickExamplesTitle}</strong>
                <div className="muted">{x.quickExamplesDesc}</div>
              </div>
              <div className="ai-quick-prompt-grid">
                {quickExamples.map((example, index) => (
                  <button
                    key={index}
                    type="button"
                    className="ai-quick-prompt"
                    onClick={() => setChatInput(example)}
                    disabled={interactionLocked}
                  >
                    <span>{x.useExample}</span>
                    <p>{example}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="spacer" />
          <div className="ai-chat-history-box">
            <div className="ai-chat-history-header">
              <div>
                <strong>{x.messageHistory}</strong>
                <div className="muted">{messages.length} {x.conversationMessages}</div>
              </div>
              <button
                className="btn with-icon"
                onClick={() => setHistoryCollapsed((current) => !current)}
                disabled={messages.length === 0}
              >
                <Icon name={historyCollapsed ? 'info' : 'x'} />
                {historyCollapsed ? x.expandHistory : x.collapseHistory}
              </button>
            </div>
            {historyCollapsed ? (
              <div className="ai-chat-history-collapsed">
                <strong>{x.historyCollapsed}</strong>
                {messages.length > 0 && (
                  <div className="muted">
                    {x.latestMessage}: {messages[messages.length - 1]?.content.slice(0, 140)}
                    {(messages[messages.length - 1]?.content.length || 0) > 140 ? '...' : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="ai-chat-thread">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`ai-chat-message ${message.role}`}
                  >
                    <div className="ai-chat-role">
                      {message.role === 'assistant' ? m.aiIntakePage.assistant : m.aiIntakePage.manager}
                    </div>
                    {message.content ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  ) : streaming && streamingAssistantId === message.id ? (
                    <div className="ai-writing-indicator" aria-live="polite">
                      <span />
                      <span />
                      <span />
                      <em>{m.aiIntakePage.streaming}</em>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  )}
                  </div>
                ))}
                {messages.length === 0 && <div className="muted">{m.aiIntakePage.noConversation}</div>}
              </div>
            )}
          </div>

          <div className="spacer" />
          <div className="ai-chat-composer">
            <textarea
              value={chatInput}
              onChange={(event) => {
                setChatInput(event.target.value);
                if (voiceNotice) setVoiceNotice('');
              }}
              placeholder={m.aiIntakePage.messagePlaceholder}
            />
            <div className="ai-chat-composer-actions">
              <button className="btn primary with-icon" onClick={sendMessage} disabled={interactionLocked || !chatInput.trim()}>
                <Icon name="send" />
                {streaming ? m.aiIntakePage.streaming : m.aiIntakePage.sendMessage}
              </button>
            </div>
          </div>
          <div className="spacer" />
          {voiceSupportChecked ? (
            supportsVoice ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {!recording ? (
                  <button className="btn with-icon" onClick={startRecording} disabled={interactionLocked}>
                    <Icon name="mic" />
                    {m.aiIntakePage.voiceStart}
                  </button>
                ) : (
                  <>
                    <button className="btn with-icon" onClick={() => void stopRecording()} disabled={transcribing}>
                      <Icon name="stop" />
                      {m.aiIntakePage.voiceStop}
                    </button>
                    <button className="btn with-icon" onClick={() => void cancelRecording()} disabled={transcribing}>
                      <Icon name="x" />
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
            )
          ) : (
            <div className="muted">...</div>
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
          {voiceDebug && (
            <>
              <div className="spacer" />
              <details className="ai-debug-panel">
                <summary>{x.voiceDiagnostics}</summary>
                <div className="muted">mode: {formatVoiceDebugValue(voiceDebug.mode)}</div>
                <div className="muted">mimeType: {formatVoiceDebugValue(voiceDebug.mimeType)}</div>
                <div className="muted">durationMs: {formatVoiceDebugValue(voiceDebug.durationMs)}</div>
                <div className="muted">peak: {voiceDebug.peak == null ? '-' : voiceDebug.peak.toFixed(3)}</div>
                <div className="muted">sizeBytes: {formatVoiceDebugValue(voiceDebug.sizeBytes)}</div>
                <div className="muted">provider: {formatVoiceDebugValue(voiceDebug.provider)}</div>
                <div className="muted">detectedLanguage: {formatVoiceDebugValue(voiceDebug.detectedLanguage)}</div>
                <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>details: {formatVoiceDebugValue(voiceDebug.debugText)}</div>
                <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>lastError: {formatVoiceDebugValue(voiceDebug.lastError)}</div>
              </details>
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
          <div className="muted">{x.hiddenMemoryClear}</div>
        </div>

        {SHOW_AI_FACTS && (
          <div className="card">
            <h2>{x.memoryTitle}</h2>
            <div className="muted">{x.memoryDesc}</div>
            <div className="spacer" />
            {(draft.facts || []).length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {(draft.facts || []).map((fact) => (
                  <div key={fact.id} className="card">
                    <div style={{ fontWeight: 700 }}>
                      {fact.category}: {fact.key}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{formatFactValue(fact.value)}</div>
                    {fact.confidence != null && <div className="muted">Confidence: {String(fact.confidence)}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">{x.noFacts}</div>
            )}
          </div>
        )}

        <div className="card ai-proposal-card">
          <div className="ai-section-header">
            <div>
              <h2>{m.aiIntakePage.proposal}</h2>
              <div className="muted">{m.aiIntakePage.proposalDesc}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn with-icon" onClick={exportProposalPdf} disabled={!selectedId || interactionLocked}>
                <Icon name="file" />
                {m.aiIntakePage.exportProposalPdf}
              </button>
              <div className="muted">
                {m.common.status}: {draft.status || 'intake'}
              </div>
            </div>
          </div>

          <div className="spacer" />
          <div className="row">
            <div>
              <label>{m.aiIntakePage.companyName}</label>
              <input
                placeholder={notMentioned}
                value={draft.customerCompanyName || ''}
                onChange={(event) => setDraft((current) => ({ ...current, customerCompanyName: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.contactName}</label>
              <input
                placeholder={notMentioned}
                value={draft.contactName || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactName: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.contactPhone}</label>
              <input
                placeholder={notMentioned}
                value={draft.contactPhone || ''}
                onChange={(event) => setDraft((current) => ({ ...current, contactPhone: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.contactEmail}</label>
              <input
                placeholder={notMentioned}
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
                placeholder={notMentioned}
                value={draft.orderTitle || ''}
                onChange={(event) => setDraft((current) => ({ ...current, orderTitle: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.periodStart}</label>
              <input
                type="date"
                placeholder={notMentioned}
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
                placeholder={notMentioned}
                value={draft.preferredEndDate ? String(draft.preferredEndDate).substring(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preferredEndDate: event.target.value || null }))
                }
              />
            </div>
            <div>
              <label>{m.aiIntakePage.totalHours}</label>
              <input
                placeholder={notMentioned}
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
                placeholder={notMentioned}
                value={listText(draft.requiredSkills)}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, requiredSkills: parseList(event.target.value) }))
                }
              />
            </div>
            <div>
              <label>{m.aiIntakePage.requiredCertifications}</label>
              <textarea
                placeholder={notMentioned}
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
              placeholder={notMentioned}
              value={draft.summary || ''}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
            />
          </div>

          <div className="spacer" />
          <div>
            <label>{m.aiIntakePage.orderDescription}</label>
            <textarea
              placeholder={notMentioned}
              value={draft.orderDescription || ''}
              onChange={(event) => setDraft((current) => ({ ...current, orderDescription: event.target.value }))}
            />
          </div>

          <div className="spacer" />
          <div className="ai-section-header compact">
            <h2>{m.common.sites}</h2>
            <button className="btn with-icon" onClick={addSite}><Icon name="plus" />{m.aiIntakePage.addSite}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.proposedSites || []).map((site, index) => (
              <div key={`${site.siteName}-${index}`} className="card ai-form-card ai-site-card">
                <div className="ai-form-card-header">
                  <div>
                    <strong>{m.aiIntakePage.siteLabel} {index + 1}</strong>
                    <div className="muted">{site.siteName || notMentioned}</div>
                  </div>
                  <button className="btn danger with-icon" onClick={() => removeSite(index)}><Icon name="trash" />{m.common.remove}</button>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{m.common.name}</label>
                    <input
                      placeholder={notMentioned}
                      value={site.siteName || ''}
                      onChange={(event) => updateSite(index, { siteName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{m.common.street}</label>
                    <input
                      placeholder={notMentioned}
                      value={site.street || ''}
                      onChange={(event) => updateSite(index, { street: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{m.common.zipCode}</label>
                    <input
                      placeholder={notMentioned}
                      value={site.zipCode || ''}
                      onChange={(event) => updateSite(index, { zipCode: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{m.common.city}</label>
                    <input
                      placeholder={notMentioned}
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
                      placeholder={notMentioned}
                      value={listText(site.requiredSkills)}
                      onChange={(event) => updateSite(index, { requiredSkills: parseList(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label>{m.common.certifications}</label>
                    <textarea
                      placeholder={notMentioned}
                      value={listText(site.requiredCertifications)}
                      onChange={(event) =>
                        updateSite(index, { requiredCertifications: parseList(event.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label>{m.common.hours}</label>
                    <input
                      placeholder={notMentioned}
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
                <div className="row">
                  <div>
                    <label>{x.assignedWorkshop}</label>
                    <input
                      placeholder={notMentioned}
                      value={site.assignedWorkshopName || ''}
                      onChange={(event) => updateSite(index, { assignedWorkshopName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label>{x.staffingCoverage}</label>
                    <select
                      value={normalizeCoverageType(site.coverageType, site.assignedWorkshopName)}
                      onChange={(event) =>
                        updateSite(index, {
                          coverageType: event.target.value as ProposalCoverageType,
                        })
                      }
                    >
                      <option value="workshop_only">{x.workshopOnly}</option>
                      <option value="mixed_with_workshop">{x.mixedWithWorkshop}</option>
                    </select>
                  </div>
                  <div>
                    <label>{x.workshopCoveredSkills}</label>
                    <textarea
                      placeholder={notMentioned}
                      value={listText(site.workshopCoveredSkills)}
                      onChange={(event) => updateSite(index, { workshopCoveredSkills: parseList(event.target.value) })}
                    />
                  </div>
                </div>
                <div className="spacer" />
                <label>{m.common.notes}</label>
                <textarea
                  placeholder={notMentioned}
                  value={site.notes || ''}
                  onChange={(event) => updateSite(index, { notes: event.target.value })}
                />
              </div>
            ))}
            {siteCount === 0 && <div className="muted">{m.aiIntakePage.noSites}</div>}
          </div>

          <div className="spacer" />
          <div className="ai-section-header compact">
            <h2>{x.externalWorkshops}</h2>
            <button className="btn with-icon" onClick={addExternalWorkshop}><Icon name="wrench" />{x.addWorkshop}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.externalWorkshops || []).map((workshop, index) => (
              <div key={`${workshop.name}-${index}`} className="card ai-form-card ai-workshop-card">
                <div className="ai-form-card-header">
                  <div>
                    <strong>{workshop.name || `${x.externalWorkshops} ${index + 1}`}</strong>
                    <div className="muted">{listText(workshop.specialties) || notMentioned}</div>
                  </div>
                  <button className="btn danger with-icon" onClick={() => removeExternalWorkshop(index)}><Icon name="trash" />{m.common.remove}</button>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{m.common.name}</label>
                    <input placeholder={notMentioned} value={workshop.name || ''} onChange={(event) => updateExternalWorkshop(index, { name: event.target.value })} />
                  </div>
                  <div>
                    <label>{m.aiIntakePage.contactName}</label>
                    <input placeholder={notMentioned} value={workshop.contactName || ''} onChange={(event) => updateExternalWorkshop(index, { contactName: event.target.value })} />
                  </div>
                  <div>
                    <label>{m.aiIntakePage.contactPhone}</label>
                    <input placeholder={notMentioned} value={workshop.phone || ''} onChange={(event) => updateExternalWorkshop(index, { phone: event.target.value })} />
                  </div>
                  <div>
                    <label>{m.aiIntakePage.contactEmail}</label>
                    <input placeholder={notMentioned} value={workshop.email || ''} onChange={(event) => updateExternalWorkshop(index, { email: event.target.value })} />
                  </div>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{x.specialties}</label>
                    <textarea placeholder={notMentioned} value={listText(workshop.specialties)} onChange={(event) => updateExternalWorkshop(index, { specialties: parseList(event.target.value) })} />
                  </div>
                  <div>
                    <label>{x.suggestedFor}</label>
                    <textarea placeholder={notMentioned} value={listText(workshop.suggestedFor)} onChange={(event) => updateExternalWorkshop(index, { suggestedFor: parseList(event.target.value) })} />
                  </div>
                  <div>
                    <label>{x.relation}</label>
                    <select value={workshop.relationshipStatus || 'known'} onChange={(event) => updateExternalWorkshop(index, { relationshipStatus: event.target.value })}>
                      <option value="known">known</option>
                      <option value="preferred">preferred</option>
                      <option value="one_time">one_time</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </div>
                </div>
                <div className="spacer" />
                <label>{m.common.notes}</label>
                <textarea placeholder={notMentioned} value={workshop.notes || ''} onChange={(event) => updateExternalWorkshop(index, { notes: event.target.value })} />
              </div>
            ))}
            {(draft.externalWorkshops || []).length === 0 && <div className="muted">{x.noWorkshops}</div>}
          </div>

          <div className="spacer" />
          <div className="ai-section-header compact">
            <h2>{x.paymentDrafts}</h2>
            <button className="btn with-icon" onClick={addPaymentDraft}><Icon name="bill" />{x.addPayment}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.paymentDrafts || []).map((payment, index) => (
              <div key={`${payment.type}-${index}`} className="card ai-form-card ai-payment-card">
                <div className="ai-form-card-header">
                  <div>
                    <strong>{x.paymentDrafts} {index + 1}</strong>
                    <div className="muted">{payment.amount ? `${payment.amount} ${payment.currency || draft.currency || 'EUR'}` : notMentioned}</div>
                  </div>
                  <button className="btn danger with-icon" onClick={() => removePaymentDraft(index)}><Icon name="trash" />{m.common.remove}</button>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{x.paymentType}</label>
                    <select value={payment.type || 'deposit'} onChange={(event) => updatePaymentDraft(index, { type: event.target.value })}>
                      <option value="deposit">deposit</option>
                      <option value="advance">advance</option>
                      <option value="installment">installment</option>
                      <option value="final">final</option>
                      <option value="other">other</option>
                    </select>
                  </div>
                  <div>
                    <label>{x.paymentStatus}</label>
                    <select value={payment.status || 'planned'} onChange={(event) => updatePaymentDraft(index, { status: event.target.value })}>
                      <option value="planned">planned</option>
                      <option value="received">received</option>
                      <option value="refunded">refunded</option>
                      <option value="canceled">canceled</option>
                    </select>
                  </div>
                  <div>
                    <label>{x.amount}</label>
                    <input placeholder={notMentioned} value={payment.amount ?? ''} onChange={(event) => updatePaymentDraft(index, { amount: event.target.value })} />
                  </div>
                  <div>
                    <label>{m.aiIntakePage.currency}</label>
                    <input placeholder={notMentioned} value={payment.currency || draft.currency || 'EUR'} onChange={(event) => updatePaymentDraft(index, { currency: event.target.value })} />
                  </div>
                </div>
                <div className="spacer" />
                <div className="row">
                  <div>
                    <label>{x.dueDate}</label>
                    <input type="date" placeholder={notMentioned} value={payment.dueDate ? String(payment.dueDate).substring(0, 10) : ''} onChange={(event) => updatePaymentDraft(index, { dueDate: event.target.value || null })} />
                  </div>
                  <div>
                    <label>{x.paidDate}</label>
                    <input type="date" placeholder={notMentioned} value={payment.paidDate ? String(payment.paidDate).substring(0, 10) : ''} onChange={(event) => updatePaymentDraft(index, { paidDate: event.target.value || null })} />
                  </div>
                  <div>
                    <label>{x.method}</label>
                    <input placeholder={notMentioned} value={payment.method || ''} onChange={(event) => updatePaymentDraft(index, { method: event.target.value })} />
                  </div>
                  <div>
                    <label>{x.reference}</label>
                    <input placeholder={notMentioned} value={payment.reference || ''} onChange={(event) => updatePaymentDraft(index, { reference: event.target.value })} />
                  </div>
                </div>
                <div className="spacer" />
                <label>{m.common.notes}</label>
                <textarea placeholder={notMentioned} value={payment.notes || ''} onChange={(event) => updatePaymentDraft(index, { notes: event.target.value })} />
              </div>
            ))}
            {(draft.paymentDrafts || []).length === 0 && <div className="muted">{x.noPayments}</div>}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>{x.workshopReviewTitle}</h2>
              <div className="muted">{x.workshopReviewDescription}</div>
            </div>
            <button className="btn primary with-icon" onClick={recommendAssignments} disabled={!selectedId || interactionLocked}>
              <Icon name="wrench" />
              {recommendationStatus === 'running' ? x.recommendationCalculatingButton : x.reviewWorkshopsButton}
            </button>
          </div>

          {recommendationStatus !== 'idle' && (
            <>
              <div className="spacer" />
              <div
                className="card"
                aria-live="polite"
                style={{
                  borderColor:
                    recommendationStatus === 'error'
                      ? 'rgba(255,80,80,0.5)'
                      : recommendationStatus === 'done'
                        ? 'rgba(34,197,94,0.45)'
                        : 'rgba(96,165,250,0.45)',
                }}
              >
                {recommendationStatus === 'running' && x.workshopReviewRunning}
                {recommendationStatus === 'done' && x.workshopReviewDone}
                {recommendationStatus === 'error' && x.workshopReviewError}
              </div>
            </>
          )}

          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(recommendations?.sites || (draft.proposedSites || []).map((site, index) => ({
              siteIndex: index,
              siteName: site.siteName || `${m.common.site} ${index + 1}`,
              estimatedHours: Number(site.estimatedHours || 0),
              requiredSkills: site.requiredSkills || [],
              workshopRecommendations: [],
              coverageType: site.assignedWorkshopName ? 'workshop_only' : 'workshop_only',
              staffingWarning: !site.assignedWorkshopName ? x.noWorkshopAssignedWarning : null,
              coverageNote: site.assignedWorkshopName ? x.workshopAssignedForSite : x.workshopNeeded,
            }))).map((site) => {
              const siteDraft = normalizeProposalSite((draft.proposedSites || [])[site.siteIndex]);
              const workshopOptions = workshopOptionsForSite(site.siteIndex);
              const hasWorkshop = Boolean((siteDraft.assignedWorkshopName || '').trim());
              const coverageType = normalizeCoverageType(siteDraft.coverageType || site.coverageType, siteDraft.assignedWorkshopName);

              return (
                <div key={site.siteIndex} className="card ai-form-card ai-recommendation-card">
                  <div className="ai-form-card-header">
                    <div>
                      <strong>{site.siteName}</strong>
                      <div className="muted">{m.common.hours}: {site.estimatedHours || siteDraft.estimatedHours || notMentioned}</div>
                    </div>
                    <button
                      className="btn with-icon"
                      onClick={() => explainRecommendation(site.siteIndex, site.siteName)}
                      disabled={explanationStatus === 'running' && explanationSite?.siteIndex === site.siteIndex}
                    >
                      {explanationStatus === 'running' && explanationSite?.siteIndex === site.siteIndex
                        ? x.explainingRecommendationButton
                        : x.explainWorkshopDecision}
                      <Icon name="info" />
                    </button>
                  </div>

                  <div className="spacer" />
                  <div className="row">
                    <div>
                      <label>{m.common.skills}</label>
                      <div className="card" style={{ minHeight: 54 }}>{listText(site.requiredSkills || siteDraft.requiredSkills) || notMentioned}</div>
                    </div>
                    <div>
                      <label>{x.assignedWorkshop}</label>
                      <select
                        value={siteDraft.assignedWorkshopName || ''}
                        onChange={(event) => updateAssignedWorkshop(site.siteIndex, event.target.value)}
                      >
                        <option value="">{x.workshopNeeded}</option>
                        {workshopOptions.map((workshop, index) => (
                          <option key={`${workshop.kind}-${workshop.workshopId || workshop.draftIndex || index}`} value={workshop.name}>
                            {workshop.name}{workshop.matchedSkills.length ? ` (${listText(workshop.matchedSkills)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>{x.staffingCoverage}</label>
                      <select
                        value={coverageType}
                        onChange={(event) => updateSiteCoverageType(site.siteIndex, event.target.value as ProposalCoverageType)}
                      >
                        <option value="workshop_only">{x.workshopOnly}</option>
                        <option value="mixed_with_workshop">{x.mixedWithWorkshop}</option>
                      </select>
                    </div>
                    <div>
                      <label>{x.workshopCoveredSkills}</label>
                      <textarea
                        placeholder={notMentioned}
                        value={listText(siteDraft.workshopCoveredSkills)}
                        onChange={(event) => updateSite(site.siteIndex, { workshopCoveredSkills: parseList(event.target.value) })}
                      />
                    </div>
                  </div>

                  {workshopOptions.length > 0 && (
                    <>
                      <div className="spacer" />
                      <div className="card">
                        <div style={{ fontWeight: 700 }}>{x.workshopSuggestionsCompact}</div>
                        <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                          {workshopOptions
                            .map((workshop) => `${workshop.name}${workshop.matchedSkills.length ? ` (${listText(workshop.matchedSkills)})` : ''}${workshop.availabilityStatus === 'available' ? ` - ${x.availableLabel}` : ''}`)
                            .join(' | ')}
                        </div>
                      </div>
                    </>
                  )}
                  {site.coverageNote && (
                    <>
                      <div className="spacer" />
                      <div className="muted">{site.coverageNote}</div>
                    </>
                  )}
                  {site.staffingWarning && !hasWorkshop && (
                    <>
                      <div className="spacer" />
                      <div className="card" style={{ borderColor: 'rgba(245,158,11,0.45)' }}>{site.staffingWarning}</div>
                    </>
                  )}
                </div>
              );
            })}
            {(draft.proposedSites || []).length === 0 && <div className="muted">{m.aiIntakePage.noSites}</div>}
          </div>
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
                placeholder={notMentioned}
                value={draft.estimatedPrice ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, estimatedPrice: event.target.value }))}
              />
            </div>
            <div>
              <label>{m.aiIntakePage.currency}</label>
              <input
                placeholder={notMentioned}
                value={draft.currency || 'EUR'}
                onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}
              />
            </div>
          </div>
          <div className="spacer" />
          <button className="btn primary with-icon" onClick={confirmProposal} disabled={!selectedId || interactionLocked}>
            <Icon name="check" />
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

      {explanationSite && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,12,18,0.72)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            zIndex: 50,
          }}
        >
          <div className="card" style={{ width: 'min(760px, 100%)', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{x.explanationTitle}</div>
                <div className="muted">{explanationSite.siteName}</div>
              </div>
              <button className="btn with-icon" onClick={closeRecommendationExplanation} disabled={explanationStatus === 'running'}>
                <Icon name="x" />
                {x.closeExplanation}
              </button>
            </div>

            {explanationStatus === 'running' && (
              <>
                <div className="spacer" />
                <div className="muted">{x.explanationStreaming}</div>
              </>
            )}

            {explanationError && (
              <>
                <div className="spacer" />
                <div className="card" style={{ borderColor: 'rgba(255,80,80,0.5)' }}>{explanationError}</div>
              </>
            )}

            <div className="spacer" />
            <div className="card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {explanationText || (explanationStatus === 'error' ? x.explanationFailed : x.explanationEmpty)}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

