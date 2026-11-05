"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney, NOTE_MAX, parseMoneyInput, reformatMoneyTyping } from "@/lib/payments";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { duplicateNotice, PAYOUT_WORDS, rememberFirstSend, type FirstSend } from "@/lib/send-attempt";
import {
  buildPayoutBody,
  emptyPayoutValues,
  PAYOUT_ACTION_LABEL,
  payoutHeadline,
  PAYOUT_SUBTITLE,
  PAYOUT_ADVANCE_LABEL,
  PAYOUT_METHODS,
  payoutAfterText,
  payoutError,
  payoutNote,
  payoutOverpayQuestion,
  validatePayout,
  type PayoutFormValues,
  type PayoutState,
} from "@/lib/payroll-logica";
import { monthTitle, type PayrollErrorLike } from "@/lib/payroll";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

/**
 * «Записать выплату» (UX pack №9): the amount (what is left to pay by default), the date, how it was paid, a note.  A payout belongs to the month of
 * the sheet and never rewrites it.  Paying more than is left (MN-32): the SERVER refuses with 409 `OVERPAY_CONFIRM_REQUIRED` and the by-how-much;
 * the window then asks «Выплата больше остатка на N сум — записать как аванс?» and only «Записать как аванс» sends `confirm_overpay`.
 */
export function PayoutDialog({
  open, sheetId, teacherName, month, state, onClose, onDone,
}: {
  open: boolean;
  sheetId: string;
  teacherName: string;
  month: string;
  state: PayoutState | null;
  onClose: () => void;
  /** The server accepted the payout (or it was already there): the page reads the money again. */
  onDone: (text: string) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<PayoutFormValues>(() => emptyPayoutValues(today, state));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overpay, setOverpay] = useState<number | null>(null);   // the server's by-how-much while the question is open
  const idempotencyKey = useRef(newIdempotencyKey());
  const firstSend = useRef<FirstSend | null>(null); // R3: the key stays for the whole opening; only the text of a 409 depends on what was sent
  const sending = useRef(false);                                    // a second Enter / click before the next render

  useEffect(() => {
    if (!open) return;
    setValues(emptyPayoutValues(today, state));
    setBusy(false);
    setError(null);
    setOverpay(null);
    sending.current = false;
    idempotencyKey.current = newIdempotencyKey();
    firstSend.current = null;
    // restarts when opened (for another sheet), not when the numbers refresh behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheetId]);

  const amount = parseMoneyInput(values.amount);
  // the question about more than is left says the same (rule 87: a fact once) - the hint under the field stays silent while it is open
  const after = overpay !== null ? "" : payoutAfterText(amount, state, month);
  const patch = (next: Partial<PayoutFormValues>) => { setError(null); setOverpay(null); setValues((previous) => ({ ...previous, ...next })); };

  const send = async (confirmedOverpay: number | null) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    let signature = "";
    try {
      const body = buildPayoutBody(values, confirmedOverpay);
      signature = JSON.stringify(buildPayoutBody(values, null));    // what the owner typed; the confirmation flag is not part of «the same payout»
      rememberFirstSend(firstSend, signature, body.amount);
      const result = await orgApi.createPayrollPayout(sheetId, body, idempotencyKey.current);
      onDone(`Выплата внесена: ${formatMoney(result.payout.amount)}`);
      onClose();
    } catch (cause) {
      const failure = payoutError(cause as PayrollErrorLike);
      if (failure.kind === "overpay_confirm" && failure.overpay !== null) {
        firstSend.current = null;                                    // nothing was written: the confirmed send will be the first one
        setOverpay(failure.overpay);                                 // the owner decides
      } else if (failure.kind === "duplicate") { onDone(duplicateNotice(firstSend.current, signature, formatMoney, PAYOUT_WORDS).text); onClose(); }
      else setError(failure.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const submit = () => {
    if (busy || overpay !== null) return;
    const problem = validatePayout(values, today);
    if (problem) { setError(problem); return; }
    void send(null);
  };

  const headline = payoutHeadline(state);
  // an open month tells its figures in the line over the form; the sentence of the server repeats them - it stays only for what the line does not say (an overpay, the advance of the earlier months)
  const note = headline && state?.basis === "fresh" && state.state !== "overpaid" ? null : payoutNote(state);
  const amountText = amount !== null && amount > 0 ? ` ${formatMoney(amount)}` : "";

  return (
    <Modal
      open={open}
      title={PAYOUT_ACTION_LABEL}
      description={`${teacherName} · ${monthTitle(month)}`}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // UX pack №9 / rule 3: the main button names the action and the sum; off - with the line «почему»; «Отмена» of the question goes back to the form, of the form closes the window
        <ConfirmFooter
          primary={`${overpay !== null ? PAYOUT_ADVANCE_LABEL : PAYOUT_ACTION_LABEL}${amountText}`}
          submitFor={overpay !== null ? undefined : "payout-form"}
          onPrimary={overpay !== null ? () => void send(overpay) : undefined}
          busy={busy}
          disabled={amount === null || amount < 1}
          why="Введите сумму выплаты."
          whyId="payout-why"
          onCancel={overpay !== null ? () => setOverpay(null) : onClose}
          cancelLabel="Отмена"
          testId="payout-submit"
        />
      )}
    >
      <form id="payout-form" onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-4 pb-2" noValidate>
        <p className="text-xs text-slate-600" data-testid="payout-subtitle">{PAYOUT_SUBTITLE}</p>
        {headline && <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold tabular-nums text-slate-900" data-testid="payout-state">{headline}</p>}
        {note && <p className="text-sm text-slate-600" data-testid="payout-text">{note}</p>}

        <div>
          <label htmlFor="payout-amount" className={LABEL}>Сумма</label>
          <div className="relative">
            <input id="payout-amount" value={values.amount} onChange={(event) => patch({ amount: reformatMoneyTyping(event.target.value) })} inputMode="numeric" autoComplete="off" autoFocus placeholder="475 000" className={`${FIELD} pr-12`} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">сум</span>
          </div>
          <p aria-live="polite" className="mt-1 min-h-[1rem] text-xs text-slate-500">{after}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
          <div>
            <label htmlFor="payout-paid-on" className={LABEL}>Дата</label>
            <DateInput id="payout-paid-on" value={values.paidOn} max={today} onChange={(next) => patch({ paidOn: next })} className={FIELD} />
          </div>
          <div>
            <span id="payout-method-label" className={LABEL}>Способ</span>
            <div role="radiogroup" aria-labelledby="payout-method-label" className="flex flex-wrap gap-1.5">
              {PAYOUT_METHODS.map((method) => (
                <button
                  key={method.key}
                  type="button"
                  role="radio"
                  aria-checked={values.method === method.key}
                  onClick={() => patch({ method: method.key })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${values.method === method.key ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="payout-note" className={LABEL}>Примечание <span className="font-normal text-slate-500">(необязательно)</span></label>
          <input id="payout-note" value={values.note} onChange={(event) => patch({ note: event.target.value })} maxLength={NOTE_MAX} autoComplete="off" className={FIELD} />
        </div>

        {overpay !== null && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900" data-testid="payout-overpay">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{payoutOverpayQuestion(overpay, state?.basis)}</span>
          </p>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
