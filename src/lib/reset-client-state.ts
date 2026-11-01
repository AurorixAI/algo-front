import { resetClientErrors } from "./support";
import { resetOpeningsSummary } from "./openings-summary";
import { useExcuseBadge } from "./excuse-badge";
import { usePaymentsSummary } from "./payments-summary";
import { useSubstitutionBadge } from "./substitution-badge";
import { useSupportUnread } from "./support-unread";
import { useDiagnosticStore } from "./store";

/**
 * WB-P5 (BUG-1, BUG-2): everything the page remembers about the person who was signed in - the badges of the menu, the
 * summaries, the failed calls of the support ring, the diagnostic session - in ONE place, called at sign-out (the menu) and
 * when another tab signs another person in.  A new store with per-person state joins this list, not the two call sites.
 * (`endDeadSession` in api.ts only clears the ring: it cannot import the stores, and it leaves the page for good.)
 */
export function resetClientState(): void {
  usePaymentsSummary.getState().reset();
  useExcuseBadge.getState().reset();
  useSubstitutionBadge.getState().reset();
  useSupportUnread.getState().reset();
  useDiagnosticStore.getState().reset();
  resetOpeningsSummary();
  resetClientErrors();
}
