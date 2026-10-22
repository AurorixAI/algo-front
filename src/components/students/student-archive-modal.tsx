"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi, type StudentArchiveResult } from "@/lib/api";
import {
  ARCHIVE_KEEPS_NOTE,
  ARCHIVE_REASON_MAX,
  archiveDiagnosticLines,
  archiveGroupsHeading,
  archiveReasonCounter,
  isStaleArchiveConflict,
  normalizeArchiveReason,
  validateArchiveReason,
  type ArchiveDiagnosticCounts,
} from "@/lib/student-archive";
import { logicaError } from "@/lib/payments-logica";
import { Modal } from "@/components/ui/modal";
import { SettleBlock, SettleStatus, useSettle } from "@/components/payments/settle-block";

interface StudentArchiveModalProps {
  open: boolean;
  studentId: string;
  studentName: string;
  /** Groups the student is in now (his active memberships): the server removes him from every one. */
  groupNames: string[];
  /** What archiving does to his diagnostics (`archiveDiagnosticCounts` of the card): invites to cancel, tests left running. */
  diagnostics?: ArchiveDiagnosticCounts;
  onClose: () => void;
  onArchived: (result: StudentArchiveResult) => void;
  /** «Ученик уже в архиве» (409): the card is out of date and must be read again. Other refusals stay in the dialog. */
  onStale: (message: string) => void;
}

/** «Ученик ушёл из центра?»: the groups he leaves, an optional reason of up to 300 characters, what stays. */
export function StudentArchiveModal({ open, studentId, studentName, groupNames, diagnostics, onClose, onArchived, onStale }: StudentArchiveModalProps) {
  const diagnosticLines = archiveDiagnosticLines(diagnostics ?? { cancel: 0, running: 0 });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // LOGIC-A F9: what is left on the account of each group after leaving, and what to do with it (keep / forgive / give back).
  const settle = useSettle(() => orgApi.getArchivePreview(studentId), open, studentId);

  // A dialog that opens again (or for another student) never keeps the old draft or the old error.
  useEffect(() => {
    if (open) { setReason(""); setBusy(false); setError(null); }
  }, [open, studentId]);

  const submit = async () => {
    if (busy) return;
    const problem = validateArchiveReason(reason) ?? (settle.failure?.refused ? null : settle.problem);
    if (problem) { setError(problem); return; }
    // The preview is the base of the choice: without it (still loading, or it failed) nothing is archived blindly.
    if (!settle.preview && !settle.failure?.refused) return;
    setBusy(true);
    setError(null);
    try {
      const result = settle.preview
        ? await orgApi.archiveStudentSettled(studentId, { reason: normalizeArchiveReason(reason), settle: settle.settle })
        : await orgApi.archiveStudent(studentId, normalizeArchiveReason(reason));
      onArchived(result);
    } catch (cause) {
      const failed = logicaError(cause);
      if (failed.code === "BALANCE_CHANGED" && failed.fresh.length > 0) {
        settle.applyFresh(failed.fresh);
        setBusy(false);
        return;
      }
      const message = cause instanceof Error ? cause.message : "Не удалось отправить ученика в архив";
      // 409 «Ученик уже в архиве» = a stale card; 409 «…пока идёт урок…» and the rest: the server's text, the dialog stays.
      if ((cause as { status?: number } | null)?.status === 409 && isStaleArchiveConflict("archive", message)) onStale(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Ученик ушёл из центра?"
      description={studentName}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="student-archive-form"
            disabled={busy || (!settle.preview && !settle.failure?.refused)}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            В архив
          </button>
        </>
      }
    >
      <form id="student-archive-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4 pb-2" noValidate>
        <div>
          <p id="student-archive-groups" className="text-sm text-slate-700">{archiveGroupsHeading(groupNames.length)}</p>
          {settle.preview && settle.preview.memberships.length > 0 ? (
            <div className="mt-2">
              <SettleBlock preview={settle.preview} choices={settle.choices} onChoice={settle.setChoice} disabled={busy} />
            </div>
          ) : groupNames.length > 0 && (
            <ul aria-labelledby="student-archive-groups" className="mt-2 space-y-1">
              {groupNames.map((name) => (
                <li key={name} className="break-words rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800">{name}</li>
              ))}
            </ul>
          )}
        </div>

        <SettleStatus loading={settle.loading} failure={settle.failure} notice={settle.notice} onRetry={settle.reload} />

        <div className="space-y-1.5">
          <label htmlFor="student-archive-reason" className="block text-xs font-semibold text-slate-600">Причина (необязательно)</label>
          <textarea
            id="student-archive-reason"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null); }}
            maxLength={ARCHIVE_REASON_MAX}
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
          <p className="text-right text-[11px] tabular-nums text-slate-400" aria-hidden>{archiveReasonCounter(reason)}</p>
        </div>

        {diagnosticLines.length > 0 && (
          <ul className="space-y-1" aria-label="Диагностика">
            {diagnosticLines.map((line) => (
              <li key={line} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">{line}</li>
            ))}
          </ul>
        )}

        <p className="text-xs text-slate-500">{ARCHIVE_KEEPS_NOTE}</p>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
