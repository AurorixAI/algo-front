"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Settings, Building2, Save, CheckCircle, Shield, Key } from "lucide-react";

export default function OwnerSettingsPage() {
  const { org, user } = useAuthStore();
  
  // Forms
  const [orgForm, setOrgForm] = useState({ name: "", city: "", phone: "" });
  const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", language: "ru" });
  const [passwordForm, setPasswordForm] = useState({ old_password: "", new_password: "", confirm: "" });
  
  // Loading States
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  
  // Success States
  const [savedOrg, setSavedOrg] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (org) setOrgForm({ name: org.name || "", city: org.city || "", phone: org.phone || "" });
    if (user) setProfileForm({ first_name: user.first_name || "", last_name: user.last_name || "", language: user.language || "ru" });
  }, [org, user]);

  const handleSaveOrg = async () => {
    setSavingOrg(true);
    try {
      await orgApi.update(orgForm);
      setSavedOrg(true);
      setTimeout(() => setSavedOrg(false), 3000);
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
      setTimeout(() => setSavedProfile(false), 3000);
    } catch (e: any) {
      alert(e.message || "Ошибка сохранения");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setPasswordMsg({ type: 'error', text: "Новые пароли не совпадают" });
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordMsg({ type: 'error', text: "Пароль должен содержать минимум 6 символов" });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await authApi.changePassword(passwordForm.old_password, passwordForm.new_password);
      setPasswordMsg({ type: 'success', text: "Пароль успешно изменён" });
      setPasswordForm({ old_password: "", new_password: "", confirm: "" });
      setTimeout(() => setPasswordMsg(null), 4000);
    } catch (e: any) {
      setPasswordMsg({ type: 'error', text: e.message || "Ошибка смены пароля" });
    } finally {
      setSavingPassword(false);
    }
  };

  // Section Component
  const SettingsSection = ({ 
    title, description, icon: Icon, children, 
    onSave, saving, saved, saveText = "Сохранить", disabledSave = false 
  }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col lg:flex-row gap-8 py-8 border-b border-slate-200 last:border-0"
    >
      <div className="lg:w-1/3 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-sm">
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed ml-[52px]">{description}</p>
      </div>
      
      <div className="lg:w-2/3 bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 sm:p-8">
        <div className="space-y-6">
          {children}
          
          <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={onSave}
              disabled={saving || disabledSave || saved}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                saved 
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                  : "bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : saved ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : null}
              {saved ? "Сохранено" : saving ? "Сохранение..." : saveText}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const inputClasses = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium text-slate-900";
  const labelClasses = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Настройки рабочей области</h1>
        <p className="text-slate-500 mt-1 font-medium">Управляйте данными организации и вашим личным профилем</p>
      </div>

      <div className="bg-white/50 rounded-3xl p-2 sm:p-6 lg:p-8 border border-slate-200/50 shadow-sm">
        
        {/* Organization Section */}
        <SettingsSection
          title="Организация"
          description="Общие данные вашей организации. Они будут отображаться в приглашениях и отчетах."
          icon={Building2}
          onSave={handleSaveOrg}
          saving={savingOrg}
          saved={savedOrg}
        >
          <div>
            <label className={labelClasses}>Название организации</label>
            <input
              value={orgForm.name}
              onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
              className={inputClasses}
              placeholder="Например, Школа Алгоритмики"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={labelClasses}>Город</label>
              <input
                value={orgForm.city}
                onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })}
                className={inputClasses}
                placeholder="Москва"
              />
            </div>
            <div>
              <label className={labelClasses}>Телефон</label>
              <input
                value={orgForm.phone}
                onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                className={inputClasses}
                placeholder="+7 (999) 000-00-00"
              />
            </div>
          </div>
        </SettingsSection>

        {/* Profile Section */}
        <SettingsSection
          title="Личный профиль"
          description="Ваши личные данные. Имя и фамилия будут видны другим сотрудникам организации."
          icon={Settings}
          onSave={handleSaveProfile}
          saving={savingProfile}
          saved={savedProfile}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={labelClasses}>Имя</label>
              <input
                value={profileForm.first_name}
                onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>Фамилия</label>
              <input
                value={profileForm.last_name}
                onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                className={inputClasses}
              />
            </div>
          </div>
          <div>
            <label className={labelClasses}>Язык интерфейса</label>
            <select
              value={profileForm.language}
              onChange={(e) => setProfileForm({ ...profileForm, language: e.target.value })}
              className={inputClasses}
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>
        </SettingsSection>

        {/* Security Section */}
        <SettingsSection
          title="Безопасность"
          description="Изменение пароля для доступа к вашей учетной записи. Используйте надежный пароль."
          icon={Key}
          onSave={handleChangePassword}
          saving={savingPassword}
          saved={passwordMsg?.type === 'success'}
          saveText="Обновить пароль"
          disabledSave={!passwordForm.old_password || !passwordForm.new_password}
        >
          <div className="space-y-6">
            <div>
              <label className={labelClasses}>Текущий пароль</label>
              <input
                type="password"
                value={passwordForm.old_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                className={inputClasses}
                placeholder="••••••••"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className={labelClasses}>Новый пароль</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className={inputClasses}
                  placeholder="Минимум 6 символов"
                />
              </div>
              <div>
                <label className={labelClasses}>Повторите пароль</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  className={inputClasses}
                  placeholder="••••••••"
                />
              </div>
            </div>
            
            {/* Password Message */}
            {passwordMsg && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                  passwordMsg.type === 'success' 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                    : "bg-rose-50 text-rose-700 border border-rose-100"
                }`}
              >
                {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                {passwordMsg.text}
              </motion.div>
            )}
          </div>
        </SettingsSection>

      </div>
    </div>
  );
}
