"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { orgApi, type StudentArchivedGroup } from "@/lib/api";
import {
  defaultRestoreSelection,
  isStaleArchiveConflict,
  restoreGroupIds,
  restoreNeedsReading,
  restoreOptions,
  restoreOutcome,
  restoreSummary,
  toggleRestoreGroup,
  type RestoreOutcome,
} from "@/lib/student-archive";
import { Modal } from "@/components/ui/modal";

interface StudentRestoreModalProps {
  open: boolean;
  studentId: string;
  studentName: string;
  /** Groups the last archiving closed (`archived_groups` of the profile). */
  archivedGroups: StudentArchivedGroup[] | null | undefined;
  /** Closed without a restore. */
  onClose: () => void;
  /** The student is back; the outcome lists the groups the server skipped.  Called once, after the owner has read it. */
  onRestored: (outcome: RestoreOutcome) => void;
  /** «Ученик не в архиве» (409): the card is out of date and must be read again. Other refusals stay in the dialog. */
  onStale: (message: string) => void;
}

/**
 * «Вернуть из архива»: a checkbox per former group (a full or archived group is disabled and says why).
 * When the server skips a group, the dialog stays open and lists the skipped groups with the reasons.
 */
export function StudentRestoreModal({ open, studentId, studentName, archivedGroups, onClose, onRestored, onStale }: StudentRestoreModalProps) {
  const options = useMemo(() => restoreOptions(archivedGroups), [archivedGroups]);
  const optionsKey = options.map((option) => `${option.groupId}:${option.disabled ? 0 : 1}`).join(",");
  const [selected, setSelected] = useState<string[]>(() => defaultRestoreSelection(options));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RestoreOutcome | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(defaultRestoreSelection(options));
      setBusy(false);
      setError(null);
      setDone(null);
    }
    // `options` follows `optionsKey`: a new array of the same groups must not wipe the ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, optionsKey]);

  const submit = async () => {
    if (busy) return;
    const ids = restoreGroupIds(selected, options);
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.restoreStudent(studentId, ids);
      const outcome = restoreOutcome(result, ids.length, options);
      // Nothing to read: done.  Otherwise the dialog stays and shows the skipped groups and the hints.
      if (!restoreNeedsReading(outcome)) onRestored(outcome);
      else setDone(outcome);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Не удалось вернуть ученика из архива";
      if ((cause as { status?: number } | null)?.status === 409 && isStaleArchiveConflict("restore", message)) onStale(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  // The student is already back once the result is on screen: closing it must refresh the card.
  const close = () => { if (done) onRestored(done); else onClose(); };

  if (done) {
    return (
      <Modal
        open={open}
        title="Ученик возвращён из архива"
        description={studentName}
        onClose={close}
        footer={
          <button type="button" onClick={close} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">Готово</button>
        }
      >
        <div className="space-y-4 pb-2" role="status">
          {done.lines.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>Не удалось вернуть ученика в эти группы:</span>
              </p>
              <ul className="space-y-1.5">
                {done.lines.map((line) => (
                  <li key={line} className="break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{line}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">Остальное выполнено. Зачислить ученика в другую группу можно из его карточки.</p>
            </div>
          )}
          {done.warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Обратите внимание:</p>
              <ul className="space-y-1.5">
                {done.warnings.map((line) => (
                  <li key={line} className="break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Вернуть из архива?"
      description={studentName}
      onClose={close}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="student-restore-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            Вернуть
          </button>
        </>
      }
    >
      <form id="student-restore-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3 pb-2" noValidate>
        {options.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm text-slate-700">В какие группы вернуть ученика</legend>
            {options.map((option) => {
              const noteId = `student-restore-note-${option.groupId}`;
              return (
                <label
                  key={option.groupId}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                    option.disabled ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400" : "cursor-pointer border-slate-200 text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option.groupId)}
                    disabled={option.disabled || busy}
                    aria-describedby={option.note ? noteId : undefined}
                    onChange={() => setSelected((current) => toggleRestoreGroup(current, options, option.groupId))}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">{option.name}</span>
                    {option.note && <span id={noteId} className="block text-xs text-slate-500">{option.note}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <p className="text-xs text-slate-500">{restoreSummary(restoreGroupIds(selected, options).length, options.length)}</p>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
