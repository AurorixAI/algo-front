"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { ModalActions } from "@/components/ui/modal-actions";
import { MODAL_ACTIONS_FOOTER_CLASS } from "@/lib/modal-layout";

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
    <Modal
      open={open}
      title="Изменить название"
      description="Черновик экзамена"
      onClose={onClose}
      busy={saving}
      footerClassName={MODAL_ACTIONS_FOOTER_CLASS}
      footer={<ModalActions primary="Сохранить" submitFor="rename-exam-form" disabled={!title.trim()} busy={saving} onCancel={onClose} />}
    >
      <form id="rename-exam-form" onSubmit={submit} className="space-y-3 pb-2" noValidate>
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
      </form>
    </Modal>
  );
}
