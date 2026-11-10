"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  checkGroupPriceForm,
  correctionImpactText,
  correctionReasonProblem,
  unusualPriceText,
  futureDateNote,
  GROUP_PRICE_NOTE_MAX,
  groupPriceKey,
  impactStudentsText,
  isNoopPriceChange,
  CHANGE_GROUP_PRICE_LABEL,
  isPriceConflict,
  priceColumnLabel,
  PAID_NEVER_CHANGE_TEXT,
  pastDateWarning,
  PRICE_CONFLICT_TEXT,
  priceDateRange,
  SET_GROUP_PRICE_LABEL,
  staleSheetsText,
  type GroupPriceCurrent,
  type GroupPriceResult,
  type GroupPriceRow,
  type PriceImpact,
} from "@/lib/group-price";
import { formatMoney, formatMoneyInput } from "@/lib/payments";
import { tidyMoneyText } from "@/lib/money-format";
import { createRequestSequence } from "@/lib/request-sequence";
import { logicaError, type LogicaError } from "@/lib/payments-logica";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter, MONEY_WINDOW_TABLE } from "@/components/money/dialog-footer";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { CorrectionSwitch, PriceBlockedBanner, PriceImpactMoneyBlock, UnusualPriceConfirm } from "@/components/payments/price-impact";
import { MoneyField, PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";
import { DateInput } from "@/components/ui/date-input";

/** Wait this long after the last keystroke before asking the server what the change would touch. */
const IMPACT_DEBOUNCE_MS = 350;

interface GroupPriceDialogProps {
  open: boolean;
  groupId: string;
  groupName: string;
  /** «Цена в месяц» | «Цена пакета»: names the amount. */
  label: string;
  current: GroupPriceCurrent | null;
  /** The saved rows: a request that equals one of them writes nothing new. */
  history: GroupPriceRow[];
  onClose: () => void;
  /** The server accepted the price (the block replaces what it shows). */
  onSaved: (result: GroupPriceResult) => void;
  /** 409 PRICE_CONFLICT: somebody changed the price meanwhile; the block reads it again. */
  onConflict: () => void;
}

/**
 * «Изменить цену»: a sum, the day it starts (today by default) and a note.  Before saving, the server is asked
 * (`dry_run`) what the change touches - how many students get the price, whose individual price stays, which saved
 * payroll sheets would turn «данные изменились» - and the answer is on screen; «Сохранить» waits for the answer
 * that belongs to exactly the sum and the day typed.
 */
export function GroupPriceDialog({ open, groupId, groupName, label, current, history, onClose, onSaved, onConflict }: GroupPriceDialogProps) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [amount, setAmount] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<{ key: string; data: PriceImpact } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  /** 409 `PRICE_BACKDATE_WITH_PAYMENTS`: the day reaches a period somebody has paid for; the key of the answer says which sum and day. */
  const [blocked, setBlocked] = useState<{ key: string; error: LogicaError } | null>(null);
  /** Money-1 V3: «Да, цена верная» - the key of the sum and day it was ticked for (another sum, another question). */
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  /** Money-1 V3: a 409 `PRICE_UNUSUAL` of the write (a race: the price changed meanwhile) asks the same question. */
  const [unusual409, setUnusual409] = useState<{ key: string; text: string } | null>(null);
  /** Money-1 V3: «Исправляю опечатку в цене» - offered after `PRICE_BACKDATE_WITH_PAYMENTS` with `can_correct` (the key of the sum and day it was offered for). */
  const [offerKey, setOfferKey] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);
  /** Bumped to ask again (retry, or after a conflict made the old answer stale). */
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(createRequestSequence());

  useEffect(() => {
    if (!open) return;
    setAmount(formatMoneyInput(current?.amount ?? null));
    setValidFrom(today);
    setNote("");
    setSaving(false);
    setError(null);
    setImpact(null);
    setBlocked(null);
    setCheckError(null);
    setConfirmedKey(null);
    setUnusual409(null);
    setOfferKey(null);
    setCorrecting(false);
    setCorrectionReason("");
    setReasonTouched(false);
    // The dialog restarts when it is opened again (or for another group), not when the block refreshes behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId]);

  const check = useMemo(() => checkGroupPriceForm({ amount, validFrom, note }, today), [amount, validFrom, note, today]);
  const baseKey = groupPriceKey(check.request);
  // the answer belongs to the sum, the day AND the way (a correction is another question to the server)
  const key = correcting ? `${baseKey}|correction` : baseKey;

  // The consequences of exactly this sum and day.
  useEffect(() => {
    if (!open) return undefined;
    const token = sequence.current.next();
    if (!check.request) {
      setChecking(false);
      setCheckError(null);
      return () => { sequence.current.next(); };
    }
    const asked = { amount: check.request.amount, valid_from: check.request.valid_from, ...(correcting ? { correction: true } : {}) };
    const askedKey = key;
    setChecking(true);
    setCheckError(null);
    const timer = setTimeout(() => {
      orgApi.setGroupPrice(groupId, asked, { dryRun: true })
        .then((result) => {
          if (!sequence.current.isCurrent(token)) return;
          setImpact({ key: askedKey, data: result.impact });
          setBlocked(null);
          setChecking(false);
        })
        .catch((cause) => {
          if (!sequence.current.isCurrent(token)) return;
          setImpact(null);
          setChecking(false);
          const refusal = logicaError(cause);
          if (refusal.code === "PRICE_BACKDATE_WITH_PAYMENTS") { setBlocked({ key: askedKey, error: refusal }); if (refusal.canCorrect) setOfferKey(baseKey); return; }
          setBlocked(null);
          setCheckError(cause instanceof Error ? cause.message : "Не удалось проверить последствия");
        });
    }, IMPACT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      sequence.current.next();
    };
    // `check.request` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId, key, nonce]);

  const blockedNow = blocked && blocked.key === key ? blocked.error : null;
  const shownImpactNow = impact && impact.key === key ? impact.data : null;
  // Money-1 V3: the sum is unusual (more than twice, less than a half, zero) - the server words the question; the person ticks «Да, цена верная» before saving
  const unusualText = unusualPriceText(shownImpactNow) ?? (unusual409 && unusual409.key === key ? unusual409.text : null);
  const confirmed = confirmedKey === key;
  const offered = offerKey === baseKey && baseKey !== "";
  const reasonProblem = correcting ? correctionReasonProblem(correctionReason) : null;
  const ready = Boolean(check.request) && impact !== null && impact.key === key && !checking && !blockedNow && (unusualText === null || confirmed) && reasonProblem === null;
  // The same sum and note on a day that already has them is no change: nothing to save
  const noop = isNoopPriceChange(history, check.request);
  const canSave = ready && !noop;
  const shownImpact = impact && impact.key === key ? impact.data : null;
  // «Укажите сумму» is not an error yet while the field is untouched.
  const problem = check.error && (amount !== "" || check.error !== "Укажите сумму") ? check.error : null;
  const stale = shownImpact ? staleSheetsText(shownImpact) : null;
  const past = check.request ? pastDateWarning(check.request.valid_from, today) : null;
  const future = check.request ? futureDateNote(check.request.valid_from, today) : null;
  const range = priceDateRange(today);

  const save = async () => {
    if (!check.request || !canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await orgApi.setGroupPrice(groupId, {
        ...check.request,
        ...(unusualText !== null && confirmed ? { confirm_unusual: true } : {}),
        ...(correcting ? { correction: true, correction_reason: correctionReason.trim() } : {}),
      });
      onSaved(result);
      onClose();
    } catch (cause) {
      if (isPriceConflict(cause)) {
        onConflict();
        setImpact(null);
        setNonce((value) => value + 1);
        setError(PRICE_CONFLICT_TEXT);
      } else if (logicaError(cause).code === "PRICE_BACKDATE_WITH_PAYMENTS") {
        setBlocked({ key, error: logicaError(cause) });
        if (logicaError(cause).canCorrect) setOfferKey(baseKey);
      } else if (logicaError(cause).code === "PRICE_UNUSUAL") {
        setUnusual409({ key, text: logicaError(cause).message });
        setConfirmedKey(null);
      } else if (logicaError(cause).code === "REASON_REQUIRED") {
        setReasonTouched(true);
        setError(logicaError(cause).message);
      } else {
        setError(cause instanceof Error ? cause.message : "Не удалось сохранить цену");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={current ? CHANGE_GROUP_PRICE_LABEL : SET_GROUP_PRICE_LABEL}
      description={`${groupName} · ${priceColumnLabel(label)}`}
      onClose={onClose}
      busy={saving}
      size="lg"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={<ConfirmFooter primary={`Сохранить цену${check.request ? ` ${formatMoney(check.request.amount)}` : ""}`} submitFor="group-price-form" busy={saving} disabled={!canSave} why={noop ? "Такая цена с этой даты уже сохранена" : unusualText !== null && !confirmed && !blockedNow ? "Подтвердите цену: «Да, цена верная»" : reasonProblem ? reasonProblem : ready ? null : "Кнопка включится, когда будут показаны последствия"} whyId="group-price-why" onCancel={onClose} testId="group-price-save" />}
    >
      <form id="group-price-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3.5 pb-2" noValidate>
        <div>
          <MoneyField
            id="group-price-amount"
            label={priceColumnLabel(label)}
            value={amount}
            onChange={(text) => { setError(null); setAmount(text); }}
            autoFocus
            describedBy="group-price-amount-note"
          />
          <p id="group-price-amount-note" className="mt-1 text-xs text-slate-500">
            {current
              ? current.amount === 0 ? "Сейчас: бесплатно. " : `Сейчас: ${formatMoneyInput(current.amount)} сум. `
              : "Сейчас цена не задана. "}
            Цена 0 — занятия бесплатные.
          </p>
        </div>

        <div>
          <label htmlFor="group-price-from" className={PRICE_LABEL}>Действует с</label>
          <DateInput
            id="group-price-from"
            value={validFrom}
            min={range.min}
            max={range.max}
            onChange={(next) => { setError(null); setValidFrom(next); }}
            wrapperClassName="sm:w-1/2"
            className={PRICE_FIELD}
          />
        </div>

        <div>
          <label htmlFor="group-price-note" className={PRICE_LABEL}>Примечание <span className="font-normal text-slate-500">(необязательно)</span></label>
          <input
            id="group-price-note"
            value={note}
            onChange={(event) => { setError(null); setNote(event.target.value); }}
            maxLength={GROUP_PRICE_NOTE_MAX}
            autoComplete="off"
            placeholder="Например: новый учебный год"
            className={PRICE_FIELD}
          />
        </div>

        {problem && <p role="alert" className="text-xs font-medium text-rose-700">{problem}</p>}

        {past && (
          <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{past}</span>
          </p>
        )}

        {check.request && (offered || correcting) && (
          <CorrectionSwitch
            on={correcting}
            onChange={(next) => { setCorrecting(next); setError(null); setConfirmedKey(null); }}
            reason={correctionReason}
            onReason={(next) => { setCorrectionReason(next); setError(null); }}
            error={reasonTouched || correctionReason.length > 0 ? correctionReasonProblem(correctionReason) : null}
          />
        )}

        {check.request && (
          <div aria-live="polite" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-800">Что изменится</p>
            {blockedNow ? (
              <PriceBlockedBanner error={blockedNow} />
            ) : checking || (!shownImpact && !checkError) ? (
              <p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем последствия…</p>
            ) : checkError ? (
              <p role="alert" className="text-rose-700">
                {checkError}{" "}
                <button type="button" onClick={() => setNonce((value) => value + 1)} className="font-semibold underline">Повторить</button>
              </p>
            ) : shownImpact ? (
              <>
                <p>{impactStudentsText(shownImpact, { overridesListed: Boolean(shownImpact.money?.override_students?.length) })}.</p>
                {shownImpact.first_price && <p className="text-slate-700" data-testid="first-price-note">{tidyMoneyText(shownImpact.first_price.text)}</p>}
                {correctionImpactText(shownImpact) && <p data-testid="correction-impact">{correctionImpactText(shownImpact)}.</p>}
                <PriceImpactMoneyBlock money={shownImpact.money} />
                {stale && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p>{stale.text}</p>
                      {stale.items.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {stale.items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
                {/* the past-day warning above already says it */}
                {!past && <p className="text-slate-500">{PAID_NEVER_CHANGE_TEXT}</p>}
              </>
            ) : null}
            {unusualText !== null && !blockedNow && <UnusualPriceConfirm text={unusualText} checked={confirmed} onChange={(next) => setConfirmedKey(next ? key : null)} />}
            {future && <p className="text-slate-500">{future}</p>}
            {noop && <p className="font-medium text-slate-700">Такая цена с этой даты уже сохранена — менять нечего.</p>}
          </div>
        )}

        {error && <Notice variant="error" compact>{error}</Notice>}
      </form>
    </Modal>
  );
}
