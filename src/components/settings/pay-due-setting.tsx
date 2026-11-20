"use client";

import { useEffect, useState } from "react";
import { orgApi } from "@/lib/api";
import { usePaymentsSummary } from "@/lib/payments-summary";
import type { PayDueExample, PaymentSettings } from "@/lib/payments";
import {
  PAY_DUE_DAYS_LABEL,
  PAY_DUE_DAYS_RANGE,
  PAY_DUE_DAYS_UNIT,
  PAY_DUE_HELP,
  PAY_DUE_LESSONS_LABEL,
  PAY_DUE_LESSONS_RANGE,
  PAY_DUE_READONLY_NOTE,
  PAY_DUE_TITLE,
  daysWord,
  lessonsUnit,
  payDueBody,
  payDueImpactLines,
  payDueLessonsHint,
  payDueReadText,
  payDueValid,
} from "@/lib/pay-due-setting";
import { HelpToggle } from "@/components/ui/help-toggle";
import { NumberInput } from "@/components/ui/number-input";

const toText = (value: number): string => (Number.isNaN(value) ? "" : String(value));
const toNumber = (text: string): number => (text === "" ? NaN : Number(text));

/**
 * «Срок оплаты» of the settings (PAY-DUE frames 1-4, 22; 14А.3): a PART OF THE FORM of the page - a grey panel like its neighbours, no buttons of its own: the value is saved by the page's one «Сохранить».
 * While the value differs from the saved one the server's dry run answers the line about the students AND the example under the field (`pay_due_example`, for the requested value) - the screen counts nothing.
 * The owner changes it; the field shown is the one of the chosen mode (days for a calendar mode, lessons for a package).
 */
