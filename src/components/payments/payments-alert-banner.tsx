"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Wallet, X } from "lucide-react";
import { bannerDismissed, bannerOverdueChip, bannerParts } from "@/lib/payments";
import { usePaymentsSummary, usePaymentsSummarySync } from "@/lib/payments-summary";

const DISMISS_KEY = "algo.payments-banner.dismissed-at";

/** The count the user dismissed the banner at (this tab only), or null; storage may be blocked. */
function readDismissedAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(count: number): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, String(count));
  } catch {
    // Private mode / blocked storage: the banner is hidden until the page is reloaded.
  }
}

/**
 * Notice above the page of an owner / administrator: «13 учеников ждут оплаты» with a button to the list.
 * It also keeps the shared payments summary fresh (mount, route change, tab visible, every
 * 5 minutes), which feeds the menu item and the badge.  Shown only while the server lets this
 * user see payments and somebody is due.  Rose appears only in the small chip for payments that have already
 * ended.  The cross hides it for this browser session; it comes back when more people wait than at that moment.
 */
export function PaymentsAlertBanner({ paymentsBasePath }: { paymentsBasePath: string }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  usePaymentsSummarySync(true, pathname);
  const available = usePaymentsSummary((state) => state.available);
  const due = usePaymentsSummary((state) => state.due);
  const expired = usePaymentsSummary((state) => state.expired);

  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => setDismissedAt(readDismissedAt()), []);

  // On the payments page itself the list is already in front of the user.
  const visible = available && due > 0 && !pathname?.startsWith(paymentsBasePath) && !bannerDismissed(dismissedAt, due);
  const { subject, predicate } = bannerParts(due);
  const chip = bannerOverdueChip(expired);

  return (
    <AnimatePresence initial={false}>
      {visible && (
        // The height opens smoothly when the summary arrives, so the page below slides instead of jumping.
        <motion.div
          key="payments-alert"
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
          className="mx-auto w-full max-w-[1400px] overflow-hidden print:hidden"
        >
          <div
            role="status"
            data-testid="payments-alert-banner"
            className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:mb-5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Wallet className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <p className="text-sm text-slate-600 sm:whitespace-nowrap">
                  <span className="font-semibold text-slate-900">{subject}</span> {predicate}
                </p>
                {chip && (
                  <span className="whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-100">
                    {chip}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-12 flex items-center gap-1 sm:ml-0">
              <Link
                href={`${paymentsBasePath}?bucket=due`}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                Открыть список
              </Link>
              <button
                type="button"
                onClick={() => { writeDismissedAt(due); setDismissedAt(due); }}
                aria-label="Скрыть напоминание"
                title="Скрыть до следующего сеанса или пока ждущих не станет больше"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
