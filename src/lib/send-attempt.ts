/**
 * WB-P5 R3 (BUG-6 rolled back).  A dialog that writes money (a payment, a payout) owns ONE idempotency key from the moment it
 * opens until it closes; the key never changes when the fields are edited.  The server remembers the key of every record it made:
 * a send whose answer was lost and is then repeated (even with a corrected sum) is answered 409 «already entered» and nothing
 * is written twice.  A new key for a corrected body would write the money twice (500 000 + 450 000).
 * What this module does is the honest TEXT for that 409: when the repeated body differs from the first send, the person is told
 * what the first send recorded and how to correct it.  Pure: node:test drives it.
 */

/** What the first send of this opening carried (null until the first send). */
export interface FirstSend {
  signature: string;
  amount: number;
}

/** Remembers the first send only: later sends of the same opening do not overwrite it. */
export function rememberFirstSend(ref: { current: FirstSend | null }, signature: string, amount: number): void {
  if (ref.current === null) ref.current = { signature, amount };
}

export interface DuplicateNotice {
  text: string;
  /** `success` when nothing differs (a double click: the record is there, all is well); `warning` when the person's correction was NOT applied. */
  tone: "success" | "warning";
}

export const PAYMENT_WORDS = { noun: "оплата", accusative: "оплату", where: "в журнале" } as const;
export const PAYOUT_WORDS = { noun: "выплата", accusative: "выплату", where: "в ведомости" } as const;

/**
 * The answer to «this key was already used» (409 DUPLICATE_*).  `what` is the thing being entered ("оплата" / "выплата"),
 * `where` the place the first record can be undone («в журнале» / «в ведомости»).
 */
export function duplicateNotice(
  first: FirstSend | null,
  signature: string,
  formatAmount: (amount: number) => string,
  what: { noun: "оплата" | "выплата"; accusative: "оплату" | "выплату"; where: string },
): DuplicateNotice {
  const done = `Эта ${what.noun} уже внесена`;
  if (first === null || first.signature === signature) return { text: done, tone: "success" };
  return {
    text: `Первая отправка уже записана (${formatAmount(first.amount)}). Если сумма неверна — отмените эту ${what.accusative} ${what.where} и внесите заново.`,
    tone: "warning",
  };
}
