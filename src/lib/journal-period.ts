import { addIsoDays, isoDateDayOfWeek, shiftBusinessMonth } from "./business-time";

/**
 * Period of the attendance journal (a week or a month) as pure business-calendar arithmetic on
 * "YYYY-MM-DD" strings: no Date object, no device timezone, no setMonth overflow
 * (31 January + 1 month must be February, not March).
 */
export type JournalViewMode = "week" | "month";

export const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Sunday first, like the old getDay() index; an ISO weekday 7 (Sunday) maps to 0. */
export const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function parts(isoDate: string): { year: number; month: number; day: number } {
  const match = ISO_DAY.exec(isoDate);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : { year: 0, month: 1, day: 1 };
}

/** The anchor that opens a given month: its first day. */
export function journalMonthAnchor(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

/**
 * The anchor after pressing "previous" / "next". A week moves by 7 days; a month moves to the first day of the
 * neighbouring month, so a 31st can never skip a short month and the year rolls over (Dec -> Jan).
 */
export function moveJournalAnchor(anchor: string, mode: JournalViewMode, direction: -1 | 1): string {
  if (mode === "week") return addIsoDays(anchor, direction * 7);
  const month = shiftBusinessMonth(anchor.slice(0, 7), direction);
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : anchor;
}

export interface JournalPeriod {
  start: string;
  end: string;
  label: string;
}

export function journalPeriod(anchor: string, mode: JournalViewMode): JournalPeriod {
  if (mode === "month") {
    const { year, month } = parts(anchor);
    const first = journalMonthAnchor(year, month);
    const nextFirst = `${shiftBusinessMonth(first.slice(0, 7), 1)}-01`;
    return { start: first, end: addIsoDays(nextFirst, -1), label: `${MONTHS_GENITIVE[month - 1]} ${year}` };
  }
  const monday = addIsoDays(anchor, -(isoDateDayOfWeek(anchor) - 1));
  const sunday = addIsoDays(monday, 6);
  const from = parts(monday);
  const to = parts(sunday);
  const label = from.month === to.month
    ? `${from.day} — ${to.day} ${MONTHS_GENITIVE[to.month - 1]} ${to.year}`
    : `${from.day} ${MONTHS_GENITIVE[from.month - 1]} — ${to.day} ${MONTHS_GENITIVE[to.month - 1]} ${to.year}`;
  return { start: monday, end: sunday, label };
}

/** Column header of a lesson day: 16 / окт / Пт. A date that is not a date gives empty parts. */
export function journalColumnDate(isoDate: string): { day: string; monthShort: string; weekday: string } {
  if (!ISO_DAY.test(isoDate ?? "")) return { day: "", monthShort: "", weekday: "" };
  const { month, day } = parts(isoDate);
  return {
    day: String(day),
    monthShort: MONTHS_GENITIVE[month - 1].slice(0, 3),
    weekday: WEEKDAY_SHORT[isoDateDayOfWeek(isoDate) % 7],
  };
}
