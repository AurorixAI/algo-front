"use client";

import { orgApi } from "@/lib/api";
import { DEDUCTIONS_TITLE, deductionsOf } from "@/lib/lesson-return";
import { EFFECTS_TITLE, effectLines, studentEffectText, type MoneyEffects } from "@/lib/money-effects";
import { formatMoney } from "@/lib/money-format";
import type { EffectsPreview } from "@/lib/money-preview";
import { DRY_RUN_REASON } from "@/lib/dry-run";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { EffectLines, MoneyEffectsBlock } from "@/components/money/money-effects-block";

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
  // re-audit В4: ONE block «Что изменится» - the students' recalculation (a table: name, sum) and the pay of the teacher under it; the deductions that go away are money, so «деньги не изменятся» is never said next to them
  if (preview.status === "ready" && deductions.length > 0) {
    // the same student is named ONCE: what happens to his lesson is a quiet tail of his row, not a second line with his name
    const sameStudent = (a: { studentId: string; name: string | null }, b: { studentId: string; name: string | null }) => a.studentId === b.studentId || (Boolean(a.name) && a.name === b.name);
    const packOf = (line: { studentId: string; name: string }) => { const found = (preview.effects?.students ?? []).find((student) => sameStudent(student, line)); return found ? studentEffectText(found).replace(/^[^:]*:\s*/, "") : null; };
    const rest = preview.effects ? { ...preview.effects, students: preview.effects.students.filter((student) => !deductions.some((line) => sameStudent(student, line))) } : null;
    const lines = effectLines(rest);
    const total = deductions.reduce((all, line) => all + line.amount, 0);
    return (
      <section aria-label={EFFECTS_TITLE} data-testid="return-review-deductions" className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
        <div>
          <p className="text-sm text-slate-800">{DEDUCTIONS_TITLE}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-800" data-testid="return-review-deduction-rows">
            {deductions.map((line) => (
              <li key={line.studentId} className="flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums"><span className="min-w-0">{line.name}{packOf(line) && <span className="ml-2 text-xs text-slate-600">· {packOf(line)}</span>}</span><span className="whitespace-nowrap">{formatMoney(line.amount)}</span></li>
            ))}
            {deductions.length > 1 && <li className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-0.5 font-semibold tabular-nums"><span>Всего</span><span className="whitespace-nowrap">{formatMoney(total)}</span></li>}
          </ul>
        </div>
        {lines.length > 0 && rest && <EffectLines effects={rest as MoneyEffects} />}
      </section>
    );
  }
  return <MoneyEffectsBlock preview={preview} onRetry={onRetry} aboveLessonPanel={aboveLessonPanel} />;
}
