"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { analyticsApi } from "@/lib/api";
import {
  BarChart3, Users, TrendingUp, AlertTriangle, Activity,
  Clock, CheckCircle, UserPlus, GraduationCap, Zap,
} from "lucide-react";

interface ProblemSkill {
  skill_id: string;
  total_students: number;
  gap_count: number;
  struggling_count: number;
  avg_mastery: number;
  problem_rate: number;
}

interface QueueItem {
  id: string;
  code: string;
  student_name: string;
  class_level: number | null;
  status: string;
  diagnostic_type: string;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: { theta: number | null; accuracy: number | null; recommended_level: string | null } | null;
}

interface EnrollmentData {
  total_students: number;
  student_status_breakdown: Record<string, number>;
  class_level_distribution: Record<string, number>;
  new_students_daily: { day: string; count: number }[];
  diagnostics_daily: { day: string; total: number; completed: number }[];
}

interface LiveQueue {
  active: QueueItem[];
  active_count: number;
  recently_completed: QueueItem[];
  completed_today: number;
}

const qStatusConfig: Record<string, { label: string; color: string; dot: string }> = {
  pending:     { label: "Ожидает",       color: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-400" },
  confirmed:   { label: "Подтверждён",   color: "bg-blue-50 text-blue-700 border-blue-200",        dot: "bg-blue-400" },
  in_progress: { label: "Тестируется",   color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  completed:   { label: "Завершил",      color: "bg-slate-50 text-slate-600 border-slate-200",     dot: "bg-slate-400" },
};

export default function AdminAnalyticsPage() {
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [problemSkills, setProblemSkills] = useState<ProblemSkill[]>([]);
  const [queue, setQueue] = useState<LiveQueue | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [enr, ps, q] = await Promise.all([
        analyticsApi.orgEnrollment(30).catch(() => null),
        analyticsApi.orgProblemSkills().catch(() => ({ problem_skills: [] })),
        analyticsApi.orgLiveQueue().catch(() => null),
      ]);
      setEnrollment(enr);
      setProblemSkills(ps?.problem_skills || []);
      setQueue(q);
    } catch (e) {
      console.error("Analytics load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const totalStudents = enrollment?.total_students ?? 0;
  const statusBreakdown = enrollment?.student_status_breakdown ?? {};
  const classDist = enrollment?.class_level_distribution ?? {};
  const recentNewStudents = enrollment?.new_students_daily?.reduce((s, d) => s + d.count, 0) ?? 0;
  const recentDiag = enrollment?.diagnostics_daily?.reduce((s, d) => s + d.total, 0) ?? 0;
  const recentDiagCompleted = enrollment?.diagnostics_daily?.reduce((s, d) => s + d.completed, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Аналитика</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Обзор организации за последние 30 дней
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Всего учеников", value: totalStudents, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Новых за 30д", value: recentNewStudents, icon: UserPlus, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Диагностик", value: recentDiag, icon: Activity, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Завершено", value: recentDiagCompleted, icon: CheckCircle, color: "text-teal-600", bg: "bg-teal-50" },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-xl border border-slate-100 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + s.bg}>
                <s.icon className={"w-4 h-4 " + s.color} />
              </div>
              <span className="text-2xl font-bold text-slate-900">{s.value}</span>
            </div>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Class distribution + Status breakdown */}
        <div className="space-y-6">
          {/* Class level distribution */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Распределение по классам</h3>
            </div>
            {Object.keys(classDist).length === 0 ? (
              <p className="text-sm text-slate-400">Нет данных</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(classDist)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([level, count]) => {
                    const pct = totalStudents > 0 ? (count / totalStudents) * 100 : 0;
                    return (
                      <div key={level} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-600 w-16">{level} класс</span>
                        <div className="flex-1 h-6 bg-slate-50 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5 }}
                            className="h-full bg-primary-400 rounded-full"
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Status breakdown */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Статусы учеников</h3>
            </div>
            {Object.keys(statusBreakdown).length === 0 ? (
              <p className="text-sm text-slate-400">Нет данных</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(statusBreakdown).map(([status, count]) => (
                  <div key={status} className="p-3 rounded-lg bg-slate-50">
                    <p className="text-lg font-bold text-slate-900">{count}</p>
                    <p className="text-xs text-slate-500 capitalize">{status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Problem skills */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-slate-900 text-sm">Проблемные навыки</h3>
          </div>
          {problemSkills.length === 0 ? (
            <p className="text-sm text-slate-400">Проблемных навыков не обнаружено</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {problemSkills.map((sk, i) => (
                <motion.div
                  key={sk.skill_id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="p-3 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-600 truncate max-w-[180px]" title={sk.skill_id}>
                      {sk.skill_id}
                    </span>
                    <span className="text-xs font-bold text-red-500">{sk.problem_rate}%</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    <span className="text-red-500 font-medium">{sk.gap_count} gap</span>
                    <span className="text-amber-500 font-medium">{sk.struggling_count} strug.</span>
                    <span>из {sk.total_students}</span>
                    <span>&middot;</span>
                    <span>mastery {(sk.avg_mastery * 100).toFixed(0)}%</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Queue */}
      {queue && (
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Живая очередь</h3>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-600 font-medium">{queue.active_count} активных</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">{queue.completed_today} завершено за 24ч</span>
            </div>
          </div>

          {queue.active.length === 0 && queue.recently_completed.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Сейчас никто не тестируется</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {[...queue.active, ...queue.recently_completed].map((item, i) => {
                const qs = qStatusConfig[item.status] || qStatusConfig.pending;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-4 p-3 rounded-lg bg-slate-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-semibold shrink-0">
                      {item.student_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate block">{item.student_name}</span>
                      <span className="text-xs text-slate-400">
                        {item.class_level ? `${item.class_level} кл.` : ""} {item.diagnostic_type || ""}
                      </span>
                    </div>
                    {item.result?.theta != null && (
                      <span className="text-xs font-mono text-slate-600">
                        θ {item.result.theta.toFixed(2)}
                      </span>
                    )}
                    <span className={"flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border " + qs.color}>
                      <div className={"w-1.5 h-1.5 rounded-full " + qs.dot} />
                      {qs.label}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {item.started_at
                        ? new Date(item.started_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                        : item.created_at
                          ? new Date(item.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                          : ""}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
