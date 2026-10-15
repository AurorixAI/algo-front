/**
 * N13 P3 - «Зарплата преподавателей» (owner only): types of the payroll API and the pure helpers of its
 * screens.  No React and no network, so node:test can load this file.
 *
 * The server is the authority for every sum.  The helpers here only (1) read what the server sends into
 * one shape, (2) validate what the owner types, and (3) preview a line the owner has edited and not yet
 * saved - with the backend's formula: round half up of `fee x p / 100 / D x N`, whole sums.
 */
import { formatMoney, pluralRu } from "./payments";
import { capitalizeFirst, monthYearLabelRu } from "./business-time";

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

export interface PayrollSettings {
  divisor: number;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = { divisor: DEFAULT_DIVISOR };

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

export function payrollFormulaText(divisor: number): string {
  return `Оплата в месяц × % ÷ ${divisor} × засчитанные уроки`;
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
  const match = MONTH_PATTERN.exec(month);
  if (!match) return month;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
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

// ── API shapes ──────────────────────────────────────────────────────────────

export type MarkState = "counted" | "excused_confirmed" | "excused_pending" | "not_in_group" | "unpaid";

export interface PayrollMark {
  date: string;
  lesson_id: string | null;
  mark: 1 | 0 | null;
  state: MarkState;
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
  /** The fee of the month (or the price of a package); null: not set (the line is 0 with a warning). */
  monthly_fee: number | null;
  fee_overridden: boolean;
  /** Canonical decimal string, «50». */
  percent: string;
  divisor: number;
  marks: PayrollMark[];
  /** Counted lessons that are paid (without the unpaid ones). */
  counted: number;
  unpaid: number;
  pending_excused: number;
  include_unpaid: boolean;
  amount: number;
  warnings: string[];
}

export interface PayrollSheet {
  /** null: a calculation that is not saved yet. */
  id: string | null;
  /** YYYY-MM */
  month: string;
  teacher_id: string;
  teacher_name: string;
  /** Percent by lesson type. */
  percents: Record<string, string>;
  divisor_default: number;
  lines: PayrollLine[];
  total_amount: number;
  revision: number | null;
  month_open: boolean;
  data_changed: boolean;
  note: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface PayrollSheetSummary {
  id: string;
  revision: number;
  total_amount: number;
  data_changed: boolean;
}

export interface PayrollWarning {
  code: string;
  count: number;
  message: string;
}

export interface PayrollTypeSuggestion {
  lesson_type: LessonType;
  /** The percent of the last saved sheet of this teacher for this type, as the field text; "" when there is none. */
  suggested_percent: string;
}

export interface PayrollMonthTeacher {
  teacher_id: string;
  teacher_name: string;
  lesson_types: PayrollTypeSuggestion[];
  sheet: PayrollSheetSummary | null;
  warnings: PayrollWarning[];
}

export interface PayrollMonthOverview {
  month: string;
  month_open: boolean;
  teachers: PayrollMonthTeacher[];
}

export interface PayrollRevision {
  revision: number;
  total_amount: number;
  changed_by_name: string | null;
  changed_at: string | null;
  change_note: string | null;
  percents: Record<string, string>;
}

export interface PayrollDiffLine {
  membership_id: string;
  student_name: string;
  group_name: string;
  kind: "changed" | "added" | "removed";
  counted_before: number | null;
  counted_after: number | null;
  unpaid_before: number | null;
  unpaid_after: number | null;
  amount_before: number | null;
  amount_after: number | null;
}

export interface PayrollDiff {
  changed: boolean;
  total_before: number | null;
  total_after: number | null;
  lines: PayrollDiffLine[];
}

/** `percents` of the calculate / save / patch bodies. */
export interface PayrollPercentInput {
  teacher_id: string;
  lesson_type: LessonType;
  percent: string;
}

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
  /** The revision the owner saw, when the teacher already has a sheet for the month. */
  revision?: number;
}

export interface PayrollPatchBody {
  revision: number;
  percents?: PayrollPercentInput[];
  line_overrides?: PayrollLineOverride[];
  recalculate?: boolean;
  note?: string;
}

// ── Reading the answers ─────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : null;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function percentText(value: unknown): string {
  const hundredths = serverPercentHundredths(value as string | number | null);
  return hundredths === null ? "" : formatPercentCanonical(hundredths);
}

/** `{group: "50"}` or `[{lesson_type, percent}]` -> `{group: "50"}`. */
function readPercents(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRaw(item)) continue;
      const text = percentText(item.percent);
      if (text) out[normalizeLessonType(item.lesson_type)] = text;
    }
  } else if (isRaw(value)) {
    for (const [key, raw] of Object.entries(value)) {
      const text = percentText(raw);
      if (text) out[normalizeLessonType(key)] = text;
    }
  }
  return out;
}

