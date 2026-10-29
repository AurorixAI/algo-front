"use client";

import { Chip } from "@/components/ui/chip";
import { examStatusView } from "@/lib/status-registry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  History,
  Radio,
  RefreshCw,
  Users,
} from "lucide-react";
import { examsApi, type AdminExamMonitorState, type ExamSummary } from "@/lib/api";
import { businessDateWithOffset, formatBusinessCalendarDate, formatIsoDateLabel, formatUtcNaiveAsBusinessDayTime } from "@/lib/business-time";
import { examListState, lobbyBucketOf, lobbyCounts, lobbyExamLabel, monitorLobbyCounts, type DashboardExamState, type LobbyBucket } from "@/lib/exam-lobby";
import { useTodayLessonStatuses } from "@/lib/use-exam-lessons";

type Period = "all" | "today" | "yesterday" | "7d" | "30d";
/**
 * #159: a lobby exam is «Лобби открыто» only while its lesson is on and «Запланирован» before it, so the old filter «lobby» is two cards: «Лобби открыто» (the lobbies of TODAY whose lesson is
 * on) and «Запланированы» (the lobbies of a later day + the lobbies of today whose lesson has not begun).  The SERVER counts the lobbies by the day of the lesson (`counts.lobby_future` /
 * `lobby_today`, E1); the page asks the status of a lesson only for the lobbies of today (usually a few), never walks the pages of the others.
 */
type Filter = AdminExamMonitorState | "scheduled";
type Counts = Record<Filter, number>;
type ServerCounts = Record<AdminExamMonitorState | "lobby_past", number>;
const EMPTY_COUNTS: ServerCounts = { all: 0, active: 0, lobby: 0, lobby_future: 0, lobby_today: 0, lobby_past: 0, closed: 0, changes: 0 };
const TODAY_PAGE = 100;
/** The list the server filters for a card; «Лобби открыто» has none - it is made of the lobbies of today. */
const listStateOf = (filter: Filter): AdminExamMonitorState | null => (filter === "lobby" ? null : filter === "scheduled" ? "lobby_future" : filter);
const STATE_TONE: Partial<Record<DashboardExamState, "ok" | "warn" | "info">> = { lobby: "warn", upcoming: "info", today: "info", needs_resolution: "warn" };
type LifecycleEvent = NonNullable<ExamSummary["recent_events"]>[number];

const periods: Array<{ key: Period; label: string }> = [
  { key: "all", label: "Все" },
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
];

function periodBounds(period: Period): { dateFrom?: string; dateTo?: string } {
  if (period === "all") return {};
  if (period === "today") return { dateFrom: businessDateWithOffset(0), dateTo: businessDateWithOffset(0) };
  if (period === "yesterday") return { dateFrom: businessDateWithOffset(-1), dateTo: businessDateWithOffset(-1) };
  return { dateFrom: businessDateWithOffset(period === "7d" ? -6 : -29), dateTo: businessDateWithOffset(0) };
}

function formatDate(dateValue?: string | null): string {
  if (!dateValue) return "дата не назначена";
  return formatBusinessCalendarDate(dateValue, { day: "numeric", month: "long" }) || "дата не назначена";
}

