/**
 * N13 P3 - «Зарплата преподавателей» (owner only): types of the payroll API and the pure helpers of its
 * screens.  No React and no network, so node:test can load this file.
 *
 * The server is the authority for every sum.  The types below are the shapes of auth-service
 * (`payroll_schemas.py`); the helpers (1) validate what the owner types and (2) preview a line the owner has
 * edited and not yet saved - with the backend's formula: `fee x p / 100` per lesson divided by that lesson's
 * divisor, summed, rounded once half up to a whole sum.
 */
import { formatMoney, pluralRu } from "./payments";
import { EXCUSE_REVIEW_LABEL } from "./attendance-marks";
import { capitalizeFirst, formatIsoDateLabel, monthYearLabelRu, shiftBusinessMonth } from "./business-time";
import { groupsWithoutPriceHref, type PriceSource } from "./group-price";

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
  fee_overridden: boolean;
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
  /** The percent of the teacher's last saved sheet for this kind; null when there is none. */
  suggested_percent: string | null;
}

export interface PayrollMonthSheetRef {
  id: string;
  revision: number;
  total_amount: number;
  /** The data changed after the sheet was saved. */
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
  lines: PayrollDiffLine[];
}

/** `percents` of the calculate / save / patch bodies (calculate requires `teacher_id`). */
export interface PayrollPercentInput {
  teacher_id: string;
  lesson_type: LessonType;
  percent: string;
}

/** `monthly_fee`: a number sets the fee on the sheet, null returns to the membership's fee, absent leaves it. */
export interface PayrollLineOverride {
  membership_id: string;
  monthly_fee?: number | null;
  include_unpaid?: boolean;
}

export interface PayrollCalculateBody {
  percents: PayrollPercentInput[];
  teacher_ids?: string[];
}

export interface PayrollSaveBody {
  month: string;
  teacher_id: string;
  percents: PayrollPercentInput[];
  line_overrides?: PayrollLineOverride[];
  note?: string;
  /** Required, and must be the current one, when the teacher already has a sheet for the month; absent otherwise. */
  revision?: number;
  /** `source_fingerprint` of the preview the owner looked at: if the data moved since, nothing is saved (409 SHEET_DATA_CHANGED). */
  expected_fingerprint?: string;
}

