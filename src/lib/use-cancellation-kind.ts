"use client";

import { useAuthStore } from "@/lib/store";
import { canChooseCancellationKind } from "@/lib/payf";

/** Whether the person in front of the screen may choose the kind of a cancellation (owner / administrator of the centre). */
export function useCanChooseCancellationKind(): boolean {
  const { user } = useAuthStore();
  return canChooseCancellationKind(user);
}
