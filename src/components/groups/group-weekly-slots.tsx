"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarPlus, Clock3, MapPin, Pencil, RefreshCw, Video, X } from "lucide-react";
import { orgApi, type LessonEvent } from "@/lib/api";
import { addIsoDays, formatBusinessDate, formatIsoDateLabel } from "@/lib/business-time";
import { roomLabel, validFromBadge } from "@/lib/schedule-slots";
import { DAYS, NO_TEACHER_SCHEDULE_HINT } from "@/lib/lesson-slot-form";
import { AddWeeklyLessonDialog, EditWeeklyLessonDialog, EndWeeklyLessonDialog } from "@/components/schedule/weekly-lesson-dialogs";

/**
 * «Еженедельные уроки» of the group page (owner / administrator): the weekly lessons of THIS group and the way to add, change and stop
 * them - the same dialogs the teacher uses on his schedule.  A change acts from a future date, a stop keeps the past (the dialogs say so).
 */
export function GroupWeeklySlots({ groupId, groupName, teacherAssigned, onChanged, onMessage }: {
  groupId: string;
  groupName: string;
  /** The group has a teacher: without one the lessons are saved all the same, with a hint. */
  teacherAssigned: boolean;
  /** The weekly lessons changed: the week below reloads. */
  onChanged: () => void;
  onMessage: (text: string) => void;
}) {
  const [slots, setSlots] = useState<LessonEvent[] | null>(null);
  /** template id -> the next lesson of it within two weeks (date, time); a template without one in that window has been stopped. */
  const [nextByLesson, setNextByLesson] = useState<Record<string, { date: string; startTime: string; endTime: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LessonEvent | null>(null);
  const [ending, setEnding] = useState<LessonEvent | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = formatBusinessDate();
      const [all, journal] = await Promise.all([
        orgApi.getSchedule(),
        // the next lessons of the weekly ones tell what the schedule WILL be (a change or a stop acts from a future date); a failure only hides that line
        orgApi.getGroupAttendance(groupId, { dateFrom: from, dateTo: addIsoDays(from, 13) }).catch(() => null),
      ]);
      setSlots(all.filter((lesson) => lesson.groupId === groupId));
      if (journal) {
        const next: Record<string, { date: string; startTime: string; endTime: string }> = {};
        for (const lesson of [...(journal.lessons ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
          const state = journal.statuses?.[lesson.instanceKey || `${lesson.date}_${lesson.id}`] || lesson.status;
          if (state === "cancelled" || next[lesson.id]) continue;
          next[lesson.id] = { date: lesson.date, startTime: lesson.startTime || lesson.start_time || "", endTime: lesson.endTime || "" };
        }
        setNextByLesson(next);
      } else {
        setNextByLesson(null);
      }
    } catch (failure) {
      setSlots(null);
      setError(failure instanceof Error && failure.message ? failure.message : "Не удалось загрузить еженедельные уроки группы");
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(
    () => [...(slots ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)),
    [slots],
  );
  const today = formatBusinessDate();
  const refresh = async () => { await load(); onChanged(); };

  return (
    <section data-testid="weekly-slots" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Еженедельные уроки</h3>
          <p className="mt-0.5 text-sm text-slate-500">Постоянное расписание группы: уроки повторяются каждую неделю.</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <CalendarPlus className="h-4 w-4" />
          Добавить в расписание
        </button>
      </div>

      {!teacherAssigned && (
        <p data-testid="weekly-no-teacher" className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 sm:mx-6">
          {NO_TEACHER_SCHEDULE_HINT}.
        </p>
      )}

      {notices.length > 0 && (
        <div role="status" className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 sm:mx-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="min-w-0 flex-1 space-y-0.5">{notices.map((note) => <li key={note}>{note}</li>)}</ul>
          <button type="button" aria-label="Скрыть" onClick={() => setNotices([])} className="shrink-0 rounded-md p-0.5 text-amber-700 hover:bg-amber-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {error ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-slate-600">{error}</p>
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Повторить</button>
          </div>
        ) : slots === null ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : sorted.length === 0 ? (
          <p data-testid="weekly-empty" className="text-sm text-slate-500">В расписании группы пока нет еженедельных уроков. Нажмите «Добавить в расписание».</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {sorted.map((lesson) => {
              const dayName = DAYS.find((day) => day.id === lesson.dayOfWeek)?.name ?? "";
              const badge = validFromBadge(lesson.validFrom, today);
              const next = nextByLesson?.[lesson.id];
              // no lesson of it within two weeks although it already acts: it has been stopped from a coming date
              const stopped = nextByLesson !== null && !next && !badge;
              return (
                <li key={lesson.id} data-testid="weekly-slot" className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900">
                      <span>{dayName}</span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700"><Clock3 className="h-3.5 w-3.5 text-slate-400" />{lesson.startTime}–{lesson.endTime}</span>
                      {badge && <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800" title={lesson.validFrom ? `Действует с ${formatIsoDateLabel(lesson.validFrom, { day: "numeric", month: "long" })}` : undefined}>{badge}</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">{lesson.format === "online" ? <Video className="h-3.5 w-3.5 text-violet-600" /> : <MapPin className="h-3.5 w-3.5" />}{roomLabel(lesson)}</span>
                      {lesson.topic && <span className="break-words">{lesson.topic}</span>}
                    </p>
                    {next && (next.startTime !== lesson.startTime || next.endTime !== lesson.endTime) && (
                      <p data-testid="weekly-slot-next" className="text-xs font-medium text-sky-800">
                        Ближайший урок: {formatIsoDateLabel(next.date, { weekday: "short", day: "numeric", month: "short" }).replace(".", "")}, {next.startTime}–{next.endTime}
                      </p>
                    )}
                    {stopped && <p data-testid="weekly-slot-stopped" className="text-xs font-medium text-amber-800">Занятия прекращены: новых уроков в расписании не будет.</p>}
                  </div>
                  {!stopped && <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => setEditing(lesson)} aria-label={`Изменить урок: ${dayName} ${lesson.startTime}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5" /> Изменить
                    </button>
                    <button type="button" onClick={() => setEnding(lesson)} aria-label={`Прекратить урок: ${dayName} ${lesson.startTime}`} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50">
                      <X className="h-3.5 w-3.5" /> Прекратить
                    </button>
                  </div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddWeeklyLessonDialog
        open={adding}
        group={{ id: groupId, name: groupName }}
        teacherAssigned={teacherAssigned}
        siblings={slots ?? []}
        onClose={() => setAdding(false)}
        onCreated={async (_created, warnings) => {
          setAdding(false);
          setNotices(warnings);
          onMessage("Урок добавлен в расписание группы");
          await refresh();
        }}
      />
      <EditWeeklyLessonDialog
        lesson={editing}
        siblings={slots ?? []}
        onClose={() => setEditing(null)}
        onSaved={async (warnings, effectiveFrom) => {
          setEditing(null);
          setNotices(warnings);
          onMessage(`Расписание изменено с ${formatIsoDateLabel(effectiveFrom, { day: "numeric", month: "long" })}`);
          await refresh();
        }}
      />
      <EndWeeklyLessonDialog
        lesson={ending}
        onClose={() => setEnding(null)}
        onEnded={async () => {
          setEnding(null);
          setNotices([]);
          onMessage("Занятия прекращены с выбранной даты");
          await refresh();
        }}
      />
    </section>
  );
}
