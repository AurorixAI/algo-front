"use client";

import Link from "next/link";
import { ChevronRight, MessageSquare } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { dayAndDateLabel } from "@/lib/ops-errors";
import { TAP_ZONE } from "@/lib/tap-zone";
import { lessonWhen } from "@/lib/substitutions";
import { waitingChipText, waitingDecideLabel, waitingReasonText, reportedLine } from "@/lib/lesson-rules";
import type { WaitingCancellationItem } from "@/lib/substitution-types";

/** «Открыть урок: Математика 7, пн, 23.11, 17:00–18:00» - the name of the link of the lesson of a waiting cancellation (fifty rows must not read alike). */
export function waitingLessonLabel(item: { group: { name: string }; lesson: { date: string; startTime?: string | null; endTime?: string | null } }): string {
  const { date, startTime, endTime } = item.lesson;
  return `${item.group.name}, ${dayAndDateLabel(date)}${startTime && endTime ? `, ${startTime}–${endTime}` : ""}`;
}

/** The lesson of a row that is not a request (a waiting cancellation, an entry of the journal): «пн, 23.11 · 17:00–18:00» (the time when the server has it) and the group under it; ONE link to the journal of that day. */
export function LessonLinkCell({ item, href }: { item: { group: { name: string }; lesson: { date: string; startTime?: string | null; endTime?: string | null } }; href: string | null }) {
  const { date, startTime, endTime } = item.lesson;
  const when = startTime && endTime ? lessonWhen(date, startTime, endTime) : dayAndDateLabel(date);
  const body = (
    <>
      <span className="block text-sm font-semibold leading-5 text-slate-900">{when}</span>
      <span className="block break-words text-xs text-slate-600">{item.group.name}</span>
    </>
  );
  return href ? (
    <Link href={href} data-testid="waiting-lesson-link" aria-label={`Открыть урок: ${waitingLessonLabel(item)}`} data-touch-zone="" className={`block min-w-0 rounded-md text-left ${TAP_ZONE} hover:[&>span:first-child]:text-primary-700 hover:[&>span:first-child]:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}>
      {body}
    </Link>
  ) : <div className="min-w-0 text-left">{body}</div>;
}

/** The words of the cancelling person: not a chip - a comment mark and the line, cut with «…» (the whole sentence is the title and the window of the decision). */
export function WaitingReason({ item }: { item: WaitingCancellationItem }) {
  const text = waitingReasonText(item);
  return (
    <p data-testid="waiting-reason" data-allow-hscroll="" title={text} className="flex min-w-0 items-center gap-1.5 text-sm text-slate-700">
      <MessageSquare className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}

/**
 * A cancellation that waits, as a row of the table «Ждут решения» (for who may decide it): the lesson, the teacher, the words of the teacher, «ждёт N дней», «Решить», «›».  No tick: the bulk
 * panel decides requests (a cancellation is decided one by one - the outcome is a fact about the lesson, not a choice for a pack).  The grid classes are those of the page's table.
 */
export function WaitingTableRow({ item, cols, showReason, lessonHref, onDecide }: {
  item: WaitingCancellationItem;
  cols: string;
  showReason: boolean;
  lessonHref: string | null;
  onDecide: (item: WaitingCancellationItem) => void;
}) {
  return (
    <li data-testid="waiting-row" className={`relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 pr-12 xl:grid xl:items-start xl:gap-x-3 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 xl:pr-4 ${cols}`}>
      {/* the place of the tick of the requests: the lessons of both kinds stand on one vertical */}
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="hidden h-[18px] w-[18px] shrink-0 xl:block" />
        <LessonLinkCell item={item} href={lessonHref} />
      </div>
      <p className="break-words text-sm font-medium text-slate-800">{item.teacher.name}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 xl:contents">
        {showReason && <div className="min-w-0 max-xl:w-full"><WaitingReason item={item} /></div>}
        <div className="flex min-w-0 justify-start xl:justify-center">
          <Chip tone="warn" testId="waiting-days" className="whitespace-nowrap">{waitingChipText(item.waitingDays)}</Chip>
        </div>
      </div>
      <div className="flex items-center justify-end xl:-my-1.5">
        <Button type="button" onClick={() => onDecide(item)} aria-label={waitingDecideLabel(item)} variant="primary" size="md" className="w-full xl:w-auto">Решить</Button>
      </div>
      <div className="absolute right-1 top-1 xl:static xl:-my-1 xl:flex xl:justify-end">
        {lessonHref && (
          <Link href={lessonHref} aria-label={`Открыть урок: ${waitingLessonLabel(item)}`} data-testid="waiting-open" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}

/** The quiet line of a waiting cancellation for who cannot decide it (the block «Решает владелец»): who reported, when, which lesson.  No sum, no button. */
export function WaitingReportedRow({ item }: { item: WaitingCancellationItem }) {
  return (
    <li data-testid="waiting-reported-row" className="px-4 py-3 text-sm text-slate-800">
      <span className="break-words">{reportedLine(item)}</span>
    </li>
  );
}
