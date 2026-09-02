"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import {
  type AttendanceStatus,
  type GroupAttendance,
  type Lesson,
  orgApi,
  type StudentInGroup,
} from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";

interface GroupAttendanceJournalProps {
  groupId: string;
  students: StudentInGroup[];
  /** Руководители видят журнал, но не меняют отметки без отдельного correction-flow. */
  canEdit?: boolean;
  /** Передаётся только ролям, которым разрешено открывать профиль ученика. */
  studentProfileBasePath?: string;
}

type ViewMode = "week" | "month";
type AttendanceMenuPlacement = "up" | "down";
type OpenAttendanceCell = {
  studentId: string;
  lessonKey: string;
  placement: AttendanceMenuPlacement;
};
type MembershipEvent = NonNullable<GroupAttendance["membershipEvents"]>[number];
type DiagnosticReportNotice = NonNullable<GroupAttendance["diagnosticReportNotices"]>[number];
type AttendanceJournalStudent = StudentInGroup & {
  isHistorical?: boolean;
  transferredAt?: string | null;
  transferredToGroupName?: string | null;
  membershipEvent?: MembershipEvent;
  diagnosticReportNotice?: DiagnosticReportNotice;
};

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const DAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  short: string;
  label: string;
  className: string;
  dotClassName: string;
}> = [
  {
    value: "present",
    short: "Был",
    label: "Был на уроке",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    dotClassName: "bg-emerald-500",
  },
  {
    value: "late",
    short: "Опоздал",
    label: "Опоздал",
    className: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
    dotClassName: "bg-amber-500",
  },
  {
    value: "absent",
    short: "Н/Б",
    label: "Не был (Н/Б)",
    className: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
    dotClassName: "bg-rose-500",
  },
  {
    value: "excused",
    short: "Ув.",
    label: "Уважительная причина",
    className: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
    dotClassName: "bg-sky-500",
  },
];

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function atLocalNoon(value: Date): Date {
  const result = new Date(value);
  result.setHours(12, 0, 0, 0);
  return result;
}

function businessTodayAtLocalNoon(): Date {
  return new Date(`${formatBusinessDate()}T12:00:00`);
}

function instanceKey(lesson: Lesson): string {
  return lesson.instanceKey || `${lesson.date}_${lesson.id}`;
}

function statusOption(value: AttendanceStatus | "") {
  return STATUS_OPTIONS.find((item) => item.value === value);
}

