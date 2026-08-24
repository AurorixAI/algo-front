"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import {
  examsApi,
  orgApi,
  type AttendanceStatus,
  type GroupInfo,
  type LessonAttendanceStatus,
  type LiveExamDashboardSummary,
  type ScheduleOccurrence,
  type StudentInGroup,
} from "@/lib/api";
import {
  businessDayOfWeek,
  businessTimeMinutes,
  formatBusinessDate,
  formatBusinessDateLabel,
  formatIsoDateLabel,
} from "@/lib/business-time";
import {
  Users,
  GraduationCap,
  Calendar as CalendarIcon,
  ArrowRight,
  Plus,
  Clock,
  MapPin,
  Video,
  X,
  Play,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  ClipboardCheck,
  FileCheck2,
  Radio,
  TimerReset,
} from "lucide-react";
import Link from "next/link";

const DAYS = [
  { id: 1, name: "Понедельник", short: "ПН" },
  { id: 2, name: "Вторник", short: "ВТ" },
  { id: 3, name: "Среда", short: "СР" },
  { id: 4, name: "Четверг", short: "ЧТ" },
  { id: 5, name: "Пятница", short: "ПТ" },
  { id: 6, name: "Суббота", short: "СБ" },
  { id: 7, name: "Воскресенье", short: "ВС" },
];

interface LessonSummary {
  id: string;
  groupId: string;
  groupName: string;
  classLevel: number;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  format: "offline" | "online";
  topic?: string;
}

type LessonAction = {
  lesson: LessonSummary;
  label: string;
  description: string;
  tone: "rose" | "amber" | "emerald";
};

function addCalendarDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`
    : `${String(restMinutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

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

export default function TeacherDashboardPage() {
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ groups: 0, students: 0 });
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [todayLessons, setTodayLessons] = useState<LessonSummary[]>([]);
  const [weekLessons, setWeekLessons] = useState<ScheduleOccurrence[]>([]);
  const [lessonAttendanceMap, setLessonAttendanceMap] = useState<Record<string, boolean>>({});
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<string, boolean>>({});
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [liveExams, setLiveExams] = useState<LiveExamDashboardSummary[]>([]);
  const [liveExamSnapshotAt, setLiveExamSnapshotAt] = useState<number | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [liveExamError, setLiveExamError] = useState<string | null>(null);

  // Selected lesson modal on dashboard
  const [activeLesson, setActiveLesson] = useState<LessonSummary | null>(null);
  const [activeInstanceStatus, setActiveInstanceStatus] = useState<LessonAttendanceStatus>("scheduled");
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
  const [businessDate, setBusinessDate] = useState(() => formatBusinessDate());
  const [clockTick, setClockTick] = useState(0);
  const [liveExamTick, setLiveExamTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refreshLiveExams = useCallback(async () => {
    try {
      const summary = await examsApi.getLiveDashboardSummary();
      setLiveExams(summary);
      setLiveExamSnapshotAt(Date.now());
      setLiveExamError(null);
    } catch (err) {
      console.error("Failed to load live exam summary:", err);
      setLiveExamError("Не удалось обновить состояние экзаменов. Расписание и посещаемость продолжают работать.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick((value) => value + 1);
      const currentDate = formatBusinessDate();
      setBusinessDate((previous) => previous === currentDate ? previous : currentDate);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // The timer animates locally between refreshes, but the API remains the
  // authority: every 15 seconds it confirms the current state and closes an
  // expired exam server-side when appropriate.
  useEffect(() => {
    if (!user?.id) return;
    void refreshLiveExams();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshLiveExams();
      }
    }, 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [refreshLiveExams, user?.id]);

  useEffect(() => {
    if (!liveExams.some((exam) => exam.status === "active")) return;
    const countdownTimer = window.setInterval(() => setLiveExamTick((value) => value + 1), 1_000);
    return () => window.clearInterval(countdownTimer);
  }, [liveExams]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (activeLesson) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [activeLesson]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveLesson(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const todayDayOfWeek = businessDayOfWeek();

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setDashboardError(null);
      try {
        const todayStr = businessDate;
        const weekEnd = addCalendarDays(todayStr, 6);
        const [groupsResult, todayResult, weekResult] = await Promise.allSettled([
          orgApi.listGroups({ teacher_id: user.id }),
          // Concrete occurrences make one-off transfers and cancellations
          // visible at their actual time rather than at the recurring slot.
          orgApi.getScheduleOccurrences({ dateFrom: todayStr, dateTo: todayStr }, user.id),
          orgApi.getScheduleOccurrences({ dateFrom: todayStr, dateTo: weekEnd }, user.id),
        ]);

        const unavailable: string[] = [];
        if (groupsResult.status === "fulfilled") {
          const fetchedGroups = groupsResult.value;
          setGroups(fetchedGroups);
          setStats({
            groups: fetchedGroups.length,
            students: fetchedGroups.reduce((acc: number, group: GroupInfo) => acc + (group.student_count || 0), 0),
          });
        } else {
          unavailable.push("группы");
        }

        let loadedToday: LessonSummary[] = [];
        if (todayResult.status === "fulfilled") {
          loadedToday = todayResult.value
            .filter((lesson) => lesson)
            .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")) as LessonSummary[];
          setTodayLessons(loadedToday);
        } else {
          unavailable.push("расписание на сегодня");
        }

        if (weekResult.status === "fulfilled") {
          setWeekLessons(weekResult.value);
        } else {
          unavailable.push("ближайшие занятия групп");
        }

        if (unavailable.length > 0) {
          setDashboardError(`Не удалось загрузить: ${unavailable.join(", ")}. Обновите страницу и повторите попытку.`);
        }

        // Fetch attendance map and completed status for today's lessons
        const attMap: Record<string, boolean> = {};
        const compMap: Record<string, boolean> = {};
        const statusMap: Record<string, LessonAttendanceStatus> = {};

        await Promise.all(
          loadedToday.map(async (les) => {
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
        console.error("Failed to load teacher stats:", err);
        setDashboardError("Не удалось загрузить рабочую сводку. Данные не были изменены.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id, businessDate]);

  // A modal belongs to one concrete calendar day. Do not let yesterday's
  // lesson remain actionable after the organisation clock crossed midnight.
  useEffect(() => {
    setActiveLesson(null);
  }, [businessDate]);

  // Load students and attendance for active lesson
  useEffect(() => {
    if (!activeLesson || !activeLesson.groupId) {
      setIsMarkingAttendance(false);
      setIsAttendanceSaved(false);
      setAttendance({});
      setAttendanceError(null);
      setActiveInstanceStatus("scheduled");
      setActiveCancellationReason(null);
      return;
    }
    setLoadingStudents(true);
    setIsMarkingAttendance(false);
    setIsAttendanceSaved(false);
    setAttendanceError(null);
    const todayStr = businessDate;
    const lessonKey = `${todayStr}_${activeLesson.id}`;

    Promise.all([
      orgApi.getGroup(activeLesson.groupId).catch(() => null),
      orgApi.getGroupAttendance(activeLesson.groupId, {
        dateFrom: todayStr,
        dateTo: todayStr,
      }).catch(() => null),
    ])
      .then(([g, att]) => {
        if (g?.students) {
          setGroupStudents(g.students);
        } else {
          setGroupStudents([]);
        }

        const status = att?.statuses?.[lessonKey] || "scheduled";
        setActiveInstanceStatus(status);
        setActiveCancellationReason(att?.cancellationReasons?.[lessonKey] || null);
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: status }));

        if (status === "cancelled") {
          setAttendance({});
          setIsAttendanceSaved(false);
        } else if (att?.records) {
          const lessonRecords = att.records[lessonKey] || {};
          if (Object.keys(lessonRecords).length > 0) {
            setAttendance(lessonRecords as any);
            setIsAttendanceSaved(true);
            setLessonAttendanceMap((prev) => ({ ...prev, [activeLesson.id]: true }));
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
  }, [activeLesson, businessDate]);

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
    if (!activeLesson || activeInstanceStatus !== "scheduled") return;
    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      await orgApi.startGroupAttendance(activeLesson.groupId, {
        lessonDate: formatBusinessDate(),
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
      });
      setActiveInstanceStatus("in_progress");
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "in_progress" }));
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

    // Attendance is allowed only after the server recorded the real start of
    // this lesson. This is a client-side guard; the API enforces it too.
    if (activeInstanceStatus !== "in_progress") {
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
        lessonDate: formatBusinessDate(),
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "in_progress",
        records: attendance,
      });
      setIsAttendanceSaved(true);
      setLessonAttendanceMap((prev) => ({ ...prev, [activeLesson.id]: true }));
      setActiveInstanceStatus("in_progress");
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "in_progress" }));
      setIsMarkingAttendance(false);
    } catch (err) {
      console.error("Failed to save attendance:", err);
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
        lessonDate: formatBusinessDate(),
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "completed",
        records: attendance,
      });
      setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: true }));
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "completed" }));
      setActiveLesson(null);
    } catch (err) {
      console.error("Failed to sync completed status with server:", err);
      setAttendanceError("Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз.");
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCancelLesson = async () => {
    if (!activeLesson || activeInstanceStatus === "completed" || activeInstanceStatus === "cancelled") return;
    const reason = cancellationReason.trim();
    if (reason.length < 3) {
      setAttendanceError("Укажите понятную причину отмены урока.");
      return;
    }
    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: formatBusinessDate(),
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "cancelled",
        records: {},
        cancellationReason: reason,
      });
      setActiveInstanceStatus("cancelled");
      setActiveCancellationReason(reason);
      setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "cancelled" }));
      setLessonAttendanceMap((previous) => ({ ...previous, [activeLesson.id]: false }));
      setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: false }));
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

  const sortedTodayLessons = useMemo(() => {
    return [...todayLessons].sort((a, b) => {
      const isAttA = !!lessonAttendanceMap[a.id];
      const isFinA = lessonStatusMap[a.id] === "completed" || !!completedLessonsMap[a.id];
      const statusA = getLessonTimeStatus(a, todayDayOfWeek, isAttA, isFinA);

      const isAttB = !!lessonAttendanceMap[b.id];
      const isFinB = lessonStatusMap[b.id] === "completed" || !!completedLessonsMap[b.id];
      const statusB = getLessonTimeStatus(b, todayDayOfWeek, isAttB, isFinB);

      const rank = (st: typeof statusA) => {
        if (st.type === "live") return 0;
        if (st.type === "upcoming") return 1;
        return 2;
      };

      const rankA = rank(statusA);
      const rankB = rank(statusB);
      if (rankA !== rankB) return rankA - rankB;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });
  }, [todayLessons, lessonAttendanceMap, completedLessonsMap, lessonStatusMap, todayDayOfWeek, clockTick]);

  const canFinishLesson = useMemo(() => {
    if (!activeLesson || !activeLesson.endTime) return false;
    if (activeInstanceStatus !== "in_progress") return false;
    if (activeLesson.dayOfWeek !== todayDayOfWeek) return false;

    const curMin = businessTimeMinutes();
    const [startH, startM] = (activeLesson.startTime || "00:00").split(":").map(Number);
    const [endH, endM] = (activeLesson.endTime || "00:00").split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    // Can be finished in the final 15 minutes of lesson or ANYTIME after end time!
    return curMin >= startMinutes && curMin >= endMinutes - 15;
  }, [activeLesson, activeInstanceStatus, todayDayOfWeek]);

  const lessonActions = useMemo<LessonAction[]>(() => {
    return sortedTodayLessons.flatMap<LessonAction>((lesson) => {
      const instanceStatus = lessonStatusMap[lesson.id] || (completedLessonsMap[lesson.id] ? "completed" : "scheduled");
      if (instanceStatus === "completed" || instanceStatus === "cancelled") return [];

      const timing = getLessonTimeStatus(
        lesson,
        todayDayOfWeek,
        Boolean(lessonAttendanceMap[lesson.id]),
        false,
      );
      if (timing.type !== "live") return [];

      if (instanceStatus === "scheduled") {
        return [{
          lesson,
          label: timing.isPastEndTime ? "Урок не был начат" : "Начните урок",
          description: timing.isPastEndTime
            ? `Время ${lesson.startTime} — ${lesson.endTime} уже прошло. Зафиксируйте фактическое начало или отмените занятие.`
            : `${lesson.groupName} · ${lesson.startTime} — ${lesson.endTime}`,
          tone: timing.isPastEndTime ? "rose" : "emerald",
        }];
      }

      if (!lessonAttendanceMap[lesson.id]) {
        return [{
          lesson,
          label: "Отметьте посещаемость",
          description: `${lesson.groupName} · урок уже начат, отметки ещё не сохранены.`,
          tone: "amber",
        }];
      }

      if (timing.isPastEndTime) {
        return [{
          lesson,
          label: "Завершите урок",
          description: `${lesson.groupName} · посещаемость сохранена, нужно зафиксировать окончание.`,
          tone: "amber",
        }];
      }

      return [];
    });
  }, [sortedTodayLessons, lessonAttendanceMap, completedLessonsMap, lessonStatusMap, todayDayOfWeek]);

  const groupFocus = useMemo(() => {
    const nowMinutes = businessTimeMinutes();
    return groups
      .filter((group) => group.status === "active")
      .map((group) => ({
        group,
        nextLesson: weekLessons
          .filter((lesson) => {
            if (lesson.groupId !== group.id) return false;
            if (lesson.occurrenceDate > businessDate) return true;
            if (lesson.occurrenceDate < businessDate) return false;
            const [hour, minute] = lesson.startTime.split(":").map(Number);
            return (hour || 0) * 60 + (minute || 0) >= nowMinutes;
          })
          .sort((a, b) => `${a.occurrenceDate}T${a.startTime}`.localeCompare(`${b.occurrenceDate}T${b.startTime}`))[0] || null,
      }))
      .sort((a, b) => {
        if (!a.nextLesson) return 1;
        if (!b.nextLesson) return -1;
        return `${a.nextLesson.occurrenceDate}T${a.nextLesson.startTime}`.localeCompare(
          `${b.nextLesson.occurrenceDate}T${b.nextLesson.startTime}`,
        );
      })
      .slice(0, 4);
  }, [groups, weekLessons, businessDate, clockTick]);

  const liveExamView = useMemo(() => {
    const snapshotAgeSeconds = liveExamSnapshotAt
      ? Math.max(0, Math.floor((Date.now() - liveExamSnapshotAt) / 1_000))
      : 0;
    return liveExams.map((exam) => ({
      ...exam,
      displayRemainingSeconds: exam.status === "active"
        ? Math.max(0, exam.time_remaining_seconds - snapshotAgeSeconds)
        : exam.time_remaining_seconds,
    }));
  }, [liveExams, liveExamSnapshotAt, liveExamTick]);

  const primaryLessonAction = lessonActions[0] || null;
  // A lobby is preparation, not an ongoing exam. It must not displace a
  // lesson in the teacher's "next action" card. The live panel shows only
  // running exams and their recently finalised result.
  const operationalExams = liveExamView.filter((exam) => exam.status !== "lobby");
  const activeExamAction = operationalExams.find((exam) => exam.status === "active") || null;
  // A running exam is an operational responsibility even when attendance for
  // the linked lesson is already complete.  It takes precedence over the
  // neutral "all clear" state, but never over a real overdue lesson action.
  const actionCount = lessonActions.length + (activeExamAction ? 1 : 0);

  const currentBusinessHour = Math.floor(businessTimeMinutes() / 60);
  const greeting = currentBusinessHour < 12 ? "Доброе утро" : currentBusinessHour < 18 ? "Добрый день" : "Добрый вечер";
  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "Преподаватель";

  const statCards = [
    { label: "Мои группы", value: stats.groups || 0, icon: Users, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Мои ученики", value: stats.students || 0, icon: GraduationCap, color: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { label: "Уроков сегодня", value: todayLessons.length, icon: CalendarIcon, color: "from-violet-500 to-purple-600", bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Требуют действия", value: actionCount, icon: ClipboardCheck, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", iconColor: "text-amber-600" },
  ];

  const activeLessonStatus = useMemo(() => {
    if (!activeLesson) return null;
    return getLessonTimeStatus(
      activeLesson,
      todayDayOfWeek,
      isAttendanceSaved || !!lessonAttendanceMap[activeLesson.id],
      activeInstanceStatus === "completed"
    );
  }, [activeLesson, todayDayOfWeek, isAttendanceSaved, lessonAttendanceMap, activeInstanceStatus]);

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
    <div className="space-y-8 w-full max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {greeting}, {displayName}! 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Вот ваша сводка на сегодня,{" "}
            {formatBusinessDateLabel({
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      {dashboardError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
          <span>{dashboardError}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs relative overflow-hidden group hover:border-slate-200 transition-all"
          >
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-slate-50 opacity-60 pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-6 h-6 ${s.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{s.label}</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Main content) */}
        <div className="lg:col-span-2 space-y-8">
          {/* One explicit next step prevents the dashboard from becoming a wall of passive figures. */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary-50/80" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${primaryLessonAction?.tone === "rose" ? "bg-rose-100 text-rose-700" : primaryLessonAction?.tone === "amber" ? "bg-amber-100 text-amber-700" : activeExamAction ? "bg-primary-100 text-primary-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {primaryLessonAction ? <ClipboardCheck className="h-6 w-6" /> : activeExamAction ? <Radio className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ближайшее действие</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {primaryLessonAction?.label || (activeExamAction ? "Сейчас проводится экзамен" : "На сегодня всё закрыто")}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {primaryLessonAction?.description || (activeExamAction
                      ? `${activeExamAction.title}${activeExamAction.group_name ? ` · ${activeExamAction.group_name}` : ""}. Осталось ${formatCountdown(activeExamAction.displayRemainingSeconds)}.`
                      : "Нет незавершённых уроков или отметок, требующих вашего внимания.")}
                  </p>
                </div>
              </div>
              {primaryLessonAction ? (
                <button
                  type="button"
                  onClick={() => setActiveLesson(primaryLessonAction.lesson)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
                >
                  Открыть урок <ArrowRight className="h-4 w-4" />
                </button>
              ) : activeExamAction ? (
                <Link
                  href={`/teacher/exams/${activeExamAction.exam_id}`}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700"
                >
                  Открыть экзамен <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/teacher/schedule"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                >
                  Открыть расписание <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <Users className="h-5 w-5 text-primary-600" />
                  Группы в фокусе
                </h2>
                <p className="mt-1 text-sm text-slate-500">Ближайшее занятие по каждой активной группе.</p>
              </div>
              <Link href="/teacher/groups" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary-600 transition-colors hover:text-primary-700">
                Все группы <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {groupFocus.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-400">
                <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Нет активных групп
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {groupFocus.map(({ group, nextLesson }) => (
                  <Link
                    key={group.id}
                    href={`/teacher/groups/${group.id}`}
                    className="group rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-900 transition-colors group-hover:text-primary-700">{group.name}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{group.class_level ? `${group.class_level} класс · ` : ""}{group.student_count} учеников</p>
                      </div>
                      <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500 shadow-2xs ring-1 ring-slate-100">
                        {group.class_level ? `${group.class_level} кл` : "Группа"}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                      {nextLesson ? (
                        <span className="truncate">
                          {formatIsoDateLabel(nextLesson.occurrenceDate, { weekday: "short", day: "numeric", month: "short" })} · {nextLesson.startTime}
                          {nextLesson.isRescheduled ? " · перенесено" : ""}
                        </span>
                      ) : (
                        <span>Занятий в ближайшие 7 дней нет</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Live Schedule Widget) */}
        <div className="flex flex-col gap-8">
          <div className="order-2 overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <Radio className="h-5 w-5 text-primary-600" />
                  Экзамен сейчас
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Оперативный статус — без аналитических оценок.</p>
              </div>
              <Link href="/teacher/exams" className="shrink-0 text-xs font-bold text-primary-600 hover:text-primary-700">
                Все экзамены
              </Link>
            </div>

            {liveExamError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-900">
                {liveExamError}
              </div>
            ) : operationalExams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                <FileCheck2 className="mx-auto mb-2 h-7 w-7 opacity-40" />
                Сейчас нет идущих экзаменов
              </div>
            ) : (
              <div className="space-y-3">
                {operationalExams.slice(0, 2).map((exam) => {
                  const isActive = exam.status === "active";
                  const isLobby = exam.status === "lobby";
                  const isClosed = exam.status === "closed";
                  const isNearDeadline = isActive && exam.displayRemainingSeconds > 0 && exam.displayRemainingSeconds <= 5 * 60;
                  const timerReachedZero = isActive && exam.displayRemainingSeconds === 0;

                  return (
                    <div
                      key={exam.exam_id}
                      className={`rounded-2xl border p-4 ${
                        isClosed
                          ? "border-emerald-200 bg-emerald-50/60"
                          : isNearDeadline || timerReachedZero
                          ? "border-amber-200 bg-amber-50/70"
                          : isActive
                          ? "border-primary-200 bg-primary-50/50"
                          : "border-violet-200 bg-violet-50/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{exam.title}</p>
                          {exam.group_name && <p className="mt-0.5 truncate text-xs text-slate-600">{exam.group_name}</p>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                          isClosed
                            ? "bg-emerald-100 text-emerald-800"
                            : isNearDeadline || timerReachedZero
                            ? "bg-amber-100 text-amber-800"
                            : isActive
                            ? "bg-primary-100 text-primary-700"
                            : "bg-violet-100 text-violet-700"
                        }`}>
                          {isClosed ? "Завершён" : timerReachedZero ? "Подтверждаем" : isNearDeadline ? "Скоро конец" : isActive ? "Идёт" : "Ожидание"}
                        </span>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                            {isClosed ? "Итог" : isLobby ? "Старт экзамена" : timerReachedZero ? "Время истекло" : "До завершения"}
                          </p>
                          <p className={`mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums ${
                            isClosed ? "text-emerald-800" : isNearDeadline || timerReachedZero ? "text-amber-900" : "text-slate-900"
                          }`}>
                            {isClosed ? <CheckCircle2 className="h-4 w-4" /> : <TimerReset className="h-4 w-4" />}
                            {isClosed ? "Экзамен завершён" : isLobby ? `Лимит ${formatCountdown(exam.total_time_seconds)}` : timerReachedZero ? "Ожидаем сервер" : formatCountdown(exam.displayRemainingSeconds)}
                          </p>
                        </div>
                        <Link href={`/teacher/exams/${exam.exam_id}`} className="text-xs font-bold text-primary-700 hover:text-primary-800">
                          Открыть
                        </Link>
                      </div>

                      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200/80 rounded-xl border border-white/80 bg-white/75 py-2.5 text-center">
                        <div className="px-1">
                          <p className="text-base font-bold text-slate-900">{exam.connected_count}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-500">Подключились</p>
                        </div>
                        <div className="px-1">
                          <p className="text-base font-bold text-slate-900">{exam.solving_count}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-500">Решают</p>
                        </div>
                        <div className="px-1">
                          <p className="text-base font-bold text-slate-900">{exam.submitted_count}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-500">Сдали</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {operationalExams.length > 2 && (
                  <Link href="/teacher/exams" className="block text-center text-xs font-bold text-primary-600 hover:text-primary-700">
                    Ещё экзаменов: {operationalExams.length - 2}
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="order-1 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 w-full">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-violet-600" />
                Расписание на сегодня
              </h2>
            </div>

            {sortedTodayLessons.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                На сегодня уроков нет
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedTodayLessons.map((l) => {
                  const isAttSaved = !!lessonAttendanceMap[l.id];
                  const instanceStatus = lessonStatusMap[l.id] || (completedLessonsMap[l.id] ? "completed" : "scheduled");
                  const isFinished = instanceStatus === "completed";
                  const isCancelled = instanceStatus === "cancelled";
                  const status = getLessonTimeStatus(l, todayDayOfWeek, isAttSaved, isFinished);

                  return (
                    <div
                      key={l.id}
                      onClick={() => setActiveLesson(l)}
                      className={`p-3.5 rounded-2xl border transition-all block group cursor-pointer ${
                        isCancelled
                          ? "bg-slate-50 border-slate-200/70 opacity-75 hover:opacity-100 border-l-4 border-l-slate-400"
                          : status.type === "live"
                          ? status.isPastEndTime && !isAttSaved
                            ? "bg-white border-rose-300 shadow-sm border-l-4 border-l-rose-500 hover:border-rose-400 ring-1 ring-rose-500/10"
                            : status.isPastEndTime && isAttSaved
                            ? "bg-white border-amber-300 shadow-sm border-l-4 border-l-amber-500 hover:border-amber-400 ring-1 ring-amber-500/10"
                            : "bg-white border-emerald-300 shadow-sm border-l-4 border-l-emerald-500 hover:border-emerald-400 ring-1 ring-emerald-500/10"
                          : status.type === "upcoming" && status.diffMinutes <= 60
                          ? "bg-white border-amber-200 shadow-2xs border-l-4 border-l-amber-500 hover:border-amber-300 hover:shadow-sm"
                          : status.type === "upcoming"
                          ? "bg-white border-slate-200 shadow-2xs border-l-4 border-l-blue-500 hover:border-blue-300 hover:shadow-sm"
                          : "bg-slate-50/70 border-slate-200/60 opacity-75 hover:opacity-100 hover:bg-white border-l-4 border-l-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <p className="font-bold text-sm text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                          {l.groupName}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 shadow-2xs">
                              <X className="w-3 h-3" />
                              Отменён
                            </span>
                          ) : isFinished ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/60 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-slate-400" />
                              Завершён
                            </span>
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
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                Идёт урок
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs group-hover:from-emerald-700 group-hover:to-teal-700 transition-all">
                                <Play className="w-3 h-3 fill-white" />
                                Начать урок
                              </span>
                            )
                          ) : status.type === "upcoming" ? (
                            status.diffMinutes <= 60 ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Через {status.diffMinutes} мин
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs">
                                <CalendarIcon className="w-3 h-3 text-blue-600" />
                                В {l.startTime}
                              </span>
                            )
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        {l.format === "online" ? (
                          <span className="flex items-center gap-1.5 text-purple-600 font-medium">
                            <Video className="w-3.5 h-3.5" /> Zoom
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" /> {l.room}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mt-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {l.startTime} — {l.endTime}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              href="/teacher/schedule"
              className="w-full mt-4 py-2.5 rounded-xl border border-slate-200 hover:border-primary-200 hover:bg-primary-50/50 text-slate-700 hover:text-primary-700 font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить занятие в календарь
            </Link>
          </div>
        </div>

      </div>

      {/* MODAL: LESSON DETAILS & ATTENDANCE ON DASHBOARD */}
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
                      {DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name || "День урока"} · {activeLesson.startTime} — {activeLesson.endTime}
                    </span>
                    <div className="flex items-center gap-2.5 mt-1">
                      <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                        {activeLesson.groupName}
                      </h3>
                      {activeLesson.classLevel && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-violet-50 text-violet-700 border border-violet-200/60">
                          {activeLesson.classLevel} класс
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      {activeLesson.format === "online" ? (
                        <>
                          <Video className="w-3.5 h-3.5 text-purple-600" /> Zoom класс
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3.5 h-3.5 text-slate-400" /> {activeLesson.room || "Кабинет не указан"}
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
                      {activeInstanceStatus === "cancelled" ? (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                              <X className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900">Урок отменён</p>
                              <p className="text-xs text-slate-600 mt-0.5">Причина: {activeCancellationReason || "не указана"}</p>
                            </div>
                          </div>
                        </div>
                      ) : activeInstanceStatus === "completed" ? (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">Урок завершён</p>
                            <p className="text-xs text-slate-600 mt-0.5">Отметки зафиксированы. Для изменения нужен контролируемый административный доступ.</p>
                          </div>
                        </div>
                      ) : isAttendanceSaved && Object.keys(attendance).length > 0 ? (
                        /* Saved attendance status card */
                        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <CheckCheck className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-emerald-900">
                                  {activeLesson && activeLesson.dayOfWeek === todayDayOfWeek && activeLessonStatus?.type === "live"
                                    ? "Идёт урок · Посещаемость отмечена"
                                    : "Посещаемость отмечена"}
                                </p>
                                {activeLesson && activeLesson.dayOfWeek === todayDayOfWeek && activeLessonStatus?.type === "live" && (
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
                      ) : activeInstanceStatus === "in_progress" ? (
                        <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <Play className="w-5 h-5 fill-current" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">Урок начат</p>
                              <p className="text-xs text-emerald-700 mt-0.5 font-medium">Заполните и сохраните отметки учеников, затем завершите урок.</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsMarkingAttendance(true)}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs"
                          >
                            Заполнить посещаемость
                          </button>
                        </div>
                      ) : activeLessonStatus?.type === "upcoming" ? (
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
                                Начало в {activeLesson.startTime} (через {activeLessonStatus.diffMinutes} мин). Начать урок и отметить посещаемость можно будет в {activeLesson.startTime}.
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
                      ) : activeLessonStatus?.isPastEndTime ? (
                        /* The occurrence was never started.  Do not bypass the
                           actual-start record by opening attendance directly. */
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
                          {!isAttendanceSaved && (
                            <button
                              type="button"
                              onClick={handleStartLesson}
                              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs"
                            >
                              Начать урок сейчас
                            </button>
                          )}
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

                {activeInstanceStatus !== "completed" && activeInstanceStatus !== "cancelled" && !isMarkingAttendance && (
                  <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    {!isCancellingLesson ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCancellingLesson(true);
                          setAttendanceError(null);
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Отменить этот экземпляр урока
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-bold text-slate-900">Отмена урока</p>
                          <p className="mt-0.5 text-xs text-slate-500">Причина сохранится в журнале. Отменённый урок нельзя открыть повторно.</p>
                        </div>
                        <textarea
                          value={cancellationReason}
                          onChange={(event) => setCancellationReason(event.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder="Например: занятие перенесено по просьбе группы"
                          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCancellingLesson(false);
                              setCancellationReason("");
                            }}
                            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Не отменять
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelLesson}
                            disabled={savingAttendance || cancellationReason.trim().length < 3}
                            className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingAttendance ? "Сохранение..." : "Подтвердить отмену"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions footer */}
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  <Link
                    href={`/teacher/groups/${activeLesson.groupId || ""}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                  >
                    Перейти в группу
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <div className="flex items-center gap-2">
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
    </div>
  );
}
