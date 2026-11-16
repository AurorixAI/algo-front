/**
 * Money-2 А7 (Т7, Т9): what an action does in the OTHER groups of the student, as short rows «что → значение» from the STRUCTURE of the server's answer: `new_debts` (the debt grows),
 * `advance_drops` (the advance falls), `other_gains` (a debt falls / an advance grows).  The sums are the server's; the sentence of the server (`other_groups_text`) is the full text under «Подробнее».
 * A role without the right to money gets no structure and a sentence without digits: then that sentence is the only row.  Pure.
 */
import { formatSignedMoney } from "./money-format";

export interface OtherGroupRow { key: string; label: string; value: string | null; group: string }
export interface OtherGroups { rows: OtherGroupRow[]; /** the whole sentence of the server (null when it is the only row, or there is none) */ full: string | null }

const list = (value: unknown): Array<Record<string, unknown>> => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);
const name = (item: Record<string, unknown>) => (typeof item.group_name === "string" ? item.group_name : "");

export function otherGroupsOf(answer: unknown): OtherGroups {
  const source = (answer ?? {}) as Record<string, unknown>;
  const rows: OtherGroupRow[] = [];
  const push = (group: string, label: string, delta: number) => rows.push({ key: `${rows.length}-${label}-${group}`, group, label: `${label} в «${group}»`, value: formatSignedMoney(delta) });
  for (const item of list(source.new_debts)) { const amount = num(item.amount); if (amount) push(name(item), "Долг", amount); }
  for (const item of list(source.advance_drops)) { const amount = num(item.amount); if (amount) push(name(item), "Аванс", -amount); }
  for (const item of list(source.other_gains)) {
    const fell = num(item.debt_fell);
    const grew = num(item.advance_grew);
    if (fell) push(name(item), "Долг", -fell);
    if (grew) push(name(item), "Аванс", grew);
  }
  const text = typeof source.other_groups_text === "string" ? source.other_groups_text.trim() : "";
  if (rows.length === 0) return { rows: text ? [{ key: "text", group: "", label: text, value: null }] : [], full: null };
  return { rows, full: text || null };
}

/** The groups named in the structure of an answer (the sentences of the server about them are replaced by the rows). */
export function otherGroupNames(answer: unknown): string[] {
  return [...new Set(otherGroupsOf(answer).rows.map((row) => row.group).filter(Boolean))];
}
