"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { examsApi, orgApi, type Group } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import QRCode from "qrcode.react";
import { TaskFigureDrawer } from "@/components/tasks/TaskFigureDrawer";
import { ScheduleExamModal } from "@/components/exam/schedule-exam-modal";
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
  Bookmark,
  X,
  Plus,
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
  settings: Record<string, any>;
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

// ─── Difficulty badge colors ───
const diffColors: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
  B: "bg-amber-50 text-amber-700 border border-amber-200/80",
  C: "bg-rose-50 text-rose-700 border border-rose-200/80",
};

import { MathRenderer } from "@/components/ui/math-renderer";
import { pickAnswerDisplayText, pickTaskDisplayText, pickDistractorExplanation } from "@/lib/task-display";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ExamDraftPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;

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

  // Group assignment state
  const [groups, setGroups] = useState<Group[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);

  // Load draft
  useEffect(() => {
    if (!examId) return;
    setLoading(true);
    examsApi
      .getDraft(examId)
      .then((data) => {
        setDraft(data);
        // Auto-expand all sections
        const variant = data.variants.find((v) => v.variant_number === 1);
        if (variant) {
          const skills = new Set(variant.tasks.map((t) => t.skill_name || t.skill_id));
          setExpandedSections(skills);
        }
      })
      .catch((err) => setError(err.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));

    orgApi.listGroups().then((res) => setGroups(Array.isArray(res) ? res : [])).catch(() => {});
  }, [examId]);

  // ─── Background Scroll Lock When Modal Is Open ────────────────────────────
  useEffect(() => {
    if (showAssignModal || showScheduleModal) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [showAssignModal, showScheduleModal]);

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
      // Reload draft
      const data = await examsApi.getDraft(examId);
      setDraft(data);
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
      setDraft(data);
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
        <Link href="/teacher/exams">
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
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Варианты</div>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{draft.variants_count}</p>
                <p className="text-[10px] text-slate-500 leading-none">{formatVariants(draft.variants_count).split(" ")[1]}</p>
              </div>
              <div className="p-2 bg-slate-50/80 border border-slate-100 rounded-xl">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Задания</div>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{totalTasks}</p>
                <p className="text-[10px] text-slate-500 leading-none">в варианте</p>
              </div>
              <div className="p-2 bg-slate-50/80 border border-slate-100 rounded-xl">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Время</div>
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
              <Link href="/teacher/exams" className="w-full">
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
          <Link href="/teacher/exams">
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
        <div className="flex items-center gap-2">
          {!draft.group_id ? (
            <>
              <Button
                variant="secondary"
                onClick={() => router.push(`/teacher/exams/${examId}`)}
                icon={<Bookmark className="w-4 h-4 text-slate-600" />}
              >
                Сохранить в библиотеку
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowAssignModal(true)}
                icon={<Users className="w-4 h-4" />}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Привязать группу
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => router.push(`/teacher/exams/${examId}`)}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Перейти к экзамену
            </Button>
          )}
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
                  <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
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
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs max-w-full">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                  <span className="text-xs font-semibold text-emerald-800">Правильный ответ:</span>
                                  <MathRenderer
                                    text={pickAnswerDisplayText(task.correct_answer, task.correct_answer_latex)}
                                    className="text-sm sm:text-base font-medium text-emerald-950 break-words whitespace-pre-wrap"
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
                                      <span className="text-[11px] font-semibold text-slate-500">#{i + 1}</span>
                                      <MathRenderer
                                        text={pickAnswerDisplayText(dm.value, dm.value_latex)}
                                        className="text-sm sm:text-base font-medium text-slate-900 break-words whitespace-pre-wrap"
                                      />
                                    </span>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>

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
                                          onClick={async () => {
                                            // Replace with this specific task
                                            try {
                                              await examsApi.replaceTask(examId, {
                                                variant_number: activeVariant,
                                                task_id: task.task_id,
                                              });
                                              const data = await examsApi.getDraft(examId);
                                              setDraft(data);
                                              setReplacingTaskId(null);
                                              setAlternatives([]);
                                            } catch (err: any) {
                                              alert(err.message || "Ошибка замены");
                                            }
                                          }}
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
      <div className="mt-8 flex items-center justify-between">
        <Link href="/teacher/exams">
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>
            К списку экзаменов
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          {!draft.group_id ? (
            <>
              <Button
                variant="secondary"
                onClick={() => router.push(`/teacher/exams/${examId}`)}
                icon={<Bookmark className="w-4 h-4 text-slate-600" />}
              >
                Сохранить в библиотеку
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowAssignModal(true)}
                icon={<Users className="w-4 h-4" />}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Привязать группу
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => router.push(`/teacher/exams/${examId}`)}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Перейти к экзамену
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showScheduleModal && draft && (
          <ScheduleExamModal
            examTitle={draft.title}
            groups={groups}
            initialGroupId={draft.group_id}
            onClose={() => setShowScheduleModal(false)}
            onSubmit={async ({ group, occurrence }) => {
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
                            {g.student_count || 0} учеников {g.class_level ? `· ${g.class_level} класс` : ""}
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
