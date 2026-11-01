"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatDateRu, REASON_MIN, type MembershipPaymentRow } from "@/lib/payments";
import { newIdempotencyKey } from "@/lib/payments-ledger";
import {
  attendedText,
  buildPauseBody,
  emptyPauseValues,
  isReasonRequired,
  livePauses,
  logicaError,
  pauseBackdateHint,
  pauseCalcLines,
  pauseEarliest,
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
import { Modal } from "@/components/ui/modal";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";
import { DateInput } from "@/components/ui/date-input";

const CALC_DEBOUNCE_MS = 350;

/**
 * «Пауза ученика» (group «⋯» → «Пауза…»): from / to / reason.  A pause is not charged, the place in the group stays.  Under the form
 * the server's calculation (a dry run): «Дни паузы не входят в стоимость: 10 дней, −200 000 сум. Место в группе сохраняется. Оплачено до
 * станет 09.11.» (the sum only for a role that sees money) and the warnings: a backdated pause (lessons are not counted for anybody),
 * attended lessons (the pause cannot cover them), the payroll sheets that go «Есть изменения».  The pauses already there are listed
 * below: a running one is shortened to yesterday («Закончить паузу»), one that has not begun is cancelled.
 */
export function PauseDialog({
  open, membershipId, studentName, groupName, onClose, onChanged,
}: {
  open: boolean;
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
  const [calcFailure, setCalcFailure] = useState<{ message: string; dates: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The pause being ended / cancelled and the cancel reason. */
  const [acting, setActing] = useState<{ pause: PauseOut; action: "end" | "cancel" } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  /** The server answered `REASON_REQUIRED` to a shortening: the change moves money, say why. */
  const [endNeedsReason, setEndNeedsReason] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());
  const sequence = useRef(createRequestSequence());

  const loadPauses = () => orgApi.listPauses(membershipId).then((list) => setPauses(livePauses(list))).catch(() => setPauses([]));

  useEffect(() => {
    if (!open) return;
    setValues(emptyPauseValues(today));
    setCalc(null);
    setCalcFailure(null);
    setError(null);
    setBusy(false);
    setActing(null);
    setCancelReason("");
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
          setCalcFailure({ message: failure.code === "PAUSE_OVERLAPS_ATTENDED" && failure.dates.length > 0 ? attendedText(failure.dates) : failure.message, dates: failure.dates });
        });
    }, CALC_DEBOUNCE_MS);
    return () => { clearTimeout(timer); sequence.current.next(); };
    // `values` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId, ready, key]);

  const save = async () => {
    if (busy) return;
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
        onChanged(result.row, "Пауза отменена");
      }
      setActing(null);
      setCancelReason("");
      setEndNeedsReason(false);
      await loadPauses();
    } catch (cause) {
      const failure = logicaError(cause, "Не удалось изменить паузу");
      // REASON_REQUIRED: money is affected, the reason field opens; PAUSE_RANGE (a day older than 30 days) says so inline
      if (isReasonRequired(failure) && acting.action === "end") { setEndNeedsReason(true); setError(`${failure.message}. Укажите причину.`); }
      else setError(failure.message);
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
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Закрыть</button>
          <button
            type="submit"
            form="pause-form"
            disabled={busy || !ready || checking || calcFailure !== null}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && acting === null && <Loader2 className="h-4 w-4 animate-spin" />}
            Поставить на паузу
          </button>
        </>
      )}
    >
      <form id="pause-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4 pb-2" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pause-first" className={PRICE_LABEL}>С</label>
            <DateInput id="pause-first" value={values.first} min={pauseEarliest(today)} onChange={(next) => { setError(null); setValues({ ...values, first: next }); }} className={PRICE_FIELD} />
          </div>
          <div>
            <label htmlFor="pause-last" className={PRICE_LABEL}>По</label>
            <DateInput id="pause-last" value={values.last} min={values.first || undefined} onChange={(next) => { setError(null); setValues({ ...values, last: next }); }} className={PRICE_FIELD} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-500">{pauseBackdateHint(today)}. Дни паузы не входят в стоимость, место в группе сохраняется.</p>

        <div>
          <label htmlFor="pause-reason" className={PRICE_LABEL}>Причина <span className="font-normal text-slate-400">(необязательно)</span></label>
          <input id="pause-reason" value={values.reason} maxLength={PAUSE_REASON_MAX} onChange={(event) => { setError(null); setValues({ ...values, reason: event.target.value }); }} autoComplete="off" placeholder="Например: уехал к родственникам" className={PRICE_FIELD} />
        </div>

        {problem && <p role="alert" className="text-xs font-medium text-rose-700">{problem}</p>}

        {ready && (checking || calc || calcFailure) && (
          <div aria-live="polite" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700" data-testid="pause-calc">
            {checking ? (
              <p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем…</p>
            ) : calcFailure ? (
              <p role="alert" className="font-medium text-rose-700">{calcFailure.message}</p>
            ) : (
              <>
                {lines.map((line) => <p key={line}>{line}</p>)}
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

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>

      {hasPauses && (
        <section aria-label="Паузы ученика" className="mt-1 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-semibold text-slate-700">Уже есть</h3>
          <ul className="mt-1.5 space-y-2">
            {(pauses ?? []).map((pause) => {
              const action = pauseEndAction(pause, today);
              const active = acting?.pause.id === pause.id;
              return (
                <li key={pause.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <p className="text-slate-800">{pauseLine(pause)}</p>
                  {pause.last_day >= today && pause.first_day <= today && <p className="text-amber-800">Идёт сейчас, до {formatDateRu(pause.last_day)}</p>}
                  {action && !active && (
                    <button type="button" onClick={() => { setError(null); setActing({ pause, action }); setCancelReason(""); }} className="mt-1 font-semibold text-primary-700 hover:underline">
                      {action === "end" ? "Закончить паузу" : "Отменить паузу"}
                    </button>
                  )}
                  {action && active && (
                    <div className="mt-1.5 space-y-1.5">
                      <p className="text-slate-600">
                        {acting?.action === "end"
                          ? `Пауза закончится вчера (${formatDateRu(pauseEndDay(today))}): дни с сегодняшнего снова входят в стоимость.`
                          : "Пауза ещё не началась: она будет отменена, дни останутся платными."}
                      </p>
                      {(acting?.action === "cancel" || endNeedsReason) && (
                        <input aria-label={acting?.action === "cancel" ? "Причина отмены паузы" : "Причина изменения паузы"} value={cancelReason} onChange={(event) => { setError(null); setCancelReason(event.target.value); }} placeholder={acting?.action === "cancel" ? "Причина отмены" : "Причина изменения"} className={PRICE_FIELD} autoComplete="off" />
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void finish()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {acting?.action === "end" ? "Закончить паузу" : "Отменить паузу"}
                        </button>
                        <button type="button" onClick={() => { setActing(null); setError(null); }} disabled={busy} className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">Не надо</button>
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
