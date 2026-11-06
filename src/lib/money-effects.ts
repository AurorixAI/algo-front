/**
 * «Деньги-1», package A (frontend): what an action does to money, in the answer of the server (`moneyEffects` / `money_effects`, one shape for every action)
 * and the refusals that go with it (a closed month, no money right).  Contract: `artifacts/analysis/MONEY1_A_SERVER_REPORT.md`, server `money_effects.py`.
 *
 *   { students: [{studentId, name, delta}], payroll: [{month, state, ...}], text, dryRun }
 *
 * `delta` +1: a lesson goes back into the pack of the student; -1: a lesson is spent.  `payroll[]`: everybody gets `month` and `state`; only the OWNER also gets the sheet,
 * the teacher, `savedTotal`, `paid` and - after the action - `freshTotal` and `changedBy` (LESSONS 45: the pay of the teachers is the owner's).  A dry run has no amounts.
 * `text` is the sentence of the server for the confirmation («изменится») or the toast («изменилась»): the screen shows it as it is and adds only what it lacks
 * (the names of the students, the months a saved sheet has closed).  The screen never counts a sum of its own.
 *
 * Pure: no React, no network.
 */
import { formatMoney, formatSignedMoney, tidyMoneyText } from "./money-format";
import { canDecideMoney } from "./one-off";
import { pluralRu } from "./plural";
import { formatBusinessDate } from "./business-time";
import { monthTitle } from "./payroll";
import { monthLabel } from "./ru-calendar";

export type PeriodState = "none" | "open" | "closed" | "reopened";

export interface MoneyStudentEffect {
  studentId: string;
  name: string | null;
  /** +1: the lesson goes back into the pack; -1: the lesson is spent. */
  delta: number;
}

export interface MoneyPayrollEffect {
  /** `YYYY-MM` */
  month: string;
  state: PeriodState;
  /** The owner only: */
  sheetId: string | null;
  teacherId: string | null;
  teacherName: string | null;
  savedTotal: number | null;
  paid: number | null;
  /** The owner, also in a dry run (R3 #22): the fresh total of the sheet BEFORE and AFTER this action (`freshTotal` = `freshAfter`) and the effect of THIS action (`changedBy` = after - before). */
  freshBefore: number | null;
  freshAfter: number | null;
  freshTotal: number | null;
  changedBy: number | null;
  /** The fresh total after the action less the SAVED one («всего к сохранённой»). */
  driftAfter: number | null;
  /** The owner: what is left to pay out after the action (the server counts it with the advance of the earlier months).  Not sent by the server yet - the screen then works it out for an open month (`paidLine`). */
  balanceAfter: number | null;
}

export interface MoneyEffects {
  students: MoneyStudentEffect[];
  payroll: MoneyPayrollEffect[];
  text: string;
  /** The answer is a preview (nothing was written). */
  dryRun: boolean;
  /** R3 #7: the server could not work the numbers out (the action itself is done / allowed): «последствия не удалось посчитать», not an error. */
  unavailable: boolean;
  /** Money-1 B8: a confirmed excuse of a monthly student gives the right to make the lesson up - no money moves; the server's sentence («Ученик может отработать пропущенный урок …»). */
  makeup: string | null;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function periodStateOf(value: unknown): PeriodState {
  return value === "open" || value === "closed" || value === "reopened" ? value : "none";
}

/** The block as the screen reads it: no surprises (a missing list is empty, a sum that is not a number is absent).  null when the answer carries no block at all. */
export function normalizeMoneyEffects(raw: unknown): MoneyEffects | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const students = (Array.isArray(source.students) ? source.students : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({ studentId: String(item.studentId ?? ""), name: str(item.name), delta: num(item.delta) ?? 0 }))
    .filter((item) => item.delta !== 0);
  const payroll = (Array.isArray(source.payroll) ? source.payroll : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).month === "string")
    .map((item) => ({
      month: String(item.month),
      state: periodStateOf(item.state),
      sheetId: str(item.sheetId),
      teacherId: str(item.teacherId),
      teacherName: str(item.teacherName),
      savedTotal: num(item.savedTotal),
      paid: num(item.paid),
      freshBefore: num(item.freshBefore),
      freshAfter: num(item.freshAfter),
      freshTotal: num(item.freshTotal),
      changedBy: num(item.changedBy),
      driftAfter: num(item.driftAfter),
      balanceAfter: num(item.balanceAfter),
    }));
  return { students, payroll, text: tidyMoneyText(str(source.text)) ?? "", dryRun: source.dryRun === true, unavailable: source.unavailable === true, makeup: tidyMoneyText(str((source.makeup as { text?: unknown } | null | undefined)?.text)) ?? null };
}

