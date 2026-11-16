"use client";

import { DEBT_AGES, debtAgeSummary, type DebtAge, type DebtAgeBasket } from "@/lib/debt-ages";

/**
 * Money-2 Э8: «Должники» by the age of the debt - the baskets are the FILTER of the list: «Все» and four baskets with the students and the sum of each (the server's numbers).  A press selects a basket, a second
 * press on the same one shows all again.  One scrollable row; no text is cut (a chip is as wide as its words).
 */
export function DebtAgeStrip({ baskets, total, active, onChange }: { baskets: ReadonlyArray<DebtAgeBasket>; total: { students: number; debtTotal: number }; active: DebtAge | ""; onChange: (next: DebtAge | "") => void }) {
  if (baskets.length === 0) return null;
  const chip = (selected: boolean) => `shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-left transition-colors ${selected ? "border-primary-300 bg-primary-50 text-primary-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
  return (
    <div role="group" aria-label="Долг по срокам" data-testid="debt-ages" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" data-allow-hscroll="">
      <div className="flex w-max gap-2">
        <button type="button" aria-pressed={active === ""} data-testid="debt-age-all" onClick={() => onChange("")} className={chip(active === "")}>
          <span className="block text-sm font-semibold">Все</span>
          <span className="block text-xs tabular-nums text-slate-600">{debtAgeSummary(total)}</span>
        </button>
        {baskets.map((basket) => (
          <button key={basket.key} type="button" aria-pressed={active === basket.key} data-testid={`debt-age-${basket.key}`} data-empty={basket.students === 0 ? "yes" : "no"} onClick={() => onChange(active === basket.key ? "" : basket.key)} className={chip(active === basket.key)}>
            <span className="block text-sm font-semibold">{DEBT_AGES.find((age) => age.key === basket.key)?.label}</span>
            <span className="block text-xs tabular-nums text-slate-600">{basket.students === 0 ? "нет" : debtAgeSummary(basket)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
