"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail, Phone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { consoleApi } from "../lib/api";
import { useSession } from "../lib/session";
import { can } from "../lib/permissions";
import { errorText, useDebounced, useResource, useUrlId } from "../lib/hooks";
import { DASH, fmtDateTime, fmtPhone, sourceLabel } from "../lib/format";
import { MANUAL_REQUEST_STATUSES, REQUEST_STATUSES, isFinalRequest, requestStatus } from "../lib/labels";
import { EMPTY_REQUEST_FILTERS, PAGE_SIZE, hasFilters, requestsQuery, type RequestFilters } from "../lib/queries";
import { validateNote } from "../lib/forms";
import type { ApproveBody, DemoRequest, DemoRequestCard, RequestStatus } from "../lib/types";
import { Facts, Notice, PageHeader, Panel, Pill, SectionTitle } from "./bits";
import { DataTable, Pagination, nextSort, type Column, type SortState } from "./data-table";
import { ConfirmDialog } from "./dialogs";
import { Field, FilterBar, SearchField } from "./filters";
import { History } from "./history";
import { notifyRequestsChanged } from "./shell";

export function RequestsScreen() {
  const { me } = useSession();
  const canManage = can(me, "requests.manage");
  const [filters, setFilters] = useState<RequestFilters>(EMPTY_REQUEST_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: "created_at", order: "desc" });
  const [openId, setOpenId] = useUrlId();
  const [more, setMore] = useState(false);
  const { showToast, toastNode } = useToast();

  const debouncedQ = useDebounced(filters.q);
  const debouncedCity = useDebounced(filters.city);
  const debouncedSource = useDebounced(filters.source);
  const effective = useMemo(
    () => ({ ...filters, q: debouncedQ, city: debouncedCity, source: debouncedSource }),
    [filters, debouncedQ, debouncedCity, debouncedSource],
  );
  const queryKey = JSON.stringify([effective, page, sort]);
  const list = useResource((signal) => consoleApi.requests.list(requestsQuery(effective, page, sort), signal), [queryKey]);

  const change = (patch: Partial<RequestFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const columns: Column<DemoRequest>[] = [
    { key: "created", header: "Получена", sortKey: "created_at", cell: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(r.created_at)}</span> },
    {
      key: "contact",
      header: "Контакт",
      primary: true,
      cell: (r) => (
        <span className="block">
          <span className="block">{r.contact_name}</span>
          <span className="block text-xs font-normal text-slate-500">{r.email}</span>
        </span>
      ),
    },
    {
      key: "centre",
      header: "Центр",
      sortKey: "centre_name",
      cell: (r) => (
        <span className="block">
          <span className="block">{r.centre_name}</span>
          <span className="block text-xs text-slate-500">{r.city}</span>
        </span>
      ),
    },
    { key: "phone", header: "Телефон", cell: (r) => <span className="whitespace-nowrap">{fmtPhone(r.phone)}</span> },
    { key: "students", header: "Учеников", align: "right", cell: (r) => (r.students_count ?? DASH) },
    { key: "source", header: "Источник", cell: (r) => <span className="text-slate-600">{sourceLabel(r.source)}</span> },
    {
      key: "status",
      header: "Статус",
      sortKey: "status",
      cell: (r) => {
        const s = requestStatus(r.status);
        return (
          <span className="flex items-center gap-1.5">
            <Pill tone={s.tone}>{s.label}</Pill>
            {r.is_repeat && <Pill tone="amber">повтор</Pill>}
          </span>
        );
      },
    },
    { key: "handled", header: "Ведёт", cell: (r) => <span className="text-slate-600">{r.handled_by?.name ?? DASH}</span> },
  ];

  const counts = list.data?.counts;
  const refreshAll = () => { list.reload(); notifyRequestsChanged(); };

  return (
    <>
      <PageHeader title="Заявки" subtitle="Запросы демо с сайта: от новой заявки до созданного центра." />
      <Panel>
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-3 pt-3" role="tablist" aria-label="Статус заявки">
          {[{ value: "", label: "Все", count: counts?.all }, ...REQUEST_STATUSES.map((s) => ({ value: s.value as string, label: s.label, count: counts?.[s.value] }))].map((tab) => {
            const active = filters.status === tab.value;
            return (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => change({ status: tab.value })}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${active ? "border-primary-600 text-primary-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                {tab.label}
                {tab.count !== undefined && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${tab.value === "new" && tab.count > 0 ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"}`}>{tab.count}</span>}
              </button>
            );
          })}
        </div>
        <FilterBar onReset={() => { setFilters(EMPTY_REQUEST_FILTERS); setPage(1); }} canReset={hasFilters(filters)}>
          <SearchField value={filters.q} onChange={(q) => change({ q })} placeholder="ФИО, центр, почта, телефон" width="w-72" />
          <Field label="Город" width="w-36"><Input aria-label="Город" value={filters.city} onChange={(e) => change({ city: e.target.value })} className="py-2 text-sm" /></Field>
          <Field label="С даты" width="w-40"><DateInput value={filters.dateFrom} onChange={(v) => change({ dateFrom: v })} aria-label="С даты" /></Field>
          <Field label="По дату" width="w-40"><DateInput value={filters.dateTo} onChange={(v) => change({ dateTo: v })} aria-label="По дату" /></Field>
          <Button variant="ghost" size="sm" onClick={() => setMore((v) => !v)} aria-expanded={more}>{more ? "Меньше фильтров" : "Ещё фильтры"}</Button>
          {more && (
            <>
              <Field label="Источник" width="w-36"><Input aria-label="Источник" placeholder="utm_source" value={filters.source} onChange={(e) => change({ source: e.target.value })} className="py-2 text-sm" /></Field>
              <Field label="Повторные" width="w-40">
                <Select
                  ariaLabel="Повторные заявки"
                  options={[{ value: "", label: "Все" }, { value: "true", label: "Только повторные" }]}
                  value={filters.repeat}
                  onChange={(e) => change({ repeat: e.target.value as RequestFilters["repeat"] })}
                  buttonClassName="py-2 text-sm"
                />
              </Field>
            </>
          )}
        </FilterBar>
        <DataTable
          caption="Заявки на демо"
          columns={columns}
          rows={list.data?.items ?? null}
          rowKey={(r) => r.id}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          onOpen={(r) => setOpenId(r.id)}
          openLabel={(r) => `Открыть заявку: ${r.centre_name}, ${r.contact_name}`}
          selectedKey={openId}
          sort={sort}
          onSort={(key) => { setSort((current) => nextSort(current, key, key === "centre_name" || key === "status" ? "asc" : "desc")); setPage(1); }}
          empty={
            hasFilters(filters)
              ? { title: "Ничего не найдено", text: "Измените или сбросьте фильтры." }
              : { title: "Заявок пока нет", text: "Новые заявки с формы «Запросить демо» появятся здесь." }
          }
        />
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={PAGE_SIZE} onPage={setPage} disabled={list.refreshing} />}
      </Panel>

      <RequestCard
        id={openId}
        canManage={canManage}
        onClose={() => setOpenId(null)}
        onChanged={refreshAll}
        toast={showToast}
      />
      {toastNode}
    </>
  );
}

