"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { consoleApi } from "../lib/api";
import { can } from "../lib/permissions";
import { useSession } from "../lib/session";
import { errorText, useResource } from "../lib/hooks";
import { DASH, fmtDateTime } from "../lib/format";
import {
  INVARIANTS,
  MONEY_PAGE_SUBTITLE,
  MONEY_PAGE_TITLE,
  findingAmount,
  findingFacts,
  findingMonth,
  invariantLabel,
  mailLabel,
  runStatus,
  runSummary,
  visibleFindings,
} from "../lib/money-reconcile";
import type { MoneyFinding, MoneyReconcile, MoneyRun } from "../lib/types";
import { EmptyState, Facts, LoadFailure, Notice, PageHeader, Panel, Pill, SectionTitle } from "./bits";
import { DataTable, type Column } from "./data-table";
import { Field, FilterBar } from "./filters";

/**
 * «Сверка денег» (Money-1 A7): the result of the nightly check of the money of all centres - the last runs and the divergences of the newest one (centre, what does not add up, the sums,
 * the month).  The right is `audit.view`; no name of a person is on the page (the server sends ids, months and sums only).
 */
export function MoneyReconcileScreen() {
  const { me } = useSession();
  const allowed = can(me, "audit.view");
  // without the right nothing is asked: the section is not in the menu, and the server would refuse anyway
  const data = useResource(allowed ? (signal) => consoleApi.moneyReconcile.get(30, signal) : null, [allowed]);
  if (!allowed) return <Panel><EmptyState title="Нет доступа" text="Сверка денег доступна тем, у кого есть право смотреть журнал." /></Panel>;
  return <MoneyReconcileView data={data.data} loading={data.loading} refreshing={data.refreshing} error={data.error ? errorText(data.error) : null} onReload={data.reload} />;
}

