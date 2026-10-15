"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, KeyRound, ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { authApi, REFRESH_UNAVAILABLE_MESSAGE } from "@/lib/api";
import { roleHome } from "@/lib/role-home";
import { validateNewPassword } from "@/lib/password-reset";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { refreshProfile } = useAuthStore();
  const [ready, setReady] = useState(false);
  const [forced, setForced] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Verify the session and whether this is a forced (temp-password) change.
  useEffect(() => {
    (async () => {
      try {
        // "unavailable" = no verdict on the session (no network, limiter, server error): stay and offer a retry
        if ((await refreshProfile()) === "unavailable") {
          setUnavailable(true);
          return;
        }
      } catch {
        router.replace("/login");
        return;
      }
      const user = useAuthStore.getState().user;
      if (!user) {
        router.replace("/login");
        return;
      }
      setForced(!!user.must_change_password);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const submit = async () => {
    setError(null);
    const problem = validateNewPassword(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      await refreshProfile();
      const user = useAuthStore.getState().user;
      const role = user?.org_role || user?.role || "";
      router.replace(roleHome(role) || "/");
    } catch (e: any) {
      setError(e.message || "Не удалось сменить пароль");
      setBusy(false);
    }
  };

  if (unavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-center px-6" role="alert">
          <p className="text-sm text-slate-600">{REFRESH_UNAVAILABLE_MESSAGE}</p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            onClick={() => {
              setUnavailable(false);
              setAttempt((n) => n + 1);
            }}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] bg-white rounded-[24px] shadow-xl border border-slate-100 overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400" />
        <div className="p-7">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-primary-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Смена пароля</h1>
          <p className="text-sm text-slate-500 mt-1">
            {forced
              ? "Ваш аккаунт создан с временным паролем. Задайте свой пароль, чтобы продолжить."
              : "Обновите пароль вашего аккаунта."}
          </p>

          <div className="mt-6 space-y-3">
            <Field
              icon={<KeyRound className="w-4 h-4 text-slate-400" />}
              placeholder={forced ? "Временный пароль" : "Текущий пароль"}
              value={current}
              onChange={setCurrent}
              show={show}
            />
            <Field
              icon={<Lock className="w-4 h-4 text-slate-400" />}
              placeholder="Новый пароль (мин. 8 символов)"
              value={next}
              onChange={setNext}
              show={show}
              toggle={() => setShow((s) => !s)}
              showToggle
            />
            <Field
              icon={<Lock className="w-4 h-4 text-slate-400" />}
              placeholder="Повторите новый пароль"
              value={confirm}
              onChange={setConfirm}
              show={show}
            />

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
            )}

            <button
              onClick={submit}
              disabled={busy || !current || !next || !confirm}
              className="w-full py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Сохранить пароль
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ icon, placeholder, value, onChange, show, toggle, showToggle }: {
  icon: React.ReactNode; placeholder: string; value: string;
  onChange: (v: string) => void; show: boolean; toggle?: () => void; showToggle?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
      />
      {showToggle && toggle && (
        <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
