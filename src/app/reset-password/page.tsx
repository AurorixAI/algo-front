"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecoveryShell } from "@/components/auth/recovery-shell";
import { authApi } from "@/lib/api";
import {
  RESET_DONE_TEXT,
  RESET_INVALID_TEXT,
  RESET_PATH,
  addressWithoutToken,
  readResetToken,
  validateNewPassword,
} from "@/lib/password-reset";

type Stage =
  | { name: "checking" }
  | { name: "invalid" }
  | { name: "unavailable"; message: string }
  | { name: "ready"; emailMasked: string }
  | { name: "done" };

export default function ResetPasswordPage() {
  // The one-time token: read from the address bar ONCE, then taken out of it (history.replaceState), so
  // it stays in memory only. A ref survives the double effect of React strict mode.
  const tokenRef = useRef<string | null | undefined>(undefined);
  const [stage, setStage] = useState<Stage>({ name: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenRef.current === undefined) {
      tokenRef.current = readResetToken(window.location.hash);
      window.history.replaceState(null, "", addressWithoutToken(RESET_PATH, window.location.search));
    }
    const token = tokenRef.current;
    if (!token) {
      setStage({ name: "invalid" });
      return;
    }
    let cancelled = false;
    setStage({ name: "checking" });
    authApi
      .checkResetToken(token)
      .then((answer) => {
        if (cancelled) return;
        setStage(answer?.valid ? { name: "ready", emailMasked: answer.email_masked || "" } : { name: "invalid" });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setStage({ name: "unavailable", message: e?.message || "Не удалось проверить ссылку. Повторите попытку." });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const submit = async () => {
    const token = tokenRef.current;
    if (!token || busy) return;
    const problem = validateNewPassword(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await authApi.resetPassword(token, next);
      tokenRef.current = null; // spent
      setNext("");
      setConfirm("");
      setStage({ name: "done" });
    } catch (e: any) {
      if (e?.status === 400) {
        // the link died meanwhile (used in another tab, expired, replaced by a newer one)
        tokenRef.current = null;
        setStage({ name: "invalid" });
      } else {
        setError(e?.message || "Не удалось сменить пароль. Повторите попытку.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (stage.name === "checking") {
    return (
      <RecoveryShell title="Новый пароль">
        <div className="flex items-center justify-center py-6" role="status" aria-label="Проверяем ссылку">
          <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
        </div>
      </RecoveryShell>
    );
  }

  if (stage.name === "invalid") {
    return (
      <RecoveryShell title="Ссылка не подошла">
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{RESET_INVALID_TEXT}</span>
        </div>
        <Link
          href="/forgot-password"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Запросить новую ссылку
          <ArrowRight className="w-4 h-4" />
        </Link>
      </RecoveryShell>
    );
  }

  if (stage.name === "unavailable") {
    return (
      <RecoveryShell title="Новый пароль">
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{stage.message}</span>
        </div>
        <button
          type="button"
          className="mt-5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Повторить
        </button>
      </RecoveryShell>
    );
  }

  if (stage.name === "done") {
    return (
      <RecoveryShell title="Готово">
        <div role="status" className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{RESET_DONE_TEXT}</span>
        </div>
        <Link
          href="/login"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Войти
          <ArrowRight className="w-4 h-4" />
        </Link>
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell
      title="Новый пароль"
      subtitle={stage.emailMasked ? `Для аккаунта ${stage.emailMasked}` : "Задайте новый пароль для вашего аккаунта."}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <PasswordField
          label="Новый пароль"
          placeholder="Новый пароль (мин. 8 символов)"
          value={next}
          onChange={setNext}
          show={show}
          onToggle={() => setShow((s) => !s)}
          showToggle
        />
        <PasswordField label="Повторите пароль" placeholder="Повторите новый пароль" value={confirm} onChange={setConfirm} show={show} />

        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" loading={busy} disabled={!next || !confirm} className="w-full" size="lg">
          Сохранить пароль
        </Button>
      </form>
    </RecoveryShell>
  );
}

function PasswordField({
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggle,
  showToggle,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle?: () => void;
  showToggle?: boolean;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type={show ? "text" : "password"}
          name={showToggle ? "new-password" : "confirm-password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
        />
        {showToggle && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={show ? "Скрыть пароль" : "Показать пароль"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </span>
    </label>
  );
}
