/**
 * N13 P4 #105 - «Цена группы»: the price is set on the GROUP (owner, or an administrator the owner gave money to),
 * the students of the group take it; an individual price of one student is an explicit exception with a reason.
 *
 * Types of the money API (auth-service `payments_schemas.py`: `PriceOut`, `GroupPricesOut`, `GroupPriceChanged`,
 * `MembershipPriceOut`) and the pure helpers of its screens: labels, descriptions, the text of the consequences,
 * the validation of the forms.  No React and no network, so node:test can load this file.
 * Money never reaches a teacher: every shape below comes from a money-only endpoint.
 */
import {
  addDays,
  formatDateRu,
  formatMoney,
  formatMoneyInput,
  isIsoDate,
  MAX_MONEY,
  parseMoneyInput,
  pluralRu,
  type MembershipPaymentRow,
  type PeriodMode,
} from "./payments";
import { formatUtcNaiveAsBusinessDateTime, monthYearLabelRu } from "./business-time";
import type { PriceImpactMoney } from "./payments-logica";

// ── Shapes of the API ───────────────────────────────────────────────────────

export type PriceSource = "group" | "override" | "none";

/** `price` of a money row (today) and of a quote (at the start of the period). */
export interface PriceInfo {
  amount: number | null;
  source: PriceSource;
  valid_from: string | null;
  /** The price of the group on that day: what the student would pay without the exception. */
  group_amount: number | null;
  reason: string | null;
  /** Who set the individual price in force (the server may send it; absent on an older one - the group tab asks `price-override` instead). */
  set_by_name?: string | null;
  /** The next individual price of the membership from a day after today (the server may send it; `amount: null` - «цена группы снова»). */
  scheduled?: PriceScheduledOverride | null;
}

/** An individual price that has not started yet. */
export interface PriceScheduledOverride {
  row_id?: string | null;
  amount: number | null;
  valid_from: string;
  reason?: string | null;
}

/** `price_current` of `GET /org/groups` and `GET /org/groups/{id}` (money roles only; the key is absent otherwise). */
export interface GroupPriceBrief {
  amount: number;
  valid_from: string;
}

export interface GroupPriceCurrent extends GroupPriceBrief {
  note?: string | null;
}

/**
 * One write of the price of a day (the audit trail, `group_audit`; `changes` of a history item, newest first, only for that
 * `valid_from`): who, when (naive UTC), from what to what.
 */
export interface GroupPriceChange {
  /** Naive UTC, ISO: show it through `formatUtcNaiveAsBusinessDateTime`. */
  at: string | null;
  actor_name: string | null;
  /** In force on that day just before the write; null - none. */
  old_amount: number | null;
  new_amount: number;
  note: string | null;
}

/** One write of the individual price of a day (`changes` of the override history). */
export interface PriceOverrideChange {
  at: string | null;
  actor_name: string | null;
  /** The EFFECTIVE price that day just before the write; null - none. */
  old_amount: number | null;
  /** Where it came from: the group, an individual price, nowhere. */
  old_source: PriceSource | null;
  /** null - «вернули цену группы». */
  new_amount: number | null;
  reason: string | null;
}

/** A scheduled group price that was taken back (`cancelled` of the prices; the row is gone): who, when, what it was. */
export interface GroupPriceCancelled {
  at: string | null;
  actor_name: string | null;
  amount: number | null;
  valid_from: string | null;
  note: string | null;
}

/** A scheduled individual price that was taken back; `amount` null: it was a scheduled «цена группы». */
export interface PriceOverrideCancelled {
  at: string | null;
  actor_name: string | null;
  amount: number | null;
  valid_from: string | null;
  reason: string | null;
}

export interface GroupPriceRow {
  id: string;
  amount: number;
  valid_from: string;
  note: string | null;
  created_by?: string | null;
  created_by_name: string | null;
  created_at: string | null;
  is_current: boolean;
  is_future: boolean;
  /** The writes of THIS `valid_from`, newest first. */
  changes: GroupPriceChange[];
}

export interface GroupPrices {
  group_id: string;
  group_name: string;
  as_of: string;
  period_mode: PeriodMode;
  /** «Цена в месяц» | «Цена пакета». */
  price_label: string;
  current: GroupPriceCurrent | null;
  history: GroupPriceRow[];
  /** The last 20 scheduled prices taken back, newest first. */
  cancelled: GroupPriceCancelled[];
}

export interface PriceImpactSheet {
  sheet_id: string;
  /** YYYY-MM */
  month: string;
  teacher_id: string;
  teacher_name: string | null;
}

export interface PriceImpact {
  students_following: number;
  students_with_override: number;
  stale_payroll_sheets: number;
  /** The sheets themselves: the owner only (an administrator gets the count). */
  stale_sheets: PriceImpactSheet[];
  /** LOGIC-A decision 4: who gets a debt / buys fewer days with the new price (null from an older server and for a role without money). */
  money?: PriceImpactMoney | null;
}

