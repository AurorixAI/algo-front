"use client";

import { logicaError, type LogicaError } from "@/lib/payments-logica";
import { PriceBlockedBanner, PriceImpactMoneyBlock } from "./price-impact";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  activeOverrideFrom,
  checkOverrideForm,
  checkReturnForm,
  formatPrice,
  groupPriceHref,
  isCancelRefused,
  isPriceConflict,
  membershipPriceLine,
  overrideCancelledLine,
  ASSIGN_OVERRIDE_LABEL,
  overrideChangeLine,
  overrideRowText,
  pastDateWarning,
  priceDateRange,
  priceLabelOf,
  priceMenuActions,
  priceOfRow,
  PRICE_CONFLICT_TEXT,
  sinceText,
  staleSheetsText,
  type MembershipPrice,
  type PriceImpact,
  type PriceOverrideRequest,
  type PriceOverrideRow,
} from "@/lib/group-price";
import { type MembershipPaymentRow, type PeriodMode } from "@/lib/payments";
import { createRequestSequence } from "@/lib/request-sequence";
import { Modal } from "@/components/ui/modal";
import { type RowMenuItem } from "@/components/ui/row-menu";
import { MoneyField, PRICE_FIELD, PRICE_LABEL, ReasonField } from "./price-fields";

type Dialog = "assign" | "return" | { cancel: PriceOverrideRow } | null;

interface MembershipPriceControlsProps {
  row: MembershipPaymentRow;
  studentName: string;
  /** The centre's billing mode: it names the sum («Оплата в месяц» / «Стоимость пакета»). */
  periodMode: PeriodMode;
  /** `/owner/groups` or `/admin/groups`: «Задать цену группы» leads to the group. */
  groupsBasePath: string;
  /** An active membership of a student who is not in the archive (the server refuses the rest with 409). */
  editable: boolean;
  /** The server accepted a change: the parent replaces the row it holds. */
  onRowChange: (row: MembershipPaymentRow) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}

export interface MembershipPriceControls {
  /** Row 2 of the group block: «Цена 500 000 сум/мес · цена группы», or «Цена группы не задана» with the link. */
  line: ReactNode;
  /** For the «⋯» menu: «Назначить индивидуальную цену», «Вернуть цену группы», «Отменить запланированную…», «История цены». */
  items: RowMenuItem[];
  /** The history of the price, while it is open. */
  panel: ReactNode;
  /** The dialogs those items open. */
  dialogs: ReactNode;
}

/**
 * The price of one membership on the student card: the price of the group the student follows, or the individual price
 * with its reason.  The card never types a number "per student": the price is set on the group; an individual price is
 * an explicit exception («Назначить индивидуальную цену», a reason is required) that «Вернуть цену группы» takes back.
 * The block of the group owns one «⋯» menu; this hook gives it the price's items, the line, the history and the dialogs.
 */
