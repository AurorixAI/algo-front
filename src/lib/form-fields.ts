/**
 * Pure logic behind the shared form controls (INC-15 «Единый вид элементов форм»): the date field (`ui/date-input.tsx`),
 * the time field (`ui/time-input.tsx`) and the number field (`ui/number-input.tsx`).  No browser, no React: the node
 * tests (tests/inc15-controls.test.cjs) run all of it.
 *
 * A date is stored as the ISO «YYYY-MM-DD» (what the API takes) and shown as «дд.мм.гггг» whatever the browser's
 * locale; a time is «ЧЧ:ММ» (24 h).  The user may type them with or without the separators and with a short year.
 */

// ── Dates ────────────────────────────────────────────────────────────────────────────────────────────

export const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

/** «22 октября 2026» needs the genitive. */
export const MONTHS_RU_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/** The week starts on Monday. */
export const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The calendar date exists («2026-02-30» does not). */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toIso(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** «2026-10-22» → {year, month, day}; null for anything that is not a real ISO date. */
export function parseIso(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const match = ISO.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isRealDate(year, month, day) ? { year, month, day } : null;
}

/** «2026-10-22» → «22.10.2026»; "" when it is not a date. */
export function isoToDmy(iso: string | null | undefined): string {
  const parts = parseIso(iso);
  return parts ? `${pad(parts.day)}.${pad(parts.month)}.${pad(parts.year, 4)}` : "";
}

/**
 * What the user typed → the ISO date, or null when it is not (yet) a date.
 * «22.10.2026», «22102026», «22.10.26», «22/10/2026», «22-10-2026», «2.3.2026» and an ISO «2026-10-22» (a paste) all work;
 * a two-digit year means 20yy.
 */
export function parseDateText(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const iso = parseIso(raw);
  if (iso) return toIso(iso.year, iso.month, iso.day);
  let day: string;
  let month: string;
  let year: string;
  if (/^\d+$/.test(raw)) {
    if (raw.length === 8) [day, month, year] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)];
    else if (raw.length === 6) [day, month, year] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)];
    else return null;
  } else {
    const parts = raw.split(/[^0-9]+/);
    if (parts.length !== 3 || parts.some((part) => part === "")) return null;
    [day, month, year] = parts;
  }
  if (day.length > 2 || month.length > 2 || (year.length !== 2 && year.length !== 4)) return null;
  const y = year.length === 2 ? 2000 + Number(year) : Number(year);
  const m = Number(month);
  const d = Number(day);
  return isRealDate(y, m, d) ? toIso(y, m, d) : null;
}

/**
 * Typing into a masked field: keeps the digits, puts the separators in the right places and pads a lone first digit that
 * can only be a zero-led one («4» → «04.»).  `deleting` (the text got shorter) does not add the trailing separator back,
 * or Backspace could never remove it.
 */
function maskGroups(raw: string, lengths: readonly number[], separator: string, firstDigitLimits: readonly number[], deleting: boolean): string {
  const groups: string[] = [""];
  const last = lengths.length - 1;
  const advance = () => {
    if (groups.length - 1 < last) groups.push("");
  };
  for (const char of raw) {
    const g = groups.length - 1;
    if (/[0-9]/.test(char)) {
      if (groups[g].length >= lengths[g]) {
        if (g >= last) continue; // the last group is full: the rest is dropped
        advance();
        groups[groups.length - 1] += char;
      } else {
        groups[g] += char;
      }
      const now = groups.length - 1;
      // a lone first digit above the limit can only be «0d»
      if (groups[now].length === 1 && now < last && Number(groups[now]) > firstDigitLimits[now]) {
        groups[now] = `0${groups[now]}`;
      }
    } else if (groups[g].length > 0) {
      if (groups[g].length === 1 && g < last) groups[g] = `0${groups[g]}`;
      advance();
    }
  }
  const g = groups.length - 1;
  if (!deleting && g < last && groups[g].length >= lengths[g]) groups.push("");
  return groups.join(separator);
}

/** The text of the date field after a keystroke: «22102026» → «22.10.2026», «4» → «04.», «2.3» → «02.03.». */
export function maskDateInput(raw: string, previous = ""): string {
  const iso = parseIso(raw.trim());
  if (iso) return isoToDmy(raw.trim());
  return maskGroups(raw, [2, 2, 4], ".", [3, 1], raw.length < previous.length);
}

/** The text of the time field after a keystroke: «1530» → «15:30», «9» → «09:», «9.30» → «09:30». */
export function maskTimeInput(raw: string, previous = ""): string {
  return maskGroups(raw, [2, 2], ":", [2], raw.length < previous.length);
}

/** Free typing of a time → «HH:MM» (24 h): «930», «9:30», «09.30», «0930» → «09:30»; null when it is not a time. */
export function parseTimeText(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  let hours: string;
  let minutes: string;
  if (/^\d+$/.test(raw)) {
    if (raw.length === 3) [hours, minutes] = [raw.slice(0, 1), raw.slice(1)];
    else if (raw.length === 4) [hours, minutes] = [raw.slice(0, 2), raw.slice(2)];
    else return null;
  } else {
    const parts = raw.split(/[^0-9]+/);
    if (parts.length !== 2 || parts.some((part) => part === "") || parts[1].length !== 2 || parts[0].length > 2) return null;
    [hours, minutes] = parts;
  }
  const h = Number(hours);
  const m = Number(minutes);
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** «15:00» or «15:00:00» → «15:00»; "" when it is not a time. */
export function normalizeTimeValue(value: string | null | undefined): string {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value ?? "");
  return match ? parseTimeText(`${match[1]}:${match[2]}`) ?? "" : "";
}

