/**
 * ROADMAP #126 - the tab «Оплаты» of the group page (owner, and an administrator who may see money): who pays what in this group.
 * Pure helpers (no React, no network, so node:test loads this file): who sees the tab, the deep link and the filters, the rows
 * (price, individual-price badge, scheduled price, the chip of the student card), the line above the table.
 * Spec: artifacts/partner_doc_check/group_payments_tab_spec.md.
 *
 * Invariants kept by construction: the price of a row is `price.amount` of the server's row (the same number the statement charges);
 * the chip is `membershipChip(row)` (the student card's own); «индивидуальная» is `price.source === "override"` (the rule of the
 * count on «Цены групп»: an individual price in force today).
 */
import {
  activeOverrideFrom,
  formatPrice,
  priceLabelOf,
  priceOfRow,
  scheduledOverrides,
  sinceText,
  type GroupPriceBrief,
  type PriceInfo,
  type PriceOverrideRow,
  type PriceScheduledOverride,
  type PriceSource,
} from "./group-price";
import { formatMoney, membershipChip, pluralRu, type MembershipPaymentRow, type PeriodMode, type StatusTone } from "./payments";
import type { CollectionRow } from "./payments-income-v2";

// ── Who sees the tab ────────────────────────────────────────────────────────

export const GROUP_PAYMENTS_TAB = "payments";
export const GROUP_PAYMENTS_LABEL = "Оплаты";

export type GroupPaymentsAccess = "show" | "pending" | "hidden";

/**
 * The tab is for the owner and for an administrator the owner gave money to (the server answers `payments/summary` with 200 only
 * to them: `moneyAvailable`); never for a teacher, never in the demo, never on an archived group (nothing to pay there: archiving
 * needs the group empty, «Цены групп» lists no archived group, the debt of the ones who left lives in «Оплаты -> Должники»).
 * `pending`: the answer of the summary has not come yet - a deep link waits instead of falling back.
 */
export function groupPaymentsAccess(input: { moneyAvailable: boolean; moneyLoaded: boolean; isTeacher?: boolean; archived?: boolean; demo?: boolean }): GroupPaymentsAccess {
  if (input.isTeacher || input.demo || input.archived) return "hidden";
  if (input.moneyAvailable) return "show";
  return input.moneyLoaded ? "hidden" : "pending";
}

export type GroupTab = "students" | "schedule" | "attendance" | "settings" | "payments";

/** The tab of `?tab=`: «payments» only for who may see it (`pending` keeps it: the page shows a loader); anything unknown is «Ученики». */
export function resolveGroupTab(requested: string | null | undefined, access: GroupPaymentsAccess): GroupTab {
  if (requested === "payments") return access === "hidden" ? "students" : "payments";
  if (requested === "attendance" || requested === "settings" || requested === "students" || requested === "schedule") return requested;
  return "students";
}

// ── Filter and deep link ────────────────────────────────────────────────────

export type PaymentsFilter = "all" | "individual" | "debt";

/** `?filter=`; an unknown or missing value is «Все». */
export function parsePaymentsFilter(value: string | null | undefined): PaymentsFilter {
  return value === "individual" || value === "debt" ? value : "all";
}

/** `/owner/groups/ID?tab=payments&filter=individual` (no `filter` for «Все»). */
export function groupPaymentsHref(groupsBasePath: string, groupId: string, filter: PaymentsFilter = "all"): string {
  const base = `${groupsBasePath.replace(/\/+$/, "")}/${encodeURIComponent(groupId)}`;
  return `${base}${paymentsFilterQuery(filter)}`;
}

/** The query the page writes when a chip is picked (the tab stays). */
export function paymentsFilterQuery(filter: PaymentsFilter): string {
  return `?tab=payments${filter === "all" ? "" : `&filter=${filter}`}`;
}

/** «Цены групп»: «5 учеников» is a link to the individual prices of that group. */
export function individualPricesHref(groupsBasePath: string, groupId: string): string {
  return groupPaymentsHref(groupsBasePath, groupId, "individual");
}

// ── Rows ────────────────────────────────────────────────────────────────────

/** What the extra call `price-override` told about a membership (while the list does not carry it). */
export interface PriceExtras {
  setBy: string | null;
  scheduled: PriceScheduledOverride | null;
}

export interface GroupPaymentRowView {
  key: string;
  membershipId: string;
  studentId: string;
  name: string;
  displayId: string | null;
  /** «500 000 сум/мес» | «бесплатно» | «Не задана». */
  priceText: string;
  priceSource: PriceSource;
  priceMissing: boolean;
  /** An individual price is in force today. */
  individual: boolean;
  /** «Сестра ученика · с 15.10.2026 · назначил Иванов А.»; null when the price is the group's. */
  individualHint: string | null;
  /** «с 01.12 — 400 000 сум» (or «… — цена группы»); null when nothing is scheduled. */
  scheduledText: string | null;
  scheduled: PriceScheduledOverride | null;
  chip: { label: string; tone: StatusTone; title: string | null };
  debt: number;
  hasDebt: boolean;
  /** The membership is closed (the student has left / is archived): shown only through «Показать ушедших с долгом». */
  left: boolean;
  row: MembershipPaymentRow;
}

