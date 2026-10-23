/**
 * ROADMAP #125 «Остатки на начало»: one screen where the owner (or an administrator with the right to money) enters, for every
 * student of the centre, what there was before the accounting start - who had paid ahead and who owed.  The rules live in the
 * server (`openings_contract.json`, golden answers in `tests/fixtures/openings`): the floor of a row (`floor`), the conversion
 * «осталось K уроков -> оплачено до», the effect on the debts.  This file only arranges the screen: the shapes of the contract, the
 * draft of a row and the items of a batch, the bulk actions, the words of the summary, of the errors and of the Excel report, and the
 * predicates of the banner / the checklist / the header link.  Pure: no React and no network, node:test loads it.
 *
 * Vocabulary of the owner (21.10): «Стоимость», «Долг», «Оплачено до»; never «Начисление» as a thing the owner sees.
 * `paid_until = accounting start - 1` is a REAL opening («на начало долга нет»): it is written, and the row stops being «не заполнено».
 */
import { formatPrice, priceLabelOf, type PriceInfo } from "./group-price";
import {
  addDays,
  formatDateRu,
  formatMoney,
  formatMoneyInput,
  isIsoDate,
  MAX_MONEY,
  parseMoneyInput,
  REASON_MAX,
  REASON_MIN,
  type PeriodMode,
} from "./payments";
import { formatBusinessDate } from "./business-time";
import { pluralRu } from "./plural";

// ── The contract ────────────────────────────────────────────────────────────

/** `none` is «not asked yet» (the spec calls it `off`: both are read the same). */
export type OpeningsState = "none" | "pending" | "done" | "skipped";

export interface OpeningValue {
  paid_until: string | null;
  debt_amount: number | null;
  debt_on: string | null;
}

export type ReasonNotEditable = "transfer" | "free";

export interface OpeningRow {
  membership_id: string;
  student: { id: string; name: string; display_id: string | null; class_level: number | null };
  group: { id: string; name: string };
  mode: PeriodMode;
  price: PriceInfo;
  enrolled_on: string;
  status: "active" | "left";
  left_on: string | null;
  paused: boolean;
  opening: OpeningValue | null;
  /** The id of the live opening, `-` when there is none: sent back with the item (409 `STALE_ITEMS` when somebody changed it). */
  version: string;
  has_money_records: boolean;
  missing: boolean;
  /** Additive (22.10): the stored opening no longer fits the range (the accounting start was moved after it was entered). */
  needs_review: boolean;
  /** `L`: «оплачено до» is not earlier and «долг на дату» is not later than this day. */
  floor: string;
  only_debt: boolean;
  editable: boolean;
  reason_not_editable: ReasonNotEditable | null;
}

export interface OpeningGroupBlock {
  id: string;
  name: string;
  teacher_name: string | null;
  total: number;
  with_opening: number;
  missing: number;
  memberships: OpeningRow[];
}

export interface OpeningTotals {
  memberships: number;
  with_opening: number;
  missing: number;
  left_available: number;
  shown: number;
  needs_review: number;
}

export interface OpeningsSummary {
  accounting_start: string;
  state: OpeningsState;
  totals: OpeningTotals;
}

export interface OpeningsList extends OpeningsSummary {
  as_of: string;
  period_mode: PeriodMode;
  paid_until_max: string;
  groups: OpeningGroupBlock[];
}

export interface OpeningBatchItem {
  membership_id: string;
  version: string;
  paid_until?: string | null;
  debt_amount?: number | null;
  debt_on?: string | null;
  lessons_left?: number | null;
  clear?: boolean;
}

export interface OpeningWarning {
  code: string;
  message: string;
}

export interface OpeningItemState {
  opening: OpeningValue | null;
  debt: number;
  advance: number;
  paid_until: string | null;
  status: string;
  lessons_left: number | null;
}

export interface OpeningLessons {
  lessons_left: number;
  paid_until: string | null;
  text: string;
}

export type OpeningItemKind = "paid_until" | "debt" | "both" | "cleared" | "unchanged" | "error";

export interface OpeningItemResult {
  membership_id: string;
  student_name: string | null;
  group_name: string | null;
  status: "ok" | "noop" | "error";
  kind: OpeningItemKind;
  code: string | null;
  message: string | null;
  changed: boolean;
  target: OpeningValue | null;
  lessons: OpeningLessons | null;
  before: OpeningItemState | null;
  after: OpeningItemState | null;
  has_money_records: boolean;
  needs_reason: boolean;
  warnings: OpeningWarning[];
}

export interface OpeningBatchSummary {
  items: number;
  changed: number;
  paid_until: number;
  debt: number;
  cleared: number;
  unchanged: number;
  errors: number;
  debt_total_added: number;
}

export interface OpeningBatchImpact {
  memberships_changed: number;
  memberships_with_new_debt: number;
  memberships_with_changed_advance: number;
  debt_total_before: number;
  debt_total_after: number;
  debt_delta: number;
  debtors_before: number;
  debtors_after: number;
  advance_delta: number;
  refundable_delta: number;
  indirect_changed: number;
}

export interface OpeningBatchPreview {
  ok: boolean;
  digest: string;
  accounting_start: string;
  summary: OpeningBatchSummary;
  impact: OpeningBatchImpact;
  needs_reason: string[];
  items: OpeningItemResult[];
}

export interface OpeningBatchApplied {
  batch_id: string;
  replayed: boolean;
  summary: OpeningBatchSummary;
  impact: OpeningBatchImpact;
  changed: number;
  state: OpeningsState;
}

export interface OpeningsImportRow {
  row: number;
  membership_id: string | null;
  matched_by: "membership_id" | "student_group" | "name" | null;
  student_name: string | null;
  group_name: string | null;
  status: "ok" | "noop" | "error" | "skipped";
  code: string | null;
  message: string | null;
  kind: OpeningItemKind | null;
}

export interface OpeningsImportFile {
  rows_read: number;
  matched: number;
  changed: number;
  unchanged: number;
  errors: number;
  unknown: number;
  missing_in_file: number;
}

export interface OpeningsImportPreview extends OpeningBatchPreview {
  file: OpeningsImportFile;
  rows: OpeningsImportRow[];
  batch_items: OpeningBatchItem[];
}

// ── Reading the answers (a missing field is a zero / an empty list, never a crash) ─────────────────────────

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
type Raw = Record<string, any>;

export function normalizeState(value: unknown): OpeningsState {
  if (value === "pending" || value === "done" || value === "skipped") return value;
  return "none"; // «none», the spec's «off» and anything unknown
}

export function normalizeValue(raw: Raw | null | undefined): OpeningValue | null {
  if (!raw) return null;
  return { paid_until: text(raw.paid_until), debt_amount: raw.debt_amount ? num(raw.debt_amount) : null, debt_on: text(raw.debt_on) };
}

export function normalizeTotals(raw: Raw | null | undefined): OpeningTotals {
  return {
    memberships: num(raw?.memberships),
    with_opening: num(raw?.with_opening),
    missing: num(raw?.missing),
    left_available: num(raw?.left_available),
    shown: num(raw?.shown),
    needs_review: num(raw?.needs_review),
  };
}

export function normalizeSummary(raw: Raw | null | undefined): OpeningsSummary {
  return { accounting_start: String(raw?.accounting_start ?? ""), state: normalizeState(raw?.state), totals: normalizeTotals(raw?.totals) };
}

