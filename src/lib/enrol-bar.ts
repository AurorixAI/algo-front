/**
 * The bottom bar of the windows «Зачислить …» (frames of the owner's mock-up): one big sum, one line that explains it, the name of the button.  Everything here is arranged from the FIELDS of the
 * server's answer (the sum, `lessons`, `lessons_in_period`, the period label of `billing.immediate.parts`) - never from its sentences, and no rule of money is decided here (LESSONS 143).  Pure.
 */
import { formatMoney } from "./money-format";
import { pluralRu } from "./plural";
import { groupNameShown } from "./enrol-labels";
import { formatDayMonthRu } from "./business-time";
import { dayMonthWords } from "./enrol-terms";
import type { ForecastBar } from "./paytails-contract";
import type { ImmediatePart } from "./pay-from";

/** The server names the month in the nominative («ноябрь»); a sentence about lessons wants «в ноябре». */
const MONTH_IN: Record<string, string> = {
  январь: "январе", февраль: "феврале", март: "марте", апрель: "апреле", май: "мае", июнь: "июне",
  июль: "июле", август: "августе", сентябрь: "сентябре", октябрь: "октябре", ноябрь: "ноябре", декабрь: "декабре",
};

const lower = (text: string) => text.trim().toLocaleLowerCase("ru");

/** «в ноябре» for a calendar month; a period given by dates («19.11–18.12») is «за период 19.11–18.12». */
export function periodIn(label: string): string {
  const prepositional = MONTH_IN[lower(label)];
  return prepositional ? `в ${prepositional}` : `за период ${label.trim()}`;
}

/**
 * «5 уроков из 12 в ноябре».  A period given by DATES that is charged whole (the server sends `whole` and no count of the lessons of the period) is «13 уроков · весь период 20.11–19.12» - never «из 0» (Money-2 fix 11, F4).
 * A calendar month keeps «из N в ноябре» (the month has its full number of lessons).
 */
export function lessonsLine(part: ImmediatePart): string {
  const lessons = `${part.lessons} ${pluralRu(part.lessons, ["урок", "урока", "уроков"])}`;
  if (/\d/.test(part.label) && (part.whole || !part.lessons_in_period)) return `${lessons} · весь период ${part.label.trim()}`;
  if (!part.lessons_in_period) return `${lessons} ${periodIn(part.label)}`;
  return `${lessons} из ${part.lessons_in_period} ${periodIn(part.label)}`;
}

