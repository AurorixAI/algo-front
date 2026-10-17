"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import { formatMoney } from "@/lib/payments";
import { HOW_TITLE, howItWorksLines, payrollExample } from "@/lib/payroll-help";

/**
 * «Как считается зарплата»: closed by default; the formula in words and one worked example (static numbers, so nothing
 * on the screen is invented).  A native <details>: it opens with the keyboard and a tap, and stays out of print.
 */
export function PayrollHowItWorks({ divisor }: { divisor: number }) {
  const example = payrollExample(divisor);
  return (
    <details className="group rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm print:hidden">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 font-medium text-slate-700 marker:content-none">
        <HelpCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {HOW_TITLE}
        <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-slate-600">
        <ul className="list-disc space-y-1.5 pl-5">
          {howItWorksLines(divisor).map((line) => <li key={line}>{line}</li>)}
        </ul>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
          <span className="font-semibold">Пример.</span> Цена {formatMoney(example.price)}, процент {example.percent} %,
          делитель {example.divisor}, засчитано {example.lessons} урока:{" "}
          <span className="whitespace-nowrap font-semibold tabular-nums">{example.text}</span>.
        </p>
      </div>
    </details>
  );
}
