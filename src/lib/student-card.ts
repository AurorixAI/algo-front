/**
 * IA audit F35 / F38 / F32: the header of the student's card.  Pure: no React, so node:test loads it.
 */
import type { ChipTone } from "./chip-tone";
import { formatMoney, type MembershipPaymentRow } from "./payments";
import { advanceLabel, rowBalance } from "./payments-ledger";
import { payLabel, worstRow, type PayFields } from "./pay-state";

export interface StudentMoneyChip {
  label: string;
  tone: ChipTone;
  /** The quiet words next to the label (the term / the days overdue) - the server's; null when there are none. */
  sub: string | null;
  /** Groups with a debt (the badge of the tab «Оплаты»). */
  debtGroups: number;
}

type CardRow = Pick<MembershipPaymentRow, "debt" | "advance" | "is_active" | "paid_until" | "status"> & PayFields;

/**
 * The one chip of the header (PAY-DUE 9.10): the WORST state of the student's groups, in the server's words - «Долг 600 000 сум» / «К оплате 231 000 сум» + the term, «Оплачено до 15.11» - or null when the server has nothing to
 * say (no groups, no price).  The server names the sum of one group; when two groups are in the same worst state the sum of the part is added up here and named by the same word (the numbers are the server's).
 * It leads to `?tab=payments`.
 */
export function studentMoneyChip(rows: ReadonlyArray<CardRow> | null | undefined): StudentMoneyChip | null {
  const list = rows ?? [];
  const debtGroups = list.filter((row) => (Number(row.debt_amount) || 0) > 0).length;
  const advance = list.reduce((total, row) => total + rowBalance(row).advance, 0);
  const worst = worstRow(list);
  if (!worst) return advance > 0 ? { label: advanceLabel(advance), tone: "ok", sub: null, debtGroups } : null;
  const label = payLabel(worst);
  if (!label.text) return null;
  const same = list.filter((row) => row.state === worst.state);
  if ((worst.state === "debt" || worst.state === "to_pay") && same.length > 1) {
    const field = worst.state === "debt" ? "debt_amount" : "due_amount";
    const total = same.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
    return { label: `${worst.state === "debt" ? DEBT_WORD : DUE_WORD} ${formatMoney(total)}`, tone: label.tone, sub: null, debtGroups };
  }
  // a paid student: the advance is said with the same number as the statement, next to the date it pays for
  const tail = (worst.state === "paid" || worst.state === "expiring") && advance > 0 ? ` · ${advanceLabel(advance)}` : "";
  return { label: `${label.text}${tail}`, tone: label.tone, sub: label.sub, debtGroups };
}

/** The two names of an unpaid sum - the words of the map of tones; the server's labels carry them for one group, a sum over several groups is named with them. */
const DEBT_WORD = "Долг";
const DUE_WORD = "К оплате";

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
