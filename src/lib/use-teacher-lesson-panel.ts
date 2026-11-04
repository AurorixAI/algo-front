"use client";

/**
 * WE-E (E1, decision 3): the panel of ONE lesson of the teacher - ONE hook for the dashboard and the schedule (before: two copies of ~600 lines that had drifted apart).
 *
 * The hook owns everything the panel shows and does: the open lesson and its journal (`useLessonPanelData`: the answer of a lesson that is no longer open is dropped),
 * the marks, the start / save / finish / «Урока не было» writes with the rules of both former copies (the date check at the start, «следующий начатый урок»,
 * the version of the record, the conflict of two editors, a running exam, a write whose panel was closed), and the reconciliation of a past lesson that was never started.
 * What differs between the screens is only what each does AFTER a write (its own cards, counters, lists): the screen gives `onWritten` and `notifyRefusal`.
 * The picture is `components/teacher/lesson-panel.tsx`.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  orgApi, examsApi,
  type AttendanceStatus, type GroupInfo, type LessonAttendanceStatus, type OpenAttendanceAction, type ScheduleOccurrence, type StudentInGroup,
} from "./api";
import { businessDayOfWeek, businessTimeMinutes, isoDateDayOfWeek } from "./business-time";
import { askConfirm } from "./confirm-dialog";
import { collectExcuseReasons, firstMissingExcuseReason } from "./attendance-excuses";
import { examSyncNotice, isLessonTooOld, lessonFailure } from "./attendance-ops";
import { canFinishLessonNow, lessonDateRelation, startBlockedReason } from "./lesson-actions";
import {
  lessonCancelRef, lessonDateOf, lessonPanelKey, lessonStartBody, lessonWriteBody, planAfterWrite, useLessonPanelData, useLessonWrites,
  type LessonPanelSnapshot, type PanelLesson,
} from "./lesson-panel-data";
import { cancelShownInCard, lessonPanelBanner } from "./lesson-panel-view";
import { lessonBelongsToOther, teacherInfoOfOccurrence } from "./lesson-teacher";
import type { LessonTeacherInfo } from "./ops-b-types";
import { LESSON_TOO_OLD_TEXT, NO_STUDENTS_FINISH_TEXT, NO_STUDENTS_START_TEXT } from "./ops-errors";
import { reasonProblemFor } from "./reason-rules";
import { isOwnOneOff, teacherCancelOffer, type TeacherCancelOffer } from "./schedule-card-actions";
import { getLessonTimeStatus } from "./schedule-time";
import { narrowToFrozenRoster, type RosterSource } from "./substitutions";
import type { SubstitutionRequestMark } from "./substitution-types";
import { sendTeacherCancel } from "./teacher-cancel";
import { useLessonMarksOps } from "./use-lesson-marks-ops";
import { useNow } from "./use-now";
import { getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import type { LessonCancelBinding } from "@/components/substitutions/lesson-cancel-panel";
import { teacherLessonMenuItems, useTeacherLessonActions } from "@/components/substitutions/teacher-lesson-controls";

/** What the panel shows of a lesson: a lesson of today's list, a card of the week and the lesson rebuilt from a task of the server are all of this shape. */
export interface TeacherPanelLesson extends PanelLesson {
  id: string;
  groupId: string;
  groupName: string;
  classLevel?: number | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: string | null;
  topic?: string | null;
  isRescheduled?: boolean;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  isOneOff?: boolean;
  createdBy?: { id?: string | null } | null;
  movedFrom?: unknown;
  replacedBy?: { id: string; name: string } | null;
  substitutionRequest?: SubstitutionRequestMark | null;
  teacherId?: string | null;
  teacherName?: string | null;
  isSubstitution?: boolean;
  defaultTeacherId?: string | null;
  defaultTeacherName?: string | null;
}

/** The lesson of a task of the server (a past lesson that was never started, or a journal left open): what the panel opens for it. */
export function lessonFromAttendanceAction(action: OpenAttendanceAction): ScheduleOccurrence & { room: string } {
  return {
    id: action.lessonId,
    groupId: action.groupId,
    groupName: action.groupName,
    classLevel: action.classLevel,
    subject: action.subject,
    dayOfWeek: isoDateDayOfWeek(action.lessonDate),
    startTime: action.startTime,
    endTime: action.endTime,
    room: action.room || "",
    format: action.format === "online" ? "online" : "offline",
    color: "blue",
    topic: action.topic || undefined,
    occurrenceDate: action.lessonDate,
    isRescheduled: false,
  };
}

/** What the screen has to learn about a write of the panel to keep ITS cards right (a map by lesson id is right whichever lesson is open). */
export type LessonWriteEvent<L> =
  | { kind: "loaded"; lesson: L; date: string; snapshot: LessonPanelSnapshot }
  | { kind: "started"; lesson: L; date: string }
  | { kind: "saved"; lesson: L; date: string; marks: Record<string, AttendanceStatus>; rosterCount: number }
  | { kind: "finished"; lesson: L; date: string; syncNotice: string | null }
  | { kind: "cancelled"; lesson: L; date: string; notes: string[] };