export function normalizeRow(raw: Raw): OpeningRow {
  const price = (raw.price ?? {}) as Raw;
  return {
    membership_id: String(raw.membership_id),
    student: {
      id: String(raw.student?.id ?? ""),
      name: String(raw.student?.name ?? ""),
      display_id: text(raw.student?.display_id),
      class_level: raw.student?.class_level === null || raw.student?.class_level === undefined ? null : num(raw.student.class_level),
    },
    group: { id: String(raw.group?.id ?? ""), name: String(raw.group?.name ?? "") },
    mode: raw.mode === "lessons" ? "lessons" : "calendar",
    price: {
      amount: price.amount === null || price.amount === undefined ? null : num(price.amount),
      source: price.source === "override" ? "override" : price.source === "none" ? "none" : "group",
      valid_from: text(price.valid_from),
      group_amount: price.group_amount === null || price.group_amount === undefined ? null : num(price.group_amount),
      reason: text(price.reason),
    },
    enrolled_on: String(raw.enrolled_on ?? ""),
    status: raw.status === "left" ? "left" : "active",
    left_on: text(raw.left_on),
    paused: Boolean(raw.paused),
    opening: normalizeValue(raw.opening),
    version: String(raw.version ?? "-"),
    has_money_records: Boolean(raw.has_money_records),
    missing: Boolean(raw.missing),
    needs_review: Boolean(raw.needs_review),
    floor: String(raw.floor ?? ""),
    only_debt: Boolean(raw.only_debt),
    editable: raw.editable !== false,
    reason_not_editable: raw.reason_not_editable === "transfer" || raw.reason_not_editable === "free" ? raw.reason_not_editable : null,
  };
}

export function normalizeList(raw: Raw | null | undefined): OpeningsList {
  return {
    ...normalizeSummary(raw),
    as_of: String(raw?.as_of ?? ""),
    period_mode: raw?.period_mode === "lessons" ? "lessons" : "calendar",
    paid_until_max: String(raw?.paid_until_max ?? ""),
    groups: list<Raw>(raw?.groups).map((group) => ({
      id: String(group.id),
      name: String(group.name ?? ""),
      teacher_name: text(group.teacher_name),
      total: num(group.total),
      with_opening: num(group.with_opening),
      missing: num(group.missing),
      memberships: list<Raw>(group.memberships).map(normalizeRow),
    })),
  };
}

const emptyImpact = (): OpeningBatchImpact => ({
  memberships_changed: 0, memberships_with_new_debt: 0, memberships_with_changed_advance: 0, debt_total_before: 0, debt_total_after: 0,
  debt_delta: 0, debtors_before: 0, debtors_after: 0, advance_delta: 0, refundable_delta: 0, indirect_changed: 0,
});

export function normalizeImpact(raw: Raw | null | undefined): OpeningBatchImpact {
  const base = emptyImpact();
  for (const key of Object.keys(base) as Array<keyof OpeningBatchImpact>) base[key] = num(raw?.[key]);
  return base;
}

export function normalizeBatchSummary(raw: Raw | null | undefined): OpeningBatchSummary {
  return {
    items: num(raw?.items), changed: num(raw?.changed), paid_until: num(raw?.paid_until), debt: num(raw?.debt), cleared: num(raw?.cleared),
    unchanged: num(raw?.unchanged), errors: num(raw?.errors), debt_total_added: num(raw?.debt_total_added),
  };
}

function normalizeItemState(raw: Raw | null | undefined): OpeningItemState | null {
  if (!raw) return null;
  return {
    opening: normalizeValue(raw.opening), debt: num(raw.debt), advance: num(raw.advance), paid_until: text(raw.paid_until),
    status: String(raw.status ?? "none"), lessons_left: raw.lessons_left === null || raw.lessons_left === undefined ? null : num(raw.lessons_left),
  };
}

export function normalizeItem(raw: Raw): OpeningItemResult {
  return {
    membership_id: String(raw.membership_id),
    student_name: text(raw.student_name),
    group_name: text(raw.group_name),
    status: raw.status === "error" ? "error" : raw.status === "noop" ? "noop" : "ok",
    kind: (raw.kind ?? "unchanged") as OpeningItemKind,
    code: text(raw.code),
    message: text(raw.message),
    changed: Boolean(raw.changed),
    target: normalizeValue(raw.target),
    lessons: raw.lessons ? { lessons_left: num(raw.lessons.lessons_left), paid_until: text(raw.lessons.paid_until), text: String(raw.lessons.text ?? "") } : null,
    before: normalizeItemState(raw.before),
    after: normalizeItemState(raw.after),
    has_money_records: Boolean(raw.has_money_records),
    needs_reason: Boolean(raw.needs_reason),
    warnings: list<Raw>(raw.warnings).map((warning) => ({ code: String(warning.code), message: String(warning.message ?? "") })),
  };
}

export function normalizePreview(raw: Raw | null | undefined): OpeningBatchPreview {
  return {
    ok: Boolean(raw?.ok),
    digest: String(raw?.digest ?? ""),
    accounting_start: String(raw?.accounting_start ?? ""),
    summary: normalizeBatchSummary(raw?.summary),
    impact: normalizeImpact(raw?.impact),
    needs_reason: list<unknown>(raw?.needs_reason).map(String),
    items: list<Raw>(raw?.items).map(normalizeItem),
  };
}

export function normalizeApplied(raw: Raw | null | undefined): OpeningBatchApplied {
  return {
    batch_id: String(raw?.batch_id ?? ""),
    replayed: Boolean(raw?.replayed),
    summary: normalizeBatchSummary(raw?.summary),
    impact: normalizeImpact(raw?.impact),
    changed: num(raw?.changed),
    state: normalizeState(raw?.state),
  };
}

export function normalizeImport(raw: Raw | null | undefined): OpeningsImportPreview {
  const file = (raw?.file ?? {}) as Raw;
  return {
    ...normalizePreview(raw),
    file: {
      rows_read: num(file.rows_read), matched: num(file.matched), changed: num(file.changed), unchanged: num(file.unchanged),
      errors: num(file.errors), unknown: num(file.unknown), missing_in_file: num(file.missing_in_file),
    },
    rows: list<Raw>(raw?.rows).map((row) => ({
      row: num(row.row),
      membership_id: text(row.membership_id),
      matched_by: row.matched_by ?? null,
      student_name: text(row.student_name),
      group_name: text(row.group_name),
      status: row.status ?? "ok",
      code: text(row.code),
      message: text(row.message),
      kind: row.kind ?? null,
    })),
    batch_items: list<Raw>(raw?.batch_items).map((item) => ({
      membership_id: String(item.membership_id),
      version: String(item.version ?? "-"),
      paid_until: item.paid_until ?? null,
      debt_amount: item.debt_amount ?? null,
      debt_on: item.debt_on ?? null,
      lessons_left: item.lessons_left ?? null,
      clear: Boolean(item.clear),
    })),
  };
}

// ── Words of the screen ─────────────────────────────────────────────────────

export const OPENINGS_TITLE = "Остатки на начало";
export const OPENINGS_SHOW_LEFT = "Показать ушедших";
export const OPENINGS_ONLY_MISSING = "Только незаполненные";
export const OPENINGS_LEFT_NOTE = "Ушедшим можно внести только долг на начало.";
export const OPENINGS_UNSAVED = "Остатки не сохранены. Уйти со страницы и потерять правки?";

