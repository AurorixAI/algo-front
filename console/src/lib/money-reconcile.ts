/**
 * «Сверка денег» (Money-1 A7): the words of the nightly check of the money, in one place.  The server (`GET /platform/money-reconcile`) gives runs and the divergences of the newest
 * one - ids, months, sums and a sentence per invariant, no name of a person; a centre never reads it.  Pure: no React, no network.
 */
import { formatMoney } from "@/lib/money-format";
import { monthYearLabelRu } from "@/lib/business-time";
import { DASH, fmtDateTime } from "./format";
import type { Tone } from "./labels";
import type { MoneyFinding, MoneyInvariant, MoneyRun, MoneyRunMail, MoneyRunStatus } from "./types";

export const MONEY_PAGE_TITLE = "Сверка денег";
export const MONEY_PAGE_SUBTITLE = "Каждую ночь сервер сверяет деньги всех центров: долги и оплаты, «оплачено до», сохранённые ведомости, закрытые месяцы. Центры расхождений не видят, имена людей сюда не попадают.";

export function runStatus(status: MoneyRunStatus | string): { label: string; tone: Tone } {
  switch (status) {
    case "clean": return { label: "Всё сошлось", tone: "green" };
    case "findings": return { label: "Есть расхождения", tone: "amber" };
    case "failed": return { label: "Сбой проверки", tone: "red" };
    case "running": return { label: "Идёт", tone: "blue" };
    default: return { label: status, tone: "slate" };
  }
}

export function mailLabel(mail: MoneyRunMail | string | undefined): { label: string; tone: Tone } {
  switch (mail) {
    case "sent": return { label: "Письмо команде отправлено", tone: "green" };
    case "skipped": return { label: "Письмо не нужно: нового нет", tone: "slate" };
    case "failed": return { label: "Письмо не ушло", tone: "red" };
    default: return { label: DASH, tone: "slate" };
  }
}

export const INVARIANTS: Array<{ value: MoneyInvariant; label: string }> = [
  { value: "I-1", label: "Долг и оплаты" },
  { value: "I-2", label: "«Оплачено до»" },
  { value: "I-3", label: "Сохранённые ведомости" },
  { value: "I-4", label: "Закрытые месяцы" },
];

export function invariantLabel(invariant: string): string {
  return INVARIANTS.find((item) => item.value === invariant)?.label ?? invariant;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const money = (value: number | null): string => (value === null ? DASH : formatMoney(value));
const pair = (value: unknown): [unknown, unknown] | null => (Array.isArray(value) && value.length === 2 ? [value[0], value[1]] : null);

function dayText(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : DASH;
}

/** The month of a divergence («Октябрь 2026»); a dash when it has none (a membership, not a month). */
export function findingMonth(finding: Pick<MoneyFinding, "month">): string {
  if (!finding.month || !/^\d{4}-\d{2}$/.test(finding.month)) return DASH;
  const label = monthYearLabelRu(finding.month).replace(/\s*г\.?$/, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** «Строки 475 000 сум · итог 600 000 сум» / «По учёту … · по долгу …» / «Уроков без проведения: 2»: what does not add up, by the invariant. */
export function findingAmount(finding: Pick<MoneyFinding, "invariant" | "expected" | "actual" | "details">): string {
  const expected = num(finding.expected);
  const actual = num(finding.actual);
  const details = finding.details ?? {};
  switch (finding.invariant) {
    case "I-1": return `По учёту ${money(expected)} · по долгу ${money(actual)}`;
    case "I-2": {
      const paidUntil = pair(details.covered_through);
      if (paidUntil && paidUntil[0] !== paidUntil[1]) return `Оплачено до ${dayText(paidUntil[0])} → ${dayText(paidUntil[1])}`;
      const lessons = pair(details.lessons_covered);
      if (lessons && lessons[0] !== lessons[1]) return `Оплаченных уроков ${lessons[0] ?? DASH} → ${lessons[1] ?? DASH}`;
      const paid = pair(details.paid);
      if (paid) return `Оплаты ${money(num(paid[0]))} → ${money(num(paid[1]))}`;
      return DASH;
    }
    case "I-3":
      return details.what === "total" ? `Строки ${money(expected)} · итог ${money(actual)}` : `Уроков без проведения: ${actual ?? DASH}`;
    case "I-4": return `Неразобранных уроков: ${actual ?? DASH}`;
    default: return expected === null && actual === null ? DASH : `${money(expected)} → ${money(actual)}`;
  }
}

/** The extra facts of the open divergence (ids and counts of the server's `details`, in words); never a name. */
export function findingFacts(finding: Pick<MoneyFinding, "invariant" | "details">): Array<{ label: string; value: string }> {
  const details = finding.details ?? {};
  const out: Array<{ label: string; value: string }> = [];
  const paidUntil = pair(details.covered_through);
  if (paidUntil) out.push({ label: "«Оплачено до»", value: `${dayText(paidUntil[0])} → ${dayText(paidUntil[1])}` });
  const lessons = pair(details.lessons_covered);
  if (lessons) out.push({ label: "Оплаченных уроков", value: `${lessons[0] ?? DASH} → ${lessons[1] ?? DASH}` });
  const paid = pair(details.paid);
  if (paid) out.push({ label: "Сумма оплат", value: `${money(num(paid[0]))} → ${money(num(paid[1]))}` });
  if (num(details.charged) !== null) out.push({ label: "Начислено", value: money(num(details.charged)) });
  if (finding.invariant === "I-1" && num(details.paid) !== null) out.push({ label: "Оплачено", value: money(num(details.paid)) });
  const list = Array.isArray(details.lessons) ? details.lessons.filter((item): item is string => typeof item === "string") : [];
  if (list.length > 0) out.push({ label: "Уроки (дата и группа)", value: list.join("; ") });
  return out;
}

/** «05.11.2026 02:10 · проверено центров: 12 · расхождений: 3, новых: 1»: the line over the table of the newest run. */
export function runSummary(run: Pick<MoneyRun, "startedAt" | "centresChecked" | "findings" | "newFindings">): string {
  const found = run.findings > 0 ? `расхождений: ${run.findings}, новых: ${run.newFindings}` : "расхождений нет";
  return [fmtDateTime(run.startedAt), `проверено центров: ${run.centresChecked}`, found].join(" · ");
}

/** The findings filtered by the invariant (`""`: all); new ones first, then by centre. */
export function visibleFindings(findings: readonly MoneyFinding[], invariant: string): MoneyFinding[] {
  return findings
    .filter((finding) => !invariant || finding.invariant === invariant)
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.orgName ?? "").localeCompare(b.orgName ?? "", "ru") || a.invariant.localeCompare(b.invariant));
}
