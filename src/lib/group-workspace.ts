/**
 * IA audit F9 / F30 / F4: the group page and the group list are ONE component each (`GroupDetailView`, `GroupsListView`) with a `workspace`
 * param, like the student card and the payments page.  This module is their pure part (no React, so node:test loads it): the paths of a
 * workspace, the «⋯» of the group header, the roster menu, the list filters with their deep link, the money chips of the header.
 */
import { formatMoney } from "./payments";
import { lacksGroupPrice, formatPrice, type GroupPriceBrief, type GroupPriceScheduled } from "./group-price";
import { pluralRu } from "./plural";
import { workspaceBases, type Workspace } from "./ia-links";

export type { Workspace };

/**
 * WAVE E (E-C, decision 11): the group page is ONE component for the owner, the administrator and the teacher.  The teacher is a workspace of
 * the group page only (the money / students areas of `Workspace` have no teacher), so the union lives here.
 */
export type GroupWorkspace = Workspace | "teacher";

export interface GroupWorkspacePaths {
  workspace: GroupWorkspace;
  groups: string;
  students: string;
  /** null: the workspace has no money (the teacher). */
  payments: string | null;
  /** `GroupScheduleOverview` wants the role that looks at the schedule; the teacher has no «Расписание» tab. */
  viewerRole: GroupWorkspace;
}

export function groupWorkspacePaths(workspace: GroupWorkspace): GroupWorkspacePaths {
  if (workspace === "teacher") return { workspace, groups: "/teacher/groups", students: "/teacher/students", payments: null, viewerRole: workspace };
  const bases = workspaceBases(workspace);
  return { workspace, groups: bases.groups, students: bases.students, payments: bases.payments, viewerRole: workspace };
}

// ── the tabs of a group ─────────────────────────────────────────────────────

export type GroupPageTab = "students" | "schedule" | "exams" | "attendance" | "payments";

/**
 * The tabs of the group page, in ONE order for every role: «Ученики», «Расписание» (owner / administrator), «Экзамены» (the teacher runs, the administrator watches through his exam monitor; not the owner — decision 03.11), «Журнал», «Оплаты» (who sees the money, see `groupPaymentsAccess`).  The teacher has no schedule and no money.
 */
export function groupPageTabs(input: { workspace: GroupWorkspace; paymentsAccess: "show" | "pending" | "hidden" }): GroupPageTab[] {
  const staff = input.workspace !== "teacher";
  return [
    "students",
    ...(staff ? (["schedule"] as const) : []),
    ...(input.workspace !== "owner" ? (["exams"] as const) : []),   // owner 03.11: the owner has no exam page to go to - the tab is not his
    "attendance",
    ...(staff && input.paymentsAccess === "show" ? (["payments"] as const) : []),
  ];
}

/** `?tab=` of the group page: «payments» only for who may see it (`pending` keeps it: the page shows a loader); a tab the role has not is «Ученики». */
export function resolveGroupPageTab(requested: string | null | undefined, input: { workspace: GroupWorkspace; paymentsAccess: "show" | "pending" | "hidden" }): GroupPageTab {
  if (requested === "payments") return input.paymentsAccess === "hidden" || input.workspace === "teacher" ? "students" : "payments";
  const tabs = groupPageTabs({ workspace: input.workspace, paymentsAccess: "hidden" });
  return tabs.find((tab) => tab === requested) ?? "students";
}

/** `?month=&lesson=&date=` open the journal on one lesson (open-lessons link); they do not follow the user to another tab or to a filter. */
export function withoutJournalLink(params: URLSearchParams): URLSearchParams {
  for (const key of ["month", "lesson", "date", "teacher"]) params.delete(key);
  return params;
}

/**
 * The query after a click on a tab: `?tab=` and what belongs to the tab family survives (the exam filter and search of «Экзамены»), the one-shot
 * deep link of the journal (`month`, `lesson`, `date`) and the filter of «Оплаты» do not follow the user to another tab.
 */
export function groupTabQuery(current: string | null | undefined, tab: GroupPageTab): string {
  const next = withoutJournalLink(new URLSearchParams(current ?? ""));
  if (tab !== "payments") next.delete("filter");
  next.set("tab", tab);
  return `?${next.toString()}`;
}

// ── the journal of attendance ───────────────────────────────────────────────

