"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi, analyticsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  Users, GraduationCap, Brain,
  Activity, Calendar, MapPin, Building,
  AlertCircle, Trophy, Clock, Video, Shield
} from "lucide-react";
import Link from "next/link";
import { FeatureLock } from "@/components/ui/feature-lock";
import { isAtRisk } from "@/lib/diagnostic-level";

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-500 animate-pulse">Анализ данных организации...</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Доброе утро" : now.getHours() < 18 ? "Добрый день" : "Добрый вечер";

  // Calculate global average theta across all groups
  const groupsWithTheta = groups.filter(g => g.avg_theta !== null);
  const globalTheta = groupsWithTheta.length > 0 
    ? groupsWithTheta.reduce((acc, g) => acc + (g.avg_theta || 0), 0) / groupsWithTheta.length 
    : 0;

  const globalAtRisk = isAtRisk({ theta: globalTheta });

  // Smart Lists
  const sortedGroups = [...groupsWithTheta].sort((a, b) => (b.avg_theta || 0) - (a.avg_theta || 0));
  const topGroups = sortedGroups.slice(0, 3);
  const riskGroups = sortedGroups.slice().reverse().slice(0, 3).filter(g => isAtRisk({ theta: g.avg_theta })); // level policy: below_grade, theta < -0.5

  // 4 Core KPIs — real values only. No trend/delta shown: there is no
  // historical snapshot to compute a real "+12%"-style change against, and
  // a fabricated one would misrepresent real business data.
  const statCards = [
    { label: "Всего учеников", value: stats?.total_students || 0, icon: Users, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Сотрудников", value: stats?.total_members || 0, icon: Shield, color: "from-violet-500 to-purple-600", bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Пройдено диагностик", value: stats?.completed_diagnostics || 0, icon: Brain, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", iconColor: "text-amber-600" },
    {
      label: "Средний уровень (θ)",
      value: globalTheta > 0 ? `+${globalTheta.toFixed(2)}` : globalTheta.toFixed(2),
      icon: Activity,
      color: !globalAtRisk ? "from-emerald-400 to-emerald-600" : "from-rose-400 to-red-500",
      bg: !globalAtRisk ? "bg-emerald-50" : "bg-rose-50",
      iconColor: !globalAtRisk ? "text-emerald-600" : "text-rose-600"
    },
  ];

  return (
    <div className="space-y-8 w-full max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold tracking-tight text-slate-900"
          >
            {greeting}, {user?.first_name || "Владелец"}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 mt-1.5 flex items-center gap-2 text-sm font-medium"
          >
            <Calendar className="w-4 h-4 text-slate-400" />
            {now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </motion.p>
        </div>
      </div>

      {/* Unified Premium Hero Block */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] bg-slate-900 shadow-2xl shadow-slate-900/10 border border-slate-800"
      >
        {/* Decorative Glowing Orbs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary-500/20 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/3 mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 mix-blend-screen pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

        <div className="relative z-10 p-8 md:p-10 flex flex-col gap-8 md:gap-10">
          
          {/* Org Info Section */}
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-5 shadow-inner">
                <span className={`w-2 h-2 rounded-full ${org?.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                <span className="text-xs font-semibold tracking-wide text-white/90 uppercase">
                  {org?.status === "active" ? "Система активна" : "Ожидание"}
                </span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-4 drop-shadow-sm">
                {org?.name || "Моя организация"}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-slate-300 text-sm font-medium">
                {org?.city && (
                  <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 backdrop-blur-sm">
                    <MapPin className="w-4 h-4 text-slate-400" /> {org.city}
                  </span>
                )}
                <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 backdrop-blur-sm">
                  <Building className="w-4 h-4 text-slate-400" /> 
                  {org?.org_type === "private_school" ? "Частная школа" : org?.org_type === "tutoring_center" ? "Репетиторский центр" : org?.org_type || "Не указан"}
                </span>
              </div>
            </div>
          </div>

          {/* Integrated KPIs Grid (Glassmorphism) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="group relative bg-white/5 hover:bg-white/10 rounded-2xl p-5 border border-white/10 backdrop-blur-md transition-all duration-300 overflow-hidden"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/5`}>
                    <card.icon className={`w-5 h-5 text-slate-200 group-hover:text-white transition-colors`} />
                  </div>
                </div>
                <div>
                  <p className="text-3xl font-semibold text-white tracking-tight">{card.value}</p>
                  <p className="text-sm font-medium text-slate-400 mt-1">{card.label}</p>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </motion.div>

      {/* Smart Lists (Top & At-Risk) — real data from analyticsApi.orgOverview(),
          no reason to hide this behind a "coming soon" lock. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Top Performers */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-[1.5rem] p-6 lg:p-8 border border-slate-200/60 shadow-sm flex flex-col h-full w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Лидеры успеваемости</h3>
              <p className="text-sm font-medium text-slate-500">Группы с высшим средним баллом</p>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            {topGroups.length > 0 ? topGroups.map((g, i) => (
              <div key={g.group_id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100 hover:bg-emerald-50/30 hover:border-emerald-100 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-400">#{i + 1}</span>
                    <p className="font-semibold text-slate-900 line-clamp-1">{g.name}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {g.student_count} уч.</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl text-sm">
                    θ = {g.avg_theta?.toFixed(2)}
                  </p>
                </div>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                <GraduationCap className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Нет данных для анализа</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* At-Risk Groups */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-[1.5rem] p-6 lg:p-8 border border-slate-200/60 shadow-sm flex flex-col h-full w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Зоны риска</h3>
              <p className="text-sm font-medium text-slate-500">Группы, требующие внимания</p>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            {riskGroups.length > 0 ? riskGroups.map((g) => (
              <div key={g.group_id} className="flex items-center justify-between p-4 rounded-2xl bg-rose-50/30 border border-rose-100/50 hover:bg-rose-50 hover:border-rose-200 transition-colors">
                <div>
                  <p className="font-semibold text-slate-900 line-clamp-1">{g.name}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {g.student_count} уч.</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-rose-600 bg-white px-3 py-1.5 rounded-xl text-sm shadow-sm border border-rose-100">
                    θ = {g.avg_theta?.toFixed(2)}
                  </p>
                </div>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                <Shield className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Нет отстающих групп. Отлично!</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Full-width Live Classes Board — no lesson/schedule module exists yet,
          so this stays locked with an honest empty state (no invented names). */}
      <FeatureLock
        title="Уроки сейчас"
        description="Модуль откроется после завершения 1-2 этапа подключения центра."
      >
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white rounded-[1.5rem] border border-slate-200/60 shadow-sm flex flex-col overflow-hidden w-full">
          <div className="p-6 md:p-8 md:pr-28 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
                </span>
                Уроки сейчас
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-1">Актуальное расписание занятий в реальном времени</p>
            </div>
            <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-xl border border-slate-200 shadow-sm">
              <Clock className="w-5 h-5 text-slate-400" />
              <span className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                {now.getHours()}:{now.getMinutes().toString().padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="p-10 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30">
            <Video className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Откроется после этапов подключения</p>
          </div>
        </motion.div>
      </FeatureLock>
    </div>
  );
}
