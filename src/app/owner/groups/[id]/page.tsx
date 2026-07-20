"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, UserPlus, Users, BarChart2,
  GraduationCap, Loader2, Edit2, Check, X,
  Archive, Settings2, Lock, Sparkles, UserCheck, FileText, Info, ChevronDown, RotateCcw
} from "lucide-react";
import Link from "next/link";
import { orgApi, GroupDetail, GroupStats, GroupInfo } from "@/lib/api";
import { GroupStudentTable } from "@/components/groups/group-student-table";
import { GroupStatsPanel } from "@/components/groups/group-stats-panel";
import { AttendanceJournal } from "@/components/groups/attendance-journal";
import { Select } from "@/components/ui/select";
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
      setGroup((prev) => prev ? { ...prev, status: "archived" } : null);
      showToast("Группа перемещена в архив");
    } catch (e: any) {
      showToast(e.message || "Ошибка архивации", "error");
    }
  };

  const handleUnarchive = async () => {
    if (!group) return;
    if (!confirm(`Восстановить группу «${group.name}» из архива?`)) return;
    try {
      await orgApi.unarchiveGroup(group.id);
      setGroup((prev) => prev ? { ...prev, status: "active" } : null);
      showToast("Группа восстановлена из архива");
    } catch (e: any) {
      showToast(e.message || "Ошибка восстановления", "error");
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
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Редактирование группы</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Изменение названия, преподавателя и лимитов мест</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Group Name */}
                <div className="col-span-2 space-y-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Название группы <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <input
                      value={editState.name}
                      onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                      placeholder="например, 9-А Математика (Профиль)"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Teacher Selection */}
                <div className="col-span-2">
                  <Select
                    label="Преподаватель группы"
                    placeholder="— Не назначен (Учитель отсутствует)"
                    value={editState.teacher_id}
                    onChange={(val) => setEditState((s) => ({ ...s, teacher_id: val }))}
                    options={[
                      { value: "", label: "— Не назначен (Учитель отсутствует)" },
                      ...teachers.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                </div>

                {/* Class Level */}
                <div>
                  <Select
                    label="Класс обучения"
                    placeholder="Без указания класса"
                    value={editState.class_level}
                    onChange={(val) => setEditState((s) => ({ ...s, class_level: val }))}
                    options={[
                      { value: "", label: "Без указания класса" },
                      ...CLASS_LEVELS.map((n) => ({ value: String(n), label: `${n} класс` })),
                    ]}
                  />
                </div>

                {/* Max Students */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Максимум учеников
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Users className="w-4 h-4" />
                    </div>
                    <input
                      type="number"
                      min={Math.max(1, group.student_count)}
                      max={200}
                      value={editState.max_students}
                      onChange={(e) => setEditState((s) => ({ ...s, max_students: e.target.value }))}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all"
                    />
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                    <span>Сейчас в группе: <strong className="text-slate-700">{group.student_count}</strong> учеников · мин. {group.student_count || 1}</span>
                  </p>
                </div>

                {/* Description */}
                <div className="col-span-2 space-y-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Описание группы
                  </label>
                  <textarea
                    value={editState.description}
                    onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                    rows={2}
                    placeholder="Дополнительная информация о группе, расписании или целях обучения..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={!editState.name.trim() || saving || Number(editState.max_students) < group.student_count}
                    className="flex items-center gap-2 px-7 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {saving ? "Сохранение…" : "Сохранить изменения"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 px-5 py-3 text-slate-500 hover:text-slate-800 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Отмена
                  </button>
                </div>

                {Number(editState.max_students) < group.student_count && (
                  <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Лимит не может быть меньше {group.student_count} учеников
                  </p>
                )}
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
                  {group.status === "archived" ? (
                    <button
                      onClick={handleUnarchive}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-xs cursor-pointer"
                      title="Восстановить группу из архива"
                    >
                      <RotateCcw className="w-4 h-4 text-emerald-600" />
                      Восстановить из архива
                    </button>
                  ) : (
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
            </div>
          </motion.div>
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
