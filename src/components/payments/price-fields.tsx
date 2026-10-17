"use client";

import { reformatMoneyTyping } from "@/lib/payments";
import { OVERRIDE_REASON_MAX } from "@/lib/group-price";

export const PRICE_FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
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
        {optionalHint && <span className="font-normal text-slate-400"> {optionalHint}</span>}
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
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">сум</span>
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
      <label htmlFor={id} className={PRICE_LABEL}>{label} <span className="font-normal text-slate-400">(обязательно)</span></label>
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

/**
 * «Индивидуальная цена» of an enrolment: off by default (the student follows the price of the group); on opens a sum and a
 * reason.  Shown to money roles only - the server refuses `price_override` to everybody else.
 */
export function EnrolPriceToggle({
  idPrefix, enabled, amount, reason, onEnabled, onAmount, onReason, shared = false, compact = false,
}: {
  idPrefix: string;
  enabled: boolean;
  amount: string;
  reason: string;
  onEnabled: (value: boolean) => void;
  onAmount: (text: string) => void;
  onReason: (text: string) => void;
  /** More than one student: one price for all of them. */
  shared?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onEnabled(!enabled)}
        className={`inline-flex items-center gap-2 text-xs font-semibold transition-colors ${enabled ? "text-primary-700" : "text-slate-500 hover:text-slate-800"}`}
      >
        <span className={`relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors ${enabled ? "bg-primary-600" : "bg-slate-300"}`} aria-hidden="true">
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${enabled ? "left-3.5" : "left-0.5"}`} />
        </span>
        Индивидуальная цена{shared ? " — одна для всех" : ""}
      </button>
      {enabled && (
        <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
          <MoneyField id={`${idPrefix}-amount`} label="Сумма" value={amount} onChange={onAmount} />
          <ReasonField id={`${idPrefix}-reason`} value={reason} onChange={onReason} />
        </div>
      )}
    </div>
  );
}
