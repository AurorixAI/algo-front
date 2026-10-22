"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  CONFLICT_EXPLAIN,
  CONFLICT_KEEP_MINE,
  CONFLICT_TAKE_THEIRS,
  FINISH_LESSON_ACTION,
  FINISH_LESSON_BACK,
  conflictHeadline,
  conflictRows,
  liveExamConfirmText,
  type MarkRecords,
} from "@/lib/attendance-ops";
import { MARK_CELL_LABEL } from "@/lib/attendance-marks";
import type { AttendanceConflictDetail, LiveExamItem } from "@/lib/ops-b-types";

export interface AttendanceConflictState {
  detail: AttendanceConflictDetail;
  /** the marks as the screen loaded or saved them last */
  base: MarkRecords;
  /** the marks on the screen now: my edits are the difference from `base` */
  mine: MarkRecords;
}

function markText(value: string): string {
  if (!value) return "не отмечен";
  return (MARK_CELL_LABEL as Record<string, string>)[value] ?? value;
}

/** What the two editors disagree about: my edits against what the journal holds now. */
export function AttendanceConflictBody({
  conflict,
  names,
  error,
}: {
  conflict: AttendanceConflictState;
  /** student id -> «Фамилия Имя» */
  names: Record<string, string>;
  error?: string | null;
}) {
  const rows = conflictRows(conflict.base, conflict.mine, conflict.detail.records ?? {});
  return (
    <div className="space-y-3 pb-1">
      <p className="flex items-start gap-2 text-sm font-semibold text-slate-900">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> <span>{conflictHeadline(conflict.detail)}</span>
      </p>
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-500">
                <th scope="col" className="px-3 py-2">Ученик</th>
                <th scope="col" className="px-3 py-2">Ваша отметка</th>
                <th scope="col" className="px-3 py-2">Сейчас в журнале</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.studentId} className={row.differs ? "bg-amber-50/50" : undefined}>
                  <td className="px-3 py-2 font-medium text-slate-900">{names[row.studentId] ?? "Ученик"}</td>
                  <td className="px-3 py-2 text-slate-700">{markText(row.mine)}</td>
                  <td className={`px-3 py-2 ${row.differs ? "font-semibold text-amber-800" : "text-slate-500"}`}>{markText(row.current)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">{CONFLICT_EXPLAIN}</p>
      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}

/**
 * O7 (LOGIC-B): two people saved the same lesson.  The dialog stays until a choice is made (it cannot be dismissed: the unsent marks of
 * this screen live in it): «Оставить мои» sends them again over the other person's marks, «Принять чужие» takes what the journal holds.
 */
export function AttendanceConflictDialog({
  conflict,
  names,
  busy,
  error,
  onKeepMine,
  onTakeTheirs,
  aboveLessonPanel = false,
}: {
  conflict: AttendanceConflictState | null;
  names: Record<string, string>;
  busy: boolean;
  error?: string | null;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  /** Over the lesson panel of the teacher's cabinet. */
  aboveLessonPanel?: boolean;
}) {
  return (
    <Modal
      open={conflict !== null}
      title="Отметки уже изменены"
      icon={<RefreshCw className="h-5 w-5" />}
      onClose={() => undefined}
      busy
      aboveLessonPanel={aboveLessonPanel}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onTakeTheirs} disabled={busy} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {CONFLICT_TAKE_THEIRS}
          </button>
          <button type="button" onClick={onKeepMine} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {CONFLICT_KEEP_MINE}
          </button>
        </>
      }
    >
      {conflict && <AttendanceConflictBody conflict={conflict} names={names} error={error} />}
    </Modal>
  );
}

/** «Экзамен «…» ещё идёт … Завершить урок?» - a sentence per exam and the question. */
export function LiveExamConfirmBody({ exams }: { exams: LiveExamItem[] }) {
  const { lines, question } = liveExamConfirmText(exams);
  return (
    <div className="space-y-2 pb-1 text-sm leading-6 text-slate-700">
      {lines.map((line) => <p key={line}>{line}</p>)}
      <p className="font-semibold text-slate-900">{question}</p>
    </div>
  );
}

/** O8 (LOGIC-B): finishing a lesson while an exam of it is running (or waiting in the lobby): said first, done on a second click. */
export function LiveExamConfirmDialog({
  exams,
  busy,
  onConfirm,
  onBack,
  aboveLessonPanel = false,
}: {
  exams: LiveExamItem[] | null;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
  aboveLessonPanel?: boolean;
}) {
  return (
    <Modal
      open={exams !== null}
      title="Экзамен ещё не закончен"
      onClose={onBack}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <button type="button" onClick={onBack} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">{FINISH_LESSON_BACK}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {FINISH_LESSON_ACTION}
          </button>
        </>
      }
    >
      {exams && <LiveExamConfirmBody exams={exams} />}
    </Modal>
  );
}
