"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { examsApi, orgApi, type Group, type PrintExamLayout, type PrintTaskLayout } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import QRCode from "qrcode.react";
import { TaskFigureDrawer } from "@/components/tasks/TaskFigureDrawer";
import { ScheduleExamModal } from "@/components/exam/schedule-exam-modal";
import { RenameExamModal } from "@/components/exam/rename-exam-modal";
import { ExamRemovalDialog, useExamRemoval } from "@/components/exam/exam-removal";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Share2,
  Users,
  RefreshCw,
  Sparkles,
  FileText,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Send,
  XCircle,
  AlertTriangle,
  Zap,
  Eye,
  EyeOff,
  Activity,
  ArrowRight,
  X,
  Plus,
  Printer,
  MoreVertical,
  Edit3,
  Archive,
  Pin,
  PinOff,
} from "lucide-react";

// ─── Types ───

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

interface DraftData {
  exam_id: string;
  title: string;
  status: string;
  total_time_minutes: number;
  variants_count: number;
  tasks_per_variant: number;
  group_id?: string | null;
  group_name?: string | null;
  class_level?: number | null;
  is_pinned?: boolean;
  settings: Record<string, any>;
  delivery_mode: "online" | "print";
  skills_covered: string[];
  variants: DraftVariant[];
  created_at: string;
}

interface Alternative {
  task_id: string;
  question_text: string;
  question_latex: string | null;
  difficulty: string;
  correct_answer: string;
  answer_type: string;
}

// ─── Print-only presentation helpers ───────────────────────────────────────
// These settings deliberately describe only the paper. They never alter the
// authored task, its answer, distractors, or explanatory metadata.
function printableChoiceValues(task: DraftTask): string[] {
  const candidates = Array.isArray(task.answer_options) && task.answer_options.length > 0
    ? task.answer_options
    : (task.distractor_meta || []).map((item) => item.value);
  const values = [...candidates];
  if (task.correct_answer && !values.includes(task.correct_answer)) {
    values.unshift(task.correct_answer);
  }
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function canRenderPrintChoice(task: DraftTask): boolean {
  const count = printableChoiceValues(task).length;
  return count >= 2 && count <= 6;
}

function defaultPrintTaskLayout(task: DraftTask): PrintTaskLayout {
  return canRenderPrintChoice(task)
    ? { response_kind: "choice", answer_location: "answer_sheet", answer_lines: 0, work_lines: 0 }
    : { response_kind: "open", answer_location: "answer_sheet", answer_lines: 2, work_lines: 6 };
}

function defaultPrintLayout(variants: DraftVariant[]): PrintExamLayout {
  return {
    schema_version: 1,
    answer_sheet_enabled: true,
    variants: Object.fromEntries(
      variants.map((variant) => [
        String(variant.variant_number),
        Object.fromEntries(variant.tasks.map((task) => [task.task_id, defaultPrintTaskLayout(task)])),
      ]),
    ),
  };
}

// ─── Difficulty badge colors ───
const diffColors: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
  B: "bg-amber-50 text-amber-700 border border-amber-200/80",
  C: "bg-rose-50 text-rose-700 border border-rose-200/80",
};

