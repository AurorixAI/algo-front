// «Внести оплату»: the words of the dialog.  The money AND its words are the server's (`GET …/payments/preview`: the two sums of the top block with their texts, `suggested_amount` for the field, `summary_text`
// under it, PAY-DUE 10.10 / 14Б.8); nothing here adds, splits, rounds or names a сум.  This file only names a period the way a person does (a calendar month by its name, otherwise by dates) and holds the small rules of the
// form (the method, the button, the reasons).  No React: node:test loads it.
import { formatDateRu, formatDayMonthRu } from "./business-time";
import { MONTHS_GENITIVE, MONTHS_NOMINATIVE } from "./ru-calendar";
import { tidyMoneyText } from "./money-format";
import { formatMoney, type PayMethod, type PaymentPreview } from "./payments";
import {
  METHODS,
  methodLabel,
  previewAmount,
  previewView,
  validatePaymentForm,
  type EnterableMethod,
  type PaymentFormValues,
} from "./payments-ledger";

export const PLAN_EMPTY_HINT = "Введите сумму — здесь появится, куда пойдут деньги";
export const PLAN_LOADING_TEXT = "Считаем, куда пойдут деньги…";

// ── «Что изменится»: the server's sentence under the amount (10.10) ─────────────────────────────

export interface PlanView {
  /** BEFORE the button: what the typed amount does, the server's words («Погасит долг 187 000 сум · к оплате 44 000 сум»).  Empty when `split` is there: the rows say it. */
  sentence: string;
  /** «Оплачено уроков: 12 · не оплачено: 8» in lessons mode. */
  lessons: string | null;
  priceAhead: string[];
  warnings: string[];
  repeated: string | null;
  /** Б11.33 п.2 / Б11.34: «Куда пойдут деньги» - the rows of the server, as they are; null on an older server (or no amount): the sentence stays. */
  split: PlanSplit | null;
}

export interface PlanSplitRow {
  label: string;
  /** «508 000» (a number, no unit: the total says «сум»). */
  amount: string;
  /** The quiet mark after the amount: «из 550 000» / «✓ оплачен» / «✓ оплачены»; null for an advance. */
  mark: { kind: "of" | "paid"; text: string } | null;
}

export interface PlanSplit {
  title: string;
  rows: PlanSplitRow[];
  /**
   * The line under the rows, by the numbers of the answer (Б11.34 п.1): `debt` - the debt line (and, when a sum within its term stays too, the quiet `alsoDue` under it); `due` - «Останется к оплате M сум»;
   * `paid` - «Всё оплачено».  An advance is not said again here: it is a row of its own.
   */
  total: { kind: "debt" | "due" | "paid"; label: string; amount: string | null };
  /** «и к оплате ещё 550 000 сум» under a debt that is not the only unpaid sum; null otherwise. */
  alsoDue: string | null;
  /** «октябрь 42 000» · «ноябрь 550 000» (a dash only after a label that ends in a digit: «пакет № 4 — 250 000») as pieces (a phone breaks the line between them); only when the rest lies in two or more periods, else empty. */
  debtRest: string[];
}

export const SPLIT_PAID_ONE = "✓ оплачен";
export const SPLIT_PAID_MANY = "✓ оплачены";
export const SPLIT_DEBT_LEFT = "Останется долг";
export const SPLIT_DUE_LEFT = "Останется к оплате";
export const SPLIT_ALSO_DUE = "и к оплате ещё";
export const SPLIT_ALL_PAID = "Всё оплачено";
/** The title of the block - the pair of the receipt's «Куда пошли деньги» (the sum is in the field above and on the button). */
export const SPLIT_TITLE = "Куда пойдут деньги";

const digits = (value: number) => formatMoney(value).replace(/[\s\u00a0]сум$/, "");

/** «октябрь 42 000»; «пакет № 4 — 250 000» (the dash only keeps a number of the label from joining the sum). */
function restPiece(label: string, amount: number): string {
  const name = label.toLocaleLowerCase("ru").trim();
  return /\d$/.test(name) ? `${name} — ${digits(amount)}` : `${name} ${digits(amount)}`;
}

