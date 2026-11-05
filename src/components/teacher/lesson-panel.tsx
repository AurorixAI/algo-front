"use client";

/**
 * WE-E (E1, decision 3): the panel of ONE lesson of the teacher - ONE picture for the dashboard and the schedule (before: two copies of ~520 lines).
 * The state and the rules are `useTeacherLessonPanel`; the screen gives only what it alone knows: what happens after a refresh (`onChanged`, `onMoved`)
 * and, on the schedule of a week, the series of the lesson (`recurring`: «Изменить постоянное расписание» and the group «Постоянное расписание» of the «⋯» menu).
 *
 * The banner of the lesson follows ONE order (`lessonPanelBanner` of lib/lesson-panel-view.ts): cancelled, finished, marks, a past day (the reconciliation), a future day,
 * a later lesson already started, before the start, after the end, ready.
 */
import { useEffect, useRef, useState } from "react";
import { useDialogFocus, useDialogKeys, useScrollLock } from "@/components/ui/modal";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Users, Clock, MapPin, Video, ArrowRight, X, Edit2, Play, CheckCheck, CheckCircle2, AlertCircle,
} from "lucide-react";
import { formatAttendanceSummary } from "@/lib/attendance-summary";
import { MARK_CELL_LABEL, MARK_MENU_LABEL } from "@/lib/attendance-marks";
import { formatDayMonthRu, formatIsoDateLabel, formatMinutesUntil } from "@/lib/business-time";
import { ExcuseReasonField } from "@/components/attendance/excuse-reason-field";
import { LessonPanelError } from "@/components/attendance/lesson-panel-error";
import { AttendanceConflictDialog, LiveExamConfirmDialog } from "@/components/attendance/attendance-ops-dialogs";
import { LessonCancelPanel } from "@/components/substitutions/lesson-cancel-panel";
import { LessonActionsMenu, TeacherLessonControls, type LessonMenuGroup, type LessonMenuItem } from "@/components/substitutions/teacher-lesson-controls";
import { lessonBelongsToOther, notYourLessonText } from "@/lib/lesson-teacher";
import { movedToLabel, showsGroupLinks, substituteGroupLabel } from "@/lib/substitutions";
import { LESSON_TOO_OLD_TEXT, NO_STUDENTS_FINISH_TEXT, NO_STUDENTS_START_TEXT } from "@/lib/ops-errors";
import { roomLabel } from "@/lib/schedule-slots";
import { isMovedAway, timeRange } from "@/lib/schedule-plan";
import { movedAwayLines } from "@/lib/schedule-card-actions";
import { focusEntryAgain } from "@/lib/focus-entry";
import { completedLessonNote } from "@/lib/lesson-panel-view";
import { journalHref } from "@/lib/open-lessons";
import { pluralRu } from "@/lib/payments";
import { DAYS } from "@/lib/schedule-time";
import type { AttendanceStatus } from "@/lib/api";
import type { TeacherLessonPanel, TeacherPanelLesson } from "@/lib/use-teacher-lesson-panel";

/** The row of actions under the text of a state card: shifted by the width of the icon (w-11 + gap-3.5) from `sm` up, so it stands under the text; on a phone it takes the full width of the card. */
const BANNER_ACTIONS = "mt-4 flex flex-wrap items-center gap-2 sm:pl-[3.625rem]";
const BANNER_ACTION_BASE = "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2";

/**
 * «Урока не было» under the text of a state card.  It IS the row of the «⋯» menu (label, handler and the conditions of showing come from the menu item),
 * so the card never offers what the menu does not; `busy`: no cancellation while a start / save is on its way.
 */
