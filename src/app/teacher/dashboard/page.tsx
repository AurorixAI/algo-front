"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { GroupInfo } from "@/lib/api";
import {
  Users, GraduationCap, Calendar as CalendarIcon,
  FileText,
  ArrowRight,
  Award,
  Plus
} from "lucide-react";
import Link from "next/link";
import { orgApi } from "@/lib/api";
import { FeatureLock } from "@/components/ui/feature-lock";

export default function TeacherDashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ groups: 0, students: 0 });
  const [groups, setGroups] = useState<GroupInfo[]>([]);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        // Scoped to this teacher only — matches /teacher/groups. Without
        // teacher_id this used to count every group in the org, showing
        // numbers that disagreed with the teacher's own groups list.
        const fetchedGroups = await orgApi.listGroups({ teacher_id: user.id });
        setGroups(Array.isArray(fetchedGroups) ? fetchedGroups : []);
        setStats({
          groups: fetchedGroups.length,
          students: fetchedGroups.reduce((acc: number, g: GroupInfo) => acc + g.student_count, 0),
        });
      } catch (err) {
        console.error("Failed to load teacher stats:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Доброе утро" : now.getHours() < 18 ? "Добрый день" : "Добрый вечер";
  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "Преподаватель";

  const statCards = [
    { label: "Мои группы", value: stats.groups || 0, icon: Users, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Мои ученики", value: stats.students || 0, icon: GraduationCap, color: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50", iconColor: "text-emerald-600" },
    // No lesson-schedule or grading module exists yet — show "—" rather
    // than inventing a specific number.
    { label: "Уроков сегодня", value: "—", icon: CalendarIcon, color: "from-violet-500 to-purple-600", bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Проверено работ", value: "—", icon: Award, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", iconColor: "text-amber-600" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center animate-pulse">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {greeting}, {displayName}! 👋
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Вот ваша сводка на сегодня, {now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/teacher/exams/new"
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20 text-sm"
          >
            <FileText className="w-4 h-4" />
            Создать экзамен
          </Link>
        </div>
      </div>

      {/* 4 Core KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => {
          const cardContent = (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="bg-white rounded-2xl p-5 border border-slate-100 hover:shadow-lg transition-all duration-300 relative overflow-hidden group w-full h-full"
            >
              <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${s.color} rounded-full opacity-5 group-hover:scale-150 transition-transform duration-500`} />
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                  <s.icon className={`w-6 h-6 ${s.iconColor}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">{s.label}</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );

          if (i >= 2) {
            return (
              <FeatureLock
                key={i}
                variant="inline"
                title={s.label}
                description="Ожидает завершения этапов подключения"
                className="w-full h-full"
              >
                {cardContent}
              </FeatureLock>
            );
          }
          return <div key={i} className="w-full h-full">{cardContent}</div>;
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Main content) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Groups Quick Access */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary-500" />
                  Мои активные группы
                </h2>
              </div>
              <Link href="/teacher/groups" className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                Все группы <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            {groups.filter(g => g.status === "active").length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Нет активных групп
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {groups.filter(g => g.status === "active").slice(0, 4).map((group) => {
                  const colors = [
                    { bg: "bg-blue-100", text: "text-blue-600" },
                    { bg: "bg-indigo-100", text: "text-indigo-600" },
                    { bg: "bg-emerald-100", text: "text-emerald-600" },
                    { bg: "bg-amber-100", text: "text-amber-600" },
                  ];
                  const colorIdx = group.name.charCodeAt(0) % colors.length;
                  const c = colors[colorIdx];
                  const badge = group.class_level ? `${group.class_level}кл` : "—";

                  return (
                    <Link
                      key={group.id}
                      href={`/teacher/groups/${group.id}`}
                      className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-primary-200 transition-all flex items-center gap-4 group/card"
                    >
                      <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center ${c.text} font-bold text-sm shrink-0`}>
                        {badge}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate group-hover/card:text-primary-600 transition-colors">{group.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{group.student_count} учеников</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Schedule Widget) */}
        <div className="space-y-8">
          <FeatureLock
            title="Расписание на сегодня"
            description="Модуль откроется после завершения 1-2 этапа подключения центра."
          >
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 w-full">
              {/* pr-24 резервирует место под бейдж «Скоро» (absolute top-4 right-4),
                  чтобы ссылка «Календарь» не перекрывалась им */}
              <div className="flex items-center justify-between gap-3 mb-6 pr-24">
                <h2 className="text-xl font-bold text-slate-900">
                  Расписание на сегодня
                </h2>
                <Link href="/teacher/schedule" className="text-sm font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1 shrink-0">
                  Календарь
                </Link>
              </div>

              <div className="text-center py-8 text-slate-400 text-sm">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Откроется после этапов подключения
              </div>

              <button disabled className="w-full mt-6 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-medium text-sm cursor-not-allowed flex items-center justify-center gap-2 opacity-60">
                <Plus className="w-4 h-4" />
                Добавить событие
              </button>
            </div>
          </FeatureLock>
        </div>

      </div>
    </div>
  );
}