function RequestCard({
  id, canManage, onClose, onChanged, toast,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}) {
  const card = useResource(id ? (signal) => consoleApi.requests.get(id, signal) : null, [id]);
  const data = card.data && card.data.id === id ? card.data : null;
  const [dialog, setDialog] = useState<"approve" | "decline" | null>(null);
  const [status, setStatus] = useState<RequestStatus>("new");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>();
  const [noteBusy, setNoteBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (data && !isFinalRequest(data.status)) setStatus(data.status);
    setStatusError(null);
  }, [data?.id, data?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNote(""); setNoteError(undefined); setWarning(null); }, [id]);

  const final = data ? isFinalRequest(data.status) : false;

  const saveStatus = async () => {
    if (!data || statusBusy || status === data.status) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      await consoleApi.requests.setStatus(data.id, status as Exclude<RequestStatus, "approved" | "declined">);
      toast("Статус обновлён");
      card.reload();
      onChanged();
    } catch (error) {
      setStatusError(errorText(error));
    } finally {
      setStatusBusy(false);
    }
  };

  const addNote = async () => {
    if (!data || noteBusy) return;
    const problem = validateNote(note);
    if (problem) { setNoteError(problem); return; }
    setNoteBusy(true);
    try {
      await consoleApi.requests.addNote(data.id, note.trim());
      setNote("");
      card.reload();
    } catch (error) {
      setNoteError(errorText(error));
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={Boolean(id)}
        placement="right"
        maxWidthClassName="max-w-xl"
        title={data?.centre_name ?? "Заявка"}
        description={data ? <span className="flex items-center gap-2"><Pill tone={requestStatus(data.status).tone}>{requestStatus(data.status).label}</Pill>{data.is_repeat && <Pill tone="amber">повтор</Pill>}</span> : undefined}
        onClose={onClose}
        bodyClassName="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
        footer={
          data && canManage && !final ? (
            <>
              <Button variant="secondary" onClick={() => setDialog("decline")} icon={<XCircle className="h-4 w-4" />}>Отказать</Button>
              <Button onClick={() => setDialog("approve")} icon={<CheckCircle2 className="h-4 w-4" />}>Одобрить</Button>
            </>
          ) : undefined
        }
      >
        {card.loading && !data && <div className="space-y-3" role="status" aria-label="Загрузка заявки">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />)}</div>}
        {card.error && !data && <Notice tone="red">{errorText(card.error)} <button type="button" className="ml-1 underline" onClick={card.reload}>Повторить</button></Notice>}
        {data && (
          <div className="space-y-6">
            {warning && <Notice tone="amber">{warning}</Notice>}
            <section>
              <SectionTitle>Заявитель</SectionTitle>
              <Facts
                rows={[
                  { label: "ФИО", value: data.contact_name },
                  { label: "Центр", value: `${data.centre_name}, ${data.city}` },
                  { label: "Телефон", value: <a className="inline-flex items-center gap-1 text-primary-700 hover:underline" href={`tel:${data.phone}`}><Phone className="h-3.5 w-3.5" aria-hidden />{fmtPhone(data.phone)}</a> },
                  { label: "Почта", value: <a className="inline-flex items-center gap-1 break-all text-primary-700 hover:underline" href={`mailto:${data.email}`}><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{data.email}</a> },
                  { label: "Учеников", value: data.students_count ?? DASH },
                  { label: "Источник", value: sourceLabel(data.source) },
                  { label: "Получена", value: fmtDateTime(data.created_at) },
                  ...(data.handled_by ? [{ label: "Ведёт", value: data.handled_by.name }] : []),
                ]}
              />
              {data.comment && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{data.comment}</p>}
              {data.same_email.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="text-slate-500">Другие заявки с этой почтой:</p>
                  <ul className="mt-1 space-y-0.5">
                    {data.same_email.map((other) => (
                      <li key={other.id} className="text-slate-700">{fmtDateTime(other.created_at)} · {other.centre_name} · {requestStatus(other.status).label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {data.status === "approved" && data.org && (
              <Notice tone="green">Центр создан: <Link className="font-medium underline" href={`/centres/?id=${data.org.id}`}>{data.org.name}</Link></Notice>
            )}
            {data.status === "declined" && <Notice tone="blue">Отказ{data.decline_reason ? `: ${data.decline_reason}` : " (причина не указана)"}</Notice>}

            {canManage && !final && (
              <section>
                <SectionTitle>Статус</SectionTitle>
                <div className="flex items-end gap-2">
                  <div className="w-52">
                    <Select
                      ariaLabel="Новый статус заявки"
                      options={MANUAL_REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as RequestStatus)}
                      buttonClassName="py-2 text-sm"
                    />
                  </div>
                  <Button variant="secondary" size="md" onClick={saveStatus} loading={statusBusy} disabled={status === data.status}>Сменить статус</Button>
                </div>
                {statusError && <p role="alert" className="mt-2 text-sm text-red-600">{statusError}</p>}
              </section>
            )}

            <section>
              <SectionTitle>Заметки команды</SectionTitle>
              {data.notes.length === 0 && <p className="text-sm text-slate-400">Заметок пока нет.</p>}
              <ul className="space-y-2">
                {data.notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="whitespace-pre-wrap text-slate-800">{n.text}</p>
                    <p className="mt-1 text-xs text-slate-500">{n.author.name} · {fmtDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
              {canManage && (
                <div className="mt-3 space-y-2">
                  <Textarea aria-label="Новая заметка" placeholder="Что важно помнить об этой заявке" rows={2} value={note} error={noteError} onChange={(e) => { setNote(e.target.value); setNoteError(undefined); }} />
                  <Button size="sm" variant="secondary" onClick={addNote} loading={noteBusy} disabled={!note.trim()}>Добавить заметку</Button>
                </div>
              )}
            </section>

            <section>
              <SectionTitle>История</SectionTitle>
              <History rows={data.history} />
            </section>
          </div>
        )}
      </Modal>

      {data && (
        <>
          <ApproveDialog
            open={dialog === "approve"}
            request={data}
            onClose={() => setDialog(null)}
            onDone={(result) => {
              toast("Центр создан");
              if (!result.invite.email_sent) {
                setWarning("Центр создан, но письмо владельцу не ушло. Отправьте ссылку заново из раздела «Пользователи».");
                toast("Письмо владельцу не ушло", "warning");
              }
              card.reload();
              onChanged();
            }}
          />
          <ConfirmDialog
            open={dialog === "decline"}
            title="Отказать в заявке"
            description={`${data.centre_name} · ${data.contact_name}`}
            confirmLabel="Отказать"
            danger
            onClose={() => setDialog(null)}
            reason={{ label: "Причина (необязательно)", placeholder: "Например: центр вне нашего региона", hint: "Видна только команде, если письмо не отправляется." }}
            flag={{ label: "Отправить заявителю письмо с отказом" }}
            onConfirm={async ({ reason, flag }) => {
              await consoleApi.requests.decline(data.id, reason, flag);
              toast("Заявка отклонена");
              card.reload();
              onChanged();
            }}
          />
        </>
      )}
    </>
  );
}

function ApproveDialog({
  open, request, onClose, onDone,
}: { open: boolean; request: DemoRequestCard; onClose: () => void; onDone: (result: Awaited<ReturnType<typeof consoleApi.requests.approve>>) => void }) {
  const [orgName, setOrgName] = useState(request.centre_name);
  const [email, setEmail] = useState(request.email);
  useEffect(() => { if (open) { setOrgName(request.centre_name); setEmail(request.email); } }, [open, request.centre_name, request.email]);

  const body: ApproveBody = {};
  if (orgName.trim() && orgName.trim() !== request.centre_name) body.org_name = orgName.trim();
  if (email.trim() && email.trim().toLowerCase() !== request.email.toLowerCase()) body.owner_email = email.trim();

  return (
    <ConfirmDialog
      open={open}
      title="Одобрить заявку"
      description="Будет создан центр и владелец без пароля."
      confirmLabel="Одобрить и отправить приглашение"
      onClose={onClose}
      onConfirm={async () => {
        const result = await consoleApi.requests.approve(request.id, body);
        onDone(result);
      }}
    >
      <Input label="Название центра" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
      <Input label="Почта владельца (логин)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="text-sm text-slate-500">Владелец — {request.contact_name}. Ему уйдёт письмо «Добро пожаловать в ALGO» со ссылкой «Задать пароль» на 72 часа.</p>
    </ConfirmDialog>
  );
}
