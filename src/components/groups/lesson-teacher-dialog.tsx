"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UserRoundCheck } from "lucide-react";
import { opsApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { errorMessageOf, lessonTeacherErrorText, opsErrorCode } from "@/lib/ops-errors";
import type { LessonTeacherCandidates, LessonTeacherInfo, LessonTeacherResult } from "@/lib/ops-b-types";
import {
  ASSIGN_TEACHER_ACTION,
  REASON_LABEL,
  RETURN_GROUP_TEACHER_ACTION,
  buildAssign,
  canReturnToGroupTeacher,
  candidateBusyText,
  candidateMoneyLines,
  currentCandidate,
  isSelectable,
  lessonTeacherDialogTitle,
} from "@/lib/lesson-teacher";
import { REASON_LIMITS, reasonProblemFor } from "@/lib/reason-rules";
import { Radio } from "@/components/ui/radio";
import { useAuthStore } from "@/lib/store";
import { ModalActions } from "@/components/ui/modal-actions";
import { MODAL_ACTIONS_FOOTER_CLASS } from "@/lib/modal-layout";
import { Button } from "@/components/ui/button";

export interface LessonTeacherTarget {
  groupId: string;
  lessonId: string;
  /** YYYY-MM-DD */
  lessonDate: string;
  startTime: string;
  endTime: string;
  /** Who teaches the lesson now, as the journal / schedule knows it (absent on an older server). */
  info?: LessonTeacherInfo | null;
}

const FIELD_CLASS =
  "w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";

/**
 * O5 / F4 (LOGIC-B): «Преподаватель урока …» - the administrator or the owner chooses who teaches ONE lesson instead of the group's
 * teacher (a staff member who is free at that time; the busy ones are shown and cannot be chosen) and says why.  «Вернуть преподавателя
 * группы» takes the substitute off.  The server answers for the details: a clash, somebody changed it first, a payroll sheet already approved.
 */
export function LessonTeacherDialog({
  target,
  onClose,
  onChanged,
}: {
  target: LessonTeacherTarget | null;
  onClose: () => void;
  onChanged: (result: LessonTeacherResult) => void;
}) {
  const [list, setList] = useState<LessonTeacherCandidates | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const { user } = useAuthStore();
  const requestRef = useRef(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!target) return;
    const token = ++requestRef.current;
    setLoadError(null);
    try {
      const result = await opsApi.lessonTeacherCandidates(target.groupId, target.lessonId, target.lessonDate);
      if (token !== requestRef.current) return;
      setList(result);
    } catch (failure) {
      if (token !== requestRef.current) return;
      setList(null);
      setLoadError(errorMessageOf(failure, "Не удалось загрузить преподавателей. Повторите попытку."));
    }
  }, [target]);

  useEffect(() => {
    setList(null);
    setPick(null);
    setReason("");
    setError(null);
    setTouched(false);
    setBusy(false);
    if (target) void load();
    else requestRef.current += 1;
  }, [target, load]);

  if (!target) return null;

  const problem = reasonProblemFor("teacherChange", reason);
  const current = currentCandidate(list);
  const canReturn = canReturnToGroupTeacher(target.info) || Boolean(list && list.currentTeacherId && list.currentTeacherId !== list.defaultTeacherId);

  const send = async (teacherId: string | null) => {
    if (busy || sending.current) return;
    setTouched(true);
    // the reason is missing: the field says so under itself and takes the cursor (it may lie below the list), nothing is sent
    if (problem) { reasonRef.current?.focus(); reasonRef.current?.scrollIntoView({ block: "nearest" }); return; }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await opsApi.setLessonTeacher(
        target.groupId,
        buildAssign(target, teacherId, reason, list?.currentTeacherId ?? target.info?.teacherId ?? null),
      );
      onChanged(result);
    } catch (failure) {
      setError(lessonTeacherErrorText(failure));
      // somebody changed the lesson first, or the new teacher became busy: the list is read again
      const code = opsErrorCode(failure);
      if (code === "LESSON_TEACHER_CHANGED" || code === "TEACHER_BUSY") { setPick(null); void load(); }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={lessonTeacherDialogTitle(target.lessonDate, target.startTime, target.endTime)}
      onClose={onClose}
      busy={busy}
      size="md"
      footerClassName={MODAL_ACTIONS_FOOTER_CLASS}
      footer={(
        <ModalActions
          primary={ASSIGN_TEACHER_ACTION}
          onPrimary={() => void send(pick)}
          disabled={busy || !pick}
          busy={busy}
          onCancel={onClose}
          leading={canReturn ? <Button variant="ghost" onClick={() => void send(null)} disabled={busy} className="max-md:min-h-11">{RETURN_GROUP_TEACHER_ACTION}</Button> : undefined}
        />
      )}
    >
      <LessonTeacherBody
        list={list}
        loadError={loadError}
        current={current}
        pick={pick}
        reason={reason}
        reasonProblem={touched ? problem : null}
        reasonRef={reasonRef}
        busy={busy}
        error={error}
        role={user?.org_role ?? null}
        onPick={(id) => { setPick(id); setError(null); }}
        onReason={(value) => { setReason(value); setError(null); }}
        onRetry={() => void load()}
      />
    </Modal>
  );
}

