"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Settings,
  GraduationCap, Loader2, Edit2, Check, X,
  BookOpen, FileText, Plus, Copy, ChevronRight, AlertCircle, Clock, CheckCircle, CheckCircle2, XCircle,
  Library, PlayCircle, Search, Radio, Archive, Calendar as CalendarIcon,
} from "lucide-react";
import Link from "next/link";
import { orgApi, examsApi, GroupDetail, GroupStats, type ExamSummary } from "@/lib/api";
import { lessonTypeLabel } from "@/lib/payroll";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { GroupStudentTable } from "@/components/groups/group-student-table";
import { GroupStatsPanel } from "@/components/groups/group-stats-panel";
import { GroupAttendanceJournal } from "@/components/groups/group-attendance-journal";
import { PhaseLockBanner } from "@/components/ui/phase-lock-banner";
import { ScheduleExamModal } from "@/components/exam/schedule-exam-modal";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";

type Tab = "students" | "exams" | "attendance";
type ExamStatusFilter = "active" | "lobby" | "draft" | "closed" | "archived";

function parseExamStatusFilter(value: string | null): ExamStatusFilter {
  return value === "lobby" || value === "draft" || value === "closed" || value === "archived" || value === "active"
    ? value
    : "active";
}

const DAYS = [
  { id: 1, name: "Понедельник", short: "Пн" },
  { id: 2, name: "Вторник", short: "Вт" },
  { id: 3, name: "Среда", short: "Ср" },
  { id: 4, name: "Четверг", short: "Чт" },
  { id: 5, name: "Пятница", short: "Пт" },
  { id: 6, name: "Суббота", short: "Сб" },
  { id: 7, name: "Воскресенье", short: "Вс" },
];

interface ScheduleLesson {
  id: string;
  groupId: string;
  groupName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  format: "offline" | "online";
}

