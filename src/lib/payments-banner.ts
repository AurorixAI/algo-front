import { pluralRu } from "./plural";

/** What the summary says about who is waiting.  The `students*` counts are distinct people; `due` / `expired` count memberships. */
export interface BannerCounts {
  due: number;
  expired: number;
  studentsDue?: number | null;
  studentsExpired?: number | null;
}

export interface BannerCopy {
  /** People the notice speaks about (the cross hides the notice until more people wait than this). */
  count: number;
  /** Of them, those whose payment has already ended. */
  expired: number;
  /** «5 учеников» (emphasised) and «ждут оплаты» / «с просроченной оплатой»: the sentence on tablet and desktop. */
  subject: string;
  predicate: string;
  /** «из них просрочено: 2», only when some (not all) of the waiting people are overdue. */
  chip: string | null;
  /** The whole sentence: for the tooltip and assistive technology. */
  text: string;
  /** The phone's single row: the same, with the overdue count folded into the sentence instead of the chip. */
  compactSubject: string;
  compactPredicate: string;
}

const count = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * The words of the payments notice.
 *  - everybody waiting is overdue: «2 ученика с просроченной оплатой» (no chip);
 *  - some are overdue: «5 учеников ждут оплаты» + the chip «из них просрочено: 2»;
 *  - nobody is overdue: «5 учеников ждут оплаты».
 * Distinct students are used when the server sends both counts; an older server's membership counts replace them as a
 * pair, never one by one (a student in two groups would otherwise look more overdue than waiting).  «Ends today» is
 * still paid, so the words are «ждут оплаты» and never «оплата закончилась» for those.
 */
export function bannerCopy(input: BannerCounts): BannerCopy {
  const byStudents = isCount(input.studentsDue) && isCount(input.studentsExpired);
  const total = byStudents ? count(input.studentsDue) : count(input.due);
  const expired = Math.min(byStudents ? count(input.studentsExpired) : count(input.expired), total);
  const noun = pluralRu(total, "ученик", "ученика", "учеников");
  const subject = `${total} ${noun}`;
  const waiting = `${noun === "ученик" ? "ждёт" : "ждут"} оплаты`;

  if (total > 0 && expired === total) {
    const predicate = "с просроченной оплатой";
    return { count: total, expired, subject, predicate, chip: null, text: `${subject} ${predicate}`, compactSubject: subject, compactPredicate: predicate };
  }
  const chip = expired > 0 ? `из них просрочено: ${expired}` : null;
  return {
    count: total,
    expired,
    subject,
    predicate: waiting,
    chip,
    text: `${subject} ${waiting}`,
    // «5 ждут оплаты, 2 просрочено»: short enough for a compact phone row; the full sentence stays in the tooltip.
    // A non-breaking space keeps «2 просрочено» together when the row wraps after the comma.
    compactSubject: chip ? String(total) : subject,
    compactPredicate: chip ? `${waiting}, ${expired}\u00A0просрочено` : waiting,
  };
}
