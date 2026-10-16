/**
 * Lobby availability of an exam. A printed exam has no lobby and no online
 * student sessions: exam-service answers GET /exams/{id}/lobby-status with 409
 * for it, so the front must not ask in the first place (the browser logs every
 * failed request as a console error, whether or not the code catches it).
 */

export interface ExamDelivery {
  delivery_mode?: string | null;
}

/**
 * The exam's own data decides, never a guess before it has loaded: `null` /
 * `undefined` (still loading) is "not known yet" and therefore "do not ask".
 */
export function examHasLobby(exam: ExamDelivery | null | undefined): boolean {
  return Boolean(exam) && exam!.delivery_mode !== "print";
}

/** 409 from the lobby endpoint = "this exam has no lobby" (e.g. it was switched to print meanwhile). */
export function isNoLobbyConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { status?: unknown }).status === 409;
}

/** The teacher's lobby is asked this often while the answers come. */
export const LOBBY_POLL_MS = 2500;
/** ...and never less often than this while the service (or the session renewal) is unavailable. */
export const LOBBY_POLL_MAX_MS = 30_000;

/**
 * The wait before the next lobby poll. A success goes back to the normal pace; a transient failure (no answer,
 * 429 from the limiter, 5xx, a session that could not be renewed right now) doubles the wait up to the maximum, so
 * an idle tab does not hammer /auth/refresh every 2.5 s; any other failure keeps the current pace.
 */
export function nextLobbyPollDelay(current: number, outcome: "ok" | "transient" | "error"): number {
  if (outcome === "ok") return LOBBY_POLL_MS;
  if (outcome === "transient") return Math.min(Math.max(current, LOBBY_POLL_MS) * 2, LOBBY_POLL_MAX_MS);
  return current;
}
