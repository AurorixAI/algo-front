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
  User,
  Shield,
  AlertCircle,
} from "lucide-react";
import { diagnosticApi, diagnosticInviteApi, type DiagTaskOut, type DiagAnswerResult, type DiagReport } from "@/lib/api";
import { useDiagnosticStore, useAuthStore } from "@/lib/store";
import { useRouter } from "next/navigation";

type Phase = "loading" | "confirm" | "welcome" | "testing" | "analyzing" | "results" | "error";

/** Format elapsed time */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function DiagnosticPage({ params }: { params: { code: string } }) {
  const code = params.code;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const diagStore = useDiagnosticStore();

  // UI phases
  const [phase, setPhase] = useState<Phase>("loading");

  // Invite info (org, class, student)
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [studentName, setStudentName] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  // On mount: check invite status — show confirm form or welcome
  useEffect(() => {
    (async () => {
      try {
        const info = await diagnosticInviteApi.getInfo(code);
        setInviteInfo(info);
        if (info.status === "pending") {
          setPhase("confirm");
        } else {
          setPhase("welcome");
        }
      } catch {
        // Code invalid or expired — show welcome, error will appear on start
        setPhase("welcome");
      }
    })();
  }, [code]);

  // Confirm student name
  const handleConfirmName = async () => {
    if (!studentName.trim()) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      const parts = studentName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      await diagnosticInviteApi.confirm(code, firstName, lastName);
      // Refresh invite info
      try {
        const updatedInfo = await diagnosticInviteApi.getInfo(code);
        setInviteInfo(updatedInfo);
      } catch {}
      setPhase("welcome");
    } catch (err: any) {
      setConfirmError(err?.message || "Имя не совпадает. Проверьте написание.");
    } finally {
      setConfirmLoading(false);
    }
  };

  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DiagReport | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Timer for current question
  const questionStartRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());

  // Elapsed time ticker
  useEffect(() => {
    if (phase !== "testing") return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - sessionStartRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  /** Start diagnostic session via diagnostic-service */
  const handleStartTest = async () => {
    try {
      setPhase("testing");
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

      diagStore.startSession(
        String(response.session_id),
        response.first_task.phase,
        response.first_task,
      );
      questionStartRef.current = Date.now();
      sessionStartRef.current = Date.now();
    } catch (err: any) {
      setErrorMsg(err.message || "Не удалось начать диагностику");
      setPhase("error");
    }
  };

  /** Submit answer to diagnostic-service */
  const handleSubmit = async () => {
    if (!answer.trim() || !diagStore.currentTask || !diagStore.sessionId) return;

    setIsSubmitting(true);

    const timeMs = Date.now() - questionStartRef.current;

    try {
      const resp: DiagAnswerResult = await diagnosticApi.submitAnswer(
        diagStore.sessionId,
        {
          task_id: diagStore.currentTask.task_id,
          student_answer: answer.trim(),
          time_ms: timeMs,
        },
      );

      setAnswer("");
      setIsSubmitting(false);

      if (resp.session_completed) {
        diagStore.complete();
        setPhase("analyzing");
        fetchResult(diagStore.sessionId!);
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
      setIsSubmitting(false);
      const msg = err.message || "Ошибка при отправке ответа";
      setErrorMsg(
        msg.includes("не найдена") || msg.includes("истекла")
          ? "Сессия истекла. Нажмите «Попробовать снова» для перезапуска."
          : msg,
      );
      diagStore.reset();
      setPhase("error");
    }
  };

  /** Fetch final report from diagnostic-service */
  const fetchResult = async (sessionId: string) => {
    try {
      const res = await diagnosticApi.getReport(sessionId);
      setResult(res);
      setTimeout(() => setPhase("results"), 2000);
    } catch (err: any) {
      setErrorMsg(err.message || "Не удалось получить результат");
      setPhase("error");
    }
  };

  /** Handle Enter key for answer submission */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitting && answer.trim()) {
      handleSubmit();
    }
  };

  const currentTask = diagStore.currentTask as DiagTaskOut | null;

  return (
    <div className="h-screen w-full overflow-hidden relative bg-background-light text-slate-800 font-sans">
      <TestBackground />

      <main className="relative z-10 w-full h-full flex flex-col">
        <AnimatePresence mode="wait">

          {/* ══════════════════════ LOADING ══════════════════════ */}
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center"
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
              className="flex-1 flex items-center justify-center p-4"
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
                  {inviteInfo && (
                    <div className="text-center mb-6">
                      <p className="text-sm text-slate-500">Организация</p>
                      <p className="font-medium text-slate-900">{inviteInfo.org_name || "—"}</p>
                      <p className="text-sm text-primary-600 mt-1">{inviteInfo.class_level} класс</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm">
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    <span>Подтвердите своё имя для начала</span>
                  </div>

                  {confirmError && (
                    <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{confirmError}</span>
                    </div>
                  )}

                  <Input
                    label="Ваше имя"
                    placeholder="Имя или Имя Фамилия"
                    icon={<User className="w-4 h-4" />}
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmName()}
                    autoFocus
                  />

                  <Button
                    onClick={handleConfirmName}
                    loading={confirmLoading}
                    disabled={!studentName.trim()}
                    className="w-full mt-4"
                    size="lg"
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Подтвердить
                  </Button>
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
              className="flex-1 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md">
                <GlassCard variant="panel" className="p-8 md:p-10 relative overflow-hidden" glow>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-40" />

                  <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
                      <Brain className="w-8 h-8 text-primary-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">
                      Диагностика ALGO
                    </h1>
                    {inviteInfo && (
                      <p className="text-sm text-primary-600 mt-1">
                        {inviteInfo.class_level} класс · {inviteInfo.diagnostic_type === "initial" ? "Первичная" : "Повторная"} диагностика
                      </p>
                    )}
                  </div>

                  <p className="text-slate-500 text-sm text-center mb-6">
                    Тест определит твой текущий уровень знаний по математике. Просто решай задачи — система подберёт вопросы под тебя.
                  </p>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3 p-3 glass-option rounded-xl !cursor-default !transform-none">
                      <Clock className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">~15–20 минут</p>
                        <p className="text-xs text-slate-500">Примерное время</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 glass-option rounded-xl !cursor-default !transform-none">
                      <Target className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">15–30 вопросов</p>
                        <p className="text-xs text-slate-500">Количество адаптируется под твой уровень</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 glass-option rounded-xl !cursor-default !transform-none">
                      <TrendingUp className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Просто решай</p>
                        <p className="text-xs text-slate-500">Это не влияет на оценку в школе</p>
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
              className="flex-1 flex flex-col"
            >
              <TestHeader
                mode="diagnostic"
                timer={formatTime(elapsedMs)}
              />

              <div className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-6 relative flex flex-col items-center justify-center overflow-y-auto">
                <div className="w-full flex flex-col gap-6 md:gap-8 py-4">

                  {/* Question card — clean, no phase/difficulty badges */}
                  <QuestionCard
                    questionKey={currentTask.task_id}
                    topic={`Вопрос ${diagStore.itemNumber}`}
                  >
                    {currentTask.question_text}
                    {currentTask.question_image_url && (
                      <div className="mt-6 flex justify-center">
                        <img
                          src={currentTask.question_image_url}
                          alt="Иллюстрация"
                          className="max-w-full max-h-48 rounded-xl border border-slate-200"
                        />
                      </div>
                    )}
                  </QuestionCard>

                  {/* Answer area — MC or text */}
                  {currentTask.answer_options && currentTask.answer_options.length > 0 ? (
                    <OptionGrid
                      options={currentTask.answer_options.map((opt: string, idx: number) => ({
                        key: opt,
                        label: String.fromCharCode(65 + idx),
                        content: opt,
                      }))}
                      selected={answer}
                      onSelect={(key) => {
                        setAnswer(key);
                        // Auto-submit MC answers after a short delay
                        setTimeout(() => {
                          if (!isSubmitting && key.trim()) {
                            handleSubmit();
                          }
                        }, 300);
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

                <h2 className="text-xl font-bold text-slate-900 mb-2">Обрабатываем ответы...</h2>
                <p className="text-slate-500 mb-6">Подожди немного, это займёт пару секунд</p>

                <div className="space-y-2">
                  {[
                    "Сохранение ответов",
                    "Анализ результатов",
                    "Формирование отчёта",
                  ].map((step, i) => (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.4 }}
                      className="flex items-center gap-2 justify-center text-sm text-slate-600"
                    >
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      {step}
                    </motion.div>
                  ))}
                </div>
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
                    className="grid grid-cols-2 gap-3 mb-6"
                  >
                    <div className="p-4 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <p className="text-2xl font-bold text-slate-900">{result.items_total}</p>
                      <p className="text-xs text-slate-500">Вопросов</p>
                    </div>
                    <div className="p-4 glass-option rounded-xl text-center !cursor-default !transform-none">
                      <p className="text-2xl font-bold text-slate-900">{formatTime(elapsedMs)}</p>
                      <p className="text-xs text-slate-500">Время</p>
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

                  <h1 className="text-xl font-bold text-slate-900 mb-2">Ошибка</h1>
                  <p className="text-slate-500 mb-6">
                    {errorMsg || "Произошла непредвиденная ошибка"}
                  </p>

                  <div className="space-y-3">
                    <Button
                      onClick={() => {
                        setErrorMsg(null);
                        setPhase("welcome");
                        diagStore.reset();
                      }}
                      size="lg"
                      className="w-full"
                    >
                      Попробовать снова
                    </Button>
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
