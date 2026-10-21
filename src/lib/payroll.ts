/**
 * N13 P3 - «Зарплата преподавателей» (owner only): types of the payroll API and the pure helpers of its
 * screens.  No React and no network, so node:test can load this file.
 *
 * The server is the authority for every sum.  The types below are the shapes of auth-service
 * (`payroll_schemas.py`); the helpers (1) validate what the owner types (the rate of a teacher, in «Сотрудники») and
 * (2) preview a line whose «начислить» the owner has changed and not yet saved - with the backend's formula: `fee x p / 100`
 * per lesson divided by that lesson's divisor, summed, rounded once half up to a whole sum.
 * UX-2: a sheet has no price and no rate to edit - the price is set in «Цены групп», the rate in «Сотрудники».
 */
import { formatMoney, pluralRu } from "./payments";
import { EXCUSE_REVIEW_LABEL } from "./attendance-marks";
import {
  capitalizeFirst,
  formatIsoDateLabel,
  formatUtcNaiveAsBusinessDate,
  formatUtcNaiveAsBusinessDateTime,
  monthYearLabelRu,
  shiftBusinessMonth,
  utcNaiveToBusinessIsoDate,
} from "./business-time";
import { groupPriceHref, pricesBaseOf, type PriceSource } from "./group-price";
import type { PluralForms } from "./plural";

// ── Lesson types ────────────────────────────────────────────────────────────

export type LessonType = "group" | "mini_group" | "pair" | "individual";

/** In the order of the forms: «Группа · Мини-группа · Парный · Индивидуально». */
export const LESSON_TYPES: Array<{ key: LessonType; label: string }> = [
  { key: "group", label: "Группа" },
  { key: "mini_group", label: "Мини-группа" },
  { key: "pair", label: "Парный" },
  { key: "individual", label: "Индивидуально" },
];

export const DEFAULT_LESSON_TYPE: LessonType = "group";

export function isLessonType(value: unknown): value is LessonType {
  return LESSON_TYPES.some((type) => type.key === value);
}

/** A group the server sends without a type (an older answer, an old group) is a plain «Группа». */
export function normalizeLessonType(value: unknown): LessonType {
  return isLessonType(value) ? value : DEFAULT_LESSON_TYPE;
}

export function lessonTypeLabel(value: unknown): string {
  const key = normalizeLessonType(value);
  return LESSON_TYPES.find((type) => type.key === key)?.label ?? "Группа";
}

function lessonTypeOrder(value: LessonType): number {
  return LESSON_TYPES.findIndex((type) => type.key === value);
}

// ── Percent ─────────────────────────────────────────────────────────────────

export const PERCENT_REQUIRED_TEXT = "Укажите процент";
export const PERCENT_FORMAT_TEXT = "Введите число от 0 до 100, не больше двух знаков после запятой";
export const PERCENT_MAX_TEXT = "Процент не может быть больше 100";

export interface PercentParse {
  /** Canonical decimal string for the server («50», «33.5», «33.33»), null when invalid. */
  value: string | null;
  /** The percent in hundredths of a percent (33.5 % -> 3350), null when invalid. */
  hundredths: number | null;
  error: string | null;
}

/**
 * What the owner typed into a percent field.  A comma is a decimal separator as well as a dot; spaces and a
 * trailing «%» are ignored; 0…100, up to two decimals.  Empty is an error (the percent is required).
 */
export function parsePercent(text: string | number | null | undefined): PercentParse {
  const bad = (error: string): PercentParse => ({ value: null, hundredths: null, error });
  const raw = String(text ?? "").replace(/\s+/g, "").replace(/%$/, "").replace(",", ".");
  if (raw === "") return bad(PERCENT_REQUIRED_TEXT);
  const match = /^(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return bad(PERCENT_FORMAT_TEXT);
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  if (fraction.length > 2) return bad(PERCENT_FORMAT_TEXT);
  if (whole.length > 3) return bad(PERCENT_MAX_TEXT);
  const hundredths = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  if (hundredths > 10000) return bad(PERCENT_MAX_TEXT);
  return { value: formatPercentCanonical(hundredths), hundredths, error: null };
}

function formatPercentCanonical(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** «33.5» / 33.5 / «50.00» -> «33,5» / «50»: the Russian look of a percent without the sign. */
export function percentInputText(value: string | number | null | undefined): string {
  const hundredths = serverPercentHundredths(value);
  return hundredths === null ? "" : formatPercentCanonical(hundredths).replace(".", ",");
}

/** «50 %», «33,5 %» with a non-breaking space; «—» when there is no percent. */
export function percentLabel(value: string | number | null | undefined): string {
  const text = percentInputText(value);
  return text ? `${text} %` : "—";
}

/** A percent the server sent (a string decimal or a number) in hundredths; null when it is not a number. */
export function serverPercentHundredths(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return Math.round(number * 100);
}

/**
 * Keeps a percent field to what can be a percent while typing: digits and one separator, at most two
 * decimals, at most three digits before it.  The range is checked by `parsePercent`, not here.
 */
export function sanitizePercentTyping(text: string): string {
  let separatorSeen = false;
  let wholeDigits = 0;
  let fractionDigits = 0;
  let out = "";
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      if (separatorSeen) {
        if (fractionDigits >= 2) continue;
        fractionDigits += 1;
      } else {
        if (wholeDigits >= 3) continue;
        wholeDigits += 1;
      }
      out += char;
    } else if ((char === "," || char === ".") && !separatorSeen) {
      separatorSeen = true;
      out += char;
    }
  }
  return out;
}

// ── Divisor (the center's setting) ──────────────────────────────────────────

export const DEFAULT_DIVISOR = 12;
export const DIVISOR_RANGE = { min: 1, max: 31 } as const;

/** The divisor field: a whole number 1…31. */
export function parseDivisor(text: string | number | null | undefined): { value: number | null; error: string | null } {
  const raw = String(text ?? "").trim();
  const error = `Введите целое число от ${DIVISOR_RANGE.min} до ${DIVISOR_RANGE.max}`;
  if (!/^\d{1,3}$/.test(raw)) return { value: null, error };
  const value = Number(raw);
  if (value < DIVISOR_RANGE.min || value > DIVISOR_RANGE.max) return { value: null, error };
  return { value, error: null };
}

export const PAYROLL_FORMULA_TEXT = "Оплата в месяц × % ÷ 12 × засчитанные уроки";
export const PAYROLL_PACKAGE_TEXT = "Для оплаты пакетом уроков делитель — размер пакета, который покрывает урок: преподаватель получает свой процент от цены одного урока пакета.";

/** `label`: what the price is called in the centre («Оплата в месяц» / «Стоимость пакета»). */
export function payrollFormulaText(divisor: number, label: string = "Оплата в месяц"): string {
  return `${label} × % ÷ ${divisor} × засчитанные уроки`;
}

// ── Month ───────────────────────────────────────────────────────────────────

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FIRST_MONTH_YEAR = 2000;

export function isMonthParam(value: string | null | undefined): value is string {
  const match = MONTH_PATTERN.exec(value ?? "");
  return Boolean(match) && Number(match![1]) >= FIRST_MONTH_YEAR;
}

/** «2026-10» of «2026-10-15» (a business-calendar day). */
export function monthOfDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  return shiftBusinessMonth(month, delta);
}

/** The month before the one `today` (YYYY-MM-DD, business calendar) is in: the default of the page. */
export function previousMonth(today: string): string {
  return shiftMonth(monthOfDate(today), -1);
}

