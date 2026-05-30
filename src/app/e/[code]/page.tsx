"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TestBackground } from "@/components/ui/test-background";
import { TestHeader } from "@/components/ui/test-header";
import { QuestionCard } from "@/components/ui/question-card";
import { OptionGrid } from "@/components/ui/option-grid";
import { TextInputAnswer } from "@/components/ui/text-input-answer";
import { AnalyzingToast } from "@/components/ui/analyzing-toast";
import {
  Clock,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  User,
  BookOpen,
  Send,
  Home,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { examsApi } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "loading" | "lobby" | "starting" | "exam" | "review" | "submitting" | "results" | "error";

interface Task {
  task_id: string;
  text: string;
  options: string[];
  image_url?: string;
  difficulty: string;
  skill_name: string;
  answer_type?: string;
}

interface ExamInfo {
  title: string;
  teacher_name: string | null;
  subject: string;
  total_time_minutes: number;
  tasks_per_variant: number;
  variants_count: number;
  status: string;
}

interface ExamResult {
  session_id: string;
  exam_title: string;
  student_name: string;
  variant_number: number;
  score: number;
  max_score: number;
  correct_count: number;
  answered_count: number;
  total_tasks: number;
  percentage: number;
  time_spent_seconds: number;
  submitted_at: string;
  tasks?: Array<{
    task_id: string;
    text: string;
    options: string[];
    student_answer: string | null;
    correct_answer: string;
    is_correct: boolean;
    skill_name: string;
  }>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExamPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  // Phase & error
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>("");

  // Lobby
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [studentName, setStudentName] = useState("");
  const [classLevel, setClassLevel] = useState("");

  // Exam session
  const [sessionId, setSessionId] = useState("");
  const [variantNumber, setVariantNumber] = useState(1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const startTimeRef = useRef<number>(0);

  // Results
  const [result, setResult] = useState<ExamResult | null>(null);
  const [showDetailedResults, setShowDetailedResults] = useState(false);

  // ── Load exam info on mount ──────────────────────────────────────────────
  useEffect(() => {
    const loadExamInfo = async () => {
      try {
        const info = await examsApi.getByCode(code);
        setExamInfo(info);
        if (info.status !== "active") {
          setError("Этот экзамен уже закрыт");
          setPhase("error");
          return;
        }
        setPhase("lobby");
      } catch (err: any) {
        console.error("Failed to load exam:", err);
        setError(err.message || "Экзамен не найден. Проверьте код доступа.");
        setPhase("error");
      }
    };
    loadExamInfo();
  }, [code]);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "exam" || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, timeLeft]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (phase === "exam" && timeLeft === 0 && startTimeRef.current > 0) {
      handleSubmit();
    }
  }, [timeLeft, phase]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const task = tasks[currentQuestion];
  const answeredCount = tasks.filter((t) => answers[t.task_id]?.trim()).length;
  const unansweredTasks = tasks.filter((t) => !answers[t.task_id]?.trim());
  const isAnswered = (taskId: string) => !!answers[taskId]?.trim();
  const progressPercent = tasks.length > 0 ? (answeredCount / tasks.length) * 100 : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!studentName.trim()) return;
    setPhase("starting");
    try {
      const parsed = parseInt(classLevel) || 0;
      const res = await examsApi.startSession(code, {
        student_name: studentName.trim(),
        class_level: parsed,
      });
      setSessionId(res.session_id);
      setVariantNumber(res.variant_number);
      setTasks(res.tasks);
      setTimeLeft(res.time_minutes * 60);
      startTimeRef.current = Date.now();
      setPhase("exam");
    } catch (err: any) {
      console.error("Failed to start exam:", err);
      setError(err.message || "Не удалось начать экзамен");
      setPhase("error");
    }
  };

  const handleAnswer = (taskId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [taskId]: answer }));
  };

  const toggleFlag = () => {};

  const handleFinish = () => {
    if (unansweredTasks.length > 0) {
      setPhase("review");
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (phase === "submitting") return; // prevent double submit
    setPhase("submitting");
    try {
      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const submitResult = await examsApi.submit(sessionId, {
        answers,
        time_spent_seconds: timeSpent,
      });

      // Try to get detailed results
      try {
        const detailed = await examsApi.getResult(sessionId);
        setResult(detailed);
      } catch {
        // Fallback to submit response data
        setResult({
          session_id: submitResult.session_id,
          exam_title: examInfo?.title || "",
          student_name: studentName,
          variant_number: variantNumber,
          score: submitResult.score,
          max_score: submitResult.max_score,
          correct_count: submitResult.correct_count,
          answered_count: submitResult.answered_count,
          total_tasks: submitResult.total_tasks,
          percentage: submitResult.percentage,
          time_spent_seconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
          submitted_at: new Date().toISOString(),
        });
      }
      setPhase("results");
    } catch (err: any) {
      console.error("Submit failed:", err);
      setError(err.message || "Ошибка отправки ответов. Попробуйте ещё раз.");
      setPhase("error");
    }
  };

  const goNext = () => setCurrentQuestion((c) => Math.min(tasks.length - 1, c + 1));
  const goPrev = () => setCurrentQuestion((c) => Math.max(0, c - 1));

  // ── Render ───────────────────────────────────────────────────────────────

  // Loading
  if (phase === "loading") {
    return (
      <div className="h-screen w-full overflow-hidden relative bg-background-light">
        <TestBackground />
        <div className="relative z-10 h-full flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-500">Загрузка экзамена...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <div className="h-screen w-full overflow-hidden relative bg-background-light">
        <TestBackground />
        <div className="relative z-10 h-full flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <GlassCard variant="panel" className="p-8 md:p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Ошибка</h2>
              <p className="text-slate-500 mb-6">{error}</p>
              <Link href="/login">
                <Button className="w-full" icon={<Home className="w-4 h-4" />}>
                  На главную
                </Button>
              </Link>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden relative bg-background-light text-slate-800 font-sans">
      <TestBackground />

      <main className="relative z-10 w-full h-full flex flex-col">

        {/* ═══════════════ LOBBY ═══════════════ */}
        {(phase === "lobby" || phase === "starting") && examInfo && (
          <div className="flex-1 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              className="w-full max-w-md"
            >
              <GlassCard variant="panel" className="p-8 md:p-10 relative overflow-hidden" glow>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-40" />

                <div className="text-center mb-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-primary-600" />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 mb-1">{examInfo.title}</h1>
                  <span className="uppercase tracking-[0.2em] text-[10px] font-bold text-slate-400">
                    {examInfo.subject || "Математика"}
                  </span>
                </div>

                {/* Info grid */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between p-3 glass-option rounded-xl !cursor-default !transform-none">
                    <span className="text-sm text-slate-500">Код экзамена</span>
                    <span className="font-mono font-bold text-primary-600">{code}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 glass-option rounded-xl !cursor-default !transform-none">
                    <span className="text-sm text-slate-500">Учитель</span>
                    <span className="font-medium text-slate-900">{examInfo.teacher_name || "—"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <Clock className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                      <p className="text-lg font-bold text-slate-900">{examInfo.total_time_minutes}</p>
                      <p className="text-xs text-slate-500">минут</p>
                    </div>
                    <div className="p-3 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <BookOpen className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                      <p className="text-lg font-bold text-slate-900">{examInfo.tasks_per_variant}</p>
                      <p className="text-xs text-slate-500">вопросов</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <Input
                    label="Ваше имя"
                    placeholder="Иван Петров"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    icon={<User className="w-4 h-4" />}
                  />
                  <Input
                    label="Класс"
                    placeholder="8"
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleStart}
                  disabled={!studentName.trim() || phase === "starting"}
                  loading={phase === "starting"}
                  icon={phase !== "starting" ? <ArrowRight className="w-5 h-5" /> : undefined}
                >
                  {phase === "starting" ? "Подготовка..." : "Начать экзамен"}
                </Button>

                <p className="text-xs text-center text-slate-400 mt-4">
                  После начала таймер будет запущен и остановить его нельзя
                </p>
              </GlassCard>
            </motion.div>
          </div>
        )}

        {/* ═══════════════ EXAM ═══════════════ */}
        {phase === "exam" && task && (
          <>
            <TestHeader
              mode="exam"
              timer={formatTime(timeLeft)}
              timerDanger={timeLeft < 300}
            />

            <div className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-6 relative flex flex-col items-center justify-center pb-24 overflow-y-auto">
              <div className="w-full flex flex-col gap-6 md:gap-8 py-4">
                {/* Question card */}
                <QuestionCard
                  questionKey={task.task_id}
                  topic={`${task.skill_name} • Вопрос ${currentQuestion + 1}/${tasks.length}`}
                  meta={
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        task.difficulty === "C"
                          ? "bg-red-100 text-red-700"
                          : task.difficulty === "B"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {task.difficulty === "C" ? "Сложный" : task.difficulty === "B" ? "Средний" : "Лёгкий"}
                    </span>
                  }
                >
                  {task.text}
                  {task.image_url && (
                    <div className="mt-6 flex justify-center">
                      <img
                        src={task.image_url}
                        alt="Иллюстрация"
                        className="max-w-full max-h-48 rounded-xl border border-slate-200"
                      />
                    </div>
                  )}
                </QuestionCard>
                {/* Answer area */}
                {task.options && task.options.length > 0 ? (
                  <OptionGrid
                    options={task.options.map((opt, idx) => ({
                      key: opt,
                      label: String.fromCharCode(65 + idx),
                      content: opt,
                    }))}
                    selected={answers[task.task_id] || ""}
                    onSelect={(key) => handleAnswer(task.task_id, key)}
                  />
                ) : (
                  <TextInputAnswer
                    value={answers[task.task_id] || ""}
                    onChange={(val) => setAnswers((prev) => ({ ...prev, [task.task_id]: val }))}
                    onSubmit={goNext}
                    answerType={task.answer_type}
                  />
                )}

                {/* Navigation buttons */}
                <div className="flex justify-between items-center px-2">
                  <button
                    onClick={goPrev}
                    disabled={currentQuestion === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-md border border-white/40 text-slate-500 hover:text-slate-900 hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-sm font-medium hidden md:inline">Назад</span>
                  </button>

                  {/* Question number grid */}
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-xs">
                    {tasks.map((t, idx) => (
                      <button
                        key={t.task_id}
                        onClick={() => setCurrentQuestion(idx)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                          idx === currentQuestion
                            ? "bg-primary-600 text-white shadow-md"
                            : isAnswered(t.task_id)
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-white/70 text-slate-400 border border-slate-200 hover:border-primary-300 hover:text-primary-600"
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>

                  {currentQuestion < tasks.length - 1 ? (
                    <button
                      onClick={goNext}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-md border border-white/40 text-slate-500 hover:text-slate-900 hover:bg-white/90 transition-all"
                    >
                      <span className="text-sm font-medium hidden md:inline">Далее</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleFinish}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary-600 text-white shadow-lg shadow-primary-500/25 hover:bg-primary-500 transition-all"
                    >
                      <Send className="w-4 h-4" />
                      <span className="text-sm font-medium">Завершить</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════ REVIEW ═══════════════ */}
        {phase === "review" && (
          <div className="flex-1 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md"
            >
              <GlassCard variant="panel" className="p-8 md:p-10 text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-amber-600" />
                </div>

                <h2 className="text-xl font-bold text-slate-900 mb-2">Остались неотвеченные вопросы</h2>
                <p className="text-slate-500 mb-6">
                  Вы не ответили на {unansweredTasks.length} из {tasks.length} вопросов
                </p>

                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {unansweredTasks.map((t) => {
                    const idx = tasks.findIndex((q) => q.task_id === t.task_id);
                    return (
                      <button
                        key={t.task_id}
                        onClick={() => {
                          setCurrentQuestion(idx);
                          setPhase("exam");
                        }}
                        className="w-10 h-10 rounded-xl glass-option text-red-700 font-medium hover:bg-red-50 transition-colors text-sm"
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => setPhase("exam")}
                    icon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Вернуться к вопросам
                  </Button>
                  <Button className="w-full" onClick={handleSubmit} icon={<Send className="w-4 h-4" />}>
                    Отправить как есть
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}

        {/* ═══════════════ SUBMITTING ═══════════════ */}
        {phase === "submitting" && (
          <>
            <AnalyzingToast visible={true} text="SUBMITTING ANSWERS..." />
            <div className="flex-1 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-6 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                  <div className="absolute bottom-0 left-0 w-full animate-liquid-rise z-0">
                    <div className="w-full h-20 liquid-bg animate-liquid-pulse opacity-90" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Отправка ответов...</h2>
                <p className="text-slate-500">Пожалуйста, не закрывайте страницу</p>
              </motion.div>
            </div>
          </>
        )}

        {/* ═══════════════ RESULTS ═══════════════ */}
        {phase === "results" && result && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-lg mx-auto p-4 py-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <GlassCard variant="panel" className="p-8 md:p-10" glow>
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring" }}
                      className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                    >
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </motion.div>

                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Спасибо за прохождение!</h2>
                    <p className="text-slate-500 mb-2">
                      {result.student_name}, ваши ответы успешно отправлены учителю.
                    </p>
                    <p className="text-sm text-slate-400 mb-8">
                      Результаты будут доступны у вашего преподавателя.
                    </p>

                    {/* Brief stats */}
                    <div className="grid grid-cols-2 gap-3 mb-8">
                      <div className="p-3 glass-option rounded-xl text-center !cursor-default !transform-none">
                        <p className="text-lg font-bold text-slate-900">{result.answered_count}/{result.total_tasks}</p>
                        <p className="text-xs text-slate-500">Отвечено</p>
                      </div>
                      <div className="p-3 glass-option rounded-xl text-center !cursor-default !transform-none">
                        <Clock className="w-5 h-5 mx-auto mb-1 text-slate-500" />
                        <p className="text-lg font-bold text-slate-700">
                          {Math.floor(result.time_spent_seconds / 60)}:{(result.time_spent_seconds % 60).toString().padStart(2, "0")}
                        </p>
                        <p className="text-xs text-slate-500">Время</p>
                      </div>
                    </div>

                    <Link href="/login">
                      <Button className="w-full" icon={<Home className="w-4 h-4" />}>
                        На главную
                      </Button>
                    </Link>
                  </div>
                </GlassCard>
              </motion.div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
