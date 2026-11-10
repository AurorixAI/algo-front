"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Banknote } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formatMoney } from "@/lib/payments";
import {
  MY_PAYROLL_BACK, MY_PAYROLL_EMPTY_HINT, MY_PAYROLL_EMPTY_TITLE, MY_PAYROLL_LOAD_FAILED, MY_PAYROLL_NO_MONTH, MY_PAYROLL_PAST, MY_PAYROLL_TITLE, PRELIMINARY_NOW,
  ADVANCE_LINE, advanceTaken, balanceView, hasNumbers, isEmptyList, listLine, listState, myMonthChip, myMonthParam, stateLine,
  type MyMonth,
} from "@/lib/my-payroll";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";

/** «Моя зарплата» of a teacher (Money-1 V8): how much he earned and how much is owed to him - one screen, one question.  Light flat cards, sums on the right; no prices, no debts of students. */
export function MyPayrollView() {
  return (
    <Suspense fallback={<SkeletonRows count={3} label="Загружаем зарплату…" />}>
      <MyPayrollContent />
    </Suspense>
  );
}

type Loaded = { months: MyMonth[] } | { failed: string } | null;

function MyPayrollContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useMemo(() => formatBusinessDate(), []);
  const current = today.slice(0, 7);
  const [month, setMonth] = useState(() => myMonthParam(searchParams?.get("month"), today));

  const [loaded, setLoaded] = useState<Loaded>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const mine = ++sequence.current;
    setLoaded(null);
    try {
      const months = await orgApi.getMyPayrollMonths();
      if (mine === sequence.current) setLoaded(months ? { months } : { failed: MY_PAYROLL_LOAD_FAILED });
    } catch (cause) {
      if (mine === sequence.current) setLoaded({ failed: getDataLoadErrorMessage(cause) });
    }
  }, []);
  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);

  // a month the list does not have (an old address): asked on its own
  const months = loaded && "months" in loaded ? loaded.months : null;
  const inList = months?.find((item) => item.month === month) ?? null;
  const [single, setSingle] = useState<{ month: string; item: MyMonth | null; error: string | null } | null>(null);
  const singleSeq = useRef(0);
  const needSingle = months !== null && inList === null;
  const loadSingle = useCallback(async () => {
    const mine = ++singleSeq.current;
    setSingle(null);
    try {
      const item = await orgApi.getMyPayroll(month);
      if (mine === singleSeq.current) setSingle({ month, item, error: item ? null : MY_PAYROLL_LOAD_FAILED });
    } catch (cause) {
      const status = (cause as { status?: number })?.status;
      if (mine === singleSeq.current) setSingle({ month, item: null, error: status === 422 ? MY_PAYROLL_NO_MONTH : getDataLoadErrorMessage(cause) });
    }
  }, [month]);
  useEffect(() => { if (needSingle) void loadSingle(); return () => { singleSeq.current += 1; }; }, [needSingle, loadSingle]);

  const choose = (next: string) => {
    setMonth(next);
    router.replace(next === current ? "?" : `?month=${next}`, { scroll: false });
    if (typeof window !== "undefined") window.scrollTo?.({ top: 0 });
  };

  const selected = inList ?? (single && single.month === month ? single.item : null);
  const singleError = needSingle && single && single.month === month ? single.error : null;
  const others = (months ?? []).filter((item) => item.month !== month);

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-5" data-testid="my-payroll">
      <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{MY_PAYROLL_TITLE}</h1>

      {loaded === null ? (
        <SkeletonRows count={3} label="Загружаем зарплату…" testId="my-payroll-loading" />
      ) : "failed" in loaded ? (
        <DataLoadError title={MY_PAYROLL_LOAD_FAILED} message={loaded.failed} onRetry={() => void load()} />
      ) : isEmptyList(loaded.months) && month === current ? (
        <EmptyState icon={Banknote} title={MY_PAYROLL_EMPTY_TITLE} hint={MY_PAYROLL_EMPTY_HINT} testId="my-payroll-empty" />
      ) : (
        <>
          {month !== current && (
            <Button type="button" variant="ghost" size="md" onClick={() => choose(current)} data-testid="my-payroll-back" className="-ml-2">{MY_PAYROLL_BACK}</Button>
          )}
          {selected ? (
            <MonthCard month={selected} />
          ) : singleError ? (
            <DataLoadError title={singleError} message={null} onRetry={singleError === MY_PAYROLL_NO_MONTH ? undefined : () => void loadSingle()} />
          ) : (
            <SkeletonRows count={1} label="Загружаем месяц…" />
          )}
          {others.length > 0 && (
            <section aria-label={MY_PAYROLL_PAST} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">{MY_PAYROLL_PAST}</h2>
              <ul className="overflow-hidden rounded-card border border-slate-200 bg-white">
                {others.map((item) => <PastRow key={item.month} month={item} onChoose={() => choose(item.month)} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** A line of the card: the name on the left, the number on the right (a sum is one piece, never broken). */
function Line({ label, value, testId, strong = false }: { label: string; value: string; testId: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5" data-testid={testId}>
      <dt className="min-w-0 text-sm text-slate-600">{label}</dt>
      <dd className={`shrink-0 whitespace-nowrap text-right text-sm tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-800"}`}>{value}</dd>
    </div>
  );
}

function MonthCard({ month }: { month: MyMonth }) {
  const chip = myMonthChip(month);
  const numbers = hasNumbers(month);
  const rest = balanceView(month.balance);
  const note = stateLine(month);
  const taken = advanceTaken(month);
  return (
    <section aria-label={month.title} data-testid="my-month-card" data-state={month.state} className="rounded-card border border-slate-200 bg-white p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold text-slate-900" data-testid="my-month-title">{month.title}</h2>
        <StatusChip tone={chip.tone} testId="my-month-chip">{chip.label}</StatusChip>
      </div>
      {numbers && (
        <dl className="mt-2 divide-y divide-slate-100">
          <Line label="Засчитано уроков" value={String(month.lessonsCounted)} testId="my-lessons" />
          <Line label={month.preliminary ? `Зарплата · ${PRELIMINARY_NOW}` : "Зарплата"} value={formatMoney(month.total ?? 0)} testId="my-total" strong />
          {taken !== null && <Line label={ADVANCE_LINE} value={`−${formatMoney(taken)}`} testId="my-advance" />}
          <Line label="Выплачено" value={formatMoney(month.paid)} testId="my-paid" />
          <Line label={rest.label} value={rest.value} testId="my-rest" strong />
        </dl>
      )}
      {note && <p data-testid="my-state-line" className="mt-3 text-sm leading-5 text-slate-600">{note}</p>}
    </section>
  );
}

function PastRow({ month, onChoose }: { month: MyMonth; onChoose: () => void }) {
  const state = listState(month);
  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <button type="button" onClick={onChoose} data-testid="my-month-row" aria-label={`${month.title}: ${listLine(month)}${state ? `, ${state}` : ""}`} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">{month.title}</span>
          <span className="block text-xs leading-5 text-slate-600">{listLine(month)}</span>
          {state && <span className="block text-xs leading-5 text-slate-600">{state}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </button>
    </li>
  );
}
