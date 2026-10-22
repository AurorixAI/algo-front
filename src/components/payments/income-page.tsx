"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { saveBlobAs } from "@/lib/download";
import {
  canStepForward,
  collectionCaption,
  exportErrorText,
  exportQuery,
  focusBucket,
  incomeErrorText,
  isCurrentMonth,
  journalIsQuiet,
  journalQuery,
  methodChipLabel,
  monthOfPeriod,
  NO_FILTERS,
  overviewQuery,
  periodOf,
  periodTitle,
  rangeChipText,
  stepPeriod,
  toggleMethod,
  validatePeriod,
  incomeQueryString,
  parseIncomeQuery,
  type Bar,
  type IncomeCash,
  type IncomeFilters,
  type IncomeOverview,
  type JournalExtras,
  type JournalRange,
  type JournalRow,
  type Period,
  type PaymentsJournal,
} from "@/lib/payments-income-v2";
import { usePaymentsDirectory } from "@/lib/use-payments-directory";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { useToast } from "@/components/ui/toast";
import { CollectionTable } from "./income-collection";
import { JournalDrawer, JournalSection } from "./income-journal";
import { IncomeError, IncomeOverviewView, IncomeSkeleton } from "./income-parts";

const FIELD = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

type Tab = "journal" | "groups";

interface Loaded<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  denied: boolean;
}

const idle = <T,>(): Loaded<T> => ({ data: null, loading: true, error: null, denied: false });

/**
 * «Поступления» v2: the answer first (four cards), then the details — where the money went, the chart by
 * day, the donut «Чем платили» — and one table at a time below: the journal of payments or the groups' collection.  Every number
 * comes from the server (`/org/payments/income`, `/journal`).  Shared by /owner/payments/income and /admin/payments/income.
 */
export function IncomePage(props: { paymentsHref: string; studentProfileBasePath: string }) {
  // The page reads `?month=` / `?from=` / `?tab=` (IA audit F34), so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary-600" /></div>}>
      <IncomePageContent {...props} />
    </Suspense>
  );
}