const dm = (iso: string): string => formatDateRu(iso).slice(0, 5);
const dmy = (iso: string): string => formatDateRu(iso);

/** The one sentence under the title (the wording of the lead, 22.10). */
export function openingsIntro(accountingStart: string): string {
  const day = dmy(accountingStart);
  return `Отметьте, что было у учеников до начала учёта ${day || "—"}: кто оплатил вперёд и кто должен. Стоимость занятий в ALGO считается с этой даты.`;
}

/** The day before the accounting start: «оплачено до» that day = «на начало долга нет». */
export function noDebtDay(accountingStart: string): string {
  return addDays(accountingStart, -1);
}

/** «ученик / ученика / учеников» after a number. */
export const studentsWord = (count: number): string => pluralRu(count, "ученик", "ученика", "учеников");
/** After «у»: «у 1 ученика / у 5 учеников». */
export const atStudentsWord = (count: number): string => pluralRu(count, "ученика", "учеников", "учеников");
/** After «у» for a count of balances: «у 1 остатка / у 5 остатков». */
const balancesWord = (count: number): string => pluralRu(count, "остатка", "остатков", "остатков");
const rowsWord = (count: number): string => pluralRu(count, "строку", "строки", "строк");
const changesWord = (count: number): string => pluralRu(count, "изменение", "изменения", "изменений");

export interface Progress {
  filled: number;
  needed: number;
  percent: number;
  left: number;
  text: string;
}

/**
 * «Заполнено 38 из 120»: the rows that have an opening of those that must have one (an opening or still missing).  100% exactly
 * when `missing` is 0 - the moment the server turns the state to `done`.
 */
export function progressOf(totals: { with_opening: number; missing: number }): Progress {
  const filled = Math.max(0, totals.with_opening);
  const left = Math.max(0, totals.missing);
  const needed = filled + left;
  return { filled, needed, left, percent: needed === 0 ? 100 : Math.floor((filled * 100) / needed), text: needed === 0 ? "Остатки не нужны: все ученики пришли после начала учёта" : `Заполнено ${filled} из ${needed}` };
}

/** The same count for the rows of one group on screen (the left students are not counted). */
export function groupProgress(rows: readonly OpeningRow[]): { filled: number; needed: number; text: string } {
  const active = rows.filter((row) => row.status !== "left");
  const filled = active.filter((row) => row.opening !== null).length;
  const needed = filled + active.filter((row) => row.missing).length;
  return { filled, needed, text: `заполнено ${filled} из ${needed}` };
}

/** «Сейчас»: the saved opening in human words. */
export function currentText(row: Pick<OpeningRow, "opening" | "missing" | "status">, accountingStart: string): string {
  const opening = row.opening;
  if (!opening || (!opening.paid_until && !opening.debt_amount)) return row.missing ? "Не заполнено" : "Остатка нет";
  const parts: string[] = [];
  if (opening.paid_until) {
    parts.push(opening.paid_until === noDebtDay(accountingStart) && !opening.debt_amount ? "Долга на начало нет" : `Оплачено до ${dm(opening.paid_until)}`);
  }
  if (opening.debt_amount) parts.push(`Долг ${formatMoney(opening.debt_amount)}${opening.debt_on ? ` на ${dm(opening.debt_on)}` : ""}`);
  return parts.join(" · ");
}

/** The same words for a value of a preview («Было → Станет»). */
export function valueText(value: OpeningValue | null | undefined, accountingStart: string): string {
  if (!value || (!value.paid_until && !value.debt_amount)) return "не заполнено";
  return currentText({ opening: value, missing: false, status: "active" }, accountingStart).replace(/^./, (c) => c.toLowerCase());
}

/** «600 000 сум/мес · инд.», «1 200 000 сум за пакет», «бесплатно», «цена не задана». */
export function priceText(row: Pick<OpeningRow, "price" | "mode">): string {
  const price = row.price;
  if (!price || price.source === "none" || price.amount === null || price.amount === undefined) return "цена не задана";
  const base = formatPrice(price.amount, priceLabelOf(row.mode));
  return price.source === "override" && price.amount !== 0 ? `${base} · инд.` : base;
}

export interface RowChip {
  key: string;
  label: string;
  tone: "slate" | "amber" | "sky" | "rose";
  title?: string;
}

/** The small marks of a row: pause, individual price, transfer, free, payments exist, left, no price, to review. */
export function rowChips(row: OpeningRow, accountingStart: string): RowChip[] {
  const chips: RowChip[] = [];
  if (row.status === "left") chips.push({ key: "left", label: row.left_on ? `ушёл ${dm(row.left_on)}` : "ушёл", tone: "slate" });
  if (row.paused) chips.push({ key: "paused", label: "пауза", tone: "sky" });
  if (row.price.source === "override" && row.price.amount !== 0) chips.push({ key: "individual", label: "индивид. цена", tone: "slate", title: row.price.reason ?? undefined });
  if (row.reason_not_editable === "transfer") chips.push({ key: "transfer", label: "пришёл переводом", tone: "slate" });
  if (row.reason_not_editable === "free") chips.push({ key: "free", label: "бесплатно", tone: "slate" });
  if (row.has_money_records) chips.push({ key: "money", label: "есть оплаты", tone: "amber", title: "Правка остатка у ученика с оплатами требует причины" });
  if (row.price.source === "none" || row.price.amount === null) chips.push({ key: "no_price", label: "нет цены", tone: "amber", title: "Пока у группы нет цены, стоимость не считается" });
  if (row.needs_review) chips.push({ key: "review", label: "проверьте даты", tone: "rose", title: "Остаток не подходит под дату начала учёта: исправьте или уберите" });
  if (row.status !== "left" && row.enrolled_on && accountingStart && row.enrolled_on >= accountingStart && !row.opening) {
    chips.push({ key: "late", label: `пришёл ${dm(row.enrolled_on)}`, tone: "slate", title: "Пришёл после начала учёта: остаток обычно не нужен" });
  }
  return chips;
}

/** Why a row cannot be edited (the field is off, the reason is under it). */
export function notEditableText(reason: ReasonNotEditable | null): string | null {
  if (reason === "transfer") return "Пришёл переводом из другой группы: остаток вносится там";
  if (reason === "free") return "Бесплатное обучение: остаток не нужен";
  return null;
}

// ── The draft of a row ──────────────────────────────────────────────────────

/** What the user typed in a row.  The item REPLACES the whole opening of the membership, so the draft starts from the saved values. */
export interface RowDraft {
  /** `YYYY-MM-DD` or "". */
  paidUntil: string;
  /** Digits with separators, as typed. */
  debt: string;
  /** `YYYY-MM-DD` or "" (empty: the floor of the row). */
  debtOn: string;
  /** Lessons mode: «осталось уроков» (digits) instead of «оплачено до». */
  lessons: string;
  /** The saved opening is to be removed («Очистить»). */
  clear: boolean;
}

export type Drafts = Record<string, RowDraft>;

