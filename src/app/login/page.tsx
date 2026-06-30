"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

const DEV_ROLES = [
  {
    role: "owner",
    label: "Owner",
    emoji: "👑",
    gradient: "from-amber-500 to-amber-600",
    hoverBg: "hover:bg-amber-50 hover:border-amber-300",
    redirect: "/owner/dashboard",
  },
  {
    role: "admin",
    label: "Admin",
    emoji: "🛡️",
    gradient: "from-violet-500 to-violet-600",
    hoverBg: "hover:bg-violet-50 hover:border-violet-300",
    redirect: "/admin/diagnostics",
  },
  {
    role: "teacher",
    label: "Teacher",
    emoji: "👩‍🏫",
    gradient: "from-emerald-500 to-emerald-600",
    hoverBg: "hover:bg-emerald-50 hover:border-emerald-300",
    redirect: "/teacher/diagnostic",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, devLogin, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [devLoading, setDevLoading] = useState<string | null>(null);

  useEffect(() => {
    DEV_ROLES.forEach((r) => router.prefetch(r.redirect));
  }, [router]);

  const handleDevLogin = useCallback(async (roleConfig: (typeof DEV_ROLES)[0]) => {
    if (devLoading || isLoading) return;
    clearError();
    setDevLoading(roleConfig.role);
    try {
      await devLogin(roleConfig.role);
      router.push(roleConfig.redirect);
    } catch {
      // Error already set in store
    } finally {
      setDevLoading(null);
    }
  }, [clearError, devLogin, devLoading, isLoading, router]);

  const handleLogin = async () => {
    clearError();
    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      const role = user?.org_role || user?.role;
      if (role === "owner") router.push("/owner/dashboard");
      else if (role === "admin") router.push("/admin/diagnostics");
      else if (role === "teacher") router.push("/teacher/diagnostic");
      else router.push("/admin/diagnostics");
    } catch {
      // Error already set in store
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && email && password) {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] bg-blue-100/60 rounded-full blur-[120px] mix-blend-multiply opacity-70" />
        <div className="absolute top-[20%] right-[10%] w-[60vw] h-[60vw] bg-indigo-100/50 rounded-full blur-[100px] mix-blend-multiply opacity-60" />
        <div className="absolute -bottom-[20%] left-[20%] w-[70vw] h-[70vw] bg-slate-200/60 rounded-full blur-[140px] mix-blend-multiply" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Link href="/" className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <span className="text-2xl font-bold">∫</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">ALGO</h1>
          </Link>
          <p className="text-slate-500 text-sm">Войдите в свой аккаунт</p>
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
            <p className="mt-2 text-xs text-primary-600 bg-primary-50 inline-block px-3 py-1 rounded-full">
              Demo: demo@algo.ru / demo2026
            </p>
          )}
        </motion.div>

        {/* Main login card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <GlassCard variant="elevated" className="p-8 [contain:paint]">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Email/Password form — always visible */}
            <div className="space-y-4" onKeyDown={handleKeyDown}>
              <Input
                label="Email"
                type="email"
                placeholder="admin@school.uz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Пароль"
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {/* Remember me + Forgot password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-slate-600">Запомнить меня</span>
                </label>
                <Link
                  href="#"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Забыли пароль?
                </Link>
              </div>

              <Button
                onClick={handleLogin}
                loading={isLoading}
                disabled={!email || !password}
                className="w-full"
                size="lg"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Войти
              </Button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">или</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Demo accounts */}
            <div className="text-center mb-4">
              <p className="text-xs text-slate-400">Демо-аккаунты для тестирования</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {DEV_ROLES.map((roleConfig) => {
                const isActive = devLoading === roleConfig.role;
                const isBusy = devLoading !== null || isLoading;
                return (
                  <button
                    key={roleConfig.role}
                    type="button"
                    onClick={() => handleDevLogin(roleConfig)}
                    disabled={isBusy}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium
                      transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out
                      active:scale-[0.97] will-change-transform
                      ${roleConfig.role === "owner" ? "col-span-2" : ""}
                      ${isActive
                        ? "border-primary-300 bg-primary-50 text-primary-700 shadow-sm"
                        : `border-slate-200 bg-white text-slate-700 ${roleConfig.hoverBg}`
                      }
                      disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100`}
                  >
                    {isActive ? (
                      <div className="w-4 h-4 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    ) : (
                      <span className="text-base leading-none">{roleConfig.emoji}</span>
                    )}
                    <span>{roleConfig.label}</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>

        {/* Register link */}
        <p className="text-center mt-6 text-sm text-slate-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-primary-600 font-medium hover:underline">
            Зарегистрировать организацию
          </Link>
        </p>
      </div>
    </div>
  );
}
