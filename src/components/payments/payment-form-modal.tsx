"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { groupPriceHref } from "@/lib/group-price";
import {
  addMonthMinusDay,
  billingPeriodEndOf,
  buildPaymentPayload,
  buildQuoteQuery,
  defaultValidFrom,
  fixedDayChips,
  fixedDayFallbackFrom,
  formatDateRu,
  paymentFormDefaults,
  periodHint,
  periodModeOf,
  QUOTE_FAILED_NOTE,
  quoteCaption,
  quoteLacksPrice,
  quotePrefill,
  quoteQueryKey,
  reformatMoneyTyping,
  validatePaymentForm,
  MAX_LESSONS,
  NOTE_MAX,
  PAY_ACTION_LABEL,
  PARTIAL_PERIOD_BADGE,
  REASON_MAX,
  type PaymentFormValues,
  type PaymentOut,
  type PaymentQuote,
  type PaymentSaveResult,
  type PaymentWarning,
  type PeriodMode,
} from "@/lib/payments";
import { usePaymentQuote } from "@/lib/use-payment-quote";
import { Modal } from "@/components/ui/modal";

export type PaymentFormKind = "create" | "extend" | "replace";

/** What the form needs to know about the membership it pays for. */
export interface PaymentFormMembership {
  membership_id: string;
  /** With `groupsBasePath`: «задать цену группы» leads to the group when it has no price. */
  group_id?: string;
  student_name: string;
  group_name: string;
  monthly_fee: number | null;
  paid_until: string | null;
}

interface PaymentFormModalProps {
  open: boolean;
  kind: PaymentFormKind;
  membership: PaymentFormMembership | null;
  /** The payment being corrected (kind «replace»). */
  payment?: PaymentOut | null;
  /** Period mode of the center. A correction keeps the mode of the payment it replaces. */
  periodMode: PeriodMode;
  /** Lessons of one payment when known; empty field otherwise (the server applies its setting). */
  lessonsDefault: number | null;
  /** `/owner/groups` or `/admin/groups`. */
  groupsBasePath?: string;
  onClose: () => void;
  /** Called right after the server accepted the payment (the list refreshes behind the dialog). */
  onSaved: (result: PaymentSaveResult) => void;
}

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

// The title repeats the verb of the button that opened the dialog («Внести оплату» / «Продлить»).
const TITLE: Record<PaymentFormKind, string> = {
  create: PAY_ACTION_LABEL.create,
  extend: `${PAY_ACTION_LABEL.extend} оплату`,
  replace: "Исправить оплату",
};

