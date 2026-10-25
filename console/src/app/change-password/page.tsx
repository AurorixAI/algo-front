"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HttpError } from "@/lib/http-json";
import { consoleApi } from "../../lib/api";
import { SessionGate, useSession } from "../../lib/session";
import { MAX_PASSWORD, MIN_STAFF_PASSWORD, validateNewPassword } from "../../lib/forms";

function ChangeForm() {
  const router = useRouter();
  const { me } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateNewPassword({ current, next, confirm });
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await consoleApi.auth.changePassword(current, next);
      // The flag is cleared on the server; `/` reads the fresh session and opens the first section.
      router.replace("/");
    } catch (error) {
      if (error instanceof HttpError && error.status === 422) {
        setErrors({ current: error.fields.current_password, next: error.fields.new_password });
      }
      setFailure(error instanceof HttpError ? error.message : "Не удалось сменить пароль. Повторите попытку.");
      setBusy(false);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
      <form onSubmit={submit} noValidate aria-label="Смена пароля" className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
        <h1 className="text-lg font-semibold text-slate-900">Задайте свой пароль</h1>
        <p className="mt-1 text-sm text-slate-500">{me.user.name}, вы вошли по временному паролю. Придумайте постоянный — не короче {MIN_STAFF_PASSWORD} символов.</p>
        {failure && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{failure}</span>
          </div>
        )}
        <div className="mt-5 space-y-4">
          <Input label="Временный пароль" type="password" autoComplete="current-password" autoFocus value={current} maxLength={MAX_PASSWORD} onChange={(e) => { setCurrent(e.target.value); setErrors((c) => ({ ...c, current: undefined })); }} error={errors.current} />
          <Input label="Новый пароль" type="password" autoComplete="new-password" value={next} maxLength={MAX_PASSWORD} onChange={(e) => { setNext(e.target.value); setErrors((c) => ({ ...c, next: undefined })); }} error={errors.next} />
          <Input label="Повторите новый пароль" type="password" autoComplete="new-password" value={confirm} maxLength={MAX_PASSWORD} onChange={(e) => { setConfirm(e.target.value); setErrors((c) => ({ ...c, confirm: undefined })); }} error={errors.confirm} />
          <Button type="submit" size="lg" className="w-full" loading={busy} icon={<ArrowRight className="h-4 w-4" />}>Сохранить пароль</Button>
        </div>
      </form>
    </div>
  );
}

export default function ChangePasswordPage() {
  return <SessionGate page="change-password">{() => <ChangeForm />}</SessionGate>;
}
