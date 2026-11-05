"use client";

import { useId } from "react";
import { CANCELLATION_KIND_LEGEND, CANCELLATION_KINDS, type CancellationKind } from "@/lib/payf";
import { Radio } from "@/components/ui/radio";
import { HelpToggle } from "@/components/ui/help-toggle";

/**
 * PAY-F, part 3 + UX pack №5: «Кто за это платит» - «По вине центра» (the default) or «Праздник, выходной».  Each option is a card with ITS consequence for the money under it (the student:
 * «перерасчёт» or nothing; the teacher: not paid), so the person sees what each choice does before pressing the button.  One field for every cancel dialog.  Only the owner and the
 * administrator choose (`canChooseKind`): a teacher sees nothing and always cancels «по вине центра».
 */
export function CancellationKindField({ value, onChange, canChooseKind, name = "cancellation-kind", disabled = false, help }: {
  value: CancellationKind;
  onChange: (next: CancellationKind) => void;
  canChooseKind: boolean;
  name?: string;
  disabled?: boolean;
  /** The longer explanation under a «?» (the line itself stays one sentence). */
  help?: React.ReactNode;
}) {
  const base = useId();
  if (!canChooseKind) return null;
  return (
    <fieldset className="space-y-2" data-testid="cancellation-kind" disabled={disabled}>
      <legend className="mb-1 block w-full text-xs font-semibold text-slate-700">{CANCELLATION_KIND_LEGEND}{help && <HelpToggle>{help}</HelpToggle>}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CANCELLATION_KINDS.map((option) => {
          const lineId = `${base}-${option.key}`;
          const selected = value === option.key;
          return (
            <label
              key={option.key}
              data-testid={`cancellation-kind-${option.key}`}
              className={`flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${selected ? "border-primary-400 bg-primary-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              <Radio name={name} checked={selected} onChange={() => onChange(option.key)} aria-describedby={lineId} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                <span id={lineId} className="mt-0.5 block text-xs leading-snug text-slate-700">
                  <span data-testid="cancellation-kind-students" className="block">{option.students}</span>
                  <span data-testid="cancellation-kind-teacher" className="block">{option.teacher}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
