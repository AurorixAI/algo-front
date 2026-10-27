/**
 * O5 / F6 (LOGIC-B): the teacher of a lesson (the group's teacher or a substitute set by an administrator).
 * Pure helpers: the labels on a lesson, the dialog «Преподаватель урока», who can be chosen.
 */
import { formatIsoDateLabel } from "./business-time";
import { formatMoney } from "./payments";
import type { LessonTeacherCandidate, LessonTeacherCandidates, LessonTeacherInfo, LessonTeacherPut } from "./ops-b-types";

/** The key of one lesson occurrence in the maps of the journal (`versions`, `lessonTeachers`, `records`): «2026-10-26_lesson-ab12». */
export function lessonKeyOf(lessonDate: string, lessonId: string): string {
  return `${lessonDate}_${lessonId}`;
}

export const NO_LESSON_TEACHER_TEXT = "У урока нет преподавателя";
export const REPLACE_TEACHER_ACTION = "Заменить преподавателя";
export const ASSIGN_TEACHER_ACTION = "Назначить";
export const REASON_LABEL = "Причина замены";
export const RETURN_GROUP_TEACHER_ACTION = "Вернуть преподавателя группы";
export const SUBSTITUTE_BADGE = "Замена";

export function lessonTeacherDialogTitle(lessonDate: string, startTime: string, endTime: string): string {
  const day = formatIsoDateLabel(lessonDate, { day: "2-digit", month: "2-digit" });
  return `Преподаватель урока ${day}, ${startTime}–${endTime}`;
}

/** «Замена: Рахимов Т.» on the lesson of a substitute; null for the group's own teacher. */
export function substituteLabel(info: LessonTeacherInfo | null | undefined): string | null {
  if (!info?.isSubstitution) return null;
  const name = (info.teacherName ?? "").trim();
  return name ? `Замена: ${name}` : "Замена";
}

/** In the schedule of the teacher who was replaced (W1 F10): the lesson stays with «Замена: Рахимов Т.» (the one who teaches it instead) - it does not vanish. */
export function replacedByLabel(info: LessonTeacherInfo | null | undefined, viewerId: string | null | undefined): string | null {
  if (!info?.isSubstitution || !viewerId || info.defaultTeacherId !== viewerId) return null;
  const name = (info.teacherName ?? "").trim();
  return name ? `Замена: ${name}` : "Замена: другой преподаватель";
}

/**
 * Who leads a lesson, from the occurrence itself (the schedule and the dashboard summary carry it, W1): the panel knows it at once instead of after the journal read -
 * so the first frame of the panel never offers a move / a cancellation that the journal would then take away.  null when the occurrence says nothing.
 */
export function teacherInfoOfOccurrence(occurrence: { teacherId?: string | null; teacherName?: string | null; isSubstitution?: boolean; defaultTeacherId?: string | null; defaultTeacherName?: string | null }): LessonTeacherInfo | null {
  if (occurrence.teacherId === undefined && occurrence.isSubstitution === undefined) return null;
  return {
    teacherId: occurrence.teacherId ?? null,
    teacherName: occurrence.teacherName ?? null,
    isSubstitution: Boolean(occurrence.isSubstitution),
    defaultTeacherId: occurrence.defaultTeacherId ?? null,
    defaultTeacherName: occurrence.defaultTeacherName ?? null,
  };
}

/** A lesson without a teacher at all: the group has none and no substitute is set. */
export function lacksTeacher(info: LessonTeacherInfo | null | undefined): boolean {
  return Boolean(info) && !info?.teacherId;
}

/** The role of a person in the list of the dialog: «Владелец» / «Администратор» / «Преподаватель» (a person who is also a teacher is told apart from a namesake). */
export function roleLabel(orgRole: string | null | undefined): string {
  if (orgRole === "owner") return "Владелец";
  if (orgRole === "admin") return "Администратор";
  return "Преподаватель";
}

/** What the server says about the money of a candidate for ONE lesson (the owner and the administrator both read it; the rates themselves only the owner does). */
export interface CandidateMoney {
  /** No payroll rate for the type of this group in the month of the lesson. */
  rateMissing?: boolean | null;
  /** An estimate in sum of what the lesson would pay him (`substitutePayEstimate`, W1); null / absent - nothing to say. */
  substitutePayEstimate?: number | null;
  substitutePayEstimateReason?: string | null;
}

/** W1 F5: the same words in EVERY window that assigns a teacher to a lesson (rule 38); the owner can set the rate himself, the administrator asks the owner. */
export function rateMissingText(role: string | null | undefined): string {
  return role === "owner"
    ? "Ставка не задана — заработок за урок не будет посчитан, пока вы её не зададите"
    : "Ставка не задана — заработок за урок не будет посчитан, пока владелец не задаст ставку";
}

/** «≈ 46 000 сум за урок, ориентировочно»; null when the server sent no amount (no rate, nobody on the roster, an older server). */
export function substitutePayLine(candidate: CandidateMoney): string | null {
  const amount = candidate.substitutePayEstimate;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || candidate.rateMissing) return null;
  return `≈ ${formatMoney(amount)} за урок, ориентировочно`;
}

