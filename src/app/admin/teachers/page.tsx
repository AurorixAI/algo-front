"use client";

import { useEffect, useState } from "react";
import { Mail, Users } from "lucide-react";
import { orgApi } from "@/lib/api";
import { staffDisplayName } from "@/lib/staff-name";
import { useToast } from "@/components/ui/toast";
import { StaffAccessMenu } from "@/components/staff/staff-access-menu";
import type { OrgMemberRow } from "@/lib/ops-b-types";

/**
 * «Сотрудники» of an administrator (K2-2, C; LESSONS 38/39): the teachers of the centre, with the same «⋯» as the owner's list - the administrator sends a teacher
 * a link for a new password. Invitations, roles, rates, removal and the e-mail stay with the owner.
 */
export default function AdminStaffPage() {
  const { showToast, toastNode } = useToast();
  const [rows, setRows] = useState<OrgMemberRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    orgApi
      .listMembers()
      .then((answer) => {
        if (cancelled) return;
        const list = (Array.isArray(answer) ? answer : []) as OrgMemberRow[];
        setRows(list.filter((row) => row.org_role === "teacher" && row.is_active !== false));
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Сотрудники</h1>
        <p className="mt-1 font-medium text-slate-500">Преподаватели вашего центра</p>
      </div>
      {failed && <p role="alert" className="text-sm font-medium text-rose-700">Не удалось загрузить сотрудников. Обновите страницу.</p>}
      {rows === null && !failed && <p className="text-sm text-slate-500" role="status">Загрузка сотрудников…</p>}
      {rows !== null && rows.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white p-12 text-center shadow-sm">
          <Users className="mb-3 h-8 w-8 text-slate-300" />
          <h3 className="font-semibold text-slate-900">Преподавателей пока нет</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">Приглашает сотрудников владелец центра.</p>
        </div>
      )}
      {rows !== null && rows.length > 0 && (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm" data-testid="admin-staff-list">
          {rows.map((member) => (
            <div key={member.member_id} className="flex items-center justify-between gap-4 p-5 sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-bold text-white shadow-sm">
                  {(member.first_name || member.email || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{staffDisplayName(member, "Без имени")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <p className="truncate text-sm font-medium text-slate-500">{member.email}</p>
                  </div>
                </div>
              </div>
              <StaffAccessMenu member={member} actorRole="admin" showToast={showToast} />
            </div>
          ))}
        </div>
      )}
      {toastNode}
    </div>
  );
}
