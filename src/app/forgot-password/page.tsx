"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryShell } from "@/components/auth/recovery-shell";
import { authApi } from "@/lib/api";
import { forgotPasswordNotice } from "@/lib/password-reset";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReturnType<typeof forgotPasswordNotice> | null>(null);

  const submit = async () => {
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The request is sent in either case; the answer is the same for every address, so the text
      // below never tells whether such an account exists.
      const answer = await authApi.forgotPassword(address);
      setNotice(forgotPasswordNotice(answer?.email_delivery === true));
    } catch (e: any) {
      setError(e?.message || "Не удалось отправить запрос. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecoveryShell
      title="Восстановление пароля"
      subtitle={notice ? undefined : "Укажите email, с которым вы входите в ALGO."}
    >
      {notice ? (
        <div className="space-y-5">
          <div
            role="status"
            className={
              notice.kind === "sent"
                ? "flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm"
                : "flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm"
            }
          >
            {notice.kind === "sent" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            )}
            <span>{notice.text}</span>
          </div>
          <BackToLogin />
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="admin@school.uz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            type="submit"
            loading={busy}
            disabled={!email.trim()}
            className="w-full"
            size="lg"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Отправить ссылку
          </Button>
          <BackToLogin />
        </form>
      )}
    </RecoveryShell>
  );
}

function BackToLogin() {
  return (
    <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700">
      <ArrowLeft className="w-4 h-4" />
      Вернуться ко входу
    </Link>
  );
}
