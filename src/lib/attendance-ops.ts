/**
 * O6 / O7 / O8 / decision 7 (LOGIC-B): what the lesson screens do with the new answers of the attendance endpoints -
 * the version of a lesson record (optimistic lock), the conflict of two editors, a live exam at the finish,
 * an empty roster, a lesson older than the window of the centre.  Pure: no React, no network.
 */
import { addIsoDays, formatLessonWhen, formatUtcNaiveAsBusinessTime } from "./business-time";
import {
  LESSON_TOO_OLD_HINT,
  lessonTooOldText,
  NO_STUDENTS_FINISH_TEXT,
  NO_STUDENTS_START_TEXT,
  opsErrorCode,
  opsErrorDetail,
  errorMessageOf,
} from "./ops-errors";
import { substitutionErrorText } from "./substitutions";
import type { AttendanceConflictDetail, ExamSync, LiveExamDetail, LiveExamItem } from "./ops-b-types";
import type { ConfirmRequest } from "./confirm-dialog";

// ── the window of the teacher (decision 7; LESSON-RULES: the window is the rule of the CENTRE - the server says it) ──

/** The server marks a lesson the teacher may not close himself (`requiresAdmin` of the open action): older than the window of the centre.  No copy of the number of days lives here. */
export function isLockedByServer(action: { requiresAdmin?: boolean | null } | null | undefined): boolean {
  return action?.requiresAdmin === true;
}

export interface OpenLessonAccess {
  /** the row is grey and has no buttons */
  locked: boolean;
  /** «Обратитесь к администратору» under a locked row */
  hint: string | null;
}

/**
 * A row of «Уроки без отметки» for this viewer: the server says `requiresAdmin` for a teacher and a lesson older than the window of the centre; nothing is guessed from the date.
 * Owner and administrator are never locked by the window.
 */
export function openLessonAccess(
  action: { requiresAdmin?: boolean | null },
  viewerRole: string | null | undefined,
): OpenLessonAccess {
  const manager = viewerRole === "owner" || viewerRole === "admin";
  if (manager) return { locked: false, hint: null };
  return isLockedByServer(action) ? { locked: true, hint: LESSON_TOO_OLD_HINT } : { locked: false, hint: null };
}

// ── versions (O7) ───────────────────────────────────────────────────────────────────────────────

export type VersionMap = Record<string, number>;

