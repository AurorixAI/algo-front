"use client";

import { useAuthStore } from "@/lib/store";
import { canManageMoney } from "@/lib/money-effects";

/** Whether the person in front of the screen has the money right (the owner, an administrator with `payments_access`) - the ONE flag of the session that opens «Оплаты». */
export function useMoneyRight(): boolean {
  return canManageMoney(useAuthStore((state) => state.user));
}