/** `PUT /org/groups/{id}/price`; with `?dry_run=1` only `impact` is filled (`current` and `history` are null). */
export interface GroupPriceResult {
  dry_run: boolean;
  impact: PriceImpact;
  group_id?: string | null;
  group_name?: string | null;
  as_of?: string | null;
  period_mode?: PeriodMode | null;
  price_label?: string | null;
  current: GroupPriceCurrent | null;
  history: GroupPriceRow[] | null;
  /** null with `dry_run`. */
  cancelled?: GroupPriceCancelled[] | null;
}

export interface GroupPriceRequest {
  amount: number;
  valid_from: string;
  note?: string;
}

export interface PriceOverrideRow {
  id: string;
  /** null: «с этой даты — снова цена группы». */
  amount: number | null;
  valid_from: string;
  reason: string | null;
  created_by_name: string | null;
  created_at: string | null;
  is_current: boolean;
  is_future: boolean;
  /** The writes of THIS `valid_from`, newest first. */
  changes: PriceOverrideChange[];
}

export interface MembershipPrice {
  membership_id: string;
  group_id: string;
  as_of: string;
  period_mode: PeriodMode;
  price_label: string;
  price: PriceInfo;
  history: PriceOverrideRow[];
  /** The last 20 scheduled individual prices taken back, newest first. */
  cancelled: PriceOverrideCancelled[];
}

export interface MembershipPriceChanged extends MembershipPrice {
  row: MembershipPaymentRow;
  /** LOGIC-A: the money and payroll effect of the change (on every answer of the PUT; the only thing a `dry_run` fills). */
  impact?: PriceImpact | null;
  dry_run?: boolean;
}

export interface PriceOverrideRequest {
  /** A sum (a reason is required) or null: back to the price of the group. */
  amount: number | null;
  valid_from?: string;
  reason?: string;
}

/** The individual price handed over together with an enrolment (`price_override` of the add / bulk requests). */
export interface EnrolPriceOverride {
  amount: number;
  reason: string;
}

// ── Labels ──────────────────────────────────────────────────────────────────

export const PRICE_LABEL_CALENDAR = "Цена в месяц";
export const PRICE_LABEL_LESSONS = "Цена пакета";

/** The label of a package centre: «Цена пакета» as the front says it, or the older wording of the server (it names a package too) - one wording on screen (F20). */
export function isLessonsPriceLabel(label: string | null | undefined): boolean {
  return typeof label === "string" && /пакет/i.test(label);
}

/** What the sum means in the centre: «Цена в месяц» for calendar periods, «Цена пакета» for lesson packages. */
export function priceLabelOf(mode: PeriodMode | null | undefined): string {
  return mode === "lessons" ? PRICE_LABEL_LESSONS : PRICE_LABEL_CALENDAR;
}

/**
 * «500 000 сум/мес» / «500 000 сум за пакет»: the unit follows the label the server sent.  A price of 0 is a price - the
 * lessons are free: «бесплатно», never «0 сум/мес» and never «не задана».
 */
export function formatPrice(amount: number | null | undefined, label: string): string {
  if (amount === null || amount === undefined) return "не задана";
  if (amount === 0) return FREE_WORD;
  return `${formatMoney(amount)}${isLessonsPriceLabel(label) ? " за пакет" : "/мес"}`;
}

export const FREE_WORD = "бесплатно";

/** The sum alone («600 000 сум» / «бесплатно») for a cell whose column header already names the unit («Цена пакета», «Цена в месяц»). */
export function formatPriceAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "не задана";
  return amount === 0 ? FREE_WORD : formatMoney(amount);
}

/** The first day of the prices the migration made from the old fees: «always so». */
export const PRICE_EPOCH = "2000-01-01";

/** «с 15.10.2026»; a price that starts on 2000-01-01 has always been so: «с самого начала». */
export function sinceText(validFrom: string | null | undefined): string {
  if (validFrom && validFrom.slice(0, 10) === PRICE_EPOCH) return "с самого начала";
  const text = formatDateRu(validFrom);
  return text ? `с ${text}` : "";
}

/** Group price on a list card / row: «500 000 сум», «бесплатно» for 0, or null when there is none. */
export function priceBriefText(price: GroupPriceBrief | null | undefined): string | null {
  if (!price) return null;
  return price.amount === 0 ? FREE_WORD : formatMoney(price.amount);
}

/** The price of a money row; an older server has only `monthly_fee`. */
export function priceOfRow(row: { price?: PriceInfo | null; monthly_fee?: number | null }): PriceInfo {
  if (row.price) return row.price;
  const fee = row.monthly_fee ?? null;
  return { amount: fee, source: fee === null ? "none" : "group", valid_from: null, group_amount: fee, reason: null };
}

export interface PriceView {
  kind: PriceSource;
  /** «Цена группы» | «Индивидуальная цена» | «Цена группы не задана». */
  title: string;
  /** «500 000 сум/мес»; null when there is no price. */
  value: string | null;
  /** The second part of an individual price: «Сестра ученика · цена группы 500 000 сум». */
  note: string | null;
  /** The whole line: «Цена группы: 500 000 сум/мес». */
  text: string;
}

/** «цена группы 500 000 сум» / «цена группы — бесплатно» / «цена группы не задана». */
function groupAmountPart(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "цена группы не задана";
  if (amount === 0) return `цена группы — ${FREE_WORD}`;
  return `цена группы ${formatMoney(amount)}`;
}

