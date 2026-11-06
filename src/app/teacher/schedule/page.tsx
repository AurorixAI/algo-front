"use client";

import { Select } from "@/components/ui/select";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { lessonFromAttendanceAction, useTeacherLessonPanel } from "@/lib/use-teacher-lesson-panel";
import { TeacherLessonPanelView } from "@/components/teacher/lesson-panel";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { pollFailure } from "@/lib/staff-busy";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { scheduleDateParam, weekOffsetForDate } from "@/lib/teacher-schedule-link";
import { attendanceMapsOfToday, groupIdsOfLessons } from "@/lib/schedule-attendance";
import { browserVisiblePollEnv, startVisiblePolling } from "@/lib/visible-polling";
import { examsApi, orgApi, type OpenAttendanceAction, type GroupInfo, type LessonAttendanceStatus, type LessonEvent, type LiveExamDashboardSummary, type ScheduleOccurrence } from "@/lib/api";
import { isMovedAway, movedAwayChip, outOfPlan, placeText, timeRange, weekPlan, weekPlanDescription } from "@/lib/schedule-plan";
import { businessDateWithOffset, businessDayOfWeek, businessTimeMinutes, businessWeekdayDate, capitalizeFirst, formatBusinessDate, isoDateDayOfWeek, formatBusinessDateLabel, formatIsoDateLabel, formatMinutesUntil } from "@/lib/business-time";
import Link from "next/link";
import { Calendar as CalendarIcon, Clock, Plus, MapPin, Video, ChevronLeft, ChevronRight, ChevronDown, Check, Sparkles, ArrowRight, X, CheckCircle2, AlertCircle, Play, CheckCheck, Radio, Loader2 } from "lucide-react";
import { pluralRu } from "@/lib/payments";
import { DAYS, classCountLabel, completedLessonsProgressLabel, getLessonTimeStatus } from "@/lib/schedule-time";
import { useScrollLock } from "@/components/ui/modal";
import {
  validFromBadge, validFromError,
} from "@/lib/schedule-slots";
import { refusalText } from "@/lib/weekly-lessons";
import { NO_ONE_OFF_RIGHT_TEXT, choiceProblem, emptyChoice, groupsBaseOf, oneOffRoleOf, type OneOffChoice } from "@/lib/one-off";
import { OneOffPurposeFields, candidatesOf, useMakeupCandidates } from "@/components/schedule/one-off-purpose";
import { occurrenceChips } from "@/lib/substitutions";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { DayHeading } from "@/components/schedule/day-heading";
import { useToast } from "@/components/ui/toast";
import { LessonScopeFields, LessonSlotFields, ShiftedDayNote } from "@/components/schedule/lesson-slot-fields";
import { createOneOff, createWeeklyLessons, weeklyResolver } from "@/lib/weekly-lessons";
import { EditWeeklyLessonDialog, EndWeeklyLessonDialog } from "@/components/schedule/weekly-lesson-dialogs";
import { COLOR_CLASSES, nextBusinessDate, DAY_REQUIRED_TEXT, canVaryTimes, dayShort, dayTimeProblem, dayTimesOf, overlappingLesson, pastDayPlan, reconcileDayTimes, suggestedTimes, weeklyResultText, type DayTimes } from "@/lib/lesson-slot-form";

