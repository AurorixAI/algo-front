"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Settings2 } from "lucide-react";
import { formatMoney } from "@/lib/payments";
import { monthStatusText, type MonthTotals } from "@/lib/payroll";
import { RowMenu } from "@/components/ui/row-menu";
import { PayrollHowItWorksDialog } from "./how-it-works";

/**
 * The summary over the list of a month (UX pack §5.2): four tiles - «Начислено на сегодня» (a finished month: «К выплате за октябрь») · «Выплачено» · «Осталось выплатить» · «Выплачено вперёд» (only when there is
 * such a sum) - and ONE calm line under them: «Ноябрь ещё идёт — суммы предварительные · сохранено 2 из 3».  A phone gets the tiles two by two.  Nothing here is an error, so nothing is red.
 */
export function PayrollMonthSummary({ totals, month, open }: { totals: MonthTotals; month: string; open: boolean }) {
  const status = monthStatusText(month, open);
  return (
    <div className="space-y-1.5 print:hidden" data-testid="payroll-month-summary">
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {totals.tiles.map((tile) => (
          <div key={tile.key} data-testid={`month-tile-${tile.key}`} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
            <dt className="text-xs leading-4 text-slate-600">{tile.label}</dt>
            <dd className="mt-0.5 break-words text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{formatMoney(tile.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-600" data-testid="payroll-month-status">
        {status ? `${status} · ` : ""}{totals.saved}
      </p>
    </div>
  );
}

/**
 * «⋯» of the payroll pages: «Как считается» (the explanation in a dialog) and «Делитель в настройках».  The two links used to
 * float next to the text; one quiet menu keeps them in reach and out of the way.
 */
export function PayrollPageMenu({ divisor }: { divisor: number }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <RowMenu
        label="Ещё: как считается, делитель"
        items={[
          { key: "how", label: "Как считается", icon: HelpCircle, onSelect: () => setHelpOpen(true) },
          { key: "divisor", label: "Делитель в настройках", icon: Settings2, onSelect: () => router.push("/owner/settings?section=payroll") },
        ]}
      />
      <PayrollHowItWorksDialog open={helpOpen} divisor={divisor} onClose={() => setHelpOpen(false)} />
    </>
  );
}
