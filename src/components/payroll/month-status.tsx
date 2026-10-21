"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Settings2 } from "lucide-react";
import { formatMoney } from "@/lib/payments";
import { monthStatusText, type MonthSummary } from "@/lib/payroll";
import { RowMenu } from "@/components/ui/row-menu";
import { PayrollHowItWorksDialog } from "./how-it-works";

/**
 * The one line under the buttons of the month page: «К выплате за сентябрь: 1 410 415 сум · сохранено 2 из 3» and, for a month
 * that is not over, the calm «Октябрь ещё идёт — расчёт предварительный».  Nothing here is an error, so nothing is red.
 */
export function PayrollMonthSummary({ summary, month, open }: { summary: MonthSummary; month: string; open: boolean }) {
  const status = monthStatusText(month, open);
  return (
    <div className="space-y-0.5 print:hidden">
      <p data-testid="payroll-month-summary" className="text-sm text-slate-600">
        {summary.label}{" "}
        <span className="font-semibold tabular-nums text-slate-900">{summary.amount === null ? "—" : formatMoney(summary.amount)}</span>
        {" · "}
        {summary.saved}
      </p>
      {status && <p role="status" className="text-xs text-slate-500">{status}</p>}
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
