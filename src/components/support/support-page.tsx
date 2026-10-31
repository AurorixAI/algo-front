"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LifeBuoy, MessageSquare, Paperclip, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataLoadError } from "@/components/ui/data-load-error";
import { FileInput } from "@/components/ui/file-input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { supportApi } from "@/lib/api";
import { formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";
import { prepareScreenshot } from "@/lib/support-image";
import { useSupportDialog } from "@/lib/support-store";
import {
  SUPPORT_CLOSED_NOTE,
  SUPPORT_EMPTY_TEXT,
  SUPPORT_EMPTY_TITLE,
  SUPPORT_MY_LABEL,
  SUPPORT_REPLY_MAX,
  SUPPORT_STATUS_TONES,
  screenshotProblem,
  supportFileLabel,
  supportStatusWord,
  type SupportCard,
  type SupportItem,
} from "@/lib/support";
import { SUPPORT_CHANGED } from "./support-dialog";

function StatusPill({ status }: { status: SupportItem["status"] }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${SUPPORT_STATUS_TONES[status]}`}>{supportStatusWord(status)}</span>;
}

/** «Мои обращения»: the same page in the three cabinets.  The person sees only his own tickets; a text is drawn as text (never as markup, never as links). */
export function SupportPage() {
  const [items, setItems] = useState<SupportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const show = useSupportDialog((s) => s.show);

  const load = useCallback(async () => {
    try {
      const page = await supportApi.list();
      if (!page) return;
      setItems(page.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить обращения.");
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(SUPPORT_CHANGED, load);
    return () => window.removeEventListener(SUPPORT_CHANGED, load);
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{SUPPORT_MY_LABEL}</h1>
        <Button size="md" icon={<LifeBuoy className="h-4 w-4" />} onClick={show} data-testid="support-new">Написать в поддержку</Button>
      </div>

      {error && items === null && <DataLoadError message={error} onRetry={() => void load()} />}
      {items === null && !error && (
        <div className="space-y-3" role="status" aria-label="Загрузка обращений">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      )}
      {items !== null && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center" data-testid="support-empty">
          <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden />
          <p className="font-semibold text-slate-700">{SUPPORT_EMPTY_TITLE}</p>
          <p className="mt-1 text-sm text-slate-500">{SUPPORT_EMPTY_TEXT}</p>
        </div>
      )}
      {items !== null && items.length > 0 && (
        <ul className="space-y-2.5" data-testid="support-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                data-testid="support-item"
                aria-label={`Обращение №${item.number}: ${supportStatusWord(item.status)}`}
                className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-900">№{item.number}</span>
                  <StatusPill status={item.status} />
                </span>
                <span className="mt-1.5 block break-words text-sm text-slate-700 line-clamp-2">{item.preview}</span>
                <span className="mt-2 block text-xs text-slate-400">
                  {item.last_reply_at ? `Ответ: ${formatUtcNaiveAsBusinessDateTime(item.last_reply_at)}` : `Отправлено: ${formatUtcNaiveAsBusinessDateTime(item.created_at)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <TicketCard id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
}

function TicketCard({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [card, setCard] = useState<SupportCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCard(null); setError(null); setReply(""); setReplyError(null); setFileError(null);
    if (!id) return undefined;
    let alive = true;
    supportApi.get(id)
      .then((data) => { if (alive && data) setCard(data); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Не удалось открыть обращение."); });
    return () => { alive = false; };
  }, [id]);

  const send = async () => {
    if (!card || inFlight.current) return;
    const text = reply.trim();
    if (!text) { setReplyError("Напишите ответ"); return; }
    if (text.length > SUPPORT_REPLY_MAX) { setReplyError(`Слишком длинно — максимум ${SUPPORT_REPLY_MAX} символов`); return; }
    inFlight.current = true;
    setBusy(true);
    setReplyError(null);
    try {
      const next = await supportApi.reply(card.id, text);
      if (next) { setCard(next); setReply(""); onChanged(); }
    } catch (cause) {
      setReplyError(cause instanceof Error ? cause.message : "Не удалось отправить. Повторите попытку.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const attach = async (list: FileList | null) => {
    const file = list?.[0];
    if (picker.current) picker.current.value = "";
    if (!card || !file || inFlight.current) return;
    const problem = screenshotProblem(file, card.attachments.length);
    if (problem) { setFileError(problem); return; }
    inFlight.current = true;
    setBusy(true);
    setFileError(null);
    try {
      const ready = await prepareScreenshot(file);
      await supportApi.attach(card.id, ready.blob, ready.name);
      const fresh = await supportApi.get(card.id);
      if (fresh) setCard(fresh);
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "Не удалось приложить снимок.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const title = card ? `Обращение №${card.number}` : "Обращение";
  return (
    <Modal
      open={Boolean(id)}
      placement="sheet"
      maxWidthClassName="max-w-xl"
      title={title}
      description={card ? <StatusPill status={card.status} /> : undefined}
      onClose={onClose}
      busy={busy}
      bodyClassName="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
    >
      {!card && !error && <div className="space-y-3" role="status" aria-label="Загрузка обращения">{[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />)}</div>}
      {error && <DataLoadError message={error} compact />}
      {card && (
        <div className="space-y-4" data-testid="support-card">
          <div className="flex flex-col items-end">
            <div className="max-w-[92%] rounded-2xl rounded-br-md bg-primary-50 px-4 py-3 text-sm text-slate-900">
              <p className="whitespace-pre-wrap break-words" data-testid="support-text-shown">{card.text}</p>
            </div>
            <span className="mt-1 text-xs text-slate-400">Вы · {formatUtcNaiveAsBusinessDateTime(card.created_at)}</span>
          </div>
          {card.attachments.length > 0 && (
            <ul className="space-y-1" data-testid="support-attachments">
              {card.attachments.map((file) => (
                <li key={file.id}>
                  <a href={supportApi.fileUrl(file.id)} className="inline-flex items-center gap-2 text-sm text-primary-700 hover:underline" download>
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />{supportFileLabel(file)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {card.messages.map((message) => (
            <div key={message.id} className={message.from === "me" ? "flex flex-col items-end" : "flex flex-col items-start"} data-testid={message.from === "me" ? "support-msg-me" : "support-msg-team"}>
              <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${message.from === "me" ? "rounded-br-md bg-primary-50 text-slate-900" : "rounded-bl-md bg-slate-100 text-slate-900"}`}>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
              </div>
              <span className="mt-1 text-xs text-slate-400">{message.from === "me" ? "Вы" : "Команда ALGO"} · {formatUtcNaiveAsBusinessDateTime(message.created_at)}</span>
            </div>
          ))}

          {card.can_attach && (
            <div>
              <FileInput ref={picker} accept="image/*" onChange={(e) => void attach(e.target.files)} aria-label="Приложить снимок" data-testid="support-card-file" />
              <Button type="button" variant="ghost" size="sm" icon={<Paperclip className="h-4 w-4" />} onClick={() => picker.current?.click()} disabled={busy}>Приложить снимок</Button>
              {fileError && <p role="alert" className="mt-1 text-xs text-red-500">{fileError}</p>}
            </div>
          )}

          {(card.can_reply || card.can_reopen) ? (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <Textarea
                aria-label={card.status === "resolved" ? "Ответ, чтобы открыть обращение снова" : "Ответ"}
                placeholder={card.status === "waiting" ? "Ответьте на вопрос команды" : card.status === "resolved" ? "Что осталось нерешённым" : "Ваш ответ"}
                rows={3}
                value={reply}
                error={replyError ?? undefined}
                onChange={(e) => { setReply(e.target.value); setReplyError(null); }}
                data-testid="support-reply"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => void send()}
                  loading={busy}
                  icon={card.status === "resolved" ? <RotateCcw className="h-4 w-4" /> : undefined}
                  data-testid="support-reply-send"
                >
                  {card.status === "resolved" ? "Открыть снова" : "Ответить"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="support-closed">{SUPPORT_CLOSED_NOTE}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