/** How the student card says what the student pays in one group. */
export function membershipPriceView(price: PriceInfo | null | undefined, label: string): PriceView {
  if (!price || price.source === "none" || price.amount === null || price.amount === undefined) {
    return { kind: "none", title: "Цена группы не задана", value: null, note: null, text: "Цена группы не задана" };
  }
  const value = formatPrice(price.amount, label);
  if (price.source === "override") {
    const groupPart = groupAmountPart(price.group_amount);
    const reason = (price.reason ?? "").trim();
    const note = reason ? `${reason} · ${groupPart}` : groupPart;
    return { kind: "override", title: "Индивидуальная цена", value, note, text: `Индивидуальная цена: ${value} · ${reason ? `${reason} (${groupPart})` : groupPart}` };
  }
  return { kind: "group", title: "Цена группы", value, note: null, text: `Цена группы: ${value}` };
}

/** The reason the migration wrote for the prices students had before the group price existed (it is not a human's reason). */
export const SYSTEM_PRICE_REASON = "Цена до введения цены группы";
export const SYSTEM_PRICE_REASON_TOOLTIP = "Перенесена из прежней цены ученика";

/**
 * The tooltip of «Индивидуальная цена 450 000 сум/мес» on the student card: why, since when, who, and what the group pays.
 * The reason is not printed after the price any more; the migration's own reason reads «Перенесена из прежней цены ученика».
 */
export function overridePriceTooltip(price: PriceInfo): string {
  const reason = (price.reason ?? "").trim();
  const lines: string[] = [];
  if (reason) lines.push(reason === SYSTEM_PRICE_REASON ? SYSTEM_PRICE_REASON_TOOLTIP : `Причина: ${reason}`);
  const since = sinceText(price.valid_from);
  if (since) lines.push(since.charAt(0).toUpperCase() + since.slice(1));
  const author = (price.set_by_name ?? "").trim();
  if (author) lines.push(`Назначил(а): ${author}`);
  const group = groupAmountPart(price.group_amount);
  lines.push(group.charAt(0).toUpperCase() + group.slice(1));
  return lines.join("\n");
}

export interface PriceLine {
  kind: PriceSource;
  /** What leads the line: «Цена» | «Индивидуальная цена» | «Цена группы не задана». */
  lead: string;
  /** «500 000 сум/мес» | «бесплатно» (capital at the start of the line); null when there is no price. */
  value: string | null;
  /** What follows the dot: «цена группы» | the reason of the individual price (the card does NOT print the reason: it is in `title`). */
  tail: string;
  /** The whole line: «Цена 500 000 сум/мес · цена группы». */
  text: string;
  /** The tooltip of an individual price: reason, since-date, author, the price of the group behind it. */
  title: string | null;
}

/**
 * The one line of the student card that says what the student pays in a group:
 * «Цена 500 000 сум/мес · цена группы», «Индивидуальная цена 400 000 сум/мес · Сестра ученика», «Цена группы не задана».
 * A price of 0 is a price: «Бесплатно · цена группы».
 */
export function membershipPriceLine(price: PriceInfo | null | undefined, label: string): PriceLine {
  if (!price || price.source === "none" || price.amount === null || price.amount === undefined) {
    return { kind: "none", lead: "Цена группы не задана", value: null, tail: "", text: "Цена группы не задана", title: null };
  }
  const free = price.amount === 0;
  const money = formatPrice(price.amount, label); // «500 000 сум/мес» | «бесплатно»
  const compose = (lead: string, value: string, tail: string): string => [lead, value].filter(Boolean).join(" ") + (tail ? ` · ${tail}` : "");
  if (price.source === "override") {
    const lead = free ? "Индивидуальная цена —" : "Индивидуальная цена";
    const tail = (price.reason ?? "").trim();
    return { kind: "override", lead, value: money, tail, text: compose(lead, money, tail), title: overridePriceTooltip(price) };
  }
  const lead = free ? "" : "Цена";
  const value = free ? money.charAt(0).toUpperCase() + money.slice(1) : money;
  return { kind: "group", lead, value, tail: "цена группы", text: compose(lead, value, "цена группы"), title: null };
}

/** «Индивидуальная цена» in a list row (payments); null for the price of the group. */
export function priceSourceTag(price: PriceInfo | null | undefined): string | null {
  return price?.source === "override" ? "индивидуальная цена" : null;
}

// ── Where the group is set ──────────────────────────────────────────────────

/**
 * Where the price of a group is set: the page «Оплаты -> Цены групп» next to the group pages
 * («/owner/groups» -> «/owner/payments/prices»); `?group=` makes the page scroll to and mark the row of that group.
 */
export function groupPriceHref(groupsBasePath: string, groupId: string): string {
  return `${pricesBaseOf(groupsBasePath)}?group=${encodeURIComponent(groupId)}`;
}

/** «/owner/groups» (or «/owner/groups/») -> «/owner/payments/prices». */
export function pricesBaseOf(groupsBasePath: string): string {
  return `${groupsBasePath.replace(/\/+$/, "").replace(/\/groups$/, "")}/payments/prices`;
}

