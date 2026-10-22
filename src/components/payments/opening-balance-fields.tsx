"use client";

import { MoneyField, PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";
import {
  OPENING_DEBT_HINT,
  OPENING_DEBT_LABEL,
  OPENING_DEBT_ON_LABEL,
  OPENING_MIN_DATE,
  OPENING_PAID_UNTIL_HINT,
  OPENING_PAID_UNTIL_LABEL,
  OPENING_TITLE,
  openingLine,
  openingPaidUntilMax,
  type OpeningFormValues,
} from "@/lib/payments-logica";

/**
 * «Остаток на начало учёта»: what the student had before ALGO — paid until a date, and / or owed a sum on a date.  The same three
 * fields in «Добавить ученика» and in the card; under them one live line says what will be counted («Стоимость считается с 01.11.
 * Оплачено до 31.10. Долг на начало: 250 000 сум.»).  Money roles only: the server refuses the opening balance to everybody else.
 */
export function OpeningBalanceFields({
  idPrefix, values, onChange, enrolDate, today, accountingStart, compact = false, line = true, legend = true,
}: {
  idPrefix: string;
  values: OpeningFormValues;
  onChange: (next: OpeningFormValues) => void;
  /** The day the membership starts (null: not known here). */
  enrolDate: string | null;
  today: string;
  accountingStart?: string | null;
  compact?: boolean;
  /** The live line under the fields (the card shows the server's calculation instead). */
  line?: boolean;
  /** The heading of the group (the toggle of «Добавить ученика» already says it). */
  legend?: boolean;
}) {
  const patch = (next: Partial<OpeningFormValues>) => onChange({ ...values, ...next });
  const summary = line ? openingLine(values, { enrolDate }) : "";
  const earliest = [enrolDate, accountingStart].filter((day): day is string => Boolean(day)).sort().pop() ?? undefined;
  return (
    <fieldset className="space-y-3">
      {legend ? (
        <legend className="text-xs font-semibold text-slate-700">{OPENING_TITLE} <span className="font-normal text-slate-400">(необязательно)</span></legend>
      ) : (
        <legend className="sr-only">{OPENING_TITLE}</legend>
      )}
      <div className={`grid gap-3 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        <div className={compact ? "" : "sm:col-span-2"}>
          <label htmlFor={`${idPrefix}-paid-until`} className={PRICE_LABEL}>{OPENING_PAID_UNTIL_LABEL}</label>
          <input
            id={`${idPrefix}-paid-until`}
            type="date"
            value={values.paidUntil}
            min={earliest}
            max={openingPaidUntilMax(today)}
            onChange={(event) => patch({ paidUntil: event.target.value })}
            aria-describedby={`${idPrefix}-paid-until-hint`}
            className={`${PRICE_FIELD} sm:w-1/2`}
          />
          <p id={`${idPrefix}-paid-until-hint`} className="mt-1 text-xs text-slate-500">{OPENING_PAID_UNTIL_HINT}</p>
        </div>
        <MoneyField
          id={`${idPrefix}-debt`}
          label={OPENING_DEBT_LABEL}
          value={values.debt}
          onChange={(text) => patch({ debt: text })}
          placeholder="250 000"
          describedBy={`${idPrefix}-debt-hint`}
        />
        <div>
          <label htmlFor={`${idPrefix}-debt-on`} className={PRICE_LABEL}>{OPENING_DEBT_ON_LABEL}</label>
          <input
            id={`${idPrefix}-debt-on`}
            type="date"
            value={values.debtOn}
            min={OPENING_MIN_DATE}
            max={enrolDate ?? today}
            onChange={(event) => patch({ debtOn: event.target.value })}
            aria-describedby={`${idPrefix}-debt-hint`}
            className={PRICE_FIELD}
          />
        </div>
        <p id={`${idPrefix}-debt-hint`} className={`-mt-1.5 text-xs text-slate-500 ${compact ? "" : "sm:col-span-2"}`}>{OPENING_DEBT_HINT}</p>
      </div>
      {summary && <p aria-live="polite" className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="opening-line">{summary}</p>}
    </fieldset>
  );
}

/**
 * The optional «Остаток на начало учёта» of an enrolment: off by default (the student starts from zero); on opens the three fields.
 * Money roles only, and only for one student that does not come by a transfer (the server answers `OPENING_NOT_ALLOWED` otherwise).
 */
export function OpeningToggle({
  idPrefix, enabled, onEnabled, values, onChange, enrolDate, today, accountingStart, needsReason = false,
}: {
  idPrefix: string;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  values: OpeningFormValues;
  onChange: (next: OpeningFormValues) => void;
  enrolDate: string;
  today: string;
  accountingStart?: string | null;
  /** The server answered `REASON_REQUIRED`: the student already has money, the replacement needs a reason. */
  needsReason?: boolean;
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
        {OPENING_TITLE}
      </button>
      {enabled && (
        <OpeningBalanceFields idPrefix={idPrefix} values={values} onChange={onChange} enrolDate={enrolDate} today={today} accountingStart={accountingStart} compact legend={false} />
      )}
      {enabled && needsReason && (
        <div>
          <label htmlFor={`${idPrefix}-reason`} className={PRICE_LABEL}>Причина <span className="font-normal text-slate-400">(обязательно: у ученика уже есть оплаты)</span></label>
          <input id={`${idPrefix}-reason`} value={values.reason} onChange={(event) => onChange({ ...values, reason: event.target.value })} maxLength={500} autoComplete="off" className={PRICE_FIELD} />
        </div>
      )}
    </div>
  );
}
