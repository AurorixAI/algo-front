"use client";

import { useId } from "react";
import { CANCELLATION_KIND_LEGEND, CANCELLATION_TEACHER_LINE, CANCELLATION_KINDS, CANCELLATION_KIND_HELP, CANCELLATION_CENTRE_NEUTRAL, type CancellationKind } from "@/lib/payf";
import { Radio } from "@/components/ui/radio";
import { HelpToggle } from "@/components/ui/help-toggle";
import { SkeletonLine } from "@/components/ui/skeleton";
import { useCancelConsequence, type CancelConsequenceTarget } from "@/lib/use-cancel-consequence";

/**
 * PAY-F, part 3 + UX pack №5: «Кто за это платит» - «По вине центра» (the default) or «Праздник, выходной».  Each option is a card with ITS consequence for the money under it (the student:
 * «перерасчёт» or nothing; the teacher: not paid), so the person sees what each choice does before pressing the button.  One field for every cancel dialog.  Only the owner and the
 * administrator choose (`canChooseKind`): a teacher sees nothing and always cancels «по вине центра».
 */
export function CancellationKindField({ value, onChange, canChooseKind, name = "cancellation-kind", disabled = false, help, consequence = null, known = null }: {
  value: CancellationKind;
  onChange: (next: CancellationKind) => void;
  canChooseKind: boolean;
  name?: string;
  disabled?: boolean;
  /** The longer explanation under a «?» (the line itself stays one sentence). */
  help?: React.ReactNode;
  /** G3M Ф5: the lesson the owner cancels: under «По вине центра» stands the server's own sentence for it (`GET …/cancel-consequence`: «Ученикам зачтётся по 33 000 сум»); until it comes or if it is refused - a neutral line. */
  consequence?: CancelConsequenceTarget | null;
  /** The window already holds the sentence (the dry run of «Урока не было»): the same line, no second request. */
  known?: { loading: boolean; text: string | null } | null;
}) {
  const base = useId();
  const asked = useCancelConsequence(canChooseKind && consequence && !known ? consequence : null);
  const centre = known ?? asked;
  if (!canChooseKind) return null;
  return (
    <fieldset className="space-y-2" data-testid="cancellation-kind" disabled={disabled}>
      <legend className="mb-1 block w-full text-xs font-semibold text-slate-700">{CANCELLATION_KIND_LEGEND}<HelpToggle><span className="block">{CANCELLATION_KIND_HELP}</span>{help && <span className="mt-1.5 block">{help}</span>}</HelpToggle></legend>
      <div className="grid grid-cols-1 gap-2">
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
                  {option.key === "centre"
                    ? (centre.loading
                      ? <span role="status" aria-label="Считаем последствия" data-testid="cancellation-kind-students-loading" className="flex h-4 items-center"><SkeletonLine className="w-2/3" /></span>
                      : <span data-testid="cancellation-kind-students" className="block">{centre.text ?? option.students}</span>)
                    : <span data-testid="cancellation-kind-students" className="block">{option.students}</span>}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p data-testid="cancellation-kind-teacher" className="text-xs text-slate-700">{CANCELLATION_TEACHER_LINE}</p>
    </fieldset>
  );
}
