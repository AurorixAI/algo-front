"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown, GraduationCap } from "lucide-react";
import { StudentInGroup } from "@/lib/api";

type SortKey = "name" | "display_id" | "class_level" | "phone" | "joined_at";

interface GroupStudentTableProps {
  students: StudentInGroup[];
  onRemove?: (studentId: string) => void;
  onViewProfile?: (studentId: string) => void;
  canRemove?: boolean;
}

export function GroupStudentTable({ students }: GroupStudentTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...students].sort((a, b) => {
    let valA: any, valB: any;
    switch (sortKey) {
      case "name": valA = `${a.last_name} ${a.first_name}`; valB = `${b.last_name} ${b.first_name}`; break;
      case "display_id": valA = a.display_id ?? ""; valB = b.display_id ?? ""; break;
      case "class_level": valA = a.class_level; valB = b.class_level; break;
      case "phone": valA = a.student_phone ?? ""; valB = b.student_phone ?? ""; break;
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

  const Th = ({
    col,
    label,
    className = "",
    align = "text-left",
  }: {
    col: SortKey;
    label: string;
    className?: string;
    align?: "text-left" | "text-center" | "text-right";
  }) => (
    <th
      className={`group/th px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-900 whitespace-nowrap align-middle ${align} ${className}`}
      onClick={() => handleSort(col)}
    >
      <div
        className={`flex items-center gap-1 ${
          align === "text-center"
            ? "justify-center"
            : align === "text-right"
            ? "justify-end"
            : "justify-start"
        }`}
      >
        {label}
        <SortIcon col={col} />
      </div>
    </th>
  );

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
      <table className="w-full text-left border-collapse table-fixed">
        <colgroup>
          <col className="w-[36%]" />
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-100">
            <Th col="name" label="Ученик" className="pl-6" />
            <Th col="display_id" label="ID Ученика" />
            <Th col="class_level" label="Класс" />
            <Th col="phone" label="Телефон" align="text-center" />
            <Th col="joined_at" label="Дата зачисления" align="text-center" className="pr-6" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((s, i) => {
            return (
              <motion.tr
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="hover:bg-slate-50/70 transition-colors"
              >
                {/* Name */}
                <td className="px-4 py-4 pl-6 align-middle">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0 shadow-sm border border-primary-200/50">
                      {(s.first_name?.[0] || "?").toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {s.full_name || `${s.last_name} ${s.first_name}`}
                    </span>
                  </div>
                </td>

                {/* Display ID — публичный ID ученика (AL15-001) */}
                <td className="px-4 py-4 align-middle whitespace-nowrap">
                  {s.display_id ? (
                    <span className="inline-flex px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-medium border border-slate-200/60 tracking-tight">
                      {s.display_id}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300 font-mono">—</span>
                  )}
                </td>

                {/* Class */}
                <td className="px-4 py-4 text-sm font-medium text-slate-700 align-middle whitespace-nowrap">
                  {s.class_level} класс
                </td>

                {/* Phone */}
                <td className="px-4 py-4 text-xs font-medium text-slate-700 align-middle whitespace-nowrap text-center">
                  {s.student_phone || <span className="text-slate-300 font-mono">—</span>}
                </td>

                {/* Joined at */}
                <td className="px-4 py-4 pr-6 text-xs text-slate-500 font-medium align-middle whitespace-nowrap text-center">
                  {s.joined_at ? (
                    new Date(s.joined_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
                  ) : (
                    <span className="text-slate-300 font-mono">—</span>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
