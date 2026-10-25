"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { formatAttendanceSummary } from "@/lib/attendance-summary";
import { MARK_CELL_LABEL, MARK_MENU_LABEL } from "@/lib/attendance-marks";
import {
  examsApi,
  orgApi,
  type AttendanceStatus,
  type GroupInfo,
  type LessonAttendanceStatus,
  type LiveExamDashboardSummary,
  type OpenAttendanceAction,
  type ScheduleOccurrence,
  type StudentInGroup,
} from "@/lib/api";
import { pollFailure } from "@/lib/staff-busy";
import {
  businessDayOfWeek,
  businessGreeting,
  businessTimeMinutes,
  formatBusinessDate,
  formatBusinessDateLabel,
  formatIsoDateLabel,
  formatMinutesUntil,
  isoDateDayOfWeek,
} from "@/lib/business-time";
import { openLessonBadge } from "@/lib/open-lessons";
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
import { ExcuseReasonField } from "@/components/attendance/excuse-reason-field";
import { collectExcuseReasons, firstMissingExcuseReason } from "@/lib/attendance-excuses";
import { LessonPanelError } from "@/components/attendance/lesson-panel-error";
import { CancellationKindField } from "@/components/attendance/cancellation-kind-field";
import { cancellationKindBody, canChooseCancellationKind, DEFAULT_CANCELLATION_KIND, type CancellationKind } from "@/lib/payf";
import { canFinishLessonNow, lessonActionTarget, lessonDateRelation, serverErrorMessage, startBlockedReason } from "@/lib/lesson-actions";
import { useNow } from "@/lib/use-now";
import { useRouter } from "next/navigation";
import { pluralRu } from "@/lib/payments";
import { staffDisplayName } from "@/lib/staff-name";
import { useScrollLock } from "@/components/ui/modal";
import { roomLabel } from "@/lib/schedule-slots";
import { useLessonMarksOps } from "@/lib/use-lesson-marks-ops";
import { AttendanceConflictDialog, LiveExamConfirmDialog } from "@/components/attendance/attendance-ops-dialogs";
import { examSyncNotice, lessonFailure, openLessonAccess } from "@/lib/attendance-ops";
import { LESSON_TOO_OLD_HINT, LESSON_TOO_OLD_TEXT, NO_STUDENTS_FINISH_TEXT, NO_STUDENTS_START_TEXT } from "@/lib/ops-errors";
import { lessonBelongsToOther, notYourLessonText } from "@/lib/lesson-teacher";
import type { LessonTeacherInfo } from "@/lib/ops-b-types";
import { createToast, narrowToFrozenRoster, withoutPaused, occurrenceChips, readLessonRoster, rosterFromJournal, rosterSource, showsGroupLinks, substituteGroupLabel, type RosterSource } from "@/lib/substitutions";
import type { SubstitutionOutcome, SubstitutionRequestMark } from "@/lib/substitution-types";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { TeacherLessonControls } from "@/components/substitutions/teacher-lesson-controls";
import { useToast } from "@/components/ui/toast";
import { RequestDialog } from "@/components/substitutions/request-dialog";
import { TeacherRequestsBlock } from "@/components/substitutions/teacher-requests-block";

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
  /** The actual date for an unresolved historical lesson instance. */
  occurrenceDate?: string;
  /** LOGIC-B (O5) / B2: who teaches this lesson, and the request «Не смогу провести» (sent by the dashboard summary). */
  isSubstitution?: boolean;
  teacherId?: string | null;
  teacherName?: string | null;
  defaultTeacherId?: string | null;
  substitutionRequest?: SubstitutionRequestMark | null;
  substitutionOutcome?: SubstitutionOutcome | null;
}

type LessonAction = {
  lesson: LessonSummary;
  label: string;
  description: string;
  /** Compact copy for the single primary dashboard card. */
  cardLabel?: string;
  cardDescription?: string;
  tone: "rose" | "amber" | "emerald";
  /** Past occurrence without a journal; requires an explicit reconciliation. */
  actionType?: OpenAttendanceAction["actionType"];
  sourceAction?: OpenAttendanceAction;
  markedCount?: number;
  rosterCount?: number;
  remainingCount?: number;
  /** Decision 7: older than 7 days - only an administrator or the owner closes it (the row is grey, without buttons). */
  locked?: boolean;
};

function lessonFromAttendanceAction(action: OpenAttendanceAction): LessonSummary {
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
    topic: action.topic || undefined,
    occurrenceDate: action.lessonDate,
  };
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

