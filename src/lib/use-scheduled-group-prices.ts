"use client";

import { useEffect, useState } from "react";
import { orgApi } from "./api";
import type { GroupPriceScheduled } from "./group-price";

/** One request serves every row on the screen that asks within a few seconds. */
let shared: { at: number; answer: Promise<Record<string, GroupPriceScheduled>> } | null = null;
const SHARED_FOR_MS = 5000;
function loadScheduled(): Promise<Record<string, GroupPriceScheduled>> {
  if (shared && Date.now() - shared.at < SHARED_FOR_MS) return shared.answer;
  const answer = orgApi.listGroupPrices().then((list) => {
    const next: Record<string, GroupPriceScheduled> = {};
    for (const item of list.items ?? []) if (item.scheduled) next[item.group_id] = item.scheduled;
    return next;
  });
  answer.catch(() => { if (shared?.answer === answer) shared = null; });
  shared = { at: Date.now(), answer };
  return answer;
}

/**
 * G3M Ф6: the prices that start LATER, per group (`GET /org/group-prices`: `scheduled`).  The list and the card of a group send `price_current` only (null while the first price is still ahead),
 * so a screen that is about to write «цена не задана» asks here first.  `enabled` false (nothing lacks a price, or the role has no money) asks nothing; a failure leaves the map empty - the old words stand.
 */
export function useScheduledGroupPrices(enabled: boolean): Record<string, GroupPriceScheduled> {
  const [map, setMap] = useState<Record<string, GroupPriceScheduled>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadScheduled().then((next) => { if (alive) setMap(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, [enabled]);
  return map;
}
