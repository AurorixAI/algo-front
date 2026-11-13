"use client";

import { canManageMoney } from "@/lib/money-effects";
import { useAuthStore } from "@/lib/store";
import { useState } from "react";
import { displayPhone } from "@/lib/phone";
import { GraduationCap, Check, Copy, UserMinus, ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { orgApi, StudentInGroup } from "@/lib/api";
import { pausedChipText } from "@/lib/payments";
import { formatUtcNaiveAsBusinessDate } from "@/lib/business-time";
import { DataCell, DataEmpty, DataRow, DataTable, type DataColumn } from "@/components/ui/data-table";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { TRANSFER_NO_RIGHT_TEXT } from "@/lib/enrol-labels";
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
  // Money-1 A4 (I-6): a transfer carries the paid days and the advance of the student - the money right only
  const moneyRight = canManageMoney(useAuthStore((state) => state.user));
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

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <GraduationCap className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">В группе пока нет учеников</p>
        <p className="text-xs mt-1">Добавьте учеников с помощью кнопки выше</p>
      </div>
    );
  }

  const columns: DataColumn[] = [
    { key: "name", header: "Ученик", width: "minmax(0,1.7fr)", sortKey: "name" },
    { key: "display_id", header: "ID ученика", width: "minmax(7.5rem,0.9fr)", cardLabel: "ID ученика", sortKey: "display_id" },
    { key: "class_level", header: "Класс", width: "minmax(4.5rem,0.5fr)", cardLabel: "Класс", sortKey: "class_level" },
    { key: "phone", header: "Телефон", width: "minmax(9rem,0.9fr)", cardLabel: "Телефон", sortKey: "phone" },
    { key: "joined_at", header: "Дата зачисления", width: "minmax(7.5rem,0.8fr)", cardLabel: "Дата зачисления", sortKey: "joined_at" },
    ...(removable ? [{ key: "actions", header: "", align: "end", width: "2.5rem", actions: true } as DataColumn] : []),
  ];
  const name = (s: StudentInGroup) => s.full_name || `${s.last_name} ${s.first_name}`;
  return (
    <div className="relative">
      <DataTable columns={columns} minWidth={640} sort={{ key: sortKey, asc: sortAsc }} onSort={(key) => handleSort(key as SortKey)} testId="roster-table">
        {sorted.map((s) => (
          <DataRow key={s.id}>
            <DataCell col="name">
              <Link href={`${basePath}/${s.id}`} className="group/student flex min-w-0 items-center gap-3 hover:opacity-80 transition-opacity" title="Открыть профиль ученика">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary-200/50 bg-primary-100 text-xs font-bold text-primary-700">
                  {(s.first_name?.[0] || "?").toUpperCase()}
                </div>
                <span className="min-w-0 break-words text-sm font-medium text-slate-700 transition-colors group-hover/student:text-primary-600">{name(s)}</span>
                {pausedChipText(s) && <span data-kind="chip" className="shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">{pausedChipText(s)}</span>}
              </Link>
            </DataCell>
            {/* the public ID of the student (AL-001): copied by a click, never cut */}
            <DataCell col="display_id">
              {s.display_id ? (
                <button
                  type="button"
                  onClick={(e) => handleCopyId(s.display_id!, e)}
                  className={`group/id inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-all duration-200 ${
                    copiedId === s.display_id ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-card" : "border-slate-200/60 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  title="Нажмите, чтобы скопировать ID ученика"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {copiedId === s.display_id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-500" />}
                  </span>
                  <span>{s.display_id}</span>
                </button>
              ) : <DataEmpty />}
            </DataCell>
            <DataCell col="class_level"><span className="whitespace-nowrap text-sm font-medium text-slate-700">{s.class_level} класс</span></DataCell>
            <DataCell col="phone">{displayPhone(s.student_phone) ? <span className="whitespace-nowrap text-xs font-medium text-slate-700">{displayPhone(s.student_phone)}</span> : <DataEmpty />}</DataCell>
            <DataCell col="joined_at">
              <span className="whitespace-nowrap text-xs font-medium text-slate-500">
                {s.joined_at ? formatUtcNaiveAsBusinessDate(s.joined_at, { day: "numeric", month: "short", year: "numeric" }) : null}
              </span>
            </DataCell>
            {removable && (
              <DataCell col="actions">
                <RowMenu
                  label={`Действия: ${name(s)}`}
                  items={menuKeys.map((key): RowMenuItem => key === "transfer"
                    ? { key, label: ROSTER_TRANSFER_LABEL, icon: ArrowRightLeft, disabled: !moneyRight, hint: moneyRight ? undefined : TRANSFER_NO_RIGHT_TEXT, onSelect: () => onTransfer?.(s) }
                    : { key, label: ROSTER_LEAVE_LABEL, icon: UserMinus, danger: true, onSelect: () => setLeaveTarget(s) })}
                />
              </DataCell>
            )}
          </DataRow>
        ))}
      </DataTable>
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
