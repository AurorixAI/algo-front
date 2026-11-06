"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { ModalActions } from "@/components/ui/modal-actions";
import { MODAL_ACTIONS_FOOTER_CLASS } from "@/lib/modal-layout";
import { PASS_THRESHOLD_HINT, PASS_THRESHOLD_WHEN_HINT, parsePassThreshold } from "@/lib/exam-pass-threshold";

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
    <Modal
      open={open}
      title="Проходной порог"
      onClose={onClose}
      busy={saving}
      footerClassName={MODAL_ACTIONS_FOOTER_CLASS}
      footer={<ModalActions primary="Сохранить" submitFor="pass-threshold-form" disabled={parsed === null} busy={saving} onCancel={onClose} />}
    >
      <form id="pass-threshold-form" onSubmit={submit} className="space-y-3 pb-2" noValidate>
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
        <p className="text-xs leading-5 text-slate-500">{PASS_THRESHOLD_HINT}. {PASS_THRESHOLD_WHEN_HINT}.</p>
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}
