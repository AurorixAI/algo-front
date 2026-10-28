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

// ── the card of an exam on the teacher's dashboard ───────────────────────────────────────────────────────────

export type DashboardExamState = "active" | "closed" | "needs_resolution" | "lobby" | "today" | "upcoming";

/**
 * What the dashboard says about an exam.  The server lets students into the lobby only while the lesson the exam is bound to is
 * IN PROGRESS (the teacher started it): before it - 409 «Экзамен станет доступен после начала назначенного урока».  So «Лобби открыто»
 * is said only for an exam of TODAY whose lesson has started; an exam of a later day is «Запланирован», of today but not started - «Сегодня»,
 * a lesson that is already past - «Нужно действие».  An exam with no lesson date cannot be entered at all: it is «Запланирован».
 * `status` is the exam's own (lobby / print_ready / active / closed); `lessonStatus` is the status of the bound lesson on `today` (null: unknown).
 */
export function dashboardExamState(input: {
  status: string;
  scheduledDate: string | null | undefined;
  today: string;
  lessonStatus: string | null | undefined;
}): DashboardExamState {
  if (input.status === "active") return "active";
  if (input.status === "closed") return "closed";
  const date = input.scheduledDate || "";
  if (date && date < input.today) return "needs_resolution";    // no lesson date - no «занятие прошло»
  if (date && date === input.today) return input.status === "lobby" && input.lessonStatus === "in_progress" ? "lobby" : "today";
  return "upcoming";
}

/** «Запланирован · пн, 3 нояб.» - the day is in the badge, the exam is not open yet.  `dayLabel` is already worded («пн, 3 нояб.»). */
export function scheduledExamLabel(state: DashboardExamState, dayLabel: string | null | undefined): string {
  if (state === "today") return "Сегодня";
  const day = (dayLabel ?? "").trim();
  return day ? `Запланирован · ${day}` : "Запланирован";
}
