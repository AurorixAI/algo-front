"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { Select } from "@/components/ui/select";
import { TimeInput } from "@/components/ui/time-input";
import { DateInput } from "@/components/ui/date-input";
import { formatBusinessDate } from "@/lib/business-time";
import { ROOM_LABEL, ROOM_PLACEHOLDER, VALID_FROM_HINT, validFromBounds } from "@/lib/schedule-slots";
import {
  COLOR_CLASSES, COLOR_NAMES, DAYS, DAYS_REQUIRED_HINT, FORMAT_OPTIONS, LESSON_COLORS, endTimeAfter, toggleDay,
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

/** «День недели»: a select of the seven days (`value` null = nothing chosen yet, the field then asks to choose). */
export function WeekdayField({ id, value, onChange, disabled, invalid = false }: {
  id: string;
  value: number | null;
  onChange: (day: number) => void;
  disabled?: boolean;
  /** The form asked for a day and none is chosen. */
  invalid?: boolean;
}) {
  return (
    <Select
      id={id}
      value={value ? String(value) : ""}
      placeholder="Выберите день"
      onChange={(event) => onChange(Number(event.target.value))}
      options={DAYS.map((day) => ({ value: String(day.id), label: day.name }))}
      buttonClassName="px-3 py-2 text-xs"
      disabled={disabled}
      invalid={invalid}
    />
  );
}

/**
 * Time range, format and room, topic and colour of a weekly lesson - the fields the teacher's «Добавить урок» and «Изменить постоянное
 * расписание» always had, now also the owner's and the administrator's (group page).  `idPrefix` keeps the ids of the fields
 * (`<prefix>-nachalo`, `-okonchanie`, `-format`, `-auditoriya`, `-tema-zanyatiya`, `-color-label`).  A new start time moves the end 90 minutes after it.
 */
export function LessonSlotFields({ idPrefix, value, onChange, afterTopic, disabled = false, endInvalid = false }: {
  idPrefix: string;
  value: SlotFormValue;
  onChange: (patch: Partial<SlotFormValue>) => void;
  /** Rendered between the topic and the colour (the edit dialog's «Причина изменения»). */
  afterTopic?: ReactNode;
  disabled?: boolean;
  endInvalid?: boolean;
}) {
  // The end follows the start (+90 min) only while nobody has typed an end of his own: a typed or pasted end is never overwritten.
  const endTyped = useRef(false);
  const setStart = (startTime: string) => {
    if (startTime === value.startTime) return;
    const endTime = endTimeAfter(startTime);
    onChange(endTime && !endTyped.current ? { startTime, endTime } : { startTime });
  };
  const setEnd = (endTime: string) => {
    // clearing the end gives the start its say again
    endTyped.current = endTime !== "";
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

      {afterTopic}

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
export function WeekdayChips({ idPrefix, days, onChange, disabled = false, invalid = false }: {
  idPrefix: string;
  days: readonly number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div>
      <span id={`${idPrefix}-days-label`} className="block text-xs font-semibold text-slate-700 mb-1.5">Дни недели</span>
      <div role="group" aria-labelledby={`${idPrefix}-days-label`} className="flex flex-wrap gap-1.5">
        {DAYS.map((day) => {
          const on = days.includes(day.id);
          return (
            <button
              key={day.id}
              type="button"
              aria-pressed={on}
              aria-label={day.name}
              title={day.name}
              disabled={disabled}
              onClick={() => onChange(toggleDay(days, day.id))}
              className={`h-9 min-w-[2.5rem] rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                on ? "border-primary-500 bg-primary-600 text-white shadow-xs" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {day.short}
            </button>
          );
        })}
      </div>
      {days.length === 0 ? (
        <p data-testid={`${idPrefix}-days-hint`} className={`mt-1 text-[11px] leading-4 ${invalid ? "font-semibold text-rose-600" : "text-slate-500"}`}>{DAYS_REQUIRED_HINT}</p>
      ) : (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">Урок будет повторяться в эти дни каждую неделю.</p>
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
