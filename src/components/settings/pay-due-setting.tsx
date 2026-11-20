"use client";

import { useEffect, useState } from "react";
import { orgApi } from "@/lib/api";
import { usePaymentsSummary } from "@/lib/payments-summary";
import type { PaymentSettings, PaymentSettingsChanged } from "@/lib/payments";
import { formatBusinessDate } from "@/lib/business-time";
import {
  PAY_DUE_DAYS_LABEL,
  PAY_DUE_DAYS_RANGE,
  PAY_DUE_DAYS_UNIT,
  PAY_DUE_HELP,
  PAY_DUE_LESSONS_HINT,
  PAY_DUE_LESSONS_LABEL,
  PAY_DUE_LESSONS_RANGE,
  PAY_DUE_READONLY_NOTE,
  PAY_DUE_TITLE,
  daysWord,
  lessonsUnit,
  payDueBody,
  payDueExample,
  payDueImpactLines,
  payDueLessonsExample,
  payDueReadText,
  payDueSavedText,
  payDueValid,
} from "@/lib/pay-due-setting";
import { HelpToggle } from "@/components/ui/help-toggle";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";

type Term = Pick<PaymentSettings, "pay_due_days" | "pay_due_lessons">;
const toNumber = (text: string): number => (text === "" ? NaN : Number(text));

/**
 * «Срок оплаты» of the settings (PAY-DUE frames 1-4, 22): ONE line with the number and a live example under it; once the number changes - the server's line about the students (the dry run) and the buttons.
 * The owner changes it (own save, own dry run: it never goes with the other fields of the section); the example is only the arithmetic of the day, the words about the students are the server's.
 * `calendar` / `lessons`: which field the centre's mode shows; both while the mode is being changed (the owner sees what each mode will use).
 */
