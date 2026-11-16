"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { bulkHeadline, type BulkOutcome } from "@/lib/bulk-outcome";

/** Money-2 Э4: «Записано 3 из 4»; every refused student with the reason of the server; the ones who got in are under «Подробнее». */
export function BulkOutcomePanel({ outcome, verb = "enrol" }: { outcome: BulkOutcome; verb?: "enrol" | "transfer" }) {
  const partial = outcome.skipped.length > 0;
  return (
    <div data-testid="bulk-outcome" className="space-y-3 p-4">
      <p className={`flex items-center gap-2 text-base font-semibold ${partial ? "text-amber-900" : "text-emerald-800"}`}>
        {partial ? <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />}
        <span data-testid="bulk-outcome-headline">{bulkHeadline(outcome, verb)}</span>
      </p>
      {partial && (
        <ul className="space-y-1.5" data-testid="bulk-outcome-skipped">
          {outcome.skipped.map((row) => (
            <li key={row.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-900 [overflow-wrap:anywhere]">{row.name}</p>
              <p className="mt-0.5 text-amber-900 [overflow-wrap:anywhere]" data-testid="bulk-outcome-reason">{row.reason}</p>
            </li>
          ))}
        </ul>
      )}
      {outcome.addedNames.length > 0 && (
        <Disclosure label={`${verb === "transfer" ? "Переведены" : "Записаны"} (${outcome.addedNames.length})`} testId="bulk-outcome-added">
          <ul className="space-y-0.5">{outcome.addedNames.map((name, index) => <li key={`${index}-${name}`} className="[overflow-wrap:anywhere]">{name}</li>)}</ul>
        </Disclosure>
      )}
    </div>
  );
}