export interface PayrollPatchBody {
  revision: number;
  percents?: PayrollPercentInput[];
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

/** Only what differs from the sheet as the server sent it. */
export interface SheetEdits {
  /** Lesson type -> the text of the field. */
  percents: Record<string, string>;
  /** Membership id -> the fee; null returns to the membership's own fee. */
  fees: Record<string, number | null>;
  /** Membership id -> «начислить» (the unpaid lessons of the student are paid to the teacher too). */
  include: Record<string, boolean>;
}

export const EMPTY_EDITS: SheetEdits = { percents: {}, fees: {}, include: {} };

/**
 * A percent field holds something other than the sheet's percent.  The text is kept as typed («50,» on its way to
 * «50,5») and compared with the sheet only here; a text that is not a percent counts as a change (it blocks saving).
 */
function percentChanged(sheet: PayrollSheet, edits: SheetEdits, lessonType: string): boolean {
  if (!(lessonType in edits.percents)) return false;
  const typed = parsePercent(edits.percents[lessonType]);
  return typed.hundredths === null || typed.hundredths !== serverPercentHundredths(sheet.percents[lessonType]);
}

export function percentsChanged(sheet: PayrollSheet, edits: SheetEdits): boolean {
  return Object.keys(edits.percents).some((type) => percentChanged(sheet, edits, type));
}

/** Something the owner changed differs from the sheet as the server sent it. */
export function editsDirty(sheet: PayrollSheet, edits: SheetEdits): boolean {
  return Object.keys(edits.fees).length > 0 || Object.keys(edits.include).length > 0 || percentsChanged(sheet, edits);
}

function findLine(sheet: PayrollSheet, membershipId: string): PayrollLine | undefined {
  return sheet.lines.find((line) => line.membership_id === membershipId);
}

/**
 * The fee field of a line.  A number sets the fee on this sheet; an empty field (null), or the membership's own fee typed
 * in, returns to the membership's fee.  What changes nothing (the same fee, a reset of a line that is not overridden) is no edit.
 * For a line whose price changed in the month the shown price is the LAST one: typing it is not an overwrite - it brings
 * the prices of the lessons back (the field says so, see `priceFieldHint`).
 */
export function setFeeEdit(edits: SheetEdits, sheet: PayrollSheet, membershipId: string, fee: number | null): SheetEdits {
  const line = findLine(sheet, membershipId);
  if (!line) return edits;
  const target = fee !== null && fee === line.source_fee ? null : fee;
  const unchanged = target === null ? !line.fee_overridden : line.fee_overridden && target === line.monthly_fee;
  const fees = { ...edits.fees };
  if (unchanged) delete fees[membershipId];
  else fees[membershipId] = target;
  return { ...edits, fees };
}

export function setIncludeEdit(edits: SheetEdits, sheet: PayrollSheet, membershipId: string, include: boolean): SheetEdits {
  const line = findLine(sheet, membershipId);
  if (!line) return edits;
  const next = { ...edits.include };
  if (include === line.include_unpaid) delete next[membershipId];
  else next[membershipId] = include;
  return { ...edits, include: next };
}

/** The percent field: the raw text is kept as typed (the comparison with the sheet is `editsDirty`'s). */
export function setPercentEdit(edits: SheetEdits, _sheet: PayrollSheet, lessonType: string, text: string): SheetEdits {
  return { ...edits, percents: { ...edits.percents, [lessonType]: text } };
}

/** Lesson types of a sheet, in the order of the forms. */
export function sheetLessonTypes(sheet: PayrollSheet): LessonType[] {
  const found = new Set<LessonType>();
  for (const line of sheet.lines) found.add(line.lesson_type);
  for (const key of Object.keys(sheet.percents)) found.add(normalizeLessonType(key));
  return [...found].sort((a, b) => lessonTypeOrder(a) - lessonTypeOrder(b));
}

/** The text of a type's percent field: the edit, else the sheet's. */
export function percentFieldText(sheet: PayrollSheet, edits: SheetEdits, lessonType: string): string {
  return lessonType in edits.percents ? edits.percents[lessonType] : percentInputText(sheet.percents[lessonType]);
}

/** Why the sheet cannot be saved as it stands (a percent that is not a percent), or null. */
export function editsProblem(sheet: PayrollSheet, edits: SheetEdits): string | null {
  for (const type of sheetLessonTypes(sheet)) {
    const problem = parsePercent(percentFieldText(sheet, edits, type)).error;
    if (problem) return `${lessonTypeLabel(type)}: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`;
  }
  return null;
}

export interface LineView {
  line: PayrollLine;
  /** The fee in force on the screen (the edit, else the sheet's). */
  fee: number | null;
  /** The fee differs from the membership's own. */
  feeOverridden: boolean;
  include: boolean;
  /** Canonical percent of the line, null when it has none. */
  percent: string | null;
  percentHundredths: number | null;
  /** The server's amount for a line nobody touched, the preview of the formula for an edited one. */
  amount: number;
  edited: boolean;
}

export function buildLineViews(sheet: PayrollSheet, edits: SheetEdits): LineView[] {
  return sheet.lines.map((line) => {
    const id = line.membership_id;
    const feeEdited = id in edits.fees;
    const fee = feeEdited ? (edits.fees[id] === null ? line.source_fee : edits.fees[id]) : line.monthly_fee;
    const feeOverridden = feeEdited ? edits.fees[id] !== null : line.fee_overridden;
    const include = id in edits.include ? edits.include[id] : line.include_unpaid;
    const typed = line.lesson_type in edits.percents ? parsePercent(edits.percents[line.lesson_type]) : null;
    // A percent that is being typed (not valid yet) keeps the previous value in the preview.
    const hundredths = typed && typed.hundredths !== null ? typed.hundredths : serverPercentHundredths(line.percent);
    const percent = typed && typed.value !== null ? typed.value : line.percent;
    const percentEdited = typed !== null && typed.hundredths !== serverPercentHundredths(line.percent);
    const touched = feeEdited || id in edits.include || percentEdited;
    return {
      line,
      fee: fee ?? null,
      feeOverridden,
      include,
      percent,
      percentHundredths: hundredths,
      amount: touched
        // the server's rule: an unpriced mark (a sheet saved before #105) is worth the line's `source_fee`, an overwrite replaces every price
        ? marksAmount({ fee: feeOverridden ? fee : line.source_fee, percentHundredths: hundredths, marks: line.marks, includeUnpaid: include, defaultDivisor: sheet.divisor_default, overridden: feeOverridden })
        : line.amount,
      edited: touched,
    };
  });
}

/** What the name cell says besides the name: no percent, no price (the server's other notes are the columns). */
export function lineNotes(view: LineView): string[] {
  const notes: string[] = [];
  if (view.percent === null) notes.push("Не указан процент преподавателя");
  if (view.fee === null && (view.line.counted > 0 || view.line.unpaid > 0)) notes.push("Не задана цена группы");
  else if (!view.feeOverridden && view.fee !== null && (view.line.no_price_lessons ?? 0) > 0) {
    // the price starts in the middle of the month: the lessons before it are worth nothing
    const missing = view.line.no_price_lessons as number;
    notes.push(`Цена не задана на ${missing} ${pluralRu(missing, ["урок", "урока", "уроков"])} месяца`);
  }
  return notes;
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

/** The sheet's «Итого»: the server's number while nothing is edited, else the sum of the lines. */
export function sheetTotal(sheet: PayrollSheet, views: LineView[], edits: SheetEdits): number {
  return editsDirty(sheet, edits) ? views.reduce((sum, view) => sum + view.amount, 0) : sheet.total_amount;
}

// ── What goes to the server ─────────────────────────────────────────────────

/** `percents` of a body: every type of the sheet with its current percent (an invalid text is left out). */
export function buildPercentsPayload(sheet: PayrollSheet, edits: SheetEdits): PayrollPercentInput[] {
  const out: PayrollPercentInput[] = [];
  for (const type of sheetLessonTypes(sheet)) {
    const parsed = parsePercent(percentFieldText(sheet, edits, type));
    if (parsed.value !== null) out.push({ teacher_id: sheet.teacher_id, lesson_type: type, percent: parsed.value });
  }
  return out;
}

/** Only the lines whose price or «начислить» the owner changed. */
export function buildLineOverrides(sheet: PayrollSheet, edits: SheetEdits): PayrollLineOverride[] {
  const ids = new Set([...Object.keys(edits.fees), ...Object.keys(edits.include)]);
  const out: PayrollLineOverride[] = [];
  for (const line of sheet.lines) {
    if (!ids.has(line.membership_id)) continue;
    const override: PayrollLineOverride = { membership_id: line.membership_id };
    if (line.membership_id in edits.fees) override.monthly_fee = edits.fees[line.membership_id];
    if (line.membership_id in edits.include) override.include_unpaid = edits.include[line.membership_id];
    out.push(override);
  }
  return out;
}

export const NOTE_MAX_LENGTH = 300;

export function cleanNote(text: string): string | undefined {
  const note = text.trim().slice(0, NOTE_MAX_LENGTH);
  return note || undefined;
}

/** `existingRevision`: the revision of the sheet the teacher already has for the month (required then), else null. */
export function buildSaveBody(sheet: PayrollSheet, edits: SheetEdits, note: string, existingRevision: number | null): PayrollSaveBody {
  const overrides = buildLineOverrides(sheet, edits);
  const body: PayrollSaveBody = {
    month: sheet.month,
    teacher_id: sheet.teacher_id,
    percents: buildPercentsPayload(sheet, edits),
  };
  if (overrides.length > 0) body.line_overrides = overrides;
  const cleaned = cleanNote(note);
  if (cleaned) body.note = cleaned;
  if (existingRevision !== null) body.revision = existingRevision;
  // The preview the owner is looking at: if the data moved since, the server saves nothing.
  if (sheet.source_fingerprint) body.expected_fingerprint = sheet.source_fingerprint;
  return body;
}

/**
 * «Пересчитать» is the same body with `recalculate`.  `extraPercents`: the percents the owner gave for the types a
 * `PERCENT_REQUIRED` answer named; they are sent with the retry.
 */
export function buildPatchBody(
  sheet: PayrollSheet,
  edits: SheetEdits,
  note: string,
  options: { recalculate?: boolean; extraPercents?: PayrollPercentInput[]; expectedFingerprint?: string | null } = {},
): PayrollPatchBody {
  const body: PayrollPatchBody = { revision: sheet.revision ?? 1 };
  const extra = options.extraPercents ?? [];
  let percents = percentsChanged(sheet, edits) ? buildPercentsPayload(sheet, edits) : [];
  if (extra.length > 0) {
    percents = [...percents.filter((item) => !extra.some((given) => given.lesson_type === item.lesson_type)), ...extra];
  }
  if (percents.length > 0) body.percents = percents;
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

// ── The page of a month ─────────────────────────────────────────────────────

export function percentKey(teacherId: string, lessonType: string): string {
  return `${teacherId}|${lessonType}`;
}

/** The types of a teacher in the order of the forms. */
export function orderedTypes(teacher: Pick<PayrollMonthTeacher, "lesson_types">): PayrollTypeSuggestion[] {
  return [...teacher.lesson_types].sort((a, b) => lessonTypeOrder(a.lesson_type) - lessonTypeOrder(b.lesson_type));
}

/** The text of a percent field of the month page: what the owner typed, else the suggestion. */
export function monthPercentText(
  typed: Record<string, string>,
  teacher: Pick<PayrollMonthTeacher, "teacher_id" | "lesson_types">,
  lessonType: LessonType,
): string {
  const key = percentKey(teacher.teacher_id, lessonType);
  if (key in typed) return typed[key];
  return percentInputText(teacher.lesson_types.find((type) => type.lesson_type === lessonType)?.suggested_percent);
}

/** Teachers a «Рассчитать» works on: the selected ones, or everybody when nobody is selected. */
export function calculationScope(teachers: PayrollMonthTeacher[], selected: ReadonlySet<string>): PayrollMonthTeacher[] {
  const chosen = teachers.filter((teacher) => selected.has(teacher.teacher_id));
  return chosen.length > 0 ? chosen : teachers;
}

/** Percent fields (teacher x type) of the scope whose text is not a percent. */
export function percentProblems(
  scope: PayrollMonthTeacher[],
  typed: Record<string, string>,
): Array<{ teacherId: string; lessonType: LessonType; error: string }> {
  const out: Array<{ teacherId: string; lessonType: LessonType; error: string }> = [];
  for (const teacher of scope) {
    for (const type of orderedTypes(teacher)) {
      const error = parsePercent(monthPercentText(typed, teacher, type.lesson_type)).error;
      if (error) out.push({ teacherId: teacher.teacher_id, lessonType: type.lesson_type, error });
    }
  }
  return out;
}

/** Body of `calculate`; null while a percent of the scope is missing or wrong. */
export function buildCalculateBody(
  teachers: PayrollMonthTeacher[],
  typed: Record<string, string>,
  selected: ReadonlySet<string>,
): PayrollCalculateBody | null {
  const scope = calculationScope(teachers, selected);
  if (scope.length === 0 || percentProblems(scope, typed).length > 0) return null;
  const percents: PayrollPercentInput[] = [];
  for (const teacher of scope) {
    for (const type of orderedTypes(teacher)) {
      const parsed = parsePercent(monthPercentText(typed, teacher, type.lesson_type));
      percents.push({ teacher_id: teacher.teacher_id, lesson_type: type.lesson_type, percent: parsed.value as string });
    }
  }
  const body: PayrollCalculateBody = { percents };
  if (scope.length < teachers.length) body.teacher_ids = scope.map((teacher) => teacher.teacher_id);
  return body;
}

// ── Guided setup: a percent is asked for calmly, an error comes after an action ─────────────────────

/** The calm hint of a row whose percent is not set yet (no red: nothing has gone wrong). */
export const PERCENT_HINT_TEXT = "Укажите процент — это делается один раз";

export type PercentFieldState = { kind: "ok" } | { kind: "pending" } | { kind: "error"; message: string };

/**
 * What a percent field of the month page shows.  Nothing typed yet is `pending` (the calm hint) until the owner tries to
 * calculate (`attempted`); a typed value that is not a percent is an error at once (it only appears after typing).
 */
export function percentFieldState(text: string, attempted: boolean): PercentFieldState {
  const { error } = parsePercent(text);
  if (!error) return { kind: "ok" };
  if (error === PERCENT_REQUIRED_TEXT && !attempted) return { kind: "pending" };
  return { kind: "error", message: error };
}

/** The id of a percent field of the month page (the key is «teacher|type»): a link target for the focus. */
export function percentInputId(key: string): string {
  return `payroll-percent-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** The teachers of the scope that still need a percent (a kind of lessons with none, or a wrong one). */
export function teachersNeedingPercent(scope: PayrollMonthTeacher[], typed: Record<string, string>): PayrollMonthTeacher[] {
  const ids = new Set(percentProblems(scope, typed).map((problem) => problem.teacherId));
  return scope.filter((teacher) => ids.has(teacher.teacher_id));
}

export interface CalculationGate {
  /** «Рассчитать» may run: there is somebody to calculate and every one of them has a percent. */
  ready: boolean;
  /** Teachers of the scope that still need a percent. */
  missing: number;
  total: number;
  /** Why the button is off («Не указан процент у 2 из 5 преподавателей — укажите его, чтобы рассчитать всех»); null when it is on. */
  text: string | null;
}

/**
 * «Рассчитать всех» / «Рассчитать выбранных» wait until every teacher of their scope has a percent, and say how many are left.
 * The button is never pressed into a refusal: nothing red is shown for a state the screen already prevents.
 */
export function calculationGate(scope: PayrollMonthTeacher[], typed: Record<string, string>, subject: "all" | "selected"): CalculationGate {
  const missing = teachersNeedingPercent(scope, typed).length;
  const total = scope.length;
  const ready = total > 0 && missing === 0;
  let text: string | null = null;
  if (missing > 0 && total === 1) {
    text = subject === "all"
      ? "Не указан процент у преподавателя — укажите его, чтобы рассчитать"
      : "Не указан процент у выбранного преподавателя — укажите его, чтобы рассчитать";
  } else if (missing > 0) {
    // «из N» takes the genitive and the adjective agrees with the number: «из 2 выбранных преподавателей»,
    // «из 21 выбранного преподавателя».
    const people = pluralRu(total, ["преподавателя", "преподавателей", "преподавателей"]);
    const chosen = subject === "all" ? "" : `${pluralRu(total, ["выбранного", "выбранных", "выбранных"])} `;
    // Everybody is missing: «ни у одного из 3 преподавателей», not the odd «у 3 из 3» or «у всех 3».
    const who = missing === total ? `ни у одного из ${total} ${chosen}${people}` : `у ${missing} из ${total} ${chosen}${people}`;
    text = `Не указан процент ${who} — укажите его, чтобы рассчитать ${subject === "all" ? "всех" : "выбранных"}`;
  }
  return { ready, missing, total, text };
}

export type StatusChipTone = "none" | "saved" | "changed";

export interface SheetStatusView {
  tone: StatusChipTone;
  label: string;
  /** Second line: the revision and the sum of a sheet whose data changed. */
  detail: string;
}

export function revisionLabel(revision: number): string {
  return `редакция ${revision}`;
}

/** «Не рассчитано» / «Сохранено · редакция 3 · 1 250 000 сум» / «Данные изменились»: a chip starts with a capital letter. */
export function sheetStatus(sheet: Pick<PayrollMonthSheetRef, "revision" | "total_amount" | "stale"> | null): SheetStatusView {
  if (!sheet) return { tone: "none", label: "Не рассчитано", detail: "" };
  const detail = `${revisionLabel(sheet.revision)} · ${formatMoney(sheet.total_amount)}`;
  if (sheet.stale) return { tone: "changed", label: "Данные изменились", detail };
  return { tone: "saved", label: `Сохранено · ${detail}`, detail: "" };
}

export const STATUS_CHIP_CLASS: Record<StatusChipTone, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  saved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  changed: "border-amber-200 bg-amber-50 text-amber-800",
};

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
  no_fee: groupsWithoutPriceHref("/owner/groups"),
  unpaid: "/owner/payments?bucket=due",
} as const;

/** The link of a warning in words (a tooltip, a screen reader). */
export const WARNING_TARGETS = {
  open_lessons: "Посещаемость → Незакрытые уроки",
  pending_excused: "Посещаемость → Пропуски",
  no_fee: "Группы без цены",
  unpaid: "Оплаты → Требуют оплаты",
} as const;

/** What each warning means; the unpaid one says the lessons are not in the sum and can be added on the sheet. */
export const WARNING_HINTS = {
  open_lessons: "Урок проведён, но посещаемость не закрыта. Пока урок не закрыт, он не попадёт в расчёт. Откройте «Посещаемость → Незакрытые уроки» и закройте его.",
  pending_excused: "Уважительная причина ещё не подтверждена: пока ждёт решения, урок засчитывается преподавателю. Подтверждённая причина — урок не засчитывается.",
  no_fee: "У группы или ученика нет цены, поэтому уроки не оцениваются. Задайте цену группы — откроется список групп без цены.",
  unpaid: "Ученики были на уроках, но эти уроки не покрыты оплатой — в сумму не входят. Их можно начислить в ведомости.",
} as const;

/**
 * The warnings of a teacher's month or of a sheet: counts from the server, the words and the links are the screen's.
 * A zero (or a count that was not looked up) shows nothing.
 */
export function warningViews(counts: PayrollSheetWarnings | PayrollMonthWarnings): WarningView[] {
  const out: WarningView[] = [];
  const add = (key: keyof PayrollSheetWarnings, text: string, tone: WarningView["tone"]) =>
    out.push({ key, text, href: WARNING_LINKS[key], tone, hint: WARNING_HINTS[key], target: WARNING_TARGETS[key] });
  const open = counts.open_lessons;
  if (open) add("open_lessons", `${open} ${pluralRu(open, ["незакрытый урок", "незакрытых урока", "незакрытых уроков"])}`, "warning");
  const pending = counts.pending_excused;
  if (pending) {
    add("pending_excused", `${pending} ${pluralRu(pending, ["уважительная ждёт решения", "уважительные ждут решения", "уважительных ждут решения"])}`, "warning");
  }
  if (counts.no_fee) add("no_fee", `не задана цена: ${counts.no_fee}`, "warning");
  const unpaid = counts.unpaid;
  if (unpaid) add("unpaid", `${unpaid} ${pluralRu(unpaid, ["урок не оплачен", "урока не оплачено", "уроков не оплачено"])}`, "info");
  return out;
}

/** «N уроков без преподавателя — не войдут в расчёт»; null when there are none. */
export function lessonsWithoutTeacherText(count: number): string | null {
  if (!count || count < 0) return null;
  return `${count} ${pluralRu(count, ["урок без преподавателя — не войдёт в расчёт", "урока без преподавателя — не войдут в расчёт", "уроков без преподавателя — не войдут в расчёт"])}`;
}

// ── Errors and files ────────────────────────────────────────────────────────

export const REVISION_CONFLICT_TEXT = "Ведомость изменил другой пользователь — обновите";
export const FORBIDDEN_TEXT = "Недостаточно прав: зарплату видит только владелец центра.";

/** What `api()` throws: the status, and `message` / `code` of the server's `detail: {code, message, ...}`. */
export interface PayrollErrorLike {
  status?: number;
  code?: string;
  message?: string;
  /** The server's whole `detail` object: the extra fields of a coded error (`missing[]`, `current_revision`). */
  detail?: unknown;
}

/** One pair a `PERCENT_REQUIRED` error names: the percent of this teacher for this kind of lessons is missing. */
export interface PayrollMissingPercent {
  teacher_id: string;
  lesson_type: LessonType;
  lesson_type_label: string;
}

/** `detail.missing[]` of a `PERCENT_REQUIRED` error; [] for any other error. */
export function missingPercents(error: PayrollErrorLike | null | undefined): PayrollMissingPercent[] {
  if (!isPercentRequired(error)) return [];
  const detail = error?.detail as { missing?: unknown } | null | undefined;
  const list = Array.isArray(detail?.missing) ? (detail?.missing as unknown[]) : [];
  const out: PayrollMissingPercent[] = [];
  for (const item of list) {
    const entry = item as Partial<PayrollMissingPercent> | null;
    if (entry && typeof entry.teacher_id === "string" && isLessonType(entry.lesson_type)) {
      out.push({ teacher_id: entry.teacher_id, lesson_type: entry.lesson_type, lesson_type_label: entry.lesson_type_label ?? lessonTypeLabel(entry.lesson_type) });
    }
  }
  return out;
}

/** The lesson types of this teacher the error says have no percent, once each, in the order of the forms. */
export function missingTypesOf(error: PayrollErrorLike | null | undefined, teacherId: string): LessonType[] {
  const found = new Set<LessonType>();
  for (const item of missingPercents(error)) if (item.teacher_id === teacherId) found.add(item.lesson_type);
  return [...found].sort((a, b) => lessonTypeOrder(a) - lessonTypeOrder(b));
}

/** What the owner typed for the missing percents: the canonical values to send, and the error of every field that is not a percent. */
export function checkMissingPercents(
  teacherId: string,
  types: ReadonlyArray<LessonType>,
  texts: Record<string, string>,
): { percents: PayrollPercentInput[]; errors: Record<string, string> } {
  const percents: PayrollPercentInput[] = [];
  const errors: Record<string, string> = {};
  for (const type of types) {
    const parsed = parsePercent(texts[type] ?? "");
    if (parsed.value === null) errors[type] = parsed.error ?? PERCENT_FORMAT_TEXT;
    else percents.push({ teacher_id: teacherId, lesson_type: type, percent: parsed.value });
  }
  return { percents, errors };
}

export function isRevisionConflict(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "SHEET_REVISION_CONFLICT";
}

export function isPercentRequired(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "PERCENT_REQUIRED";
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
