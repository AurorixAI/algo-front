"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
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
  METHODS,
  newIdempotencyKey,
  payError,
  paymentFormFrom,
  previewAmount,
  priceMissing,
  PRICE_NOT_SET_TEXT,
  previewView,
  savedPaymentDetails,
  validatePaymentForm,
  type DueView,
  type PaymentFormValues,
  type PreviewView,
} from "@/lib/payments-ledger";
import { isLeftDebtOnly, LEFT_DEBT_ONLY_TEXT, leftPaymentProblem } from "@/lib/payments-logica";
import { previewKey, usePaymentPreview } from "@/lib/use-payment-preview";
import { groupPriceHref } from "@/lib/group-price";
import { Modal } from "@/components/ui/modal";

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

const LINE_TONE = { past_debt: "text-slate-800", current: "text-slate-800", advance: "text-emerald-800" } as const;

function emptyValues(): PaymentFormValues {
  return { amount: "", paidOn: "", method: null, note: "", reason: "" };
}

/**
 * «Внести оплату»: the amount is the only thing to decide.  The top block says what is due (debt, the running period,
 * the total); under the amount a live calculation (the server's «что закроет») shows where the money goes - which past
 * debt it closes, how much goes to the running period, what becomes an advance, until when it is paid.  The server
 * writes the sentences; nothing here recomputes them.
 */
