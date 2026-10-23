"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

/**
 * The file picker of the platform: the native `<input type="file">` is never shown (the browser's grey «Choose file» button looks
 * different on every system).  It is only visually hidden and not a tab stop; the visible control is OUR button («Загрузить файл»,
 * a row's «Прикрепить», a dropzone) that calls `ref.current?.click()`, and the chosen file is shown by the screen (its name in a
 * list or a card, with a remove action).  `setInputFiles` in tests and the screen reader still reach the input by its test id / label.
 */
export const FileInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function FileInput(
  { className, tabIndex = -1, ...props },
  ref,
) {
  return <input {...props} ref={ref} type="file" tabIndex={tabIndex} className={cn("sr-only", className)} />;
});