function readMark(value: unknown): PayrollMark | null {
  if (!isRaw(value)) return null;
  const date = asString(value.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const mark = value.mark === 1 || value.mark === "1" || value.mark === true ? 1
    : value.mark === 0 || value.mark === "0" || value.mark === false ? 0 : null;
  const known: MarkState[] = ["counted", "excused_confirmed", "excused_pending", "not_in_group", "unpaid"];
  const state = known.includes(value.state as MarkState)
    ? (value.state as MarkState)
    : mark === 1 ? "counted" : mark === 0 ? "excused_confirmed" : "not_in_group";
  return { date, lesson_id: value.lesson_id ? asString(value.lesson_id) : null, mark, state };
}

function readWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : isRaw(item) ? asString(item.message) : ""))
    .filter((text) => text.trim() !== "");
}

export function normalizeLine(raw: unknown): PayrollLine | null {
  if (!isRaw(raw)) return null;
  const membershipId = asString(raw.membership_id);
  if (!membershipId) return null;
  const marks = (Array.isArray(raw.marks) ? raw.marks : [])
    .map(readMark)
    .filter((mark): mark is PayrollMark => mark !== null);
  return {
    membership_id: membershipId,
    student_id: asString(raw.student_id),
    student_name: asString(raw.student_name, "Ученик"),
    display_id: raw.display_id ? asString(raw.display_id) : null,
    group_id: asString(raw.group_id),
    group_name: asString(raw.group_name, "Группа"),
    lesson_type: normalizeLessonType(raw.lesson_type),
    lesson_time: raw.lesson_time ? asString(raw.lesson_time) : null,
    monthly_fee: asNumberOrNull(raw.monthly_fee),
    fee_overridden: Boolean(raw.fee_overridden),
    percent: percentText(raw.percent),
    divisor: Math.max(1, Math.round(asNumber(raw.divisor, DEFAULT_DIVISOR))),
    marks,
    counted: Math.max(0, Math.round(asNumber(raw.counted))),
    unpaid: Math.max(0, Math.round(asNumber(raw.unpaid))),
    pending_excused: Math.max(0, Math.round(asNumber(raw.pending_excused))),
    include_unpaid: Boolean(raw.include_unpaid),
    amount: Math.round(asNumber(raw.amount)),
    warnings: readWarnings(raw.warnings),
  };
}

/** `period_month` («2026-09-01»), `month` («2026-09») -> «2026-09»; "" when neither is a month. */
function readMonth(raw: Raw, fallback = ""): string {
  const text = asString(raw.month ?? raw.period_month).slice(0, 7);
  return MONTH_PATTERN.test(text) ? text : fallback;
}

export function normalizeSheet(raw: unknown, fallback: { month?: string; teacherName?: string } = {}): PayrollSheet {
  const source = isRaw(raw) ? raw : {};
  const lines = (Array.isArray(source.lines) ? source.lines : [])
    .map(normalizeLine)
    .filter((line): line is PayrollLine => line !== null);
  const percents = readPercents(source.percent_inputs ?? source.percents);
  // A type the sheet has lines of always has a percent: the lines say which one it was calculated with.
  for (const line of lines) if (line.percent && !percents[line.lesson_type]) percents[line.lesson_type] = line.percent;
  const total = source.total_amount === undefined || source.total_amount === null
    ? lines.reduce((sum, line) => sum + line.amount, 0)
    : Math.round(asNumber(source.total_amount));
  return {
    id: source.id ? asString(source.id) : null,
    month: readMonth(source, fallback.month ?? ""),
    teacher_id: asString(source.teacher_id),
    teacher_name: asString(source.teacher_name, fallback.teacherName ?? "Преподаватель"),
    percents,
    divisor_default: Math.max(1, Math.round(asNumber(source.divisor_default, DEFAULT_DIVISOR))),
    lines,
    total_amount: total,
    revision: source.revision === undefined || source.revision === null ? null : Math.round(asNumber(source.revision)),
    month_open: Boolean(source.month_open),
    data_changed: Boolean(source.data_changed),
    note: source.change_note ? asString(source.change_note) : source.note ? asString(source.note) : null,
    updated_by_name: source.updated_by_name ? asString(source.updated_by_name) : null,
    updated_at: source.updated_at ? asString(source.updated_at) : null,
  };
}

