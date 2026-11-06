"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, GraduationCap, Filter, LayoutGrid, List } from "lucide-react";
import { orgApi, substitutionsApi, GroupInfo } from "@/lib/api";
import type { AssignedToMe } from "@/lib/substitution-types";
import { businessDateWithOffset } from "@/lib/business-time";
import { substituteCardTarget } from "@/lib/teacher-schedule-link";
import { useAuthStore } from "@/lib/store";
import { GroupCard } from "@/components/groups/group-card";
import { GroupCreateModal } from "@/components/groups/group-create-modal";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { Button } from "@/components/ui/button";



export default function TeacherGroupsPage() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  // the lessons he covers: a group where he only substitutes has no page for him (403), its card leads to the lesson in his schedule
  const [covered, setCovered] = useState<AssignedToMe[]>([]);

  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Teacher sees only their groups — pass teacher_id filter
      const data = await orgApi.listGroups({ teacher_id: user.id });
      setGroups(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.some((group) => group.substitution)) {
        substitutionsApi.mine().then((mine) => setCovered(mine.assignedToMe ?? [])).catch(() => setCovered([]));
      }
    } catch (error) {
      // Keep a previously confirmed list on screen. An offline request must
      // never look identical to a teacher having no groups.
      setLoadError(getDataLoadErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) void loadGroups();
  }, [loadGroups, user?.id]);



  return (
    <div className="space-y-6 w-full max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Мои группы</h1>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          variant="primary" size="md"
        >
          <Plus className="w-4 h-4" />
          Новая группа
        </Button>
      </div>



      {/* Content */}
      <div className="mt-6">
        {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-white rounded-2xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : loadError && groups.length === 0 ? (
        <DataLoadError
          title="Не удалось загрузить группы"
          message={loadError}
          onRetry={loadGroups}
        />
      ) : (
        <>
          {loadError && (
            <DataLoadError
              compact
              title="Список групп может быть неактуален"
              message={`${loadError} Показаны последние успешно загруженные данные.`}
              onRetry={loadGroups}
              className="mb-5"
            />
          )}
          {groups.length === 0 ? (
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
          <Button
            onClick={() => setShowCreate(true)}
            variant="primary" size="md"
          >
            <Plus className="w-4 h-4" />
            Создать первую группу
          </Button>
        </motion.div>
          ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group, i) => {
            const substitute = group.substitution ? substituteCardTarget(group.id, covered, businessDateWithOffset(0)) : null;
            return (
              <GroupCard
                key={group.id}
                group={group}
                href={substitute?.href ?? `/teacher/groups/${group.id}`}
                substituteLabel={substitute?.label}
                index={i}
              />
            );
          })}
        </div>
          )}
        </>
      )}
      </div>

      <GroupCreateModal
        open={showCreate}
        teachers={[]}
        selfAssignTeacher
        onClose={() => setShowCreate(false)}
        onCreated={(g) => {
          setGroups((prev) => [g, ...prev]);
          setShowCreate(false);
        }}
      />
    </div>
  );
}