export type LifecycleOf = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface TeacherLessonPanelHost<L extends TeacherPanelLesson> {
  businessDate: string;
  /** The groups of the teacher (a lesson of another group is a substitution). */
  groups: GroupInfo[];
  /** The viewer: the id (the lesson is «his», the substitute label) and the role (what «Урока не было» offers). */
  user: { id?: string | null; role?: string | null; org_role?: string | null } | null;
  /** The lessons of the teacher today and their state (what «следующий начатый урок» is asked of). */
  todayLessons: readonly L[];
  statusOfToday: (lesson: L) => LifecycleOf;
  /** The journal of today holds saved marks for the lesson (a card map of the screen). */
  hasSavedMarks: (lessonId: string) => boolean;
  /** The server's list of lessons that need a decision (a past lesson that was never started is in it as `missed`). */
  openActions: OpenAttendanceAction[];
  setOpenActions: Dispatch<SetStateAction<OpenAttendanceAction[]>>;
  /** The list of the server's tasks was read (false: it could not be - «нужно ли оформить урок» is then unknown, not «нет»). */
  openActionsKnown: boolean;
  /** Read that list again («Повторить»). */
  retryOpenActions: () => void;
  /** A lesson rebuilt from a task of the server (the one the reconciliation opens). */
  lessonFromAction: (action: OpenAttendanceAction) => L;
  onWritten: (event: LessonWriteEvent<L>) => void;
  /** A refusal that arrives when the panel of its lesson is gone: the screen shows it (a toast with the reason). */
  notifyRefusal: (notice: string, reason: string) => void;
  /** «Урока не было» of a past lesson went through (the notes of the server, if any); the screen reloads what it shows. */
  onMissedCancelled: (notes: string[]) => void;
}

