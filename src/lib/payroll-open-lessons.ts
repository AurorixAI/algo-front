/**
 * Money-1 I-4 / A6 (П7): saving a sheet of a month that is over closes the month (`lib/closed-period.ts`), so the owner is told BEFORE which lessons of that month are not
 * closed yet (they do not reach the sheet) - or that the check could not be made («не удалось проверить», never «0»).  The list is the server's (`open_lesson_items`);
 * the group names come from «Уроки без отметки» (the items carry ids only) and are left out when that list cannot be read.
 *
 * Pure: no React, no network.
 */
import { formatDateRu, formatWeekdayDate } from "./business-time";
import type { ConfirmItem, ConfirmRequest } from "./confirm-dialog";
import { journalHref, OPEN_LESSON_IN_PROGRESS_LABEL, OPEN_LESSON_MISSED_LABEL } from "./open-lessons";
import { pluralRu } from "./plural";
import type { OpenLessonItem } from "./payroll";

export type OpenLessonsGate =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "list"; count: number; items: OpenLessonItem[]; /** The sentence of the server (R3 n6: it is the question; ours only when it sent none). */ message?: string | null; /** Lessons confirmed at an earlier saving. */ alreadyConfirmed?: number };

/**
 * Is there something to say before the save.  A month that is not over saves without a word (it stays open; today's lessons are not closed yet by nature).
 * `unknown`: the server could not count (month overview `open_lessons_unknown`, or `open_lessons: null` of a calculation not saved yet).
 */
export function openLessonsGate(input: {
  monthOpen: boolean;
  openLessons: number | null | undefined;
  unknown: boolean;
  items?: ReadonlyArray<OpenLessonItem> | null;
}): OpenLessonsGate {
  if (input.monthOpen) return { kind: "none" };
  if (input.unknown) return { kind: "unknown" };
  const items = [...(input.items ?? [])];
  const count = Math.max(input.openLessons ?? 0, items.length);
  return count > 0 ? { kind: "list", count, items } : { kind: "none" };
}

/** `missed`: nobody marked it; `in_progress`: started and not finished (the words of «Уроки без отметки»). */
export function openLessonKindText(kind: string | null | undefined): string {
  return kind === "in_progress" ? OPEN_LESSON_IN_PROGRESS_LABEL : OPEN_LESSON_MISSED_LABEL;
}

export const OPEN_LESSONS_LIST_LIMIT = 8;

/** «14.10 · 8-Б · Посещаемость не отмечена» (the group is the server's `groupName`; left out when the answer has none). */
export function openLessonItemLine(item: OpenLessonItem): string {
  const day = formatDateRu(item.lessonDate).slice(0, 5);
  return [day, (item.groupName ?? "").trim(), openLessonKindText(item.kind)].filter(Boolean).join(" · ");
}

/** 409 `OPEN_LESSONS_CONFIRM_REQUIRED` of the saving or the re-saving of a sheet: the owner is asked, the same request goes again with `confirm_open_lessons: true`. */
export function isOpenLessonsConfirm(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === "OPEN_LESSONS_CONFIRM_REQUIRED";
}

/**
 * The gate of that refusal, as the server sent it: its sentence (`message`), the NEW unresolved lessons (`items`, `count` - the ones the owner has not confirmed yet) and how many were confirmed
 * at an earlier saving (`alreadyConfirmed`).
 */
export function gateOfConfirmRefusal(error: unknown): OpenLessonsGate {
  const source = (error ?? {}) as { message?: unknown; detail?: unknown };
  const detail = (source.detail ?? {}) as { message?: unknown; count?: unknown; items?: unknown; alreadyConfirmed?: unknown };
  const items = Array.isArray(detail.items) ? (detail.items as OpenLessonItem[]).filter((item) => item && typeof item.lessonDate === "string") : [];
  const count = typeof detail.count === "number" && Number.isFinite(detail.count) ? detail.count : items.length;
  const said = typeof detail.message === "string" && detail.message.trim() ? detail.message.trim() : typeof source.message === "string" ? source.message.trim() : "";
  const confirmed = typeof detail.alreadyConfirmed === "number" && Number.isFinite(detail.alreadyConfirmed) ? Math.max(0, Math.trunc(detail.alreadyConfirmed)) : 0;
  return { kind: "list", count: Math.max(count, items.length), items, message: said || null, alreadyConfirmed: confirmed };
}