export default function TeacherGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const groupId = params?.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [groupExams, setGroupExams] = useState<ExamSummary[]>([]);
  const [allExams, setAllExams] = useState<ExamSummary[]>([]); // library templates
  const [groupLessons, setGroupLessons] = useState<ScheduleLesson[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<"none" | "chooser" | "library" | "success">("none");
  const [librarySearch, setLibrarySearch] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignedInfo, setAssignedInfo] = useState<{
    exam_id: string;
    title: string;
    group_name: string;
  } | null>(null);
  const [printScheduleTarget, setPrintScheduleTarget] = useState<ExamSummary | null>(null);

  // Group Exams Filter & Search
  const [examFilter, setExamFilter] = useState<ExamStatusFilter>(() => parseExamStatusFilter(searchParams?.get("exam_status") || null));
  const [examSearch, setExamSearch] = useState(() => searchParams?.get("exam_q") || "");

  // Counts for Group Exams (Hook must be top-level before early returns)
  const examCounts = useMemo(() => {
    const counts = {
      all: groupExams.length,
      active: 0,
      lobby: 0,
      draft: 0,
      closed: 0,
      archived: 0,
    };
    groupExams.forEach((ex) => {
      if (ex.status === "archived") {
        counts.archived++;
      } else if (ex.status === "active" || ex.status === "print_ready") {
        counts.active++;
      } else if (ex.status === "lobby") {
        counts.lobby++;
      } else if (ex.status === "draft" || ex.status === "variants_ready") {
        counts.draft++;
      } else if (ex.status === "closed") {
        counts.closed++;
      }
    });
    return counts;
  }, [groupExams]);

  // Filtered Group Exams (Hook must be top-level before early returns)
  const filteredGroupExams = useMemo(() => {
    return groupExams.filter((ex) => {
      if (examFilter === "active" && ex.status !== "active" && ex.status !== "print_ready") return false;
      if (examFilter === "lobby" && ex.status !== "lobby") return false;
      if (examFilter === "draft" && (ex.status !== "draft" && ex.status !== "variants_ready")) return false;
      if (examFilter === "closed" && ex.status !== "closed") return false;
      if (examFilter === "archived" && ex.status !== "archived") return false;
      if (examSearch.trim()) {
        const q = examSearch.toLowerCase();
        return (
          ex.title.toLowerCase().includes(q) ||
          (ex.access_code || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [groupExams, examFilter, examSearch]);

  const requestedTab = searchParams?.get("tab");
  const tab: Tab = requestedTab === "exams" || requestedTab === "attendance" || requestedTab === "students"
    ? requestedTab
    : "students";
  const setTab = (newTab: Tab) => {
    const next = new URLSearchParams(searchParams?.toString());
    next.set("tab", newTab);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const nextFilter = parseExamStatusFilter(searchParams?.get("exam_status") || null);
    const nextSearch = searchParams?.get("exam_q") || "";
    setExamFilter((current) => current === nextFilter ? current : nextFilter);
    setExamSearch((current) => current === nextSearch ? current : nextSearch);
  }, [searchParams]);

  const updateExamListState = (nextFilter: ExamStatusFilter, nextSearch: string) => {
    setExamFilter(nextFilter);
    setExamSearch(nextSearch);
    const next = new URLSearchParams(searchParams?.toString());
    next.set("tab", "exams");
    if (nextFilter === "active") next.delete("exam_status");
    else next.set("exam_status", nextFilter);
    if (nextSearch.trim()) next.set("exam_q", nextSearch.trim());
    else next.delete("exam_q");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const groupExamReturnHref = (() => {
    const params = new URLSearchParams();
    params.set("tab", "exams");
    if (examFilter !== "active") params.set("exam_status", examFilter);
    if (examSearch.trim()) params.set("exam_q", examSearch.trim());
    return `/teacher/groups/${groupId}?${params.toString()}`;
  })();

  // Group schedule lessons by identical time and location (e.g. Пн, Ср 09:00 - 10:30)
  const groupedSchedule = useMemo(() => {
    if (!groupLessons || groupLessons.length === 0) return [];

    const map = new Map<
      string,
      {
        days: number[];
        startTime: string;
        endTime: string;
        room: string;
        format: "offline" | "online";
      }
    >();

    groupLessons.forEach((l) => {
      const key = `${l.startTime}_${l.endTime}_${l.format}_${l.room}`;
      if (!map.has(key)) {
        map.set(key, {
          days: [l.dayOfWeek],
          startTime: l.startTime,
          endTime: l.endTime,
          room: l.room,
          format: l.format,
        });
      } else {
        const existing = map.get(key)!;
        if (!existing.days.includes(l.dayOfWeek)) {
          existing.days.push(l.dayOfWeek);
        }
      }
    });

    return Array.from(map.values()).map((item) => {
      item.days.sort((a, b) => a - b);
      const dayNames = item.days
        .map((d) => DAYS.find((day) => day.id === d)?.short || "")
        .filter(Boolean)
        .join(", ");
      return {
        ...item,
        dayNames,
      };
    });
  }, [groupLessons]);

  const canEdit = user?.org_role === "admin" || user?.org_role === "owner" || user?.role === "owner";

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setLoadError(null);
    try {
      // The group card is an operational screen. All visible aggregate data
      // comes from the server in one confirmed snapshot; localStorage cannot
      // replace it after an API failure.
      const [g, s, ex, allEx, lessons] = await Promise.all([
        orgApi.getGroup(groupId),
        orgApi.getGroupStats(groupId),
        examsApi.list({ groupId, includeArchived: true }),
        examsApi.list({ unassigned: true }),
        user?.id ? orgApi.getSchedule(user.id) : Promise.resolve([]),
      ]);
      setGroup(g);
      setStats(s);
      setGroupExams(Array.isArray(ex) ? ex : []);
      setAllExams(Array.isArray(allEx) ? allEx : []);

      const matchedLessons = lessons
        .filter((l) => l.groupId === groupId)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
      setGroupLessons(matchedLessons);
    } catch (error) {
      // Keep the last verified snapshot if this is a retry. On the first
      // visit, surface the outage rather than redirecting the teacher away.
      setLoadError(getDataLoadErrorMessage(error));
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [groupId, user?.id]);

  useEffect(() => {
    if (groupId) void load(true);
  }, [groupId, load]);

  // ─── Background Scroll Lock When Any Modal Is Open (Prevent Layout Shift) ───
  useEffect(() => {
    if (modalState !== "none") {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [modalState]);

  const handleRemoveStudent = async (studentId: string) => {
    if (!group) return;
    if (!confirm("Удалить ученика из группы?")) return;
    try {
      await orgApi.removeStudentFromGroup(groupId, studentId);
      setGroup((prev) => prev ? {
        ...prev,
        students: prev.students.filter((s) => s.id !== studentId),
        student_count: prev.student_count - 1,
      } : null);
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto max-w-2xl pt-12">
        <DataLoadError
          title="Не удалось загрузить группу"
          message={loadError || "Группа пока недоступна. Повторите попытку."}
          onRetry={() => load(true)}
        />
      </div>
    );
  }

  const existingIds = new Set(group.students.map((s) => s.id));

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/teacher/groups" className="hover:text-slate-900 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Группы
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{group.name}</span>
      </div>

      {loadError && (
        <DataLoadError
          compact
          title="Данные группы могут быть неактуальны"
          message={`${loadError} Показаны последние успешно загруженные данные.`}
          onRetry={() => load()}
        />
      )}

      {/* ── Hero Group Card ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8"
      >
        {/* Subtle blur glow in top-right */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-primary-50/40 to-indigo-50/20 rounded-full blur-3xl -z-0 pointer-events-none" />

        {/* Color accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-500 via-sky-400 to-indigo-500 rounded-t-3xl" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Avatar / Icon */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-md shadow-primary-600/20 shrink-0">
              <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>

            {/* Main Details */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
                {group.class_level && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200/60">
                    {group.class_level} класс
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200/60">
                  {lessonTypeLabel(group.lesson_type)}
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap pt-0.5">
                {group.teacher_name ? (
                  <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60 font-medium">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Учитель: {group.teacher_name}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400 italic px-2 py-1">
                    <Users className="w-3.5 h-3.5" />
                    Учитель не назначен
                  </span>
                )}
              </div>

              {group.description && (
                <p className="text-xs text-slate-400 mt-1">{group.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-slate-100 mt-8 -mb-2 overflow-x-auto scrollbar-none">
          {[
            { key: "students", label: "Ученики", icon: Users, count: group.students?.length },
            { key: "exams", label: "Экзамены", icon: FileText, count: groupExams.length },
            { key: "attendance", label: "Посещаемость", icon: BookOpen },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as Tab)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap",
                  isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      isActive ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Tab content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === "students" && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <p className="font-semibold text-slate-900">
                Состав группы
                <span className="ml-2 text-sm font-normal text-slate-400">({group.student_count})</span>
              </p>
            </div>

            <GroupStudentTable
              students={group.students}
              onRemove={canEdit ? handleRemoveStudent : undefined}
              canRemove={canEdit}
            />
          </div>
        )}

        {tab === "exams" && (
          <div className="space-y-4">
            {/* Unified Modal Container with Single Persistent Backdrop */}
            <AnimatePresence>
              {modalState !== "none" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  {/* Single Persistent Backdrop Blur */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
                    onClick={() => setModalState("none")}
                  />

                  {/* Inner Modal Cards with Smooth Crossfade/Morph */}
                  <AnimatePresence mode="wait">
                    {modalState === "chooser" && (
                      <motion.div
                        key="modal-chooser"
                        initial={{ opacity: 0, scale: 0.94, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden"
                      >
                        <div className="bg-gradient-to-r from-primary-600 to-violet-600 p-5 text-white">
                          <button
                            onClick={() => setModalState("none")}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <h3 className="font-bold text-base">Добавить экзамен</h3>
                          <p className="text-xs text-white/70 mt-0.5">Группа «{group?.name}»</p>
                        </div>
                        <div className="p-4 space-y-3">
                          <button
                            onClick={() => setModalState("library")}
                            className="w-full flex items-start gap-4 p-4 rounded-2xl border border-slate-200 hover:border-primary-400 hover:bg-primary-50/30 transition-all text-left group cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                              <Library className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">Из библиотеки</p>
                              <p className="text-xs text-slate-500 mt-0.5">Выбрать готовый шаблон из ваших экзаменов</p>
                            </div>
                          </button>

                          <Link
                            href={`/teacher/exams/new?group_id=${groupId}&group_name=${encodeURIComponent(group?.name || "")}`}
                            onClick={() => setModalState("none")}
                            className="w-full flex items-start gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition-all text-left group block cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                              <Plus className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">Создать новый</p>
                              <p className="text-xs text-slate-500 mt-0.5">Собрать экзамен с нуля, группа уже привязана</p>
                            </div>
                          </Link>
                        </div>
                      </motion.div>
                    )}

                    {modalState === "library" && (
                      <motion.div
                        key="modal-library"
                        initial={{ opacity: 0, scale: 0.94, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[85vh]"
                      >
                        <div className="bg-gradient-to-r from-primary-600 to-violet-600 p-5 text-white shrink-0">
                          <button
                            onClick={() => setModalState("none")}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <h3 className="font-bold text-base">Выбрать из библиотеки</h3>
                          <p className="text-xs text-white/70 mt-0.5">Назначить для группы «{group?.name}»</p>
                        </div>

                        {/* Search */}
                        <div className="p-4 border-b border-slate-100 shrink-0">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder="Поиск по названию..."
                              value={librarySearch}
                              onChange={(e) => setLibrarySearch(e.target.value)}
                              className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
                            />
                          </div>
                        </div>

                        {/* List */}
                        <div className="overflow-y-auto flex-1 p-4 space-y-2">
                          {allExams
                            .filter((e) => !e.group_id && e.status !== "closed" && e.status !== "archived" && e.status !== "active")
                            .filter((e) =>
                              !librarySearch ||
                              e.title.toLowerCase().includes(librarySearch.toLowerCase())
                            )
                            .map((exam) => (
                              <div
                                key={exam.exam_id}
                                className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50/20 transition-all"
                              >
                                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                                  <FileText className="w-4 h-4 text-primary-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm text-slate-800 truncate">{exam.title}</p>
                                  <p className="text-xs text-slate-500">{exam.tasks_per_variant} зад · {exam.variants_count} вар</p>
                                </div>
                                <button
                                  disabled={assigningId === exam.exam_id}
                                  onClick={async () => {
                                    if (!group) return;
                                    // A paper exam must be frozen for an exact lesson;
                                    // it cannot use the legacy group-only assignment.
                                    if (exam.delivery_mode === "print") {
                                      setModalState("none");
                                      setPrintScheduleTarget(exam);
                                      return;
                                    }
                                    setAssigningId(exam.exam_id);
                                    try {
                                      let targetId = exam.exam_id;
                                      if (exam.group_id && exam.group_id !== groupId) {
                                        const cloned = await examsApi.clone(exam.exam_id, {
                                          group_id: groupId,
                                          group_name: group.name,
                                        });
                                        targetId = cloned.exam_id;
                                        await examsApi.assign(targetId, {
                                          group_id: groupId,
                                          group_name: group.name,
                                          // Selecting a template from a group creates a
                                          // draft for that group. The teacher chooses an
                                          // exact lesson before a public lobby can open.
                                          publish: false,
                                        });
                                      } else {
                                        await examsApi.assign(exam.exam_id, {
                                          group_id: groupId,
                                          group_name: group.name,
                                          publish: false,
                                        });
                                      }
                                      setAssignedInfo({
                                        exam_id: targetId,
                                        title: exam.title,
                                        group_name: group.name,
                                      });
                                      setModalState("success");
                                      load(false);
                                    } catch (e: any) {
                                      console.error(e);
                                      alert(e.message || "Ошибка при назначении экзамена");
                                    } finally {
                                      setAssigningId(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 shrink-0 cursor-pointer shadow-xs"
                                >
                                  {assigningId === exam.exam_id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  Выбрать
                                </button>
                              </div>
                            ))}
                          {allExams
                            .filter((e) => !e.group_id && e.status !== "closed" && e.status !== "archived" && e.status !== "active")
                            .filter((e) => !librarySearch || e.title.toLowerCase().includes(librarySearch.toLowerCase()))
                            .length === 0 && (
                            <div className="text-center py-8 text-slate-400">
                              <Library className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              <p className="text-sm">{librarySearch ? "Шаблоны не найдены" : "Нет доступных шаблонов"}</p>
                              <Link href="/teacher/exams/new" className="text-xs text-primary-600 hover:underline mt-1 block">
                                Создать экзамен в библиотеке →
                              </Link>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {modalState === "success" && assignedInfo && (
                      <motion.div
                        key="modal-success"
                        initial={{ opacity: 0, scale: 0.92, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 8 }}
                        transition={{ type: "spring", stiffness: 380, damping: 26 }}
                        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-7 text-center overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-600 via-violet-600 to-emerald-400" />
                        
                        <button
                          onClick={() => setModalState("none")}
                          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Закрыть"
                        >
                          <X className="w-4 h-4" />
                        </button>

                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto mb-4 shadow-sm shadow-emerald-500/10">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>

                        <h3 className="text-lg font-bold text-slate-900 mb-1.5">
                          Экзамен успешно назначен!
                        </h3>

                        <p className="text-xs text-slate-500 leading-relaxed mb-6">
                          Экзамен <span className="font-semibold text-slate-800">«{assignedInfo.title}»</span> добавлен для группы <span className="font-semibold text-slate-800">«{assignedInfo.group_name}»</span>.
                        </p>

                        <button
                          onClick={() => setModalState("none")}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white font-semibold text-xs shadow-md shadow-primary-600/20 transition-all cursor-pointer"
                        >
                          Отлично
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </AnimatePresence>

            {/* Header + Add button */}
            <div className="flex items-center justify-between bg-white rounded-2xl p-5 border border-slate-100 shadow-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Экзамены группы</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Экзамены, назначенные для «{group.name}»
                </p>
              </div>
              <button
                onClick={() => setModalState("chooser")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-primary-600/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Добавить экзамен
              </button>
            </div>

            {/* Filter Bar + Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs">
              {/* Status pills */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl overflow-x-auto scrollbar-none">
                {([
                  { key: "active", label: "Текущие" },
                  { key: "lobby", label: "Лобби" },
                  { key: "draft", label: "Черновики" },
                  { key: "closed", label: "Завершённые" },
                  { key: "archived", label: "Архив" },
                ] as { key: ExamStatusFilter; label: string }[]).map((f) => {
                  const count = examCounts[f.key];
                  const isActive = examFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => updateExamListState(f.key, examSearch)}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                        isActive
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {f.label}
                      {count > 0 && (
                        <span
                          className={cn(
                            "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                            isActive ? "bg-primary-100 text-primary-700" : "bg-slate-200 text-slate-500"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск по экзаменам..."
                  value={examSearch}
                  onChange={(e) => updateExamListState(examFilter, e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
                />
              </div>
            </div>

            {/* Exams list or empty states */}
            {groupExams.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-xs">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-900 text-sm">Нет назначенных экзаменов</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Для этой группы ещё не созданы контрольные или диагностические работы.
                </p>
                <Link
                  href={`/teacher/exams/new?group_id=${groupId}&group_name=${encodeURIComponent(group.name)}`}
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl text-xs font-semibold transition-all"
                >
                  <Plus className="w-4 h-4" /> Создать первый экзамен
                </Link>
              </div>
            ) : filteredGroupExams.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2 opacity-60" />
                <h4 className="font-bold text-slate-800 text-sm">Экзамены не найдены</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Нет экзаменов, соответствующих выбранному статусу или поисковому запросу.
                </p>
                {examSearch && (
                  <button
                    onClick={() => updateExamListState(examFilter, "")}
                    className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Сбросить поиск
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredGroupExams.map((ex) => (
                  <Link
                    key={ex.exam_id}
                    href={`/teacher/exams/${ex.exam_id}?from_group=${groupId}&from_name=${encodeURIComponent(group.name)}&return_to=${encodeURIComponent(groupExamReturnHref)}`}
                    className="group/exam bg-white hover:bg-slate-50/70 rounded-2xl p-5 border border-slate-100 shadow-2xs hover:shadow-sm hover:border-primary-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all block cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0 group-hover/exam:bg-primary-100/70 transition-colors">
                        <FileText className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm truncate group-hover/exam:text-primary-600 transition-colors">{ex.title}</h4>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              ex.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : ex.status === "print_ready"
                                ? "bg-violet-50 text-violet-700 border border-violet-200"
                                : ex.status === "lobby"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : ex.status === "draft" || ex.status === "variants_ready"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : ex.status === "closed"
                                ? "bg-slate-100 text-slate-600 border border-slate-200"
                                : ex.status === "archived"
                                ? "bg-slate-100 text-slate-500 border border-slate-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {ex.status === "active"
                              ? "Идёт экзамен"
                              : ex.status === "print_ready"
                              ? "Комплект готов"
                              : ex.status === "lobby"
                              ? "Лобби"
                              : ex.status === "draft" || ex.status === "variants_ready"
                              ? "Черновик"
                              : ex.status === "closed"
                              ? "Завершён"
                              : "В архиве"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {ex.tasks_per_variant} заданий · {new Date(ex.created_at).toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      {ex.access_code && (ex.status === "active" || ex.status === "lobby") && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const origin = typeof window !== "undefined" ? window.location.origin : "https://algo.uz";
                            navigator.clipboard.writeText(`${origin}/e/${ex.access_code}`);
                            setCopiedId(ex.exam_id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className={`group/code inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all duration-200 cursor-pointer ${
                            copiedId === ex.exam_id
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/60"
                          }`}
                          title="Скопировать ссылку для учеников"
                        >
                          <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                            {copiedId === ex.exam_id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-50 duration-150" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400 group-hover/code:text-slate-600 transition-colors" />
                            )}
                          </span>
                          <span>{ex.access_code}</span>
                        </button>
                      )}

                      <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-400 group-hover/exam:text-primary-600 group-hover/exam:border-primary-200 group-hover/exam:bg-primary-50 transition-all shrink-0">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "attendance" && (
          <GroupAttendanceJournal
            groupId={groupId}
            students={group.students || []}
            canEdit={Boolean(
              group.teacher_id === user?.id ||
              user?.org_role === "admin" ||
              user?.org_role === "owner" ||
              user?.role === "owner"
            )}
            studentProfileBasePath="/teacher/students"
          />
        )}

      </motion.div>

      {printScheduleTarget && (
        <ScheduleExamModal
          examTitle={printScheduleTarget.title}
          groups={[group]}
          initialGroupId={groupId}
          deliveryMode="print"
          onClose={() => setPrintScheduleTarget(null)}
          onSubmit={async ({ group: selectedGroup, occurrence }) => {
            await examsApi.preparePrintPackage(printScheduleTarget.exam_id, {
              group_id: selectedGroup.id,
              lesson_id: occurrence.id,
              lesson_date: occurrence.occurrenceDate,
            });
            setPrintScheduleTarget(null);
            setAssignedInfo({
              exam_id: printScheduleTarget.exam_id,
              title: printScheduleTarget.title,
              group_name: selectedGroup.name,
            });
            setModalState("success");
            void load(false);
          }}
        />
      )}
    </div>
  );
}
