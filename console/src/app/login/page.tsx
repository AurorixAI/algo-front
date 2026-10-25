"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HttpError } from "@/lib/http-json";
import { consoleApi } from "../../lib/api";
import { guardDecision, loginNotice } from "../../lib/guard";
import { validateLogin } from "../../lib/forms";
import { homePath } from "../../lib/permissions";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    setNotice(loginNotice(new URLSearchParams(window.location.search).get("reason")));
    // Already signed in (another tab): straight to the panel.
    const controller = new AbortController();
    consoleApi.auth
      .me(controller.signal)
      .then((me) => ({ me }) as const)
      .catch((error: unknown) => ({ error }) as const)
      .then((check) => {
        if (controller.signal.aborted) return;
        const decision = guardDecision(check, "login");
        if (decision.kind === "redirect") router.replace(decision.to);
      });
    return () => controller.abort();
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateLogin({ email, password });
    setErrors(found);
    setFailure(null);
    if (found.email || found.password) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const me = await consoleApi.auth.login(email.trim().toLowerCase(), password);
      const decision = guardDecision({ me }, "login");
      router.replace(decision.kind === "redirect" ? decision.to : homePath(me));
    } catch (error) {
      setFailure(error instanceof HttpError ? error.message : "Не удалось войти. Повторите попытку.");
      setPassword("");
      setBusy(false);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-xl font-bold text-white shadow-lg shadow-primary-500/30">∫</div>
          <div className="leading-tight">
            <p className="text-xl font-semibold text-white">ALGO</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Консоль</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate aria-label="Вход в консоль" className="rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
          <h1 className="text-lg font-semibold text-slate-900">Вход для команды</h1>
          <p className="mt-1 text-sm text-slate-500">Доступ только для сотрудников ALGO.</p>
          {notice && (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{notice}</span>
            </div>
          )}
          {failure && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{failure}</span>
            </div>
          )}
          <div className="mt-5 space-y-4">
            <Input label="Почта" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErrors((c) => ({ ...c, email: undefined })); }} error={errors.email} />
            <Input label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((c) => ({ ...c, password: undefined })); }} error={errors.password} />
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<ArrowRight className="h-4 w-4" />}>Войти</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
