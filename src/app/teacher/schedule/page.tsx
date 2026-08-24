"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { examsApi, orgApi, type AttendanceStatus, type GroupInfo, type StudentInGroup, type LessonAttendanceStatus, type LessonEvent, type LiveExamDashboardSummary, type ScheduleOccurrence } from "@/lib/api";
import { businessDayOfWeek, businessTimeMinutes, businessWeekdayDate, formatBusinessDate, formatBusinessDateLabel, formatIsoDateLabel } from "@/lib/business-time";
import Link from "next/link";
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
  Trash2,
  Check,
  Sparkles,
  ArrowRight,
  X,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Play,
  CheckCheck,
  Radio,
} from "lucide-react";

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
  const groupFilterRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"today" | "week">("today");
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessonAttendanceMap, setLessonAttendanceMap] = useState<Record<string, boolean>>({});
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<string, boolean>>({});
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [weekLessonStatusMap, setWeekLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close group filter on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupFilterRef.current && !groupFilterRef.current.contains(e.target as Node)) {
        setIsGroupFilterOpen(false);
      }
    }
    if (isGroupFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isGroupFilterOpen]);

  // Selected lesson modal
  const [activeLesson, setActiveLesson] = useState<LessonOccurrence | null>(null);
  const [activeLessonView, setActiveLessonView] = useState<"today" | "week">("today");
  const [activeLessonStatus, setActiveLessonStatus] = useState<LessonAttendanceStatus>("scheduled");
  const [activeCancellationReason, setActiveCancellationReason] = useState<string | null>(null);
  const [groupStudents, setGroupStudents] = useState<StudentInGroup[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [isAttendanceSaved, setIsAttendanceSaved] = useState(false);
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
    const refresh = async () => {
      try {
        const items = await examsApi.getLiveDashboardSummary();
        if (!cancelled) setLiveExams(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) setLiveExams([]);
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  // Add lesson modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newGroupId, setNewGroupId] = useState("");
  const [newDay, setNewDay] = useState(1);
  const [newStartTime, setNewStartTime] = useState("10:00");
  const [newEndTime, setNewEndTime] = useState("11:30");
  const [newSubject, setNewSubject] = useState("Математика");
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
  const [editSubject, setEditSubject] = useState("Математика");
  const [editRoom, setEditRoom] = useState("Кабинет 204");
  const [editFormat, setEditFormat] = useState<"offline" | "online">("offline");
  const [editTopic, setEditTopic] = useState("");
  const [editColor, setEditColor] = useState<"blue" | "indigo" | "purple" | "emerald" | "amber" | "rose">("blue");
  const [editEffectiveFrom, setEditEffectiveFrom] = useState("");
  const [editReason, setEditReason] = useState("");

  // Load only the organisation's approved schedule. A teacher must never fall
  // back to all groups or generate a fictitious lesson plan in the browser.
  const loadData = useCallback(async () => {
    try {
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      const fetchedGroups = isOrgManager
        ? await orgApi.listGroups().catch(() => [])
        : user?.id
          ? await orgApi.listGroups({ teacher_id: user.id }).catch(() => [])
          : [];
      setGroups(fetchedGroups);
      if (fetchedGroups.length > 0 && !newGroupId) {
        setNewGroupId(fetchedGroups[0].id);
      }

      const todayStr = businessDate;
      const [loadedLessons, loadedTodayOccurrences] = await Promise.all([
        orgApi.getSchedule(isOrgManager ? undefined : user?.id).catch(() => []),
        orgApi.getScheduleOccurrences(
          { dateFrom: todayStr, dateTo: todayStr },
          isOrgManager ? undefined : user?.id,
        ).catch(() => []),
      ]);
      setLessons(loadedLessons);
      setTodayOccurrences(loadedTodayOccurrences);

      // Attendance is always tied to the concrete occurrence (date + lesson).
      const attMap: Record<string, boolean> = {};

      const compMap: Record<string, boolean> = {};
      const statusMap: Record<string, LessonAttendanceStatus> = {};
      await Promise.all(
        loadedTodayOccurrences.map(async (les: LessonOccurrence) => {
            if (!les || !les.groupId) return;
            try {
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
            } catch {
              // ignore
            }
          })
      );
      setLessonAttendanceMap(attMap);
      setCompletedLessonsMap(compMap);
      setLessonStatusMap(statusMap);
    } catch (err) {
      console.error("Failed to load schedule:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.org_role, user?.role, newGroupId, businessDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // An open lesson modal is bound to a date + lesson instance. Once the
  // business date changes, reload the new day and close the stale instance.
  useEffect(() => {
    setActiveLesson(null);
  }, [businessDate]);

  // ─── Background Scroll Lock When Any Modal Is Open ───
  useEffect(() => {
    const isAnyModalOpen = isAddModalOpen || isEditModalOpen || !!activeLesson;
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
  }, [isAddModalOpen, isEditModalOpen, activeLesson]);

  // ─── Close Modal on Escape Key ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isAddModalOpen) setIsAddModalOpen(false);
        if (isEditModalOpen) setIsEditModalOpen(false);
        if (activeLesson) setActiveLesson(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddModalOpen, isEditModalOpen, activeLesson]);

  const saveLessons = useCallback((updated: LessonEvent[]) => setLessons(updated), []);

  // Conflict detection helper
  const getConflictingLesson = useCallback(
    (dayOfWeek: number, startTime: string, endTime: string, excludeId?: string) => {
      return lessons.find((l) => {
        if (excludeId && l.id === excludeId) return false;
        if (l.dayOfWeek !== Number(dayOfWeek)) return false;
        return startTime < l.endTime && endTime > l.startTime;
      });
    },
    [lessons]
  );

  // Add conflict check (overlapping lessons)
  const addConflict = useMemo(() => {
    return getConflictingLesson(newDay, newStartTime, newEndTime);
  }, [getConflictingLesson, newDay, newStartTime, newEndTime]);

  // Edit conflict check (overlapping lessons)
  const editConflict = useMemo(() => {
    if (!editingLesson) return null;
    return getConflictingLesson(editDay, editStartTime, editEndTime, editingLesson.id);
  }, [getConflictingLesson, editDay, editStartTime, editEndTime, editingLesson]);

  // Current real day of week: 1=Mon .. 7=Sun
  const todayDayOfWeek = businessDayOfWeek();

  // Check if adding lesson on today with time in the past
  const addPastTimeConflict = useMemo(() => {
    if (Number(newDay) !== todayDayOfWeek) return null;
    const curMin = businessTimeMinutes();
    const [startH, startM] = (newStartTime || "00:00").split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);

    if (startMinutes < curMin) {
      const curTimeStr = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      return `Нельзя назначить урок на прошедшее время сегодняшнего дня (текущее время: ${curTimeStr})`;
    }
    return null;
  }, [newDay, newStartTime, todayDayOfWeek]);

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
      const isFinA = !!completedLessonsMap[a.id];
      const statusA = getLessonTimeStatus(a, todayDayOfWeek, isAttA, isFinA);

      const isAttB = !!lessonAttendanceMap[b.id];
      const isFinB = !!completedLessonsMap[b.id];
      const statusB = getLessonTimeStatus(b, todayDayOfWeek, isAttB, isFinB);

      // Rank: 0 = live (active), 1 = upcoming, 2 = completed (pushed to end)
      const rank = (st: typeof statusA) => {
        if (st.type === "live") return 0;
        if (st.type === "upcoming") return 1;
        return 2;
      };

      const rankA = rank(statusA);
      const rankB = rank(statusB);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return (a.startTime || "").localeCompare(b.startTime || "");
    });
  }, [todayOccurrences, selectedGroupFilter, todayDayOfWeek, lessonAttendanceMap, completedLessonsMap, clockTick]);

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
    setActiveLesson(lesson);
    setActiveLessonView(view);
    setActiveLessonStatus("scheduled");
    setIsCancellingLesson(false);
    setIsReschedulingLesson(false);
    setCancellationReason("");
  }, []);

  // Load students and attendance for active lesson
  useEffect(() => {
    if (!activeLesson) {
      setIsMarkingAttendance(false);
      setIsAttendanceSaved(false);
      setAttendance({});
      setAttendanceError(null);
      setActiveLessonStatus("scheduled");
      setActiveCancellationReason(null);
      return;
    }
    setLoadingStudents(true);
    setIsMarkingAttendance(false);
    setIsAttendanceSaved(false);
    setAttendanceError(null);
    const occurrenceDate = activeLesson.occurrenceDate;
    const lessonKey = `${occurrenceDate}_${activeLesson.id}`;
    Promise.all([
      orgApi.getGroup(activeLesson.groupId).catch(() => null),
      orgApi.getGroupAttendance(activeLesson.groupId, {
        dateFrom: occurrenceDate,
        dateTo: occurrenceDate,
      }).catch(() => null),
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
      .finally(() => setLoadingStudents(false));
  }, [activeLesson]);

  const handleAttendanceChange = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
    setAttendanceError(null);
  };

  const handleMarkAllPresent = () => {
    const allPresent: Record<string, AttendanceStatus> = {};
    groupStudents.forEach((st) => {
      allPresent[st.id] = "present";
    });
    setAttendance(allPresent);
    setAttendanceError(null);
  };

  const handleStartLesson = async () => {
    if (!activeLesson || activeLessonStatus !== "scheduled") return;

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

  const handleSaveAttendance = async () => {
    if (!activeLesson) return;

    // Attendance represents a real lesson instance.  Do not let a stale modal
    // or an old client state bypass the explicit "start lesson" transition.
    if (activeLessonStatus !== "in_progress") {
      setIsMarkingAttendance(false);
      setAttendanceError("Сначала начните урок. Посещаемость можно фиксировать только для начатого урока.");
      return;
    }

    // Validation: All students must be marked
    const unmarked = groupStudents.filter((st) => !attendance[st.id]);
    if (unmarked.length > 0) {
      setAttendanceError(`Необходимо отметить всех учеников. Не отмечено: ${unmarked.length} из ${groupStudents.length}`);
      return;
    }
    setAttendanceError(null);

    setSavingAttendance(true);
    try {
      await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "in_progress",
        records: attendance,
      });
      setIsAttendanceSaved(true);
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
        err instanceof Error && err.message
          ? err.message
          : "Не удалось сохранить посещаемость. Данные не изменены."
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
    setSavingAttendance(true);
    try {
      await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "completed",
        records: attendance,
      });
      setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: true }));
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "completed" }));
      setWeekLessonStatusMap((previous) => ({
        ...previous,
        [`${activeLesson.occurrenceDate}_${activeLesson.id}`]: "completed",
      }));
      setActiveLesson(null);
    } catch (err) {
      console.error("Failed to sync completed status with server:", err);
      setAttendanceError("Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз.");
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCancelLesson = async () => {
    if (!activeLesson || activeLessonStatus === "completed" || activeLessonStatus === "cancelled") return;
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
      setIsMarkingAttendance(false);
      setIsCancellingLesson(false);
    } catch (err) {
      console.error("Failed to cancel lesson:", err);
      setAttendanceError("Не удалось отменить урок. Данные не изменены.");
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
      setAttendanceError("Не удалось перенести урок. Расписание и посещаемость не изменены.");
    } finally {
      setSavingAttendance(false);
    }
  };

  /**
   * Today is deliberately a different operation from a schedule change.
   * A transfer is allowed only before the one-hour cut-off and only while
   * this concrete occurrence has no attendance lifecycle yet.
   */
  const canRescheduleToday = useMemo(() => {
    if (!activeLesson || activeLessonView !== "today" || !activeLesson.startTime) return false;
    if (activeLessonStatus !== "scheduled" || activeLesson.occurrenceDate !== formatBusinessDate()) return false;
    const [startH, startM] = activeLesson.startTime.split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);
    return businessTimeMinutes() < startMinutes - 60;
  }, [activeLesson, activeLessonStatus, activeLessonView]);

  // Week mode never rewrites the displayed occurrence. It opens a versioned
  // recurring change whose effect starts on a future date selected by teacher.
  const canReviseRecurringSchedule = Boolean(activeLesson && activeLessonView === "week");

  const canFinishLesson = useMemo(() => {
    if (!activeLesson || !activeLesson.endTime) return false;
    if (activeLessonStatus !== "in_progress") return false;
    const todayDate = formatBusinessDate();
    if (activeLesson.occurrenceDate > todayDate) return false;
    if (activeLesson.occurrenceDate < todayDate) return true;

    const curMin = businessTimeMinutes();
    const [startH, startM] = (activeLesson.startTime || "00:00").split(":").map(Number);
    const [endH, endM] = (activeLesson.endTime || "00:00").split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    // Can be finished in the final 15 minutes of lesson or ANYTIME after end time!
    return curMin >= startMinutes && curMin >= endMinutes - 15;
  }, [activeLesson, activeLessonStatus]);

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

  // Add lesson handler
  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    const group = groups.find((g) => g.id === newGroupId);
    const groupName = group ? group.name : "Группа";
    const classLevel = group?.class_level || 5;

    const tempId = `lesson-${Date.now()}`;
    const newLesson: LessonEvent = {
      id: tempId,
      groupId: newGroupId || (groups[0]?.id ?? "custom-group"),
      groupName: groupName,
      classLevel,
      subject: newSubject || "Математика",
      dayOfWeek: Number(newDay),
      startTime: newStartTime,
      endTime: newEndTime,
      room: newRoom,
      format: newFormat,
      color: newColor,
      topic: newTopic || undefined,
    };

    try {
      setScheduleError(null);
      const created = await orgApi.createLesson({
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

      saveLessons([...lessons, { ...newLesson, id: created.id }]);
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
    setEditingLesson(lesson);
    setEditDay(lesson.dayOfWeek);
    setEditStartTime(lesson.startTime);
    setEditEndTime(lesson.endTime);
    setEditSubject(lesson.subject || "Математика");
    setEditRoom(lesson.room || "Кабинет 204");
    setEditFormat(lesson.format || "offline");
    setEditTopic(lesson.topic || "");
    setEditColor(lesson.color || "blue");
    setEditEffectiveFrom(nextBusinessDate());
    setEditReason("");
    setIsEditModalOpen(true);
    setActiveLesson(null);
  };

  // Update lesson handler
  const handleUpdateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson) return;
    const reason = editReason.trim();
    if (reason.length < 3) {
      setScheduleError("Укажите понятную причину изменения расписания.");
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
        subject: editSubject,
        room: editRoom,
        format: editFormat,
        color: editColor,
        topic: editTopic || undefined,
      });
      // A recurring change has an effective date. Reload server-resolved data
      // instead of optimistically rewriting the old schedule template.
      await loadData();
      const isOrgManager = user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner";
      const refreshedWeek = await orgApi.getScheduleOccurrences(
        { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
        isOrgManager ? undefined : user?.id,
      );
      setWeekOccurrences(refreshedWeek);
      setIsEditModalOpen(false);
      setEditingLesson(null);
    } catch (err) {
      console.error("Failed to revise recurring lesson on backend:", err);
      setScheduleError("Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку.");
    }
  };

  const handleDeleteLesson = async (id: string) => {
    try {
      setScheduleError(null);
      await orgApi.deleteLesson(id);
      saveLessons(lessons.filter((l) => l.id !== id));
      if (activeLesson?.id === id) {
        setActiveLesson(null);
      }
    } catch (err) {
      console.error("Failed to delete lesson on backend:", err);
      setScheduleError("Не удалось удалить урок. Расписание не изменено — повторите попытку.");
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
      try {
        const occurrences = await orgApi.getScheduleOccurrences(
          { dateFrom: weekPeriod.start, dateTo: weekPeriod.end },
          isOrgManager ? undefined : currentUserId,
        );
        if (!isCurrent) return;
        setWeekOccurrences(occurrences);

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
            }).catch(() => null);
            Object.assign(weeklyStatuses, attendanceData?.statuses || {});
          }),
        );
        if (isCurrent) setWeekLessonStatusMap(weeklyStatuses);
      } catch {
        if (isCurrent) {
          setWeekOccurrences([]);
          setWeekLessonStatusMap({});
        }
      }
    }

    void loadWeekSummary();
    return () => {
      isCurrent = false;
    };
  }, [user?.id, user?.org_role, user?.role, weekPeriod.end, weekPeriod.start]);

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
    let planned = 0;
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
      planned += 1;
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
      needsCompletion,
      notStarted,
      remaining: Math.max(planned - completed, 0),
    };
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
    if (upcoming) return { ...upcoming, label: `Через ${upcoming.time.diffMinutes} мин`, tone: "amber" as const };
    return null;
  }, [todayOccurrences, lessonStatusMap, completedLessonsMap, lessonAttendanceMap, todayDayOfWeek, clockTick]);

  const activeExamAction = useMemo(
    () => liveExams.find((exam) => exam.status === "active") || null,
    [liveExams],
  );

  const weekKpiDescription = weekKpi.needsCompletion > 0 || weekKpi.notStarted > 0
    ? [
        weekKpi.needsCompletion > 0 ? `завершить: ${weekKpi.needsCompletion}` : null,
        weekKpi.notStarted > 0 ? `не начаты: ${weekKpi.notStarted}` : null,
      ].filter(Boolean).join(" · ")
    : weekKpi.planned === 0
      ? "Занятий не запланировано"
      : `${weekKpi.completed} завершено · ${weekKpi.remaining} впереди${weekKpi.cancelled ? ` · отменено ${weekKpi.cancelled}` : ""}`;
  const todayKpiDescription = todayKpi.planned === 0
    ? "На сегодня занятий нет"
    : [
        todayKpi.needsCompletion > 0 ? `завершить: ${todayKpi.needsCompletion}` : null,
        todayKpi.notStarted > 0 ? `не начаты: ${todayKpi.notStarted}` : null,
        todayKpi.live > 0 ? `идёт: ${todayKpi.live}` : null,
        todayKpi.upcoming > 0 ? `впереди: ${todayKpi.upcoming}` : null,
        todayKpi.completed > 0 ? `завершено: ${todayKpi.completed}` : null,
      ].filter(Boolean).join(" · ");
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
          onClick={() => {
            setViewMode("week");
            openAddModal();
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm shadow-primary-600/25 transition-all self-start sm:self-auto"
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs min-h-[128px] flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-semibold">План недели</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {weekKpi.planned}
              <span className="text-xs font-medium text-slate-400 ml-1.5">уроков</span>
            </p>
            <p className={`text-xs mt-1.5 leading-5 ${weekKpi.needsCompletion > 0 || weekKpi.notStarted > 0 ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
              {weekKpiDescription}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs min-h-[128px] flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-semibold">Сегодня</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {todayKpi.planned}
              <span className="text-xs font-medium text-slate-400 ml-1.5">уроков</span>
            </p>
            <p className={`text-xs mt-1.5 leading-5 ${todayKpi.needsCompletion > 0 || todayKpi.notStarted > 0 ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
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
                <p className="text-xs mt-0.5 leading-5 opacity-75 break-words">
                  {nextAction.lesson.topic}
                </p>
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
          <div className="relative" ref={groupFilterRef}>
            <button
              type="button"
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

            <AnimatePresence>
              {isGroupFilterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-1.5 w-60 bg-white rounded-2xl p-1.5 shadow-xl border border-slate-100 z-30 space-y-0.5"
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
                </motion.div>
              )}
            </AnimatePresence>
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
                  Всего запланировано {todayKpi.planned} занятий
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
                          ) : status.type === "live" ? (
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
                            ) : isAttSaved ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                Идёт урок
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
                                Через {status.diffMinutes} мин
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
                        {lessonStatus === "cancelled" ? "Причина отмены" : status.type === "live" && !isAttSaved ? "Начать урок" : "Детали"} <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
              className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 ring-1 ring-black/5 max-h-[90vh] overflow-y-auto"
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
                                {activeLessonIsToday && activeTimeStatus?.type === "live"
                                  ? "Идёт урок · Посещаемость отмечена"
                                  : "Посещаемость отмечена"}
                              </p>
                              {activeLessonIsToday && activeTimeStatus?.type === "live" && (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                              Присутствовали: {Object.values(attendance).filter((s) => s === "present").length} ·{" "}
                              Опоздали: {Object.values(attendance).filter((s) => s === "late").length} ·{" "}
                              Н/Б: {Object.values(attendance).filter((s) => s === "absent").length} ·{" "}
                              Ув.: {Object.values(attendance).filter((s) => s === "excused").length}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMarkingAttendance(true)}
                          className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-xl transition-colors shrink-0 shadow-2xs"
                        >
                          Изменить отметки
                        </button>
                      </div>
                    ) : activeLessonStatus === "in_progress" ? (
                      <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5"><div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Play className="w-5 h-5 fill-current" /></div><div><p className="text-sm font-bold text-slate-900">Урок начат</p><p className="text-xs text-emerald-700 mt-0.5">Экземпляр урока сохранён. Заполните отметки, когда будете готовы.</p></div></div>
                        <button type="button" onClick={() => setIsMarkingAttendance(true)} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">Отметить посещаемость</button>
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
                              Начало в {activeLesson.startTime} (через {activeTimeStatus.diffMinutes} мин). Начать урок и отметить посещаемость можно будет в {activeLesson.startTime}.
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
                              Состав группы ({groupStudents.length} учеников)
                            </p>
                            <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                              Урок начался! Отметьте присутствие учеников на занятии.
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
                      <button
                        type="button"
                        onClick={handleMarkAllPresent}
                        className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        Отметить всех присутствующими
                      </button>
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
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
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
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                                  status === "excused"
                                    ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/50"
                                }`}
                              >
                                Ув.
                              </button>
                            </div>
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
                    <button type="button" onClick={handleCancelLesson} disabled={savingAttendance || !lessonExamBinding || lessonExamBinding.loading || !lessonExamBinding.canCancel} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg">Подтвердить отмену</button>
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

              {/* Actions footer */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Изменить постоянное расписание
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
                </div>

                <div className="flex items-center gap-2">
                  {activeLessonStatus !== "completed" && activeLessonStatus !== "cancelled" && !isCancellingLesson && !isReschedulingLesson && (
                    <button type="button" onClick={openCancelLessonPanel} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors">
                      <X className="w-3.5 h-3.5" /> Отменить урок
                    </button>
                  )}
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

                {/* Day of Week */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      День недели
                    </label>
                    <select
                      value={newDay}
                      onChange={(e) => handleAddDayChange(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      {DAYS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Предмет
                    </label>
                    <select
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      <option value="Математика">Математика</option>
                      <option value="Алгебра">Алгебра</option>
                      <option value="Геометрия">Геометрия</option>
                      <option value="Олимпиадная математика">Олимпиадная математика</option>
                    </select>
                  </div>
                </div>

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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Причина изменения
                  </label>
                  <textarea
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    required
                    minLength={3}
                    maxLength={500}
                    rows={2}
                    placeholder="Например: постоянная смена аудитории"
                    className="w-full resize-none px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
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

                {/* Day of Week */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      День недели
                    </label>
                    <select
                      value={editDay}
                      onChange={(e) => setEditDay(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      {DAYS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Предмет
                    </label>
                    <select
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    >
                      <option value="Математика">Математика</option>
                      <option value="Алгебра">Алгебра</option>
                      <option value="Геометрия">Геометрия</option>
                      <option value="Олимпиадная математика">Олимпиадная математика</option>
                    </select>
                  </div>
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
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={!!editConflict || editReason.trim().length < 3 || !editEffectiveFrom}
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