const DIGITS_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** «с 01.12 — 400 000 сум» (the year only when it is not the current one); `amount: null` - «с 01.12 — цена группы». */
export function scheduledLine(scheduled: PriceScheduledOverride | null | undefined, today: string, label: string = priceLabelOf("calendar")): string | null {
  if (!scheduled) return null;
  const match = DIGITS_DATE.exec(scheduled.valid_from ?? "");
  if (!match) return null;
  const day = `${match[3]}.${match[2]}${match[1] !== today.slice(0, 4) ? `.${match[1]}` : ""}`;
  const what = scheduled.amount === null || scheduled.amount === undefined ? "цена группы" : scheduled.amount === 0 ? "бесплатно" : formatMoney(scheduled.amount) + (label === "Стоимость пакета" ? " за пакет" : "");
  return `с ${day} — ${what}`;
}

/** The tooltip of the «индивидуальная» badge: why, since when, who. */
export function individualHint(price: PriceInfo, setBy: string | null | undefined): string {
  const reason = (price.reason ?? "").trim() || "Причина не указана";
  const since = sinceText(price.valid_from);
  const author = (setBy ?? "").trim();
  return [reason, since, author ? `назначил ${author}` : ""].filter(Boolean).join(" · ");
}

/** The row as the tab shows it; `extras` is what the extra call knew about this membership (the list's own fields win). */
export function paymentRowView(row: MembershipPaymentRow, options: { label: string; today: string; extras?: PriceExtras | null }): GroupPaymentRowView {
  const price = priceOfRow(row);
  const extras = options.extras ?? null;
  const setBy = price.set_by_name !== undefined ? price.set_by_name : extras?.setBy ?? null;
  const scheduled = price.scheduled !== undefined ? price.scheduled : extras?.scheduled ?? null;
  const individual = price.source === "override" && price.amount !== null && price.amount !== undefined;
  const missing = price.source === "none" || price.amount === null || price.amount === undefined;
  const debt = Math.max(0, Math.round(Number(row.debt) || 0));
  return {
    key: row.membership_id,
    membershipId: row.membership_id,
    studentId: row.student_id,
    name: row.student_name,
    displayId: row.display_id ?? null,
    priceText: missing ? "Не задана" : formatPrice(price.amount, options.label),
    priceSource: price.source,
    priceMissing: missing,
    individual,
    individualHint: individual ? individualHint(price, setBy) : null,
    scheduledText: scheduledLine(scheduled, options.today, options.label),
    scheduled: scheduled ?? null,
    chip: membershipChip(row),
    debt,
    hasDebt: debt > 0,
    left: !row.is_active,
    row,
  };
}

export function paymentRowViews(rows: ReadonlyArray<MembershipPaymentRow>, options: { periodMode: PeriodMode; today: string; extras?: Readonly<Record<string, PriceExtras>> }): GroupPaymentRowView[] {
  const label = priceLabelOf(options.periodMode);
  return rows.map((row) => paymentRowView(row, { label, today: options.today, extras: options.extras?.[row.membership_id] ?? null }));
}

export interface PaymentsCounts { all: number; individual: number; debt: number }

export function paymentsCounts(views: ReadonlyArray<GroupPaymentRowView>): PaymentsCounts {
  return { all: views.length, individual: views.filter((view) => view.individual).length, debt: views.filter((view) => view.hasDebt).length };
}

/** The search box appears from this many rows (more than 8, like on «Цены групп»). */
export const PAYMENTS_SEARCH_FROM = 9;

/** The filter and the search; «Все» and «Индивидуальная цена» by name, «С долгом» by the debt, the biggest first. */
export function filterPaymentRows(views: ReadonlyArray<GroupPaymentRowView>, filter: PaymentsFilter, search = ""): GroupPaymentRowView[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const byName = (a: GroupPaymentRowView, b: GroupPaymentRowView) => a.name.localeCompare(b.name, "ru");
  return views
    .filter((view) => (filter === "individual" ? view.individual : filter === "debt" ? view.hasDebt : true))
    .filter((view) => words.every((word) => `${view.name} ${view.displayId ?? ""}`.toLowerCase().includes(word)))
    .sort((a, b) => (filter === "debt" ? b.debt - a.debt || byName(a, b) : byName(a, b)));
}

/** «Все (12)» / «Индивидуальная цена (5)» / «С долгом (3)». */
export function filterChipLabel(filter: PaymentsFilter, counts: PaymentsCounts): string {
  return `${filter === "all" ? "Все" : filter === "individual" ? "Индивидуальная цена" : "С долгом"} (${counts[filter]})`;
}

