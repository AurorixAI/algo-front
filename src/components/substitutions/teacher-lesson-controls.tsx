"use client";

import { useCallback, useRef, useState, type ComponentType } from "react";
import { CalendarClock, MoreHorizontal, UserMinus, X } from "lucide-react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import type { SubstitutionRequestMark } from "@/lib/substitution-types";
import { MOVE_REJECTED_HINT, MOVE_TOO_LATE_HINT, REQUEST_ACTION } from "@/lib/substitutions";
import { SCHEDULE_ACTION_LABEL, type TeacherCancelOffer } from "@/lib/schedule-card-actions";
import { RequestControl } from "@/components/substitutions/request-control";
import { TeacherMoveControl, type MovableLesson } from "@/components/substitutions/teacher-move-control";

type RequestKind = "none" | "button" | "pending" | "rejected";
type MoveKind = "none" | "button" | "late" | "rejected";

/** The state of the two actions on the lesson panel of the teacher: which dialog is open and what each action is now (the «⋯» menu of the page offers them). */
export function useTeacherLessonActions() {
  const [requestOpen, setRequestOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [requestKind, setRequestKind] = useState<RequestKind>("none");
  const [moveKind, setMoveKind] = useState<MoveKind>("none");
  const [menuOpen, setMenuOpen] = useState(false);
  const reset = useCallback(() => { setRequestOpen(false); setMoveOpen(false); setMenuOpen(false); setRequestKind("none"); setMoveKind("none"); }, []);
  return { menuOpen, setMenuOpen, requestOpen, setRequestOpen, moveOpen, setMoveOpen, requestKind, setRequestKind, moveKind, setMoveKind, reset };
}
export type TeacherLessonActions = ReturnType<typeof useTeacherLessonActions>;

/** One row of the «⋯» menu of a lesson panel. */
export interface LessonMenuItem {
  key: string;
  label: string;
  /** The quiet second line. */
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "danger";
  /** A reason: the item is shown OFF with it instead of the hint. */
  disabledReason?: string;
  onSelect: () => void;
}
export interface LessonMenuGroup { label: string; items: LessonMenuItem[] }

/**
 * The teacher's own actions on his lesson as menu rows: «Перенести урок» (off with the reason in the last hour or after the administrator rejected his request),
 * «Не смогу провести» (only while it can be asked) and, for a lesson that has passed, «Урока не было» (`teacherCancelOffer`; a teacher never cancels a lesson to come - W1 F1).
 */
export function teacherLessonMenuItems(actions: TeacherLessonActions, close: () => void, cancel?: { offer: TeacherCancelOffer | null; open: () => void }): LessonMenuItem[] {
  const items: LessonMenuItem[] = [];
  if (actions.moveKind === "button") items.push({ key: "move", label: SCHEDULE_ACTION_LABEL.reschedule, hint: "На любую дату и время", icon: CalendarClock, onSelect: () => { close(); actions.setMoveOpen(true); } });
  else if (actions.moveKind === "late") items.push({ key: "move", label: SCHEDULE_ACTION_LABEL.reschedule, icon: CalendarClock, disabledReason: MOVE_TOO_LATE_HINT, onSelect: () => {} });
  else if (actions.moveKind === "rejected") items.push({ key: "move", label: SCHEDULE_ACTION_LABEL.reschedule, icon: CalendarClock, disabledReason: MOVE_REJECTED_HINT, onSelect: () => {} });
  if (actions.requestKind === "button") items.push({ key: "request", label: REQUEST_ACTION, hint: "Администратор подберёт замену", icon: UserMinus, onSelect: () => { close(); actions.setRequestOpen(true); } });
  if (cancel?.offer) items.push({ key: "cancel", label: cancel.offer.label, hint: cancel.offer.hint, icon: X, tone: "danger", onSelect: () => { close(); cancel.open(); } });
  return items;
}

const ROW = "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs transition-colors";

/** The rows of the «⋯» menu of a lesson panel, in groups by meaning («Этот урок» / «Постоянное расписание») with a thin line and a quiet label between them. */
export function LessonMenuGroups({ groups }: { groups: LessonMenuGroup[] }) {
  const shown = groups.filter((group) => group.items.length > 0);
  return (
    <>
      {shown.map((group, index) => (
        <div key={group.label} role="group" aria-label={group.label} data-testid={`lesson-menu-group-${index}`} className={index > 0 ? "mt-1 border-t border-slate-100 pt-1" : undefined}>
          <p className="px-3 pb-0.5 pt-1 text-[11px] font-semibold text-slate-400">{group.label}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const off = Boolean(item.disabledReason);
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                aria-disabled={off || undefined}
                data-testid={`lesson-menu-${item.key}`}
                onClick={off ? undefined : item.onSelect}
                className={`${ROW} ${off ? "cursor-not-allowed text-slate-400" : item.tone === "danger" ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${off ? "text-slate-300" : item.tone === "danger" ? "" : "text-slate-500"}`} />
                <span>
                  <span className="block font-semibold">{item.label}</span>
                  {(off || item.hint) && <span className={`mt-0.5 block leading-relaxed ${off ? "text-slate-400" : item.tone === "danger" ? "text-rose-600/80" : "text-slate-500"}`}>{off ? item.disabledReason : item.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** The «⋯» button of the footer of a lesson panel and its menu: ONE place for what can be done with the lesson (the page holds `open` for its Escape key). */
export function LessonActionsMenu({ open, onOpenChange, groups }: { open: boolean; onOpenChange: (open: boolean) => void; groups: LessonMenuGroup[] }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="shrink-0">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => onOpenChange(!open)}
        aria-label="Дополнительные действия с уроком"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "lesson-actions-menu" : undefined}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {/* portalled out of the scrollable lesson dialog: it opens downward without clipping */}
      <FloatingPanel
        id="lesson-actions-menu"
        open={open}
        triggerRef={buttonRef}
        onClose={() => onOpenChange(false)}
        width={256}
        role="menu"
        label="Дополнительные действия с уроком"
        zIndexClass="z-[100001]"
        className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
      >
        <LessonMenuGroups groups={groups} />
      </FloatingPanel>
    </div>
  );
}

/**
 * What the teacher sees about his own future lesson in the body of the panel: the plate «Вы запросили замену» with «Отозвать запрос», «Запрос отклонён», the answer
 * to his action - and the two dialogs.  The ACTIONS themselves («Перенести урок», «Не смогу провести») are rows of the «⋯» menu of the panel (`teacherLessonMenuItems`):
 * one place for what can be done with a lesson.
 */
export function TeacherLessonControls({
  lesson, mark, lessonTeacherId, isSubstitution, lessonStatus, actions, onChanged, onMoved, onDialogChange,
}: {
  lesson: MovableLesson;
  mark: SubstitutionRequestMark | null | undefined;
  lessonTeacherId?: string | null;
  isSubstitution?: boolean;
  lessonStatus: string | null | undefined;
  actions: TeacherLessonActions;
  /** A request was sent or withdrawn: the panel's page refreshes its numbers. */
  onChanged: () => void;
  /** The lesson was moved (the toast text; the page shows it - this control goes away with the panel): the panel closes and the page reads the schedule again. */
  onMoved: (text: string, notes?: string[]) => void;
  /** The move dialog is above the panel: the page's Escape key leaves the panel alone. */
  onDialogChange: (open: boolean) => void;
}) {
  return (
    <div data-testid="teacher-lesson-controls" className="empty:hidden [&:not(:empty)]:mb-4">
      <RequestControl lesson={lesson} mark={mark} lessonTeacherId={lessonTeacherId} lessonStatus={lessonStatus} onChanged={onChanged}
        dialogOpen={actions.requestOpen} onDialogOpenChange={actions.setRequestOpen} onKind={actions.setRequestKind} />
      <TeacherMoveControl lesson={lesson} lessonTeacherId={lessonTeacherId} isSubstitution={isSubstitution} lessonStatus={lessonStatus} mark={mark} onDialogChange={onDialogChange} onMoved={onMoved}
        open={actions.moveOpen} onOpenChange={actions.setMoveOpen} onKind={actions.setMoveKind} />
    </div>
  );
}
