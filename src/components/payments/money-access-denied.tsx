"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { MONEY_DENIED_HINT, MONEY_DENIED_HOME, MONEY_DENIED_TITLE } from "@/lib/payments";
import { effectiveRole, homeForSidebar } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";

/**
 * UX pack №7: the page of «Оплаты» (and its tabs) for an administrator without the money access - one calm card, said once: what is closed and who opens it, with the way home (the text is
 * readable: 4.5:1 or better, the button 40 px).  The same card on the payments list, the prices of the groups, the openings and the tab «Оплаты» of a group.
 */
export function MoneyAccessDenied({ framed = false }: { framed?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const home = homeForSidebar(user?.org_role === "owner" ? "owner" : user?.role ?? null, effectiveRole(user));
  return (
    <div data-testid="money-denied" className={`flex flex-col items-center justify-center gap-2 text-center ${framed ? "rounded-2xl border border-slate-100 bg-white py-16" : "py-20"}`}>
      <Wallet aria-hidden="true" className="h-10 w-10 text-slate-500" />
      <p className="mt-1 text-lg font-semibold text-slate-900">{MONEY_DENIED_TITLE}</p>
      <p className="max-w-xs text-sm text-slate-600">{MONEY_DENIED_HINT}</p>
      <Link href={home} data-testid="money-denied-home" className="mt-2 inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{MONEY_DENIED_HOME}</Link>
    </div>
  );
}
