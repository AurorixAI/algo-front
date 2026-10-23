"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatFileSize } from "@/lib/attendance-excuses";
import {
  canAttachFile,
  checkPaymentFile,
  PAYMENT_FILE_ACCEPT,
  PAYMENT_FILE_MAX_COUNT,
  type PaymentFileOut,
  type PaymentOut,
} from "@/lib/payments";
import { createRequestSequence } from "@/lib/request-sequence";
import { Modal } from "@/components/ui/modal";
import type { RowMenuItem } from "@/components/ui/row-menu";
import { FileInput } from "@/components/ui/file-input";

/**
 * IA audit F10: «Прикрепить чек» lived only in the embedded payment history of the student card; that history is gone («Выписка» is the
 * one history), so the cheques moved with it.  This hook reads the payments of one membership once (`files` come with them), gives the
 * menu item «Прикрепить чек» of a payment row, the list of attached files to show under the row, one hidden file picker and the
 * confirmation of a deletion.  The rules are the card's own: JPEG, PNG or PDF, at most `PAYMENT_FILE_MAX_COUNT` per payment, one upload
 * at a time, the server checks again.
 */
export function usePaymentCheques({ membershipId, enabled, onNotify }: {
  membershipId: string;
  /** Read the payments (false while the statement is not on screen or the role has no right). */
  enabled: boolean;
  onNotify: (text: string, type?: "success" | "error" | "warning") => void;
}) {
  const [payments, setPayments] = useState<Record<string, PaymentOut>>({});
  const requests = useRef(createRequestSequence());
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const uploadBusy = useRef(false);
  const paymentsNow = useRef<Record<string, PaymentOut>>({});
  const [toDelete, setToDelete] = useState<{ payment: PaymentOut; file: PaymentFileOut } | null>(null);
  const [deleting, setDeleting] = useState(false);

  paymentsNow.current = payments;

  const reload = useCallback(async () => {
    if (!enabled || !membershipId) return;
    const token = requests.current.next();
    try {
      const list = await orgApi.listMembershipPayments(membershipId, true);
      if (!requests.current.isCurrent(token)) return;
      setPayments(Object.fromEntries((Array.isArray(list) ? list : []).map((payment) => [payment.id, payment])));
    } catch {
      // the statement stays whole; only the cheques are not offered
    }
  }, [enabled, membershipId]);

  useEffect(() => {
    void reload();
    return () => { requests.current.next(); };
  }, [reload]);

  const patch = (paymentId: string, update: (payment: PaymentOut) => PaymentOut) =>
    setPayments((previous) => (previous[paymentId] ? { ...previous, [paymentId]: update(previous[paymentId]) } : previous));

  const pick = (paymentId: string) => {
    if (uploadBusy.current) return;
    uploadTarget.current = paymentId;
    fileInput.current?.click();
  };

  const attach = async (paymentId: string, picked: File | null | undefined) => {
    if (!picked) return;
    if (uploadBusy.current) { onNotify("Дождитесь окончания загрузки предыдущего файла", "warning"); return; }
    const payment = paymentsNow.current[paymentId];
    if (!payment) return;
    const check = checkPaymentFile(picked, payment.files?.length ?? 0);
    if (!check.ok) { onNotify(check.error || "Файл не подходит", "error"); return; }
    uploadBusy.current = true;
    setUploadingId(paymentId);
    try {
      const saved = await orgApi.uploadPaymentFile(paymentId, picked, picked.name || "cheque");
      patch(paymentId, (item) => ({ ...item, files: [...(item.files ?? []), saved] }));
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

  const remove = async () => {
    if (!toDelete || deleting) return;
    const { payment, file } = toDelete;
    setDeleting(true);
    try {
      await orgApi.deletePaymentFile(payment.id, file.id);
      patch(payment.id, (item) => ({ ...item, files: (item.files ?? []).filter((entry) => entry.id !== file.id) }));
      setToDelete(null);
      onNotify("Файл удалён");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось удалить файл", "error");
    } finally {
      setDeleting(false);
    }
  };

  /** «Прикрепить чек» for the «⋯» of a payment row; null when this payment takes no cheque (a carry-over, cancelled, not loaded). */
  const menuItem = (paymentId: string | null | undefined): RowMenuItem | null => {
    const payment = paymentId ? payments[paymentId] : undefined;
    if (!payment || !canAttachFile(payment)) return null;
    const atLimit = (payment.files?.length ?? 0) >= PAYMENT_FILE_MAX_COUNT;
    if (atLimit) return { key: "attach", label: `Максимум файлов: ${PAYMENT_FILE_MAX_COUNT}`, icon: Paperclip, disabled: true, onSelect: () => undefined };
    if (uploadingId !== null) return { key: "attach", label: "Идёт загрузка файла…", icon: Paperclip, disabled: true, onSelect: () => undefined };
    return { key: "attach", label: "Прикрепить чек", icon: Paperclip, onSelect: () => pick(payment.id) };
  };

  /** The files attached to a payment, under its row. */
  const filesOf = (paymentId: string | null | undefined): ReactNode => {
    const payment = paymentId ? payments[paymentId] : undefined;
    const files = payment?.files ?? [];
    const uploading = Boolean(payment) && uploadingId === payment?.id;
    if (!payment || (files.length === 0 && !uploading)) return null;
    return (
      <ul className="mt-1.5 space-y-1" aria-label="Прикреплённые чеки">
        {files.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-600">
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <button
              type="button"
              onClick={() => void openFile(payment, file)}
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
              onClick={() => setToDelete({ payment, file })}
              aria-label={`Удалить файл ${file.filename}`}
              title="Удалить"
              className="ml-auto shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 print:hidden"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {uploading && (
          <li className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загружаем файл…</li>
        )}
      </ul>
    );
  };

  /** One picker for every row, and the confirmation of a deletion: rendered once by the screen. */
  const dialogs = (
    <>
      <FileInput
        ref={fileInput}
        accept={PAYMENT_FILE_ACCEPT}
        aria-hidden="true"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          const target = uploadTarget.current;
          uploadTarget.current = null;
          if (target) void attach(target, picked);
        }}
      />
      <Modal
        open={toDelete !== null}
        title="Удалить файл?"
        description={toDelete?.file.filename || undefined}
        onClose={() => setToDelete(null)}
        busy={deleting}
        footer={
          <>
            <button type="button" onClick={() => setToDelete(null)} disabled={deleting} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button type="button" onClick={() => void remove()} disabled={deleting} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Удалить
            </button>
          </>
        }
      >
        <p className="pb-2 text-sm text-slate-600">Файл будет удалён без возможности восстановления.</p>
      </Modal>
    </>
  );

  return { menuItem, filesOf, dialogs, reload };
}
