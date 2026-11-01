"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney, NOTE_MAX, parseMoneyInput, reformatMoneyTyping } from "@/lib/payments";
import { newIdempotencyKey } from "@/lib/payments-ledger";
import {
  buildPayoutBody,
  emptyPayoutValues,
  PAYOUT_ACTION_LABEL,
  PAYOUT_ADVANCE_HINT,
  PAYOUT_ADVANCE_LABEL,
  PAYOUT_METHODS,
  payoutAfterText,
  payoutError,
  payoutOverpayQuestion,
  sheetPayoutParts,
  validatePayout,
  type PayoutFormValues,
  type PayoutState,
} from "@/lib/payroll-logica";
import { monthTitle, type PayrollErrorLike } from "@/lib/payroll";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

/**
 * «Отметить выплату»: the amount (what is left to pay by default), the date, how it was paid, a note.  A payout belongs to the month of
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
  const sending = useRef(false);                                    // a second Enter / click before the next render

  useEffect(() => {
    if (!open) return;
    setValues(emptyPayoutValues(today, state));
    setBusy(false);
    setError(null);
    setOverpay(null);
    sending.current = false;
    idempotencyKey.current = newIdempotencyKey();
    // restarts when opened (for another sheet), not when the numbers refresh behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheetId]);

  const amount = parseMoneyInput(values.amount);
  const after = payoutAfterText(amount, state);
  const patch = (next: Partial<PayoutFormValues>) => { setError(null); setOverpay(null); setValues((previous) => ({ ...previous, ...next })); };

  const send = async (confirmedOverpay: number | null) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.createPayrollPayout(sheetId, buildPayoutBody(values, confirmedOverpay), idempotencyKey.current);
      onDone(`Выплата внесена: ${formatMoney(result.payout.amount)}`);
      onClose();
    } catch (cause) {
      const failure = payoutError(cause as PayrollErrorLike);
      if (failure.kind === "overpay_confirm" && failure.overpay !== null) setOverpay(failure.overpay);   // nothing was written: the owner decides
      else if (failure.kind === "duplicate") { onDone("Эта выплата уже внесена"); onClose(); }
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

  const parts = sheetPayoutParts(state);

  return (
    <Modal
      open={open}
      title={PAYOUT_ACTION_LABEL}
      description={`${teacherName} · ${monthTitle(month)}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          {/* «Отмена» of the question goes back to the form (the amount can be corrected); of the form it closes the window */}
          <button type="button" onClick={overpay !== null ? () => setOverpay(null) : onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type={overpay !== null ? "button" : "submit"}
            form="payout-form"
            onClick={overpay !== null ? () => void send(overpay) : undefined}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {overpay !== null ? PAYOUT_ADVANCE_LABEL : "Сохранить"}
          </button>
        </>
      )}
    >
      <form id="payout-form" onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-4 pb-2" noValidate>
        {parts.length > 0 && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm" data-testid="payout-state">
            {parts.map((part) => (
              <div key={part.label}>
                <dt className="text-xs text-slate-500">{part.label}</dt>
                <dd className={`font-semibold tabular-nums ${part.tone === "due" ? "text-amber-800" : part.tone === "over" ? "text-sky-800" : "text-slate-900"}`}>{part.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div>
          <label htmlFor="payout-amount" className={LABEL}>Сумма</label>
          <div className="relative">
            <input id="payout-amount" value={values.amount} onChange={(event) => patch({ amount: reformatMoneyTyping(event.target.value) })} inputMode="numeric" autoComplete="off" autoFocus placeholder="475 000" className={`${FIELD} pr-12`} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">сум</span>
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
          <label htmlFor="payout-note" className={LABEL}>Примечание <span className="font-normal text-slate-400">(необязательно)</span></label>
          <input id="payout-note" value={values.note} onChange={(event) => patch({ note: event.target.value })} maxLength={NOTE_MAX} autoComplete="off" className={FIELD} />
        </div>

        {overpay !== null && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900" data-testid="payout-overpay">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{payoutOverpayQuestion(overpay)}<span className="mt-1 block text-xs font-normal text-amber-800">{PAYOUT_ADVANCE_HINT}</span></span>
          </p>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
