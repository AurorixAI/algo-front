"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { orgApi, GroupInfo } from "@/lib/api";
import {
  GraduationCap, Plus, Users, X, Search, Archive,
  CheckCircle, UserPlus,
} from "lucide-react";
import { GroupCard } from "@/components/groups/group-card";
import { GroupCreateModal } from "@/components/groups/group-create-modal";
import { ImportButton } from "@/components/import/import-button";

type StatusFilter = "active" | "waiting" | "archived";

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("active");
  const [showCreate, setShowCreate] = useState(false);

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

  const teachers = members.filter((m: any) => m.org_role === "teacher");

  const filtered = groups.filter((g) => {
    if (filterStatus === "waiting") {
      if (g.status !== "active" || !!g.teacher_id) return false;
    } else if (filterStatus === "active") {
      if (g.status !== "active" || !g.teacher_id) return false;
    } else if (filterStatus === "archived") {
      if (g.status !== "archived") return false;
    }

    if (!search) return true;
    const q = search.toLowerCase();
    const groupName = g.name.toLowerCase();
    const teacherName = g.teacher_name?.toLowerCase() ?? "";
    
    return groupName.includes(q) || teacherName.includes(q);
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
    <div className="space-y-6 w-full max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Группы</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Управление учебными группами и составом учеников
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ImportButton onImported={loadData} />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20"
          >
            <Plus className="w-4 h-4" /> Новая группа
          </button>
        </div>
      </div>


      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative w-[340px] shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по названию или учителю..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {([
            { key: "active",   label: "Активные" },
            { key: "waiting",  label: "Ожидание" },
            { key: "archived", label: "Архив" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filterStatus === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Create modal */}
      <GroupCreateModal
        open={showCreate}
        teachers={teachers.map(t => ({ id: t.user_id || t.id, first_name: t.first_name || "", last_name: t.last_name || "", org_role: t.org_role }))}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          loadData();
        }}
      />

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((g, i) => {
            const teacher = members.find((m: any) => m.user_id === g.teacher_id || m.id === g.teacher_id);
            const groupWithTeacher = {
              ...g,
              teacher_name: teacher ? (teacher.full_name || `${teacher.first_name} ${teacher.last_name}`) : undefined
            };
            return (
              <GroupCard key={g.id} group={groupWithTeacher} href={`/admin/groups/${g.id}`} index={i} />
            );
          })}
        </div>
      )}
    </div>
  );
}