import { MathRenderer } from "@/components/ui/math-renderer";
import { pickAnswerDisplayText, pickTaskDisplayText, pickDistractorExplanation } from "@/lib/task-display";
import { pluralRu } from "@/lib/payments";
import { useScrollLock } from "@/components/ui/modal";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ExamDraftPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = params.id as string;
  const requestedReturnTo = searchParams.get("return_to");
  const returnTo = requestedReturnTo && requestedReturnTo.startsWith("/teacher/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : null;
  const backHref = returnTo || "/teacher/exams?status=draft";
  const examHubHref = `/teacher/exams/${examId}${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`;

  const [draft, setDraft] = useState<DraftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeVariant, setActiveVariant] = useState(1);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [replacingTaskId, setReplacingTaskId] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [publishResult, setPublishResult] = useState<{ access_code: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);

  // Print-mode state is independent from the authored variant.  It is saved
  // only to the print-layout endpoint and is not used for online delivery.
  const [printLayout, setPrintLayout] = useState<PrintExamLayout | null>(null);
  const [printSaveState, setPrintSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [printPreviewing, setPrintPreviewing] = useState<"student" | "teacher-key" | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  // Serialised layout at the moment of the last successful save (or hydration).
  // The autosave effect compares against it, so merely opening the draft never
  // triggers a write and a server canonicalisation never causes a save loop.
  const lastSavedLayoutJson = useRef<string | null>(null);

  // Group assignment state
  const [groups, setGroups] = useState<Group[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  const hydrateDraft = useCallback((data: DraftData) => {
    setDraft(data);
    setActiveVariant((previous) =>
      data.variants.some((variant) => variant.variant_number === previous)
        ? previous
        : data.variants[0]?.variant_number || 1,
    );

    const firstVariant = data.variants.find((variant) => variant.variant_number === 1) || data.variants[0];
    if (firstVariant) {
      setExpandedSections(new Set(firstVariant.tasks.map((task) => task.skill_name || task.skill_id)));
    }

    if (data.delivery_mode === "print") {
      const savedLayout = data.settings?.print_layout as PrintExamLayout | undefined;
      const layout = savedLayout || defaultPrintLayout(data.variants);
      lastSavedLayoutJson.current = JSON.stringify(layout);
      setPrintLayout(layout);
    } else {
      lastSavedLayoutJson.current = null;
      setPrintLayout(null);
    }
  }, []);

  // Load draft
  useEffect(() => {
    if (!examId) return;
    setLoading(true);
    examsApi
      .getDraft(examId)
      .then((data) => {
        hydrateDraft(data);
      })
      .catch((err) => setError(err.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));

    orgApi.listGroups().then((res) => setGroups(Array.isArray(res) ? res : [])).catch(() => {});
  }, [examId, hydrateDraft]);

  // ─── Background scroll lock while a dialog is open (shared hook) ───
  useScrollLock(showAssignModal || showScheduleModal);

  useEffect(() => {
    if (publishResult) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [publishResult]);

  // Current variant
  const currentVariant = useMemo(
    () => draft?.variants.find((v) => v.variant_number === activeVariant) || null,
    [draft, activeVariant]
  );

  // Group tasks by skill (sections)
  const sections = useMemo(() => {
    if (!currentVariant) return [];
    const map = new Map<string, DraftTask[]>();
    for (const task of currentVariant.tasks) {
      const key = task.skill_name || task.skill_id || "Без категории";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return Array.from(map.entries()).map(([name, tasks]) => ({ name, tasks }));
  }, [currentVariant]);

  // Difficulty distribution
  const diffDist = useMemo(() => {
    if (!currentVariant) return { A: 0, B: 0, C: 0 };
    const d: Record<string, number> = { A: 0, B: 0, C: 0 };
    currentVariant.tasks.forEach((t) => {
      d[t.difficulty] = (d[t.difficulty] || 0) + 1;
    });
    return d;
  }, [currentVariant]);

  const totalTasks = currentVariant?.tasks.length || 0;
  const isPrintDraft = draft?.delivery_mode === "print";

  // ─── Handlers ───

  const handleReplace = async (taskId: string) => {
    if (replacingTaskId === taskId) {
      setReplacingTaskId(null);
      setAlternatives([]);
      return;
    }
    setReplacingTaskId(taskId);
    setLoadingAlts(true);
    try {
      const alts = await examsApi.getAlternatives(examId, activeVariant, taskId);
      setAlternatives(alts);
    } catch {
      setAlternatives([]);
    } finally {
      setLoadingAlts(false);
    }
  };

  const handleQuickReplace = async (taskId: string) => {
    try {
      await examsApi.replaceTask(examId, {
        variant_number: activeVariant,
        task_id: taskId,
      });
      const data = await examsApi.getDraft(examId);
      hydrateDraft(data);
      setReplacingTaskId(null);
      setAlternatives([]);
    } catch (err: any) {
      alert(err.message || "Ошибка замены");
    }
  };

  const handleSelectedReplace = async (oldTaskId: string, newTaskId: string) => {
    try {
      // Passing new_task_id is essential: without it the API deliberately
      // performs a random quick replacement. This is the exact selection made
      // by the teacher in the alternatives panel.
      await examsApi.replaceTask(examId, {
        variant_number: activeVariant,
        task_id: oldTaskId,
        old_task_id: oldTaskId,
        new_task_id: newTaskId,
      });
      const data = await examsApi.getDraft(examId);
      hydrateDraft(data);
      setReplacingTaskId(null);
      setAlternatives([]);
    } catch (err: any) {
      alert(err.message || "Ошибка замены");
    }
  };

  const handleAssignGroup = async (group: Group) => {
    setAssignLoading(true);
    try {
      await examsApi.assign(examId, {
        group_id: group.id,
        group_name: group.name,
        class_level: group.class_level || undefined,
        publish: false,
      });
      const data = await examsApi.getDraft(examId);
      hydrateDraft(data);
      setShowAssignModal(false);
    } catch (err: any) {
      alert("Не удалось привязать группу: " + (err.message || ""));
    } finally {
      setAssignLoading(false);
    }
  };

  const handlePublish = async () => {
    setShowScheduleModal(true);
  };

  const handleRename = async (title: string) => {
    const result = await examsApi.rename(examId, title);
    setDraft((previous) => previous ? { ...previous, title: result.title } : previous);
  };

  const handleClone = async () => {
    try {
      const result = await examsApi.clone(examId);
      router.push(`/teacher/exams/${result.exam_id}/draft?return_to=${encodeURIComponent(backHref)}`);
    } catch (err: any) {
      alert("Не удалось создать копию экзамена: " + (err?.message || "Повторите попытку."));
    }
  };

  const handlePin = async () => {
    try {
      const result = await examsApi.pin(examId);
      setDraft((previous) => previous ? { ...previous, is_pinned: result.is_pinned } : previous);
    } catch (err: any) {
      alert("Не удалось изменить закрепление: " + (err?.message || "Повторите попытку."));
    }
  };

  const removal = useExamRemoval(() => {
    router.push(backHref);
  });
  const handleArchive = () => {
    removal.ask({ mode: "archive", examId, title: draft?.title ?? "" });
  };

  const getTaskPrintLayout = (task: DraftTask): PrintTaskLayout => {
    const saved = printLayout?.variants?.[String(activeVariant)]?.[task.task_id];
    return saved || defaultPrintTaskLayout(task);
  };

  // Only the response kind is a teacher choice. The answer sheet location and
  // the fixed 2/6 workspace geometry are package standards the API enforces,
  // so the UI mirrors them instead of collecting manual line counts.
  const updatePrintTaskLayout = (task: DraftTask, response_kind: PrintTaskLayout["response_kind"]) => {
    if (!draft || draft.delivery_mode !== "print") return;
    setPrintLayout((previous) => {
      const base = previous || defaultPrintLayout(draft.variants);
      const variantKey = String(activeVariant);
      const next: PrintTaskLayout = response_kind === "choice"
        ? { response_kind: "choice", answer_location: "answer_sheet", answer_lines: 0, work_lines: 0 }
        : { response_kind: "open", answer_location: "answer_sheet", answer_lines: 2, work_lines: 6 };

      return {
        ...base,
        variants: {
          ...base.variants,
          [variantKey]: {
            ...(base.variants[variantKey] || {}),
            [task.task_id]: next,
          },
        },
      };
    });
  };

  // Autosave: every layout change persists shortly after it happens, so the
  // teacher never has to remember a save button before previewing or closing.
  useEffect(() => {
    if (!printLayout || !isPrintDraft) return;
    const serialized = JSON.stringify(printLayout);
    if (serialized === lastSavedLayoutJson.current) return;
    setPrintSaveState("saving");
    const timer = window.setTimeout(() => {
      examsApi
        .updatePrintLayout(examId, printLayout)
        .then((result) => {
          lastSavedLayoutJson.current = JSON.stringify(result.layout);
          setPrintLayout(result.layout);
          setPrintSaveState("saved");
        })
        .catch((err: any) => {
          setPrintError(err.message || "Не удалось сохранить настройки печати");
          setPrintSaveState("error");
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [printLayout, examId, isPrintDraft]);

  const openPrintPreview = async (kind: "student" | "teacher-key") => {
    if (!printLayout || printPreviewing) return;
    // Opening a blank window synchronously keeps a user-initiated preview from
    // being blocked by browsers while the current paper layout is saved.
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      setPrintError("Браузер заблокировал окно предпросмотра. Разрешите всплывающие окна для ALGO.");
      return;
    }

    setPrintPreviewing(kind);
    setPrintError(null);
    try {
      const saved = await examsApi.updatePrintLayout(examId, printLayout);
      setPrintLayout(saved.layout);
      const blob = kind === "student"
        ? await examsApi.previewStudentPrintPdf(examId, activeVariant)
        : await examsApi.previewTeacherPrintKey(examId, activeVariant);
      const url = URL.createObjectURL(blob);
      previewWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      previewWindow.close();
      setPrintError(err.message || "Не удалось сформировать предпросмотр печатного комплекта");
    } finally {
      setPrintPreviewing(null);
    }
  };

  const getExamUrl = (accessCode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://algo.uz";
    return `${origin}/e/${accessCode}`;
  };

  const getExamDisplayUrl = (accessCode: string) => {
    const host = typeof window !== "undefined" ? window.location.host : "algo.uz";
    return `${host}/e/${accessCode}`;
  };

  const handleCopy = () => {
    if (publishResult?.access_code) {
      navigator.clipboard.writeText(getExamUrl(publishResult.access_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (!publishResult?.access_code) return;
    const url = getExamUrl(publishResult.access_code);
    const shareData = {
      title: draft?.title || "Экзамен ALGO",
      text: `Ссылка на экзамен: ${url}`,
      url,
    };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        // If the user cancelled/closed the native share sheet, do not fallback to copy!
        return;
      }
    }
    // Only copy if Web Share API is completely unavailable in the browser
    handleCopy();
  };

  const toggleSection = (name: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ─── Render states ───

  if (loading) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-12">
        <div className="flex items-center justify-center gap-3 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          Загрузка черновика...
        </div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-12 text-center">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-slate-600">{error || "Экзамен не найден"}</p>
        <Link href={backHref}>
          <Button variant="ghost" className="mt-4">К списку экзаменов</Button>
        </Link>
      </div>
    );
  }

  // ─── Published result ───

  if (publishResult) {
    const formatVariants = (n: number) => {
      if (n % 10 === 1 && n % 100 !== 11) return `${n} вариант`;
      if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} варианта`;
      return `${n} вариантов`;
    };

    return (
      <div className="min-h-[calc(100vh-100px)] flex items-center justify-center py-2 sm:py-4 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <GlassCard className="p-5 sm:p-6 text-center space-y-3.5 shadow-2xl border border-slate-200/90 rounded-3xl bg-white/95 backdrop-blur-xl">
            {/* Top Success Badge */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
              className="w-11 h-11 mx-auto rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-emerald-500/20"
            >
              <Sparkles className="w-5 h-5" />
            </motion.div>

            {/* Title & Group */}
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Экзамен опубликован!
              </h2>
              <p className="text-xs text-slate-500">
                Ученики могут начать прохождение по коду или QR
              </p>
              {draft.group_name && (
                <div className="pt-0.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold rounded-full shadow-2xs">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Для группы: {draft.group_name}</span>
                  </div>
                </div>
              )}
            </div>

            {/* QR Code Container */}
            <div className="p-3.5 bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-slate-200/90 shadow-sm max-w-[210px] mx-auto flex flex-col items-center">
              <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-100">
                <QRCode
                  value={getExamUrl(publishResult.access_code)}
                  size={135}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <button
                type="button"
                onClick={handleCopy}
                title="Нажмите, чтобы скопировать ссылку"
                className="mt-2.5 w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-primary-400 hover:bg-primary-50/30 transition-all font-mono text-[11px] font-semibold text-slate-700 group cursor-pointer shadow-2xs"
              >
                <span className="truncate">{getExamDisplayUrl(publishResult.access_code)}</span>
                <span className="shrink-0 text-slate-400 group-hover:text-primary-600 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> : <Copy className="w-3.5 h-3.5" />}
                </span>
              </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
              <div className="p-2 bg-slate-50/80 border border-slate-100 rounded-xl">
                <div className="text-xs font-semibold text-slate-500 mb-0.5">Варианты</div>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{draft.variants_count}</p>
                <p className="text-[10px] text-slate-500 leading-none">{formatVariants(draft.variants_count).split(" ")[1]}</p>
              </div>
              <div className="p-2 bg-slate-50/80 border border-slate-100 rounded-xl">
                <div className="text-xs font-semibold text-slate-500 mb-0.5">Задания</div>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{totalTasks}</p>
                <p className="text-[10px] text-slate-500 leading-none">в варианте</p>
              </div>
              <div className="p-2 bg-slate-50/80 border border-slate-100 rounded-xl">
                <div className="text-xs font-semibold text-slate-500 mb-0.5">Время</div>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{draft.total_time_minutes}</p>
                <p className="text-[10px] text-slate-500 leading-none">минут</p>
              </div>
            </div>

            {/* Action buttons (Copy & Share) */}
            <div className="grid grid-cols-2 gap-2.5 max-w-sm mx-auto">
              <Button
                onClick={handleCopy}
                size="sm"
                variant={copied ? "primary" : "secondary"}
                className={`w-full justify-center ${copied ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copied ? "Скопировано!" : "Копировать"}
              </Button>
              <Button
                onClick={handleShare}
                size="sm"
                variant="secondary"
                className="w-full justify-center"
                icon={<Share2 className="w-3.5 h-3.5" />}
              >
                Поделиться
              </Button>
            </div>

            {/* Bottom Navigation Buttons */}
            <div className="pt-3 border-t border-slate-100/90 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Link href={backHref} className="w-full">
                <Button size="sm" variant="ghost" className="w-full justify-center text-slate-600 hover:text-slate-900" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
                  Все экзамены
                </Button>
              </Link>
              <Link href={`/teacher/exams/${examId}/sessions`} className="w-full">
                <Button size="sm" variant="primary" className="w-full justify-center shadow-md shadow-primary-500/20" icon={<Activity className="w-3.5 h-3.5" />}>
                  Мониторинг сдачи
                </Button>
              </Link>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  // ─── Main Draft Layout ───

  return (
    <div className="w-full max-w-[1400px] mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
              Назад
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{draft.title}</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {!draft.group_id ? "Шаблон (без группы)" : "Черновик"}
              </span>
              {draft.group_name && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  {draft.group_name}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {draft.variants_count} вариант{draft.variants_count > 1 ? "ов" : ""} · {totalTasks}{" "}
              заданий · {draft.total_time_minutes} мин
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!draft.group_id ? (
            <Button
              variant="primary"
              onClick={() => isPrintDraft ? setShowScheduleModal(true) : setShowAssignModal(true)}
              icon={isPrintDraft ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isPrintDraft ? "Подготовить печатный комплект" : "Привязать группу"}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handlePublish}
              icon={isPrintDraft ? <FileText className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            >
              {isPrintDraft ? "Подготовить печатный комплект" : "Назначить занятие"}
            </Button>
          )}
          <div className="relative">
            <button
              ref={headerMenuTriggerRef}
              type="button"
              aria-label="Действия с экзаменом"
              aria-expanded={headerMenuOpen}
              aria-controls={headerMenuOpen ? "draft-actions-menu" : undefined}
              onClick={() => setHeaderMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {/* Portaled + flipped: never clipped by the header, reachable by keyboard and touch. */}
            <FloatingPanel
              id="draft-actions-menu"
              open={headerMenuOpen}
              triggerRef={headerMenuTriggerRef}
              onClose={() => setHeaderMenuOpen(false)}
              width={208}
              label="Действия с экзаменом"
              className="space-y-0.5 rounded-xl border border-slate-200/80 bg-white py-1.5 text-xs shadow-xl shadow-slate-900/10"
            >
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setShowRenameModal(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-semibold text-slate-700 transition-colors hover:bg-primary-50 hover:text-primary-700"
                  >
                    <Edit3 className="h-4 w-4 text-primary-500" />
                    Изменить название
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleClone();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Copy className="h-4 w-4 text-slate-400" />
                    Создать копию (клон)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handlePin();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    {draft.is_pinned ? (
                      <><PinOff className="h-4 w-4 text-amber-500" />Открепить</>
                    ) : (
                      <><Pin className="h-4 w-4 text-amber-500" />Закрепить вверху</>
                    )}
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleArchive();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-medium text-amber-600 transition-colors hover:bg-amber-50"
                  >
                    <Archive className="h-4 w-4 text-amber-500" />
                    В архив
                  </button>
            </FloatingPanel>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <GlassCard className="p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Сложность:</span>
              <div className="flex gap-1.5">
                {(["A", "B", "C"] as const).map((d) => (
                  <span key={d} className={`px-2 py-0.5 rounded-md text-xs font-medium ${diffColors[d]}`}>
                    {d}: {diffDist[d] || 0}
                  </span>
                ))}
              </div>
              {Object.values(diffDist).reduce((a, b) => a + b, 0) === totalTasks && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <Check className="w-3 h-3" /> 100% OK
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="w-4 h-4" />
              {draft.total_time_minutes} мин
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Layers className="w-4 h-4" />
              {sections.length} секций
            </div>
          </div>

          <button
            onClick={() => setShowAnswers(!showAnswers)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              showAnswers
                ? "bg-primary-50 text-primary-700 border-primary-200 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showAnswers ? "Скрыть ответы" : "Показать ответы"}
          </button>
        </div>
      </GlassCard>

      {/* Print configuration is intentionally available only in a print draft.
          Online and hybrid drafts keep the original common editor unchanged. */}
      {isPrintDraft && printLayout && (
        <GlassCard className="p-4 mb-6 border-indigo-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Настройки печатного бланка</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Выберите формат ответа для каждого задания. Бланк печатается по стандарту: место для решения — в клетку, ответ — в листе ответов. Настройки сохраняются автоматически и меняют только PDF, не редактируя исходные задания, ответы или дистракторы.
              </p>
            </div>
          </div>
          {printError && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {printError}
            </p>
          )}
        </GlassCard>
      )}

      {/* Variant tabs (if multiple) */}
      {draft.variants_count > 1 && (
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6">
          {draft.variants.map((v) => (
            <button
              key={v.variant_number}
              onClick={() => setActiveVariant(v.variant_number)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                activeVariant === v.variant_number
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Вариант {v.variant_number}
              {v.tasks.some((t) => t.is_template_generated) && (
                <Zap className="w-3 h-3 inline ml-1 text-amber-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Sections & Tasks */}
      <div className="space-y-4">
        {sections.map((section, sIdx) => {
          const isExpanded = expandedSections.has(section.name);
          return (
            <GlassCard key={section.name} className="overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.name)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <h3 className="font-semibold text-slate-800 text-sm">
                    Секция {sIdx + 1}: {section.name}
                  </h3>
                </div>
                <span className="text-xs text-slate-400">{section.tasks.length} заданий</span>
              </button>

              {/* Tasks */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-100"
                  >
                    {section.tasks.map((task, tIdx) => {
                      const globalIdx =
                        sections
                          .slice(0, sIdx)
                          .reduce((sum, s) => sum + s.tasks.length, 0) + tIdx;
                      const isReplacing = replacingTaskId === task.task_id;
                      const taskLayout = isPrintDraft ? getTaskPrintLayout(task) : null;
                      const canUseChoices = canRenderPrintChoice(task);

                      return (
                        <div
                          key={task.task_id}
                          className={`p-4 border-b border-slate-50 last:border-b-0 ${
                            isReplacing ? "bg-blue-50/30" : ""
                          }`}
                        >
                          {/* Task header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                {globalIdx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-800 leading-relaxed">
                                  <MathRenderer
                                    text={pickTaskDisplayText({
                                      task_id: task.task_id,
                                      question_text: task.question_text,
                                      question_latex: task.question_latex,
                                    })}
                                    className="break-words whitespace-pre-wrap"
                                  />
                                  {task.question_image_url && (
                                    <div className="mt-2">
                                      <TaskFigureDrawer imageUrl={task.question_image_url} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${diffColors[task.difficulty] || "bg-slate-100"}`}>
                                {task.difficulty}
                              </span>
                              {task.is_template_generated && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                                  Шаблон
                                </span>
                              )}
                              <button
                                onClick={() => handleReplace(task.task_id)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isReplacing
                                    ? "bg-blue-100 text-blue-600"
                                    : "hover:bg-slate-100 text-slate-400"
                                }`}
                                title="Заменить задачу"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Answer + Distractors (shown only when showAnswers is enabled) */}
                          <AnimatePresence>
                            {showAnswers && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="ml-10 mt-2.5 flex flex-wrap items-center gap-2 overflow-hidden"
                              >
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs max-w-full">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                  <span className="text-xs text-emerald-800">Правильный ответ:</span>
                                  <MathRenderer
                                    text={pickAnswerDisplayText(task.correct_answer, task.correct_answer_latex)}
                                    className="text-sm text-emerald-950 break-words whitespace-pre-wrap"
                                  />
                                </span>
                                {task.distractor_meta?.map((dm, i) => {
                                  const distExplanation = pickDistractorExplanation(dm);
                                  return (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-slate-50 text-slate-800 border border-slate-200/80 max-w-full hover:bg-slate-100/70 transition-colors shadow-2xs"
                                      title={distExplanation ? `Дистрактор: ${distExplanation}` : undefined}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                                      <span className="text-[11px] text-slate-500">#{i + 1}</span>
                                      <MathRenderer
                                        text={pickAnswerDisplayText(dm.value, dm.value_latex)}
                                        className="text-sm text-slate-900 break-words whitespace-pre-wrap"
                                      />
                                    </span>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {isPrintDraft && taskLayout && (
                            <div className="ml-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-indigo-100 bg-indigo-50/30 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700">Формат ответа</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Открытые задания печатаются с местом для решения в клетку; все ответы — в листе ответов.
                                </p>
                              </div>
                              <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                                  <button
                                    type="button"
                                    disabled={!canUseChoices}
                                    onClick={() => updatePrintTaskLayout(task, "choice")}
                                    className={cn(
                                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                                      taskLayout.response_kind === "choice"
                                        ? "bg-primary-600 text-white"
                                        : "text-slate-600 hover:bg-slate-100",
                                    )}
                                  >
                                    Тестовое
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updatePrintTaskLayout(task, "open")}
                                    className={cn(
                                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                                      taskLayout.response_kind === "open"
                                        ? "bg-primary-600 text-white"
                                        : "text-slate-600 hover:bg-slate-100",
                                    )}
                                  >
                                    Открытое
                                  </button>
                              </div>

                              {!canUseChoices && (
                                <p className="w-full text-[11px] text-amber-700">
                                  Тестовый формат недоступен: для печати нужно от 2 до 6 вариантов ответа.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Alternatives panel */}
                          <AnimatePresence>
                            {isReplacing && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="ml-10 mt-3"
                              >
                                <div className="bg-white rounded-xl border border-slate-200 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-slate-600">
                                      Выберите замену:
                                    </span>
                                    <button
                                      onClick={() => handleQuickReplace(task.task_id)}
                                      className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      Случайная замена
                                    </button>
                                  </div>

                                  {loadingAlts ? (
                                    <div className="flex items-center justify-center py-4 text-slate-400 text-xs">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500 mr-2" />
                                      Поиск альтернатив...
                                    </div>
                                  ) : alternatives.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-3 text-center">
                                      Нет альтернативных задач для этого навыка
                                    </p>
                                  ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                      {alternatives.map((alt) => (
                                        <button
                                          key={alt.task_id}
                                          onClick={() => handleSelectedReplace(task.task_id, alt.task_id)}
                                          className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:border-primary-300 hover:bg-primary-50/30 transition-all group"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="text-sm text-slate-800 flex-1 py-1">
                                              <MathRenderer
                                                text={pickTaskDisplayText({
                                                  task_id: alt.task_id,
                                                  question_text: alt.question_text,
                                                  question_latex: alt.question_latex,
                                                })}
                                                className="block text-sm text-slate-800 break-words whitespace-pre-wrap leading-relaxed"
                                              />
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${diffColors[alt.difficulty] || "bg-slate-100"}`}>
                                                {alt.difficulty}
                                              </span>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          );
        })}
      </div>

      {/* Bottom action bar */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref}>
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>
            К списку экзаменов
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {isPrintDraft ? (
            <>
              <span
                className="inline-flex items-center gap-1.5 text-xs text-slate-400"
                aria-live="polite"
              >
                {printSaveState === "saving" && (
                  <>
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-500" />
                    Сохранение…
                  </>
                )}
                {printSaveState === "saved" && (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Настройки сохранены
                  </>
                )}
                {printSaveState === "error" && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    Ошибка сохранения
                  </>
                )}
              </span>
              <Button
                variant="secondary"
                onClick={() => void openPrintPreview("teacher-key")}
                loading={printPreviewing === "teacher-key"}
                icon={<Eye className="w-4 h-4" />}
              >
                Ключ преподавателя
              </Button>
              <Button
                variant="primary"
                onClick={() => void openPrintPreview("student")}
                loading={printPreviewing === "student"}
                icon={<Printer className="w-4 h-4" />}
              >
                Предпросмотр бланка
              </Button>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              Сохранение в библиотеку и привязка к группе доступны в шапке черновика.
            </p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showScheduleModal && draft && (
          <ScheduleExamModal
            examTitle={draft.title}
            groups={groups}
            initialGroupId={draft.group_id}
            deliveryMode={draft.delivery_mode}
            onClose={() => setShowScheduleModal(false)}
            onSubmit={async ({ group, occurrence }) => {
              if (draft.delivery_mode === "print") {
                // Flush the editable layout before creating its immutable print
                // snapshot, even when the autosave debounce has not fired yet.
                if (printLayout) {
                  const saved = await examsApi.updatePrintLayout(examId, printLayout);
                  setPrintLayout(saved.layout);
                }
                await examsApi.preparePrintPackage(examId, {
                  group_id: group.id,
                  lesson_id: occurrence.id,
                  lesson_date: occurrence.occurrenceDate,
                });
                setShowScheduleModal(false);
                router.push(examHubHref);
                return;
              }

              const result = await examsApi.publish(examId, {
                group_id: group.id,
                lesson_id: occurrence.id,
                lesson_date: occurrence.occurrenceDate,
              });
              setPublishResult(result);
              setDraft((previous) => previous ? {
                ...previous,
                status: result.status,
                group_id: result.group_id || group.id,
                group_name: result.group_name || group.name,
              } : previous);
              setShowScheduleModal(false);
            }}
          />
        )}
      </AnimatePresence>

      {draft && (
        <RenameExamModal
          open={showRenameModal}
          currentTitle={draft.title}
          onClose={() => setShowRenameModal(false)}
          onSave={handleRename}
        />
      )}

      <ExamRemovalDialog
        removal={removal.removal}
        busy={removal.busy}
        error={removal.error}
        blocked={removal.blocked}
        onConfirm={removal.confirm}
        onClose={removal.close}
      />

      {/* Group Assignment Modal */}
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
              className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Привязать экзамен к группе
                </h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-slate-500 mb-4">
                Выберите группу (класс), для которой предназначен этот экзамен:
              </p>

              {groups.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-200 mb-4">
                  Нет доступных групп. Создайте группу в разделе «Школа».
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-6 pr-1 overscroll-contain">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => handleAssignGroup(g)}
                      disabled={assignLoading}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer",
                        draft?.group_id === g.id
                          ? "border-indigo-500 bg-indigo-50/50 font-semibold text-indigo-900"
                          : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-800"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                          {g.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{g.name}</div>
                          <div className="text-xs text-slate-400">
                            {g.student_count || 0} {pluralRu(g.student_count || 0, ["ученик", "ученика", "учеников"])} {g.class_level ? `· ${g.class_level} класс` : ""}
                          </div>
                        </div>
                      </div>
                      {draft?.group_id === g.id && (
                        <Check className="w-4 h-4 text-indigo-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowAssignModal(false)}>
                  Отмена
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
