/**
 * PAY-TAILS Б1.2: the ONE request of the contract that needs the API (the rest of the contract is read by the pure `lib/paytails.ts`).
 */
import { orgApi } from "./api";
import type { MembershipPaymentRow } from "./payments";
import { settledRowsOf } from "./paytails";

const PAGE = 500;
const MAX_PAGES = 5;

async function allOf(query: { bucket: "debtors" | "to_pay" | "advance"; groupId: string; leftOnly?: boolean }): Promise<MembershipPaymentRow[]> {
  const out: MembershipPaymentRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await orgApi.getPaymentsStatus({ ...query, limit: PAGE, offset: page * PAGE });
    out.push(...result.items);
    if (result.items.length === 0 || out.length >= result.total) break;
  }
  return out;
}

/**
 * PAY-TAILS Б1.2: the closed memberships of a group with a settlement left - the band «Ушедшие с расчётами (N)»; `count` is the number of its rows.
 * TO SWAP: when the server gives them with any balance in ONE answer (and the number for the band), only this function changes.
 */
export async function fetchGroupSettled(groupId: string, activeIds: ReadonlySet<string>): Promise<{ rows: MembershipPaymentRow[]; count: number }> {
  const lists = await Promise.all([
    allOf({ bucket: "debtors", groupId }),
    allOf({ bucket: "to_pay", groupId }),
    allOf({ bucket: "advance", groupId, leftOnly: true }),
  ]);
  const rows = settledRowsOf(lists, activeIds);
  return { rows, count: rows.length };
}
