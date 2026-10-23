"use client";

import { Select } from "@/components/ui/select";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { GraduationCap, Plus, Search } from "lucide-react";
import { orgApi, GroupInfo } from "@/lib/api";
import { staffDisplayName } from "@/lib/staff-name";
import { GroupCard } from "@/components/groups/group-card";
import { GroupCreateModal } from "@/components/groups/group-create-modal";
import { GroupPriceFilter } from "@/components/groups/group-price-filter";
import { countGroupsWithoutPrice, parsePriceFilter } from "@/lib/group-price";
import {
  filterGroups,
  GROUP_CLASS_LEVELS,
  groupListQueryString,
  groupWorkspacePaths,
  parseGroupListQuery,
  type GroupStatusFilter,
  type Workspace,
} from "@/lib/group-workspace";
import { ImportButton } from "@/components/import/import-button";
import { useToast } from "@/components/ui/toast";

const STATUS_TABS: ReadonlyArray<{ key: GroupStatusFilter; label: string }> = [
  { key: "active", label: "Активные" },
  { key: "waiting", label: "Ожидание" },
  { key: "archived", label: "Архив" },
];

/**
 * The list of groups for the owner and for the administrator (IA audit F9: it used to be two pages that drifted apart - the class filter
 * was lost on the administrator's one).  `workspace` decides where a card leads.  The filters are in the URL (F34):
 * `?status=waiting&class=9&q=алг&price=none`, so a return from a group keeps them and a link can name them.
 */
export function GroupsListView({ workspace }: { workspace: Workspace }) {
  // The page reads `?status=`, `?class=`, `?q=` and `?price=`, so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>}>
      <GroupsListContent workspace={workspace} />
    </Suspense>
  );
}

function GroupsListContent({ workspace }: { workspace: Workspace }) {
  const paths = groupWorkspacePaths(workspace);
  const router = useRouter();
  const searchParams = useSearchParams();
  // «Без цены»: the groups the students of which have no price (only for a role that sees money).
  const priceFilter = parsePriceFilter(searchParams?.get("price"));
  const query = parseGroupListQuery(searchParams);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState(query.q);
  const { showToast, toastNode } = useToast();

  const go = useCallback((next: typeof query, price: string | null = priceFilter === "none" ? "none" : null) => {
    router.replace(groupListQueryString(next, { price }), { scroll: false });
  }, [router, priceFilter]);

  // the search box is typed locally and written to the URL once the typing stops
  const lastWritten = useRef(query.q);
  useEffect(() => {
    if (search === lastWritten.current) return undefined;
    const timer = setTimeout(() => { lastWritten.current = search; go({ ...query, q: search }); }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [g, m] = await Promise.all([
        orgApi.listGroups().catch(() => []),
        orgApi.listMembers().catch(() => []),
      ]);
      setGroups(Array.isArray(g) ? g : (g as any)?.items || []);
      setMembers(Array.isArray(m) ? m : (m as any)?.items || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Only teachers can be assigned to a group — not admins/owner
  const teachers = members
    .filter((m: any) => m.org_role === "teacher")
    .map((m: any) => ({ id: m.user_id || m.id, first_name: m.first_name || "", last_name: m.last_name || "", org_role: m.org_role }));

  // the name of the teacher comes from the list; the members fill it where the list has only the id
  const named = useMemo(() => groups.map((g) => {
    if (g.teacher_name || !g.teacher_id) return g;
    const teacher = members.find((m: any) => m.user_id === g.teacher_id || m.id === g.teacher_id);
    return teacher ? { ...g, teacher_name: staffDisplayName(teacher) || null } : g;
  }), [groups, members]);

  const withoutPrice = countGroupsWithoutPrice(named);
  const filtered = filterGroups(named, query, priceFilter);

  return (
    <div className="space-y-6 w-full max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Группы</h1>
          <p className="text-slate-500 text-sm mt-0.5">Управление учебными группами и составом учеников</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ImportButton onImported={loadData} />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Новая группа
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или преподавателю..."
            aria-label="Поиск по названию или преподавателю"
            className="pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none w-full sm:w-[340px] sm:shrink-0"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => go({ ...query, status: key }, null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                query.status === key && priceFilter !== "none"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* The class of the group (the filter the administrator's list had lost) */}
        <Select
          value={query.classLevel === null || query.classLevel === undefined ? "" : String(query.classLevel)}
          onChange={(event) => go({ ...query, classLevel: event.target.value ? Number(event.target.value) : null })}
          ariaLabel="Класс группы"
          testId="groups-class-filter"
          options={[{ value: "", label: "Все классы" }, ...GROUP_CLASS_LEVELS.map((level) => ({ value: String(level), label: `${level} класс` }))]}
          className="w-auto min-w-[10rem]"
          buttonClassName="bg-white py-2 font-normal text-slate-700"
        />

        <GroupPriceFilter
          count={withoutPrice}
          active={priceFilter === "none"}
          onToggle={() => go(query, priceFilter === "none" ? null : "none")}
        />
      </div>

      {/* Groups grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 bg-white rounded-2xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-primary-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {query.q
              ? `Нет групп по запросу «${query.q}»`
              : query.classLevel
              ? `Нет групп для ${query.classLevel} класса`
              : "Групп пока нет"}
          </h3>
          <p className="text-slate-500 text-sm mb-6 text-center max-w-xs">
            Создайте учебную группу и добавьте в неё учеников для совместного обучения.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Создать группу
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((group, i) => (
            <GroupCard
              key={group.id}
              group={group}
              href={`${paths.groups}/${group.id}`}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <GroupCreateModal
        open={showCreate}
        teachers={teachers}
        onClose={() => setShowCreate(false)}
        onCreated={(g) => {
          setGroups((prev) => [g, ...prev]);
          setShowCreate(false);
          showToast(`Группа «${g.name}» создана`);
          // The answer of the creation has no price (`price_current`); the list does: read it again quietly.
          void orgApi.listGroups().then((list) => { if (Array.isArray(list)) setGroups(list); }).catch(() => undefined);
        }}
      />

      {toastNode}
    </div>
  );
}
