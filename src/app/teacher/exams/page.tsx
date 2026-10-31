"use client";

import { useEffect, useState, useCallback, useMemo, useRef, useId } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  Copy,
  Check,
  Search,
  Pin,
  PinOff,
  Copy as CopyIcon,
  BookOpen,
  Zap,
  Library,
  ChevronRight,
  Layers,
  GraduationCap,
  Sparkles,
  MoreVertical,
  Pencil,
  Trash2,
  Radio,
  Archive,
  RotateCcw,
  Target,
} from "lucide-react";
import { examsApi, orgApi, type ExamSummary, type Group } from "@/lib/api";
import { businessDateWithOffset, formatIsoDateLabel } from "@/lib/business-time";
import { examListState, examTabOf, lobbyExamLabel, type DashboardExamState, type ExamTab } from "@/lib/exam-lobby";
import { useTodayLessonStatuses } from "@/lib/use-exam-lessons";
import { appendExamPage, tabCountLabel } from "@/lib/exam-library-paging";
import { examPassThreshold } from "@/lib/exam-pass-threshold";
import { ScheduleExamModal } from "@/components/exam/schedule-exam-modal";
import { RenameExamModal } from "@/components/exam/rename-exam-modal";
import { ExamRemovalDialog, useExamRemoval } from "@/components/exam/exam-removal";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { formatBusinessCalendarDate, formatUtcNaiveAsBusinessDate } from "@/lib/business-time";
import { useScrollLock } from "@/components/ui/modal";

