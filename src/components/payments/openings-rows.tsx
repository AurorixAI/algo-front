"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, Undo2 } from "lucide-react";
import { reformatMoneyTyping } from "@/lib/payments";
import {
  currentText,
  draftFor,
  groupProgress,
  groupSelection,
  isChanged,
  isSelectable,
  notEditableText,
  OPENING_MIN_DATE,
  OPENINGS_LEFT_NOTE,
  priceText,
  rowChips,
  type Drafts,
  type OpeningGroupBlock,
  type OpeningRow,
  type RowChip,
  type RowDraft,
} from "@/lib/openings";
import { studentHref } from "@/lib/ia-links";

/** Wide layout (xl): ☐ · student · price · now · paid until · debt.  Below it a row is a card (the phone has no table). */
export const OPENINGS_GRID_COLS = "xl:grid-cols-[1.75rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.15fr)_10.5rem_minmax(0,13rem)]";
const GRID = `xl:grid ${OPENINGS_GRID_COLS} xl:items-start xl:gap-x-3`;

/** 16 px on a phone: iOS does not zoom into a field of at least 16 px. */
const FIELD = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:text-sm";
const CHIP_TONE: Record<RowChip["tone"], string> = {
  slate: "bg-slate-100 text-slate-600",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  sky: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100",
};

export interface OpeningsListProps {
  groups: OpeningGroupBlock[];
  drafts: Drafts;
  /** id -> the words of the problem (the client's or the server's preview). */
  problems: Record<string, string>;
  /** id -> «→ оплачено до 14.11» (the server's conversion of «осталось уроков»). */
  arrows: Record<string, string>;
  selected: ReadonlySet<string>;
  openIds: ReadonlySet<string>;
  accountingStart: string;
  paidUntilMax: string;
  studentsBase: string;
  onToggleOpen: (groupId: string) => void;
  onToggleRow: (id: string) => void;
  onToggleGroup: (group: OpeningGroupBlock) => void;
  onEdit: (row: OpeningRow, patch: Partial<RowDraft>) => void;
  onUndo: (row: OpeningRow) => void;
}

