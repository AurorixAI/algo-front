"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { receiptHref, statementHref } from "@/lib/payments";
import { basesOfPayments, groupHref, studentHref } from "@/lib/ia-links";
import {
  drawerView,
  filterChips,
  hiddenPaymentsCount,
  JOURNAL_QUIET_TEXT,
  journalEmptyText,
  journalIsQuiet,
  journalPaging,
  journalRowView,
  journalSpansYears,
  journalTotalsText,
  showVoidedLabel,
  type FlowKind,
  type EmptyContext,
  type JournalAuthor,
  type JournalRow,
  type PaymentsJournal,
} from "@/lib/payments-income-v2";
import { Select } from "@/components/ui/select";
import { IncomeError } from "./income-parts";

const FIELD = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

// ── The rows ───────────────────────────────────────────────────────────────

// Дата · Ученик · Группа (centred, narrower) · Сумма (its own fixed column, right-aligned, tabular) · Способ (centred, wide enough to leave room before the amount).
const ROW_GRID = "md:grid-cols-[6.5rem_minmax(0,1.5fr)_minmax(0,1fr)_8rem_11rem]";

/**
 * Compact rows: date · time | student | group | amount | method.  A cancelled or corrected payment is grey and says «отменена».
 * One piece of markup for the table (md and up) and for the cards of a phone: only the grid places it differently.
 */