export function draftOfRow(row: Pick<OpeningRow, "opening">): RowDraft {
  const opening = row.opening;
  return {
    paidUntil: opening?.paid_until ?? "",
    debt: opening?.debt_amount ? formatMoneyInput(opening.debt_amount) : "",
    debtOn: opening?.debt_on ?? "",
    lessons: "",
    clear: false,
  };
}

/** The draft of the row as it is now (an untouched row: the saved values). */
export function draftFor(row: OpeningRow, drafts: Drafts): RowDraft {
  return drafts[row.membership_id] ?? draftOfRow(row);
}

export interface DraftTarget {
  paid_until: string | null;
  debt_amount: number | null;
  debt_on: string | null;
  lessons_left: number | null;
}

/** What the draft would store (a debt without a date takes the floor of the row; a date without a debt is dropped). */
export function draftTarget(row: Pick<OpeningRow, "floor">, draft: RowDraft): DraftTarget {
  const debt = parseMoneyInput(draft.debt);
  const lessonsText = draft.lessons.replace(/\D+/g, "");
  return {
    paid_until: draft.paidUntil || null,
    debt_amount: debt !== null && debt > 0 ? debt : null,
    debt_on: debt !== null && debt > 0 ? draft.debtOn || row.floor : null,
    lessons_left: lessonsText === "" ? null : Number(lessonsText),
  };
}

function sameValue(opening: OpeningValue | null, target: DraftTarget): boolean {
  return (opening?.paid_until ?? null) === target.paid_until
    && (opening?.debt_amount ?? null) === target.debt_amount
    && (opening?.debt_on ?? null) === target.debt_on;
}

/** Does the draft differ from what is saved?  (Lessons are always a change: the conversion is the server's.) */
export function isChanged(row: OpeningRow, draft: RowDraft | undefined): boolean {
  if (!draft) return false;
  if (draft.clear) return row.opening !== null;
  const target = draftTarget(row, draft);
  if (target.lessons_left !== null) return true;
  if (target.paid_until === null && target.debt_amount === null) return row.opening !== null; // everything blanked: the saved one goes
  return !sameValue(row.opening, target);
}

/** The item of a batch for the row; null when nothing changes. */
export function itemOf(row: OpeningRow, draft: RowDraft | undefined): OpeningBatchItem | null {
  if (!draft || !isChanged(row, draft)) return null;
  const base = { membership_id: row.membership_id, version: row.version };
  const target = draftTarget(row, draft);
  if (draft.clear || (target.lessons_left === null && target.paid_until === null && target.debt_amount === null)) return { ...base, clear: true };
  const item: OpeningBatchItem = { ...base };
  if (target.lessons_left !== null) item.lessons_left = target.lessons_left;
  else item.paid_until = target.paid_until;
  item.debt_amount = target.debt_amount;
  item.debt_on = target.debt_on;
  return item;
}

export function flatRows(groups: readonly OpeningGroupBlock[]): OpeningRow[] {
  return groups.flatMap((group) => group.memberships);
}

/** The items of every changed row (in the order of the table), without the rows the user left out. */
export function itemsOf(rows: readonly OpeningRow[], drafts: Drafts, skip: ReadonlySet<string> = new Set()): OpeningBatchItem[] {
  const items: OpeningBatchItem[] = [];
  for (const row of rows) {
    if (skip.has(row.membership_id)) continue;
    const item = itemOf(row, drafts[row.membership_id]);
    if (item) items.push(item);
  }
  return items;
}

export function changedCount(rows: readonly OpeningRow[], drafts: Drafts): number {
  return rows.filter((row) => isChanged(row, drafts[row.membership_id])).length;
}

/**
 * The drafts of rows that no longer change anything are dropped (the user typed the saved value back).  A draft of a row that is not
 * in `rows` is KEPT: the table can be read again with fewer rows («Показать ушедших» off, another group) and the typed values come
 * back with the rows; they are only never sent while their row is not on the page.
 */
export function prunedDrafts(rows: readonly OpeningRow[], drafts: Drafts): Drafts {
  const next: Drafts = {};
  const byId = new Map(rows.map((row) => [row.membership_id, row] as const));
  for (const [id, draft] of Object.entries(drafts)) {
    const row = byId.get(id);
    if (!row || isChanged(row, draft)) next[id] = draft;
  }
  return next;
}

/** Drafts whose row is not in the table now (they wait for the row to come back). */
export function hiddenDraftCount(rows: readonly OpeningRow[], drafts: Drafts): number {
  const present = new Set(rows.map((row) => row.membership_id));
  return Object.keys(drafts).filter((id) => !present.has(id)).length;
}

/** What a coming read would hide: the rows it keeps are tested by `stays`; the count is of the changed drafts among the others. */
export function draftsAtRisk(rows: readonly OpeningRow[], drafts: Drafts, stays: (row: OpeningRow) => boolean): number {
  return rows.filter((row) => !stays(row) && isChanged(row, drafts[row.membership_id])).length;
}

/** The question before a read that hides rows with typed values (`window.confirm` through `confirmLeave`). */
export function openingsHiddenDraftsText(count: number): string {
  return `Вы изменили остатки у ${count} ${atStudentsWord(count)}, которые пропадут из таблицы. Эти правки не попадут в сохранение, пока вы снова не покажете строки. Продолжить?`;
}

export interface DraftContext {
  /** The latest «оплачено до» the server accepts. */
  paidUntilMax: string;
}

export const OPENING_MIN_DATE = "2020-01-01";
export const LESSONS_LEFT_MAX = 400;

/** The first problem of a row, in words (null = fine).  The floor comes from the server; the last word is the server's preview. */
export function validateDraft(row: OpeningRow, draft: RowDraft | undefined, context: DraftContext): string | null {
  if (!draft || draft.clear) return null;
  if (!row.editable) return notEditableText(row.reason_not_editable);
  const lessonsText = draft.lessons.trim();
  if (lessonsText !== "") {
    if (!/^\d+$/.test(lessonsText) || Number(lessonsText) > LESSONS_LEFT_MAX) return `Осталось уроков: число от 0 до ${LESSONS_LEFT_MAX}`;
    if (draft.paidUntil) return "Укажите либо «Оплачено до», либо «Осталось уроков»";
  }
  if (draft.paidUntil) {
    if (!isIsoDate(draft.paidUntil)) return "Укажите дату «Оплачено до»";
    if (row.only_debt) return "Ушедшему можно внести только долг на начало";
    if (row.floor && draft.paidUntil < row.floor) return `«Оплачено до» — не раньше ${dmy(row.floor)}: за более ранние дни внесите долг`;
    if (context.paidUntilMax && draft.paidUntil > context.paidUntilMax) return "«Оплачено до» — не дальше чем на год вперёд";
  }
  const debt = parseMoneyInput(draft.debt);
  if (debt !== null) {
    if (debt < 1) return "Долг должен быть больше нуля";
    if (debt > MAX_MONEY) return "Сумма долга слишком большая";
    const on = draft.debtOn || row.floor;
    if (!isIsoDate(on)) return "Укажите, на какую дату был долг";
    if (on < OPENING_MIN_DATE) return "Дата долга — не раньше 01.01.2020";
    if (row.floor && on > row.floor) return `«Долг на дату» — не позже ${dmy(row.floor)}: долг после этого дня считается сам`;
  }
  return null;
}

