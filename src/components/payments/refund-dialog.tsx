"use client";

import { useEffect, useMemo, useState } from "react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney, formatMoneyInput, parseMoneyInput, reformatMoneyTyping, REASON_MAX, type MembershipPaymentRow, type RefundCreated } from "@/lib/payments";
import { balanceChangeOf, buildRefundPayload, METHODS, payError, refundPreviewText, validateRefund, type RefundFormValues } from "@/lib/payments-ledger";
import { useDialogAction } from "@/lib/use-dialog-action";
import { useDialogKey } from "@/lib/use-dialog-key";
import { BalanceChangedNotice } from "@/components/money/balance-changed-notice";
import { DialogError } from "@/components/money/dialog-error";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { ReasonField, reasonFieldError } from "@/components/money/reason-field";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/radio";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export const REFUND_ACTION_LABEL = "Вернуть аванс";

/**
 * «Вернуть аванс» (the student leaves): a record of a refund up to the part of the advance that can be given back.  The payments stay; the statement shows the refund.
 * Money-1 V: the reason and the method are the person's (no default, no «other»); the window sends the sum it SHOWED (`expected_refundable`) and one `Idempotency-Key` for the whole opening;
 * a 409 `BALANCE_CHANGED` says «было … сейчас …» and goes on with the new number; a `DUPLICATE_REFUND` is a success.
 */
export function RefundDialog({
  row, studentName, onClose, onDone, onDuplicate,
}: {
  row: MembershipPaymentRow | null;
  studentName: string;
  onClose: () => void;
  onDone: (result: RefundCreated) => void;
  /** The same intention was already written (the same key): the window closes, the caller reads the data again. */
  onDuplicate?: () => void;
}) {
  const [fresh, setFresh] = useState<number | null>(null);
  const refundable = fresh ?? Math.max(0, Math.round(row?.refundable ?? 0));
  const today = useMemo(() => formatBusinessDate(), [row?.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<RefundFormValues>({ amount: "", method: null, reason: "" });
  const [touched, setTouched] = useState(false);
  const [lowered, setLowered] = useState<string | null>(null);
  const { busy, error, setError, closed, run } = useDialogAction(row?.membership_id ?? null);
  const key = useDialogKey(row?.membership_id ?? null);

  useEffect(() => {
    setFresh(null);
    setValues({ amount: formatMoneyInput(Math.max(0, Math.round(row?.refundable ?? 0))), method: null, reason: "" });
    setTouched(false);
    setLowered(null);
  }, [row?.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = balanceChangeOf(error, "refundable");
  const patch = (next: Partial<RefundFormValues>) => { if (!change) setError(null); setLowered(null); setValues((previous) => ({ ...previous, ...next })); };
  const refundAmount = parseMoneyInput(values.amount);
  // the sum changed under the window: the person goes on with the new one first («Продолжить с …»)
  const blocker = row ? validateRefund(values, refundable) ?? (change ? "Сумма изменилась — нажмите «Продолжить»" : null) : null;
  const failure = payError(error);

  const continueWith = (next: number) => {
    setFresh(next);
    setError(null);
    const typed = parseMoneyInput(values.amount);
    if (typed !== null && typed > next) {
      setValues((previous) => ({ ...previous, amount: formatMoneyInput(next) }));
      setLowered(`Сумма уменьшена до ${formatMoney(next)}`);
    }
  };

  const submit = async () => {
    if (!row) return;
    setTouched(true);
    if (validateRefund(values, refundable)) return;
    let created: RefundCreated | null = null;
    let duplicate = false;
    const ok = await run(async () => {
      try {
        created = await orgApi.createRefund(row.membership_id, buildRefundPayload(values, today, refundable), key());
      } catch (cause) {
        if (payError(cause).kind === "duplicate_refund") { duplicate = true; return; }
        throw cause;
      }
    });
    if (!ok) return;
    if (created) onDone(created);
    else if (duplicate) onDuplicate?.();
    onClose();
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
          Можно вернуть: <span className="font-semibold tabular-nums text-slate-900" data-testid="refund-refundable">{formatMoney(refundable)}</span>
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
              disabled={busy}
              className={`${FIELD} pr-12`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">сум</span>
          </div>
          <p aria-live="polite" className="mt-1 min-h-[1rem] text-xs text-slate-500">{lowered ?? refundPreviewText(values, refundable)}</p>
        </div>

        <div>
          <span id="refund-method-label" className={LABEL}>Способ возврата</span>
          {/* re-audit С7: the same control as the payment and the payout; nothing is chosen for the person */}
          <SegmentedControl ariaLabelledBy="refund-method-label" testId="refund-methods" value={values.method} onChange={(next) => patch({ method: next })} options={METHODS.map((method) => ({ value: method.key, label: method.label }))} className={METHODS.length >= 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"} buttonClassName="max-sm:min-h-11" />
        </div>

        <ReasonField
          id="refund-reason"
          value={values.reason}
          onChange={(next) => patch({ reason: next })}
          required
          error={failure.kind === "reason_required" ? failure.message : reasonFieldError(values.reason, touched)}
          onBlur={() => setTouched(values.reason.length > 0)}
          maxLength={REASON_MAX}
          rows={2}
          placeholder="Например: ученик ушёл"
          hint="Оплаты остаются в истории, в выписке появится запись о возврате. Возврат можно отменить."
        />

        {change
          ? <BalanceChangedNotice message={change.message} fresh={change.fresh} emptyText="Возвращать нечего" onContinue={() => continueWith(change.fresh)} onClose={onClose} />
          : failure.kind !== "reason_required" && <DialogError error={error} closed={closed} text={(cause) => payError(cause, "Не удалось оформить возврат").message} onReopened={() => setError(null)} />}
      </form>
    </Modal>
  );
}
