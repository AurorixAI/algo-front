"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import QRCode from "qrcode.react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathRenderer } from "@/components/ui/math-renderer";
import { TaskStatement } from "@/components/ui/task-statement";
import { ScheduleExamModal } from "@/components/exam/schedule-exam-modal";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { RenameExamModal } from "@/components/exam/rename-exam-modal";
import { TaskFigureDrawer } from "@/components/tasks/TaskFigureDrawer";
import { pickAnswerDisplayText, pickDistractorExplanation, formatErrorType } from "@/lib/task-display";
import { formatBusinessDate, formatIsoDateLabel } from "@/lib/business-time";
import { examHasLobby, isNoLobbyConflict } from "@/lib/exam-lobby";
import { examsApi, orgApi, type Group, type PrintPackageMetadata, type ScheduleOccurrence } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Users,
  Play,
  CheckCircle2,
  Clock,
  BookOpen,
  Copy,
  Check,
  QrCode,
  Layers,
  BarChart3,
  Sparkles,
  RefreshCw,
  X,
  UserX,
  AlertTriangle,
  FileText,
  Download,
  Flame,
  ExternalLink,
  ChevronRight,
  Bookmark,
  Shuffle,
  Eye,
  EyeOff,
  Radio,
  StopCircle,
  MoreVertical,
  Trash2,
  Archive,
  RotateCcw,
  Pin,
  PinOff,
  Edit3,
  Plus,
  TrendingDown,
  Award,
  Target,
  Loader2,
  FileBarChart2,
  Info,
  CalendarDays,
} from "lucide-react";

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface DistractorMeta {
  value: string;
  value_latex?: string | null;
  error_type: string;
  explanation?: string | null;
  error_logic?: string | null;
  error_logic_latex?: string | null;
  plausibility: number;
}

interface DraftTask {
  task_id: string;
  skill_id: string;
  skill_name: string;
  difficulty: string;
  question_text: string;
  question_latex: string | null;
  question_image_url: string | null;
  answer_type: string;
  correct_answer: string;
  correct_answer_latex?: string | null;
  answer_options: string[] | null;
  distractor_meta: DistractorMeta[] | null;
  is_template_generated: boolean;
}

interface DraftVariant {
  variant_id: string;
  variant_number: number;
  total_points: number;
  tasks: DraftTask[];
}

interface ExamDetail {
  id: string;
  exam_id?: string;
  title: string;
  subject?: string;
  status: string;
  access_code?: string | null;
  total_time_minutes: number;
  variants_count: number;
  tasks_per_variant: number;
  group_id?: string | null;
  group_name?: string | null;
  class_level?: number | null;
  scheduled_lesson_id?: string | null;
  scheduled_lesson_date?: string | null;
  delivery_mode: "online" | "print";
  print_package?: PrintPackageMetadata | null;
  is_pinned?: boolean;
  variants: DraftVariant[];
  created_at: string;
}

interface LobbyStudent {
  session_id: string;
  student_id?: string | null;
  display_id?: string | null;
  student_name: string;
  status: "waiting" | "in_progress" | "submitted";
  variant_number: number;
  answered_count: number;
  total_tasks: number;
  score: number;
  max_score: number;
  started_at?: string | null;
  submitted_at?: string | null;
}

interface Alternative {
  task_id: string;
  question_text: string;
  question_latex: string | null;
  difficulty: string;
  correct_answer: string;
  answer_type: string;
}

interface TaskSection {
  name: string;
  tasks: DraftTask[];
}

const diffColors: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 border-emerald-200",
  B: "bg-amber-50 text-amber-700 border-amber-200",
  C: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * Keep the operational task view in the same canonical order as the draft
 * editor and printed package: sections appear by their first task, and every
 * following task of that section stays with it.  The persisted array remains
 * a source list; it must never become a competing display numbering.
 */
function groupTasksIntoSections(tasks: DraftTask[]): TaskSection[] {
  const groups = new Map<string, DraftTask[]>();
  for (const task of tasks) {
    const name = task.skill_name || task.skill_id || "Без категории";
    const group = groups.get(name);
    if (group) group.push(task);
    else groups.set(name, [task]);
  }
  return Array.from(groups, ([name, sectionTasks]) => ({ name, tasks: sectionTasks }));
}

function taskCountLabel(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "заданий";
  if (lastDigit === 1) return "задание";
  if (lastDigit >= 2 && lastDigit <= 4) return "задания";
  return "заданий";
}

