"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { WaitingCancelDialog } from "@/components/substitutions/waiting-cancel-dialog";
import { DECIDE_WAITING_LABEL, WAITING_CANCEL_LABEL, isWaitingKind } from "@/lib/payf";
import type { Lesson } from "@/lib/api";

/**
 * LESSON-RULES Э9: the sheet of a lesson whose cancellation WAITS for the owner (`unconfirmed`): the chip says so, who may decide it (the money right) has «Решить» - the window of «Замены» with the three
 * outcomes.  Nothing for any other kind of a cancellation (the sheet's own «Изменить причину отмены» is for `centre` / `holiday`).
 */
export function SheetWaitingNotice({ kind, groupId, title, lesson, moneyRight, onDecided }: {
  kind: string | null | undefined;
  groupId: string;
  title: string;
  lesson: Pick<Lesson, "id" | "date" | "startTime" | "start_time" | "endTime">;
  moneyRight: boolean;
  onDecided: () => void;
}) {
  const [deciding, setDeciding] = useState(false);
  if (!isWaitingKind(kind)) return null;
  return (
    <div data-testid="sheet-waiting" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
      <Chip tone="warn" testId="sheet-waiting-chip">{WAITING_CANCEL_LABEL}</Chip>
      {moneyRight && <button type="button" data-testid="sheet-decide-waiting" onClick={() => setDeciding(true)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-primary-700 hover:bg-white">{DECIDE_WAITING_LABEL}</button>}
      <WaitingCancelDialog
        item={deciding ? { group: { id: groupId, name: title }, lesson: { lessonId: lesson.id, date: lesson.date, startTime: lesson.startTime || lesson.start_time || null, endTime: lesson.endTime || null } } : null}
        onClose={() => setDeciding(false)}
        onDecided={onDecided}
        showToast={() => {}}
      />
    </div>
  );
}
