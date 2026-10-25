"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { consoleApi } from "../lib/api";
import { useSession } from "../lib/session";
import { can } from "../lib/permissions";
import { errorText, useDebounced, useResource, useUrlId } from "../lib/hooks";
import { DASH, fmtCount, fmtDate, fmtDateTime, fmtPhone } from "../lib/format";
import { orgRoleLabel, orgStatus } from "../lib/labels";
import { EMPTY_ORG_FILTERS, PAGE_SIZE, hasFilters, orgsQuery, type OrgFilters } from "../lib/queries";
import { LIMITS, limitWarnings, validateLimits, validateReason } from "../lib/forms";
import type { Org, OrgCard } from "../lib/types";
import { Facts, Notice, PageHeader, Panel, Pill, SectionTitle } from "./bits";
import { DataTable, Pagination, nextSort, type Column, type SortState } from "./data-table";
import { ConfirmDialog } from "./dialogs";
import { Field, FilterBar, SearchField } from "./filters";
import { History } from "./history";

const STATUS_OPTIONS = [
  { value: "", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "blocked", label: "Заблокированные" },
  { value: "pending", label: "Ожидают" },
  { value: "rejected", label: "Отклонённые" },
];

export function CentresScreen() {
  const { me } = useSession();
  const [filters, setFilters] = useState<OrgFilters>(EMPTY_ORG_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: "created_at", order: "desc" });
  const [openId, setOpenId] = useUrlId();
  const { showToast, toastNode } = useToast();
  const q = useDebounced(filters.q);
  const city = useDebounced(filters.city);
  const effective = useMemo(() => ({ ...filters, q, city }), [filters, q, city]);
  const list = useResource((signal) => consoleApi.orgs.list(orgsQuery(effective, page, sort), signal), [JSON.stringify([effective, page, sort])]);
  const change = (patch: Partial<OrgFilters>) => { setFilters((c) => ({ ...c, ...patch })); setPage(1); };

  const columns: Column<Org>[] = [
    {
      key: "name", header: "Центр", sortKey: "name", primary: true,
      cell: (o) => <span className="block"><span className="block">{o.name}</span><span className="block text-xs font-normal text-slate-500">{o.city ?? DASH}</span></span>,
    },
    { key: "status", header: "Статус", cell: (o) => <Pill tone={orgStatus(o.status).tone}>{orgStatus(o.status).label}</Pill> },
    { key: "plan", header: "Тариф", cell: (o) => o.plan ?? DASH },
    { key: "students", header: "Ученики", sortKey: "students", align: "right", cell: (o) => o.students },
    { key: "teachers", header: "Учителя", sortKey: "teachers", align: "right", cell: (o) => o.teachers },
    { key: "groups", header: "Группы", sortKey: "groups", align: "right", cell: (o) => o.groups },
    { key: "active", header: "Активных 7 / 30 дн.", sortKey: "active_users_7d", align: "right", cell: (o) => `${o.active_users_7d} / ${o.active_users_30d}` },
    { key: "last", header: "Последний вход", sortKey: "last_login_at", cell: (o) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(o.last_login_at)}</span> },
    { key: "created", header: "Создан", sortKey: "created_at", cell: (o) => <span className="whitespace-nowrap text-slate-600">{fmtDate(o.created_at)}</span> },
  ];

  return (
    <>
      <PageHeader title="Центры" subtitle="Все центры платформы, их размер и активность." />
      <Panel>
        <FilterBar onReset={() => { setFilters(EMPTY_ORG_FILTERS); setPage(1); }} canReset={hasFilters(filters)}>
          <SearchField value={filters.q} onChange={(v) => change({ q: v })} placeholder="Название, город, почта, телефон" />
          <Field label="Статус" width="w-48"><Select ariaLabel="Статус центра" options={STATUS_OPTIONS} value={filters.status} onChange={(e) => change({ status: e.target.value })} buttonClassName="py-2 text-sm" /></Field>
          <Field label="Город" width="w-40"><Input aria-label="Город" value={filters.city} onChange={(e) => change({ city: e.target.value })} className="py-2 text-sm" /></Field>
        </FilterBar>
        <DataTable
          caption="Центры"
          columns={columns}
          rows={list.data?.items ?? null}
          rowKey={(o) => o.id}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          onOpen={(o) => setOpenId(o.id)}
          openLabel={(o) => `Открыть центр: ${o.name}`}
          selectedKey={openId}
          sort={sort}
          onSort={(key) => { setSort((c) => nextSort(c, key, key === "name" ? "asc" : "desc")); setPage(1); }}
          empty={hasFilters(filters) ? { title: "Ничего не найдено", text: "Измените или сбросьте фильтры." } : { title: "Центров пока нет", text: "Центр появляется после одобрения заявки." }}
        />
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={PAGE_SIZE} onPage={setPage} disabled={list.refreshing} />}
      </Panel>
      <CentreCard id={openId} canManage={can(me, "orgs.manage")} canBlock={can(me, "orgs.block")} onClose={() => setOpenId(null)} onChanged={list.reload} toast={showToast} />
      {toastNode}
    </>
  );
}

