'use client';

import { useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    setText(value ? formatDE(value) : '');
    setInvalid(false);
  }, [value]);

  const pickerValue = useMemo(() => {
    return value ? toYMD(value) : '';
  }, [value]);

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
      setText(formatDE(nextDate));
      onChange(nextDate);
    } else {
      setText('');
      onChange(undefined);
    }
  }

  return (
    <div className="date-input-field">
      <label>{label}</label>
      <div className="date-input-control">
        <input
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={placeholder || m.dateInput.placeholder}
          inputMode="numeric"
          aria-invalid={invalid}
        />
        <label className="date-picker-button" title={`${label} ${m.dateInput.pick}`}>
          <span aria-hidden="true">{'\u{1F4C5}'}</span>
          <input
            type="date"
            value={pickerValue}
            onChange={(event) => onPickerChange(event.target.value)}
            aria-label={`${label} ${m.dateInput.pick}`}
          />
        </label>
      </div>
      {invalid && <div className="field-error">{m.dateInput.invalid}</div>}
    </div>
  );
}
