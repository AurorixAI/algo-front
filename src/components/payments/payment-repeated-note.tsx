import { AlertTriangle } from "lucide-react";
import { PAYMENT_REPEATED_QUESTION } from "@/lib/payments-ledger";
import { tidyMoneyText } from "@/lib/money-format";

/** Money-1 B9: the same sum to the same student within 24 hours - the sentence of the server and the question; a note, never a ban (the button stays on). */
export function PaymentRepeatedNote({ text }: { text: string }) {
  return (
    <div role="note" data-testid="payment-repeated" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p>{tidyMoneyText(text)}. {PAYMENT_REPEATED_QUESTION}</p>
    </div>
  );
}
