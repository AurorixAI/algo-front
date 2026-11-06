"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, Copy, FileText, Library, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { examsApi, type ExamSummary, type GroupDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScheduleExamModal, occurrenceLabel } from "@/components/exam/schedule-exam-modal";
import { SuccessAssignModal } from "@/components/exam/success-assign-modal";
import { assignExamToLesson } from "@/lib/exam-assign";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { businessDateWithOffset, formatIsoDateLabel, formatUtcNaiveAsBusinessDate } from "@/lib/business-time";
import { examListState, examTabOf, lobbyExamLabel, type ExamTab } from "@/lib/exam-lobby";
import { CHIP_TONE_CLASS } from "@/lib/chip-tone";
import { examStatusView, DRAFT_TAB_LABEL } from "@/lib/status-registry";
import { useTodayLessonStatuses } from "@/lib/use-exam-lessons";
import { Modal, useScrollLock } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { COPY_FAILED_TEXT, examLinkHere } from "@/lib/exam-link";
import { copyText } from "@/lib/use-copy";
import { groupExamLinks, groupExamsAccess } from "@/lib/group-exams";
import { groupWorkspacePaths, withoutJournalLink, type GroupWorkspace } from "@/lib/group-workspace";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/lib/button-style";

type ExamStatusFilter = ExamTab;

function parseExamStatusFilter(value: string | null): ExamStatusFilter {
  return value === "lobby" || value === "scheduled" || value === "draft" || value === "closed" || value === "archived" || value === "active"
    ? value
    : "active";
}

