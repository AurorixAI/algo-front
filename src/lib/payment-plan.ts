// «Внести оплату»: the words of the dialog.  The money is the server's (`GET …/payments/preview`: the due block, the
// allocations of the amount); nothing here adds, splits or rounds a сум.  This file only names the periods the way a person
// does (a calendar month by its name, otherwise by dates), says in the FUTURE tense what saving will do (nothing is saved
// yet), and offers the quick amounts that carry the information the old top block used to.  No React: node:test loads it.
import { formatMoney, type Allocation, type PaymentPreview } from "./payments";
import { lessonsWord } from "./plural";
import {
  dueView,
  METHODS,
  previewView,
  splitDueSegments,
  sum,
  validatePaymentForm,
  type EnterableMethod,
  type PaymentFormValues,
} from "./payments-ledger";

export const PLAN_TITLE = "Что будет после сохранения";
export const PLAN_EMPTY_HINT = "Введите сумму — здесь появится, куда пойдут деньги";
export const PLAN_LOADING_TEXT = "Считаем, куда пойдут деньги…";
export const QUICK_AMOUNTS_LABEL = "Быстрая сумма";
export const NO_DEBT_HINT = "Долга нет. Всё, что внесёте, пойдёт вперёд.";

// ── Naming a period ────────────────────────────────────────────────────────

const MONTH_NOMINATIVE = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTH_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function parts(iso: string | null | undefined): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

function dayMonth(iso: string): string {
  const p = parts(iso);
  return p ? `${String(p.day).padStart(2, "0")}.${String(p.month).padStart(2, "0")}` : iso;
}

/** The calendar month a period is exactly (the 1st .. the last day of one month), or null. */
export function calendarMonth(from: string, to: string): { year: number; month: number } | null {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b || a.year !== b.year || a.month !== b.month || a.day !== 1) return null;
  return b.day === new Date(Date.UTC(b.year, b.month, 0)).getUTCDate() ? { year: a.year, month: a.month } : null;
}

export type PeriodKind = "period" | "package";

export interface PeriodName {
  /** «август» / «август 2025» / «01.10–31.10» / «пакет 25.09–21.10»: for a line and after «за». */
  bare: string;
  /** The same inside a sentence: dates and packages are named («период 01.10–31.10»), a month is not. */
  sentence: string;
  isMonth: boolean;
  kind: PeriodKind;
}

/** A period by its name: a month when it is exactly one (the year only when it is not the year of `asOf`), else by dates. */
export function periodName(from: string, to: string, kind: PeriodKind = "period", asOf?: string | null): PeriodName {
  const dates = `${dayMonth(from)}–${dayMonth(to)}`;
  if (kind === "package") return { bare: `пакет ${dates}`, sentence: `пакет ${dates}`, isMonth: false, kind };
  const month = calendarMonth(from, to);
  if (month) {
    const year = parts(asOf)?.year;
    const name = `${MONTH_NOMINATIVE[month.month - 1]}${year !== undefined && year !== month.year ? ` ${month.year}` : ""}`;
    return { bare: name, sentence: name, isMonth: true, kind };
  }
  return { bare: dates, sentence: `период ${dates}`, isMonth: false, kind };
}

/** «31 октября» (the year only when it is not the year of `asOf`). */
export function longDate(iso: string | null | undefined, asOf?: string | null): string | null {
  const p = parts(iso);
  if (!p) return null;
  const year = parts(asOf)?.year;
  return `${p.day} ${MONTH_GENITIVE[p.month - 1]}${year !== undefined && year !== p.year ? ` ${p.year}` : ""}`;
}

function capital(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : text;
}

/** «a» / «a и b» / «a, b и c». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
}

// ── Quick amounts: they carry what the old «К оплате» block said ───────────

export interface QuickAmount {
  key: "debt" | "all" | "current";
  /** «Закрыть долг · 592 000 сум». */
  label: string;
  amount: number;
}

type DueSegment = PaymentPreview["due"]["segments"][number];

function segmentName(segment: DueSegment, preview: Pick<PaymentPreview, "as_of" | "mode">): PeriodName {
  const kind: PeriodKind = segment.kind === "package" || preview.mode === "lessons" ? "package" : "period";
  return periodName(segment.period_from, segment.period_to, kind, preview.as_of);
}

/** What the running period is called on a chip: «октябрь», otherwise «текущий период» / «текущий пакет». */
function runningChipName(running: DueSegment | null, preview: Pick<PaymentPreview, "as_of" | "mode">): string {
  if (!running) return "текущий период";
  const name = segmentName(running, preview);
  if (name.isMonth) return name.bare;
  return name.kind === "package" ? "текущий пакет" : "текущий период";
}

/**
 * The chips under the amount.  With a debt: «Закрыть долг» and, when the running period is due too, «Долг + октябрь»;
 * without a debt: «За октябрь».  A student who has left pays the debt only.  No chip when nothing is due.
 */