/** The answer of `calculate`: a list of sheets, bare or in `sheets` / `items`. */
export function normalizeSheetList(raw: unknown, fallback: { month?: string } = {}): PayrollSheet[] {
  const list = Array.isArray(raw) ? raw : isRaw(raw) ? (raw.sheets ?? raw.items ?? []) : [];
  const month = isRaw(raw) ? readMonth(raw, fallback.month ?? "") : fallback.month ?? "";
  return (Array.isArray(list) ? list : []).map((item) => normalizeSheet(item, { month }));
}

function readWarningItem(value: unknown): PayrollWarning | null {
  if (typeof value === "string") return value.trim() ? { code: "", count: 0, message: value } : null;
  if (!isRaw(value)) return null;
  const code = asString(value.code ?? value.type ?? value.kind);
  const message = asString(value.message ?? value.text);
  if (!code && !message) return null;
  return { code, count: Math.max(0, Math.round(asNumber(value.count ?? value.total ?? value.n))), message };
}

function readSheetSummary(row: Raw): PayrollSheetSummary | null {
  const nested = isRaw(row.sheet) ? row.sheet : null;
  const id = nested ? asString(nested.id ?? nested.sheet_id) : asString(row.sheet_id);
  if (!id) return null;
  const source = nested ?? row;
  return {
    id,
    revision: Math.max(1, Math.round(asNumber(source.revision ?? source.sheet_revision, 1))),
    total_amount: Math.round(asNumber(source.total_amount ?? source.sheet_total ?? source.total)),
    data_changed: Boolean(source.data_changed ?? row.data_changed),
  };
}

function readTypeSuggestions(row: Raw): PayrollTypeSuggestion[] {
  const out = new Map<LessonType, string>();
  const map = isRaw(row.suggested_percents) ? row.suggested_percents : {};
  const source = row.lesson_types ?? row.types ?? [];
  const add = (type: unknown, suggestion: unknown) => {
    const key = normalizeLessonType(type);
    const text = percentText(suggestion ?? map[key]);
    if (!out.has(key) || text) out.set(key, text);
  };
  if (Array.isArray(source)) {
    for (const item of source) {
      if (isRaw(item)) add(item.lesson_type ?? item.type, item.suggested_percent ?? item.percent ?? item.suggested);
      else if (typeof item === "string") add(item, undefined);
    }
  } else if (isRaw(source)) {
    for (const [key, value] of Object.entries(source)) add(key, isRaw(value) ? value.suggested_percent ?? value.percent : value);
  }
  return [...out.entries()]
    .map(([lesson_type, suggested_percent]) => ({ lesson_type, suggested_percent }))
    .sort((a, b) => lessonTypeOrder(a.lesson_type) - lessonTypeOrder(b.lesson_type));
}

export function normalizeMonthOverview(raw: unknown, fallbackMonth = ""): PayrollMonthOverview {
  const source = isRaw(raw) ? raw : {};
  const teachers = (Array.isArray(source.teachers) ? source.teachers : [])
    .filter(isRaw)
    .map((row): PayrollMonthTeacher => ({
      teacher_id: asString(row.teacher_id ?? row.id),
      teacher_name: asString(row.teacher_name ?? row.full_name ?? row.name, "Преподаватель"),
      lesson_types: readTypeSuggestions(row),
      sheet: readSheetSummary(row),
      warnings: (Array.isArray(row.warnings) ? row.warnings : [])
        .map(readWarningItem)
        .filter((warning): warning is PayrollWarning => warning !== null),
    }))
    .filter((row) => row.teacher_id !== "")
    .sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, "ru"));
  return { month: readMonth(source, fallbackMonth), month_open: Boolean(source.month_open), teachers };
}

