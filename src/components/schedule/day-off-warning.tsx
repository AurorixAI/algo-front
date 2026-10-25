"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { dayOffWarning, type DayOffOut } from "@/lib/payf";

/**
 * PAY-F, part 2: «Это выходной день центра» under the date of a new one-off lesson.  A warning, never a block (the server accepts the lesson); nothing while the date is not
 * a day off, while it loads, or when the question cannot be asked (the hint is not worth an error).
 */
export function DayOffWarning({ date }: { date: string }) {
  const [day, setDay] = useState<Pick<DayOffOut, "reason"> | null>(null);

  useEffect(() => {
    setDay(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
    let cancelled = false;
    orgApi.dayOffForDate(date)
      .then((answer) => { if (!cancelled) setDay(answer.dayOff); })
      .catch(() => { if (!cancelled) setDay(null); });
    return () => { cancelled = true; };
  }, [date]);

  const text = dayOffWarning(day);
  if (!text) return null;
  return (
    <p role="status" data-testid="day-off-warning" className="mt-1.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
