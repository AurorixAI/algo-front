"use client";

import { Select } from "@/components/ui/select";
import { useState } from "react";
import { Check, Copy, Loader2, Send } from "lucide-react";
import QRCode from "qrcode.react";
import { orgApi } from "@/lib/api";
import { DIAGNOSTIC_KIND_LABEL, diagnosticLink, shareUrls, type DiagnosticKind } from "@/lib/student-diagnostic";
import { useCopy } from "@/lib/use-copy";
import { Modal } from "@/components/ui/modal";

const CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];

/**
 * «Новая диагностика…» on the card of a student (administrator): the kind and the class, then the invite: the link, the QR code, WhatsApp
 * and Telegram, like step 2 of «Новый ученик» - but for a student who already exists.
 */
export function StudentDiagnosticDialog({ open, studentId, studentName, classLevel, initialKind, onClose, onCreated }: {
  open: boolean;
  studentId: string;
  studentName: string;
  classLevel: number;
  initialKind: DiagnosticKind;
  onClose: () => void;
  /** The invite exists: the card reads its diagnostics again. */
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<DiagnosticKind>(initialKind);
  const [level, setLevel] = useState<number>(classLevel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const link = code && typeof window !== "undefined" ? diagnosticLink(window.location.origin, code) : "";
  const share = shareUrls(link);
  const levels = CLASS_LEVELS.includes(classLevel) ? CLASS_LEVELS : [...CLASS_LEVELS, classLevel].sort((a, b) => a - b);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const invite = await orgApi.createDiagnostic({ student_id: studentId, class_level: level, diagnostic_type: kind });
      setCode(invite.code);
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать диагностику");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Новая диагностика"
      description={`${studentName} · ${classLevel} класс`}
      onClose={onClose}
      busy={busy}
      footer={code ? (
        <button type="button" onClick={onClose} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">Готово</button>
      ) : (
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button type="button" onClick={() => void create()} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Создать ссылку
          </button>
        </>
      )}
    >
      {code ? (
        <div className="space-y-4 pb-2" data-testid="student-diagnostic-created">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><QRCode value={link} size={120} /></div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-semibold text-slate-500">Ссылка для прохождения</p>
              <p className="select-all truncate rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700">{link}</p>
              <p className="text-xs text-slate-500">Код действителен 7 дней, одна попытка.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => void copy(link, "link")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {copied === "link" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied === "link" ? "Скопировано" : "Копировать ссылку"}
            </button>
            <a href={share.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50"><Send className="h-4 w-4 text-emerald-600" />WhatsApp</a>
            <a href={share.telegram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-sky-50"><Send className="h-4 w-4 text-sky-500" />Telegram</a>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div>
            <label htmlFor="student-diagnostic-kind" className="mb-1 block text-xs font-semibold text-slate-600">Вид диагностики</label>
            <Select
              id="student-diagnostic-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as DiagnosticKind)}
              options={(Object.keys(DIAGNOSTIC_KIND_LABEL) as DiagnosticKind[]).map((value) => ({ value, label: DIAGNOSTIC_KIND_LABEL[value] }))}
              buttonClassName="bg-white py-2.5"
            />
          </div>
          <div>
            <label htmlFor="student-diagnostic-class" className="mb-1 block text-xs font-semibold text-slate-600">Класс</label>
            <Select
              id="student-diagnostic-class"
              value={String(level)}
              onChange={(event) => setLevel(Number(event.target.value))}
              options={levels.map((value) => ({ value: String(value), label: `${value} класс` }))}
              className="sm:w-1/2"
              buttonClassName="bg-white py-2.5"
            />
          </div>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
