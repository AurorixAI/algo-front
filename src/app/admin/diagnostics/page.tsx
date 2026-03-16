"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import {
  Plus, Search, Brain, Copy, Check,
  Clock, UserPlus, ExternalLink,
  Sparkles,
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadInvites = useCallback(async () => {
    try {
      const data = await orgApi.listDiagnostics();
      setInvites(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load diagnostics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvites();
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
    pending: { label: "Ожидает", color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
    confirmed: { label: "Подтверждён", color: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
    in_progress: { label: "Проходит тест", color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-400" },
    completed: { label: "Завершён", color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
    expired: { label: "Истёк", color: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400" },
  };

  const typeLabels: Record<string, string> = {
    initial: "Первичная",
    recheck: "Повторная",
    pre_exam: "Предэкзаменационная",
  };

  const filtered = invites.filter((inv) => {
    if (filter !== "all" && inv.status !== filter) return false;
    if (search && !inv.student_name.toLowerCase().includes(search.toLowerCase()) && !inv.code.includes(search))
      return false;
    return true;
  });

  const counts = {
    all: invites.length,
    pending: invites.filter((i) => i.status === "pending").length,
    in_progress: invites.filter((i) => i.status === "in_progress").length,
    completed: invites.filter((i) => i.status === "completed").length,
  };

  const thetaToLevel = (theta: number | null | undefined): string => {
    if (theta == null) return "\u2014";
    if (theta >= 2) return "Высокий";
    if (theta >= 0.5) return "Выше среднего";
    if (theta >= -0.5) return "Средний";
    if (theta >= -2) return "Ниже среднего";
    return "Начальный";
  };

  const thetaColor = (theta: number | null | undefined): string => {
    if (theta == null) return "text-slate-400";
    if (theta >= 2) return "text-emerald-600";
    if (theta >= 0.5) return "text-blue-600";
    if (theta >= -0.5) return "text-amber-600";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const filterKey = (label: string) => {
    if (label === "Всего") return "all";
    if (label === "Ожидают") return "pending";
    if (label === "Проходят") return "in_progress";
    return "completed";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
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
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Всего", value: counts.all, icon: Brain, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Ожидают", value: counts.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Проходят", value: counts.in_progress, icon: Sparkles, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Завершены", value: counts.completed, icon: Check, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => setFilter(filterKey(stat.label))}
            className={
              "p-4 rounded-xl border transition-all text-left " +
              (filter === filterKey(stat.label)
                ? "border-primary-200 bg-primary-50/50 shadow-sm"
                : "border-slate-100 bg-white hover:border-slate-200")
            }
          >
            <div className="flex items-center justify-between mb-2">
              <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + stat.bg}>
                <stat.icon className={"w-4 h-4 " + stat.color} />
              </div>
              <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
            </div>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по имени или коду..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Cards list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <Brain className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-400">Нет диагностик</p>
          <p className="text-slate-400 text-sm mt-1">
            Нажмите &quot;Новая диагностика&quot; чтобы начать
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv, i) => {
            const sc = statusConfig[inv.status] || statusConfig.pending;
            const isCompleted = inv.status === "completed";
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl p-4 transition-all hover:shadow-sm"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
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

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{inv.student_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {inv.class_level} класс
                      </span>
                      <span className="text-xs text-slate-400">
                        {typeLabels[inv.diagnostic_type] || inv.diagnostic_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
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

                  {/* Result (if completed) */}
                  {isCompleted && inv.result && (
                    <div className="text-right mr-2">
                      <p className={"text-sm font-bold " + thetaColor(inv.result.theta)}>
                        {thetaToLevel(inv.result.theta)}
                      </p>
                      {inv.result.theta != null && (
                        <p className="text-[10px] text-slate-400">
                          theta: {inv.result.theta.toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Status + Actions — fixed-width right column */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <div
                      className={
                        "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap w-[110px] " +
                        sc.color
                      }
                    >
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + sc.dot} />
                      {sc.label}
                    </div>

                    {inv.status === "pending" && (
                        <button
                          onClick={() => copyLink(inv.code)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors whitespace-nowrap w-[110px]"
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
                    {isCompleted && (
                      <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap w-[110px]">
                        <UserPlus className="w-3.5 h-3.5" /> Зачислить
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
}
