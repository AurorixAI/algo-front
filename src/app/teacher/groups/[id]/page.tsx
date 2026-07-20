"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, BarChart2, Settings,
  GraduationCap, Loader2, Edit2, Check, X, Lock, Sparkles
} from "lucide-react";
import Link from "next/link";
import { orgApi, GroupDetail, GroupStats } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { GroupStudentTable } from "@/components/groups/group-student-table";
import { GroupStatsPanel } from "@/components/groups/group-stats-panel";
import { AttendanceJournal } from "@/components/groups/attendance-journal";
import { PhaseLockBanner } from "@/components/ui/phase-lock-banner";
import { BookOpen } from "lucide-react";

type Tab = "students" | "analytics" | "attendance";

export default function TeacherGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const groupId = params?.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [loading, setLoading] = useState(true);

  const tab = (searchParams?.get("tab") as Tab) || "students";
  const setTab = (newTab: Tab) => {
    router.replace(`?tab=${newTab}`, { scroll: false });
  };

  const canEdit = user?.org_role === "admin" || user?.org_role === "owner" || user?.role === "owner";

  const load = async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([
        orgApi.getGroup(groupId),
        orgApi.getGroupStats(groupId).catch(() => null),
      ]);
      setGroup(g);
      setStats(s);
    } catch {
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (groupId) load(); }, [groupId]);

  const handleRemoveStudent = async (studentId: string) => {
    if (!group) return;
    if (!confirm("Удалить ученика из группы?")) return;
    try {
      await orgApi.removeStudentFromGroup(groupId, studentId);
      setGroup((prev) => prev ? {
        ...prev,
        students: prev.students.filter((s) => s.id !== studentId),
        student_count: prev.student_count - 1,
      } : null);
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!group) return null;

  const existingIds = new Set(group.students.map((s) => s.id));
  const diagnosedCount = group.students.filter((s) => s.last_theta !== null).length;
  const diagPct = group.student_count > 0
    ? Math.round((diagnosedCount / group.student_count) * 100)
    : 0;

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/teacher/groups" className="hover:text-slate-900 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Группы
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{group.name}</span>
      </div>

      {/* Group header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      >
        {/* Color accent */}
        <div className="h-1.5 bg-gradient-to-r from-primary-500 via-primary-400 to-emerald-400" />

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                <GraduationCap className="w-7 h-7 text-primary-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{group.name}</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {group.class_level && `${group.class_level} класс · `}
                  {group.teacher_name ? `Учитель: ${group.teacher_name}` : "Учитель не назначен"}
                </p>
                {group.description && (
                  <p className="text-xs text-slate-400 mt-1">{group.description}</p>
                )}
              </div>
            </div>

            {canEdit && (
              <Link
                href={`/owner/groups/${groupId}`}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                title="Настройки группы"
              >
                <Settings className="w-4 h-4" />
              </Link>
            )}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-50">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{group.student_count}</p>
              <p className="text-xs text-slate-500 mt-0.5">Учеников</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary-600">{diagnosedCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Диагностировано</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">
                {stats?.avg_theta !== null && stats?.avg_theta !== undefined
                  ? stats.avg_theta.toFixed(2) : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Средний θ</p>
            </div>
          </div>

          {/* Progress bar */}
          {group.student_count > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Диагностировано</span>
                <span className="font-medium text-slate-700">{diagPct}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${diagPct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-400"
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: "students", label: "Ученики", Icon: Users },
          { key: "analytics", label: "Аналитика", Icon: BarChart2 },
          { key: "attendance", label: "Посещаемость", Icon: BookOpen },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === "students" && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <p className="font-semibold text-slate-900">
                Состав группы
                <span className="ml-2 text-sm font-normal text-slate-400">({group.student_count})</span>
              </p>
            </div>

            <GroupStudentTable
              students={group.students}
              onRemove={canEdit ? handleRemoveStudent : undefined}
              canRemove={canEdit}
            />
          </div>
        )}

        {tab === "analytics" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-semibold text-slate-900">Аналитика группы</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Раздел откроется после завершения этапов подключения центра.</p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-xs font-medium text-amber-800">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Доступ к разделу временно ограничен</span>
            </div>
          </motion.div>
        )}

        {tab === "attendance" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-semibold text-slate-900">Журнал посещаемости</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Раздел откроется после завершения этапов подключения центра.</p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-xs font-medium text-amber-800">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Доступ к разделу временно ограничен</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
