"use client";

import { useEffect, useState } from "react";
import { Copy, Dices, Eye, EyeOff, KeyRound, Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { consoleApi } from "../lib/api";
import { useSession } from "../lib/session";
import { errorText, useResource } from "../lib/hooks";
import { fmtDateTime } from "../lib/format";
import { MAX_PASSWORD, MIN_STAFF_PASSWORD, generatePassword, validateStaff, type StaffFormValues } from "../lib/forms";
import type { Role, Staff } from "../lib/types";
import { Notice, PageHeader, Panel, Pill } from "./bits";
import { DataTable, type Column } from "./data-table";
import { ConfirmDialog } from "./dialogs";
import { HttpError } from "@/lib/http-json";

const EMPTY_STAFF: StaffFormValues = { firstName: "", lastName: "", email: "", roleId: "", password: "" };

export function TeamScreen() {
  const { me } = useSession();
  const staff = useResource((signal) => consoleApi.staff.list(signal), []);
  const roles = useResource((signal) => consoleApi.roles.list(signal), []);
  const { showToast, toastNode } = useToast();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<{ staff: Staff; action: "toggle" | "role" | "password" } | null>(null);

  const columns: Column<Staff>[] = [
    { key: "name", header: "Сотрудник", cell: (s) => <span className="block"><span className="block font-medium text-slate-900">{s.name}{s.user_id === me.user.id && <span className="ml-1.5 text-xs font-normal text-slate-400">это вы</span>}</span><span className="block text-xs text-slate-500">{s.email}</span></span> },
    { key: "role", header: "Роль", cell: (s) => <span className="flex items-center gap-1.5">{s.role?.name ?? "—"}{s.is_owner && <Pill tone="violet">владелец</Pill>}</span> },
    {
      key: "status", header: "Статус",
      cell: (s) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill tone={s.is_active ? "green" : "slate"}>{s.is_active ? "Активен" : "Отключён"}</Pill>
          {s.must_change_password && <Pill tone="amber">сменит пароль</Pill>}
          {s.locked_until && new Date(s.locked_until) > new Date() && <Pill tone="red">вход заблокирован до {fmtDateTime(s.locked_until)}</Pill>}
        </span>
      ),
    },
    { key: "last", header: "Последний вход", cell: (s) => <span className="whitespace-nowrap text-slate-600">{s.last_login_at ? fmtDateTime(s.last_login_at) : "не входил"}</span> },
    { key: "created", header: "Добавлен", cell: (s) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(s.created_at)}</span> },
    {
      key: "actions", header: "", align: "right",
      cell: (s) => (
        <RowMenu
          label={`Действия: ${s.name}`}
          items={[
            { key: "role", label: "Сменить роль", icon: Pencil, disabled: s.user_id === me.user.id, onSelect: () => setTarget({ staff: s, action: "role" }) },
            { key: "password", label: "Задать новый пароль", icon: KeyRound, onSelect: () => setTarget({ staff: s, action: "password" }) },
            { key: "toggle", label: s.is_active ? "Отключить" : "Включить", icon: Power, danger: s.is_active, disabled: s.user_id === me.user.id, onSelect: () => setTarget({ staff: s, action: "toggle" }) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Команда"
        subtitle="Сотрудники консоли. Логин и временный пароль задаёт владелец; при первом входе сотрудник обязан сменить пароль."
        actions={<Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />} disabled={!roles.data}>Добавить сотрудника</Button>}
      />
      <Panel>
        <DataTable
          caption="Сотрудники консоли"
          columns={columns}
          rows={staff.data?.items ?? null}
          rowKey={(s) => s.user_id}
          loading={staff.loading}
          refreshing={staff.refreshing}
          error={staff.error ? errorText(staff.error) : null}
          onRetry={staff.reload}
          empty={{ title: "Сотрудников нет", text: "Добавьте первого сотрудника и выберите ему роль." }}
        />
      </Panel>

      <StaffDialog
        open={creating}
        roles={roles.data?.items ?? []}
        onClose={() => setCreating(false)}
        onCreated={(created) => { showToast(`Сотрудник ${created.name} добавлен`); staff.reload(); roles.reload(); }}
      />
      {target?.action === "toggle" && (
        <ConfirmDialog
          open
          title={target.staff.is_active ? "Отключить сотрудника" : "Включить сотрудника"}
          description={`${target.staff.name} · ${target.staff.email}`}
          confirmLabel={target.staff.is_active ? "Отключить" : "Включить"}
          danger={target.staff.is_active}
          onClose={() => setTarget(null)}
          onConfirm={async () => {
            await consoleApi.staff.update(target.staff.user_id, { is_active: !target.staff.is_active });
            showToast(target.staff.is_active ? "Сотрудник отключён" : "Сотрудник включён");
            staff.reload();
          }}
        >
          {target.staff.is_active && <Notice tone="amber">Сотрудник сразу потеряет доступ, его открытые сессии завершатся. Записи в журнале сохранятся.</Notice>}
        </ConfirmDialog>
      )}
      {target?.action === "role" && (
        <RoleDialog
          staff={target.staff}
          roles={roles.data?.items ?? []}
          onClose={() => setTarget(null)}
          onSaved={() => { showToast("Роль изменена"); staff.reload(); roles.reload(); }}
        />
      )}
      {target?.action === "password" && (
        <PasswordDialog staff={target.staff} onClose={() => setTarget(null)} onSaved={() => showToast("Пароль задан, сотрудник сменит его при входе")} />
      )}
      {toastNode}
    </>
  );
}

/** A password field for the owner: hidden by default, «Показать», «Сгенерировать», «Скопировать». */
function PasswordField({ value, onChange, error, label = "Временный пароль" }: { value: string; onChange: (v: string) => void; error?: string; label?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the clipboard may be blocked: the owner can still read the shown password */
    }
  };
  return (
    <div>
      <Input
        label={label}
        type={shown ? "text" : "password"}
        autoComplete="new-password"
        maxLength={MAX_PASSWORD}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        spellCheck={false}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShown((v) => !v)} icon={shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}>{shown ? "Скрыть" : "Показать"}</Button>
        <Button variant="ghost" size="sm" onClick={() => { onChange(generatePassword()); setShown(true); }} icon={<Dices className="h-3.5 w-3.5" />}>Сгенерировать</Button>
        <Button variant="ghost" size="sm" onClick={copy} disabled={!value} icon={<Copy className="h-3.5 w-3.5" />}>{copied ? "Скопировано" : "Скопировать"}</Button>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Не короче {MIN_STAFF_PASSWORD} символов. Передайте его сотруднику лично; при первом входе он задаст свой.</p>
    </div>
  );
}

function StaffDialog({ open, roles, onClose, onCreated }: { open: boolean; roles: Role[]; onClose: () => void; onCreated: (s: Staff) => void }) {
  const [values, setValues] = useState<StaffFormValues>(EMPTY_STAFF);
  const [errors, setErrors] = useState<Partial<Record<keyof StaffFormValues, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => { if (open) { setValues(EMPTY_STAFF); setErrors({}); setFailure(null); setBusy(false); } }, [open]);
  const set = <K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) => {
    setValues((c) => ({ ...c, [key]: value }));
    setErrors((c) => ({ ...c, [key]: undefined }));
  };

  const submit = async () => {
    if (busy) return;
    const found = validateStaff(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailure(null);
    try {
      const created = await consoleApi.staff.create({
        email: values.email.trim().toLowerCase(),
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        role_id: values.roleId,
        password: values.password,
      });
      onCreated(created);
      onClose();
    } catch (error) {
      if (error instanceof HttpError && error.status === 422) {
        const mapped: Partial<Record<keyof StaffFormValues, string>> = {};
        const names: Record<string, keyof StaffFormValues> = { first_name: "firstName", last_name: "lastName", email: "email", role_id: "roleId", password: "password" };
        for (const [name, text] of Object.entries(error.fields)) if (names[name]) mapped[names[name]] = text;
        setErrors(mapped);
      }
      setFailure(errorText(error));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Новый сотрудник"
      description="Сотрудник войдёт по этой почте и временному паролю."
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-lg"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button><Button onClick={submit} loading={busy}>Добавить</Button></>}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) { e.preventDefault(); void submit(); } }}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Имя" value={values.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} autoComplete="off" />
          <Input label="Фамилия" value={values.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} autoComplete="off" />
        </div>
        <Input label="Почта (логин)" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} error={errors.email} autoComplete="off" />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Роль</span>
          <Select
            ariaLabel="Роль сотрудника"
            placeholder="Выберите роль"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            value={values.roleId}
            onChange={(e) => set("roleId", e.target.value)}
            invalid={Boolean(errors.roleId)}
          />
          {errors.roleId && <p className="mt-1.5 text-xs text-red-500">{errors.roleId}</p>}
        </div>
        <PasswordField value={values.password} onChange={(v) => set("password", v)} error={errors.password} />
        {failure && <Notice tone="red">{failure}</Notice>}
      </form>
    </Modal>
  );
}

