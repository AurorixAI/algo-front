import type { AttendanceStatus } from "@/lib/api";
import { MARK_CELL_LABEL } from "@/lib/attendance-marks";
import { pluralRu } from "@/lib/plural";

/**
 * Compact summary for an in-progress attendance record.  Zero-value
 * categories are deliberately omitted: they do not help the teacher decide
 * what to do next and make the lesson card harder to scan.  The words are the ones of the buttons the teacher just
 * pressed (src/lib/attendance-marks.ts): «Был: 3 · Не был: 1 · Уважительная: 1», no abbreviations.
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
    present > 0 ? `${MARK_CELL_LABEL.present}: ${present}` : null,
    late > 0 ? `${MARK_CELL_LABEL.late}: ${late}` : null,
    absent > 0 ? `${MARK_CELL_LABEL.absent}: ${absent}` : null,
    excused > 0 ? `${MARK_CELL_LABEL.excused}: ${excused}` : null,
    remaining > 0 ? `Осталось: ${remaining}` : null,
  ].filter((item): item is string => item !== null).join(" · ");
}

/**
 * One group of the student's month in the profile: «12 занятий · Был 8 · Опоздал 1 · Не был 2 · Уважительная 1».  The same
 * words and the same split as the cards above it (so «Был» never means «Был + Опоздал» in one place and not in another);
 * a zero is left out.
 */
export function formatGroupMonthLine(group: {
  total_lessons: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
}): string {
  const lessons = `${group.total_lessons} ${pluralRu(group.total_lessons, ["занятие", "занятия", "занятий"])}`;
  const counts = (["present", "late", "absent", "excused"] as const)
    .filter((status) => group[status] > 0)
    .map((status) => `${MARK_CELL_LABEL[status]} ${group[status]}`);
  return [lessons, ...counts].join(" · ");
}
