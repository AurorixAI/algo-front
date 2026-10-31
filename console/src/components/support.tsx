"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Paperclip, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { consoleApi } from "../lib/api";
import { useSession } from "../lib/session";
import { can } from "../lib/permissions";
import { errorText, useDebounced, useResource, useUrlId } from "../lib/hooks";
import { DASH, fmtDateTime } from "../lib/format";
import { SETTABLE_SUPPORT_STATUSES, SUPPORT_ROLES, SUPPORT_STATUSES, supportMailMark, supportResolvedNote, supportStatus } from "../lib/labels";
import { EMPTY_SUPPORT_FILTERS, PAGE_SIZE, hasFilters, supportQuery, type SupportFilters } from "../lib/queries";
import type { SupportMail, SupportStatus, SupportTicket, SupportTicketCard } from "../lib/types";
import { Facts, Notice, PageHeader, Panel, Pill, SectionTitle } from "./bits";
import { DataTable, Pagination, nextSort, type Column, type SortState } from "./data-table";
import { Field, FilterBar, SearchField } from "./filters";
import { History } from "./history";
import { notifySupportChanged } from "./shell";

const REPLY_MAX = 4000;

/** Plaques of a row that need a person's eye: the author has no access any more; a letter did not go.  Under the text (always on screen, also on a phone). */
function TicketFlags({ ticket }: { ticket: SupportTicket }) {
  const mail = supportMailMark(ticket.team_mail, false);
  if (ticket.author.has_access && !(mail?.problem) && ticket.attachments_count === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1" data-testid="support-flags">
      {!ticket.author.has_access && <Pill tone="amber" className="whitespace-normal">у автора нет доступа</Pill>}
      {mail?.problem && <Pill tone="red" className="whitespace-normal">{mail.text}</Pill>}
      {ticket.attachments_count > 0 && <Pill tone="slate"><Paperclip className="mr-1 h-3 w-3" aria-hidden />{ticket.attachments_count}</Pill>}
    </span>
  );
}

