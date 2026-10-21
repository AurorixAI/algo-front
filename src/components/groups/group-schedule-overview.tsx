"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarCheck2,
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
import { Hint } from "@/components/ui/hint";
import { LessonTeacherDialog, type LessonTeacherTarget } from "@/components/groups/lesson-teacher-dialog";
import { useToast } from "@/components/ui/toast";
import { ASSIGN_TEACHER_ACTION, NO_LESSON_TEACHER_TEXT, REPLACE_TEACHER_ACTION, canReplaceTeacher, lacksTeacher, lessonKeyOf, substituteLabel } from "@/lib/lesson-teacher";

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
): ScheduleStatus {
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
  if (lessonDate === today) {
    return {
      label: "По расписанию",
      description: "Урок ожидает начала по расписанию",
      badgeClassName: "bg-primary-50 text-primary-700 border-primary-200",
      icon: CalendarCheck2,
    };
  }
  return {
    label: "Запланирован",
    description: "Будущее занятие по утверждённому расписанию",
    badgeClassName: "bg-slate-50 text-slate-600 border-slate-200",
    icon: CalendarDays,
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
export function GroupScheduleOverview({ groupId, viewerRole = null, archived = false }: {
  groupId: string;
  /** `owner` / `admin` may replace the teacher of one lesson (O5); nobody else sees the button. */
  viewerRole?: string | null;
  /** The group is in the archive: nothing changes there. */
  archived?: boolean;
}) {
  const today = formatBusinessDate();
  const { showToast, toastNode } = useToast();
  const [teacherTarget, setTeacherTarget] = useState<LessonTeacherTarget | null>(null);
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

    const statuses = todayLessons.map((lesson) => attendance?.statuses?.[lessonKey(lesson)] || lesson.status || "scheduled");
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
        description: `${todayLessons.length === 1 ? "Занятие ожидает начала" : `Сегодня запланировано занятий: ${todayLessons.length}`}.`,
        className: "bg-primary-50 border-primary-200 text-primary-800",
        Icon: CalendarCheck2,
      };
    }
    if (statuses.every((status) => status === "cancelled")) {
      return {
        title: "Занятие на сегодня отменено",
        description: "Посещаемость по отменённому уроку недоступна.",
        className: "bg-slate-50 border-slate-200 text-slate-700",
        Icon: XCircle,
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
              return (
                <div key={date} className={`min-h-[220px] p-4 ${isToday ? "bg-primary-50/45" : "bg-white"}`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-900">{formatIsoDateLabel(date, { weekday: "short" }).replace(".", "")}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatIsoDateLabel(date, { day: "numeric", month: "short" })}</p>
                    </div>
                    {isToday && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">Сегодня</span>}
                  </div>

                  {dateLessons.length === 0 ? (
                    <div className="flex min-h-[130px] items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-xs text-slate-400">Нет занятий</div>
                  ) : (
                    <div className="space-y-2.5">
                      {dateLessons.map((lesson) => {
                        const key = lessonKey(lesson);
                        const state = presentationFor(attendance?.statuses?.[key] || lesson.status || "scheduled", lesson.date, today);
                        const StateIcon = state.icon;
                        const startTime = lesson.startTime || lesson.start_time || "—";
                        const cancellationReason = attendance?.cancellationReasons?.[key];
                        const teacherInfo = attendance?.lessonTeachers?.[lessonKey(lesson) || lessonKeyOf(lesson.date, lesson.id)];
                        const lessonState = attendance?.statuses?.[key] || lesson.status || "scheduled";
                        const canReplace = !archived && Boolean(teacherInfo) && canReplaceTeacher(viewerRole, lessonState);
                        return (
                          <article key={key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 truncate text-sm font-semibold text-slate-900" title={lesson.topic || "Занятие"}>{lesson.topic || "Занятие"}</p>
                              <Hint text={state.description} className={`inline-flex shrink-0 items-center gap-1 border px-1.5 py-1 text-[10px] font-semibold ${state.badgeClassName}`}>
                                <StateIcon className="h-3 w-3" />
                                {state.label}
                              </Hint>
                            </div>
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-700"><Clock3 className="h-3.5 w-3.5 text-slate-400" />{startTime} — {lesson.endTime || "—"}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><span className="shrink-0">{lesson.isRescheduled ? <CalendarDays className="h-3.5 w-3.5 text-amber-600" /> : lesson.format === "online" ? <Video className="h-3.5 w-3.5 text-violet-600" /> : <MapPin className="h-3.5 w-3.5" />}</span>{lesson.isRescheduled ? "Перенесён" : lesson.format === "online" ? "Онлайн" : lesson.room || "Кабинет не указан"}</p>
                            {lesson.isRescheduled && lesson.originalStartTime && <p className="mt-1 text-[11px] text-amber-700">Было: <span className="line-through">{lesson.originalStartTime}</span></p>}
                            {cancellationReason && <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">Причина: {cancellationReason}</p>}
                            {teacherInfo && (
                              <div className="mt-2 border-t border-slate-200/70 pt-2 text-[11px] leading-snug">
                                {lacksTeacher(teacherInfo) ? (
                                  <p className="font-semibold text-amber-800">{NO_LESSON_TEACHER_TEXT}</p>
                                ) : (
                                  <p className="text-slate-600">
                                    <span className="font-medium text-slate-800">{teacherInfo.teacherName}</span>
                                    {substituteLabel(teacherInfo) && (
                                      <span className="ml-1.5 inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-800">{substituteLabel(teacherInfo)}</span>
                                    )}
                                  </p>
                                )}
                                {canReplace && (
                                  <button
                                    type="button"
                                    onClick={() => setTeacherTarget({ groupId, lessonId: lesson.id, lessonDate: lesson.date, startTime, endTime: lesson.endTime || "", info: teacherInfo })}
                                    className="mt-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-primary-200 hover:text-primary-700"
                                  >
                                    {lacksTeacher(teacherInfo) ? ASSIGN_TEACHER_ACTION : REPLACE_TEACHER_ACTION}
                                  </button>
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

      <LessonTeacherDialog
        target={teacherTarget}
        onClose={() => setTeacherTarget(null)}
        onChanged={(result) => {
          setTeacherTarget(null);
          showToast(result.isSubstitution ? `Замена назначена: ${result.teacherName ?? ""}`.trim() : "Преподаватель урока возвращён");
          void loadSchedule();
        }}
      />
      {toastNode}
    </div>
  );
}
