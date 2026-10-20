"use client";

import { useId } from "react";
import { EXCUSE_REASON_MAX, EXCUSE_REASON_MIN } from "@/lib/attendance-excuses";

interface ExcuseReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Highlights the field after a failed save attempt. */
  invalid?: boolean;
  /** Reason already saved on the server for this mark (shown as a hint). */
  saved?: boolean;
}

/** One-line "Причина" input shown under a student marked "Ув." (teacher attendance dialogs). */
export function ExcuseReasonField({ value, onChange, invalid = false, saved = false }: ExcuseReasonFieldProps) {
  // One field per marked student on the same screen, so the id comes from useId, not from a constant.
  const inputId = useId();
  return (
    <div className="basis-full pt-2">
      <label htmlFor={inputId} className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
        <span>Причина{saved ? " (сохранена)" : ""}</span>
        <span className="font-medium text-slate-400">{value.trim().length}/{EXCUSE_REASON_MAX}</span>
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={EXCUSE_REASON_MAX}
        placeholder="Например: заболел, написал в Telegram"
        aria-invalid={invalid}
        aria-label={`Причина уважительного пропуска, не короче ${EXCUSE_REASON_MIN} символов`}
        className={`w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500/20 ${
          invalid ? "border-rose-400 ring-1 ring-rose-300" : "border-slate-200 focus:border-primary-500"
        }`}
      />
    </div>
  );
}