/** The inside of the dialog: the candidates (the busy ones off) and the reason. */
export function LessonTeacherBody({
  list, loadError, current, pick, reason, reasonProblem, reasonRef, busy, error, role, onPick, onReason, onRetry,
}: {
  list: LessonTeacherCandidates | null;
  loadError: string | null;
  current: string | null;
  pick: string | null;
  reason: string;
  reasonProblem: string | null;
  reasonRef?: React.Ref<HTMLTextAreaElement>;
  busy: boolean;
  error: string | null;
  /** The viewer: the words of «Ставка не задана» depend on whether he can set the rate himself. */
  role?: string | null;
  onPick: (teacherId: string) => void;
  onReason: (value: string) => void;
  onRetry: () => void;
}) {
  if (loadError) {
    return (
      <div role="alert" className="space-y-2 pb-1">
        <p className="text-sm font-medium text-rose-700">{loadError}</p>
        <Button type="button" onClick={onRetry} variant="secondary" size="sm">Повторить</Button>
      </div>
    );
  }
  if (!list) {
    return (
      <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Загружаем преподавателей…
      </div>
    );
  }
  const candidates = list.candidates ?? [];
  return (
    <div className="space-y-4 pb-1">
      <ul role="radiogroup" aria-label="Преподаватель урока" className="max-h-[min(40vh,20rem)] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {candidates.map((candidate) => {
          const busyText = candidateBusyText(candidate);
          const isCurrent = candidate.teacherId === current;
          const selectable = isSelectable(candidate, current) && !busy;
          const checked = pick === candidate.teacherId;
          return (
            <li key={candidate.teacherId}>
              <label className={`flex items-start gap-3 px-3.5 py-3 text-sm ${selectable ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed bg-slate-50/60"} ${checked ? "bg-primary-50/50" : ""}`}>
                <Radio
                  name="lesson-teacher"
                  value={candidate.teacherId}
                  checked={checked}
                  disabled={!selectable}
                  onChange={() => onPick(candidate.teacherId)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className={`block font-medium ${selectable ? "text-slate-900" : "text-slate-500"}`}>{candidate.name}</span>
                  {isCurrent && <span className="block text-xs text-slate-500">Ведёт этот урок сейчас</span>}
                  {busyText && <span className="block text-xs font-medium text-amber-700">{busyText}</span>}
                  {candidateMoneyLines(candidate, role).map((line) => <span key={line} className="block text-xs text-slate-500">{line}</span>)}
                </span>
              </label>
            </li>
          );
        })}
        {candidates.length === 0 && <li className="px-3.5 py-3 text-sm text-slate-500">В центре нет других преподавателей.</li>}
      </ul>

      <div>
        <label htmlFor="lesson-teacher-reason" className="mb-1.5 block text-[13px] font-semibold text-slate-500">{REASON_LABEL}</label>
        <textarea
          id="lesson-teacher-reason"
          ref={reasonRef}
          value={reason}
          rows={2}
          maxLength={REASON_LIMITS.teacherChange.max}
          onChange={(event) => onReason(event.target.value)}
          disabled={busy}
          placeholder="Например: преподаватель заболел"
          aria-invalid={Boolean(reasonProblem)}
          className={FIELD_CLASS}
        />
        {reasonProblem && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{reasonProblem}</p>}
      </div>

      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}
