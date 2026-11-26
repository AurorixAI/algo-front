"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TAP_ZONE } from "@/lib/tap-zone";
import { Select } from "@/components/ui/select";
import { SettingsSection } from "@/components/settings/settings-section";
import { LESSON_RULES_LEDE, LESSON_RULES_TITLE, windowOptionLabel, type LessonRuleItem, type LessonRulesOut } from "@/lib/lesson-rules";

type Status = "loading" | "ready" | "unavailable";

const itemOf = (rules: LessonRulesOut | null, key: LessonRuleItem["key"]): LessonRuleItem | null => rules?.items.find((item) => item.key === key) ?? null;

/**
 * LESSON-RULES Э8 «Настройки → Уроки»: the two rules of the lessons of the centre (the owner's alone) - how many days a teacher closes and cancels a past lesson himself (a choice) and whether the cancellation
 * of a past lesson by a teacher waits for the owner (a switch in the grey plate, like «Администратор работает с деньгами»).  The words, the allowed values and the defaults are the SERVER's (`GET /org/settings/lessons`,
 * LESSONS 143): the screen shows them as they come; a change acts for the actions after it.
 */
export function LessonRulesSection() {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [rules, setRules] = useState<LessonRulesOut | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [save, setSave] = useState<{ saving: boolean; saved: boolean; error: string | null }>({ saving: false, saved: false, error: null });
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let off = false;
    setStatus("loading");
    orgApi.getLessonRules()
      .then((data) => {
        if (off) return;
        setRules(data);
        // what the owner has already changed is not overwritten by a late answer
        if (!touched.current) { setDays(data.teacher_lesson_window_days); setConfirm(data.past_cancel_needs_confirmation); }
        setStatus("ready");
      })
      .catch(() => { if (!off) setStatus("unavailable"); });
    return () => { off = true; };
  }, [attempt]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const windowRule = itemOf(rules, "teacher_lesson_window_days");
  const confirmation = itemOf(rules, "past_cancel_needs_confirmation");
  const changed = rules !== null && (days !== rules.teacher_lesson_window_days || confirm !== rules.past_cancel_needs_confirmation);

  const submit = async () => {
    if (!rules || !changed || save.saving) return;
    setSave({ saving: true, saved: false, error: null });
    try {
      // only what changed: an absent field stays (the server says so)
      const body: { teacher_lesson_window_days?: number; past_cancel_needs_confirmation?: boolean } = {};
      if (days !== null && days !== rules.teacher_lesson_window_days) body.teacher_lesson_window_days = days;
      if (confirm !== null && confirm !== rules.past_cancel_needs_confirmation) body.past_cancel_needs_confirmation = confirm;
      const updated = await orgApi.putLessonRules(body);
      setRules(updated);
      setDays(updated.teacher_lesson_window_days);
      setConfirm(updated.past_cancel_needs_confirmation);
      touched.current = false;
      setSave({ saving: false, saved: true, error: null });
      timer.current = setTimeout(() => setSave((previous) => ({ ...previous, saved: false })), 3000);
    } catch (failure) {
      setSave({ saving: false, saved: false, error: failure instanceof Error && failure.message ? failure.message : "Не удалось сохранить. Данные не изменены." });
    }
  };

  return (
    <SettingsSection
      title={LESSON_RULES_TITLE}
      description={LESSON_RULES_LEDE}
      icon={ClipboardCheck}
      onSave={() => void submit()}
      saving={save.saving}
      saved={save.saved}
      disabledSave={status !== "ready" || !changed}
    >
      {status === "loading" ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" aria-label="Загрузка" /></div>
      ) : status === "unavailable" || !windowRule || !confirmation ? (
        <div role="alert" data-testid="lesson-rules-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          Не удалось загрузить правила уроков.
          <Button type="button" onClick={() => setAttempt((n) => n + 1)} variant="secondary" size="sm" className="border-danger-200 text-danger-700 hover:bg-danger-50">Повторить</Button>
        </div>
      ) : (
        <>
          <div data-testid="lesson-rule-window">
            <p id="lesson-window-label" className="mb-1.5 block text-sm font-semibold text-slate-700">{windowRule.title}</p>
            <Select
              id="lesson-window"
              ariaLabel={windowRule.title}
              testId="lesson-window-select"
              className="w-40"
              options={(windowRule.allowed as number[]).map((value) => ({ value: String(value), label: windowOptionLabel(value) }))}
              value={String(days ?? windowRule.value)}
              onChange={(event: { target: { value: string } }) => { touched.current = true; setSave({ saving: false, saved: false, error: null }); setDays(Number(event.target.value)); }}
            />
            <p data-testid="lesson-window-hint" className="mt-1.5 text-xs text-slate-500">{windowRule.hint}</p>
          </div>

          <div data-testid="lesson-rule-confirm" className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="min-w-0">
              <p id="lesson-confirm-label" className="text-sm font-semibold text-slate-900">{confirmation.title}</p>
              <p data-testid="lesson-confirm-hint" className="mt-0.5 text-xs text-slate-500">{confirmation.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={confirm === true}
              aria-labelledby="lesson-confirm-label"
              data-testid="lesson-confirm-switch"
              data-touch-zone=""
              onClick={() => { touched.current = true; setSave({ saving: false, saved: false, error: null }); setConfirm(!(confirm === true)); }}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${TAP_ZONE} ${confirm === true ? "bg-primary-600" : "bg-slate-300"}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${confirm === true ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {save.error && <p role="alert" data-testid="lesson-rules-save-error" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">{save.error}</p>}
        </>
      )}
    </SettingsSection>
  );
}
