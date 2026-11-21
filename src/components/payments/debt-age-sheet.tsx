"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DEBT_AGES, debtAgeAllLabel, debtAgeSummary, type DebtAge, type DebtAgeBasket } from "@/lib/debt-ages";
import { Modal } from "@/components/ui/modal";
import { Radio } from "@/components/ui/radio";

/**
 * PAY-TAILS Б2.8 (frames 21-22): on a PHONE the baskets of the age of the debt are not a strip of chips between the search and the list: the filter is ONE button «Давность: все ▾» in the row of the search,
 * the choice is a bottom sheet (the number of students and the sum at each variant, an empty variant is not offered; a swipe down and the backdrop close it).  The numbers are the server's (`debt_ages`).
 */
export function DebtAgeSheet({ baskets, total, active, onChange }: { baskets: ReadonlyArray<DebtAgeBasket>; total: { students: number }; active: DebtAge | ""; onChange: (next: DebtAge | "") => void }) {
  const [open, setOpen] = useState(false);
  if (baskets.length === 0) return null;
  const current = DEBT_AGES.find((age) => age.key === active)?.label.toLowerCase() ?? "все";
  const options: Array<{ key: DebtAge | ""; label: string; hint: string }> = [
    { key: "", label: "Все", hint: debtAgeAllLabel(total) },
    ...baskets.filter((basket) => basket.students > 0 || basket.key === active).map((basket) => ({ key: basket.key, label: DEBT_AGES.find((age) => age.key === basket.key)?.label ?? basket.label, hint: debtAgeSummary(basket) })),
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="debt-age-open"
        aria-haspopup="dialog"
        className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        Давность: {current}
        <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
      </button>
      <Modal open={open} title="Давность долга" onClose={() => setOpen(false)} placement="sheet" swipeToClose size="sm">
        <div role="radiogroup" aria-label="Давность долга" data-testid="debt-age-sheet" className="-my-1">
          {options.map((option) => (
            <label key={option.key || "all"} data-testid={`debt-age-option-${option.key || "all"}`} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-slate-100 py-2 last:border-b-0 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40">
              <Radio name="debt-age" checked={active === option.key} onChange={() => { onChange(option.key); setOpen(false); }} />
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{option.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-slate-500">{option.hint}</span>
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
