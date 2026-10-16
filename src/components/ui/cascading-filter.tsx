"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Filter, Check, X } from "lucide-react";
import { staffDisplayName } from "@/lib/staff-name";
import { useFloatingPlacement } from "@/lib/use-floating-placement";
import {
  CLOSED_FILTER_PANEL,
  filterLabel,
  groupsOfTeacher,
  isTeacherOnPath,
  isTeacherSelected,
  reduceFilterPanel,
  type FilterPanelAction,
  type FilterPanelState,
} from "@/lib/cascading-filter";

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
  /** The server's «Фамилия Имя» - only the last fallback of `staffDisplayName`. */
  full_name?: string;
}

interface Group {
  id: string;
  name: string;
  teacher_id: string;
}

interface CascadingFilterProps {
  teachers: Teacher[];
  groups: Group[];
  value: { teacherId: string; groupId: string };
  onChange: (value: { teacherId: string; groupId: string }) => void;
}

const PANEL_WIDTH = 256; // w-64
const ROW_SELECTOR = "button:not([disabled])";

/**
 * Teacher / group filter.  The whole choice happens inside one dropdown panel (no hover flyout that can
 * leave the screen): a teacher row is a name button (selects the teacher = all his groups) plus a separate
 * expand button (aria-expanded) that opens his groups inline under the row.  Nothing depends on hover, so
 * it works on phones, tablets and with the keyboard (Tab / Enter / Space, ArrowUp / ArrowDown / Home / End,
 * Escape closes and returns focus to the trigger).  The panel aligns to the trigger's nearer viewport edge,
 * opens upward when there is no room below and scrolls inside a ~60vh cap (`useFloatingPlacement`).
 */
export function CascadingFilter({ teachers, groups, value, onChange }: CascadingFilterProps) {
  const [panel, setPanel] = useState<FilterPanelState>(CLOSED_FILTER_PANEL);
  const isOpen = panel.open;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const dispatch = useCallback(
    (action: FilterPanelAction) => {
      const result = reduceFilterPanel(panel, action, { value, groups });
      setPanel(result.state);
      if (result.value) onChange(result.value);
    },
    [panel, value, groups, onChange],
  );

  const closePanel = useCallback(() => setPanel(CLOSED_FILTER_PANEL), []);

  const { anchoredStyle } = useFloatingPlacement(triggerRef, panelRef, {
    open: isOpen,
    width: PANEL_WIDTH,
    onAnchorHidden: closePanel,
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    // Touch and mouse: any press outside closes.  Keyboard: Escape, or focus leaving the filter.
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) closePanel();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closePanel();
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, closePanel]);

  // An expanded teacher's groups are brought into view inside the scrolling panel.
  useEffect(() => {
    if (!isOpen || !panel.expandedTeacherId) return;
    panelRef.current
      ?.querySelector<HTMLElement>('[data-teacher-groups="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [isOpen, panel.expandedTeacherId]);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ROW_SELECTOR));
    if (rows.length === 0) return;
    const index = rows.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = index < 0 ? 0 : Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = index < 0 ? rows.length - 1 : Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    if (next === null) return;
    event.preventDefault();
    rows[next].focus({ preventScroll: true });
    rows[next].scrollIntoView({ block: "nearest" });
  };

  const getActiveFilterLabel = () =>
    filterLabel(value, groups, (teacherId) => {
      const t = teachers.find((t) => t.id === teacherId);
      return t ? staffDisplayName(t, "Фильтр") : null;
    });

  const hasSelection = Boolean(value.teacherId || value.groupId);
  const nothingSelected = !hasSelection;

  return (
    <div className="relative inline-block max-w-full text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => dispatch({ type: "toggle" })}
        className="flex max-w-full items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
      >
        <Filter className="w-4 h-4 shrink-0 text-slate-400" />
        <span className="min-w-0 truncate">{getActiveFilterLabel()}</span>
        {hasSelection && (
          <div
            role="button"
            aria-label="Сбросить фильтр"
            title="Сбросить фильтр"
            className="ml-1 shrink-0 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              closePanel();
              onChange({ teacherId: "", groupId: "" });
            }}
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
          </div>
        )}
      </button>

      {/* Dropdown: teachers, each with an inline accordion of his groups */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={panelId}
            ref={panelRef}
            role="group"
            aria-label="Фильтр по преподавателю и группе"
            onKeyDown={handlePanelKeyDown}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={anchoredStyle}
            className="z-50 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-100 py-2 overscroll-contain"
          >
            {/* All Students Option */}
            <button
              type="button"
              onClick={() => dispatch({ type: "pick-all" })}
              className="w-full flex items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 text-left font-medium">Все ученики</div>
              {nothingSelected && <Check className="w-4 h-4 text-primary-600" />}
            </button>

            <div className="h-px bg-slate-100 my-1 mx-4" />

            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5">
              Преподаватели
            </div>

            {teachers.map((teacher) => {
              const selected = isTeacherSelected(value, teacher.id);
              const onPath = isTeacherOnPath(value, teacher.id);
              const teacherGroups = groupsOfTeacher(groups, teacher.id);
              const hasGroups = teacherGroups.length > 0;
              const expanded = hasGroups && panel.expandedTeacherId === teacher.id;
              const groupsId = `${panelId}-groups-${teacher.id}`;

              return (
                <div key={teacher.id}>
                  <div className={`flex items-stretch transition-colors hover:bg-slate-50 ${expanded ? "bg-slate-50" : ""}`}>
                    {/* The name selects the teacher = all his groups */}
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "pick-teacher", teacherId: teacher.id })}
                      title={staffDisplayName(teacher)}
                      className={`min-w-0 flex-1 flex items-center gap-2 pl-4 pr-2 py-2 text-sm text-left ${
                        selected || onPath ? "text-primary-700 font-medium" : "text-slate-700"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{staffDisplayName(teacher)}</span>
                      {selected && <Check className="w-4 h-4 shrink-0 text-primary-600" />}
                    </button>
                    {/* A separate button expands his groups inline (no hover, no flyout) */}
                    {hasGroups && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={groupsId}
                        aria-label={`Группы преподавателя ${staffDisplayName(teacher)}`}
                        title="Группы"
                        onClick={() => dispatch({ type: "expand", teacherId: teacher.id })}
                        className="shrink-0 px-3 flex items-center text-slate-400 hover:text-slate-700"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180 text-slate-600" : ""}`} />
                      </button>
                    )}
                  </div>

                  {expanded && (
                    <div
                      id={groupsId}
                      role="group"
                      aria-label={`Группы: ${staffDisplayName(teacher)}`}
                      data-teacher-groups="true"
                      className="mx-3 my-1 border-l-2 border-slate-100 pl-1"
                    >
                      {teacherGroups.map((group) => {
                        const isGroupSelected = value.groupId === group.id;
                        return (
                          <button
                            key={group.id}
                            type="button"
                            title={group.name}
                            onClick={() => dispatch({ type: "pick-group", teacherId: teacher.id, groupId: group.id })}
                            className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors hover:bg-slate-50 ${
                              isGroupSelected ? "text-primary-700 font-medium" : "text-slate-700"
                            }`}
                          >
                            <span className="flex-1 min-w-0 text-left truncate pr-2">{group.name}</span>
                            {isGroupSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
