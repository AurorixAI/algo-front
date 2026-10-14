"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ClipboardCheck, Loader2 } from "lucide-react";
import { orgApi, type OpenAttendanceAction } from "@/lib/api";
import { useExcuseBadge } from "@/lib/excuse-badge";
import {
  formatLessonDate,
  journalHref,
  openLessonKey,
  openLessonStatus,
  openLessonTime,
  sortOpenLessons,
} from "@/lib/open-lessons";

const CHIP_CLASS: Record<OpenAttendanceAction["actionType"], string> = {
  missed: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
};

/**
 * "Незакрытые уроки": lessons an administrator still has to close. The list is
 * read-only: closing happens in the group journal ("⋯" menu of the lesson), the
 * row only leads there, to the month of that lesson.
 */
export function OpenLessonsView({ groupsBasePath }: { groupsBasePath: string }) {
  const [items, setItems] = useState<OpenAttendanceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await orgApi.getOpenAttendanceActions();
      if (isCancelled()) return;
      const list = Array.isArray(data) ? data : [];
      setItems(sortOpenLessons(list));
      // The tab counter and the menu badge show what this very list holds.
      useExcuseBadge.getState().setOpenLessons(list.length);
    } catch (error) {
      if (isCancelled()) return;
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить уроки");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  // Fresh on every mount, so coming back from the journal shows the new state.
  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
        Загрузка…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="max-w-md text-sm font-medium text-rose-800">{loadError}</p>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-14 text-center">
        <ClipboardCheck className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Все уроки закрыты</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li
            key={openLessonKey(item)}
            className="flex flex-col gap-2 px-4 py-3.5 sm:px-5 md:grid md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-center md:gap-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 md:block">
              <p className="text-sm font-bold text-slate-900">{formatLessonDate(item.lessonDate)}</p>
              <p className="text-xs tabular-nums text-slate-400">{openLessonTime(item)}</p>
            </div>

            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-900">{item.groupName}</p>
              <p className="break-words text-xs text-slate-400">{item.teacherName || "—"}</p>
            </div>

            <div>
              <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${CHIP_CLASS[item.actionType]}`}>
                {openLessonStatus(item)}
              </span>
            </div>

            <Link
              href={journalHref(groupsBasePath, item)}
              className="text-sm font-semibold text-primary-700 hover:underline md:justify-self-end"
            >
              Открыть журнал
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
