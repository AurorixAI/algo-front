"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
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
  arcPath,
  cashTodayLine,
  collectedCard,
  debtCard,
  debtorsHref,
  DELTA_CLASS,
  DONUT,
  donutCenterAmount,
  donutCenterFont,
  flowParts,
  isFullRing,
  methodSegments,
  methodsTotal,
  methodTooltip,
  receivedCard,
  showChart,
  writtenOffText,
  type Bar,
  type IncomeCash,
  type IncomeOverview,
  type MethodSegment,
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

/** The big number of a card: soft (semibold, tight), not a shout.  24 px is «large text», so the lighter colours below stay readable. */
export const ACCENT = "mt-1 text-2xl font-semibold leading-8 tabular-nums tracking-tight";
export const ACCENT_NEUTRAL = "text-slate-800";
export const ACCENT_DEBT = "text-rose-600";
export const ACCENT_ADVANCE = "text-emerald-600";

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
        <p className={`${ACCENT} ${ACCENT_NEUTRAL}`}>{received.amount}</p>
        {received.delta.text && (
          <p className={`mt-1 truncate text-sm font-medium ${DELTA_CLASS[received.delta.tone]}`} data-testid="received-delta" data-tone={received.delta.tone} title={received.hint || received.delta.text}>
            {received.delta.arrow && <span aria-hidden className="mr-1">{received.delta.arrow}</span>}
            {received.delta.text}
          </p>
        )}
        {received.countText && <p className="mt-0.5 text-sm text-slate-500" data-testid="received-count">{received.countText}</p>}
      </StatCard>

      {collected && (
        <StatCard label="Собрано за месяц" testId="card-collected">
          <p className={`${ACCENT} ${ACCENT_NEUTRAL}`}>{collected.amount}</p>
          <p className="mt-1 text-sm text-slate-500">{collected.caption}</p>
          {collected.pct !== null && <div className="mt-2.5"><ProgressBar pct={collected.pct} label="Собрано за месяц" /></div>}
        </StatCard>
      )}

      <StatCard label="Долг на сегодня" id="position" testId="card-debt">
        <p className={`${ACCENT} ${debt.none ? "text-slate-600" : ACCENT_DEBT}`}>{debt.amount}</p>
        <p className="mt-1 text-sm text-slate-500">{debt.caption}</p>
        {!debt.none && (
          <Link href={debtorsHref(paymentsBase, scope)} data-testid="debtors-link" className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
            Должники
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </StatCard>

      <StatCard label="Аванс" testId="card-advance">
        <p className={`${ACCENT} ${advance.none ? "text-slate-600" : ACCENT_ADVANCE}`}>{advance.amount}</p>
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
                <span className="font-medium tabular-nums tracking-tight text-slate-800">{formatMoney(part.amount)}</span>
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
    <section aria-label={title} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white px-4 pb-3 pt-3.5 md:px-5" data-testid="income-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400" data-testid="income-chart-hint">
          <span className="md:hidden">Нажмите на день, чтобы увидеть оплаты</span>
          <span className="hidden md:inline">Нажмите на столбик, и ниже появятся оплаты этого дня</span>
        </p>
      </div>
      {/* A phone scrolls the chart sideways (26 px a day); from md every day fits the card: flexible columns, the bars fill the card's height. */}
      <ScrollHint className="mt-1 flex flex-1 flex-col overflow-x-auto" data-testid="income-chart-scroll">
        <div ref={trackRef} className="relative flex flex-1 items-end gap-1.5 pt-14 min-w-[var(--chart-min)] md:min-w-0 md:gap-1" style={{ "--chart-min": `${count * 26}px` } as CSSProperties}>
          {bars.map((bar, index) => {
            const active = activeBucket === bar.bucket;
            const dim = activeBucket !== null && !active;
            const edge = index < 2 ? "left-0" : index > count - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <div key={bar.bucket} className="group flex min-w-0 flex-1 flex-col items-center md:self-stretch">
                <div className="relative flex h-24 w-full items-end justify-center border-b border-slate-200 md:h-auto md:min-h-[9rem] md:flex-1">
                  {bar.range ? (
                    <button
                      type="button"
                      aria-label={`${bar.title}: ${bar.detail}. Показать оплаты`}
                      aria-pressed={active}
                      data-testid="income-bar"
                      data-bucket={bar.bucket}
                      onClick={() => onPick(bar)}
                      className={`absolute bottom-0 left-1/2 w-full max-w-[28px] -translate-x-1/2 rounded-t-md transition-colors md:max-w-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${active ? "bg-primary-700" : dim ? "bg-primary-200 hover:bg-primary-400" : "bg-primary-500 hover:bg-primary-600"}`}
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

// ── «Чем платили» ──────────────────────────────────────────────────────────

const DONUT_SIZE = DONUT.size;
const DONUT_R = DONUT.radius;
const DONUT_WIDTH = DONUT.width;
const DONUT_WIDTH_ACTIVE = DONUT.widthActive;
/** A hair of white between the segments (degrees on each side), only where a segment is wide enough to lose it. */
const DONUT_GAP = 0.9;

/**
 * The donut of the methods: the sum in the centre, a legend of one line per method below.  Hovering / focusing a segment (or a legend
 * line) highlights it in both places and says «Наличные · 235 000 сум · 1 оплата · 3%»; a click (a tap) on either narrows the journal to
 * that method, the same one again clears it.  Segments and legend lines are buttons.  On the current month one quiet line says
 * how much cash must be in the till today.
 */
export function MethodsDonut({ overview, selected = "", onSelect, cashToday = null }: { overview: IncomeOverview; selected?: string; onSelect?: (method: string) => void; cashToday?: IncomeCash | null }) {
  const segments = useMemo(() => methodSegments(overview.by_method), [overview.by_method]);
  const [hover, setHover] = useState<string | null>(null);
  if (segments.length === 0) return null;
  const total = methodsTotal(segments);
  const centre = donutCenterAmount(total.amount);
  // The centre text is fitted to the inner edge of the ring: ≥ 8 px of clearance for any amount (text-base cap on a phone, text-lg from md).
  const fontPhone = donutCenterFont(centre.text, 16);
  const fontDesk = donutCenterFont(centre.text, 18);
  const cash = cashTodayLine(cashToday);
  const lit = hover ?? (selected || null);
  const tip = hover ? segments.find((segment) => segment.method === hover) ?? null : null;
  const many = segments.length > 1;
  const center = DONUT_SIZE / 2;
  const pick = (method: string) => onSelect?.(method);
  const onKey = (method: string) => (event: KeyboardEvent<Element>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(method); }
  };
  const hoverProps = (method: string) => ({
    onMouseEnter: () => setHover(method),
    onMouseLeave: () => setHover((current) => (current === method ? null : current)),
    onFocus: () => setHover(method),
    onBlur: () => setHover((current) => (current === method ? null : current)),
  });
  const label = (segment: MethodSegment) => `${methodTooltip(segment)}. Показать оплаты`;
  return (
    <section aria-label="Чем платили" className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 md:px-5" data-testid="income-methods">
      <h2 className="text-sm font-semibold text-slate-800">Чем платили</h2>

      <div className="mt-1 flex h-8 items-center justify-center" aria-hidden>
        {tip ? (
          <p className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-center text-xs leading-snug tabular-nums text-white shadow-sm" data-testid="method-tooltip">
            <span className={`h-2 w-2 shrink-0 rounded-full ${tip.dot}`} data-testid="method-tooltip-dot" aria-hidden />
            {methodTooltip(tip)}
          </p>
        ) : (
          <p className="text-xs text-slate-400">Нажмите на способ, чтобы увидеть его оплаты</p>
        )}
      </div>

      <div className="relative mx-auto" style={{ width: DONUT_SIZE, height: DONUT_SIZE }} data-testid="method-donut">
        <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} width={DONUT_SIZE} height={DONUT_SIZE} className="block" role="group" aria-label="Диаграмма: чем платили">
          <circle cx={center} cy={center} r={DONUT_R} fill="none" strokeWidth={DONUT_WIDTH} className="stroke-slate-100" />
          {segments.map((segment) => {
            const active = lit === segment.method;
            const dim = lit !== null && !active;
            const common = {
              fill: "none",
              strokeWidth: active ? DONUT_WIDTH_ACTIVE : DONUT_WIDTH,
              className: `${segment.stroke} cursor-pointer outline-none transition-[stroke-width,opacity] duration-150 ${dim ? "opacity-40" : ""}`,
              role: "button",
              tabIndex: 0,
              "aria-label": label(segment),
              "aria-pressed": selected === segment.method,
              "data-testid": "method-segment",
              "data-method": segment.method,
              onClick: () => pick(segment.method),
              onKeyDown: onKey(segment.method),
              ...hoverProps(segment.method),
            };
            if (isFullRing(segment)) return <circle key={segment.method} cx={center} cy={center} r={DONUT_R} {...common} />;
            const gap = many && segment.sweep > 4 ? DONUT_GAP : 0;
            return <path key={segment.method} d={arcPath(center, center, DONUT_R, segment.start + gap, segment.end - gap)} {...common} />;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" title={centre.title}>
          <p
            className="whitespace-nowrap font-semibold tabular-nums tracking-tight text-slate-800 [font-size:var(--fs)] md:[font-size:var(--fs-md)]"
            style={{ "--fs": `${fontPhone}px`, "--fs-md": `${fontDesk}px` } as CSSProperties}
            data-testid="method-total"
          >
            <span aria-hidden>{centre.text}</span>
            <span className="sr-only">{centre.title}</span>
          </p>
          <p className="text-xs leading-[14px] text-slate-500" data-testid="method-total-count">{total.countText}</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-slate-100" data-testid="method-legend">
        {segments.map((segment) => (
          <li key={segment.method}>
            <button
              type="button"
              aria-label={label(segment)}
              aria-pressed={selected === segment.method}
              data-testid="method-legend-row"
              data-method={segment.method}
              onClick={() => pick(segment.method)}
              {...hoverProps(segment.method)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${lit === segment.method ? "bg-slate-50" : ""} ${lit !== null && lit !== segment.method ? "opacity-60" : ""}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${segment.dot}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-slate-700">{segment.label}</span>
              <span className="shrink-0 text-right font-medium tabular-nums tracking-tight text-slate-800">{formatMoney(segment.amount)}</span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">{segment.percentText}</span>
            </button>
          </li>
        ))}
      </ul>

      {cash && (
        <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-sm text-slate-600" data-testid="cash-today">
          {cash.text}
          {cash.note && <span className="block text-xs text-slate-400">{cash.note}</span>}
        </p>
      )}
    </section>
  );
}

// ── Everything above the journal ───────────────────────────────────────────

/**
 * The answer first, the details below: four cards, one line of «where the money went», then the chart by day and the donut of the
 * methods.  Presentational: a click on a bar is reported with `onPick`, a click on a method with `onPickMethod`.
 */
export function IncomeOverviewView({
  overview, today, paymentsBase, activeBucket, onPick, scope, method = "", onPickMethod, cashToday = null,
}: {
  overview: IncomeOverview; today: string; paymentsBase: string; activeBucket: string | null; onPick: (bar: Bar) => void; scope?: IncomeScope;
  /** The method the journal is narrowed to ("" = all) and the way to change it. */
  method?: string; onPickMethod?: (method: string) => void;
  /** The till of today (the current month only; the page passes null otherwise or when the request failed). */
  cashToday?: IncomeCash | null;
}) {
  const chart = showChart(overview);
  const bars = useMemo(() => chartBars(overview, today), [overview, today]);
  const methods = methodSegments(overview.by_method).length > 0;
  return (
    <div className="space-y-4">
      <IncomeCards overview={overview} paymentsBase={paymentsBase} scope={scope} />
      <FlowLine overview={overview} />
      {(chart || methods) && (
        <div className={`grid grid-cols-1 gap-4 ${chart && methods ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]" : ""}`}>
          {chart && <IncomeChart bars={bars} today={today} title={overview.series_by === "month" ? "Пришло по месяцам" : "Пришло по дням"} activeBucket={activeBucket} onPick={onPick} />}
          {methods && <MethodsDonut overview={overview} selected={method} onSelect={onPickMethod} cashToday={cashToday} />}
        </div>
      )}
    </div>
  );
}
