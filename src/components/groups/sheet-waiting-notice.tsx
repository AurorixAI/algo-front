"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { WaitingCancelDialog } from "@/components/substitutions/waiting-cancel-dialog";
import { useSubstitutionBadge } from "@/lib/substitution-badge";
import { DECIDE_WAITING_LABEL, WAITING_CANCEL_LABEL, isWaitingKind } from "@/lib/payf";
import { reportedByText, type WaitingOutcome } from "@/lib/lesson-rules";
import { WITHDRAW_CANCELLATION_LABEL, useWithdrawCancellation, withdrawButtonLabel } from "@/lib/use-withdraw-cancellation";
import { lessonLabel } from "@/lib/substitutions";
import { Notice } from "@/components/ui/notice";
import type { Lesson } from "@/lib/api";

/**
 * LESSON-RULES Э9: the sheet of a lesson whose cancellation WAITS for the owner (`unconfirmed`): the chip says so, who may decide it (the money right) has «Решить» - the window of «Замены» with the three
 * outcomes.  Nothing for any other kind of a cancellation (the sheet's own «Изменить причину отмены» is for `centre` / `holiday`).
 */
export function SheetWaitingNotice({ kind, groupId, title, lesson, moneyRight, onDecided, onAlreadyDecided, onWithdrawn, onWithdrawFailed }: {
  kind: string | null | undefined;
  groupId: string;
  title: string;
  lesson: Pick<Lesson, "id" | "date" | "startTime" | "start_time" | "endTime" | "reportedBy" | "reportedByRole" | "canWithdraw">;
  moneyRight: boolean;
  /** THIS person decided it: the sheet says the outcome in the toast of the page and closes. */
  onDecided: (outcome: WaitingOutcome) => void;
  /** SOMEBODY ELSE decided it first: the schedule behind is read again, the sheet and the window stay (the window says who and when). */
  onAlreadyDecided: () => void;
  /** The author took his cancellation back (the sheet says it in the toast of the page and closes). */
  onWithdrawn: (text: string) => void;
  /** The server refused (somebody decided first, the window passed): the schedule behind is read again, the sheet stays and says why. */
  onWithdrawFailed: () => void;
}) {
  const [deciding, setDeciding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { withdraw, busyKey } = useWithdrawCancellation({
    say: (text, tone) => { if (tone === "success") onWithdrawn(text); else { setProblem(text); onWithdrawFailed(); } },
    reload: () => undefined,
  });
  // ONE object for one lesson: the window must not see a «new» lesson on every render of the sheet (that made it ask the server again and again)
  const { id: lessonId, date, reportedBy, reportedByRole } = lesson;
  const startTime = lesson.startTime || lesson.start_time || null;
  const endTime = lesson.endTime || null;
  const target = useMemo(() => (deciding
    ? { group: { id: groupId, name: title }, lesson: { lessonId, date, startTime, endTime }, reportedBy: reportedBy ?? null, reportedByRole: reportedByRole ?? null }
    : null), [deciding, groupId, title, lessonId, date, startTime, endTime, reportedBy, reportedByRole]);
  // the window outlives the mark of the lesson: when the schedule is read again after «уже решено» the lesson is no longer waiting, but the person still reads the sentence of the server
  if (!isWaitingKind(kind) && !deciding && !problem) return null;
  const reported = reportedByText(lesson.reportedBy, lesson.reportedByRole);
  const decideWindow = (
    <WaitingCancelDialog
      item={target}
      onClose={() => setDeciding(false)}
      onDecided={(outcome) => { void useSubstitutionBadge.getState().refresh(true); onDecided(outcome); }}
      onAlreadyDecided={() => { void useSubstitutionBadge.getState().refresh(true); onAlreadyDecided(); }}
    />
  );
  return (
    <>
      {isWaitingKind(kind) && (
        <div data-testid="sheet-waiting" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <Chip tone="warn" testId="sheet-waiting-chip">{WAITING_CANCEL_LABEL}</Chip>
          {(moneyRight || lesson.canWithdraw === true) && (
            <div className="flex flex-wrap items-center gap-1">
              {moneyRight && <button type="button" data-testid="sheet-decide-waiting" onClick={() => setDeciding(true)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-primary-700 hover:bg-white">{DECIDE_WAITING_LABEL}</button>}
              {lesson.canWithdraw === true && (
                <button
                  type="button"
                  data-testid="sheet-withdraw"
                  aria-label={withdrawButtonLabel(lessonLabel({ group: { name: title }, lesson: { date: lesson.date, startTime: lesson.startTime || lesson.start_time, endTime: lesson.endTime } }))}
                  disabled={busyKey !== null}
                  onClick={() => { setProblem(null); void withdraw({ groupId, lessonId: lesson.id, lessonDate: lesson.date }); }}
                  className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-primary-700 hover:bg-white disabled:opacity-60"
                >{WITHDRAW_CANCELLATION_LABEL}</button>
              )}
            </div>
          )}
          {reported && <p data-testid="sheet-waiting-by" className="w-full text-sm text-slate-700">{reported}</p>}
        </div>
      )}
      {problem && <Notice variant="warning" role="alert" testId="sheet-withdraw-problem">{problem}</Notice>}
      {decideWindow}
    </>
  );
}
