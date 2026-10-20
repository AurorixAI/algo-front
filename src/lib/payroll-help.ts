/**
 * N13 P4 #104 - «Зарплата: понятность»: the words that explain the payroll screens at first sight - what a status means,
 * what to do about a warning, what the dashed «1» and «начислить» are, how the sum is made - and the way a price of a
 * line is shown (#105).  Pure texts and small helpers: no React and no network, so node:test can load this file.
 * Nothing here calculates a sum of the screen: the numbers come from the server; the only arithmetic is the worked
 * example of «Как считается зарплата», which uses the same `lineAmount` as the sheet's preview.
 */
import { formatMoney, formatMoneyInput } from "./payments";
import {
  formatDayMonth,
  lineAmount,
  revisionLabel,
  type PayrollLine,
  type PayrollMonthSheetRef,
  type PayrollPriceStep,
} from "./payroll";

// ── Statuses of a teacher's month ───────────────────────────────────────────

/** The explanation behind a status chip («Не рассчитано» / «Данные изменились» / «Сохранено · редакция N»). */
export function statusHint(sheet: Pick<PayrollMonthSheetRef, "revision" | "stale"> | null | undefined): string {
  if (!sheet) {
    return "Ведомость за этот месяц ещё не сохранена. Задайте проценты, нажмите «Рассчитать» и сохраните результат.";
  }
  if (sheet.stale) {
    return `Ведомость сохранена (${revisionLabel(sheet.revision)}), но после этого изменились посещаемость, оплаты, подтверждения пропусков или цены. Сохранённые суммы сами не меняются: откройте ведомость и нажмите «Пересчитать» — появится новая редакция.`;
  }
  return `Ведомость сохранена (${revisionLabel(sheet.revision)}). С момента сохранения данные не менялись — суммы актуальны. Любая правка создаёт новую редакцию, прежние остаются в истории.`;
}

/** The compact line over a preview of a teacher who already has a saved sheet. */
export function savedRevisionLine(revision: number): { text: string; hint: string } {
  return {
    text: `Уже сохранена: ${revisionLabel(revision)}. Новое сохранение создаст редакцию ${revision + 1}.`,
    hint: "Прежние правки сумм и начисления за неоплаченные уроки сохранятся. Прежняя редакция останется в истории.",
  };
}

// ── The sheet: dashed «1», «начислить», «Не оплачено» ───────────────────────

/** «начислить» (it used to be «включить»): the unpaid lessons of the student are paid to the teacher too. */
export const INCLUDE_LABEL = "начислить";
export const INCLUDE_HINT = "Начислить преподавателю и за неоплаченные уроки этого ученика";
export const INCLUDE_DONE_LABEL = "начислены";
export const INCLUDE_NOT_DONE_LABEL = "не начислены";

export const UNPAID_HEADER_HINT =
  "Уроки, на которых ученик был, но которые не покрыты оплатой. В сумму они не входят, пока в строке не отмечено «начислить».";

export const COUNTED_HEADER_HINT =
  "Уроки, которые идут в расчёт: проведены, ученик был (или пропустил без подтверждённой уважительной причины) и урок оплачен.";

export const PRICE_HEADER_HINT =
  "Цена ученика на день каждого урока: цена его группы или индивидуальная. Если ввести сумму здесь, она заменит цену во всех уроках строки.";

/** The legend above the table: the mark, what it means. `dashed`: the dashed «1» (its own look and tooltip). */
export const SHEET_LEGEND: ReadonlyArray<{ key: string; mark: string; text: string }> = [
  { key: "counted", mark: "1", text: "засчитан" },
  { key: "zero", mark: "0", text: "не засчитан (уважительная причина подтверждена)" },
  { key: "pending", mark: "Ув.?", text: "уважительная ждёт подтверждения (засчитан)" },
  { key: "unpaid", mark: "1", text: "был на уроке, урок не оплачен — не входит в сумму" },
  { key: "empty", mark: "пусто", text: "ученика ещё нет в группе" },
];

export const SHEET_INCLUDE_NOTE = "Неоплаченные уроки входят в сумму строки, только если отметить «начислить».";

// ── The price of a line (#105) ──────────────────────────────────────────────

/** «индивидуальная» next to a price that is the individual price of the student; null for the price of the group. */
export function priceSourceNote(line: Pick<PayrollLine, "price_source" | "fee_overridden">): string | null {
  if (line.fee_overridden) return null; // the owner's overwrite on the sheet has its own note
  return line.price_source === "override" ? "индивидуальная" : null;
}

/** «с 15.10 — 500 000» */
export function priceStepText(step: PayrollPriceStep): string {
  const day = formatDayMonth(step.date);
  const amount = step.amount === null || step.amount === undefined ? "цена не задана" : formatMoneyInput(step.amount);
  return `с ${day} — ${amount}`;
}

/**
 * What the price field of a line whose price changed in the month says: every lesson is priced at its own day; a sum typed
 * replaces the price of all lessons, the shown (last) price typed brings the prices of the days back.  null: nothing to say.
 */
export function priceFieldHint(
  line: Pick<PayrollLine, "price_changed" | "fee_overridden">,
  editable: boolean,
): string | null {
  if (line.fee_overridden || !line.price_changed) return null;
  const base = "Цена менялась в течение месяца: каждый урок посчитан по цене своего дня.";
  return editable
    ? `${base} Если ввести сумму, она заменит цену во всех уроках строки; ввод показанной цены вернёт цены по дням уроков.`
    : base;
}

/** The steps of a price that changed inside the month, one text each; [] when it did not (or the owner overwrote it). */
export function priceStepsLines(line: Pick<PayrollLine, "price_changed" | "price_steps" | "fee_overridden">): string[] {
  if (line.fee_overridden || !line.price_changed) return [];
  return (line.price_steps ?? []).map(priceStepText);
}

// ── «Как считается зарплата» ────────────────────────────────────────────────

export const HOW_TITLE = "Как считается зарплата";

/** The worked example: static numbers, the arithmetic is the sheet's own. */
export interface PayrollExample {
  price: number;
  percent: number;
  divisor: number;
  lessons: number;
  amount: number;
  /** «600 000 сум × 50 % ÷ 12 × 3 урока = 75 000 сум» */
  text: string;
}

export function payrollExample(divisor: number = 12): PayrollExample {
  const price = 600_000;
  const percent = 50;
  const lessons = 3;
  const amount = lineAmount({ fee: price, percentHundredths: percent * 100, divisor, lessons });
  const text = `${formatMoney(price)} × ${percent} % ÷ ${divisor} × ${lessons} урока = ${formatMoney(amount)}`;
  return { price, percent, divisor, lessons, amount, text };
}

/** The formula in words, one sentence per line. */
export function howItWorksLines(divisor: number = 12): string[] {
  return [
    `За каждый засчитанный урок ученика преподаватель получает цену ученика × свой процент ÷ ${divisor}. Строка ученика — это сумма по всем его засчитанным урокам месяца.`,
    "Засчитывается урок, который проведён, на котором ученик был (или пропустил без подтверждённой уважительной причины) и который покрыт оплатой.",
    "Не входят в сумму: уроки без оплаты (пунктирная «1», столбец «Не оплачено») и уроки с подтверждённой уважительной причиной («0»). Уважительная причина, которая ждёт решения, пока засчитывается.",
    "Цена берётся на день каждого урока: цена группы или индивидуальная цена ученика. Если цену подняли с 15-го числа, месяц считается по двум ценам.",
    "Если неоплаченные уроки всё же надо оплатить преподавателю, отметьте «начислить» в строке ученика.",
  ];
}
