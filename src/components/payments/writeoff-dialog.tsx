"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney, reformatMoneyTyping, REASON_MAX, type MembershipPaymentRow, type WriteoffCreated } from "@/lib/payments";
import { buildWriteoffPayload, payError, validateWriteoff, writeoffPreviewText, type WriteoffFormValues } from "@/lib/payments-ledger";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/radio";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export const WRITEOFF_ACTION_LABEL = "Простить долг";

/**
 * «Простить долг» (a concession, an illness, an agreement): an amount up to the debt or the whole debt, and a reason
 * that stays in the statement and the audit.  The owner and the administrator the owner allowed.
 */
export function WriteoffDialog({
  row, studentName, onClose, onDone,
}: {
  /** The membership; null keeps the dialog closed. */
  row: MembershipPaymentRow | null;
  studentName: string;
  onClose: () => void;
  onDone: (result: WriteoffCreated) => void;
}) {
  const debt = Math.max(0, Math.round(row?.debt ?? 0));
  const today = useMemo(() => formatBusinessDate(), [row?.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<WriteoffFormValues>({ amount: "", all: true, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues({ amount: "", all: true, reason: "" });
    setBusy(false);
    setError(null);
  }, [row?.membership_id]);

  const patch = (next: Partial<WriteoffFormValues>) => { setError(null); setValues((previous) => ({ ...previous, ...next })); };

  const submit = async () => {
    if (!row || busy) return;
    const problem = validateWriteoff(values, debt);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.createWriteoff(row.membership_id, buildWriteoffPayload(values, today));
      onDone(result);
      onClose();
    } catch (cause) {
      setError(payError(cause, "Не удалось простить долг").message);
    } finally {
      setBusy(false);
    }
  };

  const preview = writeoffPreviewText(values, debt);

  return (
    <Modal
      open={row !== null}
      title={WRITEOFF_ACTION_LABEL}
      description={row ? `${studentName} · ${row.group_name}` : undefined}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="writeoff-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Простить долг
          </button>
        </>
      }
    >
      <form id="writeoff-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4 pb-2" noValidate>
        <p className="text-sm text-slate-700">
          Долг: <span className="font-semibold tabular-nums text-rose-700">{formatMoney(debt)}</span>
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
                placeholder="50 000"
                className={`${FIELD} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">сум</span>
            </div>
          )}
          <p aria-live="polite" className="min-h-[1rem] text-xs text-slate-500">{preview}</p>
        </fieldset>

        <div>
          <label htmlFor="writeoff-reason" className={LABEL}>Причина</label>
          <textarea
            id="writeoff-reason"
            value={values.reason}
            onChange={(event) => patch({ reason: event.target.value })}
            maxLength={REASON_MAX}
            rows={3}
            autoFocus={values.all}
            placeholder="Например: болезнь, договорённость с родителем"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
          <p className="mt-1 text-xs text-slate-500">Причина и ваше имя останутся в выписке ученика. Прощение можно отменить.</p>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
