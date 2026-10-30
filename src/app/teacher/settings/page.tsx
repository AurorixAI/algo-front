"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { CheckCircle2, KeyRound, Save, ShieldCheck, User, type LucideIcon } from "lucide-react";

type Feedback = { type: "success" | "error"; text: string } | null;

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveText: string;
  disabledSave?: boolean;
}

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  onSave,
  saving,
  saved,
  saveText,
  disabledSave = false,
}: SettingsSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 border-b border-slate-200 py-8 last:border-b-0 lg:flex-row lg:gap-8"
    >
      <div className="shrink-0 lg:w-1/3">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 shadow-sm">
            <Icon className="h-5 w-5 text-slate-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <p className="ml-[52px] text-sm leading-relaxed text-slate-500">{description}</p>
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm sm:p-8 lg:w-2/3">
        <div className="space-y-6">
          {children}

          <div className="mt-6 flex justify-end border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || disabledSave || saved}
              className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                saved
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "bg-slate-900 text-white shadow-sm hover:bg-slate-800"
              }`}
            >
              {saving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : saved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Сохранено" : saving ? "Сохранение..." : saveText}
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

const inputClasses =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-medium text-slate-900 transition-all placeholder:font-normal placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20";
const labelClasses = "mb-1.5 block text-sm font-semibold text-slate-700";

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;

  const success = feedback.type === "success";
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
        success
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-rose-100 bg-rose-50 text-rose-700"
      }`}
    >
      {success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
      {feedback.text}
    </motion.div>
  );
}

export default function TeacherSettingsPage() {
  const { user, updateUser } = useAuthStore();

  const [profile, setProfile] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
  });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  const handleProfile = async () => {
    setSavingProfile(true);
    setProfileFeedback(null);
    try {
      const updated = await authApi.updateProfile(profile);
      updateUser(updated);
      setProfileFeedback({ type: "success", text: "Данные профиля обновлены" });
    } catch (error: any) {
      setProfileFeedback({ type: "error", text: error.message || "Не удалось сохранить профиль" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async () => {
    if (pw.new_password !== pw.confirm) {
      setPasswordFeedback({ type: "error", text: "Новые пароли не совпадают" });
      return;
    }

    setSavingPw(true);
    setPasswordFeedback(null);
    try {
      await authApi.changePassword(pw.current_password, pw.new_password);
      setPw({ current_password: "", new_password: "", confirm: "" });
      setPasswordFeedback({ type: "success", text: "Пароль успешно изменён" });
    } catch (error: any) {
      setPasswordFeedback({ type: "error", text: error.message || "Не удалось изменить пароль" });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] pb-12">
      <header className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Настройки</h1>
        <p className="mt-1 font-medium text-slate-500">Управляйте данными профиля и безопасностью учётной записи</p>
      </header>

      <div className="rounded-3xl border border-slate-200/50 bg-white/50 p-2 shadow-sm sm:p-6 lg:p-8">
        <SettingsSection
          title="Профиль"
          description="Имя, фамилия и почта используются для вашей учётной записи и видны в рабочем пространстве."
          icon={User}
          onSave={handleProfile}
          saving={savingProfile}
          saved={profileFeedback?.type === "success"}
          saveText="Сохранить изменения"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className={labelClasses} htmlFor="teacher-settings-first-name">Имя</label>
              <input
                id="teacher-settings-first-name"
                value={profile.first_name}
                onChange={(event) => {
                  setProfile({ ...profile, first_name: event.target.value });
                  setProfileFeedback(null);
                }}
                className={inputClasses}
                placeholder="Ваше имя"
              />
            </div>
            <div>
              <label className={labelClasses} htmlFor="teacher-settings-last-name">Фамилия</label>
              <input
                id="teacher-settings-last-name"
                value={profile.last_name}
                onChange={(event) => {
                  setProfile({ ...profile, last_name: event.target.value });
                  setProfileFeedback(null);
                }}
                className={inputClasses}
                placeholder="Ваша фамилия"
              />
            </div>
          </div>
          <div>
            <label className={labelClasses} htmlFor="teacher-settings-email">Электронная почта</label>
            <input
              id="teacher-settings-email"
              value={profile.email}
              onChange={(event) => {
                setProfile({ ...profile, email: event.target.value });
                setProfileFeedback(null);
              }}
              placeholder="name@example.com"
              type="email"
              className={inputClasses}
            />
          </div>
          <FeedbackMessage feedback={profileFeedback} />
        </SettingsSection>

        <SettingsSection
          title="Безопасность"
          description="Регулярно обновляйте пароль, чтобы защитить доступ к вашему рабочему аккаунту."
          icon={KeyRound}
          onSave={handlePassword}
          saving={savingPw}
          saved={passwordFeedback?.type === "success"}
          saveText="Обновить пароль"
          disabledSave={!pw.current_password || !pw.new_password || !pw.confirm}
        >
          <div>
            <label className={labelClasses} htmlFor="teacher-settings-current-password">Текущий пароль</label>
            <input
              id="teacher-settings-current-password"
              type="password" autoComplete="current-password"
              value={pw.current_password}
              onChange={(event) => {
                setPw({ ...pw, current_password: event.target.value });
                setPasswordFeedback(null);
              }}
              placeholder="••••••••"
              className={inputClasses}
            />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className={labelClasses} htmlFor="teacher-settings-new-password">Новый пароль</label>
              <input
                id="teacher-settings-new-password"
                type="password" autoComplete="new-password"
                value={pw.new_password}
                onChange={(event) => {
                  setPw({ ...pw, new_password: event.target.value });
                  setPasswordFeedback(null);
                }}
                placeholder="Минимум 6 символов"
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses} htmlFor="teacher-settings-confirm-password">Повторите пароль</label>
              <input
                id="teacher-settings-confirm-password"
                type="password" autoComplete="new-password"
                value={pw.confirm}
                onChange={(event) => {
                  setPw({ ...pw, confirm: event.target.value });
                  setPasswordFeedback(null);
                }}
                placeholder="••••••••"
                className={inputClasses}
              />
            </div>
          </div>
          <FeedbackMessage feedback={passwordFeedback} />
        </SettingsSection>
      </div>
    </div>
  );
}
