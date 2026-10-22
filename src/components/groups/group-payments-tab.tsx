"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Search, Users, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  groupPriceHref,
  priceLabelOf,
  type GroupPriceBrief,
} from "@/lib/group-price";
import {
  collectionBrief,
  emptyFilterText,
  extrasFromHistory,
  filterChipLabel,
  filterPaymentRows,
  leftDebtRows,
  leftDebtToggleLabel,
  needsExtras,
  paymentRowViews,
  paymentsCounts,
  PAYMENTS_LOAD_ERROR,
  PAYMENTS_SEARCH_FROM,
  summaryParts,
  type GroupPaymentRowView,
  type MonthCollectionBrief,
  type PaymentsFilter,
  type PriceExtras,
} from "@/lib/group-payments";
import { canPayLeftDebt } from "@/lib/payments-logica";
import { overviewQuery, periodOf } from "@/lib/payments-income-v2";
import {
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  payIsDue,
  statementHref,
  type MembershipPaymentRow,
  type PaymentBucket,
  type PaymentSaveResult,
} from "@/lib/payments";
import { savedPaymentDetails } from "@/lib/payments-ledger";
import { studentHref } from "@/lib/ia-links";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { markReceiptNavigation } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { Hint } from "@/components/ui/hint";
import { useToast } from "@/components/ui/toast";
import { Chip } from "@/components/ui/chip";
import { moneyChipTone } from "@/lib/status-registry";
import { MembershipRowActions } from "@/components/payments/membership-row-actions";
import { PaymentDialog } from "@/components/payments/payment-dialog";

const GRID_COLS = "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_272px]";
const PAGE = 500;
const MAX_PAGES = 5;
/** At most this many `price-override` calls at once (an older server: the author of an individual price is not in the list). */
const EXTRAS_POOL = 4;

/** Every membership of the group the bucket lists, page after page (the group holds at most 200 students: one page in practice). */
async function fetchAll(bucket: PaymentBucket | "all" | "debt", groupId: string): Promise<MembershipPaymentRow[]> {
  const out: MembershipPaymentRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await orgApi.getPaymentsStatus({ bucket, groupId, limit: PAGE, offset: page * PAGE });
    out.push(...result.items);
    if (result.items.length === 0 || out.length >= result.total) break;
  }
  return out;
}

const isDenied = (cause: unknown) => {
  const status = (cause as { status?: number } | null)?.status;
  return status === 403 || status === 404;
};

interface GroupPaymentsTabProps {
  groupId: string;
  groupName: string;
  /** `price_current` of the group (money roles only). */
  groupPrice: GroupPriceBrief | null | undefined;
  /** `/owner/groups` or `/admin/groups`. */
  groupsBasePath: string;
  /** `/owner/students` or `/admin/students`. */
  studentsBasePath: string;
  /** `/owner/payments` or `/admin/payments`. */
  paymentsBasePath: string;
  /** The day each student joined this group (the opening balance is checked against it). */
  joinedAt: Readonly<Record<string, string | null | undefined>>;
  filter: PaymentsFilter;
  onFilterChange: (filter: PaymentsFilter) => void;
}

/**
 * ROADMAP #126 - «Оплаты» of the group page: who pays what, who has an individual price (with the reason), who owes.
 * One request for the rows (`payments/status?group_id=`); the price, the chip and every action are the student card's own
 * (`membershipChip`, the payment / opening / individual-price dialogs).  Spec: artifacts/partner_doc_check/group_payments_tab_spec.md.
 */