/**
 * `?month=` of the page.  Anything but a real month from 2000 up to the current one (a future month has no
 * lessons) opens the previous month.
 */
export function parseMonthParam(value: string | null | undefined, today: string): string {
  const current = monthOfDate(today);
  return isMonthParam(value) && value <= current ? value : previousMonth(today);
}

/** «Сентябрь 2026 г.» */
export function monthTitle(month: string): string {
  return isMonthParam(month) ? capitalizeFirst(monthYearLabelRu(month)) : month;
}

/** «Октябрь»: the name of the month alone, in the nominative (the start of a sentence). */
export function monthNameRu(month: string): string {
  return isMonthParam(month) ? capitalizeFirst(formatIsoDateLabel(`${month}-01`, { month: "long" })) : month;
}

/** The one calm line over the table of an open month: «Октябрь ещё идёт — расчёт предварительный»; null for a closed one. */
export function monthStatusText(month: string, open: boolean): string | null {
  return open ? `${monthNameRu(month)} ещё идёт — расчёт предварительный` : null;
}

/** The month has not ended yet (it is the current one or later): the sheet is a preview. */
export function isOpenMonth(month: string, today: string): boolean {
  return month >= monthOfDate(today);
}

export function canGoToNextMonth(month: string, today: string): boolean {
  return shiftMonth(month, 1) <= monthOfDate(today);
}

/** «2026-09-03» -> «03.09» */
export function formatDayMonth(isoDate: string | null | undefined): string {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  return match ? `${match[2]}.${match[1]}` : "";
}

// ── API shapes (auth-service: payroll_schemas.py) ───────────────────────────

export type MarkState = "counted" | "excused_confirmed" | "excused_pending" | "not_in_group" | "unpaid";

export interface PayrollMark {
  date: string;
  lesson_id: string;
  /** 1 counted, 0 not counted (a confirmed excuse), null: the student is not in the group yet. */
  mark: 1 | 0 | null;
  state: MarkState;
  /** D of the lesson when it can be in the sum (counted, pending, unpaid); null otherwise. */
  divisor: number | null;
  /**
   * #105: the price of the student ON THE DAY of this lesson (only a lesson that carries money, and only on a sheet
   * calculated after #105; absent on an older one - the line's `source_fee` stands for it).  null: no price that day.
   */
  price?: number | null;
  price_source?: PriceSource | null;
}

export interface PayrollLineWarning {
  code: string;
  message: string;
}

/** The price from this `date` (the first lesson day with it); `amount` null: no price was set. */
export interface PayrollPriceStep {
  date: string;
  amount: number | null;
}

export interface PayrollLine {
  membership_id: string;
  student_id: string;
  student_name: string;
  display_id: string | null;
  group_id: string;
  group_name: string;
  lesson_type: LessonType;
  lesson_time: string | null;
  /**
   * The price of the line on this sheet: the effective price on the last lesson that carries money (`source_fee` is the
   * same before the owner's overwrite) or the owner's overwrite, which replaces the price of EVERY lesson. null: not set.
   */
  monthly_fee: number | null;
  source_fee: number | null;
  /** Only a sheet saved before UX-2 can carry a price the owner overwrote by hand; a new calculation never does. */
  fee_overridden?: boolean;
  /** #105: where the price comes from: the group, the individual price of the student, or nowhere. Absent on an older sheet. */
  price_source?: PriceSource | null;
  /** #105: the price changed inside the month; `price_steps` lists the first lesson day of every price. */
  price_changed?: boolean;
  price_steps?: PayrollPriceStep[];
  /** #105: lessons of the line that have no price; unpaid lessons that cost something (null/absent on an older sheet). */
  no_price_lessons?: number | null;
  unpaid_due?: number | null;
  /** Canonical decimal string («50», «33.5»); null: no percent was given. */
  percent: string | null;
  /** One D for the whole line; null when lessons with different D are in it (every mark has its own). */
  divisor: number | null;
  marks: PayrollMark[];
  /** Paid counted lessons, a pending excuse included; the unpaid ones are `unpaid`. */
  counted: number;
  unpaid: number;
  pending_excused: number;
  include_unpaid: boolean;
  amount: number;
  warnings: PayrollLineWarning[];
}

export interface PayrollBlockDate {
  date: string;
  lesson_id: string;
}

export interface PayrollGroupBlock {
  group_id: string;
  group_name: string;
  lesson_type: LessonType;
  lesson_time: string | null;
  percent: string | null;
  /** The date columns of the block, in order. */
  dates: PayrollBlockDate[];
  line_count: number;
  counted: number;
  unpaid: number;
  total_amount: number;
}

/** The counters behind the warnings of a sheet (`open_lessons` is null when it was not looked up). */
export interface PayrollSheetWarnings {
  open_lessons: number | null;
  pending_excused: number;
  no_fee: number;
  unpaid: number;
}

