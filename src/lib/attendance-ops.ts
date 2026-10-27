/**
 * O6 / O7 / O8 / decision 7 (LOGIC-B): what the lesson screens do with the new answers of the attendance endpoints -
 * the version of a lesson record (optimistic lock), the conflict of two editors, a live exam at the finish,
 * an empty roster, a lesson older than 7 days.  Pure: no React, no network.
 */
import { addIsoDays, formatUtcNaiveAsBusinessTime } from "./business-time";
import {
  LESSON_TOO_OLD_HINT,
  LESSON_TOO_OLD_TEXT,
  NO_STUDENTS_FINISH_TEXT,
  NO_STUDENTS_START_TEXT,
  opsErrorCode,
  opsErrorDetail,
  errorMessageOf,
} from "./ops-errors";
import { substitutionErrorText } from "./substitutions";
import type { AttendanceConflictDetail, ExamSync, LiveExamDetail, LiveExamItem } from "./ops-b-types";

// ── the window of 7 days (decision 7) ───────────────────────────────────────────────────────────

/** A teacher closes lessons of the last 7 days (today - 7 and later); older ones belong to an administrator or the owner. */
export const TEACHER_WINDOW_DAYS = 7;

export function isLessonTooOld(lessonDate: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonDate ?? "")) return false;
  return lessonDate < addIsoDays(today, -TEACHER_WINDOW_DAYS);
}

export interface OpenLessonAccess {
  /** the row is grey and has no buttons */
  locked: boolean;
  /** «Обратитесь к администратору» under a locked row */
  hint: string | null;
}

/**
 * A row of «Незакрытые уроки» for this viewer: the server says `requiresAdmin` for a teacher and a lesson older than 7 days;
 * an older server says nothing, then the date decides.  Owner and administrator are never locked by the window.
 */
export function openLessonAccess(
  action: { lessonDate: string; requiresAdmin?: boolean | null },
  viewerRole: string | null | undefined,
  today: string,
): OpenLessonAccess {
  const manager = viewerRole === "owner" || viewerRole === "admin";
  if (manager) return { locked: false, hint: null };
  const locked = action.requiresAdmin ?? isLessonTooOld(action.lessonDate, today);
  return locked ? { locked: true, hint: LESSON_TOO_OLD_HINT } : { locked: false, hint: null };
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

/** A sentence ends with one full stop: a short name («Петров П.») already has it. */
export function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

/** «Отметки уже изменил(а) Петров П. в 10:42.» - the time on the Tashkent clock (the server sends UTC). */
export function conflictHeadline(detail: AttendanceConflictDetail): string {
  const name = (detail.updatedBy?.name ?? "").trim();
  const time = formatUtcNaiveAsBusinessTime(detail.updatedAt);
  if (name && time) return `Отметки уже изменил(а) ${name} в ${time}.`;
  if (name) return endSentence(`Отметки уже изменил(а) ${name}`);
  return "Отметки уже изменил другой сотрудник.";
}

export const CONFLICT_EXPLAIN = "Ваши несохранённые изменения сохранятся в окне, пока вы не выберете";
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
export const FINISH_LESSON_BACK = "Вернуться";
export const FINISH_QUESTION = "Завершить урок?";
export const EXAM_SYNC_UNAVAILABLE_TEXT = "Урок завершён, но проверить экзамены не удалось.";

export function isLiveExamRefusal(error: unknown): boolean {
  return opsErrorCode(error) === "LESSON_HAS_LIVE_EXAM";
}

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
  | { kind: "too_old"; text: string }
  | { kind: "no_students"; text: string }
  | { kind: "not_lesson_teacher"; text: string }
  | { kind: "archived"; text: string }
  | { kind: "other"; text: string };

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
    case "LESSON_TOO_OLD":
      return { kind: "too_old", text: LESSON_TOO_OLD_TEXT };
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
