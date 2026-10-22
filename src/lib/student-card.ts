/**
 * IA audit F35 / F38 / F32: the header of the student's card.  Pure: no React, so node:test loads it.
 */
import { formatMoney, type MembershipPaymentRow } from "./payments";
import { rowBalance } from "./payments-ledger";

export interface StudentMoneyChip {
  label: string;
  tone: "danger" | "ok";
  /** Groups with a debt (the badge of the tab «Оплаты»). */
  debtGroups: number;
}

/**
 * The one chip of the header: «Долг 1 200 000 сум» (all groups, also a group the student has left) or «Оплачено до 15.11» (the nearest end of
 * the paid periods of his running groups); null when there is nothing to say (no groups, never paid, a pause only).  It leads to `?tab=payments`.
 */
export function studentMoneyChip(rows: ReadonlyArray<Pick<MembershipPaymentRow, "debt" | "advance" | "is_active" | "paid_until" | "status">> | null | undefined): StudentMoneyChip | null {
  const list = rows ?? [];
  let debt = 0;
  let debtGroups = 0;
  for (const row of list) {
    const value = rowBalance(row).debt;
    if (value > 0) { debt += value; debtGroups += 1; }
  }
  if (debt > 0) return { label: `Долг ${formatMoney(debt)}`, tone: "danger", debtGroups };
  const ends = list
    .filter((row) => row.is_active && row.paid_until && /^\d{4}-\d{2}-\d{2}/.test(row.paid_until) && row.status !== "paused")
    .map((row) => String(row.paid_until).slice(0, 10))
    .sort();
  if (ends.length === 0) return null;
  const nearest = ends[0];
  return { label: `Оплачено до ${nearest.slice(8, 10)}.${nearest.slice(5, 7)}`, tone: "ok", debtGroups: 0 };
}

/** The editable fields of «Изменить данные…» and the patch of those that changed (nothing unchanged is sent). */
export interface StudentDataForm {
  last_name: string;
  first_name: string;
  class_level: string;
  student_phone: string;
  comment: string;
}

export interface StudentDataSource {
  last_name: string;
  first_name: string;
  class_level: number;
  student_phone: string | null;
  comment: string | null;
}

export function studentDataForm(student: StudentDataSource): StudentDataForm {
  return {
    last_name: student.last_name ?? "",
    first_name: student.first_name ?? "",
    class_level: String(student.class_level ?? ""),
    student_phone: student.student_phone ?? "",
    comment: student.comment ?? "",
  };
}

/** `null` and the text under the field when the form cannot be saved (a name is required, the class is 1..11). */
export function checkStudentData(form: StudentDataForm): string | null {
  if (!form.last_name.trim()) return "Укажите фамилию";
  if (!form.first_name.trim()) return "Укажите имя";
  const level = Number(form.class_level);
  if (!Number.isInteger(level) || level < 1 || level > 11) return "Выберите класс";
  return null;
}

export function studentDataPatch(form: StudentDataForm, student: StudentDataSource): Record<string, string | number | null> {
  const patch: Record<string, string | number | null> = {};
  if (form.last_name.trim() !== student.last_name) patch.last_name = form.last_name.trim();
  if (form.first_name.trim() !== student.first_name) patch.first_name = form.first_name.trim();
  if (Number(form.class_level) !== student.class_level) patch.class_level = Number(form.class_level);
  if ((form.student_phone.trim() || null) !== (student.student_phone || null)) patch.student_phone = form.student_phone.trim() || null;
  if ((form.comment.trim() || null) !== (student.comment || null)) patch.comment = form.comment.trim() || null;
  return patch;
}

/** The header «⋯» of the card: the person's own actions only; «В архив» is last (danger).  `diagnostics`: the administrator's workspace. */
export const STUDENT_MENU_LABEL = {
  edit: "Изменить данные…",
  diagnostic: "Новая диагностика…",
  copyId: "Копировать ID",
  archive: "В архив",
} as const;

export function studentMenuKeys(input: { canEdit: boolean; diagnostics: boolean; hasDisplayId: boolean; canArchive: boolean }): Array<keyof typeof STUDENT_MENU_LABEL> {
  const keys: Array<keyof typeof STUDENT_MENU_LABEL> = [];
  if (input.canEdit) keys.push("edit");
  if (input.diagnostics) keys.push("diagnostic");
  if (input.hasDisplayId) keys.push("copyId");
  if (input.canArchive) keys.push("archive");
  return keys;
}

/** `?tab=contacts&edit=1` opens the card on the form of «Изменить данные…». */
export function studentEditHref(pathname: string): string {
  return `${pathname}?tab=contacts&edit=1`;
}