/** «за октябрь и ноябрь» / «за октябрь, ноябрь и декабрь» from the period labels in the order the server gave them. */
export function periodsOf(labels: readonly string[]): string {
  const unique = labels.map((label) => label.trim()).filter((label, index, all) => label && all.indexOf(label) === index);
  if (unique.length === 0) return "";
  const named = unique.map((label) => (MONTH_IN[lower(label)] ? lower(label) : label));
  const head = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} и ${named[named.length - 1]}`;
  return `за ${head}`;
}

const COUNT_ACCUSATIVE: Record<number, string> = { 2: "двоих", 3: "троих", 4: "четверых" };
const COUNT_DATIVE: Record<number, string> = { 2: "двоим", 3: "троим", 4: "четверым" };

/** «Зачислить» / «Зачислить двоих / троих / четверых» / «Зачислить 8»; a transfer says «Перевести …» by the same rule. */
export function enrolButtonLabel(count: number, verb: "enrol" | "transfer" = "enrol"): string {
  const word = verb === "transfer" ? "Перевести" : "Зачислить";
  if (count <= 1) return word;
  return `${word} ${COUNT_ACCUSATIVE[count] ?? count}`;
}

/** The button of the window of a student's card: «Зачислить в «Физика 7»» / «Перевести в «Физика 7»». */
export function enrolIntoLabel(groupName: string, verb: "enrol" | "transfer" = "enrol"): string {
  return `${verb === "transfer" ? "Перевести" : "Зачислить"} в «${groupNameShown(groupName)}»`;
}

export interface EnrolBarRow {
  id: string;
  name: string;
  /** null - nothing to pay at once (or not known) */
  amount: number | null;
  parts: ImmediatePart[];
  /** the sentence of the server about THIS student by name («К оплате до 24.11: 231 000 сум (за 5 уроков)»); empty - the server said none */
  lines?: readonly string[];
}

export interface EnrolBar {
  /** the total at once; null when nobody pays now */
  total: number | null;
  /** «564 000» and the unit «сум» apart - the bar draws the number big and the unit small */
  totalText: string;
  unit: string;
  /** the one line under the sum; null when there is nothing to say */
  line: string | null;
  /** differing sums / several periods: the line is short and the list «По ученикам» opens the details */
  expandable: boolean;
  /** the words of the server over the sum, the sum itself cut out of them («К оплате до 24.11», «Долг сразу · срок был 03.11», two lines for a debt and a sum in term); empty - the server said none and the bar names nothing (LESSONS 151) */
  captions: string[];
  /** the sentences of the server as they are (with the sum), for the message after the action */
  words: string[];
}

/** «К оплате до 24.11: 231 000 сум (за 5 уроков)» → «К оплате до 24.11»; «Долг сразу: 300 000 сум · срок был 03.11» → «Долг сразу · срок был 03.11».  The sum stands big under the words, the lessons are the line under it;
 * a sentence of another shape (two lines of a debt and a sum in term: «Долг 100 000 сум · срок был 03.11») stays whole - the server's words are never rewritten, only the sum that is drawn apart is not said twice. */
const SENTENCE = /^(.+?): [\d\s]+\s?сум(?: \(за [^)]*\))?(.*)$/;
export function captionOf(line: string): string {
  const match = SENTENCE.exec(line.trim());
  return match ? `${match[1]}${match[2]}` : line.trim();
}

/** The same term on every row: «К оплате до 24.11» once; different terms: each student's own is shown in the list «По ученикам». */
export function captionsDiffer(rows: readonly EnrolBarRow[]): boolean {
  const own = rows.filter((row) => row.amount !== null).map((row) => (row.lines ?? []).map(captionOf).join(" · "));
  return own.some((caption) => caption !== own[0]);
}

const sameParts = (a: ImmediatePart[], b: ImmediatePart[]) => a.length === b.length && a.every((part, i) => `${part.label}|${part.from}|${part.amount}|${part.lessons}|${part.lessons_in_period}|${part.whole}` === `${b[i].label}|${b[i].from}|${b[i].amount}|${b[i].lessons}|${b[i].lessons_in_period}|${b[i].whole}`);

const splitMoney = (value: number): { text: string; unit: string } => {
  const full = formatMoney(value);
  const cut = full.lastIndexOf(" ");
  return { text: full.slice(0, cut), unit: full.slice(cut + 1) };
};

/**
 * What the bar says about the students who pay at once: the total and ONE line.  All pay the same - «по 188 000 · 5 уроков из 12 в ноябре»; one student - the lessons only; different sums or several
 * periods - «за октябрь и ноябрь» and the list «По ученикам»; only some of the chosen pay - «троим по 188 000 · …» (or the name when it is one).
 */
export function enrolBarOf(rows: readonly EnrolBarRow[], totalLines: readonly string[] = []): EnrolBar {
  const payers = rows.filter((row) => row.amount !== null);
  if (payers.length === 0) return { total: null, totalText: "", unit: "", line: null, expandable: false, captions: [], words: [] };
  const total = payers.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const shown = splitMoney(total);
  // one payer - his own sentence; several - the sentence of the batch (the NEAREST term), and when the server sent none the bar names nothing
  const words = payers.length === 1 ? [...(payers[0].lines ?? [])] : [...totalLines];
  const base = { total, totalText: shown.text, unit: shown.unit, captions: words.map(captionOf), words };
  const firstParts = payers[0].parts;
  const identical = payers.every((row) => row.amount === payers[0].amount && sameParts(row.parts, firstParts));
  const periodLine = firstParts.length === 1 ? lessonsLine(firstParts[0]) : null;
  if (payers.length === 1 && rows.length === 1) return { ...base, line: periodLine ?? (periodsOf(firstParts.map((part) => part.label)) || null), expandable: firstParts.length > 1 };
  if (identical && periodLine) {
    const each = splitMoney(payers[0].amount ?? 0);
    const everyone = payers.length === rows.length;
    const who = everyone ? "по" : payers.length === 1 ? `${payers[0].name} —` : `${COUNT_DATIVE[payers.length] ?? `${payers.length} ученикам`} по`;
    return { ...base, line: `${who} ${each.text} · ${periodLine}`, expandable: captionsDiffer(payers) };
  }
  // the periods in the order of the longest story (a student with two months says «октябрь, ноябрь»), a new one is added after them
  const labels = [...payers].sort((a, b) => b.parts.length - a.parts.length).flatMap((row) => row.parts.map((part) => part.label));
  return { ...base, line: periodsOf(labels) || null, expandable: payers.length > 1 || firstParts.length > 1 };
}

export interface ForecastBarWords {
  /** «Начисление с 24 ноября» (a date, not money). */
  caption: string;
  /** «120 000» and «сум» apart (the big sum of the bar); null: the server gave none - the caption stands where the sum would. */
  totalText: string | null;
  unit: string;
  /** «2 урока из 8 в ноябре · платить до 28.11»: the lessons and the term of the server (`lessons_text`, `due_until`); with no term - the server's `sub` («долг с первого дня»). */
  line: string | null;
}

/** PAY-TAILS Б2.5: the bar of a window of adding when the charge STARTS LATER - the words of the server's fields arranged; nothing is added up or made up here. */
export function forecastBarWords(forecast: ForecastBar, todayIso?: string | null): ForecastBarWords {
  const shown = forecast.amount !== null ? splitMoney(forecast.amount) : null;
  const term = forecast.dueUntil ? `платить до ${formatDayMonthRu(forecast.dueUntil)}` : forecast.sub;
  return {
    caption: `Начисление с ${dayMonthWords(forecast.from, todayIso)}`,
    totalText: shown?.text ?? null,
    unit: shown?.unit ?? "",
    line: [forecast.lessonsText, term].filter(Boolean).join(" · ") || null,
  };
}
