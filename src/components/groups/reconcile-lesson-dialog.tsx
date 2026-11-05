"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { opsApi, orgApi } from "@/lib/api";
import { errorMessageOf } from "@/lib/ops-errors";
import { useDialogAction } from "@/lib/use-dialog-action";
import {
  RECONCILE_EXPLAIN,
  RECONCILE_PLANNED_NOTE,
  RECONCILE_SUBMIT,
  RECONCILE_TITLE,
  RECONCILE_WHO_LABEL,
  plannedTeacherId,
  reconcilePayNote,
  taughtByOf,
} from "@/lib/lesson-reconcile";
import { lessonFailure } from "@/lib/attendance-ops";
import type { LessonTeacherCandidates } from "@/lib/ops-b-types";
import { Modal } from "@/components/ui/modal";
import { Radio } from "@/components/ui/radio";
import { DialogError } from "@/components/money/dialog-error";

export interface ReconcileTarget {
  groupId: string;
  lessonId: string;
  /** `YYYY-MM-DD` */
  lessonDate: string;
  topic?: string | null;
  /** R3 #25: the teacher of the row of «Уроки без отметки» (already the substitute when the day has one): «Кто провёл» starts with him. */
  teacherId?: string | null;
}

/**
 * Money-1 A6: «Отметить посещаемость» of a past lesson nobody started, for the owner and an administrator with the money right: WHO taught it (the planned teacher by default).
 * The pay of the lesson goes to the chosen one; the journal marks the lesson «Оформлен задним числом».
 */
export function ReconcileLessonDialog({
  target, onClose, onDone, aboveLessonPanel = false,
}: {
  target: ReconcileTarget | null;
  onClose: () => void;
  onDone: (target: ReconcileTarget) => void;
  aboveLessonPanel?: boolean;
}) {
  const [list, setList] = useState<LessonTeacherCandidates | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const { busy, error, setError, closed, run } = useDialogAction(target ? `${target.groupId}|${target.lessonId}|${target.lessonDate}` : null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!target) return;
    const token = ++requestRef.current;
    setLoadError(null);
    try {
      const result = await opsApi.lessonTeacherCandidates(target.groupId, target.lessonId, target.lessonDate);
      if (token !== requestRef.current) return;
      setList(result);
      const fromRow = target.teacherId && (result.candidates ?? []).some((candidate) => candidate.teacherId === target.teacherId) ? target.teacherId : null;
      setPick(fromRow ?? plannedTeacherId(result));
    } catch (failure) {
      if (token !== requestRef.current) return;
      setList(null);
      setLoadError(errorMessageOf(failure, "Не удалось загрузить преподавателей. Повторите попытку."));
    }
  }, [target]);

  useEffect(() => {
    setList(null);
    setPick(null);
    if (target) void load();
    else requestRef.current += 1;
  }, [target, load]);

  const candidates = list?.candidates ?? [];
  const planned = (target?.teacherId && candidates.some((candidate) => candidate.teacherId === target.teacherId) ? target.teacherId : null) ?? plannedTeacherId(list);
  const nameOf = (id: string | null) => candidates.find((candidate) => candidate.teacherId === id)?.name ?? null;

  const submit = async () => {
    if (!target || busy) return;
    await run(async () => {
      const taughtBy = taughtByOf(pick, planned);
      await orgApi.reconcileMissedGroupAttendance(target.groupId, {
        lessonDate: target.lessonDate, lessonId: target.lessonId, ...(target.topic ? { topic: target.topic } : {}), ...(taughtBy ? { taughtBy } : {}),
      });
      onDone(target);
    });
  };

  const payNote = target ? reconcilePayNote({ lessonDate: target.lessonDate, pickName: nameOf(pick), plannedName: nameOf(planned) }) : null;
  return (
    <Modal
      open={target !== null}
      title={RECONCILE_TITLE}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="button"
            data-testid="reconcile-submit"
            onClick={() => void submit()}
            disabled={busy || !pick}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {RECONCILE_SUBMIT}
          </button>
        </>
      )}
    >
      <div className="space-y-3 pb-2">
        <p className="text-sm leading-6 text-slate-700">{RECONCILE_EXPLAIN}</p>
        {loadError ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm font-medium text-rose-700">{loadError}</p>
            <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
          </div>
        ) : !list ? (
          <p role="status" className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем преподавателей…</p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-slate-600">{RECONCILE_WHO_LABEL}</legend>
            <ul role="radiogroup" aria-label={RECONCILE_WHO_LABEL} className="max-h-[min(40vh,18rem)] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {candidates.map((candidate) => (
                <li key={candidate.teacherId}>
                  <label className={`flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-sm hover:bg-slate-50 ${pick === candidate.teacherId ? "bg-primary-50/50" : ""}`}>
                    <Radio name="reconcile-teacher" value={candidate.teacherId} checked={pick === candidate.teacherId} disabled={busy} onChange={() => { setPick(candidate.teacherId); setError(null); }} />
                    <span className="min-w-0 font-medium text-slate-900">
                      {candidate.name}
                      {candidate.teacherId === planned && <span className="ml-2 text-xs font-normal text-slate-500">{RECONCILE_PLANNED_NOTE}</span>}
                    </span>
                  </label>
                </li>
              ))}
              {candidates.length === 0 && <li className="px-3.5 py-3 text-sm text-slate-500">В центре нет преподавателей.</li>}
            </ul>
            {payNote && <p data-testid="reconcile-pay-note" className="text-xs font-medium text-amber-800">{payNote}</p>}
          </fieldset>
        )}
        <DialogError error={error} closed={closed} text={(failure) => lessonFailure(failure, "reconcile", "Не удалось выполнить действие. Данные не изменены.").text} onReopened={() => setError(null)} aboveLessonPanel={aboveLessonPanel} />
      </div>
    </Modal>
  );
}
