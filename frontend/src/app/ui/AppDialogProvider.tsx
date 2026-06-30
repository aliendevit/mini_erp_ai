'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { AppConfirmOptions, AppDialogKind } from '../../lib/dialog';

type AlertItem = {
  id: number;
  message: string;
  kind: AppDialogKind;
};

type ConfirmState = AppConfirmOptions & {
  message: string;
  resolve: (value: boolean) => void;
};

type AlertEvent = CustomEvent<{ message: string; kind?: AppDialogKind }>;
type ConfirmEvent = CustomEvent<ConfirmState>;

function nextId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const showAlert = useCallback((message: string, kind: AppDialogKind = 'info') => {
    const id = nextId();
    setAlerts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => {
      setAlerts((current) => current.filter((item) => item.id !== id));
    }, kind === 'error' ? 6500 : 4300);
  }, []);

  const requestConfirm = useCallback((message: string, options: AppConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState((current) => {
        current?.resolve(false);
        return { message, ...options, resolve };
      });
    });
  }, []);

  const closeConfirm = useCallback(
    (value: boolean) => {
      if (!confirmState) return;
      confirmState.resolve(value);
      setConfirmState(null);
    },
    [confirmState],
  );

  useEffect(() => {
    const originalAlert = window.alert;
    const onAlert = (event: Event) => {
      const detail = (event as AlertEvent).detail;
      if (detail?.message) showAlert(detail.message, detail.kind || 'info');
    };
    const onConfirm = (event: Event) => {
      const detail = (event as ConfirmEvent).detail;
      if (detail?.message) {
        setConfirmState((current) => {
          current?.resolve(false);
          return detail;
        });
      }
    };

    window.omranAlert = showAlert;
    window.omranConfirm = requestConfirm;
    window.alert = (message?: unknown) => {
      showAlert(String(message ?? ''), 'info');
    };
    window.addEventListener('omran:alert', onAlert);
    window.addEventListener('omran:confirm', onConfirm);

    return () => {
      window.alert = originalAlert;
      delete window.omranAlert;
      delete window.omranConfirm;
      window.removeEventListener('omran:alert', onAlert);
      window.removeEventListener('omran:confirm', onConfirm);
    };
  }, [requestConfirm, showAlert]);

  return (
    <>
      {children}
      <div className="app-message-stack" role="status" aria-live="polite">
        {alerts.map((item) => (
          <div key={item.id} className={`app-message app-message-${item.kind}`}>
            <span>{item.message}</span>
            <button type="button" aria-label="Close message" onClick={() => setAlerts((current) => current.filter((alert) => alert.id !== item.id))}>
              x
            </button>
          </div>
        ))}
      </div>
      {confirmState ? (
        <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => closeConfirm(false)}>
          <div className="app-dialog-card" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="app-dialog-kicker">OMRAN</div>
            <h2 id="app-dialog-title">{confirmState.title || 'Confirm action'}</h2>
            <p>{confirmState.message}</p>
            <div className="app-dialog-actions">
              <button type="button" className="app-dialog-secondary" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel || 'Cancel'}
              </button>
              <button type="button" className="app-dialog-primary" onClick={() => closeConfirm(true)}>
                {confirmState.confirmLabel || 'Continue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
