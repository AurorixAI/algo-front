"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Ban, CalendarClock, ClipboardCheck, ExternalLink, Loader2, Pencil, RefreshCw, UserRoundCheck, X } from "lucide-react";
import { orgApi, substitutionsApi, type Lesson } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { Modal } from "@/components/ui/modal";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import { opsErrorCode, scheduleErrorText } from "@/lib/ops-errors";
import { roomForSave } from "@/lib/schedule-slots";
import {
  SCHEDULE_ACTION_LABEL,
  examCancelState,
  isLessonChanged,
  lessonMoveCheckLines,
  lessonMoveErrorText,
  moveConfirmDisabled,
  normalizeTime,
  type ScheduleCardAction,
} from "@/lib/schedule-card-actions";
import type { LessonMark } from "@/lib/substitutions";
import type { ExamBinding, MoveCheckOut } from "@/lib/substitution-types";
import { CHANGE_KIND_BUTTON, CHANGE_KIND_LABEL, canChangeKind, cancellationKindBody, type CancellationKind } from "@/lib/payf";
import { FRESH_DRAFT, sheetReducer, type SheetMode } from "@/lib/cancel-sheet";
import { useCanChooseCancellationKind } from "@/lib/use-cancellation-kind";
import { ChangeKindForm } from "./change-kind-form";
import { CancellationKindField } from "@/components/attendance/cancellation-kind-field";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";

const FIELD = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";
const REASON_MIN = 3;
const REASON_MAX = 500;
const NO_NOTES: string[] = [];
const NO_MARKS: LessonMark[] = [];

/**
 * The sheet of one lesson of the group's week schedule (owner / administrator).  The card is information only; this is where the
 * actions by situation live: a future lesson - «Назначить замену» / «Перенести урок» / «Отменить урок»; a past one nobody marked -
 * «Отметить посещаемость» / «Назначить того, кто провёл»; a held one - «Открыть в журнале».  A phone gets the same as a card at the
 * bottom of the screen (the dialog of the project).  The assignment itself is the dialog of LOGIC-B (`LessonTeacherDialog`).
 *
 * P1.1: the teacher moves HIS lesson with the same form (`moveOnly`: the sheet holds nothing but the move; see `TeacherMoveControl`).
 *
 * #124: «Перенести урок» moves the lesson to ANY date (`lesson-move`, with a live check of the new time); «Отменить урок» first asks
 * the server what the exam bound to the lesson means (`lesson-exam-binding`).
 */
