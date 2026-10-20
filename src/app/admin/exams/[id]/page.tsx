"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, BarChart3, CalendarClock,
  Clock3, Eye, EyeOff, FileText, Layers, Radio, Users,
} from "lucide-react";
import { MathRenderer } from "@/components/ui/math-renderer";
import { TaskStatement } from "@/components/ui/task-statement";
import { examsApi, type AdminExamView } from "@/lib/api";
import { formatBusinessCalendarDate, formatUtcNaiveAsBusinessDayTime } from "@/lib/business-time";
import { examHasLobby, isNoLobbyConflict } from "@/lib/exam-lobby";
import { formatErrorType, pickAnswerDisplayText, pickDistractorExplanation } from "@/lib/task-display";
import { cn } from "@/lib/utils";

type Tab = "lobby" | "tasks" | "analytics";
type LobbyState = Awaited<ReturnType<typeof examsApi.getLobbyStatus>>;
type SessionRow = {
  session_id: string; student_name: string; status: string; score?: number;
  max_score?: number; percentage?: number; started_at?: string | null; submitted_at?: string | null;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "border-slate-200 bg-slate-50 text-slate-600" },
  variants_ready: { label: "Готов к назначению", className: "border-blue-200 bg-blue-50 text-blue-700" },
  lobby: { label: "Ожидает запуска", className: "border-amber-200 bg-amber-50 text-amber-800" },
  active: { label: "Идёт экзамен", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  closed: { label: "Завершён", className: "border-violet-200 bg-violet-50 text-violet-700" },
  archived: { label: "В архиве", className: "border-slate-200 bg-slate-50 text-slate-500" },
};

const asDate = (value?: string | null) => formatBusinessCalendarDate(value, { day: "numeric", month: "long", year: "numeric" }) || "не назначено";

function asDateTime(value?: string | null): string {
  // Session stamps (started_at / submitted_at) are naive UTC; the admin reads them on the Tashkent clock.
  return formatUtcNaiveAsBusinessDayTime(value) || "—";
}

