"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Brain, Copy, Check,
  Phone, Calendar, Edit2, ExternalLink,
  GraduationCap, Sparkles, AlertCircle,
  FileText, Clock, ChevronRight, UserCheck, Plus
} from "lucide-react";
import Link from "next/link";
import { examsApi, orgApi, StudentAttendanceSummary, StudentProfile } from "@/lib/api";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { useAuthStore } from "@/lib/store";
import { formatBusinessDate } from "@/lib/business-time";
import { DataLoadError } from "@/components/ui/data-load-error";
import { ExamHistoryError, toExamHistoryError } from "@/lib/exam-history-error";
import { createRequestSequence } from "@/lib/request-sequence";
import { PROVISIONAL_LABEL, formatSolved, storedLevelDisplay } from "@/lib/diagnostic-level";

type ProfileTab = "diagnostics" | "info";

const typeLabels: Record<string, string> = {
  initial: "Первичная адаптивная диагностика",
  recheck: "Повторная диагностика",
  pre_exam: "Предэкзаменационная диагностика",
  exam: "Экзаменационное тестирование",
};

function shiftMonth(month: string, direction: -1 | 1): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const value = new Date(year, monthNumber - 1 + direction, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

interface StudentProfileViewProps {
  studentId?: string;
  backHref?: string;
}

export function StudentProfileView({ studentId: propStudentId, backHref }: StudentProfileViewProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const studentId = propStudentId || (params?.id as string);

  const { user } = useAuthStore();
  const isTeacher = pathname?.startsWith("/teacher") || (user?.role === "teacher" && !pathname?.startsWith("/admin") && !pathname?.startsWith("/owner"));

  const groupsBasePath = isTeacher ? "/teacher/groups" : "/admin/groups";
  const diagnosticsBasePath = isTeacher ? "/teacher/diagnostics" : "/admin/diagnostics";
  const defaultBackPath = isTeacher ? "/teacher/groups" : "/admin/students";

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("diagnostics");
  const [copiedId, setCopiedId] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(() => formatBusinessDate().slice(0, 7));
  const [attendanceSummary, setAttendanceSummary] = useState<StudentAttendanceSummary | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [examsError, setExamsError] = useState<ExamHistoryError | null>(null);
  const [examsRetrying, setExamsRetrying] = useState(false);

  // Edit notes/phone state
  const [editingNotes, setEditingNotes] = useState(false);
  const [phoneVal, setPhoneVal] = useState("");
  const [commentVal, setCommentVal] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Latest-request-wins: every loadProfile / retryExams takes a token and applies
  // its result only if no newer request has started (student switch, A->B->A,
  // reload after save/assign while a retry is in flight).
  const loadSeq = useRef(createRequestSequence());

  const loadProfile = useCallback(async () => {
    const token = loadSeq.current.next();
    if (!studentId) return;
    const isCurrent = () => loadSeq.current.isCurrent(token);
    try {
      setLoading(true);
      setError(null);
      setExamsError(null);
      setExamsRetrying(false);
      const data = await orgApi.getStudentProfile(studentId);
      if (!isCurrent()) return;
      // Exam attempts live in exam-service, while the student, diagnostics and
      // group timeline live in auth-service. Do not make the whole profile
      // unavailable if the supplementary history request is temporarily down.
      let exams: NonNullable<StudentProfile["exams"]> = [];
      try {
        exams = await examsApi.getStudentHistory(studentId);
      } catch (historyError) {
        console.error("Failed to load student exam history:", historyError);
        // Surface the failure: an empty list must not look like "no exams".
        if (isCurrent()) setExamsError(toExamHistoryError(historyError));
      }
      if (!isCurrent()) return;
      const profileWithHistory: StudentProfile = { ...data, exams };
      setProfile(profileWithHistory);
      setPhoneVal(profileWithHistory.student.student_phone || "");
      setCommentVal(profileWithHistory.student.comment || "");
    } catch (err: any) {
      console.error("Failed to load student profile:", err);
      if (isCurrent()) setError(err?.message || "Ученик не найден");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const retryExams = useCallback(async () => {
    const token = loadSeq.current.next();
    if (!studentId) return;
    const requestedFor = studentId;
    const isCurrent = () => loadSeq.current.isCurrent(token);
    setExamsRetrying(true);
    try {
      const exams = await examsApi.getStudentHistory(requestedFor);
      if (!isCurrent()) return;
      setProfile((prev) => (prev ? { ...prev, exams } : prev));
      setExamsError(null);
    } catch (err) {
      console.error("Failed to load student exam history:", err);
      if (isCurrent()) setExamsError(toExamHistoryError(err));
    } finally {
      if (isCurrent()) setExamsRetrying(false);
    }
  }, [studentId]);

  const loadAttendanceSummary = useCallback(async () => {
    if (!studentId || isTeacher) return;
    setAttendanceLoading(true);
    try {
      setAttendanceSummary(await orgApi.getStudentAttendanceSummary(studentId, attendanceMonth));
    } catch (err) {
      // Attendance is a supplementary administrative card. It must not make
      // the student's diagnostic and learning profile inaccessible.
      console.error("Failed to load student attendance summary:", err);
      setAttendanceSummary(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceMonth, isTeacher, studentId]);

  useEffect(() => {
    void loadAttendanceSummary();
  }, [loadAttendanceSummary]);

  const copyDisplayId = (idStr: string) => {
    navigator.clipboard.writeText(idStr);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSaveNotes = async () => {
    if (!profile) return;
    setSavingNotes(true);
    try {
      await orgApi.updateStudent(studentId, {
        student_phone: phoneVal.trim() || null,
        comment: commentVal.trim() || null,
      });
      setEditingNotes(false);
      await loadProfile();
    } catch (e: any) {
      alert(e.message || "Ошибка сохранения");
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        <p className="text-sm text-slate-400">Загрузка профиля ученика...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-100 text-center shadow-sm">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">Не удалось открыть профиль</h2>
        <p className="text-sm text-slate-500 mb-6">{error || "Ученик не найден в системе"}</p>
        <Link
          href={backHref || defaultBackPath}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium text-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </Link>
      </div>
    );
  }

  const { student, group, group_history, diagnostics, exams = [] } = profile;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Назад</span>
        </button>
      </div>

      {/* ── Hero Profile Card ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-primary-50/40 to-indigo-50/20 rounded-full blur-3xl -z-0 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-md shadow-primary-600/20 shrink-0">
              {student.full_name.charAt(0)}
            </div>

            {/* Main Details */}
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">{student.full_name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {student.class_level} класс
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap pt-1">
                {group ? (
                  <Link
                    href={`${groupsBasePath}/${group.id}`}
                    className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200/60 font-medium transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Группа: «{group.name}»</span>
                    {group.teacher_name && (
                      <span className="text-emerald-600/80">({group.teacher_name})</span>
                    )}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400 italic">
                    <Users className="w-3.5 h-3.5" />
                    Группа не назначена
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-slate-100 mt-8 -mb-2">
          {[
            { id: "diagnostics", label: "Диагностика и Отчёты", icon: Brain, count: diagnostics.length },
            { id: "info", label: "Обучение и Информация", icon: Users },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as ProfileTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab 1: Diagnostics & Exam History ─────────────────────────────── */}
      {activeTab === "diagnostics" && (
        <div className="space-y-8">
          {/* Section 1: Diagnostics (Pinned at top) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Результаты диагностики</h2>
            </div>

            {diagnostics.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                <Brain className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-medium text-slate-700 mb-1">Диагностика не проводилась</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-3">
                  Ученик ещё не проходил адаптивное диагностическое тестирование.
                </p>
                {!isTeacher && (
                  <Link
                    href="/admin/students/new"
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-primary-600 text-white rounded-xl text-xs font-medium hover:bg-primary-700 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Назначить диагностику
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {diagnostics.map((diag) => {
                  const isCompleted = diag.status === "completed";
                  const res = diag.result;
                  return (
                    <div
                      key={diag.invite_id}
                      className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isCompleted
                                ? "bg-blue-50 text-blue-600 border border-blue-200/60"
                                : "bg-amber-50 text-amber-600 border border-amber-200/60"
                            }`}
                          >
                            <Brain className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm sm:text-base">
                                {typeLabels[diag.diagnostic_type] || diag.diagnostic_type}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                                {diag.class_level} класс
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Button: Open Report */}
                        {isCompleted ? (
                          <Link
                            href={`${diagnosticsBasePath}/${diag.invite_id}/report`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-primary-600/20 transition-all self-stretch sm:self-auto justify-center"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Открыть полный отчёт</span>
                          </Link>
                        ) : (
                          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            {diag.status === "in_progress" ? "В процессе" : "Ожидает прохождения"}
                          </span>
                        )}
                      </div>

                      {/* Quick Result Summary if completed */}
                      {isCompleted && res && (() => {
                        // Same numbers as the report header: CAT answers only.
                        const solvedText = formatSolved(res.correct_answers, res.total_questions);
                        const levelView = storedLevelDisplay(res);

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100/80 mt-2">
                            <div className="text-center">
                              <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Уровень по классу</p>
                              <div className="mt-1 flex flex-col items-center gap-1">
                                {levelView ? (
                                  <>
                                    <span className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-medium border ${levelView.tone.badge}`}>
                                      {levelView.label}
                                    </span>
                                    {levelView.classEquivalent && (
                                      <span className="text-[11px] text-slate-500">{levelView.classEquivalent}</span>
                                    )}
                                    {levelView.provisional && (
                                      <span className="text-[10px] uppercase tracking-wide text-amber-600">{PROVISIONAL_LABEL}</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </div>
                            </div>

                            <div className="text-center">
                              <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Результат</p>
                              <p className="text-xs sm:text-sm font-medium text-slate-700 mt-1">
                                {solvedText ?? "—"}
                              </p>
                            </div>

                            <div className="text-center">
                              <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Время теста</p>
                              <p className="text-xs sm:text-sm font-medium text-slate-700 mt-1">
                                {res.duration_seconds ? `${Math.round(res.duration_seconds / 60)} мин` : "—"}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Exam & Test History */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">История экзаменов и срезов</h2>
            </div>

            {examsError ? (
              <DataLoadError
                title={examsError.title}
                message={examsError.message}
                onRetry={examsError.retryable ? retryExams : undefined}
                isRetrying={examsRetrying}
              />
            ) : exams.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center mx-auto text-slate-400">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-slate-700">Экзамены и контрольные срезы пока не проводились</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Результаты пройденных экзаменов и срезов знаний группы будут сохраняться в этом разделе.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {exams.map((ex: any) => (
                  <div
                    key={ex.id}
                    className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center shrink-0">
                          <GraduationCap className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm sm:text-base">
                              {ex.exam_title || "Контрольный экзамен"}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                              Экзамен
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                            {ex.submitted_at ? (
                              <span>Сдан: {new Date(ex.submitted_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            ) : ex.started_at ? (
                              <span>Начат: {new Date(ex.started_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {ex.status === "submitted" ? (
                        <div className="text-right">
                          <span className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                            {ex.score !== undefined && ex.max_score ? `${ex.score} / ${ex.max_score} баллов` : "Сдано"}
                          </span>
                        </div>
                      ) : (
                        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          В процессе
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Learning, Group & Information ───────────────────────── */}
      {activeTab === "info" && (
        <div className="space-y-6">
          {/* Current Group */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Текущая группа</h2>

            {group ? (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-900">{group.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-600">
                      {group.class_level} класс
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Преподаватель: <span className="font-medium text-slate-800">{group.teacher_name || "Не назначен"}</span>
                  </p>
                  {group.description && (
                    <p className="text-xs text-slate-400 mt-1">{group.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-stretch sm:self-auto">
                  <Link
                    href={`${groupsBasePath}/${group.id}`}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all"
                  >
                    <span>Перейти в группу</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  {!isTeacher && (
                    <button
                      onClick={() => setAssignModalOpen(true)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Перевести в другую группу</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-amber-50/60 border border-amber-200/60 text-center space-y-3">
                <p className="text-sm font-medium text-amber-900">Ученик ещё не зачислен ни в одну группу</p>
                {!isTeacher && (
                  <button
                    onClick={() => setAssignModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-semibold hover:bg-primary-700 shadow-sm"
                  >
                    <Users className="w-4 h-4" /> Зачислить в группу
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Contacts and Notes */}
          {!isTeacher && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Посещаемость за {monthLabel(attendanceMonth)}</h2>
                  <p className="mt-1 text-xs text-slate-500">Все фактически начатые занятия, включая прежние группы после перевода.</p>
                </div>
                <div className="inline-flex w-fit items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setAttendanceMonth((month) => shiftMonth(month, -1))}
                    aria-label="Предыдущий месяц"
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <span className="min-w-[130px] px-2 text-center text-xs font-semibold capitalize text-slate-700">{monthLabel(attendanceMonth)}</span>
                  <button
                    type="button"
                    onClick={() => setAttendanceMonth((month) => shiftMonth(month, 1))}
                    aria-label="Следующий месяц"
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {attendanceLoading ? (
                <div className="flex h-28 items-center justify-center gap-2 text-sm text-slate-500">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
                  Загружаем сводку…
                </div>
              ) : attendanceSummary && attendanceSummary.totals.total_lessons > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      ["Занятий", attendanceSummary.totals.total_lessons, "text-slate-800"],
                      ["Был", attendanceSummary.totals.present, "text-emerald-700"],
                      ["Опоздал", attendanceSummary.totals.late, "text-amber-700"],
                      ["Н/Б", attendanceSummary.totals.absent, "text-rose-600"],
                      ["Уваж.", attendanceSummary.totals.excused, "text-sky-700"],
                    ].map(([label, value, color]) => (
                      <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-medium text-slate-500">{label}</p>
                        <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-slate-700">
                    Посещаемость: <span className="font-bold text-primary-700">{attendanceSummary.totals.attendance_rate ?? "—"}{attendanceSummary.totals.attendance_rate !== null ? "%" : ""}</span>
                    {attendanceSummary.totals.not_marked > 0 && <span className="ml-2 text-slate-500">· не отмечено: {attendanceSummary.totals.not_marked}</span>}
                  </div>
                  {attendanceSummary.groups.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-slate-100">
                      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        По группам за месяц
                      </div>
                      <div className="divide-y divide-slate-100">
                      {attendanceSummary.groups.map((groupSummary) => (
                        <div key={groupSummary.group_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                          <div>
                            <p className="font-semibold text-slate-800">{groupSummary.group_name}</p>
                            <p className="text-xs text-slate-500">{groupSummary.teacher_name || "Преподаватель не назначен"}</p>
                          </div>
                          <p className="text-xs font-medium text-slate-600">{groupSummary.total_lessons} занятий · был {groupSummary.present + groupSummary.late} · Н/Б {groupSummary.absent}</p>
                        </div>
                      ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-7 text-center">
                  <p className="text-sm font-semibold text-slate-700">За этот месяц нет завершённых занятий с участием ученика</p>
                  <p className="mt-1 text-xs text-slate-500">После старта и фиксации посещаемости данные появятся здесь автоматически.</p>
                </div>
              )}
            </div>
          )}

          {/* Contacts and Notes */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Контакты и служебные заметки</h2>
              {!isTeacher && !editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Редактировать
                </button>
              )}
            </div>

            {editingNotes ? (
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Номер телефона</label>
                  <input
                    type="text"
                    value={phoneVal}
                    onChange={(e) => setPhoneVal(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Комментарий / Заметка</label>
                  <textarea
                    rows={4}
                    value={commentVal}
                    onChange={(e) => setCommentVal(e.target.value)}
                    placeholder="Особенности ученика, пожелания родителей, цели..."
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                  >
                    {savingNotes ? "Сохранение..." : "Сохранить"}
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-4 rounded-xl bg-slate-50 space-y-1">
                  <p className="text-xs text-slate-400 font-medium">Телефон ученика / родителей</p>
                  <p className="text-sm font-semibold text-slate-800">{student.student_phone || "Не указан"}</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 space-y-1">
                  <p className="text-xs text-slate-400 font-medium">ID ученика</p>
                  <p className="text-sm font-mono font-semibold text-slate-800">{student.display_id || "—"}</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 space-y-1 sm:col-span-2">
                  <p className="text-xs text-slate-400 font-medium">Дата регистрации в системе</p>
                  <p className="text-sm font-medium text-slate-800">
                    {student.created_at ? new Date(student.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 space-y-1 sm:col-span-2">
                  <p className="text-xs text-slate-400 font-medium">Заметки и комментарии</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{student.comment || "Заметок нет"}</p>
                </div>
              </div>
            )}
          </div>

          {/* Group History (only if transitions exist) */}
          {group_history.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">История зачислений и переводов</h3>
              <div className="divide-y divide-slate-100">
                {group_history.map((gh, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          gh.is_active ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-slate-300"
                        }`}
                      />
                      <div>
                        <span className="font-semibold text-slate-800">{gh.group_name}</span>
                        {gh.class_level && (
                          <span className="text-xs text-slate-400 ml-2">({gh.class_level} класс)</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      {gh.is_active ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">Текущая группа</span>
                      ) : (
                        <span>
                          {gh.joined_at ? new Date(gh.joined_at).toLocaleDateString("ru-RU") : "—"} — {gh.left_at ? new Date(gh.left_at).toLocaleDateString("ru-RU") : "переведён"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Assign to Group Modal (staff only, like the buttons that open it) ── */}
      {!isTeacher && (
        <AssignGroupModal
          open={assignModalOpen}
          studentId={student.id}
          studentName={student.full_name}
          studentGrade={student.class_level}
          currentGroupId={student.group_id}
          currentGroupName={group?.name || null}
          onClose={() => setAssignModalOpen(false)}
          onAssigned={() => {
            setAssignModalOpen(false);
            loadProfile();
          }}
        />
      )}
    </div>
  );
}
