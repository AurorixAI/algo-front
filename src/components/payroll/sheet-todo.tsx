"use client";

import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { WarningView } from "@/lib/payroll";

/**
 * «Что нужно сделать» on top of the sheet of a teacher (UX pack §5.2-бис): an amber block, there ONLY when there is something to do; every item is a line with its button - [Отметить] / [Решить] /
 * [Сохранить новую сумму] (the saving of a changed salary is the button of the page, not a link).  Nothing about the sheet that is not an action stands here.
 */
export function SheetTodoBlock({ items, onSave, saving = false, saveLabel, saveBlockedReason = null }: {
  items: WarningView[];
  /** The button of the item «Зарплата изменилась …»: saves the new sum. */
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  saveBlockedReason?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Что нужно сделать" data-testid="sheet-todo" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600" />Что нужно сделать</h2>
      <ul className="mt-2 divide-y divide-amber-200/70">
        {items.map((item) => (
          <li key={item.key} data-testid="sheet-todo-item" className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="min-w-0 break-words text-sm text-amber-950">{item.text}</p>
            {item.key === "changed" && onSave ? (
              <button type="button" onClick={onSave} disabled={saving || Boolean(saveBlockedReason)} title={saveBlockedReason ?? undefined} data-testid="sheet-todo-save" className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {saveLabel ?? item.button ?? "Сохранить новую сумму"}
              </button>
            ) : (
              <Link href={item.href} data-testid="sheet-todo-link" className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100">{item.button ?? "Открыть"}</Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
