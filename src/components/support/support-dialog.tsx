"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle, Clock, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { supportApi } from "@/lib/api";
import { prepareScreenshot } from "@/lib/support-image";
import { useSupportDialog } from "@/lib/support-store";
import {
  SUPPORT_AUTO_NOTE,
  SUPPORT_FORM_HINT,
  SUPPORT_MAX_FILES,
  SUPPORT_MY_LABEL,
  SUPPORT_SENT_NOTE,
  SUPPORT_TEXT_MAX,
  newClientKey,
  pageTemplate,
  recentClientErrors,
  screenshotProblem,
  supportFileSizeText,
  supportPathOf,
  supportSentTitle,
  supportTextProblem,
} from "@/lib/support";

export const SUPPORT_CHANGED = "support:changed";

interface Sent { number: number; lost: number }

/** The success window of «Поддержка»: the same one view as «Пригласить сотрудника» (K2-2): a short title, one note, «Готово» as the main button with the focus. */
export function SupportSentView({ sent, myPath, onDone }: { sent: Sent; myPath: string; onDone: () => void }) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { done.current?.focus(); }, []);
  return (
    <div className="text-center" data-testid="support-sent">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle className="h-8 w-8 text-emerald-500" aria-hidden />
      </div>
      <h4 role="status" className="mb-3 text-lg font-semibold text-slate-900">{supportSentTitle(sent.number)}</h4>
      <p className="mx-auto mb-5 flex max-w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0">{SUPPORT_SENT_NOTE}</span>
      </p>
      {sent.lost > 0 && (
        <p role="alert" data-testid="support-sent-lost" className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
          {sent.lost === 1 ? "Один снимок не загрузился." : `Снимков не загрузилось: ${sent.lost}.`} Откройте обращение в «{SUPPORT_MY_LABEL}» и приложите снова.
        </p>
      )}
      <Button ref={done} type="button" size="lg" className="w-full" onClick={onDone}>Готово</Button>
      <Link href={myPath} onClick={onDone} className="mt-3 inline-block text-sm font-medium text-primary-700 hover:underline">Открыть «{SUPPORT_MY_LABEL}»</Link>
    </div>
  );
}

/** The window «Написать в поддержку».  One for the three cabinets, opened from the profile menu (desktop) and from «Ещё» (phone); drawn once by the sidebar. */
export function SupportDialog() {
  const { open, hide } = useSupportDialog();
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const inFlight = useRef(false); // a second click before the screen repaints (LESSONS 27)
  const keyRef = useRef(newClientKey()); // the same key = the same request on the server (a double click, a retry after a lost answer)
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(""); setFiles([]); setError(null); setFileError(null); setSent(null); setBusy(false);
    inFlight.current = false;
    keyRef.current = newClientKey();
  }, [open]);

  const close = useCallback(() => { if (!inFlight.current) hide(); }, [hide]);
  const myPath = supportPathOf(pathname);

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    setFileError(null);
    for (const file of Array.from(list)) {
      const problem = screenshotProblem(file, next.length);
      if (problem) { setFileError(problem); break; }
      next.push(file);
    }
    setFiles(next);
    if (picker.current) picker.current.value = "";
  };

  const submit = async () => {
    if (inFlight.current) return;
    const problem = supportTextProblem(text);
    if (problem) { setError(problem); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await supportApi.create({ text: text.trim(), client_key: keyRef.current, page: pageTemplate(pathname), errors: recentClientErrors() });
      if (!created) return; // the session ended: the app is already on its way to the sign-in
      let lost = 0;
      for (const file of files) {
        try {
          const ready = await prepareScreenshot(file);
          await supportApi.attach(created.id, ready.blob, ready.name);
        } catch {
          lost += 1;
        }
      }
      window.dispatchEvent(new Event(SUPPORT_CHANGED));
      setSent({ number: created.number, lost });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить. Повторите попытку.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Написать в поддержку"
      onClose={close}
      busy={busy}
      maxWidthClassName="max-w-lg"
      bodyClassName="p-5 sm:p-6 overflow-y-auto overscroll-contain min-h-0"
      footer={
        sent ? undefined : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>Отмена</Button>
            <Button onClick={() => void submit()} loading={busy} data-testid="support-submit">Отправить</Button>
          </>
        )
      }
    >
      {sent ? (
        <SupportSentView sent={sent} myPath={myPath} onDone={hide} />
      ) : (
        <div className="space-y-4" data-testid="support-form">
          <Textarea
            label="Что случилось"
            rows={6}
            maxLength={SUPPORT_TEXT_MAX + 200}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            error={error ?? undefined}
            hint={error ? undefined : `${SUPPORT_FORM_HINT} ${text.trim().length}/${SUPPORT_TEXT_MAX}`}
            data-testid="support-text"
          />
          <div>
            <FileInput ref={picker} accept="image/*" multiple onChange={(e) => pick(e.target.files)} data-testid="support-file-input" aria-label="Снимок экрана" />
            {files.length > 0 && (
              <ul className="mb-2 space-y-1.5" data-testid="support-files">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{file.name || `Снимок ${index + 1}`}</span>
                    <span className="shrink-0 text-xs text-slate-400">{supportFileSizeText(file.size)}</span>
                    <button
                      type="button"
                      aria-label={`Убрать снимок ${index + 1}`}
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                      disabled={busy}
                      className="-mr-1 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {files.length < SUPPORT_MAX_FILES && (
              <Button type="button" variant="secondary" size="sm" icon={<Paperclip className="h-4 w-4" />} onClick={() => picker.current?.click()} disabled={busy}>
                Приложить снимок экрана
              </Button>
            )}
            {fileError && <p role="alert" className="mt-1.5 text-xs text-red-500">{fileError}</p>}
          </div>
          <p className="text-xs text-slate-400">{SUPPORT_AUTO_NOTE}</p>
        </div>
      )}
    </Modal>
  );
}