/** The page itself (the data is given): the newest run, its divergences, the last runs, the open divergence. */
export function MoneyReconcileView({ data, loading, refreshing, error, onReload }: {
  data: MoneyReconcile | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [invariant, setInvariant] = useState("");
  const [open, setOpen] = useState<MoneyFinding | null>(null);
  const latest = data?.latest ?? null;
  const findings = useMemo(() => visibleFindings(data?.findings ?? [], invariant), [data, invariant]);

  const findingColumns: Column<MoneyFinding>[] = [
    { key: "org", header: "Центр", primary: true, cell: (r) => r.orgName ?? DASH },
    { key: "what", header: "Что не сошлось", cell: (r) => <span className="block"><span className="block font-medium text-slate-800">{invariantLabel(r.invariant)}</span><span className="block text-xs text-slate-500">{r.what ?? DASH}</span></span> },
    { key: "amount", header: "Сколько", cell: (r) => <span className="whitespace-nowrap">{findingAmount(r)}</span> },
    { key: "month", header: "Месяц", cell: (r) => <span className="whitespace-nowrap text-slate-600">{findingMonth(r)}</span> },
    { key: "new", header: "", cell: (r) => (r.isNew ? <Pill tone="amber">Новое</Pill> : <Pill tone="slate">Было и раньше</Pill>) },
  ];
  const runColumns: Column<MoneyRun>[] = [
    { key: "started", header: "Проверка", cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.startedAt)}</span> },
    { key: "status", header: "Итог", cell: (r) => { const s = runStatus(r.status); return <Pill tone={s.tone}>{s.label}</Pill>; } },
    { key: "centres", header: "Центров", align: "right", cell: (r) => r.centresChecked },
    { key: "found", header: "Расхождений", align: "right", cell: (r) => r.findings },
    { key: "new", header: "Новых", align: "right", cell: (r) => r.newFindings },
    { key: "mail", header: "Письмо", cell: (r) => <span className="text-slate-600">{mailLabel(r.mail).label}</span> },
    { key: "error", header: "Сбой", cell: (r) => <span className="text-slate-600">{r.error ?? DASH}</span> },
  ];

  return (
    <>
      <PageHeader
        title={MONEY_PAGE_TITLE}
        subtitle={MONEY_PAGE_SUBTITLE}
        actions={<Button variant="secondary" size="sm" onClick={onReload} disabled={loading || refreshing} icon={<RefreshCw className="h-4 w-4" />}>Обновить</Button>}
      />

      {loading && !data && <Panel className="p-5 text-sm text-slate-500"><span role="status">Загрузка…</span></Panel>}
      {error && !data && <Panel><LoadFailure message={error} onRetry={onReload} /></Panel>}

      {data && !latest && (
        <Panel>
          <EmptyState title="Проверок ещё не было" text="Первый результат появится после первого ночного запуска проверки на сервере." />
        </Panel>
      )}

      {data && latest && (
        <div className="space-y-5">
          <Panel className="space-y-3 p-4" >
            <div className="flex flex-wrap items-center gap-2" data-testid="money-latest">
              <SectionTitle>Последняя проверка</SectionTitle>
              <Pill tone={runStatus(latest.status).tone}>{runStatus(latest.status).label}</Pill>
              <Pill tone={mailLabel(latest.mail).tone}>{mailLabel(latest.mail).label}</Pill>
            </div>
            <p className="text-sm text-slate-700" data-testid="money-latest-summary">{runSummary(latest)}</p>
            {latest.error && <Notice tone={latest.status === "failed" ? "red" : "amber"}>{latest.error}</Notice>}
          </Panel>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3"><SectionTitle>Расхождения последней проверки</SectionTitle></div>
            {data.findings.length > 0 && (
              <FilterBar onReset={() => setInvariant("")} canReset={Boolean(invariant)}>
                <Field label="Что не сошлось" width="w-64">
                  <Select ariaLabel="Что не сошлось" options={[{ value: "", label: "Всё" }, ...INVARIANTS]} value={invariant} onChange={(e) => setInvariant(e.target.value)} buttonClassName="py-2 text-sm" />
                </Field>
              </FilterBar>
            )}
            <DataTable
              caption="Расхождения последней сверки денег"
              columns={findingColumns}
              rows={findings}
              rowKey={(r) => r.id}
              onOpen={setOpen}
              openLabel={(r) => `Открыть расхождение: ${r.orgName ?? "центр"}, ${invariantLabel(r.invariant)}`}
              selectedKey={open?.id}
              empty={invariant ? { title: "Таких расхождений нет", text: "Измените или сбросьте фильтр." } : { title: "Расхождений нет", text: "Последняя проверка: всё сошлось." }}
            />
          </Panel>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3"><SectionTitle>Последние проверки</SectionTitle></div>
            <DataTable caption="Последние ночные проверки денег" columns={runColumns} rows={data.runs} rowKey={(r) => r.id} empty={{ title: "Проверок ещё не было" }} />
          </Panel>
        </div>
      )}

      <Modal open={Boolean(open)} placement="right" maxWidthClassName="max-w-lg" title={open ? `${open.orgName ?? "Центр"} · ${invariantLabel(open.invariant)}` : "Расхождение"} description={open?.what ?? undefined} onClose={() => setOpen(null)} bodyClassName="flex-1 overflow-y-auto px-5 py-4">
        {open && <FindingDetail finding={open} />}
      </Modal>
    </>
  );
}

/** The open divergence: the centre (a link to its card), what does not add up, the sums, the month, the id of the object and the facts of the server's `details`. */
export function FindingDetail({ finding }: { finding: MoneyFinding }) {
  return (
    <div className="space-y-5" data-testid="money-finding">
      <Facts
        rows={[
          { label: "Центр", value: <Link className="font-medium text-primary-700 underline" href={`/centres/?id=${encodeURIComponent(finding.orgId)}`}>{finding.orgName ?? "Открыть центр"}</Link> },
          { label: "Что не сошлось", value: `${invariantLabel(finding.invariant)} (${finding.invariant})` },
          { label: "Сколько", value: findingAmount(finding) },
          { label: "Месяц", value: findingMonth(finding) },
          { label: "Объект", value: <span className="break-all font-mono text-xs">{finding.subjectId ?? finding.subjectKey}</span> },
          { label: "Состояние", value: finding.isNew ? "Новое: в прошлой проверке этого центра не было" : "Было и в прошлой проверке" },
          ...findingFacts(finding).map((row) => ({ label: row.label, value: row.value })),
        ]}
      />
    </div>
  );
}
