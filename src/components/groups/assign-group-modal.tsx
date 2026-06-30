"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Users, Loader2, Check } from "lucide-react";
import { orgApi } from "@/lib/api";

interface GroupInfo {
  id: string;
  name: string;
  class_level: number;
  students_count?: number;
}

interface AssignGroupModalProps {
  open: boolean;
  studentId: string;
  studentName: string;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignGroupModal({ open, studentId, studentName, onClose, onAssigned }: AssignGroupModalProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      orgApi.listGroups()
        .then((data: any) => {
          setGroups(Array.isArray(data) ? data : data?.items || []);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setSelectedGroupId(null);
      setSearch("");
    }
  }, [open]);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.class_level.toString().includes(search)
  );

  const handleAssign = async () => {
    if (!selectedGroupId) return;
    setAssigning(true);
    try {
      await Promise.all([
        orgApi.updateStudent(studentId, {
          group_id: selectedGroupId,
          status: "active",
        }),
        orgApi.addStudentToGroup(selectedGroupId, studentId)
      ]);
      onAssigned();
    } catch (e: any) {
      alert(e.message || "Ошибка зачисления");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-primary-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">Выбор группы</h2>
                    <p className="text-sm text-slate-500">Зачисление: {studentName}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
                <div className="relative mb-4">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Поиск группы..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none"
                  />
                </div>

                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    {search ? "Группы не найдены" : "Нет доступных групп"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredGroups.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => setSelectedGroupId(g.id)}
                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                          selectedGroupId === g.id
                            ? "bg-primary-50 border-primary-200"
                            : "bg-white border-slate-200 hover:border-primary-300 hover:bg-slate-50"
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-semibold ${selectedGroupId === g.id ? "text-primary-900" : "text-slate-900"}`}>
                            {g.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {g.class_level} класс · {g.students_count || 0} учеников
                          </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          selectedGroupId === g.id ? "border-primary-600 bg-primary-600 text-white" : "border-slate-300 text-transparent"
                        }`}>
                          <Check className="w-3 h-3" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-white">
                <button
                  onClick={handleAssign}
                  disabled={!selectedGroupId || assigning}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-primary-600/20 hover:from-primary-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {assigning ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Зачислить в группу"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
