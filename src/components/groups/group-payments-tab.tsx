"use client";

import { TAP_ZONE, TAP_ZONE_ROWS } from "@/lib/tap-zone";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, Loader2, Search, Users } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  groupPriceHref,
  priceLabelOf,
  priceNotInForceText,
  type GroupPriceBrief,
  type GroupPriceScheduled,
} from "@/lib/group-price";
import {
  emptyFilterText,
  extrasFromHistory,
  filterChipLabel,
  filterPaymentRows,
  needsExtras,
  paymentRowViews,
  paymentsCounts,
  PAYMENTS_LOAD_ERROR,
  PAYMENTS_SEARCH_FROM,
  type GroupPaymentRowView,
  type PaymentsFilter,
  type PriceExtras,
} from "@/lib/group-payments";
import { canWriteOff } from "@/lib/payments-ledger";
import { fetchGroupSettled } from "@/lib/paytails-read";
import { rowActionsOf, SETTLED_BAND_TITLE } from "@/lib/paytails";
import { useMediaQuery, PHONE_QUERY } from "@/lib/use-media-query";
import { MoneyRow } from "@/components/payments/money-row";
import { REFUND_ACTION_LABEL, REFUND_ROW_LABEL } from "@/components/payments/refund-dialog";
import { useRefundFlow } from "@/components/payments/refund-flow";
import {
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  statementHref,
  type MembershipPaymentRow,
  type PaymentBucket,
  type PaymentSaveResult,
} from "@/lib/payments";
import { studentToast } from "@/lib/money-effects";
import { savedPaymentDetails } from "@/lib/payments-ledger";
import { studentHref } from "@/lib/ia-links";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { markReceiptNavigation } from "@/lib/receipt-nav";
import { PackageProgress } from "@/components/payments/package-progress";
import { createRequestSequence } from "@/lib/request-sequence";
import { Hint } from "@/components/ui/hint";
import { useToast } from "@/components/ui/toast";
import { Chip } from "@/components/ui/chip";
import { moneyChipTone } from "@/lib/status-registry";
import { MembershipRowActions } from "@/components/payments/membership-row-actions";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { MoneyAccessDenied } from "@/components/payments/money-access-denied";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/lib/button-style";
import { EmptyState } from "@/components/ui/empty-state";

/** Student takes what is left; the «payment» column is fixed (its header and cells are centred), the actions stay right.  NO column of the price (PAY-DUE 14А.4): the price of the group is in the chips of the header,
 * an individual price is a mark under the name of its student. */
const GRID_COLS = "lg:grid-cols-[minmax(12rem,1fr)_minmax(15rem,22rem)_minmax(272px,1fr)]";
const PAGE = 500;
const MAX_PAGES = 5;
/** At most this many `price-override` calls at once (an older server: the author of an individual price is not in the list). */
const EXTRAS_POOL = 4;

