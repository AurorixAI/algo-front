import type { AttendanceStatus } from "@/lib/api";

/**
 * Compact summary for an in-progress attendance record.  Zero-value
 * categories are deliberately omitted: they do not help the teacher decide
 * what to do next and make the lesson card harder to scan.
 */
export function formatAttendanceSummary(
  records: Record<string, AttendanceStatus>,
  rosterSize: number,
): string {
  const values = Object.values(records);
  const count = (status: AttendanceStatus) => values.filter((value) => value === status).length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const excused = count("excused");
  const remaining = Math.max(rosterSize - Object.keys(records).length, 0);

  return [
    present > 0 ? `Присутствовали: ${present}` : null,
    late > 0 ? `Опоздали: ${late}` : null,
    absent > 0 ? `Н/Б: ${absent}` : null,
    excused > 0 ? `Ув.: ${excused}` : null,
    remaining > 0 ? `Осталось: ${remaining}` : null,
  ].filter((item): item is string => item !== null).join(" · ");
}