export function SupportScreen() {
  const { me } = useSession();
  const canManage = can(me, "support.manage");
  const [filters, setFilters] = useState<SupportFilters>(EMPTY_SUPPORT_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: "updated_at", order: "desc" });
  const [openId, setOpenId] = useUrlId();
  const { showToast, toastNode } = useToast();

  const debouncedQ = useDebounced(filters.q);
  const debouncedOrg = useDebounced(filters.org);
  const effective = useMemo(() => ({ ...filters, q: debouncedQ, org: debouncedOrg }), [filters, debouncedQ, debouncedOrg]);
  const queryKey = JSON.stringify([effective, page, sort]);
  const list = useResource((signal) => consoleApi.support.list(supportQuery(effective, page, sort), signal), [queryKey]);

  const change = (patch: Partial<SupportFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const columns: Column<SupportTicket>[] = [
    { key: "number", header: "№", sortKey: "number", cell: (t) => <span className="whitespace-nowrap font-medium text-slate-900">№{t.number}</span> },
    {
      key: "text",
      header: "Обращение",
      primary: true,
      cell: (t) => (
        <span className="block min-w-0">
          <span className="block max-w-md break-words text-slate-900 line-clamp-2">{t.preview}</span>
          <TicketFlags ticket={t} />
        </span>
      ),
    },
    {
      key: "author",
      header: "Автор",
      cell: (t) => (
        <span className="block">
          <span className="block">{t.author.name || DASH}</span>
          <span className="block text-xs text-slate-500">{t.author.role_text} · {t.org.name}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Статус",
      sortKey: "status",
      cell: (t) => {
        const s = supportStatus(t.status);
        return <Pill tone={s.tone}>{s.label}</Pill>;
      },
    },
    { key: "updated", header: "Обновлено", sortKey: "updated_at", cell: (t) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(t.updated_at)}</span> },
  ];

  const counts = list.data?.counts;
  const refreshAll = () => { list.reload(); notifySupportChanged(); };

  return (
    <>
      <PageHeader title="Обращения" subtitle="Вопросы и сбои от владельцев, администраторов и преподавателей центров." />
      <Panel>
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-3 pt-3" role="tablist" aria-label="Статус обращения">
          {[{ value: "", label: "Все", count: counts?.all }, ...SUPPORT_STATUSES.map((s) => ({ value: s.value as string, label: s.label, count: counts?.[s.value] }))].map((tab) => {
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
        <FilterBar onReset={() => { setFilters(EMPTY_SUPPORT_FILTERS); setPage(1); }} canReset={hasFilters(filters)}>
          <SearchField value={filters.q} onChange={(q) => change({ q })} placeholder="Номер, текст, автор" width="w-64" />
          <Field label="Центр" width="w-48"><Input aria-label="Центр" placeholder="Название центра" value={filters.org} onChange={(e) => change({ org: e.target.value })} className="py-2 text-sm" /></Field>
          <Field label="Роль автора" width="w-48">
            <Select
              ariaLabel="Роль автора"
              options={[{ value: "", label: "Все" }, ...SUPPORT_ROLES]}
              value={filters.role}
              onChange={(e) => change({ role: e.target.value })}
              buttonClassName="py-2 text-sm"
            />
          </Field>
        </FilterBar>
        {list.data && list.data.items.length > 0 && (
          <ul className="divide-y divide-slate-100 md:hidden" data-testid="support-cards" aria-label="Обращения в поддержку">
            {list.data.items.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  aria-label={`Открыть обращение №${t.number}: ${t.org.name}`}
                  data-testid="support-card-row"
                  className="block w-full px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">№{t.number}</span>
                    <Pill tone={supportStatus(t.status).tone}>{supportStatus(t.status).label}</Pill>
                  </span>
                  <span className="mt-0.5 block break-words text-sm text-slate-600">{t.org.name} · {t.author.role_text}</span>
                  <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-slate-900">{t.preview}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{fmtDateTime(t.updated_at)}</span>
                    <TicketFlags ticket={t} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={list.data && list.data.items.length > 0 ? "hidden md:block" : undefined}>
        <DataTable
          caption="Обращения в поддержку"
          columns={columns}
          rows={list.data?.items ?? null}
          rowKey={(t) => t.id}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          onOpen={(t) => setOpenId(t.id)}
          openLabel={(t) => `Открыть обращение №${t.number}: ${t.org.name}`}
          selectedKey={openId}
          sort={sort}
          onSort={(key) => { setSort((current) => nextSort(current, key, key === "status" ? "asc" : "desc")); setPage(1); }}
          empty={
            hasFilters(filters)
              ? { title: "Ничего не найдено", text: "Измените или сбросьте фильтры." }
              : { title: "Обращений пока нет", text: "Когда владелец, администратор или преподаватель напишет в поддержку, обращение появится здесь." }
          }
        />
        </div>
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={PAGE_SIZE} onPage={setPage} disabled={list.refreshing} />}
      </Panel>

      <TicketCardView id={openId} canManage={canManage} onClose={() => setOpenId(null)} onChanged={refreshAll} toast={showToast} />
      {toastNode}
    </>
  );
}

function MailMark({ mail, toAuthor }: { mail: SupportMail | null | undefined; toAuthor: boolean }) {
  const mark = supportMailMark(mail, toAuthor);
  if (!mark) return null;
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${mark.problem ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{mark.text}</span>;
}

function TicketCardView({
  id, canManage, onClose, onChanged, toast,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}) {
  const card = useResource(id ? (signal) => consoleApi.support.get(id, signal) : null, [id]);
  const data: SupportTicketCard | null = card.data && card.data.id === id ? card.data : null;
  const [status, setStatus] = useState<Exclude<SupportStatus, "new">>("in_progress");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | undefined>();
  const [replyBusy, setReplyBusy] = useState(false);
  const replyFlag = useRef(false); // a second click before the screen repaints must not send a second answer (LESSONS 27)
  const statusFlag = useRef(false);

  useEffect(() => {
    if (data && data.status !== "new") setStatus(data.status);
    setStatusError(null);
  }, [data?.id, data?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setReply(""); setReplyError(undefined); }, [id]);

  const saveStatus = async () => {
    if (!data || statusFlag.current || status === data.status) return;
    statusFlag.current = true;
    setStatusBusy(true);
    setStatusError(null);
    try {
      await consoleApi.support.setStatus(data.id, status);
      toast("Статус обновлён");
      card.reload();
      onChanged();
    } catch (error) {
      setStatusError(errorText(error));
    } finally {
      statusFlag.current = false;
      setStatusBusy(false);
    }
  };

  const sendReply = async () => {
    if (!data || replyFlag.current) return;
    const text = reply.trim();
    if (!text) { setReplyError("Напишите ответ"); return; }
    if (text.length > REPLY_MAX) { setReplyError(`Слишком длинно — максимум ${REPLY_MAX} символов`); return; }
    replyFlag.current = true;
    setReplyBusy(true);
    setReplyError(undefined);
    try {
      await consoleApi.support.reply(data.id, text);
      setReply("");
      toast(data.author.has_access ? "Ответ отправлен" : "Ответ сохранён — автору напишите письмом", data.author.has_access ? "success" : "warning");
      card.reload();
      onChanged();
    } catch (error) {
      setReplyError(errorText(error));
    } finally {
      replyFlag.current = false;
      setReplyBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(id)}
      placement="right"
      maxWidthClassName="max-w-xl"
      title={data ? `Обращение №${data.number}` : "Обращение"}
      description={data ? <Pill tone={supportStatus(data.status).tone}>{supportStatus(data.status).label}</Pill> : undefined}
      onClose={onClose}
      bodyClassName="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
    >
      {card.loading && !data && <div className="space-y-3" role="status" aria-label="Загрузка обращения">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />)}</div>}
      {card.error && !data && <Notice tone="red">{errorText(card.error)} <button type="button" className="ml-1 underline" onClick={card.reload}>Повторить</button></Notice>}
      {data && (
        <div className="space-y-6" data-testid="support-ticket">
          {!data.author.has_access && (
            <div role="alert" data-testid="support-no-access" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold"><UserX className="h-4 w-4 shrink-0" aria-hidden />У автора нет доступа{data.author.access_note ? ` (${data.author.access_note})` : ""}</p>
              <p className="mt-1">Ответ в кабинете он не прочитает. Напишите ему вручную из почты поддержки{data.author.email ? <>: <a className="break-all font-medium underline" href={`mailto:${data.author.email}`}>{data.author.email}</a></> : "."}</p>
            </div>
          )}
          {supportMailMark(data.team_mail, false)?.problem && (
            <Notice tone="amber">{supportMailMark(data.team_mail, false)?.text}: об этом обращении вы узнали только из консоли.</Notice>
          )}

          <section>
            <SectionTitle>Автор</SectionTitle>
            <Facts
              rows={[
                { label: "Имя", value: data.author.name || DASH },
                { label: "Роль", value: data.author.role_text },
                { label: "Почта", value: data.author.email ? <a className="break-all text-primary-700 hover:underline" href={`mailto:${data.author.email}`}>{data.author.email}</a> : DASH },
                { label: "Центр", value: <Link className="text-primary-700 hover:underline" href={`/centres/?id=${data.org.id}`}>{data.org.name}</Link> },
                { label: "Отправлено", value: fmtDateTime(data.created_at) },
              ]}
            />
          </section>

          <section>
            <SectionTitle>Текст</SectionTitle>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-900" data-testid="support-text-shown">{data.text}</p>
          </section>

          {data.attachments.length > 0 && (
            <section>
              <SectionTitle>Снимки</SectionTitle>
              <ul className="flex flex-wrap gap-3" data-testid="support-shots">
                {data.attachments.map((file) => (
                  <li key={file.id}>
                    <a href={consoleApi.support.fileUrl(file.id)} download className="block rounded-lg border border-slate-200 p-1 hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={consoleApi.support.fileUrl(file.id)} alt={`Снимок ${file.index}`} className="max-h-36 max-w-full rounded-md object-contain" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionTitle>Откуда писал</SectionTitle>
            <Facts
              rows={[
                { label: "Страница", value: data.page_template || DASH },
                { label: "Браузер", value: <span className="break-all text-xs">{data.browser || DASH}</span> },
                {
                  label: "Ошибки",
                  value: data.client_errors.length === 0 ? DASH : (
                    <ul className="space-y-0.5 text-xs">
                      {data.client_errors.map((e, index) => (
                        <li key={`${e.at}-${index}`} className="break-all">{e.status} {e.method} {e.route_template}{e.at ? ` · ${fmtDateTime(e.at)}` : ""}</li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          </section>

          <section>
            <SectionTitle>Переписка</SectionTitle>
            {data.messages.length === 0 && <p className="text-sm text-slate-400">Ответов пока нет.</p>}
            <ul className="space-y-2">
              {data.messages.map((m) => (
                <li key={m.id} className={`rounded-lg p-3 text-sm ${m.from === "staff" ? "bg-primary-50" : "bg-slate-50"}`}>
                  <p className="whitespace-pre-wrap break-words text-slate-900" data-testid={m.from === "staff" ? "support-msg-staff" : "support-msg-author"}>{m.text}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.from === "staff" ? (m.staff_name || "Команда") : data.author.name} · {fmtDateTime(m.created_at)}
                    <MailMark mail={m.mail} toAuthor={m.from === "staff"} />
                  </p>
                </li>
              ))}
            </ul>
            {canManage && (
              <div className="mt-3 space-y-2">
                <Textarea
                  aria-label="Ответ автору"
                  placeholder="Ответ увидит только автор — в «Мои обращения»"
                  rows={3}
                  value={reply}
                  error={replyError}
                  hint={replyError ? undefined : "Автору уйдёт письмо «есть ответ» без текста: сам ответ он прочитает в кабинете."}
                  onChange={(e) => { setReply(e.target.value); setReplyError(undefined); }}
                  data-testid="support-reply"
                />
                <Button size="sm" onClick={sendReply} loading={replyBusy} data-testid="support-reply-send">Ответить</Button>
              </div>
            )}
          </section>

          {canManage && (
            <section>
              <SectionTitle>Статус</SectionTitle>
              <div className="flex items-end gap-2">
                <div className="w-52">
                  <Select
                    ariaLabel="Новый статус обращения"
                    options={SETTABLE_SUPPORT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Exclude<SupportStatus, "new">)}
                    buttonClassName="py-2 text-sm"
                  />
                </div>
                <Button variant="secondary" size="md" onClick={saveStatus} loading={statusBusy} disabled={status === data.status}>Сменить статус</Button>
              </div>
              {statusError && <p role="alert" className="mt-2 text-sm text-red-600">{statusError}</p>}
              {data.resolved_at && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />{supportResolvedNote(data.resolved_kind, fmtDateTime(data.resolved_at), data.resolved_by?.name)}</p>}
            </section>
          )}

          <section>
            <SectionTitle>История</SectionTitle>
            <History rows={data.history} />
          </section>
        </div>
      )}
    </Modal>
  );
}