// ─── Status Config ───────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; gradient: string; text: string; dot: string }> = {
  draft: {
    label: "Черновик",
    icon: <AlertCircle className="w-3 h-3" />,
    gradient: "from-amber-50 to-orange-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  variants_ready: {
    label: "Черновик",
    icon: <Clock className="w-3 h-3" />,
    gradient: "from-amber-50 to-orange-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  lobby: {
    label: "Лобби открыто",
    icon: <Radio className="w-3 h-3" />,
    gradient: "from-indigo-50 to-violet-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  // #159: a lobby exam whose lesson has not begun / has passed is not «в лобби»
  lobby_scheduled: {
    label: "Запланирован",
    icon: <Clock className="w-3 h-3" />,
    gradient: "from-sky-50 to-blue-50",
    text: "text-sky-700",
    dot: "bg-sky-400",
  },
  lobby_passed: {
    label: "Занятие прошло",
    icon: <AlertCircle className="w-3 h-3" />,
    gradient: "from-amber-50 to-orange-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  active: {
    label: "Идёт экзамен",
    icon: <CheckCircle className="w-3 h-3" />,
    gradient: "from-emerald-50 to-green-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  print_ready: {
    label: "Комплект готов",
    icon: <FileText className="w-3 h-3" />,
    gradient: "from-violet-50 to-indigo-50",
    text: "text-violet-700",
    dot: "bg-violet-500",
  },
  closed: {
    label: "Завершён",
    icon: <XCircle className="w-3 h-3" />,
    gradient: "from-slate-50 to-slate-100",
    text: "text-slate-500",
    dot: "bg-slate-400",
  },
  archived: {
    label: "В архиве",
    icon: <Archive className="w-3 h-3" />,
    gradient: "from-slate-100 to-slate-200",
    text: "text-slate-500",
    dot: "bg-slate-400",
  },
};

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gradient-to-r ${cfg.gradient} ${cfg.text} border border-white/80 shadow-sm`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {label ?? cfg.label}
    </span>
  );
}

// ─── Success Modal (after assign) ─────────────────────────────────────────────
interface SuccessModalProps {
  result: { access_code?: string | null; url?: string | null; group_name?: string | null; exam_id: string };
  returnHref: string;
  onClose: () => void;
}

function SuccessAssignModal({ result, returnHref, onClose }: SuccessModalProps) {
  const [copied, setCopied] = useState(false);
  useScrollLock(true); // mounted only while the dialog is open
  const fullUrl = typeof window !== "undefined" && result.access_code
    ? `${window.location.origin}/e/${result.access_code}`
    : result.url || "";

  const handleCopy = () => {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/60 p-6 space-y-5 text-center"
      >
        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle className="w-7 h-7" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">Экзамен назначен!</h3>
          {result.group_name && (
            <p className="text-xs text-slate-500 mt-1">Для группы <span className="font-semibold text-slate-800">{result.group_name}</span></p>
          )}
        </div>

        {result.access_code && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium">Код доступа для учеников:</p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="font-mono text-xl font-bold tracking-widest text-slate-900">{result.access_code}</span>
              <button
                onClick={handleCopy}
                className="p-2 text-slate-500 hover:text-primary-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="Скопировать ссылку"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Закрыть
          </button>
          <Link
            href={`/teacher/exams/${result.exam_id}?return_to=${encodeURIComponent(returnHref)}`}
            className="flex-1 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            В Hub экзамена
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Exam Card ────────────────────────────────────────────────────────────────
interface ExamCardProps {
  exam: ExamSummary;
  returnHref: string;
  onPin: (id: string) => void;
  onAssign: (exam: ExamSummary) => void;
  onClone: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  copiedId: string | null;
  onCopyCode: (exam: ExamSummary, e: React.MouseEvent) => void;
  /** #159: the state of a lobby exam by its lesson (one function with the dashboard and the monitor of the administrator). */
  lobbyState: DashboardExamState;
}

function ExamCard({
  exam,
  returnHref,
  onPin,
  onAssign,
  onClone,
  onRename,
  onArchive,
  onRestore,
  onDeletePermanently,
  copiedId,
  onCopyCode,
  lobbyState,
}: ExamCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const effectiveStatus = exam.status === "archived"
    ? "archived"
    : (!exam.group_id && (exam.status === "active" || exam.status === "lobby"))
    ? "draft"
    : exam.status;
  const isDraft = effectiveStatus === "draft" || effectiveStatus === "variants_ready";
  const isActive = effectiveStatus === "active";
  const isPrintReady = effectiveStatus === "print_ready";
  const isLobbyStatus = effectiveStatus === "lobby";            // the exam's own status
  const isLobby = isLobbyStatus && lobbyState === "lobby";      // the lobby is OPEN only while the lesson is on
  const badgeKey = !isLobbyStatus ? effectiveStatus : lobbyState === "lobby" ? "lobby" : lobbyState === "needs_resolution" ? "lobby_passed" : "lobby_scheduled";
  const badgeDay = exam.scheduled_lesson_date ? formatIsoDateLabel(exam.scheduled_lesson_date, { weekday: "short", day: "numeric", month: "short" }) : "";
  const isClosed = effectiveStatus === "closed";
  const isArchived = effectiveStatus === "archived";
  const canAssignGroup = !exam.group_id && isDraft;
  const canRename = exam.status === "draft" || exam.status === "variants_ready";
  // Drafts always reopen in the shared draft editor.  The read-only/live exam
  // page is reserved for an exam that has already left the draft stage.
  const returnTo = encodeURIComponent(returnHref);
  const examHref = isArchived
    ? "#"
    : isDraft
      ? `/teacher/exams/${exam.exam_id}/draft?return_to=${returnTo}`
      : `/teacher/exams/${exam.exam_id}?return_to=${returnTo}`;

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="group relative bg-white hover:bg-slate-50/70 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-primary-200 transition-all duration-200"
    >

      <Link href={examHref} className={`block p-5 ${isArchived ? "cursor-default opacity-85" : ""}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left info */}
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            {/* Icon */}
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                isArchived
                  ? "bg-slate-100 border border-slate-200 text-slate-400"
                  : isActive
                  ? "bg-emerald-50 border border-emerald-100 text-emerald-600"
                  : isPrintReady
                  ? "bg-violet-50 border border-violet-100 text-violet-600"
                  : isLobby
                  ? "bg-amber-50 border border-amber-100 text-amber-600 animate-pulse"
                  : isDraft
                  ? "bg-primary-50 border border-primary-100 text-primary-600"
                  : "bg-slate-50 border border-slate-200 text-slate-400"
              }`}
            >
              <FileText className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex-1">
              {/* Title row */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {exam.is_pinned && !isArchived && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight line-clamp-1 group-hover:text-primary-600 transition-colors">
                  {exam.title}
                </h3>
                <StatusBadge status={badgeKey} label={isLobbyStatus ? lobbyExamLabel(lobbyState, badgeDay) : undefined} />
                {exam.group_name ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <Users className="w-2.5 h-2.5" />
                    {exam.group_name}
                  </span>
                ) : !isArchived ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-600 border border-violet-100">
                    <Library className="w-2.5 h-2.5" />
                    Библиотека
                  </span>
                ) : null}
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {exam.tasks_per_variant} заданий
                </span>
                {exam.variants_count > 1 && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {exam.variants_count} вар.
                  </span>
                )}
                {exam.total_time_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {exam.total_time_minutes} мин
                  </span>
                )}
                {exam.delivery_mode !== "print" && (
                  <span className="flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    Порог: {examPassThreshold(exam)}%
                  </span>
                )}
                {exam.scheduled_lesson_date && (
                  <span className="flex items-center gap-1 font-medium text-primary-700">
                    <Clock className="w-3 h-3" />
                    Занятие: {formatBusinessCalendarDate(exam.scheduled_lesson_date, { day: "numeric", month: "short" })}
                  </span>
                )}
                {(exam.total_sessions || 0) > 0 && !isLobbyStatus && (
                  <span className="flex items-center gap-1 font-semibold text-emerald-600">
                    <GraduationCap className="w-3.5 h-3.5" />
                    {exam.total_sessions} сдали
                  </span>
                )}
                <span className="text-slate-400">
                  {formatUtcNaiveAsBusinessDate(exam.created_at, { day: "numeric", month: "short" })}
                </span>
              </div>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Actions Menu Trigger */}
            <div className="relative">
              <button
                ref={menuTriggerRef}
                type="button"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                aria-label="Опции экзамена"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                title="Опции экзамена"
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Portaled + flipped: never clipped by the card / list, reachable by keyboard and touch. */}
              <FloatingPanel
                id={menuId}
                open={menuOpen}
                triggerRef={menuTriggerRef}
                onClose={() => setMenuOpen(false)}
                width={208}
                label="Опции экзамена"
                className="bg-white rounded-xl shadow-xl border border-slate-200/80 py-1.5 space-y-0.5 text-xs"
              >
                    {canAssignGroup && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpen(false);
                          onAssign(exam);
                        }}
                        className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-primary-50 hover:text-primary-700 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-indigo-500" />
                        Назначить группе
                      </button>
                    )}

                    {!isArchived && (
                      <>
                        {canRename && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuOpen(false);
                              setShowRenameModal(true);
                            }}
                            className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-primary-50 hover:text-primary-700 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4 text-primary-500" />
                            Изменить название
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            onClone(exam.exam_id);
                          }}
                          className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <CopyIcon className="w-4 h-4 text-slate-400" />
                          Создать копию (клон)
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            onPin(exam.exam_id);
                          }}
                          className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          {exam.is_pinned ? (
                            <>
                              <PinOff className="w-4 h-4 text-amber-500" />
                              Открепить
                            </>
                          ) : (
                            <>
                              <Pin className="w-4 h-4 text-amber-500" />
                              Закрепить вверху
                            </>
                          )}
                        </button>

                        <div className="border-t border-slate-100 my-1" />

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            onArchive(exam.exam_id);
                          }}
                          className="w-full text-left px-3.5 py-2 text-amber-600 hover:bg-amber-50 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Archive className="w-4 h-4 text-amber-500" />
                          В архив
                        </button>
                      </>
                    )}

                    {isArchived && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            onRestore(exam.exam_id);
                          }}
                          className="w-full text-left px-3.5 py-2 text-emerald-600 hover:bg-emerald-50 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4 text-emerald-500" />
                          Восстановить
                        </button>

                        <div className="border-t border-slate-100 my-1" />

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            onDeletePermanently(exam.exam_id);
                          }}
                          className="w-full text-left px-3.5 py-2 text-rose-600 hover:bg-rose-50 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-rose-500" />
                          Удалить навсегда
                        </button>
                      </>
                    )}
              </FloatingPanel>
            </div>

            {!isArchived && (
              <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-primary-50 text-slate-400 group-hover:text-primary-600 flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
    <RenameExamModal
      open={showRenameModal}
      currentTitle={exam.title}
      onClose={() => setShowRenameModal(false)}
      onSave={(title) => onRename(exam.exam_id, title)}
    />
    </>
  );
}

const LIBRARY_PAGE_SIZE = 50;

// ─── Main Page ────────────────────────────────────────────────────────────────
type StatusTab = ExamTab;

function parseStatusTab(value: string | null): StatusTab {
  return value === "lobby" || value === "scheduled" || value === "draft" || value === "closed" || value === "archived" || value === "active"
    ? value
    : "active";
}

function libraryHref(status: StatusTab, query: string): string {
  const params = new URLSearchParams();
  if (status !== "active") params.set("status", status);
  if (query.trim()) params.set("q", query.trim());
  const serialized = params.toString();
  return serialized ? `/teacher/exams?${serialized}` : "/teacher/exams";
}

export default function TeacherExamsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  // The library arrives by pages: the server decides who may see what BEFORE it cuts a page, «Показать ещё» asks for the next one.
  const [hasMore, setHasMore] = useState(false);
  const [totalExams, setTotalExams] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const pagesLoadedRef = useRef(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // The first screen must surface work that is happening now. Drafts remain
  // one tap away, while active exams are the teacher's immediate priority.
  const [statusTab, setStatusTab] = useState<StatusTab>(() => parseStatusTab(searchParams.get("status")));
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groupsLoadError, setGroupsLoadError] = useState<string | null>(null);

  // Modals
  const [assignTarget, setAssignTarget] = useState<ExamSummary | null>(null);
  const [assignResult, setAssignResult] = useState<{ access_code?: string | null; url?: string | null; group_name?: string | null; exam_id: string } | null>(null);

  const fetchLibraryPages = useCallback(async (pages: number): Promise<{ items: ExamSummary[]; hasMore: boolean; total: number }> => {
    let items: ExamSummary[] = [];
    let more = false;
    let total = 0;
    for (let page = 1; page <= pages; page += 1) {
      const result = await examsApi.listPage({ page, size: LIBRARY_PAGE_SIZE, includeArchived: true });
      // An older server answers a plain array (everything it has): there is nothing more to ask for.
      if (Array.isArray(result)) return { items: appendExamPage(items, result), hasMore: false, total: result.length };
      items = appendExamPage(items, result.items || []);
      more = Boolean(result.has_more);
      total = Number(result.total || 0);
      if (!more) break;
    }
    return { items, hasMore: more, total };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setGroupsLoadError(null);
    setMoreError(null);
    try {
      const [examsResult, groupsResult] = await Promise.allSettled([
        // a refresh keeps as many pages as the teacher had already opened
        fetchLibraryPages(Math.max(1, pagesLoadedRef.current)),
        orgApi.listGroups(),
      ]);
      if (examsResult.status === "fulfilled") {
        setExams(examsResult.value.items);
        setHasMore(examsResult.value.hasMore);
        setTotalExams(examsResult.value.total);
        pagesLoadedRef.current = Math.max(1, Math.ceil(examsResult.value.items.length / LIBRARY_PAGE_SIZE));
      } else {
        // Never replace the library with an empty state after a failed retry.
        setLoadError(getDataLoadErrorMessage(examsResult.reason));
      }
      if (groupsResult.status === "fulfilled") {
        setGroups(Array.isArray(groupsResult.value) ? groupsResult.value : []);
      } else {
        setGroupsLoadError(getDataLoadErrorMessage(groupsResult.reason));
      }
    } finally {
      setLoading(false);
    }
  }, [fetchLibraryPages]);

  const loadMoreRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (loadMoreRef.current) return; // a double click must not ask for the same page twice
    loadMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const nextPage = pagesLoadedRef.current + 1;
      const result = await examsApi.listPage({ page: nextPage, size: LIBRARY_PAGE_SIZE, includeArchived: true });
      if (Array.isArray(result)) return;
      pagesLoadedRef.current = nextPage;
      setExams((previous) => appendExamPage(previous, result.items || []));
      setHasMore(Boolean(result.has_more));
      setTotalExams(Number(result.total || 0));
    } catch (error) {
      setMoreError(getDataLoadErrorMessage(error));
    } finally {
      loadMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (pathname !== "/teacher/exams") return;
    loadData();
  }, [pathname, loadData]);

  // The visible filter belongs to the page URL. This prevents a return from a
  // draft or an exam hub from silently resetting the teacher to "Текущие".
  useEffect(() => {
    const nextStatus = parseStatusTab(searchParams.get("status"));
    const nextQuery = searchParams.get("q") || "";
    setStatusTab((current) => current === nextStatus ? current : nextStatus);
    setSearchQuery((current) => current === nextQuery ? current : nextQuery);
  }, [searchParams]);

  const updateLibraryState = (nextStatus: StatusTab, nextQuery: string) => {
    setStatusTab(nextStatus);
    setSearchQuery(nextQuery);
    router.replace(libraryHref(nextStatus, nextQuery), { scroll: false });
  };

  const currentLibraryHref = libraryHref(statusTab, searchQuery);

  // A search must not miss an exam that is on a page not opened yet: while a query is typed, the rest is fetched.
  useEffect(() => {
    if (searchQuery.trim() && hasMore && !loading && !loadingMore && !moreError) void loadMore();
  }, [searchQuery, hasMore, loading, loadingMore, moreError, loadMore, exams.length]);

  const handleCopyCode = (exam: ExamSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!exam.access_code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://algo.uz";
    navigator.clipboard.writeText(`${origin}/e/${exam.access_code}`);
    setCopiedId(exam.exam_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePin = async (examId: string) => {
    try {
      const res = await examsApi.pin(examId);
      setExams((prev) =>
        prev.map((e) => e.exam_id === examId ? { ...e, is_pinned: res.is_pinned } : e)
      );
    } catch {}
  };

  const handleClone = async (examId: string) => {
    try {
      const res = await examsApi.clone(examId);
      // A clone is always an editable draft (even when it has copied
      // variants), so keep it in the common draft editor rather than opening
      // the read-only/live exam screen.
      router.push(`/teacher/exams/${res.exam_id}/draft?return_to=${encodeURIComponent(currentLibraryHref)}`);
    } catch (err: any) {
      alert("Не удалось создать копию экзамена: " + (err?.message || "Повторите попытку."));
    }
  };

  const handleRename = async (examId: string, title: string) => {
    const result = await examsApi.rename(examId, title);
    setExams((prev) => prev.map((exam) => (
      exam.exam_id === examId ? { ...exam, title: result.title } : exam
    )));
  };

  const handleArchive = async (examId: string) => {
    try {
      await examsApi.delete(examId, false);
      setExams((prev) =>
        prev.map((e) => e.exam_id === examId ? { ...e, status: "archived", is_pinned: false } : e)
      );
    } catch (err: any) {
      alert(err?.message || "Не удалось отправить экзамен в архив");
    }
  };

  // One restore per exam at a time.  If the server says the exam is not archived any more (a twin click or another tab
  // already restored it), the list is simply refreshed: there is nothing to report.
  const restoringRef = useRef<Set<string>>(new Set());
  const handleRestore = async (examId: string) => {
    if (restoringRef.current.has(examId)) return;
    restoringRef.current.add(examId);
    try {
      const res = await examsApi.restore(examId);
      setExams((prev) =>
        prev.map((e) => e.exam_id === examId ? { ...e, status: res.status || "draft" } : e)
      );
    } catch (err: any) {
      if (err?.status === 409 && err?.code === "EXAM_NOT_ARCHIVED") {
        await loadData();
      } else {
        alert(err?.message || "Не удалось восстановить экзамен");
      }
    } finally {
      restoringRef.current.delete(examId);
    }
  };

  // «Удалить навсегда»: our dialog (not the browser's confirm) that says what archive would do instead and shows the
  // server's refusal (an exam with results is only archived).
  const removal = useExamRemoval((_mode, examId) => {
    setExams((prev) => prev.filter((e) => e.exam_id !== examId));
  });
  const handleDeletePermanently = (examId: string) => {
    const exam = exams.find((e) => e.exam_id === examId);
    removal.ask({ mode: "delete", examId, title: exam?.title ?? "" });
  };

  const handleAssigned = (examId: string, result: any) => {
    setAssignTarget(null);
    setAssignResult({ ...result, exam_id: examId });
    loadData(); // refresh list
  };

  // #159: the state of a lobby exam follows its lesson - ONE function for the counters, the tabs and the badges (the dashboard and the administrator's monitor use the same)
  const today = businessDateWithOffset(0);
  const lessons = useTodayLessonStatuses(exams, today);
  const stateOf = useCallback((e: ExamSummary) => examListState(e, today, lessons.statusOf(e)), [today, lessons]);

  // Counts: what the tab shows
  const counts = useMemo(() => {
    const tally: Record<ExamTab, number> = { active: 0, lobby: 0, scheduled: 0, draft: 0, closed: 0, archived: 0 };
    for (const e of exams) tally[examTabOf(e, stateOf(e))] += 1;
    return tally;
  }, [exams, stateOf]);

  // Filtered + sorted
  const filteredExams = useMemo(() => {
    let list = exams.filter((ex) => {
      if (examTabOf(ex, stateOf(ex)) !== statusTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          ex.title.toLowerCase().includes(q) ||
          (ex.access_code || "").toLowerCase().includes(q) ||
          (ex.group_name || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
    // pinned first
    return [...list.filter((e) => e.is_pinned), ...list.filter((e) => !e.is_pinned)];
  }, [exams, statusTab, searchQuery, stateOf]);

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-16 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-violet-600 flex items-center justify-center shadow-md shadow-primary-500/30">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Библиотека экзаменов</h1>
          </div>
          <p className="text-slate-500 text-sm ml-13 pl-[52px]">
            Создавайте шаблоны и назначайте их разным группам
          </p>
        </div>
        <Link
          href="/teacher/exams/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white rounded-xl font-semibold shadow-md shadow-primary-600/25 hover:shadow-lg transition-all self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Создать экзамен
        </Link>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Текущие", value: tabCountLabel(counts.active, hasMore), color: "text-emerald-700", bg: "bg-emerald-50", icon: <Zap className="w-4 h-4 text-emerald-500" /> },
          { label: "Лобби открыто", value: tabCountLabel(counts.lobby, hasMore), color: "text-indigo-700", bg: "bg-indigo-50", icon: <Radio className="w-4 h-4 text-indigo-500" /> },
          { label: "Запланированы", value: tabCountLabel(counts.scheduled, hasMore), color: "text-sky-700", bg: "bg-sky-50", icon: <Clock className="w-4 h-4 text-sky-500" /> },
          { label: "Черновики", value: tabCountLabel(counts.draft, hasMore), color: "text-amber-700", bg: "bg-amber-50", icon: <AlertCircle className="w-4 h-4 text-amber-500" /> },
          { label: "Завершены", value: tabCountLabel(counts.closed, hasMore), color: "text-slate-500", bg: "bg-slate-100", icon: <XCircle className="w-4 h-4 text-slate-400" /> },
        ].map((s, index, all) => (
          // #159 E9: five cards in two columns - the odd last one takes the whole row of a phone instead of standing alone
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-white shadow-sm flex items-center gap-3 ${index === all.length - 1 && all.length % 2 === 1 ? "col-span-2 md:col-span-1" : ""}`}>
            <div className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center shadow-sm">
              {s.icon}
            </div>
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/70 rounded-xl overflow-x-auto">
          {(["active", "lobby", "scheduled", "draft", "closed", "archived"] as StatusTab[]).map((tab) => {
            const labels: Record<StatusTab, string> = {
              active: "Текущие",
              lobby: "Лобби",
              scheduled: "Запланированы",
              draft: "Черновики",
              closed: "Завершённые",
              archived: "Архив",
            };
            return (
              <button
                key={tab}
                onClick={() => updateLibraryState(tab, searchQuery)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  statusTab === tab
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {labels[tab]}
                {counts[tab] > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    statusTab === tab ? "bg-primary-100 text-primary-700" : "bg-slate-200 text-slate-500"
                  }`}>
                    {tabCountLabel(counts[tab], hasMore)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => updateLibraryState(statusTab, e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
          <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          Загрузка библиотеки...
        </div>
      ) : loadError && exams.length === 0 ? (
        <DataLoadError title="Не удалось загрузить экзамены" message={loadError} onRetry={loadData} />
      ) : filteredExams.length === 0 && !hasMore ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-12 text-center border border-slate-200/80"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-violet-50 border border-primary-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-primary-400" />
          </div>
          <p className="text-slate-700 font-semibold text-base">
            {searchQuery ? "Ничего не найдено" : statusTab === "archived" ? "В архиве пока нет экзаменов" : "В этом разделе нет экзаменов"}
          </p>
          <p className="text-sm text-slate-400 mt-1 mb-6">
            {searchQuery
              ? "Попробуйте другой запрос"
              : statusTab === "archived"
              ? "Удалённые экзамены будут сохраняться здесь"
              : statusTab === "draft"
              ? "Создайте первый экзамен — он сохранится здесь как шаблон"
              : "Экзамены появятся здесь при переходе в выбранный статус"}
          </p>
          {!searchQuery && statusTab !== "archived" && (
            <Link
              href="/teacher/exams/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 text-white rounded-xl font-semibold shadow-md shadow-primary-600/25 hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              Создать первый экзамен
            </Link>
          )}
        </motion.div>
      ) : (
        <>
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {filteredExams.map((ex) => (
              <ExamCard
                key={ex.exam_id}
                exam={ex}
                returnHref={currentLibraryHref}
                onPin={handlePin}
                onAssign={setAssignTarget}
                onClone={handleClone}
                onRename={handleRename}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onDeletePermanently={handleDeletePermanently}
                copiedId={copiedId}
                onCopyCode={handleCopyCode}
                lobbyState={stateOf(ex)}
              />
            ))}
          </div>
        </AnimatePresence>
        {filteredExams.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            {searchQuery ? "Ищем среди остальных экзаменов…" : "Среди уже загруженных экзаменов здесь пусто."}
          </p>
        )}
        </>
      )}

      {hasMore && !loading && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-xs text-slate-500">Показано {exams.length} из {totalExams}</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />}
            Показать ещё
          </button>
          {moreError && <p role="alert" className="text-xs font-medium text-rose-600">{moreError} Нажмите «Показать ещё», чтобы повторить.</p>}
        </div>
      )}

      <ExamRemovalDialog
        removal={removal.removal}
        busy={removal.busy}
        error={removal.error}
        blocked={removal.blocked}
        onConfirm={removal.confirm}
        onClose={removal.close}
      />

      {(loadError || groupsLoadError) && exams.length > 0 && (
        <DataLoadError
          compact
          title={loadError ? "Библиотека экзаменов не обновлена" : "Список групп не обновлён"}
          message={`${loadError || groupsLoadError} Показаны последние успешно загруженные данные.`}
          onRetry={loadData}
          className="mt-5"
        />
      )}

      {/* Scheduling is explicit: a public lobby always belongs to one lesson. */}
      <AnimatePresence>
        {assignTarget && (
          <ScheduleExamModal
            examTitle={assignTarget.title}
            groups={groups}
            initialGroupId={assignTarget.group_id}
            deliveryMode={assignTarget.delivery_mode}
            onClose={() => setAssignTarget(null)}
            onSubmit={async ({ group, occurrence }) => {
              if (assignTarget.delivery_mode === "print") {
                await examsApi.preparePrintPackage(assignTarget.exam_id, {
                  group_id: group.id,
                  lesson_id: occurrence.id,
                  lesson_date: occurrence.occurrenceDate,
                });
                setAssignTarget(null);
                router.push(`/teacher/exams/${assignTarget.exam_id}?return_to=${encodeURIComponent(currentLibraryHref)}`);
                return;
              }

              const result = await examsApi.assign(assignTarget.exam_id, {
                group_id: group.id,
                publish: true,
                lesson_id: occurrence.id,
                lesson_date: occurrence.occurrenceDate,
              });
              handleAssigned(assignTarget.exam_id, result);
            }}
          />
        )}
        {assignResult && (
          <SuccessAssignModal
            result={assignResult}
            returnHref={currentLibraryHref}
            onClose={() => setAssignResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
