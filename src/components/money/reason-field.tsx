"use client";

import type { ReactNode } from "react";
import { REASON_MIN } from "@/lib/payments";

/** The sentence under a reason that is too short (the server asks the same: 3..500 characters after the trim). */
export const REASON_SHORT_TEXT = `Укажите причину — не короче ${REASON_MIN} символов`;

/**
 * Re-audit (closing, item 4): ONE field of a reason for the windows of money.  The label says whether the SERVER asks for it: «Причина (обязательно)» (3..500 characters, the window refuses a shorter
 * one) or «Причина (необязательно)».  The error stands UNDER THE FIELD (red frame, `aria-invalid`, `aria-describedby`) - not in a banner at the bottom of the window.
 * `error` comes from the window: it shows it after the first try to send (or when the field was left), never on an untouched field.
 */
export function ReasonField({
  id, value, onChange, required, error = null, label = "Причина", hint, placeholder, autoFocus, maxLength = 500, rows = 3, onBlur,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  required: boolean;
  error?: string | null;
  label?: string;
  hint?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  rows?: number;
  onBlur?: () => void;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-600">
        {label} <span className="font-normal text-slate-500">({required ? "обязательно" : "необязательно"})</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        maxLength={maxLength}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:ring-2 ${error ? "border-red-500 focus:border-red-500 focus:ring-red-500/15" : "border-slate-200 focus:border-primary-500 focus:ring-primary-500/10"}`}
      />
      {error && <p id={errorId} data-testid={errorId} role="alert" className="mt-1 text-xs font-medium text-red-700">{error}</p>}
      {hint && <p id={hintId} className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

/** The error to show for a required reason: after a try (or a blur) and while it is shorter than the minimum. */
export function reasonFieldError(value: string, touched: boolean, required = true): string | null {
  if (!required || !touched) return null;
  return value.trim().length < REASON_MIN ? REASON_SHORT_TEXT : null;
}
