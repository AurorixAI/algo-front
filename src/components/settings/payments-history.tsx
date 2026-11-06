"use client";

import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { orgApi } from "@/lib/api";
import { createRequestSequence } from "@/lib/request-sequence";
import { SETTINGS_HISTORY_EMPTY, SETTINGS_HISTORY_FAILED, SETTINGS_HISTORY_TITLE, settingsHistoryOf, type SettingsHistoryEntry } from "@/lib/settings-history";

/**
 * Money-1 B9: «Журнал настроек оплат» - who changed the way to count, the day of the shared month, the package, the recalculation and the start of the accounting, when, and what it did in sums.
 * The OWNER only (the page of settings is the owner's; an administrator gets 403 from the server).  Closed by default - one line; the records are read when it is opened.  A record is a sentence of the
 * server; the students it moved are behind «Подробнее».
 */
export function PaymentsHistory({ refreshKey = "" }: { /** Changes when the settings were saved: an opened journal reads itself again (R3 №19). */ refreshKey?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ entries: SettingsHistoryEntry[] | null; failed: boolean }>({ entries: null, failed: false });
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(createRequestSequence());

  useEffect(() => {
    if (!open) return undefined;
    const token = sequence.current.next();
    setState((previous) => ({ ...previous, failed: false }));
    orgApi.getPaymentSettingsHistory(50)
      .then((answer) => { if (sequence.current.isCurrent(token)) setState({ entries: settingsHistoryOf(answer), failed: false }); })
      .catch(() => { if (sequence.current.isCurrent(token)) setState({ entries: null, failed: true }); });
    return () => { sequence.current.next(); };
  }, [open, nonce, refreshKey]);

  return (
    <section className="rounded-xl bg-slate-50 px-4 py-3" data-testid="payments-history">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="payments-history-body"
        className="flex min-h-10 w-full items-center gap-2 text-left text-sm font-semibold text-slate-900"
      >
        <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
        {SETTINGS_HISTORY_TITLE}
        <span className="ml-auto text-xs font-medium text-primary-700">{open ? "Скрыть" : "Показать"}</span>
      </button>
      {open && (
        <div id="payments-history-body" className="mt-2" data-testid="payments-history-body">
          {state.failed ? (
            <p role="alert" className="text-xs text-rose-700">{SETTINGS_HISTORY_FAILED}{" "}<button type="button" onClick={() => setNonce((value) => value + 1)} className="font-semibold underline">Повторить</button></p>
          ) : state.entries === null ? (
            <div role="status" aria-busy="true" className="space-y-1.5"><div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" /><div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" /></div>
          ) : state.entries.length === 0 ? (
            <p className="text-xs text-slate-600">{SETTINGS_HISTORY_EMPTY}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-200 overflow-y-auto overscroll-contain">
              {state.entries.map((entry) => (
                <li key={entry.id} className="py-2.5 text-[13px] leading-5" data-testid="history-entry">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{entry.kind}</span>
                    <span className="tabular-nums">{entry.when} · {entry.actor}</span>
                  </p>
                  <p className="mt-0.5 break-words text-slate-800">{entry.text}</p>
                  {entry.lines.length > 0 && (
                    <details className="mt-1 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium text-primary-700">Подробнее</summary>
                      <ul className="mt-1 space-y-0.5">
                        {entry.lines.map((line, index) => <li key={`${index}-${line}`} className="break-words">{line}</li>)}
                        {entry.linesMore > 0 && <li className="text-slate-500">и ещё {entry.linesMore}</li>}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