function CentreCard({
  id, canManage, canBlock, onClose, onChanged, toast,
}: {
  id: string | null; canManage: boolean; canBlock: boolean; onClose: () => void; onChanged: () => void;
  toast: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}) {
  const card = useResource(id ? (signal) => consoleApi.orgs.get(id, signal) : null, [id]);
  const data = card.data && card.data.id === id ? card.data : null;
  const [dialog, setDialog] = useState<"block" | "unblock" | "limits" | null>(null);
  const blocked = Boolean(data?.blocked_at) || data?.status === "blocked";
  const done = () => { card.reload(); onChanged(); };

  return (
    <>
      <Modal
        open={Boolean(id)}
        placement="right"
        maxWidthClassName="max-w-xl"
        title={data?.name ?? "Центр"}
        description={data ? <Pill tone={orgStatus(data.status).tone}>{orgStatus(data.status).label}</Pill> : undefined}
        onClose={onClose}
        bodyClassName="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
        footer={
          data && canBlock && (data.status === "active" || data.status === "blocked") ? (
            blocked ? (
              <Button variant="secondary" onClick={() => setDialog("unblock")} icon={<CheckCircle2 className="h-4 w-4" />}>Разблокировать</Button>
            ) : (
              <Button variant="danger" onClick={() => setDialog("block")} icon={<Ban className="h-4 w-4" />}>Заблокировать</Button>
            )
          ) : undefined
        }
      >
        {card.loading && !data && <div className="space-y-3" role="status" aria-label="Загрузка центра">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />)}</div>}
        {card.error && !data && <Notice tone="red">{errorText(card.error)} <button type="button" className="ml-1 underline" onClick={card.reload}>Повторить</button></Notice>}
        {data && <CentreBody data={data} canManage={canManage} onLimits={() => setDialog("limits")} />}
      </Modal>
      {data && (
        <>
          <ConfirmDialog
            open={dialog === "block"}
            title="Заблокировать центр"
            description={data.name}
            confirmLabel="Заблокировать"
            danger
            onClose={() => setDialog(null)}
            reason={{ label: "Причина (обязательно)", required: true, validate: validateReason, placeholder: "Например: неоплата за октябрь", hint: "Увидит только команда ALGO." }}
            onConfirm={async ({ reason }) => { await consoleApi.orgs.block(data.id, reason); toast("Центр заблокирован"); done(); }}
          >
            <Notice tone="amber">Сотрудники центра сразу потеряют доступ: вход и любые запросы получат отказ «Доступ центра приостановлен».</Notice>
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "unblock"}
            title="Разблокировать центр"
            description={data.name}
            confirmLabel="Разблокировать"
            onClose={() => setDialog(null)}
            reason={{ label: "Комментарий (необязательно)" }}
            onConfirm={async ({ reason }) => { await consoleApi.orgs.unblock(data.id, reason || undefined); toast("Центр разблокирован"); done(); }}
          />
          <LimitsDialog
            open={dialog === "limits"}
            org={data}
            onClose={() => setDialog(null)}
            onSaved={(warnings) => {
              if (warnings.length) toast("Лимиты сохранены, но есть предупреждение", "warning", warnings);
              else toast("Лимиты сохранены");
              done();
            }}
          />
        </>
      )}
    </>
  );
}