export function quickAmounts(preview: PaymentPreview | null | undefined, options: { leftOnly?: boolean } = {}): QuickAmount[] {
  const due = preview ? dueView(preview) : null;
  if (!preview || !due) return [];
  const { running } = splitDueSegments(preview);
  const runName = runningChipName(running, preview);
  const chips: QuickAmount[] = [];
  if (due.pastDebt > 0) chips.push({ key: "debt", label: `Закрыть долг · ${formatMoney(due.pastDebt)}`, amount: due.pastDebt });
  if (due.currentDue > 0 && !options.leftOnly) {
    if (due.pastDebt > 0) chips.push({ key: "all", label: `Долг + ${runName} · ${formatMoney(due.total)}`, amount: due.total });
    else chips.push({ key: "current", label: `${running && sum(running.paid) > 0 ? "Остаток за" : "За"} ${runName} · ${formatMoney(due.currentDue)}`, amount: due.currentDue });
  }
  return chips;
}

/** The chip is selected only while the field holds exactly its amount. */
export function chipSelected(chip: QuickAmount, amount: number | null): boolean {
  return amount !== null && amount === chip.amount;
}

/** Under the amount when there is no chip to offer: nothing is due (a calm line), or null while the answer is not here. */
export function noChipsHint(preview: PaymentPreview | null | undefined): string | null {
  const due = preview ? dueView(preview) : null;
  if (!due || due.pastDebt > 0 || due.currentDue > 0) return null;
  return due.advance > 0 ? `Долга нет, аванс ${formatMoney(due.advance)}. Всё, что внесёте, пойдёт вперёд.` : NO_DEBT_HINT;
}

// ── «Что будет после сохранения» ───────────────────────────────────────────

export interface PlanLine {
  key: string;
  /** «Долг за август (остаток)» / «Октябрь» / «Аванс». */
  label: string;
  amount: number;
  bucket: Allocation["bucket"];
}

export interface PlanView {
  /** What saving will do: the future tense, plain words. */
  sentence: string;
  /** One quiet line per period; the sum of the lines is the amount. */
  lines: PlanLine[];
  /** «Уроков оплачено: 0 → 12, осталось 0» in lessons mode. */
  lessons: string | null;
  priceAhead: string[];
  warnings: string[];
}

