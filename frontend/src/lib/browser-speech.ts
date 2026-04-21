'use client';

export type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type BrowserWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionCtor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
};

export function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as BrowserWindow;
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

export function localeToSpeechRecognitionLang(locale: 'de' | 'en' | 'ar'): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'ar') return 'ar';
  return 'en-US';
}
