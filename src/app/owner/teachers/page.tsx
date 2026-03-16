"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Users, Plus, Copy, CheckCircle, X, Shield, Trash2 } from "lucide-react";

interface Member {
  id: string;
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

const roleBadge: Record<string, { label: string; color: string }> = {
  owner: { label: "Владелец", color: "bg-violet-50 text-violet-700" },
  admin: { label: "Администратор", color: "bg-blue-50 text-blue-700" },
  teacher: { label: "Учитель", color: "bg-emerald-50 text-emerald-700" },
};

export default function OwnerTeachersPage() {
  const { org } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", org_role: "teacher" });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

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

  useEffect(() => { loadData(); }, []);

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
    const link = `${window.location.origin}/invite?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Удалить сотрудника из организации?")) return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Сотрудники</h1>
          <p className="text-slate-500 mt-1">Управление командой организации</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setNewCode(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Пригласить
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Пригласить сотрудника</h3>
            <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          {newCode ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-slate-700 mb-2">Приглашение создано!</p>
              <div className="flex items-center justify-center gap-2">
                <code className="px-4 py-2 bg-slate-100 rounded-xl text-lg font-mono">{newCode}</code>
                <button onClick={() => handleCopy(newCode)} className="p-2 hover:bg-slate-100 rounded-lg">
                  {copied === newCode ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5 text-slate-400" />}
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                Ссылка: {window.location.origin}/invite?code={newCode}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email (необязательно)</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="teacher@example.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Роль</label>
                  <select
                    value={inviteForm.org_role}
                    onChange={(e) => setInviteForm({ ...inviteForm, org_role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="teacher">Учитель</option>
                    <option value="admin">Администратор</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleInvite}
                  disabled={saving}
                  className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Создание..." : "Создать приглашение"}
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Members */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Команда ({members.length})</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {members.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Только вы в организации</div>
          ) : (
            members.map((m, i) => (
              <motion.div
                key={m.id || m.user_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-25"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm">
                    {(m.first_name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {m.full_name || `${m.last_name || ""} ${m.first_name || ""}`}
                    </p>
                    <p className="text-sm text-slate-400">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    roleBadge[m.org_role]?.color || "bg-slate-100 text-slate-600"
                  }`}>
                    {roleBadge[m.org_role]?.label || m.org_role}
                  </span>
                  {m.org_role !== "owner" && (
                    <button
                      onClick={() => handleRemoveMember(m.id || m.user_id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Pending invitations */}
      {invites.filter(inv => inv.status === "pending").length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Ожидающие приглашения</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {invites.filter(inv => inv.status === "pending").map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-mono text-sm text-slate-700">{inv.code}</p>
                  <p className="text-xs text-slate-400">
                    {inv.email || "Без email"} · {roleBadge[inv.org_role]?.label || inv.org_role}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleCopy(inv.code)} className="p-2 hover:bg-slate-100 rounded-lg">
                    {copied === inv.code ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
