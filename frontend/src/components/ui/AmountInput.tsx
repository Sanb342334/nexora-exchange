'use client';

import { useRef } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

/** Sanitized decimal amount input — keeps caret at the end on focus (TG WebView fix). */
export function AmountInput({ value, onChange, className, placeholder, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const sanitize = (raw: string) => {
    let next = raw.replace(/[^\d.]/g, '');
    const firstDot = next.indexOf('.');
    if (firstDot !== -1) {
      next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, '');
    }
    return next;
  };

  return (
    <input
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      onFocus={(e) => {
        const el = e.currentTarget;
        const len = el.value.length;
        // Defer — Telegram/WebKit often resets caret after focus
        requestAnimationFrame(() => {
          try {
            el.setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
        });
      }}
      onClick={(e) => {
        const el = e.currentTarget;
        if (document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === 0 && el.value) {
          const len = el.value.length;
          try {
            el.setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
        }
      }}
      onChange={(e) => {
        const el = e.currentTarget;
        const start = el.selectionStart ?? el.value.length;
        const before = el.value;
        const next = sanitize(before);
        onChange(next);
        // Restore caret relative to end if sanitize shortened the string
        requestAnimationFrame(() => {
          if (!ref.current) return;
          const delta = before.length - next.length;
          const pos = Math.max(0, Math.min(next.length, start - delta));
          try {
            ref.current.setSelectionRange(pos, pos);
          } catch {
            /* ignore */
          }
        });
      }}
    />
  );
}
