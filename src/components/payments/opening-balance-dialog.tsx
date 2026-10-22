"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { REASON_MAX, type MembershipPaymentRow, type OpeningBrief } from "@/lib/payments";
import {
  buildOpeningPut,
  emptyOpeningValues,
  logicaError,
  OPENING_TITLE,
  openingImpactLines,
  openingIsEmpty,
  openingValuesFrom,
  validateOpening,
  type ImpactMoney,
  type OpeningFormValues,
} from "@/lib/payments-logica";
import { createRequestSequence } from "@/lib/request-sequence";
import { Modal } from "@/components/ui/modal";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";
import { OpeningBalanceFields } from "./opening-balance-fields";

const IMPACT_DEBOUNCE_MS = 350;

const keyOf = (values: OpeningFormValues): string => JSON.stringify([values.paidUntil, values.debt.replace(/\D/g, ""), values.debtOn, values.note.trim()]);

/**
 * «Остаток на начало учёта» in the card of the student (Оплаты → группа → ⋯): record, change or remove what the student had before
 * ALGO.  Under the fields the server's calculation of the change (balance and «оплачено до» before → after); a replacement over money
 * that is already taken needs a reason (the server says so with `REASON_REQUIRED`, the field is there from the start).
 */
export function OpeningBalanceDialog({
  open, membershipId, studentName, groupName, opening, enrolDate, accountingStart, floor, onClose, onSaved,
}: {
  open: boolean;
  membershipId: string;
  studentName: string;
  groupName: string;
  /** The live one, if any (from the row of the list). */
  opening: OpeningBrief | null;
  /** The day the membership started, when the card knows it. */
  enrolDate?: string | null;
  accountingStart?: string | null;
  /** `L` from the server, when the caller has it. */
  floor?: string | null;
  onClose: () => void;
  /** The server accepted it: the row it sends back replaces the one the card holds. */
  onSaved: (row: MembershipPaymentRow | null, removed: boolean) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<OpeningFormValues>(emptyOpeningValues);
  /** The form as it was read: «Сохранить» is on only when something differs. */
  const [baseline, setBaseline] = useState<OpeningFormValues>(emptyOpeningValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<ImpactMoney | null>(null);
  const [checking, setChecking] = useState(false);
  const sequence = useRef(createRequestSequence());

  // The note of the live record is not in the row: read it when the dialog opens.
  useEffect(() => {
    if (!open) return undefined;
    setValues(openingValuesFrom(opening));
    setBaseline(openingValuesFrom(opening));
    setBusy(false);
    setError(null);
    setImpact(null);
    let cancelled = false;
    if (opening) {
      orgApi.getOpeningBalance(membershipId)
        .then((live) => { if (!cancelled && live) { setValues(openingValuesFrom(live)); setBaseline(openingValuesFrom(live)); } })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
    // restarts when opened for another membership, not when the row refreshes behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId]);

  const empty = openingIsEmpty(values);
  const problem = validateOpening(values, { enrolDate: enrolDate ?? null, accountingStart, floor, today });
  const unchanged = keyOf(values) === keyOf(baseline);
  const removing = empty && opening !== null;
  const key = keyOf(values);

  // The server's calculation of exactly this form (dry run).
  useEffect(() => {
    if (!open) return undefined;
    const token = sequence.current.next();
    if (problem || (empty && !opening) || unchanged) {
      setImpact(null);
      setChecking(false);
      return () => { sequence.current.next(); };
    }
    setChecking(true);
    const timer = setTimeout(() => {
      orgApi.putOpeningBalance(membershipId, buildOpeningPut({ ...values, reason: "" }), { dryRun: true })
        .then((result) => { if (sequence.current.isCurrent(token)) { setImpact(result.impact); setChecking(false); } })
        .catch((cause) => {
          if (!sequence.current.isCurrent(token)) return;
          setImpact(null);
          setChecking(false);
          // A refusal of the dry run (range, a transfer) is the answer the owner needs now.
          const failure = logicaError(cause);
          if (failure.code !== "REASON_REQUIRED") setError(failure.message);
        });
    }, IMPACT_DEBOUNCE_MS);
    return () => { clearTimeout(timer); sequence.current.next(); };
    // `values` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId, key, problem, empty, unchanged]);

  const submit = async () => {
    if (busy) return;
    if (problem) { setError(problem); return; }
    if (empty && !opening) return;
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.putOpeningBalance(membershipId, buildOpeningPut(values));
      onSaved(result.row, result.opening === null);
      onClose();
    } catch (cause) {
      const failure = logicaError(cause, "Не удалось сохранить остаток");
      setError(failure.code === "REASON_REQUIRED" ? `${failure.message}. Укажите причину ниже.` : failure.message);
    } finally {
      setBusy(false);
    }
  };

  const lines = openingImpactLines(impact);

  return (
    <Modal
      open={open}
      title={OPENING_TITLE}
      description={`${studentName} · ${groupName}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="opening-form"
            disabled={busy || Boolean(problem) || unchanged || (empty && !opening)}
            className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${removing ? "bg-red-600 hover:bg-red-700" : "bg-primary-600 hover:bg-primary-700"}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {removing ? "Убрать остаток" : "Сохранить"}
          </button>
        </>
      )}
    >
      <form id="opening-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4 pb-2" noValidate>
        <OpeningBalanceFields
          idPrefix="opening"
          values={values}
          onChange={(next) => { setError(null); setValues(next); }}
          enrolDate={enrolDate ?? null}
          today={today}
          accountingStart={accountingStart}
          floor={floor}
          line={!opening || !empty}
        />

        <div>
          <label htmlFor="opening-note" className={PRICE_LABEL}>Примечание <span className="font-normal text-slate-400">(необязательно)</span></label>
          <input id="opening-note" value={values.note} onChange={(event) => { setError(null); setValues({ ...values, note: event.target.value }); }} maxLength={300} autoComplete="off" placeholder="Например: из таблицы Excel" className={PRICE_FIELD} />
        </div>

        {opening && (
          <div>
            <label htmlFor="opening-reason" className={PRICE_LABEL}>Причина <span className="font-normal text-slate-400">(нужна, если у ученика уже есть оплаты)</span></label>
            <input id="opening-reason" value={values.reason} onChange={(event) => { setError(null); setValues({ ...values, reason: event.target.value }); }} maxLength={REASON_MAX} autoComplete="off" className={PRICE_FIELD} />
          </div>
        )}

        {(checking || lines.length > 0) && !problem && (
          <div aria-live="polite" className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700" data-testid="opening-impact">
            <p className="font-semibold text-slate-800">Что изменится</p>
            {checking ? <p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем…</p> : lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        )}

        {problem && !empty && <p role="alert" className="text-xs font-medium text-rose-700">{problem}</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
