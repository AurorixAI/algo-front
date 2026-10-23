"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  formatMoney,
  formatMoneyInput,
  isIsoDate,
  NOTE_MAX,
  PAY_ACTION_LABEL,
  reformatMoneyTyping,
  REASON_MAX,
  type PaymentOut,
  type PaymentPreview,
  type PaymentSaveResult,
  type PaymentWarning,
} from "@/lib/payments";
import {
  buildPaymentPayload,
  dueView,
  newIdempotencyKey,
  payError,
  paymentFormFrom,
  previewAmount,
  priceMissing,
  PRICE_NOT_SET_TEXT,
  savedPaymentDetails,
  validatePaymentForm,
  type PaymentFormValues,
} from "@/lib/payments-ledger";
import {
  chipSelected,
  methodChoices,
  noChipsHint,
  payBlocker,
  payButtonLabel,
  planView,
  PLAN_EMPTY_HINT,
  PLAN_LOADING_TEXT,
  PLAN_TITLE,
  QUICK_AMOUNTS_LABEL,
  quickAmounts,
  readLastMethod,
  rememberMethod,
  type PlanView,
} from "@/lib/payment-plan";
import { isLeftDebtOnly, LEFT_DEBT_ONLY_TEXT, leftPaymentProblem } from "@/lib/payments-logica";
import { previewKey, usePaymentPreview } from "@/lib/use-payment-preview";
import { groupPriceHref } from "@/lib/group-price";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";
import { SegmentedControl } from "@/components/ui/radio";

export type PaymentFormKind = "create" | "replace";

/** What a correction starts from (the statement knows no more than this about a payment). */
export type EditablePayment = Pick<PaymentOut, "id" | "amount" | "paid_on" | "note"> & Partial<Pick<PaymentOut, "method">>;

/** What the dialog needs to know about the membership it pays for. */
export interface PaymentFormMembership {
  membership_id: string;
  /** With `groupsBasePath`: «задать цену группы» leads to the group when it has no price. */
  group_id?: string;
  student_name: string;
  group_name: string;
}

interface PaymentDialogProps {
  open: boolean;
  kind: PaymentFormKind;
  membership: PaymentFormMembership | null;
  /** The payment being corrected (kind «replace»). */
  payment?: EditablePayment | null;
  /** `/owner/groups` or `/admin/groups`. */
  groupsBasePath?: string;
  onClose: () => void;
  /** Called right after the server accepted the payment (the list refreshes behind the dialog). */
  onSaved: (result: PaymentSaveResult) => void;
  /** The server already has this payment (a repeated send): the caller refreshes and tells so. */
  onDuplicate?: () => void;
}

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

// The title repeats the verb of the button that opened the dialog.
const TITLE: Record<PaymentFormKind, string> = {
  create: PAY_ACTION_LABEL,
  replace: "Исправить оплату",
};

function emptyValues(): PaymentFormValues {
  return { amount: "", paidOn: "", method: null, note: "", reason: "" };
}

/**
 * «Внести оплату»: the amount is the only thing to decide, so it comes first.  Under it the quick amounts carry what is
 * due («Закрыть долг · 592 000 сум», «Долг + октябрь · 1 142 000 сум»); below, «Что будет после сохранения» says in the
 * future tense where the money will go (nothing is saved yet): one plain sentence, then a quiet line per period.  The
 * numbers are the server's live calculation (`payments/preview`); `lib/payment-plan.ts` only words them.  The method is
 * required (the till by method must reconcile) and the last one used in this browser is preselected.
 */
