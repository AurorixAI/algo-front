"use client";

import { CENTRE_CANCEL_OPTIONS, CENTRE_CANCEL_TITLE } from "@/lib/payf-settings";
import { Radio } from "@/components/ui/radio";

/**
 * PAY-F, part 3: «Уроки, отменённые центром, при помесячной оплате» - do not recalculate (as before) or deduct the lesson from the next payment.
 * Shown for the two monthly ways to count only (a package never charges a cancelled lesson).  A change acts for the lessons dated from the day it is saved.
 */
export function CentreCancelSetting({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <fieldset className="space-y-2 rounded-xl bg-slate-50 px-4 py-3" data-testid="centre-cancel-setting">
      <legend className="text-sm font-semibold text-slate-900">{CENTRE_CANCEL_TITLE}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CENTRE_CANCEL_OPTIONS.map((option) => (
          <label
            key={String(option.value)}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 ${value === option.value ? "border-primary-400 bg-primary-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <Radio name="payments-centre-cancel" checked={value === option.value} onChange={() => onChange(option.value)} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
              <span className="block text-xs text-slate-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
