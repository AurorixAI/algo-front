"use client";

import { reformatMoneyTyping } from "@/lib/payments";
import { OVERRIDE_REASON_MAX } from "@/lib/group-price";
import { cn } from "@/lib/utils";

export const PRICE_FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 max-sm:py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
/** The frame of a field that is refused: the red frame of the design system (`ui/input`), the text under it says why (`role="alert"`, tied to the field by `aria-describedby`). */
export const PRICE_FIELD_ERROR = "border-red-400 focus:border-red-500 focus:ring-red-500/20";
export function FieldError({ id, children }: { id: string; children: string }) {
  return <p id={id} role="alert" data-testid="field-error" className="mt-1.5 text-xs font-medium text-rose-700">{children}</p>;
}
export const PRICE_LABEL = "mb-1 block text-xs font-semibold text-slate-600";

/** An amount field: thousands separated while typing, «сум» at the right edge. */
export function MoneyField({
  id, label, value, onChange, placeholder = "450 000", autoFocus = false, describedBy, optionalHint, error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  describedBy?: string;
  optionalHint?: string;
  /** the refusal of this field: the red frame and the text under it */
  error?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className={PRICE_LABEL}>
        {label}
        {optionalHint && <span className="font-normal text-slate-500"> {optionalHint}</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(reformatMoneyTyping(event.target.value))}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-describedby={error ? `${id}-error` : describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(PRICE_FIELD, "pr-12", error && PRICE_FIELD_ERROR)}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">сум</span>
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

/** The reason of an individual price: required, 3..200 characters. */
export function ReasonField({
  id, value, onChange, label = "Причина", error,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  label?: string;
  /** the refusal of this field: the red frame and the text under it */
  error?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className={PRICE_LABEL}>{label} <span className="font-normal text-slate-500">(обязательно)</span></label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={OVERRIDE_REASON_MAX}
        autoComplete="off"
        placeholder="Например: брат и сестра, скидка по договорённости"
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(PRICE_FIELD, error && PRICE_FIELD_ERROR)}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
