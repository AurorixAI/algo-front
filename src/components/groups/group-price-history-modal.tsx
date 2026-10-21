"use client";

import { useState } from "react";
import { formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";
import { groupCancelledLine, historyViews, type GroupPrices, type HistoryItemView } from "@/lib/group-price";
import { Modal } from "@/components/ui/modal";
import { GroupPriceCancelDialog } from "./group-price-cancel-dialog";

const STATUS_TAG: Record<HistoryItemView["status"], { text: string; className: string } | null> = {
  current: { text: "действует", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  future: { text: "ожидает даты", className: "border-amber-200 bg-amber-50 text-amber-800" },
  past: null,
};

/**
 * «История цены» of a group (page «Цены групп»): every price with the day it started, the note and the audit trail
 * (who changed it, from what to what), the scheduled ones with «Отменить» (after a confirmation), the last cancelled ones
 * below.  `prices` is what `GET /org/groups/{id}/prices` sent; a cancellation answers with the same shape (`onChanged`).
 */
export function GroupPriceHistoryModal({
  open, groupId, groupName, prices, onClose, onChanged, onRefused, onNotify,
}: {
  open: boolean;
  groupId: string;
  groupName: string;
  prices: GroupPrices | null;
  onClose: () => void;
  /** A scheduled price was taken back: the new state of the group. */
  onChanged: (prices: GroupPrices) => void;
  /** The server refused the cancellation (409/404): the state is read again. */
  onRefused: () => void;
  onNotify: (text: string) => void;
}) {
  const [cancelTarget, setCancelTarget] = useState<HistoryItemView | null>(null);
  const history = prices ? historyViews(prices.history, prices.price_label, formatUtcNaiveAsBusinessDateTime) : [];
  const cancelled = prices?.cancelled ?? [];

  return (
    <>
      <Modal open={open && prices !== null} title="История цены" description={groupName} onClose={onClose} maxWidthClassName="max-w-lg">
        {history.length === 0 && cancelled.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">Цена этой группы ещё не задавалась.</p>
        ) : (
          <div className="pb-2">
            {history.length > 0 && (
              <ol aria-label="История цены" className="divide-y divide-slate-100">
                {history.map((item) => {
                  const tag = STATUS_TAG[item.status];
                  return (
                    <li key={item.id} className="py-2.5 text-sm">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-800">
                        <span className="font-semibold tabular-nums">{item.amount}</span>
                        <span className="text-slate-500">{item.since}</span>
                        {tag && <span className={`rounded-md border px-1.5 py-px text-[11px] font-semibold ${tag.className}`}>{tag.text}</span>}
                      </p>
                      {item.note && <p className="break-words text-xs text-slate-600">{item.note}</p>}
                      {item.changes.map((line) => <p key={line} className="text-xs text-slate-500">{line}</p>)}
                      {item.author && <p className="text-[11px] text-slate-400">{item.author}</p>}
                      {item.status === "future" && (
                        <button type="button" onClick={() => setCancelTarget(item)} className="mt-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline">
                          Отменить
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {cancelled.length > 0 && (
              <div className="border-t border-slate-100 pt-2.5">
                <p className="text-xs font-semibold text-slate-400">Отменённые</p>
                <ul aria-label="Отменённые цены" className="mt-1 space-y-0.5">
                  {cancelled.map((item, index) => <li key={index} className="text-xs text-slate-500">{groupCancelledLine(item)}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <GroupPriceCancelDialog
        groupId={groupId}
        groupName={groupName}
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onRefused={onRefused}
        onDone={(next) => {
          onChanged(next);
          onNotify("Запланированная цена отменена");
        }}
      />
    </>
  );
}
