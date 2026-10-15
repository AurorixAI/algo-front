"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink, FileText, Loader2, Paperclip, Pencil, Receipt, Trash2, X, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatFileSize } from "@/lib/attendance-excuses";
import {
  canAttachFile,
  carriedOutLabel,
  checkPaymentFile,
  feeModeOf,
  feeTexts,
  formatDateRu,
  formatMoney,
  formatMoneyInput,
  hasReceipt,
  isCarryOver,
  paymentAmountLabel,
  paymentPeriodLabel,
  parseMonthlyFee,
  PARTIAL_PERIOD_TAG,
  PAYMENT_FILE_ACCEPT,
  PAYMENT_FILE_MAX_COUNT,
  receiptHref,
  receiptNumberLabel,
  reformatMoneyTyping,
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
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { PaymentFormModal, type PaymentFormKind } from "./payment-form-modal";
import { PaymentVoidModal } from "./payment-void-modal";

const HISTORY_PREVIEW = 5;

interface MembershipPaymentsProps {
  row: MembershipPaymentRow;
  studentName: string;
  periodMode: PeriodMode;
  lessonsDefault: number | null;
  /** `/owner/payments` or `/admin/payments`: where the receipt pages of this workspace live. */
  paymentsBasePath: string;
  /** The server accepted a change: the parent replaces the row it holds. */
  onRowChange: (row: MembershipPaymentRow) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}

/**
 * Money of one membership inside the «Группы» block of the student card: monthly fee,
 * status, payment history (cancelled ones grey) and the actions Внести / Исправить / Отменить.
 * Rendered only for roles that may see money, and only while the server says so.
 */
export function MembershipPayments({ row, studentName, periodMode, lessonsDefault, paymentsBasePath, onRowChange, onNotify }: MembershipPaymentsProps) {
  const router = useRouter();
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const editable = row.is_active;
  // «Оплата в месяц» for a calendar membership, «Стоимость пакета» for a package.
  const texts = feeTexts(feeModeOf(row, periodMode));

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

  // Cheques: one hidden picker for every row of the history.
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
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
      onNotify(texts.saved);
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

  const patchPayment = (paymentId: string, update: (payment: PaymentOut) => PaymentOut) =>
    setHistory((previous) => previous?.map((item) => (item.id === paymentId ? update(item) : item)) ?? previous);

  const pickFile = (payment: PaymentOut) => {
    uploadTarget.current = payment.id;
    fileInput.current?.click();
  };

  const attachFile = async (paymentId: string, picked: File | null | undefined) => {
    if (!picked) return;
    const payment = history?.find((item) => item.id === paymentId);
    if (!payment) return;
    const check = checkPaymentFile(picked, payment.files?.length ?? 0);
    if (!check.ok) { onNotify(check.error || "Файл не подходит", "error"); return; }
    setUploadingId(paymentId);
    try {
      const saved = await orgApi.uploadPaymentFile(paymentId, picked, picked.name || "cheque");
      patchPayment(paymentId, (item) => ({ ...item, files: [...(item.files ?? []), saved] }));
      onNotify("Чек прикреплён");
    } catch (error) {
      // 409 / 413 / 415 come with the server's own Russian text.
      onNotify(error instanceof Error ? error.message : "Не удалось загрузить файл", "error");
    } finally {
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

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200/70 pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xs text-slate-500">{texts.label}</span>
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
                aria-label={texts.field}
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
              <span className="font-semibold tabular-nums text-slate-900">{row.monthly_fee !== null ? formatMoney(row.monthly_fee) : texts.unset}</span>
              {editable && (
                <button type="button" onClick={startFeeEdit} aria-label={texts.editAria} title="Изменить" className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700">
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
                      uploading={uploadingId === payment.id}
                      onCorrect={() => setForm({ kind: "replace", payment })}
                      onVoid={() => setVoidTarget(payment)}
                      onReceipt={() => router.push(receiptHref(paymentsBasePath, payment.id))}
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
  payment, editable, uploading, onCorrect, onVoid, onReceipt, onAttach, onOpenFile, onDeleteFile,
}: {
  payment: PaymentOut;
  editable: boolean;
  uploading: boolean;
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
  const atLimit = files.length >= PAYMENT_FILE_MAX_COUNT;
  const items: RowMenuItem[] = [];
  // A carry-over is not money: no receipt, no cheque.
  if (hasReceipt(payment)) items.push({ key: "receipt", label: "Квитанция", icon: Receipt, onSelect: onReceipt });
  if (canAttachFile(payment)) {
    items.push(atLimit
      ? { key: "attach", label: `Максимум файлов: ${PAYMENT_FILE_MAX_COUNT}`, icon: Paperclip, disabled: true, onSelect: () => undefined }
      : { key: "attach", label: "Прикрепить чек", icon: Paperclip, onSelect: onAttach });
  }
  if (!voided && editable) {
    // A carry-over is not corrected - the payment it was made from is; it can only be cancelled.
    if (!carried) items.push({ key: "correct", label: "Исправить", icon: Pencil, onSelect: onCorrect });
    items.push({ key: "void", label: "Отменить", icon: XCircle, danger: true, onSelect: onVoid });
  }
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className={`min-w-0 text-xs ${voided ? "text-slate-400" : "text-slate-700"}`}>
        <p className={voided ? "line-through" : ""}>
          {receipt && (<><span className="font-semibold tabular-nums text-slate-500">{receipt}</span><span className="mx-1.5 text-slate-300">·</span></>)}
          <span className={`font-semibold ${carried ? "" : "tabular-nums"}`}>{paymentAmountLabel(payment)}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {carried ? "оплата от" : "оплачено"} {formatDateRu(payment.paid_on)}
        </p>
        <p className={voided ? "line-through" : "text-slate-500"}>
          {paymentPeriodLabel(payment)}
          {payment.partial_period && !carried && (
            <span className={`ml-2 inline-flex rounded-md border px-1.5 py-px align-middle text-[10px] font-semibold ${voided ? "border-slate-200 text-slate-400" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{PARTIAL_PERIOD_TAG}</span>
          )}
        </p>
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
