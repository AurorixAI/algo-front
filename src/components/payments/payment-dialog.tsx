"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  formatMoney,
  formatMoneyInput,
  isIsoDate,
  NOTE_MAX,
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
  payError,
  paymentFormFrom,
  previewAmount,
  priceMissing,
  PRICE_NOT_SET_TEXT,
  savedPaymentDetails,
  validatePaymentForm,
  type PaymentFormValues,
} from "@/lib/payments-ledger";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  chipSelected,
  methodChoices,
  noChipsHint,
  payBlocker,
  payButtonLabel,
  planView,
  PLAN_EMPTY_HINT,
  REPLACE_HISTORY_NOTE,
  replaceChangeLine,
  PLAN_LOADING_TEXT,
  QUICK_AMOUNTS_LABEL,
  quickAmounts,
  readLastMethod,
  rememberMethod,
  type PlanView,
} from "@/lib/payment-plan";
import { isLeftDebtOnly, LEFT_DEBT_ONLY_TEXT, leftPaymentProblem } from "@/lib/payments-logica";
import { previewKey, usePaymentPreview } from "@/lib/use-payment-preview";
import { EFFECTS_TITLE } from "@/lib/money-effects";
import { CONFIRM_FOOTER_CLASS, CONFIRM_PRIMARY_BLUE, CONFIRM_PRIMARY_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { groupPriceHref } from "@/lib/group-price";
import { duplicateNotice, PAYMENT_WORDS, rememberFirstSend, type DuplicateNotice, type FirstSend } from "@/lib/send-attempt";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";
import { SegmentedControl } from "@/components/ui/radio";
import { RecalcNote } from "./recalc-note";

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
  onDuplicate?: (notice: DuplicateNotice) => void;
}

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

// UX pack §5.1-бис: the window says whose money it is - the student's, coming INTO the centre (not the salary of a teacher)
const TITLE: Record<PaymentFormKind, string> = {
  create: "Оплата от ученика",
  replace: "Исправить оплату",
};

function emptyValues(): PaymentFormValues {
  return { amount: "", paidOn: "", method: null, note: "", reason: "" };
}

/**
 * «Внести оплату»: the amount is the only thing to decide, so it comes first.  Under it the quick amounts carry what is
 * due («Погасить долг · 592 000 сум», «Долг + октябрь · 1 142 000 сум»); below, ONE block «Что изменится» (UX pack L3) says in the
 * future tense where the money will go (nothing is saved yet): «Долг ученика» - one plain sentence, then a quiet line per period - and, when the pay of the teachers moves, «Зарплата за …».  The
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
  const firstSend = useRef<FirstSend | null>(null); // what the first send of this opening carried (R3: the KEY never changes, only the text of a 409 does)
  const immediate = useRef(false);

  useEffect(() => {
    if (!open || !membership) { setReady(false); return; }
    const start = kind === "replace" && payment
      ? paymentFormFrom(payment)
      : { amount: "", paidOn: today, method: readLastMethod(), note: "", reason: "" };
    setValues(start);
    setCommentOpen(start.note.trim().length > 0);
    amountTouched.current = kind === "replace";
    idempotencyKey.current = newIdempotencyKey(); firstSend.current = null;
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
    let signature = "";
    try {
      const body = buildPaymentPayload(values);
      const reason = values.reason.trim();
      signature = JSON.stringify([body, reason]);
      rememberFirstSend(firstSend, signature, body.amount);
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
        // The first send did arrive: nothing is entered twice; a CHANGED body is told what was recorded (R3)
        onDuplicate?.(duplicateNotice(firstSend.current, signature, formatMoney, PAYMENT_WORDS));
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
      description={kind === "create" ? `${membership.student_name} · ${membership.group_name} · деньги поступают в центр` : `${membership.student_name} · ${membership.group_name}`}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-[520px]"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={saved ? (
        <button type="button" onClick={onClose} data-testid="payment-done" className={`${CONFIRM_PRIMARY_CLASS} ${CONFIRM_PRIMARY_BLUE}`}>
          Готово
        </button>
      ) : (
        <ConfirmFooter
          primary={payButtonLabel(kind, amountNow)}
          submitFor="payment-form"
          disabled={blocker !== null}
          busy={busy}
          why={blocker}
          whyId="payment-blocker"
          onCancel={onClose}
        />
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
          {/* UX pack №13: «Исправить оплату» starts with what is now and what it will be, then ONE sentence about the history - over the fields */}
          {kind === "replace" && payment && <ReplaceHead payment={payment} values={values} />}

          {/* 1. The amount, and the quick amounts that say what is due */}
          <div>
            {kind === "create" && due !== null && due.total > 0 && <p data-testid="payment-debt-now" className="-mt-2 mb-3 text-xs text-slate-600">Долг сейчас: <span className="font-medium tabular-nums">{formatMoney(due.total)}</span></p>}
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
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">сум</span>
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

          {/* 2. What saving will do to the STUDENT (UX pack §5.1): a table - the name on the left, the number on the right; the server's live calculation, future tense */}
          <section aria-label={EFFECTS_TITLE} id="payment-calc" aria-live="polite" data-testid="payment-calc" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
            <div className="mt-2">
              {state.error ? (
                <p role="alert" className="text-xs font-medium text-amber-900">{state.error}</p>
              ) : amountNow === null ? (
                <p className="text-sm text-slate-600" data-testid="payment-plan-hint">{PLAN_EMPTY_HINT}</p>
              ) : plan ? (
                <PlanBlock plan={plan} loading={state.loading} />
              ) : calculating || state.loading ? (
                <PlanSkeleton />
              ) : null}
            </div>
            <RecalcNote lines={latest?.recalc} />
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
              <label htmlFor="payment-reason" className={LABEL}>Причина исправления <span className="font-normal text-slate-500">(необязательно)</span></label>
              <input
                id="payment-reason"
                value={values.reason}
                onChange={(event) => patch({ reason: event.target.value })}
                maxLength={REASON_MAX}
                placeholder="Исправлено"
                className={FIELD}
              />
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

