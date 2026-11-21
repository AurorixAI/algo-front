/**
 * PAY-TAILS Б1.2: the ONE request of the contract that needs the API (the rest of the contract is read by the pure `lib/paytails.ts`).
 */
import { orgApi } from "./api";
import type { MembershipPaymentRow } from "./payments";
import { leftCountOf } from "./paytails";

const PAGE = 500;
const MAX_PAGES = 5;

/**
 * PAY-TAILS Б1.2: the closed memberships of a group with a settlement left - the band «Ушли из группы — расчёт не закрыт (N)»: ONE request `status?group_id=…&bucket=left_open`
 * (the server picks the closed ones with any debt, «к оплате» or advance and sorts them); `count` is its `left_count`, not the length of what was read.
 */
export async function fetchGroupSettled(groupId: string): Promise<{ rows: MembershipPaymentRow[]; count: number }> {
  const rows: MembershipPaymentRow[] = [];
  let count: number | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await orgApi.getPaymentsStatus({ bucket: "left_open", groupId, limit: PAGE, offset: page * PAGE });
    count ??= leftCountOf(result);
    rows.push(...result.items);
    if (result.items.length === 0 || rows.length >= result.total) break;
  }
  return { rows, count: count ?? rows.length };
}