export function LessonActionSheet({
  lesson, groupId, title, subtitle, teacherLine, notes = NO_NOTES, marks = NO_MARKS, actions, assignLabel = "", requestHref, moveOnly = false, aboveLessonPanel = false, cancellationKind = null, onClose, onAssign, onJournal, onEditSeries, onEndSeries, seriesPending = null, seriesError = null, onChanged, onRefresh,
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
  notes?: string[];
  marks?: LessonMark[];
  actions: ScheduleCardAction[];
  assignLabel?: string;
  requestHref?: (requestId: string) => string;
  /** P1.1, the teacher's own move: the sheet opens straight on the form of the move and «Назад» closes it. */
  moveOnly?: boolean;
  /** The sheet opens over the teacher's lesson panel. */
  aboveLessonPanel?: boolean;
  /** PAY-F: the kind of the cancellation of this lesson as the journal sends it (`centre` | `holiday` | `day_off`; none = an old cancellation or a move). */
  cancellationKind?: string | null;
  onClose: () => void;
  onAssign?: () => void;
  onJournal?: () => void;
  /** «Изменить постоянный урок» / «Прекратить урок»: the weekly lesson of this one (the page opens its dialogs). */
  onEditSeries?: () => void;
  onEndSeries?: () => void;
  /** The weekly lesson of the sheet is being read (a button shows it) / could not be read (the sheet says it and stays open). */
  seriesPending?: "edit" | "end" | null;
  seriesError?: string | null;
  /** After a move or a cancellation was saved: the toast text. */
  onChanged: (text: string) => void;
  /** «Урок уже изменили — обновите»: the schedule is read again and the sheet closes. */
  onRefresh?: () => void;
}) {
  // the step, the reason and the kind in ONE reducer: every step starts clean (`lib/cancel-sheet.ts`, tested)
  const [draft, dispatch] = useReducer(sheetReducer, FRESH_DRAFT);
  const { mode, reason, kind } = draft;
  const setMode = (next: SheetMode) => dispatch({ type: "mode", mode: next });
  const setReason = (next: string) => dispatch({ type: "reason", reason: next });
  const setKind = (next: CancellationKind) => dispatch({ type: "kind", kind: next });
  const canChooseKind = useCanChooseCancellationKind();
  const changeKind = canChangeKind(canChooseKind, cancellationKind) ? cancellationKind : null;
  const [newDate, setNewDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  // the answer of the live check, tagged with the date and time it was asked for: an answer for other values is no answer
  const [result, setResult] = useState<{ key: string; out: MoveCheckOut | null; error: { text: string; stale: boolean } | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkNonce, setCheckNonce] = useState(0);
  const [binding, setBinding] = useState<ExamBinding | null>(null);
  const today = useMemo(() => formatBusinessDate(), []);
  const checkToken = useRef(0);

  const lessonStart = lesson ? lesson.startTime || lesson.start_time || "" : "";
  const lessonEnd = lesson?.endTime || "";

  const close = () => { if (busy) return; dispatch({ type: "close" }); setError(null); setStale(false); onClose(); };

  const loadBinding = useCallback(() => {
    if (!lesson) return;
    setBinding(null);
    substitutionsApi.lessonExamBinding(groupId, lesson.id, lesson.date)
      .then((out) => setBinding(out))
      .catch(() => setBinding({ state: "unavailable", canCancel: false, message: "Не удалось проверить экзамены группы. Повторите попытку." }));
  }, [groupId, lesson]);

  const open = (next: SheetMode) => {
    setError(null);
    setStale(false);
    setResult(null);
    if (next === "reschedule" && lesson) {
      setNewDate(lesson.date);
      setStart(lessonStart);
      setEnd(lessonEnd);
      setRoom(lesson.room || "");
    }
    if (next === "cancel") loadBinding();
    dispatch({ type: "open", mode: next, kind: next === "kind" && changeKind ? (changeKind === "centre" ? "holiday" : "centre") : undefined });      // «Изменить причину»: starts from the OTHER kind
  };

  const lessonKey = lesson ? `${lesson.id}|${lesson.date}` : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- opens once per lesson, not at every render of the parent
  useEffect(() => { if (moveOnly && lessonKey) open("reschedule"); }, [moveOnly, lessonKey]);

  // the live check of the new time, with a pause for typing
  const from = normalizeTime(start);
  const to = normalizeTime(end);
  const validNew = /^\d{4}-\d{2}-\d{2}$/.test(newDate) && newDate >= today && from !== null && to !== null && to > from;
  const sameSlot = Boolean(lesson && newDate === lesson.date && from === lessonStart && to === lessonEnd);
  const checkKey = `${newDate}|${from ?? ""}|${to ?? ""}`;
  useEffect(() => {
    if (mode !== "reschedule" || !lesson || !validNew || sameSlot || !from || !to) { setResult(null); setChecking(false); return undefined; }
    const token = ++checkToken.current;
    const key = `${newDate}|${from}|${to}`;
    setChecking(true);
    setResult(null);
    const timer = window.setTimeout(() => {
      substitutionsApi.lessonMoveCheck(groupId, { lessonId: lesson.id, lessonDate: lesson.date, newDate, startTime: from, endTime: to })
        .then((out) => { if (token === checkToken.current) setResult({ key, out, error: null }); })
        .catch((failure) => {
          if (token !== checkToken.current) return;
          // a refusal with a known code says it in words; any other failure (network, 5xx) is «Не удалось проверить время» + «Повторить»
          const code = opsErrorCode(failure);
          setResult({ key, out: null, error: { text: code ? lessonMoveErrorText(failure, "Не удалось проверить время") : "Не удалось проверить время", stale: isLessonChanged(failure) } });
        })
        .finally(() => { if (token === checkToken.current) setChecking(false); });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [mode, lesson, groupId, newDate, from, to, validNew, sameSlot, checkNonce]);

  const fresh = result && result.key === checkKey ? result : null;
  const check = fresh?.out ?? null;
  const checkError = fresh?.error ?? null;
  // «asked, no answer yet» includes the moment between a keystroke and the effect that starts the request
  const pending = checking || (validNew && !sameSlot && fresh === null);

  const trimmed = reason.trim();
  const reasonProblem = trimmed.length < REASON_MIN ? `Укажите причину (не короче ${REASON_MIN} символов)` : trimmed.length > REASON_MAX ? `Причина — не более ${REASON_MAX} символов` : null;
  const examState = examCancelState(mode === "cancel" ? binding : { state: "none" });
  const checkLines = check ? lessonMoveCheckLines(check) : null;
  const confirmDisabled = moveConfirmDisabled({ checking: pending, failed: checkError !== null, check });
  const notRunHint = !pending && !check && !checkError ? (sameSlot ? "Выберите другую дату или время" : !validNew ? "Укажите новую дату и время: начало и окончание, конец позже начала" : null) : null;

  const submit = async () => {
    if (!lesson || busy) return;
    if (mode === "reschedule") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { setError("Укажите новую дату урока"); return; }
      if (newDate < today) { setError("Новое время урока уже прошло"); return; }
      if (!from || !to || to <= from) { setError("Укажите время как 15:00: начало и окончание, конец позже начала"); return; }
      if (sameSlot) { setError("Выберите другую дату или время"); return; }
    }
    if (reasonProblem) { setError(reasonProblem); return; }
    setBusy(true);
    setError(null);
    try {
      if (mode === "reschedule" && from && to) {
        await substitutionsApi.lessonMove(groupId, {
          lessonId: lesson.id, lessonDate: lesson.date, newDate, startTime: from, endTime: to,
          room: roomForSave(room) ?? null, format: lesson.format || "offline", reason: trimmed,
          expectedStartTime: lessonStart || null, expectedEndTime: lessonEnd || null,
        });
        setMode("menu");
        onChanged("Урок перенесён");
      } else if (mode === "kind") {
        await orgApi.changeCancellationKind(groupId, { lessonDate: lesson.date, lessonId: lesson.id, cancellationKind: kind, reason: trimmed });
        setMode("menu");
        onChanged("Причина отмены изменена");
      } else {
        await orgApi.saveGroupAttendance(groupId, { lessonDate: lesson.date, lessonId: lesson.id, topic: lesson.topic, status: "cancelled", records: {}, cancellationReason: trimmed, ...cancellationKindBody(kind, canChooseKind) });
        setMode("menu");
        onChanged("Урок отменён");
      }
      dispatch({ type: "reset" });
    } catch (cause) {
      setStale(isLessonChanged(cause));
      if (mode === "reschedule") {
        setError(lessonMoveErrorText(cause));
      } else {
        setError(scheduleErrorText(cause, "Не удалось отменить урок. Данные не изменены."));
      }
    } finally {
      setBusy(false);
    }
  };

  const SMALL_BUTTON = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50";
  // «Обновить»: the lesson is not what the sheet shows (changed, cancelled, gone, started, its group archived): re-read the schedule, close
  const refreshButton = (
    <button type="button" data-testid="sheet-refresh" onClick={() => { setStale(false); setError(null); setResult(null); setMode("menu"); onRefresh?.(); }} className={SMALL_BUTTON}><RefreshCw className="h-3 w-3" />Обновить</button>
  );
  const ACTION_BUTTON = "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-primary-200 hover:bg-primary-50/50";

  return (
    <Modal
      open={lesson !== null}
      title={title}
      onClose={close}
      busy={busy}
      maxWidthClassName="max-w-md"
      aboveLessonPanel={aboveLessonPanel}
      footer={mode === "menu" ? (
        <button type="button" onClick={close} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Закрыть</button>
      ) : (
        <>
          <button type="button" onClick={() => { if (moveOnly) close(); else { setMode("menu"); setError(null); } }} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (mode === "cancel" && examState.blocked) || (mode === "reschedule" && confirmDisabled)}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${mode === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary-600 hover:bg-primary-700"}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "cancel" ? SCHEDULE_ACTION_LABEL.cancel : mode === "kind" ? CHANGE_KIND_BUTTON : SCHEDULE_ACTION_LABEL.reschedule}
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
                      return <button key={action} type="button" onClick={() => onAssign?.()} className={ACTION_BUTTON}><UserRoundCheck className="h-4 w-4 text-violet-600" />{assignLabel}</button>;
                    case "reschedule":
                      return <button key={action} type="button" onClick={() => open("reschedule")} className={ACTION_BUTTON}><CalendarClock className="h-4 w-4 text-primary-600" />{SCHEDULE_ACTION_LABEL.reschedule}</button>;
                    case "cancel":
                      return <button key={action} type="button" onClick={() => open("cancel")} className={ACTION_BUTTON}><Ban className="h-4 w-4 text-rose-600" />{SCHEDULE_ACTION_LABEL.cancel}</button>;
                    case "mark":
                      return <button key={action} type="button" onClick={() => onJournal?.()} className={ACTION_BUTTON}><ClipboardCheck className="h-4 w-4 text-primary-600" />{SCHEDULE_ACTION_LABEL.mark}</button>;
                    case "editSeries":
                      return <button key={action} type="button" onClick={onEditSeries} disabled={seriesPending !== null} className={`${ACTION_BUTTON} disabled:cursor-wait disabled:opacity-70`}>{seriesPending === "edit" ? <Loader2 className="h-4 w-4 animate-spin text-primary-600" /> : <Pencil className="h-4 w-4 text-primary-600" />}{SCHEDULE_ACTION_LABEL.editSeries}</button>;
                    case "endSeries":
                      return <button key={action} type="button" onClick={onEndSeries} disabled={seriesPending !== null} className={`${ACTION_BUTTON} disabled:cursor-wait disabled:opacity-70`}>{seriesPending === "end" ? <Loader2 className="h-4 w-4 animate-spin text-rose-600" /> : <X className="h-4 w-4 text-rose-600" />}{SCHEDULE_ACTION_LABEL.endSeries}</button>;
                    case "journal":
                      return <button key={action} type="button" onClick={() => onJournal?.()} className={ACTION_BUTTON}><ExternalLink className="h-4 w-4 text-slate-500" />{SCHEDULE_ACTION_LABEL.journal}</button>;
                  }
                })}
              </div>
            )
          )}

          {mode === "menu" && seriesError && <p role="alert" data-testid="series-error" className="text-sm font-medium text-rose-700">{seriesError}</p>}

          {mode === "reschedule" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="sheet-date" className={LABEL}>Новая дата</label>
                <DateInput id="sheet-date" min={today} value={newDate} onChange={(next) => { setError(null); setNewDate(next); }} className={FIELD} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sheet-start" className={LABEL}>Начало</label>
                  <TimeInput id="sheet-start" value={start} onChange={(next) => { setError(null); setStart(next); }} className={FIELD} />
                </div>
                <div>
                  <label htmlFor="sheet-end" className={LABEL}>Окончание</label>
                  <TimeInput id="sheet-end" placeholder="16:30" value={end} onChange={(next) => { setError(null); setEnd(next); }} className={FIELD} />
                </div>
              </div>
              <div>
                <label htmlFor="sheet-room" className={LABEL}>Кабинет (необязательно)</label>
                <input id="sheet-room" value={room} onChange={(event) => setRoom(event.target.value)} className={FIELD} />
              </div>
              {pending && <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Проверяем время…</p>}
              {notRunHint && <p data-testid="move-hint" className="text-xs text-slate-500">{notRunHint}</p>}
              {checkError && (
                <div role="alert" data-testid="move-check-error" className="space-y-1.5">
                  <p className="text-xs font-medium text-rose-700">{checkError.text}</p>
                  {checkError.stale && onRefresh ? refreshButton : !checkError.stale && (
                    <button type="button" onClick={() => setCheckNonce((value) => value + 1)} className={SMALL_BUTTON}><RefreshCw className="h-3 w-3" />Повторить</button>
                  )}
                </div>
              )}
              {checkLines && (
                <div role="status" aria-live="polite" data-testid="move-check" data-code={checkLines.code ?? undefined} className="space-y-1">
                  {checkLines.lines.map((line) => <p key={line} className={`text-xs font-medium ${checkLines.ok ? "text-emerald-700" : "text-rose-700"}`}>{line}</p>)}
                  {checkLines.warnings.map((line) => <p key={line} className="text-xs font-medium text-amber-800">{line}</p>)}
                  {checkLines.stale && onRefresh && refreshButton}
                </div>
              )}
              <div>
                <label htmlFor="sheet-reason" className={LABEL}>Причина переноса</label>
                <textarea id="sheet-reason" rows={2} value={reason} onChange={(event) => { setError(null); setReason(event.target.value); }} className={`${FIELD} resize-none`} />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Расписание группы не меняется: переносится только этот урок, на любую дату. Ученики и учитель увидят новое время.</p>
            </div>
          )}

          {mode === "menu" && changeKind && (
            <button type="button" data-testid="sheet-change-kind" onClick={() => open("kind")} className={ACTION_BUTTON}>
              <Pencil className="h-4 w-4 text-slate-500" />{CHANGE_KIND_LABEL}
              <span className="ml-auto text-xs font-medium text-slate-500">{changeKind === "centre" ? "по вине центра" : "праздник, выходной"}</span>
            </button>
          )}

          {mode === "kind" && <ChangeKindForm kind={kind} onKind={setKind} reason={reason} onReason={(next) => { setError(null); setReason(next); }} busy={busy} />}

          {mode === "cancel" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="sheet-reason" className={LABEL}>Причина отмены</label>
                <textarea id="sheet-reason" rows={2} value={reason} onChange={(event) => { setError(null); setReason(event.target.value); }} className={`${FIELD} resize-none`} />
              </div>
              <CancellationKindField canChooseKind={canChooseKind} value={kind} onChange={setKind} name="sheet-cancellation-kind" disabled={busy} />
              {examState.loading && <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Проверяем экзамены группы…</p>}
              {examState.message && (
                <div data-testid="exam-binding">
                  <p role={examState.tone === "error" ? "alert" : "status"} className={`text-xs font-semibold ${examState.tone === "error" ? "text-rose-700" : "text-amber-800"}`}>{examState.message}</p>
                  {examState.retry && (
                    <button type="button" onClick={loadBinding} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3 w-3" />Повторить</button>
                  )}
                </div>
              )}
              <p className="text-xs leading-relaxed text-slate-500">Урок будет отменён и не вернётся. Ученики на нём не отмечаются, заработок преподавателя за него не засчитывается.</p>
            </div>
          )}

          {error && (
            <div role="alert" className="space-y-1.5">
              <p className="text-sm font-medium text-rose-700">{error}</p>
              {stale && onRefresh && refreshButton}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