function formatExamQueueCount(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word = remainder100 >= 11 && remainder100 <= 14
    ? "экзаменов"
    : remainder10 === 1
      ? "экзамен"
      : remainder10 >= 2 && remainder10 <= 4
        ? "экзамена"
        : "экзаменов";
  return `${count} ${word}`;
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
  const router = useRouter();
  const { user } = useAuthStore();
  const { showToast, toastNode } = useToast();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ groups: 0, students: 0 });
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [todayLessons, setTodayLessons] = useState<LessonSummary[]>([]);
  const [weekLessons, setWeekLessons] = useState<ScheduleOccurrence[]>([]);
  const [lessonAttendanceMap, setLessonAttendanceMap] = useState<Record<string, boolean>>({});
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<string, boolean>>({});
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, LessonAttendanceStatus>>({});
  const [openAttendanceActions, setOpenAttendanceActions] = useState<OpenAttendanceAction[]>([]);
  const [openAttendanceActionsAvailable, setOpenAttendanceActionsAvailable] = useState<boolean | null>(null);
  const [attendanceSnapshotAvailable, setAttendanceSnapshotAvailable] = useState<boolean | null>(null);
  const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
  const [missedLessonAction, setMissedLessonAction] = useState<OpenAttendanceAction | null>(null);
  const [isCancellingMissedLesson, setIsCancellingMissedLesson] = useState(false);
  const [missedLessonCancellationReason, setMissedLessonCancellationReason] = useState("");
  const [missedLessonError, setMissedLessonError] = useState<string | null>(null);
  const [isResolvingMissedLesson, setIsResolvingMissedLesson] = useState(false);
  const [liveExams, setLiveExams] = useState<LiveExamDashboardSummary[]>([]);
  const [liveExamSnapshotAt, setLiveExamSnapshotAt] = useState<number | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  /** O8: «Урок завершён, но проверить экзамены не удалось.» - a notice that outlives the closed lesson panel. */
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);
  const [dashboardRefreshNonce, setDashboardRefreshNonce] = useState(0);
  const [liveExamError, setLiveExamError] = useState<string | null>(null);
  const [isExamQueueOpen, setIsExamQueueOpen] = useState(false);

  // Selected lesson modal on dashboard
  const [activeLesson, setActiveLesson] = useState<LessonSummary | null>(null);
  const [activeInstanceStatus, setActiveInstanceStatus] = useState<LessonAttendanceStatus>("scheduled");
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
  // LOGIC-B: the version of the lesson record, the conflict of two editors, the exam a finish waits for.
  const marksOps = useLessonMarksOps();
  const [activeTeacherInfo, setActiveTeacherInfo] = useState<LessonTeacherInfo | null>(null);
  /** LOGIC-B2: the request «Не смогу провести» for the open lesson, and where its roster comes from (the group page or only the journal). */
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  /** Only a teacher asks for a substitute; an owner / administrator assigns one himself («Заменить преподавателя»). */
  const canAskForSubstitute = (user?.org_role ?? user?.role) === "teacher";
  const [activeRequestMark, setActiveRequestMark] = useState<SubstitutionRequestMark | null>(null);
  const [activeRosterSource, setActiveRosterSource] = useState<RosterSource>("group");
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [isCancellingLesson, setIsCancellingLesson] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationKind, setCancellationKind] = useState<CancellationKind>(DEFAULT_CANCELLATION_KIND);
  const canChooseKind = canChooseCancellationKind(user);
  const [missedLessonKind, setMissedLessonKind] = useState<CancellationKind>(DEFAULT_CANCELLATION_KIND);
  useEffect(() => { if (!isCancellingLesson) setCancellationKind(DEFAULT_CANCELLATION_KIND); }, [isCancellingLesson]);       // every cancellation starts with «по вине центра»
  useEffect(() => { if (!isCancellingMissedLesson) setMissedLessonKind(DEFAULT_CANCELLATION_KIND); }, [isCancellingMissedLesson]);
  const [lessonExamBinding, setLessonExamBinding] = useState<{
    loading: boolean;
    attached: boolean;
    canCancel: boolean;
    examTitle?: string;
    message?: string | null;
  } | null>(null);
  const [businessDate, setBusinessDate] = useState(() => formatBusinessDate());
  const [clockTick, setClockTick] = useState(0);
  const [liveExamTick, setLiveExamTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // A busy server (503 after the client's own repeats) is a passing moment: the last verified state stays on screen
  // without a banner; the banner appears when the failure repeats at the next tick (ROADMAP #95 R3 F2).
  const liveExamFailureStreak = useRef(0);
  const liveExamVerified = useRef(false);
  const refreshLiveExams = useCallback(async () => {
    try {
      const summary = await examsApi.getLiveDashboardSummary();
      setLiveExams(summary);
      setLiveExamSnapshotAt(Date.now());
      setLiveExamError(null);
      liveExamFailureStreak.current = 0;
      liveExamVerified.current = true;
    } catch (err) {
      const failure = pollFailure(err, liveExamFailureStreak.current, liveExamVerified.current);
      liveExamFailureStreak.current = failure.streak;
      if (failure.quiet) return;
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

  // The dialogs are portalled to <body>: lock the page scroll while any of them is open (shared hook).
  useScrollLock(Boolean(activeLesson || isActionCenterOpen || missedLessonAction || isExamQueueOpen));

  // Escape key handler (the move dialog of TeacherMoveControl, above the panel, keeps the key to itself)
  const moveHoldsEscape = useRef(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // a conflict of marks / a running exam is being decided in a dialog over the panel: the panel stays
        if (marksOps.conflict || marksOps.liveExams || moveHoldsEscape.current) return;
        if (isExamQueueOpen) setIsExamQueueOpen(false);
        else if (missedLessonAction) setMissedLessonAction(null);
        else if (isActionCenterOpen) setIsActionCenterOpen(false);
        else setActiveLesson(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActionCenterOpen, isExamQueueOpen, missedLessonAction, marksOps.conflict, marksOps.liveExams]);

  const todayDayOfWeek = businessDayOfWeek();

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setDashboardError(null);
      try {
        const todayStr = businessDate;
        const summary = await orgApi.getTeacherDashboardSummary(todayStr);
        // The server sends active groups only. Filtering at the UI boundary as
        // well protects the KPI from a legacy or stale response.
        const activeGroups = summary.groups.filter((group) => group.status === "active");
        setGroups(activeGroups);
        setStats({
          groups: activeGroups.length,
          // A student of two of the teacher's groups is one student: the server
          // counts them once. Summing the per-group rosters would count twice.
          students: typeof summary.studentCount === "number"
            ? summary.studentCount
            : activeGroups.reduce((acc: number, group: GroupInfo) => acc + (group.student_count || 0), 0),
        });

        setTodayLessons(
          summary.todayLessons
            .filter((lesson) => lesson)
            .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")) as LessonSummary[],
        );
        setWeekLessons(summary.scheduleWindow);
        setOpenAttendanceActions(summary.openAttendanceActions);
        setOpenAttendanceActionsAvailable(true);

        const attendanceMap: Record<string, boolean> = {};
        const completedMap: Record<string, boolean> = {};
        const statuses: Record<string, LessonAttendanceStatus> = {};
        for (const state of summary.attendanceStates) {
          if (state.hasSavedRecords) attendanceMap[state.lessonId] = true;
          if (state.status) statuses[state.lessonId] = state.status;
          if (state.status === "completed") completedMap[state.lessonId] = true;
          if (state.status === "in_progress") completedMap[state.lessonId] = false;
        }
        setLessonAttendanceMap(attendanceMap);
        setCompletedLessonsMap(completedMap);
        setLessonStatusMap(statuses);
        setAttendanceSnapshotAvailable(true);
      } catch (err) {
        console.error("Failed to load teacher stats:", err);
        // Retain the last verified values. An absent response must not make
        // an already started lesson look like a scheduled one.
        setAttendanceSnapshotAvailable(false);
        setOpenAttendanceActionsAvailable(false);
        setDashboardError(getDataLoadErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id, businessDate, dashboardRefreshNonce]);

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
      return;
    }
    setLoadingStudents(true);
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
    const lessonDate = activeLesson.occurrenceDate || businessDate;
    const isTodayLesson = lessonDate === businessDate;
    const lessonKey = `${lessonDate}_${activeLesson.id}`;

    // LOGIC-B2: the lesson of a substitute (or of a former teacher) is not in «his» groups and he has no group page (it answers 403):
    // the roster of the lesson comes with the journal (`lessonRoster`), and no call goes to the group.
    const source = rosterSource({ isManager: user?.org_role === "owner" || user?.org_role === "admin" || user?.role === "owner", groupId: activeLesson.groupId, ownGroupIds: groups.map((group) => group.id) });
    setActiveRosterSource(source);
    readLessonRoster({
      source,
      groupId: activeLesson.groupId,
      getGroup: (id) => orgApi.getGroup(id),
      getJournal: () => orgApi.getGroupAttendance(activeLesson.groupId, { dateFrom: lessonDate, dateTo: lessonDate }),
    })
      .then(([g, att]) => {
        setActiveRequestMark(att?.substitutionRequests?.[lessonKey] ?? null);
        if (source === "journal") {
          setGroupStudents(rosterFromJournal(att?.lessonRoster));
        } else if (g?.students) {
          // Attendance belongs to the roster frozen when the lesson was
          // started. In the rare case of a later transfer, do not let the
          // current group roster add/remove people from this open lesson.
          const hasFrozenRoster = Boolean(
            att?.rosterStudentIds
            && Object.prototype.hasOwnProperty.call(att.rosterStudentIds, lessonKey),
          );
          const frozenRosterIds = att?.rosterStudentIds?.[lessonKey] || [];
          if (hasFrozenRoster) {
            const currentById = new Map(g.students.map((student) => [student.id, student]));
            const historicalById = new Map((att?.historicalStudents || []).map((student) => [
              student.id,
              {
                id: student.id,
                first_name: student.first_name || "",
                last_name: student.last_name || "",
                full_name: student.full_name || "Ученик",
                class_level: student.class_level || 0,
                status: "active",
                display_id: student.display_id || null,
                student_phone: null,
                joined_at: null,
                last_theta: null,
                last_level: null,
                last_diagnosed_at: null,
              } satisfies StudentInGroup,
            ]));
            setGroupStudents(frozenRosterIds.flatMap((studentId) => {
              const student = currentById.get(studentId) || historicalById.get(studentId);
              return student ? [student] : [];
            }));
          } else {
            // a student on a pause today is not in the class (before the start the group list still holds him)
            setGroupStudents(isTodayLesson ? withoutPaused(g.students) : g.students);
          }
        } else {
          setGroupStudents([]);
        }

        const status = att?.statuses?.[lessonKey] || "scheduled";
        marksOps.reset(att?.versions?.[lessonKey], att?.records?.[lessonKey] || {});
        setActiveTeacherInfo(att?.lessonTeachers?.[lessonKey] ?? null);
        setActiveInstanceStatus(status);
        setActiveCancellationReason(att?.cancellationReasons?.[lessonKey] || null);
        if (isTodayLesson) {
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
            if (isTodayLesson) {
              setLessonAttendanceMap((prev) => ({ ...prev, [activeLesson.id]: true }));
            }
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
  }, [activeLesson, businessDate]);

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
    (lesson: Pick<LessonSummary, "id" | "groupId" | "endTime">): LessonSummary | null => {
      const [endHour, endMinute] = (lesson.endTime || "00:00").split(":").map(Number);
      const endMinutes = (endHour || 0) * 60 + (endMinute || 0);
      const lessonTeacherId = groups.find((group) => group.id === lesson.groupId)?.teacher_id;
      if (!lessonTeacherId) return null;

      return [...todayLessons]
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
    [todayLessons, lessonStatusMap, completedLessonsMap, groups],
  );

  /**
   * One entry point for "do this action": the card and the action centre must
   * not branch differently. A missed lesson cannot be started (the server
   * allows it on the lesson's day only), so it opens the reconciliation
   * dialog; any other action opens the lesson panel.
   */
  const openLessonAction = (action: LessonAction) => {
    const target = lessonActionTarget(action);
    if (target.kind === "reconcile") {
      setActiveLesson(null);
      setMissedLessonError(null);
      setIsCancellingMissedLesson(false);
      setMissedLessonCancellationReason("");
      setMissedLessonAction(target.source);
      return;
    }
    setActiveLesson(target.lesson);
  };

  const handleStartLesson = async () => {
    if (!activeLesson || activeInstanceStatus !== "scheduled") return;

    const blocked = startBlockedReason(lessonDateRelation(activeLesson.occurrenceDate || businessDate, businessDate));
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

    setAttendanceError(null);
    setSavingAttendance(true);
    try {
      const started = await orgApi.startGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate || businessDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
      });
      marksOps.noteVersion(started);
      // the roster is frozen by the start: a student on a pause that day is not in it
      {
        const startedDate = activeLesson.occurrenceDate || businessDate;
        const att = await orgApi.getGroupAttendance(activeLesson.groupId, { dateFrom: startedDate, dateTo: startedDate }).catch(() => null);
        const frozen = att?.rosterStudentIds?.[`${startedDate}_${activeLesson.id}`];
        if (frozen) setGroupStudents((previous) => narrowToFrozenRoster(previous, frozen));
      }
      setActiveInstanceStatus("in_progress");
      if (!activeLesson.occurrenceDate || activeLesson.occurrenceDate === businessDate) {
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "in_progress" }));
      }
      void orgApi.getOpenAttendanceActions().then(setOpenAttendanceActions).catch(() => undefined);
      setIsMarkingAttendance(true);
    } catch (err) {
      console.error("Failed to start lesson:", err);
      setAttendanceError(lessonFailure(err, "start", "Не удалось начать урок. Данные не изменены.").text);
    } finally {
      setSavingAttendance(false);
    }
  };

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
      const lesson = lessonFromAttendanceAction(missedLessonAction);
      const refreshedActions = await orgApi.getOpenAttendanceActions();
      setOpenAttendanceActions(refreshedActions);
      setOpenAttendanceActionsAvailable(true);
      setMissedLessonAction(null);
      setIsCancellingMissedLesson(false);
      // The next dialog is a historical attendance journal, not a delayed
      // start. The API keeps started_at empty and records reconciliation.
      setActiveLesson(lesson);
    } catch (err) {
      console.error("Failed to reconcile missed lesson:", err);
      setMissedLessonError(lessonFailure(err, "reconcile", "Не удалось открыть журнал пропущенного урока. Данные не изменены.").text);
    } finally {
      setIsResolvingMissedLesson(false);
    }
  };

  const handleCancelMissedLesson = async () => {
    if (!missedLessonAction) return;
    const reason = missedLessonCancellationReason.trim();
    if (reason.length < 3) {
      setMissedLessonError("Укажите причину отмены — не менее 3 символов.");
      return;
    }
    setMissedLessonError(null);
    setIsResolvingMissedLesson(true);
    try {
      await orgApi.cancelMissedGroupAttendance(missedLessonAction.groupId, {
        lessonDate: missedLessonAction.lessonDate,
        lessonId: missedLessonAction.lessonId,
        cancellationReason: reason,
        ...cancellationKindBody(missedLessonKind, canChooseKind),
      });
      setOpenAttendanceActions((previous) => previous.filter((action) => !(
        action.actionType === "missed"
        && action.groupId === missedLessonAction.groupId
        && action.lessonId === missedLessonAction.lessonId
        && action.lessonDate === missedLessonAction.lessonDate
      )));
      setMissedLessonAction(null);
      setIsCancellingMissedLesson(false);
      setMissedLessonCancellationReason("");
      setDashboardRefreshNonce((value) => value + 1);
    } catch (err) {
      console.error("Failed to cancel missed lesson:", err);
      setMissedLessonError(lessonFailure(err, "cancel", "Не удалось отменить пропущенный урок. Данные не изменены.").text);
    } finally {
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
    // «Оставить мои» repeats this very action with the merged marks
    const marks = override ?? attendance;
    if (override) setAttendance(override);

    // Attendance is allowed only after the server recorded the real start of
    // this lesson. This is a client-side guard; the API enforces it too.
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

    setSavingAttendance(true);
    try {
      const saved = await orgApi.saveGroupAttendance(activeLesson.groupId, {
        lessonDate: activeLesson.occurrenceDate || businessDate,
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
      if (!activeLesson.occurrenceDate || activeLesson.occurrenceDate === businessDate) {
        setLessonAttendanceMap((prev) => ({ ...prev, [activeLesson.id]: true }));
      }
      setActiveInstanceStatus("in_progress");
      if (!activeLesson.occurrenceDate || activeLesson.occurrenceDate === businessDate) {
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "in_progress" }));
      }
      const activeDate = activeLesson.occurrenceDate || businessDate;
      setOpenAttendanceActions((previous) => previous.map((action) => {
        if (action.groupId !== activeLesson.groupId || action.lessonId !== activeLesson.id || action.lessonDate !== activeDate) return action;
        const rosterCount = groupStudents.length || action.rosterCount;
        const markedCount = Object.keys(marks).length;
        return {
          ...action,
          markedCount,
          rosterCount,
          remainingCount: Math.max(rosterCount - markedCount, 0),
        };
      }));
      setIsMarkingAttendance(false);
    } catch (err) {
      console.error("Failed to save attendance:", err);
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

    // O6: a lesson of an empty roster cannot be finished - «Урока не было» is the way out (the server says the same: NO_STUDENTS)
    if (groupStudents.length === 0) {
      setAttendanceError(NO_STUDENTS_FINISH_TEXT);
      return;
    }

    // A frozen empty roster is a valid historical fact. There are no records to
    // save in that case, so it must not prevent closing the lesson.
    const hasSaved = isAttendanceSaved || !!lessonAttendanceMap[activeLesson.id];
    const unmarked = groupStudents.filter((st) => !marks[st.id]);
    const hasStudentsToMark = groupStudents.length > 0;

    if (hasStudentsToMark && (!hasSaved || unmarked.length > 0)) {
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
        lessonDate: activeLesson.occurrenceDate || businessDate,
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
      if (syncNotice) setDashboardNotice(syncNotice);
      rememberSavedExcuses(prepared.reasons, marks);
      if (!activeLesson.occurrenceDate || activeLesson.occurrenceDate === businessDate) {
        setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: true }));
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "completed" }));
      }
      setOpenAttendanceActions((previous) => previous.filter(
        (action) => !(action.groupId === activeLesson.groupId && action.lessonId === activeLesson.id && action.lessonDate === (activeLesson.occurrenceDate || businessDate)),
      ));
      setActiveLesson(null);
    } catch (err) {
      console.error("Failed to sync completed status with server:", err);
      const failure = marksOps.refused(err, "finish", "Не удалось завершить урок. Отметки сохранены, попробуйте ещё раз.", marks);
      // a running exam / a conflict is decided in its dialog; anything else is the text of the panel
      if (failure.kind !== "conflict" && failure.kind !== "live_exam") setAttendanceError(excuseReasonHint(err) ?? failure.text);
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCancelLesson = async () => {
    if (!activeLesson || activeInstanceStatus === "completed" || activeInstanceStatus === "cancelled") return;
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
        lessonDate: activeLesson.occurrenceDate || businessDate,
        lessonId: activeLesson.id,
        topic: activeLesson.topic,
        status: "cancelled",
        records: {},
        cancellationReason: reason,
        ...cancellationKindBody(cancellationKind, canChooseKind),
        ...marksOps.versionBody(),
      });
      setActiveInstanceStatus("cancelled");
      setActiveCancellationReason(reason);
      if (!activeLesson.occurrenceDate || activeLesson.occurrenceDate === businessDate) {
        setLessonStatusMap((previous) => ({ ...previous, [activeLesson.id]: "cancelled" }));
        setLessonAttendanceMap((previous) => ({ ...previous, [activeLesson.id]: false }));
        setCompletedLessonsMap((previous) => ({ ...previous, [activeLesson.id]: false }));
      }
      setOpenAttendanceActions((previous) => previous.filter(
        (action) => !(action.groupId === activeLesson.groupId && action.lessonId === activeLesson.id && action.lessonDate === (activeLesson.occurrenceDate || businessDate)),
      ));
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
    if (!activeLesson || activeInstanceStatus === "completed" || activeInstanceStatus === "cancelled") return;
    setAttendanceError(null);
    setLessonExamBinding({ loading: true, attached: false, canCancel: false });
    setIsCancellingLesson(true);

    try {
      const binding = await examsApi.getLessonBinding({
        groupId: activeLesson.groupId,
        lessonId: activeLesson.id,
        lessonDate: activeLesson.occurrenceDate || businessDate,
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

  const sortedTodayLessons = useMemo(() => {
    return [...todayLessons].sort((a, b) => {
      const isAttA = !!lessonAttendanceMap[a.id];
      const lifecycleA = lessonStatusMap[a.id] || (completedLessonsMap[a.id] ? "completed" : "scheduled");
      const isFinA = lifecycleA === "completed";
      const statusA = getLessonTimeStatus(a, todayDayOfWeek, isAttA, isFinA);

      const isAttB = !!lessonAttendanceMap[b.id];
      const lifecycleB = lessonStatusMap[b.id] || (completedLessonsMap[b.id] ? "completed" : "scheduled");
      const isFinB = lifecycleB === "completed";
      const statusB = getLessonTimeStatus(b, todayDayOfWeek, isAttB, isFinB);

      const rank = (lesson: LessonSummary, lifecycle: LessonAttendanceStatus | "scheduled", timing: typeof statusA) => {
        if (lifecycle === "in_progress") return 0;
        if (lifecycle === "scheduled" && getSubsequentStartedLesson(lesson)) return 3;
        if (timing.type === "live") return 1;
        if (timing.type === "upcoming") return 2;
        return 4;
      };

      const rankA = rank(a, lifecycleA, statusA);
      const rankB = rank(b, lifecycleB, statusB);
      if (rankA !== rankB) return rankA - rankB;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });
  }, [todayLessons, lessonAttendanceMap, completedLessonsMap, lessonStatusMap, todayDayOfWeek, clockTick, getSubsequentStartedLesson]);

  // The button's time window opens by the clock, not by clicking: while a lesson panel is open the rule is
  // re-read every 30 s (the timer exists only for an open panel and is cleared when it closes).
  const finishClock = useNow(30_000, Boolean(activeLesson));
  const canFinishLesson = useMemo(() => {
    if (!activeLesson) return false;
    // A persisted lesson from an earlier date is already past its planned
    // end. It may be safely completed after the remaining attendance is
    // filled, regardless of today's weekday.
    return canFinishLessonNow({
      status: activeInstanceStatus,
      startTime: activeLesson.startTime,
      endTime: activeLesson.endTime,
      occurrenceDate: activeLesson.occurrenceDate,
      businessDate,
      nowMinutes: businessTimeMinutes(new Date(finishClock)),
      isTodayWeekday: activeLesson.dayOfWeek === todayDayOfWeek,
    });
  }, [activeLesson, activeInstanceStatus, todayDayOfWeek, businessDate, finishClock]);

  const scheduledLessonActions = useMemo<LessonAction[]>(() => {
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
        // A lesson whose time has passed is returned by the operational API
        // as a separate "missed" action. Do not offer a misleading delayed
        // start locally or duplicate the reconciliation card.
        if (timing.isPastEndTime) return [];
        if (getSubsequentStartedLesson(lesson)) return [];
        return [{
          lesson,
          label: "Начните урок",
          description: `${lesson.groupName} · ${lesson.startTime} — ${lesson.endTime}`,
          tone: "emerald",
        }];
      }

      // In-progress lessons come from the persisted open-actions endpoint.
      // It includes partial attendance and historical instances, while this
      // list only describes an actionable scheduled lesson for today.
      return [];
    });
  }, [sortedTodayLessons, lessonAttendanceMap, completedLessonsMap, lessonStatusMap, todayDayOfWeek, getSubsequentStartedLesson]);

  const openLessonActions = useMemo<LessonAction[]>(() => (
    openAttendanceActions.map((action) => {
      const isMissed = action.actionType === "missed";
      const isHistorical = action.lessonDate < businessDate;
      const hasNoRoster = !isMissed && action.rosterCount === 0;
      const lesson = lessonFromAttendanceAction(action);
      const locked = openLessonAccess(action, user?.org_role ?? null, businessDate).locked;
      const progress = hasNoRoster
        ? "На дату занятия в составе группы не было учеников — отметки не требуются."
        : action.rosterCount > 0
        ? `Отмечено ${action.markedCount} из ${action.rosterCount}${action.remainingCount > 0 ? ` · осталось ${action.remainingCount}` : ""}.`
        : "Проверьте и завершите журнал занятия.";
      return {
        lesson,
        actionType: action.actionType,
        sourceAction: action,
        // The dashboard is only an entry point. The reason and the
        // attendance rules belong in the lesson detail, not in its headline.
        cardLabel: hasNoRoster ? "Требует действия" : undefined,
        cardDescription: hasNoRoster
          ? `${action.groupName} · ${formatIsoDateLabel(action.lessonDate, { weekday: "short", day: "numeric", month: "short" })}`
          : undefined,
        label: isMissed
          ? "Разобрать пропущенный урок"
          : hasNoRoster ? "Завершите урок без отметок"
            : action.remainingCount > 0 ? "Завершите посещаемость" : "Завершите урок",
        description: isMissed
          ? `${action.groupName} · ${formatIsoDateLabel(action.lessonDate, { weekday: "short", day: "numeric", month: "short" })} · урок не был начат. Укажите, состоялся ли он.`
          : `${action.groupName} · ${formatIsoDateLabel(action.lessonDate, { weekday: "short", day: "numeric", month: "short" })} · ${progress}`,
        tone: isMissed || isHistorical ? "rose" : "amber",
        markedCount: action.markedCount,
        rosterCount: action.rosterCount,
        remainingCount: action.remainingCount,
        locked,
      };
    })
  ), [openAttendanceActions, businessDate, user?.org_role]);

  /** Decision 7: lessons older than 7 days. They stay in the list, grey and without buttons; they never become the card of the next action. */
  const lockedLessonActions = useMemo(() => openLessonActions.filter((action) => action.locked), [openLessonActions]);

  const lessonActions = useMemo<LessonAction[]>(() => (
    [...openLessonActions.filter((action) => !action.locked), ...scheduledLessonActions].sort((left, right) => {
      const leftDate = left.lesson.occurrenceDate || businessDate;
      const rightDate = right.lesson.occurrenceDate || businessDate;
      return `${leftDate}T${left.lesson.startTime}`.localeCompare(`${rightDate}T${right.lesson.startTime}`);
    })
  ), [openLessonActions, scheduledLessonActions, businessDate]);

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
  // lesson in the teacher's main "next action" card. Once its assigned
  // lesson is in the past, the lobby is no longer usable for participants:
  // it becomes a reconciliation item, not an "open lobby" card.
  const activeExamAction = liveExamView.find((exam) => exam.status === "active") || null;
  const dashboardExamRows = useMemo(() => {
    const priority = {
      active: 0,
      lobby: 1,
      needs_resolution: 2,
      today: 3,
      upcoming: 4,
      closed: 5,
    } as const;

    return liveExamView
      .map((exam) => {
        const lesson = weekLessons.find((candidate) =>
          candidate.id === exam.scheduled_lesson_id
          && candidate.occurrenceDate === exam.scheduled_lesson_date
          && candidate.groupId === exam.group_id,
        );
        const scheduledDate = exam.scheduled_lesson_date || "";
        // The persisted lifecycle state remains `lobby` until the teacher
        // transfers or cancels the exam. Its *operational* state, however,
        // changes when the linked lesson day has passed. This mirrors the
        // server-side public-lobby guard and prevents a dead access code from
        // looking like a room where students can still join.
        const state = exam.status === "active"
          ? "active"
          : exam.status === "closed"
            ? "closed"
            : scheduledDate < businessDate
              ? "needs_resolution"
              : exam.status === "lobby"
                ? "lobby"
                : scheduledDate === businessDate
                  ? "today"
                  : "upcoming";
        const lessonLabel = lesson
          ? `${formatIsoDateLabel(lesson.occurrenceDate, { weekday: "short", day: "numeric", month: "short" })} · ${lesson.startTime}–${lesson.endTime}`
          : scheduledDate
            ? formatIsoDateLabel(scheduledDate, { weekday: "short", day: "numeric", month: "short" })
            : "Занятие не выбрано";

        return { ...exam, state, lessonLabel, priority: priority[state] };
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        // Reconciliation is time-sensitive.  Showing the most recent missed
        // delivery first prevents older lobby records from hiding a prepared
        // paper package that still needs a teacher decision.
        if (left.state === "needs_resolution" && right.state === "needs_resolution") {
          return `${right.scheduled_lesson_date || ""}_${right.title}`.localeCompare(
            `${left.scheduled_lesson_date || ""}_${left.title}`,
          );
        }
        return `${left.scheduled_lesson_date || "9999-12-31"}_${left.title}`.localeCompare(
          `${right.scheduled_lesson_date || "9999-12-31"}_${right.title}`,
        );
      })
  }, [businessDate, liveExamView, weekLessons]);
  const featuredDashboardExam = dashboardExamRows[0] || null;
  const additionalDashboardExamCount = Math.max(0, dashboardExamRows.length - 1);
  // "Требуют действия" is a finite queue of attendance/lesson closures.
  // An ongoing exam has its own live block and must not create a hidden item
  // in this action centre.
  const actionCount = dashboardError || openAttendanceActionsAvailable === false ? null : lessonActions.length;

  const greeting = businessGreeting(); // Tashkent hour, whatever the browser zone is
  const displayName = staffDisplayName(user, "Преподаватель");

  const statCards = [
    { label: "Мои группы", value: stats.groups || 0, icon: Users, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Мои ученики", value: stats.students || 0, icon: GraduationCap, color: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { label: "Уроков сегодня", value: todayLessons.length, icon: CalendarIcon, color: "from-violet-500 to-purple-600", bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Требуют действия", value: actionCount ?? "—", icon: ClipboardCheck, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", iconColor: "text-amber-600", onClick: (actionCount !== null && actionCount > 0) || lockedLessonActions.length > 0 ? () => setIsActionCenterOpen(true) : undefined },
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

  // The calendar day decides what the panel may offer: a lesson starts on its own day only.
  const activeLessonDate = activeLesson ? activeLesson.occurrenceDate || businessDate : null;
  const activeLessonRelation = activeLessonDate ? lessonDateRelation(activeLessonDate, businessDate) : null;
  // The never-started lesson of a past day, which the teacher can still settle as "missed".
  const activeMissedAction = activeLesson && activeLessonRelation === "past"
    ? openAttendanceActions.find((action) => (
      action.actionType === "missed"
      && action.groupId === activeLesson.groupId
      && action.lessonId === activeLesson.id
      && action.lessonDate === activeLessonDate
    )) ?? null
    : null;

  const activeSubsequentLesson = useMemo(
    () => activeLesson && activeInstanceStatus === "scheduled"
      ? getSubsequentStartedLesson(activeLesson)
      : null,
    [activeLesson, activeInstanceStatus, getSubsequentStartedLesson],
  );

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

      {dashboardNotice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{dashboardNotice}</span>
          <button type="button" onClick={() => setDashboardNotice(null)} aria-label="Скрыть" className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {dashboardError && (
        <DataLoadError
          compact
          title="Рабочая сводка не обновлена"
          message={`${dashboardError} Показаны последние успешно загруженные данные.`}
          onRetry={() => setDashboardRefreshNonce((current) => current + 1)}
        />
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            className={`bg-white rounded-3xl p-6 border border-slate-100 shadow-xs relative overflow-hidden group hover:border-slate-200 transition-all ${s.onClick ? "cursor-pointer focus-within:ring-2 focus-within:ring-amber-300" : ""}`}
          >
            {s.onClick && (
              <button
                type="button"
                onClick={s.onClick}
                aria-label="Открыть список уроков, требующих действия"
                className="absolute inset-0 z-10 rounded-3xl outline-none"
              />
            )}
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

      {/* LOGIC-B2: my requests «Не смогу провести» and the lessons I take over */}
      {canAskForSubstitute && <TeacherRequestsBlock
        refreshKey={dashboardRefreshNonce}
        onNewRequest={() => setNewRequestOpen(true)}
        onChanged={() => setDashboardRefreshNonce((current) => current + 1)}
      />}

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
                  <p className="text-xs font-semibold text-slate-500">Ближайшее действие</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {primaryLessonAction?.cardLabel || primaryLessonAction?.label || (activeExamAction
                      ? activeExamAction.delivery_mode === "print"
                        ? "Сейчас проводится печатный экзамен"
                        : "Сейчас проводится экзамен"
                      : "На сегодня всё закрыто")}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {primaryLessonAction?.cardDescription || primaryLessonAction?.description || (activeExamAction
                      ? `${activeExamAction.title}${activeExamAction.group_name ? ` · ${activeExamAction.group_name}` : ""}.${activeExamAction.delivery_mode === "print" ? " Проводится на бумаге." : ""} Осталось ${formatCountdown(activeExamAction.displayRemainingSeconds)}.`
                      : "Нет незавершённых уроков или отметок, требующих вашего внимания.")}
                  </p>
                </div>
              </div>
              {primaryLessonAction ? (
                <button
                  type="button"
                  onClick={() => openLessonAction(primaryLessonAction)}
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
                        <p className="mt-0.5 text-xs text-slate-500">{group.class_level ? `${group.class_level} класс · ` : ""}{group.student_count} {pluralRu(group.student_count, ["ученик", "ученика", "учеников"])}</p>
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
                  Экзамены
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Ближайшие проведения и ситуации, требующие решения.</p>
              </div>
              <Link href="/teacher/exams" className="shrink-0 text-xs font-bold text-primary-600 hover:text-primary-700">
                Все экзамены
              </Link>
            </div>

            {liveExamError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-900">
                {liveExamError}
              </div>
            ) : !featuredDashboardExam ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                <FileCheck2 className="mx-auto mb-2 h-7 w-7 opacity-40" />
                Нет экзаменов, требующих внимания
              </div>
            ) : (
              <div className="space-y-3">
                {[featuredDashboardExam].map((exam) => {
                  const isActive = exam.status === "active";
                  const isClosed = exam.status === "closed";
                  const isPrint = exam.delivery_mode === "print";
                  const isPrintReady = isPrint && exam.status === "print_ready";
                  const needsResolution = exam.state === "needs_resolution";
                  const isLobby = exam.status === "lobby" && !needsResolution;
                  const isScheduled = exam.state === "today" || exam.state === "upcoming";
                  const isNearDeadline = isActive && exam.displayRemainingSeconds > 0 && exam.displayRemainingSeconds <= 5 * 60;
                  const timerReachedZero = isActive && exam.displayRemainingSeconds === 0;
                  const stateLabel = isClosed
                    ? "Завершён"
                    : needsResolution
                      ? "Нужно действие"
                    : isActive
                        ? timerReachedZero
                          ? "Подтверждаем"
                          : isNearDeadline
                            ? "Скоро конец"
                            : isPrint
                              ? "На бумаге"
                              : "Идёт"
                        : isLobby
                          ? "Лобби открыто"
                        : isPrintReady
                          ? "Комплект готов"
                        : exam.state === "today"
                          ? "Сегодня"
                          : "Запланирован";

                  return (
                    <div
                      key={exam.exam_id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Открыть экзамен «${exam.title}»`}
                      onClick={() => router.push(`/teacher/exams/${exam.exam_id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/teacher/exams/${exam.exam_id}`);
                        }
                      }}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                        isClosed
                          ? "border-emerald-200 bg-emerald-50/60"
                          : needsResolution || isNearDeadline || timerReachedZero
                          ? "border-amber-200 bg-amber-50/70"
                          : isActive
                          ? "border-primary-200 bg-primary-50/50"
                          : isLobby
                          ? "border-sky-200 bg-sky-50/50"
                          : isScheduled
                            ? "border-violet-200 bg-violet-50/50"
                            : "border-slate-200 bg-slate-50/70"
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
                            : needsResolution || isNearDeadline || timerReachedZero
                            ? "bg-amber-100 text-amber-800"
                            : isActive
                            ? "bg-primary-100 text-primary-700"
                            : isLobby
                            ? "bg-sky-100 text-sky-800"
                            : isScheduled
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-700"
                        }`}>
                          {stateLabel}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-xs text-slate-500">{exam.lessonLabel}</p>

                      <div className="mt-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-500">
                            {isClosed ? "Итог" : needsResolution ? "Занятие прошло" : isLobby ? "Комната ожидания" : isScheduled ? "Следующее действие" : timerReachedZero ? "Время истекло" : "До завершения"}
                          </p>
                          <p className={`mt-1 flex items-center gap-1.5 ${needsResolution ? "whitespace-nowrap text-sm" : "text-base"} font-bold tabular-nums ${
                            isClosed ? "text-emerald-800" : needsResolution || isNearDeadline || timerReachedZero ? "text-amber-900" : "text-slate-900"
                          }`}>
                            {isClosed ? <CheckCircle2 className="h-4 w-4" /> : needsResolution ? <AlertCircle className="h-4 w-4" /> : <TimerReset className="h-4 w-4" />}
                            {isClosed
                              ? "Экзамен завершён"
                              : needsResolution
                                ? isPrintReady
                                  ? "Проведение не подтверждено"
                                  : "Экзамен не проведён"
                                : isScheduled
                                  ? isPrint
                                    ? "Комплект готов к выдаче"
                                    : "Доступ после начала урока"
                                  : isLobby
                                    ? "Ожидаем участников"
                                  : timerReachedZero
                                    ? "Ожидаем сервер"
                                    : formatCountdown(exam.displayRemainingSeconds)}
                          </p>
                        </div>
                      </div>

                      {isPrint && isActive && (
                        <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary-100 bg-white/75 px-3 py-2.5 text-xs leading-5 text-slate-600">
                          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                          <p><span className="font-bold text-primary-800">Проведение на бумаге.</span> Завершите экзамен после сбора работ.</p>
                        </div>
                      )}

                      {!isPrint && (isActive || isClosed) && (
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
                      )}

                      {isLobby && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/teacher/exams/${exam.exam_id}`);
                          }}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-800 transition-colors hover:bg-sky-50"
                        >
                          Открыть лобби <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {additionalDashboardExamCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsExamQueueOpen(true)}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm transition-colors hover:border-primary-200 hover:bg-primary-50/60"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">В очереди ещё {formatExamQueueCount(additionalDashboardExamCount)}</p>
                      <p className="mt-0.5 text-left text-xs leading-5 text-slate-500">Посмотрите причины и выберите следующий экзамен.</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary-700 group-hover:text-primary-800">
                      Открыть <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
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
                  const attendanceStatusUnknown = attendanceSnapshotAvailable === false;
                  const isFinished = instanceStatus === "completed";
                  const isCancelled = instanceStatus === "cancelled";
                  const subsequentLesson = instanceStatus === "scheduled" ? getSubsequentStartedLesson(l) : null;
                  const status = getLessonTimeStatus(l, todayDayOfWeek, isAttSaved, isFinished);

                  return (
                    <div
                      key={l.id}
                      onClick={() => setActiveLesson(l)}
                      className={`p-3.5 rounded-2xl border transition-all block group cursor-pointer ${
                        isCancelled
                          ? "bg-slate-50 border-slate-200/70 opacity-75 hover:opacity-100 border-l-4 border-l-slate-400"
                          : subsequentLesson
                          ? "bg-white border-rose-300 shadow-sm border-l-4 border-l-rose-500 hover:border-rose-400 ring-1 ring-rose-500/10"
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
                          <LessonChips marks={occurrenceChips(l, user?.id)} className="ml-2 align-middle" />
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {attendanceStatusUnknown ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDashboardRefreshNonce((current) => current + 1);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-2xs transition-colors hover:bg-amber-100"
                            >
                              <AlertCircle className="h-3 w-3 text-amber-600" />
                              Статус не проверен · Повторить
                            </button>
                          ) : isCancelled ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 shadow-2xs">
                              <X className="w-3 h-3" />
                              Отменён
                            </span>
                          ) : isFinished ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/60 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-slate-400" />
                              Завершён
                            </span>
                          ) : subsequentLesson ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Урок не начат
                            </span>
                          ) : instanceStatus === "in_progress" ? (
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
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
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
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs group-hover:from-emerald-700 group-hover:to-teal-700 transition-all">
                                <Play className="w-3 h-3 fill-white" />
                                Начать урок
                              </span>
                            )
                          ) : status.type === "upcoming" ? (
                            status.diffMinutes <= 60 ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Через {formatMinutesUntil(status.diffMinutes)}
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
                            <MapPin className="w-3.5 h-3.5 text-slate-400" /> {roomLabel(l)}
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
            {canAskForSubstitute && (
              <button
                type="button"
                onClick={() => setNewRequestOpen(true)}
                className="mt-2 w-full rounded-xl py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                Не смогу провести несколько уроков
              </button>
            )}
          </div>
        </div>

      </div>

      {/* EXAM QUEUE: all operational exams behind the featured dashboard card. */}
      {mounted && typeof document !== "undefined" && isExamQueueOpen &&
        createPortal(
          <AnimatePresence>
            <div
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsExamQueueOpen(false);
              }}
              className="fixed left-0 top-0 z-[99998] flex items-center justify-center overflow-hidden overscroll-contain bg-slate-950/60 p-4 backdrop-blur-md"
              style={{ width: "100dvw", height: "100dvh" }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="exam-queue-title"
                className="flex max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
                  <div>
                    <p className="text-xs font-semibold text-primary-700">Оперативный контроль</p>
                    <h2 id="exam-queue-title" className="mt-1 text-xl font-bold text-slate-900">Очередь экзаменов</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Все ближайшие проведения и экзамены, для которых нужно принять решение.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsExamQueueOpen(false)}
                    aria-label="Закрыть очередь экзаменов"
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 sm:px-7">
                  {dashboardExamRows.map((exam) => {
                    const isActive = exam.status === "active";
                    const isClosed = exam.status === "closed";
                    const isPrint = exam.delivery_mode === "print";
                    const needsResolution = exam.state === "needs_resolution";
                    const isLobby = exam.status === "lobby" && !needsResolution;
                    const isScheduled = exam.state === "today" || exam.state === "upcoming";
                    const statusLabel = isClosed
                      ? "Завершён"
                      : needsResolution
                        ? "Нужно действие"
                        : isActive
                          ? isPrint ? "На бумаге" : "Идёт"
                          : isLobby
                            ? "Лобби открыто"
                          : isPrint
                            ? "Комплект готов"
                            : exam.state === "today" ? "Сегодня" : "Запланирован";
                    const description = needsResolution
                      ? isPrint
                        ? "Урок уже прошёл, а проведение по печатному комплекту не подтверждено. Перенесите или отмените экзамен."
                        : "Урок уже прошёл, но экзамен не был запущен. Перенесите или отмените проведение."
                      : isActive
                        ? isPrint
                          ? "Печатный экзамен проводится в аудитории. Завершите его после сбора работ."
                          : `Экзамен идёт. До завершения ${formatCountdown(exam.displayRemainingSeconds)}.`
                        : isLobby
                          ? "Комната ожидания открыта. Ученики могут подключаться; откройте лобби для контроля."
                        : isClosed
                          ? "Экзамен завершён; результаты доступны в карточке экзамена."
                          : isPrint
                            ? "Печатный комплект готов к выдаче в день занятия."
                            : "Экзамен станет доступен после начала назначенного урока.";
                    const tone = needsResolution
                      ? "border-amber-200 bg-amber-50/55 hover:border-amber-300"
                      : isActive
                        ? "border-primary-200 bg-primary-50/55 hover:border-primary-300"
                        : isLobby
                          ? "border-sky-200 bg-sky-50/55 hover:border-sky-300"
                        : isClosed
                          ? "border-emerald-200 bg-emerald-50/55 hover:border-emerald-300"
                          : "border-violet-200 bg-violet-50/55 hover:border-violet-300";

                    return (
                      <Link
                        key={exam.exam_id}
                        href={`/teacher/exams/${exam.exam_id}`}
                        onClick={() => setIsExamQueueOpen(false)}
                        className={`block rounded-2xl border p-4 transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${tone}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${needsResolution ? "bg-amber-100 text-amber-700" : isActive ? "bg-primary-100 text-primary-700" : isLobby ? "bg-sky-100 text-sky-700" : isClosed ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                            {isPrint ? <FileCheck2 className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{exam.title}</p>
                                <p className="mt-0.5 truncate text-xs text-slate-600">{exam.group_name || "Группа не указана"} · {exam.lessonLabel}</p>
                              </div>
                              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                {isPrint && <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-primary-700">Печать</span>}
                                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${needsResolution ? "bg-amber-100 text-amber-800" : isActive ? "bg-primary-100 text-primary-700" : isLobby ? "bg-sky-100 text-sky-800" : isClosed ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-700"}`}>{statusLabel}</span>
                              </div>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-slate-700">{description}</p>
                          </div>
                          <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-right sm:px-7">
                  <button type="button" onClick={() => setIsExamQueueOpen(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-white">
                    Закрыть
                  </button>
                </div>
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body,
        )}

      {/* ACTION CENTRE: unfinished journals and never-started past lessons. */}
      {mounted && typeof document !== "undefined" && isActionCenterOpen &&
        createPortal(
          <AnimatePresence>
            <div
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsActionCenterOpen(false);
              }}
              className="fixed left-0 top-0 z-[99998] flex items-center justify-center overflow-hidden overscroll-contain bg-slate-950/60 p-4 backdrop-blur-md"
              style={{ width: "100dvw", height: "100dvh" }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="action-centre-title"
                className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
                  <div>
                    <p className="text-xs font-semibold text-amber-700">Оперативный контроль</p>
                    <h2 id="action-centre-title" className="mt-1 text-xl font-bold text-slate-900">Требуют действия</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Здесь собраны незавершённые журналы и пропущенные уроки, по которым нужно принять явное решение.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsActionCenterOpen(false)}
                    aria-label="Закрыть"
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5 sm:px-7">
                  {lessonActions.map((action) => {
                    const isMissed = action.actionType === "missed";
                    const isHistorical = (action.lesson.occurrenceDate || businessDate) < businessDate;
                    return (
                      <button
                        key={`${action.lesson.occurrenceDate || businessDate}_${action.lesson.groupId}_${action.lesson.id}`}
                        type="button"
                        onClick={() => {
                          setIsActionCenterOpen(false);
                          openLessonAction(action);
                        }}
                        className={`w-full rounded-2xl border p-4 text-left transition-all hover:shadow-sm ${
                          isMissed || isHistorical ? "border-rose-200 bg-rose-50/45 hover:border-rose-300" : "border-amber-200 bg-amber-50/45 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isMissed || isHistorical ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                            <ClipboardCheck className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{action.lesson.groupName}</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                                  {formatIsoDateLabel(action.lesson.occurrenceDate || businessDate, { weekday: "long", day: "numeric", month: "long" })} · {action.lesson.startTime} — {action.lesson.endTime}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${isMissed || isHistorical ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                                {action.actionType ? openLessonBadge(action.actionType) : "Идёт сейчас"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-800">{action.label}</p>
                            {action.rosterCount !== undefined && action.rosterCount > 0 && (
                              <p className="mt-1 text-xs text-slate-600">
                                Отмечено {action.markedCount} из {action.rosterCount}{action.remainingCount ? ` · осталось ${action.remainingCount}` : " · можно завершить урок"}
                              </p>
                            )}
                            {action.rosterCount === 0 && action.actionType !== "missed" && (
                              <p className="mt-1 text-xs text-slate-600">На дату урока учеников в составе не было.</p>
                            )}
                          </div>
                          <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                      </button>
                    );
                  })}
                  {lockedLessonActions.map((action) => (
                    <div
                      key={`locked_${action.lesson.occurrenceDate}_${action.lesson.groupId}_${action.lesson.id}`}
                      aria-disabled="true"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-500"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                          <ClipboardCheck className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-600">{action.lesson.groupName}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            {formatIsoDateLabel(action.lesson.occurrenceDate || businessDate, { weekday: "long", day: "numeric", month: "long" })} · {action.lesson.startTime} — {action.lesson.endTime}
                          </p>
                          <p className="mt-2 text-xs leading-5">{LESSON_TOO_OLD_TEXT}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-600">{LESSON_TOO_OLD_HINT}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-right sm:px-7">
                  <button type="button" onClick={() => setIsActionCenterOpen(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-white">
                    Закрыть
                  </button>
                </div>
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body,
        )}

      {/* Explicit resolution for a past occurrence with no attendance row. */}
      {mounted && typeof document !== "undefined" && missedLessonAction &&
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
                role="dialog"
                aria-modal="true"
                aria-labelledby="missed-lesson-title"
                className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
                  <div>
                    <p className="text-xs font-semibold text-rose-700">Требует разбора</p>
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
                        type="button"
                        disabled={isResolvingMissedLesson}
                        onClick={() => {
                          setMissedLessonError(null);
                          setIsCancellingMissedLesson(true);
                        }}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="block">Отменить урок</span>
                        <span className="mt-1 block text-xs font-medium text-rose-600">Причина обязательно сохранится в журнале</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <div>
                        <p className="text-sm font-bold text-rose-900">Причина отмены</p>
                        <p className="mt-1 text-xs leading-5 text-rose-700">Это действие останется в аудите и закроет урок без отметок посещаемости.</p>
                      </div>
                      <textarea
                        value={missedLessonCancellationReason}
                        onChange={(event) => setMissedLessonCancellationReason(event.target.value)}
                        maxLength={500}
                        rows={3}
                        autoFocus
                        placeholder="Например: урок не состоялся по болезни преподавателя"
                        className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                      />
                      <CancellationKindField canChooseKind={canChooseKind} value={missedLessonKind} onChange={setMissedLessonKind} name="missed-cancellation-kind" disabled={isResolvingMissedLesson} />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={isResolvingMissedLesson}
                          onClick={() => {
                            setIsCancellingMissedLesson(false);
                            setMissedLessonCancellationReason("");
                            setMissedLessonError(null);
                          }}
                          className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          disabled={isResolvingMissedLesson || missedLessonCancellationReason.trim().length < 3}
                          onClick={handleCancelMissedLesson}
                          className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isResolvingMissedLesson ? "Сохранение…" : "Подтвердить отмену"}
                        </button>
                      </div>
                    </div>
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

      {/* MODAL: LESSON DETAILS & ATTENDANCE ON DASHBOARD */}
      {mounted && typeof document !== "undefined" && activeLesson &&
        createPortal(
          <AnimatePresence>
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) setActiveLesson(null);
              }}
              className="fixed left-0 top-0 z-[99999] flex items-center justify-center overflow-hidden overscroll-contain p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md transition-all"
              style={{ width: "100dvw", height: "100dvh" }}
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
                    <span className="text-xs font-semibold text-primary-600">
                      {activeLesson.occurrenceDate
                        ? formatIsoDateLabel(activeLesson.occurrenceDate, { weekday: "long", day: "numeric", month: "long" })
                        : DAYS.find((d) => d.id === activeLesson.dayOfWeek)?.name || "День урока"} · {activeLesson.startTime} — {activeLesson.endTime}
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
                    onClick={() => setActiveLesson(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* LOGIC-B2: «Не смогу провести» / «Вы запросили замену»; P1.1: «Перенести урок» */}
                {!loadingStudents && (
                  <TeacherLessonControls
                    lesson={{
                      groupId: activeLesson.groupId, groupName: activeLesson.groupName, lessonId: activeLesson.id, lessonDate: activeLesson.occurrenceDate || businessDate,
                      startTime: activeLesson.startTime, endTime: activeLesson.endTime, room: activeLesson.room, format: activeLesson.format, topic: activeLesson.topic,
                    }}
                    mark={activeRequestMark} lessonTeacherId={activeTeacherInfo?.teacherId} isSubstitution={activeTeacherInfo?.isSubstitution} lessonStatus={activeInstanceStatus}
                    onChanged={() => setDashboardRefreshNonce((current) => current + 1)}
                    onMoved={(text) => { setActiveLesson(null); showToast(text); setDashboardRefreshNonce((current) => current + 1); }}
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
                      ) : isAttendanceDirty ? (
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
                                  {Object.keys(attendance).length === groupStudents.length
                                    ? activeLesson && (activeLesson.occurrenceDate || businessDate) === businessDate && activeLesson.dayOfWeek === todayDayOfWeek && activeLessonStatus?.type === "live"
                                      ? "Идёт урок · Посещаемость отмечена"
                                      : "Посещаемость отмечена"
                                    : `Сохранено: ${Object.keys(attendance).length} из ${groupStudents.length}`}
                                </p>
                                {activeLesson && (activeLesson.occurrenceDate || businessDate) === businessDate && activeLesson.dayOfWeek === todayDayOfWeek && activeLessonStatus?.type === "live" && (
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
                      ) : activeLessonRelation === "past" ? (
                        /* A past day's lesson which was never started: the server
                           starts a lesson on its own day only, so the panel must not
                           offer a start. It is settled as "missed" instead. */
                        <div className="p-5 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-rose-950">Урок не был начат</p>
                              <p className="text-xs text-rose-800 mt-0.5">
                                Занятие по расписанию: {formatIsoDateLabel(activeLessonDate || businessDate, { weekday: "long", day: "numeric", month: "long" })}, {activeLesson.startTime} — {activeLesson.endTime}. Начать его теперь нельзя: урок запускается только в день проведения. {activeMissedAction ? "Если занятие состоялось, разберите его и заполните журнал; если нет — отмените с причиной." : "Если занятие не состоялось, отмените его с причиной."}
                              </p>
                            </div>
                          </div>
                          {activeMissedAction && (
                            <button
                              type="button"
                              onClick={() => openLessonAction({
                                lesson: activeLesson,
                                label: "Разобрать пропущенный урок",
                                description: "",
                                tone: "rose",
                                actionType: "missed",
                                sourceAction: activeMissedAction,
                              })}
                              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs"
                            >
                              Разобрать пропущенный урок
                            </button>
                          )}
                        </div>
                      ) : activeLessonRelation === "future" ? (
                        <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-950">Урок ещё не наступил</p>
                            <p className="text-xs text-amber-800 mt-0.5">
                              Занятие по расписанию: {formatIsoDateLabel(activeLessonDate || businessDate, { weekday: "long", day: "numeric", month: "long" })}. Начать урок и отметить посещаемость можно только в день проведения.
                            </p>
                          </div>
                        </div>
                      ) : activeSubsequentLesson ? (
                        <div className="p-5 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex items-start gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-rose-950">Урок больше нельзя начать</p>
                            <p className="text-xs text-rose-800 mt-0.5">
                              После его планового окончания уже был начат урок «{activeSubsequentLesson.groupName}» ({activeSubsequentLesson.startTime}—{activeSubsequentLesson.endTime}). Чтобы не исказить журнал, отметки за это занятие недоступны — отмените его с причиной.
                            </p>
                          </div>
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
                                Начало в {activeLesson.startTime} (через {formatMinutesUntil(activeLessonStatus.diffMinutes)}). Начать урок и отметить посещаемость можно будет в {activeLesson.startTime}.
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

                {isCancellingLesson && activeInstanceStatus !== "completed" && activeInstanceStatus !== "cancelled" && !isMarkingAttendance && (
                  <div className="mb-5 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div>
                      <p className="text-sm font-bold text-rose-900">Отменить урок</p>
                      <p className="mt-0.5 text-xs text-rose-700">Отметки этого занятия будут очищены, а причина и прежнее состояние сохранятся в аудите.</p>
                    </div>
                    {lessonExamBinding?.loading && (
                      <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">Проверяем связанный экзамен…</p>
                    )}
                    {!lessonExamBinding?.loading && lessonExamBinding?.attached && lessonExamBinding.canCancel && (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900">Экзамен «{lessonExamBinding.examTitle}» вернётся в черновик, а код доступа будет закрыт.</p>
                    )}
                    {!lessonExamBinding?.loading && lessonExamBinding && !lessonExamBinding.canCancel && (
                      <p className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-rose-800">{lessonExamBinding.message || "Отмена недоступна."}</p>
                    )}
                    <textarea
                      value={cancellationReason}
                      onChange={(event) => setCancellationReason(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Причина отмены (обязательно)"
                      className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                    />
                    <CancellationKindField canChooseKind={canChooseKind} value={cancellationKind} onChange={setCancellationKind} name="dashboard-cancellation-kind" disabled={savingAttendance} />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCancellingLesson(false);
                          setCancellationReason("");
                          setLessonExamBinding(null);
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                      >
                        Не отменять
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelLesson}
                        disabled={savingAttendance || !lessonExamBinding || lessonExamBinding.loading || !lessonExamBinding.canCancel || cancellationReason.trim().length < 3}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingAttendance ? "Сохранение..." : "Подтвердить отмену"}
                      </button>
                    </div>
                  </div>
                )}

                {/* The marking list shows its own copy of the error; every other step shows it here. */}
                {!isMarkingAttendance && <LessonPanelError message={attendanceError} />}

                {/* Actions footer.  While the marks are being entered the list has its own row of buttons (with «Завершить урок»):
                    a second row under it, with a «Закрыть» that repeats the cross, is not shown (ROADMAP #114). */}
                {!isMarkingAttendance && (
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  {showsGroupLinks(activeRosterSource) ? (
                  <Link
                    href={`/teacher/groups/${activeLesson.groupId || ""}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                  >
                    Перейти в группу
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  ) : <span />}

                  <div className="flex items-center gap-2">
                    {activeInstanceStatus !== "completed" && activeInstanceStatus !== "cancelled" && !isCancellingLesson && !isMarkingAttendance && (
                      <button
                        type="button"
                        onClick={openCancelLessonPanel}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                      >
                        <X className="h-3.5 w-3.5" />
                        Отменить урок
                      </button>
                    )}
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

      {/* LOGIC-B2: «Новый запрос» - the lessons are picked from the list of the teacher's own */}
      <RequestDialog
        open={newRequestOpen}
        lesson={null}
        today={businessDate}
        viewerId={user?.id}
        onClose={() => setNewRequestOpen(false)}
        onSent={(out) => {
          const toast = createToast(out);
          setNewRequestOpen(false);
          setDashboardNotice(toast.text);
          setDashboardRefreshNonce((current) => current + 1);
        }}
      />

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
      {toastNode}
    </div>
  );
}
