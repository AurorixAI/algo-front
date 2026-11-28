"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { buttonClass } from "@/lib/button-style";
import { orgApi } from "@/lib/api";
import { DRY_RUN_REASON } from "@/lib/dry-run";
import { formatBusinessDate } from "@/lib/business-time";
import { groupHref, teacherHref, workspaceBases } from "@/lib/ia-links";
import { journalHref } from "@/lib/open-lessons";
import { moneyEffectsOf } from "@/lib/money-effects";
import { dayAndDateLabel } from "@/lib/ops-errors";
import { authorLine, eventMoment } from "@/lib/substitution-outcome";
import { lessonLabel, lessonWhen, shortWhen } from "@/lib/substitutions";
import { auditByLine, auditChipText, auditPanelTitle, salaryLineOf } from "@/lib/lesson-rules";
import type { AuditEntryItem } from "@/lib/substitution-types";
import { LessonLinkCell } from "@/components/substitutions/waiting-rows";
import { ReasonWords } from "@/components/substitutions/reason-words";

/**
 * An entry of the journal as a row of the history («Задним числом · 2 дн.», «Отметки исправлены», «Добавил урок в расписание»): the lesson, who -> whom (the person who wrote the line, when it is not the
 * teacher of the lesson, in grey under him), the words of the reason, ONE chip, when, «›».  The grid classes are those of the history table of the page.
 */
