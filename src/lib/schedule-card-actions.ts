import { ASSIGN_TEACHER_ACTION, REPLACE_TEACHER_ACTION, canReplaceTeacher } from "./lesson-teacher";
import { dayAndDateLabel, opsErrorCode, opsErrorDetail } from "./ops-errors";
import { examDraftCancelText, examRunningText, movedFromLabel, substitutionErrorText } from "./substitutions";
import type { ExamBinding, MoveCheckOut } from "./substitution-types";
import type { TeacherBusyDetail } from "./ops-b-types";

/** What the owner / administrator can do with one lesson of the group's week schedule, from the lesson sheet (the card itself has no buttons). */
export type ScheduleCardAction =
  | "assign"          // «Назначить замену» (future) / «Назначить того, кто провёл» (past): the teacher of this lesson
  | "reschedule"      // «Перенести урок» (the time / room of this lesson)
  | "cancel"          // «Отменить урок»
  | "mark"            // «Отметить посещаемость»: a past lesson nobody marked (the journal)
  | "journal";        // «Открыть в журнале»: a lesson that is held or going on

export const SCHEDULE_ACTION_LABEL: Record<Exclude<ScheduleCardAction, "assign">, string> = {
  reschedule: "Перенести урок",
  cancel: "Отменить урок",
  mark: "Отметить посещаемость",
  journal: "Открыть в журнале",
};

export const ASSIGN_SUBSTITUTE_ACTION = "Назначить замену";
export const ASSIGN_WHO_HELD_ACTION = "Назначить того, кто провёл";

export interface ScheduleCardInput {
  role: string | null | undefined;
  archived: boolean;
  /** `scheduled` | `in_progress` | `completed` | `cancelled` */
  state: string;
  date: string;
  today: string;
  /** The server sent who teaches the lesson (an older one does not: no assignment then). */
  hasTeacherInfo: boolean;
}

/** The actions of the lesson sheet by situation; [] for a card that is information only (cancelled, archived group, not a manager). */
export function scheduleCardActions(input: ScheduleCardInput): ScheduleCardAction[] {
  if (input.archived || (input.role !== "owner" && input.role !== "admin")) return [];
  const { state, date, today } = input;
  if (state === "cancelled") return [];
  if (state === "completed") return ["journal"];
  if (state === "in_progress") return ["journal"];
  const out: ScheduleCardAction[] = [];
  const canAssign = input.hasTeacherInfo && canReplaceTeacher(input.role, state);
  if (date >= today) {
    if (canAssign) out.push("assign");
    out.push("reschedule", "cancel");
  } else {
    out.push("mark");
    if (canAssign) out.push("assign");
  }
  return out;
}

/** The label of «assign» by situation: a future lesson «Назначить замену» (or «Заменить преподавателя» when a substitute is already there), a past one «Назначить того, кто провёл». */
export function assignActionLabel(input: { past: boolean; lacksTeacher: boolean; isSubstitution: boolean }): string {
  if (input.lacksTeacher) return ASSIGN_TEACHER_ACTION;
  if (input.past) return ASSIGN_WHO_HELD_ACTION;
  return input.isSubstitution ? REPLACE_TEACHER_ACTION : ASSIGN_SUBSTITUTE_ACTION;
}

// ── what the card and the sheet say (income2 §1, owner review 22.10) ─────────────────────────────────────────────

/** The title of a lesson: its topic, else the name of the group (never the bare word «Занятие»). */
export function lessonTitle(lesson: { topic?: string | null }, groupName: string | null | undefined): string {
  return (lesson.topic ?? "").trim() || (groupName ?? "").trim() || "Урок";
}

/** The room of a lesson, only when it is set («Онлайн» for an online one); null: nothing to show. */
export function roomLabel(lesson: { room?: string | null; format?: string | null }): string | null {
  if (lesson.format === "online") return "Онлайн";
  const room = (lesson.room ?? "").trim();
  return room || null;
}

/**
 * «Ведёт: Коллега У. — замена за Основной У.» / «Ведёт: Основной У.» / «Преподаватель не назначен»; null without the server's answer.
 * `noTeacherText` is the sentence for a lesson without a teacher.
 */
export function teacherLine(
  info: { teacherId?: string | null; teacherName?: string | null; isSubstitution?: boolean; defaultTeacherName?: string | null } | null | undefined,
  noTeacherText: string,
): string | null {
  if (!info) return null;
  if (!info.teacherId) return noTeacherText;
  const name = (info.teacherName ?? "").trim();
  if (!name) return null;
  const regular = (info.defaultTeacherName ?? "").trim();
  if (info.isSubstitution) return regular ? `Ведёт: ${name} — замена за ${regular}` : `Ведёт: ${name} — замена`;
  return `Ведёт: ${name}`;
}

/** The server writes the reason of a move as «Перенесён на 29.10, 16:00–17:30: Личные обстоятельства»: the reason alone. */
export function movedReasonOf(text: string | null | undefined): string | null {
  const match = /^Перенесён на [^:]*\d{2}:\d{2}(?:–\d{2}:\d{2})?:\s*([\s\S]+)$/.exec((text ?? "").trim());
  return match ? match[1].trim() || null : null;
}

