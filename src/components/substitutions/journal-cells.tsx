"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { dayAndDateLabel } from "@/lib/ops-errors";
import { LESSON_DELETED_TEXT, lessonWhen } from "@/lib/substitutions";
import { lastActivityLabel, originBadge, outcomeOf, peopleOf, reasonShort, type Audience } from "@/lib/substitution-outcome";
import type { SubstitutionItem } from "@/lib/substitution-types";

/** The cells of a row of «Замены» (#157): the lesson, who -> whom, the reason, the result, when, «Подробнее».  The same cells for the wide table and for the card of a phone. */

/** «Открыть урок: 9-А, пн, 26.10, 10:00–11:30» - the name of the link of a lesson and of the arrow of its row (fifty rows must not read alike). */
export function lessonLabel(item: Pick<SubstitutionItem, "group" | "lesson">): string {
  return `${item.group.name}, ${dayAndDateLabel(item.lesson.date)}, ${item.lesson.startTime}–${item.lesson.endTime}`;
}

/**
 * The lesson: «пн, 26.10 · 10:00–11:30» and the group under it, ONE link to the lesson (the journal of the group on that day).  A lesson that is not in
 * the schedule any more is plain text with the words «урок удалён из расписания» - a link to a lesson that is not there leads nowhere.
 */
export function LessonCell({ item, href }: { item: SubstitutionItem; href: string | null }) {
  const gone = item.lesson.exists === false;
  const body = (
    <>
      <span className="block text-sm font-semibold leading-5 text-slate-900">{lessonWhen(item.lesson.date, item.lesson.startTime, item.lesson.endTime)}</span>
      <span className="block break-words text-xs text-slate-600">{item.group.name}</span>
    </>
  );
  if (gone || !href || !item.lesson.lessonId) {
    return (
      <div data-testid="substitution-lesson-plain" className="min-w-0 text-left">
        {body}
        {gone && <span className="block text-xs text-slate-500">{LESSON_DELETED_TEXT}</span>}
      </div>
    );
  }
  return (
    <Link href={href} data-testid="substitution-lesson-link" aria-label={`Открыть урок: ${lessonLabel(item)}`} className="block min-w-0 rounded-md text-left hover:[&>span:first-child]:text-primary-700 hover:[&>span:first-child]:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
      {body}
    </Link>
  );
}

/** The quiet badge «без запроса» / «открыт заново» (a gray frame, no colour). */
export function OriginBadge({ item }: { item: SubstitutionItem }) {
  const text = originBadge(item);
  return text ? <span data-testid="origin-badge" className="inline-block rounded-md border border-slate-200 px-1.5 py-px text-[11px] font-medium leading-4 text-slate-500">{text}</span> : null;
}

/** «Кто → кто»: the teacher, and under him «→ Петров Б.» or «→ чт, 29.10, 16:00».  Left-aligned, long names wrap. */
export function PeopleCell({ item }: { item: SubstitutionItem }) {
  const { teacher, to } = peopleOf(item);
  return (
    <div className="min-w-0 space-y-0.5 text-left">
      <p className="break-words text-sm font-medium text-slate-800">{teacher}</p>
      {to && <p data-testid="people-to" className="break-words text-sm text-slate-700"><span aria-hidden>→ </span>{to}</p>}
      <OriginBadge item={item} />
    </div>
  );
}

const LONG_COMMENT = 90;

/**
 * The reason: the short label of a request («Болезнь», «Личное», «Другое»); a record without a request has none.  The comment is shown only
 * where it is needed to decide (`withComment`: the tab «Ждут»), three lines and «Ещё» - a phone has no tooltip to read the rest.
 */
export function ReasonCell({ item, withComment = false }: { item: SubstitutionItem; withComment?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = reasonShort(item);
  const comment = withComment ? (item.comment ?? "").trim() : "";
  const long = comment.length > LONG_COMMENT;
  if (!label && !comment) return null;
  return (
    <div className="min-w-0 text-left">
      {label && <Chip tone="neutral" testId="reason-chip">{label}</Chip>}
      {comment && (
        <p className={`${label ? "mt-1 " : ""}break-words text-sm text-slate-700 ${open ? "" : "line-clamp-3"}`}>{comment}</p>
      )}
      {long && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="text-xs font-semibold text-primary-700 hover:underline">{open ? "Свернуть" : "Ещё"}</button>
      )}
    </div>
  );
}

/** The result of the row: ONE chip (see `outcomeOf`). */
export function OutcomeChip({ item, audience = "manager" }: { item: SubstitutionItem; audience?: Audience }) {
  const outcome = outcomeOf(item, audience);
  return <Chip tone={outcome.tone} testId="outcome-chip">{outcome.text}</Chip>;
}

/** «Когда»: the moment of the last event of the row, grey, one line. */
export function WhenCell({ item }: { item: SubstitutionItem }) {
  return <span data-testid="when-cell" className="whitespace-nowrap text-xs text-slate-500">{lastActivityLabel(item)}</span>;
}

/** «›» - «Подробнее»: opens the panel of the row.  A zone of 40 x 40, named by the lesson (fifty rows must not read alike). */
export function DetailsButton({ item, onOpen }: { item: SubstitutionItem; onOpen: (item: SubstitutionItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-haspopup="dialog"
      aria-label={`Подробнее: ${lessonLabel(item)}`}
      data-testid="substitution-details"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <ChevronRight className="h-5 w-5" aria-hidden />
    </button>
  );
}
