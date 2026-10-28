"use client";

import { canLead } from "@/lib/staff-lifecycle";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { groupHref, queryWith, teacherHref, workspaceBases } from "@/lib/ia-links";
import { journalHref } from "@/lib/open-lessons";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { DEMO_MODE, orgApi, substitutionsApi } from "@/lib/api";
import { CHIP_BASE_CLASS } from "@/lib/chip-tone";
import { PHONE_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { createQueueGuard, afterDecision, readFailureOutcome, STALE_LIST_TEXT, STALE_LIST_TOAST_GAP_MS, createOncePer } from "@/lib/queue-guard";
import { useSubstitutionBadge } from "@/lib/substitution-badge";
import {
  EMPTY_TEXT,
  LOAD_ERROR_TEXT,
  PAGE_SIZE,
  applyFreshItem,
  batchSiblings,
  assignmentNotes,
  bulkToast,
  deadlineChips,
  decisionToast,
  expiringLine,
  itemLessonLine,
  lessonWhen,
  moreLessonsText,
  suggestedLine,
  tabLabel,
  type DeadlineChip,
} from "@/lib/substitutions";
import type { DecideBulkOut, DecideOut, SubstitutionItem } from "@/lib/substitution-types";
import { DecisionCell, OriginLine, ReasonCell } from "@/components/substitutions/journal-cells";
import { EmptyState, TableHeader, type CellAlign } from "@/components/attendance/table-chrome";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { useToast } from "@/components/ui/toast";
import { DecisionDialog } from "@/components/substitutions/decision-dialog";
import { BulkDialog, type BulkKind } from "@/components/substitutions/bulk-dialog";
import { Checkbox } from "@/components/ui/checkbox";

type Tab = "pending" | "decided";

/** Columns of the wide layout (cards below `xl`, as the other tables of the admin screens). */
const COLS_PENDING = "xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_190px_104px]";
const COLS_DECIDED = "xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1.3fr)]";

/** Урок and Причина (free text) left, Преподаватель, Срок and Решение centred, «Решить» right (see table-chrome). */
const PENDING_ALIGNS: CellAlign[] = ["left", "center", "left", "center", "right"];
const DECIDED_ALIGNS: CellAlign[] = ["left", "center", "left", "center"];

const CHIP_TONE: Record<DeadlineChip["tone"], string> = {
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  dark: "border-rose-800 bg-rose-800 text-white",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
};

/**
 * M2 (LOGIC-B2): «Замены» - the requests of teachers who cannot hold a lesson.  Waiting ones first (the lesson that already started, then the
 * nearest), each with «Решить»; a tick and the bulk panel decide several at once.  Decided ones keep who decided and what.  The menu counter
 * is re-read after every action.
 */
function SubstitutionsContent({ role }: { role: "owner" | "admin" }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const bases = workspaceBases(role);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams?.get("request") ?? null;
  const { showToast, toastNode } = useToast();

  // IA audit F34: «Решённые» is `?status=decided` (a link, a reload and «Назад» keep it)
  const [tab, setTab] = useState<Tab>(searchParams?.get("status") === "decided" ? "decided" : "pending");
  const [filter, setFilter] = useState({ teacherId: "", groupId: "" });
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<SubstitutionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [expiringTotal, setExpiringTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [dialogItem, setDialogItem] = useState<SubstitutionItem | null>(null);
  const [bulkKind, setBulkKind] = useState<BulkKind | null>(null);
  const [teachers, setTeachers] = useState<Array<{ id: string; first_name: string; last_name: string; full_name?: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; teacher_id: string }>>([]);

  const live = useRef({ items, total, pendingTotal, tab, page });
  live.current = { items, total, pendingTotal, tab, page };
  const staleToastGate = useRef(createOncePer(STALE_LIST_TOAST_GAP_MS));
  const loadRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const guardRef = useRef<ReturnType<typeof createQueueGuard> | null>(null);
  if (!guardRef.current) guardRef.current = createQueueGuard({ reload: () => { void loadRef.current(true); } });
  const guard = guardRef.current;

  const refreshBadge = () => { void useSubstitutionBadge.getState().refresh(true); };

  // search: a pause after the last key
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // the directory for the filter (teachers -> their groups)
  useEffect(() => {
    let cancelled = false;
    Promise.all([orgApi.listMembers(), orgApi.listGroups()])
      .then(([members, groupList]) => {
        if (cancelled) return;
        setTeachers((Array.isArray(members) ? members : [])
          .filter((member: any) => canLead(member.org_role))
          .map((member: any) => ({ id: member.user_id || member.id, first_name: member.first_name ?? "", last_name: member.last_name ?? "", full_name: member.full_name })));
        const list: any[] = Array.isArray(groupList) ? groupList : (groupList as any)?.items || [];
        setGroups(list.map((group) => ({ id: group.id, name: group.name, teacher_id: group.teacher_id })));
      })
      .catch(() => { /* the filter stays empty; the list still works */ });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (silent = false) => {
    const token = guard.begin();
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      const data = await substitutionsApi.list({
        status: tab,
        groupId: filter.groupId || undefined,
        teacherId: filter.groupId ? undefined : filter.teacherId || undefined,
        urgent: tab === "pending" && urgentOnly,
        search,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (!guard.accepts(token)) return;
      if ((data.items ?? []).length === 0 && page > 0) {
        setPage(Math.min(page - 1, Math.max(0, Math.ceil((data.total ?? 0) / PAGE_SIZE) - 1)));
        return;
      }
      setLoadError(null);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPendingTotal(data.pendingTotal ?? 0);
      setExpiringTotal(data.expiringTotal ?? 0);
      // a tick on a row that is gone from the list goes with it
      const ids = new Set((data.items ?? []).map((item) => item.id));
      setSelected((previous) => new Set(Array.from(previous).filter((id) => ids.has(id))));
      useSubstitutionBadge.getState().setSummary({ pendingTotal: data.pendingTotal, urgentTotal: data.urgentTotal, overdueTotal: useSubstitutionBadge.getState().overdue, expiringTotal: data.expiringTotal });
    } catch (failure) {
      if (!guard.accepts(token)) return;
      if (readFailureOutcome({ silent, rows: live.current.items.length }) === "keep-list") {
        if (staleToastGate.current()) showToast(STALE_LIST_TEXT, "warning");
        return;
      }
      setLoadError(LOAD_ERROR_TEXT);
    } finally {
      if (guard.accepts(token)) setLoading(false);
    }
  }, [tab, filter.groupId, filter.teacherId, urgentOnly, search, page, guard, showToast]);

  loadRef.current = load;
  useEffect(() => { void load(); }, [load]);

  // back to the window: others may have decided meanwhile
  useEffect(() => {
    const onFocus = () => guard.woke();
    const onVisible = () => { if (document.visibilityState === "visible") guard.woke(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      guard.cancel();
    };
  }, [guard]);

  // a link from a lesson («Ждёт замены») opens the request itself
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedId || openedFor.current === requestedId) return;
    openedFor.current = requestedId;
    substitutionsApi.detail(requestedId)
      .then((out) => {
        if (out.item.status === "pending") setDialogItem(out.item);
        else { setTab("decided"); showToast("Запрос уже решён", "warning"); }
      })
      .catch(() => showToast("Запрос на замену не найден", "error"));
  }, [requestedId, showToast]);

  const switchTab = (next: Tab) => {
    setTab(next);
    router.replace(queryWith(searchParams?.toString(), { status: next === "decided" ? "decided" : null }), { scroll: false });
    setPage(0);
    setSelected(new Set());
    if (next === "decided") setUrgentOnly(false);
  };

  /** The answer of a decision carries the fresh item: the row is patched in place (it leaves the waiting tab), the rest heals by a silent read. */
  const patchItem = (fresh: SubstitutionItem) => {
    guard.patched();
    setLoading(false);
    const next = applyFreshItem({ items: live.current.items, total: live.current.total, pendingTotal: live.current.pendingTotal }, fresh, live.current.tab);
    live.current = { ...live.current, ...next };
    setItems(next.items);
    setTotal(next.total);
    setPendingTotal(next.pendingTotal);
    setSelected((previous) => { const copy = new Set(previous); copy.delete(fresh.id); return copy; });
  };

  const decided = (out: DecideOut) => {
    // non-blocking notes of a move (the room is busy at that time) are shown, not hidden
    const notes = assignmentNotes(out.result ?? {});
    showToast(decisionToast(out), notes.length > 0 ? "warning" : "success", notes.length > 0 ? notes : undefined);
    setDialogItem(null);
    void afterDecision(() => patchItem(out.item), refreshBadge);
  };

  const stale = (fresh: SubstitutionItem) => { void afterDecision(() => patchItem(fresh), refreshBadge); };

  const bulkDone = (out: DecideBulkOut) => {
    const toast = bulkToast(out, items);
    showToast(toast.text, toast.type, toast.details.length ? toast.details : undefined);
    setBulkKind(null);
    setSelected(new Set());
    void afterDecision(() => { for (const fresh of out.items) patchItem(fresh); }, refreshBadge);
    void load(true);
  };

  const pendingTab = tab === "pending";
  const cols = pendingTab ? COLS_PENDING : COLS_DECIDED;
  const selectedItems = items.filter((item) => selected.has(item.id));
  const allSelected = pendingTab && items.length > 0 && selectedItems.length === items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "pending", label: tabLabel("pending", pendingTotal) },
    { key: "decided", label: tabLabel("decided", pendingTotal) },
  ];
  const toggle = (id: string, on: boolean) => setSelected((previous) => { const copy = new Set(previous); if (on) copy.add(id); else copy.delete(id); return copy; });
  const toggleExpanded = (id: string) => setExpanded((previous) => { const copy = new Set(previous); if (copy.has(id)) copy.delete(id); else copy.add(id); return copy; });

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Замены</h1>
        <p className="text-sm text-slate-500">Запросы преподавателей, которые не смогут провести урок, и переносы уроков</p>
      </div>

      {pendingTab && expiringLine(expiringTotal) && <p role="status" data-testid="expiring-note" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">{expiringLine(expiringTotal)}</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full items-center gap-2 lg:w-fit">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 lg:flex-none" role="tablist">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* below the wide table the «select all» lives beside the tabs (a phone keeps its first screen for the requests) */}
        {pendingTab && items.length > 0 && (
          <label data-testid="select-all-compact" className="flex shrink-0 cursor-pointer items-center gap-1.5 px-1 text-xs font-medium text-slate-500 xl:hidden" title="Выбрать все">
            <Checkbox aria-label="Выбрать все" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(items.map((item) => item.id)) : new Set())} />
            <span className="hidden sm:inline">Выбрать все</span>
          </label>
        )}
        </div>
        <div className="flex flex-nowrap items-center gap-2 sm:flex-wrap">
          <label className="relative block min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Группа или преподаватель</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={phone ? "Поиск" : "Группа или преподаватель"}
              aria-label="Группа или преподаватель"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 sm:w-64"
            />
          </label>
          {pendingTab && (
            <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Checkbox checked={urgentOnly} onChange={(event) => { setUrgentOnly(event.target.checked); setPage(0); }} />
              <span className="sm:hidden">Срочные</span><span className="hidden sm:inline">Только срочные</span>
            </label>
          )}
          <CascadingFilter iconOnPhone allLabel="Все группы и преподаватели" teachers={teachers} groups={groups} value={filter} onChange={(value) => { setFilter(value); setPage(0); }} />
        </div>
      </div>

      {pendingTab && selectedItems.length > 0 && (
        <div role="region" aria-label="Массовые действия" className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/60 px-3.5 py-2.5">
          <span className="mr-auto text-sm font-semibold text-primary-900">Выбрано: {selectedItems.length}</span>
          <button type="button" onClick={() => setBulkKind("substitute")} className="h-8 rounded-lg bg-primary-600 px-3 text-xs font-semibold text-white hover:bg-primary-700">Назначить замену</button>
          <button type="button" onClick={() => setBulkKind("cancel")} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">Отменить уроки</button>
          <button type="button" onClick={() => setBulkKind("reject")} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Отклонить</button>
          <button type="button" onClick={() => setSelected(new Set())} className="h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-white">Снять выбор</button>
        </div>
      )}

      <section className={!loading && !loadError && items.length > 0 ? "xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white" : ""}>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
            Загрузка…
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="max-w-md text-sm font-medium text-rose-800">{loadError}</p>
            <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={EMPTY_TEXT} hint={pendingTab ? "Когда преподаватель попросит замену, запрос появится здесь." : "Решённые запросы за последние 30 дней появятся здесь."} />
        ) : (
          <>
            <TableHeader
              show="xl"
              gridClass={cols}
              labels={pendingTab ? ["Урок", "Преподаватель", "Причина", "Срок", ""] : ["Урок", "Преподаватель", "Причина", "Решение"]}
              aligns={pendingTab ? PENDING_ALIGNS : DECIDED_ALIGNS}
            />
            {pendingTab && (
              <label className="hidden cursor-pointer items-center gap-2 px-1 text-xs font-medium text-slate-500 xl:flex xl:border-b xl:border-slate-100 xl:px-4 xl:py-2">
                <Checkbox checked={allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(items.map((item) => item.id)) : new Set())} />
                Выбрать все
              </label>
            )}
            <ul className="space-y-2.5 xl:space-y-0 xl:divide-y xl:divide-slate-100">
              {items.map((item) => {
                const siblings = batchSiblings(item, items);
                const chips = deadlineChips(item);
                const open = expanded.has(item.id);
                return (
                  <li key={item.id} className={`flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 xl:grid xl:items-start xl:gap-x-3 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 ${cols}`}>
                    {/* Урок */}
                    <div className="flex min-w-0 items-start gap-3">
                      {pendingTab && (
                        <Checkbox
                          aria-label={`Выбрать: ${item.group.name}, ${item.teacher.name}`}
                          className="mt-0.5"
                          checked={selected.has(item.id)}
                          onChange={(event) => toggle(item.id, event.target.checked)}
                        />
                      )}
                      <div className="min-w-0">
                        {/* IA audit F31: the group and the lesson are links (the journal of the group on that lesson), the teacher leads to his rate (owner) */}
                        <Link href={groupHref(bases.groups, item.group.id)} data-testid="substitution-group-link" className="block break-words text-sm font-semibold leading-5 text-slate-900 hover:text-primary-700 hover:underline">{item.group.name}</Link>
                        <p className="text-xs text-slate-500">
                          {lessonWhen(item.lesson.date, item.lesson.startTime, item.lesson.endTime)}
                          {item.lesson.lessonId && (
                            <>
                              <span aria-hidden> · </span>
                              <Link href={journalHref(bases.groups, { groupId: item.group.id, lessonDate: item.lesson.date, lessonId: item.lesson.lessonId })} data-testid="substitution-lesson-link" className="font-semibold text-primary-700 hover:underline">Открыть урок</Link>
                            </>
                          )}
                        </p>
                        {siblings.length > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {moreLessonsText(siblings.length)}{" "}
                            <button type="button" onClick={() => toggleExpanded(item.id)} aria-expanded={open} className="font-semibold text-primary-700 hover:underline">{open ? "Скрыть" : "Показать"}</button>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Преподаватель */}
                    <div className="min-w-0 text-xs text-slate-500 xl:text-center xl:text-sm">
                      {role === "owner" && item.teacher.id ? (
                        <Link href={teacherHref(item.teacher.id)} data-testid="substitution-teacher-link" className="block break-words font-medium text-slate-800 hover:text-primary-700 hover:underline">{item.teacher.name}</Link>
                      ) : (
                        <p className="break-words font-medium text-slate-800">{item.teacher.name}</p>
                      )}
                      <OriginLine item={item} />
                    </div>

                    {/* Причина */}
                    <div className="min-w-0">
                      <ReasonCell item={item} />
                      {pendingTab && suggestedLine(item) && <p className="mt-1 text-xs text-slate-500">{suggestedLine(item)}</p>}
                    </div>

                    {/* Срок / Решение */}
                    {pendingTab ? (
                      <div className="flex min-w-0 flex-wrap gap-1.5 xl:justify-center">
                        {chips.map((chip) => (
                          <span key={chip.text} className={`${CHIP_BASE_CLASS} ${CHIP_TONE[chip.tone]}`}>{chip.text}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="min-w-0 xl:text-center">
                        <DecisionCell item={item} />
                      </div>
                    )}

                    {/* Действие */}
                    {pendingTab && (
                      <div className="flex items-center justify-end xl:-my-1.5">
                        <button
                          type="button"
                          onClick={() => setDialogItem(item)}
                          aria-label={`Решить: ${item.group.name}, ${item.teacher.name}`}
                          className="h-8 w-full rounded-lg bg-primary-600 px-4 text-xs font-semibold text-white hover:bg-primary-700 xl:w-auto"
                        >
                          Решить
                        </button>
                      </div>
                    )}

                    {open && siblings.length > 0 && (
                      <ul className="mt-1 space-y-1 rounded-lg bg-slate-50 px-3 py-2 xl:col-span-full">
                        {siblings.map((sibling) => (
                          <li key={sibling.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                            <span>{itemLessonLine(sibling)}</span>
                            {sibling.status === "pending" && <button type="button" onClick={() => setDialogItem(sibling)} className="font-semibold text-primary-700 hover:underline">Решить</button>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {!loading && !loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Всего: {total}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} aria-label="Предыдущая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span>{page + 1} из {pageCount}</span>
            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)} aria-label="Следующая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <DecisionDialog
        item={dialogItem}
        role={role}
        onClose={() => { setDialogItem(null); if (requestedId) { openedFor.current = null; router.replace(`/${role}/substitutions`, { scroll: false }); } }}
        onDecided={decided}
        onStale={stale}
      />
      <BulkDialog kind={bulkKind} items={selectedItems} role={role} onClose={() => setBulkKind(null)} onDone={bulkDone} />
      {toastNode}
    </div>
  );
}

/** "Замены" for the owner and the administrator; the demo build has no such section. */
export function SubstitutionsPage({ role }: { role: "owner" | "admin" }) {
  if (DEMO_MODE) {
    return <EmptyState icon={CheckCircle2} title="Раздел недоступен в демо-версии" />;
  }
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <SubstitutionsContent role={role} />
    </Suspense>
  );
}
