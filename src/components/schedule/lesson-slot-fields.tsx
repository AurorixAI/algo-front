"use client";

import { useRef } from "react";
import { Select } from "@/components/ui/select";
import { TimeInput } from "@/components/ui/time-input";
import { DateInput } from "@/components/ui/date-input";
import { formatBusinessDate } from "@/lib/business-time";
import { DayOffWarning } from "./day-off-warning";
import { ROOM_LABEL, ROOM_PLACEHOLDER, VALID_FROM_HINT, validFromBounds } from "@/lib/schedule-slots";
import {
  COLOR_CLASSES, COLOR_NAMES, DAYS, DAYS_REQUIRED_HINT, FORMAT_OPTIONS, LESSON_COLORS, isEndTyped, startTimePatch, toggleDay,
  type LessonColor, type LessonFormat,
} from "@/lib/lesson-slot-form";

export const SLOT_FIELD_CLASS =
  "w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none";

/** The part of a weekly lesson that is the same wherever it is typed: the time, the format, the room, the topic, the colour. */
export interface SlotFormValue {
  startTime: string;
  endTime: string;
  format: LessonFormat;
  room: string;
  topic: string;
  color: LessonColor;
}

/**
 * Time range, format and room, topic and colour of a weekly lesson - the fields the teacher's «Добавить урок» and «Изменить постоянное
 * расписание» always had, now also the owner's and the administrator's (group page).  `idPrefix` keeps the ids of the fields
 * (`<prefix>-nachalo`, `-okonchanie`, `-format`, `-auditoriya`, `-tema-zanyatiya`, `-color-label`).  A new start time moves the end 90 minutes after it.
 */
