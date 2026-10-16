"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { formatAttendanceSummary } from "@/lib/attendance-summary";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { examsApi, orgApi, type AttendanceStatus, type GroupInfo, type StudentInGroup, type LessonAttendanceStatus, type LessonEvent, type LiveExamDashboardSummary, type RecurringLessonEndImpact, type ScheduleOccurrence } from "@/lib/api";
import { businessDayOfWeek, businessTimeMinutes, businessWeekdayDate, capitalizeFirst, formatBusinessDate, formatBusinessDateLabel, formatIsoDateLabel, formatMinutesUntil } from "@/lib/business-time";
import Link from "next/link";
import { ExcuseReasonField } from "@/components/attendance/excuse-reason-field";
import { collectExcuseReasons, firstMissingExcuseReason } from "@/lib/attendance-excuses";
import { LessonPanelError } from "@/components/attendance/lesson-panel-error";
import { canFinishLessonNow, clockMinutes, serverErrorMessage } from "@/lib/lesson-actions";
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
  ArrowLeft,
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
} from "lucide-react";
import { pluralRu } from "@/lib/payments";

const COLOR_CLASSES = {
  blue: {
    bg: "bg-blue-50/90 hover:bg-blue-100/90 border-blue-200/80 text-blue-900",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    border: "border-l-blue-500",
  },
  indigo: {
    bg: "bg-indigo-50/90 hover:bg-indigo-100/90 border-indigo-200/80 text-indigo-900",
    badge: "bg-indigo-100 text-indigo-700",
    dot: "bg-indigo-500",
    border: "border-l-indigo-500",
  },
  purple: {
    bg: "bg-purple-50/90 hover:bg-purple-100/90 border-purple-200/80 text-purple-900",
    badge: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
    border: "border-l-purple-500",
  },
  emerald: {
    bg: "bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-200/80 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    border: "border-l-emerald-500",
  },
  amber: {
    bg: "bg-amber-50/90 hover:bg-amber-100/90 border-amber-200/80 text-amber-900",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    border: "border-l-amber-500",
  },
  rose: {
    bg: "bg-rose-50/90 hover:bg-rose-100/90 border-rose-200/80 text-rose-900",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
    border: "border-l-rose-500",
  },
};

const DAYS = [
  { id: 1, name: "Понедельник", short: "Пн" },
  { id: 2, name: "Вторник", short: "Вт" },
  { id: 3, name: "Среда", short: "Ср" },
  { id: 4, name: "Четверг", short: "Чт" },
  { id: 5, name: "Пятница", short: "Пт" },
  { id: 6, name: "Суббота", short: "Сб" },
  { id: 7, name: "Воскресенье", short: "Вс" },
];

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

type ScheduleEditSnapshot = {
  day: number;
  startTime: string;
  endTime: string;
  room: string;
  format: "offline" | "online";
  topic: string;
  color: "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose";
};

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

/** First calendar date on which a regular schedule change may take effect. */
function nextBusinessDate(): string {
  const todayDay = businessDayOfWeek();
  return businessWeekdayDate(todayDay === 7 ? 1 : todayDay + 1, todayDay === 7 ? 1 : 0);
}

