"use client";

import { useState } from "react";
import { Ban, CalendarClock, ClipboardCheck, ExternalLink, Loader2, UserRoundCheck } from "lucide-react";
import { orgApi, type Lesson } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { scheduleErrorText } from "@/lib/ops-errors";
import { roomForSave } from "@/lib/schedule-slots";
import { SCHEDULE_ACTION_LABEL, normalizeTime, type ScheduleCardAction } from "@/lib/schedule-card-actions";
import type { LessonMark } from "@/lib/substitutions";

const FIELD = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";
const REASON_MIN = 3;

type Mode = "menu" | "reschedule" | "cancel";

/**
 * The sheet of one lesson of the group's week schedule (owner / administrator).  The card is information only; this is where the
 * actions by situation live: a future lesson - «Назначить замену» / «Перенести урок» / «Отменить урок»; a past one nobody marked -
 * «Отметить посещаемость» / «Назначить того, кто провёл»; a held one - «Открыть в журнале».  A phone gets the same as a card at the
 * bottom of the screen (the dialog of the project).  The assignment itself is the dialog of LOGIC-B (`LessonTeacherDialog`).
 */
export function LessonActionSheet({
  lesson, groupId, title, subtitle, teacherLine, notes, marks, actions, assignLabel, requestHref, onClose, onAssign, onJournal, onChanged,
}: {
  lesson: Lesson | null;
  groupId: string;
  /** The topic of the lesson, else the group. */
  title: string;
  /** «сб, 24 октября · 10:00–11:00 · Запланирован» (+ the room when it is set). */
  subtitle: string;
  /** «Ведёт: Коллега У. — замена за Основной У.» */
  teacherLine: string | null;
  /** Where a moved lesson went, the reason of a move / a cancellation in full. */
  notes: string[];
  marks: LessonMark[];
  actions: ScheduleCardAction[];
  assignLabel: string;
  requestHref?: (requestId: string) => string;
  onClose: () => void;
  onAssign: () => void;
  onJournal: () => void;
  /** After a move or a cancellation was saved: the toast text. */
  onChanged: (text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { if (busy) return; setMode("menu"); setReason(""); setError(null); onClose(); };

  const open = (next: Mode) => {
    setError(null);
    setReason("");
    if (next === "reschedule" && lesson) {
      setStart(lesson.startTime || lesson.start_time || "");
      setEnd(lesson.endTime || "");
      setRoom(lesson.room || "");
    }
    setMode(next);
  };

  const trimmed = reason.trim();
  const reasonProblem = trimmed.length < REASON_MIN ? `Укажите причину (не короче ${REASON_MIN} символов)` : null;

  const submit = async () => {
    if (!lesson || busy) return;
    if (reasonProblem) { setError(reasonProblem); return; }
    setBusy(true);
    setError(null);
    try {
      if (mode === "reschedule") {
        const from = normalizeTime(start);
        const to = normalizeTime(end);
        if (!from || !to || to <= from) { setError("Укажите время как 15:00: начало и окончание, конец позже начала"); setBusy(false); return; }
        await orgApi.rescheduleLessonOccurrence(lesson.id, { lessonDate: lesson.date, startTime: from, endTime: to, room: roomForSave(room) ?? undefined, reason: trimmed });
        setMode("menu");
        onChanged("Урок перенесён");
      } else {
        await orgApi.saveGroupAttendance(groupId, { lessonDate: lesson.date, lessonId: lesson.id, topic: lesson.topic, status: "cancelled", records: {}, cancellationReason: trimmed });
        setMode("menu");
        onChanged("Урок отменён");
      }
      setReason("");
    } catch (cause) {
      setError(scheduleErrorText(cause, mode === "reschedule" ? "Не удалось перенести урок. Расписание не изменено." : "Не удалось отменить урок. Данные не изменены."));
    } finally {
      setBusy(false);
    }
  };

  const ACTION_BUTTON = "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-primary-200 hover:bg-primary-50/50";

  return (
    <Modal
      open={lesson !== null}
      title={title}
      onClose={close}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={mode === "menu" ? (
        <button type="button" onClick={close} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Закрыть</button>
      ) : (
        <>
          <button type="button" onClick={() => { setMode("menu"); setError(null); }} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${mode === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary-600 hover:bg-primary-700"}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "cancel" ? SCHEDULE_ACTION_LABEL.cancel : SCHEDULE_ACTION_LABEL.reschedule}
          </button>
        </>
      )}
    >
      {lesson && (
        <div className="space-y-4 pb-1">
          <div className="space-y-1 text-sm text-slate-600">
            <p>{subtitle}</p>
            {teacherLine && <p className="font-medium text-slate-800">{teacherLine}</p>}
            {notes.map((line) => <p key={line} className="break-words text-slate-700">{line}</p>)}
            <LessonChips marks={marks} requestHref={requestHref} className="pt-1" />
          </div>

          {mode === "menu" && (
            actions.length === 0 ? (
              notes.length > 0 ? null : <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500">С этим уроком ничего сделать нельзя.</p>
            ) : (
              <div className="space-y-2" role="group" aria-label="Действия с уроком">
                {actions.map((action) => {
                  switch (action) {
                    case "assign":
                      return <button key={action} type="button" onClick={onAssign} className={ACTION_BUTTON}><UserRoundCheck className="h-4 w-4 text-violet-600" />{assignLabel}</button>;
                    case "reschedule":
                      return <button key={action} type="button" onClick={() => open("reschedule")} className={ACTION_BUTTON}><CalendarClock className="h-4 w-4 text-primary-600" />{SCHEDULE_ACTION_LABEL.reschedule}</button>;
                    case "cancel":
                      return <button key={action} type="button" onClick={() => open("cancel")} className={ACTION_BUTTON}><Ban className="h-4 w-4 text-rose-600" />{SCHEDULE_ACTION_LABEL.cancel}</button>;
                    case "mark":
                      return <button key={action} type="button" onClick={onJournal} className={ACTION_BUTTON}><ClipboardCheck className="h-4 w-4 text-primary-600" />{SCHEDULE_ACTION_LABEL.mark}</button>;
                    case "journal":
                      return <button key={action} type="button" onClick={onJournal} className={ACTION_BUTTON}><ExternalLink className="h-4 w-4 text-slate-500" />{SCHEDULE_ACTION_LABEL.journal}</button>;
                  }
                })}
              </div>
            )
          )}

          {mode === "reschedule" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sheet-start" className={LABEL}>Начало</label>
                  <input id="sheet-start" inputMode="numeric" autoComplete="off" placeholder="15:00" maxLength={5} value={start} onChange={(event) => { setError(null); setStart(event.target.value); }} onBlur={() => setStart((value) => normalizeTime(value) ?? value)} className={FIELD} />
                </div>
                <div>
                  <label htmlFor="sheet-end" className={LABEL}>Окончание</label>
                  <input id="sheet-end" inputMode="numeric" autoComplete="off" placeholder="16:30" maxLength={5} value={end} onChange={(event) => { setError(null); setEnd(event.target.value); }} onBlur={() => setEnd((value) => normalizeTime(value) ?? value)} className={FIELD} />
                </div>
              </div>
              <div>
                <label htmlFor="sheet-room" className={LABEL}>Кабинет (необязательно)</label>
                <input id="sheet-room" value={room} onChange={(event) => setRoom(event.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="sheet-reason" className={LABEL}>Причина переноса</label>
                <textarea id="sheet-reason" rows={2} value={reason} onChange={(event) => { setError(null); setReason(event.target.value); }} className={`${FIELD} resize-none`} />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Расписание группы не меняется: переносится только этот урок. Ученики и учитель увидят новое время.</p>
            </div>
          )}

          {mode === "cancel" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="sheet-reason" className={LABEL}>Причина отмены</label>
                <textarea id="sheet-reason" rows={2} value={reason} onChange={(event) => { setError(null); setReason(event.target.value); }} className={`${FIELD} resize-none`} />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Урок будет отменён и не вернётся. Ученики на нём не отмечаются, преподавателю за него оплата не начисляется.</p>
            </div>
          )}

          {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
