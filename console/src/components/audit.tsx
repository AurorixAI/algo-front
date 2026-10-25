"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { consoleApi } from "../lib/api";
import { useSession } from "../lib/session";
import { can } from "../lib/permissions";
import { errorText, useDebounced, useResource } from "../lib/hooks";
import { DASH, fmtDateTime } from "../lib/format";
import { TARGET_TYPES, targetTypeLabel } from "../lib/labels";
import { EMPTY_AUDIT_FILTERS, auditQuery, hasFilters, type AuditFilters } from "../lib/queries";
import type { AuditRow } from "../lib/types";
import { Facts, PageHeader, Panel } from "./bits";
import { DataTable, Pagination, type Column } from "./data-table";
import { Field, FilterBar, SearchField } from "./filters";

export function AuditScreen() {
  const { me } = useSession();
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<AuditRow | null>(null);
  const q = useDebounced(filters.q);
  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const actions = useResource((signal) => consoleApi.audit.actions(signal), []);
  // The list of colleagues belongs to «Команда»; without that right the filter by person is simply not offered.
  const staff = useResource(can(me, "team.manage") ? (signal) => consoleApi.staff.list(signal) : null, []);
  const list = useResource((signal) => consoleApi.audit.list(auditQuery(effective, page, order), signal), [JSON.stringify([effective, page, order])]);
  const change = (patch: Partial<AuditFilters>) => { setFilters((c) => ({ ...c, ...patch })); setPage(1); };

  const columns: Column<AuditRow>[] = [
    { key: "time", header: "Время", sortKey: "created_at", primary: true, cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.created_at)}</span> },
    { key: "actor", header: "Кто", cell: (r) => (r.actor ? <span className="block"><span className="block">{r.actor.name}</span><span className="block text-xs text-slate-500">{r.actor.email}</span></span> : <span className="text-slate-400">система / заявитель</span>) },
    { key: "action", header: "Действие", cell: (r) => <span className="font-medium text-slate-800">{r.label || r.action}</span> },
    { key: "target", header: "Объект", cell: (r) => (r.target_label || r.target_type ? <span className="block"><span className="block">{r.target_label ?? DASH}</span><span className="block text-xs text-slate-500">{targetTypeLabel(r.target_type)}</span></span> : DASH) },
    { key: "reason", header: "Причина", cell: (r) => <span className="text-slate-600">{r.reason ?? DASH}</span> },
    { key: "ip", header: "IP", cell: (r) => <span className="whitespace-nowrap text-slate-500">{r.ip ?? DASH}</span> },
  ];

  return (
    <>
      <PageHeader title="Журнал" subtitle="Каждое действие команды и каждый вход в консоль. Пароли и ссылки в журнал не попадают." />
      <Panel>
        <FilterBar onReset={() => { setFilters(EMPTY_AUDIT_FILTERS); setPage(1); }} canReset={hasFilters(filters)}>
          <SearchField value={filters.q} onChange={(v) => change({ q: v })} placeholder="Причина, почта, детали" />
          {staff.data && (
            <Field label="Сотрудник" width="w-52">
              <Select
                ariaLabel="Сотрудник"
                options={[{ value: "", label: "Все" }, ...staff.data.items.map((s) => ({ value: s.user_id, label: s.name }))]}
                value={filters.actorId}
                onChange={(e) => change({ actorId: e.target.value })}
                buttonClassName="py-2 text-sm"
              />
            </Field>
          )}
          <Field label="Действие" width="w-64">
            <Select
              ariaLabel="Действие"
              options={[{ value: "", label: "Все действия" }, ...(actions.data?.items ?? []).map((a) => ({ value: a.action, label: a.label }))]}
              value={filters.action}
              onChange={(e) => change({ action: e.target.value })}
              buttonClassName="py-2 text-sm"
            />
          </Field>
          <Field label="Объект" width="w-48">
            <Select ariaLabel="Тип объекта" options={[{ value: "", label: "Все" }, ...TARGET_TYPES]} value={filters.targetType} onChange={(e) => change({ targetType: e.target.value })} buttonClassName="py-2 text-sm" />
          </Field>
          <Field label="С даты" width="w-40"><DateInput value={filters.dateFrom} onChange={(v) => change({ dateFrom: v })} aria-label="С даты" /></Field>
          <Field label="По дату" width="w-40"><DateInput value={filters.dateTo} onChange={(v) => change({ dateTo: v })} aria-label="По дату" /></Field>
        </FilterBar>
        <DataTable
          caption="Журнал платформы"
          columns={columns}
          rows={list.data?.items ?? null}
          rowKey={(r) => r.id}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          onOpen={setOpen}
          openLabel={(r) => `Открыть запись журнала: ${r.label}, ${fmtDateTime(r.created_at)}`}
          selectedKey={open?.id}
          sort={{ key: "created_at", order }}
          onSort={() => { setOrder((o) => (o === "desc" ? "asc" : "desc")); setPage(1); }}
          empty={hasFilters(filters) ? { title: "Записей не найдено", text: "Измените или сбросьте фильтры." } : { title: "Журнал пуст", text: "Здесь появятся входы и действия команды." }}
        />
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.page_size} onPage={setPage} disabled={list.refreshing} />}
      </Panel>

      <Modal open={Boolean(open)} placement="right" maxWidthClassName="max-w-lg" title={open?.label ?? "Запись журнала"} description={open ? fmtDateTime(open.created_at) : undefined} onClose={() => setOpen(null)} bodyClassName="flex-1 overflow-y-auto px-5 py-4">
        {open && (
          <div className="space-y-5">
            <Facts
              rows={[
                { label: "Кто", value: open.actor ? `${open.actor.name} · ${open.actor.email}` : "система / заявитель" },
                { label: "Действие", value: `${open.label} (${open.action})` },
                { label: "Объект", value: `${targetTypeLabel(open.target_type)}${open.target_label ? `: ${open.target_label}` : ""}` },
                { label: "Причина", value: open.reason ?? DASH },
                { label: "IP", value: open.ip ?? DASH },
                { label: "Браузер", value: <span className="break-all text-xs text-slate-600">{open.user_agent ?? DASH}</span> },
              ]}
            />
            {open.details && Object.keys(open.details).length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Детали</p>
                <Facts rows={Object.entries(open.details).map(([key, value]) => ({ label: key, value: <span className="break-words font-mono text-xs">{typeof value === "string" ? value : JSON.stringify(value)}</span> }))} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
