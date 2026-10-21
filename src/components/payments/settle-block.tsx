"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { METHODS } from "@/lib/payments-ledger";
import { REASON_MAX } from "@/lib/payments";
import {
  applyFreshBalances,
  buildSettle,
  defaultSettleChoice,
  INDIVIDUAL_PRICE_ENDS_TEXT,
  logicaError,
  SETTLE_LABEL,
  settleHeadline,
  settleKind,
  validateSettle,
  BALANCE_CHANGED_TEXT,
  type FreshBalance,
  type LeaveMembership,
  type LeavePreview,
  type SettleChoice,
  type SettleItem,
} from "@/lib/payments-logica";
import { createRequestSequence } from "@/lib/request-sequence";

/**
 * The state of the «what happens to the money» part of leaving a group / the archive: the server's preview (what is left on the
 * account after leaving), the owner's choice per membership, and the numbers re-read after a payment came in between (`BALANCE_CHANGED`).
 */
export function useSettle(load: () => Promise<LeavePreview>, enabled: boolean, resetKey: string) {
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, SettleChoice>>({});
  const [loading, setLoading] = useState(false);
  /** `refused`: the server does not offer the preview to this user / this version (the old plain leave stays). */
  const [failure, setFailure] = useState<{ message: string; refused: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(createRequestSequence());
  const loadRef = useRef(load);
  loadRef.current = load;
  const previewRef = useRef<LeavePreview | null>(null);
  previewRef.current = preview;

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
    setNotice(null);
    reload();
    return () => { sequence.current.next(); };
  }, [enabled, resetKey, reload]);

  /** The server's fresh numbers: the preview is replaced, a changed membership falls back to «keep» and the owner is told. */
  const applyFresh = (fresh: FreshBalance[]) => {
    const current = previewRef.current;
    if (current) {
      const next = applyFreshBalances(current, fresh);
      setPreview(next.preview);
      setChoices((previous) => {
        const copy = { ...previous };
        for (const id of next.reset) delete copy[id];
        return copy;
      });
    }
    setNotice(BALANCE_CHANGED_TEXT);
  };

  const problem = validateSettle(preview, choices);
  const settle: SettleItem[] = buildSettle(preview, choices);
  const setChoice = (membershipId: string, next: Partial<SettleChoice>) => {
    setNotice(null);
    setChoices((previous) => ({ ...previous, [membershipId]: { ...(previous[membershipId] ?? defaultSettleChoice()), ...next } }));
  };
  return { preview, choices, loading, failure, notice, problem, settle, reload, applyFresh, setChoice, setNotice };
}

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

/**
 * A block per membership: «После ухода у ученика аванс 135 000 сум. Что сделать?» — «Вернуть 135 000 сум» [how] / «Оставить аванс на
 * счёте»; «После ухода у ученика долг 120 000 сум.» — «Оставить долг» / «Простить долг» [reason]; «Расчётов нет — можно убирать»;
 * without access to money: «У ученика есть расчёты по оплате — их видит владелец».
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

function Radio({ checked, onChange, disabled, children, name }: { checked: boolean; onChange: () => void; disabled: boolean; children: React.ReactNode; name: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-800">
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" />
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
      <p className={`text-sm ${kind === "none" ? "text-slate-500" : "text-slate-800"}`}>{settleHeadline(membership)}</p>

      {kind === "debt" && money && (
        <div className="space-y-2">
          <Radio name={name} checked={choice.action === "keep"} onChange={() => onChoice({ action: "keep" })} disabled={disabled}>{SETTLE_LABEL.keepDebt}</Radio>
          {membership.allowed.includes("writeoff") && (
            <Radio name={name} checked={choice.action === "writeoff"} onChange={() => onChoice({ action: "writeoff" })} disabled={disabled}>{SETTLE_LABEL.forgive}</Radio>
          )}
          {choice.action === "writeoff" && (
            <div className="pl-6">
              <label htmlFor={`${name}-reason`} className="mb-1 block text-xs font-semibold text-slate-600">Причина <span className="font-normal text-slate-400">(обязательно)</span></label>
              <input id={`${name}-reason`} value={choice.reason} onChange={(event) => onChoice({ reason: event.target.value })} maxLength={REASON_MAX} disabled={disabled} autoComplete="off" placeholder="Например: договорённость с родителем" className={FIELD} />
            </div>
          )}
        </div>
      )}

      {kind === "advance" && money && (
        <div className="space-y-2">
          {membership.allowed.includes("refund") && money.refundable > 0 && (
            <Radio name={name} checked={choice.action === "refund"} onChange={() => onChoice({ action: "refund" })} disabled={disabled}>{SETTLE_LABEL.refund(money.refundable)}</Radio>
          )}
          {choice.action === "refund" && (
            <div className="pl-6" role="radiogroup" aria-label="Как вернули деньги">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Как вернули</span>
              <div className="flex flex-wrap gap-1.5">
                {METHODS.map((method) => (
                  <button
                    key={method.key}
                    type="button"
                    role="radio"
                    aria-checked={choice.method === method.key}
                    disabled={disabled}
                    onClick={() => onChoice({ method: method.key })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${choice.method === method.key ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Radio name={name} checked={choice.action === "keep"} onChange={() => onChoice({ action: "keep" })} disabled={disabled}>{SETTLE_LABEL.keepAdvance}</Radio>
        </div>
      )}

      {money?.individual_price_ends && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{INDIVIDUAL_PRICE_ENDS_TEXT}</span>
        </p>
      )}
    </div>
  );
}

/** The loading / failure frame around a settle block. */
export function SettleStatus({
  loading, failure, notice, onRetry,
}: {
  loading: boolean;
  failure: { message: string; refused: boolean } | null;
  notice: string | null;
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
      {notice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{notice}</p>}
    </>
  );
}
