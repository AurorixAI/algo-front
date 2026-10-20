"use client";

import { useState } from "react";
import Link from "next/link";
import { monthStatusText } from "@/lib/payroll";
import { PayrollHowItWorksDialog } from "./how-it-works";

/**
 * The one calm line over the payroll of a month (it replaces an amber card, a formula line and an accordion):
 * «Октябрь ещё идёт — расчёт предварительный» (an open month only), «Как считается» (opens the explanation in a dialog)
 * and «Делитель — в настройках».  Nothing here is an error, so nothing is red.
 */
export function PayrollMonthStatus({ month, open, divisor }: { month: string; open: boolean; divisor: number }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const status = monthStatusText(month, open);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm print:hidden">
      {status && (
        <p role="status" className="flex items-center gap-2 text-slate-700">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          {status}
        </p>
      )}
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        aria-haspopup="dialog"
        className="font-medium text-primary-700 hover:underline"
      >
        Как считается
      </button>
      <Link href="/owner/settings?section=payroll" className="font-medium text-primary-700 hover:underline">
        Делитель — в настройках
      </Link>
      <PayrollHowItWorksDialog open={helpOpen} divisor={divisor} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
