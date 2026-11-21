/**
 * PAY-TAILS (package Б, screens part 2): THE one place where the screens read what the server's contract Б1.3-Б1.5 + Б5.1-Б5.5 adds - the block «что было → что станет» of a leaving / archiving / transfer (`recalc`, `others`),
 * the forecast of the charge that has not begun (`upcoming`, `forecast`), the words of a state (`state`: `starts` / `settled` / `no_charges`, `covered_by`, `tab_text`, `tab_sub`, `state_sub`) and the line of a receipt
 * (`receipt_state_text`).  Pure (no React): node:test loads it.  While the server does not send a field the reader returns «nothing» and the screen says nothing (LESSONS 151); when it does, only THIS file reads it -
 * the table «field → where it is read» of the report is the list of the exports below.  The screen counts no sum and makes up no sentence about money: every line is the server's.
 *
 * Contract: artifacts/analysis/PAY_TAILS_SPEC.md (Б1.3-Б1.5; Б5 wins over Б1).  The stub of the server: tests/helpers/paytails-fixture.cjs.
 */
import { pluralRu } from "./plural";

const clean = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const whole = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

// ── Б1.3 / Б5.1: «что было → что станет» ─────────────────────────────────────

/** One line of the block: the server's sentence («Ноябрь: 600 000 → 415 000 сум», «Декабрь не начнётся: 300 000 сум останутся авансом», «Прощено: 600 000 → 415 000 сум») and, grey under it, the basis («пересчёт по день ухода · 9 уроков из 13»). */
export interface RecalcLine {
  text: string;
  basisText: string | null;
  /** The line of the forgiveness that falls with the periods («Прощено: 600 000 → 415 000 сум», `label` «Прощено»): it stands AFTER «и ещё N периодов». */
  isForgiven: boolean;
}
export interface RecalcBlock {
  lines: RecalcLine[];
  /** «и ещё N периодов»: the server cut the periods at two lines. */
  more: number;
}

/**
 * `recalc` of a probe or a result of a leaving, an archiving of a student and a transfer (one membership of the preview, the whole answer of a transfer): ALWAYS the object `{lines, more}` (`more` 0 - everything is shown).
 * A line without its `text` is dropped (the server said nothing - nothing is drawn).  null when there is nothing to draw: no change of the charge - no block.
 */
export function recalcOf(source: unknown): RecalcBlock | null {
  const raw = record(record(source)?.recalc);
  const rawLines = Array.isArray(raw?.lines) ? (raw?.lines as unknown[]) : [];
  const lines = rawLines.flatMap((item): RecalcLine[] => {
    const entry = record(item);
    const text = clean(entry?.text);
    return text ? [{ text, basisText: clean(entry?.basis_text), isForgiven: clean(entry?.label) === "Прощено" }] : [];
  });
  const more = Math.max(0, whole(raw?.more) ?? 0);
  return lines.length > 0 ? { lines, more } : null;
}

/** «и ещё 2 периода» - the tail of the cut list (only a count, no money in it). */
export const recalcMoreText = (more: number): string => `и ещё ${more} ${pluralRu(more, ["период", "периода", "периодов"])}`;

/**
 * `others` (Б1.3, Б5.2): what the closing does to ANOTHER membership of the student - the server's sentences with the money in them («В группе «Английский 7»: 200 000 → 160 000 сум — сегодняшний урок оплачен в «Математике 7»»,
 * «Начисление в «Б» начнётся с 23.11»): ALWAYS a list of strings (empty - nothing to say).
 */
export function othersOf(source: unknown): string[] {
  const raw = record(source)?.others;
  return (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const text = clean(item);
    return text ? [text] : [];
  });
}

/** The sentences of a done action (the message after): the lines of `recalc` (past tense - the server's), then `others`.  Nothing to say - empty. */
export function resultMoneyLines(answer: unknown): string[] {
  const block = recalcOf(answer);
  const periods = block?.lines.filter((line) => !line.isForgiven).map((line) => line.text) ?? [];
  const forgiven = block?.lines.filter((line) => line.isForgiven).map((line) => line.text) ?? [];
  return [...periods, ...(block && block.more > 0 ? [recalcMoreText(block.more)] : []), ...forgiven, ...othersOf(answer)];
}

// ── Б1.4 / Б5.3: the charge that has not begun ───────────────────────────────

export interface Upcoming {
  /** The first day of the charge, `YYYY-MM-DD`. */
  from: string;
  /** The forecast sum (never a part of any total); null for a role without the right to money - it gets the date only. */
  amount: number | null;
  /** «2 урока из 8 в ноябре». */
  lessonsText: string | null;
  /** The last day to pay within the term; null: «долг с первого дня» (the sub-line says it) or the role sees no sums. */
  dueUntil: string | null;
  /** The sentence of the message after adding («Начисление с 24.11: 120 000 сум»). */
  text: string | null;
  sub: string | null;
  /** The muted line of the conditions when the day was moved by another group («сегодня ученик ещё числился в «Математике 7»»): the name of this field is not fixed by Б1.4 - read as `terms_note`. */
  termsNote: string | null;
}