export default function TeacherSchedulePage() {
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [lessons, setLessons] = useState<LessonEvent[]>([]);
  const [todayOccurrences, setTodayOccurrences] = useState<LessonOccurrence[]>([]);
  const [weekOccurrences, setWeekOccurrences] = useState<LessonOccurrence[]>([]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");
  const [isGroupFilterOpen, setIsGroupFilterOpen] = useState(false);
  const groupFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const [isRecurringActionsOpen, setIsRecurringActionsOpen] = useState(false);
  const recurringActionsButtonRef = useRef<HTMLButtonElement>(null);
  const [viewMode, setViewMode] = useState<"today" | "week">("today");
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessonAttendanceMap, setLessonAttendanceMap] = useState<Record<string, boolean>>({});
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<string, boolean>>({});
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [weekLessonStatusMap, setWeekLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [scheduleError, setScheduleError] = useState<string | null>(null);
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
  // Reasons for "Ув." typed in this dialog, and excuses the server already holds for the lesson.
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
  const [lessonExamBinding, setLessonExamBinding] = useState<{
    loading: boolean;
    attached: boolean;
    canCancel: boolean;
    examTitle?: string;
    message?: string | null;
  } | null>(null);
  const [isReschedulingLesson, setIsReschedulingLesson] = useState(false);
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("");
  const [rescheduleRoom, setRescheduleRoom] = useState("");
  const [rescheduleFormat, setRescheduleFormat] = useState<"offline" | "online">("offline");
  const [rescheduleTopic, setRescheduleTopic] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
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
    const refresh = async (isManualRetry = false) => {
      if (isManualRetry) setIsLiveExamRefreshing(true);
      try {
        const items = await examsApi.getLiveDashboardSummary();
        if (!cancelled) {
          setLiveExams(Array.isArray(items) ? items : []);
          setLiveExamError(null);
        }
      } catch (error) {
        // Keep the last verified exam state visible rather than claiming that
        // no examination is running while the operational API is offline.
        if (!cancelled) setLiveExamError(getDataLoadErrorMessage(error));
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
  const [newDay, setNewDay] = useState(1);
  const [newStartTime, setNewStartTime] = useState("10:00");
  const [newEndTime, setNewEndTime] = useState("11:30");
  const [newRoom, setNewRoom] = useState("Кабинет 204");
  const [newFormat, setNewFormat] = useState<"offline" | "online">("offline");
  const [newTopic, setNewTopic] = useState("");
  const [newColor, setNewColor] = useState<"blue" | "indigo" | "purple" | "emerald" | "amber" | "rose">("blue");

  // Edit lesson modal
  const [editingLesson, setEditingLesson] = useState<LessonEvent | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDay, setEditDay] = useState(1);
  const [editStartTime, setEditStartTime] = useState("10:00");
  const [editEndTime, setEditEndTime] = useState("11:30");
  const [editRoom, setEditRoom] = useState("Кабинет 204");
  const [editFormat, setEditFormat] = useState<"offline" | "online">("offline");
  const [editTopic, setEditTopic] = useState("");
  const [editColor, setEditColor] = useState<"blue" | "indigo" | "purple" | "emerald" | "amber" | "rose">("blue");
  const [editEffectiveFrom, setEditEffectiveFrom] = useState("");
  const [editReason, setEditReason] = useState("");
  // Keep a normalised, immutable form snapshot. Schedule occurrences come from
  // a server resolver and must not be used as a live form baseline.
  const [editSnapshot, setEditSnapshot] = useState<ScheduleEditSnapshot | null>(null);

  // Stopping a recurrence is intentionally independent from editing its
  // fields. It has a separate preflight because future exam deliveries may
  // need an explicit return to draft before the schedule can stop.
  const [isEndRecurringModalOpen, setIsEndRecurringModalOpen] = useState(false);
  const [endingRecurringLesson, setEndingRecurringLesson] = useState<LessonOccurrence | null>(null);
  const [endRecurringEffectiveFrom, setEndRecurringEffectiveFrom] = useState("");
  const [endRecurringReason, setEndRecurringReason] = useState("");
  const [endRecurringImpact, setEndRecurringImpact] = useState<RecurringLessonEndImpact | null>(null);
  const [isLoadingEndRecurringImpact, setIsLoadingEndRecurringImpact] = useState(false);
  const [isEndingRecurring, setIsEndingRecurring] = useState(false);
  const [releaseAffectedExams, setReleaseAffectedExams] = useState(false);
  const [endRecurringError, setEndRecurringError] = useState<string | null>(null);

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

  // ─── Background Scroll Lock When Any Modal Is Open ───
  useEffect(() => {
    const isAnyModalOpen = isAddModalOpen || isEditModalOpen || isEndRecurringModalOpen || isWeekPlanOpen || !!activeLesson;
    if (isAnyModalOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isAddModalOpen, isEditModalOpen, isEndRecurringModalOpen, isWeekPlanOpen, activeLesson]);

  // ─── Close Modal on Escape Key ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isRecurringActionsOpen) {
          setIsRecurringActionsOpen(false);
          return;
        }
        if (isAddModalOpen) setIsAddModalOpen(false);
        if (isEditModalOpen) setIsEditModalOpen(false);
        if (isEndRecurringModalOpen) {
          closeEndRecurringModal();
          return;
        }
        if (isWeekPlanOpen) {
          setIsWeekPlanOpen(false);
          return;
        }
        if (activeLesson) setActiveLesson(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddModalOpen, isEditModalOpen, isEndRecurringModalOpen, isWeekPlanOpen, activeLesson, isRecurringActionsOpen]);

  // Conflict detection helper
  const getConflictingLesson = useCallback(
    (dayOfWeek: number, startTime: string, endTime: string, excludeId?: string) => {
      return lessons.find((l) => {
        if (excludeId && l.id === excludeId) return false;
        if (l.dayOfWeek !== dayOfWeek) return false;
        return startTime < l.endTime && endTime > l.startTime;
      });
    },
    [lessons],
  );

  // Add conflict check (overlapping lessons)
  const addConflict = useMemo(() => {
    if (newLessonScope === "one_off") {
      return weekOccurrences.find((lesson) =>
        lesson.occurrenceDate === newLessonDate
        && newStartTime < lesson.endTime
        && newEndTime > lesson.startTime,
      );
    }
    return getConflictingLesson(newDay, newStartTime, newEndTime);
  }, [getConflictingLesson, newDay, newEndTime, newLessonDate, newLessonScope, newStartTime, weekOccurrences]);

  // Edit conflict check (overlapping lessons)
  const editConflict = useMemo(() => {
    if (!editingLesson) return null;
    return getConflictingLesson(editDay, editStartTime, editEndTime, editingLesson.id);
  }, [getConflictingLesson, editDay, editStartTime, editEndTime, editingLesson]);

  // The backend rightly rejects a versioned update without any actual
  // difference. Compare the draft with the normalised snapshot created when
  // the dialog opens, rather than with a server-resolved occurrence object.
  // Every editable parameter (including colour) is therefore a valid change.
  const hasEditChanges = Boolean(editSnapshot && (
    Number(editDay) !== editSnapshot.day
    || editStartTime !== editSnapshot.startTime
    || editEndTime !== editSnapshot.endTime
    || editRoom.trim() !== editSnapshot.room.trim()
    || editFormat !== editSnapshot.format
    || editColor !== editSnapshot.color
    || editTopic.trim() !== editSnapshot.topic.trim()
  ));

  // A short free-text reason is useful when a teacher has additional context,
  // but it must never prevent a valid timetable change.  The API still
  // receives an auditable reason even when the teacher leaves the field blank.
  const automaticEditReason = useMemo(() => {
    if (!editSnapshot) return "Изменено постоянное расписание";

    const changedFields: string[] = [];
    if (Number(editDay) !== editSnapshot.day) changedFields.push("день недели");
    if (editStartTime !== editSnapshot.startTime || editEndTime !== editSnapshot.endTime) {
      changedFields.push("время занятия");
    }
    if (editRoom.trim() !== editSnapshot.room.trim()) changedFields.push("аудиторию");
    if (editFormat !== editSnapshot.format) changedFields.push("формат проведения");
    if (editTopic.trim() !== editSnapshot.topic.trim()) changedFields.push("тему занятия");
    if (editColor !== editSnapshot.color) changedFields.push("цветовую метку");

    return changedFields.length > 0
      ? `Изменены: ${changedFields.join(", ")}`
      : "Изменено постоянное расписание";
  }, [editColor, editDay, editEndTime, editFormat, editRoom, editSnapshot, editStartTime, editTopic]);

  // Current real day of week: 1=Mon .. 7=Sun
  const todayDayOfWeek = businessDayOfWeek();

  // Check if adding lesson on today with time in the past
  const addPastTimeConflict = useMemo(() => {
    const isToday = newLessonScope === "one_off"
      ? newLessonDate === formatBusinessDate()
      : Number(newDay) === todayDayOfWeek;
    if (!isToday) return null;
    const curMin = businessTimeMinutes();
    const [startH, startM] = (newStartTime || "00:00").split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);

    if (startMinutes < curMin) {
      const curTimeStr = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      return `Нельзя назначить урок на прошедшее время сегодняшнего дня (текущее время: ${curTimeStr})`;
    }
    return null;
  }, [newDay, newLessonDate, newLessonScope, newStartTime, todayDayOfWeek]);

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
    setIsReschedulingLesson(false);
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
    Promise.all([
      orgApi.getGroup(activeLesson.groupId),
      orgApi.getGroupAttendance(activeLesson.groupId, {
        dateFrom: occurrenceDate,
        dateTo: occurrenceDate,
      }),
    ])
      .then(([g, att]) => {
        if (g?.students) {
          setGroupStudents(g.students);
        } else {
          setGroupStudents([]);
        }

        const status = att?.statuses?.[lessonKey] || "scheduled";
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
    // Leaving "Ув." drops the typed reason; the server removes the excuse on save.
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

    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      await orgApi.startGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
      });
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
      setAttendanceError(
        err instanceof Error && err.message
          ? err.message
          : "Не удалось начать урок. Данные не изменены."
      );
    } finally {
      setSavingAttendance(false);
    }
  };

  /** Server refused an "Ув." without a reason (old mark with no record): say what to do. */
  const excuseReasonHint = (err: unknown): string | null => {
    const message = err instanceof Error ? err.message : "";
    if (/причин/i.test(message) && /ув|уважит/i.test(message)) {
      setIsMarkingAttendance(true);
      return "Для уважительного пропуска нужна причина. Впишите причину в поле под учеником с отметкой «Ув.» и сохраните снова.";
    }
    return null;
  };

  /** Reasons to send with the save, or an error text when an "Ув." mark has no valid reason. */
  const prepareExcuseReasons = (): { reasons: Record<string, string> } | { error: string } => {
    const missing = firstMissingExcuseReason(attendance, excuseReasons, savedExcuses);
    if (missing) {
      setExcuseReasonInvalidId(missing.studentId);
      const name = groupStudents.find((st) => st.id === missing.studentId)?.full_name;
      return { error: `${name ? `${name}: ` : ""}${missing.error}` };
    }
    setExcuseReasonInvalidId(null);
    return { reasons: collectExcuseReasons(attendance, excuseReasons, savedExcuses) };
  };

  const rememberSavedExcuses = (sent: Record<string, string>) => {
    setSavedExcuses((prev) => {
      const next: Record<string, { reason: string }> = {};
      Object.keys(attendance).forEach((studentId) => {
        if (attendance[studentId] !== "excused") return;
        const reason = sent[studentId] ?? prev[studentId]?.reason;
        if (reason) next[studentId] = { reason };
      });
      return next;
    });
    setExcuseReasons({});
  };

  const handleSaveAttendance = async () => {
    if (!activeLesson) return;

    // Attendance represents a real lesson instance.  Do not let a stale modal
    // or an old client state bypass the explicit "start lesson" transition.
    if (activeLessonStatus !== "in_progress") {
      setIsMarkingAttendance(false);
      setAttendanceError("Сначала начните урок. Посещаемость можно фиксировать только для начатого урока.");
      return;
    }

    setAttendanceError(null);

    const prepared = prepareExcuseReasons();
    if ("error" in prepared) {
      setAttendanceError(prepared.error);
      return;
    }

    setSavingAttendance(true);
    try {
      await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "in_progress",
        records: attendance,
        ...(Object.keys(prepared.reasons).length ? { excuseReasons: prepared.reasons } : {}),
      });
      rememberSavedExcuses(prepared.reasons);
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
      setAttendanceError(
        excuseReasonHint(err)
          ?? (err instanceof Error && err.message
          ? err.message
          : "Не удалось сохранить посещаемость. Данные не изменены.")
      );
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleFinishLesson = async () => {
    if (!activeLesson) return;

    // Check attendance completeness: all students must be marked and attendance saved
    const hasSaved = isAttendanceSaved || !!lessonAttendanceMap[activeLesson.id];
    const unmarked = groupStudents.filter((st) => !attendance[st.id]);

    if (!hasSaved || unmarked.length > 0) {
      setAttendanceError(
        `Невозможно завершить урок: сначала необходимо полностью отметить всех учеников (${groupStudents.length - unmarked.length} из ${groupStudents.length} отмечено) и сохранить отметки.`
      );
      setIsMarkingAttendance(true);
      return;
    }

    setAttendanceError(null);
    const prepared = prepareExcuseReasons();
    if ("error" in prepared) {
      setAttendanceError(prepared.error);
      // Reopen the marking panel: the missing reason field is there.
      setIsMarkingAttendance(true);
      return;
    }

    setSavingAttendance(true);
    try {
      await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "completed",
        records: attendance,
        ...(Object.keys(prepared.reasons).length ? { excuseReasons: prepared.reasons } : {}),
      });
      rememberSavedExcuses(prepared.reasons);
      setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: true }));
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "completed" }));
      setWeekLessonStatusMap((previous) => ({
        ...previous,
        [`${activeLesson.occurrenceDate}_${activeLesson.id}`]: "completed",
      }));
      setActiveLesson(null);
    } catch (err) {
      console.error("Failed to sync completed status with server:", err);
      setAttendanceError(excuseReasonHint(err) ?? serverErrorMessage(err, "Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз."));
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
      setAttendanceError(serverErrorMessage(err, "Не удалось отменить урок. Данные не изменены."));
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

  const openRescheduleModal = () => {
    if (!activeLesson) return;
    setRescheduleStartTime(activeLesson.startTime);
    setRescheduleEndTime(activeLesson.endTime);
    setRescheduleRoom(activeLesson.room || "");
    setRescheduleFormat(activeLesson.format || "offline");
    setRescheduleTopic(activeLesson.topic || "");
    setRescheduleReason("");
    setAttendanceError(null);
    setIsCancellingLesson(false);
    setIsReschedulingLesson(true);
  };

  const handleRescheduleLesson = async () => {
    if (!activeLesson) return;
    const reason = rescheduleReason.trim();
    if (reason.length < 3) {
      setAttendanceError("Укажите понятную причину переноса урока.");
      return;
    }

    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      const updated = await orgApi.rescheduleLessonOccurrence(activeLesson.id, {
        lessonDate: activeLesson.occurrenceDate,
        startTime: rescheduleStartTime,
        endTime: rescheduleEndTime,
        room: rescheduleRoom,
        format: rescheduleFormat,
        topic: rescheduleTopic || undefined,
        reason,
      });
      const replaceOccurrence = (item: LessonOccurrence) =>
        item.id === updated.id && item.occurrenceDate === updated.occurrenceDate ? updated : item;
      setTodayOccurrences((previous) => previous.map(replaceOccurrence));
      setWeekOccurrences((previous) => previous.map(replaceOccurrence));
      setActiveLesson(updated);
      setIsReschedulingLesson(false);
    } catch (err) {
      console.error("Failed to reschedule lesson:", err);
      setAttendanceError(serverErrorMessage(err, "Не удалось перенести урок. Расписание и посещаемость не изменены."));
    } finally {
      setSavingAttendance(false);
    }
  };

  /**
   * Today is deliberately a different operation from a schedule change.
   * A transfer is allowed only before the one-hour cut-off and only while
   * this concrete occurrence has no attendance lifecycle yet.
   */
  // The time windows of the lesson panel's buttons (the last minutes of a lesson, the hour before its start) move
  // with the clock, not with the click that opened the panel: re-read every 30 s while a panel is open.
  const panelClock = useNow(30_000, Boolean(activeLesson));
  const canRescheduleToday = useMemo(() => {
    if (!activeLesson || activeLessonView !== "today" || !activeLesson.startTime) return false;
    const at = new Date(panelClock);
    if (activeLessonStatus !== "scheduled" || activeLesson.occurrenceDate !== formatBusinessDate(at)) return false;
    return businessTimeMinutes(at) < clockMinutes(activeLesson.startTime) - 60;
  }, [activeLesson, activeLessonStatus, activeLessonView, panelClock]);

  // Week mode never rewrites the displayed occurrence. It opens a versioned
  // recurring change whose effect starts on a future date selected by teacher.
  const canReviseRecurringSchedule = Boolean(
    activeLesson && activeLessonView === "week" && !activeLesson.isOneOff,
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
    if (
      newLessonScope === "one_off"
      && (newLessonDate < formatBusinessDate() || newLessonDate < weekPeriod.start || newLessonDate > weekPeriod.end)
    ) {
      setScheduleError("Для разового занятия выберите будущую дату из открытой недели расписания.");
      return;
    }
    const group = groups.find((g) => g.id === newGroupId);
    const groupName = group ? group.name : "Группа";
    const classLevel = group?.class_level || 5;
    const oneOffDay = newLessonScope === "one_off"
      ? (new Date(`${newLessonDate}T12:00:00`).getDay() || 7)
      : Number(newDay);

    const tempId = `lesson-${Date.now()}`;
    const newLesson: LessonEvent = {
      id: tempId,
      groupId: newGroupId || (groups[0]?.id ?? "custom-group"),
      groupName: groupName,
      classLevel,
      // ALGO currently schedules mathematics groups only.  Keep the stored
      // subject deterministic instead of showing an artificial choice in the
      // create-lesson form.
      subject: "Математика",
      dayOfWeek: oneOffDay,
      startTime: newStartTime,
      endTime: newEndTime,
      room: newRoom,
      format: newFormat,
      color: newColor,
      topic: newTopic || undefined,
    };

    try {
      setScheduleError(null);
      const created = newLessonScope === "one_off"
        ? await orgApi.createOneOffLesson({
            groupId: newLesson.groupId,
            lessonDate: newLessonDate,
            startTime: newLesson.startTime,
            endTime: newLesson.endTime,
            room: newLesson.room,
            format: newLesson.format,
            color: newLesson.color,
            topic: newLesson.topic,
          })
        : await orgApi.createLesson({
            groupId: newLesson.groupId,
            dayOfWeek: newLesson.dayOfWeek,
            startTime: newLesson.startTime,
            endTime: newLesson.endTime,
            subject: newLesson.subject,
            room: newLesson.room,
            format: newLesson.format,
            color: newLesson.color,
            topic: newLesson.topic,
          });
      if (!created?.id) throw new Error("Сервер не вернул идентификатор урока");

      // Reload the canonical schedule after either operation. A one-off is
      // intentionally absent from the recurring template, so optimistic
      // browser state would otherwise make it look permanent.
      const reloaded = await loadData();
      if (!reloaded) {
        setIsAddModalOpen(false);
        setNewTopic("");
        return;
      }
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      try {
        const refreshedWeek = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          isOrgManager ? undefined : user?.id,
        );
        setWeekOccurrences(refreshedWeek);
      } catch (error) {
        setWeekLoadError(getDataLoadErrorMessage(error));
      }
      setIsAddModalOpen(false);
      setNewTopic("");
    } catch (err) {
      console.error("Failed to persist lesson on backend:", err);
      setScheduleError("Не удалось создать урок. Расписание не изменено — повторите попытку.");
    }
  };

  // Open Add Modal with smart non-conflicting time calculation
  const openAddModal = (targetDay?: number) => {
    const day = targetDay !== undefined ? targetDay : (todayDayOfWeek || 1);
    setNewDay(day);
    setNewLessonScope("one_off");
    setNewLessonDate(businessWeekdayDate(day, weekOffset));

    const dayLessons = lessons.filter((l) => l.dayOfWeek === day);
    if (dayLessons.length > 0) {
      const sorted = [...dayLessons].sort((a, b) => b.endTime.localeCompare(a.endTime));
      const latestEnd = sorted[0].endTime;
      const [h, m] = latestEnd.split(":").map(Number);
      const nextStartTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const endMinutes = (h || 0) * 60 + (m || 0) + 90;
      const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endM = String(endMinutes % 60).padStart(2, "0");
      setNewStartTime(nextStartTime);
      setNewEndTime(`${endH}:${endM}`);
    } else {
      setNewStartTime("10:00");
      setNewEndTime("11:30");
    }

    if (groups.length > 0) {
      setNewGroupId(groups[0].id);
    }
    setNewTopic("");
    setIsAddModalOpen(true);
  };

  const handleAddDayChange = (day: number) => {
    setNewDay(day);
    const dayLessons = lessons.filter((l) => l.dayOfWeek === day);
    if (dayLessons.length > 0) {
      const sorted = [...dayLessons].sort((a, b) => b.endTime.localeCompare(a.endTime));
      const latestEnd = sorted[0].endTime;
      const [h, m] = latestEnd.split(":").map(Number);
      const nextStartTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const endMinutes = (h || 0) * 60 + (m || 0) + 90;
      const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endM = String(endMinutes % 60).padStart(2, "0");
      setNewStartTime(nextStartTime);
      setNewEndTime(`${endH}:${endM}`);
    } else {
      setNewStartTime("10:00");
      setNewEndTime("11:30");
    }
  };

  const handleStartTimeChange = (val: string) => {
    setNewStartTime(val);
    if (val && val.includes(":")) {
      const [h, m] = val.split(":").map(Number);
      const endMinutes = (h || 0) * 60 + (m || 0) + 90;
      const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endM = String(endMinutes % 60).padStart(2, "0");
      setNewEndTime(`${endH}:${endM}`);
    }
  };

  const handleEditStartTimeChange = (val: string) => {
    setEditStartTime(val);
    if (val && val.includes(":")) {
      const [h, m] = val.split(":").map(Number);
      const endMinutes = (h || 0) * 60 + (m || 0) + 90;
      const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endM = String(endMinutes % 60).padStart(2, "0");
      setEditEndTime(`${endH}:${endM}`);
    }
  };

  // Open Edit Modal
  const openEditModal = (lesson: LessonOccurrence) => {
    if (lesson.isOneOff) return;
    const snapshot: ScheduleEditSnapshot = {
      day: Number(lesson.dayOfWeek),
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      room: lesson.room || "Кабинет 204",
      format: lesson.format || "offline",
      topic: lesson.topic || "",
      color: lesson.color || "blue",
    };
    setEditingLesson(lesson);
    setEditSnapshot(snapshot);
    setEditDay(snapshot.day);
    setEditStartTime(snapshot.startTime);
    setEditEndTime(snapshot.endTime);
    setEditRoom(snapshot.room);
    setEditFormat(snapshot.format);
    setEditTopic(snapshot.topic);
    setEditColor(snapshot.color);
    setEditEffectiveFrom(nextBusinessDate());
    setEditReason("");
    setIsEditModalOpen(true);
    setActiveLesson(null);
  };

  const closeEndRecurringModal = (force = false) => {
    if (isEndingRecurring && !force) return;
    setIsEndRecurringModalOpen(false);
    setEndingRecurringLesson(null);
    setEndRecurringImpact(null);
    setEndRecurringError(null);
    setReleaseAffectedExams(false);
  };

  const openEndRecurringModal = (lesson: LessonOccurrence) => {
    if (lesson.isOneOff) return;
    setEndingRecurringLesson(lesson);
    setEndRecurringEffectiveFrom(nextBusinessDate());
    setEndRecurringReason("");
    setEndRecurringImpact(null);
    setEndRecurringError(null);
    setReleaseAffectedExams(false);
    setIsEndRecurringModalOpen(true);
    setIsEditModalOpen(false);
  };

  useEffect(() => {
    if (!isEndRecurringModalOpen || !endingRecurringLesson || !endRecurringEffectiveFrom) return;
    if (endRecurringEffectiveFrom <= formatBusinessDate()) {
      setEndRecurringImpact(null);
      setEndRecurringError("Выберите будущую дату прекращения занятий.");
      return;
    }

    let cancelled = false;
    setIsLoadingEndRecurringImpact(true);
    setEndRecurringError(null);
    setEndRecurringImpact(null);
    setReleaseAffectedExams(false);
    void orgApi.getRecurringLessonEndImpact(endingRecurringLesson.id, endRecurringEffectiveFrom)
      .then((impact) => {
        if (!cancelled) setEndRecurringImpact(impact);
      })
      .catch((error) => {
        if (!cancelled) {
          setEndRecurringError(
            error instanceof Error && error.message
              ? error.message
              : "Не удалось проверить связанные экзамены. Для безопасности прекращение сейчас недоступно.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEndRecurringImpact(false);
      });
    return () => { cancelled = true; };
  }, [isEndRecurringModalOpen, endingRecurringLesson, endRecurringEffectiveFrom]);

  // Update lesson handler
  const handleUpdateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson) return;
    const reason = editReason.trim() || automaticEditReason;
    if (!hasEditChanges) {
      setScheduleError("Измените хотя бы один параметр расписания.");
      return;
    }
    if (!editEffectiveFrom || editEffectiveFrom <= formatBusinessDate()) {
      setScheduleError("Постоянное расписание можно менять только начиная с будущей даты.");
      return;
    }

    try {
      setScheduleError(null);
      await orgApi.reviseRecurringLesson(editingLesson.id, {
        effectiveFrom: editEffectiveFrom,
        reason,
        dayOfWeek: Number(editDay),
        startTime: editStartTime,
        endTime: editEndTime,
        room: editRoom,
        format: editFormat,
        color: editColor,
        topic: editTopic || undefined,
      });
      // A recurring change has an effective date. Reload server-resolved data
      // instead of optimistically rewriting the old schedule template.
      const reloaded = await loadData();
      if (!reloaded) {
        setIsEditModalOpen(false);
        setEditingLesson(null);
        setEditSnapshot(null);
        return;
      }
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      try {
        const refreshedWeek = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          isOrgManager ? undefined : user?.id,
        );
        setWeekOccurrences(refreshedWeek);
      } catch (error) {
        setWeekLoadError(getDataLoadErrorMessage(error));
      }
      setIsEditModalOpen(false);
      setEditingLesson(null);
      setEditSnapshot(null);
    } catch (err) {
      console.error("Failed to revise recurring lesson on backend:", err);
      setScheduleError("Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку.");
    }
  };

  const handleEndRecurringLesson = async () => {
    if (!endingRecurringLesson || !endRecurringImpact) return;
    const reason = endRecurringReason.trim();
    if (reason.length < 3) {
      setEndRecurringError("Укажите понятную причину прекращения регулярных занятий.");
      return;
    }
    if (!endRecurringImpact.canEnd) {
      setEndRecurringError("Сначала завершите или разберите экзамены, которые уже нельзя вернуть в черновик.");
      return;
    }
    if (endRecurringImpact.affectedExamCount > 0 && !releaseAffectedExams) {
      setEndRecurringError("Подтвердите, что затронутые экзамены будут возвращены в черновики.");
      return;
    }

    setIsEndingRecurring(true);
    setEndRecurringError(null);
    try {
      await orgApi.endRecurringLesson(endingRecurringLesson.id, {
        effectiveFrom: endRecurringEffectiveFrom,
        reason,
        releaseAffectedExams,
      });
      // Recurrences are resolved on the server. Do not locally hide a card:
      // reload both canonical schedule reads after the operation succeeded.
      const reloaded = await loadData();
      if (!reloaded) return;
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      try {
        const refreshedWeek = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          isOrgManager ? undefined : user?.id,
        );
        setWeekOccurrences(refreshedWeek);
      } catch (error) {
        setWeekLoadError(getDataLoadErrorMessage(error));
      }
      closeEndRecurringModal(true);
    } catch (error) {
      setEndRecurringError(
        error instanceof Error && error.message
          ? error.message
          : "Не удалось прекратить регулярные занятия. Расписание не изменено.",
      );
    } finally {
      setIsEndingRecurring(false);
    }
  };

  const weekPeriod = useMemo(() => ({
    start: businessWeekdayDate(1, weekOffset),
    end: businessWeekdayDate(7, weekOffset),
  }), [weekOffset]);

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
          setWeekOccurrences(occurrences);
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
      if (lessonStatus === "cancelled") {
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
    // A cancelled occurrence is still part of the weekly plan: it occupied a
    // real calendar slot and must remain visible in reporting. It is resolved
    // differently from a completed lesson, not silently removed from the
    // denominator.
    const planned = weekOccurrences.length;
    let completed = 0;
    let cancelled = 0;
    let needsCompletion = 0;
    let notStarted = 0;

    for (const lesson of weekOccurrences) {
      const key = `${lesson.occurrenceDate}_${lesson.id}`;
      const status = weekLessonStatusMap[key]
        || (lesson.occurrenceDate === businessDate ? lessonStatusMap[lesson.id] : undefined)
        || "scheduled";
      if (status === "cancelled") {
        cancelled += 1;
        continue;
      }
      if (status === "completed") {
        completed += 1;
      } else if (lesson.occurrenceDate < businessDate) {
        if (status === "in_progress") needsCompletion += 1;
        else notStarted += 1;
      }
    }

    return {
      planned,
      completed,
      cancelled,
      completionTarget: Math.max(planned - cancelled, 0),
      needsCompletion,
      notStarted,
      remaining: Math.max(planned - completed - cancelled, 0),
    };
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

  const weekKpiDescription = weekKpi.planned === 0
    ? "На эту неделю уроков нет"
    : weekKpi.completionTarget === 0
      ? "Все занятия недели отменены"
      : weekKpi.completed === weekKpi.completionTarget
        ? "План недели выполнен"
        : completedLessonsProgressLabel(weekKpi.completed, weekKpi.completionTarget);
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
          message={`${weekLoadError} Показаны последние успешно загруженные данные недели.`}
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
              aria-haspopup="true"
              aria-expanded={isGroupFilterOpen}
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
                  Текущая неделя
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
                  className={`min-h-[58px] p-3 border-b flex items-center ${
                    isToday
                      ? "bg-primary-600 text-white rounded-t-2xl border-primary-600"
                      : "bg-slate-50/70 border-slate-100 text-slate-800 rounded-t-2xl"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-bold text-xs uppercase tracking-wider">{day.short}</span>
                      <span className={`hidden 2xl:inline text-[11px] whitespace-nowrap ${isToday ? "text-primary-100" : "text-slate-400"}`}>
                        {day.name}
                      </span>
                    </div>
                    {isToday && (
                      <span className="shrink-0 whitespace-nowrap text-[10px] bg-white/20 px-2 py-1 rounded-md font-bold">
                        Сегодня
                      </span>
                    )}
                  </div>
                </div>

                {/* Day Lessons List */}
                <div className="p-2 space-y-2 flex-1">
                  {dayLessons.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-300">
                      <p className="text-xs">Нет занятий</p>
                    </div>
                  ) : (
                    dayLessons.map((l) => {
                      const colorStyle = COLOR_CLASSES[l.color] || COLOR_CLASSES.blue;
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
                                  <span className="text-slate-400 line-through">{l.originalStartTime} - {l.originalEndTime}</span>
                                  <span>→ {l.startTime} - {l.endTime}</span>
                                </>
                              ) : (
                                <>{l.startTime} - {l.endTime}</>
                              )}
                            </span>
                          </div>

                          {l.isRescheduled && (
                            <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                              Перенесён
                            </span>
                          )}

                          <h4 className="font-bold text-xs text-slate-900 leading-snug line-clamp-2">
                            {l.groupName}
                          </h4>

                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-2">
                            {l.format === "online" ? (
                              <span className="flex items-center gap-1 text-purple-700 font-medium">
                                <Video className="w-3 h-3" /> Zoom
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" /> {l.room}
                              </span>
                            )}
                          </div>
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
                <span className="text-xs uppercase font-bold tracking-widest text-primary-200">
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
                              <span className="line-through text-slate-400">{l.originalStartTime} — {l.originalEndTime}</span>
                              <span>→ {l.startTime} — {l.endTime}</span>
                            </>
                          ) : (
                            <>{l.startTime} — {l.endTime}</>
                          )}
                        </span>

                        {l.isRescheduled && (
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Перенесён</span>
                        )}

                        {/* Status Badge */}
                        <div>
                          {lessonStatus === "cancelled" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200"><X className="w-3 h-3" />Отменён</span>
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
                    </div>

                    {/* Bottom row */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        {l.format === "online" ? (
                          <>
                            <Video className="w-4 h-4 text-purple-600" /> Zoom класс
                          </>
                        ) : (
                          <>
                            <MapPin className="w-4 h-4 text-slate-400" /> {l.room}
                          </>
                        )}
                      </span>
                      <span className="text-primary-600 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        {lessonStatus === "cancelled"
                          ? "Причина отмены"
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
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Расписание</p>
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
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">По плану</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{weekKpi.planned}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center ring-1 ring-emerald-100">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Проведено</p>
                    <p className="mt-1 text-lg font-bold text-emerald-800">{weekKpi.completed}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-center ring-1 ring-slate-200">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Отменено</p>
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
                              <p className="mt-0.5 text-xs text-slate-500">{row.lesson.startTime} — {row.lesson.endTime}</p>
                            </div>
                            <div className="min-w-0 flex-1 border-l border-slate-100 pl-3">
                              <p className="truncate text-sm font-bold text-slate-900">{row.lesson.groupName}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {row.lesson.classLevel} класс · {row.lesson.format === "online" ? "Онлайн" : row.lesson.room || "Аудитория не указана"}
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
                  <span className="text-xs font-bold text-primary-600 uppercase tracking-wider">
                    {activeLesson.occurrenceDate} · {DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name} · {activeLesson.startTime} — {activeLesson.endTime}
                  </span>
                  {activeLesson.isRescheduled && activeLesson.originalStartTime && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      Перенесён: {activeLesson.originalStartTime} — {activeLesson.originalEndTime} → {activeLesson.startTime} — {activeLesson.endTime}
                    </p>
                  )}
                  <div className="flex items-center gap-2.5 mt-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                      {activeLesson.groupName}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-violet-50 text-violet-700 border border-violet-200/60">
                      {activeLesson.classLevel} класс
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    {activeLesson.format === "online" ? (
                      <>
                        <Video className="w-3.5 h-3.5 text-purple-600" /> Zoom класс
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3.5 h-3.5 text-slate-400" /> {activeLesson.room}
                      </>
                    )}
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
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Тема урока
                  </p>
                  <p className="text-sm font-medium text-slate-800 mt-1">
                    {activeLesson.topic}
                  </p>
                </div>
              )}

              {/* Attendance Section */}
              <div className="mb-6">
                {loadingStudents ? (
                  <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                    Загрузка данных урока...
                  </div>
                ) : groupStudents.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 border border-slate-100">
                    В этой группе пока нет добавленных учеников
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
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80">
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

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(st.id, "present")}
                                title={status === "present" ? "Снять отметку «Был»" : "Отметить «Был»"}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                  status === "present"
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50"
                                }`}
                              >
                                Был
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(st.id, "late")}
                                title={status === "late" ? "Снять отметку «Опоздал»" : "Отметить «Опоздал»"}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                  status === "late"
                                    ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50/50"
                                }`}
                              >
                                Опоздал
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(st.id, "absent")}
                                title={status === "absent" ? "Снять отметку «Н/Б»" : "Отметить «Н/Б»"}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                  status === "absent"
                                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/50"
                                }`}
                              >
                                Н/Б
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(st.id, "excused")}
                                title={status === "excused" ? "Снять отметку «Уважительная причина»" : "Отметить «Уважительная причина»"}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                  status === "excused"
                                    ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/50"
                                }`}
                              >
                                Ув.
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

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsMarkingAttendance(false)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                      >
                        Отметить позже
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAttendance}
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
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setIsCancellingLesson(false); setCancellationReason(""); setLessonExamBinding(null); }} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white rounded-lg">Не отменять</button>
                    <button type="button" onClick={handleCancelLesson} disabled={savingAttendance || !lessonExamBinding || lessonExamBinding.loading || !lessonExamBinding.canCancel || cancellationReason.trim().length < 3} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg">Подтвердить отмену</button>
                  </div>
                </div>
              )}

              {isReschedulingLesson && canRescheduleToday && (
                <div className="mb-5 rounded-2xl border border-primary-200 bg-primary-50/70 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-primary-950">Перенести урок только на сегодня</p>
                    <p className="text-xs text-primary-800 mt-0.5">Будущие занятия не меняются. Посещаемость останется привязана к этому же уроку и будет доступна в новое время.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-700">Начало
                      <input type="time" value={rescheduleStartTime} onChange={(event) => setRescheduleStartTime(event.target.value)} required className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Окончание
                      <input type="time" value={rescheduleEndTime} onChange={(event) => setRescheduleEndTime(event.target.value)} required className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-700">Формат
                      <select value={rescheduleFormat} onChange={(event) => setRescheduleFormat(event.target.value as "offline" | "online")} className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500">
                        <option value="offline">Офлайн</option>
                        <option value="online">Онлайн</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Аудитория
                      <input type="text" value={rescheduleRoom} onChange={(event) => setRescheduleRoom(event.target.value)} maxLength={200} className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-slate-700">Тема урока (при необходимости)
                    <input type="text" value={rescheduleTopic} onChange={(event) => setRescheduleTopic(event.target.value)} maxLength={300} className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">Причина переноса
                    <textarea value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} maxLength={500} rows={2} placeholder="Например: аудитория занята" className="mt-1 w-full resize-none rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsReschedulingLesson(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white rounded-lg">Не переносить</button>
                    <button type="button" onClick={handleRescheduleLesson} disabled={savingAttendance || rescheduleReason.trim().length < 3} className="px-3 py-1.5 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg">Подтвердить перенос</button>
                  </div>
                </div>
              )}

              {/* The marking list shows its own copy of the error; every other step shows it here. */}
              {!isMarkingAttendance && <LessonPanelError message={attendanceError} />}

              {/* Actions footer */}
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  {canRescheduleToday ? (
                    <button
                      type="button"
                      onClick={openRescheduleModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Перенести урок
                    </button>
                  ) : canReviseRecurringSchedule ? (
                    <button
                      type="button"
                      onClick={() => openEditModal(activeLesson)}
                      className="inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-primary-50 px-3.5 py-2 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                    >
                      <Edit2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Изменить постоянное расписание</span>
                    </button>
                  ) : (
                    <Link
                      href={`/teacher/groups/${activeLesson.groupId || ""}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                    >
                      Перейти в группу
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}

                  {(canReviseRecurringSchedule || (activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson && !isReschedulingLesson)) && (
                    <div className="shrink-0">
                      <button
                        type="button"
                        ref={recurringActionsButtonRef}
                        onClick={() => setIsRecurringActionsOpen((isOpen) => !isOpen)}
                        aria-label="Дополнительные действия с уроком"
                        aria-haspopup="menu"
                        aria-expanded={isRecurringActionsOpen}
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
                      onClick={handleFinishLesson}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 rounded-xl transition-colors shadow-2xs"
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveLesson(null)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Закрыть
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* This menu is portalled out of the scrollable lesson dialog.  It can
          therefore open downward without creating horizontal scrollbars or
          being clipped by the modal's own overflow boundary. */}
      <FloatingPanel
        open={Boolean(mounted && activeLesson && isRecurringActionsOpen)}
        triggerRef={recurringActionsButtonRef}
        onClose={() => setIsRecurringActionsOpen(false)}
        width={256}
        role="menu"
        label="Дополнительные действия с уроком"
        zIndexClass="z-[100001]"
        className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
      >
            {activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson && !isReschedulingLesson && (
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
            {canReviseRecurringSchedule && activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson && !isReschedulingLesson && (
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Группа
                  </label>
                  <select
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.class_level || 5} класс)
                      </option>
                    ))}
                    {groups.length === 0 && (
                      <option value="default-grp">Основная группа (5 класс)</option>
                    )}
                  </select>
                </div>

                <fieldset>
                  <legend className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Как добавить занятие
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewLessonScope("one_off");
                        setNewLessonDate(businessWeekdayDate(newDay, weekOffset));
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
                        newLessonScope === "one_off"
                          ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-bold">Только на этой неделе</span>
                      <span className="mt-0.5 block text-[11px] opacity-75">Разовое занятие</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewLessonScope("recurring")}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
                        newLessonScope === "recurring"
                          ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-bold">На постоянной основе</span>
                      <span className="mt-0.5 block text-[11px] opacity-75">Повторяется еженедельно</span>
                    </button>
                  </div>
                </fieldset>

                {newLessonScope === "one_off" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Дата занятия</label>
                    <input
                      type="date"
                      value={newLessonDate}
                      min={formatBusinessDate()}
                      max={weekPeriod.end}
                      onChange={(e) => setNewLessonDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">Занятие появится только на выбранную дату и не изменит следующие недели.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">День недели</label>
                    <select
                      value={newDay}
                      onChange={(e) => handleAddDayChange(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      {DAYS.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">Урок будет повторяться в этот день каждую неделю.</p>
                  </div>
                )}

                {/* Time range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Начало
                    </label>
                    <input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Окончание
                    </label>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Format & Room */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Формат
                    </label>
                    <select
                      value={newFormat}
                      onChange={(e) => setNewFormat(e.target.value as "offline" | "online")}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      <option value="offline">Офлайн в классе</option>
                      <option value="online">Онлайн (Zoom)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Аудитория
                    </label>
                    <input
                      type="text"
                      value={newRoom}
                      onChange={(e) => setNewRoom(e.target.value)}
                      placeholder="Кабинет 204"
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Тема занятия (необязательно)
                  </label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="Например: Квадратные уравнения"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                {/* Color tag */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Цветовая метка
                  </label>
                  <div className="flex items-center gap-2">
                    {(["blue", "indigo", "purple", "emerald", "amber", "rose"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${COLOR_CLASSES[c].dot} ${
                          newColor === c ? "border-slate-900 scale-110 shadow-xs" : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

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

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={!!addConflict || !!addPastTimeConflict}
                    className="px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
                  >
                    Сохранить урок
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* MODAL: END RECURRING LESSON */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isEndRecurringModalOpen && endingRecurringLesson && (
              <div
                onClick={(event) => {
                  if (event.target === event.currentTarget) closeEndRecurringModal();
                }}
                className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl ring-1 ring-black/5 sm:p-7"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="end-recurring-title"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-500">Постоянное расписание</p>
                      <h3 id="end-recurring-title" className="mt-1 text-lg font-bold text-slate-950">Прекратить занятия</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Прошедшие уроки, посещаемость и журнал останутся без изменений. Новые экземпляры этого занятия перестанут появляться с выбранной даты.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => closeEndRecurringModal()}
                      disabled={isEndingRecurring}
                      aria-label="Закрыть"
                      className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{endingRecurringLesson.groupName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {DAYS.find((day) => day.id === Number(endingRecurringLesson.dayOfWeek))?.name ?? "Регулярное занятие"} · {endingRecurringLesson.startTime}—{endingRecurringLesson.endTime}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-semibold text-slate-700">
                      Прекратить с даты
                      <input
                        type="date"
                        value={endRecurringEffectiveFrom}
                        min={nextBusinessDate()}
                        onChange={(event) => setEndRecurringEffectiveFrom(event.target.value)}
                        disabled={isEndingRecurring}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-slate-700">
                      Причина
                      <textarea
                        value={endRecurringReason}
                        onChange={(event) => setEndRecurringReason(event.target.value)}
                        maxLength={500}
                        rows={2}
                        disabled={isEndingRecurring}
                        placeholder="Например: группа закончила курс"
                        className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-sm font-bold text-slate-900">Проверка будущих экзаменов</p>
                      {isLoadingEndRecurringImpact ? (
                        <p className="mt-2 text-xs text-slate-500">Проверяем привязанные экзамены…</p>
                      ) : endRecurringImpact ? (
                        <div className="mt-2 space-y-3">
                          {endRecurringImpact.affectedExamCount === 0 ? (
                            <p className="text-xs leading-relaxed text-emerald-700">Связанных будущих экзаменов нет. Расписание можно безопасно прекратить.</p>
                          ) : (
                            <>
                              <p className="text-xs leading-relaxed text-slate-600">
                                Найдено: {endRecurringImpact.affectedExamCount}. {endRecurringImpact.canEnd
                                  ? "После подтверждения они вернутся в черновики, а доступы и печатные комплекты будут закрыты."
                                  : "Есть экзамены, которые уже нельзя безопасно вернуть в черновики."}
                              </p>
                              <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
                                {endRecurringImpact.exams.map((exam) => (
                                  <div key={exam.examId} className={`rounded-xl border px-3 py-2 ${exam.canRelease ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50"}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-slate-800">{exam.title}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">{formatIsoDateLabel(exam.lessonDate, { day: "numeric", month: "long", year: "numeric" })} · {exam.deliveryMode === "print" ? "Печатный" : "Онлайн"}</p>
                                      </div>
                                      <span className={`shrink-0 text-[11px] font-semibold ${exam.canRelease ? "text-emerald-700" : "text-rose-700"}`}>
                                        {exam.canRelease ? "Вернётся в черновик" : exam.blockerReason ?? "Требует разбора"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {endRecurringImpact.canEnd && (
                                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                                  <input
                                    type="checkbox"
                                    checked={releaseAffectedExams}
                                    onChange={(event) => setReleaseAffectedExams(event.target.checked)}
                                    disabled={isEndingRecurring}
                                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                  />
                                  <span>Подтверждаю возврат затронутых экзаменов в черновики.</span>
                                </label>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Выберите будущую дату, чтобы проверить последствия.</p>
                      )}
                    </div>

                    {endRecurringError && (
                      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700">
                        {endRecurringError}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => closeEndRecurringModal()}
                      disabled={isEndingRecurring}
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={handleEndRecurringLesson}
                      disabled={isEndingRecurring || isLoadingEndRecurringImpact || !endRecurringImpact || !endRecurringImpact.canEnd || endRecurringReason.trim().length < 3 || (endRecurringImpact.affectedExamCount > 0 && !releaseAffectedExams)}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isEndingRecurring ? "Прекращаем…" : "Прекратить занятия"}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* MODAL: EDIT LESSON */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isEditModalOpen && editingLesson && (
              <div
                onClick={(e) => {
                  if (e.target === e.currentTarget) setIsEditModalOpen(false);
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
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Изменить постоянное расписание</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Текущее и прошлые занятия не меняются. Новые правила начнут действовать с выбранной даты.</p>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateLesson} className="space-y-4">
                {/* Conflict warning banner */}
                {editConflict && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800">
                      <span className="font-bold">Внимание, накладка по времени:</span> в этот день уже есть урок группы «{editConflict.groupName}» ({editConflict.startTime} - {editConflict.endTime}).
                    </div>
                  </div>
                )}

                {/* A recurring revision cannot silently move a lesson to a different group. */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Группа
                  </label>
                  <div className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-medium">
                    {editingLesson.groupName} ({editingLesson.classLevel} класс)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Изменения действуют с</label>
                    <input type="date" value={editEffectiveFrom} min={nextBusinessDate()} onChange={(e) => setEditEffectiveFrom(e.target.value)} required className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  </div>
                  <div className="flex items-end">
                    <p className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-[11px] leading-relaxed text-primary-800">Уроки до этой даты сохраняют прежнее время и посещаемость.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">День недели</label>
                  <select
                    value={editDay}
                    onChange={(e) => setEditDay(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    {DAYS.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Time range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Начало
                    </label>
                    <input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => handleEditStartTimeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Окончание
                    </label>
                    <input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Format & Room */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Формат
                    </label>
                    <select
                      value={editFormat}
                      onChange={(e) => setEditFormat(e.target.value as "offline" | "online")}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      <option value="offline">Офлайн в классе</option>
                      <option value="online">Онлайн (Zoom)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Аудитория
                    </label>
                    <input
                      type="text"
                      value={editRoom}
                      onChange={(e) => setEditRoom(e.target.value)}
                      placeholder="Кабинет 204"
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Тема занятия (необязательно)
                  </label>
                  <input
                    type="text"
                    value={editTopic}
                    onChange={(e) => setEditTopic(e.target.value)}
                    placeholder="Например: Квадратные уравнения"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Причина изменения <span className="font-normal text-slate-400">(необязательно)</span>
                  </label>
                  <textarea
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Например: постоянная смена аудитории"
                    className="w-full resize-none px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Если оставить поле пустым, система автоматически зафиксирует изменённые параметры.
                  </p>
                </div>

                {/* Color tag */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Цветовая метка
                  </label>
                  <div className="flex items-center gap-2">
                    {(["blue", "indigo", "purple", "emerald", "amber", "rose"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${COLOR_CLASSES[c].dot} ${
                          editColor === c ? "border-slate-900 scale-110 shadow-xs" : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* The change is versioned for a future date, so only a real schedule overlap matters here. */}
                {editConflict && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        Внимание: пересечение по времени!
                      </p>
                      <p className="mt-0.5">
                        В это время уже назначен урок группы «{editConflict.groupName}» ({editConflict.startTime} — {editConflict.endTime}).
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  {!hasEditChanges && (
                    <p className="mr-auto text-[11px] text-slate-500">Измените хотя бы один параметр расписания.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={!!editConflict || !hasEditChanges || !editEffectiveFrom}
                    className="px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
                  >
                    Изменить расписание
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>
  );
}
