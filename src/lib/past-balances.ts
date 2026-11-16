/**
 * Money-2 Э2 (Т13): the balances that stay in the PAST groups of a student, shown in the window of an enrolment (`past_balances[]` of the dry run of `mode=add`): the group, the day he left, a debt or an advance
 * and - for a role with the right to money - the sum.  Every row leads to the statement of that stay (`membership_id`).  The words are the server's `text` when the structure is not enough.  Pure.
 */
import { formatDayMonthRu } from "./business-time";
import { formatMoney } from "./money-format";

export interface PastBalance { key: string; membershipId: string; group: string; leftOn: string | null; kind: "debt" | "advance" | null; value: string | null; text: string }

export function pastBalancesOf(answer: unknown): PastBalance[] {
  const raw = (answer as { past_balances?: unknown } | null | undefined)?.past_balances;
  if (!Array.isArray(raw)) return [];
  const out: PastBalance[] = [];
  raw.forEach((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const membershipId = typeof row.membership_id === "string" ? row.membership_id : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const group = typeof row.group_name === "string" ? row.group_name : "";
    if (!membershipId || (!text && !group)) return;
    const kind = row.kind === "debt" || row.kind === "advance" ? row.kind : null;
    const amount = typeof row.amount === "number" && Number.isFinite(row.amount) ? row.amount : null;
    out.push({
      key: `${index}-${membershipId}-${kind ?? ""}`, membershipId, group, text,
      leftOn: typeof row.left_on === "string" && row.left_on ? formatDayMonthRu(row.left_on) || null : null,
      kind, value: amount === null ? null : formatMoney(amount),
    });
  });
  return out;
}

export const PAST_BALANCES_TITLE = "Остатки в прошлых группах";
/** «Долг» / «Аванс» of a row; a row the structure does not explain says the sentence of the server. */
export function pastBalanceLabel(row: PastBalance): string {
  if (!row.group || !row.kind) return row.text;
  return `${row.kind === "debt" ? "Долг" : "Аванс"} · «${row.group}»${row.leftOn ? ` · ушёл ${row.leftOn}` : ""}`;
}
