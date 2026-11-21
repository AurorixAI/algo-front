"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { METHODS } from "@/lib/payments-ledger";
import { REASON_MAX } from "@/lib/payments";
import {
  buildSettle,
  defaultSettleChoice,
  keepUnpaidLabel,
  logicaError,
  SETTLE_LABEL,
  settleHeadline,
  settleKind,
  settleOutcomeLines,
  validateSettle,
  type LeaveMembership,
  type LeavePreview,
  type SettleChoice,
  type SettleItem,
} from "@/lib/payments-logica";
import { createRequestSequence } from "@/lib/request-sequence";
import { Radio } from "@/components/ui/radio";
import { EffectsSections } from "@/components/money/effects-sections";
import { OtherGroupLines, RecalcLines } from "@/components/money/recalc-lines";
import { endsOnly } from "@/lib/transfer-effects";

/**
 * The state of the «what happens to the money» part of leaving a group / the archive: the server's preview (what the charge becomes and what is left on the
 * account after leaving), the owner's choice per membership.  A payment that came in (or a midnight that passed) between the window and the button is refused by the server (`BALANCE_CHANGED`):
 * the dialog closes and says the server's words, the next opening reads the probe again (PAY-TAILS Б5.1).
 */
export function useSettle(load: () => Promise<LeavePreview>, enabled: boolean, resetKey: string) {
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, SettleChoice>>({});
  const [loading, setLoading] = useState(false);
  /** `refused`: the server does not offer the preview to this user / this version (the old plain leave stays). */
  const [failure, setFailure] = useState<{ message: string; refused: boolean } | null>(null);
  const sequence = useRef(createRequestSequence());
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    const token = sequence.current.next();
    setLoading(true);
    setFailure(null);
    loadRef.current()
      .then((data) => { if (sequence.current.isCurrent(token)) { setPreview(data); setLoading(false); } })
      .catch((cause) => {
        if (!sequence.current.isCurrent(token)) return;
        const status = (cause as { status?: number } | null)?.status;
        setFailure({ message: logicaError(cause, "Не удалось проверить расчёты ученика").message, refused: status === 403 || status === 404 || status === 405 });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    setPreview(null);
    setChoices({});
    reload();
    return () => { sequence.current.next(); };
  }, [enabled, resetKey, reload]);

  const problem = validateSettle(preview, choices);
  const settle: SettleItem[] = buildSettle(preview, choices);
  const setChoice = (membershipId: string, next: Partial<SettleChoice>) => {
    setChoices((previous) => ({ ...previous, [membershipId]: { ...(previous[membershipId] ?? defaultSettleChoice()), ...next } }));
  };
  return { preview, choices, loading, failure, problem, settle, reload, setChoice };
}

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

/**
 * A block per membership (PAY-TAILS Б2.4, frames 6-9): «что было → что станет» (`recalc`, bold with the basis grey), what happens to the other groups (`others`), the outcome in ONE sentence of the server
 * («Останется долг 415 000 сум» / «Останется аванс 185 000 сум»), then the choice: «Оставить долг — …» / «Простить 415 000 сум» [reason]; «Вернуть 185 000 сум» [how] / «Оставить на счёте»;
 * «Расчётов нет — можно убирать»; without access to money: «У ученика есть расчёты по оплате — их видит владелец».
 */
