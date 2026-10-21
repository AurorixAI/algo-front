/**
 * O4 / F2 (LOGIC-B): archiving a group is an operation with a preflight (`archive-impact`) and a read-only result.
 * Pure helpers behind the dialog «Архивировать группу», the banners of an archived group and the return from the archive.
 */
import { formatUtcNaiveAsBusinessDate } from "./business-time";
import { opsErrorCode, opsErrorDetail } from "./ops-errors";
import type { ArchiveBlocker, ArchiveBlockerCode, ArchiveImpact, TeacherInactiveDetail } from "./ops-b-types";
import { pluralRu } from "./plural";

export const ARCHIVE_BUTTON = "В архив";
export const RESTORE_BUTTON = "Вернуть из архива";
export const EXAM_SERVICE_DOWN_TEXT = "Не удалось проверить экзамены группы. Повторите попытку.";
export const MISSED_CANCEL_OPTION = "Отменить их при архивации (урока не было)";
export const TRANSFER_STUDENTS_BUTTON = "Перевести в другую группу";
export const RESTORE_TEACHER_INACTIVE_TEXT = "Преподаватель группы больше не работает в центре. Выберите нового или оставьте группу без преподавателя.";
export const RESTORE_NO_TEACHER = "Оставить без преподавателя";

export function archiveTitle(groupName: string): string {
  return `Архивировать группу «${groupName}»?`;
}

export function studentsBlockerText(count: number): string {
  return `В группе ${count} ${pluralRu(count, ["ученик", "ученика", "учеников"])}. Переведите их в другую группу или отправьте в архив — затем архивируйте группу.`;
}

export const OPEN_LESSON_TEXT = "Идёт урок. Завершите или отмените его.";

export function missedLessonsText(count: number): string {
  return `Не закрыто пропущенных уроков: ${count}.`;
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

export interface ArchiveDialogView {
  /** the button «В архив» may send */
  canSubmit: boolean;
  /** hard stops, in the order of the spec */
  stops: Array<{ code: ArchiveBlockerCode | "EXAM_SERVICE"; text: string }>;
  /** the choice «Отменить их при архивации» is on offer (missed lessons are the only thing in the way, or one of them) */
  offersCancelMissed: boolean;
  missedCount: number;
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
  }

  return {
    canSubmit: stops.length === 0,
    stops,
    offersCancelMissed: missedCount > 0,
    missedCount,
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
