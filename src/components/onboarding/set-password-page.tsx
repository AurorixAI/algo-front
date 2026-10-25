"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Loader2, MailQuestion, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { NarrowPage } from "@/components/onboarding/onboarding-shell";
import { HttpError } from "@/lib/http-json";
import { onboardingApi } from "@/lib/onboarding-api";
import { loginHome } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";
import {
  DEAD_LINK_COPY,
  MAX_PASSWORD_LENGTH,
  canSetPassword,
  linkStateFromError,
  linkStateFromInfo,
  passwordRules,
  type LinkState,
} from "@/lib/set-password";
import type { AuthUser } from "@/lib/api";

export function SetPasswordPage({ token }: { token: string }) {
  const [link, setLink] = useState<LinkState>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<"signed-in" | "login" | null>(null);
  const inFlight = useRef(false);
  const setFromTokens = useAuthStore((state) => state.setFromTokens);

  const check = () => {
    const controller = new AbortController();
    setLink({ kind: "loading" });
    onboardingApi
      .inspectPasswordLink(token, controller.signal)
      .then((info) => setLink(linkStateFromInfo(info)))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLink(linkStateFromError(error));
      });
    return () => controller.abort();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(check, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !canSetPassword(password, confirm)) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const result = await onboardingApi.setPasswordByLink(token, password, confirm);
      if (result?.user && result.tokens) {
        setFromTokens(
          result.user as unknown as AuthUser,
          result.tokens.access_token,
          result.tokens.refresh_token,
          (result.org as never) ?? null,
        );
        setDone("signed-in");
        // A hard navigation, as the login page does: the middleware sees the cookie the server just set.
        window.location.href = loginHome(result.user.org_role || result.user.role);
      } else {
        setDone("login");
      }
    } catch (error) {
      const state = linkStateFromError(error);
      if (state.kind === "used" || state.kind === "expired" || state.kind === "invalid") {
        setLink(state);
      } else if (error instanceof HttpError && error.fields.password) {
        setFormError(error.fields.password);
      } else {
        setFormError(error instanceof HttpError ? error.message : "Не удалось задать пароль. Повторите попытку.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const rules = passwordRules(password, confirm);

  return (
    <NarrowPage caption="Доступ к ALGO — по приглашению">
      <GlassCard variant="elevated" className="p-8">
        {link.kind === "loading" && (
          <div className="py-8 text-center" role="status" aria-live="polite">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-600" aria-hidden />
            <p className="mt-4 text-sm text-slate-500">Проверяем ссылку…</p>
          </div>
        )}

        {link.kind === "unavailable" && (
          <div className="py-4 text-center" role="alert">
            <AlertCircle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
            <h2 className="mt-4 text-lg font-bold text-slate-900">Не получилось проверить ссылку</h2>
            <p className="mt-2 text-sm text-slate-600">{link.message}</p>
            <Button className="mt-6 w-full" variant="secondary" onClick={() => check()}>
              Повторить
            </Button>
          </div>
        )}

        {(link.kind === "used" || link.kind === "expired" || link.kind === "invalid") && (
          <div className="py-4 text-center" data-testid={`link-${link.kind}`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              {link.kind === "invalid" ? (
                <XCircle className="h-8 w-8 text-slate-500" aria-hidden />
              ) : (
                <MailQuestion className="h-8 w-8 text-slate-500" aria-hidden />
              )}
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">{DEAD_LINK_COPY[link.kind].title}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{DEAD_LINK_COPY[link.kind].text}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white/80 px-6 py-3 font-medium text-slate-700 hover:bg-white"
            >
              Ко входу
            </Link>
          </div>
        )}

        {link.kind === "valid" && done === null && (
          <form onSubmit={submit} noValidate aria-label="Задать пароль">
            <h2 className="text-2xl font-bold text-slate-900" data-testid="set-password-greeting">
              {link.name ? `Здравствуйте, ${link.name}!` : "Здравствуйте!"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {link.centre ? (
                <>
                  Центр <span className="font-semibold text-slate-800">«{link.centre}»</span> подключён к ALGO.{" "}
                </>
              ) : null}
              Задайте пароль — и вы сразу войдёте в кабинет.
            </p>
            {link.email && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Ваш логин: <span className="font-medium text-slate-800 break-all">{link.email}</span>
              </p>
            )}

            {formError && (
              <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <Input
                id="new-password"
                label="Пароль"
                type="password"
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
              />
              <Input
                id="confirm-password"
                label="Повторите пароль"
                type="password"
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setFormError(null); }}
              />
              <ul className="space-y-1.5" aria-label="Требования к паролю">
                {rules.map((rule) => (
                  <li key={rule.id} className={`flex items-center gap-2 text-sm ${rule.ok ? "text-green-700" : "text-slate-500"}`}>
                    {rule.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Circle className="h-4 w-4" aria-hidden />}
                    {rule.text}
                    <span className="sr-only">{rule.ok ? " — выполнено" : " — не выполнено"}</span>
                  </li>
                ))}
              </ul>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!canSetPassword(password, confirm)} icon={<ArrowRight className="h-4 w-4" />}>
                Задать пароль и войти
              </Button>
            </div>
          </form>
        )}

        {done === "signed-in" && (
          <div className="py-8 text-center" role="status">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-600" aria-hidden />
            <p className="mt-4 text-sm text-slate-600">Пароль задан. Открываем кабинет…</p>
          </div>
        )}

        {done === "login" && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center" role="status">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Пароль задан</h2>
            <p className="mt-2 text-sm text-slate-600">Теперь войдите с вашей почтой и новым паролем.</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-3 font-medium text-white shadow-lg shadow-primary-500/25"
            >
              Войти <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </motion.div>
        )}
      </GlassCard>
    </NarrowPage>
  );
}
