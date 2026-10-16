"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { DEMO_MODE, orgApi } from "@/lib/api";
import { Users, Search, Brain, GraduationCap, Folder, Check, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { GroupCard } from "@/components/groups/group-card";
import { ImportButton } from "@/components/import/import-button";
import { createRequestSequence } from "@/lib/request-sequence";
import {
  STUDENT_TABS, availableStudentTabs, parseStudentTab, studentTabCounts, studentTabHref, studentTabQuery, studentTabLabel, studentsSubtitle, extraGroupsLabel, studentCardMeta,
  type StudentTab, type StudentTabCounts,
} from "@/lib/students-tabs";
import { telHref } from "@/lib/phone";
import { studentGroupId, studentHasGroup } from "@/lib/student-status";
import { isArchivedStatus } from "@/lib/student-archive";

interface StudentInfo {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  class_level: number;
  status: string;
  display_id?: string | null;
  group_id?: string | null;
  /** Active memberships in live groups, when the list API exposes it (older servers do not): the column shows «ещё N». */
  groups_count?: number | null;
  /** The group the student is in now (from the memberships). */
  current_group_id?: string | null;
  student_phone?: string;
  comment?: string;
  created_at: string | null;
}

const PAGE_SIZE = 50;

// The demo has no archive (its handlers ignore status=archived): that tab is not offered there.
const OFFERED_TABS = availableStudentTabs(DEMO_MODE);

/**
 * The «Ученики» list, shared by /admin/students and /owner/students: links stay in the
 * workspace the user is in (the owner keeps the owner menu and its highlight).
 * The list reads `?tab=` (the archive is `?tab=archived`), so it needs a Suspense boundary above it.
 */
export function StudentsListView(props: { workspace?: "admin" | "owner" }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>}>
      <StudentsListContent {...props} />
    </Suspense>
  );
}

