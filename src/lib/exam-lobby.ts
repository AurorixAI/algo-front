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
 * is said only for an exam of TODAY whose lesson has started; an exam of a later day is «Запланирован», of today but not started - «Запланирован · сегодня»,
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

/** «Запланирован · пн, 3 нояб.» - the day is in the badge, the exam is not open yet.  `dayLabel` is already worded («пн, 3 нояб.»).  Today before the start of the lesson (#159 E6): «Запланирован · сегодня». */
export function scheduledExamLabel(state: DashboardExamState, dayLabel: string | null | undefined): string {
  if (state === "today") return "Запланирован · сегодня";
  const day = (dayLabel ?? "").trim();
  return day ? `Запланирован · ${day}` : "Запланирован";
}

// ── the exam in a LIST (#159, LESSONS 56): the library, the group, the administrator's monitor, the pages of one exam ─────────────────────────

/** What a list needs to know about an exam to say its state. */
export interface ExamForState {
  status: string;
  scheduled_lesson_id?: string | null;
  scheduled_lesson_date?: string | null;
  group_id?: string | null;
}

/**
 * The state a list says about an exam: ONE function with the dashboard's (`dashboardExamState`), so the same exam is in the same state on every screen (invariant 3 of #159).
 * `lessonStatus` is the status of the bound lesson TODAY (`null` / `undefined`: not known, so «Лобби открыто» is never claimed: «Запланирован · сегодня»).
 */
export function examListState(exam: ExamForState, today: string, lessonStatus: string | null | undefined): DashboardExamState {
  return dashboardExamState({ status: exam.status, scheduledDate: exam.scheduled_lesson_date, today, lessonStatus });
}

/** The exam is in the lobby by its own status and its lesson is today: only then the status of the lesson is needed (the other days decide by the date alone). */
export function needsLessonStatus(exam: ExamForState, today: string): boolean {
  return exam.status === "lobby" && Boolean(exam.group_id) && Boolean(exam.scheduled_lesson_id) && exam.scheduled_lesson_date === today;
}

/**
 * Two readings of the status of ONE lesson (#159 D2): the one this screen wrote itself a moment ago (the teacher pressed «Начать» here) and the one the poll of the journal brought (a start in another
 * tab / on a phone).  A lesson only goes forward - `scheduled` -> `in_progress` -> `completed` / `cancelled` - so the later of two readings is the true one; an unknown reading (`null`/`undefined`) gives way.
 */
const LESSON_STATUS_RANK: Record<string, number> = { scheduled: 0, in_progress: 1, completed: 2, cancelled: 2 };
export function laterLessonStatus(a: string | null | undefined, b: string | null | undefined): string | null {
  const rank = (status: string | null | undefined) => (status && status in LESSON_STATUS_RANK ? LESSON_STATUS_RANK[status] : -1);
  const best = rank(b) > rank(a) ? b : a;
  return best ?? null;
}

/** The key of `GroupAttendance.statuses`: `<date>_<lessonId>`. */
export function lessonStatusKey(date: string, lessonId: string): string {
  return `${date}_${lessonId}`;
}

/** The three kinds of a lobby exam in the counters and tabs: the lesson is on (`lobby`), the lesson has not begun (`scheduled`: a later day and today before the start), the lesson has passed (`passed`). `null`: not a lobby state. */
export type LobbyBucket = "lobby" | "scheduled" | "passed";
export function lobbyBucketOf(state: DashboardExamState): LobbyBucket | null {
  if (state === "lobby") return "lobby";
  if (state === "upcoming" || state === "today") return "scheduled";
  if (state === "needs_resolution") return "passed";
  return null;
}

/** The words of the chip of a lobby exam: «Лобби открыто» / «Запланирован · пн, 3 нояб.» / «Запланирован · сегодня» / «Занятие прошло».  Nothing else says «Лобби» about an exam that has not begun. */
export function lobbyExamLabel(state: DashboardExamState, dayLabel: string | null | undefined): string {
  if (state === "lobby") return "Лобби открыто";
  if (state === "needs_resolution") return "Занятие прошло";
  return scheduledExamLabel(state, dayLabel);
}

/** The tab (and counter) of an exam in the teacher's lists, the library and the group.  A lobby exam whose lesson has passed waits for the teacher's decision (move or cancel): it stays among the current ones. */
export type ExamTab = "active" | "lobby" | "scheduled" | "draft" | "closed" | "archived";
export function examTabOf(exam: ExamForState, state: DashboardExamState): ExamTab {
  if (exam.status === "archived") return "archived";
  if (!exam.group_id && (exam.status === "active" || exam.status === "lobby")) return "draft";       // an exam without a group is a template of the library
  if (exam.status === "active" || exam.status === "print_ready") return "active";
  if (exam.status === "lobby") {
    const bucket = lobbyBucketOf(state);
    return bucket === "lobby" ? "lobby" : bucket === "scheduled" ? "scheduled" : "active";
  }
  return exam.status === "closed" ? "closed" : "draft";
}

/** How many lobby exams are in each bucket - the counters of the administrator's monitor are made of the very list they filter (a counter is what the list shows). */
export function lobbyCounts<T extends ExamForState>(exams: ReadonlyArray<T>, stateOf: (exam: T) => DashboardExamState): Record<LobbyBucket, number> {
  const tally: Record<LobbyBucket, number> = { lobby: 0, scheduled: 0, passed: 0 };
  for (const exam of exams) {
    const bucket = exam.status === "lobby" ? lobbyBucketOf(stateOf(exam)) : null;
    if (bucket) tally[bucket] += 1;
  }
  return tally;
}

/**
 * The two lobby cards of the administrator's monitor (#159 E1).  The server counts the lobbies of LATER days (`counts.lobby_future`) by the date of the lesson; the lobbies of today are
 * few, the page holds them (`today`, made by {@link lobbyCounts} with the status of the lesson): «Лобби открыто» = the ones whose lesson is on, «Запланированы» = later days + the ones of
 * today whose lesson has not begun.
 */
export function monitorLobbyCounts(server: { lobby_future?: number | null }, today: Record<LobbyBucket, number>): { lobby: number; scheduled: number } {
  return { lobby: today.lobby, scheduled: Math.max(0, Number(server.lobby_future) || 0) + today.scheduled };
}
