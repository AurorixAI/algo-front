"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "./bits";
import { errorText } from "../lib/hooks";

interface ConfirmProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  /** Resolves when the action is done (the dialog closes); a rejection shows its message in the dialog. */
  onConfirm: (input: { reason: string; flag: boolean }) => Promise<void>;
  /** Ask for a reason. `required` makes it mandatory (`validate` returns the error text). */
  reason?: { label: string; placeholder?: string; required?: boolean; validate?: (value: string) => string | null; hint?: string };
  /** A checkbox under the reason («Отправить письмо заявителю»). */
  flag?: { label: string; initial?: boolean };
  children?: ReactNode;
}

/**
 * ONE confirmation dialog for every change in the console (approve, decline, block, unblock, send a link...): nothing happens on
 * the first click, a second click on «confirm» while the call runs does nothing, a server refusal stays in the dialog in plain
 * words.  Built on the platform's Modal (focus trap, Escape, scroll lock).
 */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, onClose, onConfirm, reason, flag, children }: ConfirmProps) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(flag?.initial ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setText("");
      setChecked(flag?.initial ?? false);
      setBusy(false);
      setError(null);
      setFieldError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (busy) return;
    if (reason?.required || (reason?.validate && text.trim())) {
      const problem = reason.validate ? reason.validate(text) : text.trim() ? null : "Укажите причину";
      if (problem) { setFieldError(problem); return; }
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: text.trim(), flag: checked });
      onClose();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={submit} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        {reason && (
          <Textarea
            label={reason.label}
            placeholder={reason.placeholder}
            hint={reason.hint}
            rows={3}
            value={text}
            error={fieldError}
            onChange={(event) => { setText(event.target.value); setFieldError(undefined); }}
          />
        )}
        {flag && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            {flag.label}
          </label>
        )}
        {error && <Notice tone="red">{error}</Notice>}
      </div>
    </Modal>
  );
}
