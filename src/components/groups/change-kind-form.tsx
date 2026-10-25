"use client";

import type { CancellationKind } from "@/lib/payf";
import { CancellationKindField } from "@/components/attendance/cancellation-kind-field";

const FIELD = "w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20";

/** «Изменить причину отмены» (owner / administrator): the kind of a lesson that is already cancelled, and why it is changed (it stays in the journal of the lesson). */
export function ChangeKindForm({ kind, onKind, reason, onReason, busy }: { kind: CancellationKind; onKind: (next: CancellationKind) => void; reason: string; onReason: (next: string) => void; busy: boolean }) {
  return (
    <div className="space-y-3" data-testid="sheet-kind-form">
      <CancellationKindField canChooseKind value={kind} onChange={onKind} name="sheet-change-kind" disabled={busy} />
      <div>
        <label htmlFor="sheet-reason" className="mb-1 block text-xs font-semibold text-slate-600">Почему меняете (останется в журнале)</label>
        <textarea id="sheet-reason" rows={2} value={reason} onChange={(event) => onReason(event.target.value)} className={FIELD} />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">Перерасчёт по этому уроку появится или исчезнет сам; оплаты и выписку менять не нужно.</p>
    </div>
  );
}
