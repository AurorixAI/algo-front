"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lessonFromAttendanceAction, useTeacherLessonPanel } from "@/lib/use-teacher-lesson-panel";
import { TeacherLessonPanelView } from "@/components/teacher/lesson-panel";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { examsApi, orgApi, type GroupInfo, type LessonAttendanceStatus, type LiveExamDashboardSummary, type OpenAttendanceAction, type ScheduleOccurrence } from "@/lib/api";
import { pollFailure } from "@/lib/staff-busy";
import { businessDayOfWeek, businessGreeting, businessTimeMinutes, formatBusinessDate, formatBusinessDateLabel, formatIsoDateLabel, formatMinutesUntil } from "@/lib/business-time";
import { openLessonBadge } from "@/lib/open-lessons";
import { Users, GraduationCap, Calendar as CalendarIcon, ArrowRight, Plus, Clock, MapPin, Video, X, Play, CheckCircle2, AlertCircle, ClipboardCheck, FileCheck2, Radio, TimerReset } from "lucide-react";
import Link from "next/link";
import { todayPendingHintForLesson } from "@/lib/schedule-card-actions";
import { lessonActionTarget } from "@/lib/lesson-actions";
import { formatCountdown, ledByText, lessonsTodayTile, nextLessonAhead, orderActions, pickNextStep, todayAgenda, type LifecycleStatus } from "@/lib/teacher-agenda";
import { dashboardExamState, laterLessonStatus, scheduledExamLabel } from "@/lib/exam-lobby";
import { useTodayLessonStatuses } from "@/lib/use-exam-lessons";
import { NextActionCard } from "@/components/teacher/next-action-card";
import { useRouter } from "next/navigation";
import { pluralRu } from "@/lib/payments";
import { formatExamQueueCount, getLessonTimeStatus } from "@/lib/schedule-time";
import { staffDisplayName } from "@/lib/staff-name";
import { useScrollLock } from "@/components/ui/modal";
import { roomLabel } from "@/lib/schedule-slots";
import { openLessonAccess } from "@/lib/attendance-ops";
import { LESSON_TOO_OLD_HINT, LESSON_TOO_OLD_TEXT } from "@/lib/ops-errors";
import { createToast, occurrenceChips } from "@/lib/substitutions";
import type { MovedFrom, SubstitutionItem, SubstitutionOutcome, SubstitutionRequestMark } from "@/lib/substitution-types";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { useToast } from "@/components/ui/toast";
import { RequestDialog } from "@/components/substitutions/request-dialog";
import { TeacherRequestsBlock } from "@/components/substitutions/teacher-requests-block";

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
  /** W1 S26 / S27: a one-off lesson, who added it, and whether it is the copy of a move - the teacher cancels only the one-off lesson he added himself. */
  isOneOff?: boolean;
  createdBy?: { id?: string | null } | null;
  movedFrom?: MovedFrom | null;
  /** W1 F10: a substitute leads this lesson of the main teacher. */
  replacedBy?: { id: string; name: string } | null;
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
  /** The word of the chip in the centre when the action has no `actionType` («Пора начать», «Не отмечен»). */
  badge?: string;
  /** Decision 7: older than 7 days - only an administrator or the owner closes it (the row is grey, without buttons). */
  locked?: boolean;
};

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
  const [liveExams, setLiveExams] = useState<LiveExamDashboardSummary[]>([]);
  const [liveExamSnapshotAt, setLiveExamSnapshotAt] = useState<number | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  /** O8: «Урок завершён, но проверить экзамены не удалось.» - a notice that outlives the closed lesson panel. */
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);
  const [dashboardRefreshNonce, setDashboardRefreshNonce] = useState(0);
  const [liveExamError, setLiveExamError] = useState<string | null>(null);
  const [isExamQueueOpen, setIsExamQueueOpen] = useState(false);

  /** LOGIC-B2: the request «Не смогу провести» dialog. */
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  /** Only a teacher asks for a substitute; an owner / administrator assigns one himself («Заменить преподавателя»). */
  const canAskForSubstitute = (user?.org_role ?? user?.role) === "teacher";
  const [businessDate, setBusinessDate] = useState(() => formatBusinessDate());
  const [clockTick, setClockTick] = useState(0);
  const [liveExamTick, setLiveExamTick] = useState(0);

  // ONE reading of the teacher's day (LESSONS 38): the card, both tiles and the group focus use it. A lesson that is cancelled,
  // moved away or led by a substitute (W1 F10) is not in it.
  const statusOfToday = useCallback(
    (lesson: Pick<LessonSummary, "id">): LifecycleStatus => lessonStatusMap[lesson.id] || (completedLessonsMap[lesson.id] ? "completed" : "scheduled"),
    [lessonStatusMap, completedLessonsMap],
  );

  // The panel of the open lesson - one hook and one picture for the dashboard and the schedule (WE-E); the screen keeps only what follows a write
  const lessonPanel = useTeacherLessonPanel<LessonSummary>({
    businessDate,
    groups,
    user,
    todayLessons,
    statusOfToday,
    hasSavedMarks: (lessonId) => Boolean(lessonAttendanceMap[lessonId]),
    openActions: openAttendanceActions,
    setOpenActions: setOpenAttendanceActions,
    openActionsKnown: openAttendanceActionsAvailable !== false,
    retryOpenActions: () => setDashboardRefreshNonce((value) => value + 1),
    lessonFromAction: lessonFromAttendanceAction,
    onWritten: (event) => {
      const { lesson } = event;
      const isToday = event.date === businessDate;
      if (event.kind === "loaded") {
        if (event.snapshot.isToday) setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: event.snapshot.status }));
        if (event.snapshot.isSaved && event.snapshot.isToday) setLessonAttendanceMap((previous) => ({ ...previous, [lesson.id]: true }));
      } else if (event.kind === "started") {
        if (isToday) setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "in_progress" }));
      } else if (event.kind === "saved") {
        if (isToday) {
          setLessonAttendanceMap((previous) => ({ ...previous, [lesson.id]: true }));
          setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "in_progress" }));
        }
      } else if (event.kind === "finished") {
        // O8: the exam service could not be asked - the lesson is closed anyway; say so
        if (event.syncNotice) setDashboardNotice(event.syncNotice);
        if (isToday) {
          setCompletedLessonsMap((previous) => ({ ...previous, [lesson.id]: true }));
          setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "completed" }));
        }
      } else {
        if (isToday) {
          setLessonStatusMap((previous) => ({ ...previous, [lesson.id]: "cancelled" }));
          setLessonAttendanceMap((previous) => ({ ...previous, [lesson.id]: false }));
          setCompletedLessonsMap((previous) => ({ ...previous, [lesson.id]: false }));
        }
        if (event.notes.length > 0) showToast("Урок отмечен как не состоявшийся", "warning", event.notes);
      }
    },
    notifyRefusal: (notice, reason) => showToast(notice, "error", [reason]),
    onMissedCancelled: (notes) => {
      if (notes.length > 0) showToast("Урок отмечен как не состоявшийся", "warning", notes);
      setDashboardRefreshNonce((value) => value + 1);
    },
  });
  const { setActiveLesson, requestClose, openLesson, openMissedLesson, missedLessonAction, consumeEscape, getSubsequentStartedLesson } = lessonPanel;


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
  useScrollLock(Boolean(isActionCenterOpen || isExamQueueOpen));   // the lesson panel and the reconciliation dialog lock the page themselves

  // Escape key handler: the layers of the panel (a conflict, a running exam, the move dialog, the «⋯» menu) keep the key first
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (consumeEscape()) return;
        if (isExamQueueOpen) setIsExamQueueOpen(false);
        else if (isActionCenterOpen) setIsActionCenterOpen(false);
        else void requestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActionCenterOpen, isExamQueueOpen, missedLessonAction, consumeEscape, requestClose]);

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


  /**
   * One entry point for "do this action": the card and the action centre must not branch differently. A missed lesson cannot be started (the server
   * allows it on the lesson's day only), so it opens the reconciliation dialog; any other action opens the lesson panel.
   */
  const openLessonAction = (action: LessonAction) => {
    const target = lessonActionTarget(action);
    if (target.kind === "reconcile") openMissedLesson(target.source);
    else openLesson(target.lesson);
  };

  // «Расписание на сегодня»: strictly by the start time, whatever the status of a lesson (the tasks have their own card)
  const sortedTodayLessons = useMemo(
    () => [...todayLessons].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "") || (a.groupName || "").localeCompare(b.groupName || "", "ru")),
    [todayLessons],
  );

  const agenda = useMemo(
    () => todayAgenda(todayLessons, statusOfToday, businessTimeMinutes()),
    // the clock moves the phases: a lesson becomes «пора начать» without a click
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayLessons, statusOfToday, clockTick],
  );

  const scheduledLessonActions = useMemo<LessonAction[]>(() => {
    return agenda.entries.flatMap<LessonAction>((entry) => {
      // A lesson in progress comes from the persisted open-actions endpoint (partial attendance, historical instances).
      if (entry.phase === "missed") {
        // #158: a lesson of today that is over and was never started is the FIRST task (red), whether the server has returned it yet or not; the server's own action wins
        if (openAttendanceActions.some((action) => action.lessonId === entry.lesson.id && action.lessonDate === businessDate)) return [];
        return [{
          lesson: entry.lesson,
          label: "Разберите урок",
          cardLabel: `Разберите урок: ${entry.lesson.groupName} · ${entry.lesson.startTime}`,
          description: `${entry.lesson.groupName} · ${entry.lesson.startTime} — ${entry.lesson.endTime} · состоялся ли он`,
          cardDescription: "Урок закончился, а журнал не начат. Отметьте урок или укажите, что его не было.",
          badge: "Посещаемость не отмечена",
          tone: "rose",
        }];
      }
      if (entry.phase !== "to_start") return [];
      if (getSubsequentStartedLesson(entry.lesson)) return [];
      return [{
        lesson: entry.lesson,
        label: "Начните урок",
        description: `${entry.lesson.groupName} · ${entry.lesson.startTime} — ${entry.lesson.endTime}`,
        tone: "emerald",
      }];
    });
  }, [agenda, getSubsequentStartedLesson, openAttendanceActions, businessDate]);

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

  // The card, the tile «Требуют действия» and the centre read this one list, in one order: red, in progress, to start.
  const lessonActions = useMemo<LessonAction[]>(
    () => orderActions([...openLessonActions.filter((action) => !action.locked), ...scheduledLessonActions], businessDate),
    [openLessonActions, scheduledLessonActions, businessDate],
  );

  const groupFocus = useMemo(() => {
    const nowMinutes = businessTimeMinutes();
    return groups
      .filter((group) => group.status === "active")
      .map((group) => {
        // not a cancelled / moved / substituted lesson; the one that is in progress stays (it is the nearest of the group)
        const ahead = nextLessonAhead({ lessons: weekLessons, today: businessDate, nowMinutes, todayStatusOf: statusOfToday, groupId: group.id });
        return { group, nextLesson: ahead?.lesson ?? null, live: ahead?.live ?? false };
      })
      .sort((a, b) => {
        if (!a.nextLesson) return 1;
        if (!b.nextLesson) return -1;
        return `${a.nextLesson.occurrenceDate}T${a.nextLesson.startTime}`.localeCompare(
          `${b.nextLesson.occurrenceDate}T${b.nextLesson.startTime}`,
        );
      })
      .slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, weekLessons, businessDate, clockTick, statusOfToday]);

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

  // #159 D2: the status of the lesson of a lobby exam of TODAY is polled like in the library (once a minute, a hidden tab asks nothing, the return asks at once) - a lesson started in another tab
  // or on a phone turns «Запланирован · сегодня» into «Лобби открыто» without a reload.  The summary of the day is read once; this is the one mechanism for the exams, not a second one.
  const examLessons = useTodayLessonStatuses(liveExams, businessDate);
  const [mineRequests, setMineRequests] = useState<SubstitutionItem[]>([]);
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
        // The persisted lifecycle state remains `lobby` until the teacher transfers or cancels the exam; its *operational* state follows the
        // lesson: the server lets students in only while the bound lesson is IN PROGRESS, so «Лобби открыто» is said only then (exam of a later
        // day: «Запланирован · день»), and a lesson that has passed turns the exam into a reconciliation item.
        const state = dashboardExamState({
          status: exam.status,
          scheduledDate,
          today: businessDate,
          lessonStatus: scheduledDate === businessDate
            ? laterLessonStatus(lesson ? statusOfToday(lesson) : null, examLessons.statusOf(exam))   // what this screen did itself vs what the poll saw elsewhere: the later one
            : null,
        });
        const lessonLabel = lesson
          ? `${formatIsoDateLabel(lesson.occurrenceDate, { weekday: "short", day: "numeric", month: "short" })} · ${lesson.startTime}–${lesson.endTime}`
          : scheduledDate
            ? formatIsoDateLabel(scheduledDate, { weekday: "short", day: "numeric", month: "short" })
            : "Занятие не выбрано";
        const dayLabel = scheduledDate ? formatIsoDateLabel(scheduledDate, { weekday: "short", day: "numeric", month: "short" }) : "";

        return { ...exam, state, lessonLabel, dayLabel, priority: priority[state] };
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
  }, [businessDate, liveExamView, weekLessons, statusOfToday, examLessons]);
  const featuredDashboardExam = dashboardExamRows[0] || null;
  const additionalDashboardExamCount = Math.max(0, dashboardExamRows.length - 1);
  // "Требуют действия" is a finite queue of attendance/lesson closures.
  // An ongoing exam has its own live block and must not create a hidden item
  // in this action centre.
  const loadFailed = Boolean(dashboardError) || openAttendanceActionsAvailable === false;
  const actionCount = loadFailed ? null : lessonActions.length;

  // «Ближайшее действие»: one rule for the card (see `pickNextStep`); never «всё закрыто» after a failed load.
  const activeExamForCard = activeExamAction;
  const attentionExam = dashboardExamRows.find((exam) => exam.state === "needs_resolution") || null;
  const laterLesson = useMemo(() => {
    const ahead = nextLessonAhead({ lessons: weekLessons, today: businessDate, nowMinutes: businessTimeMinutes(), todayStatusOf: statusOfToday });
    return ahead ? { date: ahead.lesson.occurrenceDate, startTime: ahead.lesson.startTime, groupName: ahead.lesson.groupName } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekLessons, businessDate, statusOfToday, clockTick]);
  const nextStep = pickNextStep({
    actions: lessonActions,
    agenda,
    activeExam: activeExamForCard,
    attentionExam,
    loadFailed,
    today: businessDate,
    later: laterLesson,
  });
  const primaryLessonAction = nextStep.kind === "action" ? nextStep.action : null;
  // the lesson of the card is the lesson of a waiting request «Не смогу провести» of today: nobody has decided yet, so the teacher leads it
  const hintLesson = nextStep.kind === "action" ? nextStep.action.lesson : nextStep.kind === "upcoming" ? nextStep.entry.lesson : null;
  const actionHint = hintLesson ? todayPendingHintForLesson(mineRequests, hintLesson, businessDate) : null;

  const greeting = businessGreeting(); // Tashkent hour, whatever the browser zone is
  const displayName = staffDisplayName(user, "Преподаватель");

  // «Уроков сегодня: 3 · осталось 1» - the lessons of the plan (not cancelled, not led by a substitute); «Требуют действия» - what the click opens.
  const todayTile = lessonsTodayTile(agenda);
  const oldActionsNote = lockedLessonActions.length > 0 ? `ещё ${lockedLessonActions.length} у администратора` : null;
  const statCards: { label: string; value: number | string; note?: string | null; icon: typeof Users; bg: string; iconColor: string; onClick?: () => void }[] = [
    { label: "Мои группы", value: stats.groups || 0, icon: Users, bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Мои ученики", value: stats.students || 0, icon: GraduationCap, bg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { label: "Уроков сегодня", value: todayTile.value, note: todayTile.note, icon: CalendarIcon, bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Требуют действия", value: actionCount ?? "—", note: oldActionsNote, icon: ClipboardCheck, bg: "bg-amber-50", iconColor: "text-amber-600", onClick: (actionCount !== null && actionCount > 0) || lockedLessonActions.length > 0 ? () => setIsActionCenterOpen(true) : undefined },
  ];

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

      {/* KPI Stats Grid: 2x2 on a phone (the card «Ближайшее действие» stays on the first screen), one row from 1024 */}
      <div data-testid="teacher-summary" className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            className={`bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-6 border border-slate-100 shadow-card relative overflow-hidden group hover:border-slate-200 transition-all ${s.onClick ? "cursor-pointer focus-within:ring-2 focus-within:ring-amber-300" : ""}`}
          >
            {s.onClick && (
              <button
                type="button"
                onClick={s.onClick}
                aria-label="Открыть список уроков, требующих действия"
                className="absolute inset-0 z-10 rounded-2xl sm:rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              />
            )}
            <div className="hidden sm:block absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-slate-50 opacity-60 pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-4">
              <div className={`w-7 h-7 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-4 h-4 sm:w-6 sm:h-6 ${s.iconColor}`} />
              </div>
              <div className="flex min-w-0 flex-col-reverse sm:flex-col">
                <p className="text-xs sm:text-sm font-medium text-slate-500">{s.label}</p>
                <div className="flex flex-wrap items-baseline gap-x-2 sm:mt-0.5">
                  <span className="text-xl sm:text-2xl font-bold leading-6 sm:leading-7 text-slate-900">{s.value}</span>
                  {s.note && <span data-testid="stat-note" className="text-xs font-medium text-slate-500">· {s.note}</span>}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Main content) */}
        <div className="lg:col-span-2 space-y-8">
          {/* One explicit next step prevents the dashboard from becoming a wall of passive figures (rule: `pickNextStep`). */}
          <NextActionCard
            step={nextStep}
            hint={actionHint}
            onOpenAction={openLessonAction}
            onOpenLesson={setActiveLesson}
            onRetry={() => setDashboardRefreshNonce((current) => current + 1)}
          />

          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <Users className="h-5 w-5 text-primary-600" />
                  Группы в фокусе
                </h2>
                <p className="mt-1 text-sm text-slate-500">Ближайшее занятие по каждой активной группе.</p>
              </div>
              <Link href="/teacher/groups" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-bold text-primary-600 transition-colors hover:text-primary-700">
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
                {groupFocus.map(({ group, nextLesson, live }) => (
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
                      <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500 shadow-card ring-1 ring-slate-100">
                        {group.class_level ? `${group.class_level} кл` : "Группа"}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                      {nextLesson ? (
                        <span className="flex min-w-0 items-center gap-2">
                          {live && <span data-testid="group-focus-live" className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Идёт сейчас</span>}
                          <span className="truncate">
                            {live ? `${nextLesson.startTime}–${nextLesson.endTime}` : `${formatIsoDateLabel(nextLesson.occurrenceDate, { weekday: "short", day: "numeric", month: "short" })} · ${nextLesson.startTime}`}
                            {nextLesson.isRescheduled ? " · перенесено" : ""}
                          </span>
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

          {/* LOGIC-B2: my requests «Не смогу провести» and the lessons I take over - under «Группы в фокусе» (owner 28.10) */}
          {canAskForSubstitute && <TeacherRequestsBlock
            refreshKey={dashboardRefreshNonce}
            onNewRequest={() => setNewRequestOpen(true)}
            onChanged={() => setDashboardRefreshNonce((current) => current + 1)}
            onData={(data) => setMineRequests(data.items ?? [])}
          />}
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
              <Link href="/teacher/exams" className="inline-flex min-h-10 shrink-0 items-center text-xs font-bold text-primary-600 hover:text-primary-700">
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
                  const isLobby = exam.state === "lobby";
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
                        : scheduledExamLabel(exam.state, exam.dayLabel);

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
                      {/* the badge may carry a day («Запланирован · вт, 3 нояб.»): it goes under the title when the card is narrow, it never squeezes the title to «Контр…» */}
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                        <div className="min-w-0 flex-1 basis-40">
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
                  const ledByOtherTeacher = !isCancelled && Boolean(l.replacedBy);   // a substitute leads it: nothing to start, grey
                  const subsequentLesson = instanceStatus === "scheduled" ? getSubsequentStartedLesson(l) : null;
                  const status = getLessonTimeStatus(l, todayDayOfWeek, isAttSaved, isFinished);

                  return (
                    <div
                      key={l.id}
                      onClick={() => setActiveLesson(l)}
                      className={`p-3.5 rounded-2xl border transition-all block group cursor-pointer ${
                        isCancelled || ledByOtherTeacher
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
                          ? "bg-white border-amber-200 shadow-card border-l-4 border-l-amber-500 hover:border-amber-300 hover:shadow-sm"
                          : status.type === "upcoming"
                          ? "bg-white border-slate-200 shadow-card border-l-4 border-l-blue-500 hover:border-blue-300 hover:shadow-sm"
                          : "bg-slate-50/70 border-slate-200/60 opacity-75 hover:opacity-100 hover:bg-white border-l-4 border-l-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <p className="font-bold text-sm text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                          {l.groupName}
                          {!ledByOtherTeacher && <LessonChips marks={occurrenceChips(l, user?.id, { groupsBase: "/teacher/groups" })} className="ml-2 align-middle" />}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {attendanceStatusUnknown ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDashboardRefreshNonce((current) => current + 1);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-card transition-colors hover:bg-amber-100"
                            >
                              <AlertCircle className="h-3 w-3 text-amber-600" />
                              Статус не проверен · Повторить
                            </button>
                          ) : isCancelled ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 shadow-card">
                              <X className="w-3 h-3" />
                              Отменён
                            </span>
                          ) : ledByOtherTeacher ? (
                            <span data-testid="led-by-substitute" className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 shadow-card">
                              {ledByText(l.replacedBy?.name)}
                            </span>
                          ) : isFinished ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/60 shadow-card">
                              <CheckCircle2 className="w-3 h-3 text-slate-400" />
                              Завершён
                            </span>
                          ) : subsequentLesson ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-card">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Урок не начат
                            </span>
                          ) : instanceStatus === "in_progress" ? (
                            status.isPastEndTime ? (
                              isAttSaved ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-card">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  Завершите урок
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-card">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  Отметьте посещаемость
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-card">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                Идёт урок
                              </span>
                            )
                          ) : status.type === "live" ? (
                            status.isPastEndTime ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-card">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Урок не начат
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-card group-hover:from-emerald-700 group-hover:to-teal-700 transition-all">
                                <Play className="w-3 h-3 fill-white" />
                                Начать урок
                              </span>
                            )
                          ) : status.type === "upcoming" ? (
                            status.diffMinutes <= 60 ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-card">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Через {formatMinutesUntil(status.diffMinutes)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 shadow-card">
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
              className="w-full mt-4 min-h-10 py-2.5 rounded-xl border border-slate-200 hover:border-primary-200 hover:bg-primary-50/50 text-slate-700 hover:text-primary-700 font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить занятие в календарь
            </Link>
            {canAskForSubstitute && (
              <button
                type="button"
                onClick={() => setNewRequestOpen(true)}
                className="mt-2 min-h-10 w-full rounded-xl py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
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
                    const isLobby = exam.state === "lobby";
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
                            : scheduledExamLabel(exam.state, exam.dayLabel);
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
                    const isMissed = action.actionType === "missed" || action.tone === "rose";
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
                                {action.actionType ? openLessonBadge(action.actionType) : action.badge ?? "Пора начать"}
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

      <TeacherLessonPanelView
        panel={lessonPanel}
        user={user}
        onChanged={() => setDashboardRefreshNonce((current) => current + 1)}
        onMoved={(text, notes) => { showToast(text, notes?.length ? "warning" : "success", notes); setDashboardRefreshNonce((current) => current + 1); }}
      />

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

      {toastNode}
    </div>
  );
}
