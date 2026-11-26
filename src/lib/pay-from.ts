/**
 * «Деньги-1 / Б», Б1 - «Оплата с»: the day a student added to a group is charged from.  The default is the first lesson of the group from today (`GET /org/groups/{id}/pay-from-default`);
 * a chosen day is MONEY (the owner or an administrator with access to money; the server refuses it to everybody else with 403, and the field is not drawn for them at all - not blocked, absent).
 * The sentences about the day are the server's (`billing.text` of the answer of adding, `PAY_FROM_RANGE` / `PAY_FROM_NOT_APPLICABLE`, `billing.immediate.text` of the dry run); this file arranges them.
 * Pure: no React, no network.  Contract: `MONEY1_B_SERVER_REPORT.md`, Б1.
 */
import { addIsoDays, formatDateRu, formatDayMonthRu } from "./business-time";
import { formatMoney, tidyMoneyText } from "./money-format";
import { pluralRu } from "./plural";

const isIsoDateString = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The day of the field never goes further into the future than the server allows. */
export const PAY_FROM_MAX_AHEAD_DAYS = 62;
/** The oldest day when the centre has not said when its accounting starts (the server's own floor is the start of the accounting). */
export const PAY_FROM_FLOOR = "2020-01-01";

export interface PayFromDefault {
  today: string;
  first_lesson: string | null;
  default_pay_from: string;
  /** The server's one sentence: «Оплата с 09.11.2026 — ближайшее занятие группы» / «… — сегодня у группы занятие» (null from an older server). */
  text: string | null;
}

export function normalizePayFromDefault(raw: unknown): PayFromDefault | null {
  const r = (raw ?? {}) as Partial<PayFromDefault>;
  if (!isIsoDateString(r.default_pay_from) || !isIsoDateString(r.today)) return null;
  return { today: r.today, first_lesson: isIsoDateString(r.first_lesson) ? r.first_lesson : null, default_pay_from: r.default_pay_from, text: typeof r.text === "string" && r.text.trim() ? r.text.trim() : null };
}

/** What the answer of adding says about the charge (`billing` of the single route; null for a transfer). */
export interface BillingBrief {
  pay_from: string;
  explicit: boolean;
  default_pay_from: string;
  first_lesson: string | null;
  text: string;
  /** The dry run only, and only for a caller with access to money: what is charged AT ONCE. */
  /** `lines`: the sentences of the server by name - «К оплате до 24.11: 231 000 сум (за 5 уроков)» / «Долг сразу: … · срок был 03.11», two lines when the student has a debt AND a sum in term. */
  immediate: { amount: number; lessons: number; text: string; lines: string[]; parts: ImmediatePart[] } | null;
}

/** One month (or a part of it) of what is charged at once: «Октябрь, с 27.10 — 89 000 сум · 2 урока из 9» (`from` "": the server sent none - «Ноябрь — 187 000 сум · 5 уроков из 12»).  The server adds `parts` to `immediate`; an older server sends none (the sentence alone is shown). */
export interface ImmediatePart {
  label: string;
  from: string;
  amount: number;
  lessons: number;
  lessons_in_period: number;
  whole: boolean;
}

export function normalizeParts(raw: unknown): ImmediatePart[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const p = (item ?? {}) as Partial<ImmediatePart>;
    if (typeof p.label !== "string" || !p.label) return [];
    return [{ label: p.label, from: isIsoDateString(p.from) ? p.from : "", amount: Math.round(Number(p.amount) || 0), lessons: Math.round(Number(p.lessons) || 0), lessons_in_period: Math.round(Number(p.lessons_in_period) || 0), whole: Boolean(p.whole) }];
  });
}

/** The rows of the break-down block under the sum of the bar: the caption on the left («Октябрь, с 27.10 · 2 урока из 9», «Ноябрь, весь месяц»), the sum on the right. */
export function immediatePartRows(parts: ImmediatePart[]): Array<{ label: string; amount: string }> {
  return parts.map((part) => ({
    label: part.whole ? `${capital(part.label)}, ${wholeWord(part)}` : `${capital(part.label)}${part.from ? `, с ${formatDayMonthRu(part.from)}` : ""}${lessonsUnknown(part) ? "" : ` · ${lessonsOf(part)}`}`,
    amount: formatMoney(part.amount),
  }));
}

/** The lines of the break-down: «Ноябрь, весь месяц — 400 000 сум» for a whole month, «Октябрь, с 27.10 — 89 000 сум · 2 урока из 9» for a part. */
/** «5 уроков из 12». */
/** A part with a sum but with 0 lessons (a return in the same period: the server does not know the number) says no number of lessons. */
export const lessonsUnknown = (part: ImmediatePart): boolean => part.amount > 0 && part.lessons === 0;