/** A row of the list: a link to the exam where the role has a page of it, a plain row where it has none (the owner). */
function ExamRow({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <div className={className.replace(/\s*hover:\S+|\s*cursor-pointer|\s*group\/exam(?=\s|$)/g, "")}>{children}</div>;
}

/**
 * The tab «Экзамены» of the group page (E-C, decision 11: it moved out of the teacher's page as it was).  The list, the filter by state, the search and
 * the way to add an exam to the group.  The exam list and the library arrive with the tab itself, so the page of the group does not wait for the exam service.
 */
export function GroupExamsTab({ group, workspace }: { group: GroupDetail; workspace: GroupWorkspace }) {
  const groupId = group.id;
  const { showToast, toastNode } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const links = groupExamLinks({ workspace, groupId, groupName: group.name });
  const access = groupExamsAccess({ workspace });
  const paths = groupWorkspacePaths(workspace);

  const [groupExams, setGroupExams] = useState<ExamSummary[]>([]);
  const [allExams, setAllExams] = useState<ExamSummary[]>([]); // library templates
  const [examsLoading, setExamsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<"none" | "chooser" | "library">("none");
  const [librarySearch, setLibrarySearch] = useState("");
  // «Выбрать» from the library is the library's «Назначить»: the teacher picks an exact lesson, then the lobby opens on it (E-C, decision 11)
  const [assignTarget, setAssignTarget] = useState<ExamSummary | null>(null);
  const [assignResult, setAssignResult] = useState<{ access_code?: string | null; url?: string | null; group_name?: string | null; exam_id: string; lesson_label?: string | null } | null>(null);

  // Group Exams Filter & Search
  const [examFilter, setExamFilter] = useState<ExamStatusFilter>(() => parseExamStatusFilter(searchParams?.get("exam_status") || null));
  const [examSearch, setExamSearch] = useState(() => searchParams?.get("exam_q") || "");

  // #159: the state of a lobby exam follows its lesson - the very function of the library, the dashboard and the monitor of the administrator
  const today = businessDateWithOffset(0);
  const lessons = useTodayLessonStatuses(groupExams, today);
  const examStateOf = useCallback((ex: ExamSummary) => examListState(ex, today, lessons.statusOf(ex)), [today, lessons]);
  const examCounts = useMemo(() => {
    const counts = {
      all: groupExams.length,
      active: 0,
      lobby: 0,
      scheduled: 0,
      draft: 0,
      closed: 0,
      archived: 0,
    };
    groupExams.forEach((ex) => {
      counts[examTabOf(ex, examStateOf(ex))]++;
    });
    return counts;
  }, [groupExams, examStateOf]);

  // Filtered Group Exams
  const filteredGroupExams = useMemo(() => {
    return groupExams.filter((ex) => {
      if (examTabOf(ex, examStateOf(ex)) !== examFilter) return false;
      if (examSearch.trim()) {
        const q = examSearch.toLowerCase();
        return (
          ex.title.toLowerCase().includes(q) ||
          (ex.access_code || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [groupExams, examFilter, examSearch, examStateOf]);   // #159 D1: the state follows the status of the lessons that arrive later - without it the list kept the first answer and disagreed with the counters of the tabs

  useEffect(() => {
    const nextFilter = parseExamStatusFilter(searchParams?.get("exam_status") || null);
    const nextSearch = searchParams?.get("exam_q") || "";
    setExamFilter((current) => current === nextFilter ? current : nextFilter);
    setExamSearch((current) => current === nextSearch ? current : nextSearch);
  }, [searchParams]);

  const updateExamListState = (nextFilter: ExamStatusFilter, nextSearch: string) => {
    setExamFilter(nextFilter);
    setExamSearch(nextSearch);
    const next = withoutJournalLink(new URLSearchParams(searchParams?.toString()));
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
    return `${paths.groups}/${groupId}?${params.toString()}`;
  })();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [ex, allEx] = await Promise.all([
        examsApi.list({ groupId, includeArchived: true }),
        access.canAssign ? examsApi.list({ unassigned: true }) : Promise.resolve([]), // the library is for who binds an exam
      ]);
      setGroupExams(Array.isArray(ex) ? ex : []);
      setAllExams(Array.isArray(allEx) ? allEx : []);
    } catch (error) {
      // Keep the last verified list if this is a retry.
      setLoadError(getDataLoadErrorMessage(error));
    } finally {
      setExamsLoading(false);
    }
  }, [groupId, access.canAssign]);

  useEffect(() => { void load(); }, [load]);

  // ─── Background scroll lock while any dialog is open (shared hook: no layout shift) ───
  useScrollLock(modalState !== "none");

  if (examsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {loadError && groupExams.length === 0 && (
        <DataLoadError title="Не удалось загрузить экзамены группы" message={loadError} onRetry={() => void load()} />
      )}
      {loadError && groupExams.length > 0 && (
        <DataLoadError
          compact
          title="Экзамены группы могут быть неактуальны"
          message={`${loadError} Показаны последние успешно загруженные данные.`}
          onRetry={() => void load()}
        />
      )}
      {!(loadError && groupExams.length === 0) && (
      <div className="space-y-4">
        {/* «Добавить экзамен»: the question of how, then the library; two ordinary windows of the project */}
        <Modal open={modalState === "chooser"} title="Добавить экзамен" description={`Группа «${group?.name}»`} onClose={() => setModalState("none")} size="sm">
          <div className="space-y-3 pb-2">
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
              href={links.newExam}
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
        </Modal>

        <Modal open={modalState === "library"} title="Выбрать из библиотеки" description={`Назначить для группы «${group?.name}»`} onClose={() => setModalState("none")}>
        {/* Search */}
        <div className="pb-3">
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
        <div className="space-y-2 pb-2">
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
                <Button
                  onClick={() => {
                    setModalState("none");
                    setAssignTarget(exam);
                  }}
                  variant="primary" size="sm" className="shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  Выбрать
                </Button>
              </div>
            ))}
          {allExams
            .filter((e) => !e.group_id && e.status !== "closed" && e.status !== "archived" && e.status !== "active")
            .filter((e) => !librarySearch || e.title.toLowerCase().includes(librarySearch.toLowerCase()))
            .length === 0 && (
            <EmptyState variant="inline" icon={Library} title={librarySearch ? "Шаблоны не найдены" : "Нет доступных шаблонов"} action={<Link href={links.library} className={buttonClass({ variant: "secondary", size: "sm" })}>Создать экзамен в библиотеке</Link>} />
          )}
        </div>
        </Modal>

        {/* Header + Add button */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-5 border border-slate-100 shadow-card">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Экзамены группы</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Экзамены, назначенные для «{group.name}»
            </p>
          </div>
          {access.canAssign && <Button
            onClick={() => setModalState("chooser")}
            variant="primary" size="md"
          >
            <Plus className="w-4 h-4" /> Добавить экзамен
          </Button>}
        </div>

        {/* Filter Bar + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-3 border border-slate-100 shadow-card">
          {/* Status pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl overflow-x-auto scrollbar-none">
            {([
              { key: "active", label: "Текущие" },
              { key: "lobby", label: "Лобби" },
              { key: "scheduled", label: "Запланированы" },
              { key: "draft", label: DRAFT_TAB_LABEL },
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
                      ? "bg-white text-slate-900 shadow-card"
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
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-card">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-slate-900 text-sm">Нет назначенных экзаменов</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Для этой группы ещё не созданы контрольные или диагностические работы.
            </p>
            {access.canAssign && (
              <Link
                href={links.newExam}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl text-xs font-semibold transition-all"
              >
                <Plus className="w-4 h-4" /> Создать первый экзамен
              </Link>
            )}
          </div>
        ) : filteredGroupExams.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-card">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2 opacity-60" />
            <h4 className="font-bold text-slate-800 text-sm">Экзамены не найдены</h4>
            <p className="text-xs text-slate-500 mt-1">
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
              <ExamRow
                key={ex.exam_id}
                href={links.exam(ex.exam_id, groupExamReturnHref)}
                className="group/exam bg-white hover:bg-slate-50/70 rounded-2xl p-5 border border-slate-100 shadow-card hover:shadow-sm hover:border-primary-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all block cursor-pointer"
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
                            ? (examStateOf(ex) === "lobby" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : examStateOf(ex) === "needs_resolution" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-sky-50 text-sky-700 border border-sky-200")
                            : ex.status === "variants_ready" || ex.status === "draft"
                            ? `border ${CHIP_TONE_CLASS[examStatusView(ex.status).tone]}`
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
                          ? lobbyExamLabel(examStateOf(ex), ex.scheduled_lesson_date ? formatIsoDateLabel(ex.scheduled_lesson_date, { weekday: "short", day: "numeric", month: "short" }) : "")
                          : ex.status === "draft" || ex.status === "variants_ready"
                          ? examStatusView(ex.status).label
                          : ex.status === "closed"
                          ? "Завершён"
                          : "В архиве"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {ex.tasks_per_variant} заданий · {formatUtcNaiveAsBusinessDate(ex.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                  {access.showCode && ex.access_code && (ex.status === "active" || ex.status === "lobby") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void copyText(examLinkHere(ex.access_code!)).then((ok) => {
                          if (!ok) { showToast(COPY_FAILED_TEXT, "error"); return; }
                          setCopiedId(ex.exam_id);
                          setTimeout(() => setCopiedId(null), 2000);
                        });
                      }}
                      className={`group/code inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all duration-200 cursor-pointer ${
                        copiedId === ex.exam_id
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-card"
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

                  {links.exam(ex.exam_id, groupExamReturnHref) && (
                    <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-400 group-hover/exam:text-primary-600 group-hover/exam:border-primary-200 group-hover/exam:bg-primary-50 transition-all shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </ExamRow>
            ))}
          </div>
        )}
      </div>
      )}
      {assignTarget && (
        <ScheduleExamModal
          examTitle={assignTarget.title}
          groups={[group]}
          initialGroupId={groupId}
          deliveryMode={assignTarget.delivery_mode}
          noLessonHref={links.newExam}
          onClose={() => setAssignTarget(null)}
          onSubmit={async (selection) => {
            // the very function of the library's «Назначить»
            const outcome = await assignExamToLesson(examsApi, assignTarget, selection);
            setAssignTarget(null);
            if (outcome.kind === "print") {
              router.push(links.exam(assignTarget.exam_id, groupExamReturnHref) ?? groupExamReturnHref);
              return;
            }
            setAssignResult({ ...outcome.result, exam_id: assignTarget.exam_id, lesson_label: occurrenceLabel(selection.occurrence) });
            void load();
          }}
        />
      )}
      {assignResult && (
        <SuccessAssignModal result={assignResult} returnHref={groupExamReturnHref} onClose={() => setAssignResult(null)} />
      )}
      {toastNode}
    </>
  );
}