/** Problems of every changed row: id -> words. */
export function draftProblems(rows: readonly OpeningRow[], drafts: Drafts, context: DraftContext): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const row of rows) {
    const draft = drafts[row.membership_id];
    if (!draft || !isChanged(row, draft)) continue;
    const problem = validateDraft(row, draft, context);
    if (problem) problems[row.membership_id] = problem;
  }
  return problems;
}

// ── Lessons mode: «осталось K уроков → оплачено до» ────────────────────────

/** The short arrow under the field: «→ оплачено до 14.11» (the conversion is the server's, shown after a preview). */
export function lessonsArrow(lessons: OpeningLessons | null | undefined): string | null {
  if (!lessons) return null;
  if (lessons.lessons_left === 0) return "→ долга на начало нет";
  return lessons.paid_until ? `→ оплачено до ${dm(lessons.paid_until)}` : null;
}

/** The items with a lessons figure (they get a quick preview for the arrow). */
export function lessonItems(items: readonly OpeningBatchItem[]): OpeningBatchItem[] {
  return items.filter((item) => item.lessons_left !== null && item.lessons_left !== undefined && !item.clear);
}

// ── Bulk actions ────────────────────────────────────────────────────────────

export type BulkAction =
  | { kind: "paid_until"; date: string }
  | { kind: "no_debt" }
  | { kind: "clear" };

export type SkipReason = "transfer" | "free" | "left" | "before_floor" | "too_far" | "late";

export interface BulkResult {
  drafts: Drafts;
  applied: number;
  skipped: Array<{ id: string; reason: SkipReason }>;
}

export interface BulkContext {
  accountingStart: string;
  paidUntilMax: string;
}

/** «Оплачено до …» / «Долга нет» / «Очистить» for the selected rows.  A row the action cannot touch is skipped with the reason. */
export function applyBulk(rows: readonly OpeningRow[], drafts: Drafts, action: BulkAction, context: BulkContext): BulkResult {
  const next: Drafts = { ...drafts };
  const skipped: BulkResult["skipped"] = [];
  let applied = 0;
  const date = action.kind === "paid_until" ? action.date : action.kind === "no_debt" ? noDebtDay(context.accountingStart) : null;
  for (const row of rows) {
    const id = row.membership_id;
    if (!row.editable) { skipped.push({ id, reason: row.reason_not_editable === "free" ? "free" : "transfer" }); continue; }
    if (action.kind === "clear") {
      if (row.opening) next[id] = { ...draftOfRow(row), paidUntil: "", debt: "", debtOn: "", lessons: "", clear: true };
      else delete next[id];
      applied += 1;
      continue;
    }
    if (row.status === "left" || row.only_debt) { skipped.push({ id, reason: "left" }); continue; }
    if (date && row.floor && date < row.floor) { skipped.push({ id, reason: action.kind === "no_debt" ? "late" : "before_floor" }); continue; }
    if (date && context.paidUntilMax && date > context.paidUntilMax) { skipped.push({ id, reason: "too_far" }); continue; }
    // what the user already typed in the row stays (a debt next to the new date); an earlier «Очистить» is taken back
    const typed = drafts[id];
    const base = typed && !typed.clear ? typed : draftOfRow(row);
    // «Долга нет» says there is nothing on the start: the saved debt goes too; «Оплачено до» keeps a saved debt.
    next[id] = { ...base, paidUntil: date ?? "", lessons: "", clear: false, ...(action.kind === "no_debt" ? { debt: "", debtOn: "" } : {}) };
    applied += 1;
  }
  return { drafts: prunedDrafts(rows, next), applied, skipped };
}

const SKIP_WORDS: Record<SkipReason, [string, string]> = {
  transfer: ["пришёл переводом", "пришли переводом"],
  free: ["бесплатный", "бесплатных"],
  left: ["ушёл (только долг)", "ушли (только долг)"],
  before_floor: ["дата раньше допустимой", "дата раньше допустимой"],
  too_far: ["дата слишком далеко", "дата слишком далеко"],
  late: ["пришёл после начала учёта", "пришли после начала учёта"],
};

/** «Пропущено 3: 2 пришли переводом, 1 бесплатный». */
export function skipText(skipped: ReadonlyArray<{ reason: SkipReason }>): string | null {
  if (skipped.length === 0) return null;
  const counts = new Map<SkipReason, number>();
  for (const { reason } of skipped) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const parts = Array.from(counts, ([reason, count]) => (count === 1 ? `1 ${SKIP_WORDS[reason][0]}` : `${count} ${SKIP_WORDS[reason][1]}`));
  return `Пропущено ${skipped.length}: ${parts.join(", ")}`;
}

