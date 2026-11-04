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
import { formatMoney, formatSignedMoney } from "./money-format";
import { canDecideMoney } from "./one-off";
import { monthTitle } from "./payroll";

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
}

export interface MoneyEffects {
  students: MoneyStudentEffect[];
  payroll: MoneyPayrollEffect[];
  text: string;
  /** The answer is a preview (nothing was written). */
  dryRun: boolean;
  /** R3 #7: the server could not work the numbers out (the action itself is done / allowed): «последствия не удалось посчитать», not an error. */
  unavailable: boolean;
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
    }));
  return { students, payroll, text: str(source.text) ?? "", dryRun: source.dryRun === true, unavailable: source.unavailable === true };
}

/** The block of an answer: `moneyEffects` (lessons) or `money_effects` (payments, rates, excuses) - one reader for both spellings. */
export function moneyEffectsOf(answer: unknown): MoneyEffects | null {
  if (!answer || typeof answer !== "object") return null;
  const source = answer as Record<string, unknown>;
  return normalizeMoneyEffects(source.moneyEffects ?? source.money_effects);
}

/** The action moves nothing: no pack and no saved sheet is touched (and the server did work the numbers out). */
export function effectsEmpty(effects: MoneyEffects | null | undefined): boolean {
  return !effects || (effects.students.length === 0 && effects.payroll.length === 0 && !effects.unavailable);
}

/** R3 #7: the numbers of the action could not be worked out; the action itself is not refused (or was done). */
export const EFFECTS_UNAVAILABLE_TEXT = "Последствия для денег не удалось посчитать";
export const EFFECTS_UNAVAILABLE_HINT = "Действие можно выполнить; ведомости проверьте после";
export const EFFECTS_UNAVAILABLE_DONE_HINT = "Действие выполнено; проверьте ведомости";

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

/** The title of the block in a window of confirmation. */
export const EFFECTS_TITLE = "Что будет с деньгами";
/** An action that moves no pack and no saved sheet says so (I-5: a list of consequences is always there, also when it is empty). */
export const EFFECTS_NONE_TEXT = "Деньги не изменятся: пакеты учеников и сохранённые ведомости не затронуты.";
/**
 * The same for a payment, a cancel of it, a refund, a write-off and a transfer (R3 m1): the debt of the student DOES change - the window says that in its own line - so «деньги не изменятся»
 * would be false there; what stays is the pay of the teachers.
 */
export const EFFECTS_NONE_PAYMENTS_TEXT = "Ведомости преподавателей не изменятся.";
/** Which words a block of effects speaks in: the lessons (the pay of a teacher and the packs) or the money of a student. */
export type EffectsVariant = "lesson" | "payment";
export const EFFECTS_LOADING_TEXT = "Считаем, что изменится с деньгами…";
export const TRANSFER_LOADING_TEXT = "Считаем, что изменится при переводе…";
export const EFFECTS_FAILED_TEXT = "Не удалось посчитать, что изменится с деньгами. Без этого подтвердить нельзя.";
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

export const MONEY_RIGHT_TEXT = "Это действие меняет деньги: его выполняет владелец или администратор, которому владелец разрешил оплаты";

// ── the lines of a window of confirmation / a toast ──────────────────────────────────────────────

export interface EffectLine {
  key: string;
  text: string;
  /** `warn`: needs a look - a month the sheet has closed, numbers that could not be worked out. */
  tone: "plain" | "warn";
}

const signedSum = formatSignedMoney;

/** «475 000 сум» for a sum in a line. */
const sum = (value: number): string => formatMoney(value);

/**
 * The sentences of money of an action.
 *  - the packs: «Иванов Иван: занятие вернётся в пакет»;
 *  - the saved sheets BEFORE the action, for the OWNER (R3 #22: the sum is there in a dry run, too): «Ведомость Каримова К., октябрь 2026: 475 000 сум → 600 000 сум (+125 000 сум)»;
 *    everybody else gets the month only: «Изменится ведомость: октябрь 2026» (LESSONS 45: the pay of the teachers is the owner's);
 *  - after the action: «Ведомость Каримова К., октябрь 2026: изменилась на +125 000 сум (всего к сохранённой +100 000 сум) — пересохраните её»;
 *  - a month a saved sheet has closed is said as it is («месяц закрыт ведомостью»): a payment is allowed in it, the sheet is re-saved; a lesson action in a closed month is refused by the server
 *    with its own sentence (`PERIOD_CLOSED`) and never reaches this block;
 *  - the numbers could not be worked out (`unavailable`): one line, not an error.
 * `done`: the toast after the action (past tense).
 */
export function effectLines(effects: MoneyEffects | null | undefined, options: { done?: boolean } = {}): EffectLine[] {
  if (!effects) return [];
  const done = options.done === true;
  const lines: EffectLine[] = effects.students.map((student) => ({ key: `student:${student.studentId}`, text: studentEffectText(student, done), tone: "plain" }));
  const label = (line: MoneyPayrollEffect) => (line.teacherName || line.sheetId ? payrollLineLabel(line) : monthInSentence(line.month));
  const closedNote = (line: MoneyPayrollEffect) => (line.state === "closed" ? " · месяц закрыт ведомостью" : "");
  const summed = effects.payroll.filter((line) => line.changedBy !== null && (line.freshBefore !== null || done));
  const plain = effects.payroll.filter((line) => !summed.includes(line));
  if (plain.length > 0) {
    const many = plain.length > 1;
    const head = done ? (many ? "Изменились ведомости" : "Изменилась ведомость") : (many ? "Изменятся ведомости" : "Изменится ведомость");
    lines.push({ key: "payroll", text: `${head}: ${plain.map((line) => `${label(line)}${closedNote(line)}`).join("; ")}`, tone: plain.some((line) => line.state === "closed") ? "warn" : "plain" });
  }
  for (const line of summed) {
    const key = `payroll:${line.month}:${line.teacherId ?? ""}`;
    const change = signedSum(line.changedBy as number);
    if (done) {
      const drift = line.driftAfter !== null && line.driftAfter !== line.changedBy ? ` (всего к сохранённой ${signedSum(line.driftAfter)})` : "";
      lines.push({ key, text: `Ведомость ${label(line)}: изменилась на ${change}${drift} — пересохраните её`, tone: "plain" });
    } else if (line.freshBefore !== null && line.freshAfter !== null) {
      lines.push({ key, text: `Ведомость ${label(line)}: ${sum(line.freshBefore)} → ${sum(line.freshAfter)} (${change})${closedNote(line)}`, tone: line.state === "closed" ? "warn" : "plain" });
    } else {
      lines.push({ key, text: `Ведомость ${label(line)}: изменится на ${change}${closedNote(line)}`, tone: line.state === "closed" ? "warn" : "plain" });
    }
  }
  if (effects.unavailable) lines.push({ key: "unavailable", text: `${EFFECTS_UNAVAILABLE_TEXT}. ${done ? EFFECTS_UNAVAILABLE_DONE_HINT : EFFECTS_UNAVAILABLE_HINT}`, tone: "warn" });
  if (lines.length === 0 && effects.text) lines.push({ key: "text", text: effects.text, tone: "plain" });
  return lines;
}

/** The toast of a done action that may have moved money: amber when a pack or a saved sheet was touched, with the lines under the text. `details`: the lines that were there already. */
export function toastWithEffects(answer: unknown, details: string[] = []): { tone: "success" | "warning"; details: string[] } {
  const lines = effectLines(moneyEffectsOf(answer), { done: true }).map((line) => line.text);
  return { tone: lines.length > 0 ? "warning" : "success", details: [...details, ...lines] };
}
