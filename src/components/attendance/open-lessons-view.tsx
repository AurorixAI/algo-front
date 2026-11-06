"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Ban, ClipboardCheck, Info, Loader2 } from "lucide-react";
import { orgApi, type OpenActionsByMonth, type OpenAttendanceAction } from "@/lib/api";
import { CHIP_BASE_CLASS, CHIP_TONE_CLASS, type ChipTone } from "@/lib/chip-tone";
import { useExcuseBadge } from "@/lib/excuse-badge";
import {
  formatLessonDate,
  groupOpenLessonsByTeacher,
  journalHref,
  monthCountsText,
  monthHeading,
  canMarkOpenLesson,
  OPEN_LESSONS_NO_RIGHT_NOTICE,
  showsStatusColumn,
  openLessonsOf,
  sinceLine,
  withoutOpenLessons,
  openLessonActionLabel,
  openLessonKey,
  openLessonStatus,
  openLessonStatusHint,
  shouldRefetchForBadge,
} from "@/lib/open-lessons";
import { createRequestSequence } from "@/lib/request-sequence";
import { EmptyState, TableHeader } from "@/components/attendance/table-chrome";
import { CancelMissedLessonModal, type CancelMissedTarget } from "@/components/attendance/cancel-missed-lesson-modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/lib/store";
import { canManageMoney } from "@/lib/money-effects";
import { formatBusinessDate, formatLessonWhen, formatWeekdayDate } from "@/lib/business-time";
import { openLessonAccess } from "@/lib/attendance-ops";
import { LESSON_TOO_OLD_TEXT } from "@/lib/ops-errors";
import { cancelLessonLabel } from "@/lib/schedule-card-actions";
import { SUBSTITUTE_BADGE } from "@/lib/lesson-teacher";

/** Calm chips (the palette and the size of the «Пропуски» tab): only a started-but-unfinished lesson gets a subtle amber. */
const CHIP_TONE: Record<OpenAttendanceAction["actionType"], ChipTone> = {
  missed: "neutral",
  in_progress: "warn",
};

/**
 * Columns of the wide layout, from 1024 px (the sidebar leaves 784 px; at a tablet the four columns would squeeze the text).
 * The header and every row share the template, the padding and the gap, so a header and its cells have
 * one left edge, and cells are top-aligned like in «Пропуски».  Below `lg` a row is a card.
 */
const COLS_WITH_STATUS = "lg:grid-cols-[250px_minmax(0,1fr)_minmax(0,1fr)_152px]";
/** UX pack №17: no column of a status that is the same in every row. */
const COLS_NO_STATUS = "lg:grid-cols-[250px_minmax(0,1fr)_152px]";
// Action cell: the primary button has one fixed width (the same for «Открыть» and «Отметить») and the «⋯» slot is always reserved; 40 px on a phone (UX pack rule 6), 32 from `lg`.
const ACTION_BUTTON_CLASS = "inline-flex h-10 w-[96px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-primary-600 bg-primary-600 px-2 text-xs font-semibold text-white hover:bg-primary-700 lg:h-8 lg:w-[88px]";
const MENU_SLOT_CLASS = "flex h-10 w-10 shrink-0 items-center justify-center lg:h-8 lg:w-8";
const MENU_TRIGGER_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 lg:h-8 lg:w-8";

/** Focus and visibility events fire together; one re-read is enough. */
const FOCUS_REFETCH_GAP_MS = 1500;

/**
 * "Уроки без отметки": lessons an administrator still has to close, grouped by teacher.
 * The only action of a row is its «⋯» menu: open the journal at that lesson, or (for a lesson that
 * was never started) close it as «Урока не было». The list is re-read when the window gets focus
 * again, after every action, and when the menu badge disagrees with it.
 */
