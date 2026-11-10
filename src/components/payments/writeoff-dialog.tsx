"use client";

import { useEffect, useMemo, useState } from "react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney, formatMoneyInput, parseMoneyInput, reformatMoneyTyping, REASON_MAX, type MembershipPaymentRow, type WriteoffCreated } from "@/lib/payments";
import { balanceChangeOf, buildWriteoffPayload, payError, validateWriteoff, writeoffAmount, writeoffPreviewText, type WriteoffFormValues } from "@/lib/payments-ledger";
import { useDialogAction } from "@/lib/use-dialog-action";
import { useDialogKey } from "@/lib/use-dialog-key";
import { BalanceChangedNotice } from "@/components/money/balance-changed-notice";
import { DialogError } from "@/components/money/dialog-error";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { ReasonField, reasonFieldError } from "@/components/money/reason-field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/radio";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export const WRITEOFF_ACTION_LABEL = "Простить долг";

/**
 * «Простить долг» (a concession, an illness, an agreement): an amount up to the debt or the whole debt, and a reason
 * that stays in the statement and the audit.  The owner and the administrator the owner allowed.
 */
export function WriteoffDialog({
  row, studentName, onClose, onDone, onDuplicate,
}: {
  /** The membership; null keeps the dialog closed. */
  row: MembershipPaymentRow | null;
  studentName: string;
  onClose: () => void;
  onDone: (result: WriteoffCreated) => void;
  /** The same intention was already written (the same key): the window closes, the caller reads the data again. */
  onDuplicate?: () => void;
}) {
  const [fresh, setFresh] = useState<number | null>(null);
  const debt = fresh ?? Math.max(0, Math.round(row?.debt ?? 0));
  const today = useMemo(() => formatBusinessDate(), [row?.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<WriteoffFormValues>({ amount: "", all: true, reason: "" });
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lowered, setLowered] = useState<string | null>(null);
  const { busy, error, setError, closed, run } = useDialogAction(row?.membership_id ?? null);
  const key = useDialogKey(row?.membership_id ?? null);

  useEffect(() => {
    setFresh(null);
    setValues({ amount: "", all: true, reason: "" });
    setTouched(false);
    setProblem(null);
    setLowered(null);
  }, [row?.membership_id]);

  const change = balanceChangeOf(error, "debt");
  const patch = (next: Partial<WriteoffFormValues>) => { if (!change) setError(null); setProblem(null); setLowered(null); setValues((previous) => ({ ...previous, ...next })); };

  // the debt changed under the window: «Весь долг» takes the new debt by itself, a part that is more than the new debt is set to it
  const continueWith = (next: number) => {
    setFresh(next);
    setError(null);
    const typed = parseMoneyInput(values.amount);
    if (!values.all && typed !== next) {
      setValues((previous) => ({ ...previous, amount: formatMoneyInput(next) }));
      setLowered(typed !== null && typed < next ? `Сумма изменена на ${formatMoney(next)}` : `Сумма уменьшена до ${formatMoney(next)}`);
    }
  };

  const submit = async () => {
    if (!row) return;
    // a reason that is too short is told UNDER ITS FIELD; the other problems (the amount) stay in the banner
    const amountProblem = validateWriteoff({ ...values, reason: "xxx" }, debt);
    if (amountProblem) { setProblem(amountProblem); return; }
    if (reasonFieldError(values.reason, true)) { setTouched(true); return; }
    let created: WriteoffCreated | null = null;
    let duplicate = false;
    const ok = await run(async () => {
      try {
        created = await orgApi.createWriteoff(row.membership_id, buildWriteoffPayload(values, today, debt), key());
      } catch (cause) {
        if (payError(cause).kind === "duplicate_writeoff") { duplicate = true; return; }
        throw cause;
      }
    });
    if (!ok) return;
    if (created) onDone(created);
    else if (duplicate) onDuplicate?.();
    onClose();
  };

  const debtShown = change ? change.fresh : debt;
  const preview = writeoffPreviewText(values, debtShown);

  return (
    <Modal
      open={row !== null}
      title={WRITEOFF_ACTION_LABEL}
      description={row ? `${studentName} · ${row.group_name}` : undefined}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={<ConfirmFooter primary={`${WRITEOFF_ACTION_LABEL}${(() => { const sum = writeoffAmount(values, debtShown); return sum !== null && sum > 0 ? ` ${formatMoney(sum)}` : ""; })()}`} submitFor="writeoff-form" busy={busy} disabled={change !== null} why={null} whyId="writeoff-why" onCancel={onClose} testId="writeoff-submit" />}
    >
      <form id="writeoff-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4 pb-2" noValidate>
        <p className="text-sm text-slate-700">
          Долг: <span className="font-semibold tabular-nums text-rose-700" data-testid="writeoff-debt">{formatMoney(change ? change.fresh : debt)}</span>
        </p>

        <fieldset className="space-y-2">
          <legend className={LABEL}>Сколько простить</legend>
          <SegmentedControl
            ariaLabel="Сколько простить"
            value={values.all ? "all" : "part"}
            onChange={(next) => patch({ all: next === "all" })}
            options={[{ value: "all", label: "Весь долг" }, { value: "part", label: "Часть долга" }]}
            className="grid-cols-2"
            buttonClassName="py-2.5 text-sm"
          />
          {!values.all && (
            <div className="relative">
              <input
                aria-label="Сумма прощения"
                value={values.amount}
                onChange={(event) => patch({ amount: reformatMoneyTyping(event.target.value) })}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                disabled={busy}
                placeholder="50 000"
                className={`${FIELD} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">сум</span>
            </div>
          )}
          <p aria-live="polite" className="min-h-[1rem] text-xs text-slate-500">{lowered ?? preview}</p>
        </fieldset>

        <ReasonField
          id="writeoff-reason"
          value={values.reason}
          onChange={(next) => patch({ reason: next })}
          required
          error={payError(error).kind === "reason_required" ? payError(error).message : reasonFieldError(values.reason, touched)}
          onBlur={() => setTouched(values.reason.length > 0)}
          autoFocus={values.all}
          maxLength={REASON_MAX}
          placeholder="Например: болезнь, договорённость с родителем"
          hint="Причина и ваше имя останутся в выписке ученика. Прощение можно отменить."
        />

        {problem && <Notice variant="error" compact>{problem}</Notice>}
        {change
          ? <BalanceChangedNotice message={change.message} fresh={change.fresh} emptyText="Долга больше нет" onContinue={() => continueWith(change.fresh)} onClose={onClose} />
          : payError(error).kind === "reason_required" ? null : <DialogError error={error} closed={closed} text={(cause) => payError(cause, "Не удалось простить долг").message} onReopened={() => setError(null)} />}
      </form>
    </Modal>
  );
}