/** The two quiet lines under a candidate: «Ставка не задана …» and the estimate; a busy candidate says only that he is busy. */
export function candidateMoneyLines(candidate: CandidateMoney & { busy?: boolean }, role: string | null | undefined): string[] {
  if (candidate.busy) return [];
  const lines: string[] = [];
  if (candidate.rateMissing) lines.push(rateMissingText(role));
  const pay = substitutePayLine(candidate);
  if (pay) lines.push(pay);
  return lines;
}

/** The notes after an assignment: a payroll sheet that is already written changes («Ведомость за октябрь изменится»); nothing for an empty list. */
export function payrollSheetsNote(sheets: ReadonlyArray<{ month?: string | null; status?: string | null }> | null | undefined): string | null {
  const months = Array.from(new Set((sheets ?? []).map((sheet) => monthNameOf(sheet.month)).filter(Boolean)));
  if (months.length === 0) return null;
  return months.length === 1 ? `Ведомость за ${months[0]} изменится` : `Ведомости за ${months.join(" и ")} изменятся`;
}

const MONTHS_NOMINATIVE = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/** «2026-10» → «октябрь» (the month alone: the sheet is read by the person in the month he is in). */
function monthNameOf(month: string | null | undefined): string {
  const match = /^\d{4}-(\d{2})/.exec(month ?? "");
  const index = match ? Number(match[1]) - 1 : -1;
  return index >= 0 && index < 12 ? MONTHS_NOMINATIVE[index] : "";
}

export function candidateBusyText(candidate: LessonTeacherCandidate): string | null {
  if (!candidate.busy) return null;
  const busy = candidate.busyWith;
  return busy ? `Занят: ${busy.groupName}, ${busy.startTime}–${busy.endTime}` : "Занят";
}

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export function reasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length < REASON_MIN) return `Укажите причину — не менее ${REASON_MIN} символов`;
  if (length > REASON_MAX) return `Причина — не более ${REASON_MAX} символов`;
  return null;
}

/** The candidate who teaches the lesson now (the dialog opens with them marked). */
export function currentCandidate(list: LessonTeacherCandidates | null | undefined): string | null {
  return list?.currentTeacherId ?? list?.defaultTeacherId ?? null;
}

/** Who can be chosen: not the current teacher (nothing to change) and not a busy one. */
export function isSelectable(candidate: LessonTeacherCandidate, current: string | null): boolean {
  return !candidate.busy && candidate.teacherId !== current;
}

/** True when the group's own teacher is replaced now: the button «Вернуть преподавателя группы» is on offer. */
export function canReturnToGroupTeacher(info: LessonTeacherInfo | null | undefined): boolean {
  return Boolean(info?.isSubstitution);
}

export function buildAssign(
  target: { lessonDate: string; lessonId: string },
  teacherId: string | null,
  reason: string,
  expectedTeacherId: string | null,
): LessonTeacherPut {
  return {
    lessonDate: target.lessonDate,
    lessonId: target.lessonId,
    teacherId,
    reason: reason.trim(),
    ...(expectedTeacherId ? { expectedTeacherId } : {}),
  };
}

/**
 * Whether the person may open «Заменить преподавателя»: owner and administrator only, on a lesson that is not
 * finished or cancelled (the server refuses a cancelled lesson with LESSON_CANCELLED).
 */
export function canReplaceTeacher(role: string | null | undefined, lessonStatus: string | null | undefined): boolean {
  if (role !== "owner" && role !== "admin") return false;
  return lessonStatus !== "cancelled";
}

/**
 * A teacher sees a lesson as «not mine» when its teacher is somebody else (the server answers 403 NOT_LESSON_TEACHER).
 * `viewerId` is the signed-in user; no info (an older server) means no verdict.
 */
export function lessonBelongsToOther(info: LessonTeacherInfo | null | undefined, viewerId: string | null | undefined): boolean {
  if (!info?.teacherId || !viewerId) return false;
  return info.teacherId !== viewerId;
}

export function notYourLessonText(info: LessonTeacherInfo | null | undefined): string {
  const name = (info?.teacherName ?? "").trim();
  // a short name («Рахимов Т.») already ends with the full stop
  return name ? `Этот урок ведёт ${name}${name.endsWith(".") ? "" : "."}` : "Этот урок ведёт другой преподаватель.";
}

/**
 * The chip of a lesson card by the viewer: «Замена: Рахимов Т.» for a manager and for the group's own teacher whose lesson is taken
 * («Замена: Рахимов Т.» in his schedule), «Замена» for the substitute himself; null for an ordinary lesson.
 */
export function occurrenceTeacherChip(
  info: LessonTeacherInfo | null | undefined,
  viewerId: string | null | undefined,
): string | null {
  if (!info?.isSubstitution) return null;
  if (viewerId && info.teacherId === viewerId) return SUBSTITUTE_BADGE;
  return replacedByLabel(info, viewerId) ?? substituteLabel(info);
}
