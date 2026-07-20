"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, UserPlus, Users, BarChart2,
  GraduationCap, Loader2, Edit2, Check, X,
  Archive, Settings2
} from "lucide-react";
import Link from "next/link";
import { orgApi, GroupDetail, GroupStats, GroupInfo } from "@/lib/api";
import { GroupStudentTable } from "@/components/groups/group-student-table";
import { GroupStatsPanel } from "@/components/groups/group-stats-panel";
import { AttendanceJournal } from "@/components/groups/attendance-journal";
import { PhaseLockBanner } from "@/components/ui/phase-lock-banner";
import { BookOpen } from "lucide-react";

type Tab = "students" | "analytics" | "attendance" | "settings";

interface EditState {
  name: string;
  class_level: string;
  teacher_id: string;
  description: string;
  max_students: string;
}

const CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];

export default function OwnerGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = params?.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const tab = (searchParams?.get("tab") as Tab) || "students";
  const setTab = (newTab: Tab) => {
    router.replace(`?tab=${newTab}`, { scroll: false });
  };

  // Inline edit
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState>({
    name: "", class_level: "", teacher_id: "", description: "", max_students: "30",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s, m] = await Promise.all([
        orgApi.getGroup(groupId),
        orgApi.getGroupStats(groupId).catch(() => null),
        orgApi.listMembers().catch(() => []),
      ]);
      setGroup(g);
      setStats(s);
      setMembers(Array.isArray(m) ? m : []);
      setEditState({
        name: g.name,
        class_level: String(g.class_level ?? ""),
        teacher_id: g.teacher_id ?? "",
        description: g.description ?? "",
        max_students: String(g.max_students),
      });
    } catch {
      router.push("/owner/groups");
    } finally {
      setLoading(false);
    }
  }, [groupId, router]);

  useEffect(() => { if (groupId) load(); }, [load]);

  const teachers = members.filter((m: any) => m.org_role === "teacher").map((m: any) => ({
    id: m.user_id || m.id,
    name: m.full_name || `${m.first_name || ""} ${m.last_name || ""}`.trim(),
  }));

  const handleSave = async () => {
    if (!editState.name.trim() || !group) return;
    setSaving(true);
    try {
      const updated = await orgApi.updateGroup(group.id, {
        name: editState.name.trim(),
        class_level: editState.class_level ? Number(editState.class_level) : null,
        teacher_id: editState.teacher_id || null,
        description: editState.description.trim() || undefined,
        max_students: Number(editState.max_students) || 30,
      });
      setGroup((prev) => prev ? { ...prev, ...updated } : null);
      setEditing(false);
      showToast("Группа обновлена");
    } catch (e: any) {
      showToast(e.message || "Ошибка сохранения", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!group) return;
    if (!confirm(`Архивировать группу «${group.name}»? Ученики останутся в системе.`)) return;
    try {
      await orgApi.archiveGroup(group.id);
      showToast("Группа архивирована");
      setTimeout(() => router.push("/owner/groups"), 1000);
    } catch (e: any) {
      showToast(e.message || "Ошибка", "error");
    }
  };

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
      showToast("Ученик удалён из группы");
    } catch (e: any) {
      showToast(e.message || "Ошибка", "error");
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
        <Link href="/owner/groups" className="hover:text-slate-900 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Группы
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium truncate max-w-xs">{group.name}</span>
        {group.status === "archived" && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500 border border-slate-200">Архив</span>
        )}
      </div>

      {/* Вывеска: расширенные модули группы откроются после этапов подключения */}
      <PhaseLockBanner />

      {/* Group header card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="h-1.5 bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400" />
        <div className="p-6">
          {editing ? (
            /* ── Edit form ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Edit2 className="w-5 h-5 text-primary-500" />
                </div>
                <h2 className="font-semibold text-slate-900">Редактировать группу</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Название</label>
                  <input
                    value={editState.name}
                    onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Класс</label>
                  <select
                    value={editState.class_level}
                    onChange={(e) => setEditState((s) => ({ ...s, class_level: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="">Без класса</option>
                    {CLASS_LEVELS.map((n) => (
                      <option key={n} value={n}>{n} класс</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Макс. учеников</label>
                  <input
                    type="number" min={1} max={200}
                    value={editState.max_students}
                    onChange={(e) => setEditState((s) => ({ ...s, max_students: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Учитель</label>
                  <select
                    value={editState.teacher_id}
                    onChange={(e) => setEditState((s) => ({ ...s, teacher_id: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="">Не назначен</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Описание</label>
                  <textarea
                    value={editState.description}
                    onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                    rows={2}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!editState.name.trim() || saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  onClick={() => { setEditing(false); }}
                  className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                    <GraduationCap className="w-7 h-7 text-primary-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">{group.name}</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {group.class_level ? `${group.class_level} класс · ` : ""}
                      {group.teacher_name ? `Учитель: ${group.teacher_name}` : "Учитель не назначен"}
                      {group.max_students && ` · Макс. ${group.max_students} учеников`}
                    </p>
                    {group.description && (
                      <p className="text-xs text-slate-400 mt-1 max-w-lg">{group.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {group.status === "active" && (
                    <>
                      <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Изменить
                      </button>
                      <button
                        onClick={handleArchive}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors border border-slate-200 hover:border-red-200"
                        title="Архивировать группу"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Metrics */}
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
                    {stats?.avg_theta != null ? stats.avg_theta.toFixed(2) : "—"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Средний θ</p>
                </div>
              </div>

              {group.student_count > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Прогресс диагностики</span>
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
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: "students",  label: "Ученики",   Icon: Users    },
          { key: "analytics", label: "Аналитика",  Icon: BarChart2},
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
      <div>
        {tab === "students" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <p className="font-semibold text-slate-900">
                Состав группы
                <span className="ml-2 text-sm font-normal text-slate-400">({group.student_count})</span>
              </p>
            </div>
            <GroupStudentTable
              students={group.students}
              canRemove={false}
            />
          </motion.div>
        )}

        {tab === "analytics" && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            {stats ? (
              <GroupStatsPanel stats={stats} />
            ) : (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>
        )}

        {tab === "attendance" && (
          <AttendanceJournal groupId={groupId} students={group.students} />
        )}
      </div>

      {/* Add student drawer */}


      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${
              toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
