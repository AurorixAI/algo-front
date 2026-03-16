"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi, analyticsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  Users, GraduationCap, Brain, TrendingUp,
  BarChart3, AlertTriangle, Plus, Settings,
  ArrowRight, RefreshCw, Shield, Activity,
  Calendar, Clock,
} from "lucide-react";
import Link from "next/link";

interface OrgStats {
  total_students: number;
  total_groups: number;
  total_members: number;
  active_diagnostics: number;
  completed_diagnostics: number;
  new_students: number;
}

interface GroupSummary {
  group_id: string;
  name: string;
  class_level: number | null;
  student_count: number;
  avg_theta: number | null;
}

export default function OwnerDashboard() {
  const { org, user } = useAuthStore();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, overviewData] = await Promise.all([
          orgApi.stats(),
          analyticsApi.orgOverview().catch(() => null),
        ]);
        setStats(statsData as OrgStats);
        if (overviewData?.groups) {
          setGroups(overviewData.groups);
        }
      } catch (err) {
        console.error("Failed to load owner dashboard:", err);
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

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Доброе утро" : now.getHours() < 18 ? "Добрый день" : "Добрый вечер";

  const statCards = [
    { label: "Учеников", value: stats?.total_students || 0, icon: Users, color: "from-blue-500 to-blue-600", bg: "bg-blue-50" },
    { label: "Групп", value: stats?.total_groups || 0, icon: GraduationCap, color: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50" },
    { label: "Сотрудников", value: stats?.total_members || 0, icon: Shield, color: "from-violet-500 to-violet-600", bg: "bg-violet-50" },
    { label: "Завершённых диагностик", value: stats?.completed_diagnostics || 0, icon: Brain, color: "from-amber-500 to-amber-600", bg: "bg-amber-50" },
    { label: "Новые ученики", value: stats?.new_students || 0, icon: TrendingUp, color: "from-rose-500 to-rose-600", bg: "bg-rose-50" },
    { label: "Активных тестов", value: stats?.active_diagnostics || 0, icon: Activity, color: "from-cyan-500 to-cyan-600", bg: "bg-cyan-50" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-3xl font-bold text-slate-900"
          >
            {greeting}, {user?.first_name || "Владелец"}!
          </motion.h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/owner/settings">
            <button className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <Settings className="w-4 h-4" /> Настройки
            </button>
          </Link>
        </div>
      </div>

      {/* Org banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-6 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <h2 className="text-xl font-bold">{org?.name || "Моя организация"}</h2>
          <p className="text-white/70 text-sm mt-1">
            {org?.city ? `${org.city} · ` : ""}Тип: {org?.org_type === "private_school" ? "Частная школа" : org?.org_type === "tutoring_center" ? "Репетиторский центр" : org?.org_type || "—"} · Статус: {org?.status === "active" ? "Активна" : org?.status || "—"}
          </p>
          <div className="flex gap-6 mt-4">
            <div>
              <p className="text-2xl font-bold">{stats?.total_students || 0}</p>
              <p className="text-white/60 text-xs">учеников</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.total_members || 0}</p>
              <p className="text-white/60 text-xs">сотрудников</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.total_groups || 0}</p>
              <p className="text-white/60 text-xs">групп</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { href: "/owner/teachers", icon: Plus, label: "Пригласить сотрудника", primary: true },
          { href: "/owner/groups", icon: GraduationCap, label: "Управление группами" },
          { href: "/owner/analytics", icon: BarChart3, label: "Аналитика организации" },
          { href: "/owner/settings", icon: Settings, label: "Настройки" },
        ].map((action, i) => (
          <motion.div key={action.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
            <Link href={action.href}>
              <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all cursor-pointer ${
                action.primary
                  ? "bg-primary-600 text-white border-primary-600 hover:bg-primary-700"
                  : "bg-white text-slate-700 border-slate-200 hover:border-primary-300 hover:bg-primary-50"
              }`}>
                <action.icon className="w-5 h-5" />
                <span className="text-sm font-medium text-center">{action.label}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Groups table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Группы организации</h2>
            <p className="text-sm text-slate-400 mt-0.5">{groups.length} групп</p>
          </div>
          <Link href="/owner/groups" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            Все группы <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-sm text-slate-500">
                <th className="px-6 py-3 font-medium">Название</th>
                <th className="px-6 py-3 font-medium">Класс</th>
                <th className="px-6 py-3 font-medium">Учеников</th>
                <th className="px-6 py-3 font-medium">Ср. уровень (θ)</th>
                <th className="px-6 py-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p className="text-slate-400 mb-2">Нет групп</p>
                    <Link href="/owner/groups" className="text-primary-600 text-sm hover:underline">
                      Создать первую группу →
                    </Link>
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.group_id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{g.name}</td>
                    <td className="px-6 py-4 text-slate-600">{g.class_level || "—"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        <Users className="w-3 h-3" /> {g.student_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {g.avg_theta !== null ? (
                        <span className={`font-mono text-sm font-medium ${
                          g.avg_theta >= 1 ? "text-emerald-600" :
                          g.avg_theta >= 0 ? "text-amber-600" : "text-red-600"
                        }`}>
                          θ = {g.avg_theta.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">Нет данных</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Активна
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
