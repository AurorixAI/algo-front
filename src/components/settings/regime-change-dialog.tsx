"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { EFFECTS_LOADING_TEXT, EFFECTS_RETRY_LABEL, EFFECTS_TITLE } from "@/lib/money-effects";
import { accountingStartImpactLines } from "@/lib/payments";
import { REGIME_HINT, regimeImpactLines, type RegimeImpact } from "@/lib/payments-logica";
import { createRequestSequence } from "@/lib/request-sequence";
import { DEBT_ADVANCE_NONE, debtAdvanceFooter, normalizeWhatIf, REGIME_WAIT_WHY, REGIME_WINDOW, regimeChangeKind, type WhatIfWindow } from "@/lib/whatif";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter, MONEY_WINDOW_TABLE } from "@/components/money/dialog-footer";
import { WhatIfBody } from "@/components/money/whatif-table";
import { Modal } from "@/components/ui/modal";

type Loaded = { window: WhatIfWindow | null; fallback: string[]; start: string[] };

/** The footer: the lines of the server about the start of the accounting; when it has nothing to say - the debt/advance line counted from the rows of the table itself (Д1: it never contradicts them). */
function startLines(impact: Parameters<typeof accountingStartImpactLines>[0], window: WhatIfWindow | null): string[] {
  if (!impact) return [];
  const lines = accountingStartImpactLines(impact).filter((line) => line !== DEBT_ADVANCE_NONE);
  if (lines.length > 0) return lines;
  const own = debtAdvanceFooter(window);
  return window && window.items.length > 0 ? [own] : [DEBT_ADVANCE_NONE];
}

/**
 * Money-1 B3: the window that stands between «Сохранить» of the payment settings and a change of the billing MODE (a way to count, the day of the shared month, the size of a package).  The
 * server is asked (`dry_run`) what the change does to EACH student it switches - in сум, in lessons and in dates - and the answer is on screen before the button that makes it:
 * «Было → станет» per student, the students with an individual price apart, the totals last.  The button waits for the answer (I-5).
 */
export function RegimeChangeDialog({ open, changes, body, saving, error, onConfirm, onClose }: {
  open: boolean;
  /** The part of the unsaved settings that touches the mode (`regimeChanges`). */
  changes: Record<string, unknown>;
  /** EXACTLY what «Сохранить» sends (the whole changed part of the section): the dry run is asked with it, so «было → станет» is the result that is saved (R3 №5). */
  body: Record<string, unknown>;
  saving: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ loaded: Loaded | null; failed: string | null }>({ loaded: null, failed: null });
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(createRequestSequence());
  const key = JSON.stringify(body);
  const copy = REGIME_WINDOW[regimeChangeKind(changes)];

  useEffect(() => {
    if (!open) return undefined;
    const token = sequence.current.next();
    setState({ loaded: null, failed: null });
    orgApi.previewPaymentSettings(body)
      .then((answer) => {
        if (!sequence.current.isCurrent(token)) return;
        const raw = answer.regime_impact ?? null;
        setState({ loaded: { window: normalizeWhatIf(raw, "regime"), fallback: regimeImpactLines(raw as RegimeImpact | null), start: startLines(answer.impact, normalizeWhatIf(raw, "regime")) }, failed: null });
      })
      .catch((cause) => {
        if (!sequence.current.isCurrent(token)) return;
        setState({ loaded: null, failed: cause instanceof Error ? cause.message : "Не удалось посчитать, что изменится" });
      });
    return () => { sequence.current.next(); };
    // `changes` is a new object on every render of the page; its key stands for the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  const ready = state.loaded !== null;
  const { loaded } = state;

  return (
    <Modal
      open={open}
      title={copy.title}
      description={REGIME_HINT}
      onClose={onClose}
      busy={saving}
      size="lg"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={<ConfirmFooter primary={copy.primary} onPrimary={onConfirm} busy={saving} disabled={!ready} why={REGIME_WAIT_WHY} whyId="regime-why" onCancel={onClose} testId="regime-confirm" />}
    >
      <div className="space-y-3 pb-2" data-testid="regime-window">
        <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700" aria-live="polite">
          <h3 className="text-sm font-semibold text-slate-800">{EFFECTS_TITLE}</h3>
          {state.failed ? (
            <p role="alert" className="flex items-start gap-2 text-amber-900" data-testid="regime-failed">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{state.failed}{" "}<button type="button" onClick={retry} className="font-semibold underline">{EFFECTS_RETRY_LABEL}</button></span>
            </p>
          ) : !loaded ? (
            <div role="status" aria-busy="true" data-testid="regime-skeleton" className="space-y-1.5">
              <span className="sr-only">{EFFECTS_LOADING_TEXT}</span>
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          ) : loaded.window && (loaded.window.items.length > 0 || loaded.window.overrides.length > 0 || loaded.window.text) ? (
            <WhatIfBody window={loaded.window} testId="regime-whatif" />
          ) : (
            <p className="text-slate-600" data-testid="regime-none">{loaded.fallback[0] ?? "Способ оплаты не изменит деньги ни у одного ученика"}</p>
          )}
          {loaded && loaded.start.length > 0 && (
            <ul className="space-y-0.5 border-t border-slate-200 pt-2 text-slate-700" data-testid="regime-start-impact">
              {loaded.start.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </section>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </div>
    </Modal>
  );
}
