"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User, Mail, Lock, ArrowRight, AlertCircle,
  CheckCircle, Building2, Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { authApi } from "@/lib/api";
import type { InviteInfo } from "@/lib/ops-b-types";
import { INVITE_NOT_FOUND_TEXT, inviteAcceptErrorText, returningIntroText } from "@/lib/staff-lifecycle";

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;
  const { acceptInvite, isLoading, error, clearError } = useAuthStore();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const info = await authApi.getInviteInfo(code);
        setInviteInfo(info);
        if (info.email) setEmail(info.email);
      } catch {
        setLoadError(INVITE_NOT_FOUND_TEXT);
      } finally {
        setLoadingInfo(false);
      }
    })();
  }, [code]);

  const handleAccept = async () => {
    clearError();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError("Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      setLocalError("Пароль должен содержать минимум 6 символов");
      return;
    }

    try {
      await acceptInvite({
        code,
        email: email.trim(),
        password,
        // a returning member keeps his name: the form does not ask for it
        ...(returning ? {} : { first_name: firstName.trim(), last_name: lastName.trim() }),
      });
      const user = useAuthStore.getState().user;
      if (user) {
        const role = user.org_role || user.role;
        // Hard navigation — guarantees a fresh request that middleware
        // evaluates with the just-set cookie (see login page for why).
        if (role === "owner") window.location.href = "/owner/dashboard";
        else if (role === "admin") window.location.href = "/admin/diagnostics";
        else window.location.href = "/teacher/dashboard";
      }
    } catch (failure) {
      // The store keeps the server text; the refusals of the pack (another e-mail, another centre) are said in the words of the spec
      setLocalError(inviteAcceptErrorText(failure));
    }
  };

  const displayError = localError || error;
  const returning = Boolean(inviteInfo?.is_returning);

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">{loadError}</h2>
          <Link href="/login">
            <Button variant="secondary">Перейти ко входу</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] bg-blue-100/60 rounded-full blur-[120px] mix-blend-multiply opacity-70" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <span className="text-3xl font-bold">∫</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900">ALGO</h1>
          </Link>
          <p className="text-slate-500">Вас пригласили в организацию</p>
        </motion.div>

        {inviteInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
            <div className="flex items-center gap-3 p-4 bg-primary-50 border border-primary-100 rounded-xl">
              <Building2 className="w-5 h-5 text-primary-600" />
              <div>
                <p className="font-medium text-slate-900">{inviteInfo.org_name}</p>
                <p className="text-sm text-primary-600">
                  Роль: {inviteInfo.org_role === "admin" ? "Администратор" : "Преподаватель"}
                </p>
              </div>
            </div>
            {inviteInfo.is_returning && (
              <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {returningIntroText(inviteInfo.org_name)}
              </p>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard variant="elevated" className="p-8">
            {displayError && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            <h3 className="text-lg font-semibold text-slate-900 mb-4">{inviteInfo?.is_returning ? "Новый пароль" : "Создайте аккаунт"}</h3>

            <div className="space-y-4">
              {!returning && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Имя"
                  placeholder="Имя"
                  icon={<User className="w-4 h-4" />}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
                <Input
                  label="Фамилия"
                  placeholder="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              )}

              <Input
                label="Email"
                type="email"
                placeholder="user@school.uz"
                icon={<Mail className="w-4 h-4" />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // the invitation is for this address: it is shown and not edited (the server refuses another one)
                readOnly={Boolean(inviteInfo?.email)}
                aria-readonly={Boolean(inviteInfo?.email)}
                className={inviteInfo?.email ? "bg-slate-100 text-slate-600 cursor-not-allowed" : undefined}
              />
              {inviteInfo?.email && (
                <p className="-mt-2 text-xs font-medium text-slate-500">Приглашение выдано на этот email — изменить его нельзя.</p>
              )}

              <Input
                label="Пароль"
                type="password"
                placeholder="Минимум 6 символов"
                icon={<Lock className="w-4 h-4" />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <Input
                label="Подтвердите пароль"
                type="password"
                placeholder="Повторите пароль"
                icon={<Lock className="w-4 h-4" />}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <Button
                onClick={handleAccept}
                loading={isLoading}
                disabled={(!returning && (!firstName || !lastName)) || !email || !password || !confirmPassword}
                className="w-full"
                size="lg"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Принять приглашение
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}