/** The groups without a price (the payroll warning «не задана цена» leads here). */
export function groupsWithoutPriceHref(groupsBasePath: string): string {
  return `${groupsBasePath.replace(/\/+$/, "")}?price=none`;
}

/** The base of the group pages next to a payments base: «/owner/payments» -> «/owner/groups». */
export function groupsBaseOf(paymentsBasePath: string): string {
  return paymentsBasePath.replace(/\/payments\/?$/, "/groups");
}

export type PriceFilter = "all" | "none";

export function parsePriceFilter(value: string | null | undefined): PriceFilter {
  return value === "none" ? "none" : "all";
}

/** A group the money role sees without a price (`price_current: null`); a role without money has no key and no such group. */
export function lacksGroupPrice(group: { price_current?: GroupPriceBrief | null }): boolean {
  return "price_current" in group && group.price_current === null;
}

export function countGroupsWithoutPrice(groups: ReadonlyArray<{ status?: string; price_current?: GroupPriceBrief | null }>): number {
  return groups.filter((group) => group.status !== "archived" && lacksGroupPrice(group)).length;
}

// ── The form of a group price ───────────────────────────────────────────────

export const PRICE_MIN_DATE = "2000-01-01";
export const PRICE_MAX_AHEAD_DAYS = 366;
export const GROUP_PRICE_NOTE_MAX = 200;
export const OVERRIDE_REASON_MIN = 3;
export const OVERRIDE_REASON_MAX = 200;

/** The dates a price may start on: 2000-01-01 … today + 366 days. */
export function priceDateRange(today: string): { min: string; max: string } {
  return { min: PRICE_MIN_DATE, max: addDays(today, PRICE_MAX_AHEAD_DAYS) };
}

export function validatePriceDate(validFrom: string, today: string): string | null {
  if (!isIsoDate(validFrom)) return "Укажите дату, с которой действует цена";
  const { min, max } = priceDateRange(today);
  if (validFrom < min) return "Дата слишком далеко в прошлом — не раньше 01.01.2000";
  if (validFrom > max) return "Дата слишком далеко в будущем — не позже чем через год";
  return null;
}

export interface GroupPriceFormValues {
  amount: string;
  validFrom: string;
  note: string;
}

export interface FormCheck<T> {
  error: string | null;
  request: T | null;
}

function checkAmount(text: string): { value: number | null; error: string | null } {
  const value = parseMoneyInput(text);
  if (value === null) return { value: null, error: "Укажите сумму" };
  if (value > MAX_MONEY) return { value: null, error: "Сумма слишком большая" };
  return { value, error: null };
}

/** The request of «Изменить цену»; `error` says what is wrong (nothing is sent then). */
export function checkGroupPriceForm(values: GroupPriceFormValues, today: string): FormCheck<GroupPriceRequest> {
  const amount = checkAmount(values.amount);
  if (amount.error || amount.value === null) return { error: amount.error, request: null };
  const dateError = validatePriceDate(values.validFrom, today);
  if (dateError) return { error: dateError, request: null };
  const note = values.note.trim();
  if (note.length > GROUP_PRICE_NOTE_MAX) return { error: `Примечание — не более ${GROUP_PRICE_NOTE_MAX} символов`, request: null };
  const request: GroupPriceRequest = { amount: amount.value, valid_from: values.validFrom };
  if (note) request.note = note;
  return { error: null, request };
}

/** Same as `checkGroupPriceForm` without the note: the question for the consequences (dry run). */
export function groupPriceKey(request: GroupPriceRequest | null): string {
  return request ? `${request.amount}|${request.valid_from}` : "";
}

/**
 * The change writes nothing new: the day already has this sum and this note.  «Сохранить» is off then (the server answers
 * the same request twice with no change).
 */
export function isNoopPriceChange(history: ReadonlyArray<GroupPriceRow> | null | undefined, request: GroupPriceRequest | null): boolean {
  if (!request) return false;
  return (history ?? []).some((row) =>
    row.valid_from === request.valid_from && row.amount === request.amount && (row.note ?? "").trim() === (request.note ?? ""));
}

/** 409 PRICE_CONFLICT: somebody else wrote the price of this day while the dialog was open. */
export const PRICE_CONFLICT_TEXT = "Цену только что изменил другой пользователь. Данные обновлены — проверьте и сохраните ещё раз.";

/**
 * A scheduled price cannot be cancelled any more: 409 (it came into force, «Нельзя отменить цену, которая уже действует …») or
 * 404 («Цена не найдена»: somebody cancelled it first).  The screen shows the server's words and reads the price again.
 */
export function isCancelRefused(cause: unknown): boolean {
  const status = (cause as { status?: number } | null)?.status;
  return status === 409 || status === 404;
}

/** The error of a price write is the server's PRICE_CONFLICT (the text above replaces the server's own, which says «Обновите страницу»). */
export function isPriceConflict(cause: unknown): boolean {
  return (cause as { code?: string } | null)?.code === "PRICE_CONFLICT";
}

export function reasonProblem(reason: string): string | null {
  const text = reason.trim();
  if (text.length < OVERRIDE_REASON_MIN) return `Укажите причину — от ${OVERRIDE_REASON_MIN} до ${OVERRIDE_REASON_MAX} символов`;
  if (text.length > OVERRIDE_REASON_MAX) return `Причина — не более ${OVERRIDE_REASON_MAX} символов`;
  return null;
}

