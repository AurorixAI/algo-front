"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Wallet } from "lucide-react";
import { ScrollHint } from "@/components/ui/scroll-hint";
import { formatMoney } from "@/lib/payments";
import {
  advanceCard,
  checkView,
  chartBars,
  chartFocusIndex,
  chartScrollLeft,
  collectedCard,
  debtCard,
  debtorsHref,
  DELTA_CLASS,
  flowParts,
  methodRows,
  paymentsCountText,
  receivedCard,
  showChart,
  writtenOffText,
  type Bar,
  type IncomeOverview,
} from "@/lib/payments-income-v2";

/** The group / teacher the screen is narrowed to: carried to «Должники» and to the label of the till. */
export interface IncomeScope { groupId?: string | null; teacherId?: string | null }

// ── Small shared pieces ────────────────────────────────────────────────────

/** A bar of progress: neutral blue (the colour says «debt» and «growth» elsewhere, never «a bar»). */
export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-primary-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} aria-hidden />;
}

/** The page while the first answer is on its way: the same shapes as the real thing, so nothing jumps. */
export function IncomeSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-label="Загрузка поступлений" data-testid="income-skeleton">
      <Block className="h-6 w-3/4 max-w-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <Block key={index} className="h-[118px] rounded-2xl" />)}
      </div>
      <Block className="h-16 rounded-2xl" />
      <Block className="h-56 rounded-2xl" />
    </div>
  );
}

/** A failed answer is never shown as an empty period: a sentence and a way to try again. */
export function IncomeError({ message, onRetry, denied = false }: { message: string; onRetry?: () => void; denied?: boolean }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-12 text-center" data-testid="income-error">
      {denied ? <Wallet className="h-7 w-7 text-slate-300" aria-hidden /> : <AlertCircle className="h-7 w-7 text-rose-500" aria-hidden />}
      <p className="text-sm font-medium text-slate-700">{message}</p>
      {!denied && onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Повторить
        </button>
      )}
    </div>
  );
}

// ── The four cards ─────────────────────────────────────────────────────────

function StatCard({ label, id, children, testId }: { label: string; id?: string; children: ReactNode; testId: string }) {
  return (
    <div id={id} data-testid={testId} className="flex min-w-0 scroll-mt-20 flex-col rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
      <p className="text-sm text-slate-500">{label}</p>
      {children}
    </div>
  );
}

const ACCENT = "mt-1 text-2xl font-bold tabular-nums md:text-[28px] md:leading-9";

