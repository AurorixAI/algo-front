"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { orgApi } from "@/lib/api";
import { basesOfPayments, studentHref } from "@/lib/ia-links";
import {
  DECISION_KINDS, DECISIONS_EMPTY_TEXT, DECISIONS_FILTERED_EMPTY_TEXT, DECISIONS_PAGE_SIZE, decisionAmountText, decisionDebtText, decisionsSinceText, decisionTone, decisionWhen,
  type DecisionRow, type DecisionsPage,
} from "@/lib/payments-decisions";
import { incomeErrorText, type JournalAuthor, type Period } from "@/lib/payments-income-v2";
import { createRequestSequence } from "@/lib/request-sequence";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { DataCell, DataEmpty, DataRow, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Words } from "@/components/ui/words";
import { Select } from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { IncomeError } from "./income-parts";

/** The columns: when, what, whom - text (left); the sum and the debt - money (RIGHT); who decided - text; the arrow shows that the row opens. */
const DECISION_COLUMNS: DataColumn[] = [
  { key: "when", header: "Когда", width: "max-content" },
  { key: "kind", header: "Что", width: "max-content" },
  { key: "who", header: "Ученик · группа", width: "minmax(10rem,1fr)" },
  { key: "amount", header: "Сумма", align: "end", width: "max-content", cardLabel: "Сумма" },
  { key: "debt", header: "Долг", align: "end", width: "max-content", cardLabel: "Долг" },
  { key: "actor", header: "Кто", width: "max-content", cardLabel: "Кто", priority: "low" },
  { key: "open", header: "", align: "end", width: "max-content" },
];

/**
 * «Решения» of «Поступлений» (Money-1 V2): who cancelled or corrected a payment, forgave a debt or gave an advance back - one line each: when · what · whom · the sum · the debt before → after · who.
 * The reason and the receipt are INSIDE the row (it opens); nothing is cut silently - the full text is in the opened row.  The period is the page's; the filters are «Вид» and «Кто».
 */
export function IncomeDecisions({ period, authors, paymentsBase, studentProfileBasePath }: { period: Period; authors: JournalAuthor[]; paymentsBase: string; studentProfileBasePath: string }) {
  const [kind, setKind] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DecisionsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ text: string; denied: boolean } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const requests = useRef(createRequestSequence());

  // another period is another set: the narrowing and the page start again
  useEffect(() => { setPage(1); setOpened(null); }, [period.from, period.to]);

  const load = useCallback(async () => {
    const token = requests.current.next();
    setLoading(true);
    setError(null);
    try {
      const answer = await orgApi.getPaymentDecisions({ from: period.from, to: period.to, kind, actor, page, size: DECISIONS_PAGE_SIZE });
      if (!requests.current.isCurrent(token)) return;
      setData(answer);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      setData(null);
      setError(incomeErrorText(cause));
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [period.from, period.to, kind, actor, page]);

  useEffect(() => {
    void load();
    return () => { requests.current.next(); };
  }, [load]);

  const narrowed = kind !== "" || actor !== "";
  const since = decisionsSinceText(data?.since);
  const bases = basesOfPayments(paymentsBase);

  return (
    <section aria-label="Денежные решения" className="space-y-3" data-testid="income-decisions">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          ariaLabel="Вид решения"
          testId="decisions-kind"
          value={kind}
          onChange={(event) => { setKind(event.target.value); setPage(1); }}
          options={DECISION_KINDS}
          className="w-full sm:w-auto sm:min-w-[14rem]"
          buttonClassName="h-10 bg-white px-3.5 py-0 font-medium text-slate-700 shadow-none hover:bg-slate-50"
        />
        {authors.length > 1 && (
          <Select
            ariaLabel="Кто принял решение"
            testId="decisions-actor"
            value={actor}
            onChange={(event) => { setActor(event.target.value); setPage(1); }}
            options={[{ value: "", label: "Кто: все" }, ...authors.map((author) => ({ value: author.user_id, label: author.name || "Без имени" }))]}
            className="w-full sm:w-auto sm:min-w-[14rem]"
            buttonClassName="h-10 bg-white px-3.5 py-0 font-medium text-slate-700 shadow-none hover:bg-slate-50"
          />
        )}
        {since && <p className="text-sm text-slate-600 sm:ml-auto" data-testid="decisions-since">{since}</p>}
      </div>

      <div className={`transition-opacity ${loading && data ? "opacity-60" : ""}`} aria-busy={loading}>
        {error ? (
          <IncomeError message={error.text} denied={error.denied} onRetry={error.denied ? undefined : () => void load()} />
        ) : !data ? (
          <SkeletonRows count={5} label="Загружаем решения…" testId="decisions-skeleton" />
        ) : data.rows.length === 0 ? (
          <EmptyState
            testId="decisions-empty"
            variant={narrowed ? "filtered" : "card"}
            title={narrowed ? DECISIONS_FILTERED_EMPTY_TEXT : DECISIONS_EMPTY_TEXT}
            action={narrowed ? <Button variant="secondary" size="sm" onClick={() => { setKind(""); setActor(""); setPage(1); }}>Сбросить</Button> : undefined}
          />
        ) : (
          <DataTable columns={DECISION_COLUMNS} minWidth={880} lowBelow={1100} testId="decisions-list">
            {data.rows.map((row) => (
              <DecisionLine key={row.id} row={row} open={opened === row.id} onToggle={() => setOpened(opened === row.id ? null : row.id)} studentLink={row.student_id ? studentHref(bases.students || studentProfileBasePath, row.student_id, "payments") : null} />
            ))}
          </DataTable>
        )}
      </div>

      {data && data.rows.length > 0 && (
        <nav aria-label="Страницы решений" className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500" data-testid="decisions-paging">
          <span>Решений: {data.total}</span>
          {data.pages > 1 && (
            <span className="inline-flex items-center gap-1">
              <Button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} aria-label="Предыдущая страница" variant="secondary" size="icon"><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
              <span className="min-w-[5.5rem] text-center tabular-nums">{data.page} из {data.pages}</span>
              <Button type="button" onClick={() => setPage(page + 1)} disabled={page >= data.pages || loading} aria-label="Следующая страница" variant="secondary" size="icon"><ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </span>
          )}
        </nav>
      )}
    </section>
  );
}