/** The head of the window «Исправить оплату» (UX pack №13): «Было: 400 000 сум · 05.11 · наличные → станет: 200 000 сум» and the sentence about the history. */
export function ReplaceHead({ payment, values }: { payment: EditablePayment; values: PaymentFormValues }) {
  const line = replaceChangeLine(payment, values);
  return (
    <div className="-mt-1 space-y-1.5" data-testid="payment-replace-head">
      <p className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900" data-testid="payment-replace-change">
        <span className="tabular-nums">{line.was}</span>{" "}
        <span className="font-semibold tabular-nums"><span aria-hidden="true" className="font-normal text-slate-500">→</span> {line.becomes}</span>
      </p>
      <p className="text-xs text-slate-600" data-testid="payment-replace-note">{REPLACE_HISTORY_NOTE}</p>
    </div>
  );
}

/** The student's part of «Что изменится» as a table (UX pack §5.1): «Погасит долг за сентябрь · 400 000 сум», «Останется долг · 800 000 сум» (strong), «из них за прошлые месяцы» (muted). */
export function PlanBlock({ plan, loading = false }: { plan: PlanView; loading?: boolean }) {
  return (
    <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : ""}`} data-testid="payment-plan">
      <ul className="space-y-1" aria-label="Что будет с долгом" data-testid="payment-plan-rows">
        {plan.rows.map((row) => (
          <li key={row.key} data-tone={row.tone} className={`flex items-baseline justify-between gap-3 tabular-nums ${row.tone === "strong" ? "text-sm font-semibold text-slate-900" : row.tone === "muted" ? "pl-3 text-xs text-slate-600" : "text-sm text-slate-800"}`}>
            <span className="min-w-0 break-words">{row.label}</span>
            {row.amount !== null && <span className="shrink-0 whitespace-nowrap text-right">{formatMoney(row.amount)}</span>}
          </li>
        ))}
      </ul>
      <p className="sr-only" data-testid="payment-plan-sentence">{plan.sentence}</p>
      {plan.lessons && <p className="text-xs text-slate-600">{plan.lessons}</p>}
      {plan.priceAhead.length > 0 && (
        <div role="note" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{plan.priceAhead.join(" ")}</p>
        </div>
      )}
      {plan.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900">
          {plan.warnings.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}

/** The rows of the table while the calculation is on its way: grey bars of the same size (no jump). */
function PlanSkeleton() {
  return (
    <div role="status" aria-busy="true" data-testid="payment-plan-skeleton" className="space-y-1.5"><span className="sr-only">{PLAN_LOADING_TEXT}</span>
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" /><div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-200" /><div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
    </div>
  );
}