/** The block of an answer: `moneyEffects` (lessons) or `money_effects` (payments, rates, excuses) - one reader for both spellings. */
export function moneyEffectsOf(answer: unknown): MoneyEffects | null {
  if (!answer || typeof answer !== "object") return null;
  const source = answer as Record<string, unknown>;
  return normalizeMoneyEffects(source.moneyEffects ?? source.money_effects);
}

/** The action moves nothing: no pack and no saved sheet is touched (and the server did work the numbers out). */
export function effectsEmpty(effects: MoneyEffects | null | undefined): boolean {
  return !effects || (effects.students.length === 0 && effects.payroll.length === 0 && !effects.unavailable && !effects.makeup);
}

/** R3 #7: the numbers of the action could not be worked out; the action itself is not refused (or was done). */
export const EFFECTS_UNAVAILABLE_TEXT = "Последствия для денег не удалось посчитать";
export const EFFECTS_UNAVAILABLE_HINT = "Действие можно выполнить; зарплату проверьте после";
export const EFFECTS_UNAVAILABLE_DONE_HINT = "Действие выполнено; проверьте зарплату";

/** «октябрь 2026» - the month inside a sentence (no «г.»: a full stop in the middle of a sentence reads as its end). */
export function monthInSentence(month: string): string {
  return monthTitle(month).toLowerCase().replace(/\s*г\.?$/, "");
}

/** «Каримова К., октябрь 2026» / «октябрь 2026» (the teacher is the owner's to see). */
export function payrollLineLabel(line: Pick<MoneyPayrollEffect, "month" | "teacherName">): string {
  return [line.teacherName, monthInSentence(line.month)].filter(Boolean).join(", ");
}

/** «Иванов Иван: занятие вернётся в пакет» / «…спишется из пакета»; `done`: past tense (the toast). */
export function studentEffectText(effect: MoneyStudentEffect, done = false): string {
  const name = effect.name || "Ученик";
  if (effect.delta > 0) return `${name}: ${done ? "занятие вернули в пакет" : "занятие вернётся в пакет"}`;
  return `${name}: ${done ? "занятие списали из пакета" : "занятие спишется из пакета"}`;
}

/** The ONE title of the block of consequences in every window of confirmation (UX pack 05.11, rule 1; vocabulary §1: not «Что будет с деньгами» / «Что будет после сохранения» / «Что переедет»). */
export const EFFECTS_TITLE = "Что изменится";
/** An action that moves no pack and no saved sheet says so in ONE grey line - no block, no title (UX pack, rule 1). */
export const EFFECTS_NONE_TEXT = "Деньги не изменятся";

/** Which words a block of effects speaks in: `lesson` - the lessons (the pay of a teacher and the packs; nothing moves: one grey line); `quiet` - a transfer of a student (nothing moves: nothing is said). */
export type EffectsVariant = "lesson" | "quiet";
/** Not drawn as a sentence any more (a skeleton of the size of the block stands in its place); it is the reading of the skeleton for a screen reader. */
export const EFFECTS_LOADING_TEXT = "Считаем, что изменится…";
export const TRANSFER_LOADING_TEXT = "Считаем, что изменится при переводе…";
export const EFFECTS_FAILED_TEXT = "Не удалось посчитать, что изменится. Без этого подтвердить нельзя.";
export const EFFECTS_RETRY_LABEL = "Повторить";
export const REOPEN_MONTH_LABEL = "Переоткрыть месяц";

/**
 * Why the dry run failed, in words: the sentence of the server for a refusal it explains (4xx with a text: «Проведённого урока нет», «Отметки урока уже изменили»); the general
 * one for a dead network, a timeout or a server error (nothing to explain, only to repeat).
 */
