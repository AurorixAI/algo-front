/**
 * O4 / F2 (LOGIC-B): archiving a group is an operation with a preflight (`archive-impact`) and a read-only result.
 * Pure helpers behind the dialog «Архивировать группу», the banners of an archived group and the return from the archive.
 */
import { formatUtcNaiveAsBusinessDate, formatWeekdayDate } from "./business-time";
import { opsErrorCode, opsErrorDetail } from "./ops-errors";
import type { ArchiveBlocker, ArchiveBlockerCode, ArchiveImpact, TeacherInactiveDetail } from "./ops-b-types";
import { pluralRu } from "./plural";
import { archiveRequestsText } from "./substitutions";

export const ARCHIVE_BUTTON = "В архив";
export const RESTORE_BUTTON = "Вернуть из архива";
export const EXAM_SERVICE_DOWN_TEXT = "Не удалось проверить экзамены группы. Повторите попытку.";
/** UX pack №6: the choice of the checkbox («Урока не было — отменить его при архивации»), said for one lesson or for several. */
export function missedCancelOption(count: number): string {
  return count === 1 ? "Урока не было — отменить его при архивации" : "Уроков не было — отменить их при архивации";
}
export const TRANSFER_STUDENTS_BUTTON = "Перевести в другую группу";
export const RESTORE_TEACHER_INACTIVE_TEXT = "Прежний преподаватель группы больше не ведёт уроки. Выберите нового или оставьте группу без преподавателя.";
export const RESTORE_NO_TEACHER = "Оставить без преподавателя";

export function archiveTitle(groupName: string): string {
  return `Архивировать группу «${groupName}»?`;
}

export function studentsBlockerText(count: number): string {
  return `В группе ${count} ${pluralRu(count, ["ученик", "ученика", "учеников"])}. Переведите их в другую группу или отправьте в архив — затем архивируйте группу.`;
}

export const OPEN_LESSON_TEXT = "Идёт урок. Завершите или отмените его.";

export function missedLessonsText(count: number): string {
  return `${pluralRu(count, ["Остался", "Осталось", "Осталось"])} ${count} ${pluralRu(count, ["урок без отметки", "урока без отметки", "уроков без отметки"])}`;
}

/** The line over «В архив» while it is off (rule 3: an off main button always says why); null when the button is on. */
export const ARCHIVE_WHY: Record<string, string> = {
  EXAM_SERVICE: "Не удалось проверить экзамены группы — повторите попытку.",
  ACTIVE_STUDENTS: "В группе есть ученики — переведите их или отправьте в архив.",
  OPEN_LESSON: "Идёт урок — завершите или отмените его.",
  MISSED_LESSONS: "Отметьте урок в журнале или поставьте галочку «Урока не было».",
  LIVE_EXAMS: "Идёт экзамен — дождитесь его окончания.",
};
export function archiveWhy(stops: ReadonlyArray<{ code: string }>): string | null {
  const first = stops[0];
  return first ? ARCHIVE_WHY[first.code] ?? "Архивация пока недоступна." : null;
}

/**
 * The sentence of the server about what the cancellation does to money («…ученикам перерасчёта не будет, а в зарплату преподавателей они не войдут. Если уроки были — сначала отметьте
 * посещаемость») split in two: the consequence stays under the checkbox, the advice «Если урок был — сначала отметьте посещаемость.» goes to the amber block with the link to the journal.
 * Both end with a full stop; a text of another shape stays whole under the checkbox.
 */
export function splitMissedConsequence(text: string | null | undefined): { effect: string | null; advice: string | null } {
  const whole = (text ?? "").trim();
  if (!whole) return { effect: null, advice: null };
  const closed = (value: string) => (/[.!?]$/.test(value) ? value : `${value}.`);
  // the checkbox already says «отменить при архивации»: the sentence goes on with what it does, not with «Если отменить эти уроки при архивации,»
  const lead = (value: string) => value.replace(/^Если отменить (?:эти уроки|их|этот урок|его) при архивации,\s*/i, "").replace(/^./, (c) => c.toUpperCase());
  const match = /^(.*?)[\s.]*(Если уроки? были?\s+—\s+сначала отметьте посещаемость)\.?$/i.exec(whole);
  if (!match || !match[1].trim()) return { effect: closed(lead(whole)), advice: null };
  return { effect: closed(lead(match[1].trim())), advice: closed(match[2].replace(/^Если уроки были/i, "Если урок был")) };
}

