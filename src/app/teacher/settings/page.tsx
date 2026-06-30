"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { User, Lock, Save } from "lucide-react";

export default function TeacherSettingsPage() {
  const { user, updateUser } = useAuthStore();

  const [profile, setProfile] = useState({ first_name: user?.first_name || "", last_name: user?.last_name || "", email: user?.email || "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState("");

  const handleProfile = async () => {
    setSavingProfile(true);
    setMsg("");
    try {
      const updated = await authApi.updateProfile(profile);
      updateUser(updated);
      setMsg("Профиль обновлён");
    } catch (e: any) { setMsg(e.message || "Ошибка"); }
    finally { setSavingProfile(false); }
  };

  const handlePw = async () => {
    if (pw.new_password !== pw.confirm) { setMsg("Пароли не совпадают"); return; }
    setSavingPw(true);
    setMsg("");
    try {
      await authApi.changePassword(pw.current_password, pw.new_password);
      setPw({ current_password: "", new_password: "", confirm: "" });
      setMsg("Пароль изменён");
    } catch (e: any) { setMsg(e.message || "Ошибка"); }
    finally { setSavingPw(false); }
  };

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900">Настройки</h1>

      {msg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-primary-50 text-primary-700 text-sm">{msg}</motion.div>
      )}

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-slate-900">Профиль</h2>
        </div>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} placeholder="Имя" className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            <input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} placeholder="Фамилия" className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="Email" type="email" className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          <div className="flex justify-end">
            <button onClick={handleProfile} disabled={savingProfile} className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {savingProfile ? "..." : "Сохранить"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Password */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-slate-900">Сменить пароль</h2>
        </div>
        <div className="grid gap-4">
          <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} placeholder="Текущий пароль" className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} placeholder="Новый пароль" className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Подтвердите пароль" className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          <div className="flex justify-end">
            <button onClick={handlePw} disabled={savingPw || !pw.current_password || !pw.new_password} className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50">
              <Lock className="w-4 h-4" /> {savingPw ? "..." : "Изменить"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