export function normalizePayrollSettings(raw: unknown): PayrollSettings {
  const divisor = isRaw(raw) ? parseDivisor(asString(raw.divisor)).value : null;
  return { divisor: divisor ?? DEFAULT_DIVISOR };
}

export function normalizeRevisions(raw: unknown): PayrollRevision[] {
  const list = Array.isArray(raw) ? raw : isRaw(raw) ? (raw.revisions ?? raw.items ?? []) : [];
  return (Array.isArray(list) ? list : [])
    .filter(isRaw)
    .map((item): PayrollRevision => {
      const author = asString(item.changed_by_name ?? item.author_name ?? item.changed_by);
      return {
        revision: Math.max(1, Math.round(asNumber(item.revision, 1))),
        total_amount: Math.round(asNumber(item.total_amount)),
        // An id with no name is not a thing to show to the owner.
        changed_by_name: author && !UUID_LIKE.test(author) ? author : null,
        changed_at: item.changed_at ? asString(item.changed_at) : null,
        change_note: item.change_note ? asString(item.change_note) : null,
        percents: readPercents(item.percent_inputs ?? item.percents),
      };
    })
    .sort((a, b) => b.revision - a.revision);
}

function readDiffLine(value: unknown): PayrollDiffLine | null {
  if (!isRaw(value)) return null;
  const before = isRaw(value.before) ? value.before : null;
  const after = isRaw(value.after) ? value.after : null;
  const pick = (nested: Raw | null, key: string, flat: string): number | null =>
    asNumberOrNull(nested ? nested[key] : value[flat]);
  const kindRaw = asString(value.kind ?? value.change);
  const kind: PayrollDiffLine["kind"] = kindRaw === "added" || kindRaw === "removed" ? kindRaw
    : !before && value.before === null && after ? "added"
      : before && value.after === null ? "removed" : "changed";
  return {
    membership_id: asString(value.membership_id),
    student_name: asString(value.student_name, "Ученик"),
    group_name: asString(value.group_name),
    kind,
    counted_before: pick(before, "counted", "counted_before"),
    counted_after: pick(after, "counted", "counted_after"),
    unpaid_before: pick(before, "unpaid", "unpaid_before"),
    unpaid_after: pick(after, "unpaid", "unpaid_after"),
    amount_before: pick(before, "amount", "amount_before"),
    amount_after: pick(after, "amount", "amount_after"),
  };
}

export function normalizeDiff(raw: unknown): PayrollDiff {
  const source = isRaw(raw) ? raw : {};
  const lines = (Array.isArray(source.lines) ? source.lines : [])
    .map(readDiffLine)
    .filter((line): line is PayrollDiffLine => line !== null);
  return {
    changed: source.changed === undefined ? lines.length > 0 : Boolean(source.changed),
    total_before: asNumberOrNull(source.total_before),
    total_after: asNumberOrNull(source.total_after),
    lines,
  };
}

// ── Mark cells (the table of the partner) ───────────────────────────────────

export type MarkTone = "counted" | "zero" | "pending" | "empty" | "unpaid" | "unpaid_included";

export interface MarkCellView {
  tone: MarkTone;
  /** What is written in the cell: «1», «0», «Ув.?» or nothing. */
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

const MARK_TITLE: Record<MarkTone, string> = {
  counted: "Засчитан",
  zero: "Не засчитан",
  pending: "Уважительная ждёт подтверждения: засчитан",
  empty: "Ученика ещё нет в группе",
  unpaid: "Урок не оплачен: в сумму не входит",
  unpaid_included: "Урок не оплачен, но включён в сумму",
};

/** One cell of the sheet from a mark: state wins, the 1 / 0 / empty of the mark is the fallback. */
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
  const label = tone === "pending" ? "Ув.?" : tone === "zero" ? "0" : tone === "empty" ? "" : "1";
  const title = state === "excused_confirmed" ? "Уважительная причина подтверждена: не засчитан" : MARK_TITLE[tone];
  return { tone, label, title, className: MARK_CELL_CLASS[tone] };
}

// ── Money of a line ─────────────────────────────────────────────────────────

/**
 * `round_half_up(fee x p / 100 / D x N)` in whole sums, exact (BigInt, no float): the backend's formula.
 * `percentHundredths` is the percent times 100.  Anything that is not a positive number gives 0.
 */
