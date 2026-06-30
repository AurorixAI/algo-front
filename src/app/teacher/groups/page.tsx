"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, GraduationCap, Filter, LayoutGrid, List } from "lucide-react";
import { orgApi, GroupInfo } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { GroupCard } from "@/components/groups/group-card";
import { GroupCreateModal } from "@/components/groups/group-create-modal";



export default function TeacherGroupsPage() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      // Teacher sees only their groups — pass teacher_id filter
      const data = await orgApi.listGroups(
        user?.id ? { teacher_id: user.id } : {}
      );
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);



  return (
    <div className="space-y-6 w-full max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Мои группы</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20 text-sm"
        >
          <Plus className="w-4 h-4" />
          Новая группа
        </button>
      </div>



      {/* Content */}
      <div className="mt-6">
        {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-white rounded-2xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-primary-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            У вас пока нет групп
          </h3>
          <p className="text-slate-500 text-sm mb-6 text-center max-w-xs">
            Создайте группу, добавьте учеников и отслеживайте их прогресс в одном месте.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Создать первую группу
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group, i) => (
            <GroupCard
              key={group.id}
              group={group}
              href={`/teacher/groups/${group.id}`}
              index={i}
            />
          ))}
        </div>
      )}
      </div>

      <GroupCreateModal
        open={showCreate}
        teachers={[]}
        defaultTeacherId={user?.id}
        onClose={() => setShowCreate(false)}
        onCreated={(g) => {
          setGroups((prev) => [g, ...prev]);
          setShowCreate(false);
        }}
      />
    </div>
  );
}