/** What the bulk bar says it did: «Оплачено до 30.11 — 12 учеников» (+ the skipped). */
export function bulkDoneText(action: BulkAction, result: BulkResult, accountingStart: string): string {
  const what = action.kind === "paid_until"
    ? (action.date === noDebtDay(accountingStart) ? "Долга на начало нет" : `Оплачено до ${dm(action.date)}`)
    : action.kind === "no_debt" ? "Долга на начало нет" : "Остаток уберём";
  const head = `${what}: ${result.applied} ${studentsWord(result.applied)}`;
  const skipped = skipText(result.skipped);
  return skipped ? `${head}. ${skipped}` : head;
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function lastDayOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

export interface QuickDate {
  date: string;
  label: string;
}

/** «31.10 (долга нет)» and «30.11 (оплатил ноябрь)»: the two answers of nearly every student. */
export function quickDates(accountingStart: string): QuickDate[] {
  if (!isIsoDate(accountingStart)) return [];
  const before = noDebtDay(accountingStart);
  const end = lastDayOfMonth(accountingStart);
  const month = MONTHS[Number(accountingStart.slice(5, 7)) - 1];
  return [
    { date: before, label: `${dm(before)} (долга нет)` },
    { date: end, label: `${dm(end)} (оплатил ${month})` },
  ];
}

// ── Selection ───────────────────────────────────────────────────────────────

/** A row can be selected when it can be edited and has not left (the left ones take a debt in the row itself). */
export const isSelectable = (row: OpeningRow): boolean => row.editable && row.status !== "left";

export function groupSelection(rows: readonly OpeningRow[], selected: ReadonlySet<string>): "all" | "some" | "none" {
  const pool = rows.filter(isSelectable);
  if (pool.length === 0) return "none";
  const count = pool.filter((row) => selected.has(row.membership_id)).length;
  return count === 0 ? "none" : count === pool.length ? "all" : "some";
}

/** Clicking the checkbox of a group: everything selectable in it (what the filters show) is selected, or - when it all was - unselected. */
export function toggleGroupSelection(rows: readonly OpeningRow[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const pool = rows.filter(isSelectable);
  const all = groupSelection(rows, selected) === "all";
  for (const row of pool) {
    if (all) next.delete(row.membership_id);
    else next.add(row.membership_id);
  }
  return next;
}

export function selectedRows(rows: readonly OpeningRow[], selected: ReadonlySet<string>): OpeningRow[] {
  return rows.filter((row) => selected.has(row.membership_id) && isSelectable(row));
}

// ── Filters ─────────────────────────────────────────────────────────────────

export interface OpeningsFilters {
  groupId: string;
  onlyMissing: boolean;
  search: string;
}

export const NO_FILTERS: OpeningsFilters = { groupId: "", onlyMissing: false, search: "" };

/** The groups with only the rows the filters show; a group with no row is left out.  The search looks at the name and the ID of the student. */
export function filterGroups(groups: readonly OpeningGroupBlock[], filters: OpeningsFilters, drafts: Drafts = {}): OpeningGroupBlock[] {
  const words = filters.search.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  const out: OpeningGroupBlock[] = [];
  for (const group of groups) {
    if (filters.groupId && group.id !== filters.groupId) continue;
    const memberships = group.memberships.filter((row) => {
      // A row the user is editing stays on screen (a filled row would vanish under «Только незаполненные» while typing)
      if (filters.onlyMissing && !row.missing && !drafts[row.membership_id]) return false;
      if (words.length === 0) return true;
      const hay = `${row.student.name} ${row.student.display_id ?? ""}`.toLocaleLowerCase("ru");
      return words.every((word) => hay.includes(word));
    });
    if (memberships.length > 0) out.push({ ...group, memberships });
  }
  return out;
}

/** The group that opens first: the first one that still has an empty row; with a search every group is open. */
export function initiallyOpenGroups(groups: readonly OpeningGroupBlock[], searching: boolean): Set<string> {
  if (searching) return new Set(groups.map((group) => group.id));
  const first = groups.find((group) => group.memberships.some((row) => row.missing)) ?? groups[0];
  return new Set(first ? [first.id] : []);
}

// ── Review (the preview of the batch) ───────────────────────────────────────

/** `before -> after` of a signed sum: «+1 250 000 сум». */
const signed = (value: number): string => `${value < 0 ? "−" : "+"}${formatMoney(Math.abs(value))}`;

export interface ReviewParts {
  /** «Изменится 41 ученик». */
  headline: string;
  /** What is written: «38 — оплачено до 31.10», «4 — долг 1 250 000 сум». */
  parts: string[];
  /** What happens to the debts: «Должников станет 12, общий долг +1 250 000 сум». */
  effect: string;
  /** Lines under it: the advance, the students tied by a transfer. */
  notes: string[];
}

/** The summary before saving, in the words of the owner; every figure is the server's (`summary`, `impact`, the targets of the items). */
export function reviewParts(preview: OpeningBatchPreview): ReviewParts {
  const start = preview.accounting_start;
  const changedItems = preview.items.filter((item) => item.status === "ok" && item.changed);
  const byDay = new Map<string, number>();
  let debtCount = 0;
  let debtSum = 0;
  let cleared = 0;
  for (const item of changedItems) {
    if (item.kind === "cleared") { cleared += 1; continue; }
    const target = item.target;
    if (target?.paid_until) byDay.set(target.paid_until, (byDay.get(target.paid_until) ?? 0) + 1);
    if (target?.debt_amount) { debtCount += 1; debtSum += target.debt_amount; }
  }
  const parts: string[] = [];
  for (const [day, count] of Array.from(byDay).sort(([a], [b]) => (a < b ? -1 : 1))) {
    parts.push(`${count} — ${day === noDebtDay(start) ? "долга на начало нет" : `оплачено до ${dm(day)}`}`);
  }
  if (debtCount > 0) parts.push(`${debtCount} — долг ${formatMoney(debtSum)}`);
  if (cleared > 0) parts.push(`${cleared} — остаток уберём`);

  const impact = preview.impact;
  const effect = [
    impact.debtors_after !== impact.debtors_before ? `Должников станет ${impact.debtors_after}` : "Число должников не изменится",
    impact.debt_delta === 0 ? "общий долг не изменится" : `общий долг ${signed(impact.debt_delta)}`,
  ].join(", ");
  const notes: string[] = [];
  if (impact.advance_delta !== 0) notes.push(`Аванс учеников: ${signed(impact.advance_delta)}`);
  if (impact.indirect_changed > 0) notes.push(`Баланс изменится ещё у ${impact.indirect_changed} ${atStudentsWord(impact.indirect_changed)}, связанных переводом`);
  const changed = preview.summary.changed;
  return { headline: `Изменится ${changed} ${studentsWord(changed)}`, parts, effect, notes };
}

/** One line: «Изменится 2 ученика: 1 — оплачено до 30.11 · 1 — долг 550 000 сум · Должников станет 1, общий долг +550 000 сум». */
export function reviewSentence(preview: OpeningBatchPreview): string {
  const review = reviewParts(preview);
  return `${review.headline}${review.parts.length ? `: ${review.parts.join(" · ")}` : ""} · ${review.effect}`;
}

/** The soft warnings of a preview that deserve a line (the need for a reason has its own field). */
export function previewWarnings(preview: OpeningBatchPreview): Array<{ id: string; student: string; text: string }> {
  const lines: Array<{ id: string; student: string; text: string }> = [];
  for (const item of preview.items) {
    for (const warning of item.warnings) {
      if (warning.code === "HAS_MONEY" || warning.code === "CLEARS_EXISTING") continue;
      lines.push({ id: item.membership_id, student: item.student_name ?? "Ученик", text: warning.message });
    }
  }
  return lines;
}

/** The rows the server refused, id -> words. */
export function previewErrors(preview: OpeningBatchPreview | null | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of preview?.items ?? []) {
    if (item.status === "error") errors[item.membership_id] = itemErrorText(item.code, item.message);
  }
  return errors;
}

/** The rows of a preview that somebody else changed since the table was read (`STALE_VERSION`): they are refreshed, not shown as errors. */
export function staleIds(preview: OpeningBatchPreview | null | undefined): string[] {
  return (preview?.items ?? []).filter((item) => item.status === "error" && item.code === "STALE_VERSION").map((item) => item.membership_id);
}

export function errorRowIds(preview: OpeningBatchPreview | null | undefined): string[] {
  return (preview?.items ?? []).filter((item) => item.status === "error").map((item) => item.membership_id);
}

/** «Нужна причина»: the rows with money are listed, the reason is one for the batch. */
export function reasonNeeded(preview: OpeningBatchPreview | null | undefined): boolean {
  return (preview?.needs_reason.length ?? 0) > 0;
}

export function reasonProblem(reason: string | null | undefined): string | null {
  const value = (reason ?? "").trim();
  if (value.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (value.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

/** Can «Сохранить» be pressed? */
export function canSave(preview: OpeningBatchPreview | null | undefined, reason: string): boolean {
  if (!preview || !preview.ok || preview.summary.changed === 0) return false;
  return !reasonNeeded(preview) || reasonProblem(reason) === null;
}

/** «Сохранено: 38 · долг центра +1 250 000 сум». */
export function appliedText(applied: OpeningBatchApplied): string {
  const head = applied.changed === 0 ? "Всё уже было так — менять нечего" : `Сохранено: ${applied.changed} ${studentsWord(applied.changed)}`;
  const delta = applied.impact.debt_delta;
  return delta === 0 ? head : `${head} · долг центра ${signed(delta)}`;
}

// ── Words of the errors ─────────────────────────────────────────────────────

/** The codes of one item of a batch / of one row of a file → the words of the owner (the server's message is the fallback). */
const ITEM_CODE_TEXT: Record<string, string> = {
  NOT_FOUND: "ученика нет в этой группе",
  STUDENT_ARCHIVED: "ученик в архиве",
  MEMBERSHIP_CLOSED: "ученик уже ушёл из группы",
  DUPLICATE_ITEM: "ученик указан дважды",
  STALE_VERSION: "строку уже изменил кто-то другой",
  EMPTY_ITEM: "нечего сохранять: ничего не указано",
  CLEAR_WITH_VALUES: "нельзя одновременно убрать остаток и внести значения",
  OPENING_RANGE: "дата не подходит: «Оплачено до» — не раньше дня перед началом учёта, «Долг на дату» — не позже него",
  AMOUNT_RANGE: "сумма долга: целое число от 1 до 10 000 000 000 сум",
  OPENING_NOT_ALLOWED: "пришёл переводом: остаток вносится в группе, откуда он пришёл",
  FREE_MEMBERSHIP: "бесплатное обучение: остаток не нужен",
  VOID_BREAKS_REFUND: "сначала отмените возврат: без этого остатка возвращать нечего",
  LESSONS_NOT_APPLICABLE: "«Осталось уроков» есть только в центрах с пакетами занятий",
  LESSONS_RANGE: "осталось уроков: число от 0 до 400",
  LESSONS_AND_PAID_UNTIL: "укажите либо «Оплачено до», либо «Осталось уроков»",
  // rows of a file
  UNKNOWN: "ученик не найден",
  AMBIGUOUS: "найдено несколько учеников с такими данными",
  ID_MISMATCH: "ID не подходит ученику: проверьте, не сдвинулись ли колонки",
  DUPLICATE: "этот ученик указан в файле дважды — ни одна строка не применена",
  BAD_DATE: "в ячейке не дата",
  BAD_AMOUNT: "в ячейке не сумма: нужно целое число сум",
  FORMULA: "в ячейке формула без значения: сохраните файл как значения",
  ROW_CONFLICT: "«Без остатка» вместе с «Оплачено до» или долгом: оставьте что-то одно",
};

/** Codes whose server message names the cell and its content («Оплачено до: «31.13.2026» — не дата»): that message is the better text. */
const CELL_CODES = new Set(["BAD_DATE", "BAD_AMOUNT", "FORMULA", "OPENING_RANGE", "LESSONS_RANGE"]);

export function itemErrorText(code: string | null | undefined, message?: string | null): string {
  const own = code ? ITEM_CODE_TEXT[code] : undefined;
  if (code && CELL_CODES.has(code) && message) return message;
  return own ?? message ?? "строку нельзя сохранить";
}

/** `errors.json`: the words of every refusal of the endpoints. */
export const OPENINGS_ERROR_TEXT: Record<string, string> = {
  BATCH_INVALID: "В списке есть строки с ошибкой — ничего не сохранено. Они отмечены в таблице.",
  CONCURRENT_EDIT: "Другой пользователь сейчас меняет эти данные — повторите через секунду.",
  FILE_TOO_LARGE: "Файл слишком большой — не больше 5 МБ.",
  FILE_UNREADABLE: "Не удалось прочитать файл. Загрузите файл .xlsx, скачанный из ALGO.",
  IDEMPOTENCY_MISMATCH: "Это сохранение уже было отправлено с другими данными. Проверьте остатки ещё раз.",
  NOT_FOUND: "Ученик не найден — обновите страницу.",
  PREVIEW_STALE: "Данные изменились после проверки — цифры обновлены, проверьте ещё раз.",
  REASON_REQUIRED: "У некоторых учеников уже есть оплаты: укажите причину изменения (от 3 до 500 символов).",
  SHEET_MISSING: "В файле нет листа «Остатки». Скачайте актуальный файл из ALGO.",
  STALE_ITEMS: "Кто-то уже изменил эти строки — показали новые значения.",
  TOO_MANY_CHANGES: "В файле больше 2000 изменений — загрузите файл по группам.",
  TOO_MANY_ITEMS: "Не больше 2000 строк за один раз — сохраните по группам.",
  TOO_MANY_ROWS: "Слишком много учеников для одной страницы — выберите группу.",
  EMPTY_BATCH: "Нечего сохранять: изменений нет.",
};

export type OpeningsFailure =
  | { kind: "stale"; ids: string[]; fresh: Array<{ membership_id: string; version: string; opening: OpeningValue | null }>; message: string }
  | { kind: "preview_stale"; preview: OpeningBatchPreview | null; message: string }
  | { kind: "invalid"; items: OpeningItemResult[]; message: string }
  | { kind: "reason"; ids: string[]; message: string }
  | { kind: "too_many_rows"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "other"; code: string | null; message: string };

export const STALE_FRESH_NOTE = "Остальные ваши правки сохранены — проверьте и сохраните ещё раз.";

/** «Кто-то уже изменил 3 строки: показали новые значения. Остальные ваши правки сохранены …» */
export function staleMessage(count: number): string {
  return `Кто-то уже изменил ${count} ${rowsWord(count)}: показали новые значения. ${STALE_FRESH_NOTE}`;
}

/** The refusal of a call in one shape (an `ApiError` carries `status`, `code`, `message` and the `detail` of the server). */
export function classifyOpeningsError(error: unknown, fallback = "Не удалось выполнить действие"): OpeningsFailure {
  const e = (error ?? {}) as { status?: number; code?: string; message?: string; detail?: unknown };
  const detail = (e.detail && typeof e.detail === "object" ? e.detail : {}) as Raw;
  const code = String(e.code ?? detail.code ?? "") || null;
  const serverMessage = String(detail.message ?? e.message ?? "").trim();
  const known = code ? OPENINGS_ERROR_TEXT[code] : undefined;
  if (e.status === 403) return { kind: "denied", message: "Нет доступа к оплатам. Доступ даёт владелец центра в настройках." };
  switch (code) {
    case "STALE_ITEMS": {
      const fresh = list<Raw>(detail.fresh).map((item) => ({ membership_id: String(item.membership_id), version: String(item.version ?? "-"), opening: normalizeValue(item.opening) }));
      const ids = list<unknown>(detail.membership_ids).map(String);
      const all = ids.length ? ids : fresh.map((item) => item.membership_id);
      return { kind: "stale", ids: all, fresh, message: staleMessage(all.length) };
    }
    case "PREVIEW_STALE":
      return { kind: "preview_stale", preview: detail.preview ? normalizePreview(detail.preview as Raw) : null, message: known ?? serverMessage };
    case "BATCH_INVALID":
      return { kind: "invalid", items: list<Raw>(detail.items).map(normalizeItem), message: known ?? serverMessage };
    case "REASON_REQUIRED":
      return { kind: "reason", ids: list<unknown>(detail.membership_ids).map(String), message: known ?? serverMessage };
    case "TOO_MANY_ROWS":
      return { kind: "too_many_rows", message: known ?? serverMessage };
    default:
      return { kind: "other", code, message: known ?? (serverMessage || fallback) };
  }
}

// ── Excel ───────────────────────────────────────────────────────────────────

/** «строка 14: ученик не найден». */
export function excelRowText(row: Pick<OpeningsImportRow, "row" | "code" | "message">): string {
  return `строка ${row.row}: ${itemErrorText(row.code, row.message)}`;
}

/** The rows of the report: the errors first (by row), then what changes. */
export function excelReportRows(rows: readonly OpeningsImportRow[]): { errors: OpeningsImportRow[]; changes: OpeningsImportRow[]; unchanged: number } {
  const byRow = (a: OpeningsImportRow, b: OpeningsImportRow) => a.row - b.row;
  return {
    errors: rows.filter((row) => row.status === "error").sort(byRow),
    changes: rows.filter((row) => row.status === "ok").sort(byRow),
    unchanged: rows.filter((row) => row.status === "noop").length,
  };
}

/** The first line of the report: «Прочитано 6 строк: изменится 2, без изменений 1, ошибок 3 (не найдено 1)». */
export function excelFileLine(file: OpeningsImportFile): string {
  const parts = [`изменится ${file.changed}`, `без изменений ${file.unchanged}`];
  parts.push(file.errors > 0 ? `ошибок ${file.errors}${file.unknown > 0 ? ` (не найдено ${file.unknown})` : ""}` : "ошибок нет");
  return `Прочитано ${file.rows_read} ${rowsWord(file.rows_read)}: ${parts.join(", ")}`;
}

/** «В файле нет 4 учеников — у них всё останется как было». */
export function excelMissingLine(file: OpeningsImportFile): string | null {
  const n = file.missing_in_file;
  return n > 0 ? `В файле нет ${n} ${atStudentsWord(n)} — у них всё останется как было` : null;
}

export function excelApplyLabel(count: number): string {
  return `Применить ${count} ${changesWord(count)}`;
}

/** The export's file name when the server does not expose the header. */
export const OPENINGS_EXPORT_FALLBACK = "ostatki_na_nachalo.xlsx";

// ── Banner of «Должники», checklist of the settings, button of «Оплаты» ─────

/** The banner shows ONLY while the checklist is open (`pending`) and somebody is still missing. */
export function bannerVisible(summary: Pick<OpeningsSummary, "state" | "totals"> | null | undefined): boolean {
  return Boolean(summary) && summary!.state === "pending" && summary!.totals.missing > 0;
}

/** «Остатки на начало не заполнены у 38 учеников — долги могут быть неточными». */
export function bannerText(missing: number): string {
  return `Остатки на начало не заполнены у ${missing} ${atStudentsWord(missing)} — долги могут быть неточными`;
}

/** The counter of the button in the header of «Оплаты»: only while the checklist is open and somebody is missing. */
export function headerBadge(summary: Pick<OpeningsSummary, "state" | "totals"> | null | undefined): number | null {
  return bannerVisible(summary) ? summary!.totals.missing : null;
}

export interface ChecklistStep {
  key: "date" | "openings" | "launch";
  status: "done" | "current" | "todo";
  title: string;
  detail: string | null;
  action: "change_date" | "open" | "reopen" | null;
}

export interface Checklist {
  steps: ChecklistStep[];
  /** Both first steps are done: the card folds into one line. */
  launched: boolean;
  line: string | null;
}

/** «Дата начала учёта → Остатки на начало → Готово» with the state of each step (from `GET /summary`). */
export function checklistOf(summary: OpeningsSummary, today: string = formatBusinessDate()): Checklist {
  const start = dmy(summary.accounting_start);
  const progress = progressOf(summary.totals);
  const ended = summary.state === "done" || summary.state === "skipped";
  const filledAll = progress.left === 0;
  const second: ChecklistStep = summary.state === "skipped"
    ? { key: "openings", status: "done", title: "Остатки на начало", detail: "пропущено — центр начинает с нуля", action: "reopen" }
    : summary.state === "done" || filledAll
      ? { key: "openings", status: "done", title: "Остатки на начало", detail: progress.needed > 0 ? `заполнено ${progress.filled} из ${progress.needed}` : "внесены", action: summary.state === "done" ? null : "open" }
      : { key: "openings", status: "current", title: "Остатки на начало", detail: `заполнено ${progress.filled} из ${progress.needed}`, action: "open" };
  const launched = second.status === "done";
  return {
    steps: [
      { key: "date", status: "done", title: "Дата начала учёта", detail: start || null, action: "change_date" },
      second,
      { key: "launch", status: launched ? "done" : "todo", title: "Готово", detail: `с ${start ? start.slice(0, 5) : "…"} центр считает долги`, action: null },
    ],
    launched: launched && (ended || filledAll),
    // «запущен» only once the day has come: a start that is still ahead is «начнётся»
    line: !launched ? null : summary.accounting_start && summary.accounting_start > today ? `Учёт начнётся с ${start}` : `Учёт оплат запущен с ${start} ✓`,
  };
}

/** `/owner/payments` -> `/owner/payments/openings` (the same page under `/admin/payments`). */
export function openingsHref(paymentsBase: string): string {
  return `${paymentsBase.replace(/\/+$/, "")}/openings`;
}

// ── After a refusal / a save: keeping the screen honest ────────────────────

/** The rows somebody else changed (409 `STALE_ITEMS.fresh`): their saved opening and version are replaced, nothing else on the screen is touched. */
export function applyFresh(
  groups: readonly OpeningGroupBlock[],
  fresh: ReadonlyArray<{ membership_id: string; version: string; opening: OpeningValue | null }>,
): OpeningGroupBlock[] {
  const byId = new Map(fresh.map((item) => [item.membership_id, item] as const));
  if (byId.size === 0) return groups.slice();
  return groups.map((group) => ({
    ...group,
    memberships: group.memberships.map((row) => {
      const next = byId.get(row.membership_id);
      if (!next) return row;
      const filled = Boolean(next.opening && (next.opening.paid_until || next.opening.debt_amount));
      return { ...row, opening: next.opening, version: next.version, missing: filled ? false : row.missing };
    }),
  }));
}

/** The drafts without the rows in `ids` (the rows the server refreshed lose the user's edits: they are shown as the others left them). */
export function withoutDrafts(drafts: Drafts, ids: Iterable<string>): Drafts {
  const next = { ...drafts };
  for (const id of ids) delete next[id];
  return next;
}

/**
 * One `idempotency_key` per request body: the key is kept while the body (the items, the reason, the digest) is the same - a retry after a
 * lost answer then gets the saved answer, never a second write - and changes with the body (the same key with another body is 422/409).
 */
export function keyForBody(previous: { sig: string; key: string } | null, body: { items: unknown; reason: string | null; digest: string }, make: () => string): { sig: string; key: string } {
  const sig = JSON.stringify([body.items, body.reason, body.digest]);
  return previous && previous.sig === sig ? previous : { sig, key: make() };
}

/** Can «Применить N изменений» of the Excel report be pressed? */
export function canApplyImport(report: OpeningsImportPreview | null | undefined, reason: string): boolean {
  if (!report || !report.ok || report.batch_items.length === 0) return false;
  return !reasonNeeded(report) || reasonProblem(reason) === null;
}

/** The hint of the reason field: «обязательно: у 1 ученика уже есть оплаты» / «у 5 учеников …» / «у части учеников …» (no count known). */
export function reasonHint(count: number): string {
  return count > 0 ? `обязательно: у ${count} ${atStudentsWord(count)} уже есть оплаты` : "обязательно: у части учеников уже есть оплаты";
}

/** Under the progress bar: «У 1 остатка дата не подходит под начало учёта — он отмечен …» / «У 3 остатков … они отмечены …». */
export function needsReviewText(count: number): string {
  const one = pluralRu(count, "он отмечен", "они отмечены", "они отмечены");
  return `У ${count} ${balancesWord(count)} дата не подходит под начало учёта — ${one} «проверьте даты».`;
}
