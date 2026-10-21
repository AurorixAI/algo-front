"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  formatDateRu,
  formatMoney,
  pluralRu,
  statementHref,
  type BalanceRow,
  type ReceiptItem,
  type ReceiptsColumn,
  type ReceiptsMoneyColumns,
  type ReceiptsReport,
} from "@/lib/payments";
import { balanceRowNote, METHODS, methodLabel } from "@/lib/payments-ledger";
import {
  balancesDrill,
  activeSeries,
  bucketLabel,
  leftRows,
  COLUMN_LABEL,
  distributionRows,
  drillQuery,
  fillSeries,
  INCOME_PERIOD_KINDS,
  itemPartNote,
  itemsDrill,
  itemTitle,
  NO_FILTERS,
  periodOf,
  periodTitle,
  reconciliationView,
  reportQuery,
  sharePercent,
  stepPeriod,
  validatePeriod,
  type DrillTarget,
  type IncomeFilters,
  type IncomePeriod,
  type IncomePeriodKind,
} from "@/lib/payments-income";
import { usePaymentsDirectory } from "@/lib/use-payments-directory";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { Modal } from "@/components/ui/modal";

const FIELD = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const DRILL_PAGE = 50;

/** A figure that opens the list of payments behind it; zero is just a dash. */
function Figure({ value, onOpen, label, className = "", zero }: { value: number; onOpen: () => void; label: string; className?: string; zero?: ReactNode }) {
  if (value === 0) return <>{zero ?? <span className="text-slate-300">—</span>}</>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title="Показать оплаты"
      className={`rounded px-0.5 tabular-nums underline decoration-slate-300 decoration-dotted underline-offset-4 hover:decoration-primary-500 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${className}`}
    >
      {formatMoney(value)}
    </button>
  );
}

const MONEY_COLUMNS: Array<{ key: keyof ReceiptsMoneyColumns & ReceiptsColumn; label: string }> = [
  { key: "received", label: "Поступило" },
  { key: "to_past_debt", label: "На долги" },
  { key: "to_current", label: "На текущие" },
  { key: "to_advance", label: "В аванс" },
  { key: "written_off", label: "Списано" },
  { key: "refunded", label: "Возвращено" },
];

const TABLE_GRID = "lg:grid lg:grid-cols-[minmax(0,1.7fr)_repeat(6,minmax(0,1fr))] lg:items-center lg:gap-x-3";

interface TableRow {
  id: string;
  title: string;
  subtitle?: string | null;
  values: ReceiptsMoneyColumns;
  /** Which drill each figure opens (group / teacher / day of the series). */
  drill: (column: ReceiptsColumn) => DrillTarget;
}