/** The version to send as `expectedVersion`: the last one this screen saw for the lesson (an older server sends none: nothing is sent). */
export function expectedVersionFor(versions: VersionMap | null | undefined, key: string): number | undefined {
  const value = versions?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** After a read: the server's versions win for every lesson without a save on its way. */
export function mergeVersions(current: VersionMap, loaded: VersionMap | null | undefined, pendingKeys: string[] = []): VersionMap {
  const next: VersionMap = { ...current };
  for (const [key, value] of Object.entries(loaded ?? {})) {
    if (pendingKeys.includes(key)) continue;
    next[key] = value;
  }
  return next;
}

/** After a save: remember the version the server answered. */
export function withSavedVersion(versions: VersionMap, key: string, result: { version?: number | null } | null | undefined): VersionMap {
  return typeof result?.version === "number" ? { ...versions, [key]: result.version } : versions;
}

// ── the conflict of two editors (O7.R4) ─────────────────────────────────────────────────────────

export type MarkValue = string;
export type MarkRecords = Record<string, MarkValue>;

export function isAttendanceConflict(error: unknown): boolean {
  return opsErrorCode(error) === "ATTENDANCE_CONFLICT";
}

export function conflictDetailOf(error: unknown): AttendanceConflictDetail | null {
  if (!isAttendanceConflict(error)) return null;
  const detail = opsErrorDetail<AttendanceConflictDetail>(error);
  if (!detail || typeof detail.currentVersion !== "number") return null;
  return { ...detail, records: detail.records ?? {} };
}

/**
 * «Отметки изменены: Петров П., 10:42» - the time on the Tashkent clock (the server sends UTC).  The author is not known (Money-1 Г-11: a save without a version): the sentence of the server
 * stands as it is («Отметки изменились — обновите страницу»), never «Отметки изменены: <пусто>».
 */
export function conflictHeadline(detail: AttendanceConflictDetail): string {
  const name = (detail.updatedBy?.name ?? "").trim();
  const time = formatUtcNaiveAsBusinessTime(detail.updatedAt);
  if (name && time) return `Отметки изменены: ${name}, ${time}`;
  if (name) return `Отметки изменены: ${name}`;
  return (detail.message ?? "").trim() || "Отметки изменил другой сотрудник";
}

/** The window's title says WHAT happened; the line under it says who and when (`conflictHeadline`), the next one what happens to my marks - three different things (G3M Ф4). */
export const CONFLICT_TITLE = "Журнал изменили, пока вы отмечали";
export const CONFLICT_EXPLAIN = "Ваши несохранённые отметки останутся в окне, пока вы не выберете, чьи оставить.";
export const CONFLICT_KEEP_MINE = "Оставить мои";
export const CONFLICT_TAKE_THEIRS = "Принять чужие";

export interface ConflictRow {
  studentId: string;
  /** my edit: a status, or "" when I took the mark off */
  mine: MarkValue;
  /** what the journal holds now (the other person's save) */
  current: MarkValue;
  /** the other person set something different from what my edit says */
  differs: boolean;
}

/**
 * My edits are the students whose mark differs from `base` (what I loaded or saved last).  Each is shown with what the journal
 * holds now; `differs` marks the ones the other person touched differently.
 */
export function conflictRows(base: MarkRecords, mine: MarkRecords, theirs: MarkRecords): ConflictRow[] {
  const ids = new Set([...Object.keys(base), ...Object.keys(mine)]);
  const rows: ConflictRow[] = [];
  for (const studentId of ids) {
    const baseValue = base[studentId] ?? "";
    const mineValue = mine[studentId] ?? "";
    if (mineValue === baseValue) continue; // not my edit
    const current = theirs[studentId] ?? "";
    rows.push({ studentId, mine: mineValue, current, differs: current !== mineValue });
  }
  return rows;
}

/** «Оставить мои»: the other person's marks with my edits laid over them (an edit that took a mark off removes it). */
export function mergeKeepMine(base: MarkRecords, mine: MarkRecords, theirs: MarkRecords): MarkRecords {
  const merged: MarkRecords = { ...theirs };
  const ids = new Set([...Object.keys(base), ...Object.keys(mine)]);
  for (const studentId of ids) {
    const baseValue = base[studentId] ?? "";
    const mineValue = mine[studentId] ?? "";
    if (mineValue === baseValue) continue;
    if (mineValue) merged[studentId] = mineValue;
    else delete merged[studentId];
  }
  return merged;
}

/** Two sets of marks say the same thing (the server's idempotent repeat compares exactly this). */
export function sameRecords(a: MarkRecords, b: MarkRecords): boolean {
  const left = Object.entries(a).filter(([, value]) => value);
  const right = Object.entries(b).filter(([, value]) => value);
  if (left.length !== right.length) return false;
  return left.every(([key, value]) => b[key] === value);
}

// ── a live exam at the finish (O8) ──────────────────────────────────────────────────────────────

export const FINISH_LESSON_ACTION = "Завершить урок";

// ── nobody came (Money-1 A6) ────────────────────────────────────────────────────────────────────

/** 409 `NOBODY_CAME`: every student is «Не был» / «Уважительная» - a finish makes the lesson HELD and it goes to the salary of the teacher; the server asks for an explicit yes. */
/** The words of 409 `NOBODY_CAME_BACKDATED` when the server sent none (it does: the screen shows its sentence). */
export const NOBODY_CAME_BACKDATED_TEXT = "Никто не пришёл? Такой урок задним числом оформляет администратор — он видит его в уроках без отметки.";
/** The words of 409 `EXCUSE_DECIDED` when the server sent none (it does: the screen shows its sentence). */
export const EXCUSE_DECIDED_TEXT = "Уважительную причину уже рассмотрели — изменить отметку может администратор или владелец";
export const NOBODY_CAME_TEXT = "Никто не пришёл. Если завершить, урок будет считаться проведённым и войдёт в зарплату преподавателя";

/** Our words for the question when the answer of the server has none (R3 n6: the sentence of the server is the question when it came). */
export const NOBODY_CAME_FALLBACK_QUESTION = "Если завершить, урок будет считаться проведённым и войдёт в зарплату преподавателя.";
/** The other road, said once under the sentence of the money (UX pack №21). */
export const NOBODY_CAME_OTHER_ROAD = "Если урока не было — вернитесь и нажмите «Урока\u00A0не\u00A0было».";

/**
 * The question before a finish where nobody came (UX pack №21): the title says it («Никто не пришёл?»), the text does NOT repeat it - the sentence of the SERVER about the money (`message` of the 409
 * without its first words «Никто не пришёл.»; ours stands in only when the answer has none) and the other road, «Урока не было».  Buttons: «Завершить урок» / «Отмена».
 */
export function nobodyCameQuestion(serverText?: string | null, lesson?: { date: string | null | undefined; startTime?: string | null; endTime?: string | null; groupName?: string | null }): ConfirmRequest {
  const said = (serverText ?? "").trim().replace(/^Никто не пришёл\.?\s*/i, "").replace(/^./, (c) => c.toUpperCase());
  const money = said ? (/[.!?]$/.test(said) ? said : `${said}.`) : NOBODY_CAME_FALLBACK_QUESTION;
  // re-audit С13: the window names the lesson it ends (group · day · time); the two sentences are two paragraphs
  const when = lesson ? formatLessonWhen(lesson) : "";
  return {
    title: "Никто не пришёл?",
    ...(when ? { subtitle: when } : {}),
    message: /Урока не было/.test(money) ? money : `${money}\n\n${NOBODY_CAME_OTHER_ROAD}`,
    confirmLabel: FINISH_LESSON_ACTION,
    cancelLabel: "Отмена",
  };
}
export const FINISH_LESSON_BACK = "Вернуться";
export const FINISH_QUESTION = "Завершить урок?";
export const EXAM_SYNC_UNAVAILABLE_TEXT = "Урок завершён, но проверить экзамены не удалось.";

export function liveExamsOf(error: unknown): LiveExamItem[] {
  return opsErrorDetail<LiveExamDetail>(error)?.exams ?? [];
}

/** Minutes left of a running exam, rounded up (never «0 мин» while seconds remain). */
export function minutesLeft(seconds: number | null | undefined): number {
  const value = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 0;
  return Math.max(0, Math.ceil(value / 60));
}

/** The sentence about one exam, without the closing question. */
export function liveExamSentence(exam: LiveExamItem): string {
  if (exam.status === "active") {
    return `Экзамен «${exam.title}» ещё идёт (осталось ${minutesLeft(exam.remainingSeconds)} мин). Он продолжится по своему таймеру и закроется сам.`;
  }
  const waiting = exam.waitingCount && exam.waitingCount > 0 ? `; ожидают учеников: ${exam.waitingCount}` : "";
  return `Экзамен «${exam.title}» не запущен${waiting}. После завершения урока он вернётся в черновик.`;
}

/** What the confirmation says: a line per exam and the question; the exact text of the spec for one exam. */
export function liveExamConfirmText(exams: LiveExamItem[]): { lines: string[]; question: string } {
  return { lines: exams.map(liveExamSentence), question: FINISH_QUESTION };
}

/** The line to show after a successful finish when the exam service could not be asked; null otherwise. */
export function examSyncNotice(sync: ExamSync | null | undefined): string | null {
  return sync?.warning === "EXAM_SERVICE_UNAVAILABLE" ? EXAM_SYNC_UNAVAILABLE_TEXT : null;
}

// ── refusals of the lesson actions ──────────────────────────────────────────────────────────────

export type LessonOperation = "start" | "save" | "finish" | "reconcile" | "cancel";

export type LessonFailure =
  | { kind: "conflict"; text: string; detail: AttendanceConflictDetail }
  | { kind: "live_exam"; text: string; exams: LiveExamItem[] }
  | { kind: "nobody_came"; text: string }
  | { kind: "too_old"; text: string }
  /** LESSON-RULES: a lesson nobody came to is written afterwards by the administrator or the owner (409 `NOBODY_CAME_BACKDATED`). */
  | { kind: "nobody_came_backdated"; text: string }
  /** LESSON-RULES C10: the excuse of THIS student was already reviewed - the mark is changed by the administrator or the owner (409 `EXCUSE_DECIDED`; the refusal names the student). */
  | { kind: "excuse_decided"; text: string; studentId: string | null; studentName: string | null }
  | { kind: "no_students"; text: string }
  | { kind: "not_lesson_teacher"; text: string }
  | { kind: "archived"; text: string }
  | { kind: "other"; text: string };

/** A refusal that is a RULE of the centre, not a failure: the screen says it as an information (blue), without a red error. */
export function isRuleRefusal(failure: LessonFailure): boolean {
  return failure.kind === "too_old" || failure.kind === "nobody_came_backdated" || failure.kind === "excuse_decided";
}

/** The line a panel without a table shows for a refusal: the refusal about ONE mark names the student first. */
export function failureLine(failure: LessonFailure): string {
  return failure.kind === "excuse_decided" && failure.studentName ? `${failure.studentName}. ${failure.text}` : failure.text;
}

/** Sorts a failed lesson action into what the screen does about it; `text` is always something to show. */
export function lessonFailure(error: unknown, operation: LessonOperation, fallback: string): LessonFailure {
  const code = opsErrorCode(error);
  switch (code) {
    case "ATTENDANCE_CONFLICT": {
      const detail = conflictDetailOf(error);
      if (detail) return { kind: "conflict", text: conflictHeadline(detail), detail };
      break;
    }
    case "LESSON_HAS_LIVE_EXAM":
      return { kind: "live_exam", text: errorMessageOf(error, "У урока есть незавершённый экзамен"), exams: liveExamsOf(error) };
    case "NOBODY_CAME":
      return { kind: "nobody_came", text: errorMessageOf(error, NOBODY_CAME_TEXT) };
    case "LESSON_TOO_OLD":
      // the number of days is the window of the CENTRE: the server says it in its sentence (`windowDays` of the refusal); the screen keeps no copy of it
      return { kind: "too_old", text: errorMessageOf(error, lessonTooOldText((opsErrorDetail(error) as { windowDays?: number } | null)?.windowDays)) };
    case "NOBODY_CAME_BACKDATED":
      return { kind: "nobody_came_backdated", text: errorMessageOf(error, NOBODY_CAME_BACKDATED_TEXT) };
    case "EXCUSE_DECIDED": {
      const detail = (opsErrorDetail(error) ?? {}) as { studentId?: string | null; studentName?: string | null };
      return { kind: "excuse_decided", text: errorMessageOf(error, EXCUSE_DECIDED_TEXT), studentId: detail.studentId ?? null, studentName: detail.studentName ?? null };
    }
    case "NO_STUDENTS":
      return { kind: "no_students", text: operation === "finish" ? NO_STUDENTS_FINISH_TEXT : NO_STUDENTS_START_TEXT };
    case "NO_STUDENTS_COMPLETE":
      return { kind: "no_students", text: NO_STUDENTS_FINISH_TEXT };
    case "NOT_LESSON_TEACHER":
      return { kind: "not_lesson_teacher", text: errorMessageOf(error, "Этот урок ведёт другой преподаватель") };
    case "GROUP_ARCHIVED":
      return { kind: "archived", text: errorMessageOf(error, "Группа в архиве: изменить её нельзя. Верните её из архива") };
    // W1 (S2-S7): the refusals of a cancellation have one wording on every screen
    case "TEACHER_CANNOT_CANCEL":
    case "ALREADY_CANCELLED":
    case "ALREADY_MOVED":
    case "LESSON_HAS_MARKS":
    case "LESSON_CHANGED":
    case "LESSON_ALREADY_STARTED":
      return { kind: "other", text: substitutionErrorText(error, fallback) };
    default:
      break;
  }
  return { kind: "other", text: errorMessageOf(error, fallback) };
}
