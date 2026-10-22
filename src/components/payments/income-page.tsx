"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { saveBlobAs } from "@/lib/download";
import { METHODS } from "@/lib/payments-ledger";
import {
  canStepForward,
  exportErrorText,
  exportQuery,
  hasUnknownMethod,
  focusBucket,
  incomeErrorText,
  journalIsQuiet,
  journalQuery,
  NO_FILTERS,
  NO_JOURNAL_EXTRAS,
  overviewQuery,
  periodOf,
  PERIOD_TABS,
  periodTitle,
  stepPeriod,
  switchKind,
  validatePeriod,
  type Bar,
  type IncomeFilters,
  type IncomeOverview,
  type JournalExtras,
  type JournalRange,
  type JournalRow,
  type Period,
  type PeriodKind,
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
 * «Поступления» v2: the answer first (a sentence and four cards), then the details — where the money went, the chart by
 * day, the till by method — and one table at a time below: the journal of payments or the groups' collection.  Every number
 * comes from the server (`/org/payments/income`, `/journal`).  Shared by /owner/payments/income and /admin/payments/income.
 */
export function IncomePage({ paymentsHref, studentProfileBasePath }: { paymentsHref: string; studentProfileBasePath: string }) {
  const available = usePaymentsSummary((state) => state.available);
  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  const noRight = summaryLoaded && !available;
  const paymentsBase = paymentsHref.replace(/\/+$/, "");

  const today = useMemo(() => formatBusinessDate(), []);
  const [period, setPeriod] = useState<Period>(() => periodOf("month", formatBusinessDate()));
  const [filters, setFilters] = useState<IncomeFilters>(NO_FILTERS);
  const { teachers, groups } = usePaymentsDirectory();
  const periodProblem = validatePeriod(period);
  const { showToast, toastNode } = useToast();

  // ── the overview ──
  const [overview, setOverview] = useState<Loaded<IncomeOverview>>(idle);
  const overviewRequests = useRef(createRequestSequence());
  const loadOverview = useCallback(async () => {
    const token = overviewRequests.current.next();
    setOverview((state) => ({ ...state, loading: true, error: null }));
    try {
      const data = await orgApi.getIncomeOverview(overviewQuery(period, filters));
      if (!overviewRequests.current.isCurrent(token)) return;
      setOverview({ data, loading: false, error: null, denied: false });
    } catch (cause) {
      if (!overviewRequests.current.isCurrent(token)) return;
      const failure = incomeErrorText(cause);
      setOverview({ data: null, loading: false, error: failure.text, denied: failure.denied });
    }
  }, [period, filters]);

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
  const changePeriod = (next: Period) => { setPeriod(next); resetNarrowing(); };
  const changeFilters = (next: IncomeFilters) => { setFilters(next); resetNarrowing(); };

  // ── tabs, the drawer, the chart ──
  const [requestedTab, setTab] = useState<Tab>("journal");
  const collection = overview.data?.collection ?? null;
  const tab: Tab = requestedTab === "groups" && collection ? "groups" : "journal";
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

  // A link from «Оплаты» ("Долг учеников …") lands on the card of the debt.
  const landed = useRef(false);
  useEffect(() => {
    if (!overview.data || landed.current || typeof window === "undefined") return;
    landed.current = true;
    if (window.location.hash === "#position") document.getElementById("position")?.scrollIntoView({ block: "center" });
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
      <FiltersBar filters={filters} onChange={changeFilters} teachers={teachers} groups={groups} unknownMethod={hasUnknownMethod(overview.data) || filters.method === "unknown"} />
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
              <CollectionTable collection={collection} paymentsBase={paymentsBase} debtToday={overview.data?.position.debt_total ?? null} />
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

/** «День / Неделя / Месяц / Свой период» with arrows. */
export function PeriodBar({ period, today, onChange }: { period: Period; today: string; onChange: (period: Period) => void }) {
  const noun: Record<PeriodKind, string> = { day: "день", week: "неделя", month: "месяц", custom: "период" };
  const prev = { day: "Предыдущий день", week: "Предыдущая неделя", month: "Предыдущий месяц", custom: "Предыдущий период" }[period.kind];
  const next = { day: "Следующий день", week: "Следующая неделя", month: "Следующий месяц", custom: "Следующий период" }[period.kind];
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center" data-testid="income-period">
      <div role="tablist" aria-label="Период" data-testid="period-tabs" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 md:w-fit">
        {PERIOD_TABS.map(({ key, label, short }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={period.kind === key}
            onClick={() => onChange(switchKind(key, period, today))}
            className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-1.5 py-2 text-xs font-medium transition-all sm:px-3.5 sm:text-sm md:flex-none ${period.kind === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-1 md:justify-start">
        <button type="button" onClick={() => onChange(stepPeriod(period, -1))} aria-label={prev} title={prev} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        {period.kind === "custom" ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <input type="date" aria-label="С какого дня" value={period.from} max={today} onChange={(event) => event.target.value && onChange({ ...period, from: event.target.value })} className={`${FIELD} py-2`} />
            <span className="text-slate-400" aria-hidden>—</span>
            <input type="date" aria-label="По какой день" value={period.to} max={today} onChange={(event) => event.target.value && onChange({ ...period, to: event.target.value })} className={`${FIELD} py-2`} />
          </div>
        ) : period.kind === "day" ? (
          <input type="date" aria-label={`Выбрать ${noun.day}`} value={period.from} max={today} onChange={(event) => event.target.value && onChange(periodOf("day", event.target.value))} className={`${FIELD} py-2`} />
        ) : (
          <span className="min-w-[10rem] px-2 text-center text-sm font-semibold text-slate-900" aria-live="polite" data-testid="period-title">{periodTitle(period, today)}</span>
        )}
        <button type="button" onClick={() => onChange(stepPeriod(period, 1))} disabled={!canStepForward(period, today)} aria-label={next} title={next} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
      {period.kind === "day" && <p className="text-sm text-slate-500" data-testid="period-title">{periodTitle(period, today)}</p>}
    </div>
  );
}

function FiltersBar({ filters, onChange, teachers, groups, unknownMethod }: { unknownMethod: boolean; filters: IncomeFilters; onChange: (filters: IncomeFilters) => void; teachers: ReturnType<typeof usePaymentsDirectory>["teachers"]; groups: ReturnType<typeof usePaymentsDirectory>["groups"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Способ оплаты" value={filters.method} onChange={(event) => onChange({ ...filters, method: event.target.value })} className={FIELD}>
        <option value="">Все способы</option>
        {METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}
        {unknownMethod && <option value="unknown">Способ не указан</option>}
      </select>
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
