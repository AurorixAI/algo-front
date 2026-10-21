"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { staffDisplayName } from "@/lib/staff-name";
import { formatBusinessDate } from "@/lib/business-time";
import { rateItemLine, type PayrollRateItem } from "@/lib/payroll";
import { Users, Plus, Copy, CheckCircle, X, Shield, Trash2, Mail, Clock, ShieldCheck, RotateCcw, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { TeacherRateDialog } from "@/components/payroll/rate-dialog";
import { RemoveMemberDialog, type MemberAction } from "@/components/staff/remove-member-dialog";
import { opsApi } from "@/lib/api";
import { errorMessageOf, opsErrorCode } from "@/lib/ops-errors";
import type { InvitationRow, OrgMemberRow } from "@/lib/ops-b-types";
import {
  INVITE_ADMIN_HINT,
  INVITE_AGAIN_LABEL,
  INVITE_EXPIRED_BADGE,
  RESTORE_TITLE,
  inviteEmailError,
  inviteErrorText,
  inviteState,
  inviteValidUntilText,
  normalizeEmail,
  removedOnText,
  restoreConfirmText,
  sortInvitations,
} from "@/lib/staff-lifecycle";

type Member = OrgMemberRow;
type Invitation = InvitationRow;

const roleConfig: Record<string, { label: string; pluralLabel: string; color: string; badge: string; icon: React.ElementType }> = {
  owner: { label: "Владелец", pluralLabel: "Владелец", color: "from-violet-500 to-purple-600", badge: "bg-violet-50 text-violet-700 border-violet-100", icon: ShieldCheck },
  admin: { label: "Администратор", pluralLabel: "Администраторы", color: "from-blue-500 to-indigo-600", badge: "bg-blue-50 text-blue-700 border-blue-100", icon: Shield },
  teacher: { label: "Учитель", pluralLabel: "Учителя", color: "from-emerald-400 to-emerald-600", badge: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: Users },
};

export default function OwnerTeachersPage() {
  // The page reads `?teacher=` (the link «Указать ставку» of «Зарплата»), so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <OwnerTeachersContent />
    </Suspense>
  );
}