export function PaymentFormModal({
  open, kind, membership, payment, periodMode, lessonsDefault, groupsBasePath, onClose, onSaved,
}: PaymentFormModalProps) {
  const mode: PeriodMode = kind === "replace" ? periodModeOf(payment, periodMode) : periodMode;
  // The business date at the moment the dialog opens (Tashkent, never the browser's zone).
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [values, setValues] = useState<PaymentFormValues>(() => emptyValues());
  // A field the user has touched is never overwritten by a suggestion of the server.
  const [fromTouched, setFromTouched] = useState(false);
  const [toTouched, setToTouched] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  // The form has been filled for this opening: only then the server is asked for a suggestion.
  const [ready, setReady] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<PaymentWarning[] | null>(null);

  useEffect(() => {
    if (!open || !membership) { setReady(false); return; }
    setValues(paymentFormDefaults({
      mode,
      today,
      monthlyFee: membership.monthly_fee,
      paidUntil: membership.paid_until,
      lessonsDefault,
      payment: kind === "replace" ? payment : null,
    }));
    // A correction starts from the payment's own values: nothing in it is a suggestion.
    setFromTouched(kind === "replace");
    setToTouched(kind === "replace");
    setAmountTouched(kind === "replace");
    setPeriodOpen(false);
    setBusy(false);
    setError(null);
    setWarnings(null);
    setReady(true);
    // The form restarts only when it is opened for another membership or payment.
  }, [open, kind, membership?.membership_id, payment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => buildQuoteQuery({
    mode,
    paidOn: values.paidOn,
    validFrom: values.validFrom,
    validTo: values.validTo,
    lessons: values.lessons,
    fromTouched,
    toTouched,
  }), [mode, values.paidOn, values.validFrom, values.validTo, values.lessons, fromTouched, toTouched]);
  const queryKey = quoteQueryKey(query);

  const quoteState = usePaymentQuote({
    enabled: open && ready && Boolean(membership),
    membershipId: membership?.membership_id ?? null,
    query,
    // Runs with the touched flags of the latest render, so a field typed meanwhile is left alone.
    onQuote: (quote: PaymentQuote) => {
      const patch = quotePrefill(quote, { from: fromTouched, to: toTouched, amount: amountTouched }, mode);
      if (Object.keys(patch).length > 0) setValues((previous) => ({ ...previous, ...patch }));
    },
  });
  const { quote, loading: quoteLoading, failed: quoteFailed } = quoteState;
  // The answer is about the form on screen only while the queries are the same.
  const fresh = quote && quoteState.quoteKey === queryKey ? quote : null;
  // The center counts by one day of the month: known from the first answer on.
  const fixedDay = mode === "calendar" && quote?.billing_anchor === "fixed_day" ? quote.billing_day : null;
  const defaultTo = (from: string) => (fixedDay ? billingPeriodEndOf(from, fixedDay) : addMonthMinusDay(from));

  // Without an answer the form falls back to a local calculation: the center's day once an answer has told it,
  // otherwise a month from the payment date.  An amount that came from an answer about other dates is not kept.
  const paidOnNow = values.paidOn;
  useEffect(() => {
    if (!quoteFailed || !membership || !paidOnNow) return;
    setValues((previous) => {
      const next: PaymentFormValues = { ...previous };
      if (!fromTouched) {
        next.validFrom = mode !== "calendar"
          ? paidOnNow
          : fixedDay ? fixedDayFallbackFrom(paidOnNow, membership.paid_until, fixedDay) : defaultValidFrom(paidOnNow, membership.paid_until);
      }
      if (mode === "calendar" && !toTouched && next.validFrom) next.validTo = defaultTo(next.validFrom);
      if (!amountTouched && quote) next.amount = "";
      return next;
    });
    // Only a new failure restarts the fallback.
  }, [quoteFailed, paidOnNow]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!membership) return null;

  // Untouched fields may still be filled by the answer that is on its way.
  const waitingForQuote = quoteLoading && !(fromTouched && (mode === "lessons" || toTouched) && amountTouched);

  const patch = (next: Partial<PaymentFormValues>) => {
    setError(null);
    setValues((previous) => ({ ...previous, ...next }));
  };

  const changePaidOn = (paidOn: string) => {
    const next: Partial<PaymentFormValues> = { paidOn };
    // With one center day the server knows the period (it may depend on the lessons already paid);
    // the dates stay until its answer comes instead of jumping to a wrong guess and back.
    if (!fixedDay) {
      let validFrom = values.validFrom;
      if (!fromTouched && paidOn) {
        validFrom = mode === "calendar" ? defaultValidFrom(paidOn, membership.paid_until) : paidOn;
        next.validFrom = validFrom;
      }
      if (mode === "calendar" && !toTouched && validFrom) next.validTo = addMonthMinusDay(validFrom);
    }
    patch(next);
  };

  const changeValidFrom = (validFrom: string) => {
    setFromTouched(true);
    const next: Partial<PaymentFormValues> = { validFrom };
    if (mode === "calendar" && !toTouched && validFrom) next.validTo = defaultTo(validFrom);
    patch(next);
  };

  const changeValidTo = (validTo: string) => {
    setToTouched(true);
    patch({ validTo });
  };

  const submit = async () => {
    if (busy || warnings || waitingForQuote) return;
    const problem = validatePaymentForm(values, mode, today);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const body = buildPaymentPayload(values, mode);
      const reason = values.reason.trim();
      const result = kind === "replace" && payment
        ? await orgApi.replacePayment(payment.id, { ...body, ...(reason ? { reason } : {}) })
        : await orgApi.createPayment(membership.membership_id, body);
      onSaved(result);
      if (result.warnings && result.warnings.length > 0) setWarnings(result.warnings);
      else onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить оплату");
    } finally {
      setBusy(false);
    }
  };

  const hint = periodHint(values, mode);
  const reversed = mode === "calendar" && values.validFrom && values.validTo && values.validTo < values.validFrom;

  return (
    <Modal
      open={open}
      title={TITLE[kind]}
      description={`${membership.student_name} · ${membership.group_name}`}
      onClose={onClose}
      busy={busy}
      footer={warnings ? (
        <button type="button" onClick={onClose} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
          Готово
        </button>
      ) : (
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Отмена
          </button>
          <button
            type="submit"
            form="payment-form"
            disabled={busy || waitingForQuote}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {kind === "replace" ? "Сохранить исправление" : "Сохранить"}
          </button>
        </>
      )}
    >
      {warnings ? (
        <div className="space-y-3 pb-2">
          <p className="text-sm font-medium text-slate-800">Оплата сохранена.</p>
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Обратите внимание
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}
            </ul>
          </div>
        </div>
      ) : (
        <form
          id="payment-form"
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
          className="space-y-3.5 pb-2"
          noValidate
        >
          <div>
            <label htmlFor="payment-amount" className={LABEL}>Сумма</label>
            <div className="relative">
              <input
                id="payment-amount"
                value={values.amount}
                onChange={(event) => { setAmountTouched(true); patch({ amount: reformatMoneyTyping(event.target.value) }); }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="450 000"
                autoFocus
                aria-describedby="payment-amount-note"
                className={`${FIELD} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">сум</span>
            </div>
            <p id="payment-amount-note" aria-live="polite" className="mt-1 min-h-[1rem] text-xs text-slate-500">
              {waitingForQuote ? (
                <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Считаем сумму…</span>
              ) : quoteFailed ? (
                <span className="text-amber-700">{QUOTE_FAILED_NOTE}</span>
              ) : fresh ? (
                <>
                  {quoteCaption(fresh)}
                  {quoteLacksPrice(fresh) && groupsBasePath && membership.group_id && (
                    <>
                      {" · "}
                      <Link href={groupPriceHref(groupsBasePath, membership.group_id)} className="font-semibold text-primary-700 hover:underline">задать цену группы</Link>
                    </>
                  )}
                  {fresh.price?.source === "override" && <span className="text-primary-700"> · по индивидуальной цене ученика</span>}
                </>
              ) : ""}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="payment-paid-on" className={LABEL}>Дата оплаты</label>
              <input
                id="payment-paid-on"
                type="date"
                value={values.paidOn}
                max={today}
                onChange={(event) => changePaidOn(event.target.value)}
                className={FIELD}
              />
            </div>
            {mode === "calendar" ? (
              <div>
                <label htmlFor="payment-valid-to" className={LABEL}>Оплачено до</label>
                <input
                  id="payment-valid-to"
                  type="date"
                  value={values.validTo}
                  onChange={(event) => changeValidTo(event.target.value)}
                  className={FIELD}
                />
              </div>
            ) : (
              <div>
                <label htmlFor="payment-lessons" className={LABEL}>Уроков</label>
                <input
                  id="payment-lessons"
                  type="number"
                  min={1}
                  max={MAX_LESSONS}
                  step={1}
                  inputMode="numeric"
                  value={values.lessons}
                  onChange={(event) => patch({ lessons: event.target.value })}
                  placeholder="как в настройках"
                  className={FIELD}
                />
              </div>
            )}
          </div>

          {mode === "calendar" && fixedDay !== null && (() => {
            const chips = fixedDayChips(values.validFrom, values.validTo, fixedDay);
            if (!chips) return null;
            const chip = "rounded-full border px-3 py-1 text-xs font-semibold transition-colors";
            const on = "border-primary-300 bg-primary-50 text-primary-800";
            const off = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
            return (
              <div className="-mt-1 flex flex-wrap gap-2" role="group" aria-label="Оплачено до: быстрый выбор">
                <button type="button" aria-pressed={values.validTo === chips.toEnd} onClick={() => changeValidTo(chips.toEnd)} className={`${chip} ${values.validTo === chips.toEnd ? on : off}`}>
                  До конца месяца ({formatDateRu(chips.toEnd).slice(0, 5)})
                </button>
                <button type="button" aria-pressed={values.validTo === chips.plusNext} onClick={() => changeValidTo(chips.plusNext)} className={`${chip} ${values.validTo === chips.plusNext ? on : off}`}>
                  + следующий месяц ({formatDateRu(chips.plusNext).slice(0, 5)})
                </button>
              </div>
            );
          })()}

          {mode === "calendar" && (
            <p className={`-mt-1 text-xs ${reversed ? "font-medium text-rose-700" : "text-slate-500"}`}>
              {reversed
                ? "«Оплачено до» раньше начала периода"
                : hint
                  ? `${hint} · ${formatDateRu(values.validFrom)} — ${formatDateRu(values.validTo)}`
                  : " "}
              {!reversed && fresh?.partial && (
                <span className="ml-2 inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-amber-800">{PARTIAL_PERIOD_BADGE}</span>
              )}
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setPeriodOpen((value) => !value)}
              aria-expanded={periodOpen}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${periodOpen ? "rotate-180" : ""}`} />
              {mode === "calendar" ? "Период с" : "Уроки считаются с"} {formatDateRu(values.validFrom)}
            </button>
            {periodOpen && (
              <input
                type="date"
                aria-label="Начало периода"
                value={values.validFrom}
                onChange={(event) => changeValidFrom(event.target.value)}
                className={`${FIELD} mt-2 sm:w-1/2`}
              />
            )}
          </div>

          <div>
            <label htmlFor="payment-note" className={LABEL}>Комментарий <span className="font-normal text-slate-400">(необязательно)</span></label>
            <input
              id="payment-note"
              value={values.note}
              onChange={(event) => patch({ note: event.target.value })}
              maxLength={NOTE_MAX}
              className={FIELD}
            />
          </div>

          {kind === "replace" && (
            <div>
              <label htmlFor="payment-reason" className={LABEL}>Причина исправления <span className="font-normal text-slate-400">(необязательно)</span></label>
              <input
                id="payment-reason"
                value={values.reason}
                onChange={(event) => patch({ reason: event.target.value })}
                maxLength={REASON_MAX}
                placeholder="Исправлено"
                className={FIELD}
              />
              <p className="mt-1 text-xs text-slate-400">Прежняя запись будет отменена и останется в истории серым.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>
          )}
        </form>
      )}
    </Modal>
  );
}

function emptyValues(): PaymentFormValues {
  return { amount: "", paidOn: "", validFrom: "", validTo: "", lessons: "", note: "", reason: "" };
}
