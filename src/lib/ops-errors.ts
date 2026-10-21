/**
 * LOGIC-B: how a refusal of the new and changed endpoints is read and worded.  The server sends
 * `{"detail": {"code": "...", "message": "...", ...fields}}` (api.ts keeps it as `error.detail`; `error.code` is the code).
 * The texts below are the ones of the spec (§6); where the server text is already the exact one the screen shows it as is.
 * Pure: no React, no network.
 */
import { formatIsoDateLabel } from "./business-time";
import type { OpsErrorDetail, TeacherBusyDetail, TeacherConflict } from "./ops-b-types";

/** The `code` of a failed request (`ApiError.code`), or undefined for any other failure. */
export function opsErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && code ? code : undefined;
}

/** The `detail` object of a refusal (code, message and the extra fields), or null when the answer had none. */
export function opsErrorDetail<T extends OpsErrorDetail = OpsErrorDetail>(error: unknown): T | null {
  const detail = (error as { detail?: unknown } | null | undefined)?.detail;
  return detail && typeof detail === "object" && !Array.isArray(detail) ? (detail as T) : null;
}

export function opsErrorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

export function errorMessageOf(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message.trim() : "";
  return text || fallback;
}

// ── decision 7: the window of 7 days ────────────────────────────────────────────────────────────

export const LESSON_TOO_OLD_TEXT = "Урок старше 7 дней — его закрывает администратор или владелец.";
export const LESSON_TOO_OLD_HINT = "Обратитесь к администратору";

// ── O6: an empty roster ─────────────────────────────────────────────────────────────────────────

export const NO_STUDENTS_START_TEXT = "В группе нет учеников — урок начать нельзя. Добавьте учеников в группу.";
export const NO_STUDENTS_FINISH_TEXT = "В составе урока нет учеников — завершить нельзя. Отметьте «Урока не было».";

// ── O1 / O11: the schedule ──────────────────────────────────────────────────────────────────────

export const DUPLICATE_SLOT_TEXT = "Такой урок уже есть в расписании группы";
export const VALID_FROM_PAST_TEXT = "Дата начала не может быть в прошлом";
export const GROUP_ARCHIVED_SCHEDULE_TEXT = "Группа в архиве: изменить расписание нельзя. Верните её из архива";
export const GROUP_ARCHIVED_TEXT = "Группа в архиве: действие недоступно. Верните её из архива.";

/** «пн, 26.10» - the weekday and the date of a calendar day, from the calendar alone (the device zone never enters). */
export function dayAndDateLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate ?? "")) return isoDate ?? "";
  const label = formatIsoDateLabel(isoDate, { weekday: "short", day: "2-digit", month: "2-digit" });
  // ru-RU gives «пн, 26.10»
  return label;
}

/** «пн, 26.10 10:00–11:30: «9-А» пересекается с «8-В»» */
export function teacherConflictLine(conflict: TeacherConflict): string {
  return `${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}: «${conflict.groupName}» пересекается с «${conflict.withGroupName}»`;
}

/** The first `limit` clashes as lines plus «и ещё N» when the server counted more. */
export function teacherConflictLines(detail: TeacherBusyDetail | null, limit = 3): string[] {
  const conflicts = detail?.conflicts ?? [];
  const lines = conflicts.slice(0, limit).map(teacherConflictLine);
  const total = Math.max(detail?.total ?? 0, conflicts.length);
  if (total > lines.length) lines.push(`и ещё ${total - lines.length}`);
  return lines;
}

/** The message of a refusal of a schedule write (create, move, new version): the exact text of the code, else the server's. */
export function scheduleErrorText(error: unknown, fallback: string): string {
  switch (opsErrorCode(error)) {
    case "DUPLICATE_SLOT": return DUPLICATE_SLOT_TEXT;
    case "VALID_FROM_PAST": return VALID_FROM_PAST_TEXT;
    case "GROUP_ARCHIVED": return GROUP_ARCHIVED_SCHEDULE_TEXT;
    case "TEACHER_BUSY": {
      const lines = teacherConflictLines(opsErrorDetail<TeacherBusyDetail>(error), 2);
      const head = errorMessageOf(error, "У преподавателя в это время другой урок");
      return lines.length ? `${head}. ${lines.join("; ")}` : head;
    }
    default: return errorMessageOf(error, fallback);
  }
}

/** The warning lines of a successful schedule write (`warnings[]`, e.g. ROOM_BUSY): shown, never blocking. */
export function warningTexts(result: { warnings?: Array<{ code?: string; message?: string }> | null } | null | undefined): string[] {
  return (result?.warnings ?? []).map((warning) => (warning?.message ?? "").trim()).filter(Boolean);
}

// ── O5: the teacher of a lesson ─────────────────────────────────────────────────────────────────

/** The refusals of «Назначить замену» in the words of the spec (F4); the server text for the rest. */
export function lessonTeacherErrorText(error: unknown, fallback = "Не удалось сохранить. Данные не изменены."): string {
  const detail = opsErrorDetail(error);
  switch (opsErrorCode(error)) {
    case "TARGET_NOT_TEACHER": return "Выберите преподавателя центра";
    case "LESSON_TEACHER_CHANGED": {
      // the server names the current teacher in `teacher_name`; an older answer has only the message (tidy its double dot)
      const name = String((detail as { teacher_name?: unknown } | null)?.teacher_name ?? "").trim();
      if (name) return `Преподаватель урока уже изменён: ${name}${name.endsWith(".") ? "" : "."} Обновите страницу`;
      const text = (detail?.message ?? "").replace(/\.\.+/g, ".").trim();
      return text || "Преподаватель урока уже изменён. Обновите страницу";
    }
    case "PAYROLL_LOCKED": return "Ведомость за этот месяц уже утверждена: смена преподавателя недоступна";
    case "TEACHER_BUSY": {
      const lines = teacherConflictLines(opsErrorDetail<TeacherBusyDetail>(error), 2);
      return lines.length ? `Преподаватель занят: ${lines.join("; ")}` : errorMessageOf(error, fallback);
    }
    default: return errorMessageOf(error, fallback);
  }
}