function OwnerTeachersContent() {
  const { org } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, toastNode } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [formerMembers, setFormerMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  /** O2: the dialog of a removal (or of a role change that leaves groups without a teacher). */
  const [memberAction, setMemberAction] = useState<{ member: Member; action: MemberAction } | null>(null);
  const [roleTarget, setRoleTarget] = useState<Member | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Member | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Payroll rates by teacher id (UX-2: the rate is set here, «Зарплата» only reads it). */
  const [rates, setRates] = useState<Record<string, PayrollRateItem>>({});
  const [rateTeacherId, setRateTeacherId] = useState<string | null>(null);
  const today = useMemo(() => formatBusinessDate(), []);
  const teacherParam = searchParams?.get("teacher") ?? null;
  /** The payroll month the link came from: the rate dialog starts the rate in it. */
  const monthParam = searchParams?.get("month") ?? null;
  
  // UI State
  const [activeTab, setActiveTab] = useState<"members" | "invites" | "former">("members");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", org_role: "teacher" });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [m, former, inv, rateList] = await Promise.all([
        orgApi.listMembers().catch(() => []),
        orgApi.listMembers("removed").catch(() => []),
        orgApi.listInvitations().catch(() => []),
        orgApi.getPayrollRates(today.slice(0, 7)).catch(() => null),
      ]);
      // An older server ignores `status` and answers the active staff: the removed list is then not trusted.
      const activeRows = (Array.isArray(m) ? m : (m as any)?.items || []) as Member[];
      setMembers(activeRows.filter((row) => row.is_active !== false));
      const formerRows = (Array.isArray(former) ? former : (former as any)?.items || []) as Member[];
      setFormerMembers(formerRows.filter((row) => row.is_active === false));
      setInvites(Array.isArray(inv) ? inv : (inv as any)?.items || []);
      setRates(Object.fromEntries((rateList?.items ?? []).map((item) => [item.teacher_id, item])));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // `?teacher=<id>` opens the rate dialog of that teacher (once the rates are in).
  const openedFromLink = useRef<string | null>(null);
  useEffect(() => {
    if (!teacherParam) { openedFromLink.current = null; return; }
    // once per link: closing (or saving) must not bring the dialog back while the address is still being cleaned
    if (rates[teacherParam] && openedFromLink.current !== teacherParam) {
      openedFromLink.current = teacherParam;
      setRateTeacherId(teacherParam);
    }
  }, [teacherParam, rates]);

  const closeRateDialog = () => {
    setRateTeacherId(null);
    if (teacherParam) router.replace("/owner/teachers", { scroll: false });
  };


  const handleInvite = async () => {
    const problem = inviteEmailError(inviteForm.email);
    if (problem) { setInviteError(problem); return; }
    setSaving(true);
    setInviteError(null);
    try {
      const result = await orgApi.createInvitation({
        email: normalizeEmail(inviteForm.email),
        org_role: inviteForm.org_role,
      });
      setNewCode(result.code);
      setInviteForm({ email: "", org_role: "teacher" });
      loadData();
    } catch (e: any) {
      setInviteError(inviteErrorText(e));
    } finally {
      setSaving(false);
    }
  };

  /** «Пригласить заново»: the dialog opens with the e-mail and the role of the lapsed invitation. */
  const inviteAgain = (inv: Invitation) => {
    setInviteForm({ email: inv.email ?? "", org_role: inv.org_role === "admin" ? "admin" : "teacher" });
    setInviteError(null);
    setNewCode(null);
    setShowInvite(true);
  };

  const confirmRestore = async () => {
    if (!restoreTarget || restoring) return;
    setRestoring(true);
    try {
      await opsApi.restoreMember(restoreTarget.member_id);
      const name = staffDisplayName(restoreTarget, "Без имени");
      setRestoreTarget(null);
      showToast(`${name} возвращён в команду`);
      setActiveTab("members");
      await loadData();
    } catch (e) {
      showToast(opsErrorCode(e) === "NOT_REMOVED" ? "Сотрудник уже в команде" : errorMessageOf(e, "Не удалось вернуть сотрудника"), "error");
      setRestoreTarget(null);
      await loadData();
    } finally {
      setRestoring(false);
    }
  };

  const handleCopy = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  // DELETE /org/members/{id} expects OrganizationMember.id (`member_id`), not the user id.
  // The dialog asks `removal-impact` first (groups, lessons in progress) and hands the groups over before it removes.
  const handleRemoveMember = (member: Member) => {
    if (!member.member_id) { showToast("Не удалось определить сотрудника. Обновите страницу.", "error"); return; }
    setMemberAction({ member, action: { kind: "remove" } });
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await orgApi.revokeInvitation(id);
      loadData();
    } catch (e: any) {
      alert(e.message || "Ошибка отмены");
    }
  };

  const now = new Date();
  const listedInvites = sortInvitations(invites, now);
  const pendingInvites = listedInvites.filter((inv) => inviteState(inv, now) === "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-500 animate-pulse">Загрузка сотрудников...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full max-w-[1400px] mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Сотрудники</h1>
          <p className="text-slate-500 mt-1 font-medium">Управление доступом и сотрудниками организации</p>
        </div>
        <button
          onClick={() => { setInviteForm({ email: "", org_role: "teacher" }); setInviteError(null); setShowInvite(true); setNewCode(null); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 active:scale-95 transition-all shadow-sm shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" /> Пригласить сотрудника
        </button>
      </div>

      {/* Custom Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl w-full max-w-2xl">
        <button
          onClick={() => setActiveTab("members")}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === "members" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Сотрудники ({members.length})
        </button>
        <button
          onClick={() => setActiveTab("invites")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === "invites" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Приглашения 
          {pendingInvites.length > 0 && (
            <span className={`px-2 py-0.5 rounded-md text-xs ${activeTab === "invites" ? "bg-primary-100 text-primary-700" : "bg-slate-200 text-slate-600"}`}>
              {pendingInvites.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("former")}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === "former" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Бывшие сотрудники{formerMembers.length > 0 ? ` (${formerMembers.length})` : ""}
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="popLayout" initial={false}>
        {activeTab === "members" ? (
          <motion.div
            key="members"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="space-y-6"
          >
            {members.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-slate-900 font-semibold mb-1">Пока только вы</h3>
                <p className="text-slate-500 text-sm max-w-sm">Пригласите преподавателей и администраторов, чтобы начать совместную работу.</p>
              </div>
            ) : (
              ["owner", "admin", "teacher"].map((roleKey) => {
                const groupMembers = members.filter((m) => m.org_role === roleKey);
                if (groupMembers.length === 0) return null;
                const rConfig = roleConfig[roleKey];
                return (
                  <div key={roleKey}>
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <rConfig.icon className="w-4 h-4 text-slate-400" />
                      <h3 className="text-sm font-semibold text-slate-500">
                        {rConfig.pluralLabel} ({groupMembers.length})
                      </h3>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden divide-y divide-slate-100">
                      {groupMembers.map((m, i) => (
                        <motion.div
                          key={m.member_id || m.id || m.user_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="group flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-slate-50/50 transition-colors gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${rConfig.color} flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0`}>
                              {(m.first_name || m.email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 flex items-center gap-2">
                                {staffDisplayName(m, "Без имени")}
                                {m.org_role === "owner" && <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">Вы</span>}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <p className="text-sm font-medium text-slate-500">{m.email}</p>
                              </div>
                              {rates[m.user_id || m.id] && (() => {
                                const line = rateItemLine(rates[m.user_id || m.id]);
                                return <p className={`mt-1 text-sm font-medium ${line.missing ? "text-amber-700" : "text-slate-600"}`}>{line.text}</p>;
                              })()}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 sm:ml-auto">
                            {rates[m.user_id || m.id] && (
                              <button
                                type="button"
                                onClick={() => setRateTeacherId(m.user_id || m.id)}
                                aria-label={`Изменить ставку: ${staffDisplayName(m, "Без имени")}`}
                                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-primary-200 hover:text-primary-700"
                              >
                                Изменить ставку
                              </button>
                            )}
                            {m.org_role !== "owner" && (
                              <button
                                type="button"
                                onClick={() => setRoleTarget(m)}
                                aria-label={`Сменить роль: ${staffDisplayName(m, "Без имени")}`}
                                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-primary-200 hover:text-primary-700"
                              >
                                Сменить роль
                              </button>
                            )}
                            {m.org_role !== "owner" ? (
                              <button
                                onClick={() => handleRemoveMember(m)}
                                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:!opacity-100"
                                title="Удалить сотрудника"
                                aria-label="Удалить сотрудника"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <div className="w-8" /> // Spacer for alignment
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        ) : activeTab === "invites" ? (
          <motion.div
            key="invites"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
          >
            <div className="divide-y divide-slate-100">
              {listedInvites.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Mail className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-slate-900 font-semibold mb-1">Нет активных приглашений</h3>
                  <p className="text-slate-500 text-sm max-w-sm">Все отправленные приглашения уже были приняты или отменены.</p>
                </div>
              ) : (
                listedInvites.map((inv) => {
                  const rConfig = roleConfig[inv.org_role] || roleConfig.teacher;
                  const expired = inviteState(inv, now) === "expired";
                  return (
                    <div key={inv.id} className={`group flex flex-col sm:flex-row sm:items-center justify-between p-6 transition-colors gap-4 ${expired ? "bg-slate-50/60" : "hover:bg-slate-50/50"}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className={`font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-sm ${expired ? "text-slate-400 line-through" : "text-slate-800"}`}>{inv.code}</p>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${rConfig.badge}`}>
                              {rConfig.label}
                            </span>
                            {expired && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold border border-slate-200 bg-slate-100 text-slate-500">{INVITE_EXPIRED_BADGE}</span>
                            )}
                          </div>
                          {inv.email && (
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 mt-1">
                              <Mail className="w-3.5 h-3.5" /> {inv.email}
                            </div>
                          )}
                          {!expired && inviteValidUntilText(inv.expires_at) && (
                            <p className="mt-1 text-xs font-medium text-slate-500">{inviteValidUntilText(inv.expires_at)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto">
                        {expired ? (
                          <button
                            type="button"
                            onClick={() => inviteAgain(inv)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary-600 hover:border-primary-200 rounded-xl transition-all text-sm font-medium shadow-sm"
                          >
                            <RotateCcw className="w-4 h-4" /> {INVITE_AGAIN_LABEL}
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleCopy(inv.code)} 
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary-600 hover:border-primary-200 rounded-xl transition-all text-sm font-medium shadow-sm"
                          >
                            {copied === inv.code ? (
                              <><CheckCircle className="w-4 h-4 text-emerald-500" /> Скопировано</>
                            ) : (
                              <><Copy className="w-4 h-4" /> Копировать ссылку</>
                            )}
                          </button>
                        )}
                        {!expired && (
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Отменить приглашение"
                            aria-label="Отменить приглашение"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="former"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
          >
            {formerMembers.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-slate-900 font-semibold mb-1">Бывших сотрудников нет</h3>
                <p className="text-slate-500 text-sm max-w-sm">Удалённые сотрудники появятся здесь — отсюда их можно вернуть в команду.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {formerMembers.map((m) => {
                  const rConfig = roleConfig[m.org_role] || roleConfig.teacher;
                  return (
                    <div key={m.member_id || m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-lg shrink-0">
                          {(m.first_name || m.email || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 flex flex-wrap items-center gap-2">
                            {staffDisplayName(m, "Без имени")}
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${rConfig.badge}`}>{rConfig.label}</span>
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-500">{m.email}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{removedOnText(m.removed_at)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRestoreTarget(m)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-primary-200 hover:text-primary-700 sm:ml-auto"
                      >
                        <RotateCcw className="h-4 w-4" /> {RESTORE_TITLE}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <TeacherRateDialog
        item={rateTeacherId ? rates[rateTeacherId] ?? null : null}
        today={today}
        month={monthParam}
        onClose={closeRateDialog}
        onSaved={(saved) => {
          setRates((previous) => ({ ...previous, [saved.teacher_id]: saved }));
          closeRateDialog();
          showToast("Ставка сохранена");
        }}
      />
      {toastNode}

      {memberAction && (
        <RemoveMemberDialog
          member={memberAction.member}
          action={memberAction.action}
          members={members}
          onClose={() => setMemberAction(null)}
          onDone={(message) => { setMemberAction(null); showToast(message); void loadData(); }}
        />
      )}

      <RoleChangeDialog
        member={roleTarget}
        onClose={() => setRoleTarget(null)}
        onNeedsHandover={(member, role) => { setRoleTarget(null); setMemberAction({ member, action: { kind: "role", role } }); }}
        onChanged={(message) => { setRoleTarget(null); showToast(message); void loadData(); }}
      />

      <Modal
        open={restoreTarget !== null}
        title={RESTORE_TITLE}
        onClose={() => setRestoreTarget(null)}
        busy={restoring}
        maxWidthClassName="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setRestoreTarget(null)} disabled={restoring} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button type="button" onClick={() => void confirmRestore()} disabled={restoring} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {restoring && <Loader2 className="h-4 w-4 animate-spin" />} {RESTORE_TITLE}
            </button>
          </>
        }
      >
        {restoreTarget && <p className="pb-1 text-sm leading-6 text-slate-700">{restoreConfirmText(staffDisplayName(restoreTarget, "Без имени"))}</p>}
      </Modal>

      {/* Invite dialog: the shared Modal (Escape, focus trap, scroll lock, the stack of dialogs) */}
      <Modal
        open={showInvite}
        title="Новый сотрудник"
        description="Сгенерируйте ссылку для приглашения"
        onClose={() => setShowInvite(false)}
        busy={saving}
        maxWidthClassName="max-w-lg"
        bodyClassName="p-6 sm:p-8 overflow-y-auto overscroll-contain min-h-0"
      >
        {newCode ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h4 className="text-2xl font-bold text-slate-900 mb-2">Приглашение готово!</h4>
            <p className="text-slate-500 mb-6">Отправьте эту ссылку сотруднику. Она позволит ему зарегистрироваться и сразу присоединиться к вашей организации.</p>
            
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4 mb-6">
              <div className="text-left overflow-hidden">
                <p className="text-xs font-semibold text-slate-500 mb-1">Код доступа</p>
                <p className="font-mono text-lg font-bold text-slate-900">{newCode}</p>
              </div>
              <button 
                onClick={() => handleCopy(newCode)} 
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  copied === newCode 
                    ? "bg-emerald-100 text-emerald-700" 
                    : "bg-primary-100 text-primary-700 hover:bg-primary-200"
                }`}
              >
                {copied === newCode ? "Скопировано!" : "Копировать"}
              </button>
            </div>
            
            <button 
              onClick={() => { setShowInvite(false); setNewCode(null); }}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors"
            >
              Готово
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <div>
              <span id="owner-invite-role-label" className="block text-sm font-bold text-slate-700 mb-2">Роль сотрудника</span>
              <div role="radiogroup" aria-labelledby="owner-invite-role-label" className="grid grid-cols-2 gap-3">
                <label className={`cursor-pointer border-2 rounded-xl p-4 transition-all ${
                  inviteForm.org_role === "teacher" ? "border-primary-500 bg-primary-50/50" : "border-slate-100 hover:border-slate-200"
                }`}>
                  <input type="radio" name="role" value="teacher" className="sr-only" 
                    checked={inviteForm.org_role === "teacher"} 
                    onChange={(e) => setInviteForm({ ...inviteForm, org_role: e.target.value })} 
                  />
                  <Users className={`w-6 h-6 mb-2 ${inviteForm.org_role === "teacher" ? "text-primary-600" : "text-slate-400"}`} />
                  <div className={`font-semibold ${inviteForm.org_role === "teacher" ? "text-primary-900" : "text-slate-700"}`}>Учитель</div>
                  <div className="text-xs text-slate-500 mt-1">Доступ к группам и диагностикам</div>
                </label>
                <label className={`cursor-pointer border-2 rounded-xl p-4 transition-all ${
                  inviteForm.org_role === "admin" ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"
                }`}>
                  <input type="radio" name="role" value="admin" className="sr-only" 
                    checked={inviteForm.org_role === "admin"} 
                    onChange={(e) => setInviteForm({ ...inviteForm, org_role: e.target.value })} 
                  />
                  <Shield className={`w-6 h-6 mb-2 ${inviteForm.org_role === "admin" ? "text-blue-600" : "text-slate-400"}`} />
                  <div className={`font-semibold ${inviteForm.org_role === "admin" ? "text-blue-900" : "text-slate-700"}`}>Администратор</div>
                  <div className="text-xs text-slate-500 mt-1">Доступ ко всем данным школы</div>
                </label>
              </div>
              {inviteForm.org_role === "admin" && (
                <p className="mt-2 text-xs font-medium text-slate-500">{INVITE_ADMIN_HINT}</p>
              )}
            </div>

            <div>
              <label htmlFor="owner-invite-email-dlya-priglasheniya" className="block text-sm font-bold text-slate-700 mb-2">
                Email сотрудника
              </label>
              <input
                id="owner-invite-email-dlya-priglasheniya"
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => { setInviteForm({ ...inviteForm, email: e.target.value }); setInviteError(null); }}
                aria-invalid={Boolean(inviteError)}
                placeholder="Например, ivan@school.com"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium placeholder:text-slate-400"
              />
              <p className="text-xs font-medium text-slate-500 mt-2">
                Приглашение привязано к этому email: зарегистрироваться по ссылке сможет только его владелец. Ссылка действует 7 дней.
              </p>
              {inviteError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{inviteError}</p>}
            </div>

            <div className="pt-2">
              <button
                onClick={handleInvite}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98]"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Сгенерировать ссылку</>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}


/**
 * Role of a member: teacher <-> administrator.  A teacher with groups cannot become an administrator (the server refuses with
 * MEMBER_HAS_ASSIGNMENTS): the handover dialog takes over from there.
 */
function RoleChangeDialog({
  member,
  onClose,
  onNeedsHandover,
  onChanged,
}: {
  member: Member | null;
  onClose: () => void;
  onNeedsHandover: (member: Member, role: string) => void;
  onChanged: (message: string) => void;
}) {
  const [role, setRole] = useState("teacher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (member) { setRole(member.org_role === "admin" ? "teacher" : "admin"); setError(null); }
  }, [member]);
  if (!member) return null;
  const name = staffDisplayName(member, "Без имени");
  const submit = async () => {
    if (busy || role === member.org_role) return;
    setBusy(true);
    setError(null);
    try {
      await orgApi.updateMemberRole(member.member_id, role);
      onChanged(`Роль изменена: ${name}`);
    } catch (e) {
      if (opsErrorCode(e) === "MEMBER_HAS_ASSIGNMENTS") onNeedsHandover(member, role);
      else setError(errorMessageOf(e, "Не удалось изменить роль"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title="Изменить роль"
      description={name}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button type="button" onClick={() => void submit()} disabled={busy || role === member.org_role} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Изменить роль
          </button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        <div role="radiogroup" aria-label="Роль сотрудника" className="grid grid-cols-2 gap-3">
          {(["teacher", "admin"] as const).map((key) => (
            <label key={key} className={`cursor-pointer rounded-xl border-2 p-3.5 text-sm font-semibold transition-all ${role === key ? "border-primary-500 bg-primary-50/50 text-primary-900" : "border-slate-100 text-slate-700 hover:border-slate-200"}`}>
              <input type="radio" name="member-role" value={key} className="sr-only" checked={role === key} onChange={() => setRole(key)} />
              {roleConfig[key].label}
            </label>
          ))}
        </div>
        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}
