"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter, MONEY_WINDOW_QUESTION } from "@/components/money/dialog-footer";
import { tidyMoneyText } from "@/lib/money-format";
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
      description={shown?.subtitle ? tidyMoneyText(shown.subtitle) : undefined}
      onClose={() => answerConfirm(false)}
      maxWidthClassName={MONEY_WINDOW_QUESTION}
      aboveLessonPanel
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // Re-audit В1: the footer of EVERY window of money - a flat main button, «Отмена» as plain text, one line each
        <ConfirmFooter
          primary={shown?.confirmLabel ?? "Да"}
          tone={shown?.tone === "danger" ? "danger" : "primary"}
          onPrimary={() => answerConfirm(true)}
          onCancel={() => answerConfirm(false)}
          cancelLabel={shown?.cancelLabel ?? "Отмена"}
          testId="confirm-ok"
        />
      )}
    >
      <div className="space-y-3 pb-2 text-sm text-slate-600">
        {shown?.message && <p className="whitespace-pre-line" data-testid="confirm-message">{tidyMoneyText(shown.message)}</p>}
        {shown?.items && shown.items.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 px-3.5" data-testid="confirm-items">
            {shown.items.map((item, index) => (
              <li key={`${item.label ?? ""}|${item.text}|${index}`} className="flex flex-wrap items-baseline gap-x-3 py-2 text-slate-800">
                {item.label && <span className="w-full shrink-0 font-medium text-slate-900 sm:w-36">{item.label}</span>}
                <span className="min-w-0 flex-1">{tidyMoneyText(item.text)}</span>
                {item.note && <span className="text-xs text-slate-500">{item.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {shown?.link && (
          <Link href={shown.link.href} onClick={() => answerConfirm(false)} data-testid="confirm-link" className="inline-flex min-h-10 items-center rounded-lg text-sm font-semibold text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">{shown.link.label}</Link>
        )}
        {shown?.footnote && <p data-testid="confirm-footnote">{tidyMoneyText(shown.footnote)}</p>}
      </div>
    </Modal>
  );
}

/** The platform's question from a component: `if (!(await confirm({ title, message, confirmLabel }))) return;` */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  return askConfirm;
}
