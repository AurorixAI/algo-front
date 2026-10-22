// LOGIC-A F14: the type of the lessons of a group by the day of the lesson («Тип занятий» → «Изменить…»).
// Contract: GET /org/groups/{id}/lesson-types and PUT /org/groups/{id}/lesson-type (tests/fixtures/logicA A17, A18).
import { isIsoDate } from "./payments";
import { formatDateRu } from "./attendance-excuses";
import { monthYearLabelRu } from "./business-time";
import { LESSON_TYPES, lessonTypeLabel, normalizeLessonType, type LessonType } from "./payroll";

export interface LessonTypeRow {
  valid_from: string;
  lesson_type: LessonType;
  created_by_name: string | null;
}

export interface LessonTypeSheet {
  sheet_id: string;
  month: string;
  teacher_name: string | null;
}

export interface LessonTypeImpact {
  stale_payroll_sheets: number;
  /** The list is for the owner only; an administrator gets the count (or nothing). */
  stale_sheets: LessonTypeSheet[];
}

export interface GroupLessonTypes {
  current: LessonType;
  history: LessonTypeRow[];
}

export interface GroupLessonTypeChanged extends GroupLessonTypes {
  dry_run: boolean;
  impact: LessonTypeImpact | null;
}

export interface LessonTypeRequest {
  lesson_type: LessonType;
  valid_from: string;
}

export function normalizeLessonTypes(raw: Partial<GroupLessonTypes> | null | undefined): GroupLessonTypes {
  const history = (Array.isArray(raw?.history) ? raw!.history : [])
    .filter((row): row is LessonTypeRow => Boolean(row) && typeof row.valid_from === "string")
    .map((row) => ({ valid_from: row.valid_from, lesson_type: normalizeLessonType(row.lesson_type), created_by_name: row.created_by_name ?? null }))
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  return { current: normalizeLessonType(raw?.current), history };
}

export function normalizeLessonTypeChanged(raw: Partial<GroupLessonTypeChanged>): GroupLessonTypeChanged {
  const base = normalizeLessonTypes(raw);
  const impact = raw.impact
    ? {
        stale_payroll_sheets: Math.max(0, Number(raw.impact.stale_payroll_sheets) || 0),
        stale_sheets: Array.isArray(raw.impact.stale_sheets) ? raw.impact.stale_sheets : [],
      }
    : null;
  return { ...base, dry_run: Boolean(raw.dry_run), impact };
}

// ── The date window ────────────────────────────────────────────────────────

/** The server accepts «с начала прошлого месяца по сегодня» (422 LESSON_TYPE_RANGE otherwise). */
export function lessonTypeDateRange(today: string): { min: string; max: string } {
  const [year, month] = today.split("-").map(Number);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return { min: `${prev.year}-${String(prev.month).padStart(2, "0")}-01`, max: today };
}

export const LESSON_TYPE_RANGE_TEXT = "Тип занятий можно менять с начала прошлого месяца по сегодня";

export function validateLessonTypeDate(validFrom: string, today: string): string | null {
  if (!isIsoDate(validFrom)) return "Укажите дату, с которой меняется тип занятий";
  const { min, max } = lessonTypeDateRange(today);
  if (validFrom < min || validFrom > max) return `${LESSON_TYPE_RANGE_TEXT}: с ${formatDateRu(min)} по ${formatDateRu(max)}`;
  return null;
}

/** The type in force on a day (the row with the greatest `valid_from` not after it). */
export function lessonTypeOn(history: LessonTypeRow[], day: string, fallback: LessonType): LessonType {
  let found: LessonTypeRow | null = null;
  for (const row of history) {
    if (row.valid_from <= day && (!found || row.valid_from >= found.valid_from)) found = row;
  }
  return found ? found.lesson_type : fallback;
}

/** Choosing the type that already holds from that day on changes nothing: no request. */
export function isNoopLessonType(history: LessonTypeRow[], current: LessonType, request: LessonTypeRequest | null): boolean {
  if (!request) return false;
  if (history.some((row) => row.valid_from > request.valid_from)) return false;
  return lessonTypeOn(history, request.valid_from, current) === request.lesson_type;
}

export function checkLessonTypeForm(
  values: { lessonType: string; validFrom: string },
  today: string,
): { error: string | null; request: LessonTypeRequest | null } {
  if (!LESSON_TYPES.some((type) => type.key === values.lessonType)) return { error: "Выберите тип занятий", request: null };
  const error = validateLessonTypeDate(values.validFrom, today);
  if (error) return { error, request: null };
  return { error: null, request: { lesson_type: values.lessonType as LessonType, valid_from: values.validFrom } };
}

export function lessonTypeKey(request: LessonTypeRequest | null): string {
  return request ? `${request.lesson_type}@${request.valid_from}` : "";
}

// ── Words ──────────────────────────────────────────────────────────────────

export const LESSON_TYPE_CHANGE_LABEL = "Изменить…";
export const LESSON_TYPE_DIALOG_TITLE = "Тип занятий";
export const LESSON_TYPE_FROM_LABEL = "Тип занятий меняется с";
export const LESSON_TYPE_IMPACT_TEXT = "Ведомости затронутых месяцев покажут «Есть изменения»: их нужно будет пересчитать. Внесённые оплаты и выплаты не меняются.";
export const LESSON_TYPE_NO_SHEETS_TEXT = "Сохранённых ведомостей, которые изменятся, нет.";

export function lessonTypeLine(type: unknown): string {
  return `Тип занятий: ${lessonTypeLabel(type)}`;
}

/** «октябрь 2026 — Каримова» */
export function lessonTypeSheetLabel(sheet: LessonTypeSheet): string {
  const month = /^\d{4}-\d{2}$/.test(sheet.month) ? monthYearLabelRu(sheet.month).replace(/\s*г\.?$/, "") : sheet.month;
  const who = (sheet.teacher_name ?? "").trim() || "преподаватель";
  return `${month} — ${who}`;
}

/** «Ведомости, которые изменятся: октябрь 2026 — Каримова» (owner) or the count (administrator). */
export function lessonTypeStaleText(impact: LessonTypeImpact | null): { text: string; items: string[] } | null {
  if (!impact) return null;
  const count = Math.max(0, impact.stale_payroll_sheets | 0);
  if (count === 0) return null;
  if (impact.stale_sheets.length > 0) return { text: "Ведомости, которые изменятся:", items: impact.stale_sheets.map(lessonTypeSheetLabel) };
  return { text: `Ведомостей, которые изменятся: ${count}.`, items: [] };
}

/** «с 15.10.2026 — Парный · Арслан»; the seed row (2020-01-01) is «с самого начала». */
export function lessonTypeHistoryLine(row: LessonTypeRow): string {
  const since = row.valid_from <= "2020-01-01" ? "С самого начала" : `С ${formatDateRu(row.valid_from)}`;
  return `${since} — ${lessonTypeLabel(row.lesson_type)}${row.created_by_name ? ` · ${row.created_by_name}` : ""}`;
}

export function lessonTypeFutureNote(validFrom: string, today: string): string | null {
  if (!isIsoDate(validFrom) || validFrom >= today) return null;
  return `Дата в прошлом: уроки с ${formatDateRu(validFrom)} в ведомостях зарплаты будут считаться по новому типу.`;
}
