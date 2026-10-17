"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  checkOverrideForm,
  checkReturnForm,
  formatPrice,
  groupPriceHref,
  membershipPriceView,
  overrideRowText,
  pastDateWarning,
  priceDateRange,
  priceLabelOf,
  priceOfRow,
  sinceText,
  type MembershipPrice,
} from "@/lib/group-price";
import { formatMoney, type MembershipPaymentRow, type PeriodMode } from "@/lib/payments";
import { createRequestSequence } from "@/lib/request-sequence";
import { Modal } from "@/components/ui/modal";
import { MoneyField, PRICE_FIELD, PRICE_LABEL, ReasonField } from "./price-fields";

type Dialog = "assign" | "return" | null;

interface MembershipPriceSectionProps {
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

/**
 * The price of one membership on the student card: the price of the group the student follows, or the individual price
 * with its reason.  The card never types a number "per student": the price is set on the group; an individual price is
 * an explicit exception («Назначить индивидуальную цену», a reason is required) that «Вернуть цену группы» takes back.
 */
export function MembershipPriceSection({ row, studentName, periodMode, groupsBasePath, editable, onRowChange, onNotify }: MembershipPriceSectionProps) {
  const label = priceLabelOf(periodMode);
  const price = priceOfRow(row);
  const view = membershipPriceView(price, label);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<MembershipPrice | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const requests = useMemo(() => createRequestSequence(), []);

  // The history is read when it is opened, and again after every change of the price.
  const priceKey = `${price.source}|${price.amount ?? ""}|${price.valid_from ?? ""}`;
  useEffect(() => {
    if (!historyOpen) return undefined;
    const token = requests.next();
    setHistoryError(null);
    orgApi.getMembershipPrice(row.membership_id)
      .then((result) => { if (requests.isCurrent(token)) setHistory(result); })
      .catch((cause) => { if (requests.isCurrent(token)) setHistoryError(cause instanceof Error ? cause.message : "Не удалось загрузить историю цены"); });
    return () => { requests.next(); };
  }, [historyOpen, row.membership_id, priceKey, requests]);

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {view.kind === "none" ? (
          <>
            <span className="font-medium text-amber-800" data-testid="membership-price">{view.title}</span>
            <Link href={groupPriceHref(groupsBasePath, row.group_id)} className="text-xs font-semibold text-primary-700 hover:underline">
              Задать цену группы
            </Link>
          </>
        ) : (
          <span data-testid="membership-price" className="min-w-0">
            <span className="text-xs text-slate-500">{view.title}:</span>{" "}
            <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{view.value}</span>
            {view.kind === "override" && (
              <span className="ml-2 inline-flex rounded-md border border-primary-200 bg-primary-50 px-1.5 py-px align-middle text-[10px] font-semibold text-primary-800">индивидуальная</span>
            )}
          </span>
        )}
        {editable && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" onClick={() => setDialog("assign")} className="text-left text-xs font-semibold text-primary-700 hover:underline">
              Назначить индивидуальную цену
            </button>
            {view.kind === "override" && (
              <button type="button" onClick={() => setDialog("return")} className="text-left text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline">
                Вернуть цену группы
              </button>
            )}
          </span>
        )}
      </div>
      {view.note && <p className="break-words text-xs text-slate-500">{view.note}</p>}

      <div>
        <button
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
          aria-expanded={historyOpen}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${historyOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          История цены
        </button>
        {historyOpen && (
          <div className="mt-1 text-xs text-slate-600">
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <AssignOverrideDialog
        open={dialog === "assign"}
        row={row}
        studentName={studentName}
        label={label}
        onClose={() => setDialog(null)}
        onSaved={(next, since) => { onRowChange(next); onNotify(since ? `Индивидуальная цена сохранена, действует ${since}` : "Индивидуальная цена сохранена"); }}
      />
      <ReturnPriceDialog
        open={dialog === "return"}
        row={row}
        studentName={studentName}
        onClose={() => setDialog(null)}
        onSaved={(next) => { onRowChange(next); onNotify("Ученик снова платит по цене группы"); }}
      />
    </div>
  );
}

/** «Назначить индивидуальную цену»: a sum, the day it starts and the reason (3..200 characters, required). */
function AssignOverrideDialog({
  open, row, studentName, label, onClose, onSaved,
}: {
  open: boolean;
  row: MembershipPaymentRow;
  studentName: string;
  label: string;
  onClose: () => void;
  /** `since`: «с 20.11.2026» when the price starts later than today, else "". */
  onSaved: (row: MembershipPaymentRow, since: string) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [amount, setAmount] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = priceOfRow(row);
  const range = priceDateRange(today);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setValidFrom(today);
    setReason("");
    setBusy(false);
    setError(null);
    // Restarts when the dialog is opened again, not when the row refreshes behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.membership_id]);

  const past = pastDateWarning(validFrom, today);

  const submit = async () => {
    if (busy) return;
    const check = checkOverrideForm({ amount, validFrom, reason }, today);
    if (check.error || !check.request) { setError(check.error); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.setMembershipPrice(row.membership_id, check.request);
      onSaved(result.row, check.request.valid_from && check.request.valid_from > today ? sinceText(check.request.valid_from) : "");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить цену");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Индивидуальная цена"
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
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}

/** «Вернуть цену группы»: from a day the student pays the price of the group again (no sum, no reason). */
function ReturnPriceDialog({
  open, row, studentName, onClose, onSaved,
}: {
  open: boolean;
  row: MembershipPaymentRow;
  studentName: string;
  onClose: () => void;
  onSaved: (row: MembershipPaymentRow) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [validFrom, setValidFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = priceOfRow(row);
  const range = priceDateRange(today);

  useEffect(() => {
    if (!open) return;
    setValidFrom(today);
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.membership_id]);

  const past = pastDateWarning(validFrom, today);

  const submit = async () => {
    if (busy) return;
    const check = checkReturnForm(validFrom, today);
    if (check.error || !check.request) { setError(check.error); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.setMembershipPrice(row.membership_id, check.request);
      onSaved(result.row);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось вернуть цену группы");
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
          {price.group_amount !== null && price.group_amount !== undefined ? ` (${formatMoney(price.group_amount)})` : ""}.
          Индивидуальная цена остаётся в истории.
        </p>
        <div>
          <label htmlFor="membership-price-return-from" className={PRICE_LABEL}>С какого дня</label>
          <input
            id="membership-price-return-from"
            type="date"
            value={validFrom}
            min={range.min}
            max={range.max}
            onChange={(event) => { setError(null); setValidFrom(event.target.value); }}
            className={`${PRICE_FIELD} sm:w-1/2`}
          />
        </div>
        {past && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">{past}</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
