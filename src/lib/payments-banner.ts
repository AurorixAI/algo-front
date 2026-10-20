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
  /**
   * The phone's compact row: the same sentence with the overdue count folded in instead of the chip, «5 учеников» +
   * «ждут оплаты, 2 просрочено».  It is allowed to wrap (to two lines at 390 px) and is never cut with an ellipsis.
   */
  compactSubject: string;
  compactPredicate: string;
}

const count = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * How many PEOPLE wait for a payment: distinct students when the server sends both student counts, otherwise the older
 * membership count (as a pair, never one by one).  The banner and the badge of the menu item «Оплаты» both read this, so
 * the same number stands in both places; the tabs of the payments page count rows (memberships) and stay as they are.
 */
export function waitingPeopleCount(input: BannerCounts): number {
  return isCount(input.studentsDue) && isCount(input.studentsExpired) ? count(input.studentsDue) : count(input.due);
}

/**
 * The words of the payments notice.
 *  - everybody waiting is overdue: «2 ученика с просроченной оплатой» (no chip);
 *  - some are overdue: «5 учеников ждут оплаты» + the chip «из них просрочено: 2»;
 *  - nobody is overdue: «5 учеников ждут оплаты».
 * Distinct students are used when the server sends both counts; an older server's membership counts replace them as a
 * pair, never one by one (a student in two groups would otherwise look more overdue than waiting).  «Ends today» is
 * still paid, so the words are «ждут оплаты» and never «оплата закончилась» for those.
 * The payments page counts ROWS (a student of two groups has two): when the rows are more than the people the notice
 * says both - «7 учеников ждут оплаты (9 оплат)» - so the tab «Требуют оплаты (9)» does not look like a different number.
 */
export function bannerCopy(input: BannerCounts): BannerCopy {
  const byStudents = isCount(input.studentsDue) && isCount(input.studentsExpired);
  const total = waitingPeopleCount(input);
  const expired = Math.min(byStudents ? count(input.studentsExpired) : count(input.expired), total);
  const noun = pluralRu(total, "ученик", "ученика", "учеников");
  const subject = `${total} ${noun}`;
  const rows = count(input.due);
  // A non-breaking space keeps «(9 оплат)» in one piece when the line wraps.
  const rowsNote = byStudents && rows > total ? ` (${rows}\u00A0${pluralRu(rows, "оплата", "оплаты", "оплат")})` : "";
  const waiting = `${noun === "ученик" ? "ждёт" : "ждут"} оплаты${rowsNote}`;

  if (total > 0 && expired === total) {
    const predicate = `с просроченной оплатой${rowsNote}`;
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
    // «5 учеников ждут оплаты, 2 просрочено»: the noun stays (a bare «5» says nothing), and the row wraps instead of
    // cutting the sentence.  A non-breaking space keeps «2 просрочено» together when it wraps after the comma.
    compactSubject: subject,
    compactPredicate: chip ? `${waiting}, ${expired}\u00A0просрочено` : waiting,
  };
}