export interface GroupJournalAccess {
  canEdit: boolean;
  /** The journal of who runs the center: «⋯ → Исправить», «Заменить преподавателя», the review of excuses. */
  adminMode: boolean;
  /** The teacher's journal marks the lessons of other teachers; the manager's does not need it. */
  viewerId: string | null;
  groupName: string | null;
}

/**
 * ONE rule of «who may edit the journal of this group» for every role (it was a condition inside the teacher's page and another inside the
 * owner's).  The owner and the administrator edit every live group; a teacher only the group he leads; an archived group nobody.  (A teacher who only substitutes
 * has no page of the group - the server answers 403 - he works in the journal of his lesson in the schedule.)  (`org_role` admin / owner never reach the teacher's workspace - owner decision 28.10, only a teacher teaches - so there is no such branch.)
 */
export function groupJournalAccess(input: {
  workspace: GroupWorkspace;
  group: { name: string; status?: string | null; teacher_id?: string | null };
  userId: string | null | undefined;
}): GroupJournalAccess {
  const live = input.group.status !== "archived";
  if (input.workspace !== "teacher") return { canEdit: live, adminMode: true, viewerId: null, groupName: input.group.name };
  const mine = Boolean(input.userId) && input.group.teacher_id === input.userId;
  return { canEdit: live && mine, adminMode: false, viewerId: input.userId ?? null, groupName: null };
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
export function groupHeaderActions(input: { archived: boolean; priceAvailable: boolean; canManage?: boolean }): GroupHeaderAction[] {
  if (input.archived || input.canManage === false) return []; // a teacher manages no group: no «⋯»
  return input.priceAvailable ? ["edit", "price", "archive"] : ["edit", "archive"];
}

/** The menu of a row of the roster: «Пауза…» / «Закончить паузу» (PAY-TAILS Б11.48, the labels of `membership-learning`), «Перевести в другую группу…» and «Убрать из группы…» last, the danger one (the name is the link to the card). */
export const ROSTER_TRANSFER_LABEL = "Перевести в другую группу…";
export const ROSTER_LEAVE_LABEL = "Убрать из группы…";
export function rosterMenuKeys(input: { canLeave: boolean; canTransfer: boolean; canPause?: boolean }): Array<"pause" | "transfer" | "leave"> {
  return [...(input.canPause ? (["pause"] as const) : []), ...(input.canTransfer ? (["transfer"] as const) : []), ...(input.canLeave ? (["leave"] as const) : [])];
}

// ── money chips of the header ───────────────────────────────────────────────

/** The money of one part of the group, as the server counted it: `students` (distinct) and `amount_total` of `GET payments/status?bucket=…&group_id=` (one row asked for - the screen adds nothing up, PAY-DUE 10.2). */
export interface GroupDebtSummary {
  count: number;
  total: number;
}

export function groupDebtSummary(page: { students?: number | null; amount_total?: number | null } | null | undefined): GroupDebtSummary {
  return { count: Math.max(0, Math.floor(Number(page?.students) || 0)), total: Math.max(0, Math.round(Number(page?.amount_total) || 0)) };
}

const studentsWord = (count: number) => `${count} ${pluralRu(count, ["ученик", "ученика", "учеников"])}`;

/** «Долг 1 200 000 сум · 2 ученика»; null when nobody owes. */
export function groupDebtChipText(summary: GroupDebtSummary): string | null {
  return summary.count > 0 && summary.total > 0 ? `Долг ${formatMoney(summary.total)} · ${studentsWord(summary.count)}` : null;
}

/** «К оплате 462 000 сум · 2 ученика» - the sum still within its term; null when there is none.  Calm blue, never the red of the debt. */
export function groupDueChipText(summary: GroupDebtSummary | null | undefined): string | null {
  return summary && summary.count > 0 && summary.total > 0 ? `К оплате ${formatMoney(summary.total)} · ${studentsWord(summary.count)}` : null;
}

/** The price chip of the header: «Цена 500 000 сум/мес» (the centre's mode names the unit) or the warning «Цена группы не задана»; null: the role has no money or the price is planned from a day. */
export function groupPriceChipText(price: { amount: number } | null | undefined, priceLabel: string, scheduled?: GroupPriceScheduled | null): string | null {
  if (price === undefined) return null; // the key is absent: the role does not see money
  if (price === null) return scheduled ? null : "Цена группы не задана";      // К2 круг 3: a planned price is not repeated in the header - it stands on «Оплаты» and on the card of the group
  return `Цена ${formatPrice(price.amount, priceLabel)}`;
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
  price_scheduled?: GroupPriceScheduled | null;
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
