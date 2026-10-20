"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  Users, GraduationCap, Brain,
  Activity, Calendar, MapPin, Building,
  AlertCircle, Trophy, Shield
} from "lucide-react";
import { businessGreeting, formatBusinessDateLabel } from "@/lib/business-time";
import { isAtRisk } from "@/lib/diagnostic-level";
import { centreTheta, splitDashboardGroups } from "@/lib/owner-overview";

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
  diagnosed_count: number;
  avg_theta: number | null;
}

export default function OwnerDashboard() {
  const { org, user } = useAuthStore();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [serverTheta, setServerTheta] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, overviewData] = await Promise.all([
          orgApi.stats(),
          orgApi.groupsOverview().catch(() => null),
        ]);
        setStats(statsData as OrgStats);
        if (overviewData?.groups) {
          setGroups(overviewData.groups);
          setServerTheta(overviewData.avg_theta);
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

  // The greeting and the date follow the centre's clock (Tashkent), not the browser's.
  const greeting = businessGreeting();

  // Average θ over the diagnosed students of all groups; null (shown as «—») when nobody is diagnosed.
  const globalTheta = centreTheta({ groups, avg_theta: serverTheta });
  const globalAtRisk = globalTheta !== null && isAtRisk({ theta: globalTheta });

  // Smart Lists: leaders (above the centre average) and risk (θ < -0.5, level policy) never share a group.
  const { leaders: topGroups, risk: riskGroups, withData, comparable } = splitDashboardGroups(groups, globalTheta);

  // 4 Core KPIs — real values only. No trend/delta shown: there is no
  // historical snapshot to compute a real "+12%"-style change against, and
  // a fabricated one would misrepresent real business data.
  const statCards = [
    { label: "Всего учеников", value: stats?.total_students || 0, icon: Users, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Сотрудников", value: stats?.total_members || 0, icon: Shield, color: "from-violet-500 to-purple-600", bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Пройдено диагностик", value: stats?.completed_diagnostics || 0, icon: Brain, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", iconColor: "text-amber-600" },
    {
      label: "Средний уровень (θ)",
      value: globalTheta === null ? "—" : globalTheta > 0 ? `+${globalTheta.toFixed(2)}` : globalTheta.toFixed(2),
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
            {formatBusinessDateLabel({ weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
                <span className="text-xs font-semibold text-white/90">
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

      {/* Smart Lists (Top & At-Risk) — real data from the monolith (orgApi.groupsOverview),
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
                <p className="text-sm">{withData === 0 ? "Нет данных для анализа" : !comparable ? "Мало данных для сравнения" : "Нет групп выше среднего уровня"}</p>
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
                <p className="text-sm">{withData === 0 ? "Нет данных для анализа" : "Нет отстающих групп. Отлично!"}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
