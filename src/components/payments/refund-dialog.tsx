"use client";

import { useEffect, useMemo, useState } from "react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney, formatMoneyInput, parseMoneyInput, reformatMoneyTyping, REASON_MAX, type MembershipPaymentRow, type RefundCreated } from "@/lib/payments";
import { buildRefundPayload, METHODS, payError, refundPreviewText, validateRefund, type RefundFormValues } from "@/lib/payments-ledger";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { Modal } from "@/components/ui/modal";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export const REFUND_ACTION_LABEL = "Вернуть аванс";

/**
 * «Вернуть аванс» (the student leaves): a record of a refund up to the part of the advance that can be given back.
 * The payments stay; the statement shows the refund.
 */
export function RefundDialog({
  row, studentName, onClose, onDone,
}: {
  row: MembershipPaymentRow | null;
  studentName: string;
  onClose: () => void;
  onDone: (result: RefundCreated) => void;
}) {
  const refundable = Math.max(0, Math.round(row?.refundable ?? 0));
  const today = useMemo(() => formatBusinessDate(), [row?.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<RefundFormValues>({ amount: "", method: null, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues({ amount: formatMoneyInput(Math.max(0, Math.round(row?.refundable ?? 0))), method: null, reason: "" });
    setBusy(false);
    setError(null);
  }, [row?.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (next: Partial<RefundFormValues>) => { setError(null); setValues((previous) => ({ ...previous, ...next })); };
  const refundAmount = parseMoneyInput(values.amount);
  const blocker = row ? validateRefund(values, refundable) : null;

  const submit = async () => {
    if (!row || busy) return;
    const problem = validateRefund(values, refundable);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.createRefund(row.membership_id, buildRefundPayload(values, today));
      onDone(result);
      onClose();
    } catch (cause) {
      setError(payError(cause, "Не удалось оформить возврат").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={row !== null}
      title={REFUND_ACTION_LABEL}
      description={row ? `${studentName} · ${row.group_name}` : undefined}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // UX pack №22 / rule 3: the main button names the action and the sum; off - with the line «почему»
        <ConfirmFooter primary={`${REFUND_ACTION_LABEL}${refundAmount !== null && refundAmount > 0 ? ` ${formatMoney(refundAmount)}` : ""}`} submitFor="refund-form" busy={busy} disabled={blocker !== null} why={blocker} whyId="refund-why" onCancel={onClose} testId="refund-submit" />
      )}
    >
      <form id="refund-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4 pb-2" noValidate>
        <p className="text-sm text-slate-700">
          Можно вернуть: <span className="font-semibold tabular-nums text-emerald-700">{formatMoney(refundable)}</span>
        </p>

        <div>
          <label htmlFor="refund-amount" className={LABEL}>Сумма возврата</label>
          <div className="relative">
            <input
              id="refund-amount"
              value={values.amount}
              onChange={(event) => patch({ amount: reformatMoneyTyping(event.target.value) })}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              className={`${FIELD} pr-12`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">сум</span>
          </div>
          <p aria-live="polite" className="mt-1 min-h-[1rem] text-xs text-slate-500">{refundPreviewText(values, refundable)}</p>
        </div>

        <div>
          <span id="refund-method-label" className={LABEL}>Способ возврата</span>
          <div role="radiogroup" aria-labelledby="refund-method-label" className="flex flex-wrap gap-1.5">
            {METHODS.map((method) => (
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

        <div>
          <label htmlFor="refund-reason" className={LABEL}>Причина <span className="font-normal text-slate-500">(необязательно)</span></label>
          <input
            id="refund-reason"
            value={values.reason}
            onChange={(event) => patch({ reason: event.target.value })}
            maxLength={REASON_MAX}
            placeholder="Например: ученик ушёл"
            className={FIELD}
          />
          <p className="mt-1 text-xs text-slate-500">Оплаты остаются в истории, в выписке появится запись о возврате. Её можно отменить.</p>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
