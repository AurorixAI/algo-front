/**
 * PAY-DUE: how a row of money looks.  The NAME of an unpaid sum («Долг» / «К оплате») and its words come from the server (`state`, `state_text`, `debt_text` / `debt_sub`,
 * `due_text` / `due_sub`, LESSONS 143); here the screen only chooses WHICH of the server's sentences stands where (a tab leads with its own part) and the tone of the label.
 * Where the server said nothing the screen says nothing (LESSONS 151).  Pure: no React, so node:test loads it.
 */
import type { ChipTone } from "./chip-tone";

/** The worst state of a membership, in the server's keys (debt → to pay → payment ends soon → pause → paid / advance → free → no price). */
export type PayState = "debt" | "to_pay" | "expiring" | "paused" | "paid" | "free" | "none";

/**
 * The ONE place the front reads «everything unpaid» of a row (`unpaid` = `debt_amount + due_amount`, the server's name since its second part): a sum, never a name (the name is `state`).
 * Inside the screens the normalised row keeps it in its older field `debt` (`normalizeRow`), so no other file reads the server's name.
 */
export function rowUnpaid(row: { unpaid?: number | null } | null | undefined): number {
  return Math.max(0, Math.round(Number(row?.unpaid) || 0));
}

/** The tone of every label by state - the map of tones (frame 0 of the layout): red only for a debt, calm blue for «К оплате», amber for «Заканчивается оплата», green for paid, grey for the rest. */
export const PAY_STATE_TONE: Record<PayState, ChipTone> = {
  debt: "danger",
  to_pay: "due",
  expiring: "warn",
  paused: "neutral",
  paid: "ok",
  free: "neutral",
  none: "neutral",
};

/** The worse the state, the lower the number (the server's order of the worst state). */
const SEVERITY: Record<PayState, number> = { debt: 0, to_pay: 1, expiring: 2, paused: 3, paid: 4, free: 5, none: 6 };

export function payStateTone(state: PayState | string | null | undefined): ChipTone {
  return PAY_STATE_TONE[state as PayState] ?? "neutral";
}

/** The fields of a row the label reads. */
export interface PayFields {
  state?: PayState | null;
  state_text?: string | null;
  /** PAY-TAILS Б1.1: the server's quiet line of a row by its state («ушёл 28.10» / «оплачено до 31.12»). */
  state_sub?: string | null;
  debt_amount?: number | null;
  due_amount?: number | null;
  debt_text?: string | null;
  debt_sub?: string | null;
  due_text?: string | null;
  due_sub?: string | null;
  /** The second line of a row that holds BOTH sums, the server's words: «и долг 600 000 сум · просрочено 45 дней» / «и к оплате 231 000 сум до 24.11». */
  debt_also_text?: string | null;
  due_also_text?: string | null;
}

export interface PayLabel {
  /** The server's label; null - the server said nothing (nothing is shown). */
  text: string | null;
  tone: ChipTone;
  /** The quiet line under the label (the term / the days overdue). */
  sub: string | null;
  /** Only for a membership with BOTH sums: «и к оплате 231 000 сум · до 24.11» / «и долг 600 000 сум · просрочено 45 дней». */
  second: string | null;
  state: PayState;
}

const clean = (value: string | null | undefined): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const positive = (value: number | null | undefined) => (Number(value) || 0) > 0;

/**
 * The label of a row on the tab `tab`: «Должники» leads with the debt and mentions the sum within its term on the second line; «К оплате» the other way round (PAY-DUE 9.1);
 * every other tab (and a single label of a group / a card) is the server's `state_text` of the worst state.
 */
export function payLabel(row: PayFields, tab: "debtors" | "to_pay" | "worst" | string = "worst"): PayLabel {
  const state: PayState = row.state && row.state in PAY_STATE_TONE ? row.state : "none";
  const hasDebt = positive(row.debt_amount) && clean(row.debt_text) !== null;
  const hasDue = positive(row.due_amount) && clean(row.due_text) !== null;
  if (tab === "debtors" && hasDebt) {
    const other = hasDue ? clean(row.due_also_text) : null;
    return { text: clean(row.debt_text), tone: PAY_STATE_TONE.debt, sub: clean(row.debt_sub), second: other, state };
  }
  if (tab === "to_pay" && hasDue) {
    const other = hasDebt ? clean(row.debt_also_text) : null;
    return { text: clean(row.due_text), tone: PAY_STATE_TONE.to_pay, sub: clean(row.due_sub), second: other, state };
  }
  // the other tabs and the single label: the worst state, in the server's words; a «К оплате» / «Долг» label carries its own sub
  const sub = state === "debt" ? clean(row.debt_sub) : state === "to_pay" ? clean(row.due_sub) : clean(row.state_sub);
  return { text: clean(row.state_text), tone: payStateTone(state), sub, second: null, state };
}

/** The worst row of a student's memberships (his card): the lowest severity wins; of equals the bigger part of the money, then the order of the server. */
export function worstRow<T extends PayFields>(rows: ReadonlyArray<T> | null | undefined): T | null {
  const part = (row: T) => (row.state === "debt" ? Number(row.debt_amount) || 0 : row.state === "to_pay" ? Number(row.due_amount) || 0 : 0);
  let best: T | null = null;
  for (const row of rows ?? []) {
    const state: PayState = row.state && row.state in SEVERITY ? row.state : "none";
    if (state === "none" && !clean(row.state_text)) continue;
    if (best === null) { best = row; continue; }
    const current: PayState = best.state && best.state in SEVERITY ? best.state : "none";
    if (SEVERITY[state] < SEVERITY[current] || (SEVERITY[state] === SEVERITY[current] && part(row) > part(best))) best = row;
  }
  return best;
}
