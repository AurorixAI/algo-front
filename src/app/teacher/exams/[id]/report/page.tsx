"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Sparkles,
  Award,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Users,
  BarChart3,
  TrendingUp,
  FileBarChart2,
  Calendar,
  Layers,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Check,
  Clock,
  Flame,
  CheckSquare,
  FileText,
} from "lucide-react";

import { examsApi } from "@/lib/api";
import { MathRenderer } from "@/components/ui/math-renderer";
import { pickTaskDisplayProjection, prepareMathDisplay } from "@/lib/task-display";
import { cn } from "@/lib/utils";
import { formatUtcNaiveAsBusinessDayTime } from "@/lib/business-time";
import "katex/dist/katex.min.css";

interface TaskAnalytic {
  task_id?: string;
  skill_name?: string;
  question_text?: string;
  question_latex?: string | null;
  question_preview?: string;
  correct_answer?: string;
  attempts: number;
  correct_count: number;
  wrong_count: number;
  correct_rate: number;
  distractor_hits?: Array<{
    explanation: string;
    error_type?: string;
    count: number;
    students_pct: number;
  }>;
  answers_sample?: string[];
}

interface TopError {
  explanation: string;
  total_count: number;
  affected_skills?: string[];
  students_pct: number;
}

interface ExamReportData {
  exam_id: string;
  title: string;
  total_students: number;
  submitted_count: number;
  avg_score_pct: number;
  pass_rate_pct: number;
  task_analytics: TaskAnalytic[];
  top_errors: TopError[];
  narrative_ru?: string | null;
  narrative_generated?: boolean;
  is_final?: boolean;
  generated_at?: string | null;
}

interface StrengthItem {
  topic: string;
  detail: string;
}

interface CriticalGapItem {
  topic: string;
  detail: string;
}

interface ProblemTaskItem {
  task_id?: string;
  statement_unavailable?: boolean;
  task_title: string;
  question_text?: string;
  question_latex?: string | null;
  correct_answer?: string;
  error_rate_pct: number;
  misconception: string;
  teacher_advice: string;
}

interface LessonPlanWarmup {
  duration: string;
  focus: string;
  key_rules: string[];
}

interface LessonPlanBoardTask {
  title: string;
  focus: string;
  steps: string[];
}

interface LessonPlanPractice {
  duration: string;
  task_recommendation: string;
}

interface LessonPlanHomework {
  struggling_group: string;
  advanced_group: string;
}

interface LessonPlan {
  warmup?: LessonPlanWarmup;
  board_tasks?: LessonPlanBoardTask[];
  practice?: LessonPlanPractice;
  homework?: LessonPlanHomework;
}

interface StructuredReport {
  summary?: string;
  strengths?: StrengthItem[];
  critical_gaps?: CriticalGapItem[];
  problem_tasks_analysis?: ProblemTaskItem[];
  lesson_plan?: LessonPlan;
}