export function useMembershipPriceControls({
  row, studentName, periodMode, groupsBasePath, editable, onRowChange, onNotify,
}: MembershipPriceControlsProps): MembershipPriceControls {
  const label = priceLabelOf(periodMode);
  const price = priceOfRow(row);
  const view = membershipPriceLine(price, label);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<MembershipPrice | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  /** Bumped after a write: the history is read again (a scheduled price does not change `price`). */
  const [reloads, setReloads] = useState(0);
  const requests = useMemo(() => createRequestSequence(), []);

  // The history is read when it is opened - and, for an editable membership, at once: it says whether an individual
  // price is scheduled (it can be cancelled) - and again after every write.
  const priceKey = `${price.source}|${price.amount ?? ""}|${price.valid_from ?? ""}`;
  useEffect(() => {
    if (!historyOpen && !editable) return undefined;
    const token = requests.next();
    setHistoryError(null);
    orgApi.getMembershipPrice(row.membership_id)
      .then((result) => { if (requests.isCurrent(token)) setHistory(result); })
      .catch((cause) => { if (requests.isCurrent(token)) setHistoryError(cause instanceof Error ? cause.message : "Не удалось загрузить историю цены"); });
    return () => { requests.next(); };
  }, [historyOpen, editable, row.membership_id, priceKey, reloads, requests]);

  // The individual price in force starts on `activeFrom`; the scheduled ones can be cancelled.
  const activeFrom = activeOverrideFrom(price);
  const actions = priceMenuActions(editable, price, history?.history);

  /** Somebody else wrote meanwhile: the price of the row and the history are read again. */
  const refreshAfterConflict = useCallback(async () => {
    try {
      const fresh = await orgApi.getMembershipPrice(row.membership_id);
      onRowChange({ ...row, price: fresh.price, monthly_fee: fresh.price.amount });
    } catch {
      // the next opening of the dialog shows what the server holds
    }
    setReloads((value) => value + 1);
    // `row` is the parent's: a new one arrives with the answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.membership_id, onRowChange]);

  const items: RowMenuItem[] = actions.map((action) => ({
    key: action.kind === "cancel" ? `cancel-${action.row.id}` : action.kind,
    label: action.label,
    onSelect: () => setDialog(action.kind === "cancel" ? { cancel: action.row } : action.kind),
  }));
  items.push({ key: "price-history", label: historyOpen ? "Скрыть историю цены" : "История цены", onSelect: () => setHistoryOpen((value) => !value) });

  const line = view.kind === "none" ? (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span className="font-medium text-amber-800" data-testid="membership-price">{view.text}</span>
      <Link href={groupPriceHref(groupsBasePath, row.group_id)} className="text-xs font-semibold text-primary-700 hover:underline">
        Задать цену группы
      </Link>
    </p>
  ) : (
    <p data-testid="membership-price" title={view.title ?? undefined} className="min-w-0 break-words text-sm text-slate-600">
      {view.lead ? `${view.lead} ` : null}
      <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{view.value}</span>
      {view.tail ? <span className="text-slate-500"> · {view.tail}</span> : null}
    </p>
  );

  const panel = historyOpen ? (
    <section aria-label="История цены" className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-600">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-slate-700">История цены</h3>
        <button type="button" onClick={() => setHistoryOpen(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">Скрыть</button>
      </div>
      {historyError ? (
        <p role="alert" className="text-rose-700">{historyError}</p>
      ) : history === null ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      ) : history.history.length === 0 ? (
        <p className="text-slate-400">Индивидуальных цен не было: ученик платит по цене группы.</p>
      ) : (
        <ul className="space-y-0.5">
          {history.history.map((item) => (
            <li key={item.id} className={item.is_current ? "font-medium text-slate-800" : ""}>
              {overrideRowText(item, history.price_label)}
              {item.is_future && <span className="ml-1.5 text-amber-700">· ожидает даты</span>}
              {item.created_by_name && <span className="text-slate-400"> · {item.created_by_name}</span>}
              {(item.changes ?? []).map((change, index) => (
                <span key={index} className="block text-[11px] font-normal text-slate-400">{overrideChangeLine(change)}</span>
              ))}
            </li>
          ))}
        </ul>
      )}
      {history && (history.cancelled ?? []).length > 0 && (
        <div className="mt-1.5">
          <p className="text-[11px] font-semibold text-slate-400">Отменённые</p>
          <ul className="space-y-0.5">
            {history.cancelled.map((item, index) => <li key={index} className="text-[11px] text-slate-400">{overrideCancelledLine(item)}</li>)}
          </ul>
        </div>
      )}
    </section>
  ) : null;

  const dialogs = (
    <>
      <AssignOverrideDialog
        open={dialog === "assign"}
        row={row}
        studentName={studentName}
        label={label}
        onClose={() => setDialog(null)}
        onConflict={() => void refreshAfterConflict()}
        onSaved={(next, since) => {
          onRowChange(next);
          setReloads((value) => value + 1);
          onNotify(since ? `Индивидуальная цена назначена, действует ${since}` : "Индивидуальная цена назначена");
        }}
      />
      <ReturnPriceDialog
        open={dialog === "return"}
        row={row}
        studentName={studentName}
        label={label}
        notBefore={activeFrom}
        onClose={() => setDialog(null)}
        onConflict={() => void refreshAfterConflict()}
        onSaved={(next) => { onRowChange(next); setReloads((value) => value + 1); onNotify("Ученик снова платит по цене группы"); }}
      />
      <CancelScheduledDialog
        target={typeof dialog === "object" && dialog !== null ? dialog.cancel : null}
        row={row}
        studentName={studentName}
        label={label}
        onClose={() => setDialog(null)}
        onConflict={() => void refreshAfterConflict()}
        onSaved={(next) => { onRowChange(next); setReloads((value) => value + 1); onNotify("Запланированная индивидуальная цена отменена"); }}
      />
    </>
  );

  return { line, items, panel, dialogs };
}

/**
 * What an individual price (or «цена группы снова») would do: the server's dry run of exactly this request, asked once the owner stops
 * typing.  `impact` carries the money of this membership and the payroll sheets that go «Есть изменения»; a backdated price over a
 * paid period is refused (409 `PRICE_BACKDATE_WITH_PAYMENTS`) and says so before saving.
 */
function useOverrideImpact(open: boolean, membershipId: string, request: PriceOverrideRequest | null) {
  const key = JSON.stringify(request);
  const [state, setState] = useState<{ key: string; impact: PriceImpact | null; blocked: LogicaError | null } | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!open || !request) { setState(null); setChecking(false); return undefined; }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      orgApi.setMembershipPrice(membershipId, request, { dryRun: true })
        .then((answer) => { if (!cancelled) { setState({ key, impact: answer.impact ?? null, blocked: null }); setChecking(false); } })
        .catch((cause) => {
          if (cancelled) return;
          const failure = logicaError(cause);
          setState({ key, impact: null, blocked: failure.code === "PRICE_BACKDATE_WITH_PAYMENTS" ? failure : null });
          setChecking(false);
        });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // `request` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipId, key]);
  const current = state && state.key === key ? state : null;
  return { impact: current?.impact ?? null, blocked: current?.blocked ?? null, checking };
}

/** «Что изменится» of an individual price: the money block and the payroll sheets. */
function OverrideImpactBlock({ impact, blocked, checking }: { impact: PriceImpact | null; blocked: LogicaError | null; checking: boolean }) {
  if (blocked) return <PriceBlockedBanner error={blocked} />;
  if (checking) return <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем последствия…</p>;
  const stale = impact ? staleSheetsText(impact) : null;
  if (!impact || (!impact.money && !stale)) return null;
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700" data-testid="override-impact">
      <p className="font-semibold text-slate-800">Что изменится</p>
      <PriceImpactMoneyBlock money={impact.money} />
      {stale && (
        <div>
          <p>{stale.text}</p>
          {stale.items.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4">{stale.items.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

/** «Назначить индивидуальную цену»: a sum, the day it starts and the reason (3..200 characters, required). */
function AssignOverrideDialog({
  open, row, studentName, label, onClose, onConflict, onSaved,
}: {
  open: boolean;
  row: MembershipPaymentRow;
  studentName: string;
  label: string;
  onClose: () => void;
  /** PRICE_CONFLICT: somebody wrote the price meanwhile; the section reads it again. */
  onConflict: () => void;
  /** `since`: «с 20.11.2026» when the price starts later than today, else "". */
  onSaved: (row: MembershipPaymentRow, since: string) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [amount, setAmount] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 409 `PRICE_BACKDATE_WITH_PAYMENTS`: the day reaches a period that has money behind it. */
  const [blocked, setBlocked] = useState<LogicaError | null>(null);
  const price = priceOfRow(row);
  const range = priceDateRange(today);

  useEffect(() => {
    if (!open) return;
    setBlocked(null);
    setAmount("");
    setValidFrom(today);
    setReason("");
    setBusy(false);
    setError(null);
    // Restarts when the dialog is opened again, not when the row refreshes behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.membership_id]);

  const past = pastDateWarning(validFrom, today);
  const formCheck = checkOverrideForm({ amount, validFrom, reason }, today);
  const whatIf = useOverrideImpact(open, row.membership_id, formCheck.request);

  const submit = async () => {
    if (busy) return;
    const check = checkOverrideForm({ amount, validFrom, reason }, today);
    if (check.error || !check.request) { setError(check.error); return; }
    setBusy(true);
    setError(null);
    setBlocked(null);
    try {
      const result = await orgApi.setMembershipPrice(row.membership_id, check.request);
      onSaved(result.row, check.request.valid_from && check.request.valid_from > today ? sinceText(check.request.valid_from) : "");
      onClose();
    } catch (cause) {
      if (isPriceConflict(cause)) { setError(PRICE_CONFLICT_TEXT); onConflict(); }
      else if (logicaError(cause).code === "PRICE_BACKDATE_WITH_PAYMENTS") setBlocked(logicaError(cause));
      else setError(cause instanceof Error ? cause.message : "Не удалось сохранить цену");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={ASSIGN_OVERRIDE_LABEL}
      description={`${studentName} · ${row.group_name}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="membership-price-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </button>
        </>
      )}
    >
      <form id="membership-price-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3.5 pb-2" noValidate>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
          Это исключение только для этого ученика. {price.group_amount !== null && price.group_amount !== undefined
            ? `Остальные платят по цене группы: ${formatPrice(price.group_amount, label)}.`
            : "Цена группы не задана."}
        </p>
        <MoneyField id="membership-price-amount" label={`${label} ученика`} value={amount} onChange={(text) => { setError(null); setAmount(text); }} autoFocus />
        <div>
          <label htmlFor="membership-price-from" className={PRICE_LABEL}>Действует с</label>
          <input
            id="membership-price-from"
            type="date"
            value={validFrom}
            min={range.min}
            max={range.max}
            onChange={(event) => { setError(null); setValidFrom(event.target.value); }}
            className={`${PRICE_FIELD} sm:w-1/2`}
          />
        </div>
        <ReasonField id="membership-price-reason" value={reason} onChange={(text) => { setError(null); setReason(text); }} />
        {past && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">{past}</p>}
        {!blocked && <OverrideImpactBlock impact={whatIf.impact} blocked={whatIf.blocked} checking={whatIf.checking} />}
        {blocked && <PriceBlockedBanner error={blocked} />}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}

/** «Вернуть цену группы»: from a day the student pays the price of the group again (no sum, no reason). */
function ReturnPriceDialog({
  open, row, studentName, label, notBefore, onClose, onConflict, onSaved,
}: {
  open: boolean;
  row: MembershipPaymentRow;
  studentName: string;
  label: string;
  /** The day the individual price in force started: an earlier day changes nothing. */
  notBefore: string | null;
  onClose: () => void;
  onConflict: () => void;
  onSaved: (row: MembershipPaymentRow) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [validFrom, setValidFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<LogicaError | null>(null);
  const price = priceOfRow(row);
  const range = priceDateRange(today);
  const earliest = notBefore && notBefore > range.min ? notBefore : range.min;

  useEffect(() => {
    if (!open) return;
    setValidFrom(today);
    setBusy(false);
    setError(null);
    setBlocked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.membership_id]);

  const past = pastDateWarning(validFrom, today);
  const returnCheck = checkReturnForm(validFrom, today, notBefore);
  const whatIf = useOverrideImpact(open, row.membership_id, returnCheck.request);

  const submit = async () => {
    if (busy) return;
    const check = checkReturnForm(validFrom, today, notBefore);
    if (check.error || !check.request) { setError(check.error); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.setMembershipPrice(row.membership_id, check.request);
      onSaved(result.row);
      onClose();
    } catch (cause) {
      if (isPriceConflict(cause)) { setError(PRICE_CONFLICT_TEXT); onConflict(); }
      else if (logicaError(cause).code === "PRICE_BACKDATE_WITH_PAYMENTS") setBlocked(logicaError(cause));
      else setError(cause instanceof Error ? cause.message : "Не удалось вернуть цену группы");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Вернуть цену группы"
      description={`${studentName} · ${row.group_name}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="submit"
            form="membership-price-return-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Вернуть
          </button>
        </>
      )}
    >
      <form id="membership-price-return-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3.5 pb-2" noValidate>
        <p className="text-sm text-slate-700">
          С выбранного дня ученик снова платит по цене группы
          {price.group_amount !== null && price.group_amount !== undefined ? ` (${formatPrice(price.group_amount, label)})` : ""}.
          Индивидуальная цена остаётся в истории.
        </p>
        <div>
          <label htmlFor="membership-price-return-from" className={PRICE_LABEL}>С какого дня</label>
          <input
            id="membership-price-return-from"
            type="date"
            value={validFrom}
            min={earliest}
            max={range.max}
            onChange={(event) => { setError(null); setValidFrom(event.target.value); }}
            className={`${PRICE_FIELD} sm:w-1/2`}
          />
        </div>
        {past && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">{past}</p>}
        {!blocked && <OverrideImpactBlock impact={whatIf.impact} blocked={whatIf.blocked} checking={whatIf.checking} />}
        {blocked && <PriceBlockedBanner error={blocked} />}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}

/**
 * «Отменить запланированную индивидуальную цену»: the row of a day after today is taken back (DELETE); the server refuses a
 * price that is in force already (409) and one that is gone (404) - the section then reads the price again.
 */
function CancelScheduledDialog({
  target, row, studentName, label, onClose, onConflict, onSaved,
}: {
  target: PriceOverrideRow | null;
  row: MembershipPaymentRow;
  studentName: string;
  label: string;
  onClose: () => void;
  onConflict: () => void;
  onSaved: (row: MembershipPaymentRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The server said it cannot be cancelled: nothing to confirm any more. */
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setBusy(false);
    setError(null);
    setRefused(false);
  }, [target?.id]);

  const submit = async () => {
    if (!target || busy || refused) return;
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.cancelMembershipPrice(row.membership_id, target.id);
      onSaved(result.row);
      onClose();
    } catch (cause) {
      if (isCancelRefused(cause)) {
        setRefused(true);
        setError(cause instanceof Error ? cause.message : "Цену нельзя отменить");
        onConflict();
      } else {
        setError(cause instanceof Error ? cause.message : "Не удалось отменить цену");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title="Отменить запланированную цену?"
      description={`${studentName} · ${row.group_name}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">{refused ? "Закрыть" : "Не отменять"}</button>
          {!refused && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Отменить цену
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-3 pb-2">
        {target && <p className="text-sm font-medium text-slate-800">{overrideRowText(target, label)}</p>}
        <p className="text-sm text-slate-600">Ученик продолжит платить так же, как сейчас. Отмена останется в истории.</p>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </div>
    </Modal>
  );
}
