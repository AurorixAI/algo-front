"use client";

import { useId } from "react";
import { CANCELLATION_KINDS, type CancellationKind } from "@/lib/payf";
import { Radio } from "@/components/ui/radio";
import { HelpToggle } from "@/components/ui/help-toggle";

/**
 * PAY-F, part 3: why the centre cancels the lesson - «По вине центра» (the default; may be deducted from the next payment if the centre switched that on)
 * or «Праздник, выходной» (never).  One field for every cancel dialog.  Only the owner and the administrator choose (`canChooseKind`): a teacher sees nothing and
 * always cancels «по вине центра».
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
  const hintId = useId();
  if (!canChooseKind) return null;
  const hint = CANCELLATION_KINDS.find((option) => option.key === value)?.hint ?? "";
  return (
    <fieldset className="space-y-1" data-testid="cancellation-kind" disabled={disabled} aria-describedby={hintId}>
      <legend className="text-xs font-semibold text-slate-700">Как учесть в оплате</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {CANCELLATION_KINDS.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <Radio name={name} checked={value === option.key} onChange={() => onChange(option.key)} aria-describedby={hintId} />
            {option.label}
          </label>
        ))}
      </div>
      <p id={hintId} className="text-xs text-slate-500">{hint}{help && <HelpToggle>{help}</HelpToggle>}</p>
    </fieldset>
  );
}
