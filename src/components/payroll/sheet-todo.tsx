"use client";

import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { WarningView } from "@/lib/payroll";

const TODO_BUTTON = "inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold";
const TODO_FILLED = "bg-primary-600 text-white hover:bg-primary-700";
const TODO_OUTLINE = "border border-amber-300 bg-white text-amber-950 hover:bg-amber-100";

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
  // re-audit С18: the FIRST step is the filled button.  While an additional lesson waits for a decision the sum will still move, so «Решить» is the main one and «Сохранить новую сумму» an outline;
  // when nothing is left to decide the saving is the main one
  const decideFirst = items.some((item) => item.key === "undecided");
  return (
    <section aria-label="Что нужно сделать" data-testid="sheet-todo" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600" />Что нужно сделать</h2>
      <ul className="mt-2 divide-y divide-amber-200/70">
        {items.map((item) => (
          <li key={item.key} data-testid="sheet-todo-item" className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="min-w-0 break-words text-sm text-amber-950">{item.text}</p>
            {item.key === "changed" && onSave ? (
              <button type="button" onClick={onSave} disabled={saving || Boolean(saveBlockedReason)} title={saveBlockedReason ?? undefined} data-testid="sheet-todo-save" data-main={decideFirst ? "false" : "true"} className={`${TODO_BUTTON} disabled:cursor-not-allowed disabled:opacity-50 ${decideFirst ? TODO_OUTLINE : TODO_FILLED}`}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {saveLabel ?? item.button ?? "Сохранить новую сумму"}
              </button>
            ) : (
              <Link href={item.href} data-testid="sheet-todo-link" data-main={item.key === "undecided" && decideFirst ? "true" : "false"} className={`${TODO_BUTTON} ${item.key === "undecided" && decideFirst ? TODO_FILLED : TODO_OUTLINE}`}>{item.button ?? "Открыть"}</Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