export function emptyFilterText(filter: PaymentsFilter, search: string): string {
  if (search.trim()) return "Ничего не найдено";
  if (filter === "individual") return "Индивидуальных цен нет: все платят по цене группы";
  if (filter === "debt") return "Долгов нет";
  return "В группе пока нет учеников";
}

/** The memberships that owe and are no longer in the group (the debtors list of the group minus the active ones), the biggest debt first. */
export function leftDebtRows(debtRows: ReadonlyArray<MembershipPaymentRow>, activeIds: ReadonlySet<string>): MembershipPaymentRow[] {
  return debtRows
    .filter((row) => !activeIds.has(row.membership_id) && (Number(row.debt) || 0) > 0)
    .sort((a, b) => (Number(b.debt) || 0) - (Number(a.debt) || 0) || a.student_name.localeCompare(b.student_name, "ru"));
}

export function leftDebtToggleLabel(count: number, shown: boolean): string {
  return shown ? "Скрыть ушедших с долгом" : `Показать ушедших с долгом (${count})`;
}

// ── What the extra call «price-override» tells ─────────────────────────────

/** A scheduled price as the dialog of cancelling wants it. */
export function scheduledAsOverrideRow(scheduled: PriceScheduledOverride): PriceOverrideRow | null {
  if (!scheduled.row_id) return null;
  return {
    id: scheduled.row_id,
    amount: scheduled.amount,
    valid_from: scheduled.valid_from,
    reason: scheduled.reason ?? null,
    created_by_name: null,
    created_at: null,
    is_current: false,
    is_future: true,
    changes: [],
  };
}

/** From `GET …/price-override`: who set the price in force and the next scheduled one. */
export function extrasFromHistory(price: PriceInfo, history: ReadonlyArray<PriceOverrideRow> | null | undefined): PriceExtras {
  const list = history ?? [];
  const from = activeOverrideFrom(price);
  const current = list.find((item) => item.is_current && item.amount !== null) ?? (from ? list.find((item) => item.valid_from === from && item.amount !== null) : undefined);
  const next = scheduledOverrides(list)[0];
  return {
    setBy: current?.created_by_name ?? null,
    scheduled: next ? { row_id: next.id, amount: next.amount, valid_from: next.valid_from, reason: next.reason } : null,
  };
}

/** The rows the list does not describe completely: an individual price without the author or the scheduled price (an older server). */
export function needsExtras(row: MembershipPaymentRow): boolean {
  if (!row.is_active) return false;
  const price = priceOfRow(row);
  return price.source === "override" && (price.set_by_name === undefined || price.scheduled === undefined);
}

// ── The line above the table ────────────────────────────────────────────────

export interface MonthCollectionBrief {
  /** «Октябрь» */
  month: string;
  pct: number | null;
  debt: number;
}

/** The month of the collection of THIS group (the answer of `payments/income` narrowed to the group): «Октябрь», 74 %, the debt of the month. */
export function collectionBrief(collection: { month_label: string; total: Pick<CollectionRow, "pct" | "debt" | "charged"> } | null | undefined): MonthCollectionBrief | null {
  if (!collection) return null;
  const word = (collection.month_label || "").trim().split(/\s+/)[0] ?? "";
  if (!word) return null;
  return { month: word.charAt(0).toUpperCase() + word.slice(1), pct: collection.total.pct, debt: collection.total.debt };
}

export function individualCountText(count: number): string {
  return `${count} ${pluralRu(count, "ученик", "ученика", "учеников")} с индивидуальной ценой`;
}

/**
 * «Цена группы 500 000 сум/мес · 5 учеников с индивидуальной ценой · Октябрь: собрано 74%, долг за месяц 900 000 сум».
 * The parts that are not known are left out (no collection - no third part; nobody with an individual price - no second one).
 * `priceMissing`: the group has no price - the first part says so (the tab adds a link).
 */
export function summaryParts(input: { groupPrice: GroupPriceBrief | null | undefined; periodMode: PeriodMode; individual: number; collection: MonthCollectionBrief | null }): string[] {
  const label = priceLabelOf(input.periodMode);
  const parts: string[] = [];
  parts.push(input.groupPrice ? `Цена группы ${formatPrice(input.groupPrice.amount, label)}` : "Цена группы не задана");
  if (input.individual > 0) parts.push(individualCountText(input.individual));
  const c = input.collection;
  if (c) {
    const pct = c.pct === null ? "" : `собрано ${c.pct}%`;
    const debt = c.debt > 0 ? `долг за месяц ${formatMoney(c.debt)}` : c.pct === null ? "" : "долгов за месяц нет";
    const tail = [pct, debt].filter(Boolean).join(", ");
    if (tail) parts.push(`${c.month}: ${tail}`);
  }
  return parts;
}

export const PAYMENTS_LOAD_ERROR = "Не удалось загрузить оплаты";
