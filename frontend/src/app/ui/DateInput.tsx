'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import { formatDE, parseDE, parseYMD, toYMD } from '../../lib/date';

type Props = {
  label: string;
  value?: Date;
  onChange: (d?: Date) => void;
  placeholder?: string;
};

export function DateInput({ label, value, onChange, placeholder }: Props) {
  const { messages: m } = useI18n();
  const [text, setText] = useState<string>(value ? formatDE(value) : '');
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setText(value ? formatDE(value) : '');
    setInvalid(false);
  }, [value]);

  const pickerValue = useMemo(() => {
    return value ? toYMD(value) : '';
  }, [value]);

  function openPicker() {
    const element: any = pickerRef.current;
    if (!element) return;
    try {
      if (typeof element.showPicker === 'function') {
        element.showPicker();
      } else {
        element.focus();
        element.click?.();
      }
    } catch {
      try {
        element.focus();
      } catch {}
    }
  }

  function onTextChange(next: string) {
    setText(next);

    const trimmed = next.trim();
    if (!trimmed) {
      setInvalid(false);
      onChange(undefined);
      return;
    }

    const parsed = parseDE(trimmed);
    if (parsed) {
      setInvalid(false);
      onChange(parsed);
      return;
    }

    setInvalid(true);
    onChange(undefined);
  }

  function onPickerChange(ymd: string) {
    const nextDate = parseYMD(ymd);
    if (nextDate) {
      setInvalid(false);
      onChange(nextDate);
    } else {
      onChange(undefined);
    }
  }

  return (
    <div>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={placeholder || m.dateInput.placeholder}
          inputMode="numeric"
        />

        <button
          type="button"
          className="btn"
          onClick={openPicker}
          title={`${label} ${m.dateInput.pick}`}
          style={{ whiteSpace: 'nowrap' }}
        >
          📅
        </button>

        <input
          ref={pickerRef}
          type="date"
          value={pickerValue}
          onChange={(event) => onPickerChange(event.target.value)}
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      {invalid && <div className="muted" style={{ marginTop: 4 }}>{m.dateInput.invalid}</div>}
    </div>
  );
}
