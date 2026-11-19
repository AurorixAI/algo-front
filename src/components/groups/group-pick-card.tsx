"use client";

import { Radio } from "@/components/ui/radio";
import { groupNameShown } from "@/lib/enrol-labels";
import { groupScheduleLine, type ScheduleSlotLike } from "@/lib/group-schedule-line";

export interface GroupPickCardGroup {
  id: string;
  name: string;
  class_level: number;
  teacher_name?: string | null;
  max_students?: number;
  student_count?: number;
  students_count?: number;
  schedule?: ReadonlyArray<ScheduleSlotLike> | null;
}

/**
 * The card of a group to enrol / transfer into (a radio): the name (wraps, never cut), ONE line of what the choice is made by - the schedule, the teacher, the price (money roles) and, only when it deviates,
 * «другой класс» - and the filling («12 из 30») at the right.  `priceText` is the caption the window already builds ("" for a role without money; the amber one when the price is not in force).
 */
export function GroupPickCard({ group, selected, gradeMismatch, priceText, priceMissing, onSelect }: {
  group: GroupPickCardGroup;
  selected: boolean;
  /** the group is for another class than the student: the deviation is said, the ordinary case («подходит») is not (LESSONS 148) */
  gradeMismatch: boolean;
  priceText: string;
  priceMissing: boolean;
  onSelect: () => void;
}) {
  const count = group.student_count ?? group.students_count ?? 0;
  const max = group.max_students || 30;
  return (
    <label
      data-testid="assign-group-card"
      data-group={group.id}
      data-selected={selected ? "yes" : "no"}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500 ${selected ? "border-primary-300 bg-primary-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <Radio name="assign-group" checked={selected} onChange={onSelect} aria-label={group.name} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span data-testid="group-card-name" className="block text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">{groupNameShown(group.name)}</span>
        <span className="mt-0.5 block text-xs text-slate-600 [overflow-wrap:anywhere]">
          <span data-testid="group-schedule-line" className="tabular-nums">{groupScheduleLine(group.schedule)}</span>
          {group.teacher_name && <span data-testid="group-pick-teacher"> · {group.teacher_name}</span>}
          {priceText && <span data-testid="group-pick-price" className={priceMissing ? "font-medium text-warning-800" : undefined}> · {priceText}</span>}
          {gradeMismatch && <span data-testid="group-grade-chip"> · другой класс</span>}
        </span>
      </span>
      <span data-testid="group-pick-fill" className="shrink-0 whitespace-nowrap text-xs text-slate-600">{count} из {max}</span>
    </label>
  );
}