const lessonsOf = (part: ImmediatePart): string => `${part.lessons} ${pluralRu(part.lessons, ["урок", "урока", "уроков"])} из ${part.lessons_in_period}`;

/** «весь месяц» for a calendar month («Ноябрь»); a whole period given by DATES («19.11–18.12») is «весь период». */
const wholeWord = (part: ImmediatePart): string => (/\d/.test(part.label) ? "весь период" : "весь месяц");

/** The server sends the month in lower case («ноябрь»); a caption of a row starts with a capital. */
const capital = (text: string): string => text.charAt(0).toLocaleUpperCase("ru") + text.slice(1);

export function immediatePartLines(parts: ImmediatePart[]): string[] {
  return parts.map((part) => {
    const sum = formatMoney(part.amount);
    if (part.whole) return `${capital(part.label)}, ${wholeWord(part)} — ${sum}`;
    // a part with no day (`from: null`: the earlier charge was taken off the month) has no «с …» - the lessons say how much of the month it is
    return `${capital(part.label)}${part.from ? `, с ${formatDayMonthRu(part.from)}` : ""} — ${sum}${lessonsUnknown(part) ? "" : ` · ${lessonsOf(part)}`}`;
  });
}

/** The lines of the server's sentence (`lines`; an answer without them - the lines of `text`), tidy, none empty. */
function serverLines(lines: unknown, text: string): string[] {
  const list = Array.isArray(lines) ? lines.filter((line): line is string => typeof line === "string") : text.split("\n");
  return list.map((line) => tidyMoneyText(line).trim()).filter(Boolean);
}

export function normalizeBilling(raw: unknown): BillingBrief | null {
  const r = (raw ?? null) as (Partial<BillingBrief> & { immediate?: Partial<NonNullable<BillingBrief["immediate"]>> | null }) | null;
  if (!r || !isIsoDateString(r.pay_from)) return null;
  const now = r.immediate;
  return {
    pay_from: r.pay_from,
    explicit: Boolean(r.explicit),
    default_pay_from: isIsoDateString(r.default_pay_from) ? r.default_pay_from : r.pay_from,
    first_lesson: isIsoDateString(r.first_lesson) ? r.first_lesson : null,
    text: tidyMoneyText(String(r.text ?? "")),
    immediate: now && typeof now.text === "string" && now.text ? { amount: Math.round(Number(now.amount) || 0), lessons: Math.round(Number(now.lessons) || 0), text: tidyMoneyText(now.text), lines: serverLines((now as { lines?: unknown }).lines, now.text), parts: normalizeParts((now as { parts?: unknown }).parts) } : null,
  };
}

/** The range of the field: from the start of the accounting of the centre to 62 days ahead (the server checks it too: 422 `PAY_FROM_RANGE`). */
export function payFromRange(today: string, accountingStart: string | null | undefined): { min: string; max: string } {
  return { min: isIsoDateString(accountingStart) ? accountingStart : PAY_FROM_FLOOR, max: addIsoDays(today, PAY_FROM_MAX_AHEAD_DAYS) };
}

/**
 * The day that goes to the server: only a day the person CHANGED (the default is not sent - the server stores nothing then and says «с первого занятия группы»); "" while the field is empty or not a date.
 * Nothing for a role without access to money, whatever its state is.
 */
export function payFromRequest(value: string, def: PayFromDefault | null, moneyRight: boolean): string | null {
  if (!moneyRight || !def || !isIsoDateString(value) || value === def.default_pay_from) return null;
  return value;
}

/** A chosen day before today charges the days of the past AT ONCE: the dry run says how much (a single student). */
export function payFromIsPast(value: string, def: PayFromDefault | null): boolean {
  return Boolean(def) && isIsoDateString(value) && value < (def as PayFromDefault).today;
}

export const PAY_FROM_NOTHING_NOW = "Сразу платить не нужно";

/** What the dry run of a BULK add says about the charge at once: a line per student and the total - all of it the server's sentences (the money right only; otherwise nothing). */
export interface BulkImmediate {
  students: Array<{ studentId: string; text: string; amount: number; parts: ImmediatePart[] }>;
  /** EVERY chosen student in the order of the answer; `amount: null` - nothing to pay at once (the screen shows «—»).  The screen reads sums and periods from here, never from the sentences. */
  rows: Array<{ studentId: string; amount: number | null; parts: ImmediatePart[]; /** his own sentence of the server (his own term) */ lines: string[] }>;
  total: string | null;
  /** the sentence of the server for the whole batch (`immediate_total.lines`): «Всего к оплате до 24.11: …», the NEAREST term; empty on a single probe */
  totalLines: string[];
}

