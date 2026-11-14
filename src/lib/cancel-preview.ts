/**
 * «Урока не было»: what the cancellation does to money, from the dry run of the server (`POST …/attendance/reconcile/cancel?dry_run=true`, server 64a929b).
 * The numbers are the server's (`deductions`: who gets a recalculation and how much - only with the money right; `moneyEffects.payroll`: the sheets «было → станет»);
 * the vocabulary is §1 of the UX pack: «перерасчёт: долг уменьшится сразу».  Pure: no React.
 */
import { formatMoney, tidyMoneyText } from "./money-format";
import { effectLines, moneyEffectsOf, type EffectLine } from "./money-effects";
import { pluralRu } from "./plural";

export interface CancelMoneyView {
  /** The sentence about the students: the sums with the money right, the server's own `consequence` without it; null when there is none. */
  students: string | null;
  /** The pay of the teachers (the owner's lines / the administrator's «изменится зарплата …»). */
  payroll: EffectLine[];
}

/** The sentence of the server about the students (`consequence` of the preview, `consequence` of `cancel-consequence`) as it is; null when it is absent or blank. */
export function consequenceTextOf(answer: unknown): string | null {
  const text = (answer as { consequence?: unknown } | null | undefined)?.consequence;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export function cancelMoneyView(answer: unknown): CancelMoneyView {
  const source = (answer ?? {}) as { deductions?: unknown };
  const list = Array.isArray(source.deductions)
    ? (source.deductions as Array<{ amount?: unknown }>).filter((item) => Number(item?.amount) > 0)
    : null;
  let students: string | null = consequenceTextOf(answer);   // without the money right the server sends no `deductions`, only the sentence
  if (list !== null) {
    const total = list.reduce((sum, item) => sum + Number(item.amount), 0);
    students = total > 0
      ? tidyMoneyText(`Ученикам — перерасчёт: долг уменьшится сразу на ${formatMoney(total)} (${list.length} ${pluralRu(list.length, "ученик", "ученика", "учеников")})`)
      : "Ученикам перерасчёта не будет";
  }
  const payroll = effectLines(moneyEffectsOf(answer), { done: false }).filter((line) => line.key.startsWith("payroll"));
  return { students, payroll };
}
