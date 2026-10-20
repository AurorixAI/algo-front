"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { useScrollLock } from "@/components/ui/modal";

interface RenameExamModalProps {
  open: boolean;
  currentTitle: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}

/**
 * Reusable title editor for an editable exam draft.
 *
 * The server is still the source of truth for the lifecycle rule: this modal
 * is used only on screens where the draft can be changed, while the API
 * rejects a stale request if the exam becomes a fixed run in another tab.
 */
export function RenameExamModal({ open, currentTitle, onClose, onSave }: RenameExamModalProps) {
  const inputId = useId();
  const [title, setTitle] = useState(currentTitle);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(currentTitle);
    setError(null);
  }, [currentTitle, open]);

  useScrollLock(open);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Введите название экзамена.");
      return;
    }
    if (nextTitle.length > 300) {
      setError("Название не должно быть длиннее 300 символов.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(nextTitle);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Не удалось изменить название. Повторите попытку.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex min-h-[100dvh] w-screen items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Закрыть окно переименования"
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
            <Pencil className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">Черновик экзамена</p>
            <h2 id={`${inputId}-heading`} className="mt-1 text-xl font-bold">Изменить название</h2>
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
          <label htmlFor={inputId} className="block text-sm font-bold text-slate-700">Название экзамена</label>
          <input
            id={inputId}
            autoFocus
            maxLength={300}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base font-medium text-slate-900 outline-none transition focus:border-primary-400 focus:bg-white focus:ring-4 focus:ring-primary-100"
          />
          <p className="text-xs leading-5 text-slate-500">Название меняется только у черновика. После запуска или подготовки печатного комплекта создайте копию.</p>
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
            disabled={saving || !title.trim()}
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
