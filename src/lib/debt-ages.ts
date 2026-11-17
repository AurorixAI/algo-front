/**
 * Money-2 Э8 (Т18): «Должники» by the age of the debt.  Four baskets (`to_30`, `31_60`, `61_90`, `over_90`) of the summary - students, stays and the sum of each - are a FILTER of the list (`age=`); a row says
 * «долг N дней» from `debt_age_days` (the same count as «Просрочено на N дней»; the pauses are not counted).  The numbers are the server's.  Pure.
 */
import { formatMoney } from "./money-format";
import { daysLabel } from "./plural";

export type DebtAge = "to_30" | "31_60" | "61_90" | "over_90";
export const DEBT_AGES: ReadonlyArray<{ key: DebtAge; label: string }> = [
  { key: "to_30", label: "До 30 дней" },
  { key: "31_60", label: "31–60 дней" },
  { key: "61_90", label: "61–90 дней" },
  { key: "over_90", label: "Старше 90 дней" },
];

export function parseDebtAge(value: string | null | undefined): DebtAge | "" {
  return DEBT_AGES.some((age) => age.key === value) ? (value as DebtAge) : "";
}

export interface DebtAgeBasket { key: DebtAge; label: string; students: number; memberships: number; debtTotal: number }

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/** The four baskets in the order of the server's `debt_ages[]` (always four); an older server without it -> an empty list (no strip). */
export function debtAgesOf(raw: unknown): DebtAgeBasket[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of raw) if (item && typeof item === "object" && typeof (item as { bucket?: unknown }).bucket === "string") byKey.set((item as { bucket: string }).bucket, item as Record<string, unknown>);
  if (byKey.size === 0) return [];
  return DEBT_AGES.map(({ key, label }) => {
    const item = byKey.get(key) ?? {};
    return { key, label, students: count(item.students), memberships: count(item.memberships), debtTotal: count(item.debt_total) };
  });
}

/** «4 уч.» of the «Все» chip: the sum stands once, in the card «Долг» above (Money-2 fix 5). */
export function debtAgeAllLabel(total: { students: number }): string {
  return `${total.students} уч.`;
}

/** «3 ученика · 450 000 сум» of a basket. */
export function debtAgeSummary(basket: Pick<DebtAgeBasket, "students" | "debtTotal">): string {
  return `${basket.students} уч. · ${formatMoney(basket.debtTotal)}`;
}

/** «62 дня» (the age of the debt for the line with the sum, «Долг 700 000 сум · 62 дня»); null without an age. */
export function debtAgeDays(days: number | null | undefined): string | null {
  return typeof days === "number" && Number.isFinite(days) && days >= 0 ? daysLabel(Math.floor(days)) : null;
}

/** «долг 62 дня»; null without an age. */
export function debtAgeLine(days: number | null | undefined): string | null {
  return typeof days === "number" && Number.isFinite(days) && days >= 0 ? `долг ${daysLabel(Math.floor(days))}` : null;
}
