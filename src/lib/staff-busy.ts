/**
 * A busy exam service is not a broken teacher screen (ROADMAP #95 R3 F2).
 *
 * The exam service caps the teacher/admin requests in flight per worker (TEACHER_SLOTS = 16) and answers the surplus
 * `503 + Retry-After: 2` at once, before the route runs - nothing was done.  4 of the 16 slots are kept for changes
 * (close, start, assign...), so a flood of dashboard reads never takes the teacher's «close» from them.  The staff
 * client therefore asks again, after the server's Retry-After (kept between 1 and 5 s, 2 s without it):
 *
 * - a read (GET) up to twice - repeating a read cannot change anything;
 * - a change (POST...) once, and only where a repeat cannot double the effect (the list below) and only when the
 *   answer carries Retry-After (the server's own «nothing was written, ask again»; a 503 without it, e.g. a failed
 *   group lookup, is shown as it is).  Every other change is not repeated by the client: the teacher sees
 *   «Сервер занят - повторите через пару секунд» and presses the button again.
 */
import { isTransientServerError, retryDelayMs } from "./exam-retry";

/** What a teacher reads when a change was refused as «busy» and was not (or no longer) repeated. */
export const STAFF_BUSY_MESSAGE = "Сервер занят — повторите через пару секунд";

/** Repeats after the first try. */
export const STAFF_READ_REPEATS = 2;
export const STAFF_WRITE_REPEATS = 1;

/**
 * Changes a second request of which does no harm (read in exam-service/src/api/router.py):
 * - `close`: `_finalize_exam` returns at once for an exam that is already closed;
 * - `publish`, `open-lobby`, `assign`: the same lesson again changes nothing (the code is kept, the slot check skips
 *   the exam itself) and a rebinding is refused once a session exists;
 * - `start-live`: guarded by the state (an exam that is no longer in the lobby answers 409, nothing is started twice);
 * - `entry-limits/reset`: starts the counters from zero, once more is the same.
 * NOT repeated: `generate` and `clone` (each creates an exam), `pin` (a toggle), `delete`/`restore`, `report`
 * (a model call), `replace-task`, kicking a student, and every change this list does not name.
 */
const REPEATABLE_WRITE =
  /^\/exams\/[^/?#]+\/(?:publish|open-lobby|assign|close|start-live|entry-limits\/reset)(?:[?#].*)?$/;

export function isRepeatableStaffWrite(method: string, endpoint: string): boolean {
  return method.toUpperCase() === "POST" && REPEATABLE_WRITE.test(endpoint);
}

/** How many times the staff client asks again after this answer (0 = hand the error to the screen). */
export function staffBusyRepeats(method: string, endpoint: string, status: number, retryAfter?: number): number {
  if (status !== 503) return 0;
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return STAFF_READ_REPEATS;
  return retryAfter !== undefined && isRepeatableStaffWrite(verb, endpoint) ? STAFF_WRITE_REPEATS : 0;
}

/** The server's own «busy» on a change (503 + Retry-After): the text the teacher sees instead of the server's long one. */
export function isStaffWriteBusy(method: string, status: number, retryAfter?: number): boolean {
  const verb = method.toUpperCase();
  return status === 503 && retryAfter !== undefined && verb !== "GET" && verb !== "HEAD";
}

/** The wait before asking again: Retry-After kept between one and five seconds, two without it. */
export function staffBusyDelayMs(retryAfter?: number): number {
  return retryDelayMs({ retryAfter });
}

/** Polls that fail this many times in a row (each failure already followed its own repeats) tell the teacher. */
export const POLL_FAILURES_BEFORE_NOTICE = 2;

/**
 * A background poll (dashboard, schedule) failed.  A busy server (503/502/504) is a passing moment: the last verified
 * state stays on screen without an error banner until the failure repeats; any other failure is shown at once.
 * Before the first success there is no verified state to keep (an empty list would read as «nothing is running»):
 * that failure is never quiet.
 */
export function pollFailure(
  error: unknown,
  streak: number,
  haveVerifiedState = true,
): { quiet: boolean; streak: number } {
  if (!isTransientServerError(error)) return { quiet: false, streak: 0 };
  const next = streak + 1;
  return { quiet: haveVerifiedState && next < POLL_FAILURES_BEFORE_NOTICE, streak: next };
}
