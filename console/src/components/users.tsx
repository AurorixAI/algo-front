"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, KeyRound, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { consoleApi } from "../lib/api";
import { useSession } from "../lib/session";
import { can } from "../lib/permissions";
import { errorText, useDebounced, useResource, useUrlId } from "../lib/hooks";
import { DASH, fmtDateTime } from "../lib/format";
import { orgRoleLabel, userStatus } from "../lib/labels";
import { EMPTY_USER_FILTERS, PAGE_SIZE, USER_SEARCH_MIN, canSearchUsers, hasFilters, usersQuery, type UserFilters } from "../lib/queries";
import { validateReason } from "../lib/forms";
import type { LinkSent, PlatformUser } from "../lib/types";
import { EmptyState, Facts, Notice, PageHeader, Panel, Pill, SectionTitle } from "./bits";
import { DataTable, Pagination, nextSort, type Column, type SortState } from "./data-table";
import { ConfirmDialog } from "./dialogs";
import { Field, FilterBar, SearchField } from "./filters";
import { History } from "./history";

const ROLE_OPTIONS = [
  { value: "", label: "Все роли" },
  { value: "owner", label: "Владельцы" },
  { value: "admin", label: "Администраторы" },
  { value: "teacher", label: "Учителя" },
];
const STATUS_OPTIONS = [
  { value: "", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "never_logged_in", label: "Не входили" },
  { value: "blocked", label: "Заблокированные" },
  { value: "inactive", label: "Отключённые" },
];

export function UsersScreen() {
  const { me } = useSession();
  const [filters, setFilters] = useState<UserFilters>(EMPTY_USER_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: "name", order: "asc" });
  const [openId, setOpenId] = useUrlId();
  const { showToast, toastNode } = useToast();
  const q = useDebounced(filters.q);
  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const searching = canSearchUsers(effective);
  const list = useResource(searching ? (signal) => consoleApi.users.list(usersQuery(effective, page, sort), signal) : null, [searching, JSON.stringify([effective, page, sort])]);
  const change = (patch: Partial<UserFilters>) => { setFilters((c) => ({ ...c, ...patch })); setPage(1); };

  const columns: Column<PlatformUser>[] = [
    { key: "name", header: "Пользователь", sortKey: "name", primary: true, cell: (u) => <span className="block"><span className="block">{u.name}</span><span className="block text-xs font-normal text-slate-500">{u.email}</span></span> },
    { key: "role", header: "Роль", cell: (u) => orgRoleLabel(u.role) },
    { key: "org", header: "Центр", cell: (u) => (u.org ? <span className="block">{u.org.name}{u.org.blocked && <Pill tone="red" className="ml-1.5">центр заблокирован</Pill>}</span> : DASH) },
    { key: "status", header: "Статус", cell: (u) => <Pill tone={userStatus(u.status).tone}>{userStatus(u.status).label}</Pill> },
    { key: "last", header: "Последний вход", sortKey: "last_login_at", cell: (u) => <span className="whitespace-nowrap text-slate-600">{u.last_login_at ? fmtDateTime(u.last_login_at) : "не входил"}</span> },
    { key: "created", header: "Создан", sortKey: "created_at", cell: (u) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(u.created_at)}</span> },
  ];

  return (
    <>
      <PageHeader title="Пользователи" subtitle="Поиск по почте, имени или телефону. Паролей панель не показывает." />
      <Panel>
        <FilterBar onReset={() => { setFilters(EMPTY_USER_FILTERS); setPage(1); }} canReset={hasFilters(filters)}>
          <SearchField value={filters.q} onChange={(v) => change({ q: v })} placeholder="Почта, имя или телефон" width="w-72" />
          <Field label="Роль" width="w-48"><Select ariaLabel="Роль" options={ROLE_OPTIONS} value={filters.role} onChange={(e) => change({ role: e.target.value })} buttonClassName="py-2 text-sm" /></Field>
          <Field label="Статус" width="w-48"><Select ariaLabel="Статус пользователя" options={STATUS_OPTIONS} value={filters.status} onChange={(e) => change({ status: e.target.value })} buttonClassName="py-2 text-sm" /></Field>
        </FilterBar>
        {!searching ? (
          <EmptyState title="Найдите пользователя" text={`Введите почту, имя или телефон (от ${USER_SEARCH_MIN} символов) либо выберите роль или статус.`} />
        ) : (
          <>
            <DataTable
              caption="Пользователи кабинетов"
              columns={columns}
              rows={list.data?.items ?? null}
              rowKey={(u) => u.id}
              loading={list.loading}
              refreshing={list.refreshing}
              error={list.error ? errorText(list.error) : null}
              onRetry={list.reload}
              onOpen={(u) => setOpenId(u.id)}
              openLabel={(u) => `Открыть пользователя: ${u.name}`}
              selectedKey={openId}
              sort={sort}
              onSort={(key) => { setSort((c) => nextSort(c, key, key === "name" || key === "email" ? "asc" : "desc")); setPage(1); }}
              empty={{ title: "Никого не найдено", text: "Проверьте написание или поищите по другой части почты." }}
            />
            {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={PAGE_SIZE} onPage={setPage} disabled={list.refreshing} />}
          </>
        )}
      </Panel>
      <UserCard id={openId} canManage={can(me, "users.manage")} canBlock={can(me, "users.block")} onClose={() => setOpenId(null)} onChanged={list.reload} toast={showToast} />
      {toastNode}
    </>
  );
}

