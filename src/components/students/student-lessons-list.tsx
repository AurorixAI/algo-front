import { MARK_CELL_LABEL } from "@/lib/attendance-marks";
import { STUDENT_NOTICE_FOOTNOTE, studentLessonRows } from "@/lib/substitutions";
import { dayAndDateLabel } from "@/lib/ops-errors";
import { LessonChips } from "@/components/substitutions/lesson-chips";
import type { StudentNotice } from "@/lib/substitution-types";

const NOT_MARKED = "Не отмечен";

function markLabel(status: string): string | null {
  return (MARK_CELL_LABEL as Record<string, string>)[status] ?? (status === "not_marked" ? NOT_MARKED : null);
}

/**
 * LOGIC-B2, the tab «Посещаемость» of a student's card: the days of the month - the lessons with the mark and «Замена: <учитель>» where a
 * substitute held the lesson, and the lessons that did not take place («Урок отменён», «Урок перенесён на …»).  Never a reason.
 */
export function StudentLessonsList({
  lessons,
  notices,
  groupsBase = null,
}: {
  lessons: Array<{ lesson_id?: string | null; date: string; group_name: string; status?: string | null; teacherName?: string | null; isSubstitution?: boolean; movedFrom?: import("@/lib/substitution-types").MovedFrom | null } & import("@/lib/one-off").LessonPurposeFields> | null | undefined;
  notices: StudentNotice[] | null | undefined;
  /** `groupsBaseOf(org_role)` of the viewer: with it «Отработан → …» leads to the make-up in the journal of its group; null: plain text. */
  groupsBase?: string | null;
}) {
  const rows = studentLessonRows(lessons, notices, markLabel, { groupsBase });
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold text-slate-500">Занятия месяца</div>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${row.noticeText ? "bg-slate-50/60 text-slate-500" : "text-slate-800"}`}>
            <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{dayAndDateLabel(row.date)}</span>
            <span className="min-w-0 flex-1 break-words font-medium">{row.groupName}</span>
            {row.noticeText && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{row.noticeText}</span>}
            {row.madeUpMarks && row.madeUpMarks.length > 0 && <LessonChips marks={row.madeUpMarks} />}
            {row.substituteText && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">{row.substituteText}</span>}
            {row.purposeText && <span data-testid="student-purpose" className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">{row.purposeText}</span>}
            {row.movedFromText && <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">{row.movedFromText}</span>}
            {row.markText && <span className="text-xs font-medium text-slate-600">{row.markText}</span>}
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{STUDENT_NOTICE_FOOTNOTE}</p>
    </div>
  );
}
