"use client";

import { reformatMoneyTyping } from "@/lib/payments";
import { OVERRIDE_REASON_MAX } from "@/lib/group-price";

export const PRICE_FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 max-sm:py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
export const PRICE_LABEL = "mb-1 block text-xs font-semibold text-slate-600";

/** An amount field: thousands separated while typing, «сум» at the right edge. */
export function MoneyField({
  id, label, value, onChange, placeholder = "450 000", autoFocus = false, describedBy, optionalHint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  describedBy?: string;
  optionalHint?: string;
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
          aria-describedby={describedBy}
          className={`${PRICE_FIELD} pr-12`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">сум</span>
      </div>
    </div>
  );
}

/** The reason of an individual price: required, 3..200 characters. */
export function ReasonField({
  id, value, onChange, label = "Причина",
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  label?: string;
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
        className={PRICE_FIELD}
      />
    </div>
  );
}
