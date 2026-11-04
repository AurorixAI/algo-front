/**
 * Money-1 R3 #15: what an action of the money of a student does to the packs and the saved sheets is shown BEFORE the button is pressed - the server answers the same request
 * with `?dry_run=true` (no `Idempotency-Key`, nothing is written).  Pure: the keys and the bodies of those asks, and the words of a transfer's «что переедет».
 */
import { buildPaymentPayload, validatePaymentForm, type PaymentFormValues } from "./payments-ledger";
import type { PaymentCreate } from "./payments";

/** A dry run of a cancel needs a reason too (the server checks it like the real one); the person has not typed it yet. */
export const DRY_RUN_REASON = "Проверка последствий";

export interface PaymentDraft {
  /** The same body the real request will send, with the reason of a correction. */
  body: PaymentCreate & { reason?: string };
  /** Changes with anything the real request would carry: the dry run is asked again. */
  key: string;
}

/** null while the form cannot be sent (nothing to ask); otherwise the body of the dry run - the one of the real request. */
export function paymentDraft(values: PaymentFormValues, today: string, kind: "create" | "replace"): PaymentDraft | null {
  if (validatePaymentForm(values, today) !== null) return null;
  const body = buildPaymentPayload(values);
  const reason = values.reason.trim();
  const full = kind === "replace" && reason ? { ...body, reason } : body;
  return { body: full, key: `${kind}|${JSON.stringify(full)}` };
}

export interface CarriedLine {
  code: string;
  message: string;
}

/** `carried` of the answer of a transfer (dry or real): what moves to the new group, in the words of the server. */
export function carriedOf(answer: unknown): CarriedLine[] {
  const raw = (answer as { carried?: unknown } | null | undefined)?.carried;
  if (!Array.isArray(raw)) return [];
  const lines: CarriedLine[] = [];
  for (const item of raw) {
    const message = typeof (item as { message?: unknown })?.message === "string" ? (item as { message: string }).message.trim() : "";
    if (message) lines.push({ code: String((item as { code?: unknown }).code ?? ""), message });
  }
  return lines;
}

export const CARRIED_TITLE = "Что переедет в новую группу";
export const CARRIED_NONE_TEXT = "Оплаты и долги не переносятся: у ученика в прошлой группе их нет.";