function DecisionLine({ row, open, onToggle, studentLink }: { row: DecisionRow; open: boolean; onToggle: () => void; studentLink: string | null }) {
  const who = [row.student_name, row.group_name].filter(Boolean).join(" · ");
  const debt = decisionDebtText(row);
  return (
    <DataRow
      testId="decision-row"
      onActivate={onToggle}
      expanded={open}
      detail={open && (
        <div className="dt-detail space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700" data-testid="decision-details">
          {row.actor_name && <p>Решение принял(а): <span className="font-medium text-slate-900">{row.actor_name}</span></p>}
          <p>Причина: <span className="break-words font-medium text-slate-900">{row.reason ?? "не указана"}</span></p>
          {row.receipt_no !== null && <p>Квитанция № {row.receipt_no}</p>}
          {studentLink && <Link href={studentLink} className="inline-flex min-h-10 items-center font-medium text-primary-700 hover:underline">Оплаты ученика</Link>}
        </div>
      )}
    >
      <DataCell col="when"><span className="text-sm tabular-nums text-slate-500" data-testid="decision-when">{decisionWhen(row.at)}</span></DataCell>
      <DataCell col="kind"><StatusChip tone={decisionTone(row.kind)} bleed testId="decision-kind">{row.kind_label}</StatusChip></DataCell>
      <DataCell col="who"><span className="text-sm font-medium text-slate-900"><Words text={who} /></span></DataCell>
      <DataCell col="amount"><span className="whitespace-nowrap text-sm font-medium text-slate-800" data-testid="decision-amount">{decisionAmountText(row)}</span></DataCell>
      <DataCell col="debt"><span className="whitespace-nowrap text-sm text-slate-600" data-testid="decision-debt">{debt === "—" ? <DataEmpty /> : `Долг ${debt}`}</span></DataCell>
      <DataCell col="actor"><span className="text-sm text-slate-600">{row.actor_name ? <Words text={row.actor_name} /> : <DataEmpty />}</span></DataCell>
      <DataCell col="open"><ChevronDown aria-hidden className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} /></DataCell>
    </DataRow>
  );
}
