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

/** `missed`: nobody marked it; `in_progress`: started and not finished (the words of «Незакрытые уроки»). */
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

export const OPEN_LESSONS_SAVE_LABEL = "Сохранить всё равно";
export const OPEN_LESSONS_BACK_LABEL = "Отмена";

/** The question before the save; null: nothing to ask. */
export function openLessonsQuestion(gate: OpenLessonsGate): ConfirmRequest | null {
  if (gate.kind === "none") return null;
  if (gate.kind === "unknown") {
    return {
      title: "Не удалось проверить незакрытые уроки",
      message: "Мы не смогли узнать, есть ли в этом месяце незакрытые уроки. Если сохранить сейчас, месяц закроется, а уроки, которые окажутся незакрытыми, в ведомость не попадут. Проверьте «Посещаемость → Незакрытые уроки» и сохраните снова.",
      confirmLabel: OPEN_LESSONS_SAVE_LABEL,
      cancelLabel: OPEN_LESSONS_BACK_LABEL,
    };
  }
  const shown = gate.items.slice(0, OPEN_LESSONS_LIST_LIMIT).map((item) => openLessonItemLine(item));
  const rest = gate.count - shown.length;
  const lines = rest > 0 ? [...shown, `и ещё ${rest}`] : shown;
  const word = pluralRu(gate.count, "незакрытый урок", "незакрытых урока", "незакрытых уроков");
  const confirmed = gate.alreadyConfirmed ?? 0;
  return {
    title: "Сохранить ведомость с незакрытыми уроками?",
    message: [
      gate.message || `В месяце ${gate.count} ${word}, которых вы ещё не подтверждали: они не попадут в ведомость, а месяц закроется. Сохранить всё равно?`,
      ...(lines.length > 0 ? ["", ...lines] : []),
      ...(confirmed > 0 ? ["", `Ещё ${confirmed} ${pluralRu(confirmed, "урок", "урока", "уроков")} вы подтвердили раньше.`] : []),
    ].join("\n"),
    confirmLabel: OPEN_LESSONS_SAVE_LABEL,
    cancelLabel: OPEN_LESSONS_BACK_LABEL,
  };
}
