"use client";

import { GROUP_WITHOUT_TEACHER_WARNING } from "@/lib/staff-lifecycle";
import { Select } from "@/components/ui/select";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Archive, Info, Loader2, RotateCcw } from "lucide-react";
import { orgApi, opsApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { errorMessageOf, opsErrorCode, warningTexts } from "@/lib/ops-errors";
import { substitutionErrorText } from "@/lib/substitutions";
import type { ArchiveImpact } from "@/lib/ops-b-types";
import {
  ARCHIVE_BUTTON,
  EXAM_SERVICE_DOWN_TEXT,
  MISSED_CANCEL_OPTION,
  RESTORE_BUTTON,
  RESTORE_NO_TEACHER,
  RESTORE_TEACHER_INACTIVE_TEXT,
  TRANSFER_STUDENTS_BUTTON,
  archiveBody,
  archiveDialogView,
  archiveReasonError,
  archiveRefusalImpact,
  archiveTitle,
  archivedBannerText,
  legacyStudentsBannerText,
  missedLessonsText,
  restoreTeacherInactive,
  type ArchiveDialogView,
} from "@/lib/group-archive";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { StudentArchiveModal } from "@/components/students/student-archive-modal";
import { Checkbox } from "@/components/ui/checkbox";

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";

/**
 * O4 / F3 (LOGIC-B): «Архивировать группу «…»?» - the preflight of `archive-impact` as a dialog.  Hard stops (students, a lesson in
 * progress, missed lessons, a running exam, an exam service that does not answer) keep «В архив» off; the missed lessons can be closed
 * together with the archive on an explicit choice; what the archive does by itself (exams back to draft, future lessons) is said, not asked.
 * The students are listed with their own actions - they are moved or archived one by one, and the preflight is read again.
 */
export function GroupArchiveDialog({
  open,
  group,
  groupsBasePath,
  onClose,
  onArchived,
}: {
  open: boolean;
  group: { id: string; name: string; class_level?: number | null };
  /** Where the group pages of this workspace live: the transfer dialog links the price of the target group there. */
  groupsBasePath: string;
  onClose: () => void;
  onArchived: (message: string) => void;
}) {
  const [impact, setImpact] = useState<ArchiveImpact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelMissed, setCancelMissed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ id: string; name: string; classLevel?: number } | null>(null);
  const [archiveStudent, setArchiveStudent] = useState<{ id: string; name: string } | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++requestRef.current;
    setLoadError(null);
    try {
      const result = await opsApi.archiveImpact(group.id);
      if (token !== requestRef.current) return;
      setImpact(result);
    } catch (failure) {
      if (token !== requestRef.current) return;
      setImpact(null);
      setLoadError(opsErrorCode(failure) === "EXAM_SERVICE_UNAVAILABLE" ? EXAM_SERVICE_DOWN_TEXT : errorMessageOf(failure, "Не удалось проверить группу. Повторите попытку."));
    }
  }, [group.id]);

  useEffect(() => {
    if (!open) return;
    setImpact(null);
    setCancelMissed(false);
    setReason("");
    setError(null);
    setBusy(false);
    void load();
  }, [open, load]);

  const view = impact ? archiveDialogView(impact, cancelMissed) : null;
  const reasonProblem = archiveReasonError(reason);

  const submit = async () => {
    if (!view?.canSubmit || busy || reasonProblem) return;
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.archiveGroup(group.id, archiveBody(cancelMissed, reason));
      const cancelled = result?.cancelledMissedLessons ?? 0;
      onArchived(cancelled > 0 ? `Группа в архиве. Закрыто пропущенных уроков: ${cancelled}` : "Группа перемещена в архив");
    } catch (failure) {
      const code = opsErrorCode(failure);
      const refreshed = impact ? archiveRefusalImpact(failure, impact) : null;
      if (refreshed) {
        setImpact(refreshed);
        setError("Состояние группы изменилось. Проверьте список ниже.");
      } else if (code === "EXAM_SERVICE_UNAVAILABLE") {
        setError(EXAM_SERVICE_DOWN_TEXT);
      } else if (code === "ALREADY_ARCHIVED") {
        onArchived("Группа уже в архиве");
      } else {
        setError(errorMessageOf(failure, "Не удалось архивировать группу. Данные не изменены."));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={archiveTitle(group.name)}
        icon={<Archive className="h-5 w-5" />}
        onClose={onClose}
        busy={busy}
        maxWidthClassName="max-w-xl"
        footer={
          <>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !view?.canSubmit || Boolean(reasonProblem)}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {ARCHIVE_BUTTON}
            </button>
          </>
        }
      >
        <ArchiveDialogBody
          impact={impact}
          view={view}
          loadError={loadError}
          cancelMissed={cancelMissed}
          reason={reason}
          reasonProblem={reasonProblem}
          busy={busy}
          error={error}
          onRetry={() => void load()}
          onCancelMissed={setCancelMissed}
          onReason={(value) => { setReason(value); setError(null); }}
          onTransfer={(student) => setTransfer(student)}
          onArchiveStudent={(student) => setArchiveStudent(student)}
        />
      </Modal>

      <AssignGroupModal
        open={transfer !== null}
        studentId={transfer?.id ?? ""}
        studentName={transfer?.name ?? ""}
        studentGrade={transfer?.classLevel}
        currentGroupId={group.id}
        currentGroupName={group.name}
        excludeGroupIds={[group.id]}
        groupsBasePath={groupsBasePath}
        onClose={() => setTransfer(null)}
        onAssigned={() => { setTransfer(null); void load(); }}
      />

      <StudentArchiveModal
        open={archiveStudent !== null}
        studentId={archiveStudent?.id ?? ""}
        studentName={archiveStudent?.name ?? ""}
        groupNames={[group.name]}
        onClose={() => setArchiveStudent(null)}
        onArchived={() => { setArchiveStudent(null); void load(); }}
        onStale={() => { setArchiveStudent(null); void load(); }}
      />
    </>
  );
}