function CancelLessonButton({ item, busy }: { item: LessonMenuItem; busy: boolean }) {
  return (
    <button
      type="button"
      data-cancel-entry
      onClick={item.onSelect}
      disabled={busy}
      className={`${BANNER_ACTION_BASE} bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {item.label}
    </button>
  );
}

/** The series of the open lesson, on the schedule of a week only (the dashboard never changes a series). */
export interface LessonPanelRecurring {
  canRevise: boolean;
  onEdit: () => void;
  /** «Прекратить регулярные занятия» */
  onEnd: () => void;
}

export function TeacherLessonPanelView<L extends TeacherPanelLesson>({ panel, user, onChanged, onMoved, recurring }: {
  panel: TeacherLessonPanel<L>;
  user: { id?: string | null } | null;
  /** The request «Не смогу провести» was sent / withdrawn: the screen reloads what it shows. */
  onChanged: () => void;
  /** The lesson was moved (the panel is closed): the toast and the reload of the screen. */
  onMoved: (text: string, notes?: string[]) => void;
  recurring?: LessonPanelRecurring;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const {
    activeLesson, setActiveLesson, requestClose, movedTarget, openMovedLesson, activeInstanceStatus, activeCancellationReason, groupStudents, attendance, excuseReasons, savedExcuses, excuseReasonInvalidId,
    isMarkingAttendance, setIsMarkingAttendance, isAttendanceSaved, attendanceError, activeTeacherInfo, activeRequestMark, activeRosterSource,
    isCancellingLesson, setIsCancellingLesson, cancellationReason, setCancellationReason, cancelVariant, lessonExamBinding, setLessonExamBinding,
    loadingStudents, savingAttendance, marksOps, teacherActions, moveHoldsEscape, canFinishLesson, activeLessonDate, activeTimeStatus, banner,
    activeMissedAction, activeMissedUnknown, retryOpenActions, lessonTooOld, activeSubsequentLesson, ledByOther, lessonMenuItems, cancelCardItem, isLessonMenuOpen, setIsLessonMenuOpen, businessDate,
    handleAttendanceChange, handleStartLesson, handleSaveAttendance, handleFinishLesson, handleCancelLesson, openMissedLesson,
    setAttendance, setExcuseReasons, setIsAttendanceDirty, setAttendanceError, setExcuseReasonInvalidId,
    missedLessonAction, setMissedLessonAction, isCancellingMissedLesson, setIsCancellingMissedLesson, missedLessonCancellationReason, setMissedLessonCancellationReason,
    missedLessonError, setMissedLessonError, isResolvingMissedLesson, handleReconcileMissedLesson, handleCancelMissedLesson,
  } = panel;
  // the page behind neither scrolls nor stays outside the dim while the panel or the reconciliation dialog is open
  useScrollLock(Boolean(activeLesson || missedLessonAction));
  // the «⋯» menu of the lesson panel: ONE place for what can be done with the lesson, in groups by meaning
  const menuGroups: LessonMenuGroup[] = [
    { label: "Этот урок", items: lessonMenuItems },
    ...(recurring ? [{
      label: "Постоянное расписание",
      items: recurring.canRevise ? [{
        key: "end-series", label: "Прекратить регулярные занятия", hint: "Будущие уроки остановятся с выбранной даты.", icon: X, tone: "danger" as const,
        onSelect: () => { setIsLessonMenuOpen(false); recurring.onEnd(); },
      }] : [],
    }] : []),
  ];
  const menuShown = Boolean((recurring?.canRevise || (activeInstanceStatus !== "completed" && activeInstanceStatus !== "cancelled" && !isCancellingLesson)) && menuGroups.some((group) => group.items.length > 0));
  // the menu that loses its last row (the card took «Урока не было» when the roster was read) is closed with its button: no invisible menu that eats the first Escape
  useEffect(() => { if (!menuShown && isLessonMenuOpen) setIsLessonMenuOpen(false); }, [menuShown, isLessonMenuOpen, setIsLessonMenuOpen]);

  // a lesson moved away says where it went (one text with the sheet of the administrator) instead of «Урок отменён»
  const movedOutcome = activeLesson && isMovedAway(activeLesson.substitutionOutcome) ? activeLesson.substitutionOutcome : null;
  const movedAway = movedOutcome ? movedAwayLines({ movedToText: movedOutcome.movedTo ? movedToLabel(movedOutcome.movedTo) : null, reason: activeCancellationReason }) : null;

  // The keyboard and the focus of the windows (shared with `Modal`): Tab stays inside the topmost window, the focus goes to the lesson window when it opens
  // and returns to the card that opened it.  Escape stays with the screen (`consumeEscape` first: a layer of the panel keeps the key), so the layers get a no-op for it.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const missedRef = useRef<HTMLDivElement | null>(null);
  const noEscape = () => {};
  useDialogKeys(Boolean(mounted && activeLesson), panelRef, { onClose: noEscape });
  useDialogKeys(Boolean(mounted && missedLessonAction), missedRef, { onClose: noEscape });
  useDialogFocus(Boolean(activeLesson), panelRef, { ready: mounted, initial: "dialog" });

  return (
    <>
      {/* Explicit resolution for a past occurrence with no attendance row. */}
      {mounted && missedLessonAction &&
        createPortal(
          <AnimatePresence>
            <div
              onClick={(event) => {
                if (event.target === event.currentTarget && !isResolvingMissedLesson) {
                  setMissedLessonAction(null);
                }
              }}
              className="fixed left-0 top-0 z-[100000] flex items-center justify-center overflow-hidden overscroll-contain bg-slate-950/60 p-4 backdrop-blur-md"
              style={{ width: "100dvw", height: "100dvh" }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                ref={missedRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="missed-lesson-title"
                className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
                  <div>
                    <p className="text-xs font-semibold text-rose-700">Урок без отметки</p>
                    <h2 id="missed-lesson-title" className="mt-1 text-xl font-bold text-slate-900">Пропущенный урок</h2>
                  </div>
                  <button
                    type="button"
                    disabled={isResolvingMissedLesson}
                    onClick={() => setMissedLessonAction(null)}
                    aria-label="Закрыть"
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-4 px-6 py-5 sm:px-7">
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                    <p className="text-sm font-bold text-slate-900">{missedLessonAction.groupName}</p>
                    <p className="mt-1 text-xs font-semibold text-rose-800">
                      {formatIsoDateLabel(missedLessonAction.lessonDate, { weekday: "long", day: "numeric", month: "long" })} · {missedLessonAction.startTime} — {missedLessonAction.endTime}
                    </p>
                    {missedLessonAction.topic && (
                      <p className="mt-2 text-sm text-slate-700">{missedLessonAction.topic}</p>
                    )}
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    Урок не был начат в системе. Мы не подставляем посещаемость и не создаём время начала задним числом — выберите фактический исход.
                  </p>
                  {missedLessonError && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                      {missedLessonError}
                    </p>
                  )}

                  {!isCancellingMissedLesson ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={isResolvingMissedLesson}
                        onClick={handleReconcileMissedLesson}
                        className="rounded-2xl bg-emerald-600 px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="block">Оформить проведённый урок</span>
                        <span className="mt-1 block text-xs font-medium text-emerald-100">Откроется журнал посещаемости за эту дату</span>
                      </button>
                      <button
                        data-cancel-entry
                        type="button"
                        disabled={isResolvingMissedLesson}
                        onClick={() => {
                          setMissedLessonError(null);
                          setIsCancellingMissedLesson(true);
                        }}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="block">Урока не было</span>
                        <span className="mt-1 block text-xs font-medium text-rose-600">Причина обязательно сохранится в журнале</span>
                      </button>
                    </div>
                  ) : (
                    // rule 38: the SAME panel as the lesson panel's «Урока не было» (the list of missed lessons asks no exam: the server decides)
                    <LessonCancelPanel
                      autoFocus
                      date={missedLessonAction.lessonDate}
                      reason={missedLessonCancellationReason}
                      onReason={setMissedLessonCancellationReason}
                      busy={isResolvingMissedLesson}
                      onConfirm={() => void handleCancelMissedLesson()}
                      onBack={() => { setIsCancellingMissedLesson(false); setMissedLessonCancellationReason(""); setMissedLessonError(null); focusEntryAgain(missedRef.current, ["[data-cancel-entry]"]); }}
                    />
                  )}
                </div>
                <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-right sm:px-7">
                  <button
                    type="button"
                    disabled={isResolvingMissedLesson}
                    onClick={() => setMissedLessonAction(null)}
                    className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Разобрать позже
                  </button>
                </div>
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body,
        )}

      {/* MODAL: LESSON DETAILS & ATTENDANCE (the dashboard and the schedule) */}
      {mounted && activeLesson &&
        createPortal(
          <AnimatePresence>
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) void requestClose();
              }}
              className="fixed left-0 top-0 z-[99999] flex items-center justify-center overflow-hidden overscroll-contain p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md transition-all"
              style={{ width: "100dvw", height: "100dvh" }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="lesson-panel-title"
                className="bg-white rounded-3xl outline-none max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 ring-1 ring-black/5 max-h-[90vh] overflow-y-auto"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <span className="text-xs font-semibold text-primary-600">
                      {activeLesson.occurrenceDate
                        ? formatIsoDateLabel(activeLesson.occurrenceDate, { weekday: "long", day: "numeric", month: "long" })
                        : DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name || "День урока"} · {activeLesson.startTime} — {activeLesson.endTime}
                    </span>
                    {activeLesson.isRescheduled && activeLesson.originalStartTime && (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Перенесён: {timeRange(activeLesson.originalStartTime, activeLesson.originalEndTime)} → {timeRange(activeLesson.startTime, activeLesson.endTime)}
                      </p>
                    )}
                    <div className="flex items-center gap-2.5 mt-1">
                      <h3 id="lesson-panel-title" className="text-xl sm:text-2xl font-bold text-slate-900">
                        {activeLesson.groupName}
                      </h3>
                      {activeLesson.classLevel && (
                        <span className="shrink-0 whitespace-nowrap text-xs px-2.5 py-0.5 rounded-full font-bold bg-violet-50 text-violet-700 border border-violet-200/60">
                          {activeLesson.classLevel} класс
                        </span>
                      )}
                      {activeTeacherInfo?.isSubstitution && activeTeacherInfo.teacherId === user?.id && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-violet-600 text-white">{substituteGroupLabel(activeLesson.groupName)}</span>
                      )}
                    </div>
                    {lessonBelongsToOther(activeTeacherInfo, user?.id) && (
                      <p role="status" className="mt-1.5 text-xs font-semibold text-amber-800">{notYourLessonText(activeTeacherInfo)}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      {activeLesson.format === "online" ? (
                        <>
                          <Video className="w-3.5 h-3.5 text-purple-600" /> Zoom класс
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3.5 h-3.5 text-slate-400" /> {roomLabel(activeLesson)}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => void requestClose()}
                    aria-label="Закрыть"
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Topic Section */}
                {activeLesson.topic && (
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 mb-5">
                    <p className="text-xs font-semibold text-slate-500">Тема урока</p>
                    <p className="text-sm font-medium text-slate-800 mt-1">{activeLesson.topic}</p>
                  </div>
                )}

                {/* LOGIC-B2: «Не смогу провести» / «Вы запросили замену»; P1.1: «Перенести урок» */}
                {!loadingStudents && (
                  <TeacherLessonControls
                    lesson={{
                      groupId: activeLesson.groupId, groupName: activeLesson.groupName, lessonId: activeLesson.id, lessonDate: activeLessonDate || businessDate,
                      startTime: activeLesson.startTime, endTime: activeLesson.endTime, room: activeLesson.room ?? "", format: activeLesson.format === "online" ? "online" : "offline", topic: activeLesson.topic ?? undefined,
                    }}
                    mark={activeRequestMark} lessonTeacherId={activeTeacherInfo?.teacherId} isSubstitution={activeTeacherInfo?.isSubstitution} lessonStatus={activeInstanceStatus} actions={teacherActions}
                    onChanged={onChanged}
                    onMoved={(text, notes) => { setActiveLesson(null); onMoved(text, notes); }}
                    onDialogChange={(open) => { moveHoldsEscape.current = open; }}
                  />
                )}

                {/* Attendance Section */}
                <div className="mb-6">
                  {ledByOther ? (
                  <p role="status" data-testid="led-by-other" className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs font-semibold text-violet-900">
                    {notYourLessonText(activeTeacherInfo ?? { teacherName: activeLesson.replacedBy?.name ?? null })} Отметки, перенос и отмена — у него.
                  </p>
                ) : loadingStudents ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                      Загрузка данных урока...
                    </div>
                  ) : groupStudents.length === 0 ? (
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                      {/* O6: a lesson with nobody on its roster is not started and not finished - «Урока не было» closes it */}
                      <p role="status" className="font-medium">{activeInstanceStatus === "in_progress" ? NO_STUDENTS_FINISH_TEXT : NO_STUDENTS_START_TEXT}</p>
                      {activeInstanceStatus === "scheduled" && (
                        <button type="button" disabled title={NO_STUDENTS_START_TEXT} className="inline-flex shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500">
                          <Play className="h-3.5 w-3.5" /> Начать урок
                        </button>
                      )}
                    </div>
                  ) : !isMarkingAttendance ? (
                    /* STEP 1: Overview & Status Banner */
                    <div className="space-y-4">
                      {banner === "cancelled" ? (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                              <X className="w-5 h-5" />
                            </div>
                            {movedAway ? (
                              <div>
                                <p className="text-xs font-bold text-slate-900">{movedAway.title}</p>
                                {movedAway.reason && <p className="text-xs text-slate-600 mt-0.5">Причина: {movedAway.reason}</p>}
                              </div>
                            ) : (
                              <div>
                                <p className="text-xs font-bold text-slate-900">Урок отменён</p>
                                <p className="text-xs text-slate-600 mt-0.5">Причина: {activeCancellationReason || "не указана"}</p>
                              </div>
                            )}
                          </div>
                          {movedAway && movedTarget && (
                            <button type="button" onClick={openMovedLesson} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shrink-0">
                              Открыть урок {formatDayMonthRu(movedTarget.occurrenceDate)}
                            </button>
                          )}
                        </div>
                      ) : banner === "completed" ? (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">Урок завершён</p>
                            <p className="text-xs text-slate-600 mt-0.5">{completedLessonNote({ tooOld: lessonTooOld }).text}</p>
                            {completedLessonNote({ tooOld: lessonTooOld }).journalLink && activeLesson.groupId && activeLessonDate && (
                              <Link
                                data-testid="panel-correct-in-journal"
                                href={journalHref("/teacher/groups", { groupId: activeLesson.groupId, lessonDate: activeLessonDate, lessonId: activeLesson.id })}
                                className="mt-1 inline-block text-xs font-semibold text-primary-700 underline-offset-2 hover:underline"
                              >
                                Открыть журнал группы
                              </Link>
                            )}
                          </div>
                        </div>
                      ) : banner === "tooOld" ? (
                        /* older than the window of the teacher: ONE line instead of any action (the date and the time are in the header) */
                        <div role="status" className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-semibold text-slate-700">{LESSON_TOO_OLD_TEXT}</p>
                        </div>
                      ) : banner === "dirty" ? (
                        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-amber-950">Есть несохранённые изменения</p>
                              <p className="text-xs text-amber-800 mt-0.5 font-medium">Отмечено: {Object.keys(attendance).length} из {groupStudents.length}. Сохраните отметки, чтобы они появились в журнале.</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => setIsMarkingAttendance(true)} className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-200 hover:bg-amber-50 rounded-xl transition-colors shrink-0 shadow-2xs">Продолжить отметку</button>
                        </div>
                      ) : banner === "saved" ? (
                        /* Saved attendance status card */
                        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <CheckCheck className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-emerald-900">
                                  {Object.keys(attendance).length === groupStudents.length
                                    ? activeTimeStatus?.type === "live"
                                      ? "Идёт урок · Посещаемость отмечена"
                                      : "Посещаемость отмечена"
                                    : `Сохранено: ${Object.keys(attendance).length} из ${groupStudents.length}`}
                                </p>
                                {activeTimeStatus?.type === "live" && (
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                                {formatAttendanceSummary(attendance, groupStudents.length)}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsMarkingAttendance(true)}
                            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-xl transition-colors shrink-0 shadow-2xs"
                          >
                            {Object.keys(attendance).length < groupStudents.length ? "Продолжить отметку" : "Изменить отметки"}
                          </button>
                        </div>
                      ) : banner === "started" ? (
                        <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <Play className="w-5 h-5 fill-current" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">Урок начат</p>
                              <p className="text-sm text-emerald-700 mt-0.5">Отметьте учеников и сохраните, затем завершите урок.</p>
                            </div>
                          </div>
                          <div className={BANNER_ACTIONS}>
                            <button
                              type="button"
                              onClick={() => setIsMarkingAttendance(true)}
                              className={`${BANNER_ACTION_BASE} bg-emerald-600 hover:bg-emerald-700 text-white`}
                            >
                              Заполнить посещаемость
                            </button>
                          </div>
                        </div>
                      ) : banner === "past" ? (
                        /* A past day's lesson which was never started: the server
                           starts a lesson on its own day only, so the panel must not
                           offer a start. It is settled as "missed" instead. */
                        <div className="p-5 rounded-2xl bg-rose-50/60 border border-rose-200/80">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-rose-950">Урок не был начат</p>
                              <p className="text-sm text-rose-800 mt-0.5">
                                {activeMissedUnknown ? "Не удалось проверить, нужно ли оформить урок." : "Начать его нельзя: урок запускается только в день проведения."}
                              </p>
                            </div>
                          </div>
                          {/* the way out: with a task of the server «Разобрать» (the dialog offers both outcomes); the list unread: «Повторить» (no cancellation before we know); else the cancellation with a reason */}
                          {(activeMissedUnknown || activeMissedAction || cancelCardItem) && (
                            <div className={BANNER_ACTIONS}>
                              {activeMissedUnknown && (
                                <button
                                  type="button"
                                  onClick={retryOpenActions}
                                  className={`${BANNER_ACTION_BASE} bg-slate-900 hover:bg-slate-800 text-white`}
                                >
                                  Повторить
                                </button>
                              )}
                              {activeMissedAction && (
                                <button
                                  type="button"
                                  onClick={() => openMissedLesson(activeMissedAction)}
                                  className={`${BANNER_ACTION_BASE} bg-slate-900 hover:bg-slate-800 text-white`}
                                >
                                  Разобрать пропущенный урок
                                </button>
                              )}
                              {cancelCardItem && <CancelLessonButton item={cancelCardItem} busy={savingAttendance} />}
                            </div>
                          )}
                        </div>
                      ) : banner === "future" ? (
                        <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-950">Урок ещё не наступил</p>
                            <p className="text-sm text-amber-800 mt-0.5">Начать урок можно только в день проведения.</p>
                          </div>
                        </div>
                      ) : banner === "subsequent" && activeSubsequentLesson ? (
                        <div className="p-5 rounded-2xl bg-rose-50/60 border border-rose-200/80">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-rose-950">Урок больше нельзя начать</p>
                              <p className="text-sm text-rose-800 mt-0.5">
                                Уже начат следующий урок «{activeSubsequentLesson.groupName}» ({activeSubsequentLesson.startTime}—{activeSubsequentLesson.endTime}). Отметки за этот урок недоступны — отмените его с причиной.
                              </p>
                            </div>
                          </div>
                          {cancelCardItem && (
                            <div className={BANNER_ACTIONS}>
                              <CancelLessonButton item={cancelCardItem} busy={savingAttendance} />
                            </div>
                          )}
                        </div>
                      ) : banner === "upcoming" && activeTimeStatus ? (
                        /* TODAY UPCOMING LESSON: Cannot start yet */
                        <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-amber-950">Урок ещё не начался</p>
                              <p className="text-sm text-amber-800 mt-0.5">Начало через {formatMinutesUntil(activeTimeStatus.diffMinutes)}.</p>
                            </div>
                          </div>
                        </div>
                      ) : banner === "overdue" ? (
                        /* The occurrence was never started.  Do not bypass the
                           actual-start record by opening attendance directly. */
                        <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-amber-950">Урок не был начат</p>
                              <p className="text-sm text-amber-800 mt-0.5">Начните урок, чтобы отметить посещаемость.</p>
                            </div>
                          </div>
                          {!isAttendanceSaved && (
                            <>
                              <div className={BANNER_ACTIONS}>
                                <button
                                  type="button"
                                  onClick={handleStartLesson}
                                  disabled={savingAttendance}
                                  className={`${BANNER_ACTION_BASE} bg-slate-900 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 text-white`}
                                >
                                  <Play className="w-3.5 h-3.5 fill-white" />
                                  Начать урок
                                </button>
                                {/* the row of the «⋯» menu moved here: the card shows it, the menu then does not (`cancelShownInCard`) */}
                                {cancelCardItem && <CancelLessonButton item={cancelCardItem} busy={savingAttendance} />}
                              </div>
                              <p className="mt-2 sm:pl-[3.625rem] text-xs text-slate-500">Время начала запишется в момент нажатия.</p>
                            </>
                          )}
                        </div>
                      ) : (
                        /* TODAY LIVE LESSON: Ready to start */
                        <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <Users className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                Состав группы ({groupStudents.length} {pluralRu(groupStudents.length, ["ученик", "ученика", "учеников"])})
                              </p>
                              <p className="text-sm text-emerald-700 mt-0.5">Начните урок, чтобы отметить посещаемость.</p>
                            </div>
                          </div>
                          <div className={BANNER_ACTIONS}>
                            <button
                              type="button"
                              onClick={handleStartLesson}
                              disabled={savingAttendance}
                              className={`${BANNER_ACTION_BASE} disabled:cursor-not-allowed disabled:opacity-50 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm shadow-emerald-600/25`}
                            >
                              <Play className="w-3.5 h-3.5 fill-white" />
                              Начать урок
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* STEP 2: Attendance Marking Mode */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-primary-600" />
                            Отметка посещаемости ({Object.keys(attendance).length} из {groupStudents.length})
                          </h4>
                          {groupStudents.length > Object.keys(attendance).length && (
                            <span className="whitespace-nowrap text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80">
                              Осталось: {groupStudents.length - Object.keys(attendance).length}
                            </span>
                          )}
                        </div>
                      </div>

                      {attendanceError && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{attendanceError}</span>
                        </div>
                      )}

                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {groupStudents.map((st) => {
                          const status = attendance[st.id];
                          const isUnmarked = !status;
                          return (
                            <div
                              key={st.id}
                              className={`flex flex-wrap items-center justify-between p-2.5 rounded-xl border transition-all ${
                                isUnmarked && attendanceError
                                  ? "bg-rose-50/50 border-rose-300 ring-1 ring-rose-400/20"
                                  : "bg-slate-50/70 hover:bg-slate-50 border-slate-100"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                  {st.full_name?.[0] || "У"}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-medium text-slate-800 truncate block">
                                    {st.full_name}
                                  </span>
                                  {isUnmarked && attendanceError && (
                                    <span className="text-[10px] text-rose-600 font-semibold">Не отмечен</span>
                                  )}
                                </div>
                              </div>

                              <div className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                                <button
                                  type="button"
                                  onClick={() => handleAttendanceChange(st.id, "present")}
                                  title={status === "present" ? `Снять отметку «${MARK_MENU_LABEL.present}»` : `Отметить «${MARK_MENU_LABEL.present}»`}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                    status === "present"
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50"
                                  }`}
                                >
                                  {MARK_CELL_LABEL.present}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAttendanceChange(st.id, "late")}
                                  title={status === "late" ? `Снять отметку «${MARK_MENU_LABEL.late}»` : `Отметить «${MARK_MENU_LABEL.late}»`}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                    status === "late"
                                      ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                                      : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50/50"
                                  }`}
                                >
                                  {MARK_CELL_LABEL.late}
                                </button>
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(st.id, "absent")}
                                title={status === "absent" ? `Снять отметку «${MARK_MENU_LABEL.absent}»` : `Отметить «${MARK_MENU_LABEL.absent}»`}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                    status === "absent"
                                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                      : "bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/50"
                                  }`}
                              >
                                {MARK_CELL_LABEL.absent}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(st.id, "excused")}
                                title={status === "excused" ? `Снять отметку «${MARK_MENU_LABEL.excused}»` : `Отметить «${MARK_MENU_LABEL.excused}»`}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                  status === "excused"
                                    ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/50"
                                }`}
                              >
                                {MARK_CELL_LABEL.excused}
                              </button>
                              </div>
                              {status === "excused" && (
                                <ExcuseReasonField
                                  value={excuseReasons[st.id] ?? savedExcuses[st.id]?.reason ?? ""}
                                  saved={excuseReasons[st.id] === undefined && Boolean(savedExcuses[st.id])}
                                  invalid={excuseReasonInvalidId === st.id}
                                  onChange={(value) => { setExcuseReasons((prev) => ({ ...prev, [st.id]: value })); setIsAttendanceDirty(true); setAttendanceError(null); setExcuseReasonInvalidId(null); }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setIsMarkingAttendance(false)}
                          className="mr-auto px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                          Отметить позже
                        </button>
                        {canFinishLesson && (
                          <button
                            type="button"
                            onClick={() => void handleFinishLesson()}
                            disabled={savingAttendance}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Завершить урок
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleSaveAttendance()}
                          disabled={savingAttendance}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl transition-colors shadow-xs"
                        >
                          {savingAttendance ? "Сохранение..." : "Сохранить отметки"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isCancellingLesson && activeInstanceStatus !== "completed" && activeInstanceStatus !== "cancelled" && !isMarkingAttendance && (
                  <LessonCancelPanel
                    autoFocus
                    oneOff={cancelVariant === "own_one_off"}
                    date={activeLessonDate || businessDate}
                    binding={lessonExamBinding}
                    reason={cancellationReason}
                    onReason={setCancellationReason}
                    busy={savingAttendance}
                    onConfirm={() => void handleCancelLesson()}
                    onBack={() => { setIsCancellingLesson(false); setCancellationReason(""); setLessonExamBinding(null); focusEntryAgain(panelRef.current, ["[data-cancel-entry]", "[data-lesson-menu-button]"]); }}
                  />
                )}

                {/* The marking list shows its own copy of the error; every other step shows it here. */}
                {!isMarkingAttendance && <LessonPanelError message={attendanceError} />}

                {/* Actions footer.  While the marks are being entered the list has its own row of buttons (with «Завершить урок»):
                    a second row under it, with a «Закрыть» that repeats the cross, is not shown (ROADMAP #114). */}
                {!isMarkingAttendance && (
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {recurring?.canRevise ? (
                      <button
                        type="button"
                        onClick={recurring.onEdit}
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-primary-50 px-3.5 py-2 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                      >
                        <Edit2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-left leading-tight"><span className="sm:hidden">Изменить расписание</span><span className="hidden sm:inline">Изменить постоянное расписание</span></span>
                      </button>
                    ) : (
                      showsGroupLinks(activeRosterSource) ? (
                        <Link
                          href={`/teacher/groups/${activeLesson.groupId || ""}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                        >
                          Перейти в группу
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : null
                    )}

                    {menuShown && (
                      <LessonActionsMenu open={isLessonMenuOpen} onOpenChange={setIsLessonMenuOpen} groups={menuGroups} />
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    {canFinishLesson ? (
                      <button
                        type="button"
                        onClick={() => void handleFinishLesson()}
                        disabled={groupStudents.length === 0}
                        title={groupStudents.length === 0 ? NO_STUDENTS_FINISH_TEXT : undefined}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 rounded-xl transition-colors shadow-2xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                        Завершить урок
                      </button>
                    ) : isAttendanceSaved ? (
                      <button
                        type="button"
                        onClick={() => void requestClose()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        Готово
                      </button>
                    ) : null}
                  </div>
                </div>
                )}
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body
        )}

      {/* LOGIC-B: two editors saved the same lesson (O7) / a running exam at the finish (O8): over the lesson panel */}
      <AttendanceConflictDialog
        aboveLessonPanel
        conflict={marksOps.conflict}
        names={Object.fromEntries(groupStudents.map((student) => [student.id, student.full_name || `${student.last_name} ${student.first_name}`.trim()]))}
        busy={marksOps.conflictBusy}
        error={marksOps.conflictError}
        onTakeTheirs={() => marksOps.takeTheirs((theirs) => {
          setAttendance(theirs as Record<string, AttendanceStatus>);
          setIsAttendanceDirty(false);
          setAttendanceError(null);
        })}
        // «Оставить мои»: my edits over theirs, then the action the person started (save / finish / cancel) is repeated with the new version
        onKeepMine={() => void marksOps.keepMine(async (operation, merged) => {
          const marks = merged as Record<string, AttendanceStatus>;
          if (operation === "finish") await handleFinishLesson(false, marks);
          else if (operation === "cancel") await handleCancelLesson();
          else await handleSaveAttendance(marks);
        })}
      />
      <LiveExamConfirmDialog
        aboveLessonPanel
        exams={marksOps.liveExams}
        busy={savingAttendance}
        onBack={marksOps.clearLiveExams}
        onConfirm={() => void handleFinishLesson(true)}
      />
    </>
  );
}
