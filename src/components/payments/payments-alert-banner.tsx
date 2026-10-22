"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Wallet, X } from "lucide-react";
import { bannerDismissed, debtorsCount } from "@/lib/payments";
import { debtBannerCopy } from "@/lib/payments-banner";
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
 * Notice above the page of an owner / administrator: «33 ученика с долгом — 21 395 000 сум» (the words of the card on «Оплаты») with a link to «Должники».
 * It also keeps the shared payments summary fresh (mount, route change, tab visible, every
 * 5 minutes), which feeds the menu item and the badge.  Shown only while the server lets this
 * user see payments and somebody is due.  Rose appears only in the small chip for payments that have already
 * ended.  The cross hides it for this browser session; it comes back when more people wait than at that moment.
 *
 * One row everywhere: on a phone (under 640 px) it is a compact strip - the icon, the sentence at 14 px (it wraps to a
 * second line, and is never cut with an ellipsis: «5 учеников с долгом — 750 000 сум, 2 просрочено» is the whole message), a small
 * «Открыть» link and the cross.  The overdue chip folds into the sentence there.
 */
export function PaymentsAlertBanner({ paymentsBasePath }: { paymentsBasePath: string }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  usePaymentsSummarySync(true, pathname);
  const available = usePaymentsSummary((state) => state.available);
  const debtors = usePaymentsSummary((state) => state.debtors);
  const studentsWithDebt = usePaymentsSummary((state) => state.studentsWithDebt);
  const debtTotal = usePaymentsSummary((state) => state.debtTotal);
  const studentsExpired = usePaymentsSummary((state) => state.studentsExpired);

  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => setDismissedAt(readDismissedAt()), []);

  // The same numbers as the cards of «Оплаты»: the debtors, their debt, and how many of them are overdue.
  const copy = debtBannerCopy({ debtors: debtorsCount({ debtors, students_with_debt: studentsWithDebt }), debtTotal, overdue: studentsExpired });
  // On the payments page itself the cards are in front of the user.
  const visible = available && copy.count > 0 && !pathname?.startsWith(paymentsBasePath) && !bannerDismissed(dismissedAt, copy.count);

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
            className="mb-3 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white py-2 pl-3 pr-1.5 sm:mb-4 sm:gap-4 sm:px-4 sm:py-3 md:mb-5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 sm:h-9 sm:w-9">
                <Wallet className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
              </span>
              {/* Phone: the whole sentence, wrapping to a second line when it must - never cut. */}
              <p className="min-w-0 flex-1 text-sm leading-5 text-slate-600 sm:hidden">
                <span className="font-semibold text-slate-900">{copy.compactSubject}</span> {copy.compactPredicate}
              </p>
              <div className="hidden min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 sm:flex">
                <p className="whitespace-nowrap text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{copy.subject}</span> {copy.predicate}
                </p>
                {copy.chip && (
                  <span className="whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-100">
                    {copy.chip}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <Link
                href={`${paymentsBasePath}?bucket=debt`}
                aria-label="Открыть список"
                className="inline-flex h-8 items-center rounded-lg px-2 text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:h-9 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:px-3.5 sm:text-sm sm:font-medium sm:text-slate-700 sm:hover:border-slate-300 sm:hover:bg-slate-50"
              >
                <span className="sm:hidden">Открыть</span>
                <span className="hidden sm:inline">Открыть список</span>
              </Link>
              <button
                type="button"
                onClick={() => { writeDismissedAt(copy.count); setDismissedAt(copy.count); }}
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
