"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, UserPlus, Check, Loader2, AlertTriangle } from "lucide-react";
import { orgApi, StudentInGroup } from "@/lib/api";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  class_level: number;
  status: string;
  /** Current (primary) group of the student; null when not enrolled. */
  group_id?: string | null;
}

/** Result handed to the page so it can show one summary toast. */
export interface AddStudentsResult {
  added: number;
  skipped: number;
  /** "Фамилия Имя — причина" for every student the server refused. */
  skippedLines: string[];
}

interface AddStudentDrawerProps {
  open: boolean;
  groupId: string;
  groupClassLevel?: number | null;
  existingStudentIds: Set<string>;
  onClose: () => void;
  onAdded: (result: AddStudentsResult) => void;
}

export function AddStudentDrawer({
  open, groupId, groupClassLevel, existingStudentIds, onClose, onAdded,
}: AddStudentDrawerProps) {
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalFound, setTotalFound] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Group names for the "currently in ..." hints; a failure only drops the hints.
  useEffect(() => {
    if (!open) return;
    setAddError(null);
    let cancelled = false;
    orgApi.listGroups()
      .then((list) => {
        if (cancelled) return;
        const items = Array.isArray(list) ? list : (list as any)?.items || [];
        setGroupNames(Object.fromEntries(items.map((g: any) => [g.id, g.name])));
      })
      .catch(() => { if (!cancelled) setGroupNames({}); });
    return () => { cancelled = true; };
  }, [open]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      // The server caps a page at 500; beyond that the search box narrows the list.
      const data = await orgApi.listStudentsPage({
        search: debouncedSearch || undefined,
        class_level: groupClassLevel || undefined,
        limit: 500,
      });
      setStudents(data.items);
      setTotalFound(data.total);
    } catch {
      setStudents([]);
      setTotalFound(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, groupClassLevel]);

  useEffect(() => {
    if (open) loadStudents();
  }, [open, loadStudents]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    setAddError(null);
    try {
      const picked = students.filter((s) => selected.has(s.id));
      const result = await orgApi.bulkAddStudents(groupId, Array.from(selected));
      const nameOf = (id: string) => {
        const s = picked.find((item) => item.id === id);
        return s ? (s.full_name || `${s.last_name} ${s.first_name}`.trim()) : "Ученик";
      };
      setSelected(new Set());
      onAdded({
        added: result.added,
        skipped: result.skipped,
        skippedLines: (result.skipped_details || []).map((d) => `${nameOf(d.student_id)} — ${d.reason}`),
      });
    } catch (e: any) {
      setAddError(e.message || "Ошибка добавления учеников");
    } finally {
      setAdding(false);
    }
  };

  // Students not already in group
  const available = students.filter((s) => !existingStudentIds.has(s.id));

  // Selected students who are enrolled elsewhere: adding moves them.
  const transfers = available
    .filter((s) => selected.has(s.id) && s.group_id && s.group_id !== groupId)
    .map((s) => ({
      id: s.id,
      name: s.full_name || `${s.last_name} ${s.first_name}`.trim(),
      from: groupNames[s.group_id as string] || "другой группы",
    }));

  const statusColors: Record<string, string> = {
    new:       "bg-blue-50 text-blue-700",
    diagnosed: "bg-amber-50 text-amber-700",
    active:    "bg-emerald-50 text-emerald-700",
    archived:  "bg-slate-100 text-slate-500",
  };
  const statusLabels: Record<string, string> = {
    new: "Новый", diagnosed: "Диагностирован", active: "Активный", archived: "Архив",
  };

  const drawerContent = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[60] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-slate-900">Добавить учеников</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selected.size > 0 ? `Выбрано: ${selected.size}` : "Выберите учеников для добавления"}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-slate-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени…"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Student list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : available.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                  <UserPlus className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">{search ? "Ничего не найдено" : "Все ученики уже в группе"}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {available.map((s) => {
                    const isSelected = selected.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${isSelected ? "bg-primary-50/50" : ""}`}
                      >
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                          isSelected ? "bg-primary-600 text-white" : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600"
                        }`}>
                          {isSelected ? <Check className="w-4 h-4" /> : (s.first_name?.[0] || "?").toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {s.full_name || `${s.last_name} ${s.first_name}`}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {s.class_level} класс
                            {s.group_id && s.group_id !== groupId && (
                              <span className="text-amber-700"> · сейчас в «{groupNames[s.group_id] || "другой группе"}»</span>
                            )}
                          </p>
                        </div>

                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColors[s.status] || statusColors.new}`}>
                          {statusLabels[s.status] || s.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!loading && totalFound > students.length && (
                <p className="px-4 py-3 text-xs text-slate-400 text-center">
                  Показаны первые {students.length} из {totalFound}. Уточните поиск, чтобы найти остальных.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 space-y-3">
              {transfers.length > 0 && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Ученик состоит только в одной группе: {transfers.length === 1 ? "он будет переведён" : `будут переведены (${transfers.length})`}
                  </p>
                  <ul className="mt-1.5 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {transfers.map((t) => (
                      <li key={t.id}>{t.name} — из «{t.from}»</li>
                    ))}
                  </ul>
                </div>
              )}
              {addError && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{addError}</p>
              )}
              <button
                onClick={handleAdd}
                disabled={selected.size === 0 || adding}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {adding ? "Добавление…" : `Добавить${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(drawerContent, document.body) : null;
}
