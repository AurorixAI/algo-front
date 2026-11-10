"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatDateRu, formatMoney, refundReceiptTitle, REFUND_VOID_STAMP, type RefundReceiptOut } from "@/lib/payments";
import { useMoneyDenied } from "@/lib/payments-summary";
import { canGoBack, clearReceiptNavigationMark, receiptNavigationMarked } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { Button } from "@/components/ui/button";
import { DataLoadError } from "@/components/ui/data-load-error";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/skeleton";
import { SheetAmount, SheetDisclaimer, SheetHead, SheetPaper, SheetRow, SheetSignature, SheetTitleRow, SheetVoidStamp } from "./receipt-sheet";

/**
 * Money-1 V6: the sheet «Квитанция о возврате В-12» - who gave how much back to whom, how, why, and the line for the signature of the receiver.  It has no print counter and no «копия»:
 * the number is enough, the paper is given once and signed.  A refund older than the numbers has no «В-n» and the title says only «Квитанция о возврате».
 */
export function RefundReceiptSheet({ receipt }: { receipt: RefundReceiptOut }) {
  const place = [receipt.org_city, receipt.org_phone].filter(Boolean).join(" · ");
  const voided = Boolean(receipt.voided_at);
  const title = refundReceiptTitle(receipt.receipt_label);
  return (
    <SheetPaper label={title}>
      <SheetHead orgName={receipt.org_name} place={place} />
      <SheetTitleRow title={title} date={`от ${formatDateRu(receipt.effective_on)}`} />
      {voided && receipt.void_note && <p className="mt-1 text-xs font-semibold text-rose-700 print:text-slate-900" data-testid="receipt-void-note">{receipt.void_note}</p>}

      <dl className="mt-5 space-y-3 text-sm">
        <SheetRow label="Ученик" strong>
          {receipt.student_name}
          {receipt.display_id && <span className="ml-1.5 whitespace-nowrap font-mono text-xs font-medium text-slate-500">ID {receipt.display_id}</span>}
        </SheetRow>
        <SheetRow label="Группа">{receipt.group_name}</SheetRow>
        <SheetRow label="Способ возврата">{receipt.method_label}</SheetRow>
        {receipt.reason && <SheetRow label="Причина"><span className="font-normal">{receipt.reason}</span></SheetRow>}
        {receipt.note && <SheetRow label="Комментарий"><span className="font-normal">{receipt.note}</span></SheetRow>}
      </dl>

      <SheetAmount label="Возвращено" amount={formatMoney(receipt.amount)} words={receipt.amount_words} />

      <SheetSignature label="Выдал(а)" name={receipt.accepted_by_name || ""} signature={receipt.signature_line} />

      {voided && <SheetVoidStamp title={REFUND_VOID_STAMP} line={receipt.void_note ? receipt.void_reason || "причина не указана" : receipt.void_reason} />}
      <SheetDisclaimer text={receipt.disclaimer} />
    </SheetPaper>
  );
}

/** The page of the refund receipt (owner and an administrator with the right to money): loads the sheet, «Назад» and «Печать» over it (both `print:hidden`). */
export function RefundReceiptView({ paymentsHref }: { paymentsHref: string }) {
  return (
    <Suspense fallback={<RefundReceiptSkeleton />}>
      <RefundReceiptContent paymentsHref={paymentsHref} />
    </Suspense>
  );
}

function RefundReceiptSkeleton() {
  return (
    <div role="status" aria-busy="true" data-testid="refund-receipt-skeleton" className="mx-auto w-full max-w-[148mm] space-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <span className="sr-only">Загружаем квитанцию…</span>
      <SkeletonLine className="h-5 w-2/3" />
      <SkeletonLine className="h-4 w-1/3" />
      <SkeletonBlock className="h-24 w-full" />
      <SkeletonLine className="h-4 w-1/2" />
    </div>
  );
}

function RefundReceiptContent({ paymentsHref }: { paymentsHref: string }) {
  const params = useParams();
  const router = useRouter();
  const refundId = String(params?.id ?? "");
  const noRight = useMoneyDenied();
  const [receipt, setReceipt] = useState<RefundReceiptOut | null>(null);
  const [failure, setFailure] = useState<{ status: number | undefined; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const requests = useRef(createRequestSequence());

  const load = useCallback(async () => {
    const token = requests.current.next();
    setLoading(true);
    setFailure(null);
    try {
      const data = await orgApi.getRefundReceipt(refundId);
      if (!requests.current.isCurrent(token)) return;
      setReceipt(data ?? null);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      setReceipt(null);
      setFailure({ status: (cause as { status?: number } | null)?.status, message: cause instanceof Error ? cause.message : "" });
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [refundId]);

  useEffect(() => {
    if (!refundId || noRight) { setLoading(false); return; }
    void load();
    return () => { requests.current.next(); };
  }, [refundId, noRight, load]);

  // the title becomes the default file name when the sheet is saved as PDF
  useEffect(() => {
    if (!receipt) return;
    const previous = document.title;
    document.title = refundReceiptTitle(receipt.receipt_label);
    return () => { document.title = previous; };
  }, [receipt]);

  const goBack = () => {
    const inApp = canGoBack({ historyLength: window.history.length, referrer: document.referrer, origin: window.location.origin, cameFromApp: receiptNavigationMarked(refundId) });
    clearReceiptNavigationMark();
    if (inApp) router.back();
    else router.push(paymentsHref);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 print:max-w-none print:space-y-0">
      <style>{"@page { margin: 12mm; }"}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button type="button" onClick={goBack} variant="ghost" size="md"><ArrowLeft className="h-4 w-4" />Назад</Button>
        {receipt && <Button type="button" onClick={() => window.print()} variant="primary" size="md" data-testid="receipt-print"><Printer className="h-4 w-4" />Печать / Сохранить PDF</Button>}
      </div>

      {loading ? (
        <RefundReceiptSkeleton />
      ) : noRight ? (
        <EmptyState icon={Wallet} title="Нет доступа к квитанциям" hint="Доступ даёт владелец центра в настройках." variant="inline" />
      ) : failure?.status === 404 ? (
        <EmptyState title="Возврат не найден" hint="Возможно, ссылка устарела или возврат относится к другому центру." variant="inline" testId="refund-receipt-missing" />
      ) : failure ? (
        <DataLoadError title="Не удалось загрузить квитанцию" message={failure.message || undefined} onRetry={failure.status === 403 ? undefined : () => void load()} />
      ) : receipt ? (
        <RefundReceiptSheet receipt={receipt} />
      ) : null}
    </div>
  );
}