/** 15-minute steps of the optional list under a time field. */
export function timeSteps(stepMinutes = 15, from = 0, to = 24 * 60): string[] {
  const steps: string[] = [];
  for (let minutes = from; minutes < to; minutes += stepMinutes) steps.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  return steps;
}

// ── The calendar ─────────────────────────────────────────────────────────────────────────────────────

export interface CalendarDay {
  iso: string;
  day: number;
  /** The day belongs to the shown month (the grey ones around it fill the first and last week). */
  inMonth: boolean;
}

/** Monday = 0 … Sunday = 6 for the first of the month. */
export function firstWeekday(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** The weeks of a month, Monday first, the neighbouring months' days filling the first and last week.  `month` is 1-12. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const lead = firstWeekday(year, month);
  const start = Date.UTC(year, month - 1, 1 - lead);
  const total = Math.ceil((lead + daysInMonth(year, month)) / 7) * 7;
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < total; i += 1) {
    const date = new Date(start + i * 86_400_000);
    const cell: CalendarDay = {
      iso: toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/** Shifts an ISO date by whole days (the calendar's arrow keys). */
export function addDaysIso(iso: string, days: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Shifts an ISO date by months, keeping the day when the month is long enough and the last day when it is not (31.01 + 1 → 28.02). */
export function addMonthsIso(iso: string, months: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const index = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return toIso(year, month, Math.min(parts.day, daysInMonth(year, month)));
}

/** Is the day inside [min, max]?  An empty bound is open.  ISO strings compare as text. */
export function isWithin(iso: string, min?: string | null, max?: string | null): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** The nearest allowed day to `iso`. */
export function clampIso(iso: string, min?: string | null, max?: string | null): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** «22 октября 2026» (the accessible name of a day). */
export function longDateLabel(iso: string): string {
  const parts = parseIso(iso);
  return parts ? `${parts.day} ${MONTHS_RU_GENITIVE[parts.month - 1]} ${parts.year}` : iso;
}

export type CalendarKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | "PageUp" | "PageDown";

/** Where a calendar key moves the focused day: arrows ±1 day / ±1 week, Home/End the start / end of the week, PageUp/PageDown ±1 month (Shift: ±1 year). */
export function moveCalendarFocus(iso: string, key: CalendarKey, shift = false): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  switch (key) {
    case "ArrowLeft": return addDaysIso(iso, -1);
    case "ArrowRight": return addDaysIso(iso, 1);
    case "ArrowUp": return addDaysIso(iso, -7);
    case "ArrowDown": return addDaysIso(iso, 7);
    case "Home": return addDaysIso(iso, -firstWeekdayOf(iso));
    case "End": return addDaysIso(iso, 6 - firstWeekdayOf(iso));
    case "PageUp": return addMonthsIso(iso, shift ? -12 : -1);
    case "PageDown": return addMonthsIso(iso, shift ? 12 : 1);
  }
}

/** Monday = 0 … Sunday = 6 of a date. */
export function firstWeekdayOf(iso: string): number {
  const parts = parseIso(iso);
  return parts ? (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7 : 0;
}

// ── Numbers ──────────────────────────────────────────────────────────────────────────────────────────

/** Typing into a whole-number field: digits only (a minus sign first when negatives are allowed). */
export function sanitizeWholeNumber(raw: string, allowNegative = false): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return allowNegative && raw.trimStart().startsWith("-") ? `-${digits}` : digits;
}

/** Steps a whole number by ±step and keeps it inside [min, max]; an empty or broken field counts as 0. */
export function stepNumber(current: string, delta: number, min?: number, max?: number): string {
  const parsed = current.trim() === "" ? 0 : Number(current);
  let next = (Number.isFinite(parsed) ? parsed : 0) + delta;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return String(next);
}

// ── Radio groups ─────────────────────────────────────────────────────────────────────────────────────

export type RadioKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/**
 * The option a key moves a segmented radio group to: arrows go to the next / previous ENABLED option and wrap around,
 * Home / End to the first / last enabled one.  -1 when no option can take the focus (all disabled) or the key is not ours.
 */
export function nextRadioIndex(disabled: readonly boolean[], current: number, key: string): number {
  const count = disabled.length;
  const enabled = (i: number) => !disabled[i];
  if (!disabled.some((_, i) => enabled(i))) return -1;
  if (key === "Home") return disabled.findIndex((_, i) => enabled(i));
  if (key === "End") {
    for (let i = count - 1; i >= 0; i -= 1) if (enabled(i)) return i;
    return -1;
  }
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (step === 0) return -1;
  let index = current < 0 ? (step > 0 ? -1 : count) : current;
  for (let tried = 0; tried < count; tried += 1) {
    index = (index + step + count) % count;
    if (enabled(index)) return index;
  }
  return -1;
}
