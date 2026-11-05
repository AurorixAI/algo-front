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
import { pluralRu } from "./plural";
import { formatBusinessDate } from "./business-time";
import { monthTitle } from "./payroll";
import { MONTHS_NOMINATIVE } from "./ru-calendar";

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
  /** The line itself; for the pay of the teachers - its heading («Зарплата за сентябрь вырастет:»). */
  text: string;
  /** Under the heading: one line per teacher («Эргашев К. — +133 333 сум (было 860 000, станет 993 333)»). */
  items?: string[];
  /** After them: what the person has to do («Сентябрь уже закрыт: … пересохраните их, чтобы выплатить разницу»).  Only when something has to be done. */
  note?: string;
  /** `warn`: needs an action - a month the sheet has closed that must be saved again, numbers that could not be worked out.  Everything else is information. */
  tone: "plain" | "warn";
}

/** Every line of the lines as plain texts (a toast, a question): the heading, its items, its note. */
export function effectLineTexts(lines: ReadonlyArray<EffectLine>): string[] {
  return lines.flatMap((line) => [line.text, ...(line.items ?? []), ...(line.note ? [line.note] : [])]);
}

const signedSum = formatSignedMoney;

/** «475 000 сум» for a sum in a line. */
const sum = (value: number): string => formatMoney(value);
/** «860 000» - the sum without the word «сум» (inside a bracket that already follows «+133 333 сум»). */
const bare = (value: number): string => formatMoney(value).replace(/[\s\u00a0]*сум$/, "");

const monthName = (month: string, today: string, capitalized = false): string => {
  const [year, number] = month.split("-");
  const name = MONTHS_NOMINATIVE[Number(number) - 1] ?? month;
  const text = year && year !== today.slice(0, 4) ? `${name} ${year}` : name;
  return capitalized ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : text;
};

/**
 * The pay of the teachers, ONE form for the window and the toast, grouped by the month (UX round of the owner, 05.11):
 *   Зарплата за сентябрь вырастет:
 *     Эргашев К. — +133 333 сум (было 860 000, станет 993 333)
 *     Мирзаева Л. — +13 333 сум (было 36 666, станет 49 999)
 *   Сентябрь уже закрыт: после сохранения в ведомостях появится «изменилась на …» — пересохраните их, чтобы выплатить разницу.
 * The verb follows the sign (вырастет / уменьшится / изменится; after the action выросла / уменьшилась / изменилась).  The last sentence only for a CLOSED month (the sheet has to be saved
 * again for the difference to be paid out) - a month that is open has none; a sheet that is as saved again after the action says so and asks nothing.  An administrator with the right gets
 * no names and no sums (LESSONS 45): «Изменится зарплата за сентябрь — 2 преподавателя.» and, for a closed month, that the owner saves the sheets again.
 */
function payrollGroups(payroll: ReadonlyArray<MoneyPayrollEffect>, done: boolean, today: string): EffectLine[] {
  const months = [...new Set(payroll.map((line) => line.month))].sort();
  const out: EffectLine[] = [];
  for (const month of months) {
    const lines = payroll.filter((line) => line.month === month);
    // an action that did not move a sheet has no news about it (in the preview too: nothing to say)
    const moved = lines.filter((line) => line.changedBy !== 0);
    if (moved.length === 0) continue;
    const m = monthName(month, today);
    const owner = moved.some((line) => line.teacherName || line.sheetId);
    const counted = moved.filter((line) => line.changedBy !== null);
    const closed = moved.filter((line) => line.state === "closed" && !(done && line.driftAfter === 0));
    const count = closed.length;
    const them = count > 1 ? "их" : "её";
    const sheets = count > 1 ? "ведомостях" : "ведомости";
    let note: string | undefined;
    if (count > 0) {
      note = owner
        ? `${monthName(month, today, true)} ${done ? "закрыт" : "уже закрыт"}: ${done ? "в" : "после сохранения в"} ${sheets} ${done ? "появилось" : "появится"} «изменилась на …» — пересохраните ${them}, чтобы выплатить разницу.`
        : `${monthName(month, today, true)} уже закрыт: после сохранения в ${sheets} появится «изменилась на …» — владельцу нужно пересохранить ${them}.`;
    }
    const tone: EffectLine["tone"] = count > 0 ? "warn" : "plain";
    const key = `payroll:${month}`;
    if (!owner) {
      const n = moved.length;
      out.push({ key, text: `${done ? "Изменилась" : "Изменится"} зарплата за ${m} — ${n} ${pluralRu(n, ["преподаватель", "преподавателя", "преподавателей"])}.`, note, tone });
      continue;
    }
    if (counted.length === 0) {
      const names = moved.map((line) => line.teacherName || "преподаватель");
      const who = names.join(", ");
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
    out.push({ key, text: `Зарплата за ${m} ${verb}:`, items, note, tone });
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
export function effectLines(effects: MoneyEffects | null | undefined, options: { done?: boolean; today?: string } = {}): EffectLine[] {
  if (!effects) return [];
  const done = options.done === true;
  const lines: EffectLine[] = effects.students.map((student) => ({ key: `student:${student.studentId}`, text: studentEffectText(student, done), tone: "plain" }));
  lines.push(...payrollGroups(effects.payroll, done, options.today ?? formatBusinessDate()));
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
