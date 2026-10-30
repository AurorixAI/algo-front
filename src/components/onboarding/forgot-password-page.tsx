"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { NarrowPage } from "@/components/onboarding/onboarding-shell";
import { TurnstileWidget, TURNSTILE_SITE_KEY } from "@/components/onboarding/turnstile-widget";
import { onboardingApi } from "@/lib/onboarding-api";
import { FORGOT_NEUTRAL_TEXT, FORGOT_WAIT_TEXT, canSendForgot, forgotEmailProblem, forgotErrorText } from "@/lib/forgot-password";

/** «Забыли пароль?»: the address and the check; the answer is the same for every address (the server does not say whether it exists). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [resetWidget, setResetWidget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inFlight = useRef(false);
  const needsToken = TURNSTILE_SITE_KEY !== "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const problem = forgotEmailProblem(email);
    if (problem) { setError(problem); return; }
    if (!canSendForgot(email, token, needsToken)) { setError("Дождитесь проверки над кнопкой и повторите"); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onboardingApi.forgotPassword(email.trim().toLowerCase(), token);
      setSentTo(email.trim());
    } catch (failure) {
      const shown = forgotErrorText(failure);
      setError(shown.text);
      if (shown.resetWidget) { setToken(""); setResetWidget((n) => n + 1); }   // a Turnstile token is single-use
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <NarrowPage caption="Восстановление доступа">
      <GlassCard variant="elevated" className="p-5 sm:p-8">
        {sentTo ? (
          <div className="py-2 text-center" role="status" data-testid="forgot-sent">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <MailCheck className="h-8 w-8 text-green-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Проверьте почту</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{FORGOT_NEUTRAL_TEXT}</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">{FORGOT_WAIT_TEXT}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-6 py-3 font-medium text-slate-700 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-label="Забыли пароль">
            <h2 className="text-2xl font-bold text-slate-900">Забыли пароль?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Укажите почту, с которой вы входите, — пришлём ссылку для нового пароля.</p>

            {error && (
              <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <Input
                id="forgot-email"
                name="email"
                label="Почта"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="admin@school.uz"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
              />
              <TurnstileWidget action="forgot_password" onToken={setToken} reset={resetWidget} />
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email.trim() || (needsToken && !token)} icon={<Send className="h-4 w-4" />}>
                Отправить ссылку
              </Button>
              <p className="text-center text-sm text-slate-500">
                <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">Вспомнили? Вернуться ко входу</Link>
              </p>
            </div>
          </form>
        )}
      </GlassCard>
    </NarrowPage>
  );
}
