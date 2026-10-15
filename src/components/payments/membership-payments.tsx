"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Pencil, X, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  carriedOutLabel,
  formatDateRu,
  formatMoney,
  formatMoneyInput,
  isCarryOver,
  paymentAmountLabel,
  paymentPeriodLabel,
  parseMonthlyFee,
  reformatMoneyTyping,
  statusDetail,
  statusLabel,
  statusTone,
  STATUS_TONE_CLASS,
  type MembershipPaymentRow,
  type PaymentOut,
  type PaymentSaveResult,
  type PeriodMode,
} from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { PaymentFormModal, type PaymentFormKind } from "./payment-form-modal";
import { PaymentVoidModal } from "./payment-void-modal";

const HISTORY_PREVIEW = 5;

interface MembershipPaymentsProps {
  row: MembershipPaymentRow;
  studentName: string;
  periodMode: PeriodMode;
  lessonsDefault: number | null;
  /** The server accepted a change: the parent replaces the row it holds. */
  onRowChange: (row: MembershipPaymentRow) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}

/**
 * Money of one membership inside the «Группы» block of the student card: monthly fee,
 * status, payment history (cancelled ones grey) and the actions Внести / Исправить / Отменить.
 * Rendered only for roles that may see money, and only while the server says so.
 */
export function MembershipPayments({ row, studentName, periodMode, lessonsDefault, onRowChange, onNotify }: MembershipPaymentsProps) {
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const editable = row.is_active;

  const [editingFee, setEditingFee] = useState(false);
  const [feeText, setFeeText] = useState("");
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PaymentOut[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const historyRequests = useRef(createRequestSequence());

  const [form, setForm] = useState<{ kind: PaymentFormKind; payment: PaymentOut | null } | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentOut | null>(null);

  const loadHistory = useCallback(async () => {
    const token = historyRequests.current.next();
    setHistoryError(null);
    try {
      const list = await orgApi.listMembershipPayments(row.membership_id, true);
      if (historyRequests.current.isCurrent(token)) setHistory(Array.isArray(list) ? list : []);
    } catch (error) {
      if (historyRequests.current.isCurrent(token)) setHistoryError(error instanceof Error ? error.message : "Не удалось загрузить историю");
    }
  }, [row.membership_id]);

  useEffect(() => {
    if (historyOpen) void loadHistory();
  }, [historyOpen, loadHistory]);

  const changed = (next: MembershipPaymentRow) => {
    onRowChange(next);
    void refreshSummary(true);
    if (historyOpen) void loadHistory();
  };

  const startFeeEdit = () => {
    setFeeText(formatMoneyInput(row.monthly_fee));
    setFeeError(null);
    setEditingFee(true);
  };

  const saveFee = async () => {
    if (feeBusy) return;
    const parsed = parseMonthlyFee(feeText);
    if (parsed.error) { setFeeError(parsed.error); return; }
    setFeeBusy(true);
    setFeeError(null);
    try {
      const next = await orgApi.setMembershipFee(row.membership_id, parsed.value);
      setEditingFee(false);
      changed(next);
      onNotify("Оплата в месяц сохранена");
    } catch (error) {
      setFeeError(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setFeeBusy(false);
    }
  };

  const onSaved = (result: PaymentSaveResult) => {
    changed(result.row);
    onNotify(form?.kind === "replace" ? "Оплата исправлена" : "Оплата внесена");
  };

  const tone = STATUS_TONE_CLASS[statusTone(row.status)];
  const detail = statusDetail(row);
  const visible = history ? (showAll ? history : history.slice(0, HISTORY_PREVIEW)) : [];

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200/70 pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xs text-slate-500">Оплата в месяц</span>
          {editingFee ? (
            <form
              onSubmit={(event) => { event.preventDefault(); void saveFee(); }}
              className="flex items-center gap-1.5"
              noValidate
            >
              <input
                value={feeText}
                onChange={(event) => { setFeeError(null); setFeeText(reformatMoneyTyping(event.target.value)); }}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                aria-label="Оплата в месяц, сум"
                placeholder="450 000"
                className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
              />
              <button type="submit" disabled={feeBusy} aria-label="Сохранить" className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                {feeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setEditingFee(false)} disabled={feeBusy} aria-label="Отмена" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <>
              <span className="font-semibold tabular-nums text-slate-900">{row.monthly_fee !== null ? formatMoney(row.monthly_fee) : "не указана"}</span>
              {editable && (
                <button type="button" onClick={startFeeEdit} aria-label="Изменить оплату в месяц" title="Изменить" className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${tone}`}>{statusLabel(row)}</span>
            {detail && <span className="text-[11px] text-slate-400">{detail}</span>}
          </div>
        )}

        {editable && (
          <button
            type="button"
            onClick={() => setForm({ kind: row.last_payment ? "extend" : "create", payment: null })}
            className="ml-auto rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
          >
            {row.last_payment ? "Продлить" : "Внести"}
          </button>
        )}
      </div>
      {feeError && <p role="alert" className="text-xs font-medium text-rose-700">{feeError}</p>}

      <div>
        <button
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
          aria-expanded={historyOpen}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          История оплат
        </button>

        {historyOpen && (
          <div className="mt-2">
            {historyError ? (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {historyError}{" "}
                <button type="button" onClick={() => void loadHistory()} className="underline">Повторить</button>
              </p>
            ) : history === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400">Оплат пока нет</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {visible.map((payment) => (
                    <HistoryItem
                      key={payment.id}
                      payment={payment}
                      editable={editable}
                      onCorrect={() => setForm({ kind: "replace", payment })}
                      onVoid={() => setVoidTarget(payment)}
                    />
                  ))}
                </ul>
                {history.length > HISTORY_PREVIEW && !showAll && (
                  <button type="button" onClick={() => setShowAll(true)} className="mt-1.5 text-xs font-semibold text-primary-700 hover:underline">
                    Показать все ({history.length})
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <PaymentFormModal
        open={form !== null}
        kind={form?.kind ?? "create"}
        membership={{
          membership_id: row.membership_id,
          student_name: studentName,
          group_name: row.group_name,
          monthly_fee: row.monthly_fee,
          paid_until: row.paid_until,
        }}
        payment={form?.payment ?? null}
        periodMode={periodMode}
        lessonsDefault={lessonsDefault}
        onClose={() => setForm(null)}
        onSaved={onSaved}
      />
      <PaymentVoidModal
        payment={voidTarget}
        studentName={studentName}
        onClose={() => setVoidTarget(null)}
        onVoided={(result) => { changed(result.row); onNotify("Оплата отменена"); }}
      />
    </div>
  );
}

function HistoryItem({
  payment, editable, onCorrect, onVoid,
}: {
  payment: PaymentOut;
  editable: boolean;
  onCorrect: () => void;
  onVoid: () => void;
}) {
  const voided = Boolean(payment.voided_at);
  const carried = isCarryOver(payment);
  // A carry-over is not corrected - the payment it was made from is; it can only be cancelled.
  const items: RowMenuItem[] = voided || !editable ? [] : [
    ...(carried ? [] : [{ key: "correct", label: "Исправить", icon: Pencil, onSelect: onCorrect } as RowMenuItem]),
    { key: "void", label: "Отменить", icon: XCircle, danger: true, onSelect: onVoid },
  ];
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className={`min-w-0 text-xs ${voided ? "text-slate-400" : "text-slate-700"}`}>
        <p className={voided ? "line-through" : ""}>
          <span className={`font-semibold ${carried ? "" : "tabular-nums"}`}>{paymentAmountLabel(payment)}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {carried ? "оплата от" : "оплачено"} {formatDateRu(payment.paid_on)}
        </p>
        <p className={voided ? "line-through" : "text-slate-500"}>{paymentPeriodLabel(payment)}</p>
        {!voided && payment.carried_out && <p className="text-[11px] text-slate-500">{carriedOutLabel(payment)}</p>}
        {/* The note of a carry-over only repeats «перенос из …». */}
        {payment.note && !carried && <p className="break-words text-slate-500">{payment.note}</p>}
        <p className="text-[11px] text-slate-400">
          {[payment.created_by_name, payment.replaces_payment_id ? "исправление" : ""].filter(Boolean).join(" · ")}
        </p>
        {voided && (
          <p className="text-[11px] text-slate-500">
            Отменена: {payment.void_reason || "без причины"}
            {payment.voided_by_name ? ` · ${payment.voided_by_name}` : ""}
          </p>
        )}
      </div>
      <RowMenu items={items} label={`Действия с оплатой от ${formatDateRu(payment.paid_on)}`} width={200} />
    </li>
  );
}