export interface OverrideFormValues {
  amount: string;
  validFrom: string;
  reason: string;
}

/** «Назначить индивидуальную цену»: a sum, a date and a reason of 3..200 characters. */
export function checkOverrideForm(values: OverrideFormValues, today: string): FormCheck<PriceOverrideRequest> {
  const amount = checkAmount(values.amount);
  if (amount.error || amount.value === null) return { error: amount.error, request: null };
  const dateError = validatePriceDate(values.validFrom, today);
  if (dateError) return { error: dateError, request: null };
  const problem = reasonProblem(values.reason);
  if (problem) return { error: problem, request: null };
  return { error: null, request: { amount: amount.value, valid_from: values.validFrom, reason: values.reason.trim() } };
}

/**
 * «Вернуть цену группы» from a date: no sum, no reason.  `notBefore`: the day the individual price in force started - an
 * earlier day changes nothing (the exception still wins from its own day), so it is refused here with a clear message.
 */
export function checkReturnForm(validFrom: string, today: string, notBefore?: string | null): FormCheck<PriceOverrideRequest> {
  const dateError = validatePriceDate(validFrom, today);
  if (dateError) return { error: dateError, request: null };
  if (notBefore && validFrom < notBefore) {
    return {
      error: `Индивидуальная цена действует ${sinceText(notBefore)} — выберите эту дату или позже: с более ранней даты ничего не изменится`,
      request: null,
    };
  }
  return { error: null, request: { amount: null, valid_from: validFrom } };
}

/** The day the individual price in force today started; null when the student pays the price of the group. */
export function activeOverrideFrom(price: PriceInfo | null | undefined): string | null {
  return price && price.source === "override" ? price.valid_from : null;
}

/** The scheduled individual prices (a sum, a day after today), the soonest first: each can be cancelled. */
export function scheduledOverrides(history: ReadonlyArray<PriceOverrideRow> | null | undefined): PriceOverrideRow[] {
  return (history ?? []).filter((row) => row.is_future && row.amount !== null).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
}

export const RETURN_TO_GROUP_LABEL = "Вернуть цену группы";
export const CANCEL_SCHEDULED_LABEL = "Отменить запланированную индивидуальную цену";

export type OverrideAction = { kind: "return"; label: string } | { kind: "cancel"; label: string; row: PriceOverrideRow };

/**
 * The actions a student's price offers besides «Назначить»: «Вернуть цену группы» while an individual price is in force, and
 * «Отменить запланированную индивидуальную цену» for each scheduled one (with its day when there are several).
 */
export function overrideActions(price: PriceInfo | null | undefined, history: ReadonlyArray<PriceOverrideRow> | null | undefined): OverrideAction[] {
  const out: OverrideAction[] = [];
  if (activeOverrideFrom(price) !== null) out.push({ kind: "return", label: RETURN_TO_GROUP_LABEL });
  const scheduled = scheduledOverrides(history);
  for (const row of scheduled) {
    out.push({ kind: "cancel", row, label: scheduled.length > 1 ? `${CANCEL_SCHEDULED_LABEL} (${sinceText(row.valid_from)})` : CANCEL_SCHEDULED_LABEL });
  }
  return out;
}

export const ASSIGN_OVERRIDE_LABEL = "Назначить индивидуальную цену";

/** IA audit F1: the one window of the individual price (opened by «Индивидуальная цена…» of the row menu) and what each mode says about itself. */
export const INDIVIDUAL_PRICE_TITLE = "Индивидуальная цена";
export function priceModeHint(kind: "assign" | "return" | "cancel"): string {
  switch (kind) {
    case "assign": return "Своя цена только для этого ученика, причина обязательна";
    case "return": return "С выбранного дня ученик снова платит по цене группы";
    case "cancel": return "Цена ещё не начала действовать: её можно отменить";
  }
}

/**
 * The dialog of the group price repeats the verb of the button that opened it («Задать цену» / «Изменить цену») and the
 * toast says the result («Цена группы задана» / «Цена группы изменена»).
 */
export const SET_GROUP_PRICE_LABEL = "Задать цену группы";
export const CHANGE_GROUP_PRICE_LABEL = "Изменить цену группы";

export type PriceMenuAction = { kind: "assign"; label: string } | OverrideAction;

/**
 * What the «⋯» menu of a student's group offers about the price, in this order: «Назначить индивидуальную цену», then
 * «Вернуть цену группы» / «Отменить запланированную…».  Nothing for a membership that cannot be changed.
 */
export function priceMenuActions(
  editable: boolean,
  price: PriceInfo | null | undefined,
  history: ReadonlyArray<PriceOverrideRow> | null | undefined,
): PriceMenuAction[] {
  if (!editable) return [];
  return [{ kind: "assign", label: ASSIGN_OVERRIDE_LABEL }, ...overrideActions(price, history)];
}

export interface EnrolOverrideValues {
  enabled: boolean;
  amount: string;
  reason: string;
}

