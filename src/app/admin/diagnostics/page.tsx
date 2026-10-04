"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import {
  Plus, Search, Brain, Copy, Check,
  Clock, UserPlus, ExternalLink,
  Sparkles, Users, User, Calendar, RotateCcw, X, AlertTriangle,
} from "lucide-react";
import Link from "next/link";

interface DiagnosticInvite {
  id: string;
  code: string;
  student_id: string | null;
  student_name: string;
  class_level: number;
  diagnostic_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  session_id?: string | null;
  student_status?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  is_assigned?: boolean;
  result?: {
    theta?: number | null;
    accuracy?: number | null;
    recommended_level?: string | null;
    total_questions?: number;
    correct_answers?: number;
  } | null;
}

export default function AdminDiagnosticsPage() {
  const [invites, setInvites] = useState<DiagnosticInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [timePeriod, setTimePeriod] = useState<string>("all");
  const [assignedOnly, setAssignedOnly] = useState<boolean>(false);
  const [search, setSearch] = useState("");

  const loadInvites = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await orgApi.listDiagnostics();
      setInvites(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load diagnostics:", err);
      setLoadError(err?.message || "Не удалось загрузить диагностики. Проверьте подключение и повторите попытку.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvites();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadInvites();
      }
    };
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadInvites]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyLink = (code: string) => {
    const url = window.location.origin + "/d/" + code;
    navigator.clipboard.writeText(url);
    setCopiedCode("link-" + code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
    pending: { label: "Ожидает подтверждения", color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
    confirmed: { label: "Готов к началу", color: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
    in_progress: { label: "Проходит тест", color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-400" },
    completed: { label: "Завершён", color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
    expired: { label: "Истёк", color: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400" },
  };

  const typeLabels: Record<string, string> = {
    initial: "Первичная",
    recheck: "Повторная",
    pre_exam: "Предэкзаменационная",
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const matchesTimePeriod = (inv: DiagnosticInvite, period: string) => {
    if (period === "all") return true;
    const dateStr = inv.completed_at || inv.started_at || inv.created_at;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

    if (period === "today") {
      return isSameDay(d, now);
    }
    if (period === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return isSameDay(d, yesterday);
    }
    if (period === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      return d >= weekAgo;
    }
    if (period === "month") {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      monthAgo.setHours(0, 0, 0, 0);
      return d >= monthAgo;
    }
    return true;
  };

  const periodInvites = invites.filter((inv) => matchesTimePeriod(inv, timePeriod));

  const assignedCount = periodInvites.filter(
    (i) => i.is_assigned || i.group_id || i.student_status === "active"
  ).length;

  const filtered = periodInvites.filter((inv) => {
    const isAssigned = inv.is_assigned || !!inv.group_id || inv.student_status === "active";
    if (assignedOnly && !isAssigned) return false;
    if (filter === "awaiting_start") {
      if (!["pending", "confirmed"].includes(inv.status)) return false;
    } else if (filter === "completed") {
      if (inv.status !== "completed" || isAssigned) return false;
    } else if (filter !== "all" && inv.status !== filter) {
      return false;
    }
    if (
      search &&
      !inv.student_name.toLowerCase().includes(search.toLowerCase()) &&
      !inv.code.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const counts = {
    all: periodInvites.length,
    awaiting_start: periodInvites.filter((i) => ["pending", "confirmed"].includes(i.status)).length,
    in_progress: periodInvites.filter((i) => i.status === "in_progress").length,
    completed: periodInvites.filter(
      (i) => i.status === "completed" && !(i.is_assigned || !!i.group_id || i.student_status === "active")
    ).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-white rounded-2xl border border-rose-100 p-8 text-center shadow-sm">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
        <h1 className="text-lg font-bold text-slate-900">Диагностики временно недоступны</h1>
        <p className="text-sm text-slate-500 mt-2">{loadError}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadInvites(); }}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Повторить
        </button>
      </div>
    );
  }

  const filterKey = (label: string) => {
    if (label === "Всего") return "all";
    if (label === "Ожидают старта") return "awaiting_start";
    if (label === "Проходят") return "in_progress";
    return "completed";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Диагностика</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Создавайте диагностики, отслеживайте результаты и зачисляйте учеников
          </p>
        </div>
        <Link
          href="/admin/students/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" /> Новая диагностика
        </Link>
      </div>


      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Всего", value: counts.all, icon: Brain, color: "text-blue-500", bg: "bg-blue-500/10", glow: "group-hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]", chartGlow: "from-blue-500 to-cyan-500", chart: [40, 70, 45, 90, 65, 85] },
          { label: "Ожидают старта", value: counts.awaiting_start, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", glow: "group-hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.3)]", chartGlow: "from-amber-500 to-orange-500", chart: [20, 40, 35, 60, 80, 100] },
          { label: "Проходят", value: counts.in_progress, icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10", glow: "group-hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)]", chartGlow: "from-purple-500 to-pink-500", chart: [60, 50, 40, 30, 20, 10] },
          { label: "Ждут распределения", value: counts.completed, icon: Check, color: "text-emerald-500", bg: "bg-emerald-500/10", glow: "group-hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)]", chartGlow: "from-emerald-500 to-teal-500", chart: [30, 50, 80, 60, 90, 100] },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => {
              setFilter(filterKey(stat.label));
              setAssignedOnly(false);
            }}
            className={`relative overflow-hidden text-left p-5 rounded-[2rem] transition-all duration-300 ease-out group ${stat.glow} ${
              filter === filterKey(stat.label) && !assignedOnly
                ? "bg-white ring-1 ring-slate-200/50 shadow-sm"
                : "bg-white/60 hover:bg-white"
            }`}
          >
            {/* Giant watermark icon */}
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-all duration-300 ease-out transform group-hover:scale-110 group-hover:-rotate-6 pointer-events-none">
              <stat.icon className={`w-28 h-28 ${stat.color}`} />
            </div>

            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg} group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <span className={`text-xs font-bold tracking-wider uppercase ${filter === filterKey(stat.label) && !assignedOnly ? "text-primary-700" : "text-slate-500"}`}>
                  {stat.label}
                </span>
              </div>
              
              <div className="flex items-end justify-between">
                <span className="text-4xl font-bold text-slate-800 tracking-tight tabular-nums">
                  {stat.value}
                </span>
                
                {/* Mini chart visualizer */}
                <div className="w-12 h-6 flex items-end gap-1 opacity-40 group-hover:opacity-80 transition-opacity duration-300">
                  {stat.chart.map((h, j) => (
                    <motion.div 
                      key={j} 
                      initial={{ height: "10%" }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.4, delay: j * 0.05, ease: "easeOut" }}
                      className={`w-1 rounded-t-sm bg-gradient-to-t ${stat.chartGlow}`} 
                    />
                  ))}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search & Period Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по имени или коду..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right side controls: Time period pills + custom date + Assigned filter */}
        <div className="flex min-w-0 items-center gap-2 flex-wrap">
          {/* Time period segmented control */}
          <div className="flex max-w-full min-w-0 flex-wrap items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/60 text-xs font-medium gap-0.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5 shrink-0" />
            {[
              { id: "all", label: "Все" },
              { id: "today", label: "Сегодня" },
              { id: "yesterday", label: "Вчера" },
              { id: "week", label: "7 дней" },
              { id: "month", label: "30 дней" },
            ].map((tp) => (
              <button
                key={tp.id}
                type="button"
                onClick={() => setTimePeriod(tp.id)}
                className={`px-3 py-1.5 rounded-lg transition-all text-xs cursor-pointer ${
                  timePeriod === tp.id
                    ? "bg-white text-slate-900 font-semibold shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tp.label}
              </button>
            ))}
          </div>

          {/* Reset button if active filter */}
          {(timePeriod !== "all" || filter !== "all" || assignedOnly || search) && (
            <button
              type="button"
              onClick={() => {
                setTimePeriod("all");
                setFilter("all");
                setAssignedOnly(false);
                setSearch("");
              }}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
              title="Сбросить все фильтры"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Отдельная кнопка-раздел: Зачислены в группу */}
          <button
            type="button"
            onClick={() => {
              setAssignedOnly((prev) => {
                if (!prev) setFilter("all");
                return !prev;
              });
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0 cursor-pointer ${
              assignedOnly
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/25"
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-500/50 hover:text-emerald-700 shadow-xs"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Зачислены</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                assignedOnly
                  ? "bg-emerald-700/60 text-white"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
              }`}
            >
              {assignedCount}
            </span>
          </button>
        </div>
      </div>

      {/* Cards list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <Brain className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600 font-medium">
            {assignedOnly
              ? "Нет зачисленных в группу учеников"
              : timePeriod !== "all" || search
              ? "Нет диагностик по выбранным фильтрам"
              : "Нет диагностик"}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {assignedOnly
              ? "После завершения диагностики распределите учеников в группы"
              : timePeriod !== "all" || search
              ? "Попробуйте выбрать другой период времени или сбросить фильтры"
              : "Нажмите «Новая диагностика» чтобы начать"}
          </p>
          {(timePeriod !== "all" || search || filter !== "all" || assignedOnly) && (
            <button
              onClick={() => {
                setTimePeriod("all");
                setFilter("all");
                setAssignedOnly(false);
                setSearch("");
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const isCompleted = inv.status === "completed";
            const isAssigned = inv.is_assigned || !!inv.group_id || inv.student_status === "active";
            const currentStatus = isAssigned
              ? { label: "Зачислен", color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" }
              : (statusConfig[inv.status] || statusConfig.pending);

            return (
              <div
                key={inv.id}
                data-testid="diagnostic-card"
                className="bg-white rounded-xl p-4 transition-all hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  {/* Avatar */}
                  {inv.student_id ? (
                    <Link
                      href={`/admin/students/${inv.student_id}`}
                      className={
                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 hover:opacity-80 transition-opacity " +
                        (isCompleted
                          ? "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700"
                          : "bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700")
                      }
                      title="Открыть профиль ученика"
                    >
                      {inv.student_name.charAt(0).toUpperCase()}
                    </Link>
                  ) : (
                    <div
                      className={
                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 " +
                        (isCompleted
                          ? "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700"
                          : "bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700")
                      }
                    >
                      {inv.student_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {inv.student_id ? (
                        <Link
                          href={`/admin/students/${inv.student_id}`}
                          className="max-w-full min-w-0 break-words font-semibold text-slate-900 hover:text-primary-600 transition-colors"
                        >
                          {inv.student_name}
                        </Link>
                      ) : (
                        <span className="max-w-full min-w-0 break-words font-semibold text-slate-900">{inv.student_name}</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {inv.class_level} класс
                      </span>
                      <span className="text-xs text-slate-400">
                        {typeLabels[inv.diagnostic_type] || inv.diagnostic_type}
                      </span>
                      {isAssigned && inv.group_name && (
                        <span className="max-w-full min-w-0 text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60 flex items-center gap-1">
                          <Users className="w-3 h-3 shrink-0 text-emerald-600" />
                          <span className="min-w-0 break-words">Группа: «{inv.group_name}»</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                      <code className="text-xs font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                        {inv.code}
                      </code>
                      <span className="text-xs text-slate-400">
                        {new Date(inv.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>



                  {/* Status + Actions — adaptive flex column/row */}
                  <div className="flex w-full min-w-0 flex-wrap items-center gap-2 justify-end lg:ml-auto lg:w-auto lg:max-w-[50%]">
                    <div
                      data-testid="diagnostic-status"
                      className={
                        "flex max-w-full min-w-0 items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-normal text-center " +
                        currentStatus.color
                      }
                    >
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + currentStatus.dot} />
                      <span className="min-w-0 break-words">{currentStatus.label}</span>
                    </div>

                    {inv.status === "pending" && (
                      <button
                        onClick={() => copyLink(inv.code)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors whitespace-nowrap"
                        title="Скопировать ссылку для ученика"
                      >
                        {copiedCode === "link-" + inv.code ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Скопировано
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-3.5 h-3.5" /> Ссылка
                          </>
                        )}
                      </button>
                    )}

                    {isCompleted && !isAssigned && (
                      <Link
                        href={`/admin/diagnostics/${inv.id}/report`}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Отчёт
                      </Link>
                    )}

                    {isAssigned && inv.student_id && (
                      <Link
                        href={`/admin/students/${inv.student_id}`}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors whitespace-nowrap w-[110px]"
                      >
                        <User className="w-3.5 h-3.5 text-slate-500" /> Профиль
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