function splitOf(result: NonNullable<PaymentPreview["result"]>, amount: number | null): PlanSplit | null {
  const rows = result.money_rows ?? [];
  if (rows.length === 0 || amount === null) return null;
  const debt = result.debt_amount_after;
  const due = result.due_after ?? 0;
  const total: PlanSplit["total"] = debt > 0
    ? { kind: "debt", label: SPLIT_DEBT_LEFT, amount: formatMoney(debt) }
    : due > 0
      ? { kind: "due", label: SPLIT_DUE_LEFT, amount: formatMoney(due) }
      : { kind: "paid", label: SPLIT_ALL_PAID, amount: null };
  const rest = result.debt_rest ?? [];
  return {
    title: SPLIT_TITLE,
    rows: rows.map((row) => ({
      label: tidyMoneyText(row.label),
      amount: digits(row.amount),
      mark: row.state === "closed"
        ? { kind: "paid", text: row.periods > 1 ? SPLIT_PAID_MANY : SPLIT_PAID_ONE }
        : row.state === "part" && row.of !== null
          ? { kind: "of", text: `из ${digits(row.of)}` }
          : null,
    })),
    total,
    alsoDue: debt > 0 && due > 0 ? `${SPLIT_ALSO_DUE} ${formatMoney(due)}` : null,
    debtRest: debt > 0 && rest.length > 1 ? rest.map((item) => restPiece(item.label, item.amount)) : [],
  };
}

export function planView(preview: PaymentPreview | null | undefined, typed: number | null = null): PlanView | null {
  const result = preview?.result;
  if (!preview || !result) return null;
  const base = previewView(preview);
  if (!base) return null;
  const split = splitOf(result, preview.amount ?? typed);
  return { sentence: split ? "" : (result.summary_text ?? "").trim(), lessons: base.lessons, priceAhead: base.priceAhead, warnings: base.warnings, repeated: base.repeated, split };
}

// ── Method: required (no default, nothing remembered), without «Другое» ─────────────────────────

/** The methods a NEW payment can be entered with: the till «по способам» must reconcile, so «Другое» is not offered. */
export const PAYMENT_METHODS = METHODS.filter((method) => method.key !== "other");

/** The picker: the same list; «Другое» only when the payment being corrected was entered with it (it could not be saved otherwise). */
export function methodChoices(current: EnterableMethod | null | undefined): Array<{ key: EnterableMethod; label: string }> {
  return current === "other" ? METHODS : PAYMENT_METHODS;
}

// ── The button ─────────────────────────────────────────────────────────────

/** «Внести 1 142 000 сум» / «Исправить на 200 000 сум»; the amount is the live one, the button names what it does (UX pack rule 3). */
export function payButtonLabel(kind: "create" | "replace", amount: number | null): string {
  if (kind === "replace") return amount !== null ? `Исправить на ${formatMoney(amount)}` : "Исправить оплату";
  return amount !== null ? `Внести ${formatMoney(amount)}` : "Внести";
}

/** The sentence over the fields of a correction (UX pack №13): what the history says now, once, before the fields. */
/** Money-1 V5: the cheque photo of the corrected payment goes to the new one (the server copies the files). */
export const REPLACE_FILES_NOTE = "Фото чека перенесётся в исправленную оплату";
export const REPLACE_HISTORY_NOTE = "Прежняя запись будет отменена и останется в истории серым. Оплаты ученика в группе пересчитаются.";

/**
 * The first line of the window «Исправить оплату» (UX pack №13): «Было: 400 000 сум · 05.11 · наличные → станет: 200 000 сум».  The «станет» part follows the form live: the amount, and the date or
 * the method only when the person changed them.
 */
export function replaceChangeLine(
  payment: { amount: number; paid_on: string; method?: PayMethod | null },
  values: Pick<PaymentFormValues, "amount" | "paidOn" | "method">,
): { was: string; becomes: string } {
  // re-audit С9 / С14: a record keeps the full number form «05.11.2026» (the field under it says the same day the same way)
  const day = (iso: string) => formatDateRu(iso);
  const method = (key: PayMethod | null | undefined) => methodLabel(key).toLowerCase();
  const amount = previewAmount(values.amount);
  const becomes = [amount !== null ? formatMoney(amount) : "—"];
  if (values.paidOn && values.paidOn !== payment.paid_on) becomes.push(day(values.paidOn));
  if (values.method && values.method !== payment.method) becomes.push(method(values.method));
  return { was: `Было: ${formatMoney(payment.amount)} · ${day(payment.paid_on)} · ${method(payment.method)}`, becomes: `станет: ${becomes.join(" · ")}` };
}

/** Why the button is off (shown right above it); null = the form can be sent. */
export function payBlocker(values: PaymentFormValues, today: string, leftProblem: string | null, kind: "create" | "replace" = "create"): string | null {
  const problem = validatePaymentForm(values, today, kind === "replace");
  if (problem === "Укажите сумму") return "Введите сумму";
  return problem ?? leftProblem;
}
