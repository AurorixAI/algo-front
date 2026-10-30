"use client";

import { useRef, useState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { orgApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { errorMessageOf } from "@/lib/ops-errors";
import { staffDisplayName } from "@/lib/staff-name";
import {
  EMAIL_CHANGE_MENU_LABEL,
  PASSWORD_LINK_MENU_LABEL,
  canManageAccess,
  emailChangeIntroText,
  emailChangeSentText,
  inviteEmailError,
  normalizeEmail,
  passwordLinkConfirmText,
  passwordLinkSentText,
} from "@/lib/staff-lifecycle";
import type { OrgMemberRow } from "@/lib/ops-b-types";

/**
 * «⋯» of a row of the staff list: «Отправить ссылку для смены пароля» (the owner -> an administrator / a teacher, an administrator -> a teacher) and «Изменить почту»
 * (the owner only). ONE component for the owner's and the administrator's list (K2-2, C and E; LESSONS 38). The leadership never sees the link: the letter goes to the employee.
 */
export function StaffAccessMenu({
  member,
  actorRole,
  showToast,
  onChanged,
}: {
  member: OrgMemberRow;
  actorRole: "owner" | "admin";
  showToast: (message: string, kind?: "success" | "error") => void;
  onChanged?: () => void;
}) {
  const allowed = canManageAccess(actorRole, member.org_role);
  const name = staffDisplayName(member, "Без имени");
  const [dialog, setDialog] = useState<"password" | "email" | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // a second click before the repaint must not send a second letter (LESSONS 27)

  const items: RowMenuItem[] = [];
  if (allowed.password) items.push({ key: "password-link", label: PASSWORD_LINK_MENU_LABEL, icon: KeyRound, onSelect: () => { setError(null); setDialog("password"); } });
  if (allowed.email) items.push({ key: "email-change", label: EMAIL_CHANGE_MENU_LABEL, icon: Mail, onSelect: () => { setEmail(""); setError(null); setDialog("email"); } });
  if (items.length === 0 || !member.member_id) return null;

  const close = () => { if (!busy) setDialog(null); };

  const sendLink = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await orgApi.sendMemberPasswordLink(member.member_id);
      setDialog(null);
      showToast(passwordLinkSentText(member.email));
      onChanged?.();
    } catch (failure) {
      setError(errorMessageOf(failure, "Не удалось отправить ссылку. Повторите попытку."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const changeEmail = async () => {
    if (inFlight.current) return;
    const problem = inviteEmailError(email);
    if (problem) { setError(problem); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.changeMemberEmail(member.member_id, normalizeEmail(email));
      setDialog(null);
      showToast(emailChangeSentText(result.new_email));
      onChanged?.();
    } catch (failure) {
      setError(errorMessageOf(failure, "Не удалось изменить почту. Повторите попытку."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <RowMenu items={items} label={`Действия: ${name}`} width={290} />
      <Modal
        open={dialog === "password"}
        title={PASSWORD_LINK_MENU_LABEL}
        description={name}
        onClose={close}
        busy={busy}
        maxWidthClassName="max-w-md"
        footer={
          <>
            <button type="button" onClick={close} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button type="button" onClick={() => void sendLink()} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Отправить ссылку
            </button>
          </>
        }
      >
        <div className="pb-1">
          <p className="text-sm leading-6 text-slate-700">{passwordLinkConfirmText(name, member.email)}</p>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
        </div>
      </Modal>
      <Modal
        open={dialog === "email"}
        title={EMAIL_CHANGE_MENU_LABEL}
        description={name}
        onClose={close}
        busy={busy}
        maxWidthClassName="max-w-md"
        footer={
          <>
            <button type="button" onClick={close} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button type="button" onClick={() => void changeEmail()} disabled={busy || !email.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Отправить подтверждение
            </button>
          </>
        }
      >
        <div className="space-y-3 pb-1">
          <p className="text-sm leading-6 text-slate-700">{emailChangeIntroText(name)}</p>
          <p className="text-xs font-medium text-slate-500">Сейчас: {member.email}</p>
          <div>
            <Input
              id={`new-email-${member.member_id}`}
              label="Новая почта"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void changeEmail(); }}
              aria-invalid={Boolean(error)}
              placeholder="Например, ivan@school.com"
            />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
