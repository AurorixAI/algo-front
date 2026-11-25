"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate, formatDayMonthRu } from "@/lib/business-time";
import { REASON_MIN, type MembershipPaymentRow } from "@/lib/payments";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  attendedText,
  buildPauseBody,
  emptyPauseValues,
  firstFreePauseDay,
  isReasonRequired,
  livePauses,
  logicaError,
  pauseCalcLines,
  pauseCalcTail,
  pauseEndAction,
  pauseEndDay,
  pauseFacts,
  pauseGroups,
  pauseIsRunning,
  pauseLine,
  pauseMoneyModel,
  pauseSpan,
  pauseWarnings,
  validatePause,
  PAUSE_REASON_MAX,
  type PauseFormValues,
  type PauseOut,
  type PauseSaved,
} from "@/lib/payments-logica";
import { createRequestSequence } from "@/lib/request-sequence";
import { periodClosedOf, type PeriodClosedInfo } from "@/lib/closed-period";
import { PeriodClosedNotice } from "@/components/money/period-closed-notice";
import { Modal } from "@/components/ui/modal";
import { EFFECTS_LOADING_TEXT } from "@/lib/money-effects";
import { DRY_RUN_REASON } from "@/lib/dry-run";
import { otherGroupsOf } from "@/lib/other-groups";
import { OtherGroupsRows } from "@/components/money/other-groups-rows";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { PauseMoneyBox } from "@/components/payments/pause-money";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";

const CALC_DEBOUNCE_MS = 350;
/** Б11.34 п.3: the two actions of a pause by their meaning - one word, one meaning («Снять паузу целиком» is the void in every case but a pause that has not begun). */
const PAUSE_END_LABEL = "Закончить сегодня";
const PAUSE_END_CONFIRM_LABEL = "Закончить паузу";
const PAUSE_VOID_LABEL = "Снять паузу целиком";
const PAUSE_VOID_PLANNED_LABEL = "Снять паузу";
/** The code of the refusal to change the days of a pause that a leaving cut meanwhile (409). */
const CLOSED_BY_LEAVE = "PAUSE_CLOSED_BY_LEAVE";
/** Б11.39 Э7: the ONE quiet line under the dates while there is no calculation. */
const PAUSE_FORM_HINT = "За дни паузы платить не нужно, место в группе сохраняется.";
const CALC_FAILED_TEXT = "Не удалось посчитать паузу.";
const ACT_FAILED_TEXT = "Не удалось посчитать, что изменится.";

/** The words of a failure of a probe: the server's own (it sent a text or a code) or, when nothing came from it (the network, a broken answer), our one sentence. */
function probeWords(cause: unknown, failure: { code: string | null; message: string }, ours: string): string {
  const detail = (cause as { detail?: unknown } | null | undefined)?.detail;
  const serverText = detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string" && (detail as { message: string }).message.trim() !== "";
  return failure.code || serverText ? failure.message : ours;
}
/** `sm` of the design system: below it the field «С» does not take the focus on open (no keyboard over a window that is read first). */
const WIDE_QUERY = "(min-width: 640px)";

const QUIET_LINK = "-ml-3 min-h-8 text-primary-700 hover:text-primary-800";

