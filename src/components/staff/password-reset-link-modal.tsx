"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { authApi } from "@/lib/api";
import {
  RESET_LINK_MENU_LABEL,
  RESET_LINK_NOTE,
  resetLinkExpiryText,
  telegramShareUrl,
} from "@/lib/password-reset";

export type ResetLinkState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; expiresAt: string };

/** The content of the dialog (a pure view of its state, so it can be rendered on the server in tests). */
export function PasswordResetLinkBody({
  state,
  copied = false,
  onCopy,
  onRetry,
  inputRef,
}: {
  state: ResetLinkState;
  copied?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label="Готовим ссылку">
        <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="space-y-3 pb-2">
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">
            Повторить
          </button>
        )}
      </div>
    );
  }
  const expiry = resetLinkExpiryText(state.expiresAt);
  return (
    <div className="space-y-4 pb-2">
      <div>
        <label htmlFor="reset-link-url" className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
          Ссылка
        </label>
        <input
          id="reset-link-url"
          ref={inputRef}
          type="text"
          readOnly
          value={state.url}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 outline-none focus:ring-2 focus:ring-primary-500/20"
        />
        {expiry && <p className="mt-1.5 text-xs font-medium text-slate-500">Действует {expiry}</p>}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={onCopy}
          className={`inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            copied ? "bg-emerald-100 text-emerald-700" : "bg-primary-600 text-white hover:bg-primary-700"
          }`}
        >
          {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
        <a
          href={telegramShareUrl(state.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Send className="w-4 h-4" />
          Отправить в Telegram
        </a>
      </div>

      <p className="text-xs leading-5 text-slate-500">{RESET_LINK_NOTE}</p>
    </div>
  );
}

/**
 * «Ссылка для нового пароля»: issues a one-time link for a colleague (POST /auth/staff/{id}/password-reset-link)
 * and shows it once. Opening the dialog issues a NEW link, the previous one of that person stops working.
 * Nothing is kept after the dialog closes.
 */
export function PasswordResetLinkModal({
  member,
  onClose,
}: {
  member: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<ResetLinkState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const memberId = member?.id ?? null;

  useEffect(() => {
    if (!memberId) {
      // Forget the link once the dialog has finished closing (not while it fades out).
      const timer = window.setTimeout(() => {
        setState({ status: "loading" });
        setCopied(false);
      }, 400);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    setState({ status: "loading" });
    setCopied(false);
    authApi
      .issuePasswordResetLink(memberId)
      .then((answer) => {
        if (cancelled) return;
        if (!answer?.url) {
          setState({ status: "error", message: "Не удалось получить ссылку. Повторите попытку." });
          return;
        }
        setState({ status: "ready", url: answer.url, expiresAt: answer.expires_at });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setState({ status: "error", message: e?.message || "Не удалось выдать ссылку. Повторите попытку." });
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, attempt]);

  const copy = useCallback(async () => {
    if (state.status !== "ready") return;
    let done = false;
    try {
      await navigator.clipboard.writeText(state.url);
      done = true;
    } catch {
      // no clipboard permission / insecure context: select the text and use the old way
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
        try {
          done = document.execCommand("copy");
        } catch {
          done = false;
        }
      }
    }
    if (done) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [state]);

  return (
    <Modal
      open={member !== null}
      title={RESET_LINK_MENU_LABEL}
      description={member?.name}
      onClose={onClose}
      maxWidthClassName="max-w-[520px]"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Готово
        </button>
      }
    >
      <PasswordResetLinkBody
        state={state}
        copied={copied}
        onCopy={copy}
        onRetry={() => setAttempt((n) => n + 1)}
        inputRef={inputRef}
      />
    </Modal>
  );
}
