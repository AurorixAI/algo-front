"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type MutableRefObject } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Ban,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileWarning,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Undo2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import {
  type AttendanceExcuseInfo,
  type AttendanceStatus,
  type GroupAttendance,
  type Lesson,
  orgApi,
  type StudentInGroup,
} from "@/lib/api";
import {
  formatBusinessDate,
  formatUtcNaiveAsBusinessDate,
  formatUtcNaiveAsBusinessDateTime,
} from "@/lib/business-time";
import { wasMemberOn } from "@/lib/membership-periods";
import {
  collectExcuseReasons,
  CORRECTION_REASON_MAX,
  EXCUSE_REASON_MAX,
  excuseCellView,
  finishBlockedHint,
  formatDateRu,
  formatDateTimeRu,
  correctionWarnings,
  diffCorrection,
  lessonAdminActions,
  mergeLoadedRecords,
  pendingLessonKeys,
  recordsForSave,
  rosterProgress,
  validateCorrectionReason,
  validateExcuseReason,
  type AdminLessonAction,
} from "@/lib/attendance-excuses";
import { useExcuseBadge } from "@/lib/excuse-badge";
import { parseJournalHighlight, parseJournalMonth } from "@/lib/open-lessons";
import { journalColumnDate, journalMonthAnchor, journalPeriod, moveJournalAnchor } from "@/lib/journal-period";
import { createRequestSequence } from "@/lib/request-sequence";
import { CancelMissedLessonModal, type CancelMissedTarget } from "@/components/attendance/cancel-missed-lesson-modal";
import { ExcuseDecisionDialog, type ExcuseDecisionTarget } from "@/components/attendance/excuse-decision-dialog";
import { applyExcuseItem, excuseChange, type ExcuseItemFields } from "@/lib/excuse-conflict";
import { afterDeadlineMark, subjectOfJournalCell, type ExcuseDecision } from "@/lib/excuse-decision";
import { MARK_CELL_LABEL, MARK_MENU_LABEL, excuseStatusMeaning } from "@/lib/attendance-marks";
import { AfterDeadlineChip } from "@/components/attendance/after-deadline-chip";
import { AttendanceLegendHint } from "@/components/groups/attendance-legend";
import { Modal } from "@/components/ui/modal";
import { Hint } from "@/components/ui/hint";
import { useToast } from "@/components/ui/toast";
import {
  AttendanceConflictDialog,
  LiveExamConfirmDialog,
  type AttendanceConflictState,
} from "@/components/attendance/attendance-ops-dialogs";
import { LessonTeacherDialog, type LessonTeacherTarget } from "@/components/groups/lesson-teacher-dialog";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { useAuthStore } from "@/lib/store";
import { directAssignToast, lessonMarks, substitutionsHref, substitutionsPathFor } from "@/lib/substitutions";
import {
  conflictHeadline,
  examSyncNotice,
  expectedVersionFor,
  lessonFailure,
  mergeKeepMine,
  mergeVersions,
  withSavedVersion,
  type VersionMap,
} from "@/lib/attendance-ops";
import {
  NO_LESSON_TEACHER_TEXT,
  canReplaceTeacher,
  lacksTeacher,
  lessonBelongsToOther,
  notYourLessonText,
  substituteLabel,
} from "@/lib/lesson-teacher";
import { assignActionLabel, cancelLessonLabel, CORRECT_MARKS_LABEL, FINISH_LESSON_LABEL, MARK_LESSON_LABEL } from "@/lib/schedule-card-actions";
import type { LiveExamItem } from "@/lib/ops-b-types";

interface GroupAttendanceJournalProps {
  groupId: string;
  students: StudentInGroup[];
  /** Руководители видят журнал, но не меняют отметки без отдельного correction-flow. */
  canEdit?: boolean;
  /** Передаётся только ролям, которым разрешено открывать профиль ученика. */
  studentProfileBasePath?: string;
  /** Administrator / owner: lesson-column actions, correction mode and excuse review. */
  adminMode?: boolean;
  /** Name of the group: the confirmation of an excuse names the lesson with it (the date alone when absent). */
  groupName?: string | null;
  /** `YYYY-MM`: open on that month instead of the current week (initial value only). */
  initialMonth?: string | null;
  /** `?lesson=` / `?date=` of a deep link (open-lessons list): this lesson's column is highlighted. */
  highlightLessonId?: string | null;
  highlightDate?: string | null;
  /** The signed-in user: a teacher marks only the lessons he teaches (a substitute: his own; O5). */
  viewerId?: string | null;
}

type ViewMode = "week" | "month";
/** Viewport rectangle of the control a floating menu belongs to. */
type MenuAnchor = { top: number; bottom: number; left: number; right: number };
type OpenAttendanceCell = {
  studentId: string;
  lessonKey: string;
  anchor: MenuAnchor;
};

function anchorOf(element: Element): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
}

/**
 * Menu rendered in <body> with position: fixed, so no overflow of the journal
 * table can clip it.  It opens below the anchor when it fits, otherwise above,
 * otherwise on the roomier side with its own scroll, and is shifted into the screen.
 */