function formatMembershipEvent(event: MembershipEvent): string {
  const date = event.joined_at
    ? new Date(event.joined_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
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

export function GroupAttendanceJournal({
  groupId,
  students,
  canEdit = false,
  studentProfileBasePath,
}: GroupAttendanceJournalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(businessTodayAtLocalNoon);
  const [attendanceData, setAttendanceData] = useState<GroupAttendance | null>(null);
  const [localRecords, setLocalRecords] = useState<Record<string, Record<string, AttendanceStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [savingLessonKey, setSavingLessonKey] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<OpenAttendanceCell | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const journalScrollRef = useRef<HTMLDivElement | null>(null);
  const openCellContainerRef = useRef<HTMLTableCellElement | null>(null);

  const today = formatBusinessDate();
  const period = useMemo(() => {
    const base = atLocalNoon(anchorDate);
    if (viewMode === "month") {
      const start = new Date(base.getFullYear(), base.getMonth(), 1, 12);
      const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);
      return {
        start: formatLocalDate(start),
        end: formatLocalDate(end),
        label: `${MONTHS_GENITIVE[start.getMonth()]} ${start.getFullYear()}`,
      };
    }

    const monday = new Date(base);
    monday.setDate(base.getDate() + (base.getDay() === 0 ? -6 : 1 - base.getDay()));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sameMonth = monday.getMonth() === sunday.getMonth();
    return {
      start: formatLocalDate(monday),
      end: formatLocalDate(sunday),
      label: sameMonth
        ? `${monday.getDate()} — ${sunday.getDate()} ${MONTHS_GENITIVE[sunday.getMonth()]} ${sunday.getFullYear()}`
        : `${monday.getDate()} ${MONTHS_GENITIVE[monday.getMonth()]} — ${sunday.getDate()} ${MONTHS_GENITIVE[sunday.getMonth()]} ${sunday.getFullYear()}`,
    };
  }, [anchorDate, viewMode]);

  const loadAttendance = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const data = await orgApi.getGroupAttendance(groupId, {
        dateFrom: period.start,
        dateTo: period.end,
      });
      setAttendanceData(data);
      setLocalRecords(data.records || {});
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось загрузить журнал");
    } finally {
      setLoading(false);
    }
  }, [groupId, period.end, period.start]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    if (!openCell) return;

    const closeWhenClickedOutside = (event: PointerEvent) => {
      if (!openCellContainerRef.current?.contains(event.target as Node)) {
        setOpenCell(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenCell(null);
    };

    document.addEventListener("pointerdown", closeWhenClickedOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickedOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openCell]);

  const lessons = useMemo(
    () => attendanceData?.lessons || [],
    [attendanceData?.lessons],
  );

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
    // Scheduled rows have no frozen roster yet.  A student who joined after
    // the date must not be shown as missing from a lesson they could not take.
    return !student.joined_at || lesson.date >= student.joined_at.slice(0, 10);
  }, [attendanceData?.rosterStudentIds, localRecords]);

  const getStatus = useCallback(
    (studentId: string, lesson: Lesson): AttendanceStatus | "" =>
      lesson.date > today ? "" : localRecords[instanceKey(lesson)]?.[studentId] || "",
    [localRecords, today],
  );

  const movePeriod = (direction: -1 | 1) => {
    setOpenCell(null);
    setAnchorDate((current) => {
      const next = atLocalNoon(current);
      if (viewMode === "week") next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
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

      // The journal is often taller than the viewport.  Opening toward the
      // larger visible side prevents the lower rows from being clipped by the
      // journal container and avoids an unnecessary page scroll.
      const triggerRect = event.currentTarget.getBoundingClientRect();
      const journalRect = journalScrollRef.current?.getBoundingClientRect();
      const visibleTop = Math.max(0, journalRect?.top ?? 0);
      const visibleBottom = Math.min(window.innerHeight, journalRect?.bottom ?? window.innerHeight);
      const roomAbove = triggerRect.top - visibleTop;
      const roomBelow = visibleBottom - triggerRect.bottom;
      const placement: AttendanceMenuPlacement = roomAbove >= roomBelow ? "up" : "down";

      setOpenCell({ studentId, lessonKey, placement });
    },
    [],
  );

  const handleSelectStatus = async (
    status: AttendanceStatus | "",
    student: StudentInGroup,
    lesson: Lesson,
  ) => {
    const lessonKey = instanceKey(lesson);
    const lessonStatus = attendanceData?.statuses?.[lessonKey] || lesson.status || "scheduled";
    if (
      !canEdit
      || lesson.date > today
      || lessonStatus === "scheduled"
      || lessonStatus === "completed"
      || lessonStatus === "cancelled"
    ) return;

    const previousRecords = localRecords;
    const updatedRecords = { ...(localRecords[lessonKey] || {}) };
    if (status) updatedRecords[student.id] = status;
    else delete updatedRecords[student.id];

    setSaveError(null);
    setOpenCell(null);
    setLocalRecords((previous) => ({ ...previous, [lessonKey]: updatedRecords }));
    setSavingLessonKey(lessonKey);
    try {
      await orgApi.saveGroupAttendance(groupId, {
        lessonDate: lesson.date,
        lessonId: lesson.id,
        topic: lesson.topic,
        status: lessonStatus,
        records: updatedRecords,
      });
      setAttendanceData((previous) => previous ? {
        ...previous,
        statuses: { ...previous.statuses, [lessonKey]: "in_progress" },
        lessons: previous.lessons.map((item) =>
          instanceKey(item) === lessonKey ? { ...item, status: "in_progress" } : item,
        ),
      } : previous);
    } catch (error) {
      setLocalRecords(previousRecords);
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить отметку");
    } finally {
      setSavingLessonKey(null);
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
          <div ref={journalScrollRef} className="overflow-x-auto">
            <table className="min-w-max w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-[235px] border-r border-slate-200 bg-slate-50 px-5 py-3.5 font-bold uppercase tracking-wide text-slate-700"
                  >
                    Ученик ({activeStudents.length})
                  </th>
                  {lessons.map((lesson) => {
                    const dateValue = new Date(`${lesson.date}T12:00:00`);
                    const key = instanceKey(lesson);
                    const lessonStatus = attendanceData?.statuses?.[key] || lesson.status || "scheduled";
                    const presentation = lessonStatusPresentation(lessonStatus, lesson.date, today);
                    return (
                      <th
                        key={key}
                        scope="col"
                        title={presentation.description}
                        className={`min-w-[132px] border-r border-slate-200 px-3 py-3 text-center ${lesson.date === today ? "bg-primary-50" : ""}`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">
                            {dateValue.getDate()} {MONTHS_GENITIVE[dateValue.getMonth()].slice(0, 3)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {DAY_NAMES[dateValue.getDay()]} {lesson.isRescheduled && lesson.originalStartTime ? (
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
                          <div className={`text-[10px] font-semibold ${presentation.className}`}>
                            {presentation.label}
                          </div>
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
                                  <span title={formatMembershipEvent(membershipEvent)} className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                    Переведён
                                  </span>
                                )}
                                {!membershipEvent && student.diagnosticReportNotice && (
                                  <span title="Ученик зачислен после диагностики. Метка исчезнет после ознакомления преподавателя с отчётом." className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                    Новый
                                  </span>
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
                                <span title={formatMembershipEvent(membershipEvent)} className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  Переведён
                                </span>
                              )}
                              {!membershipEvent && student.diagnosticReportNotice && (
                                <span title="Ученик зачислен после диагностики. Метка исчезнет после ознакомления преподавателя с отчётом." className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Новый
                                </span>
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
                        const locked = !wasInLesson || !canEdit || isFutureLesson || lessonStatus === "scheduled" || lessonStatus === "completed" || lessonStatus === "cancelled";
                        const isOpen = openCell?.studentId === student.id && openCell.lessonKey === key;
                        const lockedTitle = !wasInLesson
                            ? "Ученик ещё не состоял в группе на дату этого занятия"
                          : isFutureLesson
                          ? "Нельзя отмечать посещаемость будущего урока"
                          : lessonStatus === "scheduled"
                            ? "Сначала начните урок в расписании или на панели «Сегодня»"
                          : lessonStatus === "completed"
                            ? "Завершённый урок защищён от случайного изменения"
                            : lessonStatus === "cancelled"
                              ? "Отменённый урок нельзя отмечать"
                              : "Режим просмотра";

                        return (
                          <td ref={isOpen ? openCellContainerRef : undefined} key={key} className="relative border-r border-slate-100 p-2 text-center">
                            {wasInLesson ? <button
                              type="button"
                              disabled={locked}
                              onClick={(event) => toggleAttendanceMenu(event, student.id, key, isOpen)}
                              title={locked ? lockedTitle : "Выбрать отметку"}
                              aria-expanded={isOpen}
                              aria-controls={isOpen ? `attendance-menu-${student.id}-${key}` : undefined}
                              className={`mx-auto flex min-h-8 min-w-[92px] items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 font-bold transition-colors ${option ? option.className : "border-slate-200 bg-slate-50 text-slate-400"} ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                            >
                              {option ? (
                                <>
                                  <span className={`h-1.5 w-1.5 rounded-full ${option.dotClassName}`} />
                                  {option.short}
                                </>
                              ) : "—"}
                            </button> : (
                              <span title="Ученик ещё не состоял в группе" className="mx-auto flex min-h-8 min-w-[92px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 font-medium text-slate-300">—</span>
                            )}
                            {isOpen && !locked && (
                              <div
                                id={`attendance-menu-${student.id}-${key}`}
                                role="menu"
                                className={`absolute left-1/2 z-30 w-56 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-lg ${openCell.placement === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
                              >
                                {STATUS_OPTIONS.map((item) => (
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
                                      <span>{item.label}</span>
                                    </span>
                                    {value === item.value && <Check className="h-3.5 w-3.5 text-primary-600" />}
                                  </button>
                                ))}
                                {value && (
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
                              </div>
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
        )}
      </section>

      {historicalStudents.length > 0 && lessons.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
          <div className="border-b border-slate-200 bg-slate-100/80 px-5 py-4">
            <h3 className="text-sm font-bold text-slate-800">История переведённых учеников</h3>
            <p className="mt-1 text-xs text-slate-500">Отметки сохранены по фактическим занятиям. Эта история доступна только для просмотра.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-max w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="sticky left-0 z-20 min-w-[235px] border-r border-slate-200 bg-slate-50 px-5 py-3.5 font-bold uppercase tracking-wide text-slate-600">
                    Ученик
                  </th>
                  {lessons.map((lesson) => {
                    const dateValue = new Date(`${lesson.date}T12:00:00`);
                    const key = instanceKey(lesson);
                    const lessonStatus = attendanceData?.statuses?.[key] || lesson.status || "scheduled";
                    const presentation = lessonStatusPresentation(lessonStatus, lesson.date, today);
                    return (
                      <th key={key} scope="col" title={presentation.description} className="min-w-[132px] border-r border-slate-200 px-3 py-3 text-center">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">{dateValue.getDate()} {MONTHS_GENITIVE[dateValue.getMonth()].slice(0, 3)}</div>
                          <div className="text-[11px] text-slate-500">{DAY_NAMES[dateValue.getDay()]} {lesson.startTime || lesson.start_time || ""}</div>
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
                  const transferDescription = `Ученик переведён${student.transferredToGroupName ? ` в «${student.transferredToGroupName}»` : " в другую группу"}${student.transferredAt ? ` ${new Date(student.transferredAt).toLocaleDateString("ru-RU")}` : ""}. Исторические отметки доступны только для просмотра.`;
                  const studentProfileHref = studentProfileBasePath ? `${studentProfileBasePath}/${student.id}` : null;
                  return (
                    <tr key={student.id} className="bg-white">
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-5 py-3">
                        {studentProfileHref ? (
                          <Link href={studentProfileHref} title="Открыть профиль ученика" className="flex items-center gap-3 rounded-lg outline-none transition-colors hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{fullName[0]}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800 transition-colors hover:text-primary-700" title={fullName}>{fullName}</p>
                              <span title={transferDescription} className="mt-1 inline-flex rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Переведён</span>
                            </div>
                          </Link>
                        ) : (
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{fullName[0]}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800" title={fullName}>{fullName}</p>
                            <span title={transferDescription} className="mt-1 inline-flex rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Переведён</span>
                          </div>
                        </div>
                        )}
                      </td>
                      {lessons.map((lesson) => {
                        const wasInLesson = belongsToLesson(student, lesson);
                        const option = statusOption(getStatus(student.id, lesson));
                        return (
                          <td key={instanceKey(lesson)} className="border-r border-slate-100 p-2 text-center">
                            {wasInLesson ? (
                              <span title={transferDescription} className={`mx-auto flex min-h-8 min-w-[92px] items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 font-bold ${option ? option.className.replace(/\shover:bg-\S+/, "") : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                                {option ? <><span className={`h-1.5 w-1.5 rounded-full ${option.dotClassName}`} />{option.short}</> : "—"}
                              </span>
                            ) : (
                              <span title={transferDescription} className="mx-auto flex min-h-8 min-w-[92px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 font-medium text-slate-300">—</span>
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
    </div>
  );
}