/** The optional individual price of an enrolment: off sends nothing; on needs a sum and a reason. */
export function checkEnrolOverride(values: EnrolOverrideValues): FormCheck<EnrolPriceOverride | null> {
  if (!values.enabled) return { error: null, request: null };
  const amount = checkAmount(values.amount);
  if (amount.error || amount.value === null) return { error: amount.error, request: null };
  const problem = reasonProblem(values.reason);
  if (problem) return { error: problem, request: null };
  return { error: null, request: { amount: amount.value, reason: values.reason.trim() } };
}

// ── Consequences of a change (dry run) ──────────────────────────────────────

function studentsWord(count: number): string {
  return pluralRu(count, ["ученик", "ученика", "учеников"]);
}

/** «Цену получат 12 учеников; у 2 — индивидуальная цена, их не затронет». */
export function impactStudentsText(impact: Pick<PriceImpact, "students_following" | "students_with_override">): string {
  const following = Math.max(0, impact.students_following | 0);
  const exceptions = Math.max(0, impact.students_with_override | 0);
  const verb = following % 10 === 1 && following % 100 !== 11 ? "получит" : "получат";
  const head = following > 0
    ? `Цену ${verb} ${following} ${studentsWord(following)}`
    : "В группе пока нет учеников, которые получат эту цену";
  if (exceptions === 0) return head;
  return `${head}; у ${exceptions} — индивидуальная цена, ${exceptions === 1 ? "её" : "их"} не затронет`;
}

const STALE_LIST_LIMIT = 6;

/** «Иванова А. — сентябрь 2026» */
function staleSheetLabel(sheet: PriceImpactSheet): string {
  const month = /^\d{4}-\d{2}$/.test(sheet.month) ? monthYearLabelRu(sheet.month).replace(/\s*г\.?$/, "") : sheet.month;
  const who = (sheet.teacher_name ?? "").trim() || "преподаватель";
  return `${who} — ${month}`;
}

/**
 * The warning about saved payroll sheets, or null when none is touched.  The owner gets the list, an administrator
 * (who has no payroll) only the count.
 */
export function staleSheetsText(impact: Pick<PriceImpact, "stale_payroll_sheets" | "stale_sheets">): { text: string; items: string[] } | null {
  const count = Math.max(0, impact.stale_payroll_sheets | 0);
  if (count === 0) return null;
  const sheets = impact.stale_sheets ?? [];
  const text = sheets.length > 0
    ? `Сохранённые ведомости зарплаты станут «данные изменились» (${count}); их надо будет пересчитать:`
    : `Сохранённые ведомости зарплаты станут «данные изменились»: ${count}. Их надо будет пересчитать.`;
  const items = sheets.slice(0, STALE_LIST_LIMIT).map(staleSheetLabel);
  if (sheets.length > STALE_LIST_LIMIT) items.push(`и ещё ${sheets.length - STALE_LIST_LIMIT}`);
  return { text, items };
}

/** LOGIC-A decision 4: the payments stay, the debt and the advance are recounted. */
export const PAID_NEVER_CHANGE_TEXT = "Внесённые оплаты не меняются, но долг и аванс пересчитываются — ниже, у кого.";

/** The past date warning: the calculations before today change, the recorded payments do not. */
export function pastDateWarning(validFrom: string, today: string): string | null {
  if (!isIsoDate(validFrom) || !isIsoDate(today) || validFrom >= today) return null;
  return `Дата в прошлом: подсказки сумм оплат и зарплата за период ${sinceText(validFrom)} пересчитаются по новой цене. ${PAID_NEVER_CHANGE_TEXT}`;
}

/** A price that starts later: until then the old one is in force. */
export function futureDateNote(validFrom: string, today: string): string | null {
  if (!isIsoDate(validFrom) || !isIsoDate(today) || validFrom <= today) return null;
  return `Новая цена начнёт действовать с ${formatDateRu(validFrom)}; до этого дня остаётся прежняя.`;
}

// ── History ────────────────────────────────────────────────────────────────

/** «450 000» (no unit: the line says «→» and the label is on the block); 0 is «бесплатно». */
function amountOrNone(amount: number | null | undefined, none: string): string {
  if (amount === null || amount === undefined) return none;
  return amount === 0 ? FREE_WORD : formatMoneyInput(amount);
}

/** «17.10.2026 14:05 · Ахмедов» (the writer may be unknown, the time too). */
function whoAndWhen(at: string | null | undefined, actor: string | null | undefined, formatAt: (value: string | null | undefined) => string): string {
  const when = at ? formatAt(at) : "";
  const who = (actor ?? "").trim();
  return [when, who].filter(Boolean).join(" · ");
}

function withTail(head: string, text: string | null | undefined): string {
  const tail = (text ?? "").trim();
  return tail ? `${head} · ${tail}` : head;
}

/**
 * One write of the price of a group in words: «17.10.2026 14:05 · Ахмедов: 450 000 → 500 000 · примечание».  A first
 * price has no «before»: «не была задана → 500 000».  `at` is naive UTC: it goes through the business clock.
 */
export function groupChangeLine(
  change: GroupPriceChange,
  formatAt: (value: string | null | undefined) => string = formatUtcNaiveAsBusinessDateTime,
): string {
  const head = `${amountOrNone(change.old_amount, "не была задана")} → ${amountOrNone(change.new_amount, "не задана")}`;
  const line = withTail(head, change.note);
  const lead = whoAndWhen(change.at, change.actor_name, formatAt);
  return lead ? `${lead}: ${line}` : line;
}

