"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  MapPin,
  Radio,
  RefreshCw,
  Video,
  XCircle,
} from "lucide-react";
import {
  orgApi,
  type GroupAttendance,
  type Lesson,
  type LessonAttendanceStatus,
} from "@/lib/api";
import { formatBusinessDate, formatIsoDateLabel } from "@/lib/business-time";
import { LessonTeacherDialog, type LessonTeacherTarget } from "@/components/groups/lesson-teacher-dialog";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { directAssignToast, lessonMarks, movedToLabel, substitutionsHref, substitutionsPathFor } from "@/lib/substitutions";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { NO_LESSON_TEACHER_TEXT, lacksTeacher, lessonKeyOf, substituteLabel } from "@/lib/lesson-teacher";
import { LessonActionSheet } from "@/components/groups/lesson-action-sheet";
import { GroupWeeklySlots } from "@/components/groups/group-weekly-slots";
import { outOfPlan, todayPlanLines } from "@/lib/schedule-plan";
import { assignActionLabel, lessonHasStarted, lessonTitle, roomLabel, scheduleCardActions, movedFromText, sheetNotes, teacherLine } from "@/lib/schedule-card-actions";

type ScheduleStatus = {
  label: string;
  description: string;
  badgeClassName: string;
  icon: typeof CalendarCheck2;
};

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayFor(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  return shiftDate(isoDate, 1 - weekday);
}

function lessonKey(lesson: Lesson): string {
  return lesson.instanceKey || `${lesson.date}_${lesson.id}`;
}

function presentationFor(
  status: LessonAttendanceStatus | "scheduled",
  lessonDate: string,
  today: string,
  moved = false,
): ScheduleStatus {
  if (moved) {
    return {
      label: "Перенесён",
      description: "Урок перенесён на другой день",
      badgeClassName: "bg-sky-50 text-sky-800 border-sky-200",
      icon: CalendarClock,
    };
  }
  if (status === "completed") {
    return {
      label: "Завершён",
      description: "Урок завершён, посещаемость зафиксирована",
      badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: CheckCircle2,
    };
  }
  if (status === "cancelled") {
    return {
      label: "Отменён",
      description: "Урок отменён — посещаемость недоступна",
      badgeClassName: "bg-slate-100 text-slate-600 border-slate-200",
      icon: XCircle,
    };
  }
  if (status === "in_progress") {
    return lessonDate < today
      ? {
          label: "Не завершён",
          description: "Урок начат, но посещаемость ещё не закрыта",
          badgeClassName: "bg-amber-50 text-amber-800 border-amber-200",
          icon: AlertCircle,
        }
      : {
          label: "Идёт урок",
          description: "Учитель ведёт урок и отмечает посещаемость",
          badgeClassName: "bg-primary-50 text-primary-700 border-primary-200",
          icon: Radio,
        };
  }
  if (lessonDate < today) {
    return {
      label: "Не отмечен",
      description: "Время урока прошло, но он не был начат",
      badgeClassName: "bg-amber-50 text-amber-800 border-amber-200",
      icon: AlertCircle,
    };
  }
  // one word for every lesson that has not been held yet: today's not started and the future ones
  return {
    label: "Запланирован",
    description: lessonDate === today ? "Урок ожидает начала по расписанию" : "Будущее занятие по утверждённому расписанию",
    badgeClassName: lessonDate === today ? "bg-primary-50 text-primary-700 border-primary-200" : "bg-slate-50 text-slate-600 border-slate-200",
    icon: lessonDate === today ? CalendarCheck2 : CalendarDays,
  };
}

