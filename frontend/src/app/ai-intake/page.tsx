'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
      proposalGeneratingButton: "\u062c\u0627\u0631\u064a \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636...",
      proposalGenerating: "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0648\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636. \u0642\u062f \u064a\u0633\u062a\u063a\u0631\u0642 \u0647\u0630\u0627 \u0628\u0636\u0639 \u062b\u0648\u0627\u0646\u064d.",
      proposalGenerated: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636. \u064a\u0645\u0643\u0646\u0643 \u0645\u0631\u0627\u062c\u0639\u062a\u0647 \u0648\u062a\u0639\u062f\u064a\u0644\u0647 \u0627\u0644\u0622\u0646.",
      proposalGenerationFailed: "\u0641\u0634\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
      recommendationCalculatingButton: "\u062c\u0627\u0631\u064a \u062d\u0633\u0627\u0628 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a...",
      recommendationCalculating: "\u062c\u0627\u0631\u064a \u062d\u0633\u0627\u0628 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0648\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0648\u0627\u0644\u0633\u0639\u0629.",
      recommendationCalculated: "\u062a\u0645 \u062d\u0633\u0627\u0628 \u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646. \u0631\u0627\u062c\u0639 \u0627\u0644\u0628\u0637\u0627\u0642\u0627\u062a \u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0641\u0631\u064a\u0642 \u0627\u0644\u0646\u0647\u0627\u0626\u064a.",
      recommendationCalculationFailed: "\u0641\u0634\u0644 \u062d\u0633\u0627\u0628 \u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
      proposalProgressSteps: [
        "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629...",
        "\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0627\u0644\u062d\u0642\u0627\u0626\u0642 \u0648\u062a\u0648\u0632\u064a\u0639 \u0627\u0644\u0645\u0648\u0627\u0642\u0639...",
        "\u062c\u0627\u0631\u064a \u0628\u0646\u0627\u0621 \u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u0639\u0631\u0636 \u0648\u0627\u0644\u062f\u0641\u0639\u0627\u062a..."
      ],
      recommendationProgressSteps: [
        "\u062c\u0627\u0631\u064a \u0645\u0631\u0627\u062c\u0639\u0629 \u0645\u062a\u0637\u0644\u0628\u0627\u062a \u0643\u0644 \u0645\u0648\u0642\u0639...",
        "\u062c\u0627\u0631\u064a \u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0648\u0627\u0644\u0633\u0639\u0629 \u0627\u0644\u0645\u062a\u0627\u062d\u0629...",
        "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0627\u0644\u0641\u0631\u064a\u0642 \u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0644\u0643\u0644 \u0645\u0648\u0642\u0639..."
      ],
      hiddenMemoryClear: "\u062d\u0630\u0641 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u064a\u0645\u0633\u062d \u0647\u0630\u0647 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0641\u0642\u0637.",
      staffingCoverage: "\u062a\u063a\u0637\u064a\u0629 \u0627\u0644\u062a\u0646\u0641\u064a\u0630",
      internalOnly: "\u0645\u0648\u0638\u0641\u0648\u0646 \u062f\u0627\u062e\u0644\u064a\u0648\u0646 \u0641\u0642\u0637",
      mixedWithWorkshop: "\u0648\u0631\u0634\u0629 + \u0645\u0648\u0638\u0641\u0648\u0646 \u062f\u0627\u062e\u0644\u064a\u0648\u0646",
      workshopOnly: "\u0648\u0631\u0634\u0629 \u0641\u0642\u0637",
      assignedWorkshop: "\u0627\u0644\u0648\u0631\u0634\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629",
      noWorkshop: "\u0628\u062f\u0648\u0646 \u0648\u0631\u0634\u0629",
      workshopCoveredSkills: "\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u064a \u062a\u063a\u0637\u064a\u0647\u0627 \u0627\u0644\u0648\u0631\u0634\u0629",
      internalSkillsRemaining: "\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u062f\u0627\u062e\u0644\u064a\u0629 \u0627\u0644\u0645\u062a\u0628\u0642\u064a\u0629",
      aiRecommendedCount: "\u0639\u062f\u062f \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0645\u0646 \u0627\u0644\u0630\u0643\u0627\u0621",
      selectedInternalCount: "\u0639\u062f\u062f \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0627\u0644\u062f\u0627\u062e\u0644\u064a\u064a\u0646 \u0627\u0644\u0646\u0647\u0627\u0626\u064a",
      selectedTeam: "\u0627\u0644\u0641\u0631\u064a\u0642 \u0627\u0644\u0645\u062e\u062a\u0627\u0631",
      changeEmployees: "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646",
      hideEmployees: "\u0625\u062e\u0641\u0627\u0621 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646",
      noSelectedEmployees: "\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0648\u0638\u0641\u0648\u0646 \u062f\u0627\u062e\u0644\u064a\u0648\u0646 \u0645\u062d\u062f\u062f\u0648\u0646 \u0628\u0639\u062f.",
      noInternalEmployeesNeeded: "\u0644\u0627 \u064a\u0644\u0632\u0645 \u0645\u0648\u0638\u0641\u0648\u0646 \u062f\u0627\u062e\u0644\u064a\u0648\u0646 \u062d\u0627\u0644\u064a\u064b\u0627.",
      staffingCardDesc: "\u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u0631\u0634\u0629 \u0625\u0646 \u0644\u0632\u0645\u060c \u062b\u0645 \u062b\u0628\u062a \u0639\u062f\u062f \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0627\u0644\u062f\u0627\u062e\u0644\u064a\u064a\u0646 \u0648\u0633\u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062f \u0623\u0641\u0636\u0644 \u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627.",
      workshopSuggestionsCompact: "\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0627\u0644\u0648\u0631\u0634 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0648\u0642\u0639",
      alternativeEmployees: "\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646 \u0627\u0644\u0628\u062f\u0644\u0627\u0621 \u0648\u0627\u0644\u0623\u0633\u0628\u0627\u0628",
      explainRecommendation: "\u0644\u0645\u0627\u0630\u0627 \u0647\u0630\u0627 \u0627\u0644\u0639\u062f\u062f\u061f",
      explainingRecommendationButton: "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0633\u0628\u0628...",
      explanationTitle: "\u0634\u0631\u062d \u0627\u0642\u062a\u0631\u0627\u062d \u0627\u0644\u0639\u062f\u062f",
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
      proposalGeneratingButton: 'Generating proposal...',
      proposalGenerating: 'Analyzing the conversation and generating the proposal. This can take a few seconds.',
      proposalGenerated: 'Proposal generated. You can review and edit it now.',
      proposalGenerationFailed: 'Proposal generation failed. Check the error and try again.',
      recommendationCalculatingButton: 'Calculating suggestions...',
      recommendationCalculating: 'Calculating employee suggestions and reviewing skills and capacity.',
      recommendationCalculated: 'Employee suggestions are ready. Review the site cards and adjust the final team if needed.',
      recommendationCalculationFailed: 'Employee suggestions could not be calculated. Check the data and try again.',
      proposalProgressSteps: [
        'Analyzing the conversation...',
        'Extracting project facts and sites...',
        'Building the proposal draft and payments...'
      ],
      recommendationProgressSteps: [
        'Reviewing each site requirement...',
        'Comparing skills, certifications, and capacity...',
        'Preparing the suggested team for each site...'
      ],
      hiddenMemoryClear: 'Clearing removes only the current conversation.',
      staffingCoverage: 'Execution coverage',
      internalOnly: 'Internal employees only',
      mixedWithWorkshop: 'Workshop + internal employees',
      workshopOnly: 'Workshop only',
      assignedWorkshop: 'Assigned workshop',
      noWorkshop: 'No workshop',
      workshopCoveredSkills: 'Workshop-covered skills',
      internalSkillsRemaining: 'Remaining internal skills',
      aiRecommendedCount: 'AI-recommended internal count',
      selectedInternalCount: 'Final internal employee count',
      selectedTeam: 'Selected team',
      changeEmployees: 'Change employees',
      hideEmployees: 'Hide employee list',
      noSelectedEmployees: 'No internal employees selected yet.',
      noInternalEmployeesNeeded: 'No internal employees are currently required.',
      staffingCardDesc: 'Choose a workshop if needed, then confirm the internal employee count and the top candidates will be checked automatically.',
      workshopSuggestionsCompact: 'Workshop suggestions for this site',
      alternativeEmployees: 'Alternatives and excluded employees',
      explainRecommendation: 'Why this count?',
      explainingRecommendationButton: 'Explaining recommendation...',
      explanationTitle: 'Recommended count explanation',
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
    proposalGeneratingButton: 'Vorschlag wird erzeugt...',
    proposalGenerating: 'Konversation wird analysiert und der Vorschlag wird erzeugt. Das kann einige Sekunden dauern.',
    proposalGenerated: 'Vorschlag wurde erzeugt. Du kannst ihn jetzt pruefen und bearbeiten.',
    proposalGenerationFailed: 'Vorschlag konnte nicht erzeugt werden. Fehler pruefen und erneut versuchen.',
    recommendationCalculatingButton: 'Vorschlaege werden berechnet...',
    recommendationCalculating: 'Mitarbeitervorschlaege werden berechnet und Skills sowie Kapazitaet geprueft.',
    recommendationCalculated: 'Die Mitarbeitervorschlaege sind bereit. Baustellenkarten pruefen und Team bei Bedarf anpassen.',
    recommendationCalculationFailed: 'Die Mitarbeitervorschlaege konnten nicht berechnet werden. Daten pruefen und erneut versuchen.',
    proposalProgressSteps: [
      'Konversation wird analysiert...',
      'Projektfakten und Baustellen werden extrahiert...',
      'Angebotsentwurf und Zahlungen werden vorbereitet...'
    ],
    recommendationProgressSteps: [
      'Anforderungen je Baustelle werden geprueft...',
      'Skills, Zertifikate und Kapazitaet werden verglichen...',
      'Vorgeschlagenes Team je Baustelle wird vorbereitet...'
    ],
    hiddenMemoryClear: 'Loeschen entfernt nur die aktuelle Konversation.',
    staffingCoverage: 'Abdeckungsmodus',
    internalOnly: 'Nur interne Mitarbeiter',
    mixedWithWorkshop: 'Workshop + interne Mitarbeiter',
    workshopOnly: 'Nur Workshop',
    assignedWorkshop: 'Zugeordneter Workshop',
    noWorkshop: 'Kein Workshop',
    workshopCoveredSkills: 'Vom Workshop abgedeckte Skills',
    internalSkillsRemaining: 'Verbleibende interne Skills',
    aiRecommendedCount: 'KI-Empfehlung interne Mitarbeiter',
    selectedInternalCount: 'Finale Anzahl interner Mitarbeiter',
    selectedTeam: 'Ausgewaehltes Team',
    changeEmployees: 'Mitarbeiter anpassen',
    hideEmployees: 'Mitarbeiterliste ausblenden',
    noSelectedEmployees: 'Noch keine internen Mitarbeiter ausgewaehlt.',
    noInternalEmployeesNeeded: 'Aktuell werden keine internen Mitarbeiter benoetigt.',
    staffingCardDesc: 'Workshop bei Bedarf waehlen, interne Mitarbeiterzahl festlegen und die besten Namen werden automatisch markiert.',
    workshopSuggestionsCompact: 'Workshop-Vorschlaege fuer diese Baustelle',
    alternativeEmployees: 'Alternativen und ausgeschlossene Mitarbeiter',
    explainRecommendation: 'Warum diese Anzahl?',
    explainingRecommendationButton: 'Erklaerung wird erstellt...',
    explanationTitle: 'Erklaerung der empfohlenen Anzahl',
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
  if (!hasWorkshop) return 'internal_only';
  if (normalized === 'workshop_only') return 'workshop_only';
  return 'mixed_with_workshop';
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
  const [recommendations, setRecommendations] = useState<RecommendationPayload | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [proposalGenerationStatus, setProposalGenerationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [recommendationStatus, setRecommendationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [proposalProgressStep, setProposalProgressStep] = useState(0);
  const [recommendationProgressStep, setRecommendationProgressStep] = useState(0);
  const [chatError, setChatError] = useState('');
  const [siteSelections, setSiteSelections] = useState<Record<number, string[]>>({});
  const [expandedEmployeeSites, setExpandedEmployeeSites] = useState<Record<number, boolean>>({});
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
  const supportsVoice = supportsNativeRecording || supportsWavRecording;
  const interactionLocked = busy || streaming || recording || transcribing || explanationStatus === 'running';
  const notMentioned = m.aiIntakePage.notMentioned;

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
      setProposalGenerationStatus('idle');
      setRecommendationStatus('idle');
      setExplanationSite(null);
      setExplanationText('');
      setExplanationError('');
      setExplanationStatus('idle');
      setSelectedId('');
      setDraft(normalizeDraftValue({}));
      setMessages([]);
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
    setDraft(normalizeDraftValue({
      ...intake,
      currency: intake.currency || 'EUR',
    }));
    setMessages(intake.messages || []);
    const nextRecommendations = normalizeRecommendations(intake.recommendedTeam);
    setRecommendations(nextRecommendations);
    setSiteSelections({});
    setExpandedEmployeeSites({});
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

    setSiteSelections((current) => {
      let changed = false;
      const next = { ...current };
      for (const site of recommendations.sites) {
        if (!next[site.siteIndex] || next[site.siteIndex].length === 0) {
          next[site.siteIndex] = [...(site.autoSelectedEmployeeIds || [])];
          changed = true;
        }
      }
      return changed ? next : current;
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
      setSiteSelections({});
      setExpandedEmployeeSites({});
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
      setSiteSelections({});
      setExpandedEmployeeSites({});
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
      setSiteSelections({});
      setExpandedEmployeeSites({});
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
      setSiteSelections({});
      setExpandedEmployeeSites({});
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
          siteAssignments: Object.entries(siteSelections).map(([siteIndex, employeeIds]) => ({
            siteIndex: Number(siteIndex),
            employeeIds,
          })),
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
          coverageType: 'internal_only',
        }),
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
    setExpandedEmployeeSites((current) => {
      const next: Record<number, boolean> = {};
      Object.entries(current).forEach(([key, value]) => {
        const numericKey = Number(key);
        if (numericKey < index) next[numericKey] = value;
        if (numericKey > index) next[numericKey - 1] = value;
      });
      return next;
    });
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

  function autoSelectEmployeesForSite(siteIndex: number, headcount: number | null | undefined) {
    const nextCount = Math.max(0, Number(headcount || 0));
    const siteRecommendation = recommendationSiteMap.get(siteIndex);
    const nextSelection = nextCount > 0 ? (siteRecommendation?.recommendations || []).slice(0, nextCount).map((employee) => employee.employeeId) : [];
    setSiteSelections((current) => ({ ...current, [siteIndex]: nextSelection }));
    updateSite(siteIndex, { selectedInternalHeadcount: nextCount });
  }

  function toggleEmployee(siteIndex: number, employeeId: string) {
    let nextSelection: string[] = [];
    setSiteSelections((current) => {
      const currentSelection = current[siteIndex] || [];
      const exists = currentSelection.includes(employeeId);
      nextSelection = exists
        ? currentSelection.filter((value) => value !== employeeId)
        : [...currentSelection, employeeId];
      return {
        ...current,
        [siteIndex]: nextSelection,
      };
    });
    updateSite(siteIndex, { selectedInternalHeadcount: nextSelection.length });
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
    const recommendationSite = recommendationSiteMap.get(siteIndex);
    const currentSite = normalizeProposalSite((draft.proposedSites || [])[siteIndex]);
    const normalizedWorkshop = workshopName.trim();
    if (!normalizedWorkshop) {
      updateSite(siteIndex, {
        assignedWorkshopName: '',
        workshopCoveredSkills: [],
        coverageType: 'internal_only',
      });
      if ((currentSite.selectedInternalHeadcount ?? 0) === 0) {
        autoSelectEmployeesForSite(siteIndex, recommendationSite?.recommendedHeadcount ?? currentSite.recommendedHeadcount ?? 1);
      }
      return;
    }
    const matchedWorkshop = workshopOptionsForSite(siteIndex).find((item) => item.name === normalizedWorkshop);
    const coveredSkills = currentSite.workshopCoveredSkills.length
      ? currentSite.workshopCoveredSkills
      : matchedWorkshop?.matchedSkills || [];
    const nextCoverageType = currentSite.coverageType === 'workshop_only' ? 'workshop_only' : 'mixed_with_workshop';
    updateSite(siteIndex, {
      assignedWorkshopName: normalizedWorkshop,
      coverageType: nextCoverageType,
      workshopCoveredSkills: coveredSkills,
    });
    if (nextCoverageType === 'workshop_only') {
      autoSelectEmployeesForSite(siteIndex, 0);
    }
  }

  function updateSiteCoverageType(siteIndex: number, coverageType: ProposalCoverageType) {
    updateSite(siteIndex, { coverageType });
    if (coverageType === 'workshop_only') {
      autoSelectEmployeesForSite(siteIndex, 0);
      return;
    }
    const currentSite = normalizeProposalSite((draft.proposedSites || [])[siteIndex]);
    const nextHeadcount = currentSite.selectedInternalHeadcount ?? recommendationSiteMap.get(siteIndex)?.selectedInternalHeadcount ?? currentSite.recommendedHeadcount ?? 1;
    if (nextHeadcount <= 0) {
      autoSelectEmployeesForSite(siteIndex, recommendationSiteMap.get(siteIndex)?.recommendedHeadcount ?? 1);
    }
  }

  function selectedEmployeesForSite(site: RecommendationSite): RecommendationEmployee[] {
    const selectedIds = siteSelections[site.siteIndex] || [];
    return selectedIds
      .map((employeeId) => site.recommendations.find((employee) => employee.employeeId === employeeId) || null)
      .filter((employee): employee is RecommendationEmployee => Boolean(employee));
  }

  function toggleEmployeeList(siteIndex: number) {
    setExpandedEmployeeSites((current) => ({ ...current, [siteIndex]: !current[siteIndex] }));
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
                {proposalGenerationStatus === 'running' ? x.proposalGeneratingButton : m.aiIntakePage.generateProposal}
              </button>
              <button className="btn" onClick={saveDraft} disabled={!selectedId || interactionLocked}>
                {m.aiIntakePage.saveDraft}
              </button>
              <button className="btn" onClick={clearMessages} disabled={!selectedId || interactionLocked}>
                {m.aiIntakePage.clearConversation}
              </button>
              <button className="btn danger" onClick={clearAllFields} disabled={!selectedId || interactionLocked}>
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
          {voiceSupportChecked ? (
            supportsVoice ? (
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
              <div className="card" style={{ display: 'grid', gap: 6, borderColor: 'rgba(96,165,250,0.35)' }}>
                <div style={{ fontWeight: 700 }}>Voice Debug</div>
                <div className="muted">mode: {formatVoiceDebugValue(voiceDebug.mode)}</div>
                <div className="muted">mimeType: {formatVoiceDebugValue(voiceDebug.mimeType)}</div>
                <div className="muted">durationMs: {formatVoiceDebugValue(voiceDebug.durationMs)}</div>
                <div className="muted">peak: {voiceDebug.peak == null ? '-' : voiceDebug.peak.toFixed(3)}</div>
                <div className="muted">sizeBytes: {formatVoiceDebugValue(voiceDebug.sizeBytes)}</div>
                <div className="muted">provider: {formatVoiceDebugValue(voiceDebug.provider)}</div>
                <div className="muted">detectedLanguage: {formatVoiceDebugValue(voiceDebug.detectedLanguage)}</div>
                <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>details: {formatVoiceDebugValue(voiceDebug.debugText)}</div>
                <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>lastError: {formatVoiceDebugValue(voiceDebug.lastError)}</div>
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

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2>{m.aiIntakePage.proposal}</h2>
              <div className="muted">{m.aiIntakePage.proposalDesc}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={exportProposalPdf} disabled={!selectedId || interactionLocked}>
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
                  <div>
                    <label>{x.aiRecommendedCount}</label>
                    <input
                      type="number"
                      min={0}
                      placeholder={notMentioned}
                      value={site.recommendedHeadcount ?? ''}
                      onChange={(event) =>
                        updateSite(index, {
                          recommendedHeadcount: event.target.value ? Number(event.target.value) : null,
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
                      <option value="internal_only">{x.internalOnly}</option>
                      <option value="mixed_with_workshop">{x.mixedWithWorkshop}</option>
                      <option value="workshop_only">{x.workshopOnly}</option>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h2>{x.externalWorkshops}</h2>
            <button className="btn" onClick={addExternalWorkshop}>{x.addWorkshop}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.externalWorkshops || []).map((workshop, index) => (
              <div key={`${workshop.name}-${index}`} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{workshop.name || `${x.externalWorkshops} ${index + 1}`}</strong>
                  <button className="btn danger" onClick={() => removeExternalWorkshop(index)}>{m.common.remove}</button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h2>{x.paymentDrafts}</h2>
            <button className="btn" onClick={addPaymentDraft}>{x.addPayment}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'grid', gap: 12 }}>
            {(draft.paymentDrafts || []).map((payment, index) => (
              <div key={`${payment.type}-${index}`} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{x.paymentDrafts} {index + 1}</strong>
                  <button className="btn danger" onClick={() => removePaymentDraft(index)}>{m.common.remove}</button>
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
              <h2>{m.aiIntakePage.recommendations}</h2>
              <div className="muted">{m.aiIntakePage.recommendationsDesc}</div>
            </div>
            <button className="btn primary" onClick={recommendAssignments} disabled={!selectedId || interactionLocked}>
              {recommendationStatus === 'running' ? x.recommendationCalculatingButton : m.aiIntakePage.calculateRecommendations}
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
                {recommendationStatus === 'running' && x.recommendationProgressSteps[recommendationProgressStep % x.recommendationProgressSteps.length]}
                {recommendationStatus === 'done' && x.recommendationCalculated}
                {recommendationStatus === 'error' && x.recommendationCalculationFailed}
              </div>
            </>
          )}

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
                {recommendations.sites.map((site) => {
                  const siteDraft = normalizeProposalSite((draft.proposedSites || [])[site.siteIndex]);
                  const selectedEmployees = selectedEmployeesForSite(site);
                  const hasWorkshop = Boolean((siteDraft.assignedWorkshopName || '').trim());
                  const coverageType = normalizeCoverageType(siteDraft.coverageType || site.coverageType, siteDraft.assignedWorkshopName);
                  const selectedHeadcount = siteDraft.selectedInternalHeadcount ?? site.selectedInternalHeadcount ?? 0;
                  const workshopOptions = workshopOptionsForSite(site.siteIndex);
                  const employeeListExpanded = Boolean(expandedEmployeeSites[site.siteIndex]);

                  return (
                    <div key={site.siteIndex} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{site.siteName}</div>
                          <div className="muted">{x.staffingCardDesc}</div>
                        </div>
                        <div className="muted">{m.common.hours}: {site.estimatedHours}</div>
                      </div>

                      <div className="spacer" />
                      <div className="row">
                        <div>
                          <label>{x.assignedWorkshop}</label>
                          <select
                            value={siteDraft.assignedWorkshopName || ''}
                            onChange={(event) => updateAssignedWorkshop(site.siteIndex, event.target.value)}
                          >
                            <option value="">{x.noWorkshop}</option>
                            {workshopOptions.map((workshop, index) => (
                              <option key={`${workshop.kind}-${workshop.workshopId || workshop.draftIndex || index}`} value={workshop.name}>
                                {workshop.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label>{x.staffingCoverage}</label>
                          <select
                            value={coverageType}
                            disabled={!hasWorkshop}
                            onChange={(event) => updateSiteCoverageType(site.siteIndex, event.target.value as ProposalCoverageType)}
                          >
                            {!hasWorkshop && <option value="internal_only">{x.internalOnly}</option>}
                            {hasWorkshop && <option value="mixed_with_workshop">{x.mixedWithWorkshop}</option>}
                            {hasWorkshop && <option value="workshop_only">{x.workshopOnly}</option>}
                          </select>
                        </div>
                        <div>
                          <label>{x.workshopCoveredSkills}</label>
                          <textarea
                            placeholder={notMentioned}
                            value={listText(siteDraft.workshopCoveredSkills)}
                            disabled={!hasWorkshop}
                            onChange={(event) => updateSite(site.siteIndex, { workshopCoveredSkills: parseList(event.target.value) })}
                          />
                        </div>
                        <div>
                          <label>{x.selectedInternalCount}</label>
                          <input
                            type="number"
                            min={0}
                            placeholder={notMentioned}
                            value={selectedHeadcount}
                            onChange={(event) => autoSelectEmployeesForSite(site.siteIndex, event.target.value ? Number(event.target.value) : 0)}
                          />
                        </div>
                      </div>

                      <div className="spacer" />
                      <div className="row">
                        <div>
                          <label>{x.aiRecommendedCount}</label>
                          <input placeholder={notMentioned} value={site.recommendedHeadcount} disabled />
                        </div>
                        <div>
                          <label>{x.internalSkillsRemaining}</label>
                          <div className="card" style={{ minHeight: 54 }}>
                            {Array.isArray(site.internalRequiredSkills) && site.internalRequiredSkills.length > 0 ? listText(site.internalRequiredSkills) : (selectedHeadcount === 0 ? x.noInternalEmployeesNeeded : notMentioned)}
                          </div>
                        </div>
                        <div>
                          <label>{x.selectedTeam}</label>
                          <div className="card" style={{ minHeight: 54 }}>
                            {selectedEmployees.length > 0
                              ? selectedEmployees.map((employee) => employee.employeeName).join(', ')
                              : selectedHeadcount === 0
                                ? x.noInternalEmployeesNeeded
                                : x.noSelectedEmployees}
                          </div>
                        </div>
                      </div>

                      {site.coverageNote && (
                        <>
                          <div className="spacer" />
                          <div className="muted">{site.coverageNote}</div>
                        </>
                      )}
                      {site.staffingWarning && (
                        <>
                          <div className="spacer" />
                          <div className="card" style={{ borderColor: 'rgba(245,158,11,0.45)' }}>{site.staffingWarning}</div>
                        </>
                      )}
                      {workshopOptions.length > 0 && (
                        <>
                          <div className="spacer" />
                          <div className="card">
                            <div style={{ fontWeight: 700 }}>{x.workshopSuggestionsCompact}</div>
                            <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                              {workshopOptions
                                .map((workshop) => `${workshop.name}${workshop.matchedSkills.length ? ` (${listText(workshop.matchedSkills)})` : ''}`)
                                .join(' ? ')}
                            </div>
                          </div>
                        </>
                      )}

                      <div className="spacer" />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          onClick={() => explainRecommendation(site.siteIndex, site.siteName)}
                          disabled={explanationStatus === 'running' && explanationSite?.siteIndex === site.siteIndex}
                        >
                          {explanationStatus === 'running' && explanationSite?.siteIndex === site.siteIndex
                            ? x.explainingRecommendationButton
                            : x.explainRecommendation}
                        </button>
                        <button className="btn" onClick={() => toggleEmployeeList(site.siteIndex)}>
                          {employeeListExpanded ? x.hideEmployees : x.changeEmployees}
                        </button>
                      </div>

                      {employeeListExpanded && (
                        <>
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
                                    {m.common.skills}: {employee.matchedSkills.length > 0 ? listText(employee.matchedSkills) : notMentioned}
                                    <br />
                                    {m.common.certifications}: {employee.matchedCertifications.length > 0 ? listText(employee.matchedCertifications) : notMentioned}
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
                                {x.alternativeEmployees}: {site.excludedEmployees.map((employee) => `${employee.employeeName} (${employee.details})`).join(', ')}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
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
              <button className="btn" onClick={closeRecommendationExplanation} disabled={explanationStatus === 'running'}>
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
  );
}
