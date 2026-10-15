"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { bannerText } from "@/lib/payments";
import { usePaymentsSummary, usePaymentsSummarySync } from "@/lib/payments-summary";

/**
 * Strip above the page of an owner / administrator: «Требуют оплаты: N — Открыть список».
 * It also keeps the shared payments summary fresh (mount, route change, tab visible, every
 * 5 minutes), which feeds the menu item and the badge.  Shown only while the server lets this
 * user see payments and somebody is overdue; it cannot be dismissed — the list is the way out.
 */
export function PaymentsAlertBanner({ paymentsBasePath }: { paymentsBasePath: string }) {
  const pathname = usePathname();
  usePaymentsSummarySync(true, pathname);
  const available = usePaymentsSummary((state) => state.available);
  const due = usePaymentsSummary((state) => state.due);

  // On the payments page itself the list is already in front of the user.
  if (!available || due <= 0 || pathname?.startsWith(paymentsBasePath)) return null;

  return (
    <div
      role="status"
      className="mx-auto mb-4 flex w-full max-w-[1400px] items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-900 md:mb-5"
    >
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
      <p className="min-w-0">
        <span className="font-medium">{bannerText(due)}</span>
        <span className="text-rose-300"> — </span>
        <Link href={`${paymentsBasePath}?bucket=due`} className="whitespace-nowrap font-semibold text-rose-700 underline-offset-2 hover:underline">
          Открыть список
        </Link>
      </p>
    </div>
  );
}
