'use client';

export type AppDialogKind = 'success' | 'error' | 'info';

export type AppConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

declare global {
  interface Window {
    omranAlert?: (message: string, kind?: AppDialogKind) => void;
    omranConfirm?: (message: string, options?: AppConfirmOptions) => Promise<boolean>;
  }
}

export function appAlert(message: string, kind: AppDialogKind = 'info') {
  if (typeof window === 'undefined') return;
  if (window.omranAlert) {
    window.omranAlert(message, kind);
    return;
  }
  window.dispatchEvent(new CustomEvent('omran:alert', { detail: { message, kind } }));
}

export function appConfirm(message: string, options: AppConfirmOptions = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.omranConfirm) {
    return window.omranConfirm(message, options);
  }
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent('omran:confirm', { detail: { message, ...options, resolve } }));
  });
}