function formatBoundLessonLabel(
  lessonDate?: string | null,
  occurrence?: ScheduleOccurrence | null,
): string | null {
  if (!lessonDate) return null;
  const date = formatIsoDateLabel(lessonDate, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return occurrence ? `${date} · ${occurrence.startTime}–${occurrence.endTime}` : date;
}

function safeTeacherReturnPath(value: string | null): string | null {
  return value && value.startsWith("/teacher/") && !value.startsWith("//") ? value : null;
}

export default function ExamHubPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const examId = params.id as string;

  // Group context for intelligent back navigation
  const fromGroup = searchParams.get("from_group");
  const fromName = searchParams.get("from_name");
  const returnTo = safeTeacherReturnPath(searchParams.get("return_to"));

  // State
  const [activeTab, setActiveTab] = useState<"lobby" | "tasks" | "analytics">("lobby");
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live Lobby State
  const [lobbyStudents, setLobbyStudents] = useState<LobbyStudent[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Tasks & Variants Tab State
  const [selectedVariant, setSelectedVariant] = useState(1);
  const [replaceTarget, setReplaceTarget] = useState<DraftTask | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replacingTaskId, setReplacingTaskId] = useState<string | null>(null);
  const [showDistractors, setShowDistractors] = useState<Record<string, boolean>>({});
  const [showAnswers, setShowAnswers] = useState(false);

  // Analytics Tab State
  const [sessions, setSessions] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [report, setReport] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [analyticsLoadError, setAnalyticsLoadError] = useState<string | null>(null);
  const [isRetryingAnalytics, setIsRetryingAnalytics] = useState(false);
  const [reportStep, setReportStep] = useState<0 | 1 | 2 | 3>(0); // 0=idle, 1-3=generating steps
  const [studentActionMenu, setStudentActionMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const menuBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const analyticsRequestIdRef = useRef(0);

  // Group Assignment & Quick Actions State
  const [groups, setGroups] = useState<Group[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeliveryDecisionModal, setShowDeliveryDecisionModal] = useState(false);
  const [showDeliveryCancellation, setShowDeliveryCancellation] = useState(false);
  const [returnToDeliveryDecision, setReturnToDeliveryDecision] = useState(false);
  const [deliveryCancellationReason, setDeliveryCancellationReason] = useState("");
  const [deliveryCancellationError, setDeliveryCancellationError] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [boundLesson, setBoundLesson] = useState<ScheduleOccurrence | null>(null);

  // ─── Fetch Initial Data ───────────────────────────────────────────────────
  const fetchExam = async () => {
    try {
      const data = await examsApi.getDraft(examId);
      const examData = {
        ...data,
        id: data.exam_id || examId,
      };
      setExam(examData);
      return examData;
    } catch (err: any) {
      console.error("Failed to load exam:", err);
      setError(err.message || "Не удалось загрузить экзамен");
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExam();
    orgApi.listGroups().then((res) => setGroups(Array.isArray(res) ? res : [])).catch(() => {});
  }, [examId]);

  // A scheduled lesson is a concrete occurrence, not merely a group.  Read
  // its current time and room from the schedule so a reschedule is reflected
  // in the exam card without changing the immutable exam binding.
  useEffect(() => {
    let cancelled = false;
    const groupId = exam?.group_id;
    const lessonId = exam?.scheduled_lesson_id;
    const lessonDate = exam?.scheduled_lesson_date;
    if (!groupId || !lessonId || !lessonDate) {
      setBoundLesson(null);
      return;
    }

    orgApi.getScheduleOccurrences({ dateFrom: lessonDate, dateTo: lessonDate })
      .then((items) => {
        if (cancelled) return;
        const occurrence = (Array.isArray(items) ? items : []).find(
          (item) => item.id === lessonId && item.groupId === groupId && item.occurrenceDate === lessonDate,
        );
        setBoundLesson(occurrence || null);
      })
      .catch(() => {
        if (!cancelled) setBoundLesson(null);
      });

    return () => { cancelled = true; };
  }, [exam?.group_id, exam?.scheduled_lesson_id, exam?.scheduled_lesson_date]);

  // ─── Live Polling for Lobby & Active Exam ──────────────────────────────────
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    // Бумажный экзамен не имеет публичного лобби или веб-сессий учеников.
    // Не опрашиваем online-маршрут: это исключает ложные статусы и лишние запросы.
    if (exam?.delivery_mode === "print") {
      setLobbyStudents([]);
      setTimeRemaining(null);
      return;
    }
    // Пока данные экзамена не загружены, тип выдачи неизвестен: не угадываем, иначе
    // печатный экзамен получит 409 уже на первом запросе (и ошибку в консоли браузера).
    if (!examHasLobby(exam)) return;

    const pollStatus = async () => {
      try {
        const lobbyData = await examsApi.getLobbyStatus(examId);
        setLobbyStudents(lobbyData.students || []);
        if (typeof lobbyData.time_remaining_seconds === "number") {
          const serverSec = lobbyData.time_remaining_seconds;
          setTimeRemaining((prev) => {
            if (prev === null) return serverSec;
            if (Math.abs(prev - serverSec) > 3) {
              return serverSec;
            }
            return prev;
          });
        }
        if (exam && (lobbyData.status !== exam.status || (!exam.access_code && lobbyData.access_code))) {
          setExam((prev) => (prev ? { ...prev, status: lobbyData.status, access_code: lobbyData.access_code || prev.access_code } : null));
        }
      } catch (err) {
        // 409 = у экзамена нет лобби (стал печатным): больше не опрашиваем (эффект
        // перезапустится по смене delivery_mode и уйдёт в печатную ветку).
        // Остальные ошибки опроса — тихие, следующий тик повторит запрос.
        if (isNoLobbyConflict(err)) {
          if (interval) clearInterval(interval);
          interval = null;
          setLobbyStudents([]);
          setTimeRemaining(null);
          // Экзамен печатный, а страница считала его онлайн-экзаменом: переключаем
          // интерфейс на печатный режим (кнопки лобби/запуска онлайн-сессий уходят).
          setExam((prev) => (prev && prev.delivery_mode !== "print" ? { ...prev, delivery_mode: "print" } : prev));
        }
      }
    };

    pollStatus();
    interval = setInterval(pollStatus, 2500);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [examId, exam?.status, exam?.delivery_mode]);

  // ─── Local 1-second Countdown Ticker ──────────────────────────────────────
  useEffect(() => {
    if (exam?.status !== "active" || timeRemaining === null || timeRemaining <= 0) return;
    const ticker = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(ticker);
  }, [exam?.status, timeRemaining !== null && timeRemaining > 0]);

  const formatRemainingTimer = (sec: number | null) => {
    if (sec === null || sec === undefined) return "--:--";
    if (sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ─── Background Scroll Lock When Any Modal Is Open ────────────────────────
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      replaceTarget || showQrModal || showAssignModal || showScheduleModal || showDeliveryDecisionModal,
    );
    if (isAnyModalOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [replaceTarget, showQrModal, showAssignModal, showScheduleModal, showDeliveryDecisionModal]);

  // ─── Load Analytics on Tab Switch ─────────────────────────────────────────
  // A printed exam has no web answer sessions. It therefore must not request
  // or expose online analytics before a separate manual-marking workflow exists.
  const loadAnalytics = useCallback(async (isManualRetry = false) => {
    if (activeTab !== "analytics" || exam?.delivery_mode === "print") return;

    // A new request invalidates all previous responses. This is especially
    // important when a teacher clicks «Повторить» while the first request is
    // still completing: an old failure must not overwrite new data.
    const requestId = analyticsRequestIdRef.current + 1;
    analyticsRequestIdRef.current = requestId;
    setAnalyticsLoadError(null);
    setReportError(null);
    if (isManualRetry) setIsRetryingAnalytics(true);

    try {
      // A report is optional and exists only after an exam is finished. Its
      // expected 404 must not make valid results look like a failed refresh.
      const [sData, aData] = await Promise.all([
        examsApi.getSessions(examId),
        examsApi.getAnalytics(examId),
      ]);
      if (analyticsRequestIdRef.current !== requestId) return;

      const nextSessions = Array.isArray(sData) ? sData : [];
      setSessions(nextSessions);
      setAnalytics(aData);
      setReport(null);

      const canHaveReport = ["closed", "archived"].includes(exam?.status || "")
        && nextSessions.some((session) => session.status === "submitted");
      if (!canHaveReport) return;

      try {
        const reportData = await examsApi.getReport(examId);
        if (analyticsRequestIdRef.current === requestId) setReport(reportData);
      } catch (reportLoadError: any) {
        // A 404 only means that the optional narrative report has not yet
        // been generated. It is not an error in sessions or analytics.
        if (analyticsRequestIdRef.current === requestId && reportLoadError?.status !== 404) {
          setReportError(getDataLoadErrorMessage(reportLoadError));
        }
      }
    } catch (error) {
      if (analyticsRequestIdRef.current === requestId) {
        setAnalyticsLoadError(getDataLoadErrorMessage(error));
      }
    } finally {
      if (analyticsRequestIdRef.current === requestId) {
        setIsRetryingAnalytics(false);
      }
    }
  }, [activeTab, exam?.delivery_mode, exam?.status, examId]);

  useEffect(() => {
    void loadAnalytics();
    return () => {
      // Do not let a request from a previous tab or exam update this screen.
      analyticsRequestIdRef.current += 1;
    };
  }, [loadAnalytics]);

  const handleRetryAnalytics = useCallback(() => {
    void loadAnalytics(true);
  }, [loadAnalytics]);

  // Guard against a stale client state after an exam is prepared for print.
  // The only operational tabs for this delivery mode are the print package and
  // its fixed tasks/variants.
  useEffect(() => {
    if (exam?.delivery_mode === "print" && activeTab === "analytics") {
      setActiveTab("lobby");
    }
  }, [activeTab, exam?.delivery_mode]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAssignGroup = async (group: Group) => {
    setAssignLoading(true);
    try {
      await examsApi.assign(examId, {
        group_id: group.id,
        group_name: group.name,
        class_level: group.class_level || undefined,
        publish: false,
      });
      await fetchExam();
      setShowAssignModal(false);
    } catch (err: any) {
      alert("Не удалось привязать к группе: " + (err.message || ""));
    } finally {
      setAssignLoading(false);
    }
  };

  const handleClone = async () => {
    try {
      const res = await examsApi.clone(examId);
      router.push(`/teacher/exams/${res.exam_id}/draft?return_to=${encodeURIComponent(backHref)}`);
    } catch (err: any) {
      alert("Не удалось скопировать экзамен: " + (err.message || ""));
    }
  };

  const handleRename = async (title: string) => {
    const result = await examsApi.rename(examId, title);
    setExam((previous) => previous ? { ...previous, title: result.title } : previous);
  };

  const handlePin = async () => {
    try {
      const res = await examsApi.pin(examId);
      setExam((prev) => (prev ? { ...prev, is_pinned: res.is_pinned } : null));
    } catch {}
  };

  const handleArchive = async () => {
    if (!confirm("Перенести этот экзамен в архив? Вы сможете найти и восстановить его в любой момент из раздела «Архив».")) return;
    try {
      await examsApi.delete(examId, false);
      router.push(backHref);
    } catch (err: any) {
      alert("Не удалось перенести экзамен в архив: " + (err.message || ""));
    }
  };

  const handleRestore = async () => {
    try {
      const res = await examsApi.restore(examId);
      setExam((prev) => (prev ? { ...prev, status: res.status || "draft" } : null));
    } catch (err: any) {
      alert("Не удалось восстановить экзамен: " + (err.message || ""));
    }
  };

  const handleDeletePermanently = async () => {
    if (!confirm("Вы действительно хотите навсегда удалить этот экзамен? Это действие нельзя отменить.")) return;
    try {
      await examsApi.delete(examId, true);
      router.push(backHref);
    } catch (err: any) {
      alert("Не удалось удалить экзамен: " + (err.message || ""));
    }
  };

  const handleOpenLobby = async () => {
    setShowScheduleModal(true);
  };

  const closeDeliveryDecisionModal = () => {
    if (actionLoading) return;
    setShowDeliveryDecisionModal(false);
    setShowDeliveryCancellation(false);
    setReturnToDeliveryDecision(false);
    setDeliveryCancellationError(null);
    setDeliveryCancellationReason("");
  };

  const handleCancelDelivery = async () => {
    const reason = deliveryCancellationReason.trim();
    if (reason.length < 3) {
      setDeliveryCancellationError("Укажите короткую причину отмены проведения.");
      return;
    }
    setActionLoading(true);
    setDeliveryCancellationError(null);
    try {
      const result = await examsApi.cancelDelivery(examId, { reason });
      setExam((previous) => previous ? {
        ...previous,
        status: result.status,
        access_code: null,
        scheduled_lesson_id: null,
        scheduled_lesson_date: null,
        print_package: previous.print_package
          ? { ...previous.print_package, status: "voided" }
          : previous.print_package,
      } : previous);
      setShowDeliveryCancellation(false);
      setShowDeliveryDecisionModal(false);
      setDeliveryCancellationReason("");
      setActiveTab("lobby");
    } catch (err: any) {
      setDeliveryCancellationError(err.message || "Не удалось отменить проведение экзамена");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartLive = async () => {
    setActionLoading(true);
    try {
      if (exam?.delivery_mode === "print") {
        const result = await examsApi.startPrintPackage(examId);
        setExam((prev) => (prev ? {
          ...prev,
          status: result.status,
          print_package: result.print_package,
        } : null));
      } else {
        await examsApi.startLive(examId);
        setExam((prev) => (prev ? { ...prev, status: "active" } : null));
      }
    } catch (err: any) {
      alert("Ошибка при запуске экзамена: " + (err.message || ""));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseExam = async () => {
    if (!confirm("Вы уверены, что хотите завершить экзамен? Студенты больше не смогут вносить ответы.")) return;
    setActionLoading(true);
    try {
      await examsApi.close(examId);
      setExam((prev) => (prev ? { ...prev, status: "closed" } : null));
    } catch (err: any) {
      alert("Ошибка при завершении экзамена: " + (err.message || ""));
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickStudent = async (sessionId: string, studentName: string) => {
    if (!confirm(`Удалить участника «${studentName}» из сессии?`)) return;
    try {
      await examsApi.kickStudent(examId, sessionId);
      setLobbyStudents((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch (err: any) {
      alert("Ошибка при удалении ученика: " + (err.message || ""));
    }
  };

  const handleCopyCode = () => {
    if (!exam?.access_code) return;
    navigator.clipboard.writeText(exam.access_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!exam?.access_code) return;
    const url = `${window.location.origin}/e/${exam.access_code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenReplace = async (task: DraftTask) => {
    setReplaceTarget(task);
    setReplaceError(null);
    setAltLoading(true);
    try {
      const res = await examsApi.getAlternatives(examId, selectedVariant, task.task_id);
      setAlternatives(Array.isArray(res) ? res : (res as any)?.alternatives || []);
    } catch (err: any) {
      setAlternatives([]);
      setReplaceError(err.message || "Не удалось загрузить альтернативные задачи");
    } finally {
      setAltLoading(false);
    }
  };

  const handleConfirmReplace = async (newTaskId: string) => {
    if (!replaceTarget) return;
    const isDraft = !exam?.group_id || exam?.status === "draft" || exam?.status === "variants_ready";
    if (!isDraft) {
      setReplaceError("Замена задач возможна только в режиме черновика до запуска экзамена.");
      return;
    }
    setReplacingTaskId(newTaskId);
    setReplaceError(null);
    try {
      await examsApi.replaceTask(examId, {
        variant_number: selectedVariant,
        task_id: replaceTarget.task_id,
        old_task_id: replaceTarget.task_id,
        new_task_id: newTaskId,
      });
      await fetchExam();
      setReplaceTarget(null);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("черновик") || msg.includes("draft")) {
        setReplaceError("Замена задач возможна только в режиме черновика до запуска экзамена.");
      } else {
        setReplaceError(msg || "Не удалось заменить задачу");
      }
    } finally {
      setReplacingTaskId(null);
    }
  };

  const handleGenerateReport = async () => {
    if (exam?.status !== "closed" && exam?.status !== "archived") return;
    setReportError(null);
    setReportLoading(true);
    setReportStep(1); // Step 1: instant
    try {
      await new Promise((r) => setTimeout(r, 700));
      setReportStep(2); // Step 2: LLM call
      const rep = await examsApi.generateReport(examId, true);
      setReportStep(3); // Step 3: finalizing
      await new Promise((r) => setTimeout(r, 600));
      setReport(rep);
    } catch (err: any) {
      setReportError(err.message || "Не удалось сформировать отчёт по экзамену");
    } finally {
      setReportLoading(false);
      setReportStep(0);
    }
  };

  const handleOpenStudentMenu = useCallback((rowKey: string) => {
    const btn = menuBtnRefs.current[rowKey];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 90;
    const safeMargin = 20;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Flip upwards if space below is tighter than 130px and there is room above
    const openUpwards = spaceBelow < 130 && spaceAbove > spaceBelow;

    let top: number;
    if (openUpwards) {
      top = Math.max(safeMargin, rect.top - menuHeight - 8);
    } else {
      top = Math.min(window.innerHeight - menuHeight - safeMargin, rect.bottom + 8);
    }

    setMenuAnchor({
      top,
      right: Math.max(safeMargin, window.innerWidth - rect.right),
    });
    setStudentActionMenu((prev) => (prev === rowKey ? null : rowKey));
  }, []);

  // Close portal menu on scroll or click outside
  useEffect(() => {
    if (!studentActionMenu) return;
    const close = () => { setStudentActionMenu(null); setMenuAnchor(null); };
    window.addEventListener("scroll", close, { capture: true, passive: true });
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      document.removeEventListener("mousedown", close);
    };
  }, [studentActionMenu]);

  const currentVariantData = useMemo(() => {
    if (!exam?.variants || exam.variants.length === 0) return null;
    return exam.variants.find((v) => v.variant_number === selectedVariant) || exam.variants[0];
  }, [exam, selectedVariant]);

  // This is intentionally shared in behaviour with the draft editor and the
  // PDF package builder.  A task number is a visible identity, so it cannot
  // depend on whether the teacher is looking at a flat card list or a PDF.
  const currentVariantSections = useMemo(
    () => groupTasksIntoSections(currentVariantData?.tasks || []),
    [currentVariantData]
  );

  const hasOpenDistractors = useMemo(
    () => Object.values(showDistractors).some(Boolean),
    [showDistractors]
  );

  // Back link URL and Label
  const backHref = returnTo || (fromGroup ? `/teacher/groups/${fromGroup}?tab=exams` : "/teacher/exams");
  const backLabel = returnTo?.startsWith("/teacher/groups/")
    ? (fromName ? `Назад в группу «${fromName}»` : "Назад в группу")
    : fromName
    ? `Назад в группу «${fromName}»`
    : fromGroup
    ? "Назад в группу"
    : "В библиотеку экзаменов";

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-500">Загрузка экзамена...</p>
        </div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <GlassCard className="p-8 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Экзамен не найден</h2>
          <p className="text-slate-500">{error || "Не удалось загрузить данные экзамена"}</p>
          <Link href={backHref}>
            <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>
              {backLabel}
            </Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  const waitingCount = lobbyStudents.filter((s) => s.status === "waiting").length;
  const inProgressCount = lobbyStudents.filter((s) => s.status === "in_progress").length;
  const submittedCount = lobbyStudents.filter((s) => s.status === "submitted").length;
  const totalConnected = lobbyStudents.length;
  const isFinalized = exam.status === "closed" || exam.status === "archived";
  const incompleteCount = isFinalized
    ? lobbyStudents.filter((s) => s.status !== "submitted").length
    : 0;

  const isDraft = !exam?.group_id || exam?.status === "draft" || exam?.status === "variants_ready";
  const canRename = exam.status === "draft" || exam.status === "variants_ready";
  const isPrintDelivery = exam.delivery_mode === "print";
  const hasVoidedPrintPackage = exam.print_package?.status === "voided";
  const hasUsablePrintPackage = Boolean(exam.print_package && !hasVoidedPrintPackage);
  const isPastUnstartedDelivery = Boolean(
    exam.scheduled_lesson_date
    && ["lobby", "print_ready"].includes(exam.status)
    && exam.scheduled_lesson_date < formatBusinessDate(),
  );
  const boundLessonLabel = formatBoundLessonLabel(exam.scheduled_lesson_date, boundLesson);
  const boundLessonRoom = boundLesson && (boundLesson.format === "online" ? "Онлайн" : boundLesson.room || "Кабинет не указан");

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      {/* ─── Breadcrumbs ─── */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={backHref} className="hover:text-slate-900 flex items-center gap-1.5 transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-semibold truncate max-w-md">{exam.title}</span>
      </div>

      {/* ─── Exam Profile Header Card ─── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200/80 shadow-xs relative"
      >
        {/* Full-width Top Accent Ribbon — neatly curves along the rounded-3xl corners without edge overflow */}
        <div className="absolute inset-x-0 top-0 h-6 rounded-t-[23px] overflow-hidden pointer-events-none">
          <div
            className={cn(
              "h-1.5 w-full",
              (!exam.group_id || exam.status === "draft") && "bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600",
              exam.group_id && exam.status === "variants_ready" && "bg-gradient-to-r from-blue-500 via-indigo-500 to-primary-600",
              exam.status === "print_ready" && "bg-gradient-to-r from-violet-500 via-purple-500 to-primary-600",
              exam.group_id && exam.status === "lobby" && "bg-amber-400",
              exam.group_id && exam.status === "active" && "bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600",
              exam.status === "closed" && "bg-gradient-to-r from-rose-400 via-pink-500 to-rose-600"
            )}
          />
        </div>

        <div className="p-6 md:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Left Side: Icon + Title + Metadata row */}
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100/80 flex items-center justify-center text-primary-600 shrink-0 shadow-xs">
                <FileText className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-[1.7rem] font-medium text-slate-800 tracking-[-0.02em] leading-snug">
                    {exam.title}
                  </h1>
                  {exam.is_pinned && (
                    <span
                      className="p-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-200/60 shadow-2xs"
                      title="Экзамен закреплен вверху списка"
                    >
                      <Pin className="w-3.5 h-3.5 fill-amber-500" />
                    </span>
                  )}
                </div>

                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Group badge */}
                  {exam.group_name ? (
                    isDraft ? (
                      <button
                        type="button"
                        onClick={() => isPrintDelivery && hasVoidedPrintPackage ? handleClone() : isPrintDelivery ? setShowScheduleModal(true) : setShowAssignModal(true)}
                        title="Нажмите, чтобы сменить группу"
                        className="px-3 py-1 rounded-xl font-medium bg-indigo-50 hover:bg-indigo-100/80 text-indigo-600 border border-indigo-200/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        {exam.group_name}
                        <Edit3 className="w-3 h-3 opacity-60 ml-0.5" />
                      </button>
                    ) : (
                      <span className="px-3 py-1 rounded-xl font-medium bg-indigo-50 text-indigo-600 border border-indigo-200/80 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {exam.group_name}
                      </span>
                    )
                  ) : isDraft ? (
                    <button
                      type="button"
                      onClick={() => isPrintDelivery && hasVoidedPrintPackage ? handleClone() : isPrintDelivery ? setShowScheduleModal(true) : setShowAssignModal(true)}
                      className="px-3 py-1 rounded-xl font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Привязать группу
                    </button>
                  ) : null}

                  {boundLessonLabel && (
                    <span
                      title={boundLessonRoom ? `Занятие: ${boundLessonLabel} · ${boundLessonRoom}` : `Занятие: ${boundLessonLabel}`}
                      className="px-3 py-1 rounded-xl font-medium bg-violet-50 text-violet-700 border border-violet-200/80 flex items-center gap-1.5"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      На урок: {boundLessonLabel}
                    </span>
                  )}

                  {/* Operational status and task counts stay in the online
                      header.  A print package has its dedicated workspace
                      below, so duplicating those controls here is noise. */}
                  {!isPrintDelivery && (
                    <>
                      <span
                        className={cn(
                          "px-3 py-1 rounded-xl font-medium flex items-center gap-1.5 border",
                          (!exam.group_id || exam.status === "draft") && "bg-slate-100 text-slate-700 border-slate-200",
                          exam.group_id && exam.status === "variants_ready" && "bg-blue-50 text-blue-700 border-blue-200",
                          exam.group_id && exam.status === "lobby" && "bg-amber-50 text-amber-900 border-amber-200",
                          exam.group_id && exam.status === "active" && "bg-emerald-50 text-emerald-800 border-emerald-200",
                          exam.status === "closed" && "bg-rose-50 text-rose-800 border-rose-200"
                        )}
                      >
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            (!exam.group_id || exam.status === "draft") && "bg-slate-500",
                            exam.group_id && exam.status === "variants_ready" && "bg-blue-500",
                            exam.group_id && exam.status === "lobby" && "bg-amber-500 animate-pulse",
                            exam.group_id && exam.status === "active" && "bg-emerald-500 animate-ping",
                            exam.status === "closed" && "bg-rose-500"
                          )}
                        />
                        {!exam.group_id
                          ? "Шаблон (без группы)"
                          : exam.status === "draft"
                          ? "Черновик"
                          : exam.status === "variants_ready"
                          ? "Готов к запуску"
                          : exam.status === "lobby"
                          ? "В комнате ожидания (Лобби)"
                          : exam.status === "active"
                          ? "Идёт экзамен (Активен)"
                          : "Завершён"}
                      </span>

                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side: Quick Action Buttons & 3-dots Menu */}
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
              {!exam.group_id ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => isPrintDelivery && hasVoidedPrintPackage ? handleClone() : isPrintDelivery ? setShowScheduleModal(true) : setShowAssignModal(true)}
                  icon={isPrintDelivery ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
                >
                  {isPrintDelivery && hasVoidedPrintPackage ? "Создать копию" : isPrintDelivery ? "Подготовить печатный комплект" : "Привязать группу"}
                </Button>
              ) : (
                <>
                  {!isPrintDelivery && exam.access_code && ["lobby", "active"].includes(exam.status) && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={handleCopyLink}
                      icon={
                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                          {copiedLink ? (
                            <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in-50 duration-150" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </span>
                      }
                      className={`transition-all duration-200 ${
                        copiedLink ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs" : ""
                      }`}
                    >
                      {copiedLink ? "Ссылка скопирована!" : "Скопировать ссылку"}
                    </Button>
                  )}

                  {exam.status === "lobby" && !isPastUnstartedDelivery && (
                    <Button
                      variant="primary"
                      size="md"
                      loading={actionLoading}
                      onClick={handleStartLive}
                      icon={<Play className="w-4 h-4 fill-white" />}
                      className="shadow-md shadow-primary-500/20 font-bold"
                    >
                      Начать экзамен
                    </Button>
                  )}

                  {exam.status === "active" && (
                    <Button
                      variant="secondary"
                      size="md"
                      loading={actionLoading}
                      onClick={handleCloseExam}
                      icon={<StopCircle className="w-4 h-4 text-rose-600" />}
                      className="text-rose-700 hover:bg-rose-50 border-rose-200 font-bold"
                    >
                      {isPrintDelivery ? "Завершить экзамен на бумаге" : "Завершить экзамен"}
                    </Button>
                  )}

                  {isPrintDelivery && exam.status === "print_ready" && !isPastUnstartedDelivery && (
                    <Button
                      variant="primary"
                      size="md"
                      loading={actionLoading}
                      onClick={handleStartLive}
                      icon={<Play className="w-4 h-4 fill-white" />}
                      className="shadow-md shadow-primary-500/20 font-bold"
                    >
                      Начать на бумаге
                    </Button>
                  )}

                  {(exam.status === "draft" || exam.status === "variants_ready") && (
                    <Button
                      variant="primary"
                      size="md"
                      loading={actionLoading}
                      onClick={isPrintDelivery && hasVoidedPrintPackage ? handleClone : handleOpenLobby}
                      icon={isPrintDelivery ? <FileText className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                      className="shadow-md shadow-primary-500/20 font-bold"
                    >
                      {isPrintDelivery && hasVoidedPrintPackage ? "Создать копию для занятия" : isPrintDelivery ? "Подготовить печатный комплект" : "Открыть лобби"}
                    </Button>
                  )}
                </>
              )}

              {/* 3-dots Dropdown Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                  title="Опции экзамена"
                  className="p-2.5 rounded-xl border border-slate-200/90 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer bg-white shadow-2xs"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {headerMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setHeaderMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-1.5 z-50 space-y-0.5 text-xs">
                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            if (isPrintDelivery) {
                              if (hasVoidedPrintPackage) {
                                handleClone();
                              } else {
                                setShowScheduleModal(true);
                              }
                            } else {
                              setShowAssignModal(true);
                            }
                          }}
                          className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-primary-50 hover:text-primary-700 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          {isPrintDelivery ? <FileText className="w-4 h-4 text-indigo-500" /> : <Users className="w-4 h-4 text-indigo-500" />}
                          {isPrintDelivery
                            ? hasVoidedPrintPackage
                              ? "Создать копию для занятия"
                              : "Подготовить печатный комплект"
                            : exam.group_id
                            ? "Сменить группу"
                            : "Привязать к группе"}
                        </button>
                      )}

                      {canRename && (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setShowRenameModal(true);
                          }}
                          className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-primary-50 hover:text-primary-700 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4 text-primary-500" />
                          Изменить название
                        </button>
                      )}

                      {exam.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            handleClone();
                          }}
                          className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-slate-400" />
                          Создать копию (клон)
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          handlePin();
                        }}
                        className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
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

                      {exam.status === "archived" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              handleRestore();
                            }}
                            className="w-full text-left px-4 py-2.5 text-emerald-700 hover:bg-emerald-50 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4 text-emerald-600" />
                            Восстановить из архива
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              handleDeletePermanently();
                            }}
                            className="w-full text-left px-4 py-2.5 text-rose-600 hover:bg-rose-50 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                            Удалить навсегда
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            handleArchive();
                          }}
                          className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-amber-50 hover:text-amber-800 font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Archive className="w-4 h-4 text-amber-600" />
                          Перенести в архив
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {isPastUnstartedDelivery && (
        <section className="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50/70 p-5 shadow-2xs">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-950">Проведение не состоялось</p>
                <p className="mt-1 max-w-none text-[15px] leading-6 text-amber-900/85">
                  {isPrintDelivery
                    ? "Назначенное занятие уже прошло. Печатный комплект нельзя переназначить: сначала аннулируйте его, затем создайте копию экзамена для нового урока."
                    : "Назначенное занятие уже прошло, а экзамен не был запущен. Перенесите его на конкретный следующий урок — старый код доступа будет закрыт и создан новый — либо отмените проведение."}
                </p>
              </div>
            </div>
            <div className="shrink-0 self-center">
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryCancellation(false);
                  setReturnToDeliveryDecision(false);
                  setDeliveryCancellationError(null);
                  setDeliveryCancellationReason("");
                  setShowDeliveryDecisionModal(true);
                }}
                aria-haspopup="dialog"
                className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                Принять решение
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ─── Centered Navigation Tabs Bar (Outside Header Card) ─── */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100/90 rounded-2xl p-1.5 border border-slate-200/60 shadow-2xs overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("lobby")}
            className={cn(
              "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "lobby"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <Radio className={cn("w-4 h-4", activeTab === "lobby" ? "text-primary-600" : "text-slate-400")} />
            <span>{isPrintDelivery ? "Печатный комплект" : "Лобби / Live Комната"}</span>
            {!isPrintDelivery && totalConnected > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-primary-100 text-primary-700 font-extrabold">
                {totalConnected}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "tasks"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <Layers className={cn("w-4 h-4", activeTab === "tasks" ? "text-primary-600" : "text-slate-400")} />
            <span>Задания и Варианты</span>
          </button>

          {!isPrintDelivery && (
            <button
              onClick={() => setActiveTab("analytics")}
              className={cn(
                "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer whitespace-nowrap",
                activeTab === "analytics"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <BarChart3 className={cn("w-4 h-4", activeTab === "analytics" ? "text-primary-600" : "text-slate-400")} />
              <span>Результаты и Аналитика</span>
              {submittedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-bold">
                  {submittedCount} сдали
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: KAHOOT-STYLE LIVE LOBBY & CLASSROOM SCREEN */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "lobby" && (
        isPrintDelivery ? (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6 md:p-8 shadow-2xs">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-200/30 blur-2xl pointer-events-none" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4 max-w-2xl">
                  <div className="w-14 h-14 shrink-0 rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-500/25 flex items-center justify-center">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-violet-700">Печатный комплект</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      {exam.status === "print_ready"
                        ? "Бланки и ключ готовы к занятию"
                        : exam.status === "active"
                        ? "Экзамен проводится на бумаге"
                        : exam.status === "closed"
                        ? "Печатный экзамен завершён"
                        : hasVoidedPrintPackage
                        ? "Печатный комплект аннулирован"
                        : "Сначала подготовьте комплект для конкретного занятия"}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      Закрытые задания выводятся с вариантами и единым листом ответов для отметок. Для открытых заданий в бланке фиксируются отдельные поля ответа и место для решения.
                    </p>
                  </div>
                </div>

                {hasUsablePrintPackage ? (
                  <div className="flex flex-wrap gap-2.5 shrink-0">
                    <Button
                      variant="primary"
                      icon={<Download className="w-4 h-4" />}
                      onClick={() => examsApi.downloadStudentPrintPdf(examId, 1)}
                      className="font-bold shadow-sm shadow-primary-500/20"
                    >
                      Скачать бланк PDF
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<FileText className="w-4 h-4" />}
                      onClick={() => examsApi.downloadTeacherPrintKey(examId, 1)}
                    >
                      Ключ преподавателя
                    </Button>
                  </div>
                ) : hasVoidedPrintPackage ? (
                  <Button
                    variant="primary"
                    icon={<Copy className="w-4 h-4" />}
                    onClick={handleClone}
                    className="font-bold shadow-sm shadow-primary-500/20 shrink-0"
                  >
                    Создать копию для занятия
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={<FileText className="w-4 h-4" />}
                    onClick={handleOpenLobby}
                    className="font-bold shadow-sm shadow-primary-500/20 shrink-0"
                  >
                    Выбрать занятие
                  </Button>
                )}
              </div>

              {hasUsablePrintPackage && exam.print_package?.snapshot_sha256 && (
                <div className="relative mt-6 border-t border-violet-200/70 pt-4 flex items-center gap-2 text-xs text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Содержимое зафиксировано в версии {exam.print_package.version}; изменения исходных заданий на комплект не влияют.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Формат</p>
                <p className="mt-2 text-base font-bold text-slate-900">Бумажный экзамен</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Без ссылок, лобби и веб-сессий учеников.</p>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Привязка</p>
                <p className="mt-2 text-base font-bold text-slate-900">{exam.group_name || "Группа не выбрана"}</p>
                {boundLessonLabel ? (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Урок: {boundLessonLabel}{boundLessonRoom ? ` · ${boundLessonRoom}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Комплект выпускается только для одного фактического занятия.</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Статус</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {exam.status === "print_ready" ? "Готов к печати" : exam.status === "active" ? "В проведении" : exam.status === "closed" ? "Завершён" : "Требует подготовки"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Запуск и завершение фиксируют фактическое проведение урока.</p>
              </div>
            </div>
          </div>
        ) : (
        <div className="space-y-6">
          {!exam.group_id && (
            <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">Экзамен пока не привязан к группе</h4>
                  <p className="text-xs text-amber-700">
                    Привяжите экзамен к группе, чтобы ученики могли заходить по своему логину и результаты отображались в журнале класса.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => isPrintDelivery ? setShowScheduleModal(true) : setShowAssignModal(true)}
                icon={isPrintDelivery ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                className="shrink-0 font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              >
                {isPrintDelivery ? "Подготовить печатный комплект" : "Привязать к группе"}
              </Button>
            </div>
          )}
          {/* Lobby Status Bar with Live Countdown Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center font-black text-xl shrink-0">
                {totalConnected}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {exam.status === "lobby"
                    ? "Ученики в комнате ожидания"
                    : exam.status === "active"
                    ? "Ученики пишут экзамен в реальном времени"
                    : "Подключившиеся участники"}
                </h3>
                <p className="text-xs text-slate-500">
                  {exam.status === "lobby"
                    ? "Вы можете начать экзамен в любой момент, когда готовы (не обязательно ждать 100% присутствия)"
                    : isFinalized
                    ? `Сдали: ${submittedCount}${incompleteCount > 0 ? ` • Не завершили: ${incompleteCount}` : ""}`
                    : `В процессе: ${inProgressCount} • Завершили: ${submittedCount} • Ожидают: ${waitingCount}`}
                </p>
              </div>
            </div>

            {/* Right Side: Live Countdown Timer during Active Exam */}
            {exam.status === "active" && (
              <div className="flex items-center gap-3 bg-amber-50/90 border border-amber-200/90 py-2.5 px-4 rounded-2xl shrink-0 shadow-2xs self-start sm:self-auto">
                <div className="w-9 h-9 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700 shrink-0">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Осталось времени</p>
                  <p className="text-lg sm:text-xl font-black font-mono text-amber-950 leading-tight">
                    {formatRemainingTimer(timeRemaining)}
                  </p>
                </div>
              </div>
            )}

            {exam.status === "lobby" && (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200/80 py-2 px-3.5 rounded-xl shrink-0 self-start sm:self-auto">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-900">
                  Длительность: {exam.total_time_minutes} мин
                </span>
              </div>
            )}

            {exam.status === "closed" && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 py-2 px-3.5 rounded-xl shrink-0 self-start sm:self-auto">
                <CheckCircle2 className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold text-slate-700">Экзамен завершён</span>
              </div>
            )}
          </div>

          {/* Student Grid (Kahoot / Live Room Badges) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Участники ({totalConnected})
              </p>
            </div>

            {lobbyStudents.length === 0 ? (
              <div className="p-12 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-3">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  {!exam.group_id ? "Привяжите группу для запуска лобби" : "Ожидание подключения учеников..."}
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {!exam.group_id
                    ? "После выбора учебной группы вы сможете открыть лобби и запустить тестирование для учеников класса."
                    : "Ученики переходят по ссылке, вводят свои ID и ФИО со смартфонов или компьютеров и сразу появятся на этом экране."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                <AnimatePresence>
                  {lobbyStudents.map((s) => {
                    const isIncompleteFinal = isFinalized && s.status !== "submitted";
                    const hasStoredIdentity = Boolean(s.display_id || s.student_id);

                    return (
                    <motion.div
                      key={s.session_id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "relative p-4 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs group",
                        isIncompleteFinal && "bg-amber-50/40 border-amber-200/80",
                        !isFinalized && s.status === "waiting" && "bg-white border-slate-200/90 hover:border-primary-300",
                        !isFinalized && s.status === "in_progress" && "bg-primary-50/40 border-primary-200/80 hover:border-primary-400",
                        s.status === "submitted" && "bg-emerald-50/50 border-emerald-200/80"
                      )}
                    >
                      {/* Kick Button Top Right */}
                      {!isFinalized && (
                        <button
                          onClick={() => handleKickStudent(s.session_id, s.student_name)}
                          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title="Удалить из экзамена"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="flex items-start gap-3 mb-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                            isIncompleteFinal && "bg-amber-100 text-amber-800",
                            !isFinalized && s.status === "waiting" && "bg-slate-100 text-slate-700",
                            !isFinalized && s.status === "in_progress" && "bg-primary-100 text-primary-700",
                            s.status === "submitted" && "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          {(s.student_name || "У")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-bold text-slate-900 truncate">{s.student_name}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                            {hasStoredIdentity ? (
                              <span className="font-mono font-bold text-slate-600">
                                ID: {s.display_id || s.student_id}
                              </span>
                            ) : (
                              <span className="text-amber-700">Историческая запись · ID не зафиксирован</span>
                            )}
                            <span>•</span>
                            <span>Вар. #{s.variant_number}</span>
                          </div>
                        </div>
                      </div>

                      {/* Live Progress Bar if Exam is Running */}
                      {!isFinalized && s.status === "in_progress" && (
                        <div className="space-y-1.5 pt-2 border-t border-primary-100/60">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-primary-900">
                            <span>Отвечено</span>
                            <span>
                              {s.answered_count} / {s.total_tasks}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-primary-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-600 transition-all duration-500 rounded-full"
                              style={{
                                width: `${s.total_tasks > 0 ? (s.answered_count / s.total_tasks) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Waiting Badge */}
                      {!isFinalized && s.status === "waiting" && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          В ожидании старта
                        </div>
                      )}

                      {/* Submitted Badge */}
                      {s.status === "submitted" && (
                        <div className="flex items-center justify-between pt-2 border-t border-emerald-100">
                          <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Сдал
                          </span>
                          <span className="text-xs font-black text-emerald-800">
                            {s.score} / {s.max_score} б. ({s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0}%)
                          </span>
                        </div>
                      )}
                      {isIncompleteFinal && (
                        <div className="flex items-center gap-1.5 pt-2 border-t border-amber-200/80 text-[11px] font-bold text-amber-800">
                          <Clock className="w-3.5 h-3.5" />
                          Не завершил до закрытия
                        </div>
                      )}
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: TASKS & VARIANTS EXPLORER */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          {/* Variant Switcher & Answer Toggle Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">Варианты:</span>
              {(exam.variants || []).map((v) => (
                <button
                  key={v.variant_number}
                  onClick={() => setSelectedVariant(v.variant_number)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    selectedVariant === v.variant_number
                      ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-sm shadow-primary-500/25"
                      : "bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                  )}
                >
                  Вариант {v.variant_number} ({v.tasks?.length || 0} зад.)
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowAnswers(!showAnswers)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                  showAnswers
                    ? "bg-primary-50 text-primary-700 border-primary-200 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showAnswers ? "Скрыть ответы" : "Показать ответы"}
              </button>

              <AnimatePresence>
                {hasOpenDistractors && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    type="button"
                    onClick={() => {
                      setShowDistractors({});
                    }}
                    title="Свернуть все анализы типичных ошибок"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition-all cursor-pointer shadow-2xs"
                  >
                    <X className="w-3.5 h-3.5 text-rose-500" />
                    <span>Свернуть всё</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Tasks List for Selected Variant */}
          {currentVariantSections.length > 0 ? (
            <div className="space-y-4">
              {currentVariantSections.map((section, sectionIndex) => {
                const ordinalOffset = currentVariantSections
                  .slice(0, sectionIndex)
                  .reduce((sum, previous) => sum + previous.tasks.length, 0);

                return (
                  <section key={section.name} className="space-y-3">
                    <div className="flex items-end justify-between gap-4 px-1 pt-2 border-b border-slate-200 pb-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-[0.16em] text-primary-600 uppercase">
                          Раздел {String(sectionIndex + 1).padStart(2, "0")}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-900 truncate">{section.name}</h3>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 shrink-0">
                        {section.tasks.length} {taskCountLabel(section.tasks.length)}
                      </span>
                    </div>

                    {section.tasks.map((t, taskIndex) => {
                      const showDist = showDistractors[t.task_id] ?? false;
                      const taskOrdinal = ordinalOffset + taskIndex + 1;

                      return (
                        <GlassCard key={t.task_id || taskOrdinal} variant="default" className="p-5 md:p-6 transition-all hover:border-slate-300">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="w-8 h-8 rounded-xl bg-slate-100 font-extrabold text-xs text-slate-700 flex items-center justify-center shrink-0">
                                #{taskOrdinal}
                              </span>
                              <div>
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-md text-[11px] font-bold mr-2",
                                    diffColors[t.difficulty] || diffColors.B
                                  )}
                                >
                                  Уровень {t.difficulty}
                                </span>
                                <span className="text-xs font-medium text-slate-500">{t.skill_name || "Математика"}</span>
                              </div>
                            </div>

                            <Button
                              variant={isDraft ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => handleOpenReplace(t)}
                              icon={<Shuffle className="w-3.5 h-3.5" />}
                              className={!isDraft ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80" : ""}
                            >
                              {isDraft ? "Заменить задачу" : "Альтернативы"}
                            </Button>
                          </div>

                          <div className="my-4 text-slate-900 leading-relaxed text-base">
                            <TaskStatement task={t} />
                          </div>

                          {t.question_image_url && (
                            <div className="my-3 max-w-sm rounded-xl overflow-hidden border border-slate-200">
                              <img src={t.question_image_url} alt="Задание" className="w-full object-contain max-h-56" />
                            </div>
                          )}

                          <AnimatePresence>
                            {showAnswers && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="my-3 overflow-hidden"
                              >
                                <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs max-w-full">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span className="text-xs font-semibold text-emerald-800">Правильный ответ:</span>
                                  <span className="text-sm sm:text-base font-medium text-emerald-950">
                                    <MathRenderer text={pickAnswerDisplayText(t.correct_answer, t.correct_answer_latex)} />
                                  </span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {t.distractor_meta && t.distractor_meta.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() =>
                                  setShowDistractors((prev) => ({
                                    ...prev,
                                    [t.task_id]: !prev[t.task_id],
                                  }))
                                }
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100/70 px-2.5 py-1.5 rounded-lg border border-indigo-200/60 transition-colors cursor-pointer"
                              >
                                {showDist ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{showDist ? "Скрыть анализ дистракторов" : `Анализ типичных ошибок (${t.distractor_meta.length})`}</span>
                              </button>

                              <AnimatePresence>
                                {showDist && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-3 overflow-hidden"
                                  >
                                    <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                                      <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 text-xs font-semibold text-slate-500">
                                        <span>Типичные ошибки и логика учеников</span>
                                        <span>{t.distractor_meta.length} вар.</span>
                                      </div>

                                      {t.distractor_meta.map((dm, dIdx) => (
                                        <div
                                          key={dIdx}
                                          className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5"
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200/70 text-rose-700 text-xs font-semibold shrink-0 mt-0.5">
                                                Вариант #{dIdx + 1}
                                              </span>
                                              <div className="text-sm sm:text-base font-medium text-slate-900 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 max-w-full overflow-x-auto">
                                                <MathRenderer text={pickAnswerDisplayText(dm.value, dm.value_latex)} />
                                              </div>
                                            </div>

                                            {dm.error_type && !dm.error_type.startsWith("ai_") && dm.error_type !== "common_mistake" && (
                                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200/70 text-amber-800 text-xs font-medium shrink-0 mt-0.5">
                                                {formatErrorType(dm.error_type)}
                                              </span>
                                            )}
                                          </div>

                                          {pickDistractorExplanation(dm) && (
                                            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50/60 p-3 rounded-xl border border-slate-100/90">
                                              <span className="font-semibold text-slate-900">Причина ошибки: </span>
                                              <MathRenderer text={pickDistractorExplanation(dm)} className="inline text-slate-700 text-xs sm:text-sm" />
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </GlassCard>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-500">Вариант не содержит задач</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: RESULTS, SESSIONS & LLM NARRATIVE REPORT */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {!isPrintDelivery && activeTab === "analytics" && (
        <div className="space-y-6">
          {analyticsLoadError && (
            <DataLoadError
              compact
              title="Результаты экзамена не обновлены"
              message={`${analyticsLoadError} Показаны последние успешно загруженные данные.`}
              onRetry={handleRetryAnalytics}
              isRetrying={isRetryingAnalytics}
            />
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <GlassCard variant="panel" className="p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Всего участников</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{sessions.length}</p>
            </GlassCard>

            <GlassCard variant="panel" className="p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Сдали работы</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600">
                {sessions.filter((s) => s.status === "submitted").length}
              </p>
            </GlassCard>

            <GlassCard variant="panel" className="p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Средний балл</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-600">
                {sessions.filter((s) => s.status === "submitted").length > 0
                  ? (
                      sessions
                        .filter((s) => s.status === "submitted")
                        .reduce((acc, s) => acc + (s.percentage || 0), 0) /
                      sessions.filter((s) => s.status === "submitted").length
                    ).toFixed(1) + "%"
                  : "—"}
              </p>
            </GlassCard>

            <GlassCard variant="panel" className="p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Длительность</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{exam.total_time_minutes} мин</p>
            </GlassCard>
          </div>

          {/* ── Exam Report Card (Compact with Horizontal Stepper & Link to Dedicated Report Page) ── */}
          <GlassCard variant="panel" className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-100 text-violet-700 shadow-inner">
                  <FileBarChart2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">Общий отчёт по экзамену</h3>
                    {report && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Сформирован
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 max-w-xl">
                    Глубокая педагогическая аналитика, анализ типичных ошибок и рекомендации по итогам сданных работ.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                {report && !reportLoading && reportStep === 0 && (
                  <>
                    <Link
                      href={`/teacher/exams/${examId}/report`}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Просмотреть отчёт</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                    {isFinalized && sessions.some((s) => s.status === "submitted") && (
                      <button
                        type="button"
                        onClick={handleGenerateReport}
                        title="Пересчитать отчёт"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}

                {!report && !reportLoading && reportStep === 0 && isFinalized && sessions.some((s) => s.status === "submitted") && (
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all shadow-violet-100"
                  >
                    <Sparkles className="h-4 w-4" />
                    Создать отчёт
                  </button>
                )}
              </div>
            </div>

            {/* ── State: not finalized ── */}
            {!isFinalized && (
              <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
                Итоговый педагогический отчёт станет доступен после завершения экзамена.
              </div>
            )}

            {/* ── State: error ── */}
            {reportError && reportStep === 0 && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
                <span className="font-semibold">Ошибка:</span> {reportError}
              </div>
            )}

            {/* ── State: generating (Horizontal Stepper) ── */}
            {reportStep > 0 && (
              <div className="mt-4 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/70 via-indigo-50/40 to-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-900">Формирование отчёта…</span>
                  <span className="text-xs font-bold text-violet-700">Шаг {reportStep} из 3</span>
                </div>

                {/* Horizontal Steps with Connecting Line */}
                <div className="relative flex items-center justify-between pt-1">
                  <div className="absolute left-6 right-6 top-4 -z-0 h-0.5 bg-violet-100">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-600 transition-all duration-500"
                      style={{ width: reportStep === 1 ? "15%" : reportStep === 2 ? "60%" : "100%" }}
                    />
                  </div>

                  {[
                    { step: 1, label: "Получение данных" },
                    { step: 2, label: "Анализ ошибок" },
                    { step: 3, label: "Формирование отчёта" },
                  ].map(({ step, label }) => {
                    const isDone = reportStep > step;
                    const isActive = reportStep === step;

                    return (
                      <div key={step} className="relative z-10 flex flex-col items-center gap-1.5 text-center">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all shadow-sm",
                            isDone
                              ? "border-violet-600 bg-violet-600 text-white"
                              : isActive
                              ? "border-violet-600 bg-white text-violet-600 ring-4 ring-violet-100"
                              : "border-slate-200 bg-white text-slate-400"
                          )}
                        >
                          {isDone ? (
                            <Check className="h-3.5 w-3.5 text-white" />
                          ) : isActive ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                          ) : (
                            <span className="text-[11px] font-bold">{step}</span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-[11px] font-medium max-w-[110px] leading-tight",
                            isActive ? "text-violet-900 font-bold" : isDone ? "text-violet-700" : "text-slate-400"
                          )}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </GlassCard>

          {/* Student Results Table */}
          <GlassCard variant="panel" className="p-0 overflow-visible">
            <div className="p-5 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Результаты учеников</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {isFinalized ? "Итоговые статусы зафиксированы после завершения экзамена." : "Статусы обновляются по мере выполнения работы."}
                </p>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">Пока нет попыток учеников</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-semibold tracking-wider border-b border-slate-200/80">
                    <tr>
                      <th className="p-4 pl-6">Ученик</th>
                      <th className="p-4">Вариант</th>
                      <th className="p-4">Баллы</th>
                      <th className="p-4">Результат</th>
                      <th className="p-4">Статус</th>
                      <th className="p-4 pr-6 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((s, idx) => {
                      const submitted = s.status === "submitted";
                      const rowKey = s.session_id || String(idx);
                      const scorePercent = Number(s.percentage || 0);

                      return (
                        <tr key={rowKey} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 pl-6 font-semibold text-slate-900">{s.student_name}</td>
                          <td className="p-4 font-medium text-slate-600">Вар. #{s.variant_number}</td>
                          <td className="p-4 font-mono font-semibold text-slate-900">
                            {submitted ? `${s.score} / ${s.max_score}` : "—"}
                          </td>
                          <td className="p-4">
                            {submitted ? (
                              <span
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-xs font-semibold",
                                  scorePercent >= 80
                                    ? "bg-emerald-100 text-emerald-800"
                                    : scorePercent >= 50
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                                )}
                              >
                                {scorePercent.toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            {submitted ? (
                              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Сдано
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                                <Clock className="w-4 h-4" /> {isFinalized ? "Не завершил" : "В процессе"}
                              </span>
                            )}
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <button
                              ref={(el) => { menuBtnRefs.current[rowKey] = el; }}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleOpenStudentMenu(rowKey); }}
                              className="inline-flex w-8 h-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                              aria-label={`Действия для ${s.student_name}`}
                              aria-expanded={studentActionMenu === rowKey}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ─── Student Action Menu Portal (renders outside table overflow) ─── */}
      {studentActionMenu && menuAnchor && typeof document !== "undefined" && createPortal(
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: menuAnchor.top, right: menuAnchor.right, zIndex: 9999 }}
          className="w-56 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
        >
          <p className="text-sm font-semibold text-slate-800">Индивидуальный отчёт</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Будет доступен после запуска отдельного отчётного контура для ученика.
          </p>
        </motion.div>,
        document.body
      )}

      {/* ─── Big Fullscreen QR Code Modal ─── */}
      <AnimatePresence>
        {showQrModal && exam.access_code && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => setShowQrModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative z-10 bg-white rounded-3xl p-8 md:p-12 max-w-lg w-full text-center space-y-6 shadow-2xl border border-slate-100/80"
            >
              <button
                onClick={() => setShowQrModal(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
                  Проекция на экран
                </span>
                <h3 className="text-2xl font-black text-slate-900">{exam.title}</h3>
                <p className="text-sm text-slate-500">Отсканируйте камеру телефона для входа</p>
              </div>

              <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 inline-block shadow-inner">
                <QRCode
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/e/${exam.access_code}`}
                  size={260}
                  level="Q"
                />
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between px-8">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">PIN код:</span>
                <span className="text-3xl font-mono font-black text-amber-400 tracking-wider">
                  {exam.access_code}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Task Replacement Modal ─── */}
      <AnimatePresence>
        {replaceTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => setReplaceTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative z-10 bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100/80"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 leading-none">Замена задачи</h3>
                    <p className="text-xs text-slate-400 mt-1">Выберите подходящий вариант того же навыка</p>
                  </div>
                </div>
                <button
                  onClick={() => setReplaceTarget(null)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 overscroll-contain">
                {!isDraft && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-amber-950 flex items-start gap-3.5 shadow-2xs"
                  >
                    <div className="w-9 h-9 rounded-xl bg-amber-100/90 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-amber-950">Замена задач доступна только в режиме черновика</h4>
                      <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                        Экзамен уже был запущен или завершён (статус: <strong>{exam?.status === "lobby" ? "Лобби" : exam?.status === "active" ? "Идёт экзамен" : exam?.status === "closed" ? "Завершён" : "В архиве"}</strong>). Список задач зафиксирован для обеспечения равных условий и точности аналитики.
                      </p>
                    </div>
                  </motion.div>
                )}

                {replaceError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex items-start gap-3 shadow-2xs"
                  >
                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-rose-950">Внимание</h4>
                      <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">{replaceError}</p>
                    </div>
                  </motion.div>
                )}

                {altLoading ? (
                  <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
                    <p className="text-sm font-semibold">Поиск альтернативных задач того же навыка...</p>
                  </div>
                ) : alternatives.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Нет доступных альтернативных задач для этого навыка.
                  </div>
                ) : (
                  alternatives.map((alt) => (
                    <div
                      key={alt.task_id}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-primary-400 hover:shadow-md transition-all flex flex-col gap-3 group bg-slate-50/50 hover:bg-white"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-md text-[11px] font-bold",
                            diffColors[alt.difficulty] || diffColors.B
                          )}
                        >
                          Уровень {alt.difficulty}
                        </span>
                        {isDraft ? (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={replacingTaskId === alt.task_id}
                            onClick={() => handleConfirmReplace(alt.task_id)}
                          >
                            Выбрать эту
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200/60">
                            <Clock className="w-3.5 h-3.5" />
                            Только просмотр
                          </span>
                        )}
                      </div>
                      <div className="text-base text-slate-900 leading-relaxed font-normal py-1">
                        <TaskStatement task={alt} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Resolution modal for an expired, unstarted delivery ───────────── */}
      {showDeliveryDecisionModal && typeof document !== "undefined" && createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[210] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-decision-title"
          >
            <button
              type="button"
              aria-label="Закрыть окно"
              className="absolute inset-0 h-full w-full bg-slate-950/60 backdrop-blur-sm"
              onClick={closeDeliveryDecisionModal}
              disabled={actionLoading}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="relative z-10 my-auto w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_32px_100px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
            >
              <header className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 px-6 py-6 text-white sm:px-7 sm:py-7">
                <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
                <button
                  type="button"
                  onClick={closeDeliveryDecisionModal}
                  disabled={actionLoading}
                  className="absolute right-5 top-5 z-20 rounded-xl p-2 text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="relative flex items-center gap-3.5 pr-10">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 shadow-inner">
                    {showDeliveryCancellation ? <X className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-white/70">
                      {showDeliveryCancellation ? "ОТМЕНА ПРОВЕДЕНИЯ" : "ТРЕБУЕТСЯ РЕШЕНИЕ"}
                    </p>
                    <h2 id="delivery-decision-title" className="mt-1 truncate text-lg font-bold tracking-tight">
                      {showDeliveryCancellation
                        ? (isPrintDelivery ? "Аннулировать печатный комплект" : "Отменить экзамен")
                        : "Как поступить с экзаменом?"}
                    </h2>
                  </div>
                </div>
              </header>

              <div className="bg-gradient-to-b from-slate-50/80 via-white to-white p-6 sm:p-7">
                {showDeliveryCancellation ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                      <p className="text-sm font-semibold text-amber-950">Укажите причину отмены</p>
                      <p className="mt-1 text-sm leading-6 text-amber-900/80">
                        {isPrintDelivery
                          ? "Комплект будет аннулирован. Чтобы провести этот экзамен в другой день, создайте его копию и назначьте на новое занятие."
                          : "Доступ в лобби будет закрыт, а экзамен вернётся в черновики без привязки к группе и занятию."}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600" htmlFor="delivery-cancellation-reason">
                        Причина
                      </label>
                      <textarea
                        id="delivery-cancellation-reason"
                        value={deliveryCancellationReason}
                        onChange={(event) => setDeliveryCancellationReason(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="Например: урок отменён, экзамен проведём на следующем занятии"
                        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      />
                      {deliveryCancellationError && (
                        <p className="mt-2 text-xs font-medium text-rose-700">{deliveryCancellationError}</p>
                      )}
                    </div>
                    <footer className="flex flex-col-reverse gap-2 rounded-2xl bg-slate-50 p-2.5 sm:flex-row sm:items-center sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeliveryCancellation(false);
                          setDeliveryCancellationError(null);
                          setDeliveryCancellationReason("");
                        }}
                        disabled={actionLoading}
                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Назад к выбору
                      </button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={actionLoading}
                        onClick={handleCancelDelivery}
                        icon={<X className="h-4 w-4" />}
                        className="px-4 py-2.5"
                      >
                        {isPrintDelivery ? "Аннулировать комплект" : "Отменить экзамен"}
                      </Button>
                    </footer>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <p className="max-w-xl text-sm leading-6 text-slate-600">
                      Выберите, что сделать с экзаменом, который не был проведён в назначенное занятие.
                    </p>
                    <div className={cn("grid gap-3", isPrintDelivery ? "grid-cols-1" : "sm:grid-cols-2")}>
                      {!isPrintDelivery && (
                        <button
                          type="button"
                          onClick={() => {
                            setReturnToDeliveryDecision(true);
                            setShowDeliveryDecisionModal(false);
                            setShowScheduleModal(true);
                          }}
                          className="group rounded-2xl border border-primary-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100">
                            <CalendarDays className="h-5 w-5" />
                          </span>
                          <p className="mt-3 text-sm font-semibold text-slate-900">Перенести экзамен</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Выберите новое занятие. Прежний код закроется, а для нового урока будет создан новый.
                          </p>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDeliveryCancellationError(null);
                          setShowDeliveryCancellation(true);
                        }}
                        className="group rounded-2xl border border-rose-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 transition-colors group-hover:bg-rose-100">
                          <X className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          {isPrintDelivery ? "Аннулировать комплект" : "Отменить экзамен"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {isPrintDelivery
                            ? "Укажите причину. После этого можно создать копию для другого занятия."
                            : "Укажите причину. Доступ закроется, а экзамен вернётся в черновики."}
                        </p>
                      </button>
                    </div>
                    <div className="flex justify-end border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={closeDeliveryDecisionModal}
                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        Не сейчас
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          </motion.div>,
          document.body,
        )}

      <AnimatePresence>
        {showScheduleModal && exam && (
          <ScheduleExamModal
            examTitle={exam.title}
            groups={groups}
            initialGroupId={exam.group_id}
            deliveryMode={exam.delivery_mode}
            intent={isPastUnstartedDelivery && !isPrintDelivery ? "reschedule" : "schedule"}
            onClose={() => {
              setShowScheduleModal(false);
              if (returnToDeliveryDecision) {
                setReturnToDeliveryDecision(false);
                setShowDeliveryCancellation(false);
                setDeliveryCancellationError(null);
                setShowDeliveryDecisionModal(true);
              }
            }}
            onSubmit={async ({ group, occurrence }) => {
              if (exam.delivery_mode === "print") {
                const result = await examsApi.preparePrintPackage(examId, {
                  group_id: group.id,
                  lesson_id: occurrence.id,
                  lesson_date: occurrence.occurrenceDate,
                });
                setExam((previous) => previous ? {
                  ...previous,
                  status: result.status,
                  group_id: result.group_id,
                  group_name: result.group_name || group.name,
                  scheduled_lesson_id: result.scheduled_lesson_id,
                  scheduled_lesson_date: result.scheduled_lesson_date,
                  print_package: result.print_package,
                } : previous);
                setReturnToDeliveryDecision(false);
                setShowScheduleModal(false);
                setActiveTab("lobby");
                return;
              }

              const result = await examsApi.assign(examId, {
                group_id: group.id,
                publish: true,
                lesson_id: occurrence.id,
                lesson_date: occurrence.occurrenceDate,
              });
              setExam((previous) => previous ? {
                ...previous,
                status: result.status,
                access_code: result.access_code || previous.access_code,
                group_id: result.group_id,
                group_name: result.group_name || group.name,
                scheduled_lesson_id: result.scheduled_lesson_id,
                scheduled_lesson_date: result.scheduled_lesson_date,
              } : previous);
              setReturnToDeliveryDecision(false);
              setShowScheduleModal(false);
              setActiveTab("lobby");
            }}
          />
        )}
      </AnimatePresence>

      <RenameExamModal
        open={showRenameModal}
        currentTitle={exam.title}
        onClose={() => setShowRenameModal(false)}
        onSave={handleRename}
      />

      {/* ─── Assign / Switch Group Modal ─── */}
      <AnimatePresence>
        {showAssignModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => setShowAssignModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-primary-600 to-violet-600 p-5 text-white">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/70">
                      {exam.group_id ? "Сменить группу" : "Привязать экзамен к группе"}
                    </p>
                    <h3 className="font-bold text-sm leading-tight mt-0.5 line-clamp-1">{exam.title}</h3>
                  </div>
                </div>
              </div>

              {/* Group List */}
              <div className="p-4 space-y-3">
                <p className="text-xs text-slate-500 font-medium">
                  Выберите группу, которой будет доступен экзамен:
                </p>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {groups.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Нет доступных групп</p>
                  ) : (
                    groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleAssignGroup(g)}
                        disabled={assignLoading}
                        className={cn(
                          "w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer",
                          exam.group_id === g.id
                            ? "border-primary-500 bg-primary-50/60 ring-2 ring-primary-500/20"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                              exam.group_id === g.id ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {g.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{g.name}</p>
                            <p className="text-xs text-slate-400">{(g as any).student_count || 0} учеников</p>
                          </div>
                        </div>
                        {exam.group_id === g.id ? (
                          <span className="text-xs font-bold text-primary-700 bg-primary-100 px-2 py-0.5 rounded-md">
                            Текущая
                          </span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