function FloatingMenu({
  anchor, width = 224, align = "center", menuRef, id, role = "menu", className = "", children,
}: {
  anchor: MenuAnchor;
  width?: number;
  align?: "center" | "end";
  menuRef?: MutableRefObject<HTMLDivElement | null>;
  id?: string;
  /** "group" for a read-only panel without menu items. */
  role?: "menu" | "group";
  className?: string;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    const pad = 8;
    const gap = 6;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = Math.min(width, viewportWidth - pad * 2);
    const height = element.scrollHeight;
    const below = viewportHeight - anchor.bottom - gap - pad;
    const above = anchor.top - gap - pad;
    let top: number;
    let maxHeight: number;
    if (height <= below) { top = anchor.bottom + gap; maxHeight = below; }
    else if (height <= above) { top = anchor.top - gap - height; maxHeight = above; }
    else if (below >= above) { top = anchor.bottom + gap; maxHeight = Math.max(below, 120); }
    else { maxHeight = Math.max(above, 120); top = anchor.top - gap - Math.min(height, maxHeight); }
    top = Math.max(pad, top);
    const wanted = align === "end" ? anchor.right - menuWidth : (anchor.left + anchor.right) / 2 - menuWidth / 2;
    const left = Math.min(Math.max(pad, wanted), viewportWidth - menuWidth - pad);
    setPos({ top, left, maxHeight, width: menuWidth });
  }, [anchor, width, align]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={(node) => {
        innerRef.current = node;
        if (menuRef) menuRef.current = node;
      }}
      id={id}
      role={role}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width ?? width,
        maxHeight: pos?.maxHeight,
        overflowY: "auto",
        visibility: pos ? "visible" : "hidden",
      }}
      className={`z-[90] rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-xl ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
type CorrectionState = {
  key: string;
  draft: Record<string, AttendanceStatus>;
  /** Reasons typed for students newly marked "excused" during the correction. */
  reasons: Record<string, string>;
};
type ReviewAction = "confirmed" | "rejected" | "reset";
type MembershipEvent = NonNullable<GroupAttendance["membershipEvents"]>[number];
type DiagnosticReportNotice = NonNullable<GroupAttendance["diagnosticReportNotices"]>[number];
type AttendanceJournalStudent = StudentInGroup & {
  isHistorical?: boolean;
  transferredAt?: string | null;
  transferredToGroupName?: string | null;
  membershipEvent?: MembershipEvent;
  diagnosticReportNotice?: DiagnosticReportNotice;
};

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  short: string;
  label: string;
  className: string;
  dotClassName: string;
}> = [
  {
    value: "present",
    short: MARK_CELL_LABEL.present,
    label: MARK_MENU_LABEL.present,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    dotClassName: "bg-emerald-500",
  },
  {
    value: "late",
    short: MARK_CELL_LABEL.late,
    label: MARK_MENU_LABEL.late,
    className: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
    dotClassName: "bg-amber-500",
  },
  {
    value: "absent",
    short: MARK_CELL_LABEL.absent,
    label: MARK_MENU_LABEL.absent,
    className: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
    dotClassName: "bg-rose-500",
  },
  {
    value: "excused",
    short: MARK_CELL_LABEL.excused,
    label: MARK_MENU_LABEL.excused,
    className: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
    dotClassName: "bg-sky-500",
  },
];

function instanceKey(lesson: Lesson): string {
  return lesson.instanceKey || `${lesson.date}_${lesson.id}`;
}

function statusOption(value: AttendanceStatus | "") {
  return STATUS_OPTIONS.find((item) => item.value === value);
}

function formatMembershipEvent(event: MembershipEvent): string {
  const date = event.joined_at
    ? formatUtcNaiveAsBusinessDate(event.joined_at, { day: "numeric", month: "short" })
    : null;
  return `Переведён${event.source_group_name ? ` из «${event.source_group_name}»` : " в эту группу"}${date ? ` · ${date}` : ""}`;
}

function lessonStatusPresentation(status: string, lessonDate: string, today: string) {
  if (status === "completed") {
    return {
      label: "Завершён",
      className: "text-emerald-700",
      description: "Урок завершён: отметки защищены от случайного изменения",
    };
  }
  if (status === "cancelled") {
    return { label: "Отменён", className: "text-slate-500", description: "Урок отменён" };
  }
  if (status === "in_progress" && lessonDate < today) {
    return {
      label: "Не завершён",
      className: "text-amber-700",
      description: "Урок в прошлом: посещаемость ещё не зафиксирована полностью",
    };
  }
  if (status === "in_progress" && lessonDate === today) {
    return {
      label: "Идёт урок",
      className: "text-primary-700",
      description: "Урок начат: отметки можно вносить",
    };
  }
  if (lessonDate < today) {
    return {
      label: "Не отмечен",
      className: "text-slate-500",
      description: "Урок прошёл, но посещаемость не была зафиксирована",
    };
  }
  // A future active row is invalid legacy data. The API suppresses it, and
  // this fallback keeps the journal correct while a stale response is shown.
  return {
    label: "Запланирован",
    className: "text-slate-500",
    description: "Урок ожидает начала по расписанию",
  };
}

function excuseTooltip(excuse: AttendanceExcuseInfo, { withLate = true }: { withLate?: boolean } = {}): string {
  const lines = [`Причина: ${excuse.reason}`];
  const marked = [excuse.reason_by_name, formatDateTimeRu(excuse.reason_at)].filter(Boolean).join(", ");
  if (marked) lines.push(`Отметил(а): ${marked}`);
  if (excuse.status !== "pending") {
    const verb = excuse.status === "confirmed" ? "Подтвердил(а)" : "Отклонил(а)";
    const reviewed = [excuse.reviewed_by_name, formatDateTimeRu(excuse.reviewed_at)].filter(Boolean).join(", ");
    lines.push(reviewed ? `${verb}: ${reviewed}` : verb);
    if (excuse.review_note) lines.push(`Примечание: ${excuse.review_note}`);
    // The menu shows this as a chip instead of a line of text.
    const late = withLate ? afterDeadlineMark(excuse) : null;
    if (late) lines.push(late.title);
  }
  return lines.join("\n");
}

const EXCUSE_TONE_CLASS = {
  pending: "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
  confirmed: "border-emerald-300 bg-sky-50 text-emerald-700 hover:bg-sky-100",
  rejected: "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100",
} as const;

export function GroupAttendanceJournal({
  groupId,
  students,
  canEdit = false,
  studentProfileBasePath,
  adminMode = false,
  groupName = null,
  initialMonth = null,
  highlightLessonId = null,
  highlightDate = null,
  viewerId = null,
}: GroupAttendanceJournalProps) {
  const { user } = useAuthStore();
  const highlightTarget = parseJournalHighlight(highlightLessonId, highlightDate);
  // A valid deep link decides the period by its date, so a disagreeing ?month= cannot hide the lesson.
  const requestedMonth = highlightTarget
    ? parseJournalMonth(highlightTarget.date.slice(0, 7))
    : parseJournalMonth(initialMonth);
  const [viewMode, setViewMode] = useState<ViewMode>(requestedMonth ? "month" : "week");
  // "YYYY-MM-DD" on the business calendar (a deep-linked month opens on its first day).
  const [anchorDate, setAnchorDate] = useState<string>(() =>
    requestedMonth ? journalMonthAnchor(requestedMonth.year, requestedMonth.month) : formatBusinessDate(),
  );
  const [attendanceData, setAttendanceData] = useState<GroupAttendance | null>(null);
  const [localRecords, setLocalRecords] = useState<Record<string, Record<string, AttendanceStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [savingLessonKey, setSavingLessonKey] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<OpenAttendanceCell | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { showToast, toastNode } = useToast();
  const [columnMenu, setColumnMenu] = useState<{ key: string; anchor: MenuAnchor } | null>(null);
  const [columnBusyKey, setColumnBusyKey] = useState<string | null>(null);
  const [cancelMissed, setCancelMissed] = useState<CancelMissedTarget | null>(null);
  const [correcting, setCorrecting] = useState<CorrectionState | null>(null);
  const [correctionDialog, setCorrectionDialog] = useState<{ reason: string; error: string | null } | null>(null);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [reasonEditor, setReasonEditor] = useState<{ student: StudentInGroup; lesson: Lesson; text: string; error: string | null } | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  // O7: the version of each lesson record this screen last saw (the `expectedVersion` of the next save) and the open conflict.
  const versionsRef = useRef<VersionMap>({});
  const conflictKeysRef = useRef<Set<string>>(new Set());
  const [conflict, setConflict] = useState<(AttendanceConflictState & {
    lessonKey: string;
    lesson: Lesson;
    kind: "marks" | "correction" | "finish";
    status: string;
    reasons: Record<string, string>;
  }) | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  // O8: a running exam of the lesson that is being finished: asked before, on a second click the finish carries the ack.
  const [liveExam, setLiveExam] = useState<{ exams: LiveExamItem[]; lesson: Lesson } | null>(null);
  const [liveExamBusy, setLiveExamBusy] = useState(false);
  // O5: the dialog «Преподаватель урока».
  const [teacherTarget, setTeacherTarget] = useState<LessonTeacherTarget | null>(null);
  // «Подтвердить» / «Отклонить» ask first, like in the «Пропуски» list: the cell it came from rides along with the dialog.
  const [reviewDialog, setReviewDialog] = useState<
    (ExcuseDecisionTarget & { excuse: AttendanceExcuseInfo; lessonKey: string; studentId: string; error: string | null }) | null
  >(null);
  // An excuse whose decision is on its way: a second click sends nothing.
  const reviewingRef = useRef<Set<string>>(new Set());
  // The cell button that opened the dialog: focus goes back to it when the dialog closes (the menu item is gone by then).
  const reviewOpenerRef = useRef<HTMLElement | null>(null);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const cellMenuRef = useRef<HTMLDivElement | null>(null);
  // Attendance saves of one journal go out one at a time, in click order.
  const recordsRef = useRef<Record<string, Record<string, AttendanceStatus>>>({});
  const confirmedRef = useRef<Record<string, Record<string, AttendanceStatus>>>({});
  const pendingReasonsRef = useRef<Record<string, Record<string, string>>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const inflightSavesRef = useRef(0);
  const dirtyEpochRef = useRef(0);
  const reloadWantedRef = useRef(false);
  // Lessons that have queued or in-flight saves (count per lesson key) and the lesson being finished.
  const pendingByLessonRef = useRef<Record<string, number>>({});
  const finishingKeyRef = useRef<string | null>(null);
  // Latest-load-wins: an answer for an older period or group is dropped.
  const loadSequenceRef = useRef(createRequestSequence());
  const journalScrollRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const openCellContainerRef = useRef<HTMLTableCellElement | null>(null);

  const today = formatBusinessDate();
  const period = useMemo(() => journalPeriod(anchorDate, viewMode), [anchorDate, viewMode]);

  const loadAttendance = useCallback(async (silent = false) => {
    if (!groupId) return;
    const token = loadSequenceRef.current.next();
    if (!silent) setLoading(true);
    const epoch = dirtyEpochRef.current;
    try {
      const data = await orgApi.getGroupAttendance(groupId, {
        dateFrom: period.start,
        dateTo: period.end,
      });
      if (!loadSequenceRef.current.isCurrent(token)) return;
      // a lesson with an open conflict keeps its local marks too (they are in the dialog until the choice is made)
      const pendingKeys = [...pendingLessonKeys(pendingByLessonRef.current), ...Array.from(conflictKeysRef.current)];
      // A quiet reload must not overwrite marks that are still on their way to
      // the server, and its snapshot is older than the local state: drop it and
      // read again once the queue is empty (right away if it already is).
      if (silent && (inflightSavesRef.current > 0 || dirtyEpochRef.current !== epoch)) {
        if (inflightSavesRef.current > 0) reloadWantedRef.current = true;
        else void loadAttendanceRef.current(true);
        return;
      }
      setAttendanceData(data);
      versionsRef.current = mergeVersions(versionsRef.current, data.versions, pendingKeys);
      // A period/group switch must not lose lessons that still have pending saves.
      const merged = mergeLoadedRecords(data.records, recordsRef.current, pendingKeys);
      recordsRef.current = merged;
      confirmedRef.current = mergeLoadedRecords(data.records, confirmedRef.current, pendingKeys);
      setLocalRecords(merged);
      if (pendingKeys.length > 0) reloadWantedRef.current = true;
    } catch (error) {
      if (!loadSequenceRef.current.isCurrent(token)) return;
      setSaveError(error instanceof Error ? error.message : "Не удалось загрузить журнал");
    } finally {
      if (loadSequenceRef.current.isCurrent(token)) setLoading(false);
    }
  }, [groupId, period.end, period.start]);
  const loadAttendanceRef = useRef(loadAttendance);
  loadAttendanceRef.current = loadAttendance;

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  // Leaving the period while a correction is open would silently drop the edits.
  useEffect(() => { setCorrecting(null); setColumnMenu(null); }, [period.start, period.end]);

  useEffect(() => {
    if (!columnMenu) return;
    const close = () => setColumnMenu(null);
    const closeWhenClickedOutside = (event: PointerEvent) => {
      const target = event.target as Element;
      // The trigger toggles the menu itself; closing here would reopen it on click.
      if (target.closest?.("[data-column-menu-trigger]")) return;
      if (!columnMenuRef.current?.contains(target)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", closeWhenClickedOutside);
    document.addEventListener("keydown", closeOnEscape);
    const closeOnOuterScroll = (event: Event) => {
      if (!columnMenuRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnOuterScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickedOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnOuterScroll, true);
    };
  }, [columnMenu]);

  useEffect(() => {
    if (!openCell) return;

    const closeWhenClickedOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      // The menu lives in <body>; the cell holds only its trigger.
      if (!openCellContainerRef.current?.contains(target) && !cellMenuRef.current?.contains(target)) {
        setOpenCell(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenCell(null);
    };
    const close = () => setOpenCell(null);
    const closeOnOuterScroll = (event: Event) => {
      if (!cellMenuRef.current?.contains(event.target as Node)) close();
    };

    document.addEventListener("pointerdown", closeWhenClickedOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnOuterScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickedOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnOuterScroll, true);
    };
  }, [openCell]);

  const lessons = useMemo(
    () => attendanceData?.lessons || [],
    [attendanceData?.lessons],
  );

  // Deep link: highlight the lesson column once it is on screen and bring it into view.
  // Applied once per page visit; ignored when the lesson is not in the loaded period.
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const highlightAppliedRef = useRef(false);
  const targetLessonId = highlightTarget?.lessonId;
  const targetLessonDate = highlightTarget?.date;
  useEffect(() => {
    if (highlightAppliedRef.current || !targetLessonId || !targetLessonDate) return;
    const found = lessons.find((lesson) => lesson.id === targetLessonId && lesson.date === targetLessonDate);
    if (!found) return;
    highlightAppliedRef.current = true;
    const key = instanceKey(found);
    setHighlightedKey(key);
    const frame = window.requestAnimationFrame(() => {
      const container = journalScrollRef.current;
      const column = Array.from(container?.querySelectorAll<HTMLElement>("th[data-lesson-key]") ?? [])
        .find((element) => element.dataset.lessonKey === key);
      if (!container || !column) return;
      // The student column is sticky: leave it visible and put the lesson right after it.
      // Positions come from bounding boxes (the th's offsetParent is not this container).
      const stickyWidth = container.querySelector<HTMLElement>("thead th")?.getBoundingClientRect().width ?? 235;
      const offset = column.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;
      container.scrollTo({ left: Math.max(0, offset - stickyWidth - 8), behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lessons, targetLessonId, targetLessonDate]);
  useEffect(() => {
    if (!highlightedKey) return;
    const clear = () => setHighlightedKey(null);
    const timer = window.setTimeout(clear, 8000);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("keydown", clear, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("keydown", clear, true);
    };
  }, [highlightedKey]);

  // The active roster belongs at the top.  Students transferred out remain
  // below it only when this period contains their real attendance history.
  const membershipEventsByStudentId = useMemo(
    () => new Map((attendanceData?.membershipEvents || []).map((event) => [event.student_id, event])),
    [attendanceData?.membershipEvents],
  );
  const diagnosticReportNoticesByStudentId = useMemo(
    () => new Map((attendanceData?.diagnosticReportNotices || []).map((notice) => [notice.student_id, notice])),
    [attendanceData?.diagnosticReportNotices],
  );
  const activeStudents = useMemo<AttendanceJournalStudent[]>(
    () => students.map((student) => ({
      ...student,
      isHistorical: false,
      membershipEvent: membershipEventsByStudentId.get(student.id),
      diagnosticReportNotice: diagnosticReportNoticesByStudentId.get(student.id),
    })),
    [diagnosticReportNoticesByStudentId, membershipEventsByStudentId, students],
  );
  const historicalStudents = useMemo<AttendanceJournalStudent[]>(
    () => (attendanceData?.historicalStudents || []).map((student) => ({
      id: student.id,
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      full_name: student.full_name || "Ученик",
      class_level: student.class_level || 0,
      display_id: student.display_id || null,
      status: "transferred",
      student_phone: null,
      joined_at: null,
      last_theta: null,
      last_level: null,
      last_diagnosed_at: null,
      isHistorical: true,
      transferredAt: student.left_at || null,
      transferredToGroupName: student.transferred_to_group_name || null,
    })),
    [attendanceData?.historicalStudents],
  );
  const belongsToLesson = useCallback((student: AttendanceJournalStudent, lesson: Lesson) => {
    const frozenRoster = attendanceData?.rosterStudentIds?.[instanceKey(lesson)];
    if (frozenRoster) return frozenRoster.includes(student.id);
    if (student.isHistorical) {
      return Boolean(localRecords[instanceKey(lesson)]?.[student.id]);
    }
    // Scheduled rows have no frozen roster yet.  A student who joined after the lesson must not be shown as missing
    // from it; one who came back belonged during EVERY stay.  Decided at the lesson's start, like the server does.
    return wasMemberOn(student, lesson.date, lesson.startTime || lesson.start_time);
  }, [attendanceData?.rosterStudentIds, localRecords]);

  const getStatus = useCallback(
    (studentId: string, lesson: Lesson): AttendanceStatus | "" => {
      if (lesson.date > today) return "";
      const key = instanceKey(lesson);
      if (correcting?.key === key) return correcting.draft[studentId] || "";
      return localRecords[key]?.[studentId] || "";
    },
    [correcting, localRecords, today],
  );

  const movePeriod = (direction: -1 | 1) => {
    setOpenCell(null);
    // Pure calendar arithmetic: a month step lands on the 1st of the neighbouring month (never skips February).
    setAnchorDate((current) => moveJournalAnchor(current, viewMode, direction));
  };

  const toggleAttendanceMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLButtonElement>,
      studentId: string,
      lessonKey: string,
      isOpen: boolean,
    ) => {
      if (isOpen) {
        setOpenCell(null);
        return;
      }
      setColumnMenu(null);
      setOpenCell({ studentId, lessonKey, anchor: anchorOf(event.currentTarget) });
    },
    [],
  );

  const excusesOf = useCallback(
    (lessonKey: string) => attendanceData?.excuses?.[lessonKey],
    [attendanceData?.excuses],
  );

  /** O5: a teacher marks only the lessons he teaches; somebody else's (a substitute, the group's own teacher) is read-only for him. */
  const lessonIsOthers = (key: string): boolean =>
    !adminMode && lessonBelongsToOther(attendanceData?.lessonTeachers?.[key], viewerId);

  const handleSelectStatus = async (
    status: AttendanceStatus | "",
    student: StudentInGroup,
    lesson: Lesson,
    reason?: string,
  ) => {
    const lessonKey = instanceKey(lesson);
    const lessonStatus = attendanceData?.statuses?.[lessonKey] || lesson.status || "scheduled";
    const inCorrection = correcting?.key === lessonKey;
    // The lesson is being closed: a mark sent in parallel would race with the finish.
    if (finishingKeyRef.current === lessonKey) return;
    if (
      !canEdit
      || lessonIsOthers(lessonKey)
      || lesson.date > today
      || lessonStatus === "scheduled"
      || lessonStatus === "cancelled"
      || (lessonStatus === "completed" && !inCorrection)
    ) return;

    // "Excused" is saved only together with a reason (3..300): ask for it first.
    if (status === "excused" && reason === undefined) {
      setOpenCell(null);
      setReasonEditor({
        student,
        lesson,
        text: excusesOf(lessonKey)?.[student.id]?.reason
          ?? (inCorrection ? correcting?.reasons[student.id] : undefined)
          ?? "",
        error: null,
      });
      return;
    }

    // Correction of a completed lesson: edits pile up locally until "Сохранить исправление".
    if (inCorrection && correcting) {
      setOpenCell(null);
      setCorrecting((previous) => {
        if (!previous) return previous;
        const draft = { ...previous.draft };
        const reasons = { ...previous.reasons };
        if (status) draft[student.id] = status;
        else delete draft[student.id];
        if (status === "excused" && reason) reasons[student.id] = reason;
        else delete reasons[student.id];
        return { ...previous, draft, reasons };
      });
      return;
    }

    // Baseline for a rollback: the state the server holds before the first unsent change.
    if (!pendingByLessonRef.current[lessonKey]) {
      confirmedRef.current = { ...confirmedRef.current, [lessonKey]: { ...(recordsRef.current[lessonKey] || {}) } };
    }
    pendingByLessonRef.current[lessonKey] = (pendingByLessonRef.current[lessonKey] || 0) + 1;

    // Optimistic update first; the request itself waits for the earlier ones.
    const previousStatus = recordsRef.current[lessonKey]?.[student.id] || "";
    const updatedRecords = { ...(recordsRef.current[lessonKey] || {}) };
    if (status) updatedRecords[student.id] = status;
    else delete updatedRecords[student.id];
    recordsRef.current = { ...recordsRef.current, [lessonKey]: updatedRecords };
    dirtyEpochRef.current += 1;
    if (status === "excused" && reason) {
      pendingReasonsRef.current[lessonKey] = { ...(pendingReasonsRef.current[lessonKey] || {}), [student.id]: reason };
    } else if (pendingReasonsRef.current[lessonKey]) {
      const rest = { ...pendingReasonsRef.current[lessonKey] };
      delete rest[student.id];
      pendingReasonsRef.current[lessonKey] = rest;
    }

    setSaveError(null);
    setOpenCell(null);
    setLocalRecords(recordsRef.current);
    setSavingLessonKey(lessonKey);
    inflightSavesRef.current += 1;

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      // The newest local marks of THIS lesson go out (a reload of another period
      // keeps pending lessons, see mergeLoadedRecords); never an invented object.
      let sentReasons: Record<string, string> = {};
      try {
        // O7: a conflict of this lesson is open - the marks wait for the choice, nothing more is sent over it.
        if (conflictKeysRef.current.has(lessonKey)) return;
        const records = recordsForSave(recordsRef.current, lessonKey);
        if (!records) {
          // Unknown local state of the lesson: send nothing, read the server state instead.
          reloadWantedRef.current = true;
          return;
        }
        const reasons = pendingReasonsRef.current[lessonKey] || {};
        sentReasons = Object.fromEntries(
          Object.entries(reasons).filter(([studentId]) => records[studentId] === "excused"),
        );
        pendingReasonsRef.current[lessonKey] = {};
        const expectedVersion = expectedVersionFor(versionsRef.current, lessonKey);
        const saved = await orgApi.saveGroupAttendance(groupId, {
          lessonDate: lesson.date,
          lessonId: lesson.id,
          topic: lesson.topic,
          status: lessonStatus,
          records,
          ...(Object.keys(sentReasons).length ? { excuseReasons: sentReasons } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        });
        versionsRef.current = withSavedVersion(versionsRef.current, lessonKey, saved);
        confirmedRef.current = { ...confirmedRef.current, [lessonKey]: records };
        setAttendanceData((previous) => previous ? {
          ...previous,
          statuses: { ...previous.statuses, [lessonKey]: "in_progress" },
          lessons: previous.lessons.map((item) =>
            instanceKey(item) === lessonKey ? { ...item, status: "in_progress" } : item,
          ),
        } : previous);
        // The excuse record lives on the server; fetch its id and review state.
        if (Object.keys(sentReasons).length > 0 || previousStatus === "excused") {
          reloadWantedRef.current = true;
          void useExcuseBadge.getState().refresh(true);
        }
        // The server deletes the excuse (and its files) when "excused" is replaced.
        if (previousStatus === "excused" && status !== "excused") {
          setAttendanceData((previous) => {
            const forLesson = previous?.excuses?.[lessonKey];
            if (!previous || !forLesson?.[student.id]) return previous;
            const rest = { ...forLesson };
            delete rest[student.id];
            return { ...previous, excuses: { ...previous.excuses, [lessonKey]: rest } };
          });
        }
      } catch (error) {
        const failure = lessonFailure(error, "save", "Не удалось сохранить отметку");
        if (failure.kind === "conflict") {
          // O7: somebody saved this lesson first. My marks stay on screen (and in the dialog) until a choice is made.
          conflictKeysRef.current.add(lessonKey);
          setConflictError(null);
          setConflict({
            detail: failure.detail,
            base: { ...(confirmedRef.current[lessonKey] || {}) },
            mine: { ...(recordsRef.current[lessonKey] || {}) },
            lessonKey,
            lesson,
            kind: "marks",
            status: lessonStatus,
            reasons: sentReasons,
          });
          return;
        }
        // Show exactly what the server holds: later queued marks of this lesson are dropped too.
        const confirmed = confirmedRef.current[lessonKey];
        if (confirmed) recordsRef.current = { ...recordsRef.current, [lessonKey]: confirmed };
        reloadWantedRef.current = true;
        pendingReasonsRef.current[lessonKey] = {};
        setLocalRecords(recordsRef.current);
        const message = error instanceof Error ? error.message : "";
        setSaveError(
          /причин/i.test(message) && /ув|уважит/i.test(message)
            ? "Для уважительного пропуска нужна причина. Нажмите на отметку «Уважительная» у ученика и введите причину."
            : failure.kind !== "other" ? failure.text : message || "Не удалось сохранить отметку",
        );
      } finally {
        inflightSavesRef.current -= 1;
        pendingByLessonRef.current[lessonKey] = Math.max(0, (pendingByLessonRef.current[lessonKey] || 1) - 1);
        if (inflightSavesRef.current === 0) {
          setSavingLessonKey(null);
          if (reloadWantedRef.current) {
            reloadWantedRef.current = false;
            // The current render's loader (period / group), not the one of the click.
            void loadAttendanceRef.current(true);
          }
        }
      }
    });
  };

  const submitReasonEditor = () => {
    if (!reasonEditor) return;
    const error = validateExcuseReason(reasonEditor.text);
    if (error) {
      setReasonEditor({ ...reasonEditor, error });
      return;
    }
    const { student, lesson, text } = reasonEditor;
    setReasonEditor(null);
    void handleSelectStatus("excused", student, lesson, text.trim());
  };

  /** Sends one decision and updates the cell. Returns null when it was saved, else the reason it was not. */
  const sendReview = async (
    excuse: AttendanceExcuseInfo,
    lessonKey: string,
    studentId: string,
    action: ReviewAction,
    note = "",
  ): Promise<string | null> => {
    if (reviewingRef.current.has(excuse.id)) return "Решение уже отправляется";
    reviewingRef.current.add(excuse.id);
    setReviewBusyId(excuse.id);
    // The request carries the status the person SAW (`expected_status`): if somebody decided meanwhile the server answers
    // EXCUSE_CHANGED with the excuse as it is now; the cell takes it, the dialog stays open with the server's message.
    const patchCell = (item: ExcuseItemFields) =>
      setAttendanceData((previous) => {
        const current = previous?.excuses?.[lessonKey]?.[studentId];
        if (!previous || !current) return previous;
        return {
          ...previous,
          excuses: {
            ...previous.excuses,
            [lessonKey]: {
              ...previous.excuses?.[lessonKey],
              [studentId]: applyExcuseItem(current, item),
            },
          },
        };
      });
    try {
      const item = action === "reset"
        ? await orgApi.resetAttendanceExcuse(excuse.id, { expected_status: excuse.status })
        : await orgApi.reviewAttendanceExcuse(excuse.id, { decision: action, expected_status: excuse.status, ...(note ? { note } : {}) });
      patchCell(item);
      void useExcuseBadge.getState().refresh(true);
      return null;
    } catch (error) {
      const changed = excuseChange(error);
      if (changed) {
        const fresh = changed.item as { id?: string; status?: AttendanceExcuseInfo["status"] } | null;
        if (fresh && fresh.id === excuse.id && fresh.status) {
          patchCell(fresh as ExcuseItemFields);
          // the open dialog now stands on the new state: a second press is a decision about THAT state
          setReviewDialog((current) => (current && current.excuse.id === excuse.id
            ? {
              ...current,
              excuse: { ...current.excuse, status: fresh.status as AttendanceExcuseInfo["status"] },
              items: current.items.map((entry) => (entry.id === excuse.id ? { ...entry, status: fresh.status as AttendanceExcuseInfo["status"] } : entry)),
            }
            : current));
        } else {
          void loadAttendanceRef.current(true);
        }
        void useExcuseBadge.getState().refresh(true);
        return changed.message;
      }
      return error instanceof Error ? error.message : "Не удалось сохранить решение";
    } finally {
      reviewingRef.current.delete(excuse.id);
      setReviewBusyId(null);
    }
  };

  /** «Сбросить решение» needs no question: it only returns the excuse to the waiting list. */
  const handleReview = async (
    excuse: AttendanceExcuseInfo,
    lessonKey: string,
    studentId: string,
    action: ReviewAction,
  ) => {
    setOpenCell(null);
    setSaveError(null);
    const error = await sendReview(excuse, lessonKey, studentId, action);
    if (error) setSaveError(error);
  };

  /** «Подтвердить» / «Отклонить»: the dialog (student, lesson, reason, what changes) comes first, the request after it. */
  const askReview = (
    excuse: AttendanceExcuseInfo,
    lessonKey: string,
    student: StudentInGroup,
    lesson: Lesson,
    decision: ExcuseDecision,
  ) => {
    reviewOpenerRef.current = document.querySelector<HTMLElement>(`[aria-controls="attendance-menu-${student.id}-${lessonKey}"]`);
    setOpenCell(null);
    setSaveError(null);
    setReviewDialog({
      items: [subjectOfJournalCell({ excuse, studentName: student.full_name || "Ученик", lessonDate: lesson.date, groupName })],
      decision,
      noteMode: decision === "rejected" ? "optional" : "none",
      excuse,
      lessonKey,
      studentId: student.id,
      error: null,
    });
  };

  const closeReviewDialog = () => {
    setReviewDialog(null);
    const opener = reviewOpenerRef.current;
    reviewOpenerRef.current = null;
    // After the dialog has left the screen the cell that asked the question takes the focus back.
    if (opener) window.setTimeout(() => { if (document.contains(opener)) opener.focus(); }, 0);
  };

  const submitReviewDialog = async (note: string) => {
    if (!reviewDialog) return;
    const { excuse, lessonKey, studentId, decision } = reviewDialog;
    setReviewDialog((current) => (current ? { ...current, error: null } : current));
    const error = await sendReview(excuse, lessonKey, studentId, decision, note);
    if (error) setReviewDialog((current) => (current ? { ...current, error } : current));
    else closeReviewDialog();
  };

  // ── Lesson column actions (administrator / owner) ─────────────────────
  const openColumnMenu = (event: ReactMouseEvent<HTMLButtonElement>, key: string) => {
    if (columnMenu?.key === key) {
      setColumnMenu(null);
      return;
    }
    setOpenCell(null);
    setColumnMenu({ key, anchor: anchorOf(event.currentTarget) });
  };

  // The server judges completeness by the roster frozen at the start of the
  // lesson (it includes students transferred out later), so count the same way.
  const markedInLesson = (lesson: Lesson) => {
    const key = instanceKey(lesson);
    return rosterProgress(
      attendanceData?.rosterStudentIds?.[key],
      activeStudents.filter((student) => belongsToLesson(student, lesson)).map((student) => student.id),
      recordsRef.current[key] || localRecords[key],
    );
  };

  /** O7: the choice in the conflict dialog.  «Принять чужие» takes what the journal holds; «Оставить мои» lays my edits over it and saves again. */
  const resolveConflict = async (choice: "mine" | "theirs") => {
    const current = conflict;
    if (!current || conflictBusy) return;
    const { lessonKey: key, lesson, detail } = current;
    const theirs = (detail.records ?? {}) as Record<string, AttendanceStatus>;
    const closeConflict = () => { conflictKeysRef.current.delete(key); setConflict(null); setConflictError(null); };
    if (choice === "theirs") {
      recordsRef.current = { ...recordsRef.current, [key]: theirs };
      confirmedRef.current = { ...confirmedRef.current, [key]: theirs };
      versionsRef.current = { ...versionsRef.current, [key]: detail.currentVersion };
      setLocalRecords(recordsRef.current);
      closeConflict();
      if (current.kind === "correction") setCorrecting(null);
      void loadAttendanceRef.current(true);
      return;
    }
    setConflictBusy(true);
    setConflictError(null);
    const merged = mergeKeepMine(current.base, current.mine, theirs) as Record<string, AttendanceStatus>;
    try {
      if (current.kind === "finish") {
        // the action the person started was «Завершить урок»: the merged marks become the screen's and the finish is repeated
        recordsRef.current = { ...recordsRef.current, [key]: merged };
        confirmedRef.current = { ...confirmedRef.current, [key]: theirs };
        versionsRef.current = { ...versionsRef.current, [key]: detail.currentVersion };
        setLocalRecords(recordsRef.current);
        closeConflict();
        setColumnBusyKey(key);
        try {
          await finishLesson(lesson, false);
        } catch (finishError) {
          setSaveError(lessonFailure(finishError, "finish", "Не удалось завершить урок").text);
        } finally {
          setColumnBusyKey(null);
        }
        return;
      }
      if (current.kind === "correction") {
        const reason = correctionDialog?.reason.trim() ?? "";
        const saved = await orgApi.saveGroupAttendance(groupId, {
          lessonDate: lesson.date,
          lessonId: lesson.id,
          topic: lesson.topic,
          status: "completed",
          records: merged,
          correctionReason: reason,
          excuseReasons: collectExcuseReasons(merged, current.reasons, excusesOf(key)),
          expectedVersion: detail.currentVersion,
        });
        versionsRef.current = withSavedVersion(versionsRef.current, key, saved);
        closeConflict();
        setCorrecting(null);
        setCorrectionDialog(null);
        await loadAttendanceRef.current(true);
        void useExcuseBadge.getState().refresh(true);
        showToast(`Урок ${formatDateRu(lesson.date)} исправлен`);
        return;
      }
      const sentReasons = Object.fromEntries(Object.entries(current.reasons).filter(([studentId]) => merged[studentId] === "excused"));
      const saved = await orgApi.saveGroupAttendance(groupId, {
        lessonDate: lesson.date,
        lessonId: lesson.id,
        topic: lesson.topic,
        status: current.status as Exclude<typeof lesson.status, undefined | "scheduled">,
        records: merged,
        ...(Object.keys(sentReasons).length ? { excuseReasons: sentReasons } : {}),
        expectedVersion: detail.currentVersion,
      });
      versionsRef.current = withSavedVersion(versionsRef.current, key, saved);
      recordsRef.current = { ...recordsRef.current, [key]: merged };
      confirmedRef.current = { ...confirmedRef.current, [key]: merged };
      setLocalRecords(recordsRef.current);
      closeConflict();
      void loadAttendanceRef.current(true);
    } catch (error) {
      const failure = lessonFailure(error, "save", "Не удалось сохранить отметки. Данные не изменены.");
      if (failure.kind === "conflict") {
        // changed again while the dialog was open: show the newest state, my edits stay
        setConflict({ ...current, detail: failure.detail });
      } else {
        setConflictError(failure.text);
      }
    } finally {
      setConflictBusy(false);
    }
  };

  /** One finish of a lesson (the column menu): waits behind the queued marks, carries the version, asks before it ends a running exam. */
  const finishLesson = async (lesson: Lesson, acknowledgeLiveExam: boolean): Promise<"done" | "stopped" | "ask"> => {
    const key = instanceKey(lesson);
    // Cells of this lesson stay locked while it is being closed, and the
    // finish itself waits behind every mark already queued.
    finishingKeyRef.current = key;
    let asked: LiveExamItem[] | null = null;
    let conflicted: Parameters<typeof setConflict>[0] = null;
    const task = saveQueueRef.current.then(async () => {
      const { rosterCount, markedCount } = markedInLesson(lesson);
      const hint = finishBlockedHint(markedCount, rosterCount);
      if (hint) {
        showToast(hint, "warning");
        return false;
      }
      const records = recordsForSave(recordsRef.current, key);
      if (!records) throw new Error("Не удалось определить отметки урока. Обновите страницу и повторите.");
      const expectedVersion = expectedVersionFor(versionsRef.current, key);
      try {
        const saved = await orgApi.saveGroupAttendance(groupId, {
          lessonDate: lesson.date,
          lessonId: lesson.id,
          topic: lesson.topic,
          status: "completed",
          records,
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
          ...(acknowledgeLiveExam ? { acknowledgeLiveExam: true } : {}),
        });
        versionsRef.current = withSavedVersion(versionsRef.current, key, saved);
        const notice = examSyncNotice(saved?.examSync);
        if (notice) showToast(notice, "warning");
      } catch (error) {
        const failure = lessonFailure(error, "finish", "Не удалось завершить урок");
        if (failure.kind === "live_exam") { asked = failure.exams; return false; }
        if (failure.kind === "conflict") {
          // O7: somebody saved the lesson first - my marks go to the dialog; «Оставить мои» repeats the finish
          conflicted = {
            detail: failure.detail,
            base: { ...(confirmedRef.current[key] || {}) },
            mine: { ...records },
            lessonKey: key,
            lesson,
            kind: "finish",
            status: "completed",
            reasons: {},
          };
          return false;
        }
        throw error;
      }
      return true;
    });
    saveQueueRef.current = task.then(() => undefined, () => undefined);
    const finished = await task.finally(() => { finishingKeyRef.current = null; });
    if (conflicted) {
      conflictKeysRef.current.add(key);
      setConflictError(null);
      setLiveExam(null);
      setConflict(conflicted);
      return "stopped";
    }
    if (asked) {
      setLiveExam({ exams: asked, lesson });
      return "ask";
    }
    if (!finished) return "stopped";
    await loadAttendanceRef.current(true);
    void useExcuseBadge.getState().refresh(true);
    showToast(`Урок ${formatDateRu(lesson.date)} завершён`);
    return "done";
  };

  const confirmLiveExamFinish = async () => {
    const pending = liveExam;
    if (!pending || liveExamBusy) return;
    setLiveExamBusy(true);
    try {
      const outcome = await finishLesson(pending.lesson, true);
      if (outcome !== "ask") setLiveExam(null);
    } catch (error) {
      const failure = lessonFailure(error, "finish", "Не удалось завершить урок");
      setLiveExam(null);
      if (failure.kind === "conflict") { setSaveError(failure.text); void loadAttendanceRef.current(true); }
      else setSaveError(failure.text);
    } finally {
      setLiveExamBusy(false);
    }
  };

  const runColumnAction = async (action: AdminLessonAction | "replace_teacher", lesson: Lesson) => {
    const key = instanceKey(lesson);
    setColumnMenu(null);
    setSaveError(null);

    if (action === "cancel_missed") {
      setCancelMissed({ groupId, lessonId: lesson.id, lessonDate: lesson.date });
      return;
    }
    if (action === "replace_teacher") {
      setTeacherTarget({
        groupId,
        lessonId: lesson.id,
        lessonDate: lesson.date,
        startTime: lesson.startTime || lesson.start_time || "",
        endTime: lesson.endTime || "",
        info: attendanceData?.lessonTeachers?.[key] ?? null,
      });
      return;
    }
    if (action === "correct") {
      setCorrecting({ key, draft: { ...(localRecords[key] || {}) }, reasons: {} });
      return;
    }

    setColumnBusyKey(key);
    try {
      if (action === "reconcile") {
        await orgApi.reconcileMissedGroupAttendance(groupId, {
          lessonDate: lesson.date,
          lessonId: lesson.id,
          topic: lesson.topic,
        });
        await loadAttendanceRef.current(true);
        showToast("Урок открыт: отметьте учеников в столбце");
      } else if (action === "finish") {
        await finishLesson(lesson, false);
      }
    } catch (error) {
      const failure = lessonFailure(error, action === "finish" ? "finish" : "reconcile", "Не удалось выполнить действие");
      setSaveError(failure.text);
      // somebody saved the lesson first: the journal is read again so the marks on screen are theirs
      if (failure.kind === "conflict") void loadAttendanceRef.current(true);
    } finally {
      setColumnBusyKey(null);
    }
  };

  const correctingLesson = correcting
    ? lessons.find((lesson) => instanceKey(lesson) === correcting.key) || null
    : null;
  const correctionChanges = correcting
    ? diffCorrection(localRecords[correcting.key] || {}, correcting.draft, correcting.reasons, excusesOf(correcting.key))
    : [];
  const correctionWarningById = new Map<string, string>();
  if (correcting) {
    correctionWarnings(correctionChanges, attendanceData?.excuses?.[correcting.key])
      .forEach((warning) => correctionWarningById.set(warning.studentId, warning.text));
  }
  const studentNameById = useMemo(() => {
    const names = new Map<string, string>();
    [...activeStudents, ...historicalStudents].forEach((student) => {
      names.set(
        student.id,
        `${student.last_name || ""} ${student.first_name || ""}`.trim() || student.full_name || "Ученик",
      );
    });
    return names;
  }, [activeStudents, historicalStudents]);

  const submitCorrection = async () => {
    if (!correcting || !correctionDialog || !correctingLesson) return;
    const error = validateCorrectionReason(correctionDialog.reason);
    if (error) {
      setCorrectionDialog({ ...correctionDialog, error });
      return;
    }
    setCorrectionSaving(true);
    try {
      const expectedVersion = expectedVersionFor(versionsRef.current, correcting.key);
      const saved = await orgApi.saveGroupAttendance(groupId, {
        lessonDate: correctingLesson.date,
        lessonId: correctingLesson.id,
        topic: correctingLesson.topic,
        status: "completed",
        records: correcting.draft,
        correctionReason: correctionDialog.reason.trim(),
        excuseReasons: collectExcuseReasons(correcting.draft, correcting.reasons, excusesOf(correcting.key)),
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      });
      versionsRef.current = withSavedVersion(versionsRef.current, correcting.key, saved);
      const date = formatDateRu(correctingLesson.date);
      setCorrecting(null);
      setCorrectionDialog(null);
      await loadAttendanceRef.current(true);
      void useExcuseBadge.getState().refresh(true);
      showToast(`Урок ${date} исправлен`);
    } catch (err) {
      const failure = lessonFailure(err, "save", "Не удалось сохранить исправление. Данные не изменены.");
      if (failure.kind === "conflict") {
        // O7: the lesson was saved by somebody else meanwhile - my edits go to the conflict dialog
        conflictKeysRef.current.add(correcting.key);
        setConflictError(null);
        setConflict({
          detail: failure.detail,
          base: { ...(localRecords[correcting.key] || {}) },
          mine: { ...correcting.draft },
          lessonKey: correcting.key,
          lesson: correctingLesson,
          kind: "correction",
          status: "completed",
          reasons: correcting.reasons,
        });
        return;
      }
      setCorrectionDialog({
        ...correctionDialog,
        error: failure.text,
      });
    } finally {
      setCorrectionSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {saveError && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{saveError}</div>
          <button type="button" onClick={() => setSaveError(null)} aria-label="Закрыть сообщение об ошибке" className="rounded p-0.5 hover:bg-rose-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {correcting && correctingLesson && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Pencil className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Исправление урока {formatDateRu(correctingLesson.date)}. Меняйте отметки в подсвеченном столбце, затем нажмите «Сохранить исправление» в его заголовке.
          </span>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
          Журнал открыт в режиме просмотра. Корректировки завершённых уроков выполняются только через контролируемую административную процедуру.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => movePeriod(-1)}
              aria-label={viewMode === "week" ? "Предыдущая неделя" : "Предыдущий месяц"}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex min-w-[205px] items-center justify-center gap-2 px-3 text-center text-xs font-semibold text-slate-800 sm:text-sm">
              <CalendarDays className="h-4 w-4 text-primary-600" />
              {period.label}
            </div>
            <button
              type="button"
              onClick={() => movePeriod(1)}
              aria-label={viewMode === "week" ? "Следующая неделя" : "Следующий месяц"}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex w-fit rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`rounded-lg px-3 py-1.5 ${viewMode === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              Неделя
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`rounded-lg px-3 py-1.5 ${viewMode === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              Месяц
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-sm text-slate-500"><Loader2 className="h-7 w-7 animate-spin text-primary-600" />Загрузка посещаемости…</div>
        ) : activeStudents.length === 0 && historicalStudents.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-slate-500"><Users className="h-10 w-10 text-slate-300" /><p className="font-semibold text-slate-800">В группе нет учеников</p><p className="max-w-sm text-sm">Добавьте учеников во вкладке «Ученики», чтобы вести журнал.</p></div>
        ) : lessons.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-slate-500"><CalendarDays className="h-10 w-10 text-slate-300" /><p className="font-semibold text-slate-800">Нет занятий в выбранном периоде</p><p className="max-w-sm text-sm">Журнал показывает только занятия из утверждённого расписания группы.</p></div>
        ) : (
          <>
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
            <h3 className="text-sm font-bold text-slate-800">Журнал посещаемости</h3>
            <AttendanceLegendHint />
          </div>
          <div ref={journalScrollRef} className="overflow-x-auto">
            <table className="min-w-max w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-[235px] border-r border-slate-200 bg-slate-50 px-5 py-3.5 text-[13px] font-semibold text-slate-500"
                  >
                    Ученик ({activeStudents.length})
                  </th>
                  {lessons.map((lesson) => {
                    const dateValue = journalColumnDate(lesson.date);
                    const key = instanceKey(lesson);
                    const lessonStatus = attendanceData?.statuses?.[key] || lesson.status || "scheduled";
                    const presentation = lessonStatusPresentation(lessonStatus, lesson.date, today);
                    const inCorrection = correcting?.key === key;
                    const correction = attendanceData?.corrections?.[key];
                    const adminActions = adminMode && canEdit && !correcting
                      ? lessonAdminActions(lessonStatus, lesson.date, today)
                      : [];
                    const teacherInfo = attendanceData?.lessonTeachers?.[key];
                    const teacherLabel = substituteLabel(teacherInfo);
                    // O5: the owner and the administrator can replace the teacher of a lesson that is not cancelled
                    const canReplace = adminMode && canEdit && !correcting && Boolean(teacherInfo) && canReplaceTeacher("admin", lessonStatus);
                    return (
                      <th
                        key={key}
                        scope="col"
                        data-lesson-key={key}
                        title={presentation.description}
                        className={`relative min-w-[132px] border-r border-slate-200 px-3 py-3 text-center transition-colors duration-500 ${inCorrection ? "bg-amber-50 ring-2 ring-inset ring-amber-300" : highlightedKey === key ? "bg-primary-100 ring-2 ring-inset ring-primary-300" : lesson.date === today ? "bg-primary-50" : ""}`}
                      >
                        {(adminActions.length > 0 || canReplace) && (
                          <button
                            type="button"
                            data-column-menu-trigger
                            onClick={(event) => openColumnMenu(event, key)}
                            disabled={columnBusyKey === key}
                            aria-label={`Действия с уроком ${formatDateRu(lesson.date)}`}
                            aria-haspopup="menu"
                            aria-expanded={columnMenu?.key === key}
                            title="Действия с уроком"
                            className="absolute right-1 top-1 rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-60"
                          >
                            {columnBusyKey === key ? <Loader2 className="h-4 w-4 animate-spin text-primary-600" /> : <MoreHorizontal className="h-4 w-4" />}
                          </button>
                        )}
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">
                            {dateValue.day} {dateValue.monthShort}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {dateValue.weekday} {lesson.isRescheduled && lesson.originalStartTime ? (
                              <>
                                <span className="text-slate-400 line-through">{lesson.originalStartTime}</span>
                                <span> → {lesson.startTime || lesson.start_time || ""}</span>
                              </>
                            ) : (
                              lesson.startTime || lesson.start_time || ""
                            )}
                          </div>
                          {lesson.isRescheduled && (
                            <div className="text-[10px] font-semibold text-amber-700">Перенесён</div>
                          )}
                          {teacherLabel && (
                            <div className="mx-auto w-fit max-w-[120px] truncate rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800" title={teacherLabel}>{teacherLabel}</div>
                          )}
                          <LessonChips
                            marks={lessonMarks(attendanceData?.substitutionRequests?.[key], lesson.substitutionOutcome, { manager: adminMode })}
                            requestHref={adminMode ? (requestId) => substitutionsHref(substitutionsPathFor(user), requestId) : undefined}
                            className="justify-center"
                          />
                          {lessonIsOthers(key) && (
                            <div className="mx-auto max-w-[120px] text-[10px] font-medium leading-tight text-slate-500">{notYourLessonText(teacherInfo)}</div>
                          )}
                          {lacksTeacher(teacherInfo) && adminMode && (
                            <div className="text-[10px] font-semibold text-amber-700">{NO_LESSON_TEACHER_TEXT}</div>
                          )}
                          <div className={`text-[10px] font-semibold ${presentation.className}`}>
                            {presentation.label}
                          </div>
                          {correction && lessonStatus === "completed" && (
                            <div>
                              <Hint
                                text={[
                                  `Исправлено: ${[correction.by_name, formatUtcNaiveAsBusinessDateTime(correction.at)].filter(Boolean).join(", ")}`,
                                  correction.reason ? `Причина: ${correction.reason}` : "",
                                ].filter(Boolean).join("\n")}
                                className="inline-flex border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                              >
                                Исправлено
                              </Hint>
                            </div>
                          )}
                          {inCorrection && (
                            <div className="flex flex-col gap-1 pt-1.5">
                              <button
                                type="button"
                                disabled={correctionChanges.length === 0}
                                onClick={() => setCorrectionDialog({ reason: "", error: null })}
                                title={correctionChanges.length === 0 ? "Измените хотя бы одну отметку" : undefined}
                                className="rounded-lg bg-primary-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Сохранить исправление{correctionChanges.length > 0 ? ` (${correctionChanges.length})` : ""}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setCorrecting(null); setOpenCell(null); }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Отмена
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStudents.map((student) => {
                  const fullName = `${student.last_name || ""} ${student.first_name || ""}`.trim() || student.full_name || "Ученик";
                  const membershipEvent = student.membershipEvent;
                  const studentProfileHref = studentProfileBasePath ? `${studentProfileBasePath}/${student.id}` : null;
                  const rowClassName = "hover:bg-slate-50";
                  const stickyCellClassName = "bg-white group-hover:bg-slate-50";
                  return (
                    <tr key={student.id} className={rowClassName}>
                      <td className={`sticky left-0 z-10 border-r border-slate-200 px-5 py-3 ${stickyCellClassName}`}>
                        {studentProfileHref ? (
                          <Link href={studentProfileHref} title="Открыть профиль ученика" className="flex items-center gap-3 rounded-lg outline-none transition-colors hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100 text-xs font-bold text-primary-700">
                              {fullName[0]}
                            </span>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className="min-w-0 truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-primary-700" title={fullName}>{fullName}</p>
                                {membershipEvent && (
                                  <Hint text={formatMembershipEvent(membershipEvent)} className="shrink-0 border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Переведён</Hint>
                                )}
                                {!membershipEvent && student.diagnosticReportNotice && (
                                  <Hint text="Ученик зачислен после диагностики. Метка исчезнет после ознакомления преподавателя с отчётом." className="shrink-0 border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Новый</Hint>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {student.class_level ? `${student.class_level} класс` : student.display_id || ""}
                              </p>
                            </div>
                          </Link>
                        ) : (
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100 text-xs font-bold text-primary-700">
                            {fullName[0]}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="min-w-0 truncate text-sm font-semibold text-slate-900" title={fullName}>{fullName}</p>
                              {membershipEvent && (
                                <Hint text={formatMembershipEvent(membershipEvent)} className="shrink-0 border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Переведён</Hint>
                              )}
                              {!membershipEvent && student.diagnosticReportNotice && (
                                <Hint text="Ученик зачислен после диагностики. Метка исчезнет после ознакомления преподавателя с отчётом." className="shrink-0 border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Новый</Hint>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {student.class_level ? `${student.class_level} класс` : student.display_id || ""}
                            </p>
                          </div>
                        </div>
                        )}
                      </td>
                      {lessons.map((lesson) => {
                        const key = instanceKey(lesson);
                        const value = getStatus(student.id, lesson);
                        const option = statusOption(value);
                        const lessonStatus = attendanceData?.statuses?.[key] || lesson.status || "scheduled";
                        const isFutureLesson = lesson.date > today;
                        const wasInLesson = belongsToLesson(student, lesson);
                        const inCorrection = correcting?.key === key;
                        const locked = !wasInLesson || !canEdit || lessonIsOthers(key) || columnBusyKey === key || isFutureLesson || lessonStatus === "scheduled" || (lessonStatus === "completed" && !inCorrection) || lessonStatus === "cancelled";
                        const isOpen = openCell?.studentId === student.id && openCell.lessonKey === key;
                        // The excuse record belongs to the saved mark, not to an unsaved correction.
                        const savedIsExcused = localRecords[key]?.[student.id] === "excused";
                        const excuse = value === "excused" && savedIsExcused ? excusesOf(key)?.[student.id] : undefined;
                        const reviewable = adminMode && !inCorrection && Boolean(excuse);
                        const excuseView = value === "excused" ? excuseCellView(excuse?.status) : null;
                        const cellClassName = excuseView && excuseView.tone !== "plain"
                          ? EXCUSE_TONE_CLASS[excuseView.tone]
                          : option?.className;
                        const lockedTitle = !wasInLesson
                            ? "Ученик ещё не состоял в группе на дату этого занятия"
                          : isFutureLesson
                          ? "Нельзя отмечать посещаемость будущего урока"
                          : lessonStatus === "scheduled"
                            ? "Сначала начните урок в расписании или на панели «Сегодня»"
                          : lessonStatus === "completed"
                            ? (adminMode && canEdit ? "Завершённый урок: для изменения выберите «⋯ → Исправить» в заголовке столбца" : "Завершённый урок защищён от случайного изменения")
                            : lessonStatus === "cancelled"
                              ? "Отменённый урок нельзя отмечать"
                              : "Режим просмотра";
                        const baseTitle = locked ? lockedTitle : "Выбрать отметку";
                        const cellTitle = excuse ? `${excuseStatusMeaning(excuse.status)}\n${excuseTooltip(excuse)}${locked && !reviewable ? "" : `\n${baseTitle}`}` : baseTitle;
                        const cellBusy = Boolean(excuse && reviewBusyId === excuse.id);
                        // A locked cell that carries an excuse still opens a READ-ONLY menu (the reason, by touch): its marking
                        // actions are all behind `!locked`, its review actions behind `reviewable`.
                        const readOnlyExcuse = locked && !reviewable && Boolean(excuse);
                        const menuAvailable = isOpen && (!locked || reviewable || Boolean(excuse));

                        return (
                          <td ref={isOpen ? openCellContainerRef : undefined} key={key} className={`relative border-r border-slate-100 p-2 text-center transition-colors duration-500 ${inCorrection ? "bg-amber-50/60" : highlightedKey === key ? "bg-primary-50" : ""}`}>
                            {wasInLesson ? <button
                              type="button"
                              disabled={locked && !reviewable && !excuse}
                              onClick={(event) => toggleAttendanceMenu(event, student.id, key, isOpen)}
                              title={cellTitle}
                              aria-expanded={isOpen}
                              aria-controls={isOpen ? `attendance-menu-${student.id}-${key}` : undefined}
                              className={`mx-auto flex min-h-8 min-w-[92px] items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 font-bold transition-colors ${option ? cellClassName : "border-slate-200 bg-slate-50 text-slate-400"} ${locked && !reviewable ? (excuse ? "cursor-help opacity-70" : "cursor-not-allowed opacity-70") : "cursor-pointer"}`}
                            >
                              {option ? (
                                <>
                                  <span className={`h-1.5 w-1.5 rounded-full ${option.dotClassName}`} />
                                  {excuseView ? excuseView.label : option.short}
                                </>
                              ) : "—"}
                            </button> : (
                              <span title="Ученик ещё не состоял в группе" className="mx-auto flex min-h-8 min-w-[92px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 font-medium text-slate-300">—</span>
                            )}
                            {menuAvailable && openCell && (
                              <FloatingMenu anchor={openCell.anchor} menuRef={cellMenuRef} id={`attendance-menu-${student.id}-${key}`} role={readOnlyExcuse ? "group" : "menu"}>
                                {/* The reason of an absence used to live only in the cell's hover title. */}
                                {excuse && (
                                  <div className="mb-1 rounded-xl bg-slate-50 px-3 py-2">
                                    <p className="whitespace-pre-line break-words text-[11px] leading-relaxed text-slate-600">{excuseTooltip(excuse, { withLate: false })}</p>
                                    {afterDeadlineMark(excuse) && <div className="mt-1.5 flex"><AfterDeadlineChip mark={afterDeadlineMark(excuse)!} /></div>}
                                  </div>
                                )}
                                {!locked && STATUS_OPTIONS.map((item) => (
                                  <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => void handleSelectStatus(item.value, student, lesson)}
                                    role="menuitemradio"
                                    aria-checked={value === item.value}
                                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                                      <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClassName}`} />
                                      <span>{item.value === "excused" && value === "excused" ? "Уважительная · изменить причину" : item.label}</span>
                                    </span>
                                    {value === item.value && <Check className="h-3.5 w-3.5 text-primary-600" />}
                                  </button>
                                ))}
                                {!locked && value && !inCorrection && (
                                  <>
                                    <div className="my-1 h-px bg-slate-100" />
                                    <button
                                      type="button"
                                      onClick={() => void handleSelectStatus("", student, lesson)}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                      Сбросить отметку
                                    </button>
                                  </>
                                )}
                                {reviewable && excuse && (
                                  <>
                                    {!locked && <div className="my-1 h-px bg-slate-100" />}
                                    <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-slate-500">Уважительный пропуск</p>
                                    {excuse.status !== "confirmed" && (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => askReview(excuse, key, student, lesson, "confirmed")}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                        Подтвердить
                                      </button>
                                    )}
                                    {excuse.status !== "rejected" && (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => askReview(excuse, key, student, lesson, "rejected")}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                        Отклонить
                                      </button>
                                    )}
                                    {excuse.status !== "pending" && (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void handleReview(excuse, key, student.id, "reset")}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                      >
                                        <Undo2 className="h-3.5 w-3.5" />
                                        Сбросить решение
                                      </button>
                                    )}
                                  </>
                                )}
                              </FloatingMenu>
                            )}
                            {cellBusy && (
                              <Loader2 className="absolute right-1 top-1 h-3.5 w-3.5 animate-spin text-primary-600" />
                            )}
                            {savingLessonKey === key && (
                              <Loader2 className="absolute right-1 top-1 h-3.5 w-3.5 animate-spin text-primary-600" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {historicalStudents.length > 0 && lessons.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
          <div className="border-b border-slate-200 bg-slate-100/80 px-5 py-4">
            <h3 className="text-sm font-bold text-slate-800">История переведённых учеников</h3>
            <p className="mt-1 text-xs text-slate-500">Отметки сохранены по фактическим занятиям. Пока урок открыт, переведённого ученика из его состава можно отметить так же, как остальных.</p>
          </div>
          <div ref={historyScrollRef} className="overflow-x-auto">
            <table className="min-w-max w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="sticky left-0 z-20 min-w-[235px] border-r border-slate-200 bg-slate-50 px-5 py-3.5 text-[13px] font-semibold text-slate-500">
                    Ученик
                  </th>
                  {lessons.map((lesson) => {
                    const dateValue = journalColumnDate(lesson.date);
                    const key = instanceKey(lesson);
                    const lessonStatus = attendanceData?.statuses?.[key] || lesson.status || "scheduled";
                    const presentation = lessonStatusPresentation(lessonStatus, lesson.date, today);
                    return (
                      <th key={key} scope="col" title={presentation.description} className="min-w-[132px] border-r border-slate-200 px-3 py-3 text-center">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">{dateValue.day} {dateValue.monthShort}</div>
                          <div className="text-[11px] text-slate-500">{dateValue.weekday} {lesson.startTime || lesson.start_time || ""}</div>
                          <div className={`text-[10px] font-semibold ${presentation.className}`}>{presentation.label}</div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {historicalStudents.map((student) => {
                  const fullName = `${student.last_name || ""} ${student.first_name || ""}`.trim() || student.full_name || "Ученик";
                  const transferDescription = `Ученик переведён${student.transferredToGroupName ? ` в «${student.transferredToGroupName}»` : " в другую группу"}${student.transferredAt ? ` ${formatUtcNaiveAsBusinessDate(student.transferredAt)}` : ""}.`;
                  const studentProfileHref = studentProfileBasePath ? `${studentProfileBasePath}/${student.id}` : null;
                  return (
                    <tr key={student.id} className="bg-white">
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-5 py-3">
                        {studentProfileHref ? (
                          <Link href={studentProfileHref} title="Открыть профиль ученика" className="flex items-center gap-3 rounded-lg outline-none transition-colors hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{fullName[0]}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800 transition-colors hover:text-primary-700" title={fullName}>{fullName}</p>
                              <Hint text={transferDescription} className="mt-1 inline-flex border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Переведён</Hint>
                            </div>
                          </Link>
                        ) : (
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{fullName[0]}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800" title={fullName}>{fullName}</p>
                            <Hint text={transferDescription} className="mt-1 inline-flex border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Переведён</Hint>
                          </div>
                        </div>
                        )}
                      </td>
                      {lessons.map((lesson) => {
                        const key = instanceKey(lesson);
                        const wasInLesson = belongsToLesson(student, lesson);
                        const value = getStatus(student.id, lesson);
                        const option = statusOption(value);
                        const lessonStatus = attendanceData?.statuses?.[key] || lesson.status || "scheduled";
                        const inCorrection = correcting?.key === key;
                        // A student transferred out later is still on the roster frozen for this lesson.
                        const editable = wasInLesson && canEdit && !lessonIsOthers(key) && columnBusyKey !== key && lesson.date <= today
                          && (lessonStatus === "in_progress" || (lessonStatus === "completed" && inCorrection));
                        const isOpen = openCell?.studentId === student.id && openCell.lessonKey === key;
                        return (
                          <td ref={isOpen ? openCellContainerRef : undefined} key={key} className="relative border-r border-slate-100 p-2 text-center">
                            {wasInLesson ? (
                              editable ? (
                                <button
                                  type="button"
                                  onClick={(event) => toggleAttendanceMenu(event, student.id, key, isOpen)}
                                  title={`${transferDescription} Пока урок открыт, отметку можно поставить или изменить.`}
                                  aria-expanded={isOpen}
                                  className={`mx-auto flex min-h-8 min-w-[92px] cursor-pointer items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 font-bold transition-colors ${option ? option.className : "border-slate-200 bg-slate-50 text-slate-400"}`}
                                >
                                  {option ? <><span className={`h-1.5 w-1.5 rounded-full ${option.dotClassName}`} />{option.short}</> : "—"}
                                </button>
                              ) : (
                                <span title={transferDescription} className={`mx-auto flex min-h-8 min-w-[92px] items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 font-bold ${option ? option.className.replace(/\shover:bg-\S+/, "") : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                                  {option ? <><span className={`h-1.5 w-1.5 rounded-full ${option.dotClassName}`} />{option.short}</> : "—"}
                                </span>
                              )
                            ) : (
                              <span title={transferDescription} className="mx-auto flex min-h-8 min-w-[92px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 font-medium text-slate-300">—</span>
                            )}
                            {isOpen && editable && openCell && (
                              <FloatingMenu anchor={openCell.anchor} menuRef={cellMenuRef}>
                                {STATUS_OPTIONS.map((item) => (
                                  <button
                                    key={item.value}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={value === item.value}
                                    onClick={() => void handleSelectStatus(item.value, student, lesson)}
                                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                                      <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClassName}`} />
                                      <span>{item.label}</span>
                                    </span>
                                    {value === item.value && <Check className="h-3.5 w-3.5 text-primary-600" />}
                                  </button>
                                ))}
                              </FloatingMenu>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Lesson column menu (administrator) */}
      {columnMenu && typeof document !== "undefined" && (() => {
        const lesson = lessons.find((item) => instanceKey(item) === columnMenu.key);
        if (!lesson) return null;
        const lessonStatus = attendanceData?.statuses?.[columnMenu.key] || lesson.status || "scheduled";
        const actions = lessonAdminActions(lessonStatus, lesson.date, today);
        const menuTeacherInfo = attendanceData?.lessonTeachers?.[columnMenu.key];
        const menuCanReplace = Boolean(menuTeacherInfo) && canReplaceTeacher("admin", lessonStatus);
        const { rosterCount, markedCount } = markedInLesson(lesson);
        const finishHint = finishBlockedHint(markedCount, rosterCount);
        return (
          <FloatingMenu anchor={columnMenu.anchor} width={240} align="end" menuRef={columnMenuRef}>
            <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-slate-500">
              Урок {formatDateRu(lesson.date)}
            </p>
            {actions.includes("reconcile") && (
              <button type="button" role="menuitem" onClick={() => void runColumnAction("reconcile", lesson)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <ClipboardCheck className="h-4 w-4 text-primary-600" />
                {MARK_LESSON_LABEL}
              </button>
            )}
            {actions.includes("cancel_missed") && (
              <button type="button" role="menuitem" onClick={() => void runColumnAction("cancel_missed", lesson)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Ban className="h-4 w-4 text-slate-500" />
                {cancelLessonLabel(true)}
              </button>
            )}
            {actions.includes("finish") && (
              <button
                type="button"
                role="menuitem"
                aria-disabled={Boolean(finishHint)}
                onClick={() => {
                  if (finishHint) {
                    setColumnMenu(null);
                    showToast(finishHint, "warning");
                  } else {
                    void runColumnAction("finish", lesson);
                  }
                }}
                className={`flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold hover:bg-slate-50 ${finishHint ? "text-slate-400" : "text-slate-700"}`}
              >
                <span className="flex items-center gap-2"><CheckCheck className={`h-4 w-4 ${finishHint ? "text-slate-300" : "text-emerald-600"}`} />{FINISH_LESSON_LABEL}</span>
                {finishHint && <span className="pl-6 text-[11px] font-medium text-amber-700">{finishHint}</span>}
              </button>
            )}
            {menuCanReplace && (
              <button type="button" role="menuitem" onClick={() => void runColumnAction("replace_teacher", lesson)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <UserRoundCheck className="h-4 w-4 text-violet-600" />
                {assignActionLabel({ past: lesson.date <= today, lacksTeacher: lacksTeacher(menuTeacherInfo), isSubstitution: Boolean(menuTeacherInfo?.isSubstitution) })}
              </button>
            )}
            {actions.includes("correct") && (
              <button type="button" role="menuitem" onClick={() => void runColumnAction("correct", lesson)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Pencil className="h-4 w-4 text-amber-600" />
                {CORRECT_MARKS_LABEL}
              </button>
            )}
          </FloatingMenu>
        );
      })()}

      <AttendanceConflictDialog
        conflict={conflict}
        names={Object.fromEntries(studentNameById)}
        busy={conflictBusy}
        error={conflictError}
        onKeepMine={() => void resolveConflict("mine")}
        onTakeTheirs={() => void resolveConflict("theirs")}
      />
      <LiveExamConfirmDialog
        exams={liveExam?.exams ?? null}
        busy={liveExamBusy}
        onConfirm={() => void confirmLiveExamFinish()}
        onBack={() => setLiveExam(null)}
      />
      <LessonTeacherDialog
        target={teacherTarget}
        onClose={() => setTeacherTarget(null)}
        onChanged={(result) => {
          setTeacherTarget(null);
          showToast(directAssignToast(result));
          void loadAttendanceRef.current(true);
        }}
      />

      {/* Reason for an excused absence */}
      <Modal
        open={reasonEditor !== null}
        title="Причина уважительного пропуска"
        description={reasonEditor ? `${reasonEditor.student.full_name || `${reasonEditor.student.last_name} ${reasonEditor.student.first_name}`.trim()} · урок ${formatDateRu(reasonEditor.lesson.date)}` : undefined}
        onClose={() => setReasonEditor(null)}
        footer={
          <>
            <button type="button" onClick={() => setReasonEditor(null)} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Отмена</button>
            <button type="button" onClick={submitReasonEditor} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">Сохранить</button>
          </>
        }
      >
        {reasonEditor && (
          <div className="space-y-2 pb-2">
            <label htmlFor="excuse-reason" className="block text-[13px] font-semibold text-slate-500">Причина</label>
            <textarea
              id="excuse-reason"
              value={reasonEditor.text}
              onChange={(event) => setReasonEditor({ ...reasonEditor, text: event.target.value, error: null })}
              onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submitReasonEditor(); }}
              rows={3}
              maxLength={EXCUSE_REASON_MAX}
              autoFocus
              placeholder="Например: заболел, написал в Telegram"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10"
            />
            <div className="flex items-start justify-between gap-3 text-xs">
              <span className={reasonEditor.error ? "font-medium text-rose-600" : "text-slate-400"}>
                {reasonEditor.error || "От 3 до 300 символов. Администратор подтвердит или отклонит пропуск."}
              </span>
              <span className="shrink-0 text-slate-400">{reasonEditor.text.trim().length}/{EXCUSE_REASON_MAX}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* «Подтвердить» / «Отклонить» an excuse: the same dialog as in the «Пропуски» list */}
      <ExcuseDecisionDialog
        target={reviewDialog}
        busy={reviewDialog ? reviewBusyId === reviewDialog.excuse.id : false}
        error={reviewDialog?.error ?? null}
        onClose={closeReviewDialog}
        onSubmit={submitReviewDialog}
      />

      {/* "Lesson did not take place" for a forgotten past lesson */}
      <CancelMissedLessonModal
        target={cancelMissed}
        onClose={() => setCancelMissed(null)}
        onCancelled={async (done) => {
          await loadAttendanceRef.current(true);
          showToast(`Урок ${formatDateRu(done.lessonDate)} отмечен как не состоявшийся`);
        }}
      />

      {/* Correction of a completed lesson */}
      <Modal
        open={correctionDialog !== null && correcting !== null}
        title={correctingLesson ? `Исправление урока ${formatDateRu(correctingLesson.date)}` : "Исправление урока"}
        description="Исправление попадёт в журнал изменений с вашим именем и причиной"
        onClose={() => setCorrectionDialog(null)}
        busy={correctionSaving}
        maxWidthClassName="max-w-[560px]"
        footer={
          <>
            <button type="button" onClick={() => setCorrectionDialog(null)} disabled={correctionSaving} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
            <button
              type="button"
              onClick={() => void submitCorrection()}
              disabled={correctionSaving || correctionChanges.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {correctionSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Сохранить исправление
            </button>
          </>
        }
      >
        {correctionDialog && correcting && (
          <div className="space-y-4 pb-2">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-slate-500">Изменения ({correctionChanges.length})</p>
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {correctionChanges.map((change) => (
                  <li key={change.studentId} className="px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span className="min-w-0 truncate font-medium text-slate-800">{studentNameById.get(change.studentId) || "Ученик"}</span>
                      <span className="text-xs text-slate-600">
                        {change.reasonChanged ? (
                          <strong>{statusOption("excused")?.label}: причина изменена</strong>
                        ) : (
                          <>{statusOption(change.from as AttendanceStatus)?.label || "нет отметки"} → <strong>{statusOption(change.to as AttendanceStatus)?.label || "нет отметки"}</strong></>
                        )}
                        {change.to === "excused" && correcting.reasons[change.studentId] ? ` (${correcting.reasons[change.studentId]})` : ""}
                      </span>
                    </div>
                    {correctionWarningById.get(change.studentId) && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {correctionWarningById.get(change.studentId)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <label htmlFor="correction-reason" className="block text-[13px] font-semibold text-slate-500">Причина исправления</label>
              <textarea
                id="correction-reason"
                value={correctionDialog.reason}
                onChange={(event) => setCorrectionDialog({ reason: event.target.value, error: null })}
                rows={3}
                maxLength={CORRECTION_REASON_MAX}
                autoFocus
                placeholder="Например: преподаватель ошибся при отметке, ученик был на уроке"
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10"
              />
              <div className="flex items-start justify-between gap-3 text-xs">
                <span role={correctionDialog.error ? "alert" : undefined} className={correctionDialog.error ? "font-medium text-rose-600" : "text-slate-400"}>
                  {correctionDialog.error || "От 10 до 500 символов."}
                </span>
                <span className="shrink-0 text-slate-400">{correctionDialog.reason.trim().length}/{CORRECTION_REASON_MAX}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {toastNode}
    </div>
  );
}
