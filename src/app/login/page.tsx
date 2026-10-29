"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/lib/store";
import { postLoginTarget } from "@/lib/safe-redirect";
import { Checkbox } from "@/components/ui/checkbox";
import { demoRequestUrl } from "@/lib/site-url";

const ROLE_OPTIONS = [
  { value: "owner", label: "Владелец" },
  { value: "admin", label: "Админ" },
  { value: "teacher", label: "Учитель" },
];

// ONE text for "no such account", "wrong password", "account switched off" (the server answers all three alike)
// and "this account has another role": the page must not tell which of them it was.
// «Нет доступа? Запросить демо»: the request form is on the landing, SITE_URL/#demo (K3 P2).  The address is the build
// variable (a stage build points to the stage landing); empty = this origin.
const DEMO_REQUEST_URL = demoRequestUrl(process.env.NEXT_PUBLIC_SITE_URL);

const INVALID_CREDENTIALS_MESSAGE = "Неверная почта или пароль";

export default function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [role, setRole] = useState("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [roleMismatch, setRoleMismatch] = useState(false);

  // NOTE: deliberately no router.prefetch() of the dashboards here. Prefetching
  // them while unauthenticated makes Next.js's middleware redirect them to
  // /login and cache that redirect in the client router cache — so after a
  // real login, router.push() could reuse the stale cached redirect instead
  // of hitting the server fresh (symptom: "200 OK on /login but nothing
  // happens until a hard refresh"). Hence also using a hard navigation below
  // instead of router.push().

  const handleLogin = async () => {
    clearError();
    setRoleMismatch(false);
    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      const actualRole = user?.org_role || user?.role;

      // The role dropdown isn't just cosmetic — the account's real role must
      // match what was selected, otherwise a teacher picking "Владелец" (or
      // vice versa) would silently land in someone else's dashboard context.
      // Message is deliberately identical to a wrong password — don't reveal
      // that the email exists under a different role.
      if (actualRole && actualRole !== role) {
        await useAuthStore.getState().logout();
        setRoleMismatch(true);
        return;
      }

      // Hard navigation (not router.push) — guarantees a fresh request that
      // the middleware evaluates with the just-set cookie, bypassing any
      // client router cache entirely.
      // `?redirect=` is whatever page the middleware bounced the visitor from. It comes from the
      // address bar, so postLoginTarget only follows a same-site path that this role may open
      // (no `//host`, `/\host`, absolute URL, `javascript:`), else the role's own home.
      window.location.href = postLoginTarget(
        new URLSearchParams(window.location.search).get("redirect"),
        actualRole,
      );
    } catch {
      // Error already set in store
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && email && password) {
      handleLogin();
    }
  };

  const isOwner = role === "owner";
  const errorMessage = roleMismatch ? INVALID_CREDENTIALS_MESSAGE : error;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] relative overflow-hidden">
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
        </motion.div>

        {/* Main login card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <GlassCard variant="elevated" className="p-8 [contain:paint]">
            {/* Error message */}
            {errorMessage && (
              <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-4" onKeyDown={handleKeyDown}>
              <Select
                label="Кто входит?"
                options={ROLE_OPTIONS}
                value={role}
                onChange={(e) => { setRole(e.target.value); setRoleMismatch(false); }}
              />

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
                  <Checkbox
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
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
          </GlassCard>
        </motion.div>

        {/* Footer hint — depends on selected role */}
        <p className="text-center mt-6 text-sm text-slate-500">
          {isOwner ? (
            <>
              Нет доступа?{" "}
              <a href={DEMO_REQUEST_URL} className="text-primary-600 font-medium hover:underline">
                Запросить демо
              </a>
            </>
          ) : (
            "Нет доступа? Обратитесь к владельцу или администратору вашей организации за логином и паролем."
          )}
        </p>
      </div>
    </div>
  );
}
