"use client";

import { orgApi } from "@/lib/api";
import { DEDUCTIONS_TITLE, deductionsOf, deductionText } from "@/lib/lesson-return";
import { effectsEmpty } from "@/lib/money-effects";
import type { EffectsPreview } from "@/lib/money-preview";
import { DRY_RUN_REASON } from "@/lib/dry-run";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";

/**
 * R3 K2 / #23: the dry run of «Вернуть урок» of a CANCELLED lesson (`lessons/restore` with `dryRun: true`): WHOSE deduction for the cancelled lesson goes away and by how much, and what it does
 * to the packs and the saved sheets - asked when the window opens, before the button.  One hook and one block for the two windows that restore a lesson (the lesson that had begun, «Урока не
 * было» by mistake, and the cancelled lesson of the schedule that has not begun).
 */
export function useRestorePreview(target: { groupId: string; lessonId: string; lessonDate: string } | null) {
  const key = target ? `${target.groupId}|${target.lessonId}|${target.lessonDate}` : null;
  return useMoneyPreview(key, (signal) => {
    if (!target) return Promise.reject(new Error("no target"));
    return orgApi.restoreLesson(target.groupId, { lessonId: target.lessonId, lessonDate: target.lessonDate, reason: DRY_RUN_REASON, dryRun: true }, signal);
  });
}

export function RestoreConsequences({ preview, onRetry, aboveLessonPanel = false }: { preview: EffectsPreview; onRetry: () => void; aboveLessonPanel?: boolean }) {
  const deductions = preview.status === "ready" ? deductionsOf(preview.answer) : [];
  // the block says «деньги не изменятся» only when it is true: deductions that go away are money, listed above it
  const showEffects = preview.status !== "ready" || deductions.length === 0 || (preview.effects !== null && !effectsEmpty(preview.effects));
  return (
    <>
      {deductions.length > 0 && (
        <section aria-label={DEDUCTIONS_TITLE} data-testid="return-review-deductions" className="rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-600">{DEDUCTIONS_TITLE}</p>
          <ul className="mt-1 space-y-0.5">
            {deductions.map((line) => <li key={line.studentId} className="text-sm text-slate-800">{deductionText(line)}</li>)}
          </ul>
        </section>
      )}
      {showEffects && <MoneyEffectsBlock preview={preview} onRetry={onRetry} aboveLessonPanel={aboveLessonPanel} />}
    </>
  );
}