function CentreBody({ data, canManage, onLimits }: { data: OrgCard; canManage: boolean; onLimits: () => void }) {
  const usage = data.usage_30d;
  return (
    <div className="space-y-6">
      {data.blocked_at && (
        <Notice tone="red">Заблокирован {fmtDateTime(data.blocked_at)}{data.blocked_reason ? `: ${data.blocked_reason}` : ""}</Notice>
      )}
      <section>
        <SectionTitle>Контакты</SectionTitle>
        <Facts
          rows={[
            { label: "Владелец", value: data.owner ? `${data.owner.name} · ${data.owner.email}` : DASH },
            { label: "Телефон", value: fmtPhone(data.phone) },
            { label: "Почта", value: data.email ?? DASH },
            { label: "Город", value: data.city ?? DASH },
            { label: "Адрес", value: data.address ?? DASH },
            { label: "Тариф", value: data.plan ?? DASH },
            { label: "Создан", value: fmtDateTime(data.created_at) },
            { label: "Последний вход", value: fmtDateTime(data.last_login_at) },
          ]}
        />
      </section>
      <section>
        <SectionTitle aside={canManage ? <Button variant="ghost" size="sm" onClick={onLimits} icon={<Gauge className="h-3.5 w-3.5" />}>Изменить</Button> : undefined}>Размер и лимиты</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Ученики" value={`${data.students}`} sub={`лимит ${data.max_students ?? DASH}`} />
          <Stat label="Учителя" value={`${data.teachers}`} sub={`лимит ${data.max_teachers ?? DASH}`} />
          <Stat label="Группы" value={`${data.groups}`} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Активных пользователей: за 7 дней — {data.active_users_7d}, за 30 дней — {data.active_users_30d}.</p>
      </section>
      <section>
        <SectionTitle>Использование за 30 дней</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Отметки" value={fmtCount(usage.attendance_marks)} />
          <Stat label="Оплаты" value={fmtCount(usage.payments)} />
          <Stat label="Экзамены" value={fmtCount(usage.exams)} />
          <Stat label="Диагностики" value={fmtCount(usage.diagnostics)} />
        </div>
      </section>
      <section>
        <SectionTitle>Сотрудники центра</SectionTitle>
        {data.members.length === 0 ? (
          <p className="text-sm text-slate-400">Сотрудников нет.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {data.members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{m.name}</p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  <p>{orgRoleLabel(m.org_role)}{!m.is_active && " · отключён"}</p>
                  <p>{m.last_login_at ? fmtDateTime(m.last_login_at) : "не входил"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <SectionTitle>История действий</SectionTitle>
        <History rows={data.history} />
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function LimitsDialog({ open, org, onClose, onSaved }: { open: boolean; org: OrgCard; onClose: () => void; onSaved: (warnings: string[]) => void }) {
  const [students, setStudents] = useState("");
  const [teachers, setTeachers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setStudents(String(org.max_students ?? "")); setTeachers(String(org.max_teachers ?? "")); setError(null); setBusy(false); }
  }, [open, org.max_students, org.max_teachers]);
  const errors = validateLimits({ students, teachers });
  const warnings = limitWarnings({ students, teachers }, { students: org.students, teachers: org.teachers });
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) setTouched(false); }, [open]);

  const save = async () => {
    setTouched(true);
    if (busy || errors.students || errors.teachers) return;
    setBusy(true);
    setError(null);
    try {
      const patch: { max_students?: number; max_teachers?: number } = {};
      if (Number(students) !== org.max_students) patch.max_students = Number(students);
      if (Number(teachers) !== org.max_teachers) patch.max_teachers = Number(teachers);
      if (Object.keys(patch).length === 0) { onClose(); return; }
      const result = await consoleApi.orgs.setLimits(org.id, patch);
      onSaved(result.warnings ?? []);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Лимиты центра"
      description={org.name}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button><Button onClick={save} loading={busy}>Сохранить</Button></>}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="limit-students" className="mb-1.5 block text-sm font-medium text-slate-700">Максимум учеников <span className="font-normal text-slate-400">(сейчас {org.students})</span></label>
          <NumberInput id="limit-students" value={students} onChange={setStudents} min={LIMITS.students.min} max={LIMITS.students.max} stepper step={10} invalid={touched && Boolean(errors.students)} />
          {touched && errors.students && <p className="mt-1.5 text-xs text-red-500">{errors.students}</p>}
        </div>
        <div>
          <label htmlFor="limit-teachers" className="mb-1.5 block text-sm font-medium text-slate-700">Максимум учителей <span className="font-normal text-slate-400">(сейчас {org.teachers})</span></label>
          <NumberInput id="limit-teachers" value={teachers} onChange={setTeachers} min={LIMITS.teachers.min} max={LIMITS.teachers.max} stepper invalid={touched && Boolean(errors.teachers)} />
          {touched && errors.teachers && <p className="mt-1.5 text-xs text-red-500">{errors.teachers}</p>}
        </div>
        {warnings.length > 0 && <Notice tone="amber">{warnings.map((w) => <span key={w} className="block">{w}</span>)}<span className="mt-1 block">Лимит всё равно сохранится — это только предупреждение.</span></Notice>}
        {error && <Notice tone="red">{error}</Notice>}
      </div>
    </Modal>
  );
}