function duration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  return `${String(Math.max(0, Math.floor(seconds / 60))).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
}

function participantStatus(status: string, isFinalized = false): string {
  if (status === "submitted") return "Сдал";
  // A closed or archived exam is immutable. Old data can still contain an
  // unfinished attempt, but it must never be presented as a live attempt.
  if (isFinalized && ["in_progress", "waiting"].includes(status)) return "Не завершил";
  return status === "in_progress" ? "Решает" : status === "waiting" ? "Ожидает" : status || "—";
}

function participantTone(status: string, isFinalized = false): string {
  if (status === "submitted") return "bg-emerald-50 text-emerald-700";
  if (isFinalized && ["in_progress", "waiting"].includes(status)) return "bg-amber-50 text-amber-800";
  return status === "in_progress" ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-600";
}

function latestEvent(exam: AdminExamView, types: string[]) {
  return [...(exam.lifecycle_events || [])].reverse().find((event) => types.includes(event.type));
}

export default function AdminExamViewPage() {
  const { id: examId } = useParams<{ id: string }>();
  const [exam, setExam] = useState<AdminExamView | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  // Set when exam-service answers 409 "no lobby" (a print exam we did not know was one): stop asking.
  const [lobbyConflict, setLobbyConflict] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [tab, setTab] = useState<Tab>("lobby");
  const [selectedVariant, setSelectedVariant] = useState(1);
  const [showAnswers, setShowAnswers] = useState(false);
  const [expandedDistractors, setExpandedDistractors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLobbyConflict(false);
    try {
      // The lobby is requested only after the view says the exam has one: a printed
      // exam answers 409 there (and the browser logs it as a console error).
      const sessionsRequest = examsApi.getSessions(examId).catch(() => []);
      const analyticsRequest = examsApi.getAnalytics(examId).catch(() => null);
      const view = await examsApi.getAdminView(examId);
      const lobbyState = examHasLobby(view)
        ? await examsApi.getLobbyStatus(examId).catch((err) => {
            if (isNoLobbyConflict(err)) setLobbyConflict(true);
            return null;
          })
        : null;
      const [sessionRows, analyticsData] = await Promise.all([sessionsRequest, analyticsRequest]);
      setExam(view);
      setLobby(lobbyState);
      setSessions(Array.isArray(sessionRows) ? sessionRows : []);
      setAnalytics(analyticsData);
      setSelectedVariant((current) => view.variants.some((item) => item.variant_number === current) ? current : (view.variants[0]?.variant_number || 1));
    } catch (err: any) {
      console.error("Failed to load admin exam view", err);
      setError(err?.message || "Не удалось загрузить данные экзамена.");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { void load(); }, [load]);

  const hasLobby = examHasLobby(exam) && !lobbyConflict;

  useEffect(() => {
    if (exam?.status !== "lobby" && exam?.status !== "active") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([
        hasLobby
          ? examsApi.getLobbyStatus(examId).then(setLobby).catch((err) => {
              if (isNoLobbyConflict(err)) { setLobbyConflict(true); setLobby(null); }
            })
          : undefined,
        examsApi.getSessions(examId).then((rows) => setSessions(Array.isArray(rows) ? rows : [])).catch(() => undefined),
        examsApi.getAnalytics(examId).then(setAnalytics).catch(() => undefined),
      ]);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [exam?.status, examId, hasLobby]);

  const currentVariant = useMemo(
    () => exam?.variants.find((item) => item.variant_number === selectedVariant) || exam?.variants[0],
    [exam?.variants, selectedVariant],
  );
  const lobbyStudents = lobby?.students || [];
  const isFinalized = exam ? ["closed", "archived"].includes(exam.status) : false;
  // The result sessions are the source of truth after finalization. The lobby
  // snapshot is only a live view and can contain historical transitional rows.
  const participants: SessionRow[] = isFinalized ? sessions : (lobbyStudents.length ? lobbyStudents : sessions);
  const submitted = participants.filter((student) => student.status === "submitted").length;
  const solving = isFinalized ? 0 : participants.filter((student) => student.status === "in_progress").length;
  const incomplete = isFinalized ? participants.filter((student) => student.status !== "submitted").length : 0;
  const waiting = isFinalized ? 0 : participants.filter((student) => student.status === "waiting").length;

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" /></div>;
  if (error || !exam) return <section className="mx-auto mt-16 max-w-xl rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm"><AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-500" /><h1 className="text-lg font-bold text-slate-900">Экзамен недоступен</h1><p className="mt-2 text-sm text-slate-500">{error || "Экзамен не найден или недоступен организации."}</p><Link href="/admin/exams" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white"><ArrowLeft className="h-4 w-4" /> К контролю экзаменов</Link></section>;

  const status = statusConfig[exam.status] || statusConfig.draft;
  const cancellation = latestEvent(exam, ["lesson_cancelled"]);
  const reschedule = latestEvent(exam, ["lesson_rescheduled", "exam_rescheduled"]);
  const scheduleLabel = cancellation
    ? `Урок отменён ${asDate(cancellation.lesson_date)}${cancellation.reason ? ` · ${cancellation.reason}` : ""}`
    : reschedule ? `Занятие перенесено · ${asDate(reschedule.lesson_date)}`
      : exam.scheduled_lesson_date ? `Занятие: ${asDate(exam.scheduled_lesson_date)}` : "Занятие пока не выбрано";
  const tabs = [
    { key: "lobby" as const, label: isFinalized ? "Участники" : "Лобби / Live-комната", icon: Radio, count: isFinalized ? participants.length : lobby?.connected_count },
    { key: "tasks" as const, label: "Задания и варианты", icon: Layers },
    { key: "analytics" as const, label: "Результаты и аналитика", icon: BarChart3, count: submitted || undefined },
  ];

  return <div className="space-y-6">
    <Link href="/admin/exams" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-primary-700"><ArrowLeft className="h-4 w-4" /> К экзаменам организации</Link>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600"><FileText className="h-6 w-6" /></span><div className="min-w-0"><h1 className="truncate text-2xl font-bold text-slate-900">{exam.title}</h1><div className="mt-3 space-y-1 text-sm text-slate-500"><p>{exam.group_name || "Группа не выбрана"}{exam.class_level ? ` · ${exam.class_level} класс` : ""}</p><p>Преподаватель: <span className="font-medium text-slate-700">{exam.teacher_name || "не назначен"}</span></p></div></div></div><span className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${status.className}`}>{status.label}</span></div></section>

    {(cancellation || reschedule) && <section className={`flex gap-3 rounded-2xl border p-4 text-sm ${cancellation ? "border-amber-200 bg-amber-50 text-amber-900" : "border-violet-200 bg-violet-50 text-violet-900"}`}><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">{scheduleLabel}</p><p className="mt-1 text-xs opacity-80">Событие сохранено в истории экзамена. Эта страница не меняет лобби или расписание.</p></div></section>}

    <div className="flex items-center justify-center"><div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-100/90 p-1.5 shadow-sm">{tabs.map(({ key, label, icon: Icon, count }) => <button key={key} type="button" onClick={() => setTab(key)} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all", tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50 hover:text-slate-900")}><Icon className={cn("h-4 w-4", tab === key ? "text-primary-600" : "text-slate-400")} /><span>{label}</span>{typeof count === "number" && count > 0 && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-extrabold text-primary-700">{count}</span>}</button>)}</div></div>

    {tab === "lobby" && <div className="space-y-5"><section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-xl font-black text-primary-700">{isFinalized ? participants.length : (lobby?.connected_count ?? participants.length)}</div><div><h2 className="font-bold text-slate-900">{exam.status === "lobby" ? "Участники в комнате ожидания" : exam.status === "active" ? "Ученики пишут экзамен" : "Участники экзамена"}</h2><p className="mt-1 text-sm text-slate-500">{isFinalized ? `Сдали: ${submitted}${incomplete ? ` · Не завершили: ${incomplete}` : ""}` : `В процессе: ${solving} · Сдали: ${submitted} · Ожидают: ${waiting}`}</p></div></div>{exam.status === "active" ? <div className="flex items-center gap-3 self-start rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-800 sm:self-auto"><Clock3 className="h-5 w-5 animate-pulse" /><div><p className="text-xs font-semibold">До завершения</p><p className="text-xl font-black">{duration(lobby?.time_remaining_seconds)}</p></div></div> : <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarClock className="h-4 w-4 text-primary-600" /> {scheduleLabel}</div>}</section><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Участники</h2><p className="mt-0.5 text-sm text-slate-500">{isFinalized ? "Итоговые статусы после завершения экзамена" : "Статусы обновляются автоматически во время экзамена"}</p></div>{["lobby", "active"].includes(exam.status) && <span className="text-xs font-semibold text-slate-400">Обновление каждые 15 сек.</span>}</div>{participants.length === 0 ? <div className="px-5 py-14 text-center"><Users className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 font-bold text-slate-800">Участники ещё не подключились</h3><p className="mt-1 text-sm text-slate-500">Здесь отображается только фактический ход экзамена — без управления лобби.</p></div> : <div className="divide-y divide-slate-100">{participants.map((student) => <div key={student.session_id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{student.student_name}</p><p className="mt-0.5 text-xs text-slate-400">{student.submitted_at ? `Сдано: ${asDateTime(student.submitted_at)}` : student.started_at ? `Начато: ${asDateTime(student.started_at)}` : "Ожидает начала"}</p></div><div className="flex items-center gap-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", participantTone(student.status, isFinalized))}>{participantStatus(student.status, isFinalized)}</span>{student.status === "submitted" && typeof student.percentage === "number" && <strong className="w-12 text-right text-sm text-slate-800">{Math.round(student.percentage)}%</strong>}</div></div>)}</div>}</section></div>}

    {tab === "tasks" && <div className="space-y-5"><section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold text-slate-500">Варианты:</span>{exam.variants.map((variant) => <button key={variant.variant_id} type="button" onClick={() => setSelectedVariant(variant.variant_number)} className={cn("rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all", currentVariant?.variant_number === variant.variant_number ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>Вариант {variant.variant_number} ({variant.tasks.length} зад.)</button>)}</div>{exam.answer_key_available ? <button type="button" onClick={() => setShowAnswers((visible) => !visible)} className={cn("inline-flex items-center gap-2 self-start rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all sm:self-auto", showAnswers ? "border-primary-200 bg-primary-50 text-primary-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>{showAnswers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{showAnswers ? "Скрыть ответы" : "Показать ответы"}</button> : <span className="self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 sm:self-auto">Ключ откроется после завершения</span>}</section>{!currentVariant?.tasks.length ? <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-sm font-semibold text-slate-500">Вариант не содержит задач.</section> : currentVariant.tasks.map((task, index) => <TaskCard key={task.task_id} task={task} index={index} canSeeAnswer={exam.answer_key_available && showAnswers} expanded={!!expandedDistractors[task.task_id]} onToggleDistractors={() => setExpandedDistractors((previous) => ({ ...previous, [task.task_id]: !previous[task.task_id] }))} />)}</div>}

    {tab === "analytics" && <AnalyticsTab exam={exam} sessions={sessions} analytics={analytics} submitted={submitted} />}
  </div>;
}

function TaskCard({ task, index, canSeeAnswer, expanded, onToggleDistractors }: { task: AdminExamView["variants"][number]["tasks"][number]; index: number; canSeeAnswer: boolean; expanded: boolean; onToggleDistractors: () => void }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700">#{index + 1}</span><div><span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">Уровень {task.difficulty || "—"}</span><span className="ml-2 text-xs font-medium text-slate-500">{task.skill_name || "Математика"}</span></div></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Только просмотр</span></div><div className="my-4 text-base leading-relaxed text-slate-900"><TaskStatement task={task} /></div>{task.question_image_url && <div className="my-3 max-w-sm overflow-hidden rounded-xl border border-slate-200"><img src={task.question_image_url} alt="Иллюстрация к заданию" className="max-h-56 w-full object-contain" /></div>}{canSeeAnswer && <div className="mt-3 inline-flex max-w-full items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-emerald-900"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" /><span className="text-xs font-semibold text-emerald-800">Правильный ответ:</span><span className="text-sm font-medium text-emerald-950"><MathRenderer text={pickAnswerDisplayText(task.correct_answer || "", task.correct_answer_latex)} /></span></div>}{canSeeAnswer && task.distractor_meta?.length ? <div className="mt-4 border-t border-slate-100 pt-3"><button type="button" onClick={onToggleDistractors} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{expanded ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{expanded ? "Скрыть анализ дистракторов" : `Анализ типичных ошибок (${task.distractor_meta.length})`}</button>{expanded && <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">{task.distractor_meta.map((distractor, distractorIndex) => <div key={`${task.task_id}-${distractorIndex}`} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><span className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Вариант #{distractorIndex + 1}</span><span className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-900"><MathRenderer text={pickAnswerDisplayText(distractor.value, distractor.value_latex)} /></span></div>{distractor.error_type && <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{formatErrorType(distractor.error_type)}</span>}</div>{pickDistractorExplanation(distractor) && <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700"><strong className="text-slate-900">Причина ошибки: </strong><MathRenderer text={pickDistractorExplanation(distractor)} className="inline text-xs text-slate-700" /></div>}</div>)}</div>}</div> : null}</section>;
}

function AnalyticsTab({ exam, sessions, analytics, submitted }: { exam: AdminExamView; sessions: SessionRow[]; analytics: any; submitted: number }) {
  const average = submitted ? Math.round(analytics?.avg_score_pct ?? (sessions.filter((item) => item.status === "submitted").reduce((sum, item) => sum + (item.percentage || 0), 0) / Math.max(1, submitted))) : null;
  const values = [
    { label: "Всего участников", value: analytics?.total_sessions ?? sessions.length, tone: "text-slate-900" },
    { label: "Сдали работы", value: analytics?.submitted_sessions ?? submitted, tone: "text-emerald-600" },
    { label: "Средний балл", value: average === null ? "—" : `${average}%`, tone: "text-primary-600" },
    { label: "Длительность", value: `${exam.total_time_minutes || 45} мин`, tone: "text-slate-900" },
  ];
  return <div className="space-y-5"><section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{values.map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className={cn("mt-2 text-2xl font-black", item.tone)}>{item.value}</p></div>)}</section><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Результаты участников</h2><p className="mt-0.5 text-sm text-slate-500">Фактические результаты экзамена без изменения данных.</p></div>{sessions.length === 0 ? <div className="px-5 py-14 text-center"><BarChart3 className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 font-bold text-slate-800">Пока нет сданных работ</h3><p className="mt-1 text-sm text-slate-500">Результаты появятся после сдачи экзамена учениками.</p></div> : <div className="divide-y divide-slate-100">{sessions.map((student) => <div key={student.session_id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-semibold text-slate-800">{student.student_name}</p><p className="mt-0.5 text-xs text-slate-400">{student.submitted_at ? `Сдано: ${asDateTime(student.submitted_at)}` : participantStatus(student.status)}</p></div><div className="text-right"><p className="text-lg font-bold text-slate-900">{student.status === "submitted" ? `${Math.round(student.percentage ?? 0)}%` : "—"}</p><p className="text-xs text-slate-500">{student.status === "submitted" ? `${student.score ?? 0}/${student.max_score ?? 0} баллов` : "Нет результата"}</p></div></div>)}</div>}</section></div>;
}
