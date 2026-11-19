"use client";

import { Check, Users } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { groupPlaceLine, groupScheduleLine, type ScheduleSlotLike } from "@/lib/group-schedule-line";

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
 * Money-2 А6: the card of a group to enrol / transfer into.  In view only what the choice is made by: the name (wraps, never cut), ONE line of the schedule, the filling; teacher, class, price and
 * room / format are under «Подробнее».  `priceText` is the caption the window already builds ("" for a role without money; the amber one when the price is not in force).
 */
export function GroupPickCard({ group, selected, gradeMismatch, priceText, priceMissing, onSelect }: {
  group: GroupPickCardGroup;
  selected: boolean;
  /** the group is for another class than the student: the deviation is shown, the ordinary case («подходит») is not (LESSONS 148) */
  gradeMismatch: boolean;
  priceText: string;
  priceMissing: boolean;
  onSelect: () => void;
}) {
  const count = group.student_count ?? group.students_count ?? 0;
  const max = group.max_students || 30;
  const place = groupPlaceLine(group.schedule);
  return (
    <div
      data-testid="assign-group-card"
      data-group={group.id}
      data-selected={selected ? "yes" : "no"}
      onClick={onSelect}
      className={`group relative flex cursor-pointer items-start justify-between gap-2 rounded-2xl border p-3 sm:gap-3 sm:p-3.5 transition-all duration-200 ${
        selected ? "border-primary-400 bg-primary-50/80 shadow-sm ring-2 ring-primary-500/20" : "border-slate-200/90 bg-white hover:border-primary-300 hover:shadow-card"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${selected ? "border-primary-600 bg-primary-600 text-white shadow-card" : "border-slate-300 bg-white text-transparent group-hover:border-primary-400"}`}>
          <Check className="h-3 w-3 stroke-[3]" />
        </div>
        <div className="min-w-0 flex-1">
          <p data-testid="group-card-name" className={`text-sm font-bold leading-snug [overflow-wrap:anywhere] ${selected ? "text-primary-950" : "text-slate-900"}`}>{group.name}</p>
          <p data-testid="group-schedule-line" className="mt-0.5 text-xs font-medium tabular-nums text-slate-700 [overflow-wrap:anywhere]">{groupScheduleLine(group.schedule)}</p>
          {gradeMismatch && (
            <span data-testid="group-grade-chip" className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              Другой класс
            </span>
          )}
          <Disclosure testId="group-card-more" className="mt-0.5">
            <ul className="space-y-0.5 [overflow-wrap:anywhere]">
              <li>{group.teacher_name ? `Преподаватель: ${group.teacher_name}` : "Преподаватель не назначен"}</li>
              <li>{group.class_level} класс</li>
              {priceText && <li className={priceMissing ? "font-medium text-amber-700" : "font-medium text-slate-700"}>{priceText}</li>}
              {place && <li>{place}</li>}
            </ul>
          </Disclosure>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="inline-flex items-center gap-1 rounded-xl text-xs font-semibold text-slate-700 sm:gap-1.5 sm:bg-slate-100/90 sm:px-2.5 sm:py-1">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          <span>{count} <span className="font-normal text-slate-500">/ {max}</span></span>
        </div>
      </div>
    </div>
  );
}
