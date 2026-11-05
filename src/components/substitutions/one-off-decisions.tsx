"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { capitalizeFirst } from "@/lib/business-time";
import {
  DECISIONS_GROUP_HINT, DECISIONS_GROUP_HINT_VIEW, DECISIONS_GROUP_TITLE, DECISIONS_LOAD_ERROR_TEXT, DECISION_MONTH_CLOSED_TEXT, DECISION_NO_SHEET_TEXT, DECISION_PAY_LABEL, DECISION_SKIP_LABEL,
  decisionAskedLine, decisionLessonLine, decisionNote, decisionPayLines, decisionQuestion, decisionSheetWarning, decisionToast, decisionWhoLine, decisionsViewLine, isAlreadyDecided, isMoneyRightRefusal, oneOffRefusalText,
  previewNamesSheetSum, shortDay,
  type OneOffDecision, type OneOffDecisionItem,
} from "@/lib/one-off";
import { periodClosedOf } from "@/lib/closed-period";
import { toastWithEffects } from "@/lib/money-effects";
import { effectsAllowConfirm } from "@/lib/money-preview";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";
import { PeriodClosedNotice } from "@/components/money/period-closed-notice";

/**
 * One row of the payment of an additional lesson (#159 U4) - the same row for who decides (with the buttons) and for who only looks (an administrator without the right).
 * «7-А Алгебра · вт 27.10 · 16:00–17:00» and under it «провёл Рахимов Т. · были 2 из 3» (+ «Просит оплатить: …» only when the asker is not the one who held the lesson).  The question of the
 * server («Дополнительный урок — оплатить преподавателю?») is the title of the section and of the window, not repeated in every row.  A phone: the buttons are under the text.
 */
