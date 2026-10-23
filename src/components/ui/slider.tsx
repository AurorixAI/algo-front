"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type CSSProperties, type InputHTMLAttributes } from "react";

const TONES = {
  primary: "#2563eb",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max" | "step" | "defaultValue"> {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** The colour of the filled part and the thumb's rim (default: the primary colour). */
  tone?: keyof typeof TONES;
}

/**
 * The slider of the platform (a range of numbers where the exact value matters less than the feel: questions in a variant, the share of
 * hard tasks).  The track is filled up to the thumb in the primary colour (or a tone), the thumb is a white round handle with a coloured rim and a
 * focus halo; the keyboard (arrows, Home, End, PageUp / PageDown) and the touch drag stay the browser's own.
 * A number that must be typed exactly is a {@link NumberInput}, not a slider.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { value, onChange, min, max, step = 1, tone = "primary", className, style, ...rest },
  ref,
) {
  const span = max - min;
  const fill = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  return (
    <input
      {...rest}
      ref={ref}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={cn("ui-slider", className)}
      style={{ "--slider-color": TONES[tone], "--slider-fill": `${fill}%`, ...style } as CSSProperties}
    />
  );
});