/** `upcoming` of a row of a status list, of a probe of adding, of a student of a bulk probe: `{from, amount, lessons_text, due_until, text, sub}`.  No `from` - nothing starts later: null. */
export function upcomingOf(source: unknown): Upcoming | null {
  const entry = record(source);
  const raw = record(entry?.upcoming) ?? record(record(entry?.billing)?.upcoming);
  const from = clean(raw?.from);
  if (!raw || !from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return { from, amount: whole(raw.amount), lessonsText: clean(raw.lessons_text), dueUntil: clean(raw.due_until), text: clean(raw.text), sub: clean(raw.sub), termsNote: clean(raw.terms_note) };
}

/** The total of a batch (`upcoming_total`): the same shape; the server adds, the screen does not. */
export function upcomingTotalOf(answer: unknown): Upcoming | null {
  const raw = record(record(answer)?.upcoming_total);
  return raw ? upcomingOf({ upcoming: raw }) : null;
}

/** The forecast row of a statement (`forecast`): a grey row in the month - the date, the title, the sub-line («прогноз: начислится 120 000 сум»); in no total. */
export interface StatementForecast {
  date: string;
  title: string;
  sub: string | null;
}
export function forecastOf(statement: unknown): StatementForecast | null {
  const raw = record(record(statement)?.forecast);
  const date = clean(raw?.date);
  const title = clean(raw?.title);
  return raw && date && title ? { date, title, sub: clean(raw.sub) } : null;
}

// ── Б1.5 / Б5.4: the words of a state ────────────────────────────────────────

/** The new values of `state` (Б5.4): the charge has not begun / the closed membership is settled / nothing was ever charged.  The old ones stay in `pay-state.ts`. */
export type NewState = "starts" | "settled" | "no_charges";
export const isNewState = (state: unknown): state is NewState => state === "starts" || state === "settled" || state === "no_charges";

/** What covered the last paid period (`covered_by`, Б5.4): money / the forgiveness / the recalculation / the opening balance. */
export type CoveredBy = "money" | "forgiven" | "recalc" | "opening";
export function coveredByOf(source: unknown): CoveredBy | null {
  const value = record(source)?.covered_by;
  return value === "money" || value === "forgiven" || value === "recalc" || value === "opening" ? value : null;
}

/** «Прощено до» and «Оплата не нужна до» are not money: a quiet grey label, not the green of «Оплачено до». */
export const isNotMoneyCover = (source: unknown): boolean => {
  const covered = coveredByOf(source);
  return covered === "forgiven" || covered === "recalc";
};

/** The words of a row on the tab «Аванс» (Б5.5): `tab_text` / `tab_sub` (the words of the tab); every other tab reads `state_text` / `state_sub`. */
export function tabWordsOf(row: unknown): { text: string | null; sub: string | null } {
  const entry = record(row);
  return { text: clean(entry?.tab_text), sub: clean(entry?.tab_sub) };
}

/** `receipt_state_text` of a receipt (Б1.5): «оплачено до 30.11» / «оплачено 100 000 из 420 000 сум · к оплате 320 000 сум до 23.11» / nothing (a closed membership, a forgiven period). */
export function receiptStateTextOf(receipt: unknown): string | null {
  return clean(record(receipt)?.receipt_state_text);
}

/** The bottom bar of a window of adding (Б1.4, frames 10 and 14): «Начисление с 24 ноября» / the forecast sum / «2 урока из 8 в ноябре · платить до 28.11». */
export interface ForecastBar {
  /** The first day of the charge (the earliest of the students). */
  from: string;
  /** The sum of the server (`amount` of one student, `upcoming_total.amount` of a batch); null - none (a role without the right, a batch the server did not add up). */
  amount: number | null;
  lessonsText: string | null;
  dueUntil: string | null;
  sub: string | null;
  termsNote: string | null;
}

/**
 * What the bar of the window says about the students whose charge starts LATER: one student - his `upcoming`; several - `upcoming_total` of the server (the screen does not add the forecasts up; without it there is no sum).
 * Nobody has an `upcoming` - null.
 */
export function forecastBarOf(entries: ReadonlyArray<Upcoming | null>, total: Upcoming | null): ForecastBar | null {
  const list = entries.filter((entry): entry is Upcoming => entry !== null);
  if (list.length === 0) return null;
  const base = list.length === 1 ? list[0] : total;
  const from = [...list.map((entry) => entry.from), ...(total ? [total.from] : [])].sort()[0];
  return {
    from,
    amount: base?.amount ?? null,
    lessonsText: base?.lessonsText ?? null,
    dueUntil: base?.dueUntil ?? null,
    sub: base?.sub ?? null,
    termsNote: list.length === 1 ? list[0].termsNote : null,
  };
}

/** The `upcoming` of every student of an answer: a bulk answer (`students[]`) or a single one (the answer itself); a student with none gives null. */
export function upcomingEntriesOf(answer: unknown): Array<Upcoming | null> {
  const students = record(answer)?.students;
  return Array.isArray(students) ? students.map((student) => upcomingOf(student)) : [upcomingOf(answer)];
}

/** The sentence of the message after adding (Б1.4: «Начисление с 24.11: 120 000 сум»): the server's `upcoming_total.text` of a batch, else the `upcoming.text` of the only student; none - nothing is said. */
export function upcomingMessageOf(answer: unknown): string | null {
  const total = upcomingTotalOf(answer)?.text;
  if (total) return total;
  const entries = upcomingEntriesOf(answer).filter((entry): entry is Upcoming => entry !== null);
  return entries.length === 1 ? entries[0].text : null;
}

/** What a done BULK move / add did to the charge of each student (`students[].recalc` / `.others`): the server's sentences, the name in front when there are several students. */
export function bulkMoneyLines(answer: unknown, nameOf: (studentId: string) => string): string[] {
  const students = record(answer)?.students;
  if (!Array.isArray(students)) return resultMoneyLines(answer);
  const several = students.length > 1;
  return students.flatMap((student) => {
    const lines = resultMoneyLines(student);
    const id = clean(record(student)?.student_id);
    return several && id ? lines.map((line) => `${nameOf(id)}: ${line}`) : lines;
  });
}
