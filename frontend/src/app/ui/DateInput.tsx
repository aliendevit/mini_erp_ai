'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDE, parseDE, parseYMD, toYMD } from '../../lib/date';

type Props = {
  label: string;
  value?: Date;
  onChange: (d?: Date) => void;
  placeholder?: string;
};

/**
 * Date input with:
 * - Typing support (TT.MM.JJJJ)
 * - Native calendar picker via a hidden <input type="date"> (button opens it)
 */
export function DateInput({ label, value, onChange, placeholder }: Props) {
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
    const el: any = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        el.focus();
        el.click?.();
      }
    } catch {
      try {
        el.focus();
      } catch {}
    }
  }

  function onTextChange(next: string) {
    setText(next);

    const t = next.trim();
    if (!t) {
      setInvalid(false);
      onChange(undefined);
      return;
    }

    const parsed = parseDE(t);
    if (parsed) {
      setInvalid(false);
      onChange(parsed);
      return;
    }

    setInvalid(true);
    onChange(undefined);
  }

  function onPickerChange(ymd: string) {
    const dt = parseYMD(ymd);
    if (dt) {
      setInvalid(false);
      onChange(dt);
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
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={placeholder || 'TT.MM.JJJJ'}
          inputMode="numeric"
        />

        <button type="button" className="btn" onClick={openPicker} title={`${label} auswählen`} style={{ whiteSpace: 'nowrap' }}>
          📅
        </button>

        {/* Hidden native date picker */}
        <input
          ref={pickerRef}
          type="date"
          value={pickerValue}
          onChange={(e) => onPickerChange(e.target.value)}
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      {invalid && <div className="muted" style={{ marginTop: 4 }}>Ungültiges Datum (Format: TT.MM.JJJJ)</div>}
    </div>
  );
}
