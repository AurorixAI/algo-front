"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import {
  GraduationCap, Plus, Users, X, Search, Archive,
  CheckCircle, UserPlus,
} from "lucide-react";

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

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", class_level: 5, teacher_id: "", max_students: 30 });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const teachers = members.filter(
    (m: any) => m.org_role === "teacher" || m.org_role === "owner" || m.org_role === "admin"
  );

  const filtered = groups.filter((g) => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = groups.filter((g) => g.status === "active").length;
  const archivedCount = groups.filter((g) => g.status === "archived").length;
  const totalStudents = groups.reduce((sum, g) => sum + (g.student_count ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Группы</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Управление учебными группами и составом учеников
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" /> Новая группа
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Всего групп", value: groups.length, icon: GraduationCap, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Активные", value: activeCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Архивные", value: archivedCount, icon: Archive, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Всего учеников", value: totalStudents, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-4 rounded-xl border border-slate-100 bg-white"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + stat.bg}>
                <stat.icon className={"w-4 h-4 " + stat.color} />
              </div>
              <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
            </div>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
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
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-400">Нет групп</p>
          <p className="text-slate-400 text-sm mt-1">
            Нажмите &quot;Новая группа&quot; чтобы создать первую
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-xl border border-slate-100 p-4 transition-all hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-900">{g.name}</span>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>{g.class_level ? `${g.class_level} класс` : "Без класса"}</span>
                    <span>&middot;</span>
                    <span>Макс. {g.max_students}</span>
                    {g.created_at && (
                      <>
                        <span>&middot;</span>
                        <span>
                          {new Date(g.created_at).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Student count */}
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mr-2">
                  <UserPlus className="w-4 h-4" />
                  <span className="font-medium">{g.student_count ?? 0}</span>
                </div>

                {/* Status badge */}
                <span
                  className={
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border " +
                    (g.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-500 border-slate-200")
                  }
                >
                  <div
                    className={
                      "w-1.5 h-1.5 rounded-full " +
                      (g.status === "active" ? "bg-emerald-400" : "bg-slate-400")
                    }
                  />
                  {g.status === "active" ? "Активна" : "Архив"}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