/** «индивидуальная 400 000» / «цена группы — бесплатно»: a word and the sum after it. */
function priceSide(word: string, amount: number): string {
  return amount === 0 ? `${word} — ${FREE_WORD}` : `${word} ${formatMoneyInput(amount)}`;
}

/** What stood before an individual price was written: «индивидуальная 400 000», «цена группы 500 000», «цена не задана». */
function overrideSide(amount: number | null, source: PriceSource | null | undefined): string {
  if (amount === null || amount === undefined) return "цена не задана";
  if (source === "override") return priceSide("индивидуальная", amount);
  if (source === "group") return priceSide("цена группы", amount);
  return amount === 0 ? FREE_WORD : formatMoneyInput(amount);
}

/**
 * One write of an individual price in words: «17.10.2026 14:05 · Ахмедов: индивидуальная 400 000 → цена группы» (the
 * student is back on the price of the group) or «…: цена группы 500 000 → индивидуальная 400 000 · Сестра ученика».
 */
export function overrideChangeLine(
  change: PriceOverrideChange,
  formatAt: (value: string | null | undefined) => string = formatUtcNaiveAsBusinessDateTime,
): string {
  const after = change.new_amount === null ? "цена группы" : priceSide("индивидуальная", change.new_amount);
  const line = withTail(`${overrideSide(change.old_amount, change.old_source)} → ${after}`, change.reason);
  const lead = whoAndWhen(change.at, change.actor_name, formatAt);
  return lead ? `${lead}: ${line}` : line;
}

/**
 * «20.10.2026 11:05 · Ахмедов отменил запланированную цену 500 000 с 01.11.2026» (a note / reason after a dot); an unknown
 * writer: «… · Запланированная цена 500 000 с 01.11.2026 отменена».
 */
function cancelledLine(
  what: { accusative: string; nominative: string; done: string },
  c: { at: string | null; actor_name: string | null; amount: number | null; valid_from: string | null },
  tail: string | null,
  formatAt: (value: string | null | undefined) => string,
): string {
  const when = c.at ? formatAt(c.at) : "";
  const actor = (c.actor_name ?? "").trim();
  const sum = c.amount === null ? "" : ` ${c.amount === 0 ? FREE_WORD : formatMoneyInput(c.amount)}`;
  const since = c.valid_from ? ` ${sinceText(c.valid_from)}` : "";
  const text = actor ? `${actor} отменил ${what.accusative}${sum}${since}` : `${what.nominative}${sum}${since} ${what.done}`;
  return withTail(when ? `${when} · ${text}` : text, tail);
}

/** A cancelled scheduled group price in words. */
export function groupCancelledLine(c: GroupPriceCancelled, formatAt: (value: string | null | undefined) => string = formatUtcNaiveAsBusinessDateTime): string {
  return cancelledLine({ accusative: "запланированную цену", nominative: "Запланированная цена", done: "отменена" }, c, c.note, formatAt);
}

/** A cancelled scheduled individual price in words; a scheduled «цена группы» (no sum) was a scheduled return. */
export function overrideCancelledLine(c: PriceOverrideCancelled, formatAt: (value: string | null | undefined) => string = formatUtcNaiveAsBusinessDateTime): string {
  const what = c.amount === null
    ? { accusative: "запланированный возврат цены группы", nominative: "Запланированный возврат цены группы", done: "отменён" }
    : { accusative: "запланированную индивидуальную цену", nominative: "Запланированная индивидуальная цена", done: "отменена" };
  return cancelledLine(what, c, c.reason, formatAt);
}

export interface HistoryItemView {
  id: string;
  /** «500 000 сум/мес» */
  amount: string;
  /** «с 15.10.2026» */
  since: string;
  /** «действует» | «с 20.10.2026» (planned) | «» */
  status: "current" | "future" | "past";
  note: string;
  /** «Иванов И. · 17.10.2026 14:32» */
  author: string;
  changes: string[];
}

/** Rows of the history, newest first (the order the server sends), with the audit trail in words. */
export function historyViews(
  history: ReadonlyArray<GroupPriceRow>,
  label: string,
  formatAt: (value: string | null | undefined) => string = formatUtcNaiveAsBusinessDateTime,
): HistoryItemView[] {
  return history.map((row) => {
    const at = row.created_at ? formatAt(row.created_at) : "";
    const author = [row.created_by_name, at].filter(Boolean).join(" · ");
    const changes = (row.changes ?? []).map((change) => groupChangeLine(change, formatAt));
    return {
      id: row.id,
      amount: formatPrice(row.amount, label),
      since: sinceText(row.valid_from),
      status: row.is_current ? "current" : row.is_future ? "future" : "past",
      note: (row.note ?? "").trim(),
      author,
      changes,
    };
  });
}

/** A line of the individual-price history: «с 15.10.2026 — 400 000 сум/мес · причина» / «с 20.11.2026 — цена группы». */
export function overrideRowText(row: PriceOverrideRow, label: string): string {
  const what = row.amount === null ? "цена группы" : formatPrice(row.amount, label);
  const reason = (row.reason ?? "").trim();
  return `${sinceText(row.valid_from)} — ${what}${reason && row.amount !== null ? ` · ${reason}` : ""}`;
}