function parseStructuredReport(text?: string | null, taskAnalytics?: TaskAnalytic[]): StructuredReport {
  if (!text) return fallbackReport(taskAnalytics);
  const cleaned = text.trim();

  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object") {
      return {
        summary: obj.summary,
        strengths: Array.isArray(obj.strengths) ? obj.strengths : [],
        critical_gaps: Array.isArray(obj.critical_gaps) ? obj.critical_gaps : [],
        problem_tasks_analysis: Array.isArray(obj.problem_tasks_analysis) ? obj.problem_tasks_analysis : [],
        lesson_plan: obj.lesson_plan || {},
      };
    }
  } catch {}

  const report: StructuredReport = {
    strengths: [],
    critical_gaps: [],
    problem_tasks_analysis: [],
    lesson_plan: {},
  };

  const parts = cleaned.split(/(?=##\s*\d+\.\s*)/g);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (/^##\s*1\./i.test(trimmed) || /Резюме/i.test(trimmed)) {
      report.summary = trimmed.replace(/^##\s*1\.\s*[^\n]*\n?/i, "").trim();
    } else if (/^##\s*2\./i.test(trimmed) || /Сильные стороны/i.test(trimmed)) {
      const content = trimmed.replace(/^##\s*2\.\s*[^\n]*\n?/i, "").trim();
      report.strengths = content.split("\n").filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-")).map((l) => ({
        topic: l.replace(/^[•\-]\s*/, "").split("—")[0]?.trim() || "Освоенная тема",
        detail: l.replace(/^[•\-]\s*/, "").split("—")[1]?.trim() || l.replace(/^[•\-]\s*/, ""),
      }));
      if (report.strengths.length === 0 && content) {
        report.strengths = [{ topic: "Освоенный блок", detail: content }];
      }
    } else if (/^##\s*3\./i.test(trimmed) || /Критические пробелы|пробелы/i.test(trimmed)) {
      const content = trimmed.replace(/^##\s*3\.\s*[^\n]*\n?/i, "").trim();
      report.critical_gaps = content.split("\n").filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-")).map((l) => ({
        topic: l.replace(/^[•\-]\s*/, "").split("—")[0]?.trim() || "Проблемная тема",
        detail: l.replace(/^[•\-]\s*/, "").split("—")[1]?.trim() || l.replace(/^[•\-]\s*/, ""),
      }));
      if (report.critical_gaps.length === 0 && content) {
        report.critical_gaps = [{ topic: "Пробелы в понимании", detail: content }];
      }
    }
  }

  if (!report.summary && cleaned) {
    report.summary = cleaned;
  }

  return report;
}

function fallbackReport(taskAnalytics?: TaskAnalytic[]): StructuredReport {
  const problemTasks = (taskAnalytics || []).filter((t) => t.correct_rate < 0.65 && t.attempts > 0);
  const strongTasks = (taskAnalytics || []).filter((t) => t.correct_rate >= 0.65 && t.attempts > 0);

  return {
    summary: "По итогам проведённой контрольной работы сформирован предварительный анализ. Класс показал владение базовыми темами, однако отдельные типы задач требуют повторения и отработки.",
    strengths: strongTasks.map((t) => ({
      topic: t.skill_name || "Базовые вычисления",
      detail: `${Math.round(t.correct_rate * 100)}% учащихся успешно справились с заданием, продемонстрировав уверенное владение базовым алгоритмом.`,
    })),
    critical_gaps: problemTasks.map((t) => ({
      topic: t.skill_name || "Комплексные задачи",
      detail: `${Math.round((1 - t.correct_rate) * 100)}% учащихся допустили ошибки. Причина: ${t.distractor_hits?.[0]?.explanation || "сложности при выполнении промежуточных преобразований"}.`,
    })),
    problem_tasks_analysis: problemTasks.map((t, idx) => ({
      task_id: t.task_id,
      task_title: `Задание ${idx + 1}: ${t.skill_name || "Задача"}`,
      question_text: t.question_text || t.question_preview || "",
      question_latex: t.question_latex,
      correct_answer: t.correct_answer || "",
      error_rate_pct: Math.round((1 - t.correct_rate) * 100),
      misconception: t.distractor_hits?.[0]?.explanation || `Сложности при выполнении преобразований в теме «${t.skill_name || "Задание"}»`,
      teacher_advice: `1. Разобрать на доске исходное задание по теме «${t.skill_name}» с фиксацией формул. 2. Разобрать ловушку и показать неверный ход мысли. 3. Провести проверку подстановкой.`,
    })),
    lesson_plan: {
      warmup: {
        duration: "5–7 мин",
        focus: "Экспресс-повторение формул и базовых определений",
        key_rules: ["Внимательная проверка знаков при переносе слагаемых через знак равенства", "Проверка корней подстановкой в исходное уравнение"],
      },
      board_tasks: problemTasks.slice(0, 2).map((t) => ({
        title: `Разбор задания: «${t.skill_name || "Типовая ошибка"}»`,
        focus: `Разбор ловушки: ${t.distractor_hits?.[0]?.explanation || "типичная ошибка"}`,
        steps: ["Записать дано и коэффициенты", "Применить формулу с явными скобками", "Записать и проверить ответ"],
      })),
      practice: {
        duration: "10–15 мин",
        task_recommendation: "Решение 2–3 аналогичных тренировочных задач в парах с взаимопроверкой по эталону.",
      },
      homework: {
        struggling_group: "Работа над ошибками варианта и 4 базовых примера на закрепление алгоритма.",
        advanced_group: "Комбинированная задача повышенной сложности по пройденной теме.",
      },
    },
  };
}