export function normalizeBulkImmediate(raw: unknown): BulkImmediate {
  const r = (raw ?? {}) as { students?: unknown; billing?: unknown; immediate_total?: { text?: unknown; lines?: unknown } | null };
  // the dry run of ONE add (`billing` at the top) and of a bulk one (`students[].billing`) read the same way
  const list = Array.isArray(r.students) ? r.students : r.billing ? [{ student_id: "", billing: r.billing }] : [];
  const students = list.flatMap((item) => {
    const entry = item as { student_id?: unknown; billing?: unknown };
    const now = normalizeBilling(entry.billing)?.immediate;
    return now?.text ? [{ studentId: String(entry.student_id ?? ""), text: now.text, amount: now.amount, parts: now.parts }] : [];
  });
  const rows = list.map((item) => {
    const entry = item as { student_id?: unknown; billing?: unknown };
    const now = normalizeBilling(entry.billing)?.immediate;
    return { studentId: String(entry.student_id ?? ""), amount: now?.text ? now.amount : null, parts: now?.text ? now.parts : [], lines: now?.text ? now.lines : [] };
  });
  const total = typeof r.immediate_total?.text === "string" && r.immediate_total.text ? tidyMoneyText(r.immediate_total.text) : null;
  const totalLines = typeof r.immediate_total?.text === "string" && r.immediate_total.text ? serverLines(r.immediate_total.lines, r.immediate_total.text) : [];
  return { students, rows, total, totalLines };
}

/**
 * The day the charge starts, from the answer of a dry run (`students[].billing.pay_from`, or `billing.pay_from` of a single add): the server's own day.  Several students with DIFFERENT days (somebody comes back
 * as he was) - null: the screen does not pick one for the server.
 */
export function payStartOf(answer: unknown): string | null {
  const r = (answer ?? {}) as { students?: unknown; billing?: unknown };
  const list = Array.isArray(r.students) ? r.students.map((item) => (item as { billing?: unknown } | null)?.billing) : [r.billing];
  const days = Array.from(new Set(list.flatMap((billing) => { const day = normalizeBilling(billing)?.pay_from; return day ? [day] : []; })));
  return days.length === 1 ? days[0] : null;
}

/**
 * The sentence of the server about the day the charge starts, from the dry run of adding ONE student (`billing.text`): the sentence of a return that stays in its period /
 * «Оплата считается с 24.11.2026 — с первого занятия группы».  A bulk answer (`students[]`) has no single sentence: null.  The screen shows it as it came.
 */
export function payStartSentenceOf(answer: unknown): string | null {
  const r = (answer ?? {}) as { students?: unknown; billing?: unknown };
  return Array.isArray(r.students) ? null : normalizeBilling(r.billing)?.text || null;
}

/**
 * The sentences of the server about a RETURN in the period that is already in the account, per student of a bulk dry run (`students[].billing.text` that is not the sentence about the day «Оплата считается с …»:
 * «Возврат в том же периоде: ноябрь уже в счёте и заново не считается.»).  The student has his own sentence; one who is added for the first time has none.  The screen shows it as it came.
 */
export function returnSentencesOfBulk(answer: unknown): Map<string, string> {
  const list = (answer as { students?: unknown } | null | undefined)?.students;
  const out = new Map<string, string>();
  if (!Array.isArray(list)) return out;
  list.forEach((item) => {
    const id = (item as { student_id?: unknown } | null)?.student_id;
    const text = normalizeBilling((item as { billing?: unknown } | null)?.billing)?.text || "";
    if (typeof id === "string" && text && !/^Оплата\s/.test(text)) out.set(id, text);
  });
  return out;
}

/** The field cannot be sent: an empty or impossible date. */
export function payFromProblem(value: string, def: PayFromDefault | null, range: { min: string; max: string }): string | null {
  if (!def) return null;
  if (!isIsoDateString(value)) return "Укажите дату «Оплата с»";
  if (value < range.min || value > range.max) return `«Оплата с» — от ${formatDateRu(range.min)} до ${formatDateRu(range.max)}`;
  return null;
}

export const PAY_FROM_RANGE_TEXT = "«Оплата с» — не раньше начала учёта центра и не позже чем через 62 дня от сегодня";
export const PAY_FROM_NOT_APPLICABLE_TEXT = "«Оплата с» задаётся только при добавлении ученика в группу: при переводе оплата идёт со следующего дня";

/**
 * The refusals of «Оплата с» in words: the server's own sentence when it sent one (it names the real dates of the centre), else ours.  `null`: not a refusal of this field.
 */
export function payFromErrorText(failure: { code: string | null; message: string }): string | null {
  if (failure.code === "PAY_FROM_RANGE") return tidyMoneyText(failure.message) || PAY_FROM_RANGE_TEXT;
  if (failure.code === "PAY_FROM_NOT_APPLICABLE") return tidyMoneyText(failure.message) || PAY_FROM_NOT_APPLICABLE_TEXT;
  return null;
}
