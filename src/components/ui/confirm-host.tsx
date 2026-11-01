"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { answerConfirm, askConfirm, currentConfirm, subscribeConfirm, type ConfirmRequest, type PendingConfirm } from "@/lib/confirm-dialog";

/**
 * Draws the question of `askConfirm()` in the platform's modal style.  Mounted ONCE in the root layout; the lesson
 * panels' z-index tier is used, so the question is never hidden behind a full-screen panel.
 */
export function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // The text stays while the dialog fades out (the question is already answered and gone from the queue).
  const [shown, setShown] = useState<PendingConfirm | null>(null);
  useEffect(() => {
    const sync = () => {
      const now = currentConfirm();
      setPending(now);
      if (now) setShown(now);
    };
    sync();
    return subscribeConfirm(sync);
  }, []);
  // Leaving the page with a question open must not leave its promise hanging: the answer is «no».
  useEffect(() => () => {
    while (currentConfirm()) answerConfirm(false);
  }, []);

  return (
    <Modal
      open={pending !== null}
      title={shown?.title ?? ""}
      onClose={() => answerConfirm(false)}
      maxWidthClassName="max-w-md"
      aboveLessonPanel
      footer={
        <>
          <Button variant="secondary" size="md" onClick={() => answerConfirm(false)}>{shown?.cancelLabel ?? "Отмена"}</Button>
          <Button variant={shown?.tone === "danger" ? "danger" : "primary"} size="md" onClick={() => answerConfirm(true)}>
            {shown?.confirmLabel ?? "Да"}
          </Button>
        </>
      }
    >
      {shown?.message && <p className="whitespace-pre-line text-sm text-slate-600">{shown.message}</p>}
    </Modal>
  );
}

/** The platform's question from a component: `if (!(await confirm({ title, message, confirmLabel }))) return;` */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  return askConfirm;
}
