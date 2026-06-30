"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import {
  Users, GraduationCap, Calendar as CalendarIcon,
  Clock, MapPin, Video, FileText, Activity, BookOpen,
  ArrowRight,
  TrendingUp,
  Award,
  Plus
} from "lucide-react";
import Link from "next/link";
import { orgApi } from "@/lib/api";

// --- MOCK DATA ---
const mockSchedule = [
  { id: "1", time: "14:00 - 16:00", title: "Группа Python-Dev", subtitle: "8-9 класс", type: "group", location: "Аудитория 3", color: "indigo" },
  { id: "2", time: "16:30 - 18:00", title: "Группа Olymps-Math", subtitle: "10-11 класс", type: "group", location: "Аудитория 1", color: "blue" },
  { id: "3", time: "18:15 - 19:15", title: "Индивидуальное занятие", subtitle: "Арслан И.", type: "individual", location: "Онлайн", color: "amber" },
];

const colorMap = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function TeacherDashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ groups: 0, students: 0 });

  useEffect(() => {
    async function load() {
      try {
        const groups = await orgApi.listGroups();
        // Just mock some basic stats
        setStats({
          groups: groups.length,
          students: groups.reduce((acc, g) => acc + g.student_count, 0),
        });
      } catch (err) {
        console.error("Failed to load teacher stats:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Доброе утро" : now.getHours() < 18 ? "Добрый день" : "Добрый вечер";
  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "Преподаватель";

  const statCards = [
    { label: "Мои группы", value: stats.groups || 0, icon: Users, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Мои ученики", value: stats.students || 0, icon: GraduationCap, color: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { label: "Уроков сегодня", value: mockSchedule.length, icon: CalendarIcon, color: "from-violet-500 to-purple-600", bg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Проверено работ", value: "12", icon: Award, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", iconColor: "text-amber-600" },
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
        {statCards.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="bg-white rounded-2xl p-5 border border-slate-100 hover:shadow-lg transition-all duration-300 relative overflow-hidden group"
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
        ))}
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
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center gap-4 cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  10A
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Olymps-Math</h3>
                  <p className="text-xs text-slate-500 mt-0.5">15 учеников • Уровень: Выше</p>
                </div>
              </div>
              <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center gap-4 cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                  9B
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Python-Dev</h3>
                  <p className="text-xs text-slate-500 mt-0.5">12 учеников • Уровень: Норма</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Schedule Widget) */}
        <div className="space-y-8">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">
                Расписание на сегодня
              </h2>
              <Link href="/teacher/schedule" className="text-sm font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1">
                Календарь
              </Link>
            </div>

            <div className="space-y-4">
              {mockSchedule.map((item) => (
                <div key={item.id} className="relative pl-6 py-2 group">
                  {/* Timeline line */}
                  <div className="absolute left-[11px] top-4 bottom-[-16px] w-[2px] bg-slate-100 group-last:hidden" />
                  {/* Timeline dot */}
                  <div className={`absolute left-[6px] top-[14px] w-3 h-3 rounded-full border-2 border-white shadow-sm z-10 ${item.color === "blue" ? "bg-blue-500" : item.color === "indigo" ? "bg-indigo-500" : "bg-amber-500"}`} />
                  
                  <div className={`p-4 rounded-2xl border ${colorMap[item.color as keyof typeof colorMap]} transition-colors`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 bg-white/60 rounded-md">
                        <Clock className="w-3.5 h-3.5" />
                        {item.time}
                      </div>
                    </div>
                    <h3 className="font-bold text-sm">{item.title}</h3>
                    <p className="text-xs font-medium opacity-80 mt-0.5">{item.subtitle}</p>
                    <div className="flex items-center gap-1.5 text-xs font-medium mt-3 opacity-70">
                      <MapPin className="w-3.5 h-3.5" />
                      {item.location}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-6 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 font-medium text-sm hover:border-slate-300 hover:text-slate-700 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              Добавить событие
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
