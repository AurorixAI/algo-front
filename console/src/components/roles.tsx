"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { consoleApi } from "../lib/api";
import { errorText, useResource } from "../lib/hooks";
import { samePermissions, togglePermission, validateRoleName } from "../lib/forms";
import { permissionGroupLabel } from "../lib/labels";
import type { PermissionInfo, Role } from "../lib/types";
import { LoadFailure, Notice, PageHeader, Panel, Pill } from "./bits";
import { ConfirmDialog } from "./dialogs";
import { HttpError } from "@/lib/http-json";

/** The role being edited: an existing one (`id`) or a draft that is not saved yet. */
interface Draft {
  id: string | null;
  name: string;
  permissions: string[];
  system: boolean;
  template: boolean;
  staffCount: number;
}

const NEW_DRAFT: Draft = { id: null, name: "", permissions: [], system: false, template: false, staffCount: 0 };
const fromRole = (role: Role): Draft => ({ id: role.id, name: role.name, permissions: role.permissions, system: role.is_system, template: role.is_template, staffCount: role.staff_count });

export function RolesScreen() {
  const roles = useResource((signal) => consoleApi.roles.list(signal), []);
  const catalogue = useResource((signal) => consoleApi.permissions(signal), []);
  const { showToast, toastNode } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Draft | null | "none">("none");
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const items = roles.data?.items ?? [];
  const perms: PermissionInfo[] = catalogue.data?.items ?? [];
  const allKeys = useMemo(() => perms.map((p) => p.key), [perms]);
  const saved = draft?.id ? items.find((r) => r.id === draft.id) : undefined;
  const dirty = draft ? (draft.id === null ? draft.name.trim() !== "" || draft.permissions.length > 0 : !saved || saved.name !== draft.name.trim() || !samePermissions(saved.permissions, draft.permissions)) : false;

  // First role opens by itself; after a reload the draft follows the server's version of the same role.
  useEffect(() => {
    if (!roles.data) return;
    setDraft((current) => {
      if (current === null) return roles.data!.items[0] ? fromRole(roles.data!.items[0]) : null;
      if (current.id === null) return current;
      const fresh = roles.data!.items.find((r) => r.id === current.id);
      return fresh ? fromRole(fresh) : roles.data!.items[0] ? fromRole(roles.data!.items[0]) : null;
    });
  }, [roles.data]);

  const choose = (next: Draft) => {
    if (dirty && draft && draft.id !== next.id) setPending(next);
    else { setDraft(next); setError(null); setNameError(null); }
  };

  const groups = useMemo(() => {
    const map = new Map<string, PermissionInfo[]>();
    for (const p of perms) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()];
  }, [perms]);

  const save = async () => {
    if (!draft || busy || draft.system) return;
    const problem = validateRoleName(draft.name);
    setNameError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name: draft.name.trim(), permissions: draft.permissions };
      const result = draft.id ? await consoleApi.roles.update(draft.id, body) : await consoleApi.roles.create(body.name, body.permissions);
      showToast(draft.id ? "Роль сохранена" : "Роль создана");
      setDraft(fromRole(result));
      roles.reload();
    } catch (cause) {
      if (cause instanceof HttpError && cause.fields.name) setNameError(cause.fields.name);
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const failure = roles.error || catalogue.error;
  return (
    <>
      <PageHeader
        title="Роли"
        subtitle="Что может делать сотрудник консоли. Права включаются галочками; сервер проверяет их при каждом действии."
        actions={<Button onClick={() => choose({ ...NEW_DRAFT })} icon={<Plus className="h-4 w-4" />}>Новая роль</Button>}
      />
      {failure && !roles.data ? (
        <Panel><LoadFailure message={errorText(failure)} onRetry={() => { roles.reload(); catalogue.reload(); }} /></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <Panel className="self-start p-2">
            <h2 className="sr-only">Список ролей</h2>
            {roles.loading && <div className="space-y-2 p-2" role="status" aria-label="Загрузка ролей">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />)}</div>}
            <ul className="space-y-0.5">
              {items.map((role) => {
                const active = draft?.id === role.id;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => choose(fromRole(role))}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                    >
                      <span className="min-w-0 truncate font-medium">{role.name}</span>
                      <span className={`shrink-0 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>{role.staff_count} чел.</span>
                    </button>
                  </li>
                );
              })}
              {draft && draft.id === null && <li><div className="rounded-lg border border-dashed border-primary-300 bg-primary-50/50 px-3 py-2 text-sm font-medium text-primary-700">Новая роль (не сохранена)</div></li>}
            </ul>
          </Panel>

          <Panel className="p-5">
            {!draft ? (
              <p className="py-10 text-center text-sm text-slate-500">Выберите роль слева или создайте новую.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="w-full max-w-sm">
                    <Input
                      label="Название роли"
                      value={draft.name}
                      maxLength={80}
                      disabled={draft.system}
                      error={nameError ?? undefined}
                      onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setNameError(null); }}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    {draft.system && <Pill tone="violet"><Lock className="mr-1 h-3 w-3" aria-hidden />системная</Pill>}
                    {draft.template && !draft.system && <Pill tone="blue">шаблон</Pill>}
                  </div>
                </div>
                {draft.system && <Notice tone="blue">Роль «Владелец платформы» включает все права и не редактируется.</Notice>}

                <fieldset disabled={draft.system} className="space-y-5">
                  <legend className="sr-only">Права роли</legend>
                  {catalogue.loading && <div className="h-24 animate-pulse rounded bg-slate-100" role="status" aria-label="Загрузка прав" />}
                  {groups.map(([group, list]) => (
                    <div key={group}>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{permissionGroupLabel(group)}</h3>
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {list.map((p) => {
                          const ownerOnly = p.key === "team.manage" && !draft.system;
                          const disabled = draft.system || !p.active || ownerOnly;
                          const checked = draft.system ? true : draft.permissions.includes(p.key);
                          return (
                            <li key={p.key}>
                              <label className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm ${disabled ? "text-slate-400" : "cursor-pointer text-slate-800 hover:bg-slate-50"}`}>
                                <Checkbox
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => setDraft({ ...draft, permissions: togglePermission(draft.permissions, p.key, e.target.checked, allKeys) })}
                                  className="mt-0.5"
                                />
                                <span>
                                  {p.label}
                                  {!p.active && <span className="ml-1.5 text-xs text-slate-400">скоро</span>}
                                  {ownerOnly && <span className="ml-1.5 text-xs text-slate-400">только владелец</span>}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </fieldset>

                {error && <Notice tone="red">{error}</Notice>}
                {!draft.system && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    <Button onClick={save} loading={busy} disabled={!dirty || !draft.name.trim()}>{draft.id ? "Сохранить" : "Создать роль"}</Button>
                    {dirty && draft.id && <Button variant="ghost" onClick={() => saved && setDraft(fromRole(saved))}>Отменить изменения</Button>}
                    {draft.id && (
                      <Button variant="ghost" onClick={() => choose({ ...draft, id: null, name: `${draft.name} (копия)`, system: false, template: false, staffCount: 0 })} icon={<Copy className="h-4 w-4" />}>Создать копию</Button>
                    )}
                    <div className="flex-1" />
                    {draft.id && <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setRemoving(true)} icon={<Trash2 className="h-4 w-4" />}>Удалить</Button>}
                  </div>
                )}
                {draft.id && draft.staffCount > 0 && <p className="text-xs text-slate-500">Эту роль носят сотрудники: {draft.staffCount}. Изменение прав действует сразу.</p>}
              </div>
            )}
          </Panel>
        </div>
      )}

      <ConfirmDialog
        open={pending !== "none"}
        title="Отменить несохранённые изменения?"
        confirmLabel="Отменить изменения"
        danger
        onClose={() => setPending("none")}
        onConfirm={async () => { if (pending !== "none") { setDraft(pending); setError(null); setNameError(null); } setPending("none"); }}
      >
        <p className="text-sm text-slate-600">Изменения роли «{draft?.name || "новая роль"}» не сохранены.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={removing}
        title="Удалить роль"
        description={draft?.name}
        confirmLabel="Удалить роль"
        danger
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          if (!draft?.id) return;
          await consoleApi.roles.remove(draft.id);
          showToast("Роль удалена");
          setDraft(null);
          roles.reload();
        }}
      >
        <p className="text-sm text-slate-600">Роль можно удалить, только если её не носит ни один сотрудник.</p>
      </ConfirmDialog>
      {toastNode}
    </>
  );
}
