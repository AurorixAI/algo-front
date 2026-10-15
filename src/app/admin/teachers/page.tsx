"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, Users } from "lucide-react";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { DataLoadError } from "@/components/ui/data-load-error";
import { PasswordResetLinkModal } from "@/components/staff/password-reset-link-modal";
import { RESET_LINK_MENU_LABEL, canIssueResetLink } from "@/lib/password-reset";

interface Member {
  id: string; // user id
  member_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  org_role: string;
}

const memberName = (m: Member) =>
  m.full_name || `${m.last_name || ""} ${m.first_name || ""}`.trim() || m.email || "Сотрудник";

/**
 * Teachers of the organisation for an administrator. The only action is «Ссылка для нового пароля»: an
 * administrator may hand a one-time link to a TEACHER (never to another administrator or the owner).
 */
export default function AdminTeachersPage() {
  const { user } = useAuthStore();
  const actorRole = user?.org_role || user?.role;
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await orgApi.listMembers();
      setMembers(Array.isArray(list) ? list : (list as any)?.items || []);
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить список учителей.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const teachers = members.filter((m) => m.org_role === "teacher");
  const menuFor = (m: Member): RowMenuItem[] =>
    canIssueResetLink(actorRole, m.org_role)
      ? [{ key: "password-reset-link", label: RESET_LINK_MENU_LABEL, icon: KeyRound, onSelect: () => setResetFor({ id: m.id, name: memberName(m) }) }]
      : [];

  return (
    <div className="space-y-6 w-full max-w-[1000px] mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Учителя</h1>
        <p className="text-slate-500 mt-1 font-medium">Если учитель забыл пароль, выдайте ему ссылку для нового.</p>
      </div>

      {error ? (
        <DataLoadError title="Не удалось загрузить учителей" message={error} onRetry={load} isRetrying={loading} />
      ) : loading ? (
        <div className="flex items-center justify-center py-16" role="status" aria-label="Загрузка">
          <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : teachers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-slate-900 font-semibold mb-1">Учителей пока нет</h2>
          <p className="text-slate-500 text-sm max-w-sm">Учителей приглашает владелец организации.</p>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm border border-slate-200/60 divide-y divide-slate-100">
          {teachers.map((m) => (
            <li key={m.member_id || m.id} className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {(m.first_name || m.email || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{memberName(m)}</p>
                  <p className="flex items-center gap-1.5 mt-0.5 text-sm font-medium text-slate-500 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{m.email}</span>
                  </p>
                </div>
              </div>
              <RowMenu items={menuFor(m)} label={`Действия: ${memberName(m)}`} width={264} />
            </li>
          ))}
        </ul>
      )}

      <PasswordResetLinkModal member={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}
