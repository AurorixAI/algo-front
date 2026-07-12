"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, GraduationCap, Users, Target, TrendingUp,
  Filter, Search, Archive, ChevronDown
} from "lucide-react";
import { orgApi, GroupInfo } from "@/lib/api";
import { GroupCard } from "@/components/groups/group-card";
import { GroupCreateModal } from "@/components/groups/group-create-modal";

const CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];

type StatusFilter = "active" | "waiting" | "archived";

export default function OwnerGroupsPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterClass, setFilterClass] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [g, m] = await Promise.all([
        orgApi.listGroups(),
        orgApi.listMembers().catch(() => []),
      ]);
      setGroups(Array.isArray(g) ? g : []);
      setMembers(Array.isArray(m) ? m : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleArchive = async (id: string) => {
    if (!confirm("Архивировать группу? Ученики останутся в системе.")) return;
    setArchivingId(id);
    try {
      const updated = await orgApi.archiveGroup(id);
      setGroups((prev) => prev.map((g) => g.id === id ? updated : g));
      showToast("Группа архивирована");
    } catch (e: any) {
      showToast(e.message || "Ошибка", "error");
    } finally {
      setArchivingId(null);
    }
  };

  // Only teachers can be assigned to a group — not admins/owner
  const teachers = members.filter((m: any) =>
    m.org_role === "teacher"
  ).map((m: any) => ({
    id: m.user_id || m.id,
    first_name: m.first_name || m.full_name?.split(" ")[0] || "",
    last_name: m.last_name || m.full_name?.split(" ")[1] || "",
    org_role: m.org_role,
  }));

  // Filtered + searched
  const filtered = groups.filter((g) => {
    if (filterStatus === "waiting") {
      if (g.status !== "active" || !!g.teacher_id) return false;
    } else if (filterStatus === "active") {
      if (g.status !== "active" || !g.teacher_id) return false;
    } else if (filterStatus === "archived") {
      if (g.status !== "archived") return false;
    }

    if (filterClass && g.class_level !== filterClass) return false;
    
    if (search) {
      const q = search.toLowerCase();
      const groupName = g.name.toLowerCase();
      const teacherName = g.teacher_name?.toLowerCase() ?? "";
      if (!groupName.includes(q) && !teacherName.includes(q)) return false;
    }
    
    return true;
  });

  // Summary stats (active groups only)
  const active = groups.filter((g) => g.status === "active");
  const totalStudents = active.reduce((s, g) => s + g.student_count, 0);
  const avgFill = active.length > 0
    ? Math.round(active.reduce((s, g) => s + (g.student_count / g.max_students) * 100, 0) / active.length)
    : 0;

  return (
    <div className="space-y-6 w-full max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Группы</h1>
          <p className="text-slate-500 text-sm mt-0.5">Управление учебными группами организации</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20 text-sm"
        >
          <Plus className="w-4 h-4" />
          Новая группа
        </button>
      </div>


      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или учителю..."
            className="pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none w-[340px] shrink-0"
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
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Groups grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 bg-white rounded-2xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-primary-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {search
              ? `Нет групп по запросу «${search}»`
              : filterClass
              ? `Нет групп для ${filterClass} класса`
              : "Групп пока нет"}
          </h3>
          <p className="text-slate-500 text-sm mb-6 text-center max-w-xs">
            Создайте учебную группу и добавьте в неё учеников для совместного обучения.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Создать группу
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((group, i) => (
            <GroupCard
              key={group.id}
              group={group}
              href={`/owner/groups/${group.id}`}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <GroupCreateModal
        open={showCreate}
        teachers={teachers}
        onClose={() => setShowCreate(false)}
        onCreated={(g) => {
          setGroups((prev) => [g, ...prev]);
          setShowCreate(false);
          showToast(`Группа «${g.name}» создана`);
        }}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${
              toast.type === "success"
                ? "bg-slate-900 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
