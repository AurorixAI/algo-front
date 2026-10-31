"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Loader2, Target, X } from "lucide-react";
import { useScrollLock } from "@/components/ui/modal";
import { PASS_THRESHOLD_HINT, parsePassThreshold } from "@/lib/exam-pass-threshold";

interface PassThresholdModalProps {
  open: boolean;
  current: number;
  onClose: () => void;
  onSave: (threshold: number) => Promise<void>;
}

/**
 * Editor of an exam's pass threshold. It is offered only until the first work is submitted; the server is still the judge
 * (409 «Порог нельзя изменить…» if a work was submitted in another tab) and its text is shown as it is.
 */
export function PassThresholdModal({ open, current, onClose, onSave }: PassThresholdModalProps) {
  const inputId = useId();
  const [text, setText] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText(String(current));
    setError(null);
  }, [current, open]);

  useScrollLock(open);

  if (!open) return null;

  const parsed = parsePassThreshold(text);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (parsed === null) {
      setError("Введите целое число от 1 до 100.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Не удалось изменить порог. Повторите попытку.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex min-h-[100dvh] w-screen items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Закрыть окно порога"
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-md"
        onClick={() => !saving && onClose()}
      />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${inputId}-heading`}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-4 bg-gradient-to-r from-primary-600 to-violet-600 px-6 py-5 text-white">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <Target className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${inputId}-heading`} className="mt-1 text-xl font-bold">Проходной порог</h2>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={saving}
            className="-mr-1 -mt-1 rounded-xl p-2 text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-6 py-6">
          <label htmlFor={inputId} className="block text-sm font-bold text-slate-700">Проходной порог, %</label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              autoFocus
              inputMode="numeric"
              maxLength={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={parsed === null}
              className="h-12 w-28 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base font-medium text-slate-900 outline-none transition focus:border-primary-400 focus:bg-white focus:ring-4 focus:ring-primary-100"
            />
            <span className="text-base font-semibold text-slate-500">%</span>
          </div>
          <p className="text-xs leading-5 text-slate-500">{PASS_THRESHOLD_HINT}. Меняется до первой сданной работы.</p>
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving || parsed === null}
            className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