/** The inside of the archive dialog (no shell): hard stops, the choice for the missed lessons, what the archive does by itself. */
export function ArchiveDialogBody({
  impact, view, loadError, cancelMissed, reason, reasonProblem, busy, error,
  onRetry, onCancelMissed, onReason, onTransfer, onArchiveStudent,
}: {
  impact: ArchiveImpact | null;
  view: ArchiveDialogView | null;
  loadError: string | null;
  cancelMissed: boolean;
  reason: string;
  reasonProblem: string | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onCancelMissed: (value: boolean) => void;
  onReason: (value: string) => void;
  onTransfer: (student: { id: string; name: string }) => void;
  onArchiveStudent: (student: { id: string; name: string }) => void;
}) {
  if (loadError) {
    return (
      <div role="alert" className="space-y-2 pb-1">
        <p className="text-sm font-medium text-rose-700">{loadError}</p>
        <button type="button" onClick={onRetry} className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
      </div>
    );
  }
  if (!impact || !view) {
    return (
      <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Проверяем группу…
      </div>
    );
  }
  const studentStop = view.stops.find((stop) => stop.code === "ACTIVE_STUDENTS");
  const otherStops = view.stops.filter((stop) => stop.code !== "ACTIVE_STUDENTS");
  return (
    <div className="space-y-4 pb-1">
      {studentStop && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
          <p className="flex items-start gap-2 text-sm font-medium text-rose-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{studentStop.text}</span>
          </p>
          <ul className="mt-3 divide-y divide-rose-100 rounded-lg bg-white">
            {view.students.map((student) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
                <p className="min-w-0 text-sm text-slate-900">
                  <span className="font-medium">{student.name}</span>
                  {student.displayId && <span className="ml-2 text-xs text-slate-400">{student.displayId}</span>}
                </p>
                <span className="flex flex-wrap items-center gap-1.5">
                  <button type="button" disabled={busy} onClick={() => onTransfer({ id: student.id, name: student.name })} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-primary-200 hover:text-primary-700 disabled:opacity-50">
                    {TRANSFER_STUDENTS_BUTTON}
                  </button>
                  <button type="button" disabled={busy} onClick={() => onArchiveStudent({ id: student.id, name: student.name })} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:text-rose-700 disabled:opacity-50">
                    В архив
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {otherStops.map((stop, index) => (
        <p key={`${stop.code}-${index}`} role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3.5 py-3 text-sm font-medium text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{stop.text}</span>
        </p>
      ))}

      {view.offersCancelMissed && (
        <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm transition-colors ${cancelMissed ? "border-primary-300 bg-primary-50/50" : "border-slate-200 bg-white"}`}>
          <Checkbox
            className="mt-0.5"
            checked={cancelMissed}
            onChange={(event) => onCancelMissed(event.target.checked)}
            disabled={busy}
          />
          <span className="font-medium text-slate-800">
            {cancelMissed && <span className="block text-xs font-normal text-slate-500">{missedLessonsText(view.missedCount)}</span>}
            {MISSED_CANCEL_OPTION}
          </span>
        </label>
      )}

      {view.notes.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
          {view.notes.map((note) => (
            <li key={note} className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="group-archive-reason" className="mb-1.5 block text-[13px] font-semibold text-slate-500">Причина (необязательно)</label>
        <input
          id="group-archive-reason"
          type="text"
          value={reason}
          maxLength={300}
          onChange={(event) => onReason(event.target.value)}
          disabled={busy}
          placeholder="Например: группа закрыта"
          aria-invalid={Boolean(reasonProblem)}
          className={FIELD_CLASS}
        />
        {reasonProblem && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{reasonProblem}</p>}
      </div>

      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}

/** The banners over an archived group: the read-only notice with the way back, and the legacy one (students left in the archive). */
export function GroupArchivedBanner({
  archivedAt,
  studentCount,
  onRestore,
}: {
  archivedAt: string | null | undefined;
  /** Students still in the archived group (the legacy case); 0 or absent: no second banner. */
  studentCount?: number;
  /** Absent for a person who cannot restore (the banner is then only a notice). */
  onRestore?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm font-medium text-slate-700">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> <span>{archivedBannerText(archivedAt)}</span>
        </p>
        {onRestore && (
          <button type="button" onClick={onRestore} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
            <RotateCcw className="h-4 w-4" /> {RESTORE_BUTTON}
          </button>
        )}
      </div>
      {typeof studentCount === "number" && studentCount > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{legacyStudentsBannerText(studentCount)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * «Вернуть из архива».  The students do not come back, and no lessons are born for the time in the archive.  When the group's
 * teacher has left the centre meanwhile the server refuses (TEACHER_INACTIVE): the dialog then asks for a new teacher (or none) and repeats.
 */
export function GroupRestoreDialog({
  open,
  group,
  teachers,
  onClose,
  onRestored,
}: {
  open: boolean;
  group: { id: string; name: string };
  teachers: Array<{ id: string; name: string }>;
  onClose: () => void;
  /** `notes`: what the server said besides (a day off that did not apply to the lessons of the group, a lesson that stays cancelled) - never lost. */
  onRestored: (message: string, notes?: string[]) => void;
}) {
  const [needTeacher, setNeedTeacher] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setNeedTeacher(false); setTeacherId(""); setError(null); setBusy(false); }
  }, [open]);

  const submit = async () => {
    if (busy || sending.current) return;
    if (needTeacher && !teacherId) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const chosen = !needTeacher ? undefined : teacherId === "__none__" ? null : teacherId;
      const restored = await orgApi.unarchiveGroup(group.id, chosen);
      onRestored("Группа возвращена из архива", warningTexts(restored));
    } catch (failure) {
      if (restoreTeacherInactive(failure)) setNeedTeacher(true);
      else if (opsErrorCode(failure) === "NOT_ARCHIVED") onRestored("Группа уже активна");
      else setError(substitutionErrorText(failure, "Не удалось вернуть группу из архива. Данные не изменены."));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={RESTORE_BUTTON}
      description={`«${group.name}»`}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button type="button" onClick={() => void submit()} disabled={busy || (needTeacher && !teacherId)} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {RESTORE_BUTTON}
          </button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        {needTeacher ? (
          <>
            <p role="alert" className="text-sm leading-6 text-slate-700">{RESTORE_TEACHER_INACTIVE_TEXT}</p>
            <label htmlFor="restore-teacher" className="sr-only">Преподаватель группы</label>
            <Select
              id="restore-teacher"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              disabled={busy}
              options={[{ value: "", label: "Выберите преподавателя" }, ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })), { value: "__none__", label: RESTORE_NO_TEACHER }]}
              buttonClassName="py-2.5"
            />
            {teacherId === "__none__" && <p data-testid="restore-no-teacher-warning" className="text-xs font-medium text-amber-800">{GROUP_WITHOUT_TEACHER_WARNING}</p>}
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-700">
            Ученики в группу не возвращаются, уроки за время в архиве не создаются.
          </p>
        )}
        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}