function RoleDialog({ staff, roles, onClose, onSaved }: { staff: Staff; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [roleId, setRoleId] = useState(staff.role?.id ?? "");
  return (
    <ConfirmDialog
      open
      title="Сменить роль"
      description={`${staff.name} · сейчас: ${staff.role?.name ?? "—"}`}
      confirmLabel="Сохранить"
      onClose={onClose}
      onConfirm={async () => {
        if (roleId === staff.role?.id) return;
        await consoleApi.staff.update(staff.user_id, { role_id: roleId });
        onSaved();
      }}
    >
      <Select ariaLabel="Новая роль" options={roles.map((r) => ({ value: r.id, label: r.name }))} value={roleId} onChange={(e) => setRoleId(e.target.value)} />
    </ConfirmDialog>
  );
}

function PasswordDialog({ staff, onClose, onSaved }: { staff: Staff; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  return (
    <ConfirmDialog
      open
      title="Новый временный пароль"
      description={`${staff.name} · ${staff.email}`}
      confirmLabel="Задать пароль"
      onClose={onClose}
      onConfirm={async () => {
        if (password.length < MIN_STAFF_PASSWORD) throw new Error(`Пароль не короче ${MIN_STAFF_PASSWORD} символов`);
        await consoleApi.staff.resetPassword(staff.user_id, password);
        onSaved();
      }}
    >
      <PasswordField value={password} onChange={setPassword} label="Новый временный пароль" />
      <Notice tone="amber">Все открытые сессии сотрудника завершатся; при входе он обязан сменить пароль.</Notice>
    </ConfirmDialog>
  );
}
