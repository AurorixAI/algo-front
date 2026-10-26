"use client";

import { useState } from "react";
import Link from "next/link";
import { DateInput } from "@/components/ui/date-input";
import { HelpToggle } from "@/components/ui/help-toggle";
import {
  ACCOUNTING_CANCEL_LABEL, ACCOUNTING_CHANGE_LABEL, ACCOUNTING_DATE_LABEL, ACCOUNTING_HINT, ACCOUNTING_LIMIT_HELP, accountingLineText,
} from "@/lib/payf-settings";

export interface AccountingImpact { date: string; lines: string[]; toReview: number; error: string | null }

/**
 * The start of the accounting as ONE quiet line («ALGO ведёт оплаты центра с 26.10.2026» + «Изменить»).  ALGO sets it by itself (the day the centre was created); «Изменить»
 * opens the date with what to do about the money of the earlier days.  What the server says about a date it refuses («Есть оплаты до этой даты…») stands under the field.
 */
export function AccountingStartLine({ loaded, value, onChange, impact, openingsHref, minDate, formatDate, inputClassName }: {
  loaded: string | null;
  value: string | null;
  onChange: (next: string | null) => void;
  impact: AccountingImpact | null;
  openingsHref: string;
  minDate: string;
  formatDate: (iso: string) => string;
  inputClassName: string;
}) {
  const [editing, setEditing] = useState(false);
  const shown = value || loaded;
  const mine = impact && impact.date === value ? impact : null;
  if (!shown) return null;
  return (
    <div data-testid="accounting-start" className="text-sm text-slate-600">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="accounting-start-line">
        <span>{accountingLineText(formatDate(shown))}</span>
        {!editing && <button type="button" onClick={() => setEditing(true)} data-testid="accounting-start-change" className="font-medium text-primary-700 hover:underline">{ACCOUNTING_CHANGE_LABEL}</button>}
      </p>
      {editing && (
        <div className="mt-2 space-y-2 rounded-xl bg-slate-50 px-4 py-3" data-testid="accounting-start-editor">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="payments-accounting-start" className="sr-only">{ACCOUNTING_DATE_LABEL}</label>
            <DateInput id="payments-accounting-start" min={minDate} value={value ?? ""} onChange={(next) => onChange(next || loaded || null)} wrapperClassName="w-48" className={inputClassName} />
            <button type="button" onClick={() => { onChange(loaded); setEditing(false); }} className="text-sm font-medium text-slate-600 hover:underline">{ACCOUNTING_CANCEL_LABEL}</button>
          </div>
          <p className="text-xs text-slate-500">
            {ACCOUNTING_HINT.before}<Link href={openingsHref} data-testid="accounting-start-openings-link" className="font-semibold text-primary-700 underline">{ACCOUNTING_HINT.link}</Link>{ACCOUNTING_HINT.after}
            <HelpToggle>{ACCOUNTING_LIMIT_HELP}</HelpToggle>
          </p>
          {mine?.error && <p role="alert" className="text-xs font-medium text-rose-700">{mine.error}</p>}
          {mine && mine.lines.length > 0 && (
            <ul role="status" className="space-y-0.5 text-xs font-medium text-amber-800">{mine.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
