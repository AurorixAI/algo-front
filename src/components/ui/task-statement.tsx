"use client";

import { MathRenderer } from "./math-renderer";
import { pickTaskDisplayProjection, type TaskDisplayFields } from "@/lib/task-display";

/** Keep the canonical source and its render mode together in task previews. */
export function TaskStatement({ task, className, fallbackText }: {
  task: TaskDisplayFields;
  className?: string;
  fallbackText?: string;
}) {
  const display = pickTaskDisplayProjection(task);
  return <MathRenderer text={display.text || fallbackText || ""} renderMode={display.renderMode} block className={className} />;
}