export function SettleBlock({
  preview, choices, onChoice, disabled = false, showGroup = true,
}: {
  preview: LeavePreview;
  choices: Record<string, SettleChoice>;
  onChoice: (membershipId: string, next: Partial<SettleChoice>) => void;
  disabled?: boolean;
  showGroup?: boolean;
}) {
  return (
    <ul className="space-y-2.5" aria-label="Расчёты при уходе">
      {preview.memberships.map((membership) => (
        <li key={membership.membership_id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3" data-testid="settle-membership">
          <MembershipSettle membership={membership} choice={choices[membership.membership_id] ?? defaultSettleChoice()} onChoice={(next) => onChoice(membership.membership_id, next)} disabled={disabled} showGroup={showGroup} />
        </li>
      ))}
    </ul>
  );
}

function ChoiceRow({ checked, onChange, disabled, children, name }: { checked: boolean; onChange: () => void; disabled: boolean; children: React.ReactNode; name: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-800">
      <Radio name={name} checked={checked} onChange={onChange} disabled={disabled} className="mt-0.5" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function MembershipSettle({
  membership, choice, onChoice, disabled, showGroup,
}: {
  membership: LeaveMembership;
  choice: SettleChoice;
  onChoice: (next: Partial<SettleChoice>) => void;
  disabled: boolean;
  showGroup: boolean;
}) {
  const kind = settleKind(membership);
  const name = `settle-${membership.membership_id}`;
  const money = membership.money;
  return (
    <div className="space-y-2">
      {showGroup && <p className="break-words text-sm font-semibold text-slate-900">{membership.group_name}</p>}
      <RecalcLines block={membership.recalc} testId="settle-recalc" />
      <OtherGroupLines lines={membership.others} testId="settle-others" />
      {kind === "debt" || kind === "advance"
        // the sentences of the server by the state AFTER the closing, one per name; silent - nothing is said
        ? settleOutcomeLines(membership).map((words) => <p key={words} data-testid="settle-words" className="text-sm text-slate-800 [overflow-wrap:anywhere]">{words}</p>)
        : <p className={`text-sm ${kind === "none" ? "text-slate-500" : "text-slate-800"}`}>{settleHeadline(membership)}</p>}

      {kind === "debt" && money && (
        <div className="space-y-2">
          <ChoiceRow name={name} checked={choice.action === "keep"} onChange={() => onChoice({ action: "keep" })} disabled={disabled}>{keepUnpaidLabel(money)}</ChoiceRow>
          {membership.allowed.includes("writeoff") && (
            <ChoiceRow name={name} checked={choice.action === "writeoff"} onChange={() => onChoice({ action: "writeoff" })} disabled={disabled}>{SETTLE_LABEL.forgive(money.unpaid)}</ChoiceRow>
          )}
          {choice.action === "writeoff" && (
            <div className="pl-6">
              <label htmlFor={`${name}-reason`} className="mb-1 block text-xs font-semibold text-slate-600">Причина <span className="font-normal text-slate-500">(обязательно)</span></label>
              <input id={`${name}-reason`} value={choice.reason} onChange={(event) => onChoice({ reason: event.target.value })} maxLength={REASON_MAX} disabled={disabled} autoComplete="off" placeholder="Например: договорённость с родителем" className={FIELD} />
            </div>
          )}
        </div>
      )}

      {kind === "advance" && money && (
        <div className="space-y-2">
          {membership.allowed.includes("refund") && money.refundable > 0 && (
            <ChoiceRow name={name} checked={choice.action === "refund"} onChange={() => onChoice({ action: "refund" })} disabled={disabled}>{SETTLE_LABEL.refund(money.refundable)}</ChoiceRow>
          )}
          {choice.action === "refund" && (
            <div className="pl-6" role="radiogroup" aria-label="Как вернули деньги">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Как вернули</span>
              <div className="grid grid-cols-3 gap-1.5">
                {METHODS.map((method) => (
                  <button
                    key={method.key}
                    type="button"
                    role="radio"
                    aria-checked={choice.method === method.key}
                    disabled={disabled}
                    onClick={() => onChoice({ method: method.key })}
                    className={`min-h-10 rounded-lg border px-2.5 py-1.5 text-center text-xs font-semibold transition-colors ${choice.method === method.key ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ChoiceRow name={name} checked={choice.action === "keep"} onChange={() => onChoice({ action: "keep" })} disabled={disabled}>{SETTLE_LABEL.keepAdvance}</ChoiceRow>
        </div>
      )}

      {membership.effects && <EffectsSections effects={endsOnly(membership.effects)} testId="settle-effects" />}
    </div>
  );
}

/** The loading / failure frame around a settle block. */
export function SettleStatus({
  loading, failure, onRetry,
}: {
  loading: boolean;
  failure: { message: string; refused: boolean } | null;
  onRetry: () => void;
}) {
  return (
    <>
      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Проверяем расчёты ученика…</p>}
      {failure && !failure.refused && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
          {failure.message}{" "}
          <button type="button" onClick={onRetry} className="underline">Повторить</button>
        </p>
      )}
    </>
  );
}