/** The header row of the wide table. */
export function OpeningsTableHead({ lessons }: { lessons: boolean }) {
  const cell = "min-w-0 text-[13px] font-semibold text-slate-500";
  return (
    <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 ${GRID} xl:items-center`}>
      <span className="sr-only">Выбор</span>
      <span className={cell}>Ученик</span>
      <span className={cell}>{lessons ? "Цена пакета" : "Цена в месяц"}</span>
      <span className={cell}>Сейчас</span>
      <span className={cell}>Оплачено до</span>
      <span className={cell}>Долг на начало</span>
    </div>
  );
}

/** The groups as an accordion: the name, the teacher and «заполнено x из y» in the header; the rows inside. */
export function OpeningsGroups(props: OpeningsListProps) {
  const { groups, openIds, onToggleOpen } = props;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <GroupBlock key={group.id} group={group} open={openIds.has(group.id)} onToggle={() => onToggleOpen(group.id)} {...props} />
      ))}
    </div>
  );
}

function GroupBlock({ group, open, onToggle, ...props }: OpeningsListProps & { group: OpeningGroupBlock; open: boolean; onToggle: () => void }) {
  const { selected, onToggleGroup, drafts } = props;
  const progress = groupProgress(group.memberships);
  const state = groupSelection(group.memberships, selected);
  const checkbox = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = state === "some"; }, [state]);
  const percent = progress.needed === 0 ? 100 : Math.floor((progress.filled * 100) / progress.needed);
  const edited = group.memberships.filter((row) => isChanged(row, drafts[row.membership_id])).length;
  const selectable = group.memberships.some(isSelectable);
  const panelId = `openings-group-${group.id}`;
  const lessons = group.memberships[0]?.mode === "lessons";

  return (
    <section data-testid="openings-group" data-group-id={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1 pr-2">
        <label className="flex h-12 w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            ref={checkbox}
            type="checkbox"
            checked={state === "all"}
            disabled={!selectable}
            onChange={() => onToggleGroup(group)}
            aria-label={`Выбрать всю группу ${group.name}`}
            data-testid="openings-group-select"
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
          />
        </label>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="openings-group-toggle"
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{group.name}</span>
            <span className="block truncate text-xs text-slate-500">{group.teacher_name ?? "Без преподавателя"}</span>
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="block text-xs text-slate-600" data-testid="openings-group-progress">{progress.text}</span>
            <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></span>
          </span>
          <span className="shrink-0 text-xs text-slate-600 sm:hidden" data-testid="openings-group-progress">{progress.text}</span>
          {edited > 0 && <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700" title="Изменено в этой группе, ещё не сохранено">{edited}</span>}
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={panelId} className="border-t border-slate-100">
          <OpeningsTableHead lessons={lessons} />
          <ul className="divide-y divide-slate-100">
            {group.memberships.map((row) => <OpeningRowView key={row.membership_id} row={row} {...props} />)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Chip({ chip }: { chip: RowChip }) {
  return <span title={chip.title} className={`rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${CHIP_TONE[chip.tone]}`}>{chip.label}</span>;
}

function OpeningRowView({ row, ...props }: OpeningsListProps & { row: OpeningRow }) {
  const { drafts, problems, arrows, selected, accountingStart, paidUntilMax, studentsBase, onToggleRow, onEdit, onUndo } = props;
  const id = row.membership_id;
  const draft = drafts[id];
  const shown = draftFor(row, drafts);
  const changed = isChanged(row, draft);
  const problem = problems[id] ?? null;
  const reason = notEditableText(row.reason_not_editable);
  const left = row.status === "left";
  const lessonsMode = row.mode === "lessons";
  const arrow = arrows[id] ?? null;
  const chips = rowChips(row, accountingStart);
  const name = row.student.name;
  const disabled = !row.editable;
  const debtDate = shown.debtOn || row.floor;

  const nowText = shown.clear
    ? "Остаток уберём"
    : currentText(row, accountingStart);
  const nowTone = shown.clear ? "text-rose-700" : row.missing ? "text-amber-700" : "text-slate-700";

  return (
    <li
      data-testid="openings-row"
      data-membership-id={id}
      data-changed={changed ? "1" : undefined}
      data-error={problem ? "1" : undefined}
      className={`relative flex flex-col gap-2.5 border-l-[3px] px-3.5 py-3 xl:px-4 ${GRID} ${problem ? "border-l-rose-400 bg-rose-50/50" : changed ? "border-l-primary-400 bg-primary-50/30" : "border-l-transparent"} ${disabled ? "bg-slate-50/60" : ""}`}
    >
      <div className="flex items-start gap-2 xl:contents">
        <label className="-ml-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center xl:ml-0 xl:h-6 xl:w-6">
          <input
            type="checkbox"
            checked={selected.has(id)}
            disabled={!isSelectable(row)}
            onChange={() => onToggleRow(id)}
            aria-label={`Выбрать: ${name}`}
            data-testid="openings-row-select"
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30 disabled:opacity-40"
          />
        </label>
        <div className="min-w-0 flex-1">
          <Link href={studentHref(studentsBase, row.student.id, "payments")} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700 xl:truncate" title={name} data-testid="openings-student-link">
            {name}
          </Link>
          <p className="text-xs text-slate-500">
            {[row.student.display_id, row.student.class_level ? `${row.student.class_level} класс` : null].filter(Boolean).join(" · ")}
          </p>
          {chips.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{chips.map((chip) => <Chip key={chip.key} chip={chip} />)}</div>}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm xl:block">
        <span className="text-xs text-slate-400 xl:hidden">{lessonsMode ? "Цена пакета" : "Цена в месяц"}</span>
        <span className="tabular-nums text-slate-700" data-testid="openings-price">{priceText(row)}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm xl:block">
        <span className="text-xs text-slate-400 xl:hidden">Сейчас</span>
        <span className={`text-right xl:text-left ${nowTone}`} data-testid="openings-now">{nowText}</span>
      </div>

      {reason ? (
        <p className="text-xs text-slate-500 xl:col-span-2" data-testid="openings-locked">{reason}</p>
      ) : shown.clear ? (
        <div className="flex items-center justify-between gap-2 xl:col-span-2">
          <p className="text-xs font-medium text-rose-700">Сохранённый остаток будет убран</p>
          <button type="button" onClick={() => onUndo(row)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Вернуть
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:contents">
            <div className="min-w-0">
              <label className="mb-1 block text-xs text-slate-500 xl:hidden" htmlFor={`op-paid-${id}`}>Оплачено до</label>
              <input
                id={`op-paid-${id}`}
                type="date"
                value={shown.paidUntil}
                min={row.floor || undefined}
                max={paidUntilMax || undefined}
                disabled={left}
                title={left ? OPENINGS_LEFT_NOTE : undefined}
                onChange={(event) => onEdit(row, { paidUntil: event.target.value, lessons: "" })}
                aria-label={`Оплачено до — ${name}`}
                data-testid="openings-paid-until"
                className={FIELD}
              />
              {lessonsMode && !left && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <label htmlFor={`op-lessons-${id}`} className="shrink-0 text-xs text-slate-500">Осталось уроков</label>
                  <input
                    id={`op-lessons-${id}`}
                    value={shown.lessons}
                    inputMode="numeric"
                    autoComplete="off"
                    onChange={(event) => onEdit(row, { lessons: event.target.value.replace(/\D+/g, "").slice(0, 3), paidUntil: "" })}
                    aria-label={`Осталось уроков — ${name}`}
                    data-testid="openings-lessons"
                    className={`${FIELD} !h-8 w-16 shrink-0 text-center`}
                  />
                </div>
              )}
              {lessonsMode && !left && shown.lessons && (
                <p className="mt-1 text-xs text-slate-500" data-testid="openings-lessons-arrow">{arrow ?? "→ дата появится после проверки"}</p>
              )}
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs text-slate-500 xl:hidden" htmlFor={`op-debt-${id}`}>Долг на начало</label>
              <div className="relative">
                <input
                  id={`op-debt-${id}`}
                  value={shown.debt}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="сумма"
                  onChange={(event) => onEdit(row, { debt: reformatMoneyTyping(event.target.value) })}
                  aria-label={`Долг на начало — ${name}`}
                  data-testid="openings-debt"
                  className={`${FIELD} pr-11`}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">сум</span>
              </div>
              {shown.debt && (
                <div className="mt-1 text-xs text-slate-500">
                  <span>на </span>
                  <input
                    type="date"
                    value={debtDate}
                    min={OPENING_MIN_DATE}
                    max={row.floor || undefined}
                    onChange={(event) => onEdit(row, { debtOn: event.target.value })}
                    aria-label={`Дата долга — ${name}`}
                    data-testid="openings-debt-on"
                    className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-base text-slate-700 outline-none focus:border-primary-500 sm:text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {problem && <p role="alert" className="text-xs font-medium text-rose-700 xl:col-span-6 xl:pl-[2.5rem]" data-testid="openings-row-problem">{problem}</p>}
    </li>
  );
}
