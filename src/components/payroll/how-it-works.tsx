"use client";

import { formatMoney } from "@/lib/payments";
import { priceLabelOf } from "@/lib/group-price";
import { payrollFormulaText } from "@/lib/payroll";
import { HOW_TITLE, howItWorksLines, payrollExample } from "@/lib/payroll-help";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { Modal } from "@/components/ui/modal";

/**
 * «Как считается зарплата»: the formula in one line (with the centre's name of the price), the rules in words and one worked
 * example (static numbers, so nothing on the screen is invented).  Pure content: the dialog below shows it on request.
 */
export function PayrollHowItWorksBody({ divisor, priceLabel }: { divisor: number; priceLabel?: string }) {
  const example = payrollExample(divisor);
  return (
    <div className="space-y-3 text-sm text-slate-600">
      <p className="font-medium text-slate-800">{payrollFormulaText(divisor, priceLabel)}</p>
      <ul className="list-disc space-y-1.5 pl-5">
        {howItWorksLines(divisor).map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
        <span className="font-semibold">Пример.</span> Цена {formatMoney(example.price)}, процент {example.percent} %,
        делитель {example.divisor}, засчитано {example.lessons} урока:{" "}
        <span className="whitespace-nowrap font-semibold tabular-nums">{example.text}</span>.
      </p>
    </div>
  );
}

/** The explanation in the common dialog (scroll lock, focus, Esc); it replaces the accordion that used to sit over the table. */
export function PayrollHowItWorksDialog({ open, divisor, onClose }: { open: boolean; divisor: number; onClose: () => void }) {
  // what the price is called in the centre: the formula speaks the same words
  const priceLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  return (
    <Modal
      open={open}
      title={HOW_TITLE}
      onClose={onClose}
      maxWidthClassName="max-w-[560px]"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          Понятно
        </button>
      }
    >
      <PayrollHowItWorksBody divisor={divisor} priceLabel={priceLabel} />
    </Modal>
  );
}
