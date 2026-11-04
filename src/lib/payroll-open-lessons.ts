/**
 * Money-1 I-4 / A6 (П7): saving a sheet of a month that is over closes the month (`lib/closed-period.ts`), so the owner is told BEFORE which lessons of that month are not
 * closed yet (they do not reach the sheet) - or that the check could not be made («не удалось проверить», never «0»).  The list is the server's (`open_lesson_items`);
 * the group names come from «Незакрытые уроки» (the items carry ids only) and are left out when that list cannot be read.
 *
 * Pure: no React, no network.
 */
import { formatDateRu } from "./business-time";
import type { ConfirmRequest } from "./confirm-dialog";
import { OPEN_LESSON_IN_PROGRESS_LABEL, OPEN_LESSON_MISSED_LABEL } from "./open-lessons";
import { pluralRu } from "./plural";
import type { OpenLessonItem } from "./payroll";

export type OpenLessonsGate =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "list"; count: number; items: OpenLessonItem[] };

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

/** `missed`: nobody marked it; `in_progress`: started and not finished (the words of «Незакрытые уроки»). */
export function openLessonKindText(kind: string | null | undefined): string {
  return kind === "in_progress" ? OPEN_LESSON_IN_PROGRESS_LABEL : OPEN_LESSON_MISSED_LABEL;
}

export const OPEN_LESSONS_LIST_LIMIT = 8;

/** The key to match an item with a row of «Незакрытые уроки»: lesson and day. */
export function openLessonItemKey(item: Pick<OpenLessonItem, "lessonId" | "lessonDate">): string {
  return `${item.lessonId}|${item.lessonDate}`;
}

/** «14.10 · 8-Б · Посещаемость не отмечена» (the group is left out when its name is not known). */
export function openLessonItemLine(item: OpenLessonItem, groupNames: ReadonlyMap<string, string>): string {
  const day = formatDateRu(item.lessonDate).slice(0, 5);
  return [day, groupNames.get(openLessonItemKey(item)), openLessonKindText(item.kind)].filter(Boolean).join(" · ");
}

export const OPEN_LESSONS_SAVE_LABEL = "Сохранить всё равно";
export const OPEN_LESSONS_BACK_LABEL = "Вернуться";

/** The question before the save; null: nothing to ask. */
export function openLessonsQuestion(gate: OpenLessonsGate, groupNames: ReadonlyMap<string, string> = new Map()): ConfirmRequest | null {
  if (gate.kind === "none") return null;
  if (gate.kind === "unknown") {
    return {
      title: "Не удалось проверить незакрытые уроки",
      message: "Мы не смогли узнать, есть ли в этом месяце незакрытые уроки. Если сохранить сейчас, месяц закроется, а уроки, которые окажутся незакрытыми, в ведомость не попадут. Проверьте «Посещаемость → Незакрытые уроки» и сохраните снова.",
      confirmLabel: OPEN_LESSONS_SAVE_LABEL,
      cancelLabel: OPEN_LESSONS_BACK_LABEL,
    };
  }
  const shown = gate.items.slice(0, OPEN_LESSONS_LIST_LIMIT).map((item) => openLessonItemLine(item, groupNames));
  const rest = gate.count - shown.length;
  const lines = rest > 0 ? [...shown, `и ещё ${rest}`] : shown;
  const word = pluralRu(gate.count, "незакрытый урок", "незакрытых урока", "незакрытых уроков");
  return {
    title: "Сохранить ведомость с незакрытыми уроками?",
    message: [
      `В месяце ${gate.count} ${word}: они не попадут в ведомость, а месяц после сохранения закроется.`,
      ...(lines.length > 0 ? ["", ...lines] : []),
      "",
      "Закройте их в «Посещаемость → Незакрытые уроки» и сохраните снова — или сохраните как есть.",
    ].join("\n"),
    confirmLabel: OPEN_LESSONS_SAVE_LABEL,
    cancelLabel: OPEN_LESSONS_BACK_LABEL,
  };
}