export function lineAmount(input: {
  fee: number | null | undefined;
  percentHundredths: number | null | undefined;
  divisor: number;
  lessons: number;
}): number {
  const { fee, percentHundredths, divisor, lessons } = input;
  if (!fee || fee <= 0 || percentHundredths === null || percentHundredths === undefined || percentHundredths <= 0) return 0;
  if (!Number.isInteger(divisor) || divisor < 1 || !Number.isInteger(lessons) || lessons <= 0) return 0;
  const two = BigInt(2);
  const numerator = BigInt(Math.round(fee)) * BigInt(Math.round(percentHundredths)) * BigInt(lessons);
  const denominator = BigInt(10000) * BigInt(divisor);
  return Number((two * numerator + denominator) / (two * denominator));
}

/** N of the formula: the paid counted lessons, plus the unpaid ones when the owner switched «включить» on. */
export function lineLessons(line: Pick<PayrollLine, "counted" | "unpaid" | "include_unpaid">, include = line.include_unpaid): number {
  return line.counted + (include ? line.unpaid : 0);
}

// ── Edits of an open sheet ──────────────────────────────────────────────────

/** Only what differs from the sheet as the server sent it. */
export interface SheetEdits {
  /** Lesson type -> the text of the field. */
  percents: Record<string, string>;
  /** Membership id -> the fee (null: cleared). */
  fees: Record<string, number | null>;
  /** Membership id -> «включить неоплаченные». */
  include: Record<string, boolean>;
}

export const EMPTY_EDITS: SheetEdits = { percents: {}, fees: {}, include: {} };

export function editsDirty(edits: SheetEdits): boolean {
  return Object.keys(edits.percents).length + Object.keys(edits.fees).length + Object.keys(edits.include).length > 0;
}

function findLine(sheet: PayrollSheet, membershipId: string): PayrollLine | undefined {
  return sheet.lines.find((line) => line.membership_id === membershipId);
}

