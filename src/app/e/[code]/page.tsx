"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
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
  Fingerprint,
  Users,
  ShieldCheck,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { examsApi } from "@/lib/api";
import { MathRenderer } from "@/components/ui/math-renderer";
import { pickOptionDisplayProjection, pickTaskDisplayProjection } from "@/lib/task-display";
import { createAdvanceOnce } from "@/lib/option-tap";
import { IDENTITY_HINT, canSubmitIdentity, idPlaceholder } from "@/lib/exam-entry";
import { TaskFigureDrawer } from "@/components/tasks/TaskFigureDrawer";

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "loading" | "lobby" | "waiting_room" | "starting" | "exam" | "review" | "submitting" | "results" | "error";

interface Task {
  task_id: string;
  text: string;
  question_latex?: string | null;
  attested_fields?: string[] | null;
  content_quality?: Record<string, unknown> | null;
  options: string[];
  options_latex?: string[] | null;
  image_url?: string;
  difficulty: string;
  skill_name: string;
  answer_type?: string;
}

interface ExamInfo {
  title: string;
  teacher_name: string | null;
  subject: string;
  group_id?: string | null;
  group_name?: string | null;
  class_level?: number | null;
  total_time_minutes: number;
  tasks_per_variant: number;
  variants_count: number;
  status: string;
  time_remaining_seconds?: number | null;
  started_at?: string | null;
  /** Centre ID prefix (e.g. «TE»), when the server exposes it: only used in the ID example. */
  student_id_prefix?: string | null;
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
    correct_answer?: string | null;
    correct_answer_latex?: string | null;
    is_correct?: boolean | null;
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
  const [groupWarning, setGroupWarning] = useState<string | null>(null);