function IncomePageContent({ paymentsHref, studentProfileBasePath }: { paymentsHref: string; studentProfileBasePath: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const available = usePaymentsSummary((state) => state.available);
  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  const noRight = summaryLoaded && !available;
  const paymentsBase = paymentsHref.replace(/\/+$/, "");

  const today = useMemo(() => formatBusinessDate(), []);
  const initial = useMemo(() => parseIncomeQuery(searchParams, formatBusinessDate()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [period, setPeriod] = useState<Period>(initial.period);
  const [filters, setFilters] = useState<IncomeFilters>(NO_FILTERS);
  const { teachers, groups } = usePaymentsDirectory();
  const periodProblem = validatePeriod(period);
  const { showToast, toastNode } = useToast();

  // ── the overview ──
  const [overview, setOverview] = useState<Loaded<IncomeOverview>>(idle);
  const overviewRequests = useRef(createRequestSequence());
  // The overview never takes the method: the donut always shows every method, the method (a click on it) narrows only the journal.
  const loadOverview = useCallback(async () => {
    const token = overviewRequests.current.next();
    setOverview((state) => ({ ...state, loading: true, error: null }));
    try {
      const data = await orgApi.getIncomeOverview(overviewQuery(period, { groupId: filters.groupId, teacherId: filters.teacherId }));
      if (!overviewRequests.current.isCurrent(token)) return;
      setOverview({ data, loading: false, error: null, denied: false });
    } catch (cause) {
      if (!overviewRequests.current.isCurrent(token)) return;
      const failure = incomeErrorText(cause);
      setOverview({ data: null, loading: false, error: failure.text, denied: failure.denied });
    }
  }, [period, filters.groupId, filters.teacherId]);

  // ── the journal ──
  const [focus, setFocus] = useState<JournalRange | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [page, setPage] = useState(1);
  const [journal, setJournal] = useState<Loaded<PaymentsJournal>>(idle);
  const journalRequests = useRef(createRequestSequence());
  const extras: JournalExtras = useMemo(() => ({ q: debouncedSearch, createdBy }), [debouncedSearch, createdBy]);
  const query = useMemo(() => journalQuery(period, focus, filters, extras, page), [period, focus, filters, extras, page]);
  const loadJournal = useCallback(async () => {
    const token = journalRequests.current.next();
    setJournal((state) => ({ ...state, loading: true, error: null }));
    try {
      const data = await orgApi.getPaymentsJournal(query);
      if (!journalRequests.current.isCurrent(token)) return;
      setJournal({ data, loading: false, error: null, denied: false });
    } catch (cause) {
      if (!journalRequests.current.isCurrent(token)) return;
      const failure = incomeErrorText(cause);
      setJournal({ data: null, loading: false, error: failure.text, denied: failure.denied });
    }
  }, [query]);

  const blocked = noRight || periodProblem !== null;
  useEffect(() => {
    if (blocked) return undefined;
    void loadOverview();
    return () => { overviewRequests.current.next(); };
  }, [blocked, loadOverview]);
  useEffect(() => {
    if (blocked) return undefined;
    void loadJournal();
    return () => { journalRequests.current.next(); };
  }, [blocked, loadJournal]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Another period or another method / group / teacher is another set of payments: the narrowing of the old one is dropped.
  const resetNarrowing = () => { setFocus(null); setPage(1); setCreatedBy(""); };
  // Another group / teacher is another donut: the method chosen on the old one is dropped with the rest.
  const changeFilters = (next: IncomeFilters) => { setFilters({ ...next, method: "" }); resetNarrowing(); };
  const changePeriod = (next: Period) => { setPeriod(next); setFilters((state) => ({ ...state, method: "" })); resetNarrowing(); };

  // ── tabs, the drawer, the chart ──
  const [requestedTab, setTab] = useState<Tab>(initial.tab);
  const collection = overview.data?.collection ?? null;
  const tab: Tab = requestedTab === "groups" && collection ? "groups" : "journal";
  // IA audit F34: the period and the tab are written to the address
  const currentQuery = searchParams?.toString() ?? "";
  useEffect(() => {
    const next = incomeQueryString(period, tab, today);
    if (next.replace(/^\?/, "") !== currentQuery.replace(/^\?/, "")) router.replace(`${pathname}${next === "?" ? "" : next}`, { scroll: false });
    // only a change of the page's own state writes; `currentQuery` follows from it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, tab]);
  const [opened, setOpened] = useState<JournalRow | null>(null);
  const journalRef = useRef<HTMLDivElement | null>(null);

  const pickBar = (bar: Bar) => {
    if (!bar.range) return;
    const same = focus?.from === bar.range.from && focus?.to === bar.range.to;
    setFocus(same ? null : bar.range);
    setPage(1);
    setTab("journal");
    if (!same) requestAnimationFrame(() => journalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // A click on a segment / a legend line of «Чем платили» narrows the journal to that method; the same one again clears it.
  const pickMethod = (method: string) => {
    const next = toggleMethod(filters.method, method);
    setFilters((state) => ({ ...state, method: next }));
    setPage(1);
    setTab("journal");
    if (next) requestAnimationFrame(() => journalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // «Сегодня наличными»: one light request for today (period=day, no filters: the till is the centre's), only on the current month.
  const cashWanted = !blocked && isCurrentMonth(period, today);
  const [cashToday, setCashToday] = useState<IncomeCash | null>(null);
  useEffect(() => {
    if (!cashWanted) return undefined;
    let live = true;
    orgApi.getIncomeOverview(overviewQuery(periodOf("day", today), { groupId: "", teacherId: "" }))
      .then((data) => { if (live) setCashToday(data.cash ?? null); })
      .catch(() => { if (live) setCashToday(null); });
    return () => { live = false; };
  }, [cashWanted, today]);

  // A link from «Оплаты» ("Долг учеников …") lands on the card of the debt.
  const landed = useRef(false);
  useEffect(() => {
    if (!overview.data || landed.current || typeof window === "undefined") return;
    landed.current = true;
    // «Оплаты» leads here from its two cards: «Долг учеников» (#position) and «Аванс» (#advance)
    const target = window.location.hash === "#position" ? "position" : window.location.hash === "#advance" ? "advance" : null;
    if (target) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [overview.data]);

  const [exporting, setExporting] = useState(false);
  const download = async () => {
    setExporting(true);
    try {
      const file = await orgApi.exportPaymentsJournal(exportQuery(query), `Оплаты ${query.from}–${query.to}.xlsx`);
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(exportErrorText(cause), "error");
    } finally {
      setExporting(false);
    }
  };

  const narrowed = debouncedSearch !== "" || createdBy !== "" || filters.method !== "" || filters.groupId !== "" || filters.teacherId !== "";
  const quietJournal = !journal.error && journalIsQuiet(journal.data, { narrowed, focusLabel: focus?.label ?? null });
  const message = noRight ? incomeErrorText({ status: 403 }).text : null;
  const showFirstLoad = overview.loading && !overview.data;
  const anyDenied = noRight || overview.denied || journal.denied;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div>
        <Link href={paymentsHref} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Оплаты
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">Поступления</h1>
      </div>

      <PeriodBar period={period} today={today} onChange={changePeriod} />
      <FiltersBar filters={filters} onChange={changeFilters} teachers={teachers} groups={groups} />
      {periodProblem && <p role="alert" className="text-sm font-medium text-rose-700">{periodProblem}</p>}

      {anyDenied ? (
        <IncomeError message={message ?? overview.error ?? journal.error ?? ""} denied />
      ) : periodProblem ? null : (
        <>
          <div className={`transition-opacity ${overview.loading && overview.data ? "opacity-60" : ""}`} aria-busy={overview.loading}>
            {showFirstLoad ? (
              <IncomeSkeleton />
            ) : overview.error ? (
              <IncomeError message={overview.error} onRetry={() => void loadOverview()} />
            ) : overview.data ? (
              <IncomeOverviewView
                overview={overview.data}
                today={today}
                paymentsBase={paymentsBase}
                scope={{ groupId: filters.groupId, teacherId: filters.teacherId }}
                activeBucket={focusBucket(focus, overview.data)}
                onPick={pickBar}
                method={filters.method}
                onPickMethod={pickMethod}
                cashToday={cashWanted ? cashToday : null}
              />
            ) : null}
          </div>

          <div ref={journalRef} className="scroll-mt-4 space-y-3">
            {collection ? (
              <div role="tablist" aria-label="Оплаты и группы" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
                {([["journal", "Оплаты"], ["groups", "Группы — собираемость"]] as Array<[Tab, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : quietJournal ? null : (
              <h2 className="text-sm font-semibold text-slate-800">Оплаты</h2>
            )}
            {tab === "groups" && collection ? (
              <CollectionTable collection={collection} paymentsBase={paymentsBase} debtToday={overview.data?.position.debt_total ?? null} caption={collectionCaption(period, today)} />
            ) : (
              <JournalSection
                journal={journal.data}
                loading={journal.loading}
                error={journal.error}
                onRetry={() => void loadJournal()}
                search={search}
                onSearch={setSearch}
                createdBy={createdBy}
                onCreatedBy={(value) => { setCreatedBy(value); setPage(1); }}
                authors={journal.data?.authors ?? []}
                focusLabel={focus?.label ?? null}
                onClearFocus={() => { setFocus(null); setPage(1); }}
                methodLabel={filters.method ? methodChipLabel(filters.method, overview.data?.by_method) : null}
                onClearMethod={() => { setFilters((state) => ({ ...state, method: "" })); setPage(1); }}
                empty={{ kind: period.kind, focusLabel: focus?.label ?? null, narrowed, year: today.slice(0, 4) }}
                onResetNarrowing={() => { setSearch(""); setDebouncedSearch(""); setCreatedBy(""); setPage(1); setFilters(NO_FILTERS); }}
                onPage={setPage}
                onExport={() => void download()}
                exporting={exporting}
                activeId={opened?.id ?? null}
                onOpen={setOpened}
              />
            )}
          </div>
        </>
      )}

      <JournalDrawer row={opened} onClose={() => setOpened(null)} paymentsBase={paymentsBase} studentProfileBasePath={studentProfileBasePath} />
      {toastNode}
    </div>
  );
}

/**
 * The month navigator «‹ Октябрь 2026 г. ›» and one secondary button «Свой период».  A custom range is a chip «12.10 – 18.10 ✕» in place
 * of the month; ✕ returns to the month.  The picker is two dates and «Показать».
 */
export function PeriodBar({ period, today, onChange }: { period: Period; today: string; onChange: (period: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const custom = period.kind === "custom";
  const draft: Period = { kind: "custom", from, to };
  const problem = open ? validatePeriod(draft) : null;
  const prev = custom ? "Предыдущий период" : "Предыдущий месяц";
  const next = custom ? "Следующий период" : "Следующий месяц";
  const openPicker = () => {
    if (open) { setOpen(false); return; }
    setFrom(period.from);
    setTo(period.to <= today ? period.to : today);
    setOpen(true);
  };
  const apply = () => {
    if (validatePeriod(draft) !== null) return;
    onChange(draft);
    setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="income-period" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(stepPeriod(period, -1))} aria-label={prev} title={prev} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        {custom ? (
          <span className="inline-flex min-w-[10rem] items-center justify-center gap-0.5 rounded-full bg-primary-50 py-1 pl-3 pr-1 text-sm font-medium tabular-nums text-primary-800" data-testid="period-chip" aria-live="polite">
            {rangeChipText(period, today)}
            <button type="button" onClick={() => onChange(monthOfPeriod(period, today))} aria-label="Вернуться к месяцу" title="Вернуться к месяцу" className="rounded-full p-1 text-primary-600 hover:bg-primary-100"><X className="h-3.5 w-3.5" aria-hidden /></button>
          </span>
        ) : (
          <span className="min-w-[10rem] px-2 text-center text-sm font-semibold text-slate-800" aria-live="polite" data-testid="period-title">{periodTitle(period)}</span>
        )}
        <button type="button" onClick={() => onChange(stepPeriod(period, 1))} disabled={!canStepForward(period, today)} aria-label={next} title={next} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
      <button type="button" onClick={openPicker} aria-expanded={open} data-testid="period-custom" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <CalendarRange className="h-4 w-4 text-slate-400" aria-hidden />
        Свой период
      </button>
      {open && (
        <div className="flex w-full flex-wrap items-center gap-1.5" data-testid="period-picker">
          <input type="date" aria-label="С какого дня" value={from} max={today} onChange={(event) => setFrom(event.target.value)} className={`${FIELD} py-2`} />
          <span className="text-slate-400" aria-hidden>—</span>
          <input type="date" aria-label="По какой день" value={to} max={today} onChange={(event) => setTo(event.target.value)} className={`${FIELD} py-2`} />
          <button type="button" onClick={apply} disabled={problem !== null} className="rounded-xl bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">Показать</button>
          {problem && <p role="alert" className="w-full text-sm font-medium text-rose-600">{problem}</p>}
        </div>
      )}
    </div>
  );
}

function FiltersBar({ filters, onChange, teachers, groups }: { filters: IncomeFilters; onChange: (filters: IncomeFilters) => void; teachers: ReturnType<typeof usePaymentsDirectory>["teachers"]; groups: ReturnType<typeof usePaymentsDirectory>["groups"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CascadingFilter
        teachers={teachers}
        groups={groups}
        value={{ teacherId: filters.teacherId, groupId: filters.groupId }}
        onChange={(value) => onChange({ ...filters, teacherId: value.teacherId, groupId: value.groupId })}
        allLabel="Все группы"
      />
    </div>
  );
}