/** Money table of the report: names on the left, digits right-aligned over their column (a ledger); cards on a narrow screen. */
function MoneyTable({ label, firstColumn, rows, open }: { label: string; firstColumn: string; rows: TableRow[]; open: (target: DrillTarget) => void }) {
  return (
    <section aria-label={label} className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
      <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 ${TABLE_GRID}`}>
        <span>{firstColumn}</span>
        {MONEY_COLUMNS.map((column) => <span key={column.key} className="text-right">{column.label}</span>)}
      </div>
      <ul className="space-y-2.5 lg:space-y-0 lg:divide-y lg:divide-slate-100">
        {rows.map((row) => (
          <li key={row.id} className={`rounded-xl border border-slate-200 bg-white p-3.5 lg:rounded-none lg:border-0 lg:px-4 lg:py-2.5 ${TABLE_GRID}`}>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-slate-900">{row.title}</p>
              {row.subtitle && <p className="truncate text-xs text-slate-500">{row.subtitle}</p>}
            </div>
            {MONEY_COLUMNS.map((column) => (
              <div key={column.key} className="mt-1 flex items-baseline justify-between gap-3 text-sm lg:mt-0 lg:block lg:text-right">
                <span className="text-xs text-slate-400 lg:hidden">{column.label}</span>
                <Figure
                  value={row.values[column.key]}
                  label={`${COLUMN_LABEL[column.key]}: ${row.title}`}
                  onOpen={() => open(row.drill(column.key))}
                />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * «Поступления»: how much money the center received in a day / a month / a range, by method, where it went (to past
 * debts, to the running periods, to an advance), what was written off and returned, by group and by teacher, and what
 * the students owe and have paid ahead today.  Every figure opens the list of payments behind it; the line
 * «Сходится» says that the parts add up to the whole.  Shared by /owner/payments/income and /admin/payments/income.
 */
export function IncomePage({ paymentsHref, studentProfileBasePath }: { paymentsHref: string; studentProfileBasePath: string }) {
  const available = usePaymentsSummary((state) => state.available);
  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  const noRight = summaryLoaded && !available;
  const paymentsBase = paymentsHref.replace(/\/+$/, "");

  const today = useMemo(() => formatBusinessDate(), []);
  const [period, setPeriod] = useState<IncomePeriod>(() => periodOf("month", formatBusinessDate()));
  const [filters, setFilters] = useState<IncomeFilters>(NO_FILTERS);
  const { teachers, groups } = usePaymentsDirectory();

  const [report, setReport] = useState<ReceiptsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const requests = useRef(createRequestSequence());
  const periodProblem = validatePeriod(period);

  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const load = useCallback(async () => {
    const token = requests.current.next();
    setLoading(true);
    setFailure(null);
    try {
      const data = await orgApi.getReceiptsReport(reportQuery(period, filters));
      if (!requests.current.isCurrent(token)) return;
      setReport(data);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      const status = (cause as { status?: number } | null)?.status;
      setReport(null);
      setFailure(status === 403 || status === 404
        ? "Нет доступа к поступлениям. Доступ даёт владелец центра в настройках."
        : cause instanceof Error ? cause.message : "Не удалось загрузить поступления");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [period, filters]);

  useEffect(() => {
    if (noRight || periodProblem) { if (periodProblem) setLoading(false); return; }
    void load();
    return () => { requests.current.next(); };
  }, [noRight, periodProblem, load]);

  // A link from «Оплаты» ("Долг учеников …") lands on the position block.
  useEffect(() => {
    if (!report || typeof window === "undefined" || window.location.hash !== "#position") return;
    document.getElementById("position")?.scrollIntoView({ block: "start" });
  }, [report]);

  const changeKind = (kind: IncomePeriodKind) => setPeriod((current) => periodOf(kind, current.to <= today ? current.to : today, current));
  const step = (delta: 1 | -1) => setPeriod((current) => stepPeriod(current, delta));

  const message = noRight ? "Нет доступа к поступлениям. Доступ даёт владелец центра в настройках." : failure;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div>
        <Link href={paymentsHref} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Оплаты
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">Поступления</h1>
        <p className="text-sm text-slate-500">Сколько денег пришло, куда они ушли и сколько учеников должны сегодня</p>
      </div>

      {/* Period and filters */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div role="tablist" aria-label="Период" className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {INCOME_PERIOD_KINDS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={period.kind === key}
                onClick={() => changeKind(key)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${period.kind === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {period.kind === "range" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="income-from" className="mb-0.5 block text-xs font-medium text-slate-500">С</label>
                <input id="income-from" type="date" value={period.from} max={today} onChange={(event) => setPeriod({ ...period, from: event.target.value })} className={FIELD} />
              </div>
              <div>
                <label htmlFor="income-to" className="mb-0.5 block text-xs font-medium text-slate-500">По</label>
                <input id="income-to" type="date" value={period.to} max={today} onChange={(event) => setPeriod({ ...period, to: event.target.value })} className={FIELD} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => step(-1)} aria-label={period.kind === "day" ? "Предыдущий день" : "Предыдущий месяц"} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
              {period.kind === "day" ? (
                <input type="date" aria-label="День" value={period.from} max={today} onChange={(event) => event.target.value && setPeriod(periodOf("day", event.target.value))} className={FIELD} />
              ) : (
                <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-900" aria-live="polite">{periodTitle(period)}</span>
              )}
              <button type="button" onClick={() => step(1)} disabled={period.to >= today} aria-label={period.kind === "day" ? "Следующий день" : "Следующий месяц"} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Способ оплаты"
            value={filters.method}
            onChange={(event) => setFilters({ ...filters, method: event.target.value })}
            className={`${FIELD} py-2.5`}
          >
            <option value="">Все способы</option>
            {METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}
          </select>
          <CascadingFilter
            teachers={teachers}
            groups={groups}
            value={{ teacherId: filters.teacherId, groupId: filters.groupId }}
            onChange={(value) => setFilters({ ...filters, teacherId: value.teacherId, groupId: value.groupId })}
          />
        </div>
      </div>
      {periodProblem && <p role="alert" className="text-sm font-medium text-rose-700">{periodProblem}</p>}

      {loading && !report ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : message ? (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-14 text-center">
          {noRight ? <Wallet className="h-7 w-7 text-slate-300" /> : <AlertCircle className="h-7 w-7 text-rose-500" />}
          <p className="text-sm font-medium text-slate-700">{message}</p>
          {!noRight && <button type="button" onClick={() => void load()} className="mt-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>}
        </div>
      ) : report ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <IncomeReportView report={report} period={period} open={setDrill} />
        </div>
      ) : null}

      <DrillPanel
        target={drill}
        period={period}
        filters={filters}
        paymentsBase={paymentsBase}
        studentProfileBasePath={studentProfileBasePath}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}

/**
 * The report itself: totals, where the money went, how people paid, the position today, by group, by teacher, by day.
 * Presentational: `open` is called with what a clicked figure should list.
 */
export function IncomeReportView({ report, period, open }: { report: ReceiptsReport; period: IncomePeriod; open: (target: DrillTarget) => void }) {
  const check = reconciliationView(report.reconciliation);
  const series = period.kind !== "day" ? activeSeries(fillSeries(report)) : [];
  const left = leftRows(report.totals);
  const dayList = (extra: Partial<{ bucket: string; method: string; groupId: string; teacherId: string; of: string }>, column: ReceiptsColumn) => itemsDrill(column, extra);
  return (
    <div className="space-y-6">
      {/* Totals */}
      <section aria-label="Итоги периода" className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs text-slate-500">{periodTitle(period)}{report.totals.payments_count > 0 ? ` · ${report.totals.payments_count} ${pluralRu(report.totals.payments_count, "оплата", "оплаты", "оплат")}` : ""}</p>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Поступило</dt>
            <dd className="text-xl font-bold text-slate-900"><Figure value={report.totals.received} label="Поступило: все оплаты" onOpen={() => open(dayList({}, "received"))} zero={<span className="text-slate-400">0 сум</span>} /></dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Возвращено</dt>
            <dd className="text-xl font-bold text-slate-900"><Figure value={report.totals.refunded} label="Возвращено: все возвраты" onOpen={() => open(dayList({}, "refunded"))} zero={<span className="text-slate-400">0 сум</span>} /></dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Списано долгов</dt>
            <dd className="text-xl font-bold text-slate-900"><Figure value={report.totals.written_off} label="Списано: все списания" onOpen={() => open(dayList({}, "written_off"))} zero={<span className="text-slate-400">0 сум</span>} /></dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Остаётся в центре</dt>
            <dd className="text-xl font-bold tabular-nums text-slate-900">{formatMoney(report.totals.net_received)}</dd>
          </div>
        </dl>

        {/* Where the money went */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h2 className="text-sm font-semibold text-slate-800">Куда ушли деньги</h2>
          <DistributionBar totals={report.totals} />
          <ul className="mt-2 space-y-1.5">
            {distributionRows(report.totals).map((row) => (
              <li key={row.column} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-slate-700">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${DOT[row.column]}`} aria-hidden />
                  {row.label}
                  <span className="text-xs text-slate-400">{sharePercent(row.amount, report.totals.received)}%</span>
                </span>
                <Figure value={row.amount} label={`${row.label}: оплаты`} onOpen={() => open(dayList({}, row.column))} className="shrink-0 text-slate-900" />
              </li>
            ))}
            {left.map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-slate-500">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${LEFT_DOT[row.key]}`} aria-hidden />
                  {row.label}
                  <span className="text-xs text-slate-400">{sharePercent(row.amount, report.totals.received)}%</span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">{formatMoney(row.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Reconciliation */}
        <details className="group mt-4 border-t border-slate-100 pt-3 text-xs" data-testid="income-reconciliation">
          <summary className={`flex cursor-pointer list-none items-center gap-1.5 ${check.ok ? "text-slate-500" : "font-medium text-rose-700"}`}>
            {check.ok ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden />}
            <span className={check.ok ? "font-semibold text-emerald-700" : ""}>{check.text}</span>
            <span className="text-slate-400 group-open:hidden">· как проверяется</span>
          </summary>
          <ul className="mt-2 space-y-1">
            {check.lines.map((line) => (
              <li key={line.label} className={line.ok ? "text-slate-500" : "font-medium text-rose-700"}>
                {line.label}: <span className="tabular-nums">{line.left}</span> и <span className="tabular-nums">{line.right}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {/* By method */}
      {report.by_method.length > 0 && (
        <section aria-label="По способам оплаты">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Как платили</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4">
            {report.by_method.map((item) => (
              <li key={item.method} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-800">{methodLabel(item.method)} <span className="text-xs text-slate-400">· {item.count} {pluralRu(item.count, "оплата", "оплаты", "оплат")}</span></span>
                <Figure value={item.amount} label={`${methodLabel(item.method)}: оплаты`} onOpen={() => open(dayList({ method: item.method, of: methodLabel(item.method) }, "received"))} className="text-slate-900" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Position today */}
      <section id="position" aria-label="Долг и аванс сегодня" className="scroll-mt-20">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Сегодня, {formatDateRu(report.as_of)}</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs text-slate-500">Долг учеников</dt>
            <dd className="mt-0.5 text-lg font-bold text-rose-700">
              {report.position.debt_total > 0 ? (
                <button type="button" onClick={() => open(balancesDrill("debt"))} className="tabular-nums underline decoration-rose-200 decoration-dotted underline-offset-4 hover:decoration-rose-500">{formatMoney(report.position.debt_total)}</button>
              ) : <span className="text-slate-400">нет долгов</span>}
            </dd>
            {report.position.debt_total > 0 && (
              <p className="text-xs text-slate-500">
                {report.position.students_with_debt} {pluralRu(report.position.students_with_debt, "ученик", "ученика", "учеников")}, из них за прошлые периоды {formatMoney(report.position.past_debt_total)}
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs text-slate-500">Аванс — оплачено вперёд</dt>
            <dd className="mt-0.5 text-lg font-bold text-emerald-700">
              {report.position.advance_total > 0 ? (
                <button type="button" onClick={() => open(balancesDrill("advance"))} className="tabular-nums underline decoration-emerald-200 decoration-dotted underline-offset-4 hover:decoration-emerald-500">{formatMoney(report.position.advance_total)}</button>
              ) : <span className="text-slate-400">нет авансов</span>}
            </dd>
            {report.position.advance_total > 0 && (
              <p className="text-xs text-slate-500">{report.position.memberships_with_advance} {pluralRu(report.position.memberships_with_advance, "группа", "группы", "групп")} с авансом</p>
            )}
          </div>
        </dl>
      </section>

      {/* By group, by teacher */}
      {report.by_group.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">По группам</h2>
          <MoneyTable
            label="По группам"
            firstColumn="Группа"
            open={open}
            rows={report.by_group.map((group) => ({
              id: group.group_id,
              title: group.group_name,
              subtitle: group.teacher_name,
              values: group,
              drill: (column) => dayList({ groupId: group.group_id, of: group.group_name }, column),
            }))}
          />
        </div>
      )}
      {report.by_teacher.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">По преподавателям</h2>
          <MoneyTable
            label="По преподавателям"
            firstColumn="Преподаватель"
            open={open}
            rows={report.by_teacher.map((teacher) => ({
              id: teacher.teacher_id ?? "none",
              title: teacher.teacher_name || "Без преподавателя",
              values: teacher,
              drill: (column) => dayList({ teacherId: teacher.teacher_id ?? undefined, of: teacher.teacher_name ?? "Без преподавателя" }, column),
            }))}
          />
        </div>
      )}

      {/* Day by day / month by month */}
      {series.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">{report.group_by === "month" ? "По месяцам" : "По дням"}</h2>
          <MoneyTable
            label={report.group_by === "month" ? "По месяцам" : "По дням"}
            firstColumn={report.group_by === "month" ? "Месяц" : "День"}
            open={open}
            rows={series.map((point) => ({
              id: point.bucket,
              title: bucketLabel(point.bucket),
              subtitle: point.count > 0 ? `${point.count} ${pluralRu(point.count, "оплата", "оплаты", "оплат")}` : null,
              values: point,
              drill: (column) => dayList({ bucket: point.bucket, of: bucketLabel(point.bucket) }, column),
            }))}
          />
        </div>
      )}
    </div>
  );
}

const LEFT_DOT = { refunded: "bg-slate-300", transferred: "bg-slate-400" } as const;
const DOT: Record<string, string> = { to_past_debt: "bg-slate-700", to_current: "bg-primary-600", to_advance: "bg-emerald-500" };

/** The three parts of the received money on one line; an empty part takes no room. */
function DistributionBar({ totals }: { totals: ReceiptsReport["totals"] }) {
  const parts = [
    ...distributionRows(totals).map((row) => ({ key: row.column as string, label: row.label, amount: row.amount, className: DOT[row.column] })),
    ...leftRows(totals).map((row) => ({ key: row.key as string, label: row.label, amount: row.amount, className: LEFT_DOT[row.key] })),
  ];
  const whole = parts.reduce((acc, part) => acc + part.amount, 0);
  if (whole <= 0) return null;
  return (
    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map((part) => `${part.label}: ${sharePercent(part.amount, whole)}%`).join(", ")}>
      {parts.filter((part) => part.amount > 0).map((part) => (
        <span key={part.key} className={part.className} style={{ width: `${(part.amount * 100) / whole}%` }} />
      ))}
    </div>
  );
}

// ── The list behind a figure ───────────────────────────────────────────────

function DrillPanel({
  target, period, filters, paymentsBase, studentProfileBasePath, onClose,
}: {
  target: DrillTarget | null;
  period: IncomePeriod;
  filters: IncomeFilters;
  paymentsBase: string;
  studentProfileBasePath: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(createRequestSequence());

  const fetchPage = useCallback(async (offset: number) => {
    if (!target) return;
    const token = requests.current.next();
    setLoading(true);
    setError(null);
    try {
      if (target.kind === "items") {
        const page = await orgApi.getReceiptItems(drillQuery(target, period, filters, offset, DRILL_PAGE));
        if (!requests.current.isCurrent(token)) return;
        setItems((previous) => (offset === 0 ? page.items : [...previous, ...page.items]));
        setTotal(page.total);
      } else {
        const page = await orgApi.getBalances({
          kind: target.balance,
          group_id: filters.groupId || undefined,
          teacher_id: filters.groupId ? undefined : filters.teacherId || undefined,
          limit: DRILL_PAGE,
          offset,
        });
        if (!requests.current.isCurrent(token)) return;
        setBalances((previous) => (offset === 0 ? page.items : [...previous, ...page.items]));
        setTotal(page.total);
      }
    } catch (cause) {
      if (requests.current.isCurrent(token)) setError(cause instanceof Error ? cause.message : "Не удалось загрузить список");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [target, period, filters]);

  useEffect(() => {
    setItems([]);
    setBalances([]);
    setTotal(0);
    if (target) void fetchPage(0);
    return () => { requests.current.next(); };
  }, [target, fetchPage]);

  const shown = target?.kind === "items" ? items.length : balances.length;

  return (
    <Modal
      open={target !== null}
      placement="right"
      title={target?.title ?? ""}
      description={target ? (target.kind === "items" ? periodTitle(period) : `На ${formatDateRu(formatBusinessDate())}`) : undefined}
      onClose={onClose}
    >
      <div className="pb-2" data-testid="income-drill">
        {error ? (
          <p role="alert" className="text-sm font-medium text-rose-700">{error} <button type="button" onClick={() => void fetchPage(0)} className="underline">Повторить</button></p>
        ) : loading && shown === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-primary-600" />Загрузка…</div>
        ) : shown === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Записей нет</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500">Всего: {total}</p>
            {target?.kind === "items" ? (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={`${item.type}-${item.id}`} className="py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`${studentProfileBasePath}/${item.student_id}`} className="min-w-0 truncate font-medium text-slate-900 hover:text-primary-700">{item.student_name}</Link>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(item.column_amount)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 text-xs text-slate-500">
                      <span className="min-w-0 truncate">{formatDateRu(item.date)} · {item.group_name}{item.teacher_name ? ` · ${item.teacher_name}` : ""}</span>
                      {itemPartNote(item) && <span className="shrink-0 tabular-nums">{itemPartNote(item)}</span>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {itemTitle(item)}
                      <span className="mx-1.5 text-slate-300">·</span>
                      <Link href={statementHref(paymentsBase, item.membership_id)} className="font-medium text-primary-700 hover:underline">Выписка</Link>
                    </p>
                    {item.type === "payment" && item.allocations.length > 0 && (
                      <ul className="mt-1 space-y-px border-l-2 border-slate-100 pl-2.5 text-xs text-slate-500">
                        {item.allocations.filter((line) => line.amount > 0).map((line, index) => (
                          <li key={`${line.segment_id}-${index}`} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0">{line.label}</span>
                            <span className="shrink-0 tabular-nums">{formatMoney(line.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-slate-100">
                {balances.map((row) => (
                  <li key={row.membership_id} className="py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`${studentProfileBasePath}/${row.student_id}`} className="min-w-0 truncate font-medium text-slate-900 hover:text-primary-700">{row.student_name}</Link>
                      <span className={`shrink-0 font-semibold tabular-nums ${row.debt > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {row.debt > 0 ? formatMoney(row.debt) : formatMoney(row.advance)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {row.group_name}{row.teacher_name ? ` · ${row.teacher_name}` : ""}
                      {balanceRowNote(row)}
                    </p>
                    <p className="text-xs">
                      <Link href={statementHref(paymentsBase, row.membership_id)} className="font-medium text-primary-700 hover:underline">Выписка</Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {shown < total && (
              <button type="button" onClick={() => void fetchPage(shown)} disabled={loading} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Показать ещё
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
