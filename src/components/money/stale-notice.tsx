"use client";

import { Notice } from "@/components/ui/notice";
import { STALE_WINDOW_TEXT } from "@/lib/use-transfer-stale";

/** The calm sentence above the numbers of a window of money after a 409 `BALANCE_CHANGED`: the numbers below are the new ones, nothing was written. */
export function StaleNotice() {
  return <Notice variant="info" compact testId="balance-stale">{STALE_WINDOW_TEXT}</Notice>;
}
