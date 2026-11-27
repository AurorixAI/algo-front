"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { WaitingCancelDialog } from "@/components/substitutions/waiting-cancel-dialog";
import { useSubstitutionBadge } from "@/lib/substitution-badge";
import { DECIDE_WAITING_LABEL, WAITING_CANCEL_LABEL, isWaitingKind } from "@/lib/payf";
import type { WaitingOutcome } from "@/lib/lesson-rules";
import type { Lesson } from "@/lib/api";

/**
 * LESSON-RULES Э9: the sheet of a lesson whose cancellation WAITS for the owner (`unconfirmed`): the chip says so, who may decide it (the money right) has «Решить» - the window of «Замены» with the three
 * outcomes.  Nothing for any other kind of a cancellation (the sheet's own «Изменить причину отмены» is for `centre` / `holiday`).
 */
export function SheetWaitingNotice({ kind, groupId, title, lesson, moneyRight, onDecided, onAlreadyDecided }: {
  kind: string | null | undefined;
  groupId: string;
  title: string;
  lesson: Pick<Lesson, "id" | "date" | "startTime" | "start_time" | "endTime">;
  moneyRight: boolean;
  /** THIS person decided it: the sheet says the outcome in the toast of the page and closes. */
  onDecided: (outcome: WaitingOutcome) => void;
  /** SOMEBODY ELSE decided it first: the schedule behind is read again, the sheet and the window stay (the window says who and when). */
  onAlreadyDecided: () => void;
}) {
  const [deciding, setDeciding] = useState(false);
  // the window outlives the mark of the lesson: when the schedule is read again after «уже решено» the lesson is no longer waiting, but the person still reads the sentence of the server
  if (!isWaitingKind(kind) && !deciding) return null;
  const decideWindow = (
    <WaitingCancelDialog
      item={deciding ? { group: { id: groupId, name: title }, lesson: { lessonId: lesson.id, date: lesson.date, startTime: lesson.startTime || lesson.start_time || null, endTime: lesson.endTime || null } } : null}
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
          {moneyRight && <button type="button" data-testid="sheet-decide-waiting" onClick={() => setDeciding(true)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-primary-700 hover:bg-white">{DECIDE_WAITING_LABEL}</button>}
        </div>
      )}
      {decideWindow}
    </>
  );
}