export function PayDueSetting({ draft, model, onNotify }: {
  /** The draft of the payment settings of the page (`form` = what the owner has picked, `loaded` = what the server holds, `adopt` = take the server's answer). */
  draft: { form: PaymentSettings; loaded: PaymentSettings; adopt: (next: Partial<PaymentSettings>) => void };
  /** The mode picked on the page: both fields are shown while it differs from the saved one. */
  model: "payment_date" | "fixed_day" | "lessons";
  onNotify: (text: string) => void;
}) {
  const { form: picked, loaded } = draft;
  const anchor = picked.billing_anchor === "fixed_day" ? "fixed_day" : "payment_date";
  const billingDay = Number.isNaN(picked.billing_day) ? 1 : picked.billing_day;
  const kinds = { calendar: model !== "lessons" || loaded.period_mode === "calendar", lessons: model === "lessons" || loaded.period_mode === "lessons" };
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const onSaved = (updated: PaymentSettingsChanged) => {
    draft.adopt({ pay_due_days: updated.pay_due_days, pay_due_lessons: updated.pay_due_lessons, updated_by: updated.updated_by, updated_at: updated.updated_at });
    void refreshSummary(true, { recheck: true });      // the cards and the tabs name the sums by the new term: the summary is read again
  };
  const [days, setDays] = useState(String(loaded.pay_due_days));
  const [lessons, setLessons] = useState(String(loaded.pay_due_lessons));
  const [impact, setImpact] = useState<{ key: string; lines: string[]; error: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // what the server holds changed (a save, a reload): the fields show it
  useEffect(() => { setDays(String(loaded.pay_due_days)); setLessons(String(loaded.pay_due_lessons)); }, [loaded.pay_due_days, loaded.pay_due_lessons]);

  const form: Term = { pay_due_days: toNumber(days), pay_due_lessons: toNumber(lessons) };
  const valid = payDueValid(form);
  const body = valid ? payDueBody(loaded, form) : {};
  const dirty = Object.keys(body).length > 0;
  const bodyKey = JSON.stringify(body);

  // the dry run is asked with EXACTLY the body that «Сохранить» sends; nothing is written by it
  useEffect(() => {
    if (!dirty) { setImpact(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      orgApi.previewPaymentSettings(JSON.parse(bodyKey))
        .then((answer) => { if (!cancelled) setImpact({ key: bodyKey, lines: payDueImpactLines(answer.pay_due_impact), error: null }); })
        .catch((cause) => { if (!cancelled) setImpact({ key: bodyKey, lines: [], error: cause instanceof Error ? cause.message : "Не удалось проверить срок" }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dirty, bodyKey]);

  const cancel = () => { setDays(String(loaded.pay_due_days)); setLessons(String(loaded.pay_due_lessons)); setError(null); };
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await orgApi.updatePaymentSettings(body);
      onSaved(updated);
      onNotify(payDueSavedText(updated.pay_due_days ?? form.pay_due_days));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить срок");
    } finally {
      setSaving(false);
    }
  };

  const today = formatBusinessDate();
  const daysExample = payDueExample({ anchor, billingDay, days: form.pay_due_days, today });
  const lessonsExample = payDueLessonsExample(form.pay_due_lessons);
  const currentImpact = impact && impact.key === bodyKey ? impact : null;

  return (
    <div id="pay-due" data-testid="pay-due-block" className="space-y-4 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
      {/* the parent of the «?» is a block: its note takes its own row */}
      <div className="pr-2">
        <h3 className="mr-1.5 inline text-sm font-semibold text-slate-900">{PAY_DUE_TITLE}</h3>
        <HelpToggle label="Подробнее" testId="pay-due-help">{PAY_DUE_HELP}</HelpToggle>
      </div>

      {kinds.calendar && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="pay-due-days" className="text-sm text-slate-800">{PAY_DUE_DAYS_LABEL}</label>
            <NumberInput
              id="pay-due-days"
              data-testid="pay-due-days"
              value={days}
              onChange={setDays}
              min={PAY_DUE_DAYS_RANGE.min}
              max={PAY_DUE_DAYS_RANGE.max}
              stepper
              wrapperClassName="w-28"
              className="text-center font-semibold"
              aria-describedby="pay-due-days-example"
            />
            <span className="text-sm text-slate-800">{PAY_DUE_DAYS_UNIT}</span>
          </div>
          {daysExample && <p id="pay-due-days-example" className="text-sm text-slate-500" data-testid="pay-due-example">{daysExample}</p>}
        </div>
      )}

      {kinds.lessons && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="pay-due-lessons" className="text-sm text-slate-800">{PAY_DUE_LESSONS_LABEL}</label>
            <NumberInput
              id="pay-due-lessons"
              data-testid="pay-due-lessons"
              value={lessons}
              onChange={setLessons}
              min={PAY_DUE_LESSONS_RANGE.min}
              max={PAY_DUE_LESSONS_RANGE.max}
              stepper
              wrapperClassName="w-28"
              className="text-center font-semibold"
              aria-describedby="pay-due-lessons-example"
            />
            <span className="text-sm text-slate-800">{Number.isFinite(form.pay_due_lessons) ? lessonsUnit(form.pay_due_lessons) : "урока"}</span>
            <span className="text-xs text-slate-500">({PAY_DUE_LESSONS_HINT})</span>
          </div>
          {lessonsExample && <p id="pay-due-lessons-example" className="text-sm text-slate-500" data-testid="pay-due-lessons-example">{lessonsExample}</p>}
        </div>
      )}

      {dirty && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {currentImpact?.lines.map((line) => (
            <p key={line} className="flex items-start gap-2 text-sm text-slate-800" data-testid="pay-due-impact" role="status">
              <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-600" />
              <span>После сохранения: {line}</span>
            </p>
          ))}
          {currentImpact?.error && <p role="alert" className="text-sm font-medium text-rose-700">{currentImpact.error}</p>}
          {error && <p role="alert" className="text-sm font-medium text-rose-700" data-testid="pay-due-error">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="md" onClick={cancel} disabled={saving} data-testid="pay-due-cancel" className="max-sm:w-full">Отмена</Button>
            <Button type="button" variant="primary" size="md" onClick={() => void save()} loading={saving} data-testid="pay-due-save" className="max-sm:w-full">Сохранить</Button>
          </div>
        </div>
      )}
      {!valid && (
        <p role="alert" className="text-sm font-medium text-rose-700" data-testid="pay-due-range">
          {Number.isNaN(form.pay_due_days) || form.pay_due_days < PAY_DUE_DAYS_RANGE.min || form.pay_due_days > PAY_DUE_DAYS_RANGE.max
            ? `Срок: от ${PAY_DUE_DAYS_RANGE.min} до ${PAY_DUE_DAYS_RANGE.max} ${daysWord(PAY_DUE_DAYS_RANGE.max)}`
            : `Уроков без оплаты: от ${PAY_DUE_LESSONS_RANGE.min} до ${PAY_DUE_LESSONS_RANGE.max}`}
        </p>
      )}
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