export function PayDueSetting({ form, loaded, model, maxDays, onChange }: {
  /** What the owner has picked / what the server holds (the draft of the payment settings of the page). */
  form: PaymentSettings;
  loaded: PaymentSettings;
  /** The mode picked on the page: its field is the one shown. */
  model: "payment_date" | "fixed_day" | "lessons";
  /** «Не дольше N дней» of a package: the server's number (null - not said, nothing is shown). */
  maxDays: number | null;
  onChange: (next: Partial<PaymentSettings>) => void;
}) {
  const lessonsMode = model === "lessons";
  const term = { pay_due_days: form.pay_due_days, pay_due_lessons: form.pay_due_lessons };
  const valid = payDueValid(term);
  const body = valid ? payDueBody(loaded, term) : {};
  const dirty = Object.keys(body).length > 0;
  const bodyKey = JSON.stringify(body);
  const [answer, setAnswer] = useState<{ key: string; lines: string[]; example: PayDueExample | null; error: string | null } | null>(null);

  // the dry run is asked with the part of the saved body that is the term; nothing is written by it
  useEffect(() => {
    if (!dirty) { setAnswer(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      orgApi.previewPaymentSettings(JSON.parse(bodyKey))
        .then((reply) => { if (!cancelled) setAnswer({ key: bodyKey, lines: payDueImpactLines(reply.pay_due_impact), example: reply.pay_due_example ?? null, error: null }); })
        .catch((cause) => { if (!cancelled) setAnswer({ key: bodyKey, lines: [], example: null, error: cause instanceof Error ? cause.message : "Не удалось проверить срок" }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dirty, bodyKey]);

  // the example of the saved value comes with the settings (the answer of a SAVE has none: it is asked again, for the saved values); of a typed value - with its dry run (no answer yet - no line, never a guess)
  const [reread, setReread] = useState<{ days: number; lessons: number; example: PayDueExample } | null>(null);
  useEffect(() => {
    if (dirty || loaded.pay_due_example) return undefined;
    let cancelled = false;
    orgApi.getPaymentSettings()
      .then((reply) => { if (!cancelled && reply.pay_due_example) setReread({ days: reply.pay_due_days, lessons: reply.pay_due_lessons, example: reply.pay_due_example }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [dirty, loaded.pay_due_example, loaded.pay_due_days, loaded.pay_due_lessons]);
  const current = answer && answer.key === bodyKey ? answer : null;
  const savedExample = loaded.pay_due_example ?? (reread && reread.days === loaded.pay_due_days && reread.lessons === loaded.pay_due_lessons ? reread.example : null);
  const example = dirty ? current?.example ?? null : savedExample;
  const exampleText = example ? (lessonsMode ? example.package : example.period) : "";
  const hint = payDueLessonsHint(maxDays);
  const rangeError = !valid && (
    Number.isNaN(term.pay_due_days) || term.pay_due_days < PAY_DUE_DAYS_RANGE.min || term.pay_due_days > PAY_DUE_DAYS_RANGE.max
      ? `Срок: от ${PAY_DUE_DAYS_RANGE.min} до ${PAY_DUE_DAYS_RANGE.max} ${daysWord(PAY_DUE_DAYS_RANGE.max)}`
      : `Уроков без оплаты: от ${PAY_DUE_LESSONS_RANGE.min} до ${PAY_DUE_LESSONS_RANGE.max}`
  );

  return (
    <div id="pay-due" data-testid="pay-due-block" className="space-y-2 rounded-xl bg-slate-50 px-4 py-3">
      {/* the parent of the «?» is a block: its note takes its own row */}
      <div className="pr-2">
        <h3 className="mr-1.5 inline text-sm font-semibold text-slate-700">{PAY_DUE_TITLE}</h3>
        <HelpToggle label="Подробнее" testId="pay-due-help">{PAY_DUE_HELP}</HelpToggle>
      </div>

      {!lessonsMode ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="pay-due-days" className="text-sm text-slate-800">{PAY_DUE_DAYS_LABEL}</label>
          <NumberInput
            id="pay-due-days"
            data-testid="pay-due-days"
            value={toText(form.pay_due_days)}
            onChange={(next) => onChange({ pay_due_days: toNumber(next) })}
            min={PAY_DUE_DAYS_RANGE.min}
            max={PAY_DUE_DAYS_RANGE.max}
            stepper
            wrapperClassName="w-28"
            className="text-center font-semibold"
            aria-describedby="pay-due-example"
          />
          <span className="text-sm text-slate-800">{PAY_DUE_DAYS_UNIT}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="pay-due-lessons" className="text-sm text-slate-800">{PAY_DUE_LESSONS_LABEL}</label>
          <NumberInput
            id="pay-due-lessons"
            data-testid="pay-due-lessons"
            value={toText(form.pay_due_lessons)}
            onChange={(next) => onChange({ pay_due_lessons: toNumber(next) })}
            min={PAY_DUE_LESSONS_RANGE.min}
            max={PAY_DUE_LESSONS_RANGE.max}
            stepper
            wrapperClassName="w-28"
            className="text-center font-semibold"
            aria-describedby="pay-due-example"
          />
          <span className="text-sm text-slate-800">{Number.isFinite(form.pay_due_lessons) ? lessonsUnit(form.pay_due_lessons) : "урока"}</span>
          {hint && <span className="text-xs text-slate-500" data-testid="pay-due-hint">({hint})</span>}
        </div>
      )}
      {/* the example of the SERVER (14А.3); the line keeps its height while a typed value waits for the answer */}
      <p id="pay-due-example" className="min-h-5 text-xs text-slate-500" data-testid="pay-due-example">{exampleText}</p>

      {dirty && current?.lines.map((line) => (
        <p key={line} className="flex items-start gap-2 text-sm text-slate-800" data-testid="pay-due-impact" role="status">
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-600" />
          <span>После сохранения: {line}</span>
        </p>
      ))}
      {dirty && current?.error && <p role="alert" className="text-sm font-medium text-rose-700">{current.error}</p>}
      {rangeError && <p role="alert" className="text-sm font-medium text-rose-700" data-testid="pay-due-range">{rangeError}</p>}
    </div>
  );
}

/** An administrator with the right to money: the term is only read (the number comes from the summary), the owner changes it (frame 4).  Nothing until the server has sent the number. */
export function PayDueReadOnly() {
  const days = usePaymentsSummary((state) => state.payDueDays);
  if (days === null) return null;
  return (
    <section aria-labelledby="pay-due-readonly-title" className="space-y-2">
      <h2 id="pay-due-readonly-title" className="font-semibold text-slate-900">Оплаты</h2>
      <div data-testid="pay-due-readonly" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 sm:px-5">
        <span className="font-semibold text-slate-900">{payDueReadText(days)}.</span>{" "}
        <span className="text-slate-500">{PAY_DUE_READONLY_NOTE}</span>
      </div>
    </section>
  );
}
