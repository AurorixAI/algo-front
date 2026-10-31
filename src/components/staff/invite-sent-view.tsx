"use client";

import { useEffect, useRef } from "react";
import { CheckCircle, Clock, Mail, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INVITE_SENT_NOTES, INVITE_SENT_TITLE } from "@/lib/staff-lifecycle";

/**
 * The success window of «Пригласить сотрудника» (and of «Пригласить заново»: the same dialog): a short title, the address on its own line, three short notes, one main
 * button. ONE view for every way into that window (K2-2, stage walk). «Готово» takes the focus when the window shows (Enter closes it; Escape is the dialog's own).
 */
export function InviteSentView({ email, onDone }: { email: string; onDone: () => void }) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { done.current?.focus(); }, []);
  const icons = [Clock, Send, XCircle];
  return (
    <div className="text-center" data-testid="invite-sent">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle className="h-8 w-8 text-emerald-500" aria-hidden />
      </div>
      <h4 role="status" className="mb-3 text-lg font-semibold text-slate-900">{INVITE_SENT_TITLE}</h4>
      <p
        title={email}
        data-testid="invite-sent-email"
        className="mx-auto mb-5 flex max-w-full items-center justify-center gap-2 break-all rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
      >
        <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0">{email}</span>
      </p>
      <ul className="mb-6 space-y-2.5 text-left text-sm text-slate-600">
        {INVITE_SENT_NOTES.map((note, index) => {
          const Icon = icons[index];
          return (
            <li key={note} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>{note}</span>
            </li>
          );
        })}
      </ul>
      <Button ref={done} type="button" size="lg" className="w-full" onClick={onDone}>Готово</Button>
    </div>
  );
}
