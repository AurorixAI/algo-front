"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { User, Lock, Save } from "lucide-react";
import { DaysOffPanel } from "@/components/schedule/days-off-panel";
import { canManageMoney } from "@/lib/money-effects";
import { ReadonlyEmailField } from "@/components/settings/readonly-email-field";
import { profileUpdateBody } from "@/lib/profile-form";
import { newPasswordProblem, PASSWORD_HINT } from "@/lib/set-password";

export default function AdminSettingsPage() {
  const { user, updateUser } = useAuthStore();
  const moneyRight = canManageMoney(user);
  const uid = useId();

  const [profile, setProfile] = useState({ first_name: user?.first_name || "", last_name: user?.last_name || "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState("");

  const handleProfile = async () => {
    setSavingProfile(true);
    setMsg("");
    try {
      const updated = await authApi.updateProfile(profileUpdateBody(profile));
      updateUser(updated);
      setMsg("Профиль обновлён");
    } catch (e: any) { setMsg(e.message || "Ошибка"); }
    finally { setSavingProfile(false); }
  };

  const handlePw = async () => {
    if (pw.new_password !== pw.confirm) { setMsg("Пароли не совпадают"); return; }
    const problem = newPasswordProblem(pw.new_password);
    if (problem) { setMsg(problem); return; }
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
      <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Настройки</h1>

      {msg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-primary-50 text-primary-700 text-sm">{msg}</motion.div>
      )}

      {/* PAY-F: «Выходной день центра» (owner and administrator).  UX pack №7: an administrator WITHOUT the money access can only read it - the card is short and stands below his own settings */}
      {moneyRight && <DaysOffPanel />}

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-slate-900">Профиль</h2>
        </div>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-first-name`} className="block text-sm font-semibold text-slate-700 mb-1.5">Имя</label>
              <input id={`${uid}-first-name`} value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} placeholder="Имя" className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor={`${uid}-last-name`} className="block text-sm font-semibold text-slate-700 mb-1.5">Фамилия</label>
              <input id={`${uid}-last-name`} value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} placeholder="Фамилия" className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
          </div>
          <ReadonlyEmailField id={`${uid}-email`} email={user?.email} labelClassName="block text-sm font-semibold text-slate-700 mb-1.5" inputClassName="w-full px-3 py-2 border border-slate-200 rounded-xl" />
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
          <div>
            <label htmlFor={`${uid}-current-password`} className="block text-sm font-semibold text-slate-700 mb-1.5">Текущий пароль</label>
            <input id={`${uid}-current-password`} type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} placeholder="Текущий пароль" className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label htmlFor={`${uid}-new-password`} className="block text-sm font-semibold text-slate-700 mb-1.5">Новый пароль</label>
            <input id={`${uid}-new-password`} type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} placeholder={PASSWORD_HINT} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label htmlFor={`${uid}-confirm-password`} className="block text-sm font-semibold text-slate-700 mb-1.5">Подтвердите пароль</label>
            <input id={`${uid}-confirm-password`} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Подтвердите пароль" className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div className="flex justify-end">
            <button onClick={handlePw} disabled={savingPw || !pw.current_password || !pw.new_password} className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50">
              <Lock className="w-4 h-4" /> {savingPw ? "..." : "Изменить"}
            </button>
          </div>
        </div>
      </motion.div>

      {!moneyRight && <DaysOffPanel />}
    </div>
  );
}