type LessonOccurrence = ScheduleOccurrence;

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
  const [viewMode, setViewMode] = useState<"today" | "week">("today");
  const [weekOffset, setWeekOffset] = useState(0);
  // `?date=` (the card of a group he substitutes in): open the week of that lesson
  useEffect(() => {
    const date = scheduleDateParam(window.location.search);
    if (!date || date === businessDateWithOffset(0)) return;
    setViewMode("week");
    setWeekOffset(weekOffsetForDate(date, businessDateWithOffset(0)));
  }, []);
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

  // Which tab the open lesson came from: only a card of the week changes the series of the lesson
  const [activeLessonView, setActiveLessonView] = useState<"today" | "week">("today");
  /** The server's tasks (a past lesson that was never started is `missed`): what «Разобрать пропущенный урок» is offered for. */
  const [openAttendanceActions, setOpenAttendanceActions] = useState<OpenAttendanceAction[]>([]);
  /** false: the list could not be read - the panel of a past lesson says so instead of «отмените» (it proves nothing that the lesson is not in the list). */
  const [openActionsKnown, setOpenActionsKnown] = useState(true);
  const [businessDate, setBusinessDate] = useState(() => formatBusinessDate());
  const [clockTick, setClockTick] = useState(0);

  // The panel of the open lesson - one hook and one picture for the dashboard and the schedule (WE-E); the screen keeps only what follows a write
  const lessonPanel = useTeacherLessonPanel<LessonOccurrence>({
    businessDate,
    groups,
    user,
    todayLessons: todayOccurrences,
    statusOfToday: (lesson) => lessonStatusMap[lesson.id] || (completedLessonsMap[lesson.id] ? "completed" : "scheduled"),
    hasSavedMarks: (lessonId) => Boolean(lessonAttendanceMap[lessonId]),
    openActions: openAttendanceActions,
    setOpenActions: setOpenAttendanceActions,
    openActionsKnown,
    retryOpenActions: () => {
      void orgApi.getOpenAttendanceActions().then((list) => { setOpenAttendanceActions(list); setOpenActionsKnown(true); }).catch(() => setOpenActionsKnown(false));
    },
    lessonFromAction: lessonFromAttendanceAction,
    // «Открыть урок <дата>» of a lesson moved away: the week of the new lesson comes into view and its panel opens in the week mode (owner decision 04.11)
    openMoved: (lesson) => {
      const date = lesson.occurrenceDate || businessDate;
      if (!(viewMode === "today" && date === businessDate)) {
        setViewMode("week");
        setWeekOffset(weekOffsetForDate(date, businessDateWithOffset(0)));
      }
      openLesson(lesson, viewMode === "today" && date === businessDate ? "today" : "week");
    },
    onWritten: (event) => {
      const { lesson } = event;
      const isToday = event.date === businessDate;
      const weekKey = `${event.date}_${lesson.id}`;
      if (event.kind === "loaded") {
        if (event.snapshot.isToday) setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: event.snapshot.status }));
        if (event.snapshot.isSaved && event.snapshot.isToday) setLessonAttendanceMap((previous) => ({ ...previous, [lesson.id]: true }));
      } else if (event.kind === "started") {
        setWeekLessonStatusMap((previous) => ({ ...previous, [weekKey]: "in_progress" }));
        if (isToday) setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "in_progress" }));
      } else if (event.kind === "saved") {
        setWeekLessonStatusMap((previous) => ({ ...previous, [weekKey]: "in_progress" }));
        if (isToday) {
          setLessonAttendanceMap((previous) => ({ ...previous, [lesson.id]: true }));
          setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "in_progress" }));
        }
      } else if (event.kind === "finished") {
        // O8: the exam service could not be asked - the lesson is closed anyway; say so
        if (event.syncNotice) setScheduleNotices([event.syncNotice]);
        setWeekLessonStatusMap((previous) => ({ ...previous, [weekKey]: "completed" }));
        if (isToday) {
          setCompletedLessonsMap((previous) => ({ ...previous, [lesson.id]: true }));
          setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "completed" }));
        }
      } else {
        setWeekLessonStatusMap((previous) => ({ ...previous, [weekKey]: "cancelled" }));
        if (isToday) {
          setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "cancelled" }));
          setLessonAttendanceMap((previous) => ({ ...previous, [lesson.id]: false }));
          setCompletedLessonsMap((previous) => ({ ...previous, [lesson.id]: false }));
        }
        if (event.notes.length > 0) setScheduleNotices(event.notes);   // the notes of the server (an exam went back to a draft ...): the list of the page, as before
      }
    },
    // the refusal stays in the list of the page (the list lies under the open panel: it does not go away by itself) and a toast with the reason shows it above the panel
    notifyRefusal: (notice, reason) => {
      setScheduleNotices((previous) => (previous.includes(notice) ? previous : [...previous, notice]));
      showToast(notice, "error", [reason]);
    },
    onMissedCancelled: (notes) => {
      if (notes.length > 0) setScheduleNotices(notes);
      void reloadAfterWeeklyChange();
    },
  });
  const { activeLesson, setActiveLesson, consumeEscape, requestClose } = lessonPanel;
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
    // Only a tab that is looked at asks (a forgotten background tab asked the heavy live-summary every 15 s); the tab coming back asks at once.
    const stopPolling = startVisiblePolling(() => { void refresh(); }, 15_000, browserVisiblePollEnv());
    return () => { cancelled = true; stopPolling(); };
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
  /** «Разное время по дням»: the time of each chosen day; null = one time for all days. */
  const [newDayTimes, setNewDayTimes] = useState<DayTimes | null>(null);
  const [newRoom, setNewRoom] = useState("");
  /** O1: the date a new recurring slot starts acting («Действует с»); the journal has no lessons before it. */
  const [newValidFrom, setNewValidFrom] = useState(formatBusinessDate());
  const [newFormat, setNewFormat] = useState<"offline" | "online">("offline");
  const [newTopic, setNewTopic] = useState("");
  const [newColor, setNewColor] = useState<"blue" | "indigo" | "purple" | "emerald" | "amber" | "rose">("blue");
  /** #154: what a one-off lesson is for (a make-up of a cancelled lesson / an additional one) and the money of the teacher. */
  const oneOffRole = oneOffRoleOf(user);
  const [newChoice, setNewChoice] = useState<OneOffChoice>(() => emptyChoice(oneOffRole));
  const newMakeup = useMakeupCandidates(newGroupId || null, isAddModalOpen && newLessonScope === "one_off" && oneOffRole !== null);
  const [addTouched, setAddTouched] = useState(false);

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
      const todayStr = businessDate;
      // Treat the schedule snapshot as an atomic read. If one authoritative
      // source fails, do not mix a fresh group list with stale lessons, or
      // substitute a failed source with an empty one.
      const [fetchedGroups, loadedLessons, loadedTodayOccurrences, openActions] = await Promise.all([
        orgApi.listGroups({ teacher_id: user.id }),
        orgApi.getSchedule(user.id),
        orgApi.getScheduleOccurrences(
          { dateFrom: todayStr, dateTo: todayStr },
          user.id,
        ),
        // the tasks of the server («Разобрать пропущенный урок»): not a reason to hide the schedule when they cannot be read - the panel then says «отмените с причиной»
        orgApi.getOpenAttendanceActions().catch(() => null),
      ]);

      // Attendance is always tied to the concrete occurrence (date + lesson).
      // A failed attendance journal must not make an in-progress lesson look
      // like an untouched one. Finish every read before committing the
      // snapshot to screen state.
      // One request per GROUP (its journal of today holds all of its lessons), not one per lesson (WC-C, F-A13).
      const journalByGroup = new Map<string, Awaited<ReturnType<typeof orgApi.getGroupAttendance>>>();
      await Promise.all(
        groupIdsOfLessons(loadedTodayOccurrences).map(async (groupId) => {
          journalByGroup.set(groupId, await orgApi.getGroupAttendance(groupId, { dateFrom: todayStr, dateTo: todayStr }));
        })
      );
      const { attMap, compMap, statusMap } = attendanceMapsOfToday(loadedTodayOccurrences, todayStr, (groupId) => journalByGroup.get(groupId));

      setGroups(fetchedGroups);
      setOpenActionsKnown(Boolean(openActions));
      if (openActions) setOpenAttendanceActions(openActions);
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
    lessonPanel.setIsLessonMenuOpen(false);
  }, [businessDate]);

  useEffect(() => {
    lessonPanel.setIsLessonMenuOpen(false);
  }, [activeLesson]);

  // ─── Background scroll lock while any dialog is open (shared hook: counts stacked layers, keeps the page width) ───
  useScrollLock(isAddModalOpen || isWeekPlanOpen);   // the lesson panel locks the page itself

  // ─── Close Modal on Escape Key ───
  // The dialogs of «Изменить / Прекратить» (shared `Modal`) close themselves on Escape from ONE document listener and React may commit that
  // closing before this window listener runs: the state would then already say «no dialog» and the panel would close with the same key.
  // So the question «is a dialog above the panel?» is asked in the capture phase, before any of them has reacted.
  const weeklyDialogOpenRef = useRef(false);
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
        // the dialogs of «Изменить / Прекратить» are above the panel and close themselves (the topmost one only): the panel stays
        if (escapeBelongsToDialogRef.current) return;
        // a conflict of marks / a running exam / the move dialog is above the panel and keeps the key; the «⋯» menu closes first
        if (consumeEscape()) return;
        if (isAddModalOpen) setIsAddModalOpen(false);
        if (isWeekPlanOpen) {
          setIsWeekPlanOpen(false);
          return;
        }
        if (activeLesson) void requestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddModalOpen, isWeekPlanOpen, activeLesson, consumeEscape, requestClose]);

  // Current real day of week: 1=Mon .. 7=Sun
  const todayDayOfWeek = businessDayOfWeek();

  // The time of each chosen weekday: one for all days, or - «Разное время по дням» - its own; a one-off lesson has one.
  const addByDay = canVaryTimes(newLessonScope, newDays) && newDayTimes !== null;
  const addTimes = useMemo(
    () => newLessonScope === "recurring"
      ? dayTimesOf(newDays, { startTime: newStartTime, endTime: newEndTime }, addByDay ? newDayTimes : null)
      : [{ day: 0, startTime: newStartTime, endTime: newEndTime }],
    [addByDay, newDayTimes, newDays, newEndTime, newLessonScope, newStartTime],
  );
  // a day that ends before it starts (the same words as the owner's form)
  const addTimeProblems = useMemo(
    () => (addTimes.length ? addTimes : [{ day: 0, startTime: newStartTime, endTime: newEndTime }])
      .map((time) => ({ day: time.day, text: dayTimeProblem(time.day, time, addByDay) }))
      .filter((item): item is { day: number; text: string } => item.text !== null),
    [addByDay, addTimes, newEndTime, newStartTime],
  );

  // Add conflict check (overlapping lessons): every chosen weekday with the time of that day
  const addConflict = useMemo(() => {
    if (newLessonScope === "one_off") {
      return weekOccurrences.find((lesson) =>
        lesson.occurrenceDate === newLessonDate
        && newStartTime < lesson.endTime
        && newEndTime > lesson.startTime,
      );
    }
    return addTimes.map((time) => overlappingLesson(lessons, time.day, time.startTime, time.endTime)).find(Boolean);
  }, [addTimes, lessons, newEndTime, newLessonDate, newLessonScope, newStartTime, weekOccurrences]);

  // Today's start has gone: the same rule as the owner's dialog (pastDayPlan) - a weekly lesson of today's weekday starts a week later (named,
  // nothing is blocked); a one-off lesson of today is blocked
  const addPastPlan = useMemo(() => pastDayPlan({
    scope: newLessonScope === "one_off" ? "one_off" : "recurring", times: addTimes, validFrom: newValidFrom, date: newLessonDate,
    today: formatBusinessDate(), todayDay: todayDayOfWeek, nowMinutes: businessTimeMinutes(),
  }), [addTimes, newLessonDate, newLessonScope, newValidFrom, todayDayOfWeek]);
  const addTimeProblem = addTimeProblems[0]?.text ?? null;
  const addPastTimeConflict = addTimeProblem ?? addPastPlan.pastOneOff;
  const addShifted = addPastTimeConflict ? null : addPastPlan.shifted;

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
    setActiveLessonView(view);
    lessonPanel.openLesson(lesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleDataUnavailable]);

  // Week mode never rewrites the displayed occurrence. It opens a versioned
  // recurring change whose effect starts on a future date selected by teacher.
  // A substitute holds this one lesson: the recurring schedule of the group is not his to change.
  const canReviseRecurringSchedule = Boolean(
    activeLesson && activeLessonView === "week" && !activeLesson.isOneOff
      && !(lessonPanel.activeTeacherInfo?.isSubstitution && lessonPanel.activeTeacherInfo.teacherId === user?.id),
  );

  // The chosen days changed: with fewer than two days the times are one again (what was typed for the single day is kept).
  const applyAddDays = (next: number[]) => {
    const kept = reconcileDayTimes(next, newDayTimes, { startTime: newStartTime, endTime: newEndTime });
    setNewDays(next);
    setNewDayTimes(kept.perDay);
    if (kept.perDay === null && newDayTimes !== null) { setNewStartTime(kept.shared.startTime); setNewEndTime(kept.shared.endTime); }
  };

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
    if (newLessonScope === "one_off") {
      setAddTouched(true);
      const problem = choiceProblem(newChoice, oneOffRole, candidatesOf(newMakeup.state));
      if (problem) {
        setScheduleError(problem);
        return;
      }
    }
    const groupId = newGroupId || (groups[0]?.id ?? "custom-group");
    const draft = { startTime: newStartTime, endTime: newEndTime, format: newFormat, room: newRoom, topic: newTopic, color: newColor };

    try {
      setSavingLesson(true);
      setScheduleError(null);
      setScheduleNotices([]);
      // A one-off is one request; a weekly lesson is one request per chosen weekday, and the answer names the days that were refused.
      let notices: string[] = [];
      let failed: Array<{ day: number; reason: string; detail: string }> = [];
      let added: number[] = [];
      if (newLessonScope === "one_off") {
        notices = await createOneOff(groupId, newLessonDate, draft, newChoice);
      } else {
        const result = await createWeeklyLessons(groupId, addPastPlan.slots, draft);
        notices = result.notices;
        failed = result.failed;
        added = result.added;
        if (failed.length > 0) {
          setScheduleError([weeklyResultText(added, failed), ...failed.map((item) => `${dayShort(item.day)}: ${item.detail}`)].join("\n"));
          applyAddDays(failed.map((item) => item.day));
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
      try {
        const refreshedWeek = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          user?.id,
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
      setScheduleError(refusalText(err, "Не удалось создать урок. Расписание не изменено — повторите попытку.", newLessonScope === "one_off" ? "one_off" : "weekly"));
    } finally {
      setSavingLesson(false);
    }
  };

  // Open Add Modal with smart non-conflicting time calculation
  const openAddModal = (targetDay?: number) => {
    const day = targetDay !== undefined ? targetDay : (todayDayOfWeek || 1);
    setNewDays(targetDay !== undefined ? [targetDay] : []);
    setNewDayTimes(null);
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
    setNewChoice(emptyChoice(oneOffRole));
    setAddTouched(false);
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
    try {
      const refreshedWeek = await orgApi.getScheduleOccurrences(
        { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
        user?.id,
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
    let isCurrent = true;

    async function loadWeekSummary() {
      setWeekLoadError(null);
      try {
        const occurrences = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          currentUserId,
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
          className="flex min-h-10 items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm shadow-primary-600/25 transition-all self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-55"
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
              <span className="text-xs font-medium text-slate-400 ml-1.5">{pluralRu(weekKpi.planned, "урок", "урока", "уроков")}</span>
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
              <span className="text-xs font-medium text-slate-400 ml-1.5">{pluralRu(todayKpi.planned, "урок", "урока", "уроков")}</span>
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
            className={`flex-1 sm:flex-initial flex min-h-10 sm:min-h-0 items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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
            className={`flex-1 sm:flex-initial flex min-h-10 sm:min-h-0 items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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
              className={`inline-flex min-h-10 items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
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
                        // moved away / cancelled: a muted card (the time struck through, one chip, not in the plan) that opens the SAME panel as the card of the day list
                        // (owner decision 04.11: it was «nothing to press» since 22.10, S06)
                        return (
                          <div
                            key={l.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`${l.groupName}, ${timeRange(l.startTime, l.endTime)}: ${off === "moved" ? movedAwayChip(l.substitutionOutcome?.movedTo) : "Отменён"}. Подробности`}
                            onClick={() => openLesson(l, "week")}
                            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openLesson(l, "week"); } }}
                            data-testid="week-card-muted"
                            data-out={off}
                            className="cursor-pointer rounded-xl border border-slate-200 border-l-4 border-l-slate-300 bg-slate-50 p-2.5 text-left opacity-75 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary-500"
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
                          <LessonChips marks={occurrenceChips(l, user?.id, { groupsBase: groupsBaseOf(user?.org_role) })} className="ml-1" />

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
                const subsequentLesson = lessonStatus === "scheduled" ? lessonPanel.getSubsequentStartedLesson(l) : null;
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
                      <LessonChips marks={occurrenceChips(l, user?.id, { groupsBase: groupsBaseOf(user?.org_role) })} className="mt-1.5" />
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

      <TeacherLessonPanelView
        panel={lessonPanel}
        user={user}
        onChanged={() => { void loadData(); }}
        onMoved={(text, notes) => { showToast(text, notes?.length ? "warning" : "success", notes); void reloadAfterWeeklyChange(); }}
        recurring={canReviseRecurringSchedule ? {
          canRevise: true,
          onEdit: () => { if (activeLesson) void openEditModal(activeLesson); },
          onEnd: () => { if (activeLesson) void openEndRecurringModal(activeLesson); },
        } : undefined}
      />

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
                  onDays={(next) => { applyAddDays(next); setScheduleError(null); }}
                  daysInvalid={newLessonScope === "recurring" && newDays.length === 0 && Boolean(scheduleError)}
                  date={newLessonDate}
                  onDate={(next) => setNewLessonDate(next)}
                  dateMax={weekPeriod.end}
                  validFrom={newValidFrom}
                  onValidFrom={(next) => { setNewValidFrom(next); setScheduleError(null); }}
                  disabled={savingLesson}
                  afterOneOffKind={oneOffRole === null ? (
                    <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{NO_ONE_OFF_RIGHT_TEXT}</p>
                  ) : (
                    <OneOffPurposeFields
                      idPrefix="sched-add"
                      role={oneOffRole}
                      choice={newChoice}
                      onChoice={(next) => { setNewChoice(next); setScheduleError(null); }}
                      makeup={newMakeup.state}
                      onReload={newMakeup.reload}
                      onPickCandidate={(candidate) => { setTimesEdited(true); setNewStartTime(candidate.startTime); setNewEndTime(candidate.endTime); }}
                      disabled={savingLesson}
                      invalid={addTouched && Boolean(choiceProblem(newChoice, oneOffRole, candidatesOf(newMakeup.state)))}
                    />
                  )}
                />

                <LessonSlotFields
                  idPrefix="sched-add"
                  value={{ startTime: newStartTime, endTime: newEndTime, format: newFormat, room: newRoom, topic: newTopic, color: newColor }}
                  disabled={savingLesson}
                  endInvalid={addTimeProblem !== null}
                  perDay={newLessonScope === "recurring" ? {
                    days: newDays,
                    times: newDayTimes,
                    onTimes: (times) => { setNewDayTimes(times); setScheduleError(null); },
                    invalidDays: addTimeProblems.map((item) => item.day),
                  } : undefined}
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

                {addShifted && <ShiftedDayNote shifted={addShifted} />}
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
                          {addByDay ? `${dayShort(addConflict.dayOfWeek)}: в` : "В"} это время уже назначен урок группы «{addConflict.groupName}» ({addConflict.startTime} — {addConflict.endTime}).
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
        onEnded={async (notes) => {
          // Recurrences are resolved on the server: reload both canonical schedule reads, never hide a card locally.
          if (notes.length > 0) setScheduleNotices(notes);
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

      {toastNode}
    </div>
  );
}