export function effectsFailureText(error: unknown): string {
  const source = error as { status?: unknown; message?: unknown; code?: unknown } | null | undefined;
  const status = typeof source?.status === "number" ? source.status : 0;
  const message = typeof source?.message === "string" ? source.message.trim() : "";
  if (status >= 400 && status < 500 && message && source?.code !== "EFFECTS_TIMEOUT") return message;
  return EFFECTS_FAILED_TEXT;
}

// ── the right ────────────────────────────────────────────────────────────────────────────────────

/**
 * I-6: the owner and an administrator the owner allowed payments move money; the rest do not see the actions at all (the server answers 403 `MONEY_RIGHT_REQUIRED`).
 * An absent flag is NO right (LESSONS 17).  The same rule as the one of the decisions on additional lessons (`canDecideMoney`) - one function for both.
 */
export function canManageMoney(user: { org_role?: string | null; payments_access?: boolean | null } | null | undefined): boolean {
  return canDecideMoney(user);
}

export const MONEY_RIGHT_TEXT = "Это действие меняет деньги: его выполняет владелец или администратор с доступом к деньгам";

// ── the lines of a window of confirmation / a toast ──────────────────────────────────────────────

export interface EffectRow {
  name: string;
  /** «475 000 → 425 000»; null when the server did not send both sums. */
  change: string | null;
  /** «−50 000 сум» (null: the sum of the change is not known). */
  delta: string | null;
}

export interface EffectLine {
  key: string;
  /** The line itself; for the pay of the teachers - its heading («Зарплата за сентябрь вырастет:»). */
  text: string;
  /** Under the heading: one line per teacher («Эргашев К. — +133 333 сум (было 860 000, станет 993 333)»). */
  items?: string[];
  /** The same lines as a TABLE (re-audit С11): the name on the left, «было → станет» in the middle, the change on the right - one look of «Что изменится» in every window. */
  rows?: EffectRow[];
  /** Under the items, plain: what is paid already («Уже выплачено 150 000 сум — до новой суммы останется 15 834 сум»); only where the window asks for it (`withPaid`). */
  after?: string[];
  /** After them: what the person has to do («Сентябрь закрыт: сохраните новую сумму, чтобы она вошла в выплату»).  Only when something has to be done. */
  note?: string;
  /** `warn`: needs an action - a month the sheet has closed that must be saved again, numbers that could not be worked out.  Everything else is information. */
  tone: "plain" | "warn";
}

/** Every line of the lines as plain texts (a toast, a question): the heading, its items, its note. */
export function effectLineTexts(lines: ReadonlyArray<EffectLine>): string[] {
  return lines.flatMap((line) => [line.text, ...(line.items ?? []), ...(line.after ?? []), ...(line.note ? [line.note] : [])]);
}

const signedSum = formatSignedMoney;

/** «475 000 сум» for a sum in a line. */
const sum = (value: number): string => formatMoney(value);
/** «860 000» - the sum without the word «сум» (inside a bracket that already follows «+133 333 сум»). */
const bare = (value: number): string => formatMoney(value).replace(/[\s\u00a0]*сум$/, "");

export { monthLabel };

/**
 * The pay of the teachers, ONE form for the window and the toast, grouped by the month (UX round of the owner 05.11; UX pack, rule 1 and §1):
 *   Зарплата за сентябрь вырастет:
 *     Эргашев К. — +133 333 сум (было 860 000, станет 993 333)
 *     Мирзаева Л. — +13 333 сум (было 36 666, станет 49 999)
 *   Сентябрь закрыт: сохраните новые суммы, чтобы они вошли в выплату.
 * The verb follows the sign (вырастет / уменьшится / изменится; after the action выросла / уменьшилась / изменилась).  The last sentence only for a CLOSED month (the sheet has to be saved
 * again for the difference to be paid out) - a month that is open has none; a sheet that is as saved again after the action says so and asks nothing.  An administrator with the money access gets
 * no names and no sums (LESSONS 45), ONE line for all the months: «Изменится зарплата за сентябрь — 2 преподавателя, за октябрь — 1. Суммы видит владелец.» and, for a closed month, that the owner saves the new sum.
 */