export function PaymentRow({ item, canDecide, onPick, onReopened }: {
  item: OneOffDecisionItem;
  canDecide: boolean;
  onPick: (item: OneOffDecisionItem, decision: OneOffDecision) => void;
  /** The month of the teacher was reopened from the row: the list is read again. */
  onReopened?: () => void;
}) {
  const asked = decisionAskedLine(item);
  // D-4 (walk of 05.11): a month a saved sheet has closed refuses the decision, so the buttons wait and the row shows the way out (the same notice as the window of an excuse and the decided rows)
  const closed = canDecide && item.periodClosed === true;
  return (
    <li data-testid="one-off-decision-row" data-period-closed={closed ? "true" : undefined} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{decisionLessonLine(item)}</p>
        <p className="mt-0.5 text-xs text-slate-500">{decisionWhoLine(item)}{asked ? ` · ${asked}` : ""}</p>
        {closed && (
          <PeriodClosedNotice
            className="mt-1.5"
            info={{ month: item.payrollSheet?.month ?? item.lessonDate.slice(0, 7), teacherId: item.teacher?.id ?? null, teacherName: item.teacher?.name ?? null, closedOn: null, message: DECISION_MONTH_CLOSED_TEXT }}
            onReopened={() => onReopened?.()}
          />
        )}
      </div>
      {canDecide && (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={closed}
            onClick={() => onPick(item, "pay")}
            aria-label={`${DECISION_PAY_LABEL}: ${item.groupName}, ${shortDay(item.lessonDate)}`}
            className="h-9 flex-1 rounded-lg bg-primary-600 px-4 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 md:flex-none"
          >
            {DECISION_PAY_LABEL}
          </button>
          <button
            type="button"
            disabled={closed}
            onClick={() => onPick(item, "skip")}
            aria-label={`${DECISION_SKIP_LABEL}: ${item.groupName}, ${shortDay(item.lessonDate)}`}
            className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 md:flex-none"
          >
            {DECISION_SKIP_LABEL}
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The additional lessons that wait for «Оплатить / Не оплачивать», as a group of rows over the requests of «Замены» (#154).  The decision is the owner's and
 * the administrator's WITH the right of payments (#159, `canDecide`): an administrator without it sees the queue and the status, not the buttons.  A row appears
 * after the lesson was held; there is no amount anywhere (the amounts are the owner's), only the lesson, who held it and how many students came.  The window says
 * it when the sheet of the month is already paid.  The decision is taken once.
 */
export function OneOffDecisionsBlock({ items, loading, error, canDecide, rightLost, onRightLost, onRefreshProfile, onRetry, onDecided, showToast }: {
  items: OneOffDecisionItem[];
  loading: boolean;
  error: string | null;
  /** `canDecideMoney(user)`: the buttons are there only for who decides (an absent right is no right). */
  canDecide: boolean;
  /**
   * The server said «нет права» for the profile this page holds (#159 E7 / M2 tail): the buttons go, the queue stays.  The PAGE keeps the mark (`moneyRightLostFor`), not the block - the block is
   * unmounted on the tab «Решённые», and the counter of the tab and the badge of the menu read the same mark.
   */
  rightLost: boolean;
  /** The server refused with «нет права»: the page remembers it for the profile it holds. */
  onRightLost: () => void;
  /** «Обновить» next to the words about the lost right: read the profile again (and the list). */
  onRefreshProfile?: () => void;
  onRetry: () => void;
  /** The lesson was decided (or somebody did it before): the page reads the list and the counters again. */
  onDecided: (lessonId: string) => void;
  showToast: (text: string, type: "success" | "error" | "warning", details?: string[]) => void;
}) {
  const [dialog, setDialog] = useState<{ item: OneOffDecisionItem; decision: OneOffDecision } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  const [viewOpen, setViewOpen] = useState(false);
  const mayDecide = canDecide && !rightLost;
  // D-4 / D-5 (walk of 05.11, I-5): what the decision does to the saved sheet of the month - the dry run of the same request, asked when the window opens; the button waits for it
  // (a closed month is the refusal of the server with «Переоткрыть месяц» inside the block, and the button stays off)
  const asked = dialog;
  const { preview, retry } = useMoneyPreview(
    asked ? `${asked.item.lessonId}|${asked.decision}` : null,
    (signal) => (asked ? orgApi.decideOneOffMoney(asked.item.lessonId, asked.decision, { dryRun: true, signal }) : Promise.reject(new Error("no decision"))),
  );
  const ready = effectsAllowConfirm(preview);

  const close = () => { if (!busy) { setDialog(null); setProblem(null); } };
  const confirm = async () => {
    if (!dialog || sending.current || !ready) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const result = await orgApi.decideOneOffMoney(dialog.item.lessonId, dialog.decision);
      const note = toastWithEffects(result);
      showToast(decisionToast(dialog.decision), note.tone, note.details);
      setDialog(null);
      onDecided(dialog.item.lessonId);
    } catch (failure) {
      if (isMoneyRightRefusal(failure)) {
        // the right was taken away between the opening of the window and the press: say it in words, close the window (it is not stuck), keep the queue
        onRightLost();
        showToast(oneOffRefusalText(failure, "Решение об оплате принимает владелец или администратор с правом на оплаты"), "warning");
        setDialog(null);
      } else if (isAlreadyDecided(failure)) {
        // the other administrator was first (or the lesson is gone): say it, and the row leaves the list on the re-read
        showToast(oneOffRefusalText(failure, "Решение уже принято"), "warning");
        setDialog(null);
        onDecided(dialog.item.lessonId);
      } else if (periodClosedOf(failure)) {
        // the month was closed between the preview and the press: ask again - the block shows the refusal and the way out, the button stays off
        retry();
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

  // an administrator's «Ведомость уже сохранена» is the block of the preview («Изменится ведомость: …»); only the owner's «уже выплачена» is added to it
  const warning = dialog ? decisionSheetWarning(dialog.item.payrollSheet) : null;
  const effects = preview.status === "ready" ? preview.effects : null;
  const payLines = dialog ? decisionPayLines(dialog.item, dialog.decision, preview.status === "ready" && !previewNamesSheetSum(effects)) : [];
  const pick = (item: OneOffDecisionItem, decision: OneOffDecision) => { setProblem(null); setDialog({ item, decision }); };
  return (
    <section aria-label={DECISIONS_GROUP_TITLE} data-testid="one-off-decisions" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {mayDecide ? (
        <header className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-900" data-testid="one-off-decisions-title">{DECISIONS_GROUP_TITLE} · {items.length}</h2>
          <p className="text-xs text-slate-500" data-testid="one-off-decisions-hint">{DECISIONS_GROUP_HINT}</p>
        </header>
      ) : (
        /* an administrator without the right (U4): information, not his task - ONE row that opens the list */
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
          <button type="button" data-testid="one-off-decisions-toggle" aria-expanded={viewOpen} onClick={() => setViewOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-700">
            <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${viewOpen ? "rotate-90" : ""}`} aria-hidden />
            <span data-testid="one-off-decisions-title">{decisionsViewLine(items.length)}</span>
          </button>
          {rightLost && onRefreshProfile && (
            <button type="button" data-testid="one-off-decisions-refresh" onClick={onRefreshProfile} className="shrink-0 text-xs font-semibold text-primary-700 underline hover:text-primary-800">Обновить</button>
          )}
        </div>
      )}
      {!mayDecide && viewOpen && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500" data-testid="one-off-decisions-hint">{DECISIONS_GROUP_HINT_VIEW}</p>}
      {(mayDecide || viewOpen) && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {items.map((item) => <PaymentRow key={item.lessonId} item={item} canDecide={mayDecide} onPick={pick} onReopened={onRetry} />)}
        </ul>
      )}

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
              disabled={busy || !ready}
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
            <p>{capitalizeFirst(decisionWhoLine(dialog.item))}</p>
            <p className="text-slate-600">
              {decisionNote(dialog.decision)}
            </p>
            {payLines.length > 0 && (
              <ul data-testid="one-off-decision-pay" className="space-y-0.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
                {payLines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
            <MoneyEffectsBlock preview={preview} onRetry={retry} noneText={dialog.decision === "pay" ? DECISION_NO_SHEET_TEXT : undefined} />
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
