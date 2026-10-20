"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { TestBackground } from "@/components/ui/test-background";
import { TestHeader } from "@/components/ui/test-header";
import { QuestionCard } from "@/components/ui/question-card";
import { OptionGrid } from "@/components/ui/option-grid";
import { TextInputAnswer } from "@/components/ui/text-input-answer";
import {
  Brain,
  Clock,
  ArrowRight,
  CheckCircle,
  Target,
  TrendingUp,
  AlertTriangle,
  Home,
  Send,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { ApiError, diagnosticApi, diagnosticInviteApi, type DiagTaskOut, type DiagAnswerResult, type DiagReport } from "@/lib/api";
import { INVITE_CANCELLED_CENTER_HINT, INVITE_CANCELLED_MESSAGE, inviteEndsCancelled, isInviteCancelledError } from "@/lib/diagnostic-invite";
import { useDiagnosticStore, useAuthStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { MathRenderer } from "@/components/ui/math-renderer";
import { pickOptionDisplayProjection, pickTaskDisplayProjection } from "@/lib/task-display";
import { TaskFigureDrawer } from "@/components/tasks/TaskFigureDrawer";

type Phase = "loading" | "confirm" | "welcome" | "resume" | "testing" | "analyzing" | "results" | "error";

const REPORT_STAGE = {
  queued: {
    title: "Ответы сохранены",
    description: "Готовим структуру персонального отчёта.",
    current: 0,
  },
  collecting_evidence: {
    title: "Проверяем результаты",
    description: "Сверяем ответы, навыки и зафиксированные ошибки.",
    current: 1,
  },
  writing_methodical_conclusion: {
    title: "Формируем заключение",
    description: "Готовим методические рекомендации по результатам диагностики.",
    current: 2,
  },
  retry_queued: {
    title: "Повторно готовим отчёт",
    description: "Ответы сохранены. Повторяем подготовку без потери данных.",
    current: 1,
  },
  failed: {
    title: "Результаты сохранены",
    description: "Подробный отчёт будет подготовлен повторно специалистом учебного центра.",
    current: 0,
  },
} as const;

/** Format elapsed time */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Max report-poll attempts (~3 min with backoff) before showing the retry screen. */
const REPORT_POLL_MAX_ATTEMPTS = 40;

export default function DiagnosticPage({ params }: { params: { code: string } }) {
  const code = params.code;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const diagStore = useDiagnosticStore();

  // UI phases
  const [phase, setPhase] = useState<Phase>("loading");

  // Invite info (org, class, student)
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [confirmError, setConfirmError] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  // A consumed or unavailable invite is not recoverable by pressing the
  // generic retry button.  Keeping this separate prevents the UI from
  // offering a second attempt for a one-time diagnostic capability.
  const [canRetry, setCanRetry] = useState(true);
  const [checkVersion, setCheckVersion] = useState(0);
  const [errorContext, setErrorContext] = useState<"invite" | "answer" | "result">("invite");
  // The centre switched the invite off (the student is in the archive): not an error to retry, only the centre can help.
  const [inviteCancelled, setInviteCancelled] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const requestEpochRef = useRef(0);
  const checkedCodeRef = useRef<string | null>(null);
  const resultSessionIdRef = useRef<string | null>(null);

  // Active session for resume flow
  const [activeSession, setActiveSession] = useState<{
    session_id: string;
    items_answered: number;
    current_task: DiagTaskOut;
    total_time_ms?: number;
  } | null>(null);
  const activeItemsMax = Math.max(
    activeSession?.current_task.items_max ?? 0,
    activeSession ? activeSession.items_answered + 1 : 0,
  );

  // Timer refs & elapsed state
  const [elapsedMs, setElapsedMs] = useState(0);
  const initialElapsedMsRef = useRef<number>(0);
  const questionStartRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());

  // Confirm — the code itself already uniquely identifies the student
  // (assigned 1:1 at invite creation), so this is just "yes, this is me",
  // not an identity check. No typing required.
  const handleConfirm = async () => {
    const epoch = requestEpochRef.current;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      await diagnosticInviteApi.confirm(code);
      if (epoch !== requestEpochRef.current) return;
      setPhase("welcome");
    } catch (err: any) {
      if (epoch !== requestEpochRef.current) return;
      setConfirmError(err?.message || "Не удалось подтвердить. Попробуйте ещё раз.");
    } finally {
      if (epoch === requestEpochRef.current) setConfirmLoading(false);
    }
  };

  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DiagReport | null>(null);
  const reportPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Elapsed time ticker
  useEffect(() => {
    if (phase !== "testing") return;
    setElapsedMs(initialElapsedMsRef.current + (Date.now() - sessionStartRef.current));
    const interval = setInterval(() => {
      setElapsedMs(initialElapsedMsRef.current + (Date.now() - sessionStartRef.current));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  /** Start diagnostic session via diagnostic-service */
  const handleStartTest = async () => {
    const epoch = requestEpochRef.current;
    try {
      setPhase("loading");
      setErrorMsg(null);

      // student_id is required by diagnostic-service; it comes from the monolith
      // via /auth/diagnostic/{code}. If missing (anonymous flow) we block early.
      const studentId: string | undefined = inviteInfo?.student_id ?? undefined;
      const gradeLevel: number = inviteInfo?.class_level ?? (user as any)?.class_level ?? 9;

      if (!studentId) {
        throw new Error(
          "Не удалось определить ученика. Убедитесь что вы открыли ссылку из QR-кода."
        );
      }

      const response = await diagnosticApi.createSession({
        student_id: studentId,
        grade_level: gradeLevel,
        invite_code: code,
      });
      if (epoch !== requestEpochRef.current) return;

      diagStore.startSession(
        String(response.session_id),
        response.first_task.phase,
        response.first_task,
      );
      setPhase("testing");
      initialElapsedMsRef.current = 0;
      setElapsedMs(0);
      questionStartRef.current = Date.now();
      sessionStartRef.current = Date.now();
    } catch (err: any) {
      if (epoch !== requestEpochRef.current) return;
      if (err instanceof ApiError && err.code === "SESSION_ALREADY_STARTED") {
        await checkInvite(false);
        return;
      }
      setErrorContext("invite");
      setInviteCancelled(isInviteCancelledError(err));
      setCanRetry(!(err instanceof ApiError) || ![403, 410].includes(err.status));
      setErrorMsg(err.message || "Не удалось начать диагностику");
      setPhase("error");
    }
  };

  /** Submit answer to diagnostic-service */
  const handleSubmit = async (answerOverride?: string) => {
    const submitted = (answerOverride ?? answer).trim();
    if (!submitted || !diagStore.currentTask || !diagStore.sessionId) return;
    if (submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmissionNotice(null);
    setAnswer(submitted);
    const epoch = requestEpochRef.current;
    const sessionId = diagStore.sessionId;

    const timeMs = Date.now() - questionStartRef.current;

    try {
      const resp: DiagAnswerResult = await diagnosticApi.submitAnswer(
        sessionId,
        {
          task_id: diagStore.currentTask.task_id,
          student_answer: submitted,
          time_ms: timeMs,
        },
        code,
      );
      if (epoch !== requestEpochRef.current) return;

      setAnswer("");

      if (resp.session_completed) {
        diagStore.complete();
        resultSessionIdRef.current = sessionId;
        setPhase("analyzing");
        void fetchResult(sessionId);
      } else if (resp.next_task) {
        diagStore.setNextTask(
          resp.next_task,
          resp.theta,
          resp.se,
          0,
          resp.next_task.phase,
          resp.next_task.items_answered + 1,
        );
        questionStartRef.current = Date.now();
      }
    } catch (err: any) {
      if (epoch !== requestEpochRef.current) return;
      // A timeout says nothing about whether the server committed. Resolve
      // this same attempt before asking the student to send anything again.
      if (!(err instanceof ApiError) || err.status !== 403) {
        await checkInvite(false, true);
      } else {
        setErrorContext("answer");
        setCanRetry(false);
        setErrorMsg(err.message);
        setPhase("error");
      }
    } finally {
      if (epoch === requestEpochRef.current) {
        submitInFlightRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  /** Fetch final report from diagnostic-service */
  const fetchResult = async (sessionId: string, attempt = 0) => {
    const epoch = requestEpochRef.current;
    resultSessionIdRef.current = sessionId;
    if (reportPollTimerRef.current) clearTimeout(reportPollTimerRef.current);
    try {
      const res = await diagnosticApi.getReport(sessionId, code);
      if (epoch !== requestEpochRef.current) return;
      setResult(res);
      if (typeof res.total_time_ms === "number") setElapsedMs(res.total_time_ms);
      const generationStatus = res.report_generation?.status;
      if (generationStatus === "ready" || generationStatus === "failed") {
        reportPollTimerRef.current = setTimeout(() => {
          if (epoch === requestEpochRef.current) setPhase("results");
        }, 700);
        return;
      }

      // The service stores the job before returning from the final answer.
      // Poll only this completed session until its durable state becomes ready;
      // no report data is lost if the page is refreshed in the meantime.
      // Capped with a gentle backoff so a stuck "pending" job cannot poll forever;
      // after the cap the existing error screen offers a manual retry.
      if (attempt + 1 >= REPORT_POLL_MAX_ATTEMPTS) {
        setErrorContext("result");
        setCanRetry(true);
        setErrorMsg("Отчёт ещё формируется. Ответы сохранены. Повторите загрузку чуть позже.");
        setPhase("error");
        return;
      }
      const delay = Math.min(1800 + attempt * 400, 6000);
      reportPollTimerRef.current = setTimeout(() => fetchResult(sessionId, attempt + 1), delay);
    } catch (err: any) {
      if (epoch !== requestEpochRef.current) return;
      setErrorContext("result");
      setCanRetry(!(err instanceof ApiError) || ![403, 404].includes(err.status));
      setErrorMsg("Ответы сохранены. Сейчас не удалось загрузить отчёт. Повторите загрузку или обратитесь к учебному центру.");
      setPhase("error");
    }
  };

  /** Invitation controls new starts; diagnostic-service owns the attempt. */
  const checkInvite = async (offerResume = true, recoveringAnswer = false) => {
    const epoch = requestEpochRef.current;
    let inviteStatus: string | undefined;
    try {
      const info = await diagnosticInviteApi.getInfo(code);
      if (epoch !== requestEpochRef.current) return;
      inviteStatus = info.status;
      setInviteInfo(info);
      // A «cancelled» invite (200) is not closed here: a session that started BEFORE the cancellation may finish, and
      // only diagnostic-service knows it.  So it goes through the same resolve / resume path below.  Never a new
      // session: «pending» is the only status that confirms, and only «confirmed» (not «cancelled») may start one.
      if (info.status === "pending") {
        setPhase("confirm");
        return;
      }
      try {
        const resolved = await diagnosticApi.resolveSession(code);
        if (epoch !== requestEpochRef.current) return;
        if (resolved.status === "completed") {
          diagStore.restoreCompleted(resolved.session_id);
          setElapsedMs(resolved.total_time_ms);
          setAnswer("");
          setPhase("analyzing");
          void fetchResult(resolved.session_id);
          return;
        }
        if (!resolved.current_task) throw new Error("Не удалось восстановить текущий вопрос.");
        const previousTaskId = useDiagnosticStore.getState().currentTask?.task_id;
        const active = { ...resolved, current_task: resolved.current_task };
        setActiveSession(active);
        initialElapsedMsRef.current = active.total_time_ms;
        sessionStartRef.current = Date.now();
        setElapsedMs(active.total_time_ms);
        diagStore.startSession(active.session_id, active.current_task.phase, active.current_task, active.items_answered + 1);
        if (previousTaskId !== active.current_task.task_id) {
          setAnswer("");
          questionStartRef.current = Date.now();
        }
        if (recoveringAnswer) {
          setSubmissionNotice(previousTaskId === active.current_task.task_id
            ? "Отправка ответа не подтверждена. Текущий вопрос восстановлен — попробуйте отправить ответ ещё раз."
            : "Ответ сохранён. Продолжайте диагностику с текущего вопроса.");
        }
        setCanRetry(true);
        setPhase(offerResume ? "resume" : "testing");
      } catch (err) {
        // Only an explicit absence of an attempt allows a fresh start.
        if (!recoveringAnswer && info.status === "confirmed" && err instanceof ApiError && err.status === 404 && err.code === "SESSION_NOT_FOUND") {
          diagStore.reset();
          setPhase("welcome");
          return;
        }
        throw err;
      }
    } catch (err: any) {
      if (epoch !== requestEpochRef.current) return;
      setErrorContext(recoveringAnswer ? "answer" : "invite");
      // Nothing to resume of a cancelled invite (410 INVITE_CANCELLED, or no session of it) ends on «Приглашение отменено».
      setInviteCancelled(inviteEndsCancelled(inviteStatus, err));
      setCanRetry(!(err instanceof ApiError) || ![403, 404, 410].includes(err.status));
      setErrorMsg(err?.message || "Не удалось проверить состояние диагностики. Проверьте подключение и повторите проверку.");
      setPhase("error");
    }
  };

  useEffect(() => {
    if (checkedCodeRef.current !== code) {
      checkedCodeRef.current = code;
      diagStore.reset();
      setAnswer("");
      setActiveSession(null);
      setInviteInfo(null);
      setSubmissionNotice(null);
      resultSessionIdRef.current = null;
    }
    setPhase("loading");
    setErrorMsg(null);
    setInviteCancelled(false);
    setIsSubmitting(false);
    setConfirmLoading(false);
    setResult(null);
    void checkInvite();
    return () => {
      requestEpochRef.current += 1;
      submitInFlightRef.current = false;
      if (reportPollTimerRef.current) clearTimeout(reportPollTimerRef.current);
    };
  }, [code, checkVersion]);

  /** Handle Enter key for answer submission */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitting && answer.trim()) {
      handleSubmit();
    }
  };

  const currentTask = diagStore.currentTask as DiagTaskOut | null;
  const taskDisplay = useMemo(
    () => pickTaskDisplayProjection({
      task_id: currentTask?.task_id,
      question_text: currentTask?.question_text || "",
      question_latex: currentTask?.question_latex,
      attested_fields: currentTask?.attested_fields,
      content_quality: currentTask?.content_quality,
    }),
    [currentTask],
  );

  const isWideTask = useMemo(() => {
    if (!currentTask) return false;
    const opts = currentTask.answer_options || [];
    const optsL = currentTask.answer_options_latex || [];
    const maxOptLen = Math.max(
      0,
      ...opts.map((option, index) =>
        pickOptionDisplayProjection(option || "", optsL[index]).text.length,
      ),
    );
    const qLen = taskDisplay.text.length;
    return maxOptLen > 25 || qLen > 80;
  }, [currentTask, taskDisplay]);

  return (
    <div className="min-h-screen w-full relative bg-background-light text-slate-800 font-sans flex flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <TestBackground />

      <main className="relative z-10 w-full flex-1 flex flex-col">
        <AnimatePresence mode="wait">

          {/* ══════════════════════ LOADING ══════════════════════ */}
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center min-h-[calc(100vh-80px)] p-4"
            >
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
            </motion.div>
          )}

          {/* ══════════════════════ CONFIRM NAME ══════════════════════ */}
          {phase === "confirm" && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex items-center justify-center min-h-[calc(100vh-80px)] p-4"
            >
              <div className="w-full max-w-sm">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30 mx-auto mb-3">
                    <Brain className="w-8 h-8" />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">Диагностика ALGO</h1>
                  <p className="text-slate-500 text-sm mt-1">Математическое тестирование</p>
                </motion.div>

                <GlassCard variant="elevated" className="p-8">
                  <div className="text-center mb-6">
                    <p className="text-2xl font-bold text-slate-900">
                      {inviteInfo?.student_first_name} {inviteInfo?.student_last_name}
                    </p>
                    <p className="text-sm text-primary-600 mt-1">
                      {inviteInfo?.class_level} класс
                      {inviteInfo?.org_name ? ` · ${inviteInfo.org_name}` : ""}
                    </p>
                  </div>

                  {confirmError && (
                    <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{confirmError}</span>
                    </div>
                  )}

                  <Button
                    onClick={handleConfirm}
                    loading={confirmLoading}
                    className="w-full"
                    size="lg"
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Да, это я
                  </Button>
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════ RESUME ══════════════════════ */}
          {phase === "resume" && activeSession && (
            <motion.div
              key="resume"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex items-center justify-center min-h-[calc(100vh-80px)] p-4"
            >
              <div className="w-full max-w-sm">
                <GlassCard variant="panel" className="p-8 md:p-10 relative overflow-hidden" glow>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-40" />

                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                      className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30"
                    >
                      <Clock className="w-8 h-8 text-white" />
                    </motion.div>
                    <h1 className="text-xl font-bold text-slate-900 mb-1.5">Незавершённая диагностика</h1>
                    <p className="text-slate-500 text-sm">
                      Вы остановились на вопросе{" "}
                      <span className="font-bold text-slate-900">{activeSession.items_answered + 1}</span>
                      {" "}из{" "}
                      <span className="font-bold text-slate-900">{activeItemsMax}</span>
                    </p>
                    {(activeSession.total_time_ms ?? 0) > 0 && (
                      <p className="text-slate-500 text-xs mt-1.5">
                        Время: <span className="font-semibold text-slate-700">{formatTime(activeSession.total_time_ms!)}</span>
                      </p>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span>Прогресс</span>
                      <span>{Math.round((activeSession.items_answered / activeItemsMax) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((activeSession.items_answered / activeItemsMax) * 100)}%` }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      if (activeSession) {
                        initialElapsedMsRef.current = activeSession.total_time_ms || 0;
                        setElapsedMs(activeSession.total_time_ms || 0);
                        sessionStartRef.current = Date.now();
                        questionStartRef.current = Date.now();
                        diagStore.startSession(
                          String(activeSession.session_id),
                          activeSession.current_task.phase,
                          activeSession.current_task,
                          (activeSession.items_answered ?? 0) + 1,
                        );
                      }
                      setPhase("testing");
                    }}
                    size="lg"
                    className="w-full"
                    icon={<ArrowRight className="w-5 h-5" />}
                  >
                    Продолжить с вопроса {activeSession.items_answered + 1}
                  </Button>

                  <p className="text-xs text-center text-slate-400 mt-4">
                    Код: <span className="font-mono font-medium">{code}</span>
                  </p>
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════ WELCOME ══════════════════════ */}
          {phase === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex items-center justify-center min-h-[calc(100vh-80px)] p-4"
            >
              <div className="w-full max-w-sm">
                <GlassCard variant="panel" className="p-8 md:p-10 relative overflow-hidden" glow>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-40" />

                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                      className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary-500/30"
                    >
                      <Sparkles className="w-8 h-8 text-white" />
                    </motion.div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">
                      {inviteInfo?.student_first_name ? `Привет, ${inviteInfo.student_first_name}!` : "Диагностика"}
                    </h1>
                    <p className="text-slate-500 text-sm">
                      {inviteInfo?.class_level ? `${inviteInfo.class_level} класс` : "Тестирование"}
                      {inviteInfo?.org_name ? ` · ${inviteInfo.org_name}` : ""}
                    </p>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3 p-3 glass-option rounded-xl !cursor-default !transform-none">
                      <Clock className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Время не ограничено</p>
                        <p className="text-xs text-slate-500">Решай спокойно: можно сделать паузу и продолжить по той же ссылке</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 glass-option rounded-xl !cursor-default !transform-none">
                      <Target className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Адаптивный тест</p>
                        <p className="text-xs text-slate-500">Задания подбираются под твои ответы: чем точнее мы понимаем уровень, тем раньше тест завершится</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 glass-option rounded-xl !cursor-default !transform-none">
                      <TrendingUp className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Это не школьная оценка</p>
                        <p className="text-xs text-slate-500">Результат нужен, чтобы составить твой план занятий</p>
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleStartTest} size="lg" className="w-full" icon={<ArrowRight className="w-5 h-5" />}>
                    Начать диагностику
                  </Button>

                  <p className="text-xs text-center text-slate-400 mt-4">
                    Код: <span className="font-mono font-medium">{code}</span>
                  </p>
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════ TESTING ══════════════════════ */}
          {phase === "testing" && currentTask && (
            <motion.div
              key="testing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col w-full"
            >
              <div className="sticky top-[env(safe-area-inset-top)] z-30 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 shadow-2xs">
                <TestHeader
                  mode="diagnostic"
                  timer={formatTime(elapsedMs)}
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
                  {/* Question card — clean, no phase/difficulty badges */}
                  <QuestionCard
                    questionKey={currentTask.task_id}
                    topic={`Вопрос ${diagStore.itemNumber}`}
                  >
                    <MathRenderer
                      text={taskDisplay.text}
                      renderMode={taskDisplay.renderMode}
                      block
                    />
                    {currentTask.question_image_url && (
                      <div className="mt-4 sm:mt-6 flex justify-center">
                        <TaskFigureDrawer
                          imageUrl={currentTask.question_image_url}
                          inlinePreview={true}
                        />
                      </div>
                    )}
                  </QuestionCard>

                  {submissionNotice && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      {submissionNotice}
                    </p>
                  )}

                  {/* Answer area — MC or text */}
                  {currentTask.answer_options && currentTask.answer_options.length > 0 ? (
                    <OptionGrid
                      questionKey={currentTask.task_id}
                      options={currentTask.answer_options.map((opt: string, idx: number) => ({
                        id: `${currentTask.task_id}-${idx}`,
                        key: opt,
                        label: String.fromCharCode(65 + idx),
                        content: opt,
                        contentLatex: currentTask.answer_options_latex?.[idx] ?? null,
                      }))}
                      selected={answer}
                      disabled={isSubmitting}
                      onSelect={(key) => {
                        setAnswer(key);
                        void handleSubmit(key);
                      }}
                    />
                  ) : (
                    <TextInputAnswer
                      value={answer}
                      onChange={setAnswer}
                      onSubmit={handleSubmit}
                      answerType={currentTask.answer_type}
                      disabled={isSubmitting}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════ LOADING (no task yet) ══════════════════════ */}
          {phase === "testing" && !currentTask && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center"
            >
              <GlassCard variant="panel" className="p-12 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
                </div>
                <p className="text-slate-600">Загрузка задания...</p>
              </GlassCard>
            </motion.div>
          )}

          {/* ══════════════════════ ANALYZING ══════════════════════ */}
          {phase === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center p-4"
            >
              <div className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-6 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                  <div className="absolute bottom-0 left-0 w-full animate-liquid-rise z-0">
                    <div className="w-full h-20 liquid-bg animate-liquid-pulse opacity-90" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Brain className="w-8 h-8 text-white/80 drop-shadow-md" />
                  </div>
                </div>

                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  {REPORT_STAGE[result?.report_generation?.stage as keyof typeof REPORT_STAGE]?.title || "Готовим отчёт"}
                </h2>
                <p className="text-slate-500 mb-6 max-w-sm">
                  {REPORT_STAGE[result?.report_generation?.stage as keyof typeof REPORT_STAGE]?.description || "Ответы сохранены. Обычно подготовка занимает до минуты."}
                </p>

                <div className="space-y-2">
                  {[
                    "Сохранение ответов",
                    "Анализ результатов",
                    "Формирование отчёта",
                  ].map((step, i) => {
                    const current = REPORT_STAGE[result?.report_generation?.stage as keyof typeof REPORT_STAGE]?.current ?? 0;
                    const isDone = i < current;
                    const isCurrent = i === current;
                    return (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.4 }}
                      className={`flex items-center gap-2 justify-center text-sm ${isCurrent ? "font-semibold text-primary-700" : "text-slate-500"}`}
                    >
                      {isDone ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : isCurrent ? (
                        <div className="w-4 h-4 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-200" />
                      )}
                      {step}
                    </motion.div>
                    );
                  })}
                </div>
                <p className="mt-5 text-xs text-slate-400">Можно не закрывать страницу — статус обновится автоматически.</p>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════ RESULTS — Student congratulations ══════════════════════ */}
          {phase === "results" && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md">
                <GlassCard variant="panel" className="p-8 md:p-10 relative overflow-hidden" glow>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-40" />

                  {/* Success icon */}
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                      className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                    >
                      <CheckCircle className="w-10 h-10 text-white" />
                    </motion.div>

                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-2xl font-bold text-slate-900 mb-2"
                    >
                      Диагностика пройдена!
                    </motion.h2>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-slate-500"
                    >
                      Отличная работа! Все ответы сохранены.
                    </motion.p>
                  </div>

                  {/* Stats — minimal, student-friendly */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="mb-6"
                  >
                    <div className="p-4 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <p className="text-2xl font-bold text-slate-900">{formatTime(elapsedMs)}</p>
                      <p className="text-xs text-slate-500">Затраченное время</p>
                    </div>
                  </motion.div>


                  {/* Info card — what happens next */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                    className="p-4 rounded-2xl bg-blue-50 border border-blue-100 mb-6"
                  >
                    <div className="flex items-start gap-3">
                      <Send className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-900 text-sm mb-1">Что дальше?</p>
                        <p className="text-sm text-blue-700">
                          Твои результаты отправлены в учебный центр. Преподаватели проанализируют их
                          и составят персональную программу обучения.
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* CTA */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.1 }}
                  >
                    <Button
                      size="lg"
                      className="w-full"
                      icon={<Home className="w-4 h-4" />}
                      onClick={() => {
                        diagStore.reset();
                        window.location.href = "/login";
                      }}
                    >
                      На главную
                    </Button>
                  </motion.div>

                  <p className="text-xs text-center text-slate-400 mt-4">
                    Код диагностики: <span className="font-mono">{code}</span>
                  </p>
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════ ERROR ══════════════════════ */}
          {phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md">
                <GlassCard variant="panel" className="p-8 md:p-10 text-center">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                  </div>

                  <h1 className="text-xl font-bold text-slate-900 mb-2">
                    {inviteCancelled ? INVITE_CANCELLED_MESSAGE : errorContext === "result" ? "Ответы сохранены" : "Не удалось продолжить"}
                  </h1>
                  <p className="text-slate-500 mb-6">
                    {inviteCancelled ? INVITE_CANCELLED_CENTER_HINT : errorMsg || "Произошла непредвиденная ошибка"}
                  </p>

                  <div className="space-y-3">
                    {canRetry && (
                      <Button
                        onClick={() => {
                          setErrorMsg(null);
                          if (errorContext === "result" && resultSessionIdRef.current) {
                            setPhase("analyzing");
                            void fetchResult(resultSessionIdRef.current);
                          } else {
                            setCheckVersion((value) => value + 1);
                          }
                        }}
                        size="lg"
                        className="w-full"
                      >
                        {errorContext === "result" ? "Повторить загрузку результата" : "Повторить проверку состояния"}
                      </Button>
                    )}
                    <Button
                      onClick={() => (window.location.href = "/login")}
                      size="lg"
                      className="w-full"
                      variant="ghost"
                      icon={<Home className="w-4 h-4" />}
                    >
                      На главную
                    </Button>
                  </div>
                </GlassCard>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