/**
 * «Уже выплачено 150 000 сум — до новой суммы останется 15 834 сум» (UX pack №1): the OWNER's line under a teacher whose OPEN (or reopened) month is paid by what is accrued now (`payroll_payouts.state_of`:
 * `target = fresh_total`), so what is left is `freshAfter − paid`; a closed month is paid by its saved sum, which this action does not move, so the line is not said there.  The server's own
 * `balanceAfter` wins when it sends it (it knows the advance of the earlier months, which the screen does not).  null: nothing paid yet, or the numbers are not there.
 */
export function paidLine(line: MoneyPayrollEffect): string | null {
  if (line.state === "closed" || line.paid === null || line.paid <= 0 || line.freshAfter === null) return null;
  const left = line.balanceAfter ?? line.freshAfter - line.paid;
  const paid = `Уже выплачено ${sum(line.paid)}`;
  if (left > 0) return `${paid} — до новой суммы останется ${sum(left)}`;
  if (left === 0) return `${paid} — это вся новая сумма`;
  return `${paid} — это на ${sum(-left)} больше новой суммы: выплачено вперёд`;
}

function payrollGroups(payroll: ReadonlyArray<MoneyPayrollEffect>, done: boolean, today: string, withPaid = false): EffectLine[] {
  const months = [...new Set(payroll.map((line) => line.month))].sort();
  // an action that did not move a sheet has no news about it (in the preview too: nothing to say)
  const groups = months
    .map((month) => ({ month, moved: payroll.filter((line) => line.month === month && line.changedBy !== 0) }))
    .filter((group) => group.moved.length > 0);
  if (groups.length === 0) return [];
  const owner = groups.some((group) => group.moved.some((line) => line.teacherName || line.sheetId));
  const closedOf = (moved: ReadonlyArray<MoneyPayrollEffect>) => moved.filter((line) => line.state === "closed" && !(done && line.driftAfter === 0));

  if (!owner) {
    const parts = groups.map((group, index) => {
      const n = group.moved.length;
      return `за ${monthLabel(group.month, today)} — ${n}${index === 0 ? ` ${pluralRu(n, ["преподаватель", "преподавателя", "преподавателей"])}` : ""}`;
    });
    const closedMonths = groups.filter((group) => closedOf(group.moved).length > 0);
    const several = closedMonths.some((group) => closedOf(group.moved).length > 1) || closedMonths.length > 1;
    const names = closedMonths.map((group, index) => monthLabel(group.month, today, index === 0)).join(" и ");
    const note = closedMonths.length > 0 ? `${names} ${closedMonths.length > 1 ? "закрыты" : "закрыт"}: владелец сохранит ${several ? "новые суммы" : "новую сумму"}.` : undefined;
    return [{ key: "payroll:admin", text: `${done ? "Изменилась" : "Изменится"} зарплата ${parts.join(", ")}. Суммы видит владелец.`, note, tone: note ? "warn" : "plain" }];
  }

  const out: EffectLine[] = [];
  for (const { month, moved } of groups) {
    const m = monthLabel(month, today);
    const counted = moved.filter((line) => line.changedBy !== null);
    const count = closedOf(moved).length;
    const note = count > 0 ? `${monthLabel(month, today, true)} закрыт: сохраните ${count > 1 ? "новые суммы, чтобы они вошли" : "новую сумму, чтобы она вошла"} в выплату.` : undefined;
    const tone: EffectLine["tone"] = count > 0 ? "warn" : "plain";
    const key = `payroll:${month}`;
    if (counted.length === 0) {
      const who = moved.map((line) => line.teacherName || "преподаватель").join(", ");
      out.push({ key, text: `${done ? "Изменилась" : "Изменится"} зарплата за ${m} — ${who}${who.endsWith(".") ? "" : "."}`, note, tone });
      continue;
    }
    const ups = counted.filter((line) => (line.changedBy as number) > 0).length;
    const downs = counted.filter((line) => (line.changedBy as number) < 0).length;
    const verb = ups > 0 && downs === 0 ? (done ? "выросла" : "вырастет") : downs > 0 && ups === 0 ? (done ? "уменьшилась" : "уменьшится") : (done ? "изменилась" : "изменится");
    const items = moved.map((line) => {
      const name = line.teacherName || "Преподаватель";
      if (line.changedBy === null) return name;
      const sums = line.freshBefore !== null && line.freshAfter !== null ? ` (было ${bare(line.freshBefore)}, ${done ? "стало" : "станет"} ${bare(line.freshAfter)})` : "";
      return `${name} — ${signedSum(line.changedBy)}${sums}${done && line.driftAfter === 0 ? " — снова как сохранённая" : ""}`;
    });
    const after = withPaid ? moved.map((line) => paidLine(line)).filter((text): text is string => text !== null) : [];
    const rows: EffectRow[] = moved.map((line) => ({
      name: line.teacherName || "Преподаватель",
      change: line.freshBefore !== null && line.freshAfter !== null ? `${bare(line.freshBefore)} → ${bare(line.freshAfter)}` : null,
      delta: line.changedBy === null ? null : signedSum(line.changedBy),
    }));
    out.push({ key, text: `Зарплата за ${m} ${verb}:`, items, rows, ...(after.length > 0 ? { after } : {}), note, tone });
  }
  return out;
}

