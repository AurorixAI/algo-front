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
import { formatMoney } from "./money-format";
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
  /** The owner, after the action: the fresh total of the sheet and its difference from the saved one. */
  freshTotal: number | null;
  changedBy: number | null;
}

export interface MoneyEffects {
  students: MoneyStudentEffect[];
  payroll: MoneyPayrollEffect[];
  text: string;
  /** The answer is a preview (nothing was written). */
  dryRun: boolean;
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
      freshTotal: num(item.freshTotal),
      changedBy: num(item.changedBy),
    }));
  return { students, payroll, text: str(source.text) ?? "", dryRun: source.dryRun === true };
}

/** The block of an answer: `moneyEffects` (lessons) or `money_effects` (payments, rates, excuses) - one reader for both spellings. */
export function moneyEffectsOf(answer: unknown): MoneyEffects | null {
  if (!answer || typeof answer !== "object") return null;
  const source = answer as Record<string, unknown>;
  return normalizeMoneyEffects(source.moneyEffects ?? source.money_effects);
}

/** The action moves nothing: no pack and no saved sheet is touched. */
export function effectsEmpty(effects: MoneyEffects | null | undefined): boolean {
  return !effects || (effects.students.length === 0 && effects.payroll.length === 0);
}

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
export const EFFECTS_LOADING_TEXT = "Считаем, что изменится с деньгами…";
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
  /** `warn`: a closed month - the action will be refused until it is reopened. */
  tone: "plain" | "warn";
}

/** «+50 000 сум» / «−50 000 сум» (a real minus sign). */
function signedSum(delta: number): string {
  return `${delta < 0 ? "−" : "+"}${formatMoney(Math.abs(delta))}`;
}

/**
 * The sentences of money of an action (one per pack, one for the sheets, one per sheet the owner's sum is known for).
 *  - the packs: «Иванов Иван: занятие вернётся в пакет»;
 *  - the saved sheets before the action: «Изменится ведомость: Каримова К., октябрь 2026» / «Изменятся ведомости: …» (everybody else: «Изменится ведомость: октябрь 2026»);
 *  - after the action, the OWNER with the sum: «Ведомость Каримова К., октябрь 2026: +50 000 сум к сохранённой — пересохраните её» (the pay of the teachers is his);
 *  - a month a saved sheet has closed, BEFORE the action: «Месяц закрыт: Каримова К., октябрь 2026. Сначала переоткройте его» (warn) - the action would be refused.
 * `done`: the toast after the action (past tense).
 */
export function effectLines(effects: MoneyEffects | null | undefined, options: { done?: boolean } = {}): EffectLine[] {
  if (!effects) return [];
  const done = options.done === true;
  const lines: EffectLine[] = effects.students.map((student) => ({ key: `student:${student.studentId}`, text: studentEffectText(student, done), tone: "plain" }));
  const label = (line: MoneyPayrollEffect) => (line.teacherName || line.sheetId ? payrollLineLabel(line) : monthInSentence(line.month));
  const closed = done ? [] : effects.payroll.filter((line) => line.state === "closed");
  const rest = effects.payroll.filter((line) => !closed.includes(line));
  const summed = done ? rest.filter((line) => line.changedBy) : [];
  const plain = rest.filter((line) => !summed.includes(line));
  if (plain.length > 0) {
    const many = plain.length > 1;
    const head = done ? (many ? "Изменились ведомости" : "Изменилась ведомость") : (many ? "Изменятся ведомости" : "Изменится ведомость");
    lines.push({ key: "payroll", text: `${head}: ${plain.map(label).join("; ")}`, tone: "plain" });
  }
  for (const line of summed) {
    lines.push({ key: `payroll:${line.month}:${line.teacherId ?? ""}`, text: `Ведомость ${label(line)}: ${signedSum(line.changedBy as number)} к сохранённой — пересохраните её`, tone: "plain" });
  }
  for (const line of closed) {
    lines.push({ key: `closed:${line.month}:${line.teacherId ?? ""}`, text: `Месяц закрыт: ${label(line)}. Сначала переоткройте его`, tone: "warn" });
  }
  if (lines.length === 0 && effects.text) lines.push({ key: "text", text: effects.text, tone: "plain" });
  return lines;
}

/** The toast of a done action that may have moved money: amber when a pack or a saved sheet was touched, with the lines under the text. `details`: the lines that were there already. */
export function toastWithEffects(answer: unknown, details: string[] = []): { tone: "success" | "warning"; details: string[] } {
  const lines = effectLines(moneyEffectsOf(answer), { done: true }).map((line) => line.text);
  return { tone: lines.length > 0 ? "warning" : "success", details: [...details, ...lines] };
}