/** The lines of the sheet of a cancelled / moved lesson: where it went and the reason in full; [] for an ordinary lesson. */
export function sheetNotes(input: { moved: boolean; movedToText?: string | null; reason: string | null | undefined; cancelled: boolean }): string[] {
  const lines: string[] = [];
  if (input.moved) {
    if (input.movedToText) lines.push(`Перенесён на ${input.movedToText}`);
    const reason = movedReasonOf(input.reason) ?? ((input.reason ?? "").trim() || null);
    if (reason && !/^Перенесён на /.test(reason)) lines.push(`Причина: ${reason}`);
  } else if (input.cancelled && (input.reason ?? "").trim()) {
    lines.push(`Причина: ${(input.reason ?? "").trim()}`);
  }
  return lines;
}

/** Free typing of a time → «HH:MM» (24 h, whatever the browser's locale): «930», «9:30», «09.30» → «09:30»; null when it is not a time. */
export function normalizeTime(text: string): string | null {
  const digits = text.trim().replace(/[^0-9]/g, "");
  const match = /^(\d{1,2})(\d{2})$/.exec(digits);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

// ── #124: the move without a request, the cancel precheck, «Перенесён с …» ─────────────────────────────────────────

/** «Перенесён с 25.10, 10:00» on the new lesson of a move; null on any other lesson (one text with the schedules of the teacher and the student). */
export const movedFromText = movedFromLabel;

export const LESSON_CHANGED_TEXT = "Урок уже изменили — обновите";

/** A refusal that means «somebody changed this lesson first»: the sheet offers «Обновить» instead of a retry. */
export function isLessonChanged(error: unknown): boolean {
  const code = opsErrorCode(error);
  return code === "LESSON_CHANGED" || code === "SUBSTITUTION_ALREADY_DECIDED";
}

/** The refusals of `lesson-move` in the words of the sheet; the shared texts of the substitutions for the rest. */
export function lessonMoveErrorText(error: unknown, fallback = "Не удалось перенести урок. Расписание не изменено."): string {
  switch (opsErrorCode(error)) {
    case "LESSON_CHANGED":
    case "SUBSTITUTION_ALREADY_DECIDED": return LESSON_CHANGED_TEXT;
    case "LESSON_HAS_NO_TEACHER": return "У урока нет преподавателя: сначала назначьте его, потом переносите урок";
    case "EXAM_SERVICE_UNAVAILABLE": return "Не удалось проверить экзамены группы. Повторите попытку.";
    case "LESSON_ALREADY_STARTED": return "Урок уже начался или прошёл: перенести его нельзя";
    case "TEACHER_BUSY": {
      const first = opsErrorDetail<TeacherBusyDetail>(error)?.conflicts?.[0];
      return first ? `Преподаватель занят в это время: «${first.withGroupName}», ${dayAndDateLabel(first.date)} ${first.startTime}–${first.endTime}` : "Преподаватель занят в это время";
    }
    case "GROUP_BUSY": return "У группы уже есть урок в это время";
    default: return substitutionErrorText(error, fallback);
  }
}

/** The live check under the move form: «Время свободно» or what is in the way («Преподаватель занят в это время», «У группы уже есть урок»). */
export function lessonMoveCheckLines(check: MoveCheckOut, teacherLabel?: string | null): { ok: boolean; lines: string[]; warnings: string[] } {
  const lines: string[] = [];
  for (const conflict of check.teacherConflicts ?? []) {
    lines.push(`Преподаватель занят в это время: «${conflict.withGroupName}», ${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}`);
  }
  for (const conflict of check.groupConflicts ?? []) {
    lines.push(`У группы уже есть урок ${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}`);
  }
  const warnings = (check.warnings ?? []).map((warning) => (warning.message ?? "").trim()).filter(Boolean);
  if (lines.length === 0 && check.ok) {
    const name = (teacherLabel ?? check.teacherName ?? "").trim();
    return { ok: true, lines: [name ? `Время свободно: у ${name} и у группы пересечений нет` : "Время свободно"], warnings };
  }
  return { ok: false, lines: lines.length ? lines : ["Это время недоступно"], warnings };
}

export interface ExamCancelState {
  /** The binding has not arrived yet. */
  loading: boolean;
  /** The confirm button is disabled. */
  blocked: boolean;
  /** The sentence to show (null: nothing to say). */
  message: string | null;
  tone: "info" | "warn" | "error";
  /** «Повторить»: the exam service did not answer. */
  retry: boolean;
}

/** What the exam bound to the lesson means for «Отменить урок» (`lesson-exam-binding`). `null` = not read yet. */
export function examCancelState(binding: ExamBinding | null | undefined): ExamCancelState {
  if (!binding) return { loading: true, blocked: true, message: null, tone: "info", retry: false };
  const title = (binding.title ?? "").trim();
  const message = (binding.message ?? "").trim();
  if (binding.state === "unavailable") {
    return { loading: false, blocked: true, message: message || "Не удалось проверить экзамены группы. Повторите попытку.", tone: "error", retry: true };
  }
  if (binding.state === "none") return { loading: false, blocked: false, message: null, tone: "info", retry: false };
  if (binding.canCancel === false) {
    return { loading: false, blocked: true, message: message || (title ? examRunningText(title) : "Нельзя отменить урок с активным экзаменом"), tone: "error", retry: false };
  }
  return { loading: false, blocked: false, message: title ? examDraftCancelText(title) : null, tone: "warn", retry: false };
}
