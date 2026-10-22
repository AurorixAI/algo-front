"use client";

import { useState } from "react";
import { displayPhone } from "@/lib/phone";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, GraduationCap, Check, Copy, UserMinus, ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { orgApi, StudentInGroup } from "@/lib/api";
import { pausedChipText } from "@/lib/payments";
import { formatUtcNaiveAsBusinessDate } from "@/lib/business-time";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { ROSTER_LEAVE_LABEL, ROSTER_TRANSFER_LABEL, rosterMenuKeys } from "@/lib/group-workspace";
import { LeaveStudentDialog } from "./leave-student-dialog";
import { useCopy } from "@/lib/use-copy";

type SortKey = "name" | "display_id" | "class_level" | "phone" | "joined_at";

interface GroupStudentTableProps {
  students: StudentInGroup[];
  studentBasePath?: string;
  /** Owner / administrator, an active group: the «⋯» of a row is shown. */
  canRemove?: boolean;
  /**
   * With the group the removal shows what is left on the account and settles it (keep / forgive / refund, `LeaveStudentDialog`);
   * `onLeft` is called after the server took the student out.  Without them (a teacher) a row has no menu.
   */
  groupId?: string;
  onLeft?: (studentId: string, settledLines: string[]) => void;
  /** «Перевести в другую группу…» of a row: the page opens the transfer dialog of the card for this student. */
  onTransfer?: (student: StudentInGroup) => void;
}

/**
 * The roster of a group.  The name is the link to the card of the student; the «⋯» of a row has at most two items (IA audit F4, d2):
 * «Перевести в другую группу…» and «Убрать из группы…» (the one dialog with the money).  The card of the student is the link of the name.
 */
export function GroupStudentTable({ students, studentBasePath, canRemove, groupId, onLeft, onTransfer }: GroupStudentTableProps) {
  const pathname = usePathname();
  const isTeacher = pathname?.startsWith("/teacher");
  const [leaveTarget, setLeaveTarget] = useState<StudentInGroup | null>(null);
  const menuKeys = rosterMenuKeys({ canLeave: Boolean(canRemove && groupId && onLeft && !isTeacher), canTransfer: Boolean(canRemove && onTransfer && !isTeacher) });
  const removable = menuKeys.length > 0;
  const basePath = studentBasePath || (isTeacher ? "/teacher/students" : "/admin/students");

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const { copied: copiedId, copy } = useCopy();

  const handleCopyId = (displayId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void copy(displayId);
  };

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
      className={`group/th px-4 py-3.5 text-[13px] font-semibold text-slate-500 cursor-pointer select-none hover:text-slate-900 whitespace-nowrap align-middle ${align} ${className}`}
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
        {/* a centred label gets a spacer as wide as the arrow, so it stays exactly over its centred cells */}
        {align === "text-center" && <span aria-hidden="true" className="w-3.5" />}
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

  // `relative`: the sr-only «Действия» of the header is absolute and would otherwise leak out of the scroller
  // (a page-wide horizontal scroll on a phone).
  return (
    <div className="relative overflow-x-auto">
      <table className={`w-full text-left border-collapse table-fixed ${removable ? "min-w-[760px]" : ""}`}>
        <colgroup>
          <col className={removable ? "w-[34%]" : "w-[36%]"} />
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          <col className="w-[18%]" />
          <col className={removable ? "w-[16%]" : "w-[20%]"} />
          {removable && <col className="w-[6%]" />}
        </colgroup>
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-100">
            <Th col="name" label="Ученик" className="pl-6" />
            <Th col="display_id" label="ID ученика" align="text-center" />
            <Th col="class_level" label="Класс" align="text-center" />
            <Th col="phone" label="Телефон" align="text-center" />
            <Th col="joined_at" label="Дата зачисления" align="text-center" className={removable ? "" : "pr-6"} />
            {removable && <th className="px-4 py-3.5 pr-6 text-right"><span className="sr-only">Действия</span></th>}
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
                  <Link
                    href={`${basePath}/${s.id}`}
                    className="flex items-center gap-3 group/student hover:opacity-80 transition-opacity"
                    title="Открыть профиль ученика"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0 shadow-sm border border-primary-200/50 group-hover/student:scale-105 transition-transform">
                      {(s.first_name?.[0] || "?").toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-700 group-hover/student:text-primary-600 transition-colors truncate">
                      {s.full_name || `${s.last_name} ${s.first_name}`}
                    </span>
                    {pausedChipText(s) && (
                      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{pausedChipText(s)}</span>
                    )}
                  </Link>
                </td>

                {/* Display ID — публичный ID ученика (AL-001) */}
                <td className="px-4 py-4 align-middle whitespace-nowrap text-center">
                  {s.display_id ? (
                    <button
                      type="button"
                      onClick={(e) => handleCopyId(s.display_id!, e)}
                      className={`group/id inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all duration-200 cursor-pointer ${
                        copiedId === s.display_id
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/60"
                      }`}
                      title="Нажмите, чтобы скопировать ID ученика"
                    >
                      {/* Fixed icon slot to avoid layout shift */}
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {copiedId === s.display_id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-50 duration-150" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400 group-hover/id:text-slate-600 transition-colors" />
                        )}
                      </span>
                      <span>{s.display_id}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-300 font-mono">—</span>
                  )}
                </td>

                {/* Class */}
                <td className="px-4 py-4 text-sm font-medium text-slate-700 align-middle whitespace-nowrap text-center">
                  {s.class_level} класс
                </td>

                {/* Phone */}
                <td className="px-4 py-4 text-xs font-medium text-slate-700 align-middle whitespace-nowrap text-center">
                  {displayPhone(s.student_phone) || <span className="text-slate-300 font-mono">—</span>}
                </td>

                {/* Joined at */}
                <td className={`px-4 py-4 ${removable ? "" : "pr-6"} text-xs text-slate-500 font-medium align-middle whitespace-nowrap text-center`}>
                  {s.joined_at ? (
                    formatUtcNaiveAsBusinessDate(s.joined_at, { day: "numeric", month: "short", year: "numeric" })
                  ) : (
                    <span className="text-slate-300 font-mono">—</span>
                  )}
                </td>

                {removable && (
                  <td className="px-4 py-4 pr-6 align-middle text-right">
                    <RowMenu
                      label={`Действия: ${s.full_name || `${s.last_name} ${s.first_name}`}`}
                      items={menuKeys.map((key): RowMenuItem => key === "transfer"
                        ? { key, label: ROSTER_TRANSFER_LABEL, icon: ArrowRightLeft, onSelect: () => onTransfer?.(s) }
                        : { key, label: ROSTER_LEAVE_LABEL, icon: UserMinus, danger: true, onSelect: () => setLeaveTarget(s) })}
                    />
                  </td>
                )}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      {groupId && onLeft && !isTeacher && (
        <LeaveStudentDialog
          open={leaveTarget !== null}
          groupId={groupId}
          studentId={leaveTarget?.id ?? ""}
          studentName={leaveTarget ? (leaveTarget.full_name || `${leaveTarget.last_name} ${leaveTarget.first_name}`) : ""}
          onClose={() => setLeaveTarget(null)}
          onLeft={(lines) => { if (leaveTarget) onLeft(leaveTarget.id, lines); }}
          onLegacy={leaveTarget ? () => orgApi.removeStudentFromGroup(groupId, leaveTarget.id) : undefined}
        />
      )}
    </div>
  );
}