export function OpenLessonsView({ groupsBasePath }: { groupsBasePath: string }) {
  const { showToast, toastNode } = useToast();
  const role = useAuthStore((state) => state.user?.org_role ?? null);
  // R3 #14 / m14: «Отметить» a lesson nobody started formalises the pay of a teacher afterwards - the money right (an administrator without it still has «Урока не было» in the menu)
  const moneyRight = canManageMoney(useAuthStore((state) => state.user));
  const today = formatBusinessDate();
  /** R3 #2: the lessons by month (the oldest month first), with the day the list starts from. */
  const [byMonth, setByMonth] = useState<OpenActionsByMonth | null>(null);
  const items = useMemo(() => openLessonsOf(byMonth), [byMonth]);
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
        orgApi.getOpenAttendanceActionsByMonth(),
        useExcuseBadge.getState().refresh(true),
      ]);
      if (!mountedRef.current || !sequence.isCurrent(token)) return;
      setByMonth(data && Array.isArray(data.months) ? data : { total: 0, since: "", months: [] });
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

  const months = useMemo(() => (byMonth?.months ?? []).map((month) => ({ month, groups: groupOpenLessonsByTeacher(month.items) })), [byMonth]);
  // UX pack №17: the column of the status only when the lessons differ; №7: an administrator without the money right gets ONE plaque over the list instead of a line in every row
  const withStatus = showsStatusColumn(items);
  const COLS = withStatus ? COLS_WITH_STATUS : COLS_NO_STATUS;
  const noRightNotice = role === "admin" && !moneyRight && items.some((item) => !canMarkOpenLesson(item, role, moneyRight));

  // IA audit F5: the main action of this screen is a BUTTON of the row («Отметить» / «Открыть»); the menu keeps the rare one - «Урока не было»
  // (a lesson in progress has none: it is finished in the journal).
  const menuItemsOf = (item: OpenAttendanceAction): RowMenuItem[] => {
    if (item.actionType === "in_progress") return [];
    return [
      {
        key: "cancel",
        label: cancelLessonLabel(true),
        icon: Ban,
        onSelect: () => setCancelTarget({ groupId: item.groupId, lessonId: item.lessonId, lessonDate: item.lessonDate }),
      },
    ];
  };

  const onCancelled = async (done: CancelMissedTarget, notes: string[]) => {
    // The row goes away at once; the re-read confirms it and refreshes the badge
    // (the badge catches up by itself, so it must not trigger a second re-read).
    handledBadgeRef.current = useExcuseBadge.getState().openLessons;
    setByMonth((previous) => (previous ? withoutOpenLessons(previous, (row) => (
      row.actionType === "missed" && row.groupId === done.groupId && row.lessonId === done.lessonId && row.lessonDate === done.lessonDate
    )) : previous));
    showToast(`Урок ${formatWeekdayDate(done.lessonDate)} отмечен как не состоявшийся`, notes.length ? "warning" : "success", notes);
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
        <EmptyState icon={ClipboardCheck} title="Все уроки закрыты" hint="Уроки, по которым не отмечена посещаемость или журнал не завершён, появятся здесь." />
      ) : (
        <section className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
          {noRightNotice && (
            <p role="note" data-testid="open-lessons-no-right" className="mb-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 lg:mx-4 lg:mt-3">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><span>{OPEN_LESSONS_NO_RIGHT_NOTICE}</span>
            </p>
          )}
          {sinceLine(byMonth?.since) && <p data-testid="open-since" className="px-1 pb-2 text-xs text-slate-600 lg:px-4 lg:pt-3">{sinceLine(byMonth?.since)}</p>}
          <TableHeader show="lg" gridClass={COLS} labels={withStatus ? ["Урок", "Группа", "Статус", ""] : ["Урок", "Группа", ""]} aligns={withStatus ? ["left", "left", "center", "right"] : ["left", "left", "right"]} />
          {months.map(({ month, groups }) => (
            <div key={month.month} data-testid="open-month" className="mt-6 first:mt-0 lg:mt-0">
              <h3 className="flex flex-wrap items-baseline gap-x-2 px-1 pb-1.5 text-sm font-bold text-slate-900 lg:border-t lg:border-slate-200 lg:bg-slate-100/80 lg:px-4 lg:py-2">
                <span>{monthHeading(month)}</span>
                {monthCountsText(month) && <span className="text-xs font-medium text-slate-500">{monthCountsText(month)}</span>}
              </h3>
          {groups.map((group) => (
            <div key={group.key} className="mt-5 first:mt-0 lg:mt-0 lg:border-t lg:border-slate-100 lg:first:border-t-0">
              <p className="mb-2 flex items-baseline gap-1.5 px-1 text-xs font-semibold text-slate-600 lg:mb-0 lg:bg-slate-50/70 lg:px-4 lg:py-2">
                <span className="min-w-0 break-words">{group.teacherName}</span>
                <span className="font-medium text-slate-500">· {group.items.length}</span>
              </p>
              <ul className="space-y-2.5 lg:space-y-0 lg:divide-y lg:divide-slate-100 lg:border-t lg:border-slate-100">
                {group.items.map((item) => {
                  // decision 7: older than 7 days and the viewer is not a manager - grey, no buttons, «Обратитесь к администратору»
                  const access = openLessonAccess(item, role, today);
                  return (
                  <li
                    key={openLessonKey(item)}
                    aria-disabled={access.locked || undefined}
                    className={`relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 lg:grid lg:items-start lg:gap-x-3 lg:gap-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-3 ${COLS} ${access.locked ? "bg-slate-50 text-slate-500" : ""}`}
                  >
                    {/* re-audit С14 / Н6: ONE form of the lesson «чт, 22 октября · 18:00–19:00», to the left like the group */}
                    <p className="text-sm font-semibold leading-5 tabular-nums text-slate-900" data-testid="open-lesson-when">{formatLessonWhen({ date: item.lessonDate, startTime: item.startTime, endTime: item.endTime })}</p>

                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 break-words text-sm font-medium leading-5 text-slate-900">
                      <span className="min-w-0">{item.groupName}</span>
                      {item.isSubstitution && <span className="inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800">{SUBSTITUTE_BADGE}</span>}
                    </p>

                    {withStatus && (
                      <div className="flex min-w-0 lg:-my-px lg:justify-center">
                        <span
                          title={openLessonStatusHint(item)}
                          className={`${CHIP_BASE_CLASS} ${CHIP_TONE_CLASS[CHIP_TONE[item.actionType]]}`}
                        >
                          {openLessonStatus(item)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 lg:-my-1.5 lg:justify-self-end">
                      {access.locked ? (
                        <p className="max-w-[160px] text-right text-[11px] font-medium leading-4 text-slate-500" title={LESSON_TOO_OLD_TEXT}>{access.hint}</p>
                      ) : (
                        <>
                          {canMarkOpenLesson(item, role, moneyRight) ? <Link
                            href={journalHref(groupsBasePath, item)}
                            data-testid="open-lesson-action"
                            aria-label={`${openLessonActionLabel(item)}: ${item.groupName}, ${formatLessonDate(item.lessonDate)}`}
                            className={ACTION_BUTTON_CLASS}
                          >
                            {openLessonActionLabel(item)}
                          </Link> : null}
                          {/* The «⋯» slot is always reserved: the menu when the row has actions, otherwise an invisible spacer of the same size,
                              so the primary buttons of all rows stand in one column. */}
                          <div className={MENU_SLOT_CLASS} data-testid="open-lesson-menu-slot">
                            {menuItemsOf(item).length > 0 ? (
                              <RowMenu
                                items={menuItemsOf(item)}
                                label={`Действия: ${item.groupName}, ${formatLessonDate(item.lessonDate)}`}
                                triggerClassName={MENU_TRIGGER_CLASS}
                              />
                            ) : (
                              <span aria-hidden="true" data-testid="open-lesson-menu-placeholder" className="invisible block h-10 w-10 lg:h-8 lg:w-8" />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          ))}
            </div>
          ))}
        </section>
      )}

      <CancelMissedLessonModal target={cancelTarget} onClose={() => setCancelTarget(null)} onCancelled={onCancelled} />
      {toastNode}
    </>
  );
}
