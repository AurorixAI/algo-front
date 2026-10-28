"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import {
  DECISIONS_GROUP_HINT, DECISIONS_GROUP_TITLE, DECISIONS_LOAD_ERROR_TEXT, DECISION_PAY_LABEL, DECISION_SKIP_LABEL,
  decisionAskedLine, decisionLessonLine, decisionNote, decisionQuestion, decisionToast, decisionWhoLine, isAlreadyDecided, oneOffRefusalText, payrollWarning, shortDay,
  type OneOffDecision, type OneOffDecisionItem,
} from "@/lib/one-off";

/**
 * The additional lessons (and the make-ups without students) that wait for «Оплатить / Не оплачивать» of the owner / administrator, as a group of
 * rows over the requests of «Замены» (#154).  A row appears after the lesson was held; there is no amount anywhere (the amounts are the owner's), only the
 * lesson, who held it and how many students came.  The window says it when the sheet of the month is already paid.  The decision is taken once.
 */
export function OneOffDecisionsBlock({ items, loading, error, onRetry, onDecided, showToast }: {
  items: OneOffDecisionItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** The lesson was decided (or somebody did it before): the page reads the list and the counters again. */
  onDecided: (lessonId: string) => void;
  showToast: (text: string, type: "success" | "error" | "warning") => void;
}) {
  const [dialog, setDialog] = useState<{ item: OneOffDecisionItem; decision: OneOffDecision } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);

  const close = () => { if (!busy) { setDialog(null); setProblem(null); } };
  const confirm = async () => {
    if (!dialog || sending.current) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await orgApi.decideOneOffMoney(dialog.item.lessonId, dialog.decision);
      showToast(decisionToast(dialog.decision), "success");
      setDialog(null);
      onDecided(dialog.item.lessonId);
    } catch (failure) {
      if (isAlreadyDecided(failure)) {
        // the other administrator was first (or the lesson is gone): say it, and the row leaves the list on the re-read
        showToast(oneOffRefusalText(failure, "Решение уже принято"), "warning");
        setDialog(null);
        onDecided(dialog.item.lessonId);
      } else {
        setProblem(oneOffRefusalText(failure, "Не удалось сохранить решение. Данные не изменены — повторите попытку."));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (error && items.length === 0) {
    return (
      <div role="alert" data-testid="one-off-decisions-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{error || DECISIONS_LOAD_ERROR_TEXT}</span>
        <button type="button" onClick={onRetry} className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100">Повторить</button>
      </div>
    );
  }
  if (items.length === 0) {
    return loading ? <div className="flex items-center gap-2 px-1 text-xs text-slate-500" data-testid="one-off-decisions-loading"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Проверяем уроки, которые ждут решения…</div> : null;
  }

  const warning = dialog ? payrollWarning(dialog.item.payrollSheet) : null;
  return (
    <section aria-label={DECISIONS_GROUP_TITLE} data-testid="one-off-decisions" className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
      <header className="flex items-start gap-3 border-b border-amber-100 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Wallet className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{DECISIONS_GROUP_TITLE} · {items.length}</h2>
          <p className="text-xs text-slate-600">{DECISIONS_GROUP_HINT}</p>
        </div>
      </header>
      <ul className="divide-y divide-amber-100">
        {items.map((item) => {
          const asked = decisionAskedLine(item);
          return (
            <li key={item.lessonId} data-testid="one-off-decision-row" className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{decisionQuestion(item)}</p>
                <p className="mt-0.5 text-sm text-slate-700">{decisionLessonLine(item)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{decisionWhoLine(item)}{asked ? ` · ${asked}` : ""}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => { setProblem(null); setDialog({ item, decision: "pay" }); }}
                  aria-label={`${DECISION_PAY_LABEL}: ${item.groupName}, ${shortDay(item.lessonDate)}`}
                  className="h-9 flex-1 rounded-lg bg-primary-600 px-4 text-xs font-semibold text-white hover:bg-primary-700 md:flex-none"
                >
                  {DECISION_PAY_LABEL}
                </button>
                <button
                  type="button"
                  onClick={() => { setProblem(null); setDialog({ item, decision: "skip" }); }}
                  aria-label={`${DECISION_SKIP_LABEL}: ${item.groupName}, ${shortDay(item.lessonDate)}`}
                  className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:flex-none"
                >
                  {DECISION_SKIP_LABEL}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={dialog !== null}
        title={dialog ? decisionQuestion(dialog.item) : ""}
        description={dialog ? decisionLessonLine(dialog.item) : undefined}
        onClose={close}
        busy={busy}
        maxWidthClassName="max-w-md"
        footer={dialog ? (
          <>
            <button type="button" onClick={close} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button
              type="button"
              data-testid="one-off-decision-confirm"
              onClick={() => void confirm()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {dialog.decision === "pay" ? DECISION_PAY_LABEL : DECISION_SKIP_LABEL}
            </button>
          </>
        ) : null}
      >
        {dialog && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>{decisionWhoLine(dialog.item)}</p>
            <p className="text-slate-600">
              {decisionNote(dialog.decision)}
            </p>
            {warning && (
              <p role="alert" data-testid="one-off-decision-warning" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{warning}</span>
              </p>
            )}
            {problem && (
              <p role="alert" data-testid="one-off-decision-error" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{problem}</span>
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

/** The list of the lessons that wait for a decision of money, read from the server; `reload` re-reads it (silently when asked). */
export function useOneOffDecisions(enabled: boolean): {
  items: OneOffDecisionItem[]; total: number; loading: boolean; error: string | null; reload: (silent?: boolean) => Promise<void>;
} {
  const [items, setItems] = useState<OneOffDecisionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(async (silent = false) => {
    const mine = ++sequence.current;
    if (!enabled) return;
    if (!silent) setLoading(true);
    try {
      const data = await orgApi.getOneOffDecisions();
      if (mine !== sequence.current) return;
      setItems(data?.items ?? []);
      setTotal(data?.total ?? data?.items?.length ?? 0);
      setError(null);
    } catch {
      if (mine !== sequence.current) return;
      // a failed silent read keeps the rows that were known
      if (!silent) setError(DECISIONS_LOAD_ERROR_TEXT);
    } finally {
      if (mine === sequence.current) setLoading(false);
    }
  }, [enabled]);
  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload]);
  return { items, total, loading, error, reload };
}
