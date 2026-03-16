"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { GraduationCap, Plus, Users, X } from "lucide-react";

interface GroupInfo {
  id: string;
  name: string;
  class_level: number | null;
  teacher_id: string | null;
  status: string;
  max_students: number;
  student_count?: number;
  created_at: string | null;
}

export default function OwnerGroupsPage() {
  const { org } = useAuthStore();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", class_level: 5, teacher_id: "", max_students: 30 });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [g, m] = await Promise.all([
        orgApi.listGroups().catch(() => []),
        orgApi.listMembers().catch(() => []),
      ]);
      setGroups(Array.isArray(g) ? g : (g as any)?.items || []);
      setMembers(Array.isArray(m) ? m : (m as any)?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await orgApi.createGroup({
        name: form.name,
        class_level: form.class_level || undefined,
        teacher_id: form.teacher_id || undefined,
        max_students: form.max_students,
      });
      setShowCreate(false);
      setForm({ name: "", class_level: 5, teacher_id: "", max_students: 30 });
      loadData();
    } catch (e: any) {
      alert(e.message || "Ошибка создания группы");
    } finally {
      setSaving(false);
    }
  };

  const teachers = members.filter((m: any) => m.org_role === "teacher" || m.org_role === "owner" || m.org_role === "admin");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Группы</h1>
          <p className="text-slate-500 mt-1">Управление учебными группами</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Новая группа
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Создать группу</h3>
            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="5А, Алгебра-продвинутые..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Класс</label>
              <select
                value={form.class_level}
                onChange={(e) => setForm({ ...form, class_level: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500"
              >
                {[5, 6, 7, 8, 9, 10, 11].map((n) => (
                  <option key={n} value={n}>{n} класс</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Учитель</label>
              <select
                value={form.teacher_id}
                onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Не назначен</option>
                {teachers.map((t: any) => (
                  <option key={t.user_id || t.id} value={t.user_id || t.id}>
                    {t.full_name || `${t.first_name} ${t.last_name}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Макс. учеников</label>
              <input
                type="number"
                value={form.max_students}
                onChange={(e) => setForm({ ...form, max_students: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || saving}
              className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Создание..." : "Создать"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Groups list */}
      <div className="grid gap-4">
        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
            <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Нет групп. Создайте первую группу.</p>
          </div>
        ) : (
          groups.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{g.name}</h3>
                  <p className="text-sm text-slate-500">
                    {g.class_level ? `${g.class_level} класс` : "Без класса"} · Макс. {g.max_students} уч.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="font-bold text-slate-900">{g.student_count ?? "—"}</p>
                  <p className="text-slate-400">учеников</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  g.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {g.status === "active" ? "Активна" : "Архив"}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
