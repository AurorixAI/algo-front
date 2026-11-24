"use client";

import { refusedInWords } from "@/lib/money-preview";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatDateRu, REASON_MIN, type MembershipPaymentRow } from "@/lib/payments";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  attendedText,
  buildPauseBody,
  emptyPauseValues,
  isReasonRequired,
  livePauses,
  logicaError,
  PAUSE_BACKDATE_HINT,
  pauseCalcLines,
  pauseEndAction,
  pauseEndDay,
  pauseLine,
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
import { OtherGroupsRows } from "@/components/money/other-groups-rows";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const CALC_DEBOUNCE_MS = 350;
/** PAY-TAILS Б11.22 п.10: the heading of the block that cancels a pause which has not begun. */
const PAUSE_CANCEL_FUTURE_TITLE = "Отменить будущую паузу";
/** Б11.34 п.3: the two actions of a pause by their meaning - one word, one meaning («Снять паузу целиком» is the void in every case). */
const PAUSE_END_LABEL = "Закончить сегодня";
const PAUSE_VOID_LABEL = "Снять паузу целиком";
/** The code of the refusal to change the days of a pause that a leaving cut meanwhile (409). */
const CLOSED_BY_LEAVE = "PAUSE_CLOSED_BY_LEAVE";

/** Б11.34 п.5: the reason of a pause closed by a leaving - two lines with a wrap, and taller when the text is longer (nothing is cut). */
function ReasonField({ id, value, onChange }: { id: string; value: string; onChange: (next: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;     // + the border
  }, [value]);
  return <Textarea ref={field} id={id} data-testid="pause-locked-reason" rows={2} value={value} maxLength={PAUSE_REASON_MAX} autoComplete="off" onChange={(event) => onChange(event.target.value)} className="resize-none overflow-hidden rounded-lg px-3 py-2 text-sm" />;
}

