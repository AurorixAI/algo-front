"use client";

import { Select } from "@/components/ui/select";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { formatAttendanceSummary } from "@/lib/attendance-summary";
import { MARK_CELL_LABEL, MARK_MENU_LABEL } from "@/lib/attendance-marks";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { pollFailure } from "@/lib/staff-busy";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { CancellationKindField } from "@/components/attendance/cancellation-kind-field";
import { cancellationKindBody, canChooseCancellationKind, DEFAULT_CANCELLATION_KIND, type CancellationKind } from "@/lib/payf";
import { examsApi, orgApi, type AttendanceStatus, type GroupInfo, type StudentInGroup, type LessonAttendanceStatus, type LessonEvent, type LiveExamDashboardSummary, type ScheduleOccurrence } from "@/lib/api";
import { isMovedAway, movedAwayChip, outOfPlan, placeText, timeRange, weekPlan, weekPlanDescription } from "@/lib/schedule-plan";
import { businessDayOfWeek, businessTimeMinutes, businessWeekdayDate, capitalizeFirst, formatBusinessDate, isoDateDayOfWeek, formatBusinessDateLabel, formatIsoDateLabel, formatMinutesUntil } from "@/lib/business-time";
import Link from "next/link";
import { ExcuseReasonField } from "@/components/attendance/excuse-reason-field";
import { collectExcuseReasons, firstMissingExcuseReason } from "@/lib/attendance-excuses";
import { LessonPanelError } from "@/components/attendance/lesson-panel-error";
import { canFinishLessonNow, serverErrorMessage } from "@/lib/lesson-actions";
import { useNow } from "@/lib/use-now";
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Plus,
  MapPin,
  Video,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Check,
  Sparkles,
  ArrowRight,
  X,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Edit2,
  MoreHorizontal,
  Play,
  CheckCheck,
  Radio,
  Loader2,
} from "lucide-react";
import { pluralRu } from "@/lib/payments";
import { useScrollLock } from "@/components/ui/modal";
import {
  validFromBadge, validFromError,
} from "@/lib/schedule-slots";
import { scheduleErrorText } from "@/lib/ops-errors";
import { REPLACE_TEACHER_ACTION, canReplaceTeacher } from "@/lib/lesson-teacher";
import { narrowToFrozenRoster, withoutPaused, occurrenceChips, readLessonRoster, rosterFromJournal, rosterSource, showsGroupLinks, substituteGroupLabel, substitutionsHref, substitutionsPathFor, type RosterSource } from "@/lib/substitutions";
import type { SubstitutionRequestMark } from "@/lib/substitution-types";
import type { LessonTeacherInfo } from "@/lib/ops-b-types";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { DayHeading } from "@/components/schedule/day-heading";
import { TeacherLessonControls } from "@/components/substitutions/teacher-lesson-controls";
import { useToast } from "@/components/ui/toast";
import { useLessonMarksOps } from "@/lib/use-lesson-marks-ops";
import { AttendanceConflictDialog, LiveExamConfirmDialog } from "@/components/attendance/attendance-ops-dialogs";
import { examSyncNotice, lessonFailure } from "@/lib/attendance-ops";
import { NO_STUDENTS_FINISH_TEXT, NO_STUDENTS_START_TEXT } from "@/lib/ops-errors";
import { LessonTeacherDialog, type LessonTeacherTarget } from "@/components/groups/lesson-teacher-dialog";
import { LessonScopeFields, LessonSlotFields } from "@/components/schedule/lesson-slot-fields";
import { createOneOff, createWeeklyLessons, weeklyResolver } from "@/lib/weekly-lessons";
import { EditWeeklyLessonDialog, EndWeeklyLessonDialog } from "@/components/schedule/weekly-lesson-dialogs";
import { COLOR_CLASSES, DAYS, nextBusinessDate, DAY_REQUIRED_TEXT, dayShort, overlappingLesson, suggestedTimes, weeklyResultText } from "@/lib/lesson-slot-form";

