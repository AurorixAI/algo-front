"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, Printer, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatUtcNaiveAsBusinessDate, formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";
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
  RECEIPT_COPY_STAMP,
  RECEIPT_DISCLAIMER,
  RECEIPT_PRINT_FAILED,
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
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SheetAmount, SheetCopyStamp, SheetDisclaimer, SheetHead, SheetPaper, SheetRow, SheetSignature, SheetTitleRow, SheetVoidStamp } from "./receipt-sheet";

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
  const issued = receipt.issued_at ? `Выдана ${formatUtcNaiveAsBusinessDateTime(receipt.issued_at).replace(" ", " · ")}` : null;
  const stampLine = receipt.void_note ? receipt.void_reason || "причина не указана" : `${receipt.void_reason || "причина не указана"}${receipt.voided_at ? ` · ${formatUtcNaiveAsBusinessDate(receipt.voided_at)}` : ""}`;

  return (
    <SheetPaper label={receiptTitle(receipt.receipt_no)}>
      {receipt.is_copy && <SheetCopyStamp text={RECEIPT_COPY_STAMP} />}
      <SheetHead orgName={receipt.org_name} place={place} reserveRight={Boolean(receipt.is_copy)} />
      <SheetTitleRow title={receiptTitle(receipt.receipt_no)} date={`от ${formatDateRu(receipt.paid_on)}`} issued={issued} />

      {(replacedNote || replacesNote) && (
        <p className="mt-1 text-xs font-medium text-slate-500">
          {[replacesNote, replacedNote].filter(Boolean).map((note) => (note as string).replace(/^./, (c) => c.toUpperCase())).join(" · ")}
        </p>
      )}
      {voided && receipt.void_note && <p className="mt-1 text-xs font-semibold text-rose-700 print:text-slate-900" data-testid="receipt-void-note">{receipt.void_note}</p>}

      <dl className="mt-5 space-y-3 text-sm">
        <SheetRow label="Ученик" strong>
          {receipt.student_name}
          {receipt.display_id && <span className="ml-1.5 whitespace-nowrap font-mono text-xs font-medium text-slate-500">ID {receipt.display_id}</span>}
        </SheetRow>
        <SheetRow label="Группа">{receipt.group_name}</SheetRow>
        {facts.legacy ? (
          <SheetRow label={receipt.lessons_count ? "Пакет" : "Период"}>
            {paymentPeriodLabel(receipt)}
            {receipt.partial_period && (
              <span className="ml-2 inline-flex rounded-md border border-amber-300 bg-amber-50 px-1.5 py-px align-middle text-[11px] font-semibold text-amber-800 print:border-slate-400 print:bg-transparent print:text-slate-700">
                {PARTIAL_PERIOD_TAG}
              </span>
            )}
          </SheetRow>
        ) : (
          <>
            {facts.method && <SheetRow label="Способ оплаты">{facts.method}</SheetRow>}
            {facts.paidUntil && <SheetRow label="Оплачено до">{facts.paidUntil.replace(/^Оплачено до: /, "")}</SheetRow>}
          </>
        )}
        {receipt.note && <SheetRow label="Комментарий"><span className="font-normal">{receipt.note}</span></SheetRow>}
      </dl>

      <SheetAmount label="Сумма" amount={formatMoney(receipt.amount)} words={receipt.amount_words} />

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
          </div>
        </section>
      )}

      {/* Money-1 V5: the account of the student ON THE DAY the sheet is issued - the server's own sentence; the numbers above are the day of the payment */}
      {receipt.state_on_issue?.text && (
        <section aria-label="Состояние на дату выдачи" className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm print:border-slate-400" data-testid="receipt-state-on-issue">
          <h2 className="text-xs text-slate-500">Состояние на дату выдачи</h2>
          <p className="mt-0.5 font-medium text-slate-800">{receipt.state_on_issue.text}</p>
        </section>
      )}

      <SheetSignature label="Принял" name={receipt.accepted_by_name || ""} signature="Подпись" />

      {voided && <SheetVoidStamp title={RECEIPT_VOID_STAMP} line={stampLine} />}
      <SheetDisclaimer text={receipt.disclaimer || RECEIPT_DISCLAIMER} />
    </SheetPaper>
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
  const printing = useRef(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState(false);

  // Money-1 V5: a PRINT is written first (the first is the original, every next one a «копия»), then the sheet is drawn with that state and printed.  The button is busy until the print window is closed;
  // a failed write prints nothing (the counter of copies is the control).
  const print = async () => {
    if (printing.current || !receipt) return;
    printing.current = true;
    setPrintBusy(true);
    setPrintError(false);
    try {
      const printed = await orgApi.printPaymentReceipt(paymentId);
      setReceipt(printed ?? receipt);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
    } catch {
      setPrintError(true);
    } finally {
      printing.current = false;
      setPrintBusy(false);
    }
  };

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
        <Button
          type="button"
          onClick={goBack}
          variant="ghost" size="md"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>
        {receipt && (context.membershipId || context.studentId || context.groupId) && (
          <nav aria-label="Перейти" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium" data-testid="receipt-links">
            {context.membershipId && <Link href={statementHref(bases.payments, context.membershipId)} data-testid="receipt-link-statement" className="inline-flex min-h-10 items-center text-primary-700 hover:underline">Выписка</Link>}
            {context.studentId && <Link href={studentHref(bases.students, context.studentId, "payments")} data-testid="receipt-link-student" className="inline-flex min-h-10 items-center text-primary-700 hover:underline">Ученик</Link>}
            {context.groupId && <Link href={groupHref(bases.groups, context.groupId, "payments")} data-testid="receipt-link-group" className="inline-flex min-h-10 items-center text-primary-700 hover:underline">Группа</Link>}
          </nav>
        )}
        {receipt && (
          <Button
            type="button"
            onClick={() => void print()}
            loading={printBusy}
            variant="primary" size="md"
            data-testid="receipt-print"
          >
            <Printer className="h-4 w-4" />
            Печать / Сохранить PDF
          </Button>
        )}
      </div>

      {printError && <Notice variant="error" testId="receipt-print-error" className="print:hidden">{RECEIPT_PRINT_FAILED}</Notice>}

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
            <Button type="button" onClick={() => void load()} variant="secondary" size="md" className="mt-1">Повторить</Button>
          )}
        </div>
      ) : receipt ? (
        <ReceiptSheet receipt={receipt} />
      ) : null}
    </div>
  );
}