function periodLabel(start: string, end: string): string {
  const startLabel = formatIsoDateLabel(start, { day: "numeric", month: "short" });
  const endLabel = formatIsoDateLabel(end, { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} — ${endLabel}`;
}

/**
 * Administrative schedule view for one group.
 *
 * It intentionally reads the same concrete lesson instances as attendance:
 * recurring slots, one-off transfers, cancellations and factual states are
 * therefore represented once and never reconstructed in the frontend.
 */
export function GroupScheduleOverview({ groupId, groupName = null, viewerRole = null, archived = false, teacherAssigned = true }: {
  groupId: string;
  /** The title of a lesson without a topic. */
  groupName?: string | null;
  /** `owner` / `admin` get the lesson sheet (replace the teacher, move, cancel, open the journal); nobody else can act on a card. */
  viewerRole?: string | null;
  /** The group is in the archive: nothing changes there. */
  archived?: boolean;
  /** The group has a teacher; without one the weekly lessons are still saved, with a hint (P1). */
  teacherAssigned?: boolean;
}) {
  const today = formatBusinessDate();
  const { user } = useAuthStore();
  const { showToast, toastNode } = useToast();
  const router = useRouter();
  const [teacherTarget, setTeacherTarget] = useState<LessonTeacherTarget | null>(null);
  const [sheetLesson, setSheetLesson] = useState<Lesson | null>(null);
  const [anchorDate, setAnchorDate] = useState(today);
  const [attendance, setAttendance] = useState<GroupAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => {
    const start = mondayFor(anchorDate);
    return { start, end: shiftDate(start, 6) };
  }, [anchorDate]);

  const loadSchedule = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await orgApi.getGroupAttendance(groupId, {
        dateFrom: period.start,
        dateTo: period.end,
      });
      setAttendance(data);
    } catch (loadError) {
      setAttendance(null);
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить расписание группы");
    } finally {
      setLoading(false);
    }
  }, [groupId, period.end, period.start]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const lessonsByDate = useMemo(() => {
    const result = new Map<string, Lesson[]>();
    for (const lesson of attendance?.lessons || []) {
      const dateLessons = result.get(lesson.date) || [];
      dateLessons.push(lesson);
      result.set(lesson.date, dateLessons);
    }
    for (const dateLessons of result.values()) {
      dateLessons.sort((left, right) => (left.startTime || left.start_time || "").localeCompare(right.startTime || right.start_time || ""));
    }
    return result;
  }, [attendance?.lessons]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(period.start, index)), [period.start]);
  const todayLessons = lessonsByDate.get(today) || [];

  const todaySummary = useMemo(() => {
    if (todayLessons.length === 0) {
      return {
        title: "Сегодня занятий нет",
        description: "В расписании этой группы на сегодня нет уроков.",
        className: "bg-slate-50 border-slate-200 text-slate-700",
        Icon: CalendarDays,
      };
    }

    // A lesson moved away or cancelled is not a lesson of the day: it is not counted and does not decide the title.
    const plan = todayLessons
      .map((lesson) => ({ lesson, status: attendance?.statuses?.[lessonKey(lesson)] || lesson.status || "scheduled" }))
      .map((item) => ({ ...item, off: outOfPlan({ status: item.status, outcome: item.lesson.substitutionOutcome }) }));
    const statuses = plan.filter((item) => !item.off).map((item) => item.status);
    if (statuses.length === 0) {
      const words = todayPlanLines(plan.map((item) => item.off));
      return {
        title: words.title,
        description: words.description,
        className: "bg-slate-50 border-slate-200 text-slate-700",
        Icon: words.moved ? CalendarClock : XCircle,
      };
    }
    if (statuses.includes("in_progress")) {
      return {
        title: "Сейчас идёт урок",
        description: "Учитель ведёт занятие; посещаемость может обновляться до его завершения.",
        className: "bg-primary-50 border-primary-200 text-primary-800",
        Icon: Radio,
      };
    }
    if (statuses.includes("scheduled")) {
      return {
        title: "Урок сегодня по расписанию",
        description: `${statuses.length === 1 ? "Занятие ожидает начала" : `Сегодня запланировано занятий: ${statuses.length}`}.`,
        className: "bg-primary-50 border-primary-200 text-primary-800",
        Icon: CalendarCheck2,
      };
    }
    return {
      title: "Занятие на сегодня завершено",
      description: "Фактический статус и посещаемость сохранены в журнале группы.",
      className: "bg-emerald-50 border-emerald-200 text-emerald-800",
      Icon: CheckCircle2,
    };
  }, [attendance?.statuses, todayLessons]);

  const moveWeek = (direction: -1 | 1) => setAnchorDate((value) => shiftDate(value, direction * 7));
  const isCurrentWeek = period.start === mondayFor(today);

  return (
    <div className="space-y-5">
      <section className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${todaySummary.className}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70 shadow-xs">
            <todaySummary.Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{todaySummary.title}</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed opacity-80">{todaySummary.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadSchedule()}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-current/20 bg-white/70 px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </section>

      {/* P1: the owner and the administrator add, change and stop the weekly lessons right here (not on an archived group) */}
      {(viewerRole === "owner" || viewerRole === "admin") && !archived && (
        <GroupWeeklySlots
          groupId={groupId}
          groupName={groupName || "Группа"}
          teacherAssigned={teacherAssigned}
          onChanged={() => void loadSchedule()}
          onMessage={(text) => showToast(text)}
        />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => moveWeek(-1)} aria-label="Предыдущая неделя" className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-950">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex min-w-[215px] items-center justify-center gap-2 px-3 text-center text-xs font-semibold text-slate-800 sm:text-sm">
              <CalendarDays className="h-4 w-4 text-primary-600" />
              {periodLabel(period.start, period.end)}
            </div>
            <button type="button" onClick={() => moveWeek(1)} aria-label="Следующая неделя" className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-950">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {!isCurrentWeek && (
            <button type="button" onClick={() => setAnchorDate(today)} className="w-fit rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50">
              К текущей неделе
            </button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Расписание группы</h3>
            <p className="mt-0.5 text-sm text-slate-500">Фактический статус занятий, включая переносы и отмены.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-sm text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-primary-600" />
            Загрузка расписания…
          </div>
        ) : error ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertCircle className="h-9 w-9 text-rose-400" />
            <div>
              <p className="font-semibold text-slate-900">Не удалось загрузить расписание</p>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
            </div>
            <button type="button" onClick={() => void loadSchedule()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">Повторить</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-7">
            {weekDates.map((date) => {
              const dateLessons = lessonsByDate.get(date) || [];
              const isToday = date === today;
              const empty = dateLessons.length === 0;
              const weekday = formatIsoDateLabel(date, { weekday: "short" }).replace(".", "");
              return (
                // a phone: an empty day is one quiet line, not a tall dashed box (the desktop grid keeps its seven columns)
                <div key={date} className={`p-4 md:min-h-[220px] ${empty ? "max-md:px-4 max-md:py-2.5" : ""} ${isToday ? "bg-primary-50/45" : "bg-white"}`}>
                  {empty && (
                    <p className="text-xs text-slate-400 md:hidden">
                      <span className="capitalize">{weekday}</span>, {formatIsoDateLabel(date, { day: "numeric", month: "short" })} — нет занятий
                      {isToday && <span className="ml-2 rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">Сегодня</span>}
                    </p>
                  )}
                  <div className={`mb-3 flex items-start justify-between gap-2 ${empty ? "max-md:hidden" : ""}`}>
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-900">{weekday}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatIsoDateLabel(date, { day: "numeric", month: "short" })}</p>
                    </div>
                    {isToday && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">Сегодня</span>}
                  </div>

                  {empty ? (
                    <div className="hidden min-h-[130px] items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-xs text-slate-400 md:flex">Нет занятий</div>
                  ) : (
                    <div className="space-y-2.5">
                      {dateLessons.map((lesson) => {
                        const key = lessonKey(lesson);
                        const lessonState = attendance?.statuses?.[key] || lesson.status || "scheduled";
                        const outcome = lesson.substitutionOutcome;
                        const moved = lessonState === "cancelled" && outcome?.kind === "rescheduled";
                        const off = outOfPlan({ status: lessonState, outcome });
                        const state = presentationFor(lessonState, lesson.date, today, moved);
                        const StateIcon = state.icon;
                        const startTime = lesson.startTime || lesson.start_time || "—";
                        const cancellationReason = attendance?.cancellationReasons?.[key];
                        const teacherInfo = attendance?.lessonTeachers?.[lessonKey(lesson) || lessonKeyOf(lesson.date, lesson.id)];
                        const room = roomLabel(lesson);
                        const actions = scheduleCardActions({ role: viewerRole, archived, state: lessonState, date: lesson.date, today, hasTeacherInfo: Boolean(teacherInfo), startTime: lesson.startTime || lesson.start_time });
                        // a moved / cancelled original says it in its own status and line: the marks keep only a waiting request
                        const marks = lessonMarks(attendance?.substitutionRequests?.[key], null);
                        const manager = viewerRole === "owner" || viewerRole === "admin";
                        const interactive = manager && (actions.length > 0 || lessonState === "cancelled");
                        const open = () => setSheetLesson(lesson);
                        const showTeacher = teacherInfo && (lacksTeacher(teacherInfo) || substituteLabel(teacherInfo));
                        return (
                          <article
                            key={key}
                            data-testid="schedule-card"
                            {...(interactive ? {
                              role: "button" as const,
                              tabIndex: 0,
                              "aria-label": `Урок ${formatIsoDateLabel(lesson.date, { day: "numeric", month: "long" })}, ${startTime}: подробности`,
                              onClick: open,
                              onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } },
                            } : {})}
                            data-out={off ?? undefined}
                            className={`rounded-xl border border-slate-200 p-3 shadow-2xs ${off ? "bg-slate-50 opacity-75" : "bg-slate-50/70"} ${interactive ? "cursor-pointer transition-colors hover:border-primary-200 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40" : ""}`}
                          >
                            <span title={state.description} className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold ${state.badgeClassName}`}>
                              <StateIcon className="h-3 w-3" />
                              {state.label}
                            </span>
                            <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">{lessonTitle(lesson, groupName)}</p>
                            <p className="mt-2 flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-700"><Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className={off ? "text-slate-400 line-through" : undefined}>{startTime}–{lesson.endTime || "—"}</span></p>
                            {room && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><span className="shrink-0">{lesson.format === "online" ? <Video className="h-3.5 w-3.5 text-violet-600" /> : <MapPin className="h-3.5 w-3.5" />}</span>{room}</p>}
                            {lesson.isRescheduled && lesson.originalStartTime && <p className="mt-1 text-[11px] text-amber-700">Было: <span className="line-through">{lesson.originalStartTime}</span></p>}
                            {movedFromText(lesson.movedFrom) && <p className="mt-1.5 text-xs font-semibold text-sky-800" data-testid="moved-from">{movedFromText(lesson.movedFrom)}</p>}
                            {moved && outcome?.movedTo && <p className="mt-1.5 text-xs font-semibold text-sky-800">на {movedToLabel(outcome.movedTo)}</p>}
                            {!moved && cancellationReason && <p className="mt-2 break-words rounded-lg bg-white px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">Причина: {cancellationReason}</p>}
                            {/* LOGIC-B2: a request waiting for a decision */}
                            <LessonChips marks={marks} className="mt-2" />
                            {showTeacher && (
                              <div className="mt-2 border-t border-slate-200/70 pt-2 text-[11px] leading-snug">
                                {lacksTeacher(teacherInfo) ? (
                                  <p className="font-semibold text-amber-800">{NO_LESSON_TEACHER_TEXT}</p>
                                ) : (
                                  <p><span className="inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-800">{substituteLabel(teacherInfo)}</span></p>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(() => {
        const lesson = sheetLesson;
        const key = lesson ? lessonKey(lesson) : "";
        const lessonState = lesson ? attendance?.statuses?.[key] || lesson.status || "scheduled" : "scheduled";
        const info = lesson ? attendance?.lessonTeachers?.[key || lessonKeyOf(lesson.date, lesson.id)] : undefined;
        const outcome = lesson?.substitutionOutcome;
        const moved = lessonState === "cancelled" && outcome?.kind === "rescheduled";
        const presentation = lesson ? presentationFor(lessonState, lesson.date, today, moved) : null;
        const actions = lesson ? scheduleCardActions({ role: viewerRole, archived, state: lessonState, date: lesson.date, today, hasTeacherInfo: Boolean(info), startTime: lesson.startTime || lesson.start_time }) : [];
        const startTime = lesson ? lesson.startTime || lesson.start_time || "—" : "";
        const base = viewerRole === "admin" ? "/admin" : "/owner";
        const reasonText = lesson ? attendance?.cancellationReasons?.[key] : undefined;
        const movedFromLine = lesson ? movedFromText(lesson.movedFrom) : null;
        const notes = [...(movedFromLine ? [movedFromLine] : []), ...(lesson ? sheetNotes({ moved, movedToText: outcome?.movedTo ? movedToLabel(outcome.movedTo) : null, reason: reasonText, cancelled: lessonState === "cancelled" }) : [])];
        const room = lesson ? roomLabel(lesson) : null;
        const subtitle = lesson && presentation
          ? [`${formatIsoDateLabel(lesson.date, { weekday: "short", day: "numeric", month: "long" }).replace(".", "")}`, `${startTime}–${lesson.endTime || "—"}`, presentation.label, ...(room ? [room] : [])].join(" · ")
          : "";
        return (
          <LessonActionSheet
            lesson={lesson}
            groupId={groupId}
            title={lesson ? lessonTitle(lesson, groupName) : "Урок"}
            subtitle={subtitle}
            teacherLine={teacherLine(info, NO_LESSON_TEACHER_TEXT)}
            notes={notes}
            marks={lesson ? lessonMarks(attendance?.substitutionRequests?.[key], null) : []}
            requestHref={(requestId) => substitutionsHref(substitutionsPathFor(user), requestId)}
            actions={actions}
            assignLabel={assignActionLabel({ past: Boolean(lesson && lessonHasStarted({ date: lesson.date, today, startTime: lesson.startTime || lesson.start_time })), lacksTeacher: lacksTeacher(info), isSubstitution: Boolean(info?.isSubstitution) })}
            onClose={() => setSheetLesson(null)}
            onAssign={() => {
              if (!lesson || !info) return;
              setSheetLesson(null);
              setTeacherTarget({ groupId, lessonId: lesson.id, lessonDate: lesson.date, startTime, endTime: lesson.endTime || "", info });
            }}
            onJournal={() => {
              if (!lesson) return;
              router.push(`${base}/groups/${groupId}?tab=attendance&month=${lesson.date.slice(0, 7)}&lesson=${encodeURIComponent(lesson.id)}&date=${lesson.date}`);
            }}
            onChanged={(text) => { setSheetLesson(null); showToast(text); void loadSchedule(); }}
            onRefresh={() => { setSheetLesson(null); void loadSchedule(); }}
          />
        );
      })()}

      <LessonTeacherDialog
        target={teacherTarget}
        onClose={() => setTeacherTarget(null)}
        onChanged={(result) => {
          setTeacherTarget(null);
          showToast(directAssignToast(result));
          void loadSchedule();
        }}
      />
      {toastNode}
    </div>
  );
}