function StudentsListContent({ workspace = "admin" }: { workspace?: "admin" | "owner" }) {
  const base = `/${workspace}`;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  // A tab / search / page change: the old rows are hidden at once, never shown under the new tab.
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [filterGroup, setFilterGroup] = useState<string>("");
  const [teachers, setTeachers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // «В группах» is the default; «Без группы» lists the students nobody has put into a group yet;
  // «Архив» lists the students who left the center. The tab lives in the address (`?tab=`), so a
  // reload, a link and "Back" from a student's card keep it.
  const tab: StudentTab = parseStudentTab(searchParams?.get("tab"), OFFERED_TABS);
  const setTab = (next: StudentTab) => {
    if (next === tab) return;
    router.replace(studentTabHref(pathname || `${base}/students`, next), { scroll: false });
  };
  const [counts, setCounts] = useState<StudentTabCounts>({ grouped: null, ungrouped: null, archived: null });
  // Latest-request-wins: a slow answer for the previous tab / search must not replace the current list.
  const [listSeq] = useState(() => createRequestSequence());

  const handleCopyId = (displayId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(displayId);
    setCopiedId(displayId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // "Back" / a link can change the tab without a click: the page number of the old list means nothing.
  useEffect(() => { setPage(0); }, [tab]);

  // Search is debounced and resets paging.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadDirectories = useCallback(async () => {
    try {
      const [membersData, groupsData] = await Promise.all([orgApi.listMembers(), orgApi.listGroups()]);
      setTeachers(Array.isArray(membersData) ? membersData.filter((m: any) => m.org_role === "teacher") : []);
      setGroups(Array.isArray(groupsData) ? groupsData : (groupsData as any)?.items || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // A chosen group means «in a group», whatever tab was open.
  const activeTab: StudentTab = filterGroup ? "grouped" : tab;

  // Server-side paging: only the current page is fetched; `total` is the exact size of the
  // filtered set. Archived students are in neither live tab (the dashboard total leaves them out
  // too), so «В группах» + «Без группы» add up to the dashboard «Всего учеников»; «Архив» is a
  // list of its own (`status=archived`). The other tabs' counts come from one-row requests with
  // the same search.
  const loadStudents = useCallback(async () => {
    const token = listSeq.next();
    setRefreshing(true);
    setListError(null);
    try {
      const search = debouncedSearch || undefined;
      const otherTabs = filterGroup ? [] : OFFERED_TABS.filter((value) => value !== activeTab);
      const [data, otherPages] = await Promise.all([
        orgApi.listStudentsPage({
          ...studentTabQuery(activeTab, search),
          group_id: filterGroup || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        Promise.all(otherTabs.map((value) =>
          orgApi.listStudentsPage({ ...studentTabQuery(value, search), limit: 1 }).catch(() => null))),
      ]);
      if (!listSeq.isCurrent(token)) return;
      setStudents(data.items as StudentInfo[]);
      setTotal(data.total);
      const otherTotals: Partial<Record<StudentTab, number | null>> = {};
      otherTabs.forEach((value, index) => { otherTotals[value] = otherPages[index] ? otherPages[index]!.total : null; });
      setCounts(filterGroup
        ? { grouped: data.total, ungrouped: null, archived: null }
        : studentTabCounts(activeTab, data.total, otherTotals));
    } catch (e) {
      console.error(e);
      if (!listSeq.isCurrent(token)) return;
      // Never leave the rows of another tab on screen under an error.
      setStudents([]);
      setTotal(0);
      setCounts({ grouped: null, ungrouped: null, archived: null });
      setListError("Не удалось загрузить список учеников");
    } finally {
      if (listSeq.isCurrent(token)) { setLoading(false); setRefreshing(false); }
    }
  }, [debouncedSearch, filterGroup, page, activeTab, listSeq]);

  const loadAll = () => { loadDirectories(); loadStudents(); };

  useEffect(() => { loadDirectories(); }, [loadDirectories]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  const groupsById = useMemo(() => {
    const map: Record<string, any> = {};
    groups.forEach((g) => { map[g.id] = g; });
    return map;
  }, [groups]);

  // Teacher without a chosen group shows group cards, not students.
  const showStudents = !(filterTeacher && !filterGroup);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  // Paging bar: the table keeps it inside its frame, the phone cards show it under the list.
  const pager = total > PAGE_SIZE ? (
    <>
      <span>
        {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + students.length} из {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span>Стр. {page + 1} / {pageCount}</span>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Следующая страница"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  ) : null;

  const subtitle = showStudents ? studentsSubtitle(counts, activeTab, total, !!filterGroup) : "";
  const showTabs = showStudents && !filterGroup;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header: the title block may shrink, the import button never does */}
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Ученики</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {subtitle || "Ученики центра: в группах и без группы"}
          </p>
        </div>
        <ImportButton variant="solid" onImported={loadAll} className="shrink-0 whitespace-nowrap" />
      </div>

      {/* «В группах (N) · Без группы (M) · Архив (K)» */}
      {showTabs && (
        <div role="tablist" aria-label="Ученики" className="flex w-full overflow-x-auto rounded-lg bg-slate-100 p-0.5 sm:inline-flex sm:w-auto sm:max-w-full">
          {OFFERED_TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => { setTab(value); setPage(0); }}
              className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-3 ${activeTab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {studentTabLabel(value, counts[value])}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или ID…"
            aria-label="Поиск по имени или ID ученика"
            className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
        </div>

        {/* An archived student is in no group: the teacher / group filter has nothing to filter there. */}
        {activeTab !== "archived" && (
        <CascadingFilter
          teachers={teachers}
          groups={groups}
          value={{ teacherId: filterTeacher, groupId: filterGroup }}
          onChange={({ teacherId, groupId }) => {
            setFilterTeacher(teacherId);
            setFilterGroup(groupId);
            if (groupId) setTab("grouped");
            setPage(0);
          }}
        />
        )}
      </div>

      {/* Content Area */}
      {showStudents && refreshing ? (
        <div className="flex justify-center py-16" role="status" aria-label="Загрузка списка">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : showStudents && listError ? (
        <div role="alert" className="py-10 text-center text-sm text-slate-500">
          {listError}.{" "}
          <button type="button" onClick={() => void loadStudents()} className="font-medium text-primary-700 hover:underline">
            Повторить
          </button>
        </div>
      ) : filterTeacher && !filterGroup ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.filter((g) => g.teacher_id === filterTeacher).length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl border border-slate-100 p-8 text-center md:p-16">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                <Folder className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">У преподавателя пока нет групп</h3>
              <p className="text-slate-500 text-sm">Вы можете создать группы в разделе управления расписанием.</p>
            </div>
          ) : (
            groups.filter((g) => g.teacher_id === filterTeacher).map((g, i) => (
              <div key={g.id} onClick={() => { setFilterGroup(g.id); setPage(0); }}>
                <GroupCard group={g} href="" index={i} />
              </div>
            ))
          )}
        </div>
      ) : students.length === 0 && activeTab === "archived" ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {search ? "Ученики не найдены" : "В архиве пока никого нет"}
        </p>
      ) : students.length === 0 && activeTab === "ungrouped" ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {search ? "Ученики не найдены" : "Все ученики распределены по группам"}
        </p>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center md:p-16">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {search || filterGroup || filterTeacher ? "Ученики не найдены" : "Ученики пока не зачислены в группы"}
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            {search || filterGroup || filterTeacher
              ? "Попробуйте изменить параметры поиска или фильтры."
              : "Ученики центра, зачисленные в группы, появятся здесь. После прохождения диагностики распределите учеников по группам."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`${base}/groups`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm"
            >
              <Users className="w-4 h-4" /> Перейти к группам
            </Link>
            <Link
              href="/admin/diagnostics"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
            >
              <Brain className="w-4 h-4" /> Диагностика
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Phones and tablets: one card per student (the table needs the wide screen) */}
          <ul className="grid gap-2.5 lg:grid-cols-2 xl:hidden">
            {students.map((s) => {
              const currentGroupId = studentGroupId(s);
              const group = currentGroupId ? groupsById[currentGroupId] : null;
              const meta = studentCardMeta(s.display_id, s.class_level);
              const phoneLink = telHref(s.student_phone);
              const extra = extraGroupsLabel(s.groups_count);
              return (
                <li key={s.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <Link
                      href={`${base}/students/${s.id}`}
                      className="min-w-0 break-words text-sm font-medium text-slate-900 hover:text-primary-700"
                    >
                      {s.full_name || `${s.last_name} ${s.first_name}`}
                    </Link>
                    {s.student_phone && (phoneLink ? (
                      <a href={phoneLink} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-500 hover:text-primary-700">
                        {s.student_phone}
                      </a>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-500">{s.student_phone}</span>
                    ))}
                  </div>
                  {meta.line && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {meta.id && (
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(meta.id, e)}
                          aria-label={`Скопировать ID ${meta.id}`}
                          className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors ${
                            copiedId === meta.id ? "text-emerald-700" : "hover:text-slate-700 active:bg-slate-100"
                          }`}
                        >
                          {meta.id}
                          {copiedId === meta.id && <Check className="h-3 w-3" aria-hidden />}
                        </button>
                      )}
                      {meta.id && meta.classLabel && <span aria-hidden> · </span>}
                      {meta.classLabel}
                    </p>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm">
                    {isArchivedStatus(s.status) ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">В архиве</span>
                    ) : group ? (
                      <>
                        <Link
                          href={`${base}/groups/${group.id}`}
                          className="min-w-0 break-words font-medium text-slate-700 hover:text-primary-600"
                        >
                          {group.name}
                        </Link>
                        {extra && <span className="text-xs text-slate-400">{extra}</span>}
                      </>
                    ) : studentHasGroup(s) ? (
                      <span className="text-xs text-slate-400">В группе</span>
                    ) : (
                      <span className="text-xs italic text-slate-400">Без группы</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          {pager && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-sm text-slate-500 xl:hidden">{pager}</div>
          )}

          {/* Wide screens: the table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm xl:block">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">Ученик</th>
                  <th className="px-6 py-3 font-medium">ID</th>
                  <th className="px-6 py-3 font-medium">Класс</th>
                  <th className="px-6 py-3 font-medium">{activeTab === "archived" ? "Статус" : "Группа"}</th>
                  <th className="px-6 py-3 font-medium">Телефон</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <AnimatePresence mode="popLayout" initial={false}>
                  {students.map((s, i) => {
                    const currentGroupId = studentGroupId(s);
                    const group = currentGroupId ? groupsById[currentGroupId] : null;
                    return (
                      <motion.tr
                        key={s.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="hover:bg-slate-50/70 transition-colors group/row"
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`${base}/students/${s.id}`}
                            className="flex items-center gap-3 group/name"
                          >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                              {(s.first_name?.[0] || "").toUpperCase()}
                            </div>
                            <span className="text-sm text-slate-700 group-hover/name:text-primary-600 font-medium transition-colors">
                              {s.full_name || `${s.last_name} ${s.first_name}`}
                            </span>
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          {s.display_id ? (
                            <button
                              type="button"
                              onClick={(e) => handleCopyId(s.display_id!, e)}
                              className={`group/id inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all duration-200 cursor-pointer ${
                                copiedId === s.display_id
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs"
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/60"
                              }`}
                              title="Нажмите, чтобы скопировать ID ученика"
                            >
                              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                                {copiedId === s.display_id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-50 duration-150" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-400 group-hover/id:text-slate-600 transition-colors" />
                                )}
                              </span>
                              <span>{s.display_id}</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600">{s.class_level} класс</span>
                        </td>
                        <td className="px-6 py-4">
                          {isArchivedStatus(s.status) ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">В архиве</span>
                          ) : group ? (
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              <Link
                                href={`${base}/groups/${group.id}`}
                                className="text-sm text-slate-700 hover:text-primary-600 font-medium transition-colors"
                              >
                                {group.name}
                              </Link>
                              {extraGroupsLabel(s.groups_count) && (
                                <span className="text-xs text-slate-400">{extraGroupsLabel(s.groups_count)}</span>
                              )}
                            </div>
                          ) : studentHasGroup(s) ? (
                            <span className="text-xs text-slate-400">В группе</span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Без группы</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{s.student_phone || "—"}</td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
            {pager && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm text-slate-500">{pager}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
