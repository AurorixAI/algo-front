"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eraser, ExternalLink, FileText, Loader2, Paperclip, Pencil, PauseCircle, PiggyBank, Receipt, ScrollText, Trash2, Undo2, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatFileSize } from "@/lib/attendance-excuses";
import {
  canAttachFile,
  carriedOutLabel,
  checkPaymentFile,
  formatDateRu,
  hasReceipt,
  isCarryOver,
  formatMoney,
  payIsDue,
  PAY_ACTION_LABEL,
  paymentAmountLabel,
  paymentPeriodLabel,
  PARTIAL_PERIOD_TAG,
  PAYMENT_FILE_ACCEPT,
  PAYMENT_FILE_MAX_COUNT,
  PAYMENT_SAVED_TEXT,
  receiptHref,
  receiptNumberLabel,
  statementHref,
  statusDetail,
  statusLabel,
  statusTone,
  STATUS_TONE_CLASS,
  type MembershipPaymentRow,
  type PaymentFileOut,
  type PaymentOut,
  type PaymentSaveResult,
  type PeriodMode,
} from "@/lib/payments";
import { allocationLines, canRefund, canWriteOff, methodLabel, savedPaymentDetails } from "@/lib/payments-ledger";
import { canPayLeftDebt, INDIVIDUAL_PRICE_ENDS_TEXT, openingSummary } from "@/lib/payments-logica";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { markReceiptNavigation } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useMembershipPriceControls } from "./membership-price";
import { BalanceNote } from "./balance-note";
import { PaymentDialog, type PaymentFormKind } from "./payment-dialog";
import { OpeningBalanceDialog } from "./opening-balance-dialog";
import { PauseDialog } from "./pause-dialog";
import { PaymentVoidModal } from "./payment-void-modal";
import { RefundDialog, REFUND_ACTION_LABEL } from "./refund-dialog";
import { WriteoffDialog, WRITEOFF_ACTION_LABEL } from "./writeoff-dialog";

const HISTORY_PREVIEW = 5;

interface MembershipPaymentsProps {
  row: MembershipPaymentRow;
  /** Row 1, left: the name of the group (with its badges and the teacher). */
  heading: ReactNode;
  studentName: string;
  periodMode: PeriodMode;
  /** `/owner/payments` or `/admin/payments`: where the receipt pages of this workspace live. */
  paymentsBasePath: string;
  /** `/owner/groups` or `/admin/groups`: «Задать цену группы» leads to the group. */
  groupsBasePath: string;
  /**
   * The student is in the archive: history only - no «Внести оплату», no individual price, no «Исправить» (the server
   * answers 409 «Ученик в архиве — сначала верните его»); «Отменить» stays, so a mistaken payment can be cancelled.
   */
  archived?: boolean;
  /** The day the membership started (the card knows it): the opening balance is checked against it. */
  joinedAt?: string | null;
  /** The server accepted a change: the parent replaces the row it holds. */
  onRowChange: (row: MembershipPaymentRow) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}

/**
 * Money of one membership on the «Оплаты» tab of the student card, ordered by importance:
 *  1. the group, its status chip and the one main button («Внести оплату»: filled when overdue or never paid, outlined when running);
 *  2. the price in a line: «Цена 500 000 сум/мес · цена группы» / «Индивидуальная цена … · причина»;
 *  3. in «⋯»: the individual price (assign / return / cancel a scheduled one), the history of the price, the history of payments
 *     (cancelled payments grey) with the actions Исправить / Отменить.
 * Rendered only for roles that may see money, and only while the server says so.
 */