export function planView(preview: PaymentPreview | null | undefined): PlanView | null {
  const result = preview?.result;
  if (!preview || !result) return null;
  const base = previewView(preview);
  if (!base) return null;
  const segments = new Map(preview.due.segments.map((segment) => [segment.id, segment]));
  const allocations = result.allocations.filter((item) => sum(item.amount) > 0);
  const nameOf = (item: Allocation): PeriodName => {
    const kind: PeriodKind = segments.get(item.segment_id)?.kind === "package" || preview.mode === "lessons" ? "package" : "period";
    return periodName(item.period_from, item.period_to, kind, preview.as_of);
  };
  const wasPaidBefore = (item: Allocation) => sum(segments.get(item.segment_id)?.paid) > 0;

  // the quiet breakdown
  const lines: PlanLine[] = [];
  let advance = 0;
  allocations.forEach((item, index) => {
    const amount = sum(item.amount);
    if (item.bucket === "advance") { advance += amount; return; }
    const name = nameOf(item).bare;
    const note = !item.closes ? " (часть)" : wasPaidBefore(item) ? " (остаток)" : "";
    lines.push({
      key: `${item.segment_id}-${index}`,
      label: item.bucket === "past_debt" ? `Долг за ${name}${note}` : `${capital(name)}${note}`,
      amount,
      bucket: item.bucket,
    });
  });
  // Lessons mode, the whole sum goes ahead (nothing is due, no lesson held): it is for the lessons to come, not an «advance» (inc5 P08).
  const wholeAdvance = advance > 0 && lines.length === 0;
  if (advance > 0) lines.push({ key: "advance", label: preview.mode === "lessons" && wholeAdvance ? "На будущие уроки" : "Аванс", amount: advance, bucket: "advance" });

  // the sentence
  const closedPast = allocations.filter((item) => item.bucket === "past_debt" && item.closes);
  const closedCurrent = allocations.filter((item) => item.bucket === "current" && item.closes);
  const partial = [...allocations].reverse().find((item) => item.bucket !== "advance" && !item.closes) ?? null;
  const debtAfter = sum(result.debt_after);
  const pastAfter = sum(result.past_debt_after);
  const currentAfter = sum(result.current_due_after);
  const total = allocations.reduce((all, item) => all + sum(item.amount), 0);
  const money = formatMoney;

  const clauses: string[] = [];
  if (closedPast.length > 0) clauses.push(`закроет долг за ${joinNames(closedPast.map((item) => nameOf(item).sentence))}`);
  if (closedCurrent.length > 0) clauses.push(`оплатит ${joinNames(closedCurrent.map((item) => nameOf(item).sentence))}`);
  let first = capital(clauses.join(" и "));
  let partialLeft = 0;
  if (partial) {
    const name = nameOf(partial).sentence;
    partialLeft = partial.segment_remaining_after === null || partial.segment_remaining_after === undefined
      ? (partial.bucket === "past_debt" ? pastAfter : currentAfter)
      : sum(partial.segment_remaining_after);
    if (first) first = `${first}, за ${name} останется ${money(partialLeft)}`;
    else if (partial.bucket === "past_debt") first = `Оплатит часть долга за ${name}, останется ${money(partialLeft)}`;
    else first = `Оплатит ${name} частично, останется ${money(partialLeft)}`;
  }
  // «хватит на 12 уроков»: only the lessons count the dialog already shows in its quiet line («осталось N»); nothing new is computed.
  const lessonsLeftRaw = result.lessons ? sum(result.lessons.left_after) : 0;
  const lessonsLeft = lessonsLeftRaw > 0 ? lessonsLeftRaw : null;
  const until = preview.mode === "lessons" ? null : longDate(result.paid_until_after, preview.as_of);
  if (advance > 0) {
    const kept = `${money(advance)} останутся авансом${until ? ` (хватит до ${until})` : ""}`;
    if (first) first = `${first}, ${kept}`;
    else if (advance === total) first = preview.mode === "lessons" ? `Пойдёт на будущие уроки${lessonsLeft !== null ? ` — хватит на ${lessonsLeft} ${lessonsWord(lessonsLeft)}` : ""}` : `Вся сумма останется авансом${until ? ` (хватит до ${until})` : ""}`;
    else first = capital(kept);
  }
  if (!first) first = base.headline; // the server's own sentence when there is nothing to name
  const sentences = first ? [`${first}.`] : [];

  // what is left after saving: the running period is not a debt, so only an overdue rest is named as one
  if (partial) {
    if (partial.bucket === "past_debt" && pastAfter > partialLeft) sentences.push(`Всего долга останется ${money(pastAfter)}.`);
  } else if (debtAfter > 0) {
    if (pastAfter === 0 && currentAfter > 0) {
      const running = splitDueSegments(preview).running;
      const name = running ? segmentName(running, preview).sentence : "текущий период";
      sentences.push(`${capital(name)} останется неоплаченным: ${money(currentAfter)}.`);
    } else {
      sentences.push(`Всего долга останется ${money(pastAfter > 0 ? pastAfter : debtAfter)}.`);
    }
  } else if (advance === 0) {
    const hadDebt = sum(preview.due.past_debt) > 0;
    if (until) sentences.push(`Оплачено до ${until}${hadDebt ? ", долга не останется" : ""}.`);
    else if (hadDebt) sentences.push("Долга не останется.");
  }

  return { sentence: sentences.join(" "), lines, lessons: base.lessons, priceAhead: base.priceAhead, warnings: base.warnings };
}

// ── Method: required, remembered, without «Другое» ─────────────────────────

/** The methods a NEW payment can be entered with: the till «по способам» must reconcile, so «Другое» is not offered. */
export const PAYMENT_METHODS = METHODS.filter((method) => method.key !== "other");

/** The picker: the same list; «Другое» only when the payment being corrected was entered with it (it could not be saved otherwise). */
export function methodChoices(current: EnterableMethod | null | undefined): Array<{ key: EnterableMethod; label: string }> {
  return current === "other" ? METHODS : PAYMENT_METHODS;
}

export const LAST_METHOD_KEY = "algo.payments.lastMethod";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The last method this browser used, or null (no storage, a blocked one, or a value that is not in the picker). */
export function readLastMethod(storage: Pick<Storage, "getItem"> | null = browserStorage()): EnterableMethod | null {
  try {
    const value = storage?.getItem(LAST_METHOD_KEY);
    return PAYMENT_METHODS.find((method) => method.key === value)?.key ?? null;
  } catch {
    return null;
  }
}

export function rememberMethod(method: EnterableMethod | null | undefined, storage: Pick<Storage, "setItem"> | null = browserStorage()): void {
  if (!method || !PAYMENT_METHODS.some((item) => item.key === method)) return;
  try {
    storage?.setItem(LAST_METHOD_KEY, method);
  } catch {
    /* a private window or a full disk: the choice is simply not remembered */
  }
}

// ── The button ─────────────────────────────────────────────────────────────

/** «Внести 1 142 000 сум»; the amount is the live one, a correction says what it does. */
export function payButtonLabel(kind: "create" | "replace", amount: number | null): string {
  if (kind === "replace") return "Сохранить исправление";
  return amount !== null ? `Внести ${formatMoney(amount)}` : "Внести";
}

/** Why the button is off (shown right above it); null = the form can be sent. */
export function payBlocker(values: PaymentFormValues, today: string, leftProblem: string | null): string | null {
  const problem = validatePaymentForm(values, today);
  if (problem === "Укажите сумму") return "Введите сумму";
  return problem ?? leftProblem;
}
