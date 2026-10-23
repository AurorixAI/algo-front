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
  PAYOUT_METHODS,
  payoutAfterText,
  payoutError,
  payoutOverpay,
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
 * the sheet and never rewrites it; paying more than is left asks for a confirmation («Переплата 30 000 сум. Продолжить?»).
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
  const [confirming, setConfirming] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    setValues(emptyPayoutValues(today, state));
    setBusy(false);
    setError(null);
    setConfirming(false);
    idempotencyKey.current = newIdempotencyKey();
    // restarts when opened (for another sheet), not when the numbers refresh behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheetId]);

  const amount = parseMoneyInput(values.amount);
  const overpay = payoutOverpay(amount, state);
  const after = payoutAfterText(amount, state);
  const patch = (next: Partial<PayoutFormValues>) => { setError(null); setConfirming(false); setValues((previous) => ({ ...previous, ...next })); };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.createPayrollPayout(sheetId, buildPayoutBody(values), idempotencyKey.current);
      onDone(`Выплата внесена: ${formatMoney(result.payout.amount)}`);
      onClose();
    } catch (cause) {
      const failure = payoutError(cause as PayrollErrorLike);
      if (failure.kind === "duplicate") { onDone("Эта выплата уже внесена"); onClose(); }
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (busy) return;
    const problem = validatePayout(values, today);
    if (problem) { setError(problem); return; }
    // More than is left: ask once, then send.
    if (overpay !== null && !confirming) { setConfirming(true); return; }
    void send();
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
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="payout-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirming ? "Продолжить" : "Сохранить"}
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

        {confirming && overpay !== null && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900" data-testid="payout-overpay">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{payoutOverpayQuestion(overpay)}</span>
          </p>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
