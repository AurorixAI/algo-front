import { useCallback, useRef, useState } from "react";
import { orgApi } from "./api";
import { substitutionErrorText } from "./substitutions";
import { opsErrorCode } from "./ops-errors";

/** The lesson whose waiting cancellation is taken back (what the road `lessons/withdraw-cancellation` needs). */
export interface WithdrawTarget {
  groupId: string;
  lessonId: string;
  lessonDate: string;
}

export const WITHDRAW_CANCELLATION_LABEL = "Отозвать отмену";
export const WITHDRAWN_TEXT = "Отмена отозвана: урок снова ждёт отметки";

/** The name of «Отозвать» for a screen reader and for a test: it names the lesson (fifty buttons must not read alike, LESSONS 142). */
export function withdrawButtonLabel(lessonText: string): string {
  return `Отозвать отмену урока: ${lessonText}`;
}

/**
 * LESSON-RULES: «Отозвать отмену» from where the person SEES the cancellation (the journal, the sheet of the lesson, the panel of the teacher) - the same road and the same words as in the block of
 * the dashboard.  The server judges the author, the window and the month (`canWithdraw` only decides whether the button is shown): its refusal is said in ITS words; whatever the outcome the caller reads
 * its lessons again (`reload`), so a lesson that was decided meanwhile disappears from the screen as a waiting one.  One press at a time.
 */
export function useWithdrawCancellation({ say, reload }: {
  say: (text: string, tone: "success" | "error") => void;
  reload: () => void | Promise<void>;
}): { withdraw: (target: WithdrawTarget) => Promise<void>; busyKey: string | null } {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const sending = useRef(false);
  const latest = useRef({ say, reload });
  latest.current = { say, reload };
  const withdraw = useCallback(async (target: WithdrawTarget) => {
    if (sending.current) return;
    sending.current = true;
    setBusyKey(`${target.groupId}|${target.lessonId}|${target.lessonDate}`);
    try {
      await orgApi.withdrawOwnCancellation(target.groupId, { lessonId: target.lessonId, lessonDate: target.lessonDate, expectedKind: "unconfirmed" });
      latest.current.say(WITHDRAWN_TEXT, "success");
    } catch (failure) {
      latest.current.say(opsErrorCode(failure) ? substitutionErrorText(failure) : "Не удалось отозвать отмену. Проверьте соединение и повторите попытку.", "error");
    } finally {
      sending.current = false;
      setBusyKey(null);
      await latest.current.reload();
    }
  }, []);
  return { withdraw, busyKey };
}
