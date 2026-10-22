/**
 * IA audit F9 / F30 / F4: the group page and the group list are ONE component each (`GroupDetailView`, `GroupsListView`) with a `workspace`
 * param, like the student card and the payments page.  This module is their pure part (no React, so node:test loads it): the paths of a
 * workspace, the «⋯» of the group header, the roster menu, the list filters with their deep link, the money chips of the header.
 */
import { formatMoney } from "./payments";
import { lacksGroupPrice, formatPrice, type GroupPriceBrief } from "./group-price";
import { pluralRu } from "./plural";
import { workspaceBases, type Workspace } from "./ia-links";

export type { Workspace };

export interface GroupWorkspacePaths {
  workspace: Workspace;
  groups: string;
  students: string;
  payments: string;
  /** `GroupScheduleOverview` wants the role that looks at the schedule. */
  viewerRole: "owner" | "admin";
}

export function groupWorkspacePaths(workspace: Workspace): GroupWorkspacePaths {
  const bases = workspaceBases(workspace);
  return { workspace, groups: bases.groups, students: bases.students, payments: bases.payments, viewerRole: workspace };
}

// ── the header of a group ───────────────────────────────────────────────────

export type GroupHeaderAction = "edit" | "price" | "archive";

export const GROUP_HEADER_LABEL: Record<GroupHeaderAction, string> = {
  edit: "Изменить группу…",
  price: "Цена группы…",
  archive: "В архив",
};

/**
 * The «⋯» of the header: «Изменить группу…» (name, class, teacher, limit, description, the lesson type with its own consequences dialog),
 * «Цена группы…» (the dialog of «Цены групп»; only for a role that sees money), «В архив» (danger, last).  An archived group has no menu:
 * «Вернуть из архива» is its button.
 */
export function groupHeaderActions(input: { archived: boolean; priceAvailable: boolean }): GroupHeaderAction[] {
  if (input.archived) return [];
  return input.priceAvailable ? ["edit", "price", "archive"] : ["edit", "archive"];
}

/** The menu of a row of the roster: «Перевести в другую группу…» and «Убрать из группы…» (the name is the link to the card). */
export const ROSTER_TRANSFER_LABEL = "Перевести в другую группу…";
export const ROSTER_LEAVE_LABEL = "Убрать из группы…";
export function rosterMenuKeys(input: { canLeave: boolean; canTransfer: boolean }): Array<"transfer" | "leave"> {
  return [...(input.canTransfer ? (["transfer"] as const) : []), ...(input.canLeave ? (["leave"] as const) : [])];
}

// ── money chips of the header ───────────────────────────────────────────────

export interface GroupDebtSummary {
  count: number;
  total: number;
}

/** The students of the group who owe, and how much: from the rows of `payments/status?bucket=debt&group_id=`. */
export function groupDebtSummary(rows: ReadonlyArray<{ debt?: number | null }>): GroupDebtSummary {
  let count = 0;
  let total = 0;
  for (const row of rows) {
    const debt = Math.round(Number(row.debt) || 0);
    if (debt > 0) { count += 1; total += debt; }
  }
  return { count, total };
}

/** «Долг 1 200 000 сум · 3 ученика»; null when nobody owes. */
export function groupDebtChipText(summary: GroupDebtSummary): string | null {
  if (summary.count <= 0) return null;
  return `Долг ${formatMoney(summary.total)} · ${summary.count} ${pluralRu(summary.count, ["ученик", "ученика", "учеников"])}`;
}

/** The price chip of the header: «Цена 500 000 сум/мес» (the centre's mode names the unit) or «Цена группы не задана». */
export function groupPriceChipText(price: { amount: number } | null | undefined, priceLabel: string): string | null {
  if (price === undefined) return null; // the key is absent: the role does not see money
  return price === null ? "Цена группы не задана" : `Цена ${formatPrice(price.amount, priceLabel)}`;
}

// ── the list of groups ──────────────────────────────────────────────────────

export const GROUP_CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];
export type GroupStatusFilter = "active" | "waiting" | "archived";

export interface GroupListQuery {
  status: GroupStatusFilter;
  /** null: every class. */
  classLevel: number | null;
  q: string;
}

export function parseGroupListQuery(params: { get(name: string): string | null } | null | undefined): GroupListQuery {
  const status = params?.get("status");
  const level = Number(params?.get("class"));
  return {
    status: status === "waiting" || status === "archived" ? status : "active",
    classLevel: GROUP_CLASS_LEVELS.includes(level) ? level : null,
    q: (params?.get("q") ?? "").slice(0, 80),
  };
}

/** `?status=waiting&class=9&q=алг` (defaults are not written); "" when everything is default.  `price` (`?price=none`) is kept when given. */
export function groupListQueryString(query: GroupListQuery, extra: { price?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (extra.price === "none") params.set("price", "none");
  if (query.status !== "active") params.set("status", query.status);
  if (query.classLevel !== null) params.set("class", String(query.classLevel));
  if (query.q.trim()) params.set("q", query.q.trim());
  const text = params.toString();
  return text ? `?${text}` : "?";
}

export interface GroupListRow {
  name: string;
  status?: string;
  teacher_id?: string | null;
  teacher_name?: string | null;
  class_level?: number | null;
  price_current?: GroupPriceBrief | null;
}

/** The status tab, the class and the search of the list; «Без цены» (`?price=none`) shows every live group without a price whatever its tab. */
export function filterGroups<T extends GroupListRow>(groups: ReadonlyArray<T>, query: GroupListQuery, priceFilter: "none" | "all" = "all"): T[] {
  return groups.filter((group) => {
    if (priceFilter === "none") {
      if (group.status === "archived" || !lacksGroupPrice(group)) return false;
    } else if (query.status === "waiting") {
      if (group.status !== "active" || group.teacher_id) return false;
    } else if (query.status === "active") {
      if (group.status !== "active" || !group.teacher_id) return false;
    } else if (group.status !== "archived") {
      return false;
    }
    if (query.classLevel !== null && group.class_level !== query.classLevel) return false;
    const q = query.q.trim().toLowerCase();
    if (q && !group.name.toLowerCase().includes(q) && !(group.teacher_name ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}
