"use client";

import { useEffect, useRef, useState } from "react";
import { orgApi } from "@/lib/api";
import { priceLabelOf, type GroupPrices, type GroupPriceResult } from "@/lib/group-price";
import { createRequestSequence } from "@/lib/request-sequence";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { GroupPriceDialog } from "./group-price-dialog";

/**
 * IA audit Q3: «Цена группы…» in the «⋯» of the group page.  The same dialog as «Цены групп» (`GroupPriceDialog`: sum, the day, the
 * note, what the change touches before «Сохранить»); this wrapper reads the prices of the group when it opens, so the page does not
 * hold them.  «Цены групп» stays the overview table.
 */
export function GroupPriceAction({ open, groupId, groupName, onClose, onSaved, onError }: {
  open: boolean;
  groupId: string;
  groupName: string;
  onClose: () => void;
  /** The server accepted the price; `wasSet`: it was set before (the toast says «изменена» or «задана»). */
  onSaved: (wasSet: boolean, result: GroupPriceResult) => void;
  onError?: (message: string) => void;
}) {
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const [prices, setPrices] = useState<GroupPrices | null>(null);
  const requests = useRef(createRequestSequence());

  const read = () => {
    const token = requests.current.next();
    return orgApi.getGroupPrices(groupId).then((result) => { if (requests.current.isCurrent(token)) setPrices(result); return result; });
  };

  useEffect(() => {
    if (!open) { requests.current.next(); setPrices(null); return undefined; }
    read().catch((cause) => {
      onError?.(cause instanceof Error ? cause.message : "Не удалось загрузить цену группы");
      onClose();
    });
    return () => { requests.current.next(); };
    // reads again when it is opened (or for another group), not when the parent re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId]);

  if (!open || !prices) return null;
  return (
    <GroupPriceDialog
      open
      groupId={groupId}
      groupName={groupName}
      label={prices.price_label ?? priceLabelOf(periodMode)}
      current={prices.current ?? null}
      history={prices.history ?? []}
      onClose={onClose}
      onSaved={(result) => { onSaved(Boolean(prices.current), result); }}
      onConflict={() => { void read().catch(() => undefined); }}
    />
  );
}
