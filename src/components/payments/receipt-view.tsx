"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, Printer, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatUtcNaiveAsBusinessDate } from "@/lib/business-time";
import {
  formatDateRu,
  formatMoney,
  paymentPeriodLabel,
  PARTIAL_PERIOD_TAG,
  receiptContextOf,
  receiptContextWithFallback,
  receiptErrorText,
  receiptReplacedNote,
  receiptReplacesNote,
  receiptTitle,
  RECEIPT_VOID_STAMP,
  type ReceiptOut,
} from "@/lib/payments";
import { receiptFacts } from "@/lib/payments-ledger";
import { basesOfPayments, groupHref, studentHref } from "@/lib/ia-links";
import { statementHref } from "@/lib/payments";
import { useMoneyDenied } from "@/lib/payments-summary";
import { canGoBack, clearReceiptNavigationMark, receiptNavigationMarked } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { RecalcNote } from "./recalc-note";

/**
 * The printed sheet.  The page chrome (menu, header strip, buttons) has `print:hidden`; the sheet is
 * at most an A5 width, so it prints the same on A5 and on A4 (centred, with the page margin below).
 */
export function ReceiptSheet({ receipt }: { receipt: ReceiptOut }) {
  const voided = Boolean(receipt.voided_at);
  const replacedNote = receiptReplacedNote(receipt);
  const replacesNote = receiptReplacesNote(receipt);
  const place = [receipt.org_city, receipt.org_phone].filter(Boolean).join(" · ");
  // From the snapshot taken at the moment of payment: what the money covered then (a later correction does not rewrite it).
  const facts = receiptFacts(receipt);

  return (
    <article
      aria-label={receiptTitle(receipt.receipt_no)}
      className="relative mx-auto w-full max-w-[148mm] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-8 print:break-inside-avoid print:rounded-none print:border-slate-400 print:p-6 print:shadow-none"
    >
      <header className="border-b border-slate-200 pb-4">
        <p className="break-words text-lg font-bold leading-snug">{receipt.org_name}</p>
        {place && <p className="mt-0.5 break-words text-xs text-slate-500">{place}</p>}
      </header>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">{receiptTitle(receipt.receipt_no)}</h1>
        <p className="text-sm text-slate-600">от {formatDateRu(receipt.paid_on)}</p>
      </div>

      {(replacedNote || replacesNote) && (
        <p className="mt-1 text-xs font-medium text-slate-500">
          {[replacesNote, replacedNote].filter(Boolean).map((note) => (note as string).replace(/^./, (c) => c.toUpperCase())).join(" · ")}
        </p>
      )}

      <dl className="mt-5 space-y-3 text-sm">
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
          <dt className="text-slate-500">Ученик</dt>
          <dd className="break-words font-semibold">
            {receipt.student_name}
            {receipt.display_id && <span className="ml-1.5 font-mono text-xs font-medium text-slate-500">ID {receipt.display_id}</span>}
          </dd>
        </div>
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
          <dt className="text-slate-500">Группа</dt>
          <dd className="break-words font-medium">{receipt.group_name}</dd>
        </div>
        {facts.legacy ? (
          <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
            <dt className="text-slate-500">{receipt.lessons_count ? "Пакет" : "Период"}</dt>
            <dd className="font-medium">
              {paymentPeriodLabel(receipt)}
              {receipt.partial_period && (
                <span className="ml-2 inline-flex rounded-md border border-amber-300 bg-amber-50 px-1.5 py-px align-middle text-[11px] font-semibold text-amber-800 print:border-slate-400 print:bg-transparent print:text-slate-700">
                  {PARTIAL_PERIOD_TAG}
                </span>
              )}
            </dd>
          </div>
        ) : (
          <>
            {facts.method && (
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
                <dt className="text-slate-500">Способ оплаты</dt>
                <dd className="font-medium">{facts.method}</dd>
              </div>
            )}
            {facts.paidUntil && (
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
                <dt className="text-slate-500">Покрытие</dt>
                <dd className="font-medium">{facts.paidUntil.replace(/^Оплачено до: /, "оплачено до ")}</dd>
              </div>
            )}
          </>
        )}
        {receipt.note && (
          <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
            <dt className="text-slate-500">Комментарий</dt>
            <dd className="break-words">{receipt.note}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 print:bg-transparent">
        <p className="text-xs text-slate-500">Сумма</p>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(receipt.amount)}</p>
        {receipt.amount_words && <p className="mt-0.5 text-sm text-slate-700">{receipt.amount_words}</p>}
      </div>

      {!facts.legacy && (facts.lines.length > 0 || facts.after) && (
        <section aria-label="Куда пошли деньги" className="mt-4 text-sm">
          <h2 className="text-xs text-slate-500">Куда пошли деньги</h2>
          {facts.lines.length > 0 && (
            <ul className="mt-1 divide-y divide-slate-100 print:divide-slate-300">
              {facts.lines.map((line, index) => (
                <li key={`${line.label}-${index}`} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="min-w-0">
                    {line.label}
                    {!line.closes && line.remainingAfter !== null && line.remainingAfter > 0 && (
                      <span className="block text-xs text-slate-500">по этому периоду осталось {formatMoney(line.remainingAfter)}</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatMoney(line.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <RecalcNote lines={receipt.recalc} testId="receipt-recalc" />
          <div className="mt-2 space-y-0.5 text-xs text-slate-600">
            {facts.debtBefore && <p>{facts.debtBefore}</p>}
            {facts.after && <p className="font-medium text-slate-800">{facts.after}</p>}
            {facts.price && <p>{facts.price}</p>}
          </div>
        </section>
      )}

      <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500">Принял</p>
          <p className="mt-0.5 break-words font-medium">{receipt.accepted_by_name || "—"}</p>
        </div>
        <div>
          <div className="h-8 border-b border-slate-400" aria-hidden />
          <p className="mt-1 text-xs text-slate-500">Подпись</p>
        </div>
      </div>

      {voided && (
        <div
          role="note"
          className="pointer-events-none absolute right-4 top-24 max-w-[75%] -rotate-6 rounded-lg border-4 border-rose-600/80 bg-white/70 px-4 py-2 text-center text-rose-700 print:border-slate-800 print:text-slate-900"
        >
          <p className="text-xl font-extrabold tracking-wider sm:text-2xl">{RECEIPT_VOID_STAMP}</p>
          <p className="mt-0.5 break-words text-xs font-semibold">
            {receipt.void_reason || "причина не указана"}
            {receipt.voided_at ? ` · ${formatUtcNaiveAsBusinessDate(receipt.voided_at)}` : ""}
          </p>
        </div>
      )}
    </article>
  );
}

/** The receipt of one payment: loads it, shows the sheet, the links on and the «Печать / Сохранить PDF» button.  It reads `?m=&s=&g=` (where it was opened from). */
export function ReceiptView(props: { /** The payments page of this workspace: where «Назад» goes when there is no page of ours to go back to. */ paymentsHref: string }) {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <ReceiptViewContent {...props} />
    </Suspense>
  );
}

function ReceiptViewContent({ paymentsHref }: { paymentsHref: string }) {
  const params = useParams();
  const router = useRouter();
  const queryContext = receiptContextOf(useSearchParams());
  const bases = basesOfPayments(paymentsHref);
  const paymentId = String(params?.id ?? "");

  const noRight = useMoneyDenied();

  const [receipt, setReceipt] = useState<ReceiptOut | null>(null);
  // `retry`: a failure that may pass (network, 5xx); a refusal (403 / 404 / 409) will not.
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const requests = useRef(createRequestSequence());

  const load = useCallback(async () => {
    const token = requests.current.next();
    setLoading(true);
    setFailure(null);
    try {
      const data = await orgApi.getPaymentReceipt(paymentId);
      if (!requests.current.isCurrent(token)) return;
      setReceipt(data ?? null);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      const status = (cause as { status?: number } | null)?.status;
      setReceipt(null);
      setFailure({
        message: receiptErrorText(status, cause instanceof Error ? cause.message : undefined),
        retry: !status || status >= 500,
      });
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    if (!paymentId || noRight) { setLoading(false); return; }
    void load();
    return () => { requests.current.next(); };
  }, [paymentId, noRight, load]);

  // The title becomes the default file name when the user saves the page as PDF.
  useEffect(() => {
    if (!receipt) return;
    const previous = document.title;
    document.title = receiptTitle(receipt.receipt_no);
    return () => { document.title = previous; };
  }, [receipt]);

  const goBack = () => {
    const inApp = canGoBack({
      historyLength: window.history.length,
      referrer: document.referrer,
      origin: window.location.origin,
      cameFromApp: receiptNavigationMarked(paymentId),
    });
    clearReceiptNavigationMark();
    if (inApp) router.back();
    else router.push(paymentsHref);
  };

  const context = receiptContextWithFallback(queryContext, receipt);
  const message = noRight ? receiptErrorText(403, undefined) : failure?.message ?? null;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 print:max-w-none print:space-y-0">
      {/* One page, margins by the printer; the fonts and colours of the sheet are its own */}
      <style>{"@page { margin: 12mm; }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        {receipt && (context.membershipId || context.studentId || context.groupId) && (
          <nav aria-label="Перейти" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium" data-testid="receipt-links">
            {context.membershipId && <Link href={statementHref(bases.payments, context.membershipId)} data-testid="receipt-link-statement" className="text-primary-700 hover:underline">Выписка</Link>}
            {context.studentId && <Link href={studentHref(bases.students, context.studentId, "payments")} data-testid="receipt-link-student" className="text-primary-700 hover:underline">Ученик</Link>}
            {context.groupId && <Link href={groupHref(bases.groups, context.groupId, "payments")} data-testid="receipt-link-group" className="text-primary-700 hover:underline">Группа</Link>}
          </nav>
        )}
        {receipt && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            <Printer className="h-4 w-4" />
            Печать / Сохранить PDF
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500 print:hidden">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : message ? (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-14 text-center print:hidden">
          {noRight ? <Wallet className="h-7 w-7 text-slate-300" /> : <AlertCircle className="h-7 w-7 text-rose-500" />}
          <p className="text-sm font-medium text-slate-700">{message}</p>
          {!noRight && failure?.retry && (
            <button type="button" onClick={() => void load()} className="mt-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
          )}
        </div>
      ) : receipt ? (
        <ReceiptSheet receipt={receipt} />
      ) : null}
    </div>
  );
}