export function JournalList({ rows, withYear, activeId, onOpen }: { rows: JournalRow[]; withYear: boolean; activeId: string | null; onOpen: (row: JournalRow) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" data-testid="income-journal-list">
      <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 md:grid md:gap-x-3 ${ROW_GRID}`}>
        <span className="text-center">Дата · время</span>
        <span>Ученик</span>
        <span className="text-center">Группа</span>
        <span className="text-right">Сумма</span>
        <span className="text-center">Способ</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => {
          const view = journalRowView(row, withYear);
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                data-testid="journal-row"
                data-status={row.status}
                onClick={() => onOpen(row)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 md:items-center md:py-2.5 ${ROW_GRID} ${activeId === row.id ? "bg-primary-50/60" : ""}`}
              >
                <span className={`col-start-1 row-start-3 self-center text-xs tabular-nums md:col-span-1 md:col-start-1 md:row-start-1 md:text-center md:text-sm ${view.muted ? "text-slate-400" : "text-slate-500"}`}>
                  {view.time ? `${view.date} · ${view.time}` : view.date}
                </span>
                {view.enteredAt && <span data-testid="journal-entered" className="col-span-2 row-start-4 text-[11px] leading-tight text-slate-400 md:hidden">{view.enteredAt}</span>}
                {/* A phone: the name has the whole first line and the chip sits under the amount (row 3); md and up: one line, the chip next to the name. */}
                <span className={`contents text-sm font-medium md:col-start-2 md:flex md:min-w-0 md:items-center md:gap-2 ${view.muted ? "text-slate-400" : "text-slate-900"}`}>
                  <span className="col-start-1 row-start-1 min-w-0 truncate">{view.student}</span>
                  {view.tag && <span data-testid="journal-tag" className="col-start-2 row-start-3 shrink-0 justify-self-end whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 md:justify-self-auto">{view.tag}</span>}
                  {/* «исправлена» sits where «отменена» does (next to the name; under the amount on a phone), so the amount column stays one line */}
                  {view.correctedChip && <span data-testid="journal-corrected" title={view.correctedTitle ?? undefined} className="col-start-2 row-start-3 shrink-0 justify-self-end whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 md:justify-self-auto">{view.correctedChip}</span>}
                </span>
                <span className={`col-start-1 row-start-2 min-w-0 truncate text-xs md:col-start-3 md:row-start-1 md:text-center md:text-sm ${view.muted ? "text-slate-400" : "text-slate-600"}`}>{view.group}</span>
                <span className={`col-start-2 row-start-1 text-right text-sm font-medium tabular-nums tracking-tight md:col-start-4 ${view.muted ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  <span className="whitespace-nowrap">{view.amount}</span>
                </span>
                <span className={`col-start-2 row-start-2 text-right text-xs md:col-start-5 md:row-start-1 md:text-center md:text-sm ${view.muted ? "text-slate-400" : "text-slate-600"}`}>{view.method}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function JournalSkeleton() {
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white" role="status" aria-busy="true" aria-label="Загрузка оплат" data-testid="journal-skeleton">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

// ── The drawer ─────────────────────────────────────────────────────────────

/** What a row says in full: who entered it, where the money went, the receipt, the way to the student. */
export function JournalDrawerBody({ row, paymentsBase, studentProfileBasePath }: { row: JournalRow; paymentsBase: string; studentProfileBasePath: string }) {
  const view = drawerView(row);
  const hrefs = {
    receipt: receiptHref(paymentsBase, row.id, { membershipId: row.membership_id, studentId: row.student_id, groupId: row.group_id }),
    // IA audit F29: a money screen leads to the «Оплаты» tab of the card, never to the default one
    student: studentHref(studentProfileBasePath, row.student_id, "payments"),
    statement: statementHref(paymentsBase, row.membership_id),
  };
  return (
    <div className="space-y-5 pb-4 pt-3" data-testid="journal-drawer">
      <div>
        <p className={`text-3xl font-semibold tabular-nums tracking-tight ${view.tag ? "text-slate-400 line-through" : "text-slate-800"}`}>{view.amount}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {view.method}
          {view.tag && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{view.tag}</span>}
          {view.correctedChip && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">{view.correctedChip}</span>}
        </p>
        {view.entered && <p className="mt-1 text-xs text-slate-400" data-testid="drawer-entered">{view.entered}</p>}
      </div>

      {view.notes.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-700" data-testid="drawer-notes">
          {view.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}

      <dl className="space-y-2.5 text-sm">
        {view.facts.map((fact) => (
          <div key={fact.label} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3">
            <dt className="text-slate-500">{fact.label}</dt>
            <dd className="break-words font-medium text-slate-900">
              {fact.label === "Ученик" ? <Link href={hrefs.student} className="hover:text-primary-700 hover:underline">{fact.value}</Link>
                : fact.label === "Группа" && row.group_id ? <Link href={groupHref(basesOfPayments(paymentsBase).groups, row.group_id, "payments")} data-testid="drawer-group-link" className="hover:text-primary-700 hover:underline">{fact.value}</Link>
                : fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {view.destination.length > 0 && (
        <section aria-label="Куда пошли деньги">
          <h3 className="text-sm font-semibold text-slate-800">Куда пошли деньги</h3>
          <ul className="mt-1.5 space-y-1 border-l-2 border-slate-100 pl-3 text-sm text-slate-700" data-testid="drawer-destination">
            {view.destinationItems.map((line) => (
              <li key={line.text} className="flex items-start gap-2" data-kind-dot={line.dot ?? undefined}>
                {line.dot && <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${line.dot}`} aria-hidden />}
                <span className="min-w-0 break-words">{line.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.note && (
        <section aria-label="Комментарий">
          <h3 className="text-sm font-semibold text-slate-800">Комментарий</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{view.note}</p>
        </section>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap">
        {view.links.map((link) => (
          <Link
            key={link.key}
            href={hrefs[link.key]}
            data-testid={`drawer-link-${link.key}`}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium ${link.key === "receipt" ? "bg-primary-600 text-white hover:bg-primary-700" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The side drawer of a desktop, the bottom sheet of a phone. */
export function JournalDrawer({ row, onClose, paymentsBase, studentProfileBasePath }: { row: JournalRow | null; onClose: () => void; paymentsBase: string; studentProfileBasePath: string }) {
  const view = row ? drawerView(row) : null;
  return (
    <Modal open={row !== null} placement="sheet" title={view?.title ?? "Оплата"} description={view?.when} onClose={onClose}>
      {row && <JournalDrawerBody row={row} paymentsBase={paymentsBase} studentProfileBasePath={studentProfileBasePath} />}
    </Modal>
  );
}

// ── The section: toolbar, state, rows, pages ───────────────────────────────

export interface JournalSectionProps {
  journal: PaymentsJournal | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  search: string;
  onSearch: (value: string) => void;
  createdBy: string;
  onCreatedBy: (value: string) => void;
  /** Authors of the payments of the period, from the server: the filter «Кто внёс». */
  authors: JournalAuthor[];
  /** A bar of the chart narrowed the journal to this label (a day / a month). */
  focusLabel: string | null;
  onClearFocus: () => void;
  /** A segment of the donut narrowed the journal to this method («Наличные»); null when every method is shown. */
  methodLabel?: string | null;
  onClearMethod?: () => void;
  /** A part of «Куда ушли деньги» narrowed the journal to this kind (INC-16). */
  kind?: FlowKind | "";
  onClearKind?: () => void;
  /** «Сбросить всё»: removes the day, the method and the kind at once. */
  onClearAll?: () => void;
  /** The toggle «Показать отменённые и исправленные (N)»: off = only live payments. */
  showVoided?: boolean;
  onToggleVoided?: () => void;
  empty: EmptyContext;
  onResetNarrowing: () => void;
  onPage: (page: number) => void;
  onExport: () => void;
  exporting: boolean;
  activeId: string | null;
  onOpen: (row: JournalRow) => void;
}

export function JournalSection(props: JournalSectionProps) {
  const { journal, loading, error, authors, focusLabel, methodLabel, kind = "", showVoided = false } = props;
  const paging = journal ? journalPaging(journal) : null;
  const withYear = journal ? journalSpansYears(journal.from, journal.to) : false;
  const totals = journal ? journalTotalsText(journal.totals) : "";
  const showAuthors = authors.length > 1;
  const chips = filterChips({ day: focusLabel, method: methodLabel, kind });
  const hidden = hiddenPaymentsCount(journal?.totals);
  const toggle = Boolean(props.onToggleVoided) && Boolean(journal) && hidden > 0; // nothing to bring back (also under a `kind`: those rows have no split) = no button
  const clear: Record<"day" | "method" | "kind", (() => void) | undefined> = { day: props.onClearFocus, method: props.onClearMethod, kind: props.onClearKind };
  const testId: Record<"day" | "method" | "kind", string> = { day: "journal-focus", method: "journal-method", kind: "journal-kind" };
  // Nothing in the period and nothing narrowed: the sentence and the card above already said so; no search, no Excel, one quiet line.
  if (!error && journalIsQuiet(journal, props.empty)) {
    return (
      <section aria-label="Журнал оплат" data-testid="income-journal">
        <p className="px-1 text-sm text-slate-600" data-testid="journal-quiet">{JOURNAL_QUIET_TEXT}</p>
      </section>
    );
  }
  return (
    <section aria-label="Журнал оплат" className="space-y-3" data-testid="income-journal">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="Ученик, ID или № квитанции"
            aria-label="Поиск по оплатам"
            className={`${FIELD} w-full pl-9`}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:ml-auto">
          {showAuthors && (
            <Select
              ariaLabel="Кто внёс оплату"
              testId="journal-created-by"
              value={props.createdBy}
              onChange={(event) => props.onCreatedBy(event.target.value)}
              options={[
                { value: "", label: "Кто внёс: все" },
                ...authors.map((author) => ({ value: author.user_id, label: `${author.name || "Без имени"} · ${author.count}` })),
              ]}
              className="w-full sm:w-auto sm:min-w-[15rem]"
              buttonClassName="h-10 bg-white px-3.5 py-0 font-medium text-slate-700 shadow-none hover:bg-slate-50"
            />
          )}
          <button
            type="button"
            onClick={props.onExport}
            disabled={props.exporting || !journal || journal.total === 0}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl sm:w-auto border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:opacity-50"
          >
            {props.exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4 text-slate-400" aria-hidden />}
            Скачать Excel
          </button>
        </div>
      </div>

      {(chips.length > 0 || totals || toggle) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Что показано в журнале" data-testid="journal-chips">
              {chips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-primary-50 py-1 pl-3 pr-1 text-sm font-medium text-primary-800" data-testid={testId[chip.key]}>
                  {chip.label}
                  <button type="button" onClick={clear[chip.key]} aria-label={chip.clearLabel} title={chip.clearLabel} className="rounded-full p-1 text-primary-600 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"><X className="h-3.5 w-3.5" aria-hidden /></button>
                </span>
              ))}
              {props.onClearAll && (
                <button type="button" onClick={props.onClearAll} data-testid="journal-clear-all" className="rounded-lg px-2 py-1 text-sm font-medium text-primary-700 hover:bg-primary-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">Сбросить всё</button>
              )}
            </div>
          )}
          {totals && <span data-testid="journal-totals">{totals}</span>}
          {toggle && (
            <button
              type="button"
              onClick={props.onToggleVoided}
              aria-pressed={showVoided}
              data-testid="journal-voided-toggle"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${showVoided ? "border-primary-200 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {showVoided && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {journal ? showVoidedLabel(journal.totals) : null}
            </button>
          )}
        </div>
      )}

      <div className={`transition-opacity ${loading && journal ? "opacity-60" : ""}`} aria-busy={loading}>
        {error ? (
          <IncomeError message={error} onRetry={props.onRetry} />
        ) : !journal ? (
          <JournalSkeleton />
        ) : journal.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center" data-testid="journal-empty">
            <p className="text-sm font-medium text-slate-600">{journalEmptyText(props.empty)}</p>
            {props.empty.narrowed && (
              <button type="button" onClick={props.onResetNarrowing} className="mt-2 text-sm font-medium text-primary-700 hover:underline">Сбросить поиск и фильтры</button>
            )}
          </div>
        ) : (
          <JournalList rows={journal.rows} withYear={withYear} activeId={props.activeId} onOpen={props.onOpen} />
        )}
      </div>

      {journal && paging && journal.rows.length > 0 && (
        <nav aria-label="Страницы журнала" className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500" data-testid="journal-paging">
          <span>{paging.text}</span>
          {paging.pages > 1 && (
            <span className="inline-flex items-center gap-1">
              <button type="button" onClick={() => props.onPage(paging.page - 1)} disabled={!paging.canPrev || loading} aria-label="Предыдущая страница" className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
              <span className="min-w-[5.5rem] text-center tabular-nums">{paging.page} из {paging.pages}</span>
              <button type="button" onClick={() => props.onPage(paging.page + 1)} disabled={!paging.canNext || loading} aria-label="Следующая страница" className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden /></button>
            </span>
          )}
        </nav>
      )}
    </section>
  );
}
