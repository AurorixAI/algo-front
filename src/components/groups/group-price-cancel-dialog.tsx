"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { isCancelRefused, type GroupPrices, type HistoryItemView } from "@/lib/group-price";
import { Modal } from "@/components/ui/modal";

/**
 * «Отменить» a SCHEDULED group price (a row that starts after today): the row is taken back (DELETE) after a confirmation.
 * The server refuses a price that is in force already (409) and one that is gone (404): its words are shown, nothing is
 * left to confirm and the block reads the price again (`onRefused`).
 */
export function GroupPriceCancelDialog({
  groupId, groupName, target, onClose, onDone, onRefused,
}: {
  groupId: string;
  groupName: string;
  target: HistoryItemView | null;
  onClose: () => void;
  /** The server took the price back and answered like the GET. */
  onDone: (prices: GroupPrices) => void;
  onRefused: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setBusy(false);
    setError(null);
    setRefused(false);
  }, [target?.id]);

  const submit = async () => {
    if (!target || busy || refused) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await orgApi.cancelGroupPrice(groupId, target.id));
      onClose();
    } catch (cause) {
      if (isCancelRefused(cause)) {
        setRefused(true);
        setError(cause instanceof Error ? cause.message : "Цену нельзя отменить");
        onRefused();
      } else {
        setError(cause instanceof Error ? cause.message : "Не удалось отменить цену");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title="Отменить запланированную цену?"
      description={groupName}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">{refused ? "Закрыть" : "Не отменять"}</button>
          {!refused && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Отменить цену
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-3 pb-2">
        {target && <p className="text-sm font-medium text-slate-800">{target.amount} · {target.since}</p>}
        <p className="text-sm text-slate-600">До этого дня остаётся прежняя цена. Отмена останется в истории.</p>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </div>
    </Modal>
  );
}
