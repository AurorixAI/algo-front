/**
 * Money-2 Э2 (Т13): the balances that stay in the PAST groups of a student, shown in the window of an enrolment (`past_balances[]` of the dry run of `mode=add`): the group, the day he left, a debt or an advance
 * and - for a role with the right to money - the sum.  Every row leads to the statement of that stay (`membership_id`).  The words are the server's `text` when the structure is not enough.  Pure.
 */
import { formatDayMonthRu } from "./business-time";
import { formatMoney } from "./money-format";

export interface PastBalance { key: string; membershipId: string; group: string; leftOn: string | null; kind: "debt" | "advance" | null; value: string | null; text: string; /** the stay in THIS group (the server: `same_group`) - the row says «эта группа» */ sameGroup: boolean }

export function pastBalancesOf(answer: unknown): PastBalance[] {
  return pastBalanceRows((answer as { past_balances?: unknown } | null | undefined)?.past_balances);
}

/** The bulk answer (`students[].past_balances`): the rows of each student who has any, in the order of the answer. */
export function pastBalancesByStudent(answer: unknown): Array<{ studentId: string; rows: PastBalance[] }> {
  const list = (answer as { students?: unknown } | null | undefined)?.students;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const entry = (item ?? {}) as { student_id?: unknown; past_balances?: unknown };
    const rows = pastBalanceRows(entry.past_balances);
    return rows.length > 0 ? [{ studentId: String(entry.student_id ?? ""), rows }] : [];
  });
}

function pastBalanceRows(raw: unknown): PastBalance[] {
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
      kind, value: amount === null ? null : formatMoney(amount), sameGroup: row.same_group === true,
    });
  });
  return out;
}

export const PAST_BALANCES_TITLE = "Долги и авансы с прошлого раза";
/** «Долг» / «Аванс» of a row; a row the structure does not explain says the sentence of the server. */
export function pastBalanceLabel(row: PastBalance): string {
  if ((!row.group && !row.sameGroup) || !row.kind) return row.text;
  return `${row.kind === "debt" ? "Долг" : "Аванс"} · ${row.sameGroup ? "в этой же группе" : `«${row.group}»`}${row.leftOn ? ` · ушёл ${row.leftOn}` : ""}`;
}

/** The note under a student in the summary of the window of an enrolment: «Долг с прошлого раза 15 000 сум · в этой же группе, ушёл 19.11» (no sum for a role without money; a row the structure does not explain says the server's sentence). */
export function pastBalanceNote(row: PastBalance): string {
  if ((!row.group && !row.sameGroup) || !row.kind) return row.text;
  const where = row.sameGroup ? "в этой же группе" : `в «${row.group}»`;
  return `${row.kind === "debt" ? "Долг" : "Аванс"} с прошлого раза${row.value ? ` ${row.value}` : ""} · ${where}${row.leftOn ? `, ушёл ${row.leftOn}` : ""}`;
}