function russianPlural(count: number, one: string, few: string, many: string) {
  const absolute = Math.abs(count) % 100;
  const lastDigit = absolute % 10;

  if (absolute > 10 && absolute < 20) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

function classCountLabel(count: number) {
  return `${count} ${russianPlural(count, "занятие", "занятия", "занятий")}`;
}

function completedLessonsProgressLabel(completed: number, total: number) {
  const absolute = Math.abs(total) % 100;
  const isSingularGenitive = absolute % 10 === 1 && absolute !== 11;
  return `Завершено: ${completed} из ${total} ${isSingularGenitive ? "урока" : "уроков"}`;
}

type LessonOccurrence = ScheduleOccurrence;

function getLessonTimeStatus(
  lesson?: { startTime?: string; endTime?: string; dayOfWeek?: number } | null,
  todayDayOfWeek?: number,
  isAttendanceMarked?: boolean,
  isCompletedExplicitly?: boolean
) {
  if (!lesson || !lesson.startTime || !lesson.endTime) {
    return {
      type: "other_day" as const,
      isLive: false,
      isUpcoming: false,
      isPast: false,
      canStart: false,
      diffMinutes: 0,
      startMinutes: 0,
      endMinutes: 0,
    };
  }

  const isToday = lesson.dayOfWeek === todayDayOfWeek;
  if (!isToday) {
    return {
      type: "other_day" as const,
      isLive: false,
      isUpcoming: false,
      isPast: false,
      canStart: false,
      diffMinutes: 0,
      startMinutes: 0,
      endMinutes: 0,
    };
  }

  if (isCompletedExplicitly) {
    return {
      type: "completed" as const,
      isLive: false,
      isUpcoming: false,
      isPast: true,
      canStart: false,
      diffMinutes: 0,
      startMinutes: 0,
      endMinutes: 0,
    };
  }

  const currentMinutes = businessTimeMinutes();
  const [startH, startM] = (lesson.startTime || "00:00").split(":").map(Number);
  const [endH, endM] = (lesson.endTime || "00:00").split(":").map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (currentMinutes < startMinutes) {
    const diffMinutes = startMinutes - currentMinutes;
    return {
      type: "upcoming" as const,
      isLive: false,
      isUpcoming: true,
      isPast: false,
      canStart: false,
      diffMinutes,
      startMinutes,
      endMinutes,
      isPastEndTime: false,
    };
  } else {
    // Lesson has started and is NOT finished until teacher explicitly clicks "Завершить урок"
    const isPastEndTime = currentMinutes > endMinutes;
    return {
      type: "live" as const,
      isLive: true,
      isUpcoming: false,
      isPast: false,
      canStart: true,
      diffMinutes: 0,
      startMinutes,
      endMinutes,
      isPastEndTime,
    };
  }
}

export default function TeacherSchedulePage() {
  const { user } = useAuthStore();
  const { showToast, toastNode } = useToast();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [lessons, setLessons] = useState<LessonEvent[]>([]);
  const [todayOccurrences, setTodayOccurrences] = useState<LessonOccurrence[]>([]);
  // The lessons of the week are kept WITH the week they belong to: while the next week loads, the cards of the previous one are not shown
  // (a click on such a card opened the lesson of the old week under the dates of the new one).
  const [loadedWeek, setLoadedWeek] = useState<{ start: string; lessons: LessonOccurrence[] } | null>(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");
  const [isGroupFilterOpen, setIsGroupFilterOpen] = useState(false);
  const groupFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const [isRecurringActionsOpen, setIsRecurringActionsOpen] = useState(false);
  const recurringActionsButtonRef = useRef<HTMLButtonElement>(null);
  const [viewMode, setViewMode] = useState<"today" | "week">("today");
  const [weekOffset, setWeekOffset] = useState(0);
  const weekPeriod = useMemo(() => ({
    start: businessWeekdayDate(1, weekOffset),
    end: businessWeekdayDate(7, weekOffset),
  }), [weekOffset]);
  const weekLoading = loadedWeek?.start !== weekPeriod.start;
  const weekOccurrences = useMemo(() => (loadedWeek && !weekLoading ? loadedWeek.lessons : []), [loadedWeek, weekLoading]);
  const [lessonAttendanceMap, setLessonAttendanceMap] = useState<Record<string, boolean>>({});
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<string, boolean>>({});
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [weekLessonStatusMap, setWeekLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  // LOGIC-B: the version of the lesson record (O7), a running exam at the finish (O8), the teacher of the lesson (O5).
  const marksOps = useLessonMarksOps();
  const isManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
  /** LOGIC-B2: a chip «Ждёт замены» leads the manager to the request. */
  const requestHrefFor = (requestId: string) => substitutionsHref(substitutionsPathFor(user), requestId);
  const [teacherTarget, setTeacherTarget] = useState<LessonTeacherTarget | null>(null);
  /** LOGIC-B2: who teaches the open lesson, the request «Не смогу провести» for it, and where its roster comes from. */
  const [activeTeacherInfo, setActiveTeacherInfo] = useState<LessonTeacherInfo | null>(null);
  const [activeRequestMark, setActiveRequestMark] = useState<SubstitutionRequestMark | null>(null);
  const [activeRosterSource, setActiveRosterSource] = useState<RosterSource>("group");
  /** O11: non-blocking notes of a successful write (the room is busy at that time): shown on the page, not as an error. */
  const [scheduleNotices, setScheduleNotices] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weekLoadError, setWeekLoadError] = useState<string | null>(null);
  const [weekRefreshNonce, setWeekRefreshNonce] = useState(0);
  const [isWeekPlanOpen, setIsWeekPlanOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadedScheduleDate, setLoadedScheduleDate] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // The destructive recurrence action lives in a compact overflow menu, so it never competes visually with the
  // primary schedule action.  The menu is a <FloatingPanel>: it closes by itself when a teacher simply continues
  // working elsewhere in the dialog (press outside), on Escape, or when its button scrolls out of sight.

  // Selected lesson modal
  const [activeLesson, setActiveLesson] = useState<LessonOccurrence | null>(null);
  const [activeLessonView, setActiveLessonView] = useState<"today" | "week">("today");
  const [activeLessonStatus, setActiveLessonStatus] = useState<LessonAttendanceStatus>("scheduled");
  const [activeCancellationReason, setActiveCancellationReason] = useState<string | null>(null);
  const [groupStudents, setGroupStudents] = useState<StudentInGroup[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  // Reasons for "Уважительная" typed in this dialog, and excuses the server already holds for the lesson.
  const [excuseReasons, setExcuseReasons] = useState<Record<string, string>>({});
  const [savedExcuses, setSavedExcuses] = useState<Record<string, { reason: string }>>({});
  const [excuseReasonInvalidId, setExcuseReasonInvalidId] = useState<string | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [isAttendanceSaved, setIsAttendanceSaved] = useState(false);
  const [isAttendanceDirty, setIsAttendanceDirty] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [isCancellingLesson, setIsCancellingLesson] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationKind, setCancellationKind] = useState<CancellationKind>(DEFAULT_CANCELLATION_KIND);
  const canChooseKind = canChooseCancellationKind(user);
  useEffect(() => { if (!isCancellingLesson) setCancellationKind(DEFAULT_CANCELLATION_KIND); }, [isCancellingLesson]);       // every cancellation starts with «по вине центра»
  const [lessonExamBinding, setLessonExamBinding] = useState<{
    loading: boolean;
    attached: boolean;
    canCancel: boolean;
    examTitle?: string;
    message?: string | null;
  } | null>(null);
  const [businessDate, setBusinessDate] = useState(() => formatBusinessDate());
  const [clockTick, setClockTick] = useState(0);
  const [liveExams, setLiveExams] = useState<LiveExamDashboardSummary[]>([]);
  const [liveExamError, setLiveExamError] = useState<string | null>(null);
  const [liveExamRefreshNonce, setLiveExamRefreshNonce] = useState(0);
  const [isLiveExamRefreshing, setIsLiveExamRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick((value) => value + 1);
      const currentDate = formatBusinessDate();
      setBusinessDate((previous) => previous === currentDate ? previous : currentDate);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Schedule and dashboard intentionally use the same authoritative live
  // source. A prepared lobby is excluded; only an exam already running can
  // replace the neutral "nothing to do" state.
  useEffect(() => {
    let cancelled = false;
    let failureStreak = 0;
    let verified = false;
    const refresh = async (isManualRetry = false) => {
      if (isManualRetry) setIsLiveExamRefreshing(true);
      try {
        const items = await examsApi.getLiveDashboardSummary();
        failureStreak = 0;
        verified = true;
        if (!cancelled) {
          setLiveExams(Array.isArray(items) ? items : []);
          setLiveExamError(null);
        }
      } catch (error) {
        // Keep the last verified exam state visible rather than claiming that
        // no examination is running while the operational API is offline.
        // A busy server (503, after the client's own repeats) is a passing moment: no banner until it repeats at
        // the next tick - except for the teacher's own «retry» press, which always gets the answer.
        const failure = pollFailure(error, failureStreak, verified);
        failureStreak = failure.streak;
        if (!cancelled && (!failure.quiet || isManualRetry)) setLiveExamError(getDataLoadErrorMessage(error));
      } finally {
        if (!cancelled && isManualRetry) setIsLiveExamRefreshing(false);
      }
    };
    void refresh(liveExamRefreshNonce > 0);
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [liveExamRefreshNonce]);

  // Add lesson modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newGroupId, setNewGroupId] = useState("");
  const [newLessonScope, setNewLessonScope] = useState<"one_off" | "recurring">("one_off");
  const [newLessonDate, setNewLessonDate] = useState(formatBusinessDate());
  const [newDays, setNewDays] = useState<number[]>([]);
  const [savingLesson, setSavingLesson] = useState(false);
  /** The times were typed by the user: the suggested times of the first chosen day no longer follow the days. */
  const [timesEdited, setTimesEdited] = useState(false);
  const [newStartTime, setNewStartTime] = useState("10:00");
  const [newEndTime, setNewEndTime] = useState("11:30");
  const [newRoom, setNewRoom] = useState("");
  /** O1: the date a new recurring slot starts acting («Действует с»); the journal has no lessons before it. */
  const [newValidFrom, setNewValidFrom] = useState(formatBusinessDate());
  const [newFormat, setNewFormat] = useState<"offline" | "online">("offline");
  const [newTopic, setNewTopic] = useState("");
  const [newColor, setNewColor] = useState<"blue" | "indigo" | "purple" | "emerald" | "amber" | "rose">("blue");

  // Changing / stopping a weekly lesson: the shared dialogs (components/schedule/weekly-lesson-dialogs) own their forms.
  const [editingLesson, setEditingLesson] = useState<LessonOccurrence | null>(null);
  const [endingRecurringLesson, setEndingRecurringLesson] = useState<LessonOccurrence | null>(null);

  // Load only the organisation's approved schedule. A teacher must never fall
  // back to all groups or generate a fictitious lesson plan in the browser.
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      const todayStr = businessDate;
      // Treat the schedule snapshot as an atomic read. If one authoritative
      // source fails, do not mix a fresh group list with stale lessons, or
      // substitute a failed source with an empty one.
      const [fetchedGroups, loadedLessons, loadedTodayOccurrences] = await Promise.all([
        isOrgManager ? orgApi.listGroups() : orgApi.listGroups({ teacher_id: user.id }),
        orgApi.getSchedule(isOrgManager ? undefined : user.id),
        orgApi.getScheduleOccurrences(
          { dateFrom: todayStr, dateTo: todayStr },
          isOrgManager ? undefined : user.id,
        ),
      ]);

      // Attendance is always tied to the concrete occurrence (date + lesson).
      const attMap: Record<string, boolean> = {};
      const compMap: Record<string, boolean> = {};
      const statusMap: Record<string, LessonAttendanceStatus> = {};

      // A failed attendance journal must not make an in-progress lesson look
      // like an untouched one. Finish every read before committing the
      // snapshot to screen state.
      await Promise.all(
        loadedTodayOccurrences.map(async (les: LessonOccurrence) => {
          if (!les || !les.groupId) return;
          const att = await orgApi.getGroupAttendance(les.groupId, {
            dateFrom: todayStr,
            dateTo: todayStr,
          });
          const lessonKey = `${todayStr}_${les.id}`;
          if (att?.records) {
            const rec = att.records[lessonKey];
            if (rec && Object.keys(rec).length > 0) {
              attMap[les.id] = true;
            }
          }
          if (att?.statuses) {
            const st = att.statuses[lessonKey];
            if (st) statusMap[les.id] = st;
            if (st === "completed") {
              compMap[les.id] = true;
            } else if (st === "in_progress") {
              compMap[les.id] = false;
            }
          }
        })
      );

      setGroups(fetchedGroups);
      setNewGroupId((current) => current || fetchedGroups[0]?.id || "");
      setLessons(loadedLessons);
      setTodayOccurrences(loadedTodayOccurrences);
      setLessonAttendanceMap(attMap);
      setCompletedLessonsMap(compMap);
      setLessonStatusMap(statusMap);
      setLoadedScheduleDate(todayStr);
      return true;
    } catch (err) {
      console.error("Failed to load schedule:", err);
      setLoadError(getDataLoadErrorMessage(err));
      return false;
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id, user?.org_role, user?.role, businessDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const scheduleDataUnavailable = Boolean(loadError || weekLoadError) || loadedScheduleDate !== businessDate;

  // An open lesson modal is bound to a date + lesson instance. Once the
  // business date changes, reload the new day and close the stale instance.
  useEffect(() => {
    setActiveLesson(null);
    setIsRecurringActionsOpen(false);
  }, [businessDate]);

  useEffect(() => {
    setIsRecurringActionsOpen(false);
  }, [activeLesson]);

  // ─── Background scroll lock while any dialog is open (shared hook: counts stacked layers, keeps the page width) ───
  useScrollLock(isAddModalOpen || isWeekPlanOpen || !!activeLesson);

  // ─── Close Modal on Escape Key ───
  // The dialogs of «Изменить / Прекратить» (shared `Modal`) close themselves on Escape from ONE document listener and React may commit that
  // closing before this window listener runs: the state would then already say «no dialog» and the panel would close with the same key.
  // So the question «is a dialog above the panel?» is asked in the capture phase, before any of them has reacted.
  const weeklyDialogOpenRef = useRef(false);
  const moveHoldsEscape = useRef(false);       // the move dialog (TeacherMoveControl) is above the panel
  weeklyDialogOpenRef.current = Boolean(endingRecurringLesson || editingLesson);
  const escapeBelongsToDialogRef = useRef(false);
  useEffect(() => {
    const noteKey = (e: KeyboardEvent) => { if (e.key === "Escape") escapeBelongsToDialogRef.current = weeklyDialogOpenRef.current; };
    window.addEventListener("keydown", noteKey, true);
    return () => window.removeEventListener("keydown", noteKey, true);
  }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // a conflict of marks / a running exam is decided in a dialog over the panel: the panel stays
        if (marksOps.conflict || marksOps.liveExams) return;
        // the dialogs of «Изменить / Прекратить» are above the panel and close themselves (the topmost one only): the panel stays
        if (escapeBelongsToDialogRef.current || moveHoldsEscape.current) return;
        if (isRecurringActionsOpen) {
          setIsRecurringActionsOpen(false);
          return;
        }
        if (isAddModalOpen) setIsAddModalOpen(false);
        if (isWeekPlanOpen) {
          setIsWeekPlanOpen(false);
          return;
        }
        if (activeLesson) setActiveLesson(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddModalOpen, isWeekPlanOpen, activeLesson, isRecurringActionsOpen, marksOps.conflict, marksOps.liveExams]);

  // Add conflict check (overlapping lessons)
  const addConflict = useMemo(() => {
    if (newLessonScope === "one_off") {
      return weekOccurrences.find((lesson) =>
        lesson.occurrenceDate === newLessonDate
        && newStartTime < lesson.endTime
        && newEndTime > lesson.startTime,
      );
    }
    return newDays.map((day) => overlappingLesson(lessons, day, newStartTime, newEndTime)).find(Boolean);
  }, [lessons, newDays, newEndTime, newLessonDate, newLessonScope, newStartTime, weekOccurrences]);

  // Current real day of week: 1=Mon .. 7=Sun
  const todayDayOfWeek = businessDayOfWeek();

  // Check if adding lesson on today with time in the past
  const addPastTimeConflict = useMemo(() => {
    const isToday = newLessonScope === "one_off"
      ? newLessonDate === formatBusinessDate()
      : newDays.includes(todayDayOfWeek) && (newValidFrom || formatBusinessDate()) === formatBusinessDate();
    if (!isToday) return null;
    const curMin = businessTimeMinutes();
    const [startH, startM] = (newStartTime || "00:00").split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);

    if (startMinutes < curMin) {
      const curTimeStr = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      return `Нельзя назначить урок на прошедшее время сегодняшнего дня (текущее время: ${curTimeStr})`;
    }
    return null;
  }, [newDays, newLessonDate, newLessonScope, newStartTime, newValidFrom, todayDayOfWeek]);

  const filteredWeekLessons = useMemo(() => {
    return weekOccurrences.filter((l) => {
      if (selectedGroupFilter !== "all" && l.groupId !== selectedGroupFilter) return false;
      return true;
    });
  }, [weekOccurrences, selectedGroupFilter]);

  // Today lessons (filtered & smart sorted: live -> upcoming -> completed)
  const todayLessons = useMemo(() => {
    const list = todayOccurrences
      .filter((l) => selectedGroupFilter === "all" || l.groupId === selectedGroupFilter)
      .slice();

    return list.sort((a, b) => {
      const isAttA = !!lessonAttendanceMap[a.id];
      const lifecycleA = lessonStatusMap[a.id] || (completedLessonsMap[a.id] ? "completed" : "scheduled");
      const isFinA = lifecycleA === "completed";
      const statusA = getLessonTimeStatus(a, todayDayOfWeek, isAttA, isFinA);

      const isAttB = !!lessonAttendanceMap[b.id];
      const lifecycleB = lessonStatusMap[b.id] || (completedLessonsMap[b.id] ? "completed" : "scheduled");
      const isFinB = lifecycleB === "completed";
      const statusB = getLessonTimeStatus(b, todayDayOfWeek, isAttB, isFinB);

      // A real started lesson always leads the list. A scheduled slot becomes
      // actionable only after its time starts, never merely from wall-clock time.
      const rank = (lifecycle: LessonAttendanceStatus | "scheduled", timing: typeof statusA) => {
        if (lifecycle === "in_progress") return 0;
        if (timing.type === "live") return 1;
        if (timing.type === "upcoming") return 2;
        return 3;
      };

      const rankA = rank(lifecycleA, statusA);
      const rankB = rank(lifecycleB, statusB);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return (a.startTime || "").localeCompare(b.startTime || "");
    });
  }, [todayOccurrences, selectedGroupFilter, todayDayOfWeek, lessonAttendanceMap, completedLessonsMap, lessonStatusMap, clockTick]);

  // Switch view mode and reset filter to all groups
  const switchViewMode = (mode: "week" | "today") => {
    setViewMode(mode);
    setSelectedGroupFilter("all");
    setIsGroupFilterOpen(false);
    if (mode === "today") {
      setWeekOffset(0);
    }
  };

  const openLesson = useCallback((lesson: LessonOccurrence, view: "today" | "week") => {
    if (scheduleDataUnavailable) {
      setScheduleError("Расписание пока не подтверждено сервером. Сначала повторите загрузку.");
      return;
    }
    setActiveLesson(lesson);
    setActiveLessonView(view);
    setActiveLessonStatus("scheduled");
    setIsCancellingLesson(false);
    setCancellationReason("");
  }, [scheduleDataUnavailable]);

  // Load students and attendance for active lesson
  useEffect(() => {
    if (!activeLesson) {
      setIsMarkingAttendance(false);
      setIsAttendanceSaved(false);
      setIsAttendanceDirty(false);
      setAttendance({});
      setAttendanceError(null);
      setActiveLessonStatus("scheduled");
      setActiveCancellationReason(null);
      setActiveTeacherInfo(null);
      setActiveRequestMark(null);
      setActiveRosterSource("group");
      return;
    }
    setLoadingStudents(true);
    setIsMarkingAttendance(false);
    setIsAttendanceSaved(false);
    setIsAttendanceDirty(false);
    setAttendanceError(null);
    setGroupStudents([]);
    setAttendance({});
    setExcuseReasons({});
    setSavedExcuses({});
    setExcuseReasonInvalidId(null);
    const occurrenceDate = activeLesson.occurrenceDate;
    const lessonKey = `${occurrenceDate}_${activeLesson.id}`;
    // LOGIC-B2: a substitute (or a former teacher) has no group page (403): the roster of his lesson comes with the journal.
    const source = rosterSource({ isManager, groupId: activeLesson.groupId, ownGroupIds: groups.map((group) => group.id) });
    setActiveRosterSource(source);
    readLessonRoster({
      source,
      groupId: activeLesson.groupId,
      getGroup: (id) => orgApi.getGroup(id),
      getJournal: () => orgApi.getGroupAttendance(activeLesson.groupId, { dateFrom: occurrenceDate, dateTo: occurrenceDate }),
    })
      .then(([g, att]) => {
        setActiveTeacherInfo(att?.lessonTeachers?.[lessonKey] ?? null);
        setActiveRequestMark(att?.substitutionRequests?.[lessonKey] ?? null);
        if (source === "journal") {
          setGroupStudents(rosterFromJournal(att?.lessonRoster));
        } else if (g?.students) {
          // a student on a pause today is not in the class (before the start the group list still holds him)
          setGroupStudents(occurrenceDate === formatBusinessDate() ? withoutPaused(g.students) : g.students);
        } else {
          setGroupStudents([]);
        }

        const status = att?.statuses?.[lessonKey] || "scheduled";
        marksOps.reset(att?.versions?.[lessonKey], att?.records?.[lessonKey] || {});
        setActiveLessonStatus(status);
        setActiveCancellationReason(att?.cancellationReasons?.[lessonKey] || null);
        if (occurrenceDate === formatBusinessDate()) {
          setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: status }));
        }

        setSavedExcuses(
          Object.fromEntries(
            Object.entries(att?.excuses?.[lessonKey] || {}).map(([studentId, info]) => [studentId, { reason: info.reason }]),
          ),
        );

        if (status === "cancelled") {
          setAttendance({});
          setIsAttendanceSaved(false);
        } else if (att?.records) {
          const lessonRecords = att.records[lessonKey] || {};
          if (Object.keys(lessonRecords).length > 0) {
            setAttendance(lessonRecords as any);
            setIsAttendanceSaved(true);
          } else {
            setAttendance({});
            setIsAttendanceSaved(false);
          }
        } else {
          setAttendance({});
          setIsAttendanceSaved(false);
        }
      })
      .catch((error) => {
        setAttendanceError(`Не удалось загрузить журнал посещаемости: ${getDataLoadErrorMessage(error)}`);
      })
      .finally(() => setLoadingStudents(false));
  }, [activeLesson]);

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
  const getSubsequentStartedLesson = useCallback(
    (lesson: Pick<LessonOccurrence, "id" | "groupId" | "endTime">): LessonOccurrence | null => {
      const [endHour, endMinute] = (lesson.endTime || "00:00").split(":").map(Number);
      const endMinutes = (endHour || 0) * 60 + (endMinute || 0);
      const lessonTeacherId = groups.find((group) => group.id === lesson.groupId)?.teacher_id;
      if (!lessonTeacherId) return null;

      return [...todayOccurrences]
        .filter((candidate) => {
          if (candidate.id === lesson.id) return false;
          const candidateTeacherId = groups.find((group) => group.id === candidate.groupId)?.teacher_id;
          if (candidateTeacherId !== lessonTeacherId) return false;
          const status = lessonStatusMap[candidate.id]
            || (completedLessonsMap[candidate.id] ? "completed" : "scheduled");
          if (status !== "in_progress" && status !== "completed") return false;
          const [startHour, startMinute] = (candidate.startTime || "00:00").split(":").map(Number);
          return (startHour || 0) * 60 + (startMinute || 0) >= endMinutes;
        })
        .sort((left, right) => (left.startTime || "").localeCompare(right.startTime || ""))[0] || null;
    },
    [todayOccurrences, lessonStatusMap, completedLessonsMap, groups],
  );

  const handleStartLesson = async () => {
    if (!activeLesson || activeLessonStatus !== "scheduled") return;

    const subsequentLesson = activeLesson.occurrenceDate === formatBusinessDate()
      ? getSubsequentStartedLesson(activeLesson)
      : null;
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

    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      const started = await orgApi.startGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
      });
      marksOps.noteVersion(started);
      // the roster is frozen by the start: a student on a pause that day is not in it
      {
        const att = await orgApi.getGroupAttendance(activeLesson.groupId, { dateFrom: activeLesson.occurrenceDate, dateTo: activeLesson.occurrenceDate }).catch(() => null);
        const frozen = att?.rosterStudentIds?.[`${activeLesson.occurrenceDate}_${activeLesson.id}`];
        if (frozen) setGroupStudents((previous) => narrowToFrozenRoster(previous, frozen));
      }
      setActiveLessonStatus("in_progress");
      setWeekLessonStatusMap((previous) => ({
        ...previous,
        [`${activeLesson.occurrenceDate}_${activeLesson.id}`]: "in_progress",
      }));
      if (activeLesson.occurrenceDate === formatBusinessDate()) {
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "in_progress" }));
      }
      setIsMarkingAttendance(true);
    } catch (err) {
      console.error("Failed to start lesson:", err);
      setAttendanceError(lessonFailure(err, "start", "Не удалось начать урок. Данные не изменены.").text);
    } finally {
      setSavingAttendance(false);
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
    // «Оставить мои» repeats this very action with the merged marks
    const marks = override ?? attendance;
    if (override) setAttendance(override);

    // Attendance represents a real lesson instance.  Do not let a stale modal
    // or an old client state bypass the explicit "start lesson" transition.
    if (activeLessonStatus !== "in_progress") {
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

    setSavingAttendance(true);
    try {
      const saved = await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "in_progress",
        records: marks,
        ...(Object.keys(prepared.reasons).length ? { excuseReasons: prepared.reasons } : {}),
        ...marksOps.versionBody(),
      });
      marksOps.noteSaved(saved, marks);
      rememberSavedExcuses(prepared.reasons, marks);
      setIsAttendanceSaved(true);
      setIsAttendanceDirty(false);
      setLessonAttendanceMap((prev) => ({ ...prev, [activeLesson.id]: true }));
      setActiveLessonStatus("in_progress");
      setWeekLessonStatusMap((previous) => ({
        ...previous,
        [`${activeLesson.occurrenceDate}_${activeLesson.id}`]: "in_progress",
      }));
      if (activeLesson.occurrenceDate === formatBusinessDate()) {
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "in_progress" }));
      }
      setIsMarkingAttendance(false);
    } catch (err) {
      console.error("Failed to sync attendance:", err);
      const failure = marksOps.refused(err, "save", "Не удалось сохранить посещаемость. Данные не изменены.", marks);
      // a conflict is decided in its dialog (my marks stay on screen); anything else is the text of the panel
      if (failure.kind !== "conflict") setAttendanceError(excuseReasonHint(err) ?? failure.text);
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleFinishLesson = async (acknowledgeLiveExam = false, override?: Record<string, AttendanceStatus>) => {
    if (!activeLesson) return;
    const marks = override ?? attendance;
    if (override) setAttendance(override);

    // O6: a lesson of an empty roster cannot be finished - «Урока не было» is the way out (the server says the same)
    if (groupStudents.length === 0) {
      setAttendanceError(NO_STUDENTS_FINISH_TEXT);
      return;
    }

    // Check attendance completeness: all students must be marked and attendance saved
    const hasSaved = isAttendanceSaved || !!lessonAttendanceMap[activeLesson.id];
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

    setSavingAttendance(true);
    try {
      const finished = await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "completed",
        records: marks,
        ...(Object.keys(prepared.reasons).length ? { excuseReasons: prepared.reasons } : {}),
        ...marksOps.versionBody(),
        ...(acknowledgeLiveExam ? { acknowledgeLiveExam: true } : {}),
      });
      marksOps.noteSaved(finished, marks);
      marksOps.clearLiveExams();
      // O8: the exam service could not be asked - the lesson is closed anyway; say so
      const syncNotice = examSyncNotice(finished?.examSync);
      if (syncNotice) setScheduleNotices([syncNotice]);
      rememberSavedExcuses(prepared.reasons, marks);
      setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: true }));
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "completed" }));
      setWeekLessonStatusMap((previous) => ({
        ...previous,
        [`${activeLesson.occurrenceDate}_${activeLesson.id}`]: "completed",
      }));
      setActiveLesson(null);
    } catch (err) {
      console.error("Failed to sync completed status with server:", err);
      const failure = marksOps.refused(err, "finish", "Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз.", marks);
      if (failure.kind !== "conflict" && failure.kind !== "live_exam") setAttendanceError(excuseReasonHint(err) ?? failure.text);
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCancelLesson = async () => {
    if (!activeLesson || activeLessonStatus === "completed" || activeLessonStatus === "cancelled") return;
    if (!lessonExamBinding || lessonExamBinding.loading || !lessonExamBinding.canCancel) return;
    const reason = cancellationReason.trim();
    if (reason.length < 3) {
      setAttendanceError("Укажите понятную причину отмены урока.");
      return;
    }

    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "cancelled",
        records: {},
        cancellationReason: reason,
        ...cancellationKindBody(cancellationKind, canChooseKind),
        ...marksOps.versionBody(),
      });
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "cancelled" }));
      setLessonAttendanceMap((previous) => ({ ...previous, [activeLesson.id]: false }));
      setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: false }));
      setWeekLessonStatusMap((previous) => ({
        ...previous,
        [`${activeLesson.occurrenceDate}_${activeLesson.id}`]: "cancelled",
      }));
      setActiveLessonStatus("cancelled");
      setActiveCancellationReason(reason);
      setAttendance({});
      setIsAttendanceSaved(false);
      setIsAttendanceDirty(false);
      setIsMarkingAttendance(false);
      setIsCancellingLesson(false);
      setLessonExamBinding(null);
    } catch (err) {
      console.error("Failed to cancel lesson:", err);
      const failure = marksOps.refused(err, "cancel", "Не удалось отменить урок. Данные не изменены.", attendance);
      if (failure.kind !== "conflict") setAttendanceError(failure.text);
    } finally {
      setSavingAttendance(false);
    }
  };

  const openCancelLessonPanel = async () => {
    if (!activeLesson || activeLessonStatus === "completed" || activeLessonStatus === "cancelled") return;
    setAttendanceError(null);
    setLessonExamBinding({ loading: true, attached: false, canCancel: false });
    setIsCancellingLesson(true);
    try {
      const binding = await examsApi.getLessonBinding({
        groupId: activeLesson.groupId,
        lessonId: activeLesson.id,
        lessonDate: activeLesson.occurrenceDate,
      });
      setLessonExamBinding({
        loading: false,
        attached: binding.attached,
        canCancel: binding.can_cancel,
        examTitle: binding.exam?.title,
        message: binding.message,
      });
    } catch (err) {
      console.error("Failed to check exam binding before lesson cancellation:", err);
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
  // Week mode never rewrites the displayed occurrence. It opens a versioned
  // recurring change whose effect starts on a future date selected by teacher.
  // A substitute holds this one lesson: the recurring schedule of the group is not his to change.
  const canReviseRecurringSchedule = Boolean(
    activeLesson && activeLessonView === "week" && !activeLesson.isOneOff
      && !(activeTeacherInfo?.isSubstitution && activeTeacherInfo.teacherId === user?.id),
  );

  const canFinishLesson = useMemo(() => {
    if (!activeLesson) return false;
    const at = new Date(panelClock);
    return canFinishLessonNow({
      status: activeLessonStatus,
      startTime: activeLesson.startTime,
      endTime: activeLesson.endTime,
      occurrenceDate: activeLesson.occurrenceDate,
      businessDate: formatBusinessDate(at),
      nowMinutes: businessTimeMinutes(at),
    });
  }, [activeLesson, activeLessonStatus, panelClock]);

  const activeLessonIsToday = Boolean(activeLesson && activeLesson.occurrenceDate === formatBusinessDate());
  const activeLessonIsFuture = Boolean(activeLesson && activeLesson.occurrenceDate > formatBusinessDate());
  const activeLessonIsPast = Boolean(activeLesson && activeLesson.occurrenceDate < formatBusinessDate());
  const activeTimeStatus = activeLesson && activeLessonIsToday
    ? getLessonTimeStatus(
        activeLesson,
        todayDayOfWeek,
        isAttendanceSaved,
        activeLessonStatus === "completed",
      )
    : null;

  const activeSubsequentLesson = useMemo(
    () => activeLesson && activeLessonIsToday && activeLessonStatus === "scheduled"
      ? getSubsequentStartedLesson(activeLesson)
      : null,
    [activeLesson, activeLessonIsToday, activeLessonStatus, getSubsequentStartedLesson],
  );

  // Add lesson handler
  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingLesson) return; // a repeated click or Enter while the first save is on its way
    if (
      newLessonScope === "one_off"
      && (newLessonDate < formatBusinessDate() || newLessonDate < weekPeriod.start || newLessonDate > weekPeriod.end)
    ) {
      setScheduleError("Для разового занятия выберите будущую дату из открытой недели расписания.");
      return;
    }
    if (newLessonScope === "recurring") {
      const problem = validFromError(newValidFrom, formatBusinessDate());
      if (problem) {
        setScheduleError(problem);
        return;
      }
    }
    if (newLessonScope === "recurring" && newDays.length === 0) {
      setScheduleError(DAY_REQUIRED_TEXT);
      return;
    }
    const groupId = newGroupId || (groups[0]?.id ?? "custom-group");
    const draft = { startTime: newStartTime, endTime: newEndTime, format: newFormat, room: newRoom, topic: newTopic, color: newColor };

    try {
      setSavingLesson(true);
      setScheduleError(null);
      setScheduleNotices([]);
      // A one-off is one request; a weekly lesson is one request per chosen weekday, and the answer names the days that were refused.
      let notices: string[] = [];
      let failed: Array<{ day: number; reason: string }> = [];
      let added: number[] = [];
      if (newLessonScope === "one_off") {
        notices = await createOneOff(groupId, newLessonDate, draft);
      } else {
        const result = await createWeeklyLessons(groupId, newDays, { ...draft, validFrom: newValidFrom || formatBusinessDate() });
        notices = result.notices;
        failed = result.failed;
        added = result.added;
        if (failed.length > 0) {
          setScheduleError([weeklyResultText(added, failed), ...result.failed.map((item) => `${dayShort(item.day)}: ${item.detail}`)].join("\n"));
          setNewDays(failed.map((item) => item.day));
          if (added.length === 0) return;
        }
      }
      setScheduleNotices(notices);

      // Reload the canonical schedule after either operation. A one-off is
      // intentionally absent from the recurring template, so optimistic
      // browser state would otherwise make it look permanent.
      const reloaded = await loadData();
      if (!reloaded) {
        if (failed.length === 0) setIsAddModalOpen(false);
        setNewTopic("");
        return;
      }
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      try {
        const refreshedWeek = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          isOrgManager ? undefined : user?.id,
        );
        setLoadedWeek({ start: weekPeriod.start, lessons: refreshedWeek });
      } catch (error) {
        setWeekLoadError(getDataLoadErrorMessage(error));
      }
      // some weekdays were refused: the dialog stays open with those days chosen, so nothing is lost silently
      if (failed.length === 0) {
        setIsAddModalOpen(false);
        setNewTopic("");
      }
    } catch (err) {
      console.error("Failed to persist lesson on backend:", err);
      setScheduleError(scheduleErrorText(err, "Не удалось создать урок. Расписание не изменено — повторите попытку."));
    } finally {
      setSavingLesson(false);
    }
  };

  // Open Add Modal with smart non-conflicting time calculation
  const openAddModal = (targetDay?: number) => {
    const day = targetDay !== undefined ? targetDay : (todayDayOfWeek || 1);
    setNewDays(targetDay !== undefined ? [targetDay] : []);
    setNewLessonScope("one_off");
    setNewLessonDate(businessWeekdayDate(day, weekOffset));

    const times = suggestedTimes(lessons.filter((l) => l.dayOfWeek === day));
    setNewStartTime(times.startTime);
    setNewEndTime(times.endTime);

    if (groups.length > 0) {
      setNewGroupId(groups[0].id);
    }
    setNewTopic("");
    setNewRoom("");
    setNewValidFrom(formatBusinessDate());
    setScheduleError(null);
    setTimesEdited(false);
    setSavingLesson(false);
    setIsAddModalOpen(true);
  };

  // The suggested times follow the first chosen weekday (or the date of a one-off lesson) until the user types times of his own.
  useEffect(() => {
    if (!isAddModalOpen || timesEdited) return;
    const day = newLessonScope === "recurring" ? newDays[0] : isoDateDayOfWeek(newLessonDate);
    if (!day) return;
    const times = suggestedTimes(lessons.filter((l) => l.dayOfWeek === day));
    setNewStartTime(times.startTime);
    setNewEndTime(times.endTime);
  }, [isAddModalOpen, timesEdited, newLessonScope, newDays, newLessonDate, lessons]);

  // Changing / stopping a weekly lesson is the shared dialogs' job; the page only reloads the canonical schedule afterwards.
  // The weekly lesson as it stands on the day the change starts from (an occurrence that was moved carries the time of the move).
  const weeklyStateOf = async (lesson: LessonOccurrence): Promise<LessonOccurrence> => {
    const state = await weeklyResolver(lesson.groupId, lesson.id)(nextBusinessDate()).catch(() => null);
    return state ? { ...lesson, ...state } : lesson;
  };

  const openEditModal = async (lesson: LessonOccurrence) => {
    if (lesson.isOneOff) return;
    const state = await weeklyStateOf(lesson);
    setEditingLesson(state);
    setActiveLesson(null);
  };

  // «Прекратить» opens above the lesson panel (the panel stays under it, as for the dialogs of the marks)
  const openEndRecurringModal = async (lesson: LessonOccurrence) => {
    if (lesson.isOneOff) return;
    setEndingRecurringLesson(await weeklyStateOf(lesson));
  };

  const reloadAfterWeeklyChange = async (): Promise<boolean> => {
    const reloaded = await loadData();
    if (!reloaded) return false;
    const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
    try {
      const refreshedWeek = await orgApi.getScheduleOccurrences(
        { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
        isOrgManager ? undefined : user?.id,
      );
      setLoadedWeek({ start: weekPeriod.start, lessons: refreshedWeek });
    } catch (error) {
      setWeekLoadError(getDataLoadErrorMessage(error));
    }
    return true;
  };


  useEffect(() => {
    if (!user?.id) return;
    const currentUserId = user.id;
    const isOrgManager = user.org_role === "owner" || user.org_role === "admin" || user.role === "owner";
    let isCurrent = true;

    async function loadWeekSummary() {
      setWeekLoadError(null);
      try {
        const occurrences = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          isOrgManager ? undefined : currentUserId,
        );
        if (!isCurrent) return;

        // One journal request per group gives an authoritative weekly status
        // for all its lessons, rather than trying to infer completion from a
        // recurring schedule template.
        const groupIds = [...new Set(occurrences.map((lesson) => lesson.groupId).filter(Boolean))];
        const weeklyStatuses: Record<string, LessonAttendanceStatus> = {};
        await Promise.all(
          groupIds.map(async (groupId) => {
            const attendanceData = await orgApi.getGroupAttendance(groupId, {
              dateFrom: weekPeriod.start,
              dateTo: weekPeriod.end,
            });
            Object.assign(weeklyStatuses, attendanceData?.statuses || {});
          }),
        );
        if (isCurrent) {
          setLoadedWeek({ start: weekPeriod.start, lessons: occurrences });
          setWeekLessonStatusMap(weeklyStatuses);
        }
      } catch (error) {
        if (isCurrent) {
          // Do not turn a failed weekly read into a blank calendar. Preserve
          // the last confirmed week and make the stale state explicit.
          setWeekLoadError(getDataLoadErrorMessage(error));
        }
      }
    }

    void loadWeekSummary();
    return () => {
      isCurrent = false;
    };
  }, [user?.id, user?.org_role, user?.role, weekPeriod.end, weekPeriod.start, weekRefreshNonce]);

  // Date range for week view
  const weekRangeText = useMemo(() => {
    const startOfWeek = weekPeriod.start;
    const endOfWeek = weekPeriod.end;
    const formatDayMonth = (isoDate: string) => formatIsoDateLabel(isoDate, { day: "numeric", month: "short" });
    const year = formatIsoDateLabel(endOfWeek, { year: "numeric" });
    return `${formatDayMonth(startOfWeek)} — ${formatDayMonth(endOfWeek)} ${year}`;
  }, [weekPeriod.end, weekPeriod.start]);

  const todayKpi = useMemo(() => {
    let live = 0;
    let upcoming = 0;
    let completed = 0;
    let needsCompletion = 0;
    let notStarted = 0;
    let cancelled = 0;
    let attendanceMarked = 0;
    let attendanceNeeded = 0;

    // KPI are deliberately calculated from the complete day, not from a
    // temporary group filter. They are an operational summary for the teacher.
    for (const lesson of todayOccurrences) {
      const lessonStatus = lessonStatusMap[lesson.id] || (completedLessonsMap[lesson.id] ? "completed" : "scheduled");
      // a lesson moved away is not in the plan of the day, whatever its status has reached the page
      if (lessonStatus === "cancelled" || isMovedAway(lesson.substitutionOutcome)) {
        cancelled += 1;
        continue;
      }
      const hasAttendance = Boolean(lessonAttendanceMap[lesson.id]) || lessonStatus === "completed";
      if (hasAttendance) attendanceMarked += 1;
      const time = getLessonTimeStatus(
        lesson,
        todayDayOfWeek,
        hasAttendance,
        lessonStatus === "completed",
      );
      if (lessonStatus === "completed") {
        completed += 1;
      } else if (time.type === "upcoming") {
        upcoming += 1;
      } else if (time.type === "live") {
        if (lessonStatus === "in_progress") {
          if (time.isPastEndTime) needsCompletion += 1;
          else live += 1;
          if (!hasAttendance) attendanceNeeded += 1;
        } else {
          // Planned time alone does not make a lesson active. It becomes an
          // actual lesson only after the teacher explicitly starts it.
          notStarted += 1;
        }
      }
    }

    return {
      planned: todayOccurrences.length - cancelled,
      live,
      upcoming,
      completed,
      needsCompletion,
      notStarted,
      cancelled,
      attendanceMarked,
      attendanceNeeded,
    };
  }, [todayOccurrences, lessonStatusMap, completedLessonsMap, lessonAttendanceMap, todayDayOfWeek, clockTick]);

  const weekKpi = useMemo(() => {
    // Only the lessons of the plan count: a lesson moved away (the new one counts instead) and a cancelled one are shown muted on
    // the grid, listed in the plan, and not in «План недели», «На неделю N» or «Завершено x из y».
    const plan = weekPlan(
      weekOccurrences.map((lesson) => ({
        date: lesson.occurrenceDate,
        status: weekLessonStatusMap[`${lesson.occurrenceDate}_${lesson.id}`]
          || (lesson.occurrenceDate === businessDate ? lessonStatusMap[lesson.id] : undefined)
          || "scheduled",
        outcome: lesson.substitutionOutcome,
      })),
      businessDate,
    );
    return { ...plan, completionTarget: plan.planned };
  }, [weekOccurrences, weekLessonStatusMap, lessonStatusMap, businessDate]);

  const weekPlanRows = useMemo(() => {
    return weekOccurrences
      .map((lesson) => {
        const key = `${lesson.occurrenceDate}_${lesson.id}`;
        const lifecycle = weekLessonStatusMap[key]
          || (lesson.occurrenceDate === businessDate ? lessonStatusMap[lesson.id] : undefined)
          || "scheduled";

        if (lifecycle === "completed") {
          return { lesson, lifecycle, label: "Проведён", tone: "emerald" as const };
        }
        if (isMovedAway(lesson.substitutionOutcome)) {
          return { lesson, lifecycle, label: "Перенесён", tone: "slate" as const };
        }
        if (lifecycle === "cancelled") {
          return { lesson, lifecycle, label: "Отменён", tone: "slate" as const };
        }
        if (lifecycle === "in_progress") {
          return { lesson, lifecycle, label: "Идёт", tone: "blue" as const };
        }
        if (lesson.occurrenceDate < businessDate) {
          return { lesson, lifecycle, label: "Не начат", tone: "amber" as const };
        }
        return { lesson, lifecycle, label: "Запланирован", tone: "violet" as const };
      })
      .sort((left, right) => (
        `${left.lesson.occurrenceDate}_${left.lesson.startTime}_${left.lesson.groupName}`
          .localeCompare(`${right.lesson.occurrenceDate}_${right.lesson.startTime}_${right.lesson.groupName}`)
      ));
  }, [weekOccurrences, weekLessonStatusMap, lessonStatusMap, businessDate]);

  const nextAction = useMemo(() => {
    const actionableLessons = todayOccurrences.filter((lesson) => {
      const status = lessonStatusMap[lesson.id] || (completedLessonsMap[lesson.id] ? "completed" : "scheduled");
      return status !== "completed" && status !== "cancelled";
    });

    // A scheduled slot and an actually started lesson are different states.
    // Do not label a merely scheduled lesson as "in progress" just because
    // its planned start time has passed.
    const withTime = actionableLessons
      .map((lesson) => {
        const status = lessonStatusMap[lesson.id] || "scheduled";
        const hasAttendance = Boolean(lessonAttendanceMap[lesson.id]);
        return {
          lesson,
          status,
          hasAttendance,
          time: getLessonTimeStatus(lesson, todayDayOfWeek, hasAttendance, false),
        };
      })
      .sort((left, right) => left.time.startMinutes - right.time.startMinutes);

    const overdue = withTime.find(({ time }) => time.type === "live" && time.isPastEndTime);
    if (overdue) {
      return {
        ...overdue,
        label: overdue.status === "in_progress" ? "Завершить урок" : "Урок не начат",
        tone: "rose" as const,
      };
    }

    const started = withTime.find(({ status }) => status === "in_progress");
    if (started) {
      return {
        ...started,
        label: started.hasAttendance ? "Идёт урок" : "Отметить посещаемость",
        tone: "emerald" as const,
      };
    }

    const readyToStart = withTime.find(({ time }) => time.type === "live");
    if (readyToStart) return { ...readyToStart, label: "Начать урок", tone: "blue" as const };

    const upcoming = withTime.find(({ time }) => time.type === "upcoming");
    if (upcoming) return { ...upcoming, label: `Через ${formatMinutesUntil(upcoming.time.diffMinutes)}`, tone: "amber" as const };
    return null;
  }, [todayOccurrences, lessonStatusMap, completedLessonsMap, lessonAttendanceMap, todayDayOfWeek, clockTick]);

  const activeExamAction = useMemo(
    () => liveExams.find((exam) => exam.status === "active") || null,
    [liveExams],
  );

  const weekKpiDescription = weekPlanDescription(weekKpi, completedLessonsProgressLabel);
  const todayKpiDescription = todayKpi.planned === 0
    ? "На сегодня занятий нет"
    : todayKpi.completed === todayKpi.planned
      ? "На сегодня все уроки завершены"
      : completedLessonsProgressLabel(todayKpi.completed, todayKpi.planned);
  const attendanceKpiDescription = todayKpi.planned === 0
    ? "Нет занятий для отметки"
    : todayKpi.attendanceNeeded > 0
      ? `Нужно отметить: ${todayKpi.attendanceNeeded}`
    : todayKpi.attendanceMarked === todayKpi.planned
      ? "Все занятия отмечены"
      : todayKpi.notStarted > 0
        ? `Сначала начните: ${todayKpi.notStarted}`
      : `Отмечено ${todayKpi.attendanceMarked} из ${todayKpi.planned}`;
  const nextActionTone = nextAction?.tone === "rose"
    ? "border-rose-200 bg-rose-50/70 hover:bg-rose-50 text-rose-900"
    : nextAction?.tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50 text-emerald-900"
      : nextAction?.tone === "blue"
        ? "border-blue-200 bg-blue-50/70 hover:bg-blue-50 text-blue-900"
        : "border-amber-200 bg-amber-50/70 hover:bg-amber-50 text-amber-900";
  const nextActionIconTone = nextAction?.tone === "rose"
    ? "bg-rose-100 text-rose-600"
    : nextAction?.tone === "emerald"
      ? "bg-emerald-100 text-emerald-600"
      : nextAction?.tone === "blue"
        ? "bg-blue-100 text-blue-600"
        : "bg-amber-100 text-amber-600";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center animate-pulse">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (loadError && loadedScheduleDate !== businessDate) {
    return (
      <div className="mx-auto max-w-2xl pt-12">
        <DataLoadError
          title="Не удалось загрузить расписание"
          message={loadError}
          onRetry={loadData}
          isRetrying={isRefreshing}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Расписание занятий
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Планирование уроков, аудиторий и учёт посещаемости групп
          </p>
        </div>

        {/* Add lesson button */}
        <button
          type="button"
          disabled={scheduleDataUnavailable}
          onClick={() => {
            setViewMode("week");
            openAddModal();
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm shadow-primary-600/25 transition-all self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-55"
        >
          <Plus className="w-4 h-4" />
          <span>Добавить в расписание</span>
        </button>
      </div>

      {scheduleError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-medium text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{scheduleError}</span>
        </div>
      )}

      {scheduleNotices.length > 0 && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <ul className="space-y-0.5">{scheduleNotices.map((note) => <li key={note}>{note}</li>)}</ul>
          </div>
          <button type="button" onClick={() => setScheduleNotices([])} aria-label="Скрыть" className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loadError && (
        <DataLoadError
          compact
          title="Расписание не обновлено"
          message={`${loadError} Показаны последние успешно загруженные данные; изменения временно недоступны.`}
          onRetry={loadData}
          isRetrying={isRefreshing}
        />
      )}

      {weekLoadError && (
        <DataLoadError
          compact
          title="Неделя не обновлена"
          message={weekLoading ? weekLoadError : `${weekLoadError} Показаны последние успешно загруженные данные недели.`}
          onRetry={() => setWeekRefreshNonce((current) => current + 1)}
        />
      )}

      {liveExamError && (
        <DataLoadError
          compact
          title="Не удалось обновить состояние экзаменов"
          message={`${liveExamError} Показано последнее подтверждённое состояние.`}
          onRetry={() => setLiveExamRefreshNonce((current) => current + 1)}
          isRetrying={isLiveExamRefreshing}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setIsWeekPlanOpen(true)}
          aria-label="Открыть подробный план недели"
          className="group min-h-[128px] rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:p-5"
        >
          <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-semibold">План недели</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {weekKpi.planned}
              <span className="text-xs font-medium text-slate-400 ml-1.5">{russianPlural(weekKpi.planned, "урок", "урока", "уроков")}</span>
            </p>
            <p className={`text-xs mt-1.5 leading-5 ${weekKpi.completionTarget > 0 && weekKpi.completed === weekKpi.completionTarget ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
              {weekKpiDescription}
            </p>
          </div>
          </div>
        </button>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs min-h-[128px] flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-semibold">Сегодня</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {todayKpi.planned}
              <span className="text-xs font-medium text-slate-400 ml-1.5">{russianPlural(todayKpi.planned, "урок", "урока", "уроков")}</span>
            </p>
            <p className={`text-xs mt-1.5 leading-5 ${todayKpi.planned > 0 && todayKpi.completed === todayKpi.planned ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
              {todayKpiDescription}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs min-h-[128px] flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CheckCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-semibold">Посещаемость сегодня</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {todayKpi.attendanceMarked}
              <span className="text-sm font-medium text-slate-400"> / {todayKpi.planned}</span>
            </p>
            <p className={`text-xs mt-1.5 leading-5 ${todayKpi.attendanceNeeded > 0 ? "text-amber-700 font-semibold" : "text-slate-500"}`}>
              {attendanceKpiDescription}
            </p>
          </div>
        </div>

        {nextAction ? (
          <button
            type="button"
            onClick={() => openLesson(nextAction.lesson, "today")}
            aria-label={`${nextAction.label}: ${nextAction.lesson.groupName}, ${nextAction.lesson.startTime}`}
            className={`rounded-2xl p-4 sm:p-5 border shadow-xs min-h-[128px] flex items-start gap-4 text-left transition-colors ${nextActionTone}`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${nextActionIconTone}`}>
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold opacity-75">Ближайшее действие</p>
                <ArrowRight className="w-4 h-4 shrink-0 opacity-70" />
              </div>
              <p className="text-sm font-bold mt-1 leading-5 break-words">
                {nextAction.lesson.startTime} · {nextAction.lesson.groupName}
              </p>
              <p className="text-xs mt-1.5 leading-5 font-semibold opacity-80">
                {nextAction.label}
              </p>
              {nextAction.lesson.topic && (
                <div className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs leading-5 opacity-75">
                  <span className="shrink-0 font-semibold">Тема:</span>
                  <span className="min-w-0 line-clamp-2 break-words">{nextAction.lesson.topic}</span>
                </div>
              )}
            </div>
          </button>
        ) : activeExamAction ? (
          <Link
            href={`/teacher/exams/${activeExamAction.exam_id}`}
            className="rounded-2xl p-4 sm:p-5 border border-primary-200 bg-primary-50/60 shadow-xs min-h-[128px] flex items-start gap-4 text-left transition-colors hover:bg-primary-50"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
              <Radio className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-primary-700 font-semibold">Ближайшее действие</p>
                <ArrowRight className="w-4 h-4 shrink-0 text-primary-600" />
              </div>
              <p className="text-sm font-bold text-slate-900 mt-1 leading-5 break-words">Сейчас проводится экзамен</p>
              <p className="text-xs text-primary-800 mt-1.5 leading-5 font-semibold truncate">{activeExamAction.title}</p>
              {activeExamAction.group_name && <p className="text-xs text-primary-700/80 mt-0.5 truncate">{activeExamAction.group_name} · открыть live-статус</p>}
            </div>
          </Link>
        ) : (
          <div className="bg-slate-50/70 rounded-2xl p-4 sm:p-5 border border-slate-200/80 min-h-[128px] flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 font-semibold">Ближайшее действие</p>
              <p className="text-sm font-bold text-slate-800 mt-2">На сегодня всё</p>
              <p className="text-xs text-slate-500 mt-1.5 leading-5">Нет уроков, требующих действия</p>
            </div>
          </div>
        )}
      </div>

      {/* Modern View Mode Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-xs">
        {/* Left: Beautiful Pill Tabs */}
        <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => switchViewMode("today")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === "today"
                ? "bg-white text-slate-900 shadow-sm shadow-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${viewMode === "today" ? "text-primary-600" : "text-slate-400"}`} />
            <span>Сегодня</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                viewMode === "today"
                  ? "bg-primary-50 text-primary-700 border border-primary-200/60"
                  : "bg-slate-200/80 text-slate-600"
              }`}
            >
              {todayKpi.planned}
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchViewMode("week")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === "week"
                ? "bg-white text-slate-900 shadow-sm shadow-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            }`}
          >
            <CalendarIcon className={`w-3.5 h-3.5 ${viewMode === "week" ? "text-primary-600" : "text-slate-400"}`} />
            <span>На неделю</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                viewMode === "week"
                  ? "bg-primary-50 text-primary-700 border border-primary-200/60"
                  : "bg-slate-200/80 text-slate-600"
              }`}
            >
              {weekKpi.planned}
            </span>
          </button>
        </div>

        {/* Right side: Group Filter & context info */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5">
          {viewMode === "today" && (
            <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
              {formatBusinessDateLabel({
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          )}

          {/* Group filter custom dropdown */}
          <div className="relative">
            <button
              ref={groupFilterTriggerRef}
              type="button"
              aria-expanded={isGroupFilterOpen}
              aria-controls={isGroupFilterOpen ? "schedule-group-filter-menu" : undefined}
              onClick={() => setIsGroupFilterOpen((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                selectedGroupFilter !== "all"
                  ? "bg-primary-50 text-primary-700 border-primary-200/80 shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80 shadow-xs"
              }`}
            >
              <span>
                {selectedGroupFilter === "all"
                  ? `Все группы (${groups.length})`
                  : `${groups.find((g) => g.id === selectedGroupFilter)?.name || "Группа"} (${
                      groups.find((g) => g.id === selectedGroupFilter)?.class_level || 5
                    } кл)`}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isGroupFilterOpen ? "rotate-180 text-primary-600" : "text-slate-400"
                }`}
              />
            </button>

            {/* Portaled + aligned to the nearer screen edge + capped in height: never clipped, long lists scroll. */}
            <FloatingPanel
              id="schedule-group-filter-menu"
              open={isGroupFilterOpen}
              triggerRef={groupFilterTriggerRef}
              onClose={() => setIsGroupFilterOpen(false)}
              width={240}
              label="Фильтр по группе"
              className="bg-white rounded-2xl p-1.5 shadow-xl border border-slate-100 space-y-0.5"
            >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupFilter("all");
                      setIsGroupFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                      selectedGroupFilter === "all"
                        ? "bg-primary-50 text-primary-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-50 font-medium"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {selectedGroupFilter === "all" && <Check className="w-3.5 h-3.5 text-primary-600" />}
                      Все группы
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-bold">
                      {groups.length}
                    </span>
                  </button>

                  {groups.map((g) => {
                    const isSelected = selectedGroupFilter === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupFilter(g.id);
                          setIsGroupFilterOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                          isSelected
                            ? "bg-primary-50 text-primary-700 font-semibold"
                            : "text-slate-700 hover:bg-slate-50 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary-600 shrink-0" />}
                          <span className="truncate">{g.name}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium shrink-0 ml-2">
                          {g.class_level || 5} класс
                        </span>
                      </button>
                    );
                  })}
            </FloatingPanel>
          </div>
        </div>
      </div>

      {/* VIEW: WEEK GRID */}
      {viewMode === "week" && (
        <div className="space-y-4">
          {/* Week Navigation Toolbar */}
          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset((p) => p - 1)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                title="Предыдущая неделя"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 min-w-[160px] text-center">
                {weekRangeText}
              </span>
              <button
                onClick={() => setWeekOffset((p) => p + 1)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                title="Следующая неделя"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-2 py-1 bg-primary-50 rounded-lg transition-colors ml-1"
                >
                  К текущей неделе
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {DAYS.map((day) => {
            const dayLessons = filteredWeekLessons
              .filter((l) => l.dayOfWeek === day.id)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            const isToday = day.id === todayDayOfWeek && weekOffset === 0;

            return (
              <div
                key={day.id}
                className={`rounded-2xl border transition-all flex flex-col min-h-[360px] ${
                  isToday
                    ? "bg-primary-50/20 border-primary-300 shadow-sm"
                    : "bg-white border-slate-100 shadow-2xs"
                }`}
              >
                {/* Day Header */}
                <div
                  title={day.name}
                  className={`min-h-[58px] md:min-h-[88px] p-3 border-b flex items-center ${
                    isToday
                      ? "bg-primary-600 text-white rounded-t-2xl border-primary-600"
                      : "bg-slate-50/70 border-slate-100 text-slate-800 rounded-t-2xl"
                  }`}
                >
                  <DayHeading date={businessWeekdayDate(day.id, weekOffset)} isToday={isToday} onAccent />
                </div>

                {/* Day Lessons List */}
                <div className="p-2 space-y-2 flex-1">
                  {dayLessons.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-300">
                      <p className="text-xs">{weekLoading ? (weekLoadError ? "Неделя не загружена" : "Загружаем…") : "Нет занятий"}</p>
                    </div>
                  ) : (
                    dayLessons.map((l) => {
                      const colorStyle = COLOR_CLASSES[l.color] || COLOR_CLASSES.blue;
                      const weekStatus = weekLessonStatusMap[`${l.occurrenceDate}_${l.id}`]
                        || (l.occurrenceDate === businessDate ? lessonStatusMap[l.id] : undefined);
                      const off = outOfPlan({ status: weekStatus, outcome: l.substitutionOutcome });
                      if (off) {
                        // moved away / cancelled: a muted card, the time struck through, one chip, nothing to press; not in the plan
                        return (
                          <div
                            key={l.id}
                            data-testid="week-card-muted"
                            data-out={off}
                            className="rounded-xl border border-slate-200 border-l-4 border-l-slate-300 bg-slate-50 p-2.5 text-left opacity-75"
                          >
                            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400 line-through">
                              <Clock className="h-3 w-3 shrink-0" />
                              {timeRange(l.startTime, l.endTime)}
                            </div>
                            <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                              {off === "moved" ? movedAwayChip(l.substitutionOutcome?.movedTo) : "Отменён"}
                            </span>
                            <h4 className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-slate-500">{l.groupName}</h4>
                          </div>
                        );
                      }
                      const place = placeText(l);
                      return (
                        <motion.div
                          key={l.id}
                          whileHover={{ scale: 1.02 }}
                          onClick={() => openLesson(l, "week")}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all border-l-4 ${colorStyle.border} ${colorStyle.bg}`}
                        >
                          <div className="flex items-center text-[11px] font-semibold text-slate-700 mb-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {l.isRescheduled && l.originalStartTime ? (
                                <>
                                  <span className="text-slate-400 line-through">{timeRange(l.originalStartTime, l.originalEndTime)}</span>
                                  <span>→ {timeRange(l.startTime, l.endTime)}</span>
                                </>
                              ) : (
                                <>{timeRange(l.startTime, l.endTime)}</>
                              )}
                            </span>
                          </div>

                          {l.isRescheduled && (
                            <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                              Перенесён
                            </span>
                          )}
                          {!l.isOneOff && validFromBadge(l.validFrom, businessDate) && (
                            <span className="ml-1 inline-flex rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-semibold text-sky-800">
                              {validFromBadge(l.validFrom, businessDate)}
                            </span>
                          )}
                          <LessonChips marks={occurrenceChips(l, user?.id, { manager: isManager })} requestHref={isManager ? requestHrefFor : undefined} className="ml-1" />

                          <h4 className="font-bold text-xs text-slate-900 leading-snug line-clamp-2">
                            {l.groupName}
                          </h4>

                          {place && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-2">
                              {l.format === "online" ? (
                                <span className="flex items-center gap-1 text-purple-700 font-medium">
                                  <Video className="w-3 h-3" /> Zoom
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-400" /> {place}
                                </span>
                              )}
                            </div>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </div>

                {/* Quick add for this day */}
                <div className="p-2 border-t border-slate-50">
                  <button
                    onClick={() => openAddModal(day.id)}
                    className="w-full py-1 text-[11px] text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Добавить
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* VIEW: TODAY */}
      {viewMode === "today" && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-primary-600 to-indigo-700 text-white rounded-3xl p-6 sm:p-8 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-primary-200">
                  План на сегодня
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold mt-1">
                  {DAYS.find((d) => d.id === todayDayOfWeek)?.name},{" "}
                  {formatBusinessDateLabel({ day: "numeric", month: "long" })}
                </h2>
                <p className="text-primary-100 text-sm mt-1">
                  Всего запланировано {classCountLabel(todayKpi.planned)}
                </p>
              </div>
              <button
                onClick={() => switchViewMode("week")}
                className="px-4 py-2.5 bg-white text-primary-700 font-bold rounded-xl hover:bg-primary-50 transition-colors shadow-sm text-sm self-start sm:self-auto"
              >
                Изменить расписание
              </button>
            </div>
          </div>

          {todayLessons.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
              <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-700 font-semibold">На сегодня занятий нет</p>
              <p className="text-slate-400 text-sm mt-1">
                Для нового постоянного занятия откройте режим «Неделя»
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayLessons.map((l) => {
                const isAttSaved = !!lessonAttendanceMap[l.id];
                const lessonStatus = lessonStatusMap[l.id] || (completedLessonsMap[l.id] ? "completed" : "scheduled");
                const subsequentLesson = lessonStatus === "scheduled" ? getSubsequentStartedLesson(l) : null;
                const status = getLessonTimeStatus(l, todayDayOfWeek, isAttSaved, lessonStatus === "completed");
                const colorStyle = COLOR_CLASSES[l.color] || COLOR_CLASSES.blue;

                return (
                  <div
                    key={l.id}
                    onClick={() => openLesson(l, "today")}
                    className={`rounded-2xl p-5 border transition-all cursor-pointer group flex flex-col justify-between ${
                      lessonStatus === "cancelled"
                        ? "bg-slate-50 border-slate-200/60 opacity-75 border-l-4 border-l-slate-400"
                      : lessonStatus === "completed"
                        ? "bg-slate-50/70 border-slate-200/60 opacity-75 hover:opacity-100 hover:bg-white hover:shadow-xs border-l-4 border-l-slate-300"
                        : subsequentLesson
                        ? "bg-white border-rose-300 shadow-md border-l-4 border-l-rose-500 hover:border-rose-400 ring-1 ring-rose-500/10"
                        : status.type === "live"
                        ? status.isPastEndTime && !isAttSaved
                          ? "bg-white border-rose-300 shadow-md border-l-4 border-l-rose-500 hover:border-rose-400 ring-1 ring-rose-500/10"
                          : status.isPastEndTime && isAttSaved
                          ? "bg-white border-amber-300 shadow-md border-l-4 border-l-amber-500 hover:border-amber-400 ring-1 ring-amber-500/10"
                          : "bg-white border-emerald-300 shadow-md border-l-4 border-l-emerald-500 hover:border-emerald-400 ring-1 ring-emerald-500/10"
                        : status.type === "upcoming" && status.diffMinutes <= 60
                        ? "bg-white border-amber-200 shadow-xs border-l-4 border-l-amber-500 hover:border-amber-300 hover:shadow-md"
                        : status.type === "upcoming"
                        ? "bg-white border-slate-200/90 shadow-xs border-l-4 border-l-blue-500 hover:border-blue-300 hover:shadow-md"
                        : "bg-slate-50/70 border-slate-200/60 opacity-75 hover:opacity-100 hover:bg-white hover:shadow-xs border-l-4 border-l-slate-300"
                    }`}
                  >
                    <div>
                      {/* Top header on card */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-primary-600" />
                          {l.isRescheduled && l.originalStartTime ? (
                            <>
                              <span className="line-through text-slate-400">{timeRange(l.originalStartTime, l.originalEndTime)}</span>
                              <span>→ {timeRange(l.startTime, l.endTime)}</span>
                            </>
                          ) : (
                            <>{timeRange(l.startTime, l.endTime)}</>
                          )}
                        </span>

                        {l.isRescheduled && (
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Перенесён</span>
                        )}

                        {/* Status Badge */}
                        <div>
                          {lessonStatus === "cancelled" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200"><X className="w-3 h-3" />{isMovedAway(l.substitutionOutcome) ? "Перенесён" : "Отменён"}</span>
                          ) : lessonStatus === "completed" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200/60 shadow-2xs"><CheckCircle2 className="w-3 h-3 text-slate-400" />Завершён</span>
                          ) : subsequentLesson ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs"><AlertCircle className="w-3 h-3 text-rose-600" />Урок не начат</span>
                          ) : lessonStatus === "in_progress" ? (
                            status.isPastEndTime ? (
                              isAttSaved ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  Завершите урок
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  Отметьте посещаемость
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                Идёт урок
                              </span>
                            )
                          ) : status.type === "live" ? (
                            status.isPastEndTime ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Урок не начат
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs group-hover:from-emerald-700 group-hover:to-teal-700 transition-all">
                                <Play className="w-3 h-3 fill-white" />
                                Начать урок
                              </span>
                            )
                          ) : status.type === "upcoming" ? (
                            status.diffMinutes <= 60 ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Через {formatMinutesUntil(status.diffMinutes)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs">
                                <CalendarIcon className="w-3 h-3 text-blue-600" />
                                В {l.startTime}
                              </span>
                            )
                          ) : null}
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-900 text-base mb-1 group-hover:text-primary-600 transition-colors">
                        {l.groupName}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">{l.subject}</p>
                      <LessonChips marks={occurrenceChips(l, user?.id, { manager: isManager })} requestHref={isManager ? requestHrefFor : undefined} className="mt-1.5" />
                    </div>

                    {/* Bottom row */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        {l.format === "online" ? (
                          <>
                            <Video className="w-4 h-4 text-purple-600" /> Zoom класс
                          </>
                        ) : placeText(l) ? (
                          <>
                            <MapPin className="w-4 h-4 text-slate-400" /> {placeText(l)}
                          </>
                        ) : null}
                      </span>
                      <span className="text-primary-600 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        {lessonStatus === "cancelled"
                          ? (isMovedAway(l.substitutionOutcome) ? "Детали" : "Причина отмены")
                          : subsequentLesson
                          ? "Отменить урок"
                          : lessonStatus === "in_progress" && !isAttSaved
                          ? "Отметить посещаемость"
                          : lessonStatus === "scheduled" && status.type === "live"
                          ? "Начать урок"
                          : "Детали"} <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: WEEK PLAN SUMMARY */}
      {mounted && typeof document !== "undefined" && isWeekPlanOpen &&
        createPortal(
          <AnimatePresence>
            <div
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsWeekPlanOpen(false);
              }}
              className="fixed inset-0 z-[99998] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md sm:p-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 12 }}
                className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ring-1 ring-black/5"
                role="dialog"
                aria-modal="true"
                aria-labelledby="week-plan-title"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 pb-5 pt-6 sm:px-7">
                  <div>
                    <p className="text-xs font-semibold text-violet-600">Расписание</p>
                    <h2 id="week-plan-title" className="mt-1 text-xl font-bold text-slate-900">План недели</h2>
                    <p className="mt-1 text-sm text-slate-500">{weekRangeText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWeekPlanOpen(false)}
                    aria-label="Закрыть план недели"
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-7">
                  <div className="rounded-xl bg-white px-3 py-2.5 text-center ring-1 ring-slate-100">
                    <p className="text-xs font-semibold text-slate-500">По плану</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{weekKpi.planned}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center ring-1 ring-emerald-100">
                    <p className="text-xs font-semibold text-emerald-700">Проведено</p>
                    <p className="mt-1 text-lg font-bold text-emerald-800">{weekKpi.completed}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-center ring-1 ring-slate-200">
                    <p className="text-xs font-semibold text-slate-600">Отменено</p>
                    <p className="mt-1 text-lg font-bold text-slate-700">{weekKpi.cancelled}</p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7">
                  {weekPlanRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
                      <CalendarIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-700">На эту неделю занятий нет</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {weekPlanRows.map((row) => {
                        const statusClass = row.tone === "emerald"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : row.tone === "slate"
                            ? "border-slate-200 bg-slate-100 text-slate-700"
                            : row.tone === "blue"
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : row.tone === "amber"
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-violet-200 bg-violet-50 text-violet-800";
                        return (
                          <button
                            key={`${row.lesson.occurrenceDate}_${row.lesson.id}`}
                            type="button"
                            onClick={() => {
                              setIsWeekPlanOpen(false);
                              openLesson(row.lesson, "week");
                            }}
                            className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                          >
                            <div className="min-w-[116px]">
                              <p className="text-xs font-bold text-slate-800">
                                {capitalizeFirst(formatIsoDateLabel(row.lesson.occurrenceDate, { weekday: "long", day: "numeric", month: "short" }))}
                              </p>
                              <p className={`mt-0.5 text-xs ${row.label === "Перенесён" || row.label === "Отменён" ? "text-slate-400 line-through" : "text-slate-500"}`}>{timeRange(row.lesson.startTime, row.lesson.endTime)}</p>
                            </div>
                            <div className="min-w-0 flex-1 border-l border-slate-100 pl-3">
                              <p className="truncate text-sm font-bold text-slate-900">{row.lesson.groupName}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {[`${row.lesson.classLevel} класс`, placeText(row.lesson)].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <span className={`inline-flex h-8 w-[132px] shrink-0 items-center justify-center rounded-full border px-3 text-xs font-medium ${statusClass}`}>
                              {row.label}
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-right sm:px-7">
                  <button
                    type="button"
                    onClick={() => setIsWeekPlanOpen(false)}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-xs ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
                  >
                    Закрыть
                  </button>
                </div>
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body,
        )}

      {/* MODAL: LESSON DETAILS & ATTENDANCE */}
      {mounted && typeof document !== "undefined" && activeLesson &&
        createPortal(
          <AnimatePresence>
              <div
                onClick={(e) => {
                  if (e.target === e.currentTarget) setActiveLesson(null);
                }}
                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md transition-all"
              >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 ring-1 ring-black/5 max-h-[90vh] overflow-x-hidden overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <span className="text-xs font-semibold text-primary-600">
                    {activeLesson.occurrenceDate.split("-").reverse().join(".")} · {DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name} · {activeLesson.startTime} — {activeLesson.endTime}
                  </span>
                  {activeLesson.isRescheduled && activeLesson.originalStartTime && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      Перенесён: {timeRange(activeLesson.originalStartTime, activeLesson.originalEndTime)} → {timeRange(activeLesson.startTime, activeLesson.endTime)}
                    </p>
                  )}
                  <div className="flex items-center gap-2.5 mt-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                      {activeLesson.groupName}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-violet-50 text-violet-700 border border-violet-200/60">
                      {activeLesson.classLevel} класс
                    </span>
                    {activeTeacherInfo?.isSubstitution && activeTeacherInfo.teacherId === user?.id && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-violet-600 text-white">{substituteGroupLabel(activeLesson.groupName)}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    {activeLesson.format === "online" ? (
                      <>
                        <Video className="w-3.5 h-3.5 text-purple-600" /> Zoom класс
                      </>
                    ) : placeText(activeLesson) ? (
                      <>
                        <MapPin className="w-3.5 h-3.5 text-slate-400" /> {placeText(activeLesson)}
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  onClick={() => setActiveLesson(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Topic Section */}
              {activeLesson.topic && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 mb-5">
                  <p className="text-xs font-semibold text-slate-500">
                    Тема урока
                  </p>
                  <p className="text-sm font-medium text-slate-800 mt-1">
                    {activeLesson.topic}
                  </p>
                </div>
              )}

              {/* LOGIC-B2: the manager sees that a request waits and goes to it */}
              {isManager && activeRequestMark?.status === "pending" && (
                <p role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900">
                  <span>Ждёт замены{activeRequestMark.teacherName ? `: ${activeRequestMark.teacherName}` : ""}</span>
                  <Link href={requestHrefFor(activeRequestMark.id)} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">Открыть запрос</Link>
                </p>
              )}

              {/* LOGIC-B2: «Не смогу провести» / «Вы запросили замену» */}
              {!loadingStudents && (
                <TeacherLessonControls
                  lesson={{
                    groupId: activeLesson.groupId, groupName: activeLesson.groupName, lessonId: activeLesson.id, lessonDate: activeLesson.occurrenceDate,
                    startTime: activeLesson.startTime, endTime: activeLesson.endTime, room: activeLesson.room, format: activeLesson.format, topic: activeLesson.topic,
                  }}
                  mark={activeRequestMark} lessonTeacherId={activeTeacherInfo?.teacherId} isSubstitution={activeTeacherInfo?.isSubstitution} lessonStatus={activeLessonStatus}
                  onChanged={() => { void loadData(); }}
                  onMoved={(text) => { setActiveLesson(null); showToast(text); void reloadAfterWeeklyChange(); }}
                  onDialogChange={(open) => { moveHoldsEscape.current = open; }}
                />
              )}

              {/* Attendance Section */}
              <div className="mb-6">
                {loadingStudents ? (
                  <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                    Загрузка данных урока...
                  </div>
                ) : groupStudents.length === 0 ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    {/* O6: a lesson with nobody on its roster is not started and not finished - «Урока не было» closes it */}
                    <p role="status" className="font-medium">{activeLessonStatus === "in_progress" ? NO_STUDENTS_FINISH_TEXT : NO_STUDENTS_START_TEXT}</p>
                    {activeLessonStatus === "scheduled" && (
                      <button type="button" disabled title={NO_STUDENTS_START_TEXT} className="inline-flex shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500">
                        <Play className="h-3.5 w-3.5" /> Начать урок
                      </button>
                    )}
                  </div>
                ) : !isMarkingAttendance ? (
                  /* STEP 1: Overview & Status Banner */
                  <div className="space-y-4">
                    {activeLessonStatus === "cancelled" ? (
                      <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0"><X className="w-5 h-5" /></div>
                        <div><p className="text-sm font-bold text-slate-900">Урок отменён</p><p className="text-xs text-slate-600 mt-0.5">{activeCancellationReason || "Причина отмены сохранена в журнале."}</p></div>
                      </div>
                    ) : activeLessonStatus === "completed" ? (
                      <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5" /></div>
                        <div><p className="text-sm font-bold text-emerald-900">Урок завершён</p><p className="text-xs text-emerald-700 mt-0.5">Отметки зафиксированы. Корректировка выполняется только через администратора с причиной.</p></div>
                      </div>
                    ) : activeLessonIsFuture ? (
                      /* A future occurrence never shows or exposes saved attendance.
                         The API filters legacy corrupt rows; this branch is an
                         additional UI guard for an already loaded stale response. */
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                            <CalendarIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Запланированное занятие ({DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name})
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Урок запланирован на {DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name?.toLowerCase()} с {activeLesson.startTime} до {activeLesson.endTime}. Начать урок и отметить посещаемость можно будет в день занятия.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled
                          className="px-4 py-2.5 bg-slate-100 text-slate-400 cursor-not-allowed rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 border border-slate-200"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Доступно в {DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.short} в {activeLesson.startTime}
                        </button>
                      </div>
                    ) : isAttendanceDirty ? (
                      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0"><AlertCircle className="w-5 h-5" /></div>
                          <div><p className="text-xs font-bold text-amber-950">Есть несохранённые изменения</p><p className="text-xs text-amber-800 mt-0.5 font-medium">Отмечено: {Object.keys(attendance).length} из {groupStudents.length}. Сохраните отметки, чтобы они появились в журнале.</p></div>
                        </div>
                        <button type="button" onClick={() => setIsMarkingAttendance(true)} className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-200 hover:bg-amber-50 rounded-xl transition-colors shrink-0 shadow-2xs">Продолжить отметку</button>
                      </div>
                    ) : activeLessonStatus === "in_progress" && isAttendanceSaved && Object.keys(attendance).length > 0 ? (
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
                                  ? activeLessonIsToday && activeTimeStatus?.type === "live"
                                    ? "Идёт урок · Посещаемость отмечена"
                                    : "Посещаемость отмечена"
                                  : `Сохранено: ${Object.keys(attendance).length} из ${groupStudents.length}`}
                              </p>
                              {activeLessonIsToday && activeTimeStatus?.type === "live" && (
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
                            ) : activeLessonStatus === "in_progress" ? (
                                <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                            <Play className="w-5 h-5 fill-current" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">Урок начат</p>
                                            <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                                                Заполните и сохраните отметки учеников, затем завершите урок.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsMarkingAttendance(true)}
                                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs whitespace-nowrap"
                                    >
                                        Заполнить посещаемость
                                    </button>
                                </div>
                    ) : activeSubsequentLesson ? (
                      <div className="p-5 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex items-start gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0"><AlertCircle className="w-5 h-5" /></div>
                        <div>
                          <p className="text-sm font-bold text-rose-950">Урок больше нельзя начать</p>
                          <p className="text-xs text-rose-800 mt-0.5">После его планового окончания уже был начат урок «{activeSubsequentLesson.groupName}» ({activeSubsequentLesson.startTime}—{activeSubsequentLesson.endTime}). Чтобы не исказить журнал, отметки за это занятие недоступны — отмените его с причиной.</p>
                        </div>
                      </div>
                    ) : activeLessonIsPast ? (
                      /* A past occurrence which was never started cannot be
                         backfilled as attendance: there is no actual lesson
                         time for later attendance/hour analytics. */
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Урок не был начат
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Запланированное занятие {DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name?.toLowerCase()} с {activeLesson.startTime} до {activeLesson.endTime} не было запущено. Посещаемость задним числом не фиксируется; если занятие не состоялось, отмените его с причиной.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : activeTimeStatus?.type === "upcoming" ? (
                      /* TODAY UPCOMING LESSON: Cannot start yet */
                      <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-950">
                              Урок ещё не начался
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5">
                              Начало в {activeLesson.startTime} (через {formatMinutesUntil(activeTimeStatus.diffMinutes)}). Начать урок и отметить посещаемость можно будет в {activeLesson.startTime}.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled
                          className="px-4 py-2.5 bg-slate-100 text-slate-400 cursor-not-allowed rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 border border-slate-200"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Доступно в {activeLesson.startTime}
                        </button>
                      </div>
                    ) : activeTimeStatus?.isPastEndTime ? (
                      /* The planned end passed while the lesson is still
                         scheduled.  Starting it now records the actual start
                         time; opening attendance directly would violate the
                         lifecycle enforced by the API. */
                      <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-950">
                              Урок не был начат
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5">
                              Занятие было запланировано с {activeLesson.startTime} до {activeLesson.endTime}. Посещаемость пока нельзя сохранить: сначала начните урок. Будет записано фактическое время начала; если занятие не состоялось, отмените его с причиной.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleStartLesson}
                          disabled={savingAttendance}
                          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          Начать урок сейчас
                        </button>
                      </div>
                    ) : (
                      /* TODAY LIVE LESSON: Ready to start */
                      <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Состав группы ({groupStudents.length} {pluralRu(groupStudents.length, ["ученик", "ученика", "учеников"])})
                            </p>
                            <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                              Время урока пришло. Нажмите «Начать урок» и отметьте присутствие учеников.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleStartLesson}
                          className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 shrink-0"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          Начать урок
                        </button>
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

              {isCancellingLesson && activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-rose-900">Отменить урок {activeLesson.occurrenceDate}</p>
                    <p className="text-xs text-rose-700 mt-0.5">Отметки этого экземпляра будут очищены, а причина и прежнее состояние сохранятся в аудите.</p>
                  </div>
                  {lessonExamBinding?.loading && (
                    <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">Проверяем связанный экзамен…</p>
                  )}
                  {!lessonExamBinding?.loading && lessonExamBinding?.attached && lessonExamBinding.canCancel && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 font-medium text-amber-900">Экзамен «{lessonExamBinding.examTitle}» вернётся в черновик, а код доступа будет закрыт.</p>
                  )}
                  {!lessonExamBinding?.loading && lessonExamBinding && !lessonExamBinding.canCancel && (
                    <p className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs leading-5 font-medium text-rose-800">{lessonExamBinding.message || "Отмена недоступна."}</p>
                  )}
                  <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} maxLength={500} rows={3} placeholder="Причина отмены (обязательно)" className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400" />
                  <CancellationKindField canChooseKind={canChooseKind} value={cancellationKind} onChange={setCancellationKind} name="schedule-cancellation-kind" disabled={savingAttendance} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setIsCancellingLesson(false); setCancellationReason(""); setLessonExamBinding(null); }} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white rounded-lg">Не отменять</button>
                    <button type="button" onClick={handleCancelLesson} disabled={savingAttendance || !lessonExamBinding || lessonExamBinding.loading || !lessonExamBinding.canCancel || cancellationReason.trim().length < 3} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg">Подтвердить отмену</button>
                  </div>
                </div>
              )}

              {/* The marking list shows its own copy of the error; every other step shows it here. */}
              {!isMarkingAttendance && <LessonPanelError message={attendanceError} />}

              {/* Actions footer.  While the marks are being entered the list has its own row of buttons (with «Завершить урок»):
                  a second row under it, with a «Закрыть» that repeats the cross, is not shown (ROADMAP #114). */}
              {!isMarkingAttendance && (
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  {canReviseRecurringSchedule ? (
                    <button
                      type="button"
                      onClick={() => openEditModal(activeLesson)}
                      className="inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-primary-50 px-3.5 py-2 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                    >
                      <Edit2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Изменить постоянное расписание</span>
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

                  {(canReviseRecurringSchedule || (activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson)) && (
                    <div className="shrink-0">
                      <button
                        type="button"
                        ref={recurringActionsButtonRef}
                        onClick={() => setIsRecurringActionsOpen((isOpen) => !isOpen)}
                        aria-label="Дополнительные действия с уроком"
                        aria-haspopup="menu"
                        aria-expanded={isRecurringActionsOpen}
                        aria-controls={isRecurringActionsOpen ? "lesson-actions-menu" : undefined}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
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
                      onClick={() => setActiveLesson(null)}
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

      {/* This menu is portalled out of the scrollable lesson dialog.  It can
          therefore open downward without creating horizontal scrollbars or
          being clipped by the modal's own overflow boundary. */}
      <FloatingPanel
        id="lesson-actions-menu"
        open={Boolean(mounted && activeLesson && isRecurringActionsOpen)}
        triggerRef={recurringActionsButtonRef}
        onClose={() => setIsRecurringActionsOpen(false)}
        width={256}
        role="menu"
        label="Дополнительные действия с уроком"
        zIndexClass="z-[100001]"
        className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
      >
            {activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsRecurringActionsOpen(false);
                  openCancelLessonPanel();
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs text-rose-700 transition-colors hover:bg-rose-50"
              >
                <X className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">Отменить этот урок</span>
                  <span className="mt-0.5 block leading-relaxed text-rose-600/80">Только выбранная дата; потребуется причина.</span>
                </span>
              </button>
            )}
            {isManager && activeLesson && canReplaceTeacher(user?.org_role ?? null, activeLessonStatus) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsRecurringActionsOpen(false);
                  setTeacherTarget({
                    groupId: activeLesson.groupId,
                    lessonId: activeLesson.id,
                    lessonDate: activeLesson.occurrenceDate,
                    startTime: activeLesson.startTime,
                    endTime: activeLesson.endTime,
                    info: activeLesson,
                  });
                  // the lesson panel is a layer of its own above the dialogs: it gives way to the dialog
                  setActiveLesson(null);
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50"
              >
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <span>
                  <span className="block font-semibold">{REPLACE_TEACHER_ACTION}</span>
                  <span className="mt-0.5 block leading-relaxed text-slate-500">Только на выбранную дату.</span>
                </span>
              </button>
            )}
            {canReviseRecurringSchedule && activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson && (
              <div className="mx-2 my-1 border-t border-slate-100" />
            )}
            {canReviseRecurringSchedule && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsRecurringActionsOpen(false);
                  if (activeLesson) openEndRecurringModal(activeLesson);
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs text-rose-700 transition-colors hover:bg-rose-50"
              >
                <X className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">Прекратить регулярные занятия</span>
                  <span className="mt-0.5 block leading-relaxed text-rose-600/80">Будущие уроки остановятся с выбранной даты.</span>
                </span>
              </button>
            )}
      </FloatingPanel>

      {/* MODAL: ADD LESSON */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isAddModalOpen && (
              <div
                onClick={(e) => {
                  if (e.target === e.currentTarget) setIsAddModalOpen(false);
                }}
                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md transition-all"
              >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 ring-1 ring-black/5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900">Добавить урок в расписание</h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddLesson} className="space-y-4">
                {/* Conflict warning banner */}
                {addConflict && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800">
                      <span className="font-bold">Внимание, накладка по времени:</span> в этот день уже есть урок группы «{addConflict.groupName}» ({addConflict.startTime} - {addConflict.endTime}).
                    </div>
                  </div>
                )}

                {/* Group select */}
                <div>
                  <label htmlFor="sched-add-gruppa" className="block text-xs font-semibold text-slate-700 mb-1">
                    Группа
                  </label>
                  <Select
                    id="sched-add-gruppa"
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    disabled={savingLesson}
                    options={groups.length === 0
                      ? [{ value: "default-grp", label: "Основная группа (5 класс)" }]
                      : groups.map((g) => ({ value: g.id, label: `${g.name} (${g.class_level || 5} класс)` }))}
                    buttonClassName="px-3 py-2 text-xs"
                  />
                </div>

                <LessonScopeFields
                  idPrefix="sched-add"
                  scope={newLessonScope}
                  onScope={(next) => {
                    setNewLessonScope(next);
                    setScheduleError(null);
                    // a one-off lesson opens on the day chosen first (or today): a date of the open week
                    if (next === "one_off" && newDays.length > 0) setNewLessonDate(businessWeekdayDate(newDays[0], weekOffset));
                  }}
                  days={newDays}
                  onDays={(next) => { setNewDays(next); setScheduleError(null); }}
                  daysInvalid={newLessonScope === "recurring" && newDays.length === 0 && Boolean(scheduleError)}
                  date={newLessonDate}
                  onDate={(next) => setNewLessonDate(next)}
                  dateMax={weekPeriod.end}
                  validFrom={newValidFrom}
                  onValidFrom={(next) => { setNewValidFrom(next); setScheduleError(null); }}
                  disabled={savingLesson}
                />

                <LessonSlotFields
                  idPrefix="sched-add"
                  value={{ startTime: newStartTime, endTime: newEndTime, format: newFormat, room: newRoom, topic: newTopic, color: newColor }}
                  disabled={savingLesson}
                  onChange={(patch) => {
                    if (patch.startTime !== undefined || patch.endTime !== undefined) setTimesEdited(true);
                    if (patch.startTime !== undefined) setNewStartTime(patch.startTime);
                    if (patch.endTime !== undefined) setNewEndTime(patch.endTime);
                    if (patch.format !== undefined) setNewFormat(patch.format);
                    if (patch.room !== undefined) setNewRoom(patch.room);
                    if (patch.topic !== undefined) setNewTopic(patch.topic);
                    if (patch.color !== undefined) setNewColor(patch.color);
                  }}
                />

                {/* Conflict warning / Past time warning */}
                {(addConflict || addPastTimeConflict) && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        {addPastTimeConflict || "Внимание: пересечение по времени!"}
                      </p>
                      {addConflict && !addPastTimeConflict && (
                        <p className="mt-0.5">
                          В это время уже назначен урок группы «{addConflict.groupName}» ({addConflict.startTime} — {addConflict.endTime}).
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {scheduleError && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="whitespace-pre-line">{scheduleError}</span>
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    disabled={savingLesson}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 rounded-xl transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={!!addConflict || !!addPastTimeConflict || savingLesson}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
                  >
                    {savingLesson && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {savingLesson ? "Сохраняем…" : "Сохранить урок"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* Stop / change the weekly lesson: the dialogs shared with the group page of the owner and the administrator */}
      <EndWeeklyLessonDialog
        lesson={endingRecurringLesson}
        aboveLessonPanel
        resolveAt={endingRecurringLesson ? weeklyResolver(endingRecurringLesson.groupId, endingRecurringLesson.id) : undefined}
        onClose={() => setEndingRecurringLesson(null)}
        onEnded={async () => {
          // Recurrences are resolved on the server: reload both canonical schedule reads, never hide a card locally.
          if (await reloadAfterWeeklyChange()) setEndingRecurringLesson(null);
        }}
      />
      <EditWeeklyLessonDialog
        lesson={editingLesson}
        aboveLessonPanel
        siblings={lessons}
        resolveAt={editingLesson ? weeklyResolver(editingLesson.groupId, editingLesson.id) : undefined}
        onProgress={() => void reloadAfterWeeklyChange()}
        onClose={() => setEditingLesson(null)}
        onSaved={async (notices) => {
          setScheduleNotices(notices);
          // A recurring change has an effective date: reload the server-resolved data instead of rewriting the old template.
          await reloadAfterWeeklyChange();
          setEditingLesson(null);
        }}
      />

      {/* LOGIC-B: two editors saved the same lesson (O7) / a running exam at the finish (O8) / the teacher of a lesson (O5): over the lesson panel */}
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
      <LessonTeacherDialog
        target={teacherTarget}
        onClose={() => setTeacherTarget(null)}
        onChanged={() => { setTeacherTarget(null); setActiveLesson(null); void loadData(); }}
      />
      {toastNode}
    </div>
  );
}
