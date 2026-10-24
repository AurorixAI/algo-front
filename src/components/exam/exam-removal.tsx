"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { examsApi } from "@/lib/api";

/** What the teacher is about to do with the exam: put it away (reversible) or erase it (not). */
export type ExamRemovalMode = "archive" | "delete";

export interface ExamRemoval {
  mode: ExamRemovalMode;
  examId: string;
  title: string;
}

export interface ExamRemovalCopy {
  heading: string;
  lead: string;
  details: string[];
  action: string;
  /** the destructive action is red, the reversible one is the primary colour */
  destructive: boolean;
}

/** The words of the dialog.  The two modes say what the OTHER one would have done, so the difference is never a guess. */
export function examRemovalCopy(mode: ExamRemovalMode, title: string): ExamRemovalCopy {
  const name = title ? `«${title}»` : "Этот экзамен";
  if (mode === "archive") {
    return {
      heading: "Перенести экзамен в архив?",
      lead: `${name} уйдёт из рабочего списка, но ничего не будет потеряно.`,
      details: [
        "Результаты учеников и история экзамена сохранятся.",
        "Вернуть экзамен можно в любой момент из раздела «Архив».",
        "Удалить экзамен совсем можно только из архива и только если у него нет результатов учеников.",
      ],
      action: "Перенести в архив",
      destructive: false,
    };
  }
  return {
    heading: "Удалить экзамен навсегда?",
    lead: `${name} будет удалён без возможности восстановления.`,
    details: [
      "Задания варианта и печатный комплект пропадут, вернуть их будет нельзя.",
      "Если у экзамена есть результаты учеников, удалить его не получится: результаты не стираются.",
      "Чтобы просто убрать экзамен из списка, оставьте его в архиве — оттуда его можно восстановить.",
    ],
    action: "Удалить навсегда",
    destructive: true,
  };
}

/** What the server was asked: archive keeps everything (`permanent=false`), delete asks for the erasure itself. */
export function removalRequest(removal: ExamRemoval): { examId: string; permanent: boolean } {
  return { examId: removal.examId, permanent: removal.mode === "delete" };
}

/** A failed call as the dialog shows it: the server's own sentence; a 409 is a refusal that repeating cannot change. */
export function removalFailure(err: unknown): { error: string; blocked: boolean } {
  const failure = err as { message?: unknown; status?: unknown } | null;
  const message = typeof failure?.message === "string" ? failure.message.trim() : "";
  return {
    error: message || "Не удалось выполнить действие. Повторите попытку.",
    blocked: failure?.status === 409,
  };
}

/** The body of the dialog.  A refusal of the server is shown as it came (it already explains what to do instead). */
export function ExamRemovalBody({ removal, error }: { removal: ExamRemoval; error: string | null }) {
  const copy = examRemovalCopy(removal.mode, removal.title);
  return (
    <div className="space-y-3 pb-1 text-sm leading-6 text-slate-700">
      <p className="font-semibold text-slate-900">{copy.lead}</p>
      <ul className="list-disc space-y-1 pl-5">
        {copy.details.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export function ExamRemovalDialog({
  removal,
  busy,
  error,
  blocked,
  onConfirm,
  onClose,
}: {
  removal: ExamRemoval | null;
  busy: boolean;
  error: string | null;
  /** the server refused (409): repeating the click cannot help, so only «Закрыть» is left */
  blocked: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // While the dialog animates out, `removal` is already null: keep painting the last state, so the text and the
  // buttons do not flash into something else on the way out.
  const lastRef = useRef<{ removal: ExamRemoval; error: string | null; blocked: boolean } | null>(null);
  if (removal) lastRef.current = { removal, error, blocked };
  const shown = removal ? { removal, error, blocked } : lastRef.current;
  const copy = shown ? examRemovalCopy(shown.removal.mode, shown.removal.title) : null;

  // A refusal leaves a single button: it takes the focus, so Enter / Escape / Space dismiss it at once.
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (removal && blocked) closeRef.current?.focus();
  }, [removal, blocked]);

  return (
    <Modal
      open={removal !== null}
      title={copy?.heading ?? ""}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {shown?.blocked ? "Закрыть" : "Отмена"}
          </button>
          {!shown?.blocked && copy && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={
                copy.destructive
                  ? "flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  : "flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {copy.action}
            </button>
          )}
        </>
      }
    >
      {shown && <ExamRemovalBody removal={shown.removal} error={shown.error} />}
    </Modal>
  );
}

/**
 * State and call of the dialog.  `ask` opens it; the confirm button calls the server, and only a successful answer closes it:
 * a refusal (the server's own sentence) stays on screen where the teacher is looking.  Exceptions:
 * - a 404 means a twin request already deleted the exam: nothing is left to refuse, so the dialog closes and the caller
 *   is told the exam is gone (`onRemoved`), which refreshes its list or leaves its page;
 * - one request at a time: a second click while the first is in flight sends nothing (a ref, not the render's `busy`,
 *   because two clicks can land in the same render).
 */
export function useExamRemoval(onRemoved: (mode: ExamRemovalMode, examId: string) => void) {
  const [removal, setRemoval] = useState<ExamRemoval | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const inFlight = useRef(false);
  const current = useRef<ExamRemoval | null>(null);
  current.current = removal;

  const ask = useCallback((next: ExamRemoval) => {
    setError(null);
    setBlocked(false);
    setRemoval(next);
  }, []);

  const close = useCallback(() => {
    if (inFlight.current) return;
    setRemoval(null);
    setError(null);
    setBlocked(false);
  }, []);

  const confirm = useCallback(async () => {
    const target = current.current;
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { examId, permanent } = removalRequest(target);
      await examsApi.delete(examId, permanent);
      setRemoval(null);
      onRemoved(target.mode, target.examId);
    } catch (err) {
      if ((err as { status?: unknown } | null)?.status === 404) {
        setRemoval(null);
        onRemoved(target.mode, target.examId);
      } else {
        const failure = removalFailure(err);
        setError(failure.error);
        setBlocked(failure.blocked);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [onRemoved]);

  return { removal, busy, error, blocked, ask, close, confirm };
}
