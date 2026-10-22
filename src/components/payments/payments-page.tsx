"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Eraser, Loader2, Pencil, Search, Tags, TrendingUp, UserRound, Undo2, Wallet, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  bucketCount,
  bucketTabLabel,
  debtReasonText,
  formatDateRu,
  formatMoney,
  incomeHref,
  isCarryOver,
  lastPaymentLabel,
  paymentAmountLabel,
  visibleBuckets,
  parseBucket,
  paymentsBaseOf,
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  positionCards,
  priceMissingText,
  statementHref,
  statusDetail,
  moneyChip,
  STATUS_TONE_CLASS,
  type MembershipPaymentRow,
  type PaymentBucket,
  type PaymentOut,
  type PaymentSaveResult,
  type PeriodMode,
} from "@/lib/payments";
import {
  canRefund,
  canWriteOff,
  savedPaymentDetails,
} from "@/lib/payments-ledger";
import { FREE_WORD, groupPriceHref, priceLabelOf, priceOfRow, priceSourceTag, pricesBaseOf } from "@/lib/group-price";
import { DEBTORS_GROUP_NOTE } from "@/lib/payments-income-v2";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { markReceiptNavigation } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { ScrollHint } from "@/components/ui/scroll-hint";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { BalanceNote } from "./balance-note";
import { PaymentDialog, type PaymentFormKind } from "./payment-dialog";
import { PaymentVoidModal } from "./payment-void-modal";
import { RefundDialog, REFUND_ACTION_LABEL } from "./refund-dialog";
import { WriteoffDialog, WRITEOFF_ACTION_LABEL } from "./writeoff-dialog";

const PAGE_SIZE = 50;

/** Column templates of the wide layout (cards below `xl`). */
const GRID_DEFAULT = "xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_136px_minmax(0,1.4fr)_132px_156px] xl:items-center xl:gap-x-4";

const EMPTY_TEXT: Record<PaymentBucket, string> = {
  debt: "Должников нет",
  expiring: "Скоро платить пока никому",
  active: "Оплаченных учеников пока нет",
  paused: "Сейчас никто не на паузе",
};

interface FormState {
  kind: PaymentFormKind;
  row: MembershipPaymentRow;
  payment: PaymentOut | null;
}

