"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Chip } from "@/components/ui/chip";
import { substitutionsApi } from "@/lib/api";
import { groupHref, teacherHref, workspaceBases } from "@/lib/ia-links";
import { journalHref } from "@/lib/open-lessons";
import { LESSON_DELETED_TEXT, lessonWhen, movedToLabel, reasonLabelOf, substitutionErrorText } from "@/lib/substitutions";
import { outcomeNote, outcomeOf, type Audience } from "@/lib/substitution-outcome";
import { TRUNCATED_TEXT, timelineOf, type TimelineRow } from "@/lib/substitution-timeline";
import type { SubstitutionDetailOut, SubstitutionItem } from "@/lib/substitution-types";

export const PANEL_TITLE = "Подробнее";
export const PANEL_LOAD_ERROR = "Не удалось загрузить историю";

type Workspace = "owner" | "admin" | "teacher";

/** One fact of the head: «Кто не может — Иванов А.». */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/** The head facts of the row: who cannot, who leads, the reason of the request.  The decision itself and its reason are lines of the history, not repeated here. */
export function PanelFacts({ item }: { item: SubstitutionItem }) {
  const substitute = (item.decision?.substitute?.name ?? "").trim();
  const moved = item.status === "rescheduled" && item.decision?.movedTo ? movedToLabel(item.decision.movedTo) : null;
  const reason = item.origin === "system" ? "" : [item.reasonLabel || reasonLabelOf(item.reasonCode), (item.comment ?? "").trim() ? `«${(item.comment ?? "").trim()}»` : ""].filter(Boolean).join(" — ");
  const note = item.status === "substituted" ? (item.decision?.note ?? "").trim() : "";
  return (
    <dl data-testid="panel-facts" className="space-y-1.5">
      <Fact label={item.origin === "system" ? "Преподаватель" : "Кто не может"}>{item.teacher.name}</Fact>
      {substitute && <Fact label="Замена">{substitute}</Fact>}
      {moved && <Fact label="Новое время">{moved}</Fact>}
      {reason && <Fact label="Причина">{reason}</Fact>}
      {note && <Fact label="Комментарий">{note}</Fact>}
    </dl>
  );
}