export function PaymentDialog({ open, kind, membership, payment, groupsBasePath, onClose, onSaved, onDuplicate }: PaymentDialogProps) {
  // The business date at the moment the dialog opens (Tashkent, never the browser's zone).
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [values, setValues] = useState<PaymentFormValues>(emptyValues);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ warnings: PaymentWarning[]; details: string[] } | null>(null);
  const amountTouched = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());
  const immediate = useRef(false);

  useEffect(() => {
    if (!open || !membership) { setReady(false); return; }
    setValues(kind === "replace" && payment
      ? paymentFormFrom(payment)
      : { amount: "", paidOn: today, method: null, note: "", reason: "" });
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
  const view = amountNow !== null ? previewView(fresh) : null;
  const calculating = amountNow !== null && !fresh && !state.error;

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

  const showQuick = kind === "create" && due !== null && due.pastDebt > 0 && due.currentDue > 0;

  return (
    <Modal
      open={open}
      title={TITLE[kind]}
      description={`${membership.student_name} · ${membership.group_name}`}
      onClose={onClose}
      busy={busy}
      footer={saved ? (
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
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {kind === "replace" ? "Сохранить исправление" : "Сохранить"}
          </button>
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
          className="space-y-4 pb-2"
          noValidate
        >
          {/* What is due now */}
          <DueBlock
            due={due}
            error={state.error}
            priceNote={due !== null && due.rows.length === 0 && priceMissing(latest)
              ? { text: PRICE_NOT_SET_TEXT, href: groupsBasePath && membership.group_id ? groupPriceHref(groupsBasePath, membership.group_id) : null }
              : null}
          />

          {leftOnly && (
            <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900" data-testid="left-debt-only">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{LEFT_DEBT_ONLY_TEXT}{leftDebt > 0 ? `: не больше ${formatMoney(leftDebt)}` : "; долга нет — принимать нечего"}</span>
            </p>
          )}

          {/* The amount */}
          <div>
            <label htmlFor="payment-amount" className={LABEL}>Сумма</label>
            <div className="relative">
              <input
                id="payment-amount"
                value={values.amount}
                onChange={(event) => { amountTouched.current = true; patch({ amount: reformatMoneyTyping(event.target.value) }); }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="450 000"
                autoFocus
                aria-describedby="payment-calc"
                className={`${FIELD} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">сум</span>
            </div>
            {showQuick && due && (
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Быстрая сумма">
                <button
                  type="button"
                  onClick={() => setAmount(due.pastDebt)}
                  aria-pressed={amountNow === due.pastDebt}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${amountNow === due.pastDebt ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  Только долг · {formatMoney(due.pastDebt)}
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(due.total)}
                  aria-pressed={amountNow === due.total}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${amountNow === due.total ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  Долг и текущий период · {formatMoney(due.total)}
                </button>
              </div>
            )}
          </div>

          {/* Where the money goes: the server's live calculation */}
          <div id="payment-calc" aria-live="polite" data-testid="payment-calc" className="min-h-[1.25rem] text-sm">
            {amountNow === null ? (
              <p className="text-xs text-slate-500">Введите сумму — покажем, куда она пойдёт.</p>
            ) : state.error ? (
              <p role="alert" className="text-xs font-medium text-rose-700">{state.error}</p>
            ) : view ? (
              <PreviewBlock view={view} loading={state.loading} />
            ) : calculating || state.loading ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Считаем, куда пойдут деньги…</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
            <div>
              <label htmlFor="payment-paid-on" className={LABEL}>Дата оплаты</label>
              <input
                id="payment-paid-on"
                type="date"
                value={values.paidOn}
                max={today}
                onChange={(event) => patch({ paidOn: event.target.value })}
                className={FIELD}
              />
            </div>
            <div>
              <span id="payment-method-label" className={LABEL}>Способ оплаты</span>
              <div role="radiogroup" aria-labelledby="payment-method-label" className="flex flex-wrap gap-1.5">
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

/** The block above the amount: what is due now (debt, the running period, the total); a quiet line when nothing is due. */
export function DueBlock({ due, error, priceNote }: { due: DueView | null; error: string | null; priceNote: { text: string; href: string | null } | null }) {
  return (
    <section aria-label="К оплате" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm" data-testid="payment-due">
      {due === null ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          {error ? <span className="text-rose-700">{error}</span> : <><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем, сколько нужно оплатить…</>}
        </p>
      ) : due.rows.length === 0 ? (
        priceNote ? (
          <p className="text-slate-700">
            <span className="font-medium text-amber-800">{priceNote.text}</span>
            {priceNote.href && (
              <>
                {" · "}
                <Link href={priceNote.href} className="font-semibold text-primary-700 hover:underline">задать цену группы</Link>
              </>
            )}
          </p>
        ) : (
          <p className="text-slate-700">Долга нет. Всё, что внесёте, пойдёт на следующие периоды.</p>
        )
      ) : (
        <dl className="space-y-1.5">
          {due.rows.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0">
                <span className={row.key === "debt" ? "font-medium text-rose-700" : row.key === "advance" ? "font-medium text-emerald-700" : "font-medium text-slate-800"}>{row.label}</span>
                {row.note && <span className="ml-1.5 text-xs text-slate-500">{row.note}</span>}
              </dt>
              <dd className="shrink-0 tabular-nums text-slate-800">{formatMoney(row.amount)}</dd>
            </div>
          ))}
          {due.total > 0 && (
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1.5">
              <dt className="font-semibold text-slate-900">Всего к оплате</dt>
              <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(due.total)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

/** The live calculation: the server's sentence, one line per period, until when it is paid, what is left, the price rise. */
export function PreviewBlock({ view, loading = false }: { view: PreviewView; loading?: boolean }) {
  return (
    <div className={`space-y-2 rounded-xl border border-primary-100 bg-primary-50/50 px-3.5 py-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {view.headline && <p className="font-medium text-slate-900">{view.headline}</p>}
      {view.lines.length > 0 && (
        <ul className="space-y-1 text-xs">
          {view.lines.map((line, index) => (
            <li key={`${line.label}-${index}`} className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 ${LINE_TONE[line.bucket]}`}>{line.label}</span>
              <span className="shrink-0 text-right tabular-nums text-slate-700">
                {formatMoney(line.amount)}
                {!line.closes && line.remainingAfter !== null && line.remainingAfter > 0 && (
                  <span className="block text-[11px] text-slate-500">по периоду осталось {formatMoney(line.remainingAfter)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-0.5 text-xs text-slate-600">
        {view.paidUntil && <p>{view.paidUntil}</p>}
        {view.lessons && <p>{view.lessons}</p>}
        <p className={view.remaining.kind === "debt" ? "font-medium text-rose-700" : view.remaining.kind === "advance" ? "font-medium text-emerald-700" : ""}>{view.remaining.text}</p>
      </div>
      {view.priceAhead.length > 0 && (
        <div role="note" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{view.priceAhead.join(" ")}</p>
        </div>
      )}
      {view.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
          {view.warnings.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}