export const OPEN_LESSONS_SAVE_LABEL = "Сохранить и закрыть месяц";
export const OPEN_LESSONS_BACK_LABEL = "Отмена";
export const OPEN_LESSONS_TITLE = "Сохранить с уроками без отметки?";
export const OPEN_LESSONS_JOURNAL_LABEL = "Открыть журнал";
const CLOSES_MONTH = "После сохранения месяц закроется.";

/** A lesson of the list of the question as a ROW (re-audit С10): the date on the left («12.10»), the group, a quiet tail for a lesson that was started and not finished. */
export function openLessonQuestionItem(item: OpenLessonItem): ConfirmItem {
  const day = formatWeekdayDate(item.lessonDate);        // «пн, 12 октября»: the date of a lesson in a row is written ONE way (re-audit С14)
  const group = (item.groupName ?? "").trim();
  return { label: day, text: group || "Урок без группы", ...(item.kind === "in_progress" ? { note: "урок не завершён" } : {}) };
}

/** «14.10 · 8-Б · урок не завершён» - the same row as one line (a toast, a log). */
export function openLessonQuestionLine(item: OpenLessonItem): string {
  const row = openLessonQuestionItem(item);
  return [row.label, row.text, row.note].filter(Boolean).join(" · ");
}

/** Where the lesson is marked: the journal of its group at the day (the first lesson of the list); null without a group. */
export function openLessonJournalHref(item: OpenLessonItem | undefined, groupsBasePath = "/owner/groups"): string | null {
  return item?.groupId ? journalHref(groupsBasePath, { groupId: item.groupId, lessonDate: item.lessonDate, lessonId: item.lessonId }) : null;
}

/**
 * The question before the save of a month that is over (UX pack №18): «1 урок без отметки не попадёт в зарплату: 12.10 · Геометрия 8.  [Открыть журнал]  После сохранения месяц закроется.»
 * The lessons are the server's (`items`, `count`); the buttons are «Отмена» / «Сохранить и закрыть месяц»; null: nothing to ask.
 */
export function openLessonsQuestion(gate: OpenLessonsGate): ConfirmRequest | null {
  if (gate.kind === "none") return null;
  if (gate.kind === "unknown") {
    return {
      title: "Не удалось проверить уроки без отметки",
      message: `Мы не смогли узнать, есть ли в этом месяце уроки без отметки. Если они есть, в зарплату они не попадут. ${CLOSES_MONTH}`,
      confirmLabel: OPEN_LESSONS_SAVE_LABEL,
      cancelLabel: OPEN_LESSONS_BACK_LABEL,
    };
  }
  const shown = gate.items.slice(0, OPEN_LESSONS_LIST_LIMIT).map((item) => openLessonQuestionItem(item));
  const rest = gate.count - shown.length;
  const rows: ConfirmItem[] = rest > 0 && shown.length > 0 ? [...shown, { text: `и ещё ${rest}` }] : shown;
  const head = `${gate.count} ${pluralRu(gate.count, "урок без отметки не попадёт", "урока без отметки не попадут", "уроков без отметки не попадут")} в зарплату${rows.length > 0 ? ":" : "."}`;
  const confirmed = gate.alreadyConfirmed ?? 0;
  const href = openLessonJournalHref(gate.items[0]);
  return {
    title: OPEN_LESSONS_TITLE,
    message: head,
    items: rows,
    ...(href ? { link: { label: OPEN_LESSONS_JOURNAL_LABEL, href } } : {}),
    footnote: [
      ...(confirmed > 0 ? [`Ещё ${confirmed} ${pluralRu(confirmed, "урок", "урока", "уроков")} без отметки вы уже решили не включать в зарплату.`] : []),
      CLOSES_MONTH,
    ].join("\n"),
    confirmLabel: OPEN_LESSONS_SAVE_LABEL,
    cancelLabel: OPEN_LESSONS_BACK_LABEL,
  };
}