/** The cap of the list of the missed lessons in the window (the rest is «и ещё N»). */
export const MISSED_LIST_LIMIT = 8;

/** What cancelling the missed lessons at the archiving does to money, said BEFORE the choice - the sentence of the server; its words when an older answer has none. */
export const MISSED_CANCEL_CONSEQUENCE = "Если отменить эти уроки при архивации, ученикам перерасчёта не будет, а в зарплату преподавателей они не войдут. Если уроки были — сначала отметьте посещаемость";

/** «пн, 12 октября · 10:00–11:30 · Каримова К.» - one missed lesson of the list (the time and the teacher only when the server names them). */
export function missedLessonLine(lesson: { lessonDate: string; startTime?: string | null; endTime?: string | null; teacherName?: string | null }): string {
  const time = lesson.startTime ? (lesson.endTime ? `${lesson.startTime}–${lesson.endTime}` : lesson.startTime) : "";
  // UX pack §1: the date of a row of a window is «вт, 3 ноября» (the weekday and the month in words), the time after a dot
  return [formatWeekdayDate(lesson.lessonDate), time, (lesson.teacherName ?? "").trim()].filter(Boolean).join(" · ");
}

export function liveExamText(title: string): string {
  return `Экзамен «${title}» уже идёт. Дождитесь его окончания.`;
}

export function releaseExamsText(count: number): string {
  return `Экзамены без попыток будут возвращены в черновик (${count}).`;
}

export function stopFutureLessonsText(count: number): string {
  return `Будущие уроки (${count}) создаваться не будут.`;
}

export function pendingExcusesText(count: number): string {
  return `Справок на решении: ${count} — они останутся у администратора.`;
}

export function archivedBannerText(archivedAt: string | null | undefined): string {
  const day = formatUtcNaiveAsBusinessDate(archivedAt);
  return day
    ? `Группа в архиве с ${day}. Журнал доступен только для чтения.`
    : "Группа в архиве. Журнал доступен только для чтения.";
}

export function legacyStudentsBannerText(count: number): string {
  return `В архивной группе остались ученики (${count}). Переведите их в другую группу или отправьте в архив.`;
}

export function blockerOf(impact: ArchiveImpact | null | undefined, code: ArchiveBlockerCode): ArchiveBlocker | undefined {
  return impact?.blockers?.find((blocker) => blocker.code === code);
}

/** The lines of the list of missed lessons, capped, with «и ещё N» for the rest (the server's `count` may exceed the list). */
export function missedLessonLines(lessons: ReadonlyArray<Parameters<typeof missedLessonLine>[0]>, count: number): string[] {
  const lines = lessons.slice(0, MISSED_LIST_LIMIT).map(missedLessonLine).filter(Boolean);
  const rest = Math.max(count, lessons.length) - lines.length;
  return rest > 0 ? [...lines, `и ещё ${rest}`] : lines;
}

export interface ArchiveDialogView {
  /** the button «В архив» may send */
  canSubmit: boolean;
  /** hard stops, in the order of the spec */
  stops: Array<{ code: ArchiveBlockerCode | "EXAM_SERVICE"; text: string }>;
  /** the choice «Отменить их при архивации» is on offer (missed lessons are the only thing in the way, or one of them) */
  offersCancelMissed: boolean;
  missedCount: number;
  /** Money-1 A6 (П8): the missed lessons (the ones the cancellation would close) and what closing them does to money; empty / null without the blocker. */
  missedLessons: string[];
  cancelConsequence: string | null;
  students: Array<{ id: string; name: string; displayId?: string | null }>;
  /** the lines that do not block */
  notes: string[];
  examServiceDown: boolean;
}

