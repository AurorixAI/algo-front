/**
 * Pure rules for the attendance journal and the "excused absences" page.
 * No React and no imports, so node:test can load this file directly.
 */

export type LessonState = "scheduled" | "in_progress" | "completed" | "cancelled";

export type AdminLessonAction =
  | "reconcile"      // "Отметить посещаемость" - forgotten past lesson
  | "cancel_missed"  // "Урока не было"
  | "finish"         // "Завершить урок"
  | "correct";       // "Исправить"

export const EXCUSE_REASON_MIN = 3;
export const EXCUSE_REASON_MAX = 300;
export const CORRECTION_REASON_MIN = 10;
export const CORRECTION_REASON_MAX = 500;
export const REVIEW_NOTE_MAX = 500;

export const EXCUSE_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const EXCUSE_FILE_MAX_COUNT = 3;
export const EXCUSE_IMAGE_MAX_SIDE = 1600;
export const EXCUSE_IMAGE_JPEG_QUALITY = 0.85;

/**
 * Which administrator actions the journal column of one lesson offers.
 * `state` is the server status of the concrete lesson ("scheduled" when no row
 * exists yet); `date` and `today` are YYYY-MM-DD business dates.
 *
 * - past + never started (scheduled)  -> reconcile / cancel_missed
 * - past + in_progress (forgotten)    -> finish (+ cancel is not offered: marks exist)
 * - today + in_progress               -> finish
 * - completed                         -> correct
 * - future, today-not-started, cancelled -> nothing
 */
export function lessonAdminActions(state: string, date: string, today: string): AdminLessonAction[] {
  if (state === "completed") return ["correct"];
  if (state === "cancelled") return [];
  if (date > today) return [];
  if (state === "in_progress") return ["finish"];
  if (state === "scheduled" && date < today) return ["reconcile", "cancel_missed"];
  return [];
}

/** null when the lesson can be finished, otherwise the hint to show. */
export function finishBlockedHint(markedCount: number, rosterCount: number): string | null {
  const left = Math.max(rosterCount - markedCount, 0);
  return left > 0 ? `Отметьте всех: осталось ${left}` : null;
}

/** Reason for an excused absence: trimmed 3..300 characters. */
export function validateExcuseReason(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length < EXCUSE_REASON_MIN) return `Укажите причину (не короче ${EXCUSE_REASON_MIN} символов)`;
  if (text.length > EXCUSE_REASON_MAX) return `Причина не длиннее ${EXCUSE_REASON_MAX} символов`;
  return null;
}

/** Reason for correcting a completed lesson: trimmed 10..500 characters. */
export function validateCorrectionReason(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length < CORRECTION_REASON_MIN) return `Укажите причину исправления (не короче ${CORRECTION_REASON_MIN} символов)`;
  if (text.length > CORRECTION_REASON_MAX) return `Причина не длиннее ${CORRECTION_REASON_MAX} символов`;
  return null;
}