function PaymentsPageContent({ studentProfileBasePath, groupsBasePath }: { studentProfileBasePath: string; groupsBasePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucket = parseBucket(searchParams?.get("bucket"));

  const available = usePaymentsSummary((state) => state.available);
  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  const debtors = usePaymentsSummary((state) => state.debtors);
  const buckets = usePaymentsSummary((state) => state.buckets);
  const pausedCount = usePaymentsSummary((state) => state.paused);
  const studentsPaused = usePaymentsSummary((state) => state.studentsPaused);
  const studentsWithDebt = usePaymentsSummary((state) => state.studentsWithDebt);
  const studentsWithAdvance = usePaymentsSummary((state) => state.studentsWithAdvance);
  const priceMissing = usePaymentsSummary((state) => state.priceMissing);
  const expiring = usePaymentsSummary((state) => state.expiring);
  const activeCount = usePaymentsSummary((state) => state.active);
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const debtTotal = usePaymentsSummary((state) => state.debtTotal);
  const advanceTotal = usePaymentsSummary((state) => state.advanceTotal);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);

  const { showToast, toastNode } = useToast();

  const [items, setItems] = useState<MembershipPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // A link from «Поступления» («Группы — собираемость», «Долг на сегодня») opens the tab narrowed to a group or a teacher.
  const [filter, setFilter] = useState(() => ({ teacherId: searchParams?.get("teacher_id") ?? "", groupId: searchParams?.get("group_id") ?? "" }));
  const [teachers, setTeachers] = useState<Array<{ id: string; first_name: string; last_name: string; full_name?: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; teacher_id: string }>>([]);

  const [form, setForm] = useState<FormState | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ payment: PaymentOut; studentName: string } | null>(null);
  const [writeoffRow, setWriteoffRow] = useState<MembershipPaymentRow | null>(null);
  const [refundRow, setRefundRow] = useState<MembershipPaymentRow | null>(null);
  const paymentsBase = paymentsBaseOf(groupsBasePath);

  const requests = useRef(createRequestSequence());
  const tabsRef = useRef<HTMLDivElement | null>(null);

  // The open tab is brought into view in the sideways-scrolling tab bar of a phone (a link to the 4th tab opens scrolled to it).
  useEffect(() => {
    const list = tabsRef.current?.querySelector<HTMLElement>(".scroll-hint");
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const start = tab.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    list.scrollLeft = Math.max(0, start - (list.clientWidth - tab.offsetWidth) / 2);
    // the counters widen the labels once the summary has arrived
  }, [bucket, summaryLoaded]);

  // The summary is also read by the layout; this keeps the page's own numbers fresh on entry.
  useEffect(() => { void refreshSummary(true); }, [refreshSummary]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Teacher -> group directory for the cascading filter; without it the list still works.
  useEffect(() => {
    let cancelled = false;
    Promise.all([orgApi.listMembers(), orgApi.listGroups()])
      .then(([members, groupList]) => {
        if (cancelled) return;
        setTeachers(
          (Array.isArray(members) ? members : [])
            .filter((m: any) => m.org_role === "teacher")
            .map((m: any) => ({
              id: m.user_id || m.id,
              first_name: m.first_name ?? "",
              last_name: m.last_name ?? "",
              full_name: m.full_name,
            })),
        );
        const list: any[] = Array.isArray(groupList) ? groupList : (groupList as any)?.items || [];
        setGroups(list.map((g) => ({ id: g.id, name: g.name, teacher_id: g.teacher_id })));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await orgApi.getPaymentsStatus({
        bucket,
        groupId: filter.groupId || undefined,
        teacherId: filter.groupId ? undefined : filter.teacherId || undefined,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (!requests.current.isCurrent(token)) return;
      // The last row of a later page was handled: step back instead of showing an empty page.
      if ((data.items || []).length === 0 && page > 0) {
        setPage(Math.min(page - 1, Math.max(0, Math.ceil((data.total ?? 0) / PAGE_SIZE) - 1)));
        return;
      }
      setItems(data.items || []);
      setTotal(data.total ?? 0);
    } catch (error) {
      if (!requests.current.isCurrent(token)) return;
      const status = (error as { status?: number } | null)?.status;
      if (status === 403 || status === 404) setDenied(true);
      else setLoadError(error instanceof Error ? error.message : "Не удалось загрузить список");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [bucket, debouncedSearch, filter.groupId, filter.teacherId, page]);

  useEffect(() => { void load(); }, [load]);

  const switchBucket = (next: PaymentBucket) => {
    setPage(0);
    const params = new URLSearchParams({ bucket: next });
    if (filter.groupId) params.set("group_id", filter.groupId);
    else if (filter.teacherId) params.set("teacher_id", filter.teacherId);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  /** A change of payments: the visible list and the shared numbers are re-read. */
  const afterChange = useCallback(() => {
    void load(true);
    void refreshSummary(true);
  }, [load, refreshSummary]);

  const onSaved = (result: PaymentSaveResult) => {
    showToast(PAYMENT_SAVED_TEXT[form?.kind ?? "create"], "success", savedPaymentDetails(result.allocation));
    afterChange();
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(debouncedSearch || filter.teacherId || filter.groupId);

  if (denied || (summaryLoaded && !available)) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
        <Wallet className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Раздел «Оплаты» недоступен</p>
        <p className="text-xs text-slate-400">Доступ даёт владелец центра в настройках.</p>
      </div>
    );
  }

  // Every tab carries its number; none is shown while the summary is not known yet.
  const summaryForTabs = summaryLoaded ? { buckets, debtors, students_with_debt: studentsWithDebt, expiring, active: activeCount, paused: pausedCount, students_paused: studentsPaused } : null;
  const cards = positionCards({ debt_total: debtTotal, advance_total: advanceTotal, debtors, students_with_debt: studentsWithDebt, students_with_advance: studentsWithAdvance });
  const noPrice = summaryLoaded ? priceMissingText(priceMissing) : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Оплаты</h1>
          <p className="text-sm text-slate-500">Кто из учеников оплатил занятия, сколько должен и когда оплата заканчивается</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={incomeHref(paymentsBase)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <TrendingUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Поступления
          </Link>
          <Link
            href={pricesBaseOf(groupsBasePath)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Tags className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Цены групп
          </Link>
        </div>
      </div>

      {/* The position of the centre: two cards before the tabs; a click opens «Поступления» with the breakdown (as before). */}
      {summaryLoaded && (
        <section aria-label="Долг и аванс учеников" data-testid="payments-position" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.key}
              href={`${incomeHref(paymentsBase)}#position`}
              data-testid={`position-${card.key}`}
              className="group rounded-2xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-300 hover:bg-slate-50/60"
            >
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${card.tone === "debt" ? "text-rose-700" : card.tone === "advance" ? "text-emerald-700" : "text-slate-400"}`}>{card.amount}</p>
              {card.sub && <p className="mt-0.5 text-sm text-slate-500 group-hover:text-slate-700">{card.sub}</p>}
            </Link>
          ))}
        </section>
      )}

      {/* One row from 2xl (1536 px): tabs on the left, search and filter on the right.  Below it the toolbar sits under the
          tabs: with the menu open a laptop (1280-1440) has no room for both, and the tabs must stay whole. */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        {/* On a phone the tabs scroll sideways; the edge that hides a tab fades out (ScrollHint) */}
        <div ref={tabsRef} className="min-w-0 xl:w-fit">
          <ScrollHint focusable={false} className="w-full overflow-x-auto rounded-xl bg-slate-100 p-1">
            {/* the role sits one level below the scroller: ScrollHint owns the attributes of its own box */}
            <div role="tablist" className="flex w-max min-w-full gap-1">
              {visibleBuckets(summaryForTabs, bucket).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={bucket === key}
                  onClick={() => switchBucket(key)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                    bucket === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {bucketTabLabel(label, bucketCount(summaryForTabs, key))}
                </button>
              ))}
            </div>
          </ScrollHint>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm 2xl:w-64 2xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя или ID ученика"
              aria-label="Поиск по имени или ID ученика"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
            />
          </div>
          <CascadingFilter
            teachers={teachers}
            groups={groups}
            value={filter}
            onChange={(value) => { setFilter(value); setPage(0); }}
          />
        </div>
      </div>

      {bucket === "debt" && filter.groupId && (
        <p role="note" className="-mt-2 text-sm text-slate-500" data-testid="debt-group-note">{DEBTORS_GROUP_NOTE}</p>
      )}

      {noPrice && (
        <p role="status" className="-mt-2 text-sm text-amber-800" data-testid="payments-price-missing">
          {noPrice} — <Link href={pricesBaseOf(groupsBasePath)} className="font-semibold text-primary-700 hover:underline">Задать</Link>
        </p>
      )}

      {/* List */}
      {loading ? (
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
      ) : items.length === 0 ? (
        <p className="py-14 text-center text-sm text-slate-400">{filtered ? "Ничего не найдено" : EMPTY_TEXT[bucket]}</p>
      ) : (
        <section className="xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white">
          <div className={`hidden border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[13px] font-semibold text-slate-500 ${GRID_DEFAULT}`}>
            <span>Ученик</span>
            <span className="text-center">Группа</span>
            <span className="text-center">{priceLabelOf(periodMode)}</span>
            <span className="text-center">Статус</span>
            <span className="text-center">Последняя оплата</span>
            <span className="text-right"><span className="sr-only">Действия</span></span>
          </div>
          <ul className="space-y-2.5 xl:space-y-0 xl:divide-y xl:divide-slate-100">
            {items.map((row) => (
              <PaymentRow
                key={row.membership_id}
                row={row}
                bucket={bucket}
                periodMode={periodMode}
                paymentsBase={paymentsBase}
                studentProfileBasePath={studentProfileBasePath}
                groupsBasePath={groupsBasePath}
                onWriteoff={() => setWriteoffRow(row)}
                onRefund={() => setRefundRow(row)}
                onPay={() => setForm({ kind: "create", row, payment: null })}
                onCorrect={(payment) => setForm({ kind: "replace", row, payment })}
                onVoid={(payment) => setVoidTarget({ payment, studentName: row.student_name })}
              />
            ))}
          </ul>
        </section>
      )}

      {!loading && !loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Всего: {total}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Предыдущая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span>{page + 1} из {pageCount}</span>
            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Следующая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <PaymentDialog
        open={form !== null}
        kind={form?.kind ?? "create"}
        membership={form ? {
          membership_id: form.row.membership_id,
          group_id: form.row.group_id,
          student_name: form.row.student_name,
          group_name: form.row.group_name,
        } : null}
        payment={form?.payment ?? null}
        groupsBasePath={groupsBasePath}
        onClose={() => setForm(null)}
        onSaved={onSaved}
        onDuplicate={() => { showToast("Эта оплата уже внесена"); afterChange(); }}
      />
      <PaymentVoidModal
        payment={voidTarget?.payment ?? null}
        studentName={voidTarget?.studentName}
        onClose={() => setVoidTarget(null)}
        onVoided={() => { showToast("Оплата отменена"); afterChange(); }}
      />
      <WriteoffDialog
        row={writeoffRow}
        studentName={writeoffRow?.student_name ?? ""}
        onClose={() => setWriteoffRow(null)}
        onDone={(result) => { showToast("Долг прощён", "success", [`Долг был ${formatMoney(result.debt_before)}, стал ${formatMoney(result.debt_after)}`]); afterChange(); }}
      />
      <RefundDialog
        row={refundRow}
        studentName={refundRow?.student_name ?? ""}
        onClose={() => setRefundRow(null)}
        onDone={(result) => { showToast("Аванс возвращён", "success", [`Возвращено ${formatMoney(result.refund.amount)}`]); afterChange(); }}
      />

      {toastNode}
    </div>
  );
}

function PaymentRow({
  row, bucket, periodMode, paymentsBase, studentProfileBasePath, groupsBasePath, onPay, onCorrect, onVoid, onWriteoff, onRefund,
}: {
  row: MembershipPaymentRow;
  bucket: PaymentBucket;
  periodMode: PeriodMode;
  /** `/owner/payments` or `/admin/payments`: where the statement of a student lives. */
  paymentsBase: string;
  studentProfileBasePath: string;
  groupsBasePath: string;
  onPay: () => void;
  onCorrect: (payment: PaymentOut) => void;
  onVoid: (payment: PaymentOut) => void;
  onWriteoff: () => void;
  onRefund: () => void;
}) {
  const router = useRouter();
  const chip = moneyChip(row);
  const tone = STATUS_TONE_CLASS[chip.tone];
  const detail = statusDetail(row);
  const reason = bucket === "debt" ? debtReasonText(row) : "";
  const last = row.last_payment && !row.last_payment.voided_at ? row.last_payment : null;
  const price = priceOfRow(row);
  const tag = priceSourceTag(price);

  const menu: RowMenuItem[] = [];
  if (last) {
    // A carry-over cannot be corrected (correct the payment it came from); cancelling it stays possible.
    if (!isCarryOver(last)) menu.push({ key: "correct", label: "Исправить последнюю оплату", icon: Pencil, onSelect: () => onCorrect(last) });
    menu.push({ key: "void", label: "Отменить последнюю оплату", icon: XCircle, danger: true, onSelect: () => onVoid(last) });
  }

  menu.push({ key: "statement", label: "Выписка", icon: FileText, onSelect: () => { markReceiptNavigation(row.membership_id); router.push(statementHref(paymentsBase, row.membership_id)); } });
  if (canWriteOff(row)) menu.push({ key: "writeoff", label: WRITEOFF_ACTION_LABEL, icon: Eraser, onSelect: onWriteoff });
  if (canRefund(row)) menu.push({ key: "refund", label: REFUND_ACTION_LABEL, icon: Undo2, onSelect: onRefund });
  const openProfile = () => router.push(`${studentProfileBasePath}/${row.student_id}`);
  menu.push({ key: "profile", label: "Карточка ученика", icon: UserRound, onSelect: openProfile });

  const student = (
    <div className="min-w-0">
      <Link href={`${studentProfileBasePath}/${row.student_id}`} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700 xl:truncate" title="Открыть карточку ученика">
        {row.student_name}
      </Link>
      <p className="truncate text-xs text-slate-500">
        {[row.display_id, row.class_level ? `${row.class_level} класс` : ""].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
  const group = (
    <div className="min-w-0 xl:text-center">
      <p className="break-words text-sm text-slate-800 xl:truncate" title={row.group_name}>{row.group_name}</p>
      <p className="truncate text-xs text-slate-500">{row.teacher_name || "—"}</p>
    </div>
  );

  return (
    <li className={`flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-5 xl:py-2.5 ${GRID_DEFAULT}`}>
      {student}
      {group}

          <div className="flex items-baseline justify-between gap-3 text-sm xl:block xl:text-center">
            <span className="text-xs text-slate-400 xl:hidden">{priceLabelOf(periodMode)}</span>
            {price.amount === null || price.amount === undefined ? (
              <Link href={groupPriceHref(groupsBasePath, row.group_id)} className="text-xs font-medium text-amber-800 hover:underline" title="Открыть группу и задать цену">
                цена группы не задана
              </Link>
            ) : (
              <span className="text-right xl:text-center">
                <span className="font-medium tabular-nums text-slate-800">{price.amount === 0 ? FREE_WORD : formatMoney(price.amount)}</span>
                {tag && <span className="block text-[11px] text-primary-700" title={price.reason ?? undefined}>{tag}</span>}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 xl:block xl:text-center">
            <span className={`inline-block max-w-full rounded-md border px-2 py-0.5 text-xs font-medium leading-4 ${tone}`}>{chip.label}</span>
            {bucket === "debt" && reason && reason !== chip.label && <p className="w-full text-xs font-medium text-rose-700" data-testid="debt-reason">{reason}</p>}
            {detail && <p className="text-xs text-slate-500">{detail}</p>}
            <BalanceNote row={row} className="w-full" />
          </div>

          {/* Последняя оплата: the amount reads like «Оплата в месяц», the date is the quiet line under it (like «оплачено до») */}
          <div className="flex items-baseline justify-between gap-3 text-sm xl:block xl:text-center">
            <span className="shrink-0 text-xs text-slate-400 xl:hidden">Последняя оплата</span>
            {last ? (
              <span className="text-right tabular-nums xl:text-center" title={lastPaymentLabel(last)}>
                <span className="block font-medium text-slate-800">{paymentAmountLabel(last)}</span>
                <span className="block whitespace-nowrap text-xs text-slate-500">{isCarryOver(last) ? "перенесено" : "внесено"} {formatDateRu(last.paid_on)}</span>
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>

          <div className="mt-1 flex items-center justify-end gap-1.5 xl:mt-0">
            <PayButton row={row} onPay={onPay} />
            <RowMenu items={menu} label={`Действия: ${row.student_name}`} />
          </div>
    </li>
  );
}

function PayButton({ row, onPay }: { row: MembershipPaymentRow; onPay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPay}
      className="flex-1 whitespace-nowrap rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-center text-xs font-semibold text-primary-700 hover:bg-primary-50 xl:flex-none"
    >
      {PAY_ACTION_LABEL}
    </button>
  );
}

/**
 * «Оплаты»: who has paid and until when, for every student × group. Shared by /owner/payments and /admin/payments.
 * `groupsBasePath`: where the groups live - «цена группы не задана» links to the price of the group.
 */
export function PaymentsPage(props: { studentProfileBasePath: string; groupsBasePath: string }) {
  return (
    <Suspense
      fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}
    >
      <PaymentsPageContent {...props} />
    </Suspense>
  );
}