export function MembershipPayments({ row, heading, studentName, periodMode, paymentsBasePath, groupsBasePath, archived = false, joinedAt = null, onRowChange, onNotify }: MembershipPaymentsProps) {
  const router = useRouter();
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const editable = row.is_active && !archived;
  // «Отменить» of a payment: an active membership, or any membership of an archived student (history stays correctable by cancelling).
  const voidable = row.is_active || archived;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PaymentOut[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const historyRequests = useRef(createRequestSequence());

  const [form, setForm] = useState<{ kind: PaymentFormKind; payment: PaymentOut | null } | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentOut | null>(null);
  const [writeoffOpen, setWriteoffOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);

  // Cheques: one hidden picker for every row of the history.
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // One upload at a time, and the file count is read from the latest history (a picker can stay open for a while).
  const uploadBusy = useRef(false);
  const historyNow = useRef<PaymentOut[] | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ payment: PaymentOut; file: PaymentFileOut } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);

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

  const onSaved = (result: PaymentSaveResult) => {
    changed(result.row);
    onNotify(PAYMENT_SAVED_TEXT[form?.kind ?? "create"], "success", savedPaymentDetails(result.allocation));
  };

  historyNow.current = history;

  const patchPayment = (paymentId: string, update: (payment: PaymentOut) => PaymentOut) =>
    setHistory((previous) => previous?.map((item) => (item.id === paymentId ? update(item) : item)) ?? previous);

  const pickFile = (payment: PaymentOut) => {
    if (uploadBusy.current) return;
    uploadTarget.current = payment.id;
    fileInput.current?.click();
  };

  const attachFile = async (paymentId: string, picked: File | null | undefined) => {
    if (!picked) return;
    if (uploadBusy.current) { onNotify("Дождитесь окончания загрузки предыдущего файла", "warning"); return; }
    const payment = historyNow.current?.find((item) => item.id === paymentId);
    if (!payment) return;
    const check = checkPaymentFile(picked, payment.files?.length ?? 0);
    if (!check.ok) { onNotify(check.error || "Файл не подходит", "error"); return; }
    uploadBusy.current = true;
    setUploadingId(paymentId);
    try {
      const saved = await orgApi.uploadPaymentFile(paymentId, picked, picked.name || "cheque");
      patchPayment(paymentId, (item) => ({ ...item, files: [...(item.files ?? []), saved] }));
      onNotify("Чек прикреплён");
    } catch (error) {
      // 409 / 413 / 415 come with the server's own Russian text.
      onNotify(error instanceof Error ? error.message : "Не удалось загрузить файл", "error");
    } finally {
      uploadBusy.current = false;
      setUploadingId(null);
    }
  };

  const openFile = async (payment: PaymentOut, file: PaymentFileOut) => {
    // The tab opens inside the click (a popup opened after the download would be blocked) and gets the file later.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const blob = await orgApi.fetchPaymentFile(payment.id, file.id);
      const typed = blob.type ? blob : new Blob([blob], { type: file.content_type });
      const url = URL.createObjectURL(typed);
      if (tab) tab.location.href = url;
      else if (!window.open(url, "_blank")) onNotify("Браузер заблокировал новую вкладку — разрешите всплывающие окна", "warning");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      onNotify(error instanceof Error ? error.message : "Не удалось открыть файл", "error");
    }
  };

  const deleteFile = async () => {
    if (!fileToDelete || fileBusy) return;
    const { payment, file } = fileToDelete;
    setFileBusy(true);
    try {
      await orgApi.deletePaymentFile(payment.id, file.id);
      patchPayment(payment.id, (item) => ({ ...item, files: (item.files ?? []).filter((entry) => entry.id !== file.id) }));
      setFileToDelete(null);
      onNotify("Файл удалён");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось удалить файл", "error");
    } finally {
      setFileBusy(false);
    }
  };

  const tone = STATUS_TONE_CLASS[statusTone(row.status)];
  const detail = statusDetail(row);
  const visible = history ? (showAll ? history : history.slice(0, HISTORY_PREVIEW)) : [];
  const due = payIsDue(row);

  const price = useMembershipPriceControls({
    row, studentName, periodMode, groupsBasePath, editable, onRowChange: changed, onNotify,
  });
  // Rare actions: the price first, the histories last.
  const menu: RowMenuItem[] = [
    { key: "statement", label: "Выписка", icon: ScrollText, onSelect: () => { markReceiptNavigation(row.membership_id); router.push(statementHref(paymentsBasePath, row.membership_id)); } },
    ...(!archived && canWriteOff(row) ? [{ key: "writeoff", label: WRITEOFF_ACTION_LABEL, icon: Eraser, onSelect: () => setWriteoffOpen(true) }] : []),
    ...(!archived && canRefund(row) ? [{ key: "refund", label: REFUND_ACTION_LABEL, icon: Undo2, onSelect: () => setRefundOpen(true) }] : []),
    // LOGIC-A: a pause (the place stays, the days are not charged) and what the student had before ALGO
    ...(editable ? [{ key: "pause", label: "Пауза…", icon: PauseCircle, onSelect: () => setPauseOpen(true) }] : []),
    ...(!archived && row.is_active ? [{ key: "opening", label: row.opening ? "Остаток на начало…" : "Внести остаток на начало…", icon: PiggyBank, onSelect: () => setOpeningOpen(true) }] : []),
    ...price.items,
    { key: "payments-history", label: historyOpen ? "Скрыть историю оплат" : "История оплат", onSelect: () => setHistoryOpen((value) => !value) },
  ];

  return (
    <div className="space-y-2.5">
      {/* Row 1: the group, the status, the one main button, «⋯».  A phone or a narrow column (the card next to the sidebar below 1024 px): the group and «⋯», under them the status, then the button. */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 lg:items-start ${
          editable
            ? "lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] [grid-template-areas:'heading_menu'_'status_status'_'button_button'] lg:[grid-template-areas:'heading_status_button_menu']"
            : "[grid-template-areas:'heading_menu']"
        }`}
      >
        <div className="min-w-0 [grid-area:heading]">{heading}</div>
        {editable && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 [grid-area:status] lg:flex-col lg:flex-nowrap lg:items-center lg:gap-y-1 lg:pt-1 lg:text-center">
            <span className={`inline-block max-w-full rounded-md border px-2 py-0.5 text-xs font-semibold leading-4 ${tone}`}>{statusLabel(row)}</span>
            {detail && <p className="text-[11px] text-slate-500">{detail}</p>}
            <BalanceNote row={row} />
            {row.paused && <button type="button" onClick={() => setPauseOpen(true)} className="text-[11px] font-semibold text-primary-700 hover:underline">Закончить паузу</button>}
            <Link href={statementHref(paymentsBasePath, row.membership_id)} onClick={() => markReceiptNavigation(row.membership_id)} className="text-[11px] font-medium text-primary-700 hover:underline">Выписка</Link>
          </div>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => setForm({ kind: "create", payment: null })}
            className={`whitespace-nowrap rounded-lg border px-3.5 py-2 text-center text-xs font-semibold [grid-area:button] lg:justify-self-end lg:py-1.5 ${
              due
                ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700"
                : "border-primary-200 bg-white text-primary-700 hover:bg-primary-50"
            }`}
          >
            {PAY_ACTION_LABEL}
          </button>
        )}
        <div className="justify-self-end [grid-area:menu] lg:pt-px">
          <RowMenu items={menu} label={`Действия по оплате: ${row.group_name}`} width={300} />
        </div>
      </div>

      {/* A group the student has left (or an archived student): no status, but the debt or the advance and the statement stay */}
      {!editable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <BalanceNote row={row} />
          <Link href={statementHref(paymentsBasePath, row.membership_id)} onClick={() => markReceiptNavigation(row.membership_id)} className="text-xs font-medium text-primary-700 hover:underline">Выписка</Link>
          {/* S-5: the debt of a student who has left can still be paid (at most the debt) */}
          {canPayLeftDebt(row, archived) && (
            <button
              type="button"
              onClick={() => setForm({ kind: "create", payment: null })}
              className="rounded-lg border border-primary-600 bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
            >
              Оплатить долг
            </button>
          )}
        </div>
      )}

      {/* F13: an individual price ends with the stay in the group */}
      {row.price_ends_on_leave && row.is_active && <p className="text-xs text-slate-500">{INDIVIDUAL_PRICE_ENDS_TEXT}</p>}

      {/* What the student had before ALGO */}
      {row.opening && openingSummary(row.opening) && (
        <p className="text-xs text-slate-500" data-testid="opening-summary">{openingSummary(row.opening)}</p>
      )}

      {/* Row 2: what the student pays */}
      {price.line}

      {price.panel}

      {historyOpen && (
        <section aria-label="История оплат" className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-slate-700">История оплат</h3>
            <button type="button" onClick={() => setHistoryOpen(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">Скрыть</button>
          </div>
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
                    voidable={voidable}
                    uploading={uploadingId === payment.id}
                    uploadRunning={uploadingId !== null}
                    onCorrect={() => setForm({ kind: "replace", payment })}
                    onVoid={() => setVoidTarget(payment)}
                    onReceipt={() => {
                      markReceiptNavigation(payment.id);
                      router.push(receiptHref(paymentsBasePath, payment.id));
                    }}
                    onAttach={() => pickFile(payment)}
                    onOpenFile={(file) => void openFile(payment, file)}
                    onDeleteFile={(file) => setFileToDelete({ payment, file })}
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
        </section>
      )}

      {price.dialogs}

      <PaymentDialog
        open={form !== null}
        kind={form?.kind ?? "create"}
        membership={{ membership_id: row.membership_id, group_id: row.group_id, student_name: studentName, group_name: row.group_name }}
        payment={form?.payment ?? null}
        groupsBasePath={groupsBasePath}
        onClose={() => setForm(null)}
        onSaved={onSaved}
        onDuplicate={() => { onNotify("Эта оплата уже внесена"); void refreshSummary(true); if (historyOpen) void loadHistory(); }}
      />
      <OpeningBalanceDialog
        open={openingOpen}
        membershipId={row.membership_id}
        studentName={studentName}
        groupName={row.group_name}
        opening={row.opening ?? null}
        enrolDate={joinedAt}
        onClose={() => setOpeningOpen(false)}
        onSaved={(next, removed) => {
          if (next) changed(next);
          onNotify(removed ? "Остаток на начало убран" : "Остаток на начало сохранён", "success");
        }}
      />
      <PauseDialog
        open={pauseOpen}
        membershipId={row.membership_id}
        studentName={studentName}
        groupName={row.group_name}
        onClose={() => setPauseOpen(false)}
        onChanged={(next, text) => { if (next) changed(next); else void refreshSummary(true); onNotify(text, "success"); }}
      />
      <WriteoffDialog
        row={writeoffOpen ? row : null}
        studentName={studentName}
        onClose={() => setWriteoffOpen(false)}
        onDone={(result) => { changed(result.row); onNotify("Долг прощён", "success", [`Долг был ${formatMoney(result.debt_before)}, стал ${formatMoney(result.debt_after)}`]); }}
      />
      <RefundDialog
        row={refundOpen ? row : null}
        studentName={studentName}
        onClose={() => setRefundOpen(false)}
        onDone={(result) => { changed(result.row); onNotify("Аванс возвращён", "success", [`Возвращено ${formatMoney(result.refund.amount)}`]); }}
      />
      <PaymentVoidModal
        payment={voidTarget}
        studentName={studentName}
        onClose={() => setVoidTarget(null)}
        onVoided={(result) => { changed(result.row); onNotify("Оплата отменена"); }}
      />

      {/* One picker for every row; JPEG, PNG or PDF, checked again by the server */}
      <input
        ref={fileInput}
        type="file"
        accept={PAYMENT_FILE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          const target = uploadTarget.current;
          uploadTarget.current = null;
          if (target) void attachFile(target, picked);
        }}
      />

      <Modal
        open={fileToDelete !== null}
        title="Удалить файл?"
        description={fileToDelete?.file.filename || undefined}
        onClose={() => setFileToDelete(null)}
        busy={fileBusy}
        footer={
          <>
            <button type="button" onClick={() => setFileToDelete(null)} disabled={fileBusy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button type="button" onClick={() => void deleteFile()} disabled={fileBusy} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {fileBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Удалить
            </button>
          </>
        }
      >
        <p className="pb-2 text-sm text-slate-600">Файл будет удалён без возможности восстановления.</p>
      </Modal>
    </div>
  );
}

function HistoryItem({
  payment, editable, voidable, uploading, uploadRunning, onCorrect, onVoid, onReceipt, onAttach, onOpenFile, onDeleteFile,
}: {
  payment: PaymentOut;
  /** «Исправить». */
  editable: boolean;
  /** «Отменить». */
  voidable: boolean;
  uploading: boolean;
  /** Any row is uploading: «Прикрепить чек» waits in all of them. */
  uploadRunning: boolean;
  onCorrect: () => void;
  onVoid: () => void;
  onReceipt: () => void;
  onAttach: () => void;
  onOpenFile: (file: PaymentFileOut) => void;
  onDeleteFile: (file: PaymentFileOut) => void;
}) {
  const voided = Boolean(payment.voided_at);
  const carried = isCarryOver(payment);
  const receipt = receiptNumberLabel(payment);
  const files = payment.files ?? [];
  const allocation = allocationLines(payment.allocation?.items);
  const refunded = Math.max(0, Math.round(payment.allocation?.refunded ?? 0));
  const transferred = Math.max(0, Math.round(payment.allocation?.transferred ?? 0));
  const atLimit = files.length >= PAYMENT_FILE_MAX_COUNT;
  const items: RowMenuItem[] = [];
  // A carry-over is not money: no receipt, no cheque.
  if (hasReceipt(payment)) items.push({ key: "receipt", label: "Квитанция", icon: Receipt, onSelect: onReceipt });
  if (canAttachFile(payment)) {
    items.push(atLimit
      ? { key: "attach", label: `Максимум файлов: ${PAYMENT_FILE_MAX_COUNT}`, icon: Paperclip, disabled: true, onSelect: () => undefined }
      : uploadRunning
        ? { key: "attach", label: "Идёт загрузка файла…", icon: Paperclip, disabled: true, onSelect: () => undefined }
        : { key: "attach", label: "Прикрепить чек", icon: Paperclip, onSelect: onAttach });
  }
  if (!voided && editable) {
    // A carry-over is not corrected - the payment it was made from is; it can only be cancelled.
    if (!carried) items.push({ key: "correct", label: "Исправить", icon: Pencil, onSelect: onCorrect });
  }
  if (!voided && voidable) items.push({ key: "void", label: "Отменить", icon: XCircle, danger: true, onSelect: onVoid });
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className={`min-w-0 flex-1 text-xs ${voided ? "text-slate-400" : "text-slate-700"}`}>
        <p>
          {receipt && (<><span className="font-semibold tabular-nums text-slate-500">{receipt}</span><span className="mx-1.5 text-slate-300">·</span></>)}
          <span className={`font-semibold ${carried ? "" : "tabular-nums"}`}>{paymentAmountLabel(payment)}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {carried ? "оплата от" : "оплачено"} {formatDateRu(payment.paid_on)}
          {/* A cancelled payment says so in words: a strike-through alone reads as «something is wrong with it». */}
          {voided && <span className="ml-2 inline-flex rounded-md border border-slate-200 bg-slate-100 px-1.5 py-px align-middle text-[10px] font-semibold text-slate-600">Отменена · не учитывается</span>}
        </p>
        <p className={voided ? "" : "text-slate-500"}>
          {!carried && payment.method ? methodLabel(payment.method) : ""}
          {/* A payment of the old model still shows the period it was entered for. */}
          {payment.legacy_period && paymentPeriodLabel(payment) ? `${!carried && payment.method ? " · " : ""}${paymentPeriodLabel(payment)}` : ""}
          {payment.legacy_period && payment.partial_period && !carried && (
            <span className={`ml-2 inline-flex rounded-md border px-1.5 py-px align-middle text-[10px] font-semibold ${voided ? "border-slate-200 text-slate-400" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{PARTIAL_PERIOD_TAG}</span>
          )}
        </p>
        {/* Where the money went: the distribution of the whole group as it is now (a cancelled payment has none). */}
        {!voided && !carried && allocation.length > 0 && (
          <ul aria-label="Куда пошли деньги" className="mt-0.5 space-y-px text-[11px] text-slate-500">
            {allocation.map((line, index) => (
              <li key={`${line.label}-${index}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">{line.label}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(line.amount)}</span>
              </li>
            ))}
            {refunded > 0 && <li className="text-slate-400">Возвращено из этой оплаты: {formatMoney(refunded)}</li>}
            {transferred > 0 && <li className="text-slate-400">Переведено в другую группу: {formatMoney(transferred)}</li>}
          </ul>
        )}
        {!voided && payment.carried_out && <p className="text-[11px] text-slate-500">{carriedOutLabel(payment)}</p>}
        {/* The note of a carry-over only repeats «перенос из …». */}
        {payment.note && !carried && <p className="break-words text-slate-500">{payment.note}</p>}
        <p className="text-[11px] text-slate-400">
          {[payment.created_by_name ? `Кто внёс: ${payment.created_by_name}` : "", payment.replaces_payment_id ? "исправление" : ""].filter(Boolean).join(" · ")}
        </p>
        {voided && (
          <p className="text-[11px] text-slate-500">
            Причина отмены: {payment.void_reason || "не указана"}
            {payment.voided_by_name ? ` · ${payment.voided_by_name}` : ""}
          </p>
        )}
        {(files.length > 0 || uploading) && (
          <ul className="mt-1.5 space-y-1" aria-label="Прикреплённые чеки">
            {files.map((file) => (
              <li key={file.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-600">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <button
                  type="button"
                  onClick={() => onOpenFile(file)}
                  title="Открыть в новой вкладке"
                  aria-label={`Открыть файл ${file.filename}`}
                  className="flex min-w-0 items-center gap-1 text-left font-medium text-primary-700 hover:underline"
                >
                  <span className="min-w-0 truncate">{file.filename}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </button>
                <span className="shrink-0 text-slate-400">{formatFileSize(file.size_bytes)}</span>
                <button
                  type="button"
                  onClick={() => onDeleteFile(file)}
                  aria-label={`Удалить файл ${file.filename}`}
                  title="Удалить"
                  className="ml-auto shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {uploading && (
              <li className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загружаем файл…</li>
            )}
          </ul>
        )}
      </div>
      <RowMenu items={items} label={`Действия с оплатой от ${formatDateRu(payment.paid_on)}`} width={200} />
    </li>
  );
}