/** Every membership of the group the bucket lists, page after page (the group holds at most 200 students: one page in practice). */
async function fetchAll(bucket: PaymentBucket | "all", groupId: string): Promise<MembershipPaymentRow[]> {
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
  /** G3M Ф6: the price planned from a day (no price today). */
  groupScheduledPrice?: GroupPriceScheduled | null;
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
export function GroupPaymentsTab({ groupId, groupName, groupPrice, groupScheduledPrice = null, groupsBasePath, studentsBasePath, paymentsBasePath, joinedAt, filter, onFilterChange }: GroupPaymentsTabProps) {
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const { showToast, toastNode } = useToast();
  const label = priceLabelOf(periodMode);
  const today = useMemo(() => formatBusinessDate(), []);

  const [rows, setRows] = useState<MembershipPaymentRow[] | null>(null);
  const [leftRows, setLeftRows] = useState<MembershipPaymentRow[]>([]);
  const phone = useMediaQuery(PHONE_QUERY);
  const [extras, setExtras] = useState<Record<string, PriceExtras>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  /** The row whose «Внести оплату» is open; it stays while the dialog closes. */
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const requests = useRef(createRequestSequence());
  const extrasAsked = useRef<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setRows(null);
    setLoadError(null);
    try {
      // PAY-TAILS Б1.2: the closed memberships with ANY settlement (debt, «к оплате», advance), one reading place (`lib/paytails-read.ts`)
      const [active, settled] = await Promise.all([fetchAll("all", groupId), fetchGroupSettled(groupId, new Set())]);
      if (!requests.current.isCurrent(token)) return;
      const activeIds = new Set(active.map((row) => row.membership_id));
      setRows(active);
      setLeftRows(settled.rows.filter((row) => !activeIds.has(row.membership_id)));
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
    const sequence = requests.current;
    return () => { sequence.next(); };
  }, [load]);

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

  const views = useMemo(() => paymentRowViews(rows ?? [], { periodMode, today, extras, groupScheduled: groupScheduledPrice }), [rows, periodMode, today, extras, groupScheduledPrice]);
  const leftViews = useMemo(() => paymentRowViews(leftRows, { periodMode, today, groupScheduled: groupScheduledPrice }), [leftRows, periodMode, today, groupScheduledPrice]);
  const counts = useMemo(() => paymentsCounts(views), [views]);
  const shown = useMemo(() => filterPaymentRows(views, filter, search), [views, filter, search]);

  const replaceRow = (next: MembershipPaymentRow) => {
    setRows((previous) => previous?.map((row) => (row.membership_id === next.membership_id ? next : row)) ?? previous);
    setLeftRows((previous) => previous.map((row) => (row.membership_id === next.membership_id ? next : row)));
  };
  /** The server accepted a change: its row replaces ours; the menu badge and the banner are read again. */
  const changed = (next: MembershipPaymentRow, priceChanged = false) => {
    replaceRow(next);
    if (priceChanged) void fetchExtras(next.membership_id);
    void refreshSummary(true);
  };

  // PAY-TAILS Б2.2: «Вернуть» of a closed membership with an advance - the window of the refund, one flow with the student's card
  const refund = useRefundFlow({ onRowChange: (next) => changed(next), onNotify: showToast, onDuplicate: () => void load(true), paymentsBasePath });

  const openPay = (view: GroupPaymentRowView) => { setPayTarget(view.membershipId); setPayOpen(true); };

  const everyRow = [...(rows ?? []), ...leftRows];
  const payRow = everyRow.find((row) => row.membership_id === payTarget) ?? null;

  /** IA audit F1 / F13: the «⋯» of a row is the student card's own (`MembershipRowActions`), so the two menus never diverge. */
  const actionsFor = (view: GroupPaymentRowView) => (!view.row.is_active && !canWriteOff(view.row) ? null : (
    <MembershipRowActions
      row={view.row}
      studentName={view.row.student_name}
      periodMode={periodMode}
      joinedAt={joinedAt[view.row.student_id] ?? null}
      label={`Действия по оплате: ${view.name}`}
      onRowChange={(next, kind) => changed(next, kind === "price")}
      onNotify={showToast}
      paymentsBasePath={paymentsBasePath}
    />
  ));

  if (denied) {
    return <MoneyAccessDenied framed />;
  }

  const filters: PaymentsFilter[] = counts.due > 0 || filter === "due" ? ["all", "individual", "debt", "due"] : ["all", "individual", "debt"];

  return (
    <div className="space-y-4" data-testid="group-payments-tab">
      {/* The price is in the header chips.  A planned price (the chip is silent) says so here; with none at all the chip already warns, so here is only the action (LL 87: said once) */}
      {!groupPrice && (
        <p className="text-sm text-slate-600" data-testid="group-payments-summary">
          {groupScheduledPrice && <span className="mr-3 font-semibold text-slate-900">{priceNotInForceText(groupScheduledPrice, "Цена группы не задана")}</span>}
          <Link href={groupPriceHref(groupsBasePath, groupId)} className={groupScheduledPrice ? "text-xs font-semibold text-primary-700 hover:underline" : "inline-flex min-h-10 items-center text-sm font-semibold text-primary-700 hover:underline sm:min-h-0"} data-testid="group-payments-set-price">{groupScheduledPrice ? "Цена группы" : "Задать цену группы"}</Link>
        </p>
      )}

      {rows !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex flex-wrap items-center gap-1.5 ${TAP_ZONE_ROWS}`} role="group" aria-label="Фильтр учеников">
            {filters.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onFilterChange(key)}
                aria-pressed={filter === key}
                data-testid={`payments-filter-${key}`}
                className={`${TAP_ZONE} rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
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
          <Button type="button" onClick={() => void load()} variant="secondary" size="md">Повторить</Button>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Users} variant="filtered" title={emptyFilterText(filter, search)} />
      ) : (
        <section aria-label="Оплаты учеников группы" className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:shadow-sm">
          <div role="presentation" className={`hidden items-center gap-x-6 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 lg:grid ${GRID_COLS}`}>
            <span>Ученик</span>
            <span className="text-center">Оплата</span>
            <span className="sr-only">Действия</span>
          </div>
          <ul className="space-y-2.5 lg:space-y-0 lg:divide-y lg:divide-slate-100">
            {shown.map((view) => (
              <PaymentRow
                key={view.key}
                view={view}
                phone={phone}
                studentsBasePath={studentsBasePath}
                paymentsBasePath={paymentsBasePath}
                actions={actionsFor(view)}
                onPay={() => openPay(view)}
                onRefund={() => refund.open(view.row)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* PAY-TAILS Б2.3 (frames 4, 23б): the closed memberships with a settlement - folded, a band of the design system; the header of the group has no label of the advance */}
      {leftViews.length > 0 && (
        <section aria-label={SETTLED_BAND_TITLE} data-testid="payments-left" className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:shadow-sm">
          <button type="button" onClick={() => setShowLeft((value) => !value)} aria-expanded={showLeft} data-testid="payments-left-toggle" className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 lg:rounded-none lg:border-0">
            <span className="min-w-0 py-2 text-left">{SETTLED_BAND_TITLE} <span className="font-medium tabular-nums text-slate-500">{leftViews.length}</span></span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500">
              <span className="max-sm:hidden">{showLeft ? "скрыть" : "показать"}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showLeft ? "rotate-180" : ""}`} aria-hidden="true" />
            </span>
          </button>
          {showLeft && (
            <ul className="mt-2.5 space-y-2.5 lg:mt-0 lg:space-y-0 lg:divide-y lg:divide-slate-100" aria-label={SETTLED_BAND_TITLE} data-testid="payments-left-list">
              {leftViews.map((view) => (
                <PaymentRow
                  key={view.key}
                  view={view}
                  phone={phone}
                  closed
                  studentsBasePath={studentsBasePath}
                  paymentsBasePath={paymentsBasePath}
                  actions={actionsFor(view)}
                  onPay={() => openPay(view)}
                  onRefund={() => refund.open(view.row)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {payRow && (
        <PaymentDialog
          open={payOpen}
          kind="create"
          membership={{ membership_id: payRow.membership_id, group_id: groupId, student_name: payRow.student_name, group_name: groupName }}
          payment={null}
          groupsBasePath={groupsBasePath}
          onClose={() => setPayOpen(false)}
          onSaved={(result: PaymentSaveResult) => { changed(result.row); const note = studentToast(savedPaymentDetails(result.allocation, result.after_text)); showToast(PAYMENT_SAVED_TEXT.create, note.tone, note.details); }}
          onDuplicate={(notice) => { showToast(notice.text, notice.tone); void load(true); }}
        />
      )}
      {refund.dialog}
      {toastNode}
    </div>
  );
}

function ChipView({ view }: { view: GroupPaymentRowView }) {
  return (
    // the status and the package bar on ONE axis, centred under the «Оплата» header (owner 26.10)
    <div className="flex min-w-0 flex-col items-start gap-1.5 lg:items-center">
      {view.chip.label && <Chip tone={view.chip.tone} testId="membership-chip" className="whitespace-nowrap tabular-nums">{view.chip.label}</Chip>}
      {view.chip.sub && <p className="text-xs text-slate-600 lg:text-center" data-testid="membership-chip-sub">{view.chip.sub}</p>}
      <PackageProgress row={view.row} variant="compact" bare={Boolean(view.chip.label)} className="lg:[&>p]:justify-center" />
    </div>
  );
}

function StudentCell({ view, studentsBasePath, marks = false }: { view: GroupPaymentRowView; studentsBasePath: string; /** the marks of the price under the name (the rows of the group, not the left ones) */ marks?: boolean }) {
  return (
    <div className="min-w-0">
      <Link href={studentHref(studentsBasePath, view.studentId, "payments")} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700">
        {view.name}
      </Link>
      {view.displayId && <p className="truncate text-xs text-slate-500">{view.displayId}</p>}
      {/* the price is NOT a column; what only this student has stays under his name: the individual price (the badge says why on a tap / hover) and a price planned from a day */}
      {marks && (view.individual || view.scheduledText) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {view.individual && view.individualHint && (
            <Hint text={view.individualHint} side="below" width={280} className="inline-flex">
              <span data-testid="individual-badge" className="inline-block rounded-md border border-primary-200 bg-primary-50 px-1.5 py-px text-[11px] font-semibold leading-4 text-primary-700">индивидуальная</span>
            </Hint>
          )}
          {view.individual && <span className="font-semibold tabular-nums text-slate-900" data-testid="group-payment-price">{view.priceText}</span>}
          {view.scheduledText && <span data-testid="group-payment-scheduled">{view.scheduledText}</span>}
        </p>
      )}
    </div>
  );
}

const ROW = `flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 lg:grid lg:items-center lg:gap-x-6 lg:gap-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-3 ${GRID_COLS}`;

/**
 * One row of the group's money, OPEN or CLOSED (`closed`: a student who left, in the band).  A phone (< 640): the common compact row (`MoneyRow`, frames 20-23б); the group is the page itself, so its line is the sub-line of the state only.
 * The action follows the STATE (`rowActionsOf`, Б2.2): «Внести оплату» / «Вернуть» / only the statement; a closed row has no price marks and no «⋯» unless there is a debt to forgive.
 */
function PaymentRow({ view, phone, closed = false, studentsBasePath, paymentsBasePath, actions, onPay, onRefund }: {
  view: GroupPaymentRowView;
  phone: boolean;
  closed?: boolean;
  studentsBasePath: string;
  paymentsBasePath: string;
  actions: ReactNode;
  onPay: () => void;
  onRefund: () => void;
}) {
  // the main (blue) button only where something is unpaid (a debt or a sum to pay); the rest is an outline, as on the page «Оплаты»
  const due = (Number(view.row.debt) || 0) > 0;
  const acts = rowActionsOf(view.row);
  const statement = statementHref(paymentsBasePath, view.membershipId);
  if (phone) {
    const action = acts.pay
      ? { label: "Внести", ariaLabel: `${PAY_ACTION_LABEL}: ${view.name}`, onClick: onPay, testId: "payment-row-pay" }
      : acts.refund ? { label: REFUND_ROW_LABEL, ariaLabel: `${REFUND_ACTION_LABEL}: ${view.name}`, onClick: onRefund, testId: "payment-row-refund" } : null;
    return (
      <MoneyRow
        testId={closed ? "group-payment-left-row" : "group-payment-row"}
        name={view.name}
        statementHref={statement}
        onOpenStatement={() => markReceiptNavigation(view.membershipId)}
        label={view.chip.label}
        tone={view.chip.tone}
        sub={view.chip.sub}
        action={action}
      />
    );
  }
  return (
    <li className={ROW} data-testid={closed ? "group-payment-left-row" : "group-payment-row"} data-membership-id={view.membershipId} data-individual={view.individual ? "true" : "false"}>
      <StudentCell view={view} studentsBasePath={studentsBasePath} marks={!closed} />

      <div className="min-w-0 lg:flex lg:justify-center"><ChipView view={view} /></div>

      <div className="flex items-center gap-2 lg:justify-end">
        {acts.pay && (
          <Button type="button" onClick={onPay} variant={due ? "primary" : "secondary"} size="sm" className="min-w-0 flex-1 lg:flex-none">
            {PAY_ACTION_LABEL}
          </Button>
        )}
        {acts.refund && (
          <Button type="button" onClick={onRefund} variant="secondary" size="sm" className="min-w-0 flex-1 lg:flex-none" data-testid="payment-row-refund">
            {REFUND_ROW_LABEL}
          </Button>
        )}
        <Link
          href={statement}
          onClick={() => markReceiptNavigation(view.membershipId)}
          className={`${buttonClass({ variant: "secondary", size: "sm" })} text-center`}
        >
          Выписка
        </Link>
        {actions}
      </div>
    </li>
  );
}
