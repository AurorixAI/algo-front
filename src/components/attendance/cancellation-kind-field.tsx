"use client";

import { CANCELLATION_KINDS, type CancellationKind } from "@/lib/payf";
import { Radio } from "@/components/ui/radio";

/**
 * PAY-F, part 3: why the centre cancels the lesson - «По вине центра» (the default; may be deducted from the next payment if the centre switched that on)
 * or «Праздник, выходной» (never).  One field for every cancel dialog (the teacher's schedule and dashboard, the lesson sheet, «Урока не было»).
 */
export function CancellationKindField({ value, onChange, name = "cancellation-kind", disabled = false }: { value: CancellationKind; onChange: (next: CancellationKind) => void; name?: string; disabled?: boolean }) {
  const hint = CANCELLATION_KINDS.find((option) => option.key === value)?.hint ?? "";
  return (
    <fieldset className="space-y-1" data-testid="cancellation-kind" disabled={disabled}>
      <legend className="text-xs font-semibold text-slate-700">Причина отмены с точки зрения оплаты</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {CANCELLATION_KINDS.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <Radio name={name} checked={value === option.key} onChange={() => onChange(option.key)} />
            {option.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
    </fieldset>
  );
}
