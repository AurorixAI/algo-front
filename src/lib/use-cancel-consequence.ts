import { orgApi } from "./api";
import { consequenceTextOf } from "./cancel-preview";
import { useMoneyPreview } from "./use-money-preview";

/** The lesson to be cancelled that a window asks about. */
export interface CancelConsequenceTarget {
  groupId: string;
  lessonId: string;
  /** YYYY-MM-DD */
  lessonDate: string;
}

/**
 * Money-1 Г (Р-4): the sentence about the students for cancelling a lesson to come, read from the server when the window opens (`GET …/lessons/cancel-consequence`).  `target` null: nothing to ask.
 * `loading` holds the place (a skeleton); a refusal to load is `text: null` and `loading: false` - the cancellation itself is never blocked by it.
 */
export function useCancelConsequence(target: CancelConsequenceTarget | null): { loading: boolean; text: string | null } {
  const { preview } = useMoneyPreview(
    target ? `${target.groupId}|${target.lessonId}|${target.lessonDate}` : null,
    (signal) => orgApi.cancelConsequence(target!.groupId, { lessonDate: target!.lessonDate, lessonId: target!.lessonId }, signal),
  );
  return { loading: preview.status === "loading", text: preview.status === "ready" ? consequenceTextOf(preview.answer) : null };
}
