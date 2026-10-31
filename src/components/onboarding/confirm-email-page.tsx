"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, MailQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NarrowPage } from "@/components/onboarding/onboarding-shell";
import { onboardingApi } from "@/lib/onboarding-api";
import { CONFIRM_CAPTION, CONFIRM_DEAD_COPY, CONFIRM_TAKEN_COPY, confirmStateFromError, confirmStateFromInfo, type ConfirmState } from "@/lib/confirm-email";

/** The page of the letter that went to the NEW address of an employee: a view first (a mail scanner opens links), the button confirms. No sign-in is needed. */
export function ConfirmEmailPage({ token }: { token: string }) {
  const [state, setState] = useState<ConfirmState>({ kind: "loading" });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const check = () => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    onboardingApi
      .inspectEmailChange(token, controller.signal)
      .then((info) => setState(confirmStateFromInfo(info)))
      .catch((error) => {
        if (!controller.signal.aborted) setState(confirmStateFromError(error));
      });
    return () => controller.abort();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(check, [token]);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    try {
      await onboardingApi.confirmEmailChange(token);
      setDone(true);
    } catch (error) {
      const next = confirmStateFromError(error);
      if (next.kind === "unavailable") setFormError(next.message);
      else setState(next);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <NarrowPage caption={CONFIRM_CAPTION}>
      <GlassCard variant="elevated" className="p-8">
        {state.kind === "loading" && (
          <div className="py-8 text-center" role="status" aria-live="polite">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-600" aria-hidden />
            <p className="mt-4 text-sm text-slate-500">Проверяем ссылку…</p>
          </div>
        )}

        {state.kind === "unavailable" && (
          <div className="py-4 text-center" role="alert">
            <AlertCircle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
            <h2 className="mt-4 text-lg font-bold text-slate-900">Не получилось проверить ссылку</h2>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <Button className="mt-6 w-full" variant="secondary" onClick={() => check()}>Повторить</Button>
          </div>
        )}

        {(state.kind === "dead" || state.kind === "taken" || state.kind === "closed") && (
          <div className="py-4 text-center" data-testid={`confirm-${state.kind === "dead" ? state.code : state.kind}`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <MailQuestion className="h-8 w-8 text-slate-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              {state.kind === "dead" ? CONFIRM_DEAD_COPY[state.code].title : state.kind === "taken" ? CONFIRM_TAKEN_COPY.title : "Доступ закрыт"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
              {state.kind === "dead" ? CONFIRM_DEAD_COPY[state.code].text : state.kind === "taken" ? CONFIRM_TAKEN_COPY.text : state.message}
            </p>
            <Link href="/login" className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white/80 px-6 py-3 font-medium text-slate-700 hover:bg-white">
              Ко входу
            </Link>
          </div>
        )}

        {state.kind === "valid" && !done && (
          <div data-testid="confirm-valid">
            <h2 className="text-2xl font-bold text-slate-900">{state.name ? `Здравствуйте, ${state.name}!` : "Здравствуйте!"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {state.centre ? <>Владелец центра <span className="font-semibold text-slate-800">«{state.centre}»</span> указал этот адрес как вашу новую почту для входа.</> : "Этот адрес указан как ваша новая почта для входа."}
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Новая почта для входа: <span className="font-medium text-slate-800 break-all">{state.newEmail}</span>
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">Пароль останется прежним. Все текущие входы будут закрыты — войдите заново с новой почтой.</p>
            {formError && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            )}
            <Button className="mt-5 w-full" size="lg" loading={busy} onClick={() => void confirm()} icon={<ArrowRight className="h-4 w-4" />}>
              Подтвердить адрес
            </Button>
          </div>
        )}

        {state.kind === "valid" && done && (
          <div className="py-4 text-center" role="status" data-testid="confirm-done">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Адрес подтверждён</h2>
            <p className="mt-2 text-sm text-slate-600">Теперь входите с новой почтой и прежним паролем.</p>
            <Link href="/login" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-3 font-medium text-white shadow-lg shadow-primary-500/25">
              Войти <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </GlassCard>
    </NarrowPage>
  );
}