/** The state of a pause in the window: the dot and the words (amber = it is on today, calm blue-grey = it has not begun). */
function StateTitle({ state }: { state: "running" | "planned" }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${state === "running" ? "bg-warning-600" : "bg-info-600"}`} />
      {state === "running" ? "Сейчас на паузе" : "Пауза запланирована"}
    </span>
  );
}

/** A pause squeezed into ONE row (a confirmation is under it; a new pause is below it): «● Сейчас на паузе · с 17.11 по 30.11». */
function PauseSummaryRow({ pause, today, state }: { pause: PauseOut; today: string; state: "running" | "planned" | null }) {
  return (
    <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700" data-testid="pause-summary">
      {state && <><StateTitle state={state} /><span aria-hidden="true" className="hidden sm:inline"> · </span></>}
      {/* Б11.41 п. 4: below `sm` the dates stand on their own line whole (no separator left at the end of the first one) */}
      <span className={`whitespace-nowrap ${state ? "block sm:inline" : "font-semibold text-slate-900"}`}>{pauseSpan(pause, today)}</span>
    </p>
  );
}

/**
 * «Пауза ученика» (group «⋯» → «Пауза…» / «Закончить паузу»; PAY-TAILS Б11.39 / Б11.40).  The window shows first what it was opened for: no live pause - the form of a new one; a live one (running now / planned) - its
 * card with the actions «Закончить сегодня» / «Снять паузу целиком», the new pause behind «+ Новая пауза»; the past ones are one quiet fold «Прошлые паузы · N».  The confirmation of an action stands IN the card: the card
 * is squeezed into a row, under it one sentence and the money of the pause as rows (the server's `charge_rows`: the period, the lessons, the sum).  A student who has left gets no form - only the pauses with locked days
 * (a leaving / a transfer cut them), and each can be taken off whole.  The days of a pause are never edited here; the server's words are the screen's words.
 */
export function PauseDialog({
  open, membershipId, studentName, groupName, active: participating = true, onClose, onChanged,
}: {
  open: boolean;
  /** Б11.34 п.1: the participation of the student in the group is active; a student who has left gets no form of a new pause - only the pauses there are (the caller knows it from the membership: its last period is open). */
  active?: boolean;
  membershipId: string;
  studentName: string;
  groupName: string;
  onClose: () => void;
  /** The server accepted a change: the row it sends back replaces the one the card holds; `text` is for a toast. */
  onChanged: (row: MembershipPaymentRow | null, text: string) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<PauseFormValues>(() => emptyPauseValues(today));
  const [pauses, setPauses] = useState<PauseOut[] | null>(null);
  const [calc, setCalc] = useState<PauseSaved | null>(null);
  /** `retry`: the failure has no code (the network, a broken answer) - «Повторить» can change it; a refusal in the server's words cannot be repeated away. */
  const [calcFailure, setCalcFailure] = useState<{ message: string; code?: string | null; dates: string[]; closed: PeriodClosedInfo | null; retry: boolean } | null>(null);
  /** Money-1 A1: the month of the teacher is closed (422 `PAUSE_LOCKED`): the sentence of the server and «Переоткрыть месяц» (the right) instead of a bare red line. */
  const [errorClosed, setErrorClosed] = useState<PeriodClosedInfo | null>(null);
  const [calcNonce, setCalcNonce] = useState(0);
  const [actNonce, setActNonce] = useState(0);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The pause being ended / cancelled and the cancel reason. */
  const [acting, setActing] = useState<{ pause: PauseOut; action: "end" | "cancel" } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  /** The form of a new pause was opened over the cards («+ Новая пауза»). */
  const [newOpen, setNewOpen] = useState(false);
  /** The fold «Прошлые паузы»: null = by default (closed; open for a student who has left and has no card). */
  const [pastOpen, setPastOpen] = useState<boolean | null>(null);
  /** The server answered `REASON_REQUIRED` to a shortening: the change moves money, say why. */
  const [endNeedsReason, setEndNeedsReason] = useState(false);
  /** Money-2 T9: the dry run of the ending / the cancel being confirmed: the money of it (`charge_rows`, the other groups), or the refusal of the server (any refusal blocks the button; closed month - the notice, no code - «Повторить»). */
  const [actPreview, setActPreview] = useState<{ status: "loading" } | { status: "ready"; answer: unknown } | { status: "failed"; message: string; closed: PeriodClosedInfo | null; retry: boolean } | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());
  const sequence = useRef(createRequestSequence());

  const loadPauses = (): Promise<PauseOut[]> => orgApi.listPauses(membershipId).then((list) => { const live = livePauses(list); setPauses(live); return live; }).catch(() => { setPauses([]); return []; });

  const clearError = () => { setError(null); setErrorClosed(null); };

  useEffect(() => {
    if (!open) return;
    setValues(emptyPauseValues(today));
    setCalc(null);
    setCalcFailure(null);
    clearError();
    setBusy(false);
    setActing(null);
    setCancelReason("");
    setEndNeedsReason(false);
    setNewOpen(false);
    setPastOpen(null);
    setPauses(null);
    idempotencyKey.current = newIdempotencyKey();
    void loadPauses();
    // restarts when opened (for another membership), not when the card refreshes behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId]);

  const groups = useMemo(() => pauseGroups(pauses, today, participating), [pauses, today, participating]);
  /** Б11.39 Э1: the form is the first thing only while there is no live pause (or it was asked for); never for a student who has left; never while an action is being confirmed. */
  const showForm = participating && pauses !== null && acting === null && (groups.cards.length === 0 || newOpen);

  const problem = showForm && values.last ? validatePause(values, today) : null;
  const ready = showForm && Boolean(values.last) && !problem;
  const key = `${values.first}|${values.last}|${values.reason}`;

  // Б11.39 Э7: on a wide screen the field «С» takes the focus when the form appears; below `sm` it does not (no keyboard)
  useEffect(() => {
    if (!open || !showForm || typeof window === "undefined" || typeof window.matchMedia !== "function" || !window.matchMedia(WIDE_QUERY).matches) return;
    document.getElementById("pause-first")?.focus();
  }, [open, showForm]);

  // The server's calculation of exactly this range (dry run).
  useEffect(() => {
    if (!open) return undefined;
    const token = sequence.current.next();
    setCalc(null);
    setCalcFailure(null);
    if (!ready) { setChecking(false); return () => { sequence.current.next(); }; }
    setChecking(true);
    const timer = setTimeout(() => {
      orgApi.createPause(membershipId, buildPauseBody(values), { dryRun: true })
        .then((result) => { if (sequence.current.isCurrent(token)) { setCalc(result); setChecking(false); } })
        .catch((cause) => {
          if (!sequence.current.isCurrent(token)) return;
          const failure = logicaError(cause, "Не удалось посчитать паузу");
          setChecking(false);
          setCalcFailure({ message: failure.code === "PAUSE_OVERLAPS_ATTENDED" && failure.dates.length > 0 ? attendedText(failure.dates) : probeWords(cause, failure, CALC_FAILED_TEXT), code: failure.code, dates: failure.dates, closed: periodClosedOf(cause), retry: !failure.code });
        });
    }, CALC_DEBOUNCE_MS);
    return () => { clearTimeout(timer); sequence.current.next(); };
    // `values` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId, ready, key, calcNonce]);

  // Money-2 T9: the ending and the cancel of a pause move money (here and in the groups tied by a transfer) - the server's dry run says it BEFORE the button
  const actingId = acting?.pause.id ?? null;
  const actingAction = acting?.action ?? null;
  useEffect(() => {
    if (!open || !actingId || !actingAction) { setActPreview(null); return undefined; }
    let current = true;
    setActPreview({ status: "loading" });
    const asked = actingAction === "end"
      ? orgApi.patchPause(actingId, { last_day: pauseEndDay(today) }, { dryRun: true })
      : orgApi.voidPause(actingId, DRY_RUN_REASON, { dryRun: true });
    asked
      .then((result) => { if (current) setActPreview({ status: "ready", answer: result }); })
      .catch((cause) => {
        if (!current) return;
        const failure = logicaError(cause, "Не удалось посчитать, что изменится");
        // «укажите причину» is asked by the real press (the field opens there); it is not a refusal
        if (isReasonRequired(failure)) { setEndNeedsReason(true); setActPreview({ status: "ready", answer: null }); return; }
        // Б11.34 п.4: a leaving cut the pause meanwhile - read the pauses again, the card becomes closed and says it once
        if (failure.code === CLOSED_BY_LEAVE) { void closedMeanwhile(actingId, failure.message); return; }
        setActPreview({ status: "failed", message: probeWords(cause, failure, ACT_FAILED_TEXT), closed: periodClosedOf(cause), retry: !failure.code });
      });
    return () => { current = false; };
    // `today` is fixed for an open dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, actingId, actingAction, actNonce]);

  /** Б11.34 п.4: the 409 of a pause that was NOT closed when the window opened (a race with a leaving): the window reads the pauses again; the card is closed now and shows the sentence of the server once (if the answer still has no sentence, the refusal is said as it came). */
  const closedMeanwhile = async (pauseId: string, message: string) => {
    setActing(null);
    setActPreview(null);
    setCancelReason("");
    setEndNeedsReason(false);
    const fresh = await loadPauses();
    if (fresh.some((pause) => pause.id === pauseId && pause.days_locked === true)) clearError();
    else { setErrorClosed(null); setError(message); }
  };

  const save = async () => {
    // the button of the footer waits for the calculation; the form must wait for it too (a submit from elsewhere - Enter in a field, a window inside it - is not a press of the button)
    if (busy || checking || calcFailure !== null || !ready) return;
    const refusal = validatePause(values, today);
    if (refusal) { setErrorClosed(null); setError(refusal); return; }
    setBusy(true);
    clearError();
    try {
      const result = await orgApi.createPause(membershipId, buildPauseBody(values), { idempotencyKey: idempotencyKey.current });
      onChanged(result.row, `Пауза поставлена: ${pauseLine(result.pause)}`);
      onClose();
    } catch (cause) {
      const failure = logicaError(cause, "Не удалось поставить паузу");
      setErrorClosed(periodClosedOf(cause));
      setError(failure.code === "PAUSE_OVERLAPS_ATTENDED" && failure.dates.length > 0 ? attendedText(failure.dates) : failure.message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!acting || busy) return;
    if ((acting.action === "cancel" || endNeedsReason) && cancelReason.trim().length < REASON_MIN) { setErrorClosed(null); setError(`Укажите причину (не короче ${REASON_MIN} символов)`); return; }
    setBusy(true);
    clearError();
    try {
      if (acting.action === "end") {
        const result = await orgApi.patchPause(acting.pause.id, { last_day: pauseEndDay(today), ...(endNeedsReason ? { reason: cancelReason.trim() } : {}) });
        onChanged(result.row, "Пауза закончена: дни с сегодняшнего снова считаются в стоимость");
      } else {
        const result = await orgApi.voidPause(acting.pause.id, cancelReason.trim());
        onChanged(result.row, "Пауза снята");
      }
      setCancelReason("");
      setEndNeedsReason(false);
      const fresh = await loadPauses();
      // Б11.41 п. 2: the change is done; no live pause left - there is nothing more to do here (the toast says it), otherwise the window stays on the cards (the form of a new pause does not open by itself)
      if (pauseGroups(fresh, today, participating).cards.length === 0) { setActing(null); onClose(); return; }
      setActing(null);
    } catch (cause) {
      const failure = logicaError(cause, "Не удалось изменить паузу");
      // REASON_REQUIRED: money is affected, the reason field opens; PAUSE_RANGE (a day older than 30 days) says so inline
      setErrorClosed(periodClosedOf(cause));
      if (failure.code === CLOSED_BY_LEAVE) { setBusy(false); await closedMeanwhile(acting.pause.id, failure.message); return; }
      if (isReasonRequired(failure) && acting.action === "end") { setEndNeedsReason(true); setError(`${failure.message}. Укажите причину.`); }
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const startAction = (pause: PauseOut, action: "end" | "cancel") => { clearError(); setActing({ pause, action }); setCancelReason(""); setEndNeedsReason(false); };
  const backFromAction = () => { setActing(null); clearError(); setEndNeedsReason(false); };
  const closeNewForm = () => {
    setNewOpen(false);
    setValues(emptyPauseValues(today));
    setCalc(null);
    setCalcFailure(null);
    clearError();
  };

  const stateOf = (pause: PauseOut): "running" | "planned" | null => (participating && pause.last_day >= today ? (pauseIsRunning(pause, today) ? "running" : "planned") : null);
  /** Rule 142: with two cards or more the buttons look alike - the accessible name says whose pause («Снять паузу, пауза с 24.11 по 30.11»); with one card the visible words are the name. */
  const nameWithDates = (label: string, pause: PauseOut) => (groups.cards.length > 1 ? `${label}, пауза ${pauseSpan(pause, today)}` : undefined);
  const voidLabelOf = (pause: PauseOut) => (pause.days_locked !== true && pause.first_day > today ? PAUSE_VOID_PLANNED_LABEL : PAUSE_VOID_LABEL);

  const warnings = pauseWarnings(calc, today);
  const calcModel = pauseMoneyModel(calc, "set", today);
  const calcTail = pauseCalcTail(calc?.impact);
  const hasList = groups.cards.length > 0 || groups.past.length > 0;

  /** The refusal / failure of an action stands where the person pressed: in the form, in the confirmation of the card, or (when neither is on screen) under the cards. */
  const errorNode = error && (errorClosed
    ? <PeriodClosedNotice purpose="pause" info={errorClosed} onReopened={() => { clearError(); setCalcNonce((value) => value + 1); setActNonce((value) => value + 1); }} />
    : <p role="alert" data-testid="pause-error" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>);

  const retryButton = (onClick: () => void) => (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} data-testid="pause-retry" className="!min-h-0 !px-1 !py-0 align-baseline font-semibold text-rose-800 underline hover:bg-transparent hover:text-rose-900">Повторить</Button>
  );

  // ── the confirmation of an action (in the card) ──
  const renderActing = () => {
    if (!acting) return null;
    const { pause, action } = acting;
    const state = stateOf(pause);
    const kind = action === "end" ? "end" : "void";
    const answer = actPreview?.status === "ready" ? (actPreview.answer as Partial<PauseSaved> | null) : null;
    const model = pauseMoneyModel(answer, kind, today);
    const tail = pauseCalcTail(answer?.impact);
    const hasOther = otherGroupsOf(answer).rows.length > 0;
    const sentence = action === "end"
      ? `Последний день паузы — вчера, ${formatDayMonthRu(pauseEndDay(today))}.`
      : pause.days_locked !== true && pause.first_day > today
        ? "Пауза не начнётся: за её дни нужно будет платить."
        : "Пауза будет снята целиком, как будто её не было.";
    const blocked = actPreview?.status === "failed";
    return (
      <li className="space-y-3 list-none" data-testid="pause-card-acting">
        <PauseSummaryRow pause={pause} today={today} state={state} />
        <p className="text-sm text-slate-800" data-testid="pause-act-sentence">{sentence}</p>
        {actPreview?.status === "loading" && <p className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем…</p>}
        {actPreview?.status === "ready" && (model || tail.length > 0 || hasOther) && (
          <PauseMoneyBox model={model} testId="pause-act-calc">
            {tail.map((line) => <p key={line} className="text-xs text-slate-700">{line}</p>)}
            <OtherGroupsRows answer={answer} testId="pause-act-effects" />
          </PauseMoneyBox>
        )}
        {actPreview?.status === "failed" && (actPreview.closed
          ? <PeriodClosedNotice purpose="pause" info={actPreview.closed} onReopened={() => setActNonce((value) => value + 1)} />
          : <p role="alert" data-testid="pause-act-effects" className="text-sm font-medium text-rose-700">{actPreview.message}{actPreview.retry && <> {retryButton(() => setActNonce((value) => value + 1))}</>}</p>)}
        {(action === "cancel" || endNeedsReason) && (
          <div>
            <label htmlFor="pause-act-reason" className={PRICE_LABEL}>Причина <span className="font-normal text-slate-500">(обязательно)</span></label>
            <input id="pause-act-reason" data-testid="pause-act-reason" value={cancelReason} onChange={(event) => { clearError(); setCancelReason(event.target.value); }} placeholder={action === "cancel" ? "Например: ученик передумал" : "Например: ошиблись в дате"} className={PRICE_FIELD} autoComplete="off" />
          </div>
        )}
        {errorNode}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => void finish()} disabled={busy || actPreview?.status === "loading" || blocked} loading={busy} variant="primary" size="md" data-testid="pause-act-confirm" className="w-full sm:w-auto">
            {action === "end" ? PAUSE_END_CONFIRM_LABEL : voidLabelOf(pause)}
          </Button>
          <Button type="button" onClick={backFromAction} disabled={busy} variant="secondary" size="md" data-testid="pause-act-back" className="w-full sm:w-auto">Назад</Button>
        </div>
      </li>
    );
  };

  // ── a card of a live pause (or of a pause of a student who has left) ──
  const renderCard = (pause: PauseOut) => {
    const state = stateOf(pause);
    const locked = pause.days_locked === true;
    // a pause with locked days cannot be shortened: the only way to take it off is whole; a free one running since before today can be ended today or taken off; one that began today or has not begun - taken off
    const canEnd = state === "running" && !locked && pauseEndAction(pause, today) === "end";
    return (
      <li key={pause.id} className={`rounded-xl border border-slate-200 px-4 py-3.5 ${state ? "bg-white" : "bg-slate-50"}`} data-testid="pause-card" data-state={state ?? "left"}>
        {state && <p className="text-sm" data-testid="pause-state"><StateTitle state={state} /></p>}
        <p className={state ? "mt-1.5 text-sm text-slate-900" : "text-sm font-semibold text-slate-900"} data-testid="pause-facts">{pauseFacts(pause, today)}</p>
        {pause.reason && <p className="mt-1 text-xs text-slate-600" data-testid="pause-reason">{pause.reason}</p>}
        {locked && pause.days_locked_text && <p className="mt-1 text-xs text-slate-600" data-testid="pause-locked-text">{pause.days_locked_text}</p>}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {canEnd && <Button type="button" variant="primary" size="md" data-testid="pause-end" className="w-full sm:w-auto" onClick={() => startAction(pause, "end")} aria-label={nameWithDates(PAUSE_END_LABEL, pause)}>{PAUSE_END_LABEL}</Button>}
          <Button type="button" variant="secondary" size="md" data-testid="pause-void" className="w-full sm:w-auto" onClick={() => startAction(pause, "cancel")} aria-label={nameWithDates(voidLabelOf(pause), pause)}>{voidLabelOf(pause)}</Button>
        </div>
      </li>
    );
  };

  // ── the fold of the past pauses ──
  const renderPast = () => {
    if (groups.past.length === 0) return null;
    const isOpen = pastOpen ?? (!participating && groups.cards.length === 0);
    return (
      <details open={isOpen} onToggle={(event) => setPastOpen(event.currentTarget.open)} className="group/past border-t border-slate-100 pt-2" data-testid="pause-past">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-sm text-slate-600 marker:hidden [&::-webkit-details-marker]:hidden" data-testid="pause-past-summary">
          <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open/past:rotate-90" />
          Прошлые паузы · {groups.past.length}
        </summary>
        <ul className="mt-2 space-y-2.5">
          {groups.past.map((pause) => {
            const locked = pause.days_locked === true;
            return (
              <li key={pause.id} className="flex gap-2 text-sm text-slate-800" data-testid="pause-past-row">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <div className="min-w-0">
                  <p data-testid="pause-facts">{pauseFacts(pause, today)}{pause.reason ? ` · ${pause.reason}` : ""}</p>
                  {locked && pause.days_locked_text && <p className="mt-0.5 text-xs text-slate-600" data-testid="pause-locked-text">{pause.days_locked_text}</p>}
                  {(locked || pause.last_day >= today) && <Button type="button" variant="ghost" size="sm" data-testid="pause-void" className={QUIET_LINK} onClick={() => startAction(pause, "cancel")}>{voidLabelOf(pause)}</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      </details>
    );
  };

  // ── the form of a new pause ──
  const refusalText = ready && !checking && calcFailure && !calcFailure.closed && !calcFailure.retry ? calcFailure.message : null;
  const calcZone = ready && (checking || calc || (calcFailure && (calcFailure.closed || calcFailure.retry)));
  const renderForm = () => (
    <form id="pause-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4 pb-2" noValidate>
      {groups.cards.length > 0 && <h3 className="text-sm font-semibold text-slate-900" data-testid="pause-new-title">Новая пауза</h3>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pause-first" className={PRICE_LABEL}>С</label>
          <DateInput id="pause-first" value={values.first} onChange={(next) => { clearError(); setValues({ ...values, first: next }); }} className={PRICE_FIELD} />
        </div>
        <div>
          <label htmlFor="pause-last" className={PRICE_LABEL}>По</label>
          <DateInput id="pause-last" value={values.last} min={values.first || undefined} onChange={(next) => { clearError(); setValues({ ...values, last: next }); }} className={PRICE_FIELD} />
        </div>
      </div>
      {refusalText
        ? <div data-testid="pause-calc" className="-mt-2"><p role="alert" className="text-sm font-medium text-rose-700">{refusalText}</p></div>
        : !calcZone && !problem && <p className="-mt-2 text-xs text-slate-600" data-testid="pause-hint">{PAUSE_FORM_HINT}</p>}

      <div>
        <label htmlFor="pause-reason" className={PRICE_LABEL}>Причина <span className="font-normal text-slate-500">(необязательно)</span></label>
        <input id="pause-reason" value={values.reason} maxLength={PAUSE_REASON_MAX} onChange={(event) => { clearError(); setValues({ ...values, reason: event.target.value }); }} autoComplete="off" placeholder="Например: уехал к родственникам" className={PRICE_FIELD} />
      </div>

      {problem && <p role="alert" className="text-xs font-medium text-rose-700">{problem}</p>}

      {calcZone && (
        checking ? (
          <div aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm" data-testid="pause-calc"><p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем…</p></div>
        ) : calcFailure ? (
          calcFailure.closed
            ? <div data-testid="pause-calc"><PeriodClosedNotice purpose="pause" info={calcFailure.closed} onReopened={() => setCalcNonce((value) => value + 1)} /></div>
            : <div data-testid="pause-calc"><p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-800">{calcFailure.message} {retryButton(() => setCalcNonce((value) => value + 1))}</p></div>
        ) : (
          <div className="space-y-2" data-testid="pause-calc-wrap">
            <PauseMoneyBox model={calcModel} testId="pause-calc">
              {!calcModel && <p className="text-sm">{pauseCalcLines(calc)[0]}</p>}
              {calcTail.map((line) => <p key={line} className="text-xs text-slate-700">{line}</p>)}
              <OtherGroupsRows answer={calc} testId="pause-other-groups" />
            </PauseMoneyBox>
            {warnings.length > 0 && (
              <div className="space-y-2" data-testid="pause-warnings">
                {warnings.map((line) => (
                  <p key={line} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{line}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {errorNode}
    </form>
  );

  const loadingList = pauses === null;

  return (
    <Modal
      open={open}
      title="Пауза ученика"
      description={`${studentName} · ${groupName}`}
      onClose={onClose}
      busy={busy}
      initialFocus="dialog"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={showForm ? (
        // UX pack №12 / rule 3: the pause can be set - blue; the main button names the action; off - with the line «почему» only while the server counts (a refusal stands in the form in the server's words)
        <ConfirmFooter
          primary="Поставить на паузу"
          submitFor="pause-form"
          busy={busy && acting === null}
          disabled={busy || !ready || checking || calcFailure !== null}
          why={checking ? EFFECTS_LOADING_TEXT : null}
          whyId="pause-why"
          onCancel={groups.cards.length > 0 ? closeNewForm : onClose}
          testId="pause-submit"
        />
      ) : (
        // nothing to confirm (the cards, a confirmation in a card, a student who has left): the only way out
        <ConfirmFooter primary={null} onCancel={onClose} testId="pause-close" />
      )}
    >
      {loadingList && <p className="inline-flex items-center gap-1.5 text-sm text-slate-500" data-testid="pause-loading"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загрузка…</p>}

      {!loadingList && acting && (
        <section aria-label="Паузы ученика">
          <ul>{renderActing()}</ul>
        </section>
      )}

      {!loadingList && !acting && (
        <div className="space-y-4">
          {hasList && groups.cards.length > 0 && (
            <section aria-label="Паузы ученика" className="space-y-3">
              {showForm
                ? <ul className="space-y-2">{groups.cards.map((pause) => <li key={pause.id}><PauseSummaryRow pause={pause} today={today} state={stateOf(pause)} /></li>)}</ul>
                : <ul className="space-y-3">{groups.cards.map(renderCard)}</ul>}
              {participating && !showForm && (
                <Button type="button" variant="ghost" size="sm" data-testid="pause-new" className={QUIET_LINK} onClick={() => { clearError(); setValues({ first: firstFreePauseDay(pauses, today), last: "", reason: "" }); setNewOpen(true); }}>+ Новая пауза</Button>
              )}
            </section>
          )}
          {showForm && (groups.cards.length > 0 ? <div className="border-t border-slate-100 pt-3">{renderForm()}</div> : renderForm())}
          {!showForm && errorNode}
          {hasList && groups.past.length > 0 && <section aria-label={groups.cards.length > 0 ? "Прошлые паузы" : "Паузы ученика"}>{renderPast()}</section>}
        </div>
      )}
    </Modal>
  );
}
