/**
 * The card of a group: what the edit form sends (`PUT /org/groups/{id}`).  No React: tested by `tests/w1-round2-front.test.cjs`.
 *
 * - `class_level: null` is an explicit «без класса» (the server clears the field when it is sent);
 * - the lead is sent only when it was CHANGED to a teacher: the form has no «— Не назначен» item (a group without a teacher exists only from the creation and from a dismissal / a change of
 *   the role), and the server refuses a null lead (422 `TEACHER_REQUIRED`).
 */
import type { LessonType } from "./payroll";

export interface GroupEditState {
  name: string;
  class_level: string;
  teacher_id: string;
  description: string;
  max_students: string;
  lesson_type: LessonType | string;
}

export function groupUpdateBody(
  state: GroupEditState,
  currentTeacherId: string | null | undefined,
  withType: boolean,
): { name: string; class_level: number | null; teacher_id?: string; description?: string; max_students: number; lesson_type?: LessonType } {
  return {
    name: state.name.trim(),
    class_level: state.class_level ? Number(state.class_level) : null,
    ...(state.teacher_id && state.teacher_id !== currentTeacherId ? { teacher_id: state.teacher_id } : {}),
    description: state.description.trim() || undefined,
    max_students: Number(state.max_students) || 30,
    ...(withType ? { lesson_type: state.lesson_type as LessonType } : {}),
  };
}

// ── Money-1 B2: the price at the creation of a group ───────────────────────

/** The field is optional: a group may be created without a price and get it later («Цены групп»). */
export const GROUP_CREATE_PRICE_HINT = "Можно задать позже. Цена действует с самого начала; 0 — занятия бесплатные.";

/**
 * The price of the form of a new group.  `request` is what goes to the server - ONLY with access to money (`withMoney`): without it the field is not drawn and nothing is sent, whatever was typed
 * (the server answers 403 `MONEY_RIGHT_REQUIRED` and creates no group otherwise).  An empty field is no price; 0 is a price (free lessons).
 */
export function groupCreatePrice(text: string, withMoney: boolean): { error: string | null; request: number | null } {
  if (!withMoney) return { error: null, request: null };
  const digits = text.replace(/\D+/g, "");
  if (digits === "") return { error: null, request: null };
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value > 10_000_000_000) return { error: "Цена слишком большая", request: null };
  return { error: null, request: value };
}
