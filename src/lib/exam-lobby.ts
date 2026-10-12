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
