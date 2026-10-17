import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { excuseDecisionCopy, previewTargets, type ExcuseDecision, type ExcuseDecisionSubject } from "../../lib/excuse-decision";
import { lessonShortLabel } from "../../lib/excuse-row";

/** «Чт, 15.10 · Математика 9А» */
function lessonLine(item: ExcuseDecisionSubject): string {
  return [lessonShortLabel(item.lessonDate), item.groupName].filter(Boolean).join(" · ");
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * Body of the dialog (no modal frame, so node:test can render it): who, which lesson, why, and what the
 * decision changes.  One excuse shows the three facts; several show the count and the first few students.
 */
export function ExcuseDecisionBody({ items, decision }: { items: ExcuseDecisionSubject[]; decision: ExcuseDecision }) {
  const copy = excuseDecisionCopy(decision, items.length);
  const single = items.length === 1 ? items[0] : null;
  const { shown, more } = previewTargets(items, 5);
  return (
    <div className="space-y-3">
      {single ? (
        <dl data-testid="excuse-decision-facts" className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 py-1">
          <Row label="Ученик">
            <span className="break-words font-semibold text-slate-900">{single.studentName}</span>
          </Row>
          <Row label="Урок">
            <span className="break-words">{lessonLine(single)}</span>
          </Row>
          <Row label="Причина">
            <p className="whitespace-pre-line break-words">{single.reason}</p>
            {single.reasonMeta && <p className="mt-0.5 text-xs text-slate-500">{single.reasonMeta}</p>}
          </Row>
        </dl>
      ) : (
        <div data-testid="excuse-decision-facts" className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-900">{copy.countLine}</p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">
            {shown.map((item) => (
              <li key={item.id} className="break-words">
                {item.studentName} <span className="text-xs text-slate-500">· {lessonLine(item)}</span>
              </li>
            ))}
            {more > 0 && <li className="text-xs text-slate-500">и ещё {more}</li>}
          </ul>
        </div>
      )}
      <div
        data-testid="excuse-decision-consequence"
        className="flex items-start gap-2.5 rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5"
      >
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-600">Что изменится</p>
          <p className="mt-0.5 text-sm text-slate-800">{copy.consequence}</p>
        </div>
      </div>
    </div>
  );
}
