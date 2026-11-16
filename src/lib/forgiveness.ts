/**
 * Money-2 Э6 (Т14): what forgiving a debt does to the pay of the teacher - `money_effects.forgiveness {teacher_pay, text}` of the dry run / the write of the write-off (`teacher_pay` > 0: the teacher is paid
 * for those lessons; only the owner gets it, an administrator gets null).  The sum is the server's; the sentence is under «Подробнее».  Pure.
 */
import { formatSignedMoney } from "./money-format";

export interface Forgiveness { teacherPay: number | null; value: string | null; text: string }

export const FORGIVENESS_LABEL = "Зарплата преподавателя";

export function forgivenessOf(answer: unknown): Forgiveness | null {
  const raw = ((answer as { money_effects?: { forgiveness?: unknown } | null } | null | undefined)?.money_effects?.forgiveness ?? null) as { teacher_pay?: unknown; text?: unknown } | null;
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  const pay = typeof raw.teacher_pay === "number" && Number.isFinite(raw.teacher_pay) ? raw.teacher_pay : null;
  if (!text && !pay) return null;
  return { teacherPay: pay, value: pay ? formatSignedMoney(pay) : null, text };
}
