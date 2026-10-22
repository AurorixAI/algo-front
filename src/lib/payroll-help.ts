/**
 * N13 P4 #104 - «Зарплата: понятность»: the words that explain the payroll screens at first sight - what a status means,
 * what to do about a warning, what the dashed «1» and «начислить» are, how the sum is made - and the way a price of a
 * line is shown (UX-2: as text only).  Pure texts and small helpers: no React and no network, so node:test can load this file.
 * Nothing here calculates a sum of the screen: the numbers come from the server; the only arithmetic is the worked
 * example of «Как считается зарплата», which uses the same `lineAmount` as the sheet's preview.
 */
import { formatMoney } from "./payments";
import { CANCELLED_LESSON_TEXT } from "./payments-logica";
import { lineAmount, PENDING_CELL_LABEL, versionLabel, type PayrollMonthSheetRef } from "./payroll";

// ── Statuses of a teacher's month ───────────────────────────────────────────

/** The explanation behind a status chip («Не рассчитано» / «Сохранено 16.10» / «Есть изменения»). */
export function statusHint(sheet: Pick<PayrollMonthSheetRef, "revision" | "stale"> | null | undefined): string {
  if (!sheet) {
    return "Ведомость за этот месяц ещё не сохранена. Задайте ставку в «Сотрудниках», нажмите «Рассчитать» и сохраните результат.";
  }
  if (sheet.stale) {
    return `Ведомость сохранена (${versionLabel(sheet.revision)}), но после этого изменились посещаемость, оплаты, подтверждения пропусков, цены или ставка. Сохранённые суммы сами не меняются: нажмите «Пересчитать» — появится новая версия.`;
  }
  return `Ведомость сохранена (${versionLabel(sheet.revision)}). С момента сохранения данные не менялись — суммы актуальны. Любая правка создаёт новую версию, прежние остаются в истории.`;
}

/** The compact line over a preview of a teacher who already has a saved sheet. */
export function savedRevisionLine(revision: number): { text: string; hint: string } {
  return {
    text: `Уже сохранена: ${versionLabel(revision)}. Новое сохранение создаст версию ${revision + 1}.`,
    hint: "Прежние отметки «начислить» сохранятся. Прежняя версия останется в истории.",
  };
}

// ── The sheet: dashed «1», «начислить», «Не оплачено» ───────────────────────

/** «начислить» (it used to be «включить»): the unpaid lessons of the student are paid to the teacher too. */
export const INCLUDE_LABEL = "начислить";
export const INCLUDE_HINT = "Начислить преподавателю и за неоплаченные уроки этого ученика";
export const INCLUDE_DONE_LABEL = "начислены";
export const INCLUDE_NOT_DONE_LABEL = "не начислены";

export const UNPAID_HEADER_HINT =
  "Посещения ученика (уроки, на которых он был), не покрытые оплатой. В сумму они не входят, пока в строке не отмечено «начислить».";

export const COUNTED_HEADER_HINT =
  "Посещения ученика, которые идут в расчёт: урок проведён, ученик был (или пропустил без подтверждённой уважительной причины) и урок оплачен.";

export const PRICE_HEADER_HINT =
  "Цена ученика на день каждого урока: цена его группы или индивидуальная. Здесь она не меняется — её задают в «Оплаты → Цены групп» и в карточке ученика.";

/** The header of the price column: «Цена в месяц», or «Цена пакета» in a centre that sells packages of lessons. */
export function priceColumnLabel(centreLabel: string): string {
  return centreLabel === "Цена пакета" ? centreLabel : "Цена в месяц";
}

/** The legend above the table: the mark, what it means. `dashed`: the dashed «1» (its own look and tooltip). */
export const SHEET_LEGEND: ReadonlyArray<{ key: string; mark: string; text: string }> = [
  { key: "counted", mark: "1", text: "засчитан" },
  { key: "zero", mark: "0", text: "не засчитан (уважительная причина подтверждена)" },
  { key: "pending", mark: PENDING_CELL_LABEL, text: "уважительная, решение ещё не принято (урок засчитан)" },
  { key: "unpaid", mark: "1", text: "был на уроке, не оплачен — не входит в сумму" },
];

export const SHEET_INCLUDE_NOTE = "Неоплаченные уроки входят в сумму строки, только если отметить «начислить».";

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
    `За каждый засчитанный урок ученика преподаватель получает цену ученика × свою ставку ÷ ${divisor}. Строка ученика — это сумма по всем его засчитанным урокам месяца.`,
    "Засчитывается урок, который проведён, на котором ученик был (или пропустил без подтверждённой уважительной причины) и который покрыт оплатой.",
    "Не входят в сумму: уроки без оплаты (пунктирная «1», столбец «Без оплаты») и уроки с подтверждённой уважительной причиной («0»). Уважительная причина, которая ждёт решения, пока засчитывается.",
    "Цена берётся на день каждого урока: цена группы или индивидуальная цена ученика. Если цену подняли с 15-го числа, месяц считается по двум ценам. Цену не правят в ведомости: её задают в «Оплаты → Цены групп» и в карточке ученика.",
    "Ставка преподавателя (процент по видам занятий) задаётся в «Сотрудниках» и действует с выбранного месяца; сохранённые ведомости она не меняет.",
    "Если неоплаченные уроки всё же надо оплатить преподавателю, отметьте «начислить» в строке ученика.",
    // LOGIC-A decisions 3 and 5
    CANCELLED_LESSON_TEXT,
  ];
}