function formatEventTime(value?: string | null): string {
  // Lifecycle event stamps are naive UTC; the admin reads them on the Tashkent clock.
  return formatUtcNaiveAsBusinessDayTime(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function latestEvent(exam: ExamSummary, accepted: string[]): LifecycleEvent | undefined {
  return [...(exam.recent_events || [])].reverse().find((event) => accepted.includes(event.type));
}

function eventSchedule(event?: LifecycleEvent): string | undefined {
  const current = event?.details?.current;
  if (!current || typeof current !== "object") return undefined;
  const payload = current as Record<string, unknown>;
  const start = typeof payload.startTime === "string" ? payload.startTime : undefined;
  const end = typeof payload.endTime === "string" ? payload.endTime : undefined;
  const room = typeof payload.room === "string" ? payload.room : undefined;
  const time = start && end ? `${start}–${end}` : undefined;
  return [time, room].filter(Boolean).join(" · ") || undefined;
}

function rowDetails(exam: ExamSummary): { primary: string; secondary?: string; warning?: boolean } {
  const cancellation = latestEvent(exam, ["lesson_cancelled"]);
  if (cancellation) {
    return {
      primary: `Урок отменён · ${formatDate(cancellation.lesson_date)}`,
      secondary: cancellation.reason ? `Причина: ${cancellation.reason}` : "Экзамен возвращён в подготовку, доступ учеников закрыт.",
      warning: true,
    };
  }
  const reschedule = latestEvent(exam, ["lesson_rescheduled", "exam_rescheduled"]);
  if (reschedule) {
    const oldPayload = reschedule.details?.previous;
    const old = oldPayload && typeof oldPayload === "object" ? oldPayload as Record<string, unknown> : {};
    const oldTime = typeof old.startTime === "string" && typeof old.endTime === "string" ? `Было ${old.startTime}–${old.endTime}` : undefined;
    return {
      primary: `Перенесён · ${formatDate(reschedule.lesson_date)}${eventSchedule(reschedule) ? ` · ${eventSchedule(reschedule)}` : ""}`,
      secondary: [oldTime, reschedule.reason ? `Причина: ${reschedule.reason}` : undefined].filter(Boolean).join(" · ") || "В расписании зафиксировано новое время занятия.",
      warning: true,
    };
  }
  const closed = latestEvent(exam, ["exam_closed"]);
  if (exam.status === "closed" && closed?.at) return { primary: `Завершён · ${formatEventTime(closed.at)}` };
  if (exam.status === "lobby" && exam.scheduled_lesson_date) return { primary: "" };          // #159: the chip already says «Запланирован · пн, 3 нояб.» / «Лобби открыто» - the day is not said twice
  if (exam.scheduled_lesson_date) return { primary: `Занятие: ${formatDate(exam.scheduled_lesson_date)}` };
  return { primary: exam.group_name ? "Экзамен подготовлен, урок ещё не выбран" : "Шаблон библиотеки — не назначен группе" };
}

export default function AdminExamsPage() {
  const [items, setItems] = useState<ExamSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [serverCounts, setServerCounts] = useState<ServerCounts>(EMPTY_COUNTS);
  /** The lobby exams of TODAY in the period (`state=lobby_today`, all of them: a day has a few): the status of their lesson decides «Лобби открыто» or «Запланирован · сегодня». */
  const [todayLobby, setTodayLobby] = useState<ExamSummary[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  // Administrative monitoring opens on the entire timeline.  "Live" states
  // deliberately narrow this to today in selectFilter below.
  const [period, setPeriod] = useState<Period>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const successTimer = useRef<number | null>(null);

  const today = businessDateWithOffset(0);
  const lessons = useTodayLessonStatuses([...todayLobby, ...items], today);
  const stateOf = useCallback((exam: ExamSummary) => examListState(exam, today, lessons.statusOf(exam)), [today, lessons]);
  const bucketOfExam = useCallback((exam: ExamSummary): LobbyBucket | null => (exam.status === "lobby" ? lobbyBucketOf(stateOf(exam)) : null), [stateOf]);
  const todayKinds = useMemo(() => lobbyCounts(todayLobby, stateOf), [todayLobby, stateOf]);
  const counts: Counts = useMemo(
    () => ({ ...serverCounts, ...monitorLobbyCounts(serverCounts, todayKinds) }),
    [serverCounts, todayKinds],
  );
  const listState = listStateOf(filter);
  // «Лобби открыто»: the lobbies of today whose lesson is on; «Запланированы»: today's not begun first, then the later days the server filters (the counter is what the list shows)
  const todayShown = filter === "lobby" ? todayLobby.filter((exam) => bucketOfExam(exam) === "lobby") : filter === "scheduled" ? todayLobby.filter((exam) => bucketOfExam(exam) === "scheduled") : [];
  const shownItems = filter === "lobby" ? todayShown : [...todayShown, ...items];
  const shownTotal = filter === "lobby" ? todayShown.length : todayShown.length + total;

  const load = useCallback(async ({ manual = false, append = false, offset = 0 }: { manual?: boolean; append?: boolean; offset?: number } = {}) => {
    if (manual) {
      if (successTimer.current) window.clearTimeout(successTimer.current);
      setRefreshState("loading");
    }
    if (append) setLoadingMore(true);
    if (!append && !manual) setLoading(true);
    setError(null);
    try {
      const bounds = periodBounds(period);
      const listState = listStateOf(filter);
      let response = listState ? await examsApi.getAdminMonitor({ state: listState, ...bounds, limit: 50, offset: append ? offset : 0 }) : null;
      if (response) {
        const listed = response;
        setItems((previous) => append ? [...previous, ...listed.items] : listed.items);
        setTotal(listed.total);
      }
      if (!append && (!response || response.counts.lobby_today > 0)) {                    // the lobbies of today, all of them; nothing is asked when the server counted none
        const rows: ExamSummary[] = [];
        for (;;) {
          const part = await examsApi.getAdminMonitor({ state: "lobby_today", ...bounds, limit: TODAY_PAGE, offset: rows.length });
          response = response ?? part;
          rows.push(...part.items);
          if (rows.length >= part.total || part.items.length === 0) break;
        }
        setTodayLobby(rows);
      } else if (!append) {
        setTodayLobby([]);
      }
      if (response) setServerCounts({ ...EMPTY_COUNTS, ...response.counts });
      if (manual) {
        setRefreshState("success");
        successTimer.current = window.setTimeout(() => setRefreshState("idle"), 1600);
      }
    } catch (err: any) {
      console.error("Failed to load admin exam monitor", err);
      setError(err?.message || "Не удалось загрузить мониторинг экзаменов.");
      if (manual) setRefreshState("idle");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    if (successTimer.current) window.clearTimeout(successTimer.current);
  }, []);

  const cards = useMemo(() => [
    { key: "all" as const, label: "Всего", hint: "Экзамены за выбранный период", value: counts.all, icon: FileText, tone: "border-slate-200 bg-slate-50 text-slate-700" },
    { key: "active" as const, label: "Идут сейчас", hint: "С активными попытками", value: counts.active, icon: Radio, tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
    { key: "lobby" as const, label: "Лобби открыто", hint: "Урок идёт, ученики могут входить", value: counts.lobby, icon: Users, tone: "border-amber-100 bg-amber-50 text-amber-800" },
    { key: "scheduled" as const, label: "Запланированы", hint: "Урок ещё не начался", value: counts.scheduled, icon: CalendarDays, tone: "border-sky-100 bg-sky-50 text-sky-800" },
    { key: "closed" as const, label: "Завершены", hint: "Завершённые за период", value: counts.closed, icon: CheckCircle2, tone: "border-blue-100 bg-blue-50 text-blue-700" },
    { key: "changes" as const, label: "Переносы и отмены", hint: "Изменения расписания", value: counts.changes, icon: AlertTriangle, tone: "border-violet-100 bg-violet-50 text-violet-700" },
  ], [counts]);

  const chooseFilter = (next: Filter) => {
    setFilter(next);
    // A live state is only meaningful now, so the visible period resets too.  «Запланированы» are later days (#159 E4): under «Сегодня» they would vanish, so the period goes to «Все».
    if (next === "active" || next === "lobby") setPeriod("today");
    if (next === "scheduled") setPeriod("all");
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" /></div>;

  if (error && items.length === 0) return (
    <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
      <h1 className="text-lg font-bold text-slate-900">Мониторинг экзаменов временно недоступен</h1>
      <p className="mt-2 text-sm text-slate-500">{error}</p>
      <button type="button" onClick={() => void load({ manual: true })} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"><RefreshCw className="h-4 w-4" /> Повторить</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold text-primary-600">Операционный контроль</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Экзамены организации</h1></div>
        <button type="button" onClick={() => void load({ manual: true })} disabled={refreshState === "loading"} className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all disabled:cursor-wait ${refreshState === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {refreshState === "success" ? <CheckCircle2 className="h-4 w-4" /> : <RefreshCw className={`h-4 w-4 ${refreshState === "loading" ? "animate-spin" : ""}`} />}
          {refreshState === "loading" ? "Обновляем…" : refreshState === "success" ? "Обновлено" : "Обновить"}
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {cards.map(({ key, label, hint, value, icon: Icon, tone }) => <button key={key} type="button" onClick={() => chooseFilter(key)} className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${filter === key ? "ring-2 ring-primary-200" : ""} ${tone}`}><div className="flex items-start justify-between"><span className="rounded-xl bg-white/75 p-2 shadow-sm"><Icon className="h-5 w-5" /></span><strong className="text-3xl leading-none">{value}</strong></div><p className="mt-4 text-sm font-bold">{label}</p><p className="mt-0.5 text-xs opacity-75">{hint}</p></button>)}
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"><span className="inline-flex items-center gap-2 px-2 text-sm font-semibold text-slate-500"><CalendarDays className="h-4 w-4 text-primary-600" /> Период</span><div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{periods.map(({ key, label }) => <button key={key} type="button" onClick={() => setPeriod(key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${period === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</div>{(filter === "active" || filter === "lobby") && <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-400 sm:inline-flex"><History className="h-3.5 w-3.5" /> Текущий статус</span>}</section>

      {error && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>{error}</span><button type="button" onClick={() => void load({ manual: true })} className="shrink-0 font-semibold underline">Повторить</button></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 px-6 py-4"><h2 className="font-bold text-slate-900">Экзамены</h2><p className="mt-0.5 text-sm text-slate-500">{shownTotal} {shownTotal === 1 ? "запись" : shownTotal < 5 ? "записи" : "записей"} по выбранному фильтру</p></div>{shownItems.length === 0 ? <div className="px-6 py-16 text-center"><FileText className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 font-bold text-slate-800">Нет экзаменов в выбранном контексте</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Измените период или статус — история проведения, завершения и переноса появится здесь.</p></div> : <div className="divide-y divide-slate-100">{shownItems.map((exam) => {
        const examState = stateOf(exam);
        const dayLabel = exam.scheduled_lesson_date ? formatIsoDateLabel(exam.scheduled_lesson_date, { weekday: "short", day: "numeric", month: "short" }) : "";
        const status = exam.status === "lobby" ? { label: lobbyExamLabel(examState, dayLabel), tone: STATE_TONE[examState] ?? "warn" } : examStatusView(exam.status);
        const details = rowDetails(exam);
        const latestChange = latestEvent(exam, ["lesson_cancelled", "lesson_rescheduled", "exam_rescheduled"]);
        return <article key={exam.exam_id} className="flex flex-col gap-4 px-6 py-5 transition-colors hover:bg-slate-50/70 xl:flex-row xl:items-center"><div className="flex min-w-0 flex-1 gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><FileText className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-900">{exam.title}</h3><Chip tone={status.tone} pill>{status.label}</Chip></div><p className="mt-1 text-sm font-medium text-slate-600">{exam.group_name || "Группа не выбрана"}{exam.class_level ? ` · ${exam.class_level} класс` : ""}</p>{(details.primary || details.secondary) && <div className={`mt-2 flex items-start gap-2 text-sm ${details.warning ? "text-amber-800" : "text-slate-500"}`}>{details.warning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />}<div>{details.primary && <p>{details.primary}</p>}{details.secondary && <p className="mt-0.5 text-xs opacity-80">{details.secondary}</p>}</div></div>}</div></div><div className="flex shrink-0 items-center justify-between gap-5 xl:justify-end">{latestChange?.at && <p className="text-right text-xs text-slate-400">Изменено: {formatEventTime(latestChange.at)}</p>}<Link href={`/admin/exams/${exam.exam_id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"><Eye className="h-4 w-4" /> Просмотреть <ChevronRight className="h-4 w-4" /></Link></div></article>;
      })}</div>}{listState && items.length < total && <div className="border-t border-slate-100 px-6 py-4 text-center"><button type="button" onClick={() => void load({ append: true, offset: items.length })} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"><History className={`h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} /> {loadingMore ? "Загружаем…" : "Показать ещё"}</button></div>}</section>
    </div>
  );
}