// ── Enrolment / transfer ────────────────────────────────────────────────────

/** Said under the choice «Перевести» / «Добавить»: the student takes the price of the new group (money roles only). */
export function enrolPriceHint(input: { transfer: boolean; moneyAvailable: boolean }): string | null {
  if (!input.moneyAvailable) return null;
  return input.transfer
    ? "Ученик берёт цену новой группы; индивидуальная цена прежней группы не переносится"
    : "В новой группе ученик берёт цену этой группы";
}

/** «Цена группы: 500 000 сум/мес» / «Цена группы не задана»; null for a role that does not see money (`price` undefined). */
export function targetGroupPriceText(price: GroupPriceBrief | null | undefined, label: string): string | null {
  if (price === undefined) return null;
  return price === null ? "Цена группы не задана" : `Цена группы: ${formatPrice(price.amount, label)}`;
}

/** «Цену получат все добавленные ученики» / «Цену получит ученик» for the line under the price of the target group. */
export function targetGroupPriceHint(price: GroupPriceBrief | null | undefined, students: number): string | null {
  if (price === undefined) return null;
  if (price === null) return "Пока цена не задана, сумма оплаты не подсказывается, а зарплата по ученикам группы не считается";
  return students === 1 ? "Эту цену получит ученик" : "Эту цену получат все добавляемые ученики";
}

// ── The page «Цены групп» (GET /org/group-prices) ───────────────────────────

/** The next scheduled price of a group; `row_id` is what `DELETE /org/groups/{id}/prices/{row_id}` takes. */
export interface GroupPriceScheduled {
  row_id: string;
  amount: number;
  valid_from: string;
}

/** One row of the table: a group that is not archived. */
export interface GroupPriceListItem {
  group_id: string;
  name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  /** `lesson_type` of the group: group | mini_group | pair | individual. */
  kind: string;
  current: GroupPriceBrief | null;
  scheduled: GroupPriceScheduled | null;
  /** How many scheduled prices the group has (the next one is shown). */
  scheduled_count: number;
  /** Active students with an individual price in force today. */
  students_with_override: number;
}

export interface GroupPriceList {
  as_of: string;
  period_mode: PeriodMode;
  /** «Цена в месяц» | «Цена пакета». */
  price_label: string;
  items: GroupPriceListItem[];
}

/** The search box appears from this many groups (more than 8). */
export const GROUP_PRICES_SEARCH_FROM = 9;

/** Header of the price column: «Цена в месяц» for calendar periods, «Цена пакета» for lesson packages. */
export function priceColumnLabel(label: string): string {
  return isLessonsPriceLabel(label) ? PRICE_LABEL_LESSONS : PRICE_LABEL_CALENDAR;
}

/** «500 000 сум» | «бесплатно»; null when the price is not set. */
export function priceCellText(price: GroupPriceBrief | null | undefined): string | null {
  return priceBriefText(price);
}

/** «520 000 сум с 01.12.2026»: the scheduled price in one line; null when none is scheduled. */
export function scheduledCellText(scheduled: GroupPriceScheduled | null | undefined): string | null {
  if (!scheduled) return null;
  const amount = scheduled.amount === 0 ? FREE_WORD : formatMoney(scheduled.amount);
  return `${amount} ${sinceText(scheduled.valid_from)}`;
}

/** «2 ученика»; null (the table shows «—») when nobody has an individual price. */
export function individualPricesText(count: number): string | null {
  return count > 0 ? `${count} ${pluralRu(count, "ученик", "ученика", "учеников")}` : null;
}

/** The scheduled row as the confirmation of «Отменить» wants it. */
export function scheduledAsHistoryItem(scheduled: GroupPriceScheduled, label: string): HistoryItemView {
  return {
    id: scheduled.row_id,
    amount: formatPrice(scheduled.amount, label),
    since: sinceText(scheduled.valid_from),
    status: "future",
    note: "",
    author: "",
    changes: [],
  };
}

/** The row after a save or a cancel: the price today and the next scheduled one come from the answer (the history). */
export function rowWithPrices(
  item: GroupPriceListItem,
  prices: { current: GroupPriceBrief | null; history: ReadonlyArray<GroupPriceRow> | null | undefined },
): GroupPriceListItem {
  const future = (prices.history ?? [])
    .filter((row) => row.is_future)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  return {
    ...item,
    current: prices.current ? { amount: prices.current.amount, valid_from: prices.current.valid_from } : null,
    scheduled: future[0] ? { row_id: future[0].id, amount: future[0].amount, valid_from: future[0].valid_from } : null,
    scheduled_count: future.length,
  };
}

/** Search by the name of the group (case and surrounding spaces do not matter). */
export function filterGroupPrices(items: ReadonlyArray<GroupPriceListItem>, query: string): GroupPriceListItem[] {
  const needle = query.trim().toLocaleLowerCase("ru");
  return needle ? items.filter((item) => item.name.toLocaleLowerCase("ru").includes(needle)) : [...items];
}