export function PaymentDialog({ open, kind, membership, payment, groupsBasePath, onClose, onSaved, onDuplicate }: PaymentDialogProps) {
  // The business date at the moment the dialog opens (Tashkent, never the browser's zone).
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [values, setValues] = useState<PaymentFormValues>(emptyValues);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ warnings: PaymentWarning[]; details: string[] } | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const amountTouched = useRef(false);
  const amountInput = useRef<HTMLInputElement | null>(null);
  const noteInput = useRef<HTMLTextAreaElement | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());
  const immediate = useRef(false);

  useEffect(() => {
    if (!open || !membership) { setReady(false); return; }
    const start = kind === "replace" && payment
      ? paymentFormFrom(payment)
      : { amount: "", paidOn: today, method: readLastMethod(), note: "", reason: "" };
    setValues(start);
    setCommentOpen(start.note.trim().length > 0);
    amountTouched.current = kind === "replace";
    idempotencyKey.current = newIdempotencyKey();
    setBusy(false);
    setError(null);
    setSaved(null);
    setReady(true);
    // The dialog restarts only when it is opened for another membership or payment.
  }, [open, kind, membership?.membership_id, payment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountNow = previewAmount(values.amount);
  const paidOnOk = isIsoDate(values.paidOn) && values.paidOn <= today;
  const query = useMemo(() => {
    if (!open || !ready || !membership) return null;
    return {
      ...(amountNow !== null ? { amount: amountNow } : {}),
      ...(paidOnOk ? { paid_on: values.paidOn } : {}),
      ...(kind === "replace" && payment ? { replace_payment_id: payment.id } : {}),
    };
  }, [open, ready, membership, amountNow, paidOnOk, values.paidOn, kind, payment]);
  const key = previewKey(query);

  const state = usePaymentPreview({
    enabled: open && ready && Boolean(membership),
    membershipId: membership?.membership_id ?? null,
    query,
    immediate,
    // The amount starts as everything that is due; a field the user has touched is never overwritten.
    onPreview: (answer: PaymentPreview) => {
      if (amountTouched.current || kind !== "create" || answer.suggested_amount <= 0) return;
      amountTouched.current = true;
      immediate.current = true;
      setValues((previous) => (previous.amount ? previous : { ...previous, amount: formatMoneyInput(answer.suggested_amount) }));
      // The first digit typed replaces the suggestion instead of being glued to it.
      setTimeout(() => { if (amountInput.current && document.activeElement === amountInput.current) amountInput.current.select(); }, 0);
    },
  });

  if (!membership) return null;

  const latest = state.preview;
  const fresh = latest && state.previewKey === key ? latest : null;
  const due = dueView(latest);
  // S-5: a student who has left (or an archived one) pays at most his debt; the server says so with `left_debt_only` and refuses more.
  const leftOnly = isLeftDebtOnly(latest);
  const leftDebt = due?.total ?? 0;
  const leftProblem = leftOnly && due !== null ? leftPaymentProblem(amountNow, leftDebt) : null;
  const plan = amountNow !== null ? planView(fresh) : null;
  const calculating = amountNow !== null && !fresh && !state.error;
  const chips = kind === "create" ? quickAmounts(latest, { leftOnly }) : [];
  const priceNote = due !== null && due.rows.length === 0 && priceMissing(latest) ? PRICE_NOT_SET_TEXT : null;
  const calmHint = kind === "create" && !priceNote ? noChipsHint(latest) : null;
  const blocker = payBlocker(values, today, leftProblem);
  const methods = methodChoices(kind === "replace" && payment ? paymentFormFrom(payment).method : null);

  const patch = (next: Partial<PaymentFormValues>) => {
    setError(null);
    setValues((previous) => ({ ...previous, ...next }));
  };
  const setAmount = (amount: number) => {
    amountTouched.current = true;
    patch({ amount: formatMoneyInput(amount) });
  };

  const submit = async () => {
    if (busy || saved) return;
    const problem = validatePaymentForm(values, today) ?? leftProblem;
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const body = buildPaymentPayload(values);
      const reason = values.reason.trim();
      const result = kind === "replace" && payment
        ? await orgApi.replacePayment(payment.id, { ...body, ...(reason ? { reason } : {}) }, idempotencyKey.current)
        : await orgApi.createPayment(membership.membership_id, body, idempotencyKey.current);
      rememberMethod(values.method);
      onSaved(result);
      if (result.warnings.length > 0) setSaved({ warnings: result.warnings, details: savedPaymentDetails(result.allocation) });
      else onClose();
    } catch (cause) {
      const failure = payError(cause, "Не удалось сохранить оплату");
      if (failure.kind === "duplicate") {
        // The first send did arrive: there is nothing to enter again.
        onDuplicate?.();
        onClose();
      } else {
        setError(failure.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={TITLE[kind]}
      description={`${membership.student_name} · ${membership.group_name}`}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-[520px]"
      footerClassName="flex flex-col gap-2 p-5 sm:p-6 pt-4 mt-3"
      footer={saved ? (
        <button type="button" onClick={onClose} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
          Готово
        </button>
      ) : (
        <>
          {blocker && !busy && (
            <p id="payment-blocker" data-testid="payment-blocker" className="text-xs text-slate-500 sm:text-right">{blocker}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              Отмена
            </button>
            <button
              type="submit"
              form="payment-form"
              disabled={busy || blocker !== null}
              aria-describedby={blocker ? "payment-blocker" : undefined}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {payButtonLabel(kind, amountNow)}
            </button>
          </div>
        </>
      )}
    >
      {saved ? (
        <div className="space-y-3 pb-2">
          <p className="text-sm font-medium text-slate-800">Оплата сохранена.</p>
          {saved.details.length > 0 && (
            <ul className="space-y-0.5 text-sm text-slate-600">
              {saved.details.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Обратите внимание
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {saved.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}
            </ul>
          </div>
        </div>
      ) : (
        <form
          id="payment-form"
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
          className="space-y-5 pb-2"
          noValidate
        >
          {/* 1. The amount, and the quick amounts that say what is due */}
          <div>
            <label htmlFor="payment-amount" className={LABEL}>Сумма</label>
            <div className="relative">
              <input
                id="payment-amount"
                ref={amountInput}
                value={values.amount}
                onChange={(event) => { amountTouched.current = true; patch({ amount: reformatMoneyTyping(event.target.value) }); }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                autoFocus
                aria-describedby="payment-calc"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-16 text-2xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">сум</span>
            </div>
            {chips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={QUICK_AMOUNTS_LABEL} data-testid="payment-chips">
                {chips.map((chip) => {
                  const on = chipSelected(chip, amountNow);
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setAmount(chip.amount)}
                      aria-pressed={on}
                      className={`rounded-full border px-3.5 py-1.5 text-left text-xs font-semibold transition-colors ${on ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            )}
            {priceNote && (
              <p className="mt-2.5 text-xs text-slate-600" data-testid="payment-price-note">
                <span className="font-medium text-amber-800">{priceNote}</span>
                {groupsBasePath && membership.group_id && (
                  <>
                    {" · "}
                    <Link href={groupPriceHref(groupsBasePath, membership.group_id)} className="font-semibold text-primary-700 hover:underline">задать цену группы</Link>
                  </>
                )}
              </p>
            )}
            {calmHint && <p className="mt-2.5 text-xs text-slate-500" data-testid="payment-nodebt">{calmHint}</p>}
            {leftOnly && (
              <p role="note" className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900" data-testid="left-debt-only">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{LEFT_DEBT_ONLY_TEXT}{leftDebt > 0 ? `: не больше ${formatMoney(leftDebt)}` : "; долга нет — принимать нечего"}</span>
              </p>
            )}
          </div>

          {/* 2. What saving will do: the server's live calculation, in the future tense */}
          <section aria-labelledby="payment-plan-title" id="payment-calc" aria-live="polite" data-testid="payment-calc">
            <h3 id="payment-plan-title" className={LABEL}>{PLAN_TITLE}</h3>
            {state.error ? (
              <p role="alert" className="text-xs font-medium text-rose-700">{state.error}</p>
            ) : amountNow === null ? (
              <p className="text-sm text-slate-500" data-testid="payment-plan-hint">{PLAN_EMPTY_HINT}</p>
            ) : plan ? (
              <PlanBlock plan={plan} loading={state.loading} />
            ) : calculating || state.loading ? (
              <p className="flex items-center gap-1.5 text-sm text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />{PLAN_LOADING_TEXT}</p>
            ) : null}
          </section>

          {/* 3. Method (its own full-width row: all five on one line; on a phone 3 + 2 of equal width) and, on the next row, the date */}
          <div>
            <span id="payment-method-label" className={LABEL}>Способ оплаты</span>
            <SegmentedControl
              ariaLabelledBy="payment-method-label"
              testId="payment-methods"
              value={values.method}
              onChange={(key) => patch({ method: key })}
              options={methods.map((method) => ({ value: method.key, label: method.label }))}
              className="grid-cols-3 sm:grid-cols-5"
            />
          </div>
          <div className="sm:w-44">
            <label htmlFor="payment-paid-on" className={LABEL}>Дата оплаты</label>
            <DateInput
              id="payment-paid-on"
              value={values.paidOn}
              max={today}
              onChange={(next) => patch({ paidOn: next })}
              className={FIELD}
            />
          </div>

          {/* 4. A comment, only when wanted */}
          {commentOpen || values.note ? (
            <div>
              <label htmlFor="payment-note" className={LABEL}>Комментарий</label>
              <textarea
                id="payment-note"
                ref={noteInput}
                value={values.note}
                onChange={(event) => patch({ note: event.target.value })}
                maxLength={NOTE_MAX}
                rows={2}
                className={`${FIELD} resize-none`}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setCommentOpen(true); setTimeout(() => noteInput.current?.focus(), 0); }}
              className="-mt-2 flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Комментарий
            </button>
          )}

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
              <p className="mt-1 text-xs text-slate-500">
                Прежняя запись будет отменена и останется в истории серым. Деньги всей группы распределятся заново: расчёт выше уже без неё.
              </p>
            </div>
          )}

          {leftProblem && !error && amountNow !== null && (
            <p role="alert" className="text-xs font-medium text-rose-700">{leftProblem}</p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>
          )}
        </form>
      )}
    </Modal>
  );
}

/** «Что будет после сохранения»: one plain sentence in the future tense, then a quiet line per period (never a «…» range). */
export function PlanBlock({ plan, loading = false }: { plan: PlanView; loading?: boolean }) {
  return (
    <div className={`space-y-2.5 rounded-xl bg-slate-50 px-3.5 py-3 transition-opacity ${loading ? "opacity-60" : ""}`} data-testid="payment-plan">
      <p className="text-sm font-medium leading-snug text-slate-900" data-testid="payment-plan-sentence">{plan.sentence}</p>
      {plan.lines.length > 0 && (
        <ul className="space-y-1 border-t border-slate-200 pt-2 text-xs" aria-label="Разбивка" data-testid="payment-plan-lines">
          {plan.lines.map((line) => (
            <li key={line.key} className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 ${line.bucket === "advance" ? "text-emerald-800" : "text-slate-600"}`}>{line.label}</span>
              <span className="shrink-0 text-right tabular-nums text-slate-700">{formatMoney(line.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {plan.lessons && <p className="text-xs text-slate-500">{plan.lessons}</p>}
      {plan.priceAhead.length > 0 && (
        <div role="note" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{plan.priceAhead.join(" ")}</p>
        </div>
      )}
      {plan.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
          {plan.warnings.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}
