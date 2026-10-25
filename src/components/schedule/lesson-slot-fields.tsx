"use client";

import type { ReactNode } from "react";
import { Select } from "@/components/ui/select";
import { TimeInput } from "@/components/ui/time-input";
import { ROOM_LABEL, ROOM_PLACEHOLDER } from "@/lib/schedule-slots";
import {
  COLOR_CLASSES, COLOR_NAMES, DAYS, FORMAT_OPTIONS, LESSON_COLORS, endTimeAfter,
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
      placeholder="Выберите день недели"
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
  const setStart = (startTime: string) => {
    const endTime = endTimeAfter(startTime);
    onChange(endTime ? { startTime, endTime } : { startTime });
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
          <TimeInput id={`${idPrefix}-okonchanie`} value={value.endTime} onChange={(endTime) => onChange({ endTime })} required disabled={disabled} invalid={endInvalid} className={SLOT_FIELD_CLASS} />
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