export function setFeeEdit(edits: SheetEdits, sheet: PayrollSheet, membershipId: string, fee: number | null): SheetEdits {
  const line = findLine(sheet, membershipId);
  if (!line) return edits;
  const fees = { ...edits.fees };
  if (fee === (line.monthly_fee ?? null)) delete fees[membershipId];
  else fees[membershipId] = fee;
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

export function setPercentEdit(edits: SheetEdits, sheet: PayrollSheet, lessonType: string, text: string): SheetEdits {
  const base = serverPercentHundredths(sheet.percents[lessonType]);
  const typed = parsePercent(text);
  const percents = { ...edits.percents };
  // Typing the original value back is no edit; an unfinished or wrong text is one (it blocks saving).
  if (typed.hundredths !== null && typed.hundredths === base) delete percents[lessonType];
  else percents[lessonType] = text;
  return { ...edits, percents };
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
  fee: number | null;
  include: boolean;
  percent: string;
  percentHundredths: number | null;
  lessons: number;
  /** The server's amount for a line nobody touched, the preview of the formula for an edited one. */
  amount: number;
  edited: boolean;
}

export function buildLineViews(sheet: PayrollSheet, edits: SheetEdits): LineView[] {
  return sheet.lines.map((line) => {
    const fee = line.membership_id in edits.fees ? edits.fees[line.membership_id] : line.monthly_fee;
    const include = line.membership_id in edits.include ? edits.include[line.membership_id] : line.include_unpaid;
    const typed = line.lesson_type in edits.percents ? parsePercent(edits.percents[line.lesson_type]) : null;
    // A percent that is being typed (not valid yet) keeps the previous value in the preview.
    const hundredths = typed && typed.hundredths !== null ? typed.hundredths : serverPercentHundredths(line.percent);
    const percent = typed && typed.value !== null ? typed.value : line.percent;
    const touched = line.membership_id in edits.fees
      || line.membership_id in edits.include
      || (typed !== null && typed.hundredths !== serverPercentHundredths(line.percent));
    const lessons = lineLessons(line, include);
    return {
      line,
      fee: fee ?? null,
      include,
      percent,
      percentHundredths: hundredths,
      lessons,
      amount: touched ? lineAmount({ fee, percentHundredths: hundredths, divisor: line.divisor, lessons }) : line.amount,
      edited: touched,
    };
  });
}

export interface MarkColumn {
  key: string;
  date: string;
  lessonId: string | null;
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

/** Column of a mark: one per lesson (two lessons of a group in one day are two columns). */
function markKey(mark: PayrollMark): string {
  return mark.lesson_id ? `${mark.date}|${mark.lesson_id}` : mark.date;
}

export function markFor(line: PayrollLine, column: MarkColumn): PayrollMark | undefined {
  return line.marks.find((mark) => markKey(mark) === column.key);
}

/** Blocks by group, in the order the groups first appear; the students of a block by name. */
export function buildBlocks(views: LineView[]): SheetBlock[] {
  const blocks = new Map<string, SheetBlock>();
  const columns = new Map<string, Map<string, MarkColumn>>();
  for (const view of views) {
    const line = view.line;
    const id = line.group_id || line.group_name;
    let block = blocks.get(id);
    if (!block) {
      block = {
        groupId: line.group_id,
        groupName: line.group_name,
        lessonType: line.lesson_type,
        lessonTime: line.lesson_time,
        columns: [],
        lines: [],
        counted: 0,
        unpaid: 0,
        amount: 0,
      };
      blocks.set(id, block);
      columns.set(id, new Map());
    }
    if (!block.lessonTime && line.lesson_time) block.lessonTime = line.lesson_time;
    block.lines.push(view);
    block.counted += view.lessons;
    block.unpaid += line.unpaid;
    block.amount += view.amount;
    const bucket = columns.get(id)!;
    for (const mark of line.marks) {
      const key = markKey(mark);
      if (!bucket.has(key)) bucket.set(key, { key, date: mark.date, lessonId: mark.lesson_id });
    }
  }
  for (const [id, block] of blocks) {
    block.columns = [...columns.get(id)!.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    block.lines.sort((a, b) => a.line.student_name.localeCompare(b.line.student_name, "ru"));
  }
  return [...blocks.values()];
}

/** The sheet's «ИТОГО»: the server's number while nothing is edited, else the sum of the lines. */
export function sheetTotal(sheet: PayrollSheet, views: LineView[], edits: SheetEdits): number {
  return editsDirty(edits) ? views.reduce((sum, view) => sum + view.amount, 0) : sheet.total_amount;
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

/** Only the lines whose fee or «включить» the owner changed. */
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
  return body;
}

export function buildPatchBody(
  sheet: PayrollSheet,
  edits: SheetEdits,
  note: string,
  options: { recalculate?: boolean } = {},
): PayrollPatchBody {
  const body: PayrollPatchBody = { revision: sheet.revision ?? 1 };
  if (Object.keys(edits.percents).length > 0) body.percents = buildPercentsPayload(sheet, edits);
  const overrides = buildLineOverrides(sheet, edits);
  if (overrides.length > 0) body.line_overrides = overrides;
  if (options.recalculate) body.recalculate = true;
  const cleaned = cleanNote(note);
  if (cleaned) body.note = cleaned;
  return body;
}

// ── The page of a month ─────────────────────────────────────────────────────

export function percentKey(teacherId: string, lessonType: string): string {
  return `${teacherId}|${lessonType}`;
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
    for (const type of teacher.lesson_types) {
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
    for (const type of teacher.lesson_types) {
      const parsed = parsePercent(monthPercentText(typed, teacher, type.lesson_type));
      percents.push({ teacher_id: teacher.teacher_id, lesson_type: type.lesson_type, percent: parsed.value as string });
    }
  }
  const body: PayrollCalculateBody = { percents };
  if (scope.length < teachers.length) body.teacher_ids = scope.map((teacher) => teacher.teacher_id);
  return body;
}

export function calculateButtonLabel(teachers: PayrollMonthTeacher[], selected: ReadonlySet<string>): string {
  const chosen = teachers.filter((teacher) => selected.has(teacher.teacher_id)).length;
  return chosen > 0 && chosen < teachers.length ? `Рассчитать выбранных (${chosen})` : "Рассчитать всех";
}

export type StatusChipTone = "none" | "saved" | "changed";

export interface SheetStatusView {
  tone: StatusChipTone;
  label: string;
  /** Second line: the revision and the sum of a saved sheet. */
  detail: string;
}

export function revisionLabel(revision: number): string {
  return `редакция ${revision}`;
}

/** «не рассчитано» / «сохранено · редакция 3 · 1 250 000 сум» / «данные изменились». */
export function sheetStatus(sheet: PayrollSheetSummary | null): SheetStatusView {
  if (!sheet) return { tone: "none", label: "не рассчитано", detail: "" };
  const detail = `${revisionLabel(sheet.revision)} · ${formatMoney(sheet.total_amount)}`;
  if (sheet.data_changed) return { tone: "changed", label: "данные изменились", detail };
  return { tone: "saved", label: `сохранено · ${detail}`, detail: "" };
}

export const STATUS_CHIP_CLASS: Record<StatusChipTone, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  saved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  changed: "border-amber-200 bg-amber-50 text-amber-800",
};

export interface WarningView {
  text: string;
  href: string | null;
  tone: "warning" | "info";
}

/** Where a warning leads: the screen in which the owner can fix what it names. */
export const WARNING_LINKS = {
  open: "/owner/attendance?tab=open",
  excuses: "/owner/attendance?tab=excuses",
  noFee: "/owner/payments?bucket=none",
  unpaid: "/owner/payments?bucket=due",
} as const;

const WARNING_CODES: Record<string, "open" | "excuses" | "noFee" | "unpaid"> = {
  open_lessons: "open",
  unfinished_lessons: "open",
  unclosed_lessons: "open",
  pending_excuses: "excuses",
  excused_pending: "excuses",
  unconfirmed_excuses: "excuses",
  no_fee: "noFee",
  missing_fee: "noFee",
  fee_missing: "noFee",
  no_monthly_fee: "noFee",
  unpaid_lessons: "unpaid",
  unpaid: "unpaid",
};

export function warningView(warning: PayrollWarning): WarningView {
  const kind = WARNING_CODES[warning.code];
  const n = warning.count;
  switch (kind) {
    case "open":
      return { text: `${n} ${pluralRu(n, ["незакрытый урок", "незакрытых урока", "незакрытых уроков"])}`, href: WARNING_LINKS.open, tone: "warning" };
    case "excuses":
      return { text: `${n} ${pluralRu(n, ["уважительная ждёт решения", "уважительные ждут решения", "уважительных ждут решения"])}`, href: WARNING_LINKS.excuses, tone: "warning" };
    case "noFee":
      return { text: `не задана оплата: ${n}`, href: WARNING_LINKS.noFee, tone: "warning" };
    case "unpaid":
      return { text: `${n} ${pluralRu(n, ["урок не оплачен", "урока не оплачено", "уроков не оплачено"])}`, href: WARNING_LINKS.unpaid, tone: "info" };
    default:
      return { text: warning.message || warning.code, href: null, tone: "warning" };
  }
}

// ── Errors and files ────────────────────────────────────────────────────────

export const REVISION_CONFLICT_TEXT = "Ведомость изменил другой пользователь — обновите";
export const FORBIDDEN_TEXT = "Недостаточно прав: зарплату видит только владелец центра.";

export function isRevisionConflict(error: { status?: number; code?: string } | null | undefined): boolean {
  return error?.code === "SHEET_REVISION_CONFLICT" || error?.status === 409;
}

export function payrollErrorText(error: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (!error) return "Не удалось выполнить действие";
  if (error.status === 403) return FORBIDDEN_TEXT;
  if (isRevisionConflict(error)) return REVISION_CONFLICT_TEXT;
  if (error.status === 404) return "Ведомость не найдена. Возможно, ссылка устарела.";
  if (error.code === "MONTH_INVALID") return error.message || "Некорректный месяц";
  if (error.code === "PERCENT_REQUIRED") return error.message || PERCENT_REQUIRED_TEXT;
  return error.message || "Не удалось выполнить действие";
}

/**
 * The file name of a `Content-Disposition` header: `filename*=UTF-8''…` first, then `filename="…"`.
 * `fallback` when the header is missing (a cross-origin answer hides it unless the server exposes it) or has
 * no usable name.  Path separators and control characters are dropped.
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

export function sheetFileName(teacherName: string, month: string): string {
  const name = teacherName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().replace(/\s+/g, "_") || "преподаватель";
  return `Зарплата_${name}_${month}.xlsx`;
}

export function monthFileName(month: string): string {
  return `Зарплата_${month}.xlsx`;
}

export const UNSAVED_TEXT = "В ведомости есть несохранённые правки. Уйти без сохранения?";