/** Everything the screen asks about the lesson of the open panel; the one reading of the rules. */
export function useTeacherLessonPanel<L extends TeacherPanelLesson>(host: TeacherLessonPanelHost<L>) {
  const { businessDate } = host;
  const hostRef = useRef(host);
  hostRef.current = host;

  const [activeLesson, setActiveLesson] = useState<L | null>(null);
  const [activeInstanceStatus, setActiveInstanceStatus] = useState<LessonAttendanceStatus>("scheduled");
  const [activeCancellationReason, setActiveCancellationReason] = useState<string | null>(null);
  const [groupStudents, setGroupStudents] = useState<StudentInGroup[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  // Reasons for "Уважительная" typed in this dialog, and excuses the server already holds for the lesson.
  const [excuseReasons, setExcuseReasons] = useState<Record<string, string>>({});
  const [savedExcuses, setSavedExcuses] = useState<Record<string, { reason: string }>>({});
  const [excuseReasonInvalidId, setExcuseReasonInvalidId] = useState<string | null>(null);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [isAttendanceSaved, setIsAttendanceSaved] = useState(false);
  const [isAttendanceDirty, setIsAttendanceDirty] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  // LOGIC-B: the version of the lesson record, the conflict of two editors, the exam a finish waits for.
  const marksOps = useLessonMarksOps();
  const [activeTeacherInfo, setActiveTeacherInfo] = useState<LessonTeacherInfo | null>(null);
  const [activeRequestMark, setActiveRequestMark] = useState<SubstitutionRequestMark | null>(null);
  const [activeRosterSource, setActiveRosterSource] = useState<RosterSource>("group");
  const [isCancellingLesson, setIsCancellingLesson] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  /** W1 F1: how «Урока не было» is sent (see `teacherCancelOffer`); a double press is closed by the ref, not only by `savingAttendance` (rule 27). */
  const [cancelRoute, setCancelRoute] = useState<TeacherCancelOffer["route"]>("missed");
  const [cancelVariant, setCancelVariant] = useState<TeacherCancelOffer["variant"]>("not_held");
  const cancelSending = useRef(false);
  const [lessonExamBinding, setLessonExamBinding] = useState<LessonCancelBinding | null>(null);
  // the reconciliation of a past lesson that was never started
  const [missedLessonAction, setMissedLessonAction] = useState<OpenAttendanceAction | null>(null);
  const [isCancellingMissedLesson, setIsCancellingMissedLesson] = useState(false);
  const [missedLessonCancellationReason, setMissedLessonCancellationReason] = useState("");
  const [missedLessonError, setMissedLessonError] = useState<string | null>(null);
  const [isResolvingMissedLesson, setIsResolvingMissedLesson] = useState(false);
  const missedSending = useRef(false);
  const moveHoldsEscape = useRef(false);                 // the move dialog (TeacherMoveControl) is above the panel and keeps the key to itself
  const teacherActions = useTeacherLessonActions();      // «Перенести урок» / «Не смогу провести»: rows of the «⋯» menu of the panel
  const { menuOpen: isLessonMenuOpen, setMenuOpen: setIsLessonMenuOpen, reset: resetLessonActions } = teacherActions;
  useEffect(() => { resetLessonActions(); }, [activeLesson?.id, activeLesson?.occurrenceDate, resetLessonActions]);   // a new lesson starts with no dialog and no stale menu rows

  // The panel of the open lesson (WB-P3): the journal of THIS lesson only - an answer of a lesson opened before is dropped whole (F-A10),
  // the roster is the one rule of both screens (F-A12), a write asks `panel.target(...)` for the lesson id and its version
  const panel = useLessonPanelData<L>(activeLesson, {
    businessDate,
    ownGroupIds: host.groups.map((group) => group.id),
    getGroup: (id) => orgApi.getGroup(id),
    getJournal: (groupId, date) => orgApi.getGroupAttendance(groupId, { dateFrom: date, dateTo: date }),
    versionBody: marksOps.versionBody,
    onClose: () => {
      setIsMarkingAttendance(false);
      setIsAttendanceSaved(false);
      setIsAttendanceDirty(false);
      setAttendance({});
      setAttendanceError(null);
      setActiveInstanceStatus("scheduled");
      setActiveCancellationReason(null);
      setIsCancellingLesson(false);
      setCancellationReason("");
      setLessonExamBinding(null);
      setActiveTeacherInfo(null);
      setActiveRequestMark(null);
      setActiveRosterSource("group");
      marksOps.reset(undefined, {});
    },
    onOpen: (lesson, { source }) => {
      // W1 (server R3): the occurrence carries who leads it and the request of this lesson - the panel knows them before the journal is read
      setActiveTeacherInfo(teacherInfoOfOccurrence(lesson));
      setActiveRequestMark(lesson.substitutionRequest ?? null);
      setIsMarkingAttendance(false);
      setIsAttendanceSaved(false);
      setIsAttendanceDirty(false);
      setAttendanceError(null);
      setIsCancellingLesson(false);
      setCancellationReason("");
      setLessonExamBinding(null);
      setGroupStudents([]);
      setAttendance({});
      setExcuseReasons({});
      setSavedExcuses({});
      setExcuseReasonInvalidId(null);
      setActiveRosterSource(source);
      // the version of the lesson that was open before is not the version of this one
      marksOps.reset(undefined, {});
    },
    onLoaded: (snapshot, lesson) => {
      setActiveRequestMark(snapshot.requestMark);
      setGroupStudents(snapshot.students);
      marksOps.reset(snapshot.version, snapshot.baseRecords);
      setActiveTeacherInfo(snapshot.teacherInfo);
      setActiveInstanceStatus(snapshot.status);
      setActiveCancellationReason(snapshot.cancellationReason);
      setSavedExcuses(snapshot.savedExcuses);
      setAttendance(snapshot.marks);
      setIsAttendanceSaved(snapshot.isSaved);
      hostRef.current.onWritten({ kind: "loaded", lesson, date: snapshot.date, snapshot });
    },
    onFailed: (error) => {
      setAttendanceError(`Не удалось загрузить журнал посещаемости: ${getDataLoadErrorMessage(error)}`);
    },
  });
  const loadingStudents = panel.loading;
  // the writes in flight, by lesson: a second press of the same lesson is one request, and the buttons of ANOTHER lesson stay free
  const writes = useLessonWrites();
  const activeKey = activeLesson ? lessonPanelKey(activeLesson, businessDate) : null;
  const savingAttendance = writes.isBusy(activeKey);

  /** The refusal of a write whose panel is already gone: the screen shows it with the reason (a toast that stays). */
  const showRefusedWrite = (notice: string | null, reason: string) => { if (notice) host.notifyRefusal(notice, reason); };

  /** The server's list of tasks follows every write of the panel - ONE code for both screens (the schedule kept it stale until a reload). */
  const syncOpenActions = (event: LessonWriteEvent<L>) => {
    if (event.kind === "loaded") return;
    const { lesson } = event;
    const same = (action: OpenAttendanceAction) => action.groupId === lesson.groupId && action.lessonId === lesson.id && action.lessonDate === event.date;
    if (event.kind === "started") {
      void orgApi.getOpenAttendanceActions().then((list) => host.setOpenActions(list)).catch(() => undefined);
    } else if (event.kind === "saved") {
      host.setOpenActions((previous) => previous.map((action) => {
        if (!same(action)) return action;
        const rosterCount = event.rosterCount || action.rosterCount;
        const markedCount = Object.keys(event.marks).length;
        return { ...action, markedCount, rosterCount, remainingCount: Math.max(rosterCount - markedCount, 0) };
      }));
    } else {
      host.setOpenActions((previous) => previous.filter((action) => !same(action)));
    }
  };

  const handleAttendanceChange = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => {
      // A second click on the selected status means "not decided yet".
      // It must remove the key, because the API stores a full snapshot.
      if (prev[studentId] === status) {
        const next = { ...prev };
        delete next[studentId];
        return next;
      }
      return { ...prev, [studentId]: status };
    });
    // Leaving "Уважительная" drops the typed reason; the server removes the excuse on save.
    if (status !== "excused" || attendance[studentId] === "excused") {
      setExcuseReasons((prev) => {
        if (!(studentId in prev)) return prev;
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    }
    setIsAttendanceDirty(true);
    setAttendanceError(null);
  };

  // A forgotten earlier lesson may still be started after its planned end,
  // but never after this teacher has already started a later lesson. This
  // keeps actual teaching time and attendance chronology auditable.
  const getSubsequentStartedLesson = (lesson: Pick<L, "id" | "groupId" | "endTime">): L | null => {
      const { groups, todayLessons, statusOfToday } = hostRef.current;
      const [endHour, endMinute] = (lesson.endTime || "00:00").split(":").map(Number);
      const endMinutes = (endHour || 0) * 60 + (endMinute || 0);
      const lessonTeacherId = groups.find((group) => group.id === lesson.groupId)?.teacher_id;
      if (!lessonTeacherId) return null;

      return [...todayLessons]
        .filter((candidate) => {
          if (candidate.id === lesson.id) return false;
          const candidateTeacherId = groups.find((group) => group.id === candidate.groupId)?.teacher_id;
          if (candidateTeacherId !== lessonTeacherId) return false;
          const status = statusOfToday(candidate);
          if (status !== "in_progress" && status !== "completed") return false;
          const [startHour, startMinute] = (candidate.startTime || "00:00").split(":").map(Number);
          return (startHour || 0) * 60 + (startMinute || 0) >= endMinutes;
        })
        .sort((left, right) => (left.startTime || "").localeCompare(right.startTime || ""))[0] || null;
  };

  /** Open a lesson: the panel of its journal. */
  const openLesson = (lesson: L) => { setActiveLesson(lesson); };
  const closePanel = () => { setActiveLesson(null); };

  /**
   * Closing the panel by hand (the cross, the dark background, Escape, «Готово»): with marks that were NOT saved the person is asked first (the platform's own question,
   * as in WB-P5) - before, the marks vanished without a word; with nothing unsaved the panel closes at once.  A second ask while the question is open (the same Escape reaching
   * both the question and the page) is not a second question.
   */
  const closeAsking = useRef(false);
  const requestClose = async (): Promise<boolean> => {
    if (!activeLesson) return true;
    // nothing unsaved - or the save is already on its way (the marks are being written: the answer of that write reaches the page, a closed panel included)
    if (!isAttendanceDirty || savingAttendance) { setActiveLesson(null); return true; }
    if (closeAsking.current) return false;
    closeAsking.current = true;
    const key = lessonPanelKey(activeLesson, businessDate);
    try {
      const sure = await askConfirm({
        title: "Есть несохранённые отметки — закрыть без сохранения?",
        confirmLabel: "Закрыть без сохранения",
        cancelLabel: "Вернуться",
        tone: "danger",
      });
      if (sure && panel.isOpen(key)) setActiveLesson(null);
      return sure;
    } finally {
      setTimeout(() => { closeAsking.current = false; }, 0);     // not before the key that answered the question has reached every listener
    }
  };

  /**
   * One entry point for "do this action" (the card and the action centre must not branch differently): a missed lesson cannot be started (the server allows it
   * on the lesson's day only), so it opens the reconciliation dialog; any other action opens the lesson panel.
   */
  const openMissedLesson = (action: OpenAttendanceAction) => {
    setActiveLesson(null);
    setMissedLessonError(null);
    setIsCancellingMissedLesson(false);
    setMissedLessonCancellationReason("");
    setMissedLessonAction(action);
  };

  const handleStartLesson = async () => {
    if (!activeLesson || activeInstanceStatus !== "scheduled") return;
    const target = panel.target(activeLesson);
    if (!target) { setAttendanceError(panel.notReadyText); return; }

    // a lesson starts on its own day only: the buttons are not offered otherwise, and a stale panel must not slip through
    const blocked = startBlockedReason(lessonDateRelation(lessonDateOf(activeLesson, businessDate), businessDate));
    if (blocked) {
      setAttendanceError(blocked);
      return;
    }

    const subsequentLesson = getSubsequentStartedLesson(activeLesson);
    if (subsequentLesson) {
      setAttendanceError(
        `Нельзя начать этот урок: после его планового окончания уже был начат урок «${subsequentLesson.groupName}» (${subsequentLesson.startTime}—${subsequentLesson.endTime}). Отмените пропущенное занятие с причиной.`,
      );
      return;
    }

    // O6: nobody to teach - the server refuses with NO_STUDENTS; the panel says it first
    if (groupStudents.length === 0) {
      setAttendanceError(NO_STUDENTS_START_TEXT);
      return;
    }

    if (!writes.begin(target.key)) return; // a second press while the start is on its way
    setAttendanceError(null);
    try {
      const started = await orgApi.startGroupAttendance(target.groupId, lessonStartBody(target, activeLesson.topic ?? undefined));
      if (panel.isOpen(target.key)) marksOps.noteVersion(started);
      // the roster is frozen by the start: a student on a pause that day is not in it
      {
        const att = await orgApi.getGroupAttendance(target.groupId, { dateFrom: target.lessonDate, dateTo: target.lessonDate }).catch(() => null);
        const frozen = att?.rosterStudentIds?.[target.key];
        // the teacher may have opened another lesson while the start was on its way: the roster of the screen is not this lesson's any more
        if (frozen && panel.isOpen(target.key)) setGroupStudents((previous) => narrowToFrozenRoster(previous, frozen));
      }
      syncOpenActions({ kind: "started", lesson: activeLesson, date: target.lessonDate });
      host.onWritten({ kind: "started", lesson: activeLesson, date: target.lessonDate });
      if (panel.isOpen(target.key)) {
        setActiveInstanceStatus("in_progress");
        setIsMarkingAttendance(true);
      }
    } catch (err) {
      console.error("Failed to start lesson:", err);
      const failure = lessonFailure(err, "start", "Не удалось начать урок. Данные не изменены.");
      const plan = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: false, kind: failure.kind === "conflict" ? "conflict" : "other" } });
      if (plan.applyToPanel) setAttendanceError(failure.text);
      else showRefusedWrite(plan.notice, failure.text);
    } finally {
      writes.end(target.key);
    }
  };

  /** «Оформить проведённый урок»: the lesson was held but never started - its journal of that date opens (the server keeps `started_at` empty and records the reconciliation). */
  const handleReconcileMissedLesson = async () => {
    if (!missedLessonAction) return;
    setMissedLessonError(null);
    setIsResolvingMissedLesson(true);
    try {
      await orgApi.reconcileMissedGroupAttendance(missedLessonAction.groupId, {
        lessonDate: missedLessonAction.lessonDate,
        lessonId: missedLessonAction.lessonId,
        topic: missedLessonAction.topic || undefined,
      });
      const lesson = host.lessonFromAction(missedLessonAction);
      host.setOpenActions(await orgApi.getOpenAttendanceActions());
      setMissedLessonAction(null);
      setIsCancellingMissedLesson(false);
      // The next dialog is a historical attendance journal, not a delayed start.
      setActiveLesson(lesson);
    } catch (err) {
      console.error("Failed to reconcile missed lesson:", err);
      setMissedLessonError(lessonFailure(err, "reconcile", "Не удалось открыть журнал пропущенного урока. Данные не изменены.").text);
    } finally {
      setIsResolvingMissedLesson(false);
    }
  };

  const handleCancelMissedLesson = async () => {
    if (!missedLessonAction || missedSending.current) return;
    const reason = missedLessonCancellationReason.trim();
    const reasonProblem = reasonProblemFor("cancel", reason);
    if (reasonProblem) {
      setMissedLessonError(reasonProblem);
      return;
    }
    missedSending.current = true;
    setMissedLessonError(null);
    setIsResolvingMissedLesson(true);
    try {
      const notes = await sendTeacherCancel("missed", { groupId: missedLessonAction.groupId, lessonId: missedLessonAction.lessonId, lessonDate: missedLessonAction.lessonDate }, reason);
      host.setOpenActions((previous) => previous.filter((action) => !(
        action.actionType === "missed"
        && action.groupId === missedLessonAction.groupId
        && action.lessonId === missedLessonAction.lessonId
        && action.lessonDate === missedLessonAction.lessonDate
      )));
      setMissedLessonAction(null);
      setIsCancellingMissedLesson(false);
      setMissedLessonCancellationReason("");
      host.onMissedCancelled(notes);
    } catch (err) {
      console.error("Failed to cancel missed lesson:", err);
      setMissedLessonError(lessonFailure(err, "cancel", "Не удалось отметить, что урока не было. Данные не изменены.").text);
    } finally {
      missedSending.current = false;
      setIsResolvingMissedLesson(false);
    }
  };

  /** Server refused an "Уважительная" without a reason (old mark with no record): say what to do. */
  const excuseReasonHint = (err: unknown): string | null => {
    const message = err instanceof Error ? err.message : "";
    if (/причин/i.test(message) && /ув|уважит/i.test(message)) {
      setIsMarkingAttendance(true);
      return "Для уважительного пропуска нужна причина. Впишите причину в поле под учеником с отметкой «Уважительная» и сохраните снова.";
    }
    return null;
  };

  /** Reasons to send with the save, or an error text when an "Уважительная" mark has no valid reason. */
  const prepareExcuseReasons = (marks: Record<string, AttendanceStatus> = attendance): { reasons: Record<string, string> } | { error: string } => {
    const missing = firstMissingExcuseReason(marks, excuseReasons, savedExcuses);
    if (missing) {
      setExcuseReasonInvalidId(missing.studentId);
      const name = groupStudents.find((st) => st.id === missing.studentId)?.full_name;
      return { error: `${name ? `${name}: ` : ""}${missing.error}` };
    }
    setExcuseReasonInvalidId(null);
    return { reasons: collectExcuseReasons(marks, excuseReasons, savedExcuses) };
  };

  const rememberSavedExcuses = (sent: Record<string, string>, marks: Record<string, AttendanceStatus> = attendance) => {
    setSavedExcuses((prev) => {
      const next: Record<string, { reason: string }> = {};
      Object.keys(marks).forEach((studentId) => {
        if (marks[studentId] !== "excused") return;
        const reason = sent[studentId] ?? prev[studentId]?.reason;
        if (reason) next[studentId] = { reason };
      });
      return next;
    });
    setExcuseReasons({});
  };

  const handleSaveAttendance = async (override?: Record<string, AttendanceStatus>) => {
    if (!activeLesson) return;
    const target = panel.target(activeLesson);
    if (!target) { setAttendanceError(panel.notReadyText); return; }
    // «Оставить мои» repeats this very action with the merged marks
    const marks = override ?? attendance;
    if (override) setAttendance(override);

    if (lessonTooOld) { setAttendanceError(LESSON_TOO_OLD_TEXT); return; }

    // Attendance is allowed only after the server recorded the real start of this lesson.
    // This is a client-side guard; the API enforces it too.
    if (activeInstanceStatus !== "in_progress") {
      setIsMarkingAttendance(false);
      setAttendanceError("Сначала начните урок. Посещаемость можно фиксировать только для начатого урока.");
      return;
    }

    setAttendanceError(null);

    const prepared = prepareExcuseReasons(marks);
    if ("error" in prepared) {
      setAttendanceError(prepared.error);
      return;
    }

    if (!writes.begin(target.key)) return;
    try {
      const saved = await orgApi.saveGroupAttendance(target.groupId, lessonWriteBody(target, activeLesson.topic ?? undefined, {
        status: "in_progress" as const,
        records: marks,
        ...(Object.keys(prepared.reasons).length ? { excuseReasons: prepared.reasons } : {}),
      }));
      // what the screen holds of the lesson (version, marks, flags) changes only while THIS lesson is the open one
      const here = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: true } }).applyToPanel;
      if (here) {
        marksOps.noteSaved(saved, marks);
        rememberSavedExcuses(prepared.reasons, marks);
        setIsAttendanceSaved(true);
        setIsAttendanceDirty(false);
        setActiveInstanceStatus("in_progress");
      }
      syncOpenActions({ kind: "saved", lesson: activeLesson, date: target.lessonDate, marks, rosterCount: groupStudents.length });
      host.onWritten({ kind: "saved", lesson: activeLesson, date: target.lessonDate, marks, rosterCount: groupStudents.length });
      if (here) setIsMarkingAttendance(false);
    } catch (err) {
      console.error("Failed to save attendance:", err);
      const refusal = lessonFailure(err, "save", "Не удалось сохранить посещаемость. Данные не изменены.");
      const plan = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: false, kind: refusal.kind === "conflict" ? "conflict" : "other" } });
      if (!plan.applyToPanel) { showRefusedWrite(plan.notice, refusal.text); return; } // another lesson is on the screen now: not the place for the dialog, the notice stays
      const failure = marksOps.refused(err, "save", "Не удалось сохранить посещаемость. Данные не изменены.", marks);
      // a conflict is decided in its dialog (my marks stay on screen); anything else is the text of the panel
      if (failure.kind !== "conflict") setAttendanceError(excuseReasonHint(err) ?? failure.text);
    } finally {
      writes.end(target.key);
    }
  };

  const handleFinishLesson = async (acknowledgeLiveExam = false, override?: Record<string, AttendanceStatus>) => {
    if (!activeLesson) return;
    const target = panel.target(activeLesson);
    if (!target) { setAttendanceError(panel.notReadyText); return; }
    if (lessonTooOld) { setAttendanceError(LESSON_TOO_OLD_TEXT); return; }
    const marks = override ?? attendance;
    if (override) setAttendance(override);

    // O6: a lesson of an empty roster cannot be finished - «Урока не было» is the way out (the server says the same: NO_STUDENTS)
    if (groupStudents.length === 0) {
      setAttendanceError(NO_STUDENTS_FINISH_TEXT);
      return;
    }

    // Check attendance completeness: all students must be marked and attendance saved
    const hasSaved = isAttendanceSaved || (activeLessonIsToday && host.hasSavedMarks(activeLesson.id));   // the card map of the screen is the map of TODAY: not a lesson of another week with the same id
    const unmarked = groupStudents.filter((st) => !marks[st.id]);

    if (!hasSaved || unmarked.length > 0) {
      setAttendanceError(
        `Невозможно завершить урок: сначала необходимо полностью отметить всех учеников (${groupStudents.length - unmarked.length} из ${groupStudents.length} отмечено) и сохранить отметки.`
      );
      setIsMarkingAttendance(true);
      return;
    }

    setAttendanceError(null);
    const prepared = prepareExcuseReasons(marks);
    if ("error" in prepared) {
      setAttendanceError(prepared.error);
      // Reopen the marking panel: the missing reason field is there.
      setIsMarkingAttendance(true);
      return;
    }

    if (!writes.begin(target.key)) return;
    try {
      const finished = await orgApi.saveGroupAttendance(target.groupId, lessonWriteBody(target, activeLesson.topic ?? undefined, {
        status: "completed" as const,
        records: marks,
        ...(Object.keys(prepared.reasons).length ? { excuseReasons: prepared.reasons } : {}),
        ...(acknowledgeLiveExam ? { acknowledgeLiveExam: true } : {}),
      }));
      const here = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: true } }).applyToPanel;
      if (here) {
        marksOps.noteSaved(finished, marks);
        marksOps.clearLiveExams();
        rememberSavedExcuses(prepared.reasons, marks);
      }
      // O8: the exam service could not be asked - the lesson is closed anyway; the screen says so
      syncOpenActions({ kind: "finished", lesson: activeLesson, date: target.lessonDate, syncNotice: null });
      host.onWritten({ kind: "finished", lesson: activeLesson, date: target.lessonDate, syncNotice: examSyncNotice(finished?.examSync) });
      if (here) setActiveLesson(null); // the panel of ANOTHER lesson, opened meanwhile, stays
    } catch (err) {
      console.error("Failed to sync completed status with server:", err);
      const refusal = lessonFailure(err, "finish", "Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз.");
      const plan = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: false, kind: refusal.kind === "conflict" ? "conflict" : "other" } });
      if (!plan.applyToPanel) { showRefusedWrite(plan.notice, refusal.text); return; }
      const failure = marksOps.refused(err, "finish", "Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз.", marks);
      // a running exam / a conflict is decided in its dialog; anything else is the text of the panel
      if (failure.kind !== "conflict" && failure.kind !== "live_exam") setAttendanceError(excuseReasonHint(err) ?? failure.text);
    } finally {
      writes.end(target.key);
    }
  };

  const handleCancelLesson = async () => {
    if (!activeLesson || activeInstanceStatus === "completed" || activeInstanceStatus === "cancelled" || cancelSending.current) return;
    const target = panel.target(activeLesson);
    if (!target) { setAttendanceError(panel.notReadyText); return; }
    if (!lessonExamBinding || lessonExamBinding.loading || !lessonExamBinding.canCancel) return;
    const reason = cancellationReason.trim();
    const reasonProblem = reasonProblemFor("cancel", reason);
    if (reasonProblem) {
      setAttendanceError(reasonProblem);
      return;
    }
    if (!writes.begin(target.key)) return;
    cancelSending.current = true;
    setAttendanceError(null);
    try {
      const notes = await sendTeacherCancel(cancelRoute, lessonCancelRef(target, activeLesson.topic ?? undefined), reason, target.versionBody);
      const here = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: true } }).applyToPanel;
      if (here) {
        setActiveInstanceStatus("cancelled");
        setActiveCancellationReason(reason);
        setAttendance({});
        setIsAttendanceSaved(false);
        setIsAttendanceDirty(false);
        setIsMarkingAttendance(false);
        setIsCancellingLesson(false);
        setLessonExamBinding(null);
      }
      syncOpenActions({ kind: "cancelled", lesson: activeLesson, date: target.lessonDate, notes });
      host.onWritten({ kind: "cancelled", lesson: activeLesson, date: target.lessonDate, notes });
    } catch (err) {
      console.error("Failed to cancel lesson:", err);
      const refusal = lessonFailure(err, "cancel", "Не удалось отметить, что урока не было. Данные не изменены.");
      const plan = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: false, kind: refusal.kind === "conflict" ? "conflict" : "other" } });
      if (!plan.applyToPanel) { showRefusedWrite(plan.notice, refusal.text); return; }
      const failure = marksOps.refused(err, "cancel", "Не удалось отметить, что урока не было. Данные не изменены.", attendance);
      if (failure.kind !== "conflict") setAttendanceError(failure.text);
    } finally {
      cancelSending.current = false;
      writes.end(target.key);
    }
  };

  const openCancelLessonPanel = async (offer: TeacherCancelOffer) => {
    if (!activeLesson || activeInstanceStatus === "completed" || activeInstanceStatus === "cancelled") return;
    setAttendanceError(null);
    setCancelRoute(offer.route);
    setCancelVariant(offer.variant);
    setLessonExamBinding({ loading: true, attached: false, canCancel: false });
    setIsCancellingLesson(true);
    const alive = panel.alive(); // the token of the run that read this lesson's journal: the answer of another run is dropped exactly like the journal's

    try {
      const binding = await examsApi.getLessonBinding({
        groupId: activeLesson.groupId,
        lessonId: activeLesson.id,
        lessonDate: lessonDateOf(activeLesson, businessDate),
      });
      if (!alive()) return; // the answer of the lesson that was open before is not the answer for this one
      setLessonExamBinding({
        loading: false,
        attached: binding.attached,
        canCancel: binding.can_cancel,
        examTitle: binding.exam?.title,
        message: binding.message,
      });
    } catch (err) {
      console.error("Failed to check exam binding before lesson cancellation:", err);
      if (!alive()) return;
      setLessonExamBinding({
        loading: false,
        attached: false,
        canCancel: false,
        message: "Не удалось проверить связанный экзамен. Для безопасности отмена сейчас недоступна.",
      });
    }
  };

  // The time windows of the lesson panel's buttons (the last minutes of a lesson, the hour before its start) move
  // with the clock, not with the click that opened the panel: re-read every 30 s while a panel is open.
  const panelClock = useNow(30_000, Boolean(activeLesson));
  const todayDayOfWeek = businessDayOfWeek();
  const canFinishLesson = useMemo(() => {
    if (!activeLesson) return false;
    // A persisted lesson from an earlier date is already past its planned end: it may be completed after the remaining attendance is filled
    return canFinishLessonNow({
      status: activeInstanceStatus,
      startTime: activeLesson.startTime,
      endTime: activeLesson.endTime,
      occurrenceDate: activeLesson.occurrenceDate,
      businessDate,
      nowMinutes: businessTimeMinutes(new Date(panelClock)),
      isTodayWeekday: activeLesson.dayOfWeek === todayDayOfWeek,
    });
  }, [activeLesson, activeInstanceStatus, todayDayOfWeek, businessDate, panelClock]);

  // The calendar day decides what the panel may offer: a lesson starts on its own day only.
  const activeLessonDate = activeLesson ? lessonDateOf(activeLesson, businessDate) : null;
  const activeLessonRelation = activeLessonDate ? lessonDateRelation(activeLessonDate, businessDate) : null;
  const activeLessonIsToday = activeLessonRelation === "today";
  // where the clock stands against the lesson of TODAY (before, in time, after the planned end)
  const activeTimeStatus = activeLesson && activeLessonIsToday
    ? getLessonTimeStatus(activeLesson, todayDayOfWeek, isAttendanceSaved || host.hasSavedMarks(activeLesson.id), activeInstanceStatus === "completed")
    : null;
  // The window of the teacher: a lesson older than 7 days (by ITS DATE, as the server says LESSON_TOO_OLD) is closed by an administrator or the owner -
  // nothing of the teacher's actions is offered for it (settle, mark, «Урока не было»): one line instead (`LESSON_TOO_OLD_TEXT`)
  const viewerRole = host.user?.org_role ?? host.user?.role ?? null;
  const lessonTooOld = Boolean(activeLesson && activeLessonDate && viewerRole !== "owner" && viewerRole !== "admin" && isLessonTooOld(activeLessonDate, businessDate));
  // The never-started lesson of a past day, which the teacher can still settle as "missed"
  const activeMissedAction = activeLesson && activeLessonRelation === "past" && !lessonTooOld
    ? host.openActions.find((action) => (
      action.actionType === "missed"
      && action.groupId === activeLesson.groupId
      && action.lessonId === activeLesson.id
      && action.lessonDate === activeLessonDate
    )) ?? null
    : null;
  /** The list of tasks could not be read: «not in the list» then proves nothing - the panel says so and offers to read it again (the money of the lesson depends on the answer). */
  const activeMissedUnknown = Boolean(activeLesson && activeLessonRelation === "past" && !lessonTooOld && !host.openActionsKnown);
  const activeSubsequentLesson = activeLesson && activeLessonIsToday && activeInstanceStatus === "scheduled"
    ? getSubsequentStartedLesson(activeLesson)
    : null;

  /** The banner of the overview: one order for both screens (`lessonPanelBanner`). */
  const banner = lessonPanelBanner({
    status: activeInstanceStatus,
    relation: activeLessonRelation,
    isDirty: isAttendanceDirty,
    tooOld: lessonTooOld,
    hasSavedMarks: isAttendanceSaved && Object.keys(attendance).length > 0,
    hasSubsequentStarted: Boolean(activeSubsequentLesson),
    time: activeTimeStatus,
  });

  // W1 F1: a teacher does not cancel a lesson to come; «Урока не было» is offered for a lesson that has passed (one rule: `teacherCancelOffer`)
  // W1 F10: a lesson of his that a substitute leads stays in his schedule («Замена: имя»), but the lesson is not his to start, mark, move or cancel
  const ledByOther = Boolean(activeLesson?.replacedBy) || lessonBelongsToOther(activeTeacherInfo, host.user?.id);
  const cancelOffer = activeLesson && !isCancellingLesson && !lessonTooOld
    ? teacherCancelOffer({
      role: host.user?.org_role ?? host.user?.role ?? null, otherLeads: ledByOther, state: activeInstanceStatus, date: lessonDateOf(activeLesson, businessDate), today: businessDate,
      startTime: activeLesson.startTime, endTime: activeLesson.endTime, rosterEmpty: !loadingStudents && groupStudents.length === 0, ownOneOff: isOwnOneOff(activeLesson, host.user?.id),
    })
    : null;
  const allMenuItems = teacherLessonMenuItems(teacherActions, () => setIsLessonMenuOpen(false), { offer: cancelOffer, open: () => { if (cancelOffer) void openCancelLessonPanel(cancelOffer); } });
  const cancelItem = allMenuItems.find((item) => item.key === "cancel") ?? null;
  /** «Урока не было»: the state card shows it, or the menu does - never both (`cancelShownInCard`). */
  const cancelCardItem = cancelItem && cancelShownInCard({
    banner, overviewShown: !ledByOther && !loadingStudents && groupStudents.length > 0 && !isMarkingAttendance,
    attendanceSaved: isAttendanceSaved, missedUnknown: activeMissedUnknown, missedAction: Boolean(activeMissedAction),
  }) ? cancelItem : null;
  /** The rows of the group «Этот урок» of the «⋯» menu: the teacher's own actions on the lesson. */
  const lessonMenuItems = cancelCardItem ? allMenuItems.filter((item) => item !== cancelCardItem) : allMenuItems;

  /** The Escape key: false when a layer of the panel (a conflict, a running exam, the move dialog) keeps it; closes the menu first. True when the key was used up. */
  const consumeEscape = (): boolean => {
    if (marksOps.conflict || marksOps.liveExams || moveHoldsEscape.current) return true;
    if (isLessonMenuOpen) { setIsLessonMenuOpen(false); return true; }
    // the dialog «Пропущенный урок» (not while it sends): the same key on both screens
    if (missedLessonAction && !isResolvingMissedLesson) { setMissedLessonAction(null); return true; }
    return false;
  };

  return {
    // state
    activeLesson, setActiveLesson, openLesson, closePanel, requestClose,
    activeInstanceStatus, activeCancellationReason, groupStudents, attendance, excuseReasons, savedExcuses, excuseReasonInvalidId,
    isMarkingAttendance, setIsMarkingAttendance, isAttendanceSaved, isAttendanceDirty, attendanceError,
    activeTeacherInfo, activeRequestMark, activeRosterSource,
    isCancellingLesson, setIsCancellingLesson, cancellationReason, setCancellationReason, cancelVariant, lessonExamBinding, setLessonExamBinding,
    loadingStudents, savingAttendance, marksOps, teacherActions, moveHoldsEscape,
    // the rules, read once
    banner, canFinishLesson, activeLessonDate, activeLessonRelation, activeLessonIsToday, activeTimeStatus, activeMissedAction, activeMissedUnknown, retryOpenActions: host.retryOpenActions, lessonTooOld, activeSubsequentLesson,
    ledByOther, lessonMenuItems, cancelCardItem, isLessonMenuOpen, setIsLessonMenuOpen, consumeEscape, getSubsequentStartedLesson, todayDayOfWeek, businessDate,
    // the handlers
    handleAttendanceChange, handleStartLesson, handleSaveAttendance, handleFinishLesson, handleCancelLesson, openCancelLessonPanel,
    setAttendance, setExcuseReasons, setIsAttendanceDirty, setAttendanceError, setExcuseReasonInvalidId,
    // the reconciliation of a past lesson that was never started
    missedLessonAction, setMissedLessonAction, openMissedLesson, isCancellingMissedLesson, setIsCancellingMissedLesson, missedLessonCancellationReason, setMissedLessonCancellationReason,
    missedLessonError, setMissedLessonError, isResolvingMissedLesson, handleReconcileMissedLesson, handleCancelMissedLesson,
  };
}

export type TeacherLessonPanel<L extends TeacherPanelLesson = TeacherPanelLesson> = ReturnType<typeof useTeacherLessonPanel<L>>;