/**
 * What the dialog shows and whether «В архив» is on: `cancelMissed` is the ticked choice - it clears the MISSED_LESSONS stop
 * (the server then closes them as «урока не было»).  Every other blocker stays a stop until the world changes.
 */
export function archiveDialogView(impact: ArchiveImpact, cancelMissed: boolean): ArchiveDialogView {
  const stops: ArchiveDialogView["stops"] = [];
  const examServiceDown = impact.examService === "unavailable";
  if (examServiceDown) stops.push({ code: "EXAM_SERVICE", text: EXAM_SERVICE_DOWN_TEXT });

  const students = blockerOf(impact, "ACTIVE_STUDENTS");
  if (students) stops.push({ code: "ACTIVE_STUDENTS", text: studentsBlockerText(students.count) });

  if (blockerOf(impact, "OPEN_LESSON")) stops.push({ code: "OPEN_LESSON", text: OPEN_LESSON_TEXT });

  const missed = blockerOf(impact, "MISSED_LESSONS");
  const missedCount = missed?.count ?? 0;
  if (missed && !cancelMissed) stops.push({ code: "MISSED_LESSONS", text: missedLessonsText(missed.count) });

  for (const exam of blockerOf(impact, "LIVE_EXAMS")?.exams ?? []) {
    stops.push({ code: "LIVE_EXAMS", text: liveExamText(exam.title) });
  }

  const notes: string[] = [];
  for (const action of impact.autoActions ?? []) {
    if (!action.count) continue;
    notes.push(action.code === "RELEASE_EXAMS" ? releaseExamsText(action.count) : stopFutureLessonsText(action.count));
  }
  for (const warning of impact.warnings ?? []) {
    if (warning.code === "PENDING_EXCUSES" && warning.count) notes.push(pendingExcusesText(warning.count));
    // LOGIC-B2: the waiting «Не смогу провести» requests of the group are closed by the archive
    if (warning.code === "PENDING_SUBSTITUTIONS" && warning.count) notes.push(archiveRequestsText(warning.count));
  }

  return {
    canSubmit: stops.length === 0,
    stops,
    offersCancelMissed: missedCount > 0,
    missedCount,
    missedLessons: missedLessonLines(missed?.lessons ?? [], missedCount),
    cancelConsequence: missed ? (missed.cancelConsequence?.trim() || MISSED_CANCEL_CONSEQUENCE) : null,
    students: students?.students ?? [],
    notes,
    examServiceDown,
  };
}

/** The body of `POST …/archive`: the reason is optional, the missed lessons are cancelled only on the explicit choice. */
export function archiveBody(cancelMissed: boolean, reason: string): { reason?: string; missedLessonsAction?: "cancel" } {
  const text = reason.trim();
  return {
    ...(text ? { reason: text } : {}),
    ...(cancelMissed ? { missedLessonsAction: "cancel" as const } : {}),
  };
}

export function archiveReasonError(reason: string): string | null {
  const text = reason.trim();
  if (!text) return null;
  if (text.length < 3) return "Причина — не менее 3 символов";
  if (text.length > 300) return "Причина — не более 300 символов";
  return null;
}

/** A refusal of `archive` that means «look at the dialog again» (the world changed under it): the blockers ride in the answer. */
export function archiveRefusalImpact(error: unknown, previous: ArchiveImpact): ArchiveImpact | null {
  if (opsErrorCode(error) !== "GROUP_ARCHIVE_BLOCKED") return null;
  const detail = opsErrorDetail(error) as { blockers?: ArchiveBlocker[] } | null;
  return { ...previous, canArchive: false, blockers: detail?.blockers ?? previous.blockers ?? [] };
}

/** `restore` refused because the group's teacher left: the name rides in the answer. */
export function restoreTeacherInactive(error: unknown): { teacherName: string | null } | null {
  if (opsErrorCode(error) !== "TEACHER_INACTIVE") return null;
  return { teacherName: opsErrorDetail<TeacherInactiveDetail>(error)?.teacherName ?? null };
}

export function isArchived(group: { status?: string | null } | null | undefined): boolean {
  return group?.status === "archived";
}
