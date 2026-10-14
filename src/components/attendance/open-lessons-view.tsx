"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Ban, ClipboardCheck, Loader2, NotebookPen } from "lucide-react";
import { orgApi, type OpenAttendanceAction } from "@/lib/api";
import { formatDateRu } from "@/lib/attendance-excuses";
import { useExcuseBadge } from "@/lib/excuse-badge";
import {
  formatLessonDate,
  groupOpenLessonsByTeacher,
  journalHref,
  openLessonKey,
  openLessonStatus,
  openLessonStatusHint,
  openLessonTime,
  shouldRefetchForBadge,
} from "@/lib/open-lessons";
import { createRequestSequence } from "@/lib/request-sequence";
import { CancelMissedLessonModal, type CancelMissedTarget } from "@/components/attendance/cancel-missed-lesson-modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";

/** Calm chips: only a started-but-unfinished lesson gets a subtle amber. */
const CHIP_CLASS: Record<OpenAttendanceAction["actionType"], string> = {
  missed: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
};

/** Focus and visibility events fire together; one re-read is enough. */
const FOCUS_REFETCH_GAP_MS = 1500;

/**
 * "Незакрытые уроки": lessons an administrator still has to close, grouped by teacher.
 * The only action of a row is its «⋯» menu: open the journal at that lesson, or (for a lesson that
 * was never started) close it as «Урока не было». The list is re-read when the window gets focus
 * again, after every action, and when the menu badge disagrees with it.
 */
export function OpenLessonsView({ groupsBasePath }: { groupsBasePath: string }) {
  const router = useRouter();
  const { showToast, toastNode } = useToast();
  const [items, setItems] = useState<OpenAttendanceAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  // True while any list request is running: the badge-mismatch rule waits for it to finish.
  const [refreshing, setRefreshing] = useState(false);
  const loadedRef = useRef(false);
  const refreshingRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelMissedTarget | null>(null);
  const sequence = useMemo(() => createRequestSequence(), []);
  const mountedRef = useRef(true);
  const lastStartedAtRef = useRef(0);
  // The badge value we already re-read the list for: one refetch per change, never a loop.
  const handledBadgeRef = useRef<number | null>(null);
  const badgeCount = useExcuseBadge((state) => state.openLessons);

  /**
   * `silent`: keep the list on screen (no spinner, a failed re-read keeps the old rows).
   * Counters (tab, menu badge) come from the summary: re-read it together with the list, so the two
   * are applied at the same moment and never disagree because of the order of the responses.
   */
  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const token = sequence.next();
    lastStartedAtRef.current = Date.now();
    // Before the first successful load nothing is on screen to keep: show the spinner / the error.
    const quiet = silent && loadedRef.current;
    refreshingRef.current = true;
    setRefreshing(true);
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [data] = await Promise.all([
        orgApi.getOpenAttendanceActions(),
        useExcuseBadge.getState().refresh(true),
      ]);
      if (!mountedRef.current || !sequence.isCurrent(token)) return;
      setItems(Array.isArray(data) ? data : []);
      loadedRef.current = true;
      setLoaded(true);
      setLoadError(null);
    } catch (error) {
      if (!mountedRef.current || !sequence.isCurrent(token)) return;
      if (!quiet) setLoadError(error instanceof Error ? error.message : "Не удалось загрузить уроки");
    } finally {
      if (mountedRef.current && sequence.isCurrent(token)) {
        refreshingRef.current = false;
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [sequence]);

  // Fresh on every mount, so coming back from the journal shows the new state.
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  // Coming back to the tab / window (the journal was used elsewhere): re-read without a spinner.
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === "hidden") return;
      if (refreshingRef.current || Date.now() - lastStartedAtRef.current < FOCUS_REFETCH_GAP_MS) return;
      void load({ silent: true });
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", refetch);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", refetch);
    };
  }, [load]);

  // The badge (polled by the layout) knows a different number than the list shows: the list is stale.
  // Judged only between loads (the badge is applied a moment before the list inside a load), so one
  // focus is one list request and one summary request.
  useEffect(() => {
    if (refreshing) return;
    if (badgeCount === items.length) {
      handledBadgeRef.current = null;
      return;
    }
    if (!shouldRefetchForBadge(loaded, badgeCount, items.length, handledBadgeRef.current)) return;
    handledBadgeRef.current = badgeCount;
    void load({ silent: true });
  }, [badgeCount, items.length, loaded, refreshing, load]);

  const groups = useMemo(() => groupOpenLessonsByTeacher(items), [items]);

  const menuItemsOf = (item: OpenAttendanceAction): RowMenuItem[] => {
    const href = journalHref(groupsBasePath, item);
    if (item.actionType === "in_progress") {
      // Finishing needs the roster: only the journal can do it.
      return [{ key: "open", label: "Открыть в журнале", icon: NotebookPen, onSelect: () => router.push(href) }];
    }
    return [
      { key: "mark", label: "Отметить в журнале", icon: NotebookPen, onSelect: () => router.push(href) },
      {
        key: "cancel",
        label: "Урока не было",
        icon: Ban,
        onSelect: () => setCancelTarget({ groupId: item.groupId, lessonId: item.lessonId, lessonDate: item.lessonDate }),
      },
    ];
  };

  const onCancelled = async (done: CancelMissedTarget) => {
    // The row goes away at once; the re-read confirms it and refreshes the badge
    // (the badge catches up by itself, so it must not trigger a second re-read).
    handledBadgeRef.current = useExcuseBadge.getState().openLessons;
    setItems((previous) => previous.filter((row) => !(
      row.actionType === "missed" && row.groupId === done.groupId && row.lessonId === done.lessonId && row.lessonDate === done.lessonDate
    )));
    showToast(`Урок ${formatDateRu(done.lessonDate)} отмечен как не состоявшийся`);
    await load({ silent: true });
  };

  if (loading && !loaded) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" aria-hidden="true" />
        <span className="sr-only">Загрузка уроков</span>
        <span aria-hidden="true">Загрузка…</span>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="max-w-md text-sm font-medium text-rose-800">{loadError ?? "Не удалось загрузить уроки"}</p>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
      </div>
    );
  }

  return (
    <>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-14 text-center">
          <ClipboardCheck className="h-6 w-6 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Все уроки закрыты</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {groups.map((group, index) => (
            <div key={group.key} className={index > 0 ? "border-t border-slate-100" : undefined}>
              <p className="px-4 pb-1 pt-4 text-xs font-semibold text-slate-500 sm:px-5">
                {group.teacherName} · {group.items.length}
              </p>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <li
                    key={openLessonKey(item)}
                    className="relative flex flex-col gap-2 py-3 pl-4 pr-14 sm:pl-5 md:grid md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-center md:gap-4 md:pr-5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 md:block">
                      <p className="text-sm font-bold text-slate-900">{formatLessonDate(item.lessonDate)}</p>
                      <p className="text-xs tabular-nums text-slate-400">{openLessonTime(item)}</p>
                    </div>

                    <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{item.groupName}</p>

                    <div>
                      <span
                        title={openLessonStatusHint(item)}
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${CHIP_CLASS[item.actionType]}`}
                      >
                        {openLessonStatus(item)}
                      </span>
                    </div>

                    <div className="absolute right-3 top-2.5 md:static md:justify-self-end">
                      <RowMenu
                        items={menuItemsOf(item)}
                        label={`Действия: ${item.groupName}, ${formatLessonDate(item.lessonDate)}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <CancelMissedLessonModal target={cancelTarget} onClose={() => setCancelTarget(null)} onCancelled={onCancelled} />
      {toastNode}
    </>
  );
}