export function GroupPaymentsTab({ groupId, groupName, groupPrice, groupsBasePath, studentsBasePath, paymentsBasePath, joinedAt, filter, onFilterChange }: GroupPaymentsTabProps) {
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const { showToast, toastNode } = useToast();
  const label = priceLabelOf(periodMode);
  const today = useMemo(() => formatBusinessDate(), []);

  const [rows, setRows] = useState<MembershipPaymentRow[] | null>(null);
  const [leftRows, setLeftRows] = useState<MembershipPaymentRow[]>([]);
  const [extras, setExtras] = useState<Record<string, PriceExtras>>({});
  const [collection, setCollection] = useState<MonthCollectionBrief | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  /** The row whose «Внести оплату» is open; it stays while the dialog closes. */
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const requests = useRef(createRequestSequence());
  const incomeRequests = useRef(createRequestSequence());
  const extrasAsked = useRef<Set<string>>(new Set());

  const loadIncome = useCallback(() => {
    const token = incomeRequests.current.next();
    orgApi.getIncomeOverview(overviewQuery(periodOf("month", today), { groupId, teacherId: "" }))
      .then((overview) => { if (incomeRequests.current.isCurrent(token)) setCollection(collectionBrief(overview.collection)); })
      .catch(() => { if (incomeRequests.current.isCurrent(token)) setCollection(null); });
  }, [groupId, today]);

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setRows(null);
    setLoadError(null);
    try {
      const [active, debtors] = await Promise.all([fetchAll("all", groupId), fetchAll("debt", groupId)]);
      if (!requests.current.isCurrent(token)) return;
      setRows(active);
      setLeftRows(leftDebtRows(debtors, new Set(active.map((row) => row.membership_id))));
      extrasAsked.current = new Set();
      setExtras({});
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      if (isDenied(cause)) setDenied(true);
      else setLoadError(cause instanceof Error && cause.message ? cause.message : PAYMENTS_LOAD_ERROR);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
    loadIncome();
    const sequence = requests.current;
    const income = incomeRequests.current;
    return () => { sequence.next(); income.next(); };
  }, [load, loadIncome]);

  /** Who set an individual price and the one scheduled: the list carries them on a newer server, `price-override` tells otherwise. */
  const fetchExtras = useCallback(async (membershipId: string) => {
    try {
      const result = await orgApi.getMembershipPrice(membershipId);
      setExtras((previous) => ({ ...previous, [membershipId]: extrasFromHistory(result.price, result.history) }));
    } catch {
      // the badge keeps its reason; the author just is not named
    }
  }, []);

  useEffect(() => {
    if (!rows) return undefined;
    const queue = rows.filter((row) => needsExtras(row) && !extrasAsked.current.has(row.membership_id)).map((row) => row.membership_id);
    queue.forEach((id) => extrasAsked.current.add(id));
    if (queue.length === 0) return undefined;
    let cancelled = false;
    const worker = async () => {
      while (!cancelled) {
        const id = queue.shift();
        if (!id) return;
        await fetchExtras(id);
      }
    };
    void Promise.all(Array.from({ length: Math.min(EXTRAS_POOL, queue.length) }, worker));
    // a newer list cancels the rest of the queue: those rows are asked again
    return () => { cancelled = true; queue.forEach((id) => extrasAsked.current.delete(id)); };
  }, [rows, fetchExtras]);

  const views = useMemo(() => paymentRowViews(rows ?? [], { periodMode, today, extras }), [rows, periodMode, today, extras]);
  const leftViews = useMemo(() => paymentRowViews(leftRows, { periodMode, today }), [leftRows, periodMode, today]);
  const counts = useMemo(() => paymentsCounts(views), [views]);
  const shown = useMemo(() => filterPaymentRows(views, filter, search), [views, filter, search]);
  const parts = summaryParts({ groupPrice, periodMode, individual: counts.individual, collection });

  const replaceRow = (next: MembershipPaymentRow) => {
    setRows((previous) => previous?.map((row) => (row.membership_id === next.membership_id ? next : row)) ?? previous);
    setLeftRows((previous) => previous.map((row) => (row.membership_id === next.membership_id ? next : row)));
  };
  /** The server accepted a change: its row replaces ours; the menu badge, the banner and the month's collection are read again. */
  const changed = (next: MembershipPaymentRow, priceChanged = false) => {
    replaceRow(next);
    if (priceChanged) void fetchExtras(next.membership_id);
    void refreshSummary(true);
    loadIncome();
  };

  const openPay = (view: GroupPaymentRowView) => { setPayTarget(view.membershipId); setPayOpen(true); };

  const everyRow = [...(rows ?? []), ...leftRows];
  const payRow = everyRow.find((row) => row.membership_id === payTarget) ?? null;

  /** IA audit F1 / F13: the «⋯» of a row is the student card's own (`MembershipRowActions`), so the two menus never diverge. */
  const actionsFor = (view: GroupPaymentRowView) => (
    <MembershipRowActions
      row={view.row}
      studentName={view.row.student_name}
      periodMode={periodMode}
      joinedAt={joinedAt[view.row.student_id] ?? null}
      label={`Действия по оплате: ${view.name}`}
      onRowChange={(next, kind) => changed(next, kind === "price")}
      onNotify={showToast}
    />
  );

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white py-16 text-center">
        <Wallet className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Раздел «Оплаты» недоступен</p>
        <p className="text-xs text-slate-400">Доступ даёт владелец центра в настройках.</p>
      </div>
    );
  }

  const filters: PaymentsFilter[] = ["all", "individual", "debt"];

  return (
    <div className="space-y-4" data-testid="group-payments-tab">
      {/* The answer first: the price, who has an exception, how the month is going */}
      <p className="text-sm text-slate-600" data-testid="group-payments-summary">
        {parts.map((part, index) => (
          <span key={index}>
            {index > 0 && <span className="mx-1.5 text-slate-300" aria-hidden>·</span>}
            <span className={index === 0 ? "font-semibold text-slate-900" : ""}>{part}</span>
          </span>
        ))}
        {!groupPrice && (
          <Link href={groupPriceHref(groupsBasePath, groupId)} className="ml-3 text-xs font-semibold text-primary-700 hover:underline">Задать цену группы</Link>
        )}
      </p>

      {rows !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Фильтр учеников">
            {filters.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onFilterChange(key)}
                aria-pressed={filter === key}
                data-testid={`payments-filter-${key}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                  filter === key ? "border-primary-600 bg-primary-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {filterChipLabel(key, counts)}
              </button>
            ))}
          </div>
          {views.length >= PAYMENTS_SEARCH_FROM && (
            <div className="relative ml-auto w-full max-w-xs sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Имя ученика"
                aria-label="Поиск ученика"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
              />
            </div>
          )}
        </div>
      )}

      {rows === null && !loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <p className="max-w-md text-sm font-medium text-rose-800">{loadError}</p>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-12 text-center">
          <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Users className="h-5 w-5" /></span>
          <p className="text-sm font-medium text-slate-600">{emptyFilterText(filter, search)}</p>
        </div>
      ) : (
        <section aria-label="Оплаты учеников группы" className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:shadow-sm">
          <div role="presentation" className={`hidden items-center gap-x-4 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 lg:grid ${GRID_COLS}`}>
            <span>Ученик</span>
            <span className="text-right">{label}</span>
            <span>Оплата</span>
            <span className="sr-only">Действия</span>
          </div>
          <ul className="space-y-2.5 lg:space-y-0 lg:divide-y lg:divide-slate-100">
            {shown.map((view) => (
              <PaymentRow
                key={view.key}
                view={view}
                label={label}
                studentsBasePath={studentsBasePath}
                paymentsBasePath={paymentsBasePath}
                actions={actionsFor(view)}
                onPay={() => openPay(view)}
              />
            ))}
          </ul>
        </section>
      )}

      {leftViews.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowLeft((value) => !value)} aria-expanded={showLeft} data-testid="payments-left-toggle" className="text-sm font-semibold text-primary-700 hover:underline">
            {leftDebtToggleLabel(leftViews.length, showLeft)}
          </button>
          {showLeft && (
            <ul className="space-y-2.5 lg:space-y-0 lg:divide-y lg:divide-slate-100 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white" aria-label="Ушедшие с долгом">
              {leftViews.map((view) => (
                <LeftRow key={view.key} view={view} studentsBasePath={studentsBasePath} paymentsBasePath={paymentsBasePath} onPay={() => openPay(view)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {payRow && (
        <PaymentDialog
          open={payOpen}
          kind="create"
          membership={{ membership_id: payRow.membership_id, group_id: groupId, student_name: payRow.student_name, group_name: groupName }}
          payment={null}
          groupsBasePath={groupsBasePath}
          onClose={() => setPayOpen(false)}
          onSaved={(result: PaymentSaveResult) => { changed(result.row); showToast(PAYMENT_SAVED_TEXT.create, "success", savedPaymentDetails(result.allocation)); }}
          onDuplicate={() => { showToast("Эта оплата уже внесена"); void load(true); }}
        />
      )}
      {toastNode}
    </div>
  );
}

function ChipView({ view }: { view: GroupPaymentRowView }) {
  return <Chip tone={moneyChipTone(view.chip.tone, true)} title={view.chip.title ?? undefined} testId="membership-chip" className="tabular-nums">{view.chip.label}</Chip>;
}

function StudentCell({ view, studentsBasePath }: { view: GroupPaymentRowView; studentsBasePath: string }) {
  return (
    <div className="min-w-0">
      <Link href={studentHref(studentsBasePath, view.studentId, "payments")} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700">
        {view.name}
      </Link>
      {view.displayId && <p className="truncate text-xs text-slate-400">{view.displayId}</p>}
    </div>
  );
}

const ROW = `flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 lg:grid lg:items-center lg:gap-x-4 lg:gap-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-3 ${GRID_COLS}`;

function PaymentRow({ view, label, studentsBasePath, paymentsBasePath, actions, onPay }: {
  view: GroupPaymentRowView;
  label: string;
  studentsBasePath: string;
  paymentsBasePath: string;
  actions: ReactNode;
  onPay: () => void;
}) {
  const due = payIsDue(view.row);
  return (
    <li className={ROW} data-testid="group-payment-row" data-membership-id={view.membershipId} data-individual={view.individual ? "true" : "false"}>
      <StudentCell view={view} studentsBasePath={studentsBasePath} />

      <div className="flex items-start justify-between gap-3 lg:block lg:text-right">
        <span className="shrink-0 text-xs text-slate-400 lg:hidden">{label}</span>
        <div className="min-w-0 text-right">
          <p className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <span className={`text-sm font-semibold tabular-nums ${view.priceMissing ? "text-amber-700" : "text-slate-900"}`} data-testid="group-payment-price">{view.priceText}</span>
            {view.individual && view.individualHint && (
              <Hint text={view.individualHint} side="below" width={280} className="inline-flex">
                <span data-testid="individual-badge" className="inline-block rounded-md border border-primary-200 bg-primary-50 px-1.5 py-px text-[11px] font-semibold leading-4 text-primary-700">индивидуальная</span>
              </Hint>
            )}
          </p>
          {view.scheduledText && <p className="text-xs text-slate-500" data-testid="group-payment-scheduled">{view.scheduledText}</p>}
        </div>
      </div>

      <div className="min-w-0"><ChipView view={view} /></div>

      <div className="flex items-center gap-2 lg:justify-end">
        <button
          type="button"
          onClick={onPay}
          className={`min-w-0 flex-1 whitespace-nowrap rounded-lg border px-3.5 py-2 text-center text-xs font-semibold lg:flex-none lg:py-1.5 ${
            due ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700" : "border-primary-200 bg-white text-primary-700 hover:bg-primary-50"
          }`}
        >
          {PAY_ACTION_LABEL}
        </button>
        <Link
          href={statementHref(paymentsBasePath, view.membershipId)}
          onClick={() => markReceiptNavigation(view.membershipId)}
          className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:py-1.5"
        >
          Выписка
        </Link>
        {actions}
      </div>
    </li>
  );
}

/** A student who has left but still owes: the debt, the statement and (at most the debt) the payment. */
function LeftRow({ view, studentsBasePath, paymentsBasePath, onPay }: { view: GroupPaymentRowView; studentsBasePath: string; paymentsBasePath: string; onPay: () => void }) {
  return (
    <li className={ROW} data-testid="group-payment-left-row" data-membership-id={view.membershipId}>
      <div className="min-w-0">
        <StudentCell view={view} studentsBasePath={studentsBasePath} />
        <p className="text-xs text-slate-400">ушёл из группы</p>
      </div>
      <span className="text-right text-sm text-slate-400 max-lg:hidden">—</span>
      <div className="min-w-0"><ChipView view={view} /></div>
      <div className="flex items-center gap-2 lg:justify-end">
        {canPayLeftDebt(view.row) && (
          <button type="button" onClick={onPay} className="min-w-0 flex-1 whitespace-nowrap rounded-lg border border-primary-600 bg-primary-600 px-3.5 py-2 text-center text-xs font-semibold text-white hover:bg-primary-700 lg:flex-none lg:py-1.5">
            Оплатить долг
          </button>
        )}
        <Link
          href={statementHref(paymentsBasePath, view.membershipId)}
          onClick={() => markReceiptNavigation(view.membershipId)}
          className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:py-1.5"
        >
          Выписка
        </Link>
      </div>
    </li>
  );
}
