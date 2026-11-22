"use client";

import { type CSSProperties, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Eraser, Loader2, Pencil, Plus, Search, Tags, TrendingUp, Undo2, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  bucketCount,
  bucketTabLabel,
  type TabCounts,
  formatMoney,
  incomeHref,
  isCarryOver,
  visibleBuckets,
  parseBucket,
  paymentsBaseOf,
  parsePaymentsListQuery,
  paymentsListQueryString,
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  payDueTermText,
  positionCards,
  priceMissingText,
  statementHref,
  type MembershipPaymentRow,
  type PaymentBucket,
  type PaymentOut,
  type PaymentSaveResult,
  refundDoneText,
  writeoffDoneText,
  refundReceiptHref,
} from "@/lib/payments";
import { payLabel } from "@/lib/pay-state";
import { ADVANCE_EMPTY, advanceLeftOf, isClosedRow, rowActionsOf } from "@/lib/paytails";
import { PHONE_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { serverEffectsRows, studentToast } from "@/lib/money-effects";
import {
  canWriteOff,
  savedPaymentToastDetails,
} from "@/lib/payments-ledger";
import { pricesBaseOf } from "@/lib/group-price";
import { DEBTORS_GROUP_NOTE, debtorsHref } from "@/lib/payments-income-v2";
import { groupHref, studentHref } from "@/lib/ia-links";
import { useMoneyDenied, usePaymentsSummary } from "@/lib/payments-summary";
import { formatBusinessDate } from "@/lib/business-time";
import { markReceiptNavigation } from "@/lib/receipt-nav";
import { PackageProgress } from "./package-progress";
import { MoneyRow } from "./money-row";
import { DebtAgeSheet } from "./debt-age-sheet";
import { DebtAgeStrip } from "./debt-age-strip";
import { type DebtAge } from "@/lib/debt-ages";
import { createRequestSequence } from "@/lib/request-sequence";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { ScrollHint } from "@/components/ui/scroll-hint";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { Chip } from "@/components/ui/chip";
import { DataCell, DataRow, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Words } from "@/components/ui/words";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/radio";
import { PaymentDialog, type PaymentFormKind } from "./payment-dialog";
import { PaymentVoidModal } from "./payment-void-modal";
import { RefundDialog, REFUND_ACTION_LABEL } from "./refund-dialog";
import { WriteoffDialog, WRITEOFF_ACTION_LABEL } from "./writeoff-dialog";
import { OpeningsBanner, OpeningsHeaderLink } from "./openings-widgets";
import { MoneyAccessDenied } from "@/components/payments/money-access-denied";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;
/** The tone of the big sum of a card: red - the debt, green - the advance, the rest plain. */
const AMOUNT_TONE = { debt: "text-rose-700", advance: "text-emerald-700", due: "text-slate-900", none: "text-slate-900" } as const;
/** The «⋯» of a row: 40 px in a card (R3 №13), compact in the table. */
const ROW_MENU_TRIGGER = "dt-ctl flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50";

/** The columns of the list (DataTable): names and groups are text, LEFT and wide (they wrap, they are not cut); the action column is right.  No column of the price and no column of the last payment (a «—» in every row; the last payment is in the statement and in the «⋯» menu) (PAY-DUE 9.7: it is in the statement and on the page of the group). */
const PAYMENT_COLUMNS: DataColumn[] = [
  { key: "student", header: "Ученик", width: "minmax(8rem,3fr)" },
  { key: "group", header: "Группа", width: "minmax(5.5rem,2fr)" },
  { key: "status", header: "Статус", width: "max-content" },
  { key: "actions", header: "", align: "end", width: "max-content", actions: true },
];

const EMPTY_TEXT: Record<PaymentBucket, string> = {
  debtors: "Должников нет",
  to_pay: "К оплате никого нет",
  expiring: "Сейчас ни у кого оплата не заканчивается",
  active: "Учеников без долга пока нет",
  advance: ADVANCE_EMPTY.title,
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

  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  // no right to money (the profile says so, or the summary was refused): the page asks the server for nothing - no 403 in the console
  const noRight = useMoneyDenied();
  const summaryTabs = usePaymentsSummary((state) => state.tabs);
  const studentsPaused = usePaymentsSummary((state) => state.studentsPaused);
  const debtors = usePaymentsSummary((state) => state.debtors);
  const debtTotal = usePaymentsSummary((state) => state.debtTotal);
  const dueTotal = usePaymentsSummary((state) => state.dueTotal);
  const dueStudents = usePaymentsSummary((state) => state.dueStudents);
  const dueNearest = usePaymentsSummary((state) => state.dueNearest);
  const payDueDays = usePaymentsSummary((state) => state.payDueDays);
  const payDueLessons = usePaymentsSummary((state) => state.payDueLessons);
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const studentsWithAdvance = usePaymentsSummary((state) => state.studentsWithAdvance);
  const priceMissing = usePaymentsSummary((state) => state.priceMissing);
  const advanceTotal = usePaymentsSummary((state) => state.advanceTotal);
  const advanceText = usePaymentsSummary((state) => state.advanceText);
  const advanceLeftStudents = usePaymentsSummary((state) => state.advanceLeftStudents);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  // the owner leads to the setting of the term, the administrator (with the right to money) only reads it
  const isOwner = paymentsBaseOf(groupsBasePath).startsWith("/owner");

  const { showToast, toastNode } = useToast();

  const [items, setItems] = useState<MembershipPaymentRow[]>([]);
    const [total, setTotal] = useState(0);
  const urlState = parsePaymentsListQuery(searchParams);
  const [page, setPage] = useState(urlState.page);
  // Money-2 Т18: the basket of the age of the debt («Должники» only)
  const [age, setAge] = useState<DebtAge | "">(urlState.age);
  // PAY-TAILS Б2.1: «Ушедшие» of the tab «Аванс» (the closed memberships only) and the number of them the server named for the filter
  const [leftOnly, setLeftOnly] = useState(urlState.leftOnly);
  const [leftStudentsPage, setLeftStudentsPage] = useState<number | null>(null);
  const phone = useMediaQuery(PHONE_QUERY);
  const debtAges = usePaymentsSummary((state) => state.debtAges);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const [search, setSearch] = useState(urlState.q);
  const [debouncedSearch, setDebouncedSearch] = useState(urlState.q.trim());
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
  }, [bucket, summaryLoaded, summaryTabs]);

  // The summary is also read by the layout; this keeps the page's own numbers fresh on entry.
  useEffect(() => { void refreshSummary(true); }, [refreshSummary]);

  // IA audit F34: the tab, the filter, the search and the page are written to the address (the tab itself comes from it)
  const currentQuery = searchParams?.toString() ?? "";
  useEffect(() => {
    const next = paymentsListQueryString({ bucket, groupId: filter.groupId, teacherId: filter.teacherId, q: debouncedSearch, page, age, leftOnly });
    if (next.slice(1) !== currentQuery) router.replace(next, { scroll: false });
    // `currentQuery` follows from this write; only a change of the page's own state writes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, filter.groupId, filter.teacherId, debouncedSearch, page, age, leftOnly]);

  useEffect(() => {
    if (search.trim() === debouncedSearch) return undefined;
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (noRight) { setLoading(false); return; }
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await orgApi.getPaymentsStatus({
        bucket,
        groupId: filter.groupId || undefined,
        teacherId: filter.groupId ? undefined : filter.teacherId || undefined,
        search: debouncedSearch || undefined,
        age: age || undefined,
        leftOnly: bucket === "advance" && leftOnly ? true : undefined,
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
      setLeftStudentsPage(bucket === "advance" ? advanceLeftOf(data) : null);
    } catch (error) {
      if (!requests.current.isCurrent(token)) return;
      const status = (error as { status?: number } | null)?.status;
      if (status === 403 || status === 404) setDenied(true);
      else setLoadError(error instanceof Error ? error.message : "Не удалось загрузить список");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [bucket, debouncedSearch, filter.groupId, filter.teacherId, page, age, leftOnly, noRight]);

  useEffect(() => { void load(); }, [load]);

  // The tab counts follow the group / teacher the list is narrowed to (the centre's summary has no filter): each tab asks the server for ONE row and reads its `students` - the screen counts nothing itself.
  const narrowed = Boolean(filter.groupId || filter.teacherId);
  const [narrowedCounts, setNarrowedCounts] = useState<TabCounts | null>(null);
  const countsRequests = useRef(createRequestSequence());
  const loadNarrowedCounts = useCallback(async () => {
    if (!narrowed || noRight) { countsRequests.current.next(); setNarrowedCounts(null); return; }
    const token = countsRequests.current.next();
    const scope = { groupId: filter.groupId || undefined, teacherId: filter.groupId ? undefined : filter.teacherId || undefined, limit: 1, offset: 0 };
    try {
      const keys: PaymentBucket[] = ["debtors", "to_pay", "expiring", "active", "advance", "paused"];
      const pages = await Promise.all(keys.map((key) => orgApi.getPaymentsStatus({ bucket: key, ...scope })));
      const read = (index: number) => (typeof pages[index]?.students === "number" ? (pages[index].students as number) : null);
      if (countsRequests.current.isCurrent(token)) setNarrowedCounts({ debtors: read(0), to_pay: read(1), expiring: read(2), active: read(3), advance: read(4), paused: read(5) });
    } catch {
      // a failed count leaves the tabs without numbers (never the centre's): the list itself has its own error line
      if (countsRequests.current.isCurrent(token)) setNarrowedCounts(null);
    }
  }, [narrowed, noRight, filter.groupId, filter.teacherId]);
  useEffect(() => {
    setNarrowedCounts(null);
    void loadNarrowedCounts();
    return () => { countsRequests.current.next(); };
  }, [loadNarrowedCounts]);

  const switchBucket = (next: PaymentBucket) => {
    setPage(0);
    setLeftOnly(false);
    const params = new URLSearchParams({ bucket: next });
    if (filter.groupId) params.set("group_id", filter.groupId);
    else if (filter.teacherId) params.set("teacher_id", filter.teacherId);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // PAY-DUE 4.7: after midnight of Tashkent the names of the sums change («К оплате» → «Долг») - a return to the tab re-reads the list and the numbers
  const readDay = useRef(formatBusinessDate());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const today = formatBusinessDate();
      if (today === readDay.current) return;
      readDay.current = today;
      void load(true);
      void loadNarrowedCounts();
      void refreshSummary(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, loadNarrowedCounts, refreshSummary]);

  /** A change of payments: the visible list and the shared numbers are re-read. */
  const afterChange = useCallback(() => {
    void load(true);
    void loadNarrowedCounts();
    void refreshSummary(true);
  }, [load, loadNarrowedCounts, refreshSummary]);

  const onSaved = (result: PaymentSaveResult) => {
    const note = studentToast(savedPaymentToastDetails(form?.kind ?? "create", result));
    showToast(PAYMENT_SAVED_TEXT[form?.kind ?? "create"], note.tone, note.details);
    afterChange();
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(debouncedSearch || filter.teacherId || filter.groupId || age);

  if (denied || noRight) {
    return <MoneyAccessDenied />;
  }

  // Every tab carries its number - STUDENTS, the server's: the centre's from the summary, a narrowed list's from the pages of `status`; none while it is not known.
  const tabCounts: TabCounts | null = narrowed ? narrowedCounts : summaryLoaded ? summaryTabs : null;
  const cards = positionCards({ debt_total: debtTotal, debtors, due_total: dueTotal, due_students: dueStudents, due_nearest: dueNearest, advance_total: advanceTotal, students_with_advance: studentsWithAdvance, advance_text: advanceText });
  const noPrice = summaryLoaded ? priceMissingText(priceMissing) : null;
  // «Ушедшие» of the tab «Аванс»: the server's number for the filter on the screen; the centre's from the summary while the list does not tell
  const leftCount = bucket === "advance" ? (leftStudentsPage ?? (narrowed ? null : advanceLeftStudents)) : null;
  const advanceCard = cards.find((card) => card.key === "advance");
  const cardHref = (key: "debt" | "due" | "advance") => (key === "debt" ? `${debtorsHref(paymentsBase)}#payments-list` : key === "due" ? `${paymentsBase}?bucket=to_pay#payments-list` : `${paymentsBase}?bucket=advance#payments-list`);
  // the term of the centre: the owner's link to the setting, the administrator's plain text (PAY-DUE 9.7)
  const term = payDueTermText(periodMode, payDueDays, payDueLessons);
  const termNode = (linkClass: string) => (isOwner
    ? <Link href="/owner/settings?section=payments#pay-due" className={`${linkClass} font-medium text-primary-700 hover:underline`}>{term}</Link>
    : <span className="text-slate-500">{term}</span>);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Оплаты</h1>
          <p className="text-sm text-slate-500 max-sm:hidden">Кто из учеников оплатил занятия, сколько должен и когда оплата заканчивается</p>
        </div>
        {/* a phone: the three links are ONE row that scrolls sideways (the edge that hides a link fades out), not three wrapped lines */}
        <ScrollHint focusable={false} data-allow-hscroll="" data-testid="payments-header-links" className="flex w-full items-center gap-2 overflow-x-auto sm:w-auto sm:flex-wrap sm:overflow-visible [&>a]:shrink-0 [&>a]:whitespace-nowrap">
          <Link
            href={incomeHref(paymentsBase)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 max-sm:min-h-10"
          >
            <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Поступления
          </Link>
          <Link
            href={pricesBaseOf(groupsBasePath)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 max-sm:min-h-10"
          >
            <Tags className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {/* a phone: the warning about the prices is a label of this link (frame 20), not a line of its own over the list */}
            {/* PAY-TAILS Б11.21 п.7: with the warning the phone says «Цены · 5 без цены» (frame 20б) - the whole label stands in the row, not cut at the edge */}
            <span className={noPrice ? "max-sm:hidden" : undefined}>Цены групп</span>
            {noPrice && <span className="sm:hidden">Цены</span>}
            {noPrice && <span className="sm:hidden" data-testid="payments-price-label">· {priceMissing} без цены</span>}
          </Link>
          <OpeningsHeaderLink paymentsBase={paymentsBase} />
        </ScrollHint>
      </div>

      {/* The position of the centre: three cards before the tabs (PAY-DUE 9.7).  «Долг» leads to the debtors tab of THIS page, «К оплате» to its own tab, «Аванс» to its card on «Поступления».
          In the title row of «К оплате» the term of the centre: the owner's link to the setting, the administrator's plain text.  There is NO notice above the heading: the same fact is in the card, the tab and the badge of the menu. */}
      {summaryLoaded && (
        <>
          <div className="pos-row hidden sm:block">
          <section aria-label="Долг, к оплате и аванс учеников" data-testid="payments-position" className="pos-grid grid gap-3">
            {cards.map((card) => {
              const href = cardHref(card.key);
              return (
                <div key={card.key} className="relative rounded-2xl border border-slate-200 bg-white transition-colors hover:border-slate-300">
                  <Link href={href} data-testid={`position-${card.key}`} className="group fit-card block h-full rounded-2xl px-5 py-4 hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                    <p className={`text-sm text-slate-500 ${card.key === "due" && term ? "pr-28" : ""}`}>{card.label}</p>
                    <p className={`fit-sum mt-1 font-bold leading-9 tabular-nums ${AMOUNT_TONE[card.tone]}`} style={{ "--len": card.amount.length } as CSSProperties}>{card.amount}</p>
                    {card.sub && <p className="mt-0.5 text-sm text-slate-500 group-hover:text-slate-700">{card.sub}</p>}
                  </Link>
                  {/* the term sits in the title row, on the right: the three cards keep one height and no empty bottom */}
                  {card.key === "due" && term && (
                    <p className={`absolute right-5 top-3 ${term.length > 14 ? "text-xs leading-5" : "text-sm"}`} data-testid="pay-due-term">{termNode("inline-flex min-h-6 items-center")}</p>
                  )}
                </div>
              );
            })}
          </section>
          </div>
          {/* a phone (< 640): ONE compact summary in two lines + the advance as a small third (frame 20); the first screen keeps the tabs and two rows */}
          <section aria-label="Долг, к оплате и аванс учеников" data-testid="payments-position-compact" className="rounded-2xl border border-slate-200 bg-white px-4 py-1 sm:hidden">
            {cards.filter((card) => card.key !== "advance").map((card) => (
              <div key={card.key} className="relative grid min-h-10 grid-cols-[auto_1fr_auto] items-center gap-x-3 border-b border-slate-100 py-1.5 last:border-b-0">
                {/* the whole row leads to its tab (a stretched link); the term of the centre stands under the label of «К оплате», above the link */}
                <Link href={cardHref(card.key)} data-testid={`position-${card.key}-compact`} aria-label={`${card.label} ${card.amount}${card.students ? `, ${card.students}` : ""}`} className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" />
                <span className="text-sm text-slate-500">
                  {card.label}
                  {card.key === "due" && term && <span className="relative z-10 block text-xs leading-4" data-testid="pay-due-term-compact">{termNode("inline-flex min-h-6 items-center")}</span>}
                </span>
                <span className={`min-w-0 text-right text-lg font-bold tabular-nums ${AMOUNT_TONE[card.tone]}`}>{card.amount}</span>
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-slate-500">{card.students ?? ""}</span>
              </div>
            ))}
            {advanceCard && (
              <p className="flex flex-wrap items-center gap-x-3 border-t border-slate-100 py-2 text-xs text-slate-500">
                <Link href={cardHref("advance")} data-testid="position-advance-compact" className="inline-flex min-h-6 items-center tabular-nums">Аванс {advanceCard.amount}{advanceCard.students ? ` · ${advanceCard.students} уч.` : ""}</Link>
              </p>
            )}
          </section>
        </>
      )}

      {/* One row from 2xl (1536 px): tabs on the left, search and filter on the right.  Below it the toolbar sits under the
          tabs: with the menu open a laptop (1280-1440) has no room for both, and the tabs must stay whole. */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        {/* On a phone the tabs scroll sideways; the edge that hides a tab fades out (ScrollHint) */}
        <div ref={tabsRef} className="min-w-0 xl:w-fit">
          <ScrollHint focusable={false} data-allow-hscroll="" className="w-full overflow-x-auto rounded-xl bg-slate-100 p-1">
            {/* the role sits one level below the scroller: ScrollHint owns the attributes of its own box */}
            <div role="tablist" className="flex w-max min-w-full gap-1">
              {visibleBuckets({ students_paused: tabCounts?.paused ?? studentsPaused }, bucket).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={bucket === key}
                  onClick={() => switchBucket(key)}
                  className={`max-sm:min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                    bucket === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {bucketTabLabel(label, bucketCount(tabCounts, key))}
                </button>
              ))}
            </div>
          </ScrollHint>
        </div>
        <div className="flex items-center gap-2 sm:flex-wrap">
          <div className="relative min-w-0 flex-1 sm:min-w-[200px] sm:max-w-sm 2xl:w-64 2xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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
            iconOnPhone
          />
          {/* a phone: the age of the debt is ONE button in this row, the choice is a bottom sheet (PAY-TAILS Б2.8) */}
          {bucket === "debtors" && !narrowed && phone && <DebtAgeSheet baskets={debtAges} total={{ students: debtors ?? 0 }} active={age} onChange={(next) => { setAge(next); setPage(0); }} />}
        </div>
      </div>

      {/* PAY-TAILS Б2.1 (frame 1): «Все N · Ушедшие M» - only while somebody of the advance has left (the numbers are the server's) */}
      {bucket === "advance" && leftCount !== null && leftCount > 0 && (
        <SegmentedControl
          value={leftOnly ? "left" : "all"}
          onChange={(next) => { setLeftOnly(next === "left"); setPage(0); }}
          ariaLabel="Кого показать"
          testId="advance-left-toggle"
          className="inline-grid w-fit grid-flow-col auto-cols-max" buttonClassName="px-3.5 text-sm font-medium"
          options={[
            { value: "all", label: bucketTabLabel("Все", bucketCount(tabCounts, "advance")) },
            { value: "left", label: bucketTabLabel("Ушедшие", leftCount) },
          ]}
        />
      )}
      {bucket === "debtors" && !phone && <OpeningsBanner paymentsBase={paymentsBase} />}
      {bucket === "debtors" && !narrowed && !phone && <DebtAgeStrip baskets={debtAges} total={{ students: debtors ?? 0 }} active={age} onChange={(next) => { setAge(next); setPage(0); }} />}
      {bucket === "debtors" && filter.groupId && (
        <p role="note" className="-mt-2 text-sm text-slate-500" data-testid="debt-group-note">{DEBTORS_GROUP_NOTE}</p>
      )}

      {noPrice && bucket !== "advance" && (
        <p role="status" className="-mt-2 text-sm text-amber-800 max-sm:hidden" data-testid="payments-price-missing">
          {noPrice} — <Link href={pricesBaseOf(groupsBasePath)} className="font-semibold text-primary-700 hover:underline">Задать</Link>
        </p>
      )}

      {/* List */}
      <div id="payments-list" className="!mt-0 h-0 scroll-mt-20" />
      {loading ? (
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
      ) : items.length === 0 ? (
        bucket === "advance" && !filtered && !leftOnly
          ? <EmptyState variant="card" title={ADVANCE_EMPTY.title} hint={ADVANCE_EMPTY.sub} testId="advance-empty" />
          : <p className="py-14 text-center text-sm text-slate-500">{filtered ? "Ничего не найдено" : EMPTY_TEXT[bucket]}</p>
      ) : phone ? (
        <ul role="list" aria-label="Оплаты учеников" data-testid="payments-phone-list" className="space-y-2">
          {items.map((row) => {
            const label = payLabel(row, bucket);
            const acts = rowActionsOf(row);
            const action = acts.pay && !(bucket === "advance" && !isClosedRow(row))
              ? { label: "Внести", ariaLabel: `${PAY_ACTION_LABEL}: ${row.student_name}`, onClick: () => setForm({ kind: "create", row, payment: null }), testId: "payment-row-pay" }
              : acts.refund
                ? { label: REFUND_ACTION_LABEL, ariaLabel: `${REFUND_ACTION_LABEL}: ${row.student_name}`, onClick: () => setRefundRow(row), testId: "payment-row-refund" }
                : null;
            return (
              <MoneyRow
                key={row.membership_id}
                name={row.student_name}
                statementHref={statementHref(paymentsBase, row.membership_id)}
                onOpenStatement={() => markReceiptNavigation(row.membership_id)}
                label={label.text}
                tone={label.tone}
                sub={label.sub}
                group={row.group_name}
                second={label.second}
                action={action}
              />
            );
          })}
        </ul>
      ) : (
        <DataTable columns={PAYMENT_COLUMNS} minWidth={760} gap="1.5rem" lowBelow={1100} testId="payments-table">
          {items.map((row) => (
            <PaymentRow
              key={row.membership_id}
              row={row}
              bucket={bucket}
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
        </DataTable>
      )}

      {!loading && !loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Всего: {total}</span>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Предыдущая страница" variant="secondary" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
            <span>{page + 1} из {pageCount}</span>
            <Button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Следующая страница" variant="secondary" size="icon"><ChevronRight className="h-4 w-4" /></Button>
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
        onDuplicate={(notice) => { showToast(notice.text, notice.tone); afterChange(); }}
        onStale={afterChange}
      />
      <PaymentVoidModal
        payment={voidTarget?.payment ?? null}
        studentName={voidTarget?.studentName}
        onClose={() => setVoidTarget(null)}
        onVoided={(result) => { const note = studentToast(serverEffectsRows(result)); showToast("Оплата отменена", note.tone, note.details); afterChange(); }}
        onStale={afterChange}
      />
      <WriteoffDialog
        row={writeoffRow}
        studentName={writeoffRow?.student_name ?? ""}
        onClose={() => setWriteoffRow(null)}
        onDone={(result) => { const note = studentToast([`Было не оплачено ${formatMoney(result.unpaid_before)}, стало ${formatMoney(result.unpaid_after)}`]); showToast(writeoffDoneText(result), note.tone, note.details); afterChange(); }}
        onDuplicate={() => { showToast("Это прощение уже внесено", "success"); afterChange(); }}
      />
      <RefundDialog
        row={refundRow}
        studentName={refundRow?.student_name ?? ""}
        onClose={() => setRefundRow(null)}
        onDone={(result) => { const note = studentToast([`Возвращено ${formatMoney(result.refund.amount)}`]); showToast(refundDoneText(result.refund.receipt_no), note.tone, note.details, { label: "Квитанция", href: refundReceiptHref(paymentsBase, result.refund.id) }); afterChange(); }}
        onDuplicate={() => { showToast("Этот возврат уже внесён", "success"); afterChange(); }}
      />

      {toastNode}
    </div>
  );
}

function PaymentRow({
  row, bucket, paymentsBase, studentProfileBasePath, groupsBasePath, onPay, onCorrect, onVoid, onWriteoff, onRefund,
}: {
  row: MembershipPaymentRow;
  bucket: PaymentBucket;
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
  // PAY-DUE: the label and its words are the SERVER's (`state`, `*_text`, `*_sub`); the tab only chooses which sum leads.  Nothing from the server - nothing on the screen (LESSONS 151).
  const label = payLabel(row, bucket);
  const last = row.last_payment && !row.last_payment.voided_at ? row.last_payment : null;

  // IA audit F4 / d3: at most three items - forgive the debt OR give the advance back, correct the last payment, cancel it (danger last).
  // «Выписка» and the card of the student are links of the row (the statement icon, the name), never menu items.
  // PAY-TAILS Б2.2: the action of the row follows the STATE of the membership (`rowActionsOf`): a closed one with an advance gets «Вернуть» in the row, an open one keeps «Вернуть аванс» in the «⋯»
  const acts = rowActionsOf(row);
  // the tab «Аванс»: an OPEN student has paid ahead - «Внести оплату» is not the button of the row but an item of the «⋯» (the statement stays a link)
  const payInMenu = acts.pay && bucket === "advance" && !isClosedRow(row);
  const menu: RowMenuItem[] = [];
  if (canWriteOff(row)) menu.push({ key: "writeoff", label: WRITEOFF_ACTION_LABEL, icon: Eraser, onSelect: onWriteoff });
  if (acts.menuRefund) menu.push({ key: "refund", label: REFUND_ACTION_LABEL, icon: Undo2, onSelect: onRefund });
  if (payInMenu) menu.push({ key: "pay", label: PAY_ACTION_LABEL, icon: Plus, onSelect: onPay });
  if (last) {
    // A carry-over cannot be corrected (correct the payment it came from); cancelling it stays possible.
    if (!isCarryOver(last)) menu.push({ key: "correct", label: "Исправить последнюю оплату", icon: Pencil, onSelect: () => onCorrect(last) });
    menu.push({ key: "void", label: "Отменить последнюю оплату", icon: XCircle, danger: true, onSelect: () => onVoid(last) });
  }
  // IA audit F29: money screens lead to the «Оплаты» tab of the card (never the default one) and the group is a link
  const studentLink = studentHref(studentProfileBasePath, row.student_id, "payments");

  const classLine = [row.display_id, row.class_level ? `${row.class_level} класс` : ""].filter(Boolean).join(" · ");
  const student = (
    <div className="min-w-0">
      <Link href={studentLink} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700" title="Открыть карточку ученика">
        <Words text={row.student_name} />
      </Link>
      {/* a table: the class under the name, the group in its own column; a card: ONE muted line «7 класс · Математика 7» (the group stays a link) */}
      <p className="dt-wide-only text-xs text-slate-500">{classLine}</p>
      <p className="dt-card-only text-xs text-slate-500" data-testid="payment-row-meta">
        {classLine && <>{classLine} · </>}
        <Link href={groupHref(groupsBasePath, row.group_id, "payments")} data-testid="payment-row-group-card" className="break-words hover:text-primary-700"><Words text={row.group_name} /></Link>
      </p>
    </div>
  );
  const group = (
    <div className="min-w-0">
      <Link href={groupHref(groupsBasePath, row.group_id, "payments")} data-testid="payment-row-group" className="block break-words text-sm text-slate-800 hover:text-primary-700">
        <Words text={row.group_name} />
      </Link>
      <p className="text-xs text-slate-500">{row.teacher_name || "—"}</p>
    </div>
  );

  return (
    <DataRow>
      <DataCell col="student">{student}</DataCell>
      <DataCell col="group" className="dt-card-hidden">{group}</DataCell>
      <DataCell col="status" testId="status-cell">
        <div className="flex flex-col items-start gap-y-0.5 text-left">
          {label.text && <Chip tone={label.tone} bleed testId="pay-label">{label.text}</Chip>}
          {label.sub && <p className="w-full text-xs text-slate-600" data-testid="pay-sub">{label.sub}</p>}
          {label.second && <p className="w-full text-xs text-slate-600" data-testid="pay-second">{label.second}</p>}
          {/* a package that is paid: how many lessons are left (the bar of the package); a sum in its term / a debt already says its lessons in its own words */}
          {row.period_mode === "lessons" && (label.state === "paid" || label.state === "expiring") && <PackageProgress row={row} variant="compact" bare={Boolean(label.text)} />}
        </div>
      </DataCell>
      <DataCell col="actions">
        {acts.pay && !payInMenu && <PayButton row={row} onPay={onPay} />}
        {acts.refund && <Button type="button" onClick={onRefund} variant="secondary" size="sm" className="max-sm:flex-1" data-testid="payment-row-refund">{REFUND_ACTION_LABEL}</Button>}
        <Link
          href={statementHref(paymentsBase, row.membership_id)}
          onClick={() => markReceiptNavigation(row.membership_id)}
          aria-label={`Выписка: ${row.student_name}`}
          title="Выписка"
          data-testid="payment-row-statement"
          className="dt-ctl flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
        </Link>
        {menu.length > 0 && <RowMenu items={menu} label={`Действия: ${row.student_name}`} triggerClassName={ROW_MENU_TRIGGER} />}
      </DataCell>
    </DataRow>
  );
}

function PayButton({ row, onPay }: { row: MembershipPaymentRow; onPay: () => void }) {
  return (
    <Button
      type="button"
      onClick={onPay}
      variant="secondary" size="sm" className="max-sm:flex-1"
    >
      {PAY_ACTION_LABEL}
    </Button>
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
