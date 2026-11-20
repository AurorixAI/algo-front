import { balanceView } from "@/lib/payments-ledger";
import type { MembershipPaymentRow } from "@/lib/payments";

/**
 * «Долг 269 000 сум» (red) or «Аванс 21 000 сум» (green) under the status of a group; nothing when there is neither.
 * One wording for the list, the student's card and the statement.
 */
export function BalanceNote({ row, className = "", age = null }: { row: Pick<MembershipPaymentRow, "debt" | "advance">; className?: string; /** The server's age of the debt («62 дня»): ONE line with the sum, «Долг 1 200 000 сум · 78 дней» (the word «долг» once). */ age?: string | null }) {
  const balance = balanceView(row);
  if (balance.kind === "none") return null;
  return (
    <p className={`text-xs font-semibold tabular-nums ${balance.className} ${className}`} data-testid="balance-note">
      {balance.text}
      {age && balance.kind === "debt" && <span data-testid="debt-age">{` · ${age}`}</span>}
    </p>
  );
}