/**
 * «Пауза ученика» (group «⋯» → «Пауза…»): from / to / reason.  A pause is not charged, the place in the group stays.  Under the form
 * the server's calculation (a dry run): «Дни паузы не входят в стоимость: 10 дней, −200 000 сум. Место в группе сохраняется. Оплачено до
 * станет 09.11.» (the sum only for a role that sees money) and the warnings: a backdated pause (lessons are not counted for anybody),
 * attended lessons (the pause cannot cover them), the payroll sheets that go «Есть изменения».  The pauses already there are listed
 * below: a running one is shortened to yesterday («Закончить сегодня») or taken off whole («Снять паузу целиком», the only action of one that has not begun or was cut by a leaving).
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
  const [calcFailure, setCalcFailure] = useState<{ message: string; code?: string | null; dates: string[]; closed: PeriodClosedInfo | null } | null>(null);
  /** Money-1 A1: the month of the teacher is closed (422 `PAUSE_LOCKED`): the sentence of the server and «Переоткрыть месяц» (the right) instead of a bare red line. */
  const [errorClosed, setErrorClosed] = useState<PeriodClosedInfo | null>(null);
  const [calcNonce, setCalcNonce] = useState(0);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The pause being ended / cancelled and the cancel reason. */
  const [acting, setActing] = useState<{ pause: PauseOut; action: "end" | "cancel" } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  /** Б11.33 п.1: the reasons being edited on the pauses whose days are locked (by id) and the refusal of the server to a save, said on the spot. */
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [lockedFailure, setLockedFailure] = useState<{ id: string; message: string } | null>(null);
  /** The server answered `REASON_REQUIRED` to a shortening: the change moves money, say why. */
  const [endNeedsReason, setEndNeedsReason] = useState(false);
  /** Money-2 T9: the dry run of the ending / the cancel being confirmed: the sentence about the other groups, or the refusal of the server (`blocked`: «PAUSE_BREAKS_REFUND» - nothing can be done here). */
  const [actPreview, setActPreview] = useState<{ status: "loading" } | { status: "ready"; answer: unknown } | { status: "failed"; message: string; blocked: boolean } | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());
  const sequence = useRef(createRequestSequence());

  const loadPauses = (): Promise<PauseOut[]> => orgApi.listPauses(membershipId).then((list) => { const live = livePauses(list); setPauses(live); return live; }).catch(() => { setPauses([]); return []; });

  useEffect(() => {
    if (!open) return;
    setValues(emptyPauseValues(today));
    setCalc(null);
    setCalcFailure(null);
    setError(null);
    setBusy(false);
    setActing(null);
    setCancelReason("");
    setReasonDrafts({});
    setLockedFailure(null);
    setEndNeedsReason(false);
    setPauses(null);
    idempotencyKey.current = newIdempotencyKey();
    void loadPauses();
    // restarts when opened (for another membership), not when the card refreshes behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId]);

  const problem = values.last ? validatePause(values, today) : null;
  const ready = Boolean(values.last) && !problem;
  const key = `${values.first}|${values.last}|${values.reason}`;

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
          setCalcFailure({ message: failure.code === "PAUSE_OVERLAPS_ATTENDED" && failure.dates.length > 0 ? attendedText(failure.dates) : failure.message, code: failure.code, dates: failure.dates, closed: periodClosedOf(cause) });
        });
    }, CALC_DEBOUNCE_MS);
    return () => { clearTimeout(timer); sequence.current.next(); };
    // `values` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId, ready, key, calcNonce]);

  // Money-2 T9: the ending and the cancel of a pause move money in the groups tied by a transfer - the server's dry run says it BEFORE the button
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
        setActPreview({ status: "failed", message: failure.message, blocked: failure.code === "PAUSE_BREAKS_REFUND" });
      });
    return () => { current = false; };
    // `today` is fixed for an open dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, actingId, actingAction]);

  /** Б11.34 п.4: the 409 of a pause that was NOT closed when the window opened (a race with a leaving): the window reads the pauses again; the card is closed now and shows the sentence of the server once (if the answer still has no sentence, the refusal is said as it came). */
  const closedMeanwhile = async (pauseId: string, message: string) => {
    setActing(null);
    setActPreview(null);
    setCancelReason("");
    setEndNeedsReason(false);
    const fresh = await loadPauses();
    setError(fresh.some((pause) => pause.id === pauseId && pause.days_locked === true) ? null : message);
  };

  const save = async () => {
    // the button of the footer waits for the calculation; the form must wait for it too (a submit from elsewhere - Enter in a field, a window inside it - is not a press of the button)
    if (busy || checking || calcFailure !== null || !ready) return;
    const refusal = validatePause(values, today);
    if (refusal) { setError(refusal); return; }
    setBusy(true);
    setError(null);
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
    if ((acting.action === "cancel" || endNeedsReason) && cancelReason.trim().length < REASON_MIN) { setError(`Укажите причину (не короче ${REASON_MIN} символов)`); return; }
    setBusy(true);
    setError(null);
    try {
      if (acting.action === "end") {
        const result = await orgApi.patchPause(acting.pause.id, { last_day: pauseEndDay(today), ...(endNeedsReason ? { reason: cancelReason.trim() } : {}) });
        onChanged(result.row, "Пауза закончена: дни с сегодняшнего снова считаются в стоимость");
      } else {
        const result = await orgApi.voidPause(acting.pause.id, cancelReason.trim());
        onChanged(result.row, "Пауза снята");
      }
      setActing(null);
      setCancelReason("");
      setEndNeedsReason(false);
      await loadPauses();
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

  /** Б11.33 п.1: only the reason of a pause with locked days; a race (the leaving came meanwhile) is the 409 in the server's words, the window stays. */
  const saveReason = async (pause: PauseOut) => {
    const draft = (reasonDrafts[pause.id] ?? pause.reason ?? "").trim();
    if (busy || draft === (pause.reason ?? "")) return;
    setBusy(true);
    setLockedFailure(null);
    try {
      const result = await orgApi.patchPause(pause.id, { reason: draft === "" ? null : draft });
      onChanged(result.row, "Причина паузы сохранена");
      setReasonDrafts((previous) => { const next = { ...previous }; delete next[pause.id]; return next; });
      await loadPauses();
    } catch (cause) {
      setLockedFailure({ id: pause.id, message: logicaError(cause, "Не удалось сохранить причину").message });
    } finally {
      setBusy(false);
    }
  };

  const warnings = pauseWarnings(calc, today);
  const lines = pauseCalcLines(calc);
  const hasPauses = (pauses ?? []).length > 0;

  return (
    <Modal
      open={open}
      title="Пауза ученика"
      description={`${studentName} · ${groupName}`}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={!participating ? (
        // Б11.34 п.1: a student who has left - nothing to confirm, only the way out
        <ConfirmFooter primary={null} onCancel={onClose} testId="pause-close" />
      ) : (
        // UX pack №12 / rule 3: the pause can be ended - blue; the main button names the action; off - with the line «почему»
        <ConfirmFooter
          primary="Поставить на паузу"
          submitFor="pause-form"
          busy={busy && acting === null}
          disabled={busy || !ready || checking || calcFailure !== null}
          why={checking ? EFFECTS_LOADING_TEXT : calcFailure !== null ? (refusedInWords({ code: calcFailure.code, message: calcFailure.message }) ? null : "Не удалось посчитать паузу — повторите.") : "Укажите, с какого по какое число пауза."}
          whyId="pause-why"
          onCancel={onClose}
          testId="pause-submit"
        />
      )}
    >
      {participating && <form id="pause-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4 pb-2" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pause-first" className={PRICE_LABEL}>С</label>
            <DateInput id="pause-first" value={values.first} onChange={(next) => { setError(null); setValues({ ...values, first: next }); }} className={PRICE_FIELD} />
          </div>
          <div>
            <label htmlFor="pause-last" className={PRICE_LABEL}>По</label>
            <DateInput id="pause-last" value={values.last} min={values.first || undefined} onChange={(next) => { setError(null); setValues({ ...values, last: next }); }} className={PRICE_FIELD} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-500">{PAUSE_BACKDATE_HINT}. Дни паузы не входят в стоимость, место в группе сохраняется.</p>

        <div>
          <label htmlFor="pause-reason" className={PRICE_LABEL}>Причина <span className="font-normal text-slate-500">(необязательно)</span></label>
          <input id="pause-reason" value={values.reason} maxLength={PAUSE_REASON_MAX} onChange={(event) => { setError(null); setValues({ ...values, reason: event.target.value }); }} autoComplete="off" placeholder="Например: уехал к родственникам" className={PRICE_FIELD} />
        </div>

        {problem && <p role="alert" className="text-xs font-medium text-rose-700">{problem}</p>}

        {ready && (checking || calc || calcFailure) && (
          <div aria-live="polite" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700" data-testid="pause-calc">
            {checking ? (
              <p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем…</p>
            ) : calcFailure ? (
              calcFailure.closed
                ? <PeriodClosedNotice info={calcFailure.closed} onReopened={() => setCalcNonce((value) => value + 1)} />
                : <p role="alert" className="font-medium text-rose-700">{calcFailure.message}</p>
            ) : (
              <>
                {lines.map((line) => <p key={line}>{line}</p>)}
                <OtherGroupsRows answer={calc} testId="pause-other-groups" />
                {warnings.map((line) => (
                  <p key={line} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{line}</span>
                  </p>
                ))}
              </>
            )}
          </div>
        )}

        {error && (errorClosed
          ? <PeriodClosedNotice info={errorClosed} onReopened={() => { setError(null); setErrorClosed(null); setCalcNonce((value) => value + 1); }} />
          : <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>)}
      </form>}

      {hasPauses && (
        <section aria-label="Паузы ученика" className={participating ? "mt-1 border-t border-slate-100 pt-3" : undefined}>
          <h3 className="text-xs font-semibold text-slate-700">Уже есть</h3>
          <ul className="mt-1.5 space-y-2">
            {(pauses ?? []).map((pause) => {
              const locked = pause.days_locked === true;
              // a pause with locked days cannot be shortened: the only way to take it off is whole, whatever its dates; a free one running now can be ended today or taken off; one not begun - taken off
              const canEnd = !locked && pauseEndAction(pause, today) === "end";
              const canVoid = locked || pause.last_day >= today;
              const active = acting?.pause.id === pause.id;
              const running = pause.last_day >= today && pause.first_day <= today;
              const draft = reasonDrafts[pause.id] ?? pause.reason ?? "";
              const reasonChanged = locked && draft.trim() !== (pause.reason ?? "");
              return (
                <li key={pause.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  {/* PAY-TAILS Б11.22 п.10: the block of a pause that has not begun names what is being done to it */}
                  {acting?.action === "cancel" && active && !locked && !running && <p className="mb-1 font-semibold text-slate-900" data-testid="pause-cancel-title">{PAUSE_CANCEL_FUTURE_TITLE}</p>}
                  {/* Б11.34 п.2: the FACTS first (the days are text, not editable), under them ONE calm sentence of the server */}
                  <p className="text-slate-800" data-testid={locked ? "pause-locked-days" : undefined}>{pauseLine(locked ? { ...pause, reason: null } : pause)}</p>
                  {running && <p className="text-amber-800">Идёт сейчас</p>}
                  {locked && pause.days_locked_text && <p className="mt-1 text-slate-600" data-testid="pause-locked-text">{pause.days_locked_text}</p>}
                  {locked && (
                    <div className="mt-2 space-y-1.5">
                      <div>
                        <label htmlFor={`pause-locked-reason-${pause.id}`} className={PRICE_LABEL}>Причина</label>
                        <ReasonField id={`pause-locked-reason-${pause.id}`} value={draft} onChange={(next) => { setLockedFailure(null); setReasonDrafts({ ...reasonDrafts, [pause.id]: next }); }} />
                      </div>
                    </div>
                  )}
                  {locked && lockedFailure?.id === pause.id && <p role="alert" className="mt-1 font-medium text-rose-700" data-testid="pause-locked-failure">{lockedFailure.message}</p>}
                  {(canEnd || canVoid || reasonChanged) && !active && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {/* the button of the reason stands only while the reason is changed (no grey button that does nothing) */}
                      {reasonChanged && <Button type="button" variant="secondary" size="sm" data-testid="pause-locked-save" onClick={() => void saveReason(pause)} disabled={busy}>Сохранить причину</Button>}
                      {canEnd && <Button type="button" variant="secondary" size="sm" data-testid="pause-end" onClick={() => { setError(null); setActing({ pause, action: "end" }); setCancelReason(""); }}>{PAUSE_END_LABEL}</Button>}
                      {canVoid && <Button type="button" variant="secondary" size="sm" data-testid="pause-void" onClick={() => { setError(null); setActing({ pause, action: "cancel" }); setCancelReason(""); }}>{PAUSE_VOID_LABEL}</Button>}
                    </div>
                  )}
                  {active && acting && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-slate-600">
                        {acting.action === "end"
                          ? `Пауза закончится вчера (${formatDateRu(pauseEndDay(today))}): дни с сегодняшнего снова входят в стоимость.`
                          : locked
                            ? "Пауза будет снята целиком."
                            : running
                              ? "Пауза будет снята целиком: её дни снова входят в стоимость."
                              : "Пауза ещё не началась: она будет отменена, эти дни придётся оплатить."}
                      </p>
                      {actPreview?.status === "loading" && <p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем…</p>}
                      {actPreview?.status === "ready" && <OtherGroupsRows answer={actPreview.answer} testId="pause-act-effects" />}
                      {actPreview?.status === "failed" && <p role="alert" data-testid="pause-act-effects" className="font-medium text-rose-700">{actPreview.message}</p>}
                      {(acting.action === "cancel" || endNeedsReason) && (
                        <div>
                          <label htmlFor="pause-act-reason" className={PRICE_LABEL}>Причина <span className="font-normal text-slate-500">(обязательно)</span></label>
                          <input id="pause-act-reason" data-testid="pause-act-reason" value={cancelReason} onChange={(event) => { setError(null); setCancelReason(event.target.value); }} placeholder={acting.action === "cancel" ? "Например: ученик передумал" : "Например: ошиблись в дате"} className={PRICE_FIELD} autoComplete="off" />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button type="button" onClick={() => void finish()} disabled={busy || actPreview?.status === "loading" || (actPreview?.status === "failed" && actPreview.blocked)} variant="secondary" size="sm" data-testid="pause-act-confirm">
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {acting.action === "end" ? PAUSE_END_LABEL : PAUSE_VOID_LABEL}
                        </Button>
                        <Button type="button" onClick={() => { setActing(null); setError(null); }} disabled={busy} variant="ghost" size="sm">Назад</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Modal>
  );
}