function linkNotice(kind: "invite" | "reset", sent: LinkSent): string {
  const until = fmtDateTime(sent.expires_at);
  const what = kind === "invite" ? "Новая ссылка «Задать пароль»" : "Ссылка для сброса пароля";
  return sent.email_sent
    ? `${what} отправлена на почту пользователя. Действует до ${until}.`
    : `${what} создана, но письмо не ушло. Попробуйте ещё раз чуть позже.`;
}

function UserCard({
  id, canManage, canBlock, onClose, onChanged, toast,
}: {
  id: string | null; canManage: boolean; canBlock: boolean; onClose: () => void; onChanged: () => void;
  toast: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}) {
  const card = useResource(id ? (signal) => consoleApi.users.get(id, signal) : null, [id]);
  const data = card.data && card.data.id === id ? card.data : null;
  const [dialog, setDialog] = useState<"invite" | "reset" | "block" | "unblock" | null>(null);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const done = () => { card.reload(); onChanged(); };

  return (
    <>
      <Modal
        open={Boolean(id)}
        placement="right"
        maxWidthClassName="max-w-xl"
        title={data?.name ?? "Пользователь"}
        description={data ? <span className="flex items-center gap-2"><Pill tone={userStatus(data.status).tone}>{userStatus(data.status).label}</Pill><span>{data.email}</span></span> : undefined}
        onClose={() => { setResult(null); onClose(); }}
        bodyClassName="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
      >
        {card.loading && !data && <div className="space-y-3" role="status" aria-label="Загрузка пользователя">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />)}</div>}
        {card.error && !data && <Notice tone="red">{errorText(card.error)} <button type="button" className="ml-1 underline" onClick={card.reload}>Повторить</button></Notice>}
        {data && (
          <div className="space-y-6">
            {result && <Notice tone={result.ok ? "green" : "amber"}>{result.text}</Notice>}
            {data.block && <Notice tone="red">Заблокирован {fmtDateTime(data.block.blocked_at)}: {data.block.reason}</Notice>}
            <section>
              <SectionTitle>Учётная запись</SectionTitle>
              <Facts
                rows={[
                  { label: "Почта", value: data.email },
                  { label: "Последний вход", value: data.last_login_at ? fmtDateTime(data.last_login_at) : "не входил" },
                  { label: "Входов", value: data.login_count },
                  { label: "Активных сессий", value: data.active_sessions },
                  { label: "Создан", value: fmtDateTime(data.created_at) },
                  ...(data.pending_link ? [{ label: "Ссылка", value: `${data.pending_link.purpose === "reset" ? "сброс пароля" : "задать пароль"} до ${fmtDateTime(data.pending_link.expires_at)}` }] : []),
                ]}
              />
            </section>
            <section>
              <SectionTitle>Центры и роли</SectionTitle>
              {data.memberships.length === 0 ? <p className="text-sm text-slate-400">Нет привязок к центрам.</p> : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {data.memberships.map((m) => (
                    <li key={m.org_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-900">{m.org_name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{orgRoleLabel(m.org_role)}{!m.is_active && " · отключён"}{m.org_blocked && " · центр заблокирован"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {(canManage || canBlock) && (
              <section>
                <SectionTitle>Действия</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {canManage && data.status === "never_logged_in" && <Button variant="secondary" size="sm" onClick={() => setDialog("invite")} icon={<Send className="h-3.5 w-3.5" />}>Отправить приглашение снова</Button>}
                  {canManage && <Button variant="secondary" size="sm" onClick={() => setDialog("reset")} icon={<KeyRound className="h-3.5 w-3.5" />}>Отправить ссылку сброса пароля</Button>}
                  {canBlock && (data.blocked
                    ? <Button variant="secondary" size="sm" onClick={() => setDialog("unblock")} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Разблокировать</Button>
                    : <Button variant="danger" size="sm" onClick={() => setDialog("block")} icon={<Ban className="h-3.5 w-3.5" />}>Заблокировать</Button>)}
                </div>
              </section>
            )}
            <section>
              <SectionTitle>История</SectionTitle>
              <History rows={data.history} />
            </section>
          </div>
        )}
      </Modal>
      {data && (
        <>
          <ConfirmDialog
            open={dialog === "invite"}
            title="Отправить приглашение снова"
            description={data.email}
            confirmLabel="Отправить"
            onClose={() => setDialog(null)}
            onConfirm={async () => { const sent = await consoleApi.users.resendInvite(data.id); setResult({ text: linkNotice("invite", sent), ok: sent.email_sent }); toast(sent.email_sent ? "Приглашение отправлено" : "Письмо не ушло", sent.email_sent ? "success" : "warning"); done(); }}
          >
            <p className="text-sm text-slate-600">Прежние ссылки перестанут работать. Новая действует 72 часа.</p>
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "reset"}
            title="Отправить ссылку сброса пароля"
            description={data.email}
            confirmLabel="Отправить"
            onClose={() => setDialog(null)}
            onConfirm={async () => { const sent = await consoleApi.users.sendReset(data.id); setResult({ text: linkNotice("reset", sent), ok: sent.email_sent }); toast(sent.email_sent ? "Ссылка отправлена" : "Письмо не ушло", sent.email_sent ? "success" : "warning"); done(); }}
          >
            <p className="text-sm text-slate-600">Ссылка действует 1 час. После смены пароля все прежние сессии пользователя будут закрыты.</p>
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "block"}
            title="Заблокировать пользователя"
            description={`${data.name} · ${data.email}`}
            confirmLabel="Заблокировать"
            danger
            onClose={() => setDialog(null)}
            reason={{ label: "Причина (обязательно)", required: true, validate: validateReason, hint: "Увидит только команда ALGO." }}
            onConfirm={async ({ reason }) => { await consoleApi.users.block(data.id, reason); toast("Пользователь заблокирован"); done(); }}
          >
            <Notice tone="amber">Вход будет закрыт, все открытые сессии пользователя завершатся.</Notice>
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "unblock"}
            title="Разблокировать пользователя"
            description={`${data.name} · ${data.email}`}
            confirmLabel="Разблокировать"
            onClose={() => setDialog(null)}
            onConfirm={async () => { await consoleApi.users.unblock(data.id); toast("Пользователь разблокирован"); done(); }}
          />
        </>
      )}
    </>
  );
}