/**
 * The sentences of money of an action.
 *  - the packs: «Иванов Иван: занятие вернётся в пакет»;
 *  - the pay of the teachers by month (`payrollGroups`): the owner sees who and by how much, everybody else the month and how many;
 *  - the numbers could not be worked out (`unavailable`): one line, not an error.
 * `done`: the toast after the action (past tense).  `today` (business date) decides whether a month is named with its year.
 */
export function effectLines(effects: MoneyEffects | null | undefined, options: { done?: boolean; today?: string; withPaid?: boolean } = {}): EffectLine[] {
  if (!effects) return [];
  const done = options.done === true;
  const lines: EffectLine[] = effects.students.map((student) => ({ key: `student:${student.studentId}`, text: studentEffectText(student, done), tone: "plain" }));
  lines.push(...payrollGroups(effects.payroll, done, options.today ?? formatBusinessDate(), options.withPaid === true));
  if (effects.makeup) lines.push({ key: "makeup", text: effects.makeup, tone: "plain" });
  if (effects.unavailable) lines.push({ key: "unavailable", text: `${EFFECTS_UNAVAILABLE_TEXT}. ${done ? EFFECTS_UNAVAILABLE_DONE_HINT : EFFECTS_UNAVAILABLE_HINT}`, tone: "warn" });
  if (lines.length === 0 && effects.text) lines.push({ key: "text", text: effects.text, tone: "plain" });
  return lines;
}

/**
 * The toast of a done action that may have moved money: the lines of the window in the past tense under the text.  Amber only when the person has to DO something (a closed month whose sheet
 * is to be saved again, numbers that could not be worked out); an ordinary change is a plain toast.  `details`: the lines that were there already.
 */
export function toastWithEffects(answer: unknown, details: string[] = []): { tone: "success" | "warning"; details: string[] } {
  const lines = effectLines(moneyEffectsOf(answer), { done: true });
  return { tone: lines.some((line) => line.tone === "warn") ? "warning" : "success", details: [...details, ...effectLineTexts(lines)] };
}

/** The sum an action moved, for a toast of ONE phrase («+45 000 сум»): the sum of `changedBy` of the lines of the answer - the owner's only; null for everybody else or when nothing moved. */
export function movedByOf(answer: unknown): number | null {
  const lines = moneyEffectsOf(answer)?.payroll.filter((line) => line.changedBy !== null && line.changedBy !== 0) ?? [];
  return lines.length > 0 ? lines.reduce((all, line) => all + (line.changedBy as number), 0) : null;
}

/**
 * The toast of an action on the STUDENT's money - a payment, its correction or cancel, a forgiven debt, a refund (UX pack §5.1-тер, decision of the owner 05.11): the pay of the teachers is NOT in it, whoever
 * the person is.  The server still sends `moneyEffects.payroll`; the screen does not draw it in these windows.  The change lives where it is acted on - in «Зарплата» (the chip of the list, the bar over it).
 */
export function studentToast(details: string[] = []): { tone: "success"; details: string[] } {
  return { tone: "success", details };
}