export interface PayrollSheet {
  /** null: a preview, nothing is written. */
  id: string | null;
  saved: boolean;
  /** YYYY-MM */
  month: string;
  period_start: string;
  period_end: string;
  month_open: boolean;
  teacher_id: string;
  teacher_name: string | null;
  revision: number | null;
  /** Percent by lesson type. */
  percents: Record<string, string>;
  divisor_default: number;
  lines: PayrollLine[];
  groups: PayrollGroupBlock[];
  total_amount: number;
  counted_total: number;
  unpaid_total: number;
  pending_excused_total: number;
  warnings: PayrollSheetWarnings;
  source_fingerprint: string;
  /** A saved sheet: the data changed after it was saved. null for a preview. */
  stale: boolean | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface PayrollSheetBrief {
  id: string;
  teacher_id: string;
  teacher_name: string | null;
  month: string;
  revision: number;
  total_amount: number;
  stale: boolean | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface PayrollCalculateResponse {
  month: string;
  month_open: boolean;
  sheets: PayrollSheet[];
}

export interface PayrollTypeSuggestion {
  lesson_type: LessonType;
  /** Groups of this kind the teacher taught in the month. */
  groups: number;
}

export interface PayrollMonthSheetRef {
  id: string;
  revision: number;
  total_amount: number;
  /** The data (attendance, payments, prices, the rate of the month) changed after the sheet was saved. */
  stale: boolean;
  updated_at: string | null;
}

/** Counts, shown only when above 0. */
export interface PayrollMonthWarnings {
  open_lessons: number;
  pending_excused: number;
  no_fee: number;
  unpaid: number;
}

export interface PayrollMonthTeacher {
  teacher_id: string;
  teacher_name: string | null;
  /** Completed lessons the teacher held in the month. */
  lessons_count: number;
  lesson_types: PayrollTypeSuggestion[];
  /** UX-2: the rate in force in this month by type («50»); a type with none is in `missing_rates`. */
  rates: Record<string, string>;
  missing_rates: LessonType[];
  sheet: PayrollMonthSheetRef | null;
  warnings: PayrollMonthWarnings;
}

export interface PayrollMonthOverview {
  month: string;
  period_start: string;
  period_end: string;
  month_open: boolean;
  divisor: number;
  teachers: PayrollMonthTeacher[];
  /** Completed lessons nobody is paid for: their teacher snapshot is empty. */
  lessons_without_teacher: number;
}

export interface PayrollRevision {
  revision: number;
  total_amount: number;
  percents: Record<string, string>;
  line_count: number;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string | null;
  change_note: string | null;
}

export interface PayrollDiffBrief {
  monthly_fee: number | null;
  percent: string | null;
  counted: number;
  unpaid: number;
  pending_excused: number;
  amount: number;
}

export interface PayrollDiffLine {
  membership_id: string;
  student_name: string | null;
  group_name: string | null;
  status: "changed" | "added" | "removed";
  /** What differs, in words: «засчитано», «оплата», «начислено», «отметки»… */
  changes: string[];
  saved: PayrollDiffBrief | null;
  fresh: PayrollDiffBrief | null;
  delta_amount: number;
}

export interface PayrollDiff {
  sheet_id: string;
  revision: number;
  stale: boolean;
  /** The fingerprint of the current data the diff was computed from (what «Пересчитать» should expect), when the server sends it. */
  source_fingerprint?: string;
  saved_total: number;
  fresh_total: number;
  delta_amount: number;
  /** In words, what moved besides the lines: «ставка 50% → 45%», «цена из «Цен групп» вместо ручной 450 000». */
  reasons?: string[];
  /** A rate of the month that moved: `fresh_percent` null = the rate is gone. */
  rate_changes?: Array<{ lesson_type: LessonType; saved_percent: string | null; fresh_percent: string | null; message: string }>;
  lines: PayrollDiffLine[];
}

/** What moved besides the lines, in words, once each: the server's `reasons`, then the messages of the rate changes. */
export function diffReasons(diff: Pick<PayrollDiff, "reasons" | "rate_changes">): string[] {
  const out: string[] = [];
  for (const text of [...(diff.reasons ?? []), ...(diff.rate_changes ?? []).map((change) => change.message)]) {
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** `include_unpaid`: «начислить».  The price is not sent any more: the server rejects `monthly_fee` (UX-2). */
export interface PayrollLineOverride {
  membership_id: string;
  include_unpaid?: boolean;
}

/** The rates are the server's (set in «Сотрудники»): nothing but the teachers to calculate is sent. */
export interface PayrollCalculateBody {
  teacher_ids?: string[];
}

export interface PayrollSaveBody {
  month: string;
  teacher_id: string;
  line_overrides?: PayrollLineOverride[];
  note?: string;
  /** Required, and must be the current one, when the teacher already has a sheet for the month; absent otherwise. */
  revision?: number;
  /** `source_fingerprint` of the preview the owner looked at: if the data moved since, nothing is saved (409 SHEET_DATA_CHANGED). */
  expected_fingerprint?: string;
}

export interface PayrollPatchBody {
  revision: number;
  line_overrides?: PayrollLineOverride[];
  recalculate?: boolean;
  /** With `recalculate`: the `source_fingerprint` of the data the owner looked at (409 SHEET_DATA_CHANGED when it moved). */
  expected_fingerprint?: string;
  note?: string;
}

/** The name of a teacher the server could not name. */
export function teacherLabel(name: string | null | undefined): string {
  return name?.trim() || "Преподаватель";
}

/** The settings of the center: `PUT` takes only `divisor`. */
export interface PayrollSettings {
  divisor: number;
  updated_by?: string | null;
  updated_at?: string | null;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = { divisor: DEFAULT_DIVISOR };

// ── Mark cells (the table of the partner) ───────────────────────────────────

export type MarkTone = "counted" | "zero" | "pending" | "empty" | "unpaid" | "unpaid_included";

export interface MarkCellView {
  tone: MarkTone;
  /**
   * What is written in the cell: «1», «0», «Ждёт» or nothing.  The cell is narrow, so the pending mark is the first word
   * of the map's «Ждёт решения»; the legend over the table (SHEET_LEGEND) and the tooltip say the whole of it.
   */
  label: string;
  /** The words for a tooltip and a screen reader. */
  title: string;
  className: string;
}

/** Colour is never the only sign: the label differs too, and the unpaid cell has a dashed frame (it prints). */
export const MARK_CELL_CLASS: Record<MarkTone, string> = {
  counted: "text-slate-800",
  zero: "font-bold text-rose-600 print:text-black",
  pending: "rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800 print:bg-transparent print:text-black",
  empty: "text-slate-300",
  unpaid: "rounded border border-dashed border-slate-300 px-1 text-slate-400",
  unpaid_included: "rounded border border-dashed border-slate-400 px-1 text-slate-700",
};

/** The cell of an excuse that waits for a decision: the short form of «Ждёт решения», explained by the legend of the sheet. */
export const PENDING_CELL_LABEL = "Ждёт";

/** The dashed «1»: the student was at the lesson, nobody paid for it. */
export const UNPAID_MARK_HINT = "Был на уроке, урок не оплачен — не входит в сумму";
export const UNPAID_INCLUDED_MARK_HINT = "Был на уроке, урок не оплачен — начислен по вашему выбору";

const MARK_TITLE: Record<MarkTone, string> = {
  counted: "Засчитан",
  zero: "Не засчитан",
  pending: `${EXCUSE_REVIEW_LABEL.pending}: уважительная, урок пока засчитан`,
  empty: "Ученика ещё нет в группе",
  unpaid: UNPAID_MARK_HINT,
  unpaid_included: UNPAID_INCLUDED_MARK_HINT,
};

/** One cell of the sheet from a mark: the state decides (the server sends both, they agree). */
export function markCell(
  mark: 1 | 0 | null,
  state: MarkState | null | undefined,
  options: { includeUnpaid?: boolean } = {},
): MarkCellView {
  let tone: MarkTone;
  switch (state) {
    case "counted": tone = "counted"; break;
    case "excused_confirmed": tone = "zero"; break;
    case "excused_pending": tone = "pending"; break;
    case "not_in_group": tone = "empty"; break;
    case "unpaid": tone = options.includeUnpaid ? "unpaid_included" : "unpaid"; break;
    default: tone = mark === 1 ? "counted" : mark === 0 ? "zero" : "empty";
  }
  const label = tone === "pending" ? PENDING_CELL_LABEL : tone === "zero" ? "0" : tone === "empty" ? "" : "1";
  const title = state === "excused_confirmed" ? "Уважительная причина подтверждена: не засчитан" : MARK_TITLE[tone];
  return { tone, label, title, className: MARK_CELL_CLASS[tone] };
}

// ── Money of a line ─────────────────────────────────────────────────────────

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== BigInt(0)) [x, y] = [y, x % y];
  return x;
}

/**
 * The backend's amount of a line, exactly: `fee x p / 100` per lesson, divided by that lesson's divisor, summed over
 * the lessons in the sum, rounded ONCE (half up, whole sums).  `parts` are `[divisor, number of lessons]` pairs.
 * Multiply first, divide last (BigInt, no float).  `percentHundredths` is the percent times 100.
 * Anything that is not a positive number gives 0.
 */
export function amountByDivisors(
  fee: number | null | undefined,
  percentHundredths: number | null | undefined,
  parts: ReadonlyArray<readonly [number, number]>,
): number {
  if (!fee || fee <= 0 || !percentHundredths || percentHundredths <= 0) return 0;
  const valid = parts.filter(([divisor, lessons]) => Number.isInteger(divisor) && divisor >= 1 && Number.isInteger(lessons) && lessons > 0);
  if (valid.length === 0) return 0;
  let common = BigInt(1);
  for (const [divisor] of valid) {
    const d = BigInt(divisor);
    common = (common / gcd(common, d)) * d;
  }
  let lessonsOverDivisor = BigInt(0); // sum of lessons x (common / divisor)
  for (const [divisor, lessons] of valid) lessonsOverDivisor += BigInt(lessons) * (common / BigInt(divisor));
  const two = BigInt(2);
  const numerator = BigInt(Math.round(fee)) * BigInt(Math.round(percentHundredths)) * lessonsOverDivisor;
  const denominator = BigInt(10000) * common;
  return Number((two * numerator + denominator) / (two * denominator));
}

/** `round_half_up(fee x p / 100 / D x N)`: every lesson with the same divisor. */
export function lineAmount(input: {
  fee: number | null | undefined;
  percentHundredths: number | null | undefined;
  divisor: number;
  lessons: number;
}): number {
  return amountByDivisors(input.fee, input.percentHundredths, [[input.divisor, input.lessons]]);
}

/**
 * `sum(price x p / 100 / D)` over the lessons `[price, divisor]`, rounded ONCE (half up, whole sums), exactly as the
 * backend (`lessons_amount`).  A lesson with no price or a price of 0 adds nothing.
 */
export function amountByPrices(
  percentHundredths: number | null | undefined,
  lessons: ReadonlyArray<readonly [number | null | undefined, number]>,
): number {
  if (!percentHundredths || percentHundredths <= 0) return 0;
  const valid = lessons.filter(([price, divisor]) => price && price > 0 && Number.isInteger(divisor) && divisor >= 1) as Array<readonly [number, number]>;
  if (valid.length === 0) return 0;
  let common = BigInt(1);
  for (const [, divisor] of valid) {
    const d = BigInt(divisor);
    common = (common / gcd(common, d)) * d;
  }
  let weighted = BigInt(0); // sum of price x (common / divisor)
  for (const [price, divisor] of valid) weighted += BigInt(Math.round(price)) * (common / BigInt(divisor));
  const two = BigInt(2);
  const numerator = weighted * BigInt(Math.round(percentHundredths));
  const denominator = BigInt(10000) * common;
  return Number((two * numerator + denominator) / (two * denominator));
}

/**
 * A mark carries a price iff the server priced it: `price_source` is set (a priced mark with no price that day carries
 * "none").  The API sends `{price: null, price_source: null}` for a mark of a sheet saved before #105, so `price` alone
 * (null both for «no price that day» and for «never priced») cannot tell the two apart - exactly the server's `priced`.
 */
export function isPricedMark(mark: { price_source?: string | null }): boolean {
  return mark.price_source !== null && mark.price_source !== undefined;
}

/**
 * The amount of a line from its marks: the counted and the pending-excuse lessons, plus the unpaid ones when «начислить» is
 * on; each lesson with its own divisor (`null` = the sheet's default) and its own price - the server's rule
 * (`compute_line` / `recompute_line`): the price of a priced mark (#105; null: none that day, worth nothing), else
 * `fee` (a mark of a sheet saved before #105 is not priced: the line's `source_fee`).  `overridden`: the owner's
 * overwrite of the price replaces the price of EVERY lesson with `fee`.
 */
export function marksAmount(input: {
  fee: number | null | undefined;
  percentHundredths: number | null | undefined;
  marks: ReadonlyArray<Pick<PayrollMark, "state" | "divisor"> & { price?: number | null; price_source?: string | null }>;
  includeUnpaid: boolean;
  defaultDivisor: number;
  overridden?: boolean;
}): number {
  const lessons: Array<[number | null | undefined, number]> = [];
  for (const mark of input.marks) {
    const inSum = mark.state === "counted" || mark.state === "excused_pending" || (input.includeUnpaid && mark.state === "unpaid");
    if (!inSum) continue;
    const own = input.overridden || !isPricedMark(mark) ? input.fee : mark.price;
    lessons.push([own, mark.divisor ?? input.defaultDivisor]);
  }
  return amountByPrices(input.percentHundredths, lessons);
}

// ── Edits of an open sheet ──────────────────────────────────────────────────

/**
 * What the owner changed on a sheet and has not saved.  UX-2: the price and the rate are not edited on a sheet (the price
 * is set in «Цены групп» and the card of the student, the rate in «Сотрудники»); only «начислить» is.
 */
export interface SheetEdits {
  /** Membership id -> «начислить» (the unpaid lessons of the student are paid to the teacher too). */
  include: Record<string, boolean>;
}

export const EMPTY_EDITS: SheetEdits = { include: {} };

/** Something the owner changed differs from the sheet as the server sent it. */
export function editsDirty(edits: SheetEdits): boolean {
  return Object.keys(edits.include).length > 0;
}

function findLine(sheet: PayrollSheet, membershipId: string): PayrollLine | undefined {
  return sheet.lines.find((line) => line.membership_id === membershipId);
}

export function setIncludeEdit(edits: SheetEdits, sheet: PayrollSheet, membershipId: string, include: boolean): SheetEdits {
  const line = findLine(sheet, membershipId);
  if (!line) return edits;
  const next = { ...edits.include };
  if (include === line.include_unpaid) delete next[membershipId];
  else next[membershipId] = include;
  return { ...edits, include: next };
}

/** Lesson types of a sheet, in the order of the forms. */
export function sheetLessonTypes(sheet: Pick<PayrollSheet, "lines" | "percents">): LessonType[] {
  const found = new Set<LessonType>();
  for (const line of sheet.lines) found.add(line.lesson_type);
  for (const key of Object.keys(sheet.percents ?? {})) found.add(normalizeLessonType(key));
  return [...found].sort((a, b) => lessonTypeOrder(a) - lessonTypeOrder(b));
}

export interface LineView {
  line: PayrollLine;
  include: boolean;
  /** The server's amount for a line nobody touched, the preview of the formula for an edited one. */
  amount: number;
  edited: boolean;
}

export function buildLineViews(sheet: PayrollSheet, edits: SheetEdits): LineView[] {
  return sheet.lines.map((line) => {
    const id = line.membership_id;
    const edited = id in edits.include;
    const include = edited ? edits.include[id] : line.include_unpaid;
    return {
      line,
      include,
      edited,
      amount: edited
        // the server's rule: an unpriced mark (a sheet saved before #105) is worth the line's `source_fee`; a price the owner
        // overwrote on an older sheet replaces every price
        ? marksAmount({
          fee: line.fee_overridden ? line.monthly_fee : line.source_fee,
          percentHundredths: serverPercentHundredths(line.percent),
          marks: line.marks,
          includeUnpaid: include,
          defaultDivisor: sheet.divisor_default,
          overridden: Boolean(line.fee_overridden),
        })
        : line.amount,
    };
  });
}

export interface MarkColumn {
  key: string;
  date: string;
  lessonId: string;
}

export interface SheetBlock {
  groupId: string;
  groupName: string;
  lessonType: LessonType;
  lessonTime: string | null;
  columns: MarkColumn[];
  lines: LineView[];
  counted: number;
  unpaid: number;
  amount: number;
}

/** Column of a lesson: (date, lesson id), so two lessons of a group in one day are two columns. */
export function columnKey(date: string, lessonId: string): string {
  return `${date}|${lessonId}`;
}

export function markFor(line: PayrollLine, column: MarkColumn): PayrollMark | undefined {
  return line.marks.find((mark) => columnKey(mark.date, mark.lesson_id) === column.key);
}

/** The blocks the server sends (`groups`, with their date columns), the students of a block by name; sums follow the edits. */
export function buildBlocks(sheet: PayrollSheet, views: LineView[]): SheetBlock[] {
  const byGroup = new Map<string, LineView[]>();
  for (const view of views) {
    const list = byGroup.get(view.line.group_id);
    if (list) list.push(view);
    else byGroup.set(view.line.group_id, [view]);
  }
  return sheet.groups
    .map((group): SheetBlock => {
      const lines = [...(byGroup.get(group.group_id) ?? [])].sort((a, b) => a.line.student_name.localeCompare(b.line.student_name, "ru"));
      return {
        groupId: group.group_id,
        groupName: group.group_name,
        lessonType: normalizeLessonType(group.lesson_type),
        lessonTime: group.lesson_time,
        columns: group.dates.map((item) => ({ key: columnKey(item.date, item.lesson_id), date: item.date, lessonId: item.lesson_id })),
        lines,
        counted: lines.reduce((sum, view) => sum + view.line.counted, 0),
        unpaid: lines.reduce((sum, view) => sum + view.line.unpaid, 0),
        amount: lines.reduce((sum, view) => sum + view.amount, 0),
      };
    })
    .filter((block) => block.lines.length > 0);
}

/** The sheet's total: the server's number while nothing is edited, else the sum of the lines. */
export function sheetTotal(sheet: PayrollSheet, views: LineView[], edits: SheetEdits): number {
  return editsDirty(edits) ? views.reduce((sum, view) => sum + view.amount, 0) : sheet.total_amount;
}

/** The unpaid lessons the owner has chosen to pay to the teacher («начислено 7»). */
export function accruedUnpaid(views: LineView[]): number {
  return views.reduce((sum, view) => sum + (view.include ? view.line.unpaid : 0), 0);
}

// ── The price column of a line ──────────────────────────────────────────────

export interface PriceCellView {
  /** «450 000 сум» or «нет цены» (the cell then has a «задать» link). */
  text: string;
  /** No price: the cell shows «нет цены» and a link to where it is set. */
  missing: boolean;
  /** «индивидуальная» (the student's own price) / «вручную» (an overwrite on a sheet saved before UX-2); null for the group's price. */
  tag: string | null;
  /** A small note under the price («цена менялась», «цена не задана на 2 урока месяца»); null when there is nothing to say. */
  note: string | null;
  /** The steps of a price that changed inside the month, for the note's tooltip; null otherwise. */
  steps: string | null;
}

/** The price of a line as the sheet shows it: text only, nothing to type. */
export function priceCellView(
  line: Pick<PayrollLine, "monthly_fee" | "counted" | "unpaid" | "price_source" | "fee_overridden" | "price_changed" | "price_steps" | "no_price_lessons">,
): PriceCellView {
  const hasLessons = line.counted > 0 || line.unpaid > 0;
  const fee = line.monthly_fee;
  if (fee === null || fee === undefined) {
    // a line without lessons costs nothing either way: no reason to ask for a price
    return { text: hasLessons ? "нет цены" : "—", missing: hasLessons, tag: null, note: null, steps: null };
  }
  const tag = line.fee_overridden ? "вручную" : line.price_source === "override" ? "индивидуальная" : null;
  const lacking = line.fee_overridden ? 0 : (line.no_price_lessons ?? 0);
  if (lacking > 0) {
    return { text: formatMoney(fee), missing: false, tag, note: `цена не задана на ${lacking} ${pluralRu(lacking, ["урок", "урока", "уроков"])} месяца`, steps: null };
  }
  if (!line.fee_overridden && line.price_changed) {
    const steps = ["Цена менялась в течение месяца: каждый урок посчитан по цене своего дня.", ...(line.price_steps ?? []).map(priceStepLine)].join("\n");
    return { text: formatMoney(fee), missing: false, tag, note: "цена менялась", steps };
  }
  return { text: formatMoney(fee), missing: false, tag, note: null, steps: null };
}

function priceStepLine(step: PayrollPriceStep): string {
  const amount = step.amount === null || step.amount === undefined ? "цена не задана" : formatMoney(step.amount);
  return `с ${formatDayMonth(step.date)} — ${amount}`;
}

// ── What goes to the server ─────────────────────────────────────────────────

/** Only the lines whose «начислить» the owner changed. */
export function buildLineOverrides(sheet: PayrollSheet, edits: SheetEdits): PayrollLineOverride[] {
  const out: PayrollLineOverride[] = [];
  for (const line of sheet.lines) {
    if (line.membership_id in edits.include) out.push({ membership_id: line.membership_id, include_unpaid: edits.include[line.membership_id] });
  }
  return out;
}

export const NOTE_MAX_LENGTH = 300;

export function cleanNote(text: string): string | undefined {
  const note = text.trim().slice(0, NOTE_MAX_LENGTH);
  return note || undefined;
}

/** `existingRevision`: the version of the sheet the teacher already has for the month (required then), else null. */
export function buildSaveBody(sheet: PayrollSheet, edits: SheetEdits, note: string, existingRevision: number | null): PayrollSaveBody {
  const overrides = buildLineOverrides(sheet, edits);
  const body: PayrollSaveBody = { month: sheet.month, teacher_id: sheet.teacher_id };
  if (overrides.length > 0) body.line_overrides = overrides;
  const cleaned = cleanNote(note);
  if (cleaned) body.note = cleaned;
  if (existingRevision !== null) body.revision = existingRevision;
  // The preview the owner is looking at: if the data moved since, the server saves nothing.
  if (sheet.source_fingerprint) body.expected_fingerprint = sheet.source_fingerprint;
  return body;
}

/** «Пересчитать» is the same body with `recalculate`.  No rate and no price in it: the server takes the stored ones. */
export function buildPatchBody(
  sheet: PayrollSheet,
  edits: SheetEdits,
  note: string,
  options: { recalculate?: boolean; expectedFingerprint?: string | null } = {},
): PayrollPatchBody {
  const body: PayrollPatchBody = { revision: sheet.revision ?? 1 };
  const overrides = buildLineOverrides(sheet, edits);
  if (overrides.length > 0) body.line_overrides = overrides;
  if (options.recalculate) {
    body.recalculate = true;
    // The data the owner looked at: if it moved since, the server refuses (409 SHEET_DATA_CHANGED) instead of saving other sums.
    if (options.expectedFingerprint) body.expected_fingerprint = options.expectedFingerprint;
  }
  const cleaned = cleanNote(note);
  if (cleaned) body.note = cleaned;
  return body;
}

// ── The rate of a teacher (set in «Сотрудники», UX-2) ───────────────────────

/** «50%», «33,5%»: a rate in a line of text (a plain percent sign, no space). */
export function percentShort(value: string | number | null | undefined): string {
  const text = percentInputText(value);
  return text ? `${text}%` : "—";
}

export function teacherRateHref(teacherId: string): string {
  return `/owner/teachers?teacher=${encodeURIComponent(teacherId)}`;
}

function typeOrderCompare(a: LessonType, b: LessonType): number {
  return lessonTypeOrder(a) - lessonTypeOrder(b);
}

/** «Группа 50% · Индивидуально 40%»; a type with no rate says «не задана».  null when there is nothing to say. */
export function rateParts(rates: ReadonlyArray<{ type: LessonType; percent: string | null }>): string[] {
  return [...rates]
    .sort((a, b) => typeOrderCompare(a.type, b.type))
    .map((entry) => (entry.percent === null ? `${lessonTypeLabel(entry.type)} не задана` : `${lessonTypeLabel(entry.type)} ${percentShort(entry.percent)}`));
}

export interface RateSummary {
  /** «Группа 50% · Индивидуально 40%», «Не задана», «Группа 50% · Индивидуально не задана». */
  text: string;
  /** At least one type has no rate: the cell gets «Указать». */
  missing: boolean;
}

/** The rate cell of a teacher's month row. */
export function monthRateSummary(teacher: Pick<PayrollMonthTeacher, "rates" | "missing_rates" | "lesson_types">): RateSummary {
  const rates = teacher.rates ?? {};
  const missingTypes = (teacher.missing_rates ?? []).map(normalizeLessonType);
  const types = new Set<LessonType>([...Object.keys(rates).map(normalizeLessonType), ...missingTypes]);
  const entries = [...types].map((type) => ({ type, percent: rates[type] ?? null }));
  const missing = entries.some((entry) => entry.percent === null);
  if (entries.length === 0) return { text: "—", missing: false };
  if (entries.every((entry) => entry.percent === null)) return { text: "Не задана", missing: true };
  return { text: rateParts(entries).join(" · "), missing };
}

// ── The page of a month ─────────────────────────────────────────────────────

export interface CalculationGate {
  /** «Рассчитать всех» may run: there is somebody to calculate and every one of them has a rate. */
  ready: boolean;
  /** Teachers with no rate for some kind of lessons. */
  missing: number;
  total: number;
  /** The one short hint of the disabled button; null when it is on. */
  text: string | null;
}

/** «Рассчитать всех» waits until every teacher of the month has a rate, and says how many are left (nothing red). */
export function calculationGate(teachers: ReadonlyArray<Pick<PayrollMonthTeacher, "missing_rates">>): CalculationGate {
  const total = teachers.length;
  const missing = teachers.filter((teacher) => (teacher.missing_rates ?? []).length > 0).length;
  const people = pluralRu(missing, ["преподавателя", "преподавателей", "преподавателей"]);
  return {
    ready: total > 0 && missing === 0,
    missing,
    total,
    text: missing > 0 ? `Не задана ставка у ${missing} ${people}` : null,
  };
}

export interface MonthSummary {
  /** «К выплате за сентябрь:» */
  label: string;
  /** The sum of the saved sheets; null while none is saved. */
  amount: number | null;
  /** «сохранено 2 из 3» */
  saved: string;
}

export function monthSummary(month: string, teachers: ReadonlyArray<Pick<PayrollMonthTeacher, "sheet">>): MonthSummary {
  const saved = teachers.filter((teacher) => teacher.sheet);
  return {
    label: `К выплате за ${monthNameRu(month).toLowerCase()}:`,
    amount: saved.length > 0 ? saved.reduce((sum, teacher) => sum + (teacher.sheet?.total_amount ?? 0), 0) : null,
    saved: `сохранено ${saved.length} из ${teachers.length}`,
  };
}

/** «К выплате за сентябрь: 1 410 415 сум · сохранено 2 из 3» (one line; «—» while nothing is saved). */
export function monthSummaryText(month: string, teachers: ReadonlyArray<Pick<PayrollMonthTeacher, "sheet">>): string {
  const summary = monthSummary(month, teachers);
  return `${summary.label} ${summary.amount === null ? "—" : formatMoney(summary.amount)} · ${summary.saved}`;
}

export type RowActionKind = "calculate" | "open";

/**
 * One action per row, by the status: nothing saved -> «Рассчитать», saved -> «Открыть».  A sheet whose data changed is opened
 * too: its card shows the difference and the one «Пересчитать» (a single path to a new version), the chip stays «Есть изменения».
 */
export function rowAction(sheet: Pick<PayrollMonthSheetRef, "stale"> | null | undefined): { kind: RowActionKind; label: string } {
  if (!sheet) return { kind: "calculate", label: "Рассчитать" };
  return { kind: "open", label: "Открыть" };
}

/** A teacher's lessons of the month: «21 урок за месяц». */
export function lessonsOfMonthText(count: number): string {
  return `${count} ${pluralRu(count, ["урок", "урока", "уроков"])} за месяц`;
}

export type StatusChipTone = "none" | "saved" | "changed";

export interface SheetStatusView {
  tone: StatusChipTone;
  label: string;
}

/** «16.10» of the moment a sheet was saved (a naive-UTC timestamp on the business calendar). */
export function savedDayMonth(updatedAt: string | null | undefined): string {
  return formatDayMonth(utcNaiveToBusinessIsoDate(updatedAt));
}

/** One chip: «Не рассчитано» / «Сохранено 16.10» / «Есть изменения»; a chip starts with a capital letter. */
export function sheetStatus(sheet: Pick<PayrollMonthSheetRef, "stale" | "updated_at"> | null): SheetStatusView {
  if (!sheet) return { tone: "none", label: "Не рассчитано" };
  if (sheet.stale) return { tone: "changed", label: "Есть изменения" };
  const day = savedDayMonth(sheet.updated_at);
  return { tone: "saved", label: day ? `Сохранено ${day}` : "Сохранено" };
}

export const STATUS_CHIP_CLASS: Record<StatusChipTone, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  saved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  changed: "border-amber-200 bg-amber-50 text-amber-800",
};

/** «версия 3»: the word the owner reads in the history of a sheet (it was «редакция»). */
export function versionLabel(revision: number): string {
  return `версия ${revision}`;
}

/** «−16 666 сум» / «+4 000 сум» (a real minus sign). */
export function formatSignedMoney(delta: number): string {
  return `${delta < 0 ? "−" : "+"}${formatMoney(Math.abs(delta))}`;
}

// ── The card on top of a sheet ──────────────────────────────────────────────

/** «Ставка: Группа 50%» / «Ставка: Группа 50% · Индивидуально 40%»; null when the sheet has no rate to name. */
export function sheetRateLine(sheet: Pick<PayrollSheet, "lines" | "percents">): string | null {
  const percents = sheet.percents ?? {};
  const types = sheetLessonTypes(sheet).filter((type) => percents[type] !== undefined && percents[type] !== null);
  if (types.length === 0) return null;
  return `Ставка: ${rateParts(types.map((type) => ({ type, percent: percents[type] }))).join(" · ")}`;
}

/** «засчитано 38 посещений» / «без оплаты 92 посещения (начислено 7)»: the unit is a visit (a student at a lesson), not a lesson. */
export function visitsText(count: number, forms: PluralForms = ["посещение", "посещения", "посещений"]): string {
  return `${count} ${pluralRu(count, forms)}`;
}

/** The one line under the total: rate · counted · unpaid (accrued).  Parts with nothing to say are left out. */
export function sheetFactsParts(sheet: Pick<PayrollSheet, "lines" | "percents" | "counted_total" | "unpaid_total">, accrued: number): string[] {
  const parts: string[] = [];
  const rate = sheetRateLine(sheet);
  if (rate) parts.push(rate);
  parts.push(`засчитано ${visitsText(sheet.counted_total)}`);
  if (sheet.unpaid_total > 0) {
    parts.push(`без оплаты ${visitsText(sheet.unpaid_total)}${accrued > 0 ? ` (начислено ${accrued})` : ""}`);
  }
  return parts;
}

export type SheetCardTone = "preview" | "saved" | "changed" | "dirty";

export interface SheetCardStatus {
  tone: SheetCardTone;
  text: string;
  /** The one main button of the card: «Сохранить» (a calculation not saved yet), «Пересчитать» (the data changed); null: none. */
  action: "save" | "recalculate" | null;
}

/**
 * The status under the total of a sheet.  Unsaved «начислить» edits come first (the floating bar saves them); then a
 * calculation not saved yet; then changed data with the difference; then «Сохранено 16.10.2026 в 08:56».
 */
export function sheetCardStatus(input: {
  saved: boolean;
  stale: boolean | null | undefined;
  dirty: boolean;
  updatedAt: string | null | undefined;
  /** What a recalculation would change in the total (the diff); null while it is not known. */
  delta: number | null;
}): SheetCardStatus {
  if (input.dirty) return { tone: "dirty", text: "Есть несохранённые правки", action: null };
  if (!input.saved) return { tone: "preview", text: "Не сохранено", action: "save" };
  if (input.stale) {
    const text = input.delta === null
      ? "После сохранения изменились данные"
      : input.delta === 0
        ? "После сохранения изменились данные, сумма та же"
        : `После сохранения изменились данные: ${formatSignedMoney(input.delta)}`;
    return { tone: "changed", text, action: "recalculate" };
  }
  const when = formatUtcNaiveAsBusinessDateTime(input.updatedAt);
  const [day, time] = when.split(" ");
  return { tone: "saved", text: day && time ? `Сохранено ${day} в ${time}` : "Сохранено", action: null };
}

// ── Warnings ────────────────────────────────────────────────────────────────

export interface WarningView {
  key: keyof PayrollSheetWarnings;
  text: string;
  href: string;
  tone: "warning" | "info";
  /** What the warning means and what to do about it: a tooltip next to the text. */
  hint: string;
  /** Where the link leads, in words: «Посещаемость → Незакрытые уроки». */
  target: string;
}

/** Where a warning leads: the screen in which the owner can fix what it names. */
export const WARNING_LINKS = {
  open_lessons: "/owner/attendance?tab=open",
  pending_excused: "/owner/attendance?tab=excuses",
  no_fee: pricesBaseOf("/owner/groups"),
  unpaid: "/owner/payments?bucket=due",
} as const;

/** The link of a warning in words (a tooltip, a screen reader). */
export const WARNING_TARGETS = {
  open_lessons: "Посещаемость → Незакрытые уроки",
  pending_excused: "Посещаемость → Пропуски",
  no_fee: "Оплаты → Цены групп",
  unpaid: "Оплаты → Требуют оплаты",
} as const;

/** What each warning means; the unpaid one says the lessons are not in the sum and can be added on the sheet. */
export const WARNING_HINTS = {
  open_lessons: "Урок проведён, но посещаемость не закрыта. Пока урок не закрыт, он не попадёт в расчёт. Откройте «Посещаемость → Незакрытые уроки» и закройте его.",
  pending_excused: "Уважительная причина ещё не подтверждена: пока ждёт решения, урок засчитывается преподавателю. Подтверждённая причина — урок не засчитывается.",
  no_fee: "У ученика нет цены (ни у его группы, ни индивидуальной), поэтому его уроки не оцениваются. Задайте цену в «Оплаты → Цены групп» или в карточке ученика.",
  unpaid: "Ученики были на уроках, но эти уроки не покрыты оплатой — в сумму не входят. Их можно начислить в ведомости.",
} as const;

/**
 * The warnings of a teacher's month or of a sheet: counts from the server, the words and the links are the screen's.
 * One unit per warning, said right: unclosed LESSONS, VISITS without payment, STUDENTS without a price.  A zero (or a count
 * that was not looked up) shows nothing.  `noFeeHref`: where the price is set when the sheet knows the one group it is missing in.
 */
export function warningViews(counts: PayrollSheetWarnings | PayrollMonthWarnings, options: { noFeeHref?: string } = {}): WarningView[] {
  const out: WarningView[] = [];
  const add = (key: keyof PayrollSheetWarnings, text: string, tone: WarningView["tone"], href: string = WARNING_LINKS[key]) =>
    out.push({ key, text, href, tone, hint: WARNING_HINTS[key], target: WARNING_TARGETS[key] });
  const open = counts.open_lessons;
  if (open) add("open_lessons", `${open} ${pluralRu(open, ["незакрытый урок", "незакрытых урока", "незакрытых уроков"])}`, "warning");
  const pending = counts.pending_excused;
  if (pending) {
    add("pending_excused", `${pending} ${pluralRu(pending, ["уважительная ждёт решения", "уважительные ждут решения", "уважительных ждут решения"])}`, "warning");
  }
  const noFee = counts.no_fee;
  if (noFee) add("no_fee", `у ${noFee} ${pluralRu(noFee, ["ученика", "учеников", "учеников"])} нет цены`, "warning", options.noFeeHref ?? WARNING_LINKS.no_fee);
  const unpaid = counts.unpaid;
  if (unpaid) add("unpaid", `${unpaid} ${pluralRu(unpaid, ["посещение без оплаты", "посещения без оплаты", "посещений без оплаты"])}`, "info");
  return out;
}

/** The price page of the one group a sheet lacks a price in; the list of prices when there are several (or none is known). */
export function sheetNoFeeHref(sheet: Pick<PayrollSheet, "lines">): string {
  const groups = new Set<string>();
  for (const line of sheet.lines) {
    if (line.group_id && priceCellView(line).missing) groups.add(line.group_id);
  }
  return groups.size === 1 ? groupPriceHref("/owner/groups", [...groups][0]) : WARNING_LINKS.no_fee;
}

/** «N уроков без преподавателя — не войдут в расчёт»; null when there are none. */
export function lessonsWithoutTeacherText(count: number): string | null {
  if (!count || count < 0) return null;
  return `${count} ${pluralRu(count, ["урок без преподавателя — не войдёт в расчёт", "урока без преподавателя — не войдут в расчёт", "уроков без преподавателя — не войдут в расчёт"])}`;
}

// ── Rates of the teachers (the page «Сотрудники», UX-2) ─────────────────────

/** A rate in force: `valid_from` is the first day of the month it starts in. */
export interface PayrollRateValue {
  percent: string;
  valid_from: string;
  set_by_name?: string | null;
  set_at?: string | null;
}

/** A rate that is already scheduled (starts in a later month). */
export interface PayrollRateNext {
  percent: string;
  valid_from: string;
}

export interface PayrollRateItem {
  teacher_id: string;
  teacher_name: string | null;
  /** The kinds of lessons the teacher teaches: a rate is set for each of them. */
  lesson_types: LessonType[];
  /** Type -> the rate in force in the month asked for; null: none yet. */
  rates: Record<string, PayrollRateValue | null>;
  next?: Record<string, PayrollRateNext | null> | null;
}

export interface PayrollRatesResponse {
  month: string;
  items: PayrollRateItem[];
}

export interface PayrollRatesPutBody {
  /** YYYY-MM: the month the rates start in. */
  valid_from: string;
  percents: Record<string, string>;
  note?: string;
}

export interface PayrollRateHistoryItem {
  lesson_type: LessonType;
  percent: string;
  valid_from: string;
  set_by_name?: string | null;
  set_at?: string | null;
  note?: string | null;
}

/** The types of a teacher's rate item in the order of the forms: what he teaches, then any type that has a rate. */
export function rateItemTypes(item: Pick<PayrollRateItem, "lesson_types" | "rates">): LessonType[] {
  const found = new Set<LessonType>((item.lesson_types ?? []).map(normalizeLessonType));
  for (const key of Object.keys(item.rates ?? {})) if (item.rates[key]) found.add(normalizeLessonType(key));
  return [...found].sort(typeOrderCompare);
}

/**
 * The kinds the rate dialog offers: what the teacher teaches, plus any kind that already has a rate; a teacher with no groups
 * yet gets all four (the rate can be set before he is put in a group).
 */
export function rateDialogTypes(item: Pick<PayrollRateItem, "lesson_types" | "rates">): LessonType[] {
  const taught = rateItemTypes(item);
  return taught.length > 0 ? taught : LESSON_TYPES.map((type) => type.key);
}

/** «01.11.2026» -> «ноября» (the month a rate starts in, in the genitive: «с ноября 45%»). */
function monthGenitive(validFrom: string): string {
  return formatIsoDateLabel(`${validFrom.slice(0, 7)}-01`, { day: "numeric", month: "long" }).replace(/^\d+\s+/, "");
}

/**
 * The line of a teacher's card in «Сотрудники»: «Ставка: Группа 50% · Индивидуально 40%», «Ставка не задана»,
 * «Ставка: Группа 50% · Индивидуально не задана»; a rate that is scheduled adds «(с ноября 45%)».
 */
export function rateItemLine(item: PayrollRateItem): { text: string; missing: boolean } {
  const types = rateItemTypes(item);
  const entries = types.map((type) => ({ type, rate: item.rates?.[type] ?? null, next: item.next?.[type] ?? null }));
  const known = entries.filter((entry) => entry.rate || entry.next);
  if (types.length === 0 || known.length === 0) return { text: "Ставка не задана", missing: true };
  const parts = entries.map((entry) => {
    const label = lessonTypeLabel(entry.type);
    const base = entry.rate ? `${label} ${percentShort(entry.rate.percent)}` : `${label} не задана`;
    return entry.next ? `${base} (с ${monthGenitive(entry.next.valid_from)} ${percentShort(entry.next.percent)})` : base;
  });
  return { text: `Ставка: ${parts.join(" · ")}`, missing: entries.some((entry) => !entry.rate && !entry.next) };
}

/** The month a new rate starts in by default: the current one. */
export function defaultRateMonth(today: string): string {
  return monthOfDate(today);
}

/** The months «Действует с» offers: half a year back (a rate can be set backwards), the current one, three months ahead. */
export function rateMonthOptions(today: string): Array<{ value: string; label: string }> {
  const current = monthOfDate(today);
  const out: Array<{ value: string; label: string }> = [];
  for (let delta = -6; delta <= 3; delta += 1) {
    const value = shiftMonth(current, delta);
    out.push({ value, label: monthTitle(value) });
  }
  return out;
}

export const RATE_PAST_NOTE = "Сохранённые ведомости не изменятся — у затронутых месяцев появится «Есть изменения».";

/** The rate form: what to send and what is wrong.  Empty with no rate yet = «not set now»; empty with a rate = an error. */
export function checkRateForm(
  types: ReadonlyArray<LessonType>,
  texts: Record<string, string>,
  current: Record<string, string | null | undefined>,
): { percents: Record<string, string>; errors: Record<string, string>; changed: number } {
  const percents: Record<string, string> = {};
  const errors: Record<string, string> = {};
  let changed = 0;
  for (const type of types) {
    const text = (texts[type] ?? "").trim();
    const now = serverPercentHundredths(current[type]);
    if (text === "") {
      if (now !== null) errors[type] = RATE_REQUIRED_TEXT;
      continue;
    }
    const parsed = parsePercent(text);
    if (parsed.value === null) { errors[type] = parsed.error ?? PERCENT_FORMAT_TEXT; continue; }
    percents[type] = parsed.value;
    if (parsed.hundredths !== now) changed += 1;
  }
  return { percents, errors, changed };
}

/** The percents of a PUT: only the types whose value differs from the rate in force (the same value again is no change). */
export function ratePutBody(
  validFrom: string,
  checked: { percents: Record<string, string> },
  current: Record<string, string | null | undefined>,
  note?: string,
): PayrollRatesPutBody {
  const percents: Record<string, string> = {};
  for (const [type, value] of Object.entries(checked.percents)) {
    if (parsePercent(value).hundredths !== serverPercentHundredths(current[type])) percents[type] = value;
  }
  const body: PayrollRatesPutBody = { valid_from: validFrom, percents };
  const cleaned = note ? cleanNote(note) : undefined;
  if (cleaned) body.note = cleaned;
  return body;
}

/** One line of «История ставки»: «Группа 50%» and «с 01.09.2026 · Иванов И. · 16.10.2026». */
export function rateHistoryView(item: PayrollRateHistoryItem): { title: string; detail: string } {
  const from = formatUtcNaiveAsBusinessDate(item.valid_from);
  const when = formatUtcNaiveAsBusinessDate(item.set_at);
  return {
    title: `${lessonTypeLabel(item.lesson_type)} ${percentShort(item.percent)}`,
    detail: [`с ${from}`, item.set_by_name, when, item.note].filter(Boolean).join(" · "),
  };
}

// ── Errors and files ────────────────────────────────────────────────────────

export const REVISION_CONFLICT_TEXT = "Ведомость изменил другой пользователь — обновите";
export const FORBIDDEN_TEXT = "Недостаточно прав: зарплату видит только владелец центра.";
export const RATE_REQUIRED_TEXT = "Укажите ставку";

/** What `api()` throws: the status, and `message` / `code` of the server's `detail: {code, message, ...}`. */
export interface PayrollErrorLike {
  status?: number;
  code?: string;
  message?: string;
  /** The server's whole `detail` object: the extra fields of a coded error (`current_revision`, `source_fingerprint`). */
  detail?: unknown;
}

export function isRevisionConflict(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "SHEET_REVISION_CONFLICT";
}

/** The teacher has no rate for a kind of lessons of the sheet: «Не задана ставка преподавателя: укажите её в «Сотрудниках»». */
export function isRateRequired(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "RATE_REQUIRED" || error?.code === "PERCENT_REQUIRED";
}

/** 409: the data changed after the preview / the diff the owner looked at; nothing was saved. */
export function isDataChanged(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "SHEET_DATA_CHANGED";
}

/** The fresh `source_fingerprint` a `SHEET_DATA_CHANGED` answer carries in `detail`; null when it has none. */
export function freshFingerprintOf(error: PayrollErrorLike | null | undefined): string | null {
  const value = (error?.detail as { source_fingerprint?: unknown } | null | undefined)?.source_fingerprint;
  return typeof value === "string" && value ? value : null;
}

/** 403 and the revision conflict have the owner's own words; every other coded error shows the server's `detail.message`. */
export function payrollErrorText(error: PayrollErrorLike | null | undefined): string {
  if (!error) return "Не удалось выполнить действие";
  if (error.status === 403) return FORBIDDEN_TEXT;
  if (isRevisionConflict(error)) return REVISION_CONFLICT_TEXT;
  if (error.status === 404 && !error.code) return "Ведомость не найдена. Возможно, ссылка устарела.";
  return error.message || "Не удалось выполнить действие";
}

/**
 * The file name of a `Content-Disposition` header: `filename*=UTF-8''…` first, then `filename="…"`.
 * `fallback` when the header is missing or has no usable name.  Path separators and control characters are dropped.
 */
export function filenameFromContentDisposition(header: string | null | undefined, fallback: string): string {
  const clean = (name: string) => name.replace(/[\\/\u0000-\u001f]+/g, "_").trim();
  const text = header ?? "";
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(text);
  if (star) {
    try {
      const decoded = clean(decodeURIComponent(star[1].trim()));
      if (decoded) return decoded;
    } catch {
      // a broken escape: try the plain name
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(text);
  if (plain) {
    const name = clean((plain[2] ?? plain[1]).trim());
    if (name) return name;
  }
  return fallback;
}

export function sheetFileName(teacherName: string | null | undefined, month: string): string {
  const name = (teacherName ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().replace(/\s+/g, "_") || "преподаватель";
  return `Зарплата_${name}_${month}.xlsx`;
}

export function monthFileName(month: string): string {
  return `Зарплата_${month}.xlsx`;
}

/** Why a sheet with no lines cannot be saved. */
export const EMPTY_SHEET_REASON = "Нет уроков для расчёта";

export const UNSAVED_TEXT = "В ведомости есть несохранённые правки. Уйти без сохранения?";