function ReportTaskStatement({ task }: { task: ProblemTaskItem }) {
  const display = pickTaskDisplayProjection({
    task_id: task.task_id,
    question_text: task.question_text || "",
    question_latex: task.question_latex,
  });
  return <MathRenderer text={display.text} renderMode={display.renderMode} block />;
}

export default function ExamReportPage() {
  const params = useParams();
  const examId = params?.id as string;

  const [exam, setExam] = useState<any | null>(null);
  const [report, setReport] = useState<ExamReportData | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"diagnosis" | "errors" | "plan">("diagnosis");

  const loadData = async (force = false) => {
    if (!examId) return;
    setError(null);
    try {
      if (force) setRecalculating(true);
      else setLoading(true);

      const [examData, sessionsData] = await Promise.all([
        examsApi.getDraft(examId),
        // A missing sessions response is not the same thing as zero attempts.
        // Let the page show its existing retryable error state instead.
        examsApi.getSessions(examId),
      ]);
      setExam(examData);
      setSessions(sessionsData || []);

      let rep: ExamReportData | null = null;
      try {
        if (force) {
          rep = await examsApi.generateReport(examId, true);
        } else {
          rep = await examsApi.getReport(examId);
        }
      } catch (err: any) {
        if (!force && (examData?.status === "closed" || examData?.status === "archived")) {
          try {
            rep = await examsApi.generateReport(examId, false);
          } catch (genErr: any) {
            console.error("Auto generate report error:", genErr);
          }
        }
      }
      setReport(rep);
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить отчёт");
    } finally {
      setLoading(false);
      setRecalculating(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [examId]);

  const structured = useMemo(() => {
    return parseStructuredReport(report?.narrative_ru, report?.task_analytics);
  }, [report?.narrative_ru, report?.task_analytics]);

  const scoreDistribution = useMemo(() => {
    const submitted = sessions.filter((s) => s.status === "submitted");
    const total = Math.max(1, submitted.length);
    let excellent = 0, good = 0, satisfactory = 0, needHelp = 0;

    submitted.forEach((s) => {
      const pct = Number(s.percentage || 0);
      if (pct >= 85) excellent++;
      else if (pct >= 70) good++;
      else if (pct >= 50) satisfactory++;
      else needHelp++;
    });

    return {
      excellent: { count: excellent, pct: Math.round((excellent / total) * 100) },
      good: { count: good, pct: Math.round((good / total) * 100) },
      satisfactory: { count: satisfactory, pct: Math.round((satisfactory / total) * 100) },
      needHelp: { count: needHelp, pct: Math.round((needHelp / total) * 100) },
    };
  }, [sessions]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-violet-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Загрузка педагогического отчёта...</p>
        </div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-500 mb-2" />
          <p className="text-sm font-bold">{error || "Экзамен не найден"}</p>
        </div>
      </div>
    );
  }

  const avgPct = Number(report?.avg_score_pct ?? 0);
  const passPct = Number(report?.pass_rate_pct ?? 0);
  const problemTasksList = structured.problem_tasks_analysis || [];

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6">

        {/* ── НАВИГАЦИЯ НАЗАД ────────────────────────────────────────────── */}
        <div>
          <Link
            href={`/teacher/exams/${examId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Link>
        </div>

        {/* ── ШАПКА ЭКЗАМЕНА (Идентичная исходному стилю) ─────────────────── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/20">
                <FileBarChart2 className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="break-words text-lg sm:text-xl font-bold text-slate-900">
                    {report?.title || exam.title}
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Завершён
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {exam.class_level && (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                      {exam.class_level} класс
                    </span>
                  )}
                  {report?.generated_at && (
                    <span className="flex items-center gap-1 text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      Сформирован: {formatUtcNaiveAsBusinessDayTime(report.generated_at, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Кнопка Обновить отчёт */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => loadData(true)}
                disabled={recalculating}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-all"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", recalculating && "animate-spin")} />
                {recalculating ? "Генерация DeepSeek..." : "Обновить отчёт"}
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI КАРТОЧКИ (Идентичные исходному стилю) ───────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Средний балл */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Средний балл</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <BarChart3 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">{avgPct.toFixed(1)}%</span>
              <span className="text-xs text-slate-500">по классу</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  avgPct >= 70 ? "bg-emerald-500" : avgPct >= 50 ? "bg-amber-500" : "bg-rose-500"
                )}
                style={{ width: `${Math.min(100, Math.max(0, avgPct))}%` }}
              />
            </div>
          </div>

          {/* 2. Сдали порог */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Сдали порог (≥60%)</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Award className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-emerald-600">{passPct.toFixed(0)}%</span>
              <span className="text-xs text-slate-500">учеников</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, passPct))}%` }}
              />
            </div>
          </div>

          {/* 3. Сдали работы */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Сдали работы</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">
                {report?.submitted_count ?? 0}
              </span>
              <span className="text-xs text-slate-500">из {report?.total_students ?? 0} чел.</span>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {report?.total_students ? Math.round(((report?.submitted_count ?? 0) / report.total_students) * 100) : 0}% завершили работу
            </p>
          </div>

          {/* 4. Распределение результатов */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Распределение</span>
              <span className="text-xs font-bold text-slate-600">Оценки</span>
            </div>
            <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div style={{ width: `${scoreDistribution.excellent.pct}%` }} className="bg-emerald-500" title={`85-100%: ${scoreDistribution.excellent.count}`} />
              <div style={{ width: `${scoreDistribution.good.pct}%` }} className="bg-blue-400" title={`70-84%: ${scoreDistribution.good.count}`} />
              <div style={{ width: `${scoreDistribution.satisfactory.pct}%` }} className="bg-amber-400" title={`50-69%: ${scoreDistribution.satisfactory.count}`} />
              <div style={{ width: `${scoreDistribution.needHelp.pct}%` }} className="bg-rose-500" title={`<50%: ${scoreDistribution.needHelp.count}`} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                85–100%: {scoreDistribution.excellent.count}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                70–84%: {scoreDistribution.good.count}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                50–69%: {scoreDistribution.satisfactory.count}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                &lt;50%: {scoreDistribution.needHelp.count}
              </span>
            </div>
          </div>
        </div>

        {/* ── ТАБЫ РАЗДЕЛОВ (Как в Диагностике) ────────────────────────────── */}
        <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-200/40 p-1.5 shadow-xs sm:flex-row">
          <button
            onClick={() => setActiveTab("diagnosis")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all",
              activeTab === "diagnosis"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span>Педагогический диагноз</span>
          </button>

          <button
            onClick={() => setActiveTab("errors")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all",
              activeTab === "errors"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Разбор проблемных заданий</span>
            {problemTasksList.length > 0 && (
              <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
                {problemTasksList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("plan")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all",
              activeTab === "plan"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <BookOpen className="h-4 w-4 text-blue-600" />
            <span>План работы над ошибками</span>
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            ТАБ 1: ПЕДАГОГИЧЕСКИЙ ДИАГНОЗ
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "diagnosis" && (
          <div className="space-y-6">
            {/* Основополагающий блок: Общий уровень и динамика класса */}
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 via-white to-white p-6 sm:p-8 shadow-sm">
              <div className="text-center mb-3.5 space-y-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200/80 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-600">
                  Аналитическое резюме
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Общий уровень и динамика класса
                </h3>
              </div>
              <p className="max-w-4xl mx-auto text-center text-xs sm:text-sm leading-relaxed text-slate-700 font-medium">
                {structured.summary || "По итогам проведённой работы сформирован предварительный анализ готовности класса."}
              </p>
            </div>

            {/* 1. Блок: Успешно освоенные темы (Полноразмерный) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                      Успешно освоенные темы
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium">Навыки с высоким процентом правильных решений</p>
                  </div>
                </div>
                {(structured.strengths || []).length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-extrabold text-emerald-700">
                    {structured.strengths!.length} {structured.strengths!.length === 1 ? "освоенная тема" : "освоенные темы"}
                  </span>
                )}
              </div>

              {(structured.strengths || []).length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {structured.strengths!.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-emerald-50/40 via-white to-white p-5 transition-all hover:border-emerald-300/80 hover:shadow-xs relative overflow-hidden"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                            <MathRenderer text={item.topic} />
                          </div>
                          <div className="text-xs text-slate-600 leading-relaxed font-normal">
                            <MathRenderer text={item.detail} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  Базовые темы усвоены в пределах нормы.
                </div>
              )}
            </div>

            {/* 2. Блок: Критические пробелы и затруднения (Полноразмерный) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 border border-rose-200/60 text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                      Критические пробелы и затруднения
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium">Темы, вызвавшие наибольшее количество ошибок</p>
                  </div>
                </div>
                {(structured.critical_gaps || []).length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200/80 px-3 py-1 text-xs font-extrabold text-rose-700">
                    {structured.critical_gaps!.length} {structured.critical_gaps!.length === 1 ? "критический пробел" : "критических пробела"}
                  </span>
                )}
              </div>

              {(structured.critical_gaps || []).length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {structured.critical_gaps!.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-rose-50/40 via-white to-white p-5 transition-all hover:border-rose-300/80 hover:shadow-xs relative overflow-hidden"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                          <AlertTriangle className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                            <MathRenderer text={item.topic} />
                          </div>
                          <div className="text-xs text-slate-600 leading-relaxed font-normal">
                            <MathRenderer text={item.detail} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  Критических системных пробелов не выявлено.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ТАБ 2: РАЗБОР ПРОБЛЕМНЫХ ЗАДАНИЙ И КОГНИТИВНЫХ ЛОВУШЕК
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "errors" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Разбор проблемных заданий и когнитивных ловушек</h3>
                  <p className="text-xs text-slate-500">Задания с максимальной долей ошибок и методика устранения заблуждений</p>
                </div>
              </div>
            </div>

            {problemTasksList.length > 0 ? (
              <div className="space-y-5">
                {problemTasksList.map((task, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm transition-all"
                  >
                    {/* Заголовок карточки задания */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white text-xs font-black">
                          № {idx + 1}
                        </span>
                        <h4 className="min-w-0 break-words text-sm font-bold text-slate-900">
                          {task.task_title}
                        </h4>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-black text-rose-700 self-start sm:self-auto">
                        <Flame className="h-3.5 w-3.5 text-rose-600" />
                        {task.error_rate_pct}% ошибок класса
                      </span>
                    </div>

                    {/* Условие задачи и Правильный ответ */}
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {(task.statement_unavailable || task.question_latex || task.question_text) && (
                        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 sm:col-span-2">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            Условие задания
                          </div>
                          <div className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                            {task.statement_unavailable ? (
                              <Link href={`/teacher/exams/${examId}`} className="text-primary-600 underline">
                                Смотреть исходные задания контрольной
                              </Link>
                            ) : <ReportTaskStatement task={task} />}
                          </div>
                        </div>
                      )}

                      {task.correct_answer && (
                        <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:col-span-1">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Правильный ответ
                          </div>
                          <div className="text-xs sm:text-sm text-emerald-950 font-bold leading-relaxed">
                            <MathRenderer text={task.correct_answer} block />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Анализ ошибки и Совет учителю */}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/60 to-white p-4">
                        <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          Суть ошибки и когнитивная ловушка
                        </p>
                        <div className="mt-2 text-xs leading-relaxed text-slate-700 space-y-1">
                          {task.misconception.split("\n").map((line, lIdx) => (
                            <p key={lIdx} className={cn(line.startsWith("•") ? "pl-2 font-medium text-slate-800" : "")}>
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 to-white p-4">
                        <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          Методический совет учителю
                        </p>
                        <div className="mt-2 text-xs leading-relaxed text-slate-700 space-y-1">
                          {task.teacher_advice.split("\n").map((line, lIdx) => (
                            <p key={lIdx} className={cn(/^\d+\./.test(line.trim()) ? "font-medium text-slate-800" : "")}>
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-bold text-slate-700">Проблемных заданий с высоким процентом ошибок не выявлено.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ТАБ 3: ПОШАГОВЫЙ ПЛАН РАБОТЫ НАД ОШИБКАМИ
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "plan" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <BookOpen className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Пошаговый план работы над ошибками на следующий урок</h3>
                <p className="text-xs text-slate-500">Сценарий проведения урока с таймингом, разбором у доски и дифференциацией</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Этап 1: Разминка */}
              {structured.lesson_plan?.warmup && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700 font-black text-xs">
                        1
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Устная разминка и экспресс-повторение</h4>
                        <p className="text-xs text-slate-500">{structured.lesson_plan.warmup.focus}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 self-start sm:self-auto">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {structured.lesson_plan.warmup.duration || "5–7 мин"}
                    </span>
                  </div>

                  {structured.lesson_plan.warmup.key_rules && structured.lesson_plan.warmup.key_rules.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Формулы и правила для напоминания классу:</p>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {structured.lesson_plan.warmup.key_rules.map((rule, rIdx) => (
                          <div key={rIdx} className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs font-medium text-slate-800">
                            <CheckSquare className="h-4 w-4 text-violet-600 shrink-0" />
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Этап 2: Разбор у доски */}
              {structured.lesson_plan?.board_tasks && structured.lesson_plan.board_tasks.length > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-black text-xs">
                        2
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Фронтальный разбор ключевых заданий у доски</h4>
                        <p className="text-xs text-slate-500">Демонстрация верного хода мысли и нейтрализация ловушек</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 self-start sm:self-auto">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      15–20 мин
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {structured.lesson_plan.board_tasks.map((bTask, bIdx) => (
                      <div key={bIdx} className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/40 via-white to-white p-4">
                        <p className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          {bTask.title}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          Фокус: {bTask.focus}
                        </p>
                        {bTask.steps && bTask.steps.length > 0 && (
                          <div className="mt-3 space-y-1.5 pl-3 border-l-2 border-blue-200">
                            {bTask.steps.map((step, sIdx) => (
                              <p key={sIdx} className="text-xs text-slate-700">
                                <span className="font-bold text-slate-900 mr-1.5">{sIdx + 1}.</span>
                                {step}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Этап 3: Практикум */}
              {structured.lesson_plan?.practice && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-black text-xs">
                        3
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Самостоятельный практикум и тренажер</h4>
                        <p className="text-xs text-slate-500">Отработка аналогичных заданий в классе</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 self-start sm:self-auto">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {structured.lesson_plan.practice.duration || "10–15 мин"}
                    </span>
                  </div>
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <p className="text-xs leading-relaxed text-emerald-950 font-medium">
                      {structured.lesson_plan.practice.task_recommendation}
                    </p>
                  </div>
                </div>
              )}

              {/* Этап 4: Дифференцированное ДЗ */}
              {structured.lesson_plan?.homework && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-black text-xs">
                      4
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Дифференцированное домашнее задание</h4>
                      <p className="text-xs text-slate-500">Задания под уровень готовности учеников</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-4">
                      <p className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                        Для группы риска (отработка базы)
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-700">
                        {structured.lesson_plan.homework.struggling_group}
                      </p>
                    </div>

                    <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/40 p-4">
                      <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-indigo-600" />
                        Для сильных учеников (продвинутый уровень)
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-700">
                        {structured.lesson_plan.homework.advanced_group}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
