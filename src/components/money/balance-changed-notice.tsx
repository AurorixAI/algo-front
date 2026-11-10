"use client";

import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money-format";

/**
 * Money-1 V1: a 409 `BALANCE_CHANGED` - somebody changed the account while the window was open.  The amber notice says it in the words of the server («Долг изменился: было 100 000 сум, сейчас 70 000 сум»)
 * and the window goes on with the NEW number («Продолжить с 70 000 сум»): nothing is written by the notice itself.  `fresh` 0 - there is nothing left to do: `emptyText` and «Закрыть».
 */
export function BalanceChangedNotice({ message, fresh, emptyText, onContinue, onClose, note }: {
  /** The sentence of the server as it came. */
  message: string;
  /** The number the window continues with. */
  fresh: number;
  /** «Долга больше нет» / «Возвращать нечего»: said when `fresh` is 0. */
  emptyText: string;
  onContinue: () => void;
  onClose: () => void;
  /** One more line under the sentence («Сумма уменьшена до 70 000 сум»). */
  note?: string | null;
}) {
  const nothingLeft = fresh <= 0;
  return (
    <Notice
      variant="warning"
      compact
      testId="balance-changed"
      title={message}
      action={nothingLeft
        ? <Button type="button" variant="secondary" size="sm" onClick={onClose} data-testid="balance-changed-close">Закрыть</Button>
        : <Button type="button" variant="secondary" size="sm" onClick={onContinue} data-testid="balance-changed-continue">Продолжить с {formatMoney(fresh)}</Button>}
    >
      {nothingLeft ? emptyText : note || null}
    </Notice>
  );
}
