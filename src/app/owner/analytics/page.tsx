"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { analyticsApi, orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { BarChart3, TrendingUp, Users, Brain } from "lucide-react";

export default function OwnerAnalyticsPage() {
  const { org } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [enrollment, setEnrollment] = useState<any[]>([]);
  const [problemSkills, setProblemSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, enr, ps] = await Promise.all([
          orgApi.stats().catch(() => null),
          analyticsApi.orgEnrollment(30).catch(() => []),
          analyticsApi.orgProblemSkills().catch(() => []),
        ]);
        setStats(s);
        setEnrollment(Array.isArray(enr) ? enr : (enr as any)?.days || []);
        setProblemSkills(Array.isArray(ps) ? ps : (ps as any)?.skills || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Аналитика</h1>
        <p className="text-slate-500 mt-1">Статистика и данные организации</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Учеников", value: stats?.total_students ?? 0, icon: Users, color: "from-blue-500 to-blue-600" },
          { label: "Групп", value: stats?.total_groups ?? 0, icon: BarChart3, color: "from-emerald-500 to-emerald-600" },
          { label: "Диагностик", value: stats?.completed_diagnostics ?? 0, icon: Brain, color: "from-violet-500 to-violet-600" },
          { label: "Новые за неделю", value: stats?.new_students ?? 0, icon: TrendingUp, color: "from-amber-500 to-amber-600" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-sm text-slate-500">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Enrollment chart (simple bar representation) */}
      {enrollment.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Приём учеников (30 дней)</h2>
          <div className="flex items-end gap-1 h-32">
            {enrollment.slice(-30).map((day: any, i: number) => {
              const val = day.new_students || day.count || 0;
              const max = Math.max(...enrollment.map((d: any) => d.new_students || d.count || 0), 1);
              return (
                <div
                  key={i}
                  className="flex-1 bg-primary-400 rounded-t-sm min-h-[2px] transition-all hover:bg-primary-600"
                  style={{ height: `${(val / max) * 100}%` }}
                  title={`${day.day || day.date || ""}: ${val}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Problem skills */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Проблемные навыки</h2>
          <p className="text-sm text-slate-400 mt-1">Навыки, с которыми ученики испытывают трудности</p>
        </div>
        {problemSkills.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Недостаточно данных для аналитики</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {problemSkills.slice(0, 15).map((skill: any, i: number) => (
              <div key={skill.skill_id || i} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="font-medium text-slate-900 text-sm">{skill.skill_name || skill.skill_id}</p>
                  <p className="text-xs text-slate-400">
                    {skill.struggling_count || skill.gap_count || 0} учеников с пробелом
                  </p>
                </div>
                <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-red-400 rounded-full"
                    style={{
                      width: `${Math.min((skill.struggling_count || skill.gap_count || 0) / Math.max(skill.total_students || 1, 1) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
