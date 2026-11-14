"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  normalizePayoutState,
  PAYOUT_ACTION_LABEL,
  PAYOUT_CHIP_CLASS,
  advanceLines,
  livePayouts,
  payoutError,
  payoutKindMark,
  payoutLine,
  sheetPayoutChip,
  validatePayoutVoid,
  type PayoutOut,
  type PayoutState,
} from "@/lib/payroll-logica";
import type { PayrollErrorLike } from "@/lib/payroll";
import { PayoutDialog } from "./payout-dialog";
import { Button } from "@/components/ui/button";

/**
 * The block «Выплата» of a sheet: the chip with what is left («Осталось выплатить 125 000») or what was overpaid, a line only when it says something the chip does not (an advance, what
 * happens to an overpay), the button «Отметить выплату» and the history of the payouts («05.11.2026 · 475 000 · Наличные · Арслан · Отменить»; a cancelled one stays, grey).
 * Every number is on the screen ONCE (rule 87): the sum is the card above, the payouts are the list below.  A payout is never rewritten: after the data changed the card says «изменилась на ±N».
 */
export function SheetPayoutBlock({
  sheetId, month, teacherName, payout, onChanged,
}: {
  sheetId: string;
  month: string;
  teacherName: string;
  payout: PayoutState | null | undefined;
  /** The money of the sheet changed: the page reads the sheet again; `text` is for a toast. */
  onChanged: (text: string) => void;
}) {
  const state = normalizePayoutState(payout);
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const chip = sheetPayoutChip(state);
  const live = livePayouts(state);
  const cancelled = state.items.filter((item) => item.voided_at);
  return (
    <section aria-label="Выплата" className="rounded-2xl border border-slate-200 bg-white px-5 py-4 print:hidden" data-testid="sheet-payout">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            Выплата
            {chip && <span className={`rounded-2xl border px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_CHIP_CLASS[chip.tone]}`}>{chip.text}</span>}
          </h2>
          {advanceLines(state, month).map((line) => <p key={line} className="mt-1 text-xs text-slate-500" data-testid="payout-advance">{line}</p>)}
          {state.fresh_total === null && state.state !== "settled" && (
            <p className="mt-1 text-xs text-slate-500">Новую сумму посчитать нельзя (нет ставки или цена задана вручную) — за основу взята сохранённая; пересчитайте после указания ставки.</p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          variant="primary" size="md"
        >
          {PAYOUT_ACTION_LABEL}
        </Button>
      </div>

      {(live.length > 0 || cancelled.length > 0) && (
        <ul aria-label="Выплаты" className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {state.items.map((item) => <PayoutItem key={item.id} item={item} kind={payoutKindMark(state, item)} onChanged={onChanged} />)}
        </ul>
      )}

      <PayoutDialog open={open} sheetId={sheetId} teacherName={teacherName} month={month} state={state} onClose={() => setOpen(false)} onDone={onChanged} />
    </section>
  );
}

function PayoutItem({ item, kind, onChanged }: { item: PayoutOut; /** `payoutKindMark`: «аванс» / «с авансом» / null (an ordinary payout). */ kind: string | null; onChanged: (text: string) => void }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = Boolean(item.voided_at);

  const submit = async () => {
    if (busy) return;
    const problem = validatePayoutVoid(reason);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await orgApi.voidPayrollPayout(item.id, reason.trim());
      setVoiding(false);
      onChanged("Выплата отменена");
    } catch (cause) {
      setError(payoutError(cause as PayrollErrorLike).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`py-2 text-sm ${cancelled ? "text-slate-500" : "text-slate-800"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={`min-w-0 break-words ${cancelled ? "line-through" : ""}`}>
          {payoutLine(item)}
          {/* the KIND of the payout (never the state of the month: the chip says that); the person's own note is a quotation, so it does not read as a status */}
          {kind && !cancelled ? <span data-testid="payout-kind" className="font-semibold text-sky-800"> · {kind}</span> : null}
          {item.note ? <span className="italic text-slate-500"> · «{item.note}»</span> : null}
        </p>
        {!cancelled && !voiding && (
          <button type="button" onClick={() => { setVoiding(true); setError(null); }} className="inline-flex min-h-10 items-center text-xs font-semibold text-rose-700 hover:underline">Отменить</button>
        )}
      </div>
      {cancelled && <p className="text-xs text-slate-500">Отменена: {item.void_reason || "причина не указана"} · не учитывается</p>}
      {voiding && (
        <div className="mt-1.5 space-y-1.5">
          <input
            aria-label="Причина отмены выплаты"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null); }}
            placeholder="Причина отмены"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
          {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void submit()} disabled={busy} variant="danger" size="sm">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Отменить выплату
            </Button>
            <Button type="button" onClick={() => setVoiding(false)} disabled={busy} variant="ghost" size="sm">Не надо</Button>
          </div>
        </div>
      )}
    </li>
  );
}
