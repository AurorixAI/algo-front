"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Settings, Building2, Save, CheckCircle } from "lucide-react";

export default function OwnerSettingsPage() {
  const { org, user } = useAuthStore();
  const [orgForm, setOrgForm] = useState({ name: "", city: "", phone: "" });
  const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", language: "ru" });
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedOrg, setSavedOrg] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old_password: "", new_password: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  useEffect(() => {
    if (org) setOrgForm({ name: org.name || "", city: org.city || "", phone: org.phone || "" });
    if (user) setProfileForm({ first_name: user.first_name || "", last_name: user.last_name || "", language: user.language || "ru" });
  }, [org, user]);

  const handleSaveOrg = async () => {
    setSavingOrg(true);
    try {
      await orgApi.update(orgForm);
      setSavedOrg(true);
      setTimeout(() => setSavedOrg(false), 2000);
    } catch (e: any) {
      alert(e.message || "Ошибка сохранения");
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await authApi.updateProfile(profileForm);
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
    } catch (e: any) {
      alert(e.message || "Ошибка сохранения");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setPasswordMsg("Пароли не совпадают");
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordMsg("Минимум 6 символов");
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await authApi.changePassword(passwordForm.old_password, passwordForm.new_password);
      setPasswordMsg("Пароль изменён");
      setPasswordForm({ old_password: "", new_password: "", confirm: "" });
    } catch (e: any) {
      setPasswordMsg(e.message || "Ошибка смены пароля");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Настройки</h1>
        <p className="text-slate-500 mt-1">Организация и профиль</p>
      </div>

      {/* Organization settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-slate-900">Организация</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
            <input
              value={orgForm.name}
              onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Город</label>
              <input
                value={orgForm.city}
                onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Телефон</label>
              <input
                value={orgForm.phone}
                onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveOrg}
              disabled={savingOrg}
              className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {savedOrg ? <><CheckCircle className="w-4 h-4" /> Сохранено</> : <><Save className="w-4 h-4" /> {savingOrg ? "Сохранение..." : "Сохранить"}</>}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Profile settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-slate-900">Профиль</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Имя</label>
              <input
                value={profileForm.first_name}
                onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Фамилия</label>
              <input
                value={profileForm.last_name}
                onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {savedProfile ? <><CheckCircle className="w-4 h-4" /> Сохранено</> : <><Save className="w-4 h-4" /> {savingProfile ? "Сохранение..." : "Сохранить"}</>}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Change password */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Сменить пароль</h2>
        <div className="space-y-4">
          <input
            type="password"
            placeholder="Текущий пароль"
            value={passwordForm.old_password}
            onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <div className="grid grid-cols-2 gap-4">
            <input
              type="password"
              placeholder="Новый пароль"
              value={passwordForm.new_password}
              onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <input
              type="password"
              placeholder="Повторите пароль"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          {passwordMsg && (
            <p className={`text-sm ${passwordMsg.includes("изменён") ? "text-emerald-600" : "text-red-500"}`}>{passwordMsg}</p>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleChangePassword}
              disabled={savingPassword || !passwordForm.old_password || !passwordForm.new_password}
              className="px-5 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              {savingPassword ? "Сохранение..." : "Сменить пароль"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