  // Single attempt & confirmation modal
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submittedSessionId, setSubmittedSessionId] = useState<string | null>(null);
  const [showStartConfirm, setShowStartConfirm] = useState(false);

  // Lobby
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [confirmedStudent, setConfirmedStudent] = useState<{
    name: string;
    display_id?: string;
  } | null>(null);

  // Exam session
  const [sessionId, setSessionId] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [variantNumber, setVariantNumber] = useState(1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const startTimeRef = useRef<number>(0);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // "next question" after a confirmed option: at most one advance per pause, so a fast extra tap cannot skip a question
  const goNextRef = useRef<() => void>(() => {});
  const advanceRef = useRef<ReturnType<typeof createAdvanceOnce> | null>(null);
  if (advanceRef.current === null) {
    advanceRef.current = createAdvanceOnce({
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      delayMs: 180,
      advance: () => goNextRef.current(),
    });
  }
  useEffect(() => () => advanceRef.current?.cancel(), []);

  // Results
  const [result, setResult] = useState<ExamResult | null>(null);

  // Live countdown ticker for late-join modal
  const [liveRemainingSec, setLiveRemainingSec] = useState<number | null>(null);

  useEffect(() => {
    if (!examInfo) return;
    if (examInfo.time_remaining_seconds !== undefined && examInfo.time_remaining_seconds !== null) {
      setLiveRemainingSec(examInfo.time_remaining_seconds);
    } else {
      setLiveRemainingSec((examInfo.total_time_minutes || 45) * 60);
    }
  }, [examInfo]);

  useEffect(() => {
    if (liveRemainingSec === null || liveRemainingSec <= 0 || !showStartConfirm) return;
    const timer = setInterval(() => {
      setLiveRemainingSec((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [showStartConfirm, liveRemainingSec]);

  // ── Prevent accidental page unload during active exam ────────────────────
  useEffect(() => {
    if (phase !== "exam") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Вы уверены, что хотите закрыть страницу? Таймер экзамена продолжит идти!";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  // ── Load exam info on mount ──────────────────────────────────────────────
  useEffect(() => {
    const loadExamInfo = async () => {
      try {
        const info = await examsApi.getByCode(code);
        setExamInfo(info);
        if (info.status !== "active" && info.status !== "lobby") {
          setError("Этот экзамен уже закрыт или недоступен");
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

  // ── Polling in Waiting Room Phase ────────────────────────────────────────
  useEffect(() => {
    if (phase !== "waiting_room" || !sessionId || !sessionToken) return;

    const interval = setInterval(async () => {
      try {
        const statusRes = await examsApi.getSessionStatus(code, sessionId, sessionToken);
        if (statusRes.status === "in_progress" && statusRes.tasks && statusRes.tasks.length > 0) {
          setTasks(statusRes.tasks);
          if (statusRes.variant_number) setVariantNumber(statusRes.variant_number);
          if (statusRes.saved_answers) setAnswers(statusRes.saved_answers);
          const remSec =
            statusRes.time_remaining_seconds !== undefined && statusRes.time_remaining_seconds !== null
              ? statusRes.time_remaining_seconds
              : (statusRes.time_minutes || examInfo?.total_time_minutes || 45) * 60;
          setTimeLeft(remSec);
          startTimeRef.current = Date.now();
          setPhase("exam");
        } else if (statusRes.status === "kicked") {
          setPhase("error");
          setError(statusRes.message || "Преподаватель удалил вас из сессии.");
        } else if (statusRes.status === "submitted") {
          setAlreadySubmitted(true);
          try {
            const detailed = await examsApi.getResult(sessionId, sessionToken);
            setResult(detailed);
            setPhase("results");
          } catch {
            setPhase("lobby");
            setGroupWarning(statusRes.message || "Время экзамена истекло. Ответы отправлены.");
          }
        } else if (statusRes.status === "closed") {
          setError(statusRes.message || "Экзамен завершён преподавателем до начала вашей попытки.");
          setPhase("error");
        }
      } catch (e) {
        console.error("Polling status error:", e);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [phase, sessionId, sessionToken, code, examInfo]);

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
  const taskDisplay = useMemo(
    () => pickTaskDisplayProjection({
      task_id: task?.task_id,
      question_text: task?.text || "",
      question_latex: task?.question_latex,
      attested_fields: task?.attested_fields,
      content_quality: task?.content_quality,
    }),
    [task],
  );
  const isWideTask = useMemo(() => {
    if (!task) return false;
    const opts = task.options || [];
    const optsL = task.options_latex || [];
    const maxOptLen = Math.max(
      0,
      ...opts.map((option, index) =>
        pickOptionDisplayProjection(option || "", optsL[index]).text.length,
      ),
    );
    const qLen = taskDisplay.text.length;
    return maxOptLen > 25 || qLen > 80;
  }, [task, taskDisplay]);

  const answeredCount = tasks.filter((t) => answers[t.task_id]?.trim()).length;
  const unansweredTasks = tasks.filter((t) => !answers[t.task_id]?.trim());
  const isAnswered = (taskId: string) => !!answers[taskId]?.trim();
  const progressPercent = tasks.length > 0 ? (answeredCount / tasks.length) * 100 : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStartClick = async () => {
    setGroupWarning(null);
    setAlreadySubmitted(false);
    const sName = studentName.trim();
    const sId = studentId.trim();
    if (!canSubmitIdentity(sName, sId)) return;

    // Verify enrollment and single attempt before starting
    if (examInfo?.group_id) {
      try {
        const check = await examsApi.checkStudent(code, {
          student_id: sId || undefined,
          student_name: sName || undefined,
          identifier: sId || sName,
        });

        if (check.already_submitted) {
          setAlreadySubmitted(true);
          setSubmittedSessionId(check.session_id || null);
          setGroupWarning(check.message || "Вы уже завершили этот экзамен. Повторная сдача заблокирована.");
          return;
        }

        if (!check.enrolled) {
          setGroupWarning(
            check.message ||
              `Введённые имя (ФИО) или Student ID не соответствуют ученику в группе «${examInfo.group_name || "данной группе"}». Пожалуйста, перепроверьте данные или обратитесь к преподавателю.`
          );
          return;
        }

        if (check.student?.full_name) {
          setStudentName(check.student.full_name);
        }
        if (check.student?.display_id) {
          setStudentId(check.student.display_id);
          setConfirmedStudent({
            name: check.student.full_name || sName,
            display_id: check.student.display_id,
          });
        }
      } catch (err: any) {
        console.error("Check student error:", err);
      }
    }

    // In lobby mode, join waiting room immediately; in active mode, show confirmation modal
    if (examInfo?.status === "lobby") {
      executeStartExam();
    } else {
      setShowStartConfirm(true);
    }
  };

  const executeStartExam = async () => {
    setShowStartConfirm(false);
    setPhase("starting");
    try {
      const sName = studentName.trim();
      const sId = studentId.trim();
      const finalName = confirmedStudent?.name || sName;
      const finalDisplayId = confirmedStudent?.display_id || sId || undefined;

      const res = await examsApi.startSession(code, {
        student_name: finalName,
        student_id: sId || undefined,
        display_id: finalDisplayId,
      });

      if (res.already_submitted) {
        setAlreadySubmitted(true);
        setSubmittedSessionId(res.session_id || null);
        setPhase("lobby");
        setGroupWarning(res.message || "Вы уже завершили этот экзамен. Повторная сдача недоступна.");
        return;
      }

      setSessionId(res.session_id);
      if (!res.session_token) {
        throw new Error("Сервер не выдал ключ доступа к попытке. Начните экзамен заново.");
      }
      setSessionToken(res.session_token);
      setVariantNumber(res.variant_number);

      if (res.saved_answers) {
        setAnswers(res.saved_answers);
      }

      if (res.status === "waiting") {
        setPhase("waiting_room");
      } else {
        setTasks(res.tasks);
        const remSec =
          res.time_remaining_seconds !== undefined && res.time_remaining_seconds !== null
            ? res.time_remaining_seconds
            : res.time_minutes * 60;
        setTimeLeft(remSec);
        startTimeRef.current = Date.now() - (res.time_minutes * 60 - remSec) * 1000;
        setPhase("exam");
      }
    } catch (err: any) {
      console.error("Failed to start exam:", err);
      setError(err.message || "Не удалось начать экзамен");
      setPhase("error");
    }
  };

  const handleAnswer = (taskId: string, answer: string) => {
    const newAnswers = { ...answers, [taskId]: answer };
    setAnswers(newAnswers);

    // Debounced real-time progress sync to server
    if (sessionId && sessionToken) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        const timeSpent = startTimeRef.current > 0 ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
        examsApi.saveProgress(
          sessionId,
          {
            answers: newAnswers,
            time_spent_seconds: timeSpent,
          },
          sessionToken,
        ).catch((err) => console.warn("Auto-save progress failed:", err));
      }, 300);
    }
  };

  const handleFinish = () => {
    if (unansweredTasks.length > 0) {
      setPhase("review");
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (phase === "submitting") return;
    setPhase("submitting");
    try {
      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (!sessionToken) {
        throw new Error("Ключ доступа к попытке не найден. Обновите страницу и войдите снова.");
      }
      const submitResult = await examsApi.submit(
        sessionId,
        {
          answers,
          time_spent_seconds: timeSpent,
        },
        sessionToken,
      );

      // Try to get detailed results
      try {
        const detailed = await examsApi.getResult(sessionId, sessionToken);
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
      // The authoritative server timer may close and grade the attempt a
      // moment before this browser submits.  In that case the result already
      // exists; show it instead of presenting a misleading save error.
      if (err?.status === 410 && sessionId && sessionToken) {
        try {
          const detailed = await examsApi.getResult(sessionId, sessionToken);
          setResult(detailed);
          setPhase("results");
          return;
        } catch {
          // Fall through to a clear final-state message below.
        }
      }
      setError(err.message || "Ошибка отправки ответов. Попробуйте ещё раз.");
      setPhase("error");
    }
  };

  const goNext = () => setCurrentQuestion((c) => Math.min(tasks.length - 1, c + 1));
  const goPrev = () => setCurrentQuestion((c) => Math.max(0, c - 1));
  goNextRef.current = goNext;
  // manual navigation drops a pending automatic advance (it would move one question further)
  const goNextManual = () => { advanceRef.current?.cancel(); goNext(); };
  const goPrevManual = () => { advanceRef.current?.cancel(); goPrev(); };

  // ── Render ───────────────────────────────────────────────────────────────

  // Loading
  if (phase === "loading") {
    return (
      <div className="h-screen w-full overflow-hidden relative bg-background-light">
        <TestBackground />
        <div className="relative z-10 h-full flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Загрузка экзамена...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Error / Closed screen
  if (phase === "error") {
    const isClosed = ["закрыт", "истекло", "завершён"].some((marker) =>
      error.toLowerCase().includes(marker)
    );
    return (
      <div className="h-screen w-full overflow-hidden relative bg-background-light">
        <TestBackground />
        <div className="relative z-10 h-full flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <GlassCard variant="panel" className="p-8 md:p-12 text-center" glow>
              <div
                className={`w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center ${
                  isClosed ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                }`}
              >
                {isClosed ? <Clock className="w-8 h-8 text-amber-600" /> : <AlertCircle className="w-8 h-8 text-red-600" />}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                {isClosed ? "Экзамен завершён" : "Ошибка"}
              </h2>
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
    <div className="min-h-screen w-full relative bg-background-light flex flex-col">
      <TestBackground />

      <main className="relative z-10 w-full flex-1 flex flex-col">

        {/* ═══════════════ LOBBY ═══════════════ */}
        {(phase === "lobby" || phase === "starting") && examInfo && (
          <div className="flex-1 flex items-center justify-center p-4 py-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="w-full max-w-md"
            >
              <GlassCard variant="panel" className="p-7 md:p-9 relative overflow-hidden" glow>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 via-indigo-500 to-primary-500 opacity-70" />

                {/* Exam Title */}
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-slate-900 mb-1">{examInfo.title}</h1>
                </div>

                {/* Group Banner if bound */}
                {examInfo.group_name && (
                  <div className="flex items-center gap-3 p-3 bg-indigo-50/90 border border-indigo-200/90 rounded-2xl mb-5 text-left shadow-2xs">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-indigo-500">Экзамен для группы</p>
                      <p className="text-sm font-bold text-indigo-950 truncate">«{examInfo.group_name}»</p>
                    </div>
                  </div>
                )}

                {/* Already Submitted Banner */}
                {alreadySubmitted && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-emerald-50/95 border border-emerald-300 rounded-2xl mb-5 text-left flex items-start gap-3 shadow-xs"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-emerald-950">Экзамен уже сдан</p>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Вы уже завершили данный экзамен. Согласно регламенту, повторное прохождение заблокировано.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Warning Banner if verification failed and not submitted */}
                {groupWarning && !alreadySubmitted && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-amber-50/90 border border-amber-300/80 rounded-2xl mb-5 text-left flex items-start gap-3 shadow-xs"
                  >
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-900">Доступ ограничен группой</p>
                      <p className="text-xs text-amber-800 leading-relaxed">{groupWarning}</p>
                    </div>
                  </motion.div>
                )}

                {/* Info grid */}
                <div className="space-y-2.5 mb-5">
                  {examInfo.teacher_name && (
                    <div className="flex items-center justify-between p-2.5 px-3.5 glass-option rounded-xl !cursor-default !transform-none">
                      <span className="text-xs text-slate-500">Преподаватель</span>
                      <span className="font-semibold text-xs text-slate-900">{examInfo.teacher_name}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <Clock className="w-4 h-4 mx-auto mb-0.5 text-amber-500" />
                      <p className="text-base font-bold text-slate-900">{examInfo.total_time_minutes}</p>
                      <p className="text-[11px] text-slate-500">минут</p>
                    </div>
                    <div className="p-2.5 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <BookOpen className="w-4 h-4 mx-auto mb-0.5 text-blue-500" />
                      <p className="text-base font-bold text-slate-900">{examInfo.tasks_per_variant}</p>
                      <p className="text-[11px] text-slate-500">вопросов</p>
                    </div>
                  </div>
                </div>

                {/* Rules of Examination (Правила экзамена) */}
                <div className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl mb-5 text-left space-y-2.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 tracking-wide">
                    <ShieldCheck className="w-4 h-4 text-slate-600" />
                    <span>Правила прохождения</span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                    <div className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        <strong className="text-slate-800 font-semibold">Одна попытка:</strong> экзамен сдаётся один раз, повторное прохождение недоступно.
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        <strong className="text-slate-800 font-semibold">Непрерывный таймер:</strong> отсчёт времени не останавливается при закрытии или перезагрузке вкладки.
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        <strong className="text-slate-800 font-semibold">Автосохранение:</strong> каждый ответ моментально сохраняется в системе.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form inputs */}
                {!alreadySubmitted ? (
                  <>
                    <div className="space-y-3.5 mb-5">
                      <Input
                        label="Имя и фамилия"
                        placeholder="Иван Иванов"
                        autoComplete="off"
                        value={studentName}
                        onChange={(e) => {
                          setStudentName(e.target.value);
                          if (groupWarning) setGroupWarning(null);
                        }}
                      />
                      <Input
                        label="ID ученика"
                        placeholder={idPlaceholder(examInfo.student_id_prefix)}
                        autoComplete="off"
                        value={studentId}
                        onChange={(e) => {
                          setStudentId(e.target.value);
                          if (groupWarning) setGroupWarning(null);
                        }}
                      />
                      <p className="text-xs text-slate-500">{IDENTITY_HINT}</p>
                    </div>

                    <Button
                      className="w-full shadow-md shadow-primary-500/20"
                      size="lg"
                      onClick={handleStartClick}
                      disabled={!canSubmitIdentity(studentName, studentId) || phase === "starting"}
                      loading={phase === "starting"}
                      icon={phase !== "starting" ? <ArrowRight className="w-5 h-5" /> : undefined}
                    >
                      {phase === "starting"
                        ? "Проверка..."
                        : examInfo.status === "lobby"
                        ? "Присоединиться к лобби"
                        : "Начать экзамен"}
                    </Button>
                  </>
                ) : (
                  <Link href="/login">
                    <Button className="w-full" variant="secondary" icon={<Home className="w-4 h-4" />}>
                      Вернуться на главную
                    </Button>
                  </Link>
                )}
              </GlassCard>
            </motion.div>
          </div>
        )}

        {/* ═══════════════ LATE JOIN / START CONFIRMATION MODAL ═══════════════ */}
        <AnimatePresence>
          {showStartConfirm && examInfo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 10 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/90 text-left relative overflow-hidden"
              >
                {/* Decorative Top Accent Bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />

                {/* Header Icon Badge & Title */}
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200/90 flex items-center justify-center shrink-0 shadow-xs">
                    <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Экзамен уже начался!</h3>
                    <p className="text-xs text-slate-500 font-medium">Преподаватель запустил тестирование группы</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-5">
                  Вы подключаетесь к уже идущему тестированию. Поспешите приступить к выполнению заданий.
                </p>

                {/* Live Remaining Time Highlight Card */}
                {(() => {
                  const rem = liveRemainingSec !== null ? liveRemainingSec : (examInfo.time_remaining_seconds || examInfo.total_time_minutes * 60);
                  const remMin = Math.floor(rem / 60);
                  const remSec = rem % 60;
                  const formattedMin = remMin.toString().padStart(2, "0");
                  const formattedSec = remSec.toString().padStart(2, "0");

                  return (
                    <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-2xl mb-6 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          Оставшееся время группы
                        </span>
                      </div>

                      {/* Prominent Digital Countdown Box */}
                      <div className="flex items-center justify-center py-2.5 bg-white/90 rounded-xl border border-amber-200/70 shadow-2xs">
                        <div className="flex items-baseline gap-1 font-mono">
                          <span className="text-3xl font-black text-slate-900 tracking-tight">{formattedMin}</span>
                          <span className="text-xs font-sans font-bold text-slate-500 mr-2">мин</span>
                          <span className="text-2xl font-bold text-amber-400 mr-2">:</span>
                          <span className="text-3xl font-black text-amber-600 tracking-tight">{formattedSec}</span>
                          <span className="text-xs font-sans font-bold text-amber-600">сек</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 pt-0.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-900/80 leading-relaxed font-medium">
                          Время идёт непрерывно для всех учеников одновременно. Таймер не останавливается при закрытии браузера.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Modal Action Buttons */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setShowStartConfirm(false)}
                  >
                    Отмена
                  </Button>
                  <Button
                    className="flex-1 shadow-md shadow-primary-500/20 font-bold"
                    onClick={executeStartExam}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Приступить
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ═══════════════ WAITING ROOM (KAHOOT STYLE) ═══════════════ */}
        {phase === "waiting_room" && examInfo && (
          <div className="flex-1 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full max-w-md"
            >
              <GlassCard variant="panel" className="p-8 md:p-10 text-center" glow>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-tr from-primary-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/30"
                >
                  <Clock className="w-10 h-10 text-white" />
                </motion.div>

                <h2 className="text-2xl font-bold text-slate-900 mb-2">Вы в комнате ожидания</h2>
                <p className="text-sm text-slate-500 mb-6">
                  Учитель запустит экзамен для всех участников одновременно.
                </p>

                {/* Confirmed student pill */}
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl mb-6">
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-xs text-slate-400 font-medium">Участник</p>
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {confirmedStudent?.name || studentName}
                      </p>
                      {confirmedStudent?.display_id && (
                        <p className="text-xs font-mono font-bold text-primary-600">
                          ID: {confirmedStudent.display_id}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Готов
                    </span>
                  </div>
                </div>

                {/* Exam details */}
                <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                  <div className="p-3 bg-white/60 border border-slate-100 rounded-xl">
                    <p className="text-[11px] font-semibold text-slate-400">Экзамен</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{examInfo.title}</p>
                  </div>
                  <div className="p-3 bg-white/60 border border-slate-100 rounded-xl">
                    <p className="text-[11px] font-semibold text-slate-400">Длительность</p>
                    <p className="text-sm font-bold text-slate-800">{examInfo.total_time_minutes} минут</p>
                  </div>
                </div>

                {/* Live Waiting Indicator */}
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-primary-600 bg-primary-50/80 py-2.5 px-4 rounded-xl border border-primary-100">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ожидание синхронного старта...</span>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}

        {/* ═══════════════ EXAM ═══════════════ */}
        {phase === "exam" && task && (
          <div className="relative z-10 w-full flex-1 flex flex-col">
            <div className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 shadow-2xs">
              <TestHeader
                mode="exam"
                timer={formatTime(timeLeft)}
                timerDanger={timeLeft < 300}
              />
            </div>

            <div className="w-full flex-1 flex flex-col justify-center min-h-[calc(100vh-5rem)] p-4 md:p-6">
              <div
                className={cn(
                  "w-full mx-auto py-4 md:py-6 flex flex-col gap-6 md:gap-8 transition-all duration-300",
                  isWideTask
                    ? "max-w-7xl 2xl:max-w-[1440px] px-2 md:px-4"
                    : "max-w-4xl",
                )}
              >
                {/* Question card */}
                <QuestionCard
                  questionKey={task.task_id}
                  topic={`${task.skill_name} • Вопрос ${currentQuestion + 1}/${tasks.length}`}
                >
                  <MathRenderer
                    text={taskDisplay.text}
                    renderMode={taskDisplay.renderMode}
                    block
                  />
                  {task.image_url && (
                    <div className="mt-4 sm:mt-6 flex justify-center">
                      <TaskFigureDrawer imageUrl={task.image_url} inlinePreview={true} />
                    </div>
                  )}
                </QuestionCard>

                {/* Answer area */}
                {task.options && task.options.length > 0 ? (
                  <OptionGrid
                    questionKey={task.task_id}
                    options={task.options.map((opt, idx) => ({
                      id: `${task.task_id}-${idx}`,
                      key: opt,
                      label: String.fromCharCode(65 + idx),
                      content: opt,
                      contentLatex: task.options_latex?.[idx],
                    }))}
                    selected={answers[task.task_id] || ""}
                    onSelect={(key) => {
                      handleAnswer(task.task_id, key);
                      if (currentQuestion < tasks.length - 1) {
                        advanceRef.current?.request();
                      }
                    }}
                  />
                ) : (
                  <TextInputAnswer
                    value={answers[task.task_id] || ""}
                    onChange={(val) => handleAnswer(task.task_id, val)}
                    onSubmit={goNextManual}
                    answerType={task.answer_type}
                  />
                )}

                {/* Navigation buttons */}
                <div className="flex justify-between items-center px-2">
                  <button
                    onClick={goPrevManual}
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
                      onClick={goNextManual}
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
          </div>
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
          <div className="flex-1 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg"
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

                  <Link href="/login">
                    <Button className="w-full" icon={<Home className="w-4 h-4" />}>
                      На главную
                    </Button>
                  </Link>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