/** The history: old to new, a dot, the moment, the line, the author in grey; «Открыть ›» where a line leads to another record. */
export function PanelTimeline({ rows, truncated, onOpenRequest }: { rows: TimelineRow[]; truncated: boolean; onOpenRequest: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Записей о событиях нет.</p>;
  return (
    <div>
      {truncated && <p data-testid="timeline-truncated" className="mb-2 text-xs font-medium text-amber-800">{TRUNCATED_TEXT}</p>}
      <ol data-testid="timeline" className="space-y-3 border-l border-slate-200 pl-4">
        {rows.map((row) => (
          <li key={row.key} data-testid="timeline-row" className="relative">
            <span aria-hidden className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
            <p className="text-xs text-slate-500"><time dateTime={row.at ?? undefined}>{row.when}</time></p>
            <p className="break-words text-sm font-medium text-slate-900">{row.title}</p>
            {row.details.map((line) => <p key={line} className="break-words text-sm text-slate-600">{line}</p>)}
            {row.author && <p data-testid="timeline-author" className="text-xs text-slate-500">{row.author}</p>}
            {row.openRequestId && (
              <button type="button" onClick={() => onOpenRequest(row.openRequestId as string)} className="mt-0.5 text-xs font-semibold text-primary-700 hover:underline">Открыть ›</button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Skeleton() {
  return (
    <div data-testid="panel-skeleton" aria-busy="true" className="space-y-3">
      {[0, 1, 2].map((index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );
}

/**
 * #157: the panel «Подробнее» of a row of «Замены» - the head (the group, the lesson, «Сейчас»), the facts and the history of the chain.  ONE panel on the page (a side sheet
 * from 768 px, a bottom sheet on a phone), the history is read when it opens (`substitutionsApi.detail`).
 *  - the answer is kept with the id it was asked for: a late answer of a row clicked before never paints the panel of the row clicked after (LESSONS 13);
 *  - after a decision the panel is read again and stays; the focus stays in it (the button «Решить» is gone with the decision);
 *  - for a teacher (`audience="teacher"`): his own requests only, the author by the role alone, no links of the managers (the server hides the rest).
 */
export function SubstitutionPanel({
  requestId, seed, audience, workspace, refreshKey = 0, onClose, onDecide, onOpenRequest,
}: {
  requestId: string | null;
  /** The row the panel was opened from: the head shows at once, before the answer. */
  seed?: SubstitutionItem | null;
  audience: Audience;
  workspace: Workspace;
  /** Bumped after a decision: the panel reads the detail again. */
  refreshKey?: number;
  onClose: () => void;
  onDecide?: (item: SubstitutionItem) => void;
  onOpenRequest: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; out: SubstitutionDetailOut } | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const token = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (id: string) => {
    const mine = ++token.current;
    try {
      const out = await substitutionsApi.detail(id);
      if (mine !== token.current) return;
      setLoaded({ id, out });
      setFailed(null);
    } catch (failure) {
      if (mine !== token.current) return;
      setFailed({ id, message: substitutionErrorText(failure, PANEL_LOAD_ERROR) });
    }
  }, []);

  useEffect(() => {
    if (!requestId) { token.current += 1; return; }
    void load(requestId);
  }, [requestId, refreshKey, retry, load]);

  const out = loaded && loaded.id === requestId ? loaded.out : null;
  const error = failed && failed.id === requestId && !out ? failed.message : null;
  const item = out?.item ?? (seed && seed.id === requestId ? seed : null);

  // after the answer the focus stays in the panel (the control that had it may be gone: «Решить» after a decision)
  useEffect(() => {
    const body = bodyRef.current;
    if (!out || !body) return;
    const dialog = body.closest<HTMLElement>('[role="dialog"]');
    if (dialog && !dialog.contains(document.activeElement)) body.focus({ preventScroll: true });
  }, [out]);

  const bases = workspace === "teacher" ? null : workspaceBases(workspace);
  const outcome = item ? outcomeOf(item, audience) : null;
  const note = item ? outcomeNote(item) : null;
  const timeline = out ? timelineOf(out, audience) : null;
  const lessonLink = item && bases && item.lesson.exists !== false && item.lesson.lessonId
    ? journalHref(bases.groups, { groupId: item.group.id, lessonDate: item.lesson.date, lessonId: item.lesson.lessonId })
    : null;

  const footer = item && (lessonLink || bases || (item.status === "pending" && onDecide && audience === "manager")) ? (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
      {item.status === "pending" && onDecide && audience === "manager" && (
        <button type="button" onClick={() => onDecide(item)} data-testid="panel-decide" className="h-9 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700">Решить</button>
      )}
      {lessonLink && <Link href={lessonLink} data-testid="panel-open-lesson" className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">Открыть урок</Link>}
      {bases && <Link href={groupHref(bases.groups, item.group.id)} data-testid="panel-group-link" className="text-sm font-semibold text-primary-700 hover:underline">Группа ›</Link>}
      {workspace === "owner" && item.teacher.id && <Link href={teacherHref(item.teacher.id)} data-testid="panel-teacher-link" className="text-sm font-semibold text-primary-700 hover:underline">Преподаватель ›</Link>}
    </div>
  ) : undefined;

  return (
    <Modal open={requestId !== null} title={PANEL_TITLE} onClose={onClose} placement="sheet" maxWidthClassName="max-w-md" footer={footer} footerClassName="p-4 sm:p-5" bodyClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
      <div ref={bodyRef} tabIndex={-1} data-testid="substitution-panel" className="space-y-4 outline-none">
        {item ? (
          <div className="space-y-1">
            <h3 data-testid="panel-group" className="break-words text-base font-bold text-slate-900">{item.group.name}</h3>
            <p className="text-sm text-slate-700">{lessonWhen(item.lesson.date, item.lesson.startTime, item.lesson.endTime)}</p>
            {item.lesson.exists === false && <p className="text-xs text-slate-500">{LESSON_DELETED_TEXT}</p>}
            {outcome && (
              <p className="flex flex-wrap items-center gap-2 pt-1 text-sm text-slate-700">
                <span>Сейчас:</span>
                <Chip tone={outcome.tone} testId="panel-outcome">{outcome.text}</Chip>
              </p>
            )}
            {note && <p className="text-xs text-slate-500">{note}</p>}
          </div>
        ) : null}
        {item && <PanelFacts item={item} />}
        {error ? (
          <div role="alert" data-testid="panel-error" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
            <p className="text-sm font-medium text-rose-800">{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50">Повторить</button>
          </div>
        ) : timeline ? (
          <PanelTimeline rows={timeline.rows} truncated={timeline.truncated} onOpenRequest={onOpenRequest} />
        ) : (
          <>{!item && <Loader2 className="h-5 w-5 animate-spin text-primary-600" aria-label="Загрузка" />}<Skeleton /></>
        )}
      </div>
    </Modal>
  );
}
