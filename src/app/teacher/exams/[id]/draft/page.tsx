"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { examsApi } from "@/lib/api";
import Link from "next/link";
import QRCode from "qrcode.react";
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
} from "lucide-react";

// ─── Types ───

interface DistractorMeta {
  value: string;
  value_latex?: string | null;
  error_type: string;
  explanation: string;
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
  A: "bg-green-100 text-green-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-red-100 text-red-700",
};

import { MathText } from "@/components/ui/math-renderer";
import { pickAnswerDisplayText } from "@/lib/task-display";

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
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ access_code: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
  }, [examId]);

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

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const result = await examsApi.publish(examId);
      setPublishResult(result);
      // Update draft status
      setDraft((prev) => (prev ? { ...prev, status: "active" } : prev));
    } catch (err: any) {
      alert(err.message || "Ошибка публикации");
    } finally {
      setPublishing(false);
    }
  };

  const handleCopy = () => {
    if (publishResult?.access_code) {
      navigator.clipboard.writeText(`https://algo.uz/e/${publishResult.access_code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
    return (
      <div className="max-w-3xl mx-auto py-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <GlassCard className="p-8 text-center" glow>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center"
            >
              <Sparkles className="w-10 h-10 text-green-600" />
            </motion.div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Экзамен опубликован!</h2>
            <p className="text-slate-500 mb-8">
              {draft.variants_count} вариант{draft.variants_count > 1 ? "ов" : ""} по{" "}
              {draft.tasks_per_variant} заданий
            </p>

            <div className="inline-block p-6 bg-white rounded-2xl shadow-lg mb-6">
              <QRCode
                value={`https://algo.uz/e/${publishResult.access_code}`}
                size={180}
                level="M"
                includeMargin
              />
              <p className="mt-3 font-mono text-lg font-bold text-slate-900">
                algo.uz/e/{publishResult.access_code}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-2xl font-bold text-slate-900">{draft.variants_count}</p>
                <p className="text-xs text-slate-500">вариантов</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-2xl font-bold text-slate-900">{totalTasks}</p>
                <p className="text-xs text-slate-500">заданий</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-2xl font-bold text-slate-900">{draft.total_time_minutes}</p>
                <p className="text-xs text-slate-500">минут</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <Button
                icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                variant="secondary"
                onClick={handleCopy}
              >
                {copied ? "Скопировано!" : "Копировать ссылку"}
              </Button>
              <Button icon={<Share2 className="w-4 h-4" />} variant="secondary">
                Отправить ученикам
              </Button>
              <Link href={`/e/${publishResult.access_code}`}>
                <Button icon={<Users className="w-4 h-4" />}>Открыть экзамен</Button>
              </Link>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <Link href="/teacher/exams">
                <Button variant="ghost">К списку экзаменов</Button>
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/teacher/exams">
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
              Назад
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{draft.title}</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                Черновик
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {draft.variants_count} вариант{draft.variants_count > 1 ? "ов" : ""} · {totalTasks}{" "}
              заданий · {draft.total_time_minutes} мин
            </p>
          </div>
        </div>
        <Button
          onClick={handlePublish}
          loading={publishing}
          icon={<Send className="w-4 h-4" />}
        >
          Опубликовать
        </Button>
      </div>

      {/* Stats bar */}
      <GlassCard className="p-4 mb-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Сложность:</span>
            <div className="flex gap-1.5">
              {(["A", "B", "C"] as const).map((d) => (
                <span key={d} className={`px-2 py-0.5 rounded text-xs font-medium ${diffColors[d]}`}>
                  {d}: {diffDist[d] || 0}
                </span>
              ))}
            </div>
            {Object.values(diffDist).reduce((a, b) => a + b, 0) === totalTasks && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                100% OK
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
                                  <MathText text={task.question_text} />
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

                          {/* Answer + Distractors */}
                          <div className="ml-10 mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 max-w-full">
                              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                              <MathText text={pickAnswerDisplayText(task.correct_answer, task.correct_answer_latex)} className="text-xs" />
                            </span>
                            {task.distractor_meta?.map((dm, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-red-50 text-red-600 border border-red-100 max-w-full"
                                title={dm.explanation}
                              >
                                <XCircle className="w-3 h-3 flex-shrink-0" />
                                <MathText text={pickAnswerDisplayText(dm.value, dm.value_latex)} className="text-xs" />
                              </span>
                            ))}
                          </div>

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
                                            <p className="text-xs text-slate-700 flex-1 line-clamp-2">
                                              {alt.question_text}
                                            </p>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                              <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${diffColors[alt.difficulty] || "bg-slate-100"}`}>
                                                {alt.difficulty}
                                              </span>
                                              <span className="text-[10px] text-green-600">
                                                = {alt.correct_answer}
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

      {/* Bottom publish bar */}
      <div className="mt-8 flex items-center justify-between">
        <Link href="/teacher/exams">
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>
            К списку
          </Button>
        </Link>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Eye className="w-4 h-4" />}>
            Предпросмотр
          </Button>
          <Button
            onClick={handlePublish}
            loading={publishing}
            icon={<Send className="w-4 h-4" />}
          >
            Опубликовать экзамен
          </Button>
        </div>
      </div>
    </div>
  );
}
