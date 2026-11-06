"use client";

import { useState } from "react";
import { orgApi } from "@/lib/api";
import { logicaError, settledLines } from "@/lib/payments-logica";
import { Modal } from "@/components/ui/modal";
import { SettleBlock, SettleStatus, useSettle } from "@/components/payments/settle-block";
import { ModalActions } from "@/components/ui/modal-actions";
import { MODAL_ACTIONS_FOOTER_CLASS } from "@/lib/modal-layout";

/**
 * «Убрать ученика из группы?» with the money: the server says what is left on the account after leaving; the owner chooses per
 * membership (keep / forgive the debt / give the advance back) and everything runs in one transaction after the stay is closed.
 * A payment that came in meanwhile is caught (409 `BALANCE_CHANGED`): the numbers are replaced and the owner confirms again.
 * A role the server does not give the preview to (or an older server) leaves the plain way.
 */
export function LeaveStudentDialog({
  open, groupId, studentId, studentName, onClose, onLeft, onLegacy,
}: {
  open: boolean;
  groupId: string;
  studentId: string;
  studentName: string;
  onClose: () => void;
  /** The student left; `lines` are the settled sums for a toast («Возвращено 135 000 сум»). */
  onLeft: (lines: string[]) => void;
  /** The preview is not offered to this role: leave the old way (the caller's own removal). */
  onLegacy?: () => Promise<void> | void;
}) {
  const settle = useSettle(() => orgApi.getLeavePreview(groupId, studentId), open, `${groupId}:${studentId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legacy = Boolean(settle.failure?.refused);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (legacy) {
      setBusy(true);
      try {
        await onLegacy?.();
        onClose();
      } catch (cause) {
        setError(logicaError(cause, "Не удалось убрать ученика").message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!settle.preview) return;
    if (settle.problem) { setError(settle.problem); return; }
    setBusy(true);
    try {
      const names = Object.fromEntries(settle.preview.memberships.map((item) => [item.membership_id, item.group_name]));
      const result = await orgApi.leaveStudent(groupId, studentId, { settle: settle.settle });
      onLeft(settledLines(result.settled, settle.preview.memberships.length > 1 ? names : {}));
      onClose();
    } catch (cause) {
      const failure = logicaError(cause, "Не удалось убрать ученика");
      if (failure.code === "BALANCE_CHANGED" && failure.fresh.length > 0) settle.applyFresh(failure.fresh);
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = legacy || (settle.preview !== null && !settle.loading);

  return (
    <Modal
      open={open}
      title="Убрать ученика из группы?"
      description={studentName}
      onClose={onClose}
      busy={busy}
      footerClassName={MODAL_ACTIONS_FOOTER_CLASS} footer={<ModalActions primary="Убрать из группы" onPrimary={() => void submit()} tone="danger" disabled={busy || !ready} busy={busy} onCancel={onClose} />}
    >
      <div className="space-y-3 pb-2">
        <p className="text-sm text-slate-600">Ученик останется в системе, но перестанет числиться в этой группе.</p>
        <SettleStatus loading={settle.loading} failure={settle.failure} notice={settle.notice} onRetry={settle.reload} />
        {settle.preview && !legacy && (
          <SettleBlock preview={settle.preview} choices={settle.choices} onChoice={settle.setChoice} disabled={busy} showGroup={settle.preview.memberships.length > 1} />
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </div>
    </Modal>
  );
}