/** YYYY-MM-DD -> ДД.ММ.ГГГГ (no Date object: the calendar day never drifts with the timezone). */
export function formatDateRu(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * ISO timestamp -> "ДД.ММ.ГГГГ ЧЧ:ММ" on the business clock (Asia/Tashkent).
 * The server sends naive timestamps that are ALREADY Tashkent wall time, so they
 * are shown as written; only a value with an explicit zone is converted.
 */
export function formatDateTimeRu(value: string | null | undefined): string {
  if (!value) return "";
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (naive && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return `${naive[3]}.${naive[2]}.${naive[1]} ${naive[4]}:${naive[5]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

export type ExcuseStatus = "pending" | "confirmed" | "rejected";

export interface ExcuseCellView {
  label: string;
  tone: "pending" | "confirmed" | "rejected" | "plain";
}

/** Journal cell text and tone for an "excused" mark by the review status. */
export function excuseCellView(status: ExcuseStatus | null | undefined): ExcuseCellView {
  if (status === "confirmed") return { label: "Ув. ✓", tone: "confirmed" };
  if (status === "rejected") return { label: "Ув. ✗", tone: "rejected" };
  if (status === "pending") return { label: "Ув.?", tone: "pending" };
  return { label: "Ув.", tone: "plain" };
}

/** Scale (width, height) so that the longer side is at most `maxSide`; never upscales. */
export function fitWithin(width: number, height: number, maxSide = EXCUSE_IMAGE_MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type ExcuseFileKind = "image" | "pdf";

export interface ExcuseFileCheck {
  ok: boolean;
  kind?: ExcuseFileKind;
  error?: string;
}

/**
 * Client-side pre-check of a file picked for a certificate.  The server
 * re-checks the signature bytes; this only avoids pointless uploads.
 * `currentCount` is how many files the excuse already has.
 */
export function checkExcuseFile(
  file: { name: string; type: string; size: number },
  currentCount: number,
): ExcuseFileCheck {
  if (currentCount >= EXCUSE_FILE_MAX_COUNT) {
    return { ok: false, error: `К справке можно приложить не более ${EXCUSE_FILE_MAX_COUNT} файлов` };
  }
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const isPdf = type === "application/pdf" || (!type && name.endsWith(".pdf"));
  const isImage = type === "image/jpeg" || type === "image/png" || type === "image/webp"
    || type === "image/heic" || type === "image/heif"
    || (!type && /\.(jpe?g|png|webp|heic|heif)$/.test(name));
  if (!isPdf && !isImage) return { ok: false, error: "Допустимы только фото (JPEG, PNG) и PDF" };
  // Images are shrunk before upload, so only a PDF is limited by its raw size.
  if (isPdf && file.size > EXCUSE_FILE_MAX_BYTES) {
    return { ok: false, error: "PDF больше 2 МБ. Уменьшите файл или приложите фото" };
  }
  return { ok: true, kind: isPdf ? "pdf" : "image" };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

export type AttendanceMarks = Record<string, string>;

export interface CorrectionChange {
  studentId: string;
  from: string;
  to: string;
}

/** Student marks that differ between the saved lesson and the edited copy. */
export function diffAttendance(before: AttendanceMarks, after: AttendanceMarks): CorrectionChange[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: CorrectionChange[] = [];
  ids.forEach((studentId) => {
    const from = before[studentId] ?? "";
    const to = after[studentId] ?? "";
    if (from !== to) changes.push({ studentId, from, to });
  });
  return changes;
}

/**
 * excuseReasons to send with a save: only students who are `excused` now and
 * either had no excuse yet or got a different reason.  A student whose mark is
 * unchanged keeps the server record untouched.
 */
export function collectExcuseReasons(
  records: AttendanceMarks,
  reasons: Record<string, string>,
  existing: Record<string, { reason: string }> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  Object.keys(records).forEach((studentId) => {
    if (records[studentId] !== "excused") return;
    const reason = (reasons[studentId] ?? "").trim();
    const current = existing?.[studentId];
    if (!current || (reason && reason !== current.reason.trim())) {
      if (reason) result[studentId] = reason;
    }
  });
  return result;
}

/** First problem preventing a save: an excused mark without a valid reason. */
export function firstMissingExcuseReason(
  records: AttendanceMarks,
  reasons: Record<string, string>,
  existing: Record<string, { reason: string }> | undefined,
): { studentId: string; error: string } | null {
  for (const studentId of Object.keys(records)) {
    if (records[studentId] !== "excused") continue;
    const typed = (reasons[studentId] ?? "").trim();
    const effective = typed || existing?.[studentId]?.reason || "";
    const error = validateExcuseReason(effective);
    if (error) return { studentId, error };
  }
  return null;
}

export const EXCUSE_MAX_PERIOD_DAYS = 93;

function isoToUtcDay(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** First and last day (YYYY-MM-DD) of the month that contains `today`. */
export function monthRangeOf(today: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})/.exec(today);
  if (!match) return { from: today, to: today };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${pad(lastDay)}` };
}

/** null when the period is acceptable for the list endpoint, otherwise the text to show. */
export function validateExcusePeriod(from: string, to: string): string | null {
  const start = isoToUtcDay(from);
  const end = isoToUtcDay(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return "Укажите даты периода";
  if (end < start) return "Дата «по» раньше даты «с»";
  if (end - start + 1 > EXCUSE_MAX_PERIOD_DAYS) {
    return `Период не может быть длиннее ${EXCUSE_MAX_PERIOD_DAYS} дней`;
  }
  return null;
}

export interface CorrectionChangeEx extends CorrectionChange {
  /** "excused" stays "excused", only the reason text was edited. */
  reasonChanged: boolean;
}

/**
 * Changes of a correction: every differing mark, plus an "excused" mark whose
 * reason was edited (the mark itself is unchanged).
 */
export function diffCorrection(
  before: AttendanceMarks,
  after: AttendanceMarks,
  reasons: Record<string, string>,
  existing: Record<string, { reason: string }> | undefined,
): CorrectionChangeEx[] {
  const result: CorrectionChangeEx[] = diffAttendance(before, after).map((change) => ({ ...change, reasonChanged: false }));
  const changed = new Set(result.map((change) => change.studentId));
  Object.keys(after).forEach((studentId) => {
    if (changed.has(studentId) || after[studentId] !== "excused" || before[studentId] !== "excused") return;
    const typed = (reasons[studentId] ?? "").trim();
    const current = (existing?.[studentId]?.reason ?? "").trim();
    if (typed && typed !== current) {
      result.push({ studentId, from: "excused", to: "excused", reasonChanged: true });
    }
  });
  return result;
}

export interface CorrectionWarning {
  studentId: string;
  text: string;
}

export const WARN_EXCUSE_REMOVED = "Подтверждение пропуска и прикреплённые справки будут удалены";
export const WARN_EXCUSE_REPENDING = "Пропуск вернётся на подтверждение";

/**
 * Warnings for the correction dialog.  `excuses` is the server state of the
 * lesson: status and has_files of every existing excuse.
 */
export function correctionWarnings(
  changes: CorrectionChangeEx[],
  excuses: Record<string, { status: string; has_files?: boolean }> | undefined,
): CorrectionWarning[] {
  const warnings: CorrectionWarning[] = [];
  changes.forEach((change) => {
    const excuse = excuses?.[change.studentId];
    if (!excuse) return;
    if (change.from === "excused" && change.to !== "excused") {
      if (excuse.status !== "pending" || excuse.has_files) {
        warnings.push({ studentId: change.studentId, text: WARN_EXCUSE_REMOVED });
      }
    } else if (change.reasonChanged && excuse.status !== "pending") {
      warnings.push({ studentId: change.studentId, text: WARN_EXCUSE_REPENDING });
    }
  });
  return warnings;
}

/** Students of the frozen roster (or of the fallback list) and how many of them are marked. */
export function rosterProgress(
  rosterIds: string[] | null | undefined,
  fallbackIds: string[],
  records: Record<string, string> | undefined,
): { rosterCount: number; markedCount: number } {
  const ids = Array.isArray(rosterIds) ? rosterIds : fallbackIds;
  const unique = Array.from(new Set(ids));
  return {
    rosterCount: unique.length,
    markedCount: unique.filter((id) => Boolean(records?.[id])).length,
  };
}

type RecordsByLesson = Record<string, Record<string, string>>;

/**
 * Records after a (non-quiet) reload: everything the server returned, except
 * that a lesson with unsent or in-flight marks keeps its local records, so a
 * month/group switch cannot erase them.
 */
export function mergeLoadedRecords<T extends string>(
  loaded: Record<string, Record<string, T>> | undefined,
  local: Record<string, Record<string, T>>,
  pendingKeys: string[],
): Record<string, Record<string, T>> {
  const merged: Record<string, Record<string, T>> = { ...(loaded || {}) };
  pendingKeys.forEach((key) => {
    if (local[key]) merged[key] = local[key];
  });
  return merged;
}

/**
 * Records a queued save of lesson `key` may send: a copy of that lesson's own
 * local records, or null when they are unknown.  A save is never sent with an
 * empty object made up on the spot or with another lesson's marks.
 */
export function recordsForSave<T extends string>(
  drafts: Record<string, Record<string, T>>,
  key: string,
): Record<string, T> | null {
  const own = drafts[key];
  return own ? { ...own } : null;
}

/** Keys of lessons that still have queued or in-flight saves. */
export function pendingLessonKeys(pending: Record<string, number>): string[] {
  return Object.keys(pending).filter((key) => pending[key] > 0);
}
