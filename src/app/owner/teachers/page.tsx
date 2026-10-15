"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Users, Plus, Copy, CheckCircle, X, Shield, Trash2, Mail, Clock, ShieldCheck } from "lucide-react";

interface Member {
  id: string; // user id
  member_id: string; // OrganizationMember.id (use for remove / role change)
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  org_role: string;
  is_active: boolean;
  joined_at: string | null;
}

interface Invitation {
  id: string;
  code: string;
  email: string | null;
  org_role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

const roleConfig: Record<string, { label: string; pluralLabel: string; color: string; badge: string; icon: React.ElementType }> = {
  owner: { label: "Владелец", pluralLabel: "Владелец", color: "from-violet-500 to-purple-600", badge: "bg-violet-50 text-violet-700 border-violet-100", icon: ShieldCheck },
  admin: { label: "Администратор", pluralLabel: "Администраторы", color: "from-blue-500 to-indigo-600", badge: "bg-blue-50 text-blue-700 border-blue-100", icon: Shield },
  teacher: { label: "Учитель", pluralLabel: "Учителя", color: "from-emerald-400 to-emerald-600", badge: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: Users },
};

export default function OwnerTeachersPage() {
  const { org } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [activeTab, setActiveTab] = useState<"members" | "invites">("members");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", org_role: "teacher" });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadData = async () => {
    try {
      const [m, inv] = await Promise.all([
        orgApi.listMembers().catch(() => []),
        orgApi.listInvitations().catch(() => []),
      ]);
      setMembers(Array.isArray(m) ? m : (m as any)?.items || []);
      setInvites(Array.isArray(inv) ? inv : (inv as any)?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); setMounted(true); }, []);

  useEffect(() => {
    if (showInvite) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      document.documentElement.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      document.documentElement.style.overflow = "unset";
    };
  }, [showInvite]);

  const handleInvite = async () => {
    setSaving(true);
    try {
      const result = await orgApi.createInvitation({
        email: inviteForm.email || undefined,
        org_role: inviteForm.org_role,
      });
      setNewCode(result.code);
      setInviteForm({ email: "", org_role: "teacher" });
      loadData();
    } catch (e: any) {
      alert(e.message || "Ошибка приглашения");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  // DELETE /org/members/{id} expects OrganizationMember.id (`member_id`), not the user id.
  const handleRemoveMember = async (memberId?: string) => {
    if (!memberId) { alert("Не удалось определить сотрудника. Обновите страницу."); return; }
    if (!confirm("Удалить сотрудника из организации? Это действие нельзя отменить.")) return;
    try {
      await orgApi.removeMember(memberId);
      loadData();
    } catch (e: any) {
      alert(e.message || "Ошибка удаления");
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await orgApi.revokeInvitation(id);
      loadData();
    } catch (e: any) {
      alert(e.message || "Ошибка отмены");
    }
  };

  const pendingInvites = invites.filter(inv => inv.status === "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-500 animate-pulse">Загрузка команды...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full max-w-[1400px] mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Команда</h1>
          <p className="text-slate-500 mt-1 font-medium">Управление доступом и сотрудниками организации</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setNewCode(null); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 active:scale-95 transition-all shadow-sm shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" /> Пригласить сотрудника
        </button>
      </div>

      {/* Custom Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl w-full max-w-md">
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
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
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
                                {m.full_name || `${m.last_name || ""} ${m.first_name || ""}`.trim() || "Без имени"}
                                {m.org_role === "owner" && <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">Вы</span>}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <p className="text-sm font-medium text-slate-500">{m.email}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 sm:ml-auto">
                            {m.org_role !== "owner" ? (
                              <button
                                onClick={() => handleRemoveMember(m.member_id)}
                                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all sm:opacity-0 group-hover:opacity-100"
                                title="Удалить сотрудника"
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
        ) : (
          <motion.div
            key="invites"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
          >
            <div className="divide-y divide-slate-100">
              {pendingInvites.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Mail className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-slate-900 font-semibold mb-1">Нет активных приглашений</h3>
                  <p className="text-slate-500 text-sm max-w-sm">Все отправленные приглашения уже были приняты или отменены.</p>
                </div>
              ) : (
                pendingInvites.map((inv) => {
                  const rConfig = roleConfig[inv.org_role] || roleConfig.teacher;
                  return (
                    <div key={inv.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-slate-50/50 transition-colors gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-sm">{inv.code}</p>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${rConfig.badge}`}>
                              {rConfig.label}
                            </span>
                          </div>
                          {inv.email && (
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 mt-1">
                              <Mail className="w-3.5 h-3.5" /> {inv.email}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto">
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
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="Отменить приглашение"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Modal Overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {showInvite && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
              >
                {/* Modal Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Новый сотрудник</h3>
                    <p className="text-sm text-slate-500 mt-1">Сгенерируйте ссылку для приглашения</p>
                  </div>
                  <button 
                    onClick={() => setShowInvite(false)} 
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-8">
                  {newCode ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                      </div>
                      <h4 className="text-2xl font-bold text-slate-900 mb-2">Приглашение готово!</h4>
                      <p className="text-slate-500 mb-6">Отправьте эту ссылку сотруднику. Она позволит ему зарегистрироваться и сразу присоединиться к вашей организации.</p>
                      
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4 mb-6">
                        <div className="text-left overflow-hidden">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Код доступа</p>
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
                        <label className="block text-sm font-bold text-slate-700 mb-2">Роль сотрудника</label>
                        <div className="grid grid-cols-2 gap-3">
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
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          Email для приглашения <span className="text-slate-400 font-normal">(опционально)</span>
                        </label>
                        <input
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                          placeholder="Например, ivan@school.com"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium placeholder:text-slate-400"
                        />
                        <p className="text-xs font-medium text-slate-500 mt-2">
                          Если указать email, код будет привязан именно к нему. Иначе — любой сможет зарегистрироваться по ссылке.
                        </p>
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
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
}