export function LessonSlotFields({ idPrefix, value, onChange, disabled = false, endInvalid = false }: {
  idPrefix: string;
  value: SlotFormValue;
  onChange: (patch: Partial<SlotFormValue>) => void;
  /** Rendered between the topic and the colour (the edit dialog's «Причина изменения»). */
  disabled?: boolean;
  endInvalid?: boolean;
}) {
  // The end follows the start (+90 min) only while nobody has typed an end of his own: a typed or pasted end is never overwritten.
  const endTyped = useRef(false);
  const setStart = (startTime: string) => {
    const next = startTimePatch(value, startTime, endTyped.current);
    if (next) onChange(next);
  };
  const setEnd = (endTime: string) => {
    endTyped.current = isEndTyped(endTime);
    onChange({ endTime });
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-nachalo`} className="block text-xs font-semibold text-slate-700 mb-1">Начало</label>
          <TimeInput id={`${idPrefix}-nachalo`} value={value.startTime} onChange={setStart} required disabled={disabled} className={SLOT_FIELD_CLASS} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-okonchanie`} className="block text-xs font-semibold text-slate-700 mb-1">Окончание</label>
          <TimeInput id={`${idPrefix}-okonchanie`} value={value.endTime} onChange={setEnd} required disabled={disabled} invalid={endInvalid} className={SLOT_FIELD_CLASS} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-format`} className="block text-xs font-semibold text-slate-700 mb-1">Формат</label>
          <Select
            id={`${idPrefix}-format`}
            value={value.format}
            onChange={(event) => onChange({ format: event.target.value as LessonFormat })}
            options={FORMAT_OPTIONS}
            buttonClassName="px-3 py-2 text-xs"
            disabled={disabled}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-auditoriya`} className="block text-xs font-semibold text-slate-700 mb-1">{ROOM_LABEL}</label>
          <input
            id={`${idPrefix}-auditoriya`}
            type="text"
            value={value.room}
            onChange={(event) => onChange({ room: event.target.value })}
            placeholder={ROOM_PLACEHOLDER}
            disabled={disabled}
            className={SLOT_FIELD_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-tema-zanyatiya`} className="block text-xs font-semibold text-slate-700 mb-1">Тема занятия (необязательно)</label>
        <input
          id={`${idPrefix}-tema-zanyatiya`}
          type="text"
          value={value.topic}
          onChange={(event) => onChange({ topic: event.target.value })}
          placeholder="Например: Квадратные уравнения"
          disabled={disabled}
          className={SLOT_FIELD_CLASS}
        />
      </div>

      <div>
        <span id={`${idPrefix}-color-label`} className="block text-xs font-semibold text-slate-700 mb-1.5">Цветовая метка</span>
        <div role="group" aria-labelledby={`${idPrefix}-color-label`} className="flex items-center gap-2">
          {LESSON_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={COLOR_NAMES[color]}
              aria-pressed={value.color === color}
              disabled={disabled}
              onClick={() => onChange({ color })}
              className={`w-7 h-7 rounded-full border-2 transition-all ${COLOR_CLASSES[color].dot} ${
                value.color === color ? "border-slate-900 scale-110 shadow-xs" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/** «Дни недели»: Пн..Вс as chips, several at once.  Nothing chosen says «Выберите день» (a hint, never something that looks like a chosen day). */
export function WeekdayChips({ idPrefix, days, onChange, disabled = false, invalid = false, single = false }: {
  idPrefix: string;
  /** One day only (a radio group): picking another day moves the lesson to it. */
  single?: boolean;
  days: readonly number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const hintId = `${idPrefix}-days-hint-text`;
  return (
    <div>
      <span id={`${idPrefix}-days-label`} className="block text-xs font-semibold text-slate-700 mb-1.5">{single ? "День недели" : "Дни недели"}</span>
      <div role={single ? "radiogroup" : "group"} aria-labelledby={`${idPrefix}-days-label`} aria-describedby={hintId} aria-invalid={invalid || undefined} className="flex flex-wrap gap-1.5">
        {DAYS.map((day) => {
          const on = days.includes(day.id);
          return (
            <button
              key={day.id}
              type="button"
              {...(single ? { role: "radio" as const, "aria-checked": on } : { "aria-pressed": on })}
              disabled={disabled}
              onClick={() => onChange(single ? [day.id] : toggleDay(days, day.id))}
              className={`h-9 min-w-[2.5rem] rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                on ? "border-primary-500 bg-primary-600 text-white shadow-xs" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {/* the name begins with the visible text («Пн Понедельник»): what is seen is what is said */}
              {day.short}<span className="sr-only"> {day.name}</span>
            </button>
          );
        })}
      </div>
      {days.length === 0 ? (
        <p id={hintId} data-testid={`${idPrefix}-days-hint`} role={invalid ? "alert" : undefined} className={`mt-1 text-[11px] leading-4 ${invalid ? "font-semibold text-rose-600" : "text-slate-500"}`}>{DAYS_REQUIRED_HINT}</p>
      ) : (
        <p id={hintId} className="mt-1 text-[11px] leading-4 text-slate-500">{single ? "Выберите другой день, чтобы перенести урок на него." : "Урок будет повторяться в эти дни каждую неделю."}</p>
      )}
    </div>
  );
}

export type LessonScope = "one_off" | "recurring";

/**
 * «Как добавить занятие»: the two kinds of a lesson, the same on the teacher's schedule and on the group page.
 * «Еженедельный урок» - the weekdays (several at once) and «Действует с»; «Разовое занятие» - one future date.
 */
export function LessonScopeFields({ idPrefix, scope, onScope, days, onDays, daysInvalid = false, date, onDate, dateMax, validFrom, onValidFrom, disabled = false }: {
  idPrefix: string;
  scope: LessonScope;
  onScope: (scope: LessonScope) => void;
  days: readonly number[];
  onDays: (days: number[]) => void;
  daysInvalid?: boolean;
  date: string;
  onDate: (date: string) => void;
  /** The latest date of a one-off lesson (the teacher's open week); none on the group page. */
  dateMax?: string;
  validFrom: string;
  onValidFrom: (date: string) => void;
  disabled?: boolean;
}) {
  const today = formatBusinessDate();
  const kind = (value: LessonScope, title: string, hint: string) => (
    <button
      type="button"
      aria-pressed={scope === value}
      disabled={disabled}
      onClick={() => onScope(value)}
      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
        scope === value ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-200" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="block font-bold">{title}</span>
      <span className="mt-0.5 block text-[11px] opacity-75">{hint}</span>
    </button>
  );
  return (
    <>
      <fieldset>
        <legend className="block text-xs font-semibold text-slate-700 mb-1.5">Как добавить занятие</legend>
        <div className="grid grid-cols-2 gap-2">
          {kind("recurring", "Еженедельный урок", "Повторяется каждую неделю")}
          {kind("one_off", "Разовое занятие", "Только на одну дату")}
        </div>
      </fieldset>

      {scope === "one_off" ? (
        <div>
          <label htmlFor={`${idPrefix}-data-zanyatiya`} className="block text-xs font-semibold text-slate-700 mb-1">Дата занятия</label>
          <DateInput id={`${idPrefix}-data-zanyatiya`} value={date} min={today} max={dateMax} onChange={onDate} required disabled={disabled} className={SLOT_FIELD_CLASS} />
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Занятие появится только на выбранную дату и не изменит следующие недели.</p>
          <DayOffWarning date={date} />
        </div>
      ) : (
        <>
          <WeekdayChips idPrefix={idPrefix} days={days} onChange={onDays} disabled={disabled} invalid={daysInvalid} />
          <div>
            <label htmlFor={`${idPrefix}-deystvuet-s`} className="block text-xs font-semibold text-slate-700 mb-1">Действует с</label>
            <DateInput
              id={`${idPrefix}-deystvuet-s`}
              value={validFrom}
              min={validFromBounds(today).min}
              max={validFromBounds(today).max}
              onChange={onValidFrom}
              disabled={disabled}
              className={SLOT_FIELD_CLASS}
            />
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{VALID_FROM_HINT}</p>
          </div>
        </>
      )}
    </>
  );
}