export function AuditTableRow({ entry, cols, showReason, lessonHref, onOpen }: {
  entry: AuditEntryItem;
  cols: string;
  showReason: boolean;
  lessonHref: string | null;
  onOpen: (entry: AuditEntryItem) => void;
}) {
  const by = auditByLine(entry);
  return (
    <li data-testid="audit-row" data-kind={entry.kind} className={`relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 pr-12 xl:grid xl:items-start xl:gap-x-3 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 xl:pr-4 ${cols}`}>
      <LessonLinkCell item={entry} href={lessonHref} />
      <div className="min-w-0 space-y-0.5 text-left">
        <p className="break-words text-sm font-medium text-slate-800">{entry.teacher.name}</p>
        {by && <p data-testid="audit-by" className="break-words text-xs text-slate-500">{by}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 xl:contents">
        {showReason && <div className="min-w-0 max-xl:order-2">{entry.kind === "corrected" && entry.reason ? <ReasonWords text={entry.reason} /> : null}</div>}
        <div className="min-w-0 max-xl:order-1"><Chip tone="neutral" testId="audit-chip" className="whitespace-nowrap">{auditChipText(entry)}</Chip></div>
        <div className="min-w-0 max-xl:order-3 max-xl:ml-auto"><span data-testid="when-cell" className="whitespace-nowrap text-xs text-slate-500">{shortWhen(entry.at)}</span></div>
      </div>
      <div className="absolute right-1 top-1 xl:static xl:-my-1 xl:flex xl:justify-end">
        <button
          type="button"
          onClick={() => onOpen(entry)}
          aria-haspopup="dialog"
          aria-label={`Подробнее: ${lessonLabel(entry)}`}
          data-testid="audit-details"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/**
 * The panel «Подробнее» of an entry of the journal: the group, the lesson, «Сейчас: Задним числом · 6 дн.», the teacher, the one line of its history (when, what, who).  The owner and the administrator WITH the
 * money right also read what the lesson gave to the salary (the dry run of «Вернуть урок», the sums are the server's) and may return the lesson; the others read the same panel without money and without the return.
 */
const RETURN_PREVIEW_ERROR = "Не удалось посчитать последствия возврата. Закройте запись и откройте её снова.";

export function AuditPanel({ entry, workspace, canSeeMoney, onClose, onReturn }: {
  entry: AuditEntryItem | null;
  workspace: "owner" | "admin";
  canSeeMoney: boolean;
  onClose: () => void;
  onReturn: (entry: AuditEntryItem) => void;
}) {
  const bases = workspaceBases(workspace);
  const [salary, setSalary] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const key = entry ? `${entry.group.id}|${entry.lesson.lessonId}|${entry.lesson.date}` : null;
  // the server says whether the lesson can be returned (`canReturn`: held, the month open, the money right): the screen keeps no rule of its own
  // FIX4-B5: an entry without the date (or the id) of the lesson is read, never returned: no request with an empty date, no button
  const mayReturn = entry !== null && entry.canReturn === true && canSeeMoney && /^\d{4}-\d{2}-\d{2}$/.test(entry.lesson?.date ?? "") && Boolean(entry.lesson?.lessonId);
  useEffect(() => {
    setSalary(null);
    setPreviewError(null);
    if (!entry || !mayReturn) return undefined;
    let cancelled = false;
    // what the lesson gave to the salary: the dry run of the return says it (nothing is written); when it fails the person reads WHY and «Вернуть урок» is not offered
    orgApi.returnHeldLesson(entry.group.id, { lessonDate: entry.lesson.date, lessonId: entry.lesson.lessonId, reason: DRY_RUN_REASON, dryRun: true })
      .then((answer) => { if (!cancelled) setSalary(salaryLineOf(moneyEffectsOf(answer), formatBusinessDate())); })
      .catch((failure) => { if (!cancelled) setPreviewError(failure instanceof Error && failure.message ? failure.message : RETURN_PREVIEW_ERROR); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mayReturn]);

  const lessonLink = entry && entry.lesson.lessonId ? journalHref(bases.groups, { groupId: entry.group.id, lessonDate: entry.lesson.date, lessonId: entry.lesson.lessonId }) : null;
  const footer = entry ? (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
      {mayReturn && previewError === null && <Button variant="secondary" onClick={() => onReturn(entry)} data-testid="audit-return">Вернуть урок</Button>}
      {lessonLink && <Link href={lessonLink} data-testid="panel-open-lesson" className={buttonClass({ variant: "secondary" })}>Открыть урок</Link>}
      <Link href={groupHref(bases.groups, entry.group.id)} data-testid="panel-group-link" className="text-sm font-semibold text-primary-700 hover:underline">Группа ›</Link>
      {workspace === "owner" && entry.teacher.id && <Link href={teacherHref(entry.teacher.id)} data-testid="panel-teacher-link" className="text-sm font-semibold text-primary-700 hover:underline">Преподаватель ›</Link>}
    </div>
  ) : undefined;
  const author = entry ? authorLine(entry.by, entry.by.role === "teacher" ? "teacher" : "manager", "manager") : null;
  return (
    <Modal open={entry !== null} title="Подробнее" onClose={onClose} placement="sheet" maxWidthClassName="max-w-md" footer={footer} footerClassName="p-4 sm:p-5" bodyClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
      {entry && (
        <div data-testid="audit-panel" className="space-y-4">
          <div className="space-y-1">
            <h3 data-testid="panel-group" className="break-words text-base font-bold text-slate-900">{entry.group.name}</h3>
            <p className="text-sm text-slate-700">{entry.lesson.startTime && entry.lesson.endTime ? lessonWhen(entry.lesson.date, entry.lesson.startTime, entry.lesson.endTime) : dayAndDateLabel(entry.lesson.date)}</p>
            <p className="flex flex-wrap items-center gap-2 pt-1 text-sm text-slate-700"><span>Сейчас:</span><Chip tone="neutral" testId="panel-outcome">{auditChipText(entry)}</Chip></p>
          </div>
          <dl data-testid="panel-facts" className="space-y-1.5">
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 text-sm"><dt className="text-slate-500">Преподаватель</dt><dd className="min-w-0 break-words font-medium text-slate-800">{entry.teacher.name}</dd></div>
            {entry.kind === "corrected" && entry.reason && <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 text-sm"><dt className="text-slate-500">Причина</dt><dd className="min-w-0 break-words font-medium text-slate-800">{entry.reason}</dd></div>}
          </dl>
          {salary && <p data-testid="panel-salary" className="text-sm text-slate-800">{salary}</p>}
          {previewError !== null && <Notice variant="warning" role="alert" testId="panel-return-error">{previewError}</Notice>}
          <ol data-testid="timeline" className="space-y-3 border-l border-slate-200 pl-4">
            <li data-testid="timeline-row" className="relative">
              <span aria-hidden className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
              <p className="text-xs text-slate-500"><time dateTime={entry.at}>{eventMoment(entry.at)}</time></p>
              <p className="break-words text-sm font-medium text-slate-900">{auditPanelTitle(entry)}</p>
              {author && <p data-testid="timeline-author" className="text-xs text-slate-500">{author}</p>}
            </li>
          </ol>
        </div>
      )}
    </Modal>
  );
}