/** «Поступило» / «Собрано за месяц» / «Долг на сегодня» / «Аванс»: one accent number each, the rest is quiet. */
export function IncomeCards({ overview, paymentsBase, scope }: { overview: IncomeOverview; paymentsBase: string; scope?: IncomeScope }) {
  const received = receivedCard(overview);
  const collected = collectedCard(overview);
  const debt = debtCard(overview);
  const advance = advanceCard(overview);
  const count = collected ? 4 : 3;
  return (
    <section aria-label="Главное за период" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${count === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`} data-testid="income-cards">
      <StatCard label="Поступило" testId="card-received">
        <p className={`${ACCENT} text-slate-900`}>{received.amount}</p>
        {received.delta.text && (
          <p className={`mt-1 text-sm font-medium ${DELTA_CLASS[received.delta.tone]}`} data-testid="received-delta" data-tone={received.delta.tone} title={received.hint || undefined}>
            {received.delta.arrow && <span aria-hidden className="mr-1">{received.delta.arrow}</span>}
            {received.delta.text}
          </p>
        )}
        {received.countText && <p className="mt-0.5 text-sm text-slate-500" data-testid="received-count">{received.countText}</p>}
      </StatCard>

      {collected && (
        <StatCard label="Собрано за месяц" testId="card-collected">
          <p className={`${ACCENT} text-slate-900`}>{collected.amount}</p>
          <p className="mt-1 text-sm text-slate-500">{collected.caption}</p>
          {collected.pct !== null && <div className="mt-2.5"><ProgressBar pct={collected.pct} label="Собрано за месяц" /></div>}
        </StatCard>
      )}

      <StatCard label="Долг на сегодня" id="position" testId="card-debt">
        <p className={`${ACCENT} ${debt.none ? "text-slate-700" : "text-rose-700"}`}>{debt.amount}</p>
        <p className="mt-1 text-sm text-slate-500">{debt.caption}</p>
        {!debt.none && (
          <Link href={debtorsHref(paymentsBase, scope)} data-testid="debtors-link" className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
            Должники
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </StatCard>

      <StatCard label="Аванс" testId="card-advance">
        <p className={`${ACCENT} ${advance.none ? "text-slate-700" : "text-emerald-700"}`}>{advance.amount}</p>
        <p className="mt-1 text-sm text-slate-500">{advance.caption}</p>
      </StatCard>
    </section>
  );
}

// ── «Куда ушли деньги» ─────────────────────────────────────────────────────

/** One compact line: shares of the received money and the mark that the parts add up to the whole. */
export function FlowLine({ overview }: { overview: IncomeOverview }) {
  const parts = flowParts(overview);
  const check = checkView(overview);
  const forgiven = writtenOffText(overview);
  if (parts.length === 0 && check.ok) return null;
  return (
    <section aria-label="Куда ушли деньги" className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 md:px-5" data-testid="income-flow">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-800">Куда ушли деньги</h2>
        <span
          data-testid="income-check"
          data-ok={check.ok ? "yes" : "no"}
          className={`inline-flex items-center gap-1 text-sm font-medium ${check.ok ? "text-emerald-700" : "text-rose-700"}`}
        >
          {check.ok ? <Check className="h-4 w-4" aria-hidden /> : <AlertCircle className="h-4 w-4" aria-hidden />}
          {check.text}
        </span>
      </div>
      {parts.length > 0 && (
        <>
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map((part) => `${part.label}: ${part.percent}%`).join(", ")}>
            {parts.map((part) => <span key={part.key} className={part.dot} style={{ width: `${part.percent}%` }} />)}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {parts.map((part) => (
              <li key={part.key} className="flex items-center gap-2 text-slate-700" data-testid={`flow-${part.key}`}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${part.dot}`} aria-hidden />
                <span>{part.label}</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatMoney(part.amount)}</span>
                <span className="text-xs text-slate-400">{part.percent}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {forgiven && <p className="mt-1.5 text-xs text-slate-500">{forgiven}</p>}
      {!check.ok && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {check.lines.filter((line) => !line.ok).map((line) => (
            <li key={line.label} className="font-medium text-rose-700">{line.label}: <span className="tabular-nums">{line.left}</span> и <span className="tabular-nums">{line.right}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── The chart of income by day ─────────────────────────────────────────────

/** Bars of income; the tooltip says the sum and the number of payments; a click narrows the journal to that day. */
export function IncomeChart({ bars, title, activeBucket, onPick, today }: { bars: Bar[]; title: string; activeBucket: string | null; onPick: (bar: Bar) => void; today: string }) {
  const count = bars.length;
  const trackRef = useRef<HTMLDivElement | null>(null);
  // A phone shows a part of the chart: it opens at the last day with money (else today), not at the 1st of the month.  Only the chart's own box
  // is scrolled (never the page), and again only when the set of days changes (another period), not on every render.
  const focusIndex = useMemo(() => chartFocusIndex(bars, today), [bars, today]);
  const days = bars.map((bar) => bar.bucket).join("|");
  useEffect(() => {
    const track = trackRef.current;
    const box = track?.parentElement;
    const column = track?.children[focusIndex] as HTMLElement | undefined;
    if (!track || !box || !column) return;
    box.scrollLeft = chartScrollLeft({ barRight: column.offsetLeft + column.offsetWidth, viewWidth: box.clientWidth, contentWidth: box.scrollWidth });
  }, [days, focusIndex]);
  return (
    <section aria-label={title} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 pb-3 pt-3.5 md:px-5" data-testid="income-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400" data-testid="income-chart-hint">
          <span className="md:hidden">Нажмите на день, чтобы увидеть оплаты</span>
          <span className="hidden md:inline">Нажмите на столбик, и ниже появятся оплаты этого дня</span>
        </p>
      </div>
      <ScrollHint className="mt-1 overflow-x-auto" data-testid="income-chart-scroll">
        <div ref={trackRef} className="relative flex items-end gap-1.5 pt-14" style={{ minWidth: `${count * 26}px` }}>
          {bars.map((bar, index) => {
            const active = activeBucket === bar.bucket;
            const dim = activeBucket !== null && !active;
            const edge = index < 2 ? "left-0" : index > count - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <div key={bar.bucket} className="group flex min-w-0 flex-1 flex-col items-center">
                <div className="relative flex h-24 w-full items-end justify-center border-b border-slate-200 md:h-36">
                  {bar.range ? (
                    <button
                      type="button"
                      aria-label={`${bar.title}: ${bar.detail}. Показать оплаты`}
                      aria-pressed={active}
                      data-testid="income-bar"
                      data-bucket={bar.bucket}
                      onClick={() => onPick(bar)}
                      className={`w-full max-w-[28px] rounded-t-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${active ? "bg-primary-700" : dim ? "bg-primary-200 hover:bg-primary-400" : "bg-primary-500 hover:bg-primary-600"}`}
                      style={{ height: `${bar.height}%` }}
                    />
                  ) : (
                    <span aria-hidden className={`h-0.5 w-full max-w-[28px] rounded-full bg-slate-200 ${bar.future ? "opacity-40" : ""}`} />
                  )}
                  {bar.range && (
                    // Shown by hover and by keyboard focus / a tap (the focus of the pressed button): CSS only, no hover handler.
                    <div aria-hidden className={`pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${edge}`} style={{ bottom: `calc(${bar.height}% + 8px)` }} data-testid="income-tooltip">
                      <p className="font-medium">{bar.title}</p>
                      <p className="tabular-nums text-slate-200">{bar.detail}</p>
                    </div>
                  )}
                </div>
                <span className={`mt-1 whitespace-nowrap text-[11px] tabular-nums ${bar.future ? "text-slate-300" : "text-slate-500"}`}>{bar.label}</span>
              </div>
            );
          })}
        </div>
      </ScrollHint>
    </section>
  );
}

// ── «Касса по способам» ────────────────────────────────────────────────────

export function MethodsBox({ overview, scope }: { overview: IncomeOverview; scope?: IncomeScope }) {
  const rows = methodRows(overview, scope);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Касса по способам" className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 md:px-5" data-testid="income-methods">
      <h2 className="text-sm font-semibold text-slate-800">Касса по способам</h2>
      <ul className="mt-1 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.method} className="py-2.5" data-testid={`method-${row.method}`}>
            {row.amount !== 0 || row.count > 0 ? (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-slate-800">
                  {row.label}
                  <span className="ml-1 whitespace-nowrap text-xs text-slate-400">{paymentsCountText(row.count)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(row.amount)}</span>
              </div>
            ) : (
              <p className="text-sm text-slate-800">{row.label}</p>
            )}
            {row.hint && (
              <p className="mt-0.5 text-sm font-medium text-slate-600" data-testid="cash-hint">
                {row.hint}
                {row.hintNote && <span className="block text-xs font-normal text-slate-400">{row.hintNote}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Everything above the journal ───────────────────────────────────────────

/**
 * The answer first, the details below: the sentence of the server, four cards, one line of «where the money went», the
 * chart and the till.  Presentational: a click on a bar is reported with `onPick`.
 */
export function IncomeOverviewView({
  overview, today, paymentsBase, activeBucket, onPick, scope,
}: { overview: IncomeOverview; today: string; paymentsBase: string; activeBucket: string | null; onPick: (bar: Bar) => void; scope?: IncomeScope }) {
  const chart = showChart(overview);
  const bars = useMemo(() => chartBars(overview, today), [overview, today]);
  const methods = methodRows(overview, scope).length > 0;
  return (
    <div className="space-y-4">
      {overview.summary_text && <p className="text-base font-medium leading-snug text-slate-800 md:text-lg" data-testid="income-summary">{overview.summary_text}</p>}
      <IncomeCards overview={overview} paymentsBase={paymentsBase} scope={scope} />
      <FlowLine overview={overview} />
      {(chart || methods) && (
        <div className={`grid grid-cols-1 gap-4 ${chart && methods ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]" : ""}`}>
          {chart && <IncomeChart bars={bars} today={today} title={overview.series_by === "month" ? "Пришло по месяцам" : "Пришло по дням"} activeBucket={activeBucket} onPick={onPick} />}
          {methods && <MethodsBox overview={overview} scope={scope} />}
        </div>
      )}
    </div>
  );
}
