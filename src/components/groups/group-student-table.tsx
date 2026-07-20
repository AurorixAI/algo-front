"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, ExternalLink, ChevronUp, ChevronDown, GraduationCap } from "lucide-react";
import { StudentInGroup } from "@/lib/api";

type SortKey = "name" | "class_level" | "joined_at";

interface GroupStudentTableProps {
  students: StudentInGroup[];
  onRemove?: (studentId: string) => void;
  onViewProfile?: (studentId: string) => void;
  canRemove?: boolean;
}

export function GroupStudentTable({ students, onRemove, onViewProfile, canRemove }: GroupStudentTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...students].sort((a, b) => {
    let valA: any, valB: any;
    switch (sortKey) {
      case "name": valA = `${a.last_name} ${a.first_name}`; valB = `${b.last_name} ${b.first_name}`; break;
      case "class_level": valA = a.class_level; valB = b.class_level; break;
      case "joined_at": valA = a.joined_at ?? ""; valB = b.joined_at ?? ""; break;
    }
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
    ) : (
      <ChevronUp className="w-3.5 h-3.5 opacity-0 group-hover/th:opacity-30" />
    );

  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="group/th px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-900 whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} />
      </div>
    </th>
  );

  const handleRemove = async (studentId: string) => {
    if (!onRemove) return;
    setRemovingId(studentId);
    try {
      await onRemove(studentId);
    } finally {
      setRemovingId(null);
    }
  };

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <GraduationCap className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">В группе пока нет учеников</p>
        <p className="text-xs mt-1">Добавьте учеников с помощью кнопки выше</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-100">
            <Th col="name" label="Ученик" />
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
              ID
            </th>
            <Th col="class_level" label="Класс" />
            <Th col="joined_at" label="В группе с" />
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
              Действия
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((s, i) => {
            const isRemoving = removingId === s.id;

            return (
              <motion.tr
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: isRemoving ? 0.4 : 1 }}
                transition={{ delay: i * 0.02 }}
                className="hover:bg-slate-50/60 group"
              >
                {/* Name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                      {(s.first_name?.[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{s.full_name || `${s.last_name} ${s.first_name}`}</p>
                      {s.student_phone && (
                        <p className="text-xs text-slate-400">{s.student_phone}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Display ID — публичный ID ученика (AL15-001) */}
                <td className="px-4 py-3">
                  {s.display_id ? (
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-medium tracking-tight">
                      {s.display_id}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300" title="ID выдаётся при зачислении">—</span>
                  )}
                </td>

                {/* Class */}
                <td className="px-4 py-3 text-sm text-slate-600">{s.class_level} класс</td>

                {/* Joined at */}
                <td className="px-4 py-3 text-xs text-slate-400">
                  {s.joined_at
                    ? new Date(s.joined_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onViewProfile && (
                      <button
                        onClick={() => onViewProfile(s.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="Профиль ученика"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canRemove && onRemove && (
                      <button
                        onClick={() => handleRemove(s.id)}
                        disabled={isRemoving}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Удалить из группы"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
