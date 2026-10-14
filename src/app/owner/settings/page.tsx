"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Settings, Building2, Save, CheckCircle, Shield, Key, Wallet, LucideIcon } from "lucide-react";
import {
  DEFAULT_PAYMENT_SETTINGS,
  diffPaymentSettings,
  EXPIRING_DAYS_RANGE,
  EXPIRING_LESSONS_RANGE,
  LESSONS_PER_PAYMENT_RANGE,
  validatePaymentSettings,
  type PaymentSettings,
  type PeriodMode,
} from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveText?: string;
  disabledSave?: boolean;
}

function SettingsSection({
  title, description, icon: Icon, children,
  onSave, saving, saved, saveText = "Сохранить", disabledSave = false
}: SettingsSectionProps) {
  return (
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
}

const inputClasses = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium text-slate-900";
const labelClasses = "block text-sm font-semibold text-slate-700 mb-1.5";

const numberInputClasses = `${inputClasses} !w-24`;

const PERIOD_MODES: Array<{ key: PeriodMode; title: string; hint: string }> = [
  { key: "calendar", title: "Календарный период", hint: "Оплата действует до выбранной даты" },
  { key: "lessons", title: "По урокам", hint: "Оплата закрывает заданное число проведённых уроков" },
];

/** «Оплаты»: how the center counts the paid period and whether administrators may enter payments. */
function PaymentsSettingsSection() {
  const [loaded, setLoaded] = useState<PaymentSettings | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [form, setForm] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);

  useEffect(() => {
    let cancelled = false;
    orgApi.getPaymentSettings()
      .then((data) => {
        if (cancelled) return;
        const next = { ...DEFAULT_PAYMENT_SETTINGS, ...data };
        setLoaded(next);
        setForm(next);
      })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
  }, []);

  // Nothing is shown until the server confirms the owner may read the settings.
  if (unavailable || !loaded) return null;

  const patch = (next: Partial<PaymentSettings>) => {
    setSaved(false);
    setError(null);
    setForm((previous) => ({ ...previous, ...next }));
  };

  const handleSave = async () => {
    const problem = validatePaymentSettings(form);
    if (problem) { setError(problem); return; }
    const changes = diffPaymentSettings(loaded, form);
    if (Object.keys(changes).length === 0) { setSaved(true); setTimeout(() => setSaved(false), 3000); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await orgApi.updatePaymentSettings(changes);
      const next = { ...DEFAULT_PAYMENT_SETTINGS, ...updated };
      setLoaded(next);
      setForm(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void refreshSummary(true, { recheck: true });
    } catch (e: any) {
      setError(e.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="Оплаты"
      description="Как центр считает оплаченный период и кто может вносить оплаты."
      icon={Wallet}
      onSave={handleSave}
      saving={saving}
      saved={saved}
    >
      <div>
        <p className={labelClasses}>Период оплаты</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PERIOD_MODES.map((option) => (
            <label
              key={option.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${form.period_mode === option.key ? "border-primary-400 bg-primary-50/60" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <input
                type="radio"
                name="payments-period-mode"
                checked={form.period_mode === option.key}
                onChange={() => patch({ period_mode: option.key })}
                className="mt-1 h-4 w-4 accent-primary-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                <span className="block text-xs text-slate-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {form.period_mode === "lessons" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="payments-lessons" className={labelClasses}>Уроков в одной оплате</label>
            <input
              id="payments-lessons"
              type="number"
              min={LESSONS_PER_PAYMENT_RANGE.min}
              max={LESSONS_PER_PAYMENT_RANGE.max}
              value={Number.isNaN(form.lessons_per_payment) ? "" : form.lessons_per_payment}
              onChange={(e) => patch({ lessons_per_payment: e.target.value === "" ? NaN : Number(e.target.value) })}
              className={numberInputClasses}
            />
          </div>
          <div>
            <label htmlFor="payments-expiring-lessons" className={labelClasses}>Предупреждать, когда останется уроков</label>
            <input
              id="payments-expiring-lessons"
              type="number"
              min={EXPIRING_LESSONS_RANGE.min}
              max={EXPIRING_LESSONS_RANGE.max}
              value={Number.isNaN(form.expiring_lessons) ? "" : form.expiring_lessons}
              onChange={(e) => patch({ expiring_lessons: e.target.value === "" ? NaN : Number(e.target.value) })}
              className={numberInputClasses}
            />
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="payments-expiring-days" className={labelClasses}>Предупреждать за сколько дней до конца оплаты</label>
          <input
            id="payments-expiring-days"
            type="number"
            min={EXPIRING_DAYS_RANGE.min}
            max={EXPIRING_DAYS_RANGE.max}
            value={Number.isNaN(form.expiring_days) ? "" : form.expiring_days}
            onChange={(e) => patch({ expiring_days: e.target.value === "" ? NaN : Number(e.target.value) })}
            className={numberInputClasses}
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
        <div>
          <p id="payments-admin-label" className="text-sm font-semibold text-slate-900">Администратор может вносить оплаты</p>
          <p className="mt-0.5 text-xs text-slate-500">Администратор увидит суммы оплат; зарплата остаётся скрытой.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.admin_can_manage}
          aria-labelledby="payments-admin-label"
          onClick={() => patch({ admin_can_manage: !form.admin_can_manage })}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${form.admin_can_manage ? "bg-primary-600" : "bg-slate-300"}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.admin_can_manage ? "translate-x-5" : ""}`} />
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</p>
      )}
    </SettingsSection>
  );
}

export default function OwnerSettingsPage() {
  const { org, user } = useAuthStore();
  // The route is open to administrators too; payments settings belong to the owner only.
  const isOwner = (user?.role || user?.org_role) === "owner";

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
      const updated = await orgApi.update(orgForm);
      useAuthStore.setState((state) => ({
        org: { ...state.org, ...(updated ?? orgForm) },
      }));
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
      const updated = await authApi.updateProfile(profileForm);
      useAuthStore.setState((state) => ({
        user: { ...state.user, ...(updated ?? profileForm) },
      }));
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

        {isOwner && <PaymentsSettingsSection />}

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