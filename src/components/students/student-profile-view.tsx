"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Brain, Copy, Check,
  Phone, Calendar, Edit2, ExternalLink,
  GraduationCap, Sparkles, AlertCircle,
  FileText, Clock, ChevronRight, UserCheck, Plus, Wallet, Archive, ArchiveRestore
} from "lucide-react";
import Link from "next/link";
import { DEMO_MODE, examsApi, orgApi, StudentAttendanceSummary, StudentProfile, type StudentArchiveResult } from "@/lib/api";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { StudentGroupsBlock, profileMemberships } from "@/components/students/student-groups-block";
import { StudentPaymentsBlock } from "@/components/students/student-payments-block";
import { StudentArchiveModal } from "@/components/students/student-archive-modal";
import { StudentRestoreModal } from "@/components/students/student-restore-modal";
import { RowMenu } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/lib/store";
import { capitalizeFirst, formatBusinessDate, formatUtcNaiveAsBusinessDate, formatUtcNaiveAsBusinessDayTime, monthYearLabelRu } from "@/lib/business-time";
import { DataLoadError } from "@/components/ui/data-load-error";
import { ExamHistoryError, toExamHistoryError } from "@/lib/exam-history-error";
import { canStartRequest, createRequestSequence } from "@/lib/request-sequence";
import { formatSolved, storedLevelDisplay } from "@/lib/diagnostic-level";
import { shiftMonth } from "@/lib/attendance-excuses";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { formatMembershipPeriods } from "@/lib/membership-periods";
import { DiagnosticStatusBadge, diagnosticActionClass } from "@/components/diagnostics/list-chrome";
import { inviteCancelHint, isInviteDead, studentCardInviteLabel } from "@/lib/diagnostic-invite";
import { MARK_CELL_LABEL } from "@/lib/attendance-marks";
import { StudentLessonsList } from "@/components/students/student-lessons-list";
import { formatGroupMonthLine } from "@/lib/attendance-summary";
import { PROFILE_TAB_LABEL, PROFILE_TAB_SHORT_LABEL, parseProfileTab, visibleProfileTabs, type ProfileTab } from "@/lib/profile-tabs";
import {
  ARCHIVED_TOAST, archiveBannerTitle, archiveDiagnosticCounts, archiveGroupNames, archiveResultDetails, restoreNeedsReading,
  studentArchiveAccess, studentArchiveInfo, type RestoreOutcome,
} from "@/lib/student-archive";

const TAB_ICON: Record<ProfileTab, typeof Brain> = {
  diagnostics: Brain,
  learning: GraduationCap,
  payments: Wallet,
  contacts: Phone,
};

const typeLabels: Record<string, string> = {
  initial: "Первичная адаптивная диагностика",
  recheck: "Повторная диагностика",
  pre_exam: "Предэкзаменационная диагностика",
  exam: "Экзаменационное тестирование",
};

interface StudentProfileViewProps {
  studentId?: string;
  backHref?: string;
}

/** The card reads `?tab=`, so it needs a Suspense boundary above it. */
export function StudentProfileView(props: StudentProfileViewProps) {
  return (
    <Suspense fallback={<div className="flex h-80 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>}>
      <StudentProfileViewContent {...props} />
    </Suspense>
  );
}

function StudentProfileViewContent({ studentId: propStudentId, backHref }: StudentProfileViewProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studentId = propStudentId || (params?.id as string);

  const { user } = useAuthStore();
  const isTeacher = pathname?.startsWith("/teacher") || (user?.role === "teacher" && !pathname?.startsWith("/admin") && !pathname?.startsWith("/owner"));

  // The owner keeps the owner workspace (menu highlight); diagnostics exist only under /admin.
  const isOwnerPath = Boolean(pathname?.startsWith("/owner"));
  const groupsBasePath = isTeacher ? "/teacher/groups" : isOwnerPath ? "/owner/groups" : "/admin/groups";
  const diagnosticsBasePath = isTeacher ? "/teacher/diagnostics" : "/admin/diagnostics";
  const defaultBackPath = isTeacher ? "/teacher/groups" : isOwnerPath ? "/owner/students" : "/admin/students";

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Money is shown only to a role that may see it, and only after the server confirmed it (owner; an administrator with the right).
  const paymentsAvailable = usePaymentsSummary((state) => state.available);
  const paymentsLoaded = usePaymentsSummary((state) => state.loaded);
  const paymentsVisible = !isTeacher && !DEMO_MODE && paymentsAvailable;
  const tabs = visibleProfileTabs({ isTeacher: Boolean(isTeacher), paymentsVisible });
  const requestedTab = searchParams?.get("tab");
  const activeTab = parseProfileTab(requestedTab, tabs, Boolean(isTeacher));
  // `?tab=payments` opened before the summary has answered: wait instead of flashing «Обучение».
  const [paymentsWaitOver, setPaymentsWaitOver] = useState(false);
  const paymentsPending = requestedTab === "payments" && !isTeacher && !DEMO_MODE && !paymentsLoaded && !paymentsWaitOver;
  useEffect(() => {
    if (!(requestedTab === "payments" && !paymentsLoaded)) return;
    // The summary never answered (offline): stop waiting and show the fallback tab.
    const timer = setTimeout(() => setPaymentsWaitOver(true), 6000);
    return () => clearTimeout(timer);
  }, [requestedTab, paymentsLoaded]);
  const paymentsBasePath = isOwnerPath ? "/owner/payments" : "/admin/payments";
  // The strip scrolls sideways on a phone: keep the active tab in view inside its own container (never scrolls the page).
  const tabStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = tabStrip.current;
    const active = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !active || typeof strip.scrollTo !== "function") return;
    strip.scrollTo({ left: Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2) });
  }, [activeTab, tabs.length]);
  const selectTab = (tab: ProfileTab) => {
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  };
  const [copiedId, setCopiedId] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"transfer" | "add">("transfer");
  // «В архив» / «Вернуть из архива» (owner and administrator).  The toast outlives the profile reload.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const { showToast, toastNode } = useToast();
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

  // Latest-request-wins, one sequence per kind of load: each request takes a
  // token and applies its result only if no newer request of that kind has
  // started (student switch, A->B->A, month clicks, reload after save/assign).
  // loadProfile also bumps examsSeq (it re-fetches the history, so an older
  // retry must be dropped); retryExams never invalidates an in-flight loadProfile.
  const [{ profileSeq, examsSeq, attendanceSeq, notesSeq }] = useState(() => ({
    profileSeq: createRequestSequence(),
    examsSeq: createRequestSequence(),
    attendanceSeq: createRequestSequence(),
    notesSeq: createRequestSequence(),
  }));
  // Student on screen, updated in the effect that starts loadProfile.  A callback
  // from an older render (e.g. handleSaveNotes -> loadProfile after navigating
  // to another student) must not start a request for a student that is gone.
  const currentStudentIdRef = useRef(studentId);

  // `silent`: the card stays on screen while it is read again (a dialog standing on it is not torn down by the spinner).
  const loadProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!canStartRequest(studentId, currentStudentIdRef.current)) return;
    const silent = Boolean(options?.silent);
    const token = profileSeq.next();
    examsSeq.next();
    const isCurrent = () => profileSeq.isCurrent(token);
    try {
      if (!silent) setLoading(true);
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
      // A silent reload never swaps the card (and the dialog on it) for the error screen.
      if (isCurrent()) {
        if (silent) showToast("Не удалось обновить карточку ученика — обновите страницу", "error");
        else setError(err?.message || "Ученик не найден");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [studentId, profileSeq, examsSeq, showToast]);

  useEffect(() => {
    currentStudentIdRef.current = studentId;
    // A new student never opens with the previous student's notes editor / draft.
    setEditingNotes(false);
    setPhoneVal("");
    setCommentVal("");
    loadProfile();
  }, [studentId, loadProfile]);

  const retryExams = useCallback(async () => {
    if (!canStartRequest(studentId, currentStudentIdRef.current)) return;
    const token = examsSeq.next();
    const requestedFor = studentId;
    const isCurrent = () => examsSeq.isCurrent(token);
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
  }, [studentId, examsSeq]);

  const loadAttendanceSummary = useCallback(async () => {
    if (isTeacher || !canStartRequest(studentId, currentStudentIdRef.current)) return;
    const token = attendanceSeq.next();
    const isCurrent = () => attendanceSeq.isCurrent(token);
    setAttendanceLoading(true);
    try {
      const summary = await orgApi.getStudentAttendanceSummary(studentId, attendanceMonth);
      if (isCurrent()) setAttendanceSummary(summary);
    } catch (err) {
      // Attendance is a supplementary administrative card. It must not make
      // the student's diagnostic and learning profile inaccessible.
      console.error("Failed to load student attendance summary:", err);
      if (isCurrent()) setAttendanceSummary(null);
    } finally {
      if (isCurrent()) setAttendanceLoading(false);
    }
  }, [attendanceMonth, attendanceSeq, isTeacher, studentId]);

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
    // The save may resolve after the user opened another student: it must not
    // close that student's notes editor (discarding unsaved text) or clear a
    // newer save's "saving" flag.  loadProfile below guards itself.
    const token = notesSeq.next();
    const stillOnScreen = () => canStartRequest(studentId, currentStudentIdRef.current);
    setSavingNotes(true);
    try {
      await orgApi.updateStudent(studentId, {
        student_phone: phoneVal.trim() || null,
        comment: commentVal.trim() || null,
      });
      if (stillOnScreen()) setEditingNotes(false);
      await loadProfile();
    } catch (e: any) {
      // A failed save is always reported, whichever student is on screen now.
      alert(e.message || "Ошибка сохранения");
    } finally {
      if (notesSeq.isCurrent(token)) setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        <p className="text-sm text-slate-400">Загрузка профиля ученика...</p>
        {toastNode}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-100 text-center shadow-sm">
        {toastNode}
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
  const memberships = profileMemberships(profile);
  const openAssign = (mode: "transfer" | "add") => { setAssignMode(mode); setAssignModalOpen(true); };

  // Archive: owner and administrator only; an archived card hides every group and payment action.
  const access = studentArchiveAccess({ isTeacher: Boolean(isTeacher), status: student.status, demo: DEMO_MODE });
  const archiveInfo = studentArchiveInfo(profile);
  const formerGroupNames = archiveGroupNames(profile.archived_groups);
  // The archived state changed: read again everything that depends on it - the card (status, banner, actions,
  // groups, payments), the attendance summary and the payment counters of the menu.
  const reloadCard = (options?: { silent?: boolean }) => {
    void loadProfile(options);
    void loadAttendanceSummary();
    void usePaymentsSummary.getState().refresh(true);
  };
  // The server's own numbers (invites it cancelled, tests it left running) go under the toast when there are any.
  const handleArchived = (result: StudentArchiveResult) => {
    setArchiveOpen(false);
    showToast(ARCHIVED_TOAST, "success", archiveResultDetails(result));
    reloadCard();
  };
  // Called once, the moment the server has taken him back.  Nothing to read: close, toast, the spinner hides the
  // old card.  Something to read: the dialog stays on screen as the notice (no toast, it would repeat it) and the
  // card behind it is read again silently, so «Готово» has nothing left to refresh.
  const handleRestored = (outcome: RestoreOutcome) => {
    const dialogStays = restoreNeedsReading(outcome);
    if (!dialogStays) {
      setRestoreOpen(false);
      showToast(outcome.text, outcome.type, outcome.lines);
    }
    reloadCard({ silent: dialogStays });
  };
  // 409: the card was out of date (archived or restored in another tab); read it again.
  const handleStale = (message: string) => {
    setArchiveOpen(false);
    setRestoreOpen(false);
    showToast(message, "error");
    reloadCard();
  };

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

      {/* ── Archive banner: the student left the center ───────────────────── */}
      {access.showBanner && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <Archive className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">{archiveBannerTitle(archiveInfo.archivedAt)}</p>
              {archiveInfo.reason && <p className="mt-0.5 break-words text-sm text-amber-800">Причина: {archiveInfo.reason}</p>}
              <p className="mt-0.5 text-xs text-amber-700">История уроков, оплат и квитанций сохранена.</p>
            </div>
          </div>
          {access.canRestore && (
            <button
              type="button"
              onClick={() => setRestoreOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 sm:shrink-0"
            >
              <ArchiveRestore className="h-4 w-4" aria-hidden />
              Вернуть из архива
            </button>
          )}
        </div>
      )}

      {/* ── Hero Profile Card ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-primary-50/40 to-indigo-50/20 rounded-full blur-3xl -z-0 pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            {/* Avatar */}
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-md shadow-primary-600/20 shrink-0">
              {(student.first_name || student.full_name).charAt(0)}
            </div>

            {/* Main Details */}
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="min-w-0 break-words text-2xl font-bold text-slate-900">{student.full_name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {student.class_level} класс
                </span>
                {access.showBanner && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">В архиве</span>
                )}
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap pt-1">
                {memberships.length > 0 ? (
                  memberships.map((item) => (
                    <Link
                      key={item.membership_id || item.group_id}
                      href={`${groupsBasePath}/${item.group_id}`}
                      title={`${memberships.length > 1 ? "" : "Группа: "}«${item.group_name}»${item.teacher_name ? ` (${item.teacher_name})` : ""}`}
                      data-testid="student-group-badge"
                      className="flex min-w-0 max-w-full items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200/60 font-medium transition-colors"
                    >
                      <Users className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span className="min-w-0 truncate whitespace-nowrap">
                        {memberships.length > 1 ? "" : "Группа: "}«{item.group_name}»
                        {item.teacher_name && (
                          <span className="text-emerald-600/80">{` (${item.teacher_name})`}</span>
                        )}
                      </span>
                    </Link>
                  ))
                ) : access.showBanner ? (
                  formerGroupNames.length > 0 && (
                    <span className="flex items-start gap-1.5 text-slate-500">
                      <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 break-words">Были в группах: {formerGroupNames.map((name) => `«${name}»`).join(", ")}</span>
                    </span>
                  )
                ) : (
                  <span className="flex items-center gap-1 text-slate-400 italic">
                    <Users className="w-3.5 h-3.5" />
                    Группа не назначена
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* «⋯» → «В архив»: owner and administrator, a student who is not archived yet */}
          {access.canArchive && (
            <div className="shrink-0">
              <RowMenu
                label={`Действия: ${student.full_name}`}
                width={200}
                items={[
                  { key: "archive", label: "В архив", icon: Archive, danger: true, onSelect: () => setArchiveOpen(true) },
                ]}
              />
            </div>
          )}
        </div>

        {/* ── Navigation Tabs: scroll sideways on a phone, never widen the page ── */}
        <div ref={tabStrip} data-testid="student-tabs" className="relative mt-6 sm:mt-8 -mb-2 flex items-center gap-0 sm:gap-2 overflow-x-auto overscroll-x-contain border-b border-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Разделы карточки ученика">
          {tabs.map((id) => {
            const Icon = TAB_ICON[id];
            const isActive = activeTab === id;
            const count = id === "diagnostics" ? diagnostics.length : undefined;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`student-tab-${id}`}
                aria-selected={isActive}
                aria-controls="student-tab-panel"
                onClick={() => selectTab(id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="hidden sm:block w-4 h-4" />
                <span className="sm:hidden">{PROFILE_TAB_SHORT_LABEL[id]}</span>
                <span className="hidden sm:inline">{PROFILE_TAB_LABEL[id]}</span>
                {count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div id="student-tab-panel" role="tabpanel" aria-labelledby={`student-tab-${activeTab}`} className="min-w-0 space-y-6">
        {paymentsPending && (
          <div className="flex h-40 items-center justify-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
          </div>
        )}

        {/* ── Tab 1: Diagnostics & Exam History ─────────────────────────────── */}
        {!paymentsPending && activeTab === "diagnostics" && (
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
                  {access.diagnosticActions && (
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
                    // Cancelled (the student was archived) and expired invites are history: grey, never «ожидает».
                    const isDead = isInviteDead(diag.status);
                    const cancelHint = inviteCancelHint(diag);
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
                                  : isDead
                                    ? "bg-slate-100 text-slate-500 border border-slate-200/60"
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
                              {cancelHint && <p className="mt-0.5 text-xs text-slate-500">{cancelHint}</p>}
                            </div>
                          </div>

                          {/* Action Button: Open Report (same size as the badge and buttons of the diagnostics list) */}
                          {isCompleted ? (
                            <Link href={`${diagnosticsBasePath}/${diag.invite_id}/report`} className={diagnosticActionClass("solid")}>
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Полный отчёт</span>
                            </Link>
                          ) : (
                            <DiagnosticStatusBadge
                              tone={isDead ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-amber-50 text-amber-700 border-amber-200"}
                              dot={isDead ? "bg-slate-400" : "bg-amber-400"}
                            >
                              {studentCardInviteLabel(diag.status)}
                            </DiagnosticStatusBadge>
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
                                <p className="text-xs font-semibold text-slate-500">Уровень по классу</p>
                                <div className="mt-1 flex flex-col items-center gap-1">
                                  {levelView ? (
                                    <span className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-medium border ${levelView.tone.badge}`}>
                                      {levelView.label}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </div>
                              </div>

                              <div className="text-center">
                                <p className="text-xs font-semibold text-slate-500">Результат</p>
                                <p className="text-xs sm:text-sm font-medium text-slate-700 mt-1">
                                  {solvedText ?? "—"}
                                </p>
                              </div>

                              <div className="text-center">
                                <p className="text-xs font-semibold text-slate-500">Время теста</p>
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
                                <span>Сдан: {formatUtcNaiveAsBusinessDayTime(ex.submitted_at)}</span>
                              ) : ex.started_at ? (
                                <span>Начат: {formatUtcNaiveAsBusinessDate(ex.started_at, { day: "numeric", month: "short" })}</span>
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

        {/* ── «Обучение»: groups (no money), attendance, enrolment history ─────── */}
        {!paymentsPending && activeTab === "learning" && (
          <div className="space-y-6">
            <StudentGroupsBlock
              profile={profile}
              groupsBasePath={groupsBasePath}
              isTeacher={isTeacher}
              onAssign={openAssign}
            />

            {/* Attendance of the month */}
            {!isTeacher && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">Посещаемость за {monthYearLabelRu(attendanceMonth)}</h2>
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
                    <span className="min-w-[130px] px-2 text-center text-xs font-semibold text-slate-700">{capitalizeFirst(monthYearLabelRu(attendanceMonth))}</span>
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
                        [MARK_CELL_LABEL.present, attendanceSummary.totals.present, "text-emerald-700"],
                        [MARK_CELL_LABEL.late, attendanceSummary.totals.late, "text-amber-700"],
                        [MARK_CELL_LABEL.absent, attendanceSummary.totals.absent, "text-rose-600"],
                        [MARK_CELL_LABEL.excused, attendanceSummary.totals.excused, "text-sky-700"],
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
                    <StudentLessonsList lessons={attendanceSummary.lessons} notices={attendanceSummary.notices} />
                    {attendanceSummary.groups.length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-slate-100">
                        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold text-slate-500">
                          По группам за месяц
                        </div>
                        <div className="divide-y divide-slate-100">
                        {attendanceSummary.groups.map((groupSummary) => (
                          <div key={groupSummary.group_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                            <div>
                              <p className="font-semibold text-slate-800">{groupSummary.group_name}</p>
                              <p className="text-xs text-slate-500">{groupSummary.teacher_name || "Преподаватель не назначен"}</p>
                            </div>
                            <p className="text-xs font-medium text-slate-600">{formatGroupMonthLine(groupSummary)}</p>
                          </div>
                        ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-7 text-center">
                      <p className="text-sm font-semibold text-slate-700">За этот месяц нет завершённых занятий с участием ученика</p>
                      <p className="mt-1 text-xs text-slate-500">После старта и фиксации посещаемости данные появятся здесь автоматически.</p>
                    </div>
                    {/* a cancelled or moved lesson is news even in a month without a held one */}
                    <StudentLessonsList lessons={[]} notices={attendanceSummary?.notices} />
                  </>
                )}
              </div>
            )}

            {/* Group History (only if transitions exist) */}
            {group_history.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold text-slate-800">История зачислений и переводов</h3>
                <div className="divide-y divide-slate-100">
                  {group_history.map((gh, idx) => (
                    <div key={idx} className="py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                      <div className="min-w-0 flex items-center gap-3">
                        <div
                          className={`w-2 h-2 shrink-0 rounded-full ${
                            gh.is_active ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-slate-300"
                          }`}
                        />
                        <div className="min-w-0 break-words">
                          <span className="font-semibold text-slate-800">{gh.group_name}</span>
                          {gh.class_level && (
                            <span className="text-xs text-slate-400 ml-2">({gh.class_level} класс)</span>
                          )}
                        </div>
                      </div>
                      {/* On a phone the stays wrap under the name (ml-auto keeps them at the right edge). */}
                      <div className="ml-auto min-w-0 max-w-full break-words text-right text-xs text-slate-500">
                        {gh.is_active && (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">Текущая группа</span>
                        )}
                        {/* Every stay of a student who came back; the current group lists them only when there are several. */}
                        {gh.periods && gh.periods.length > (gh.is_active ? 1 : 0) ? (
                          <p className={gh.is_active ? "mt-1" : ""}>в группе {formatMembershipPeriods(gh.periods)}</p>
                        ) : !gh.is_active && (
                          <span>
                            {gh.joined_at ? formatUtcNaiveAsBusinessDate(gh.joined_at) : "—"} — {gh.left_at ? formatUtcNaiveAsBusinessDate(gh.left_at) : "переведён"}
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

        {/* ── «Оплаты»: only for a role the server lets see money ─────────────── */}
        {activeTab === "payments" && paymentsVisible && (
          <StudentPaymentsBlock
            profile={profile}
            paymentsBasePath={paymentsBasePath}
            groupsBasePath={groupsBasePath}
            isTeacher={Boolean(isTeacher)}
            refreshKey={memberships.map((item) => item.membership_id || item.group_id).join(",")}
          />
        )}

        {/* ── «Контакты и заметки»: every role reads them, only staff edit (the button below) ── */}
        {!paymentsPending && activeTab === "contacts" && (
          <div className="space-y-6">
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
                    <label htmlFor="student-profile-nomer-telefona" className="block text-xs font-semibold text-slate-700 mb-1">Номер телефона</label>
                    <input
                      id="student-profile-nomer-telefona"
                      type="text"
                      value={phoneVal}
                      onChange={(e) => setPhoneVal(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="student-profile-kommentariy-zametka" className="block text-xs font-semibold text-slate-700 mb-1">Комментарий / Заметка</label>
                    <textarea
                      id="student-profile-kommentariy-zametka"
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
                      {student.created_at ? formatUtcNaiveAsBusinessDate(student.created_at, { day: "numeric", month: "long", year: "numeric" }) : "—"}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 space-y-1 sm:col-span-2">
                    <p className="text-xs text-slate-400 font-medium">Заметки и комментарии</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{student.comment || "Заметок нет"}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Assign to Group Modal (staff only, like the buttons that open it; never for an archived student) ── */}
      {access.groupActions && (
        <AssignGroupModal
          open={assignModalOpen}
          studentId={student.id}
          studentName={student.full_name}
          studentGrade={student.class_level}
          mode={assignMode}
          currentGroupId={student.group_id}
          currentGroupName={assignMode === "add" ? memberships.map((item) => item.group_name).join(", ") || null : group?.name || null}
          excludeGroupIds={memberships.map((item) => item.group_id)}
          groupsBasePath={groupsBasePath}
          onClose={() => setAssignModalOpen(false)}
          onAssigned={() => {
            setAssignModalOpen(false);
            loadProfile();
          }}
        />
      )}

      {/* ── Archive / restore (owner and administrator) ── */}
      {access.canArchive && (
        <StudentArchiveModal
          open={archiveOpen}
          studentId={student.id}
          studentName={student.full_name}
          groupNames={archiveGroupNames(memberships)}
          diagnostics={archiveDiagnosticCounts(diagnostics)}
          onClose={() => setArchiveOpen(false)}
          onArchived={handleArchived}
          onStale={handleStale}
        />
      )}
      {/* Stays mounted while its notice is open: the reload that follows a return turns `canRestore` off. */}
      {(access.canRestore || restoreOpen) && (
        <StudentRestoreModal
          open={restoreOpen}
          studentId={student.id}
          studentName={student.full_name}
          archivedGroups={profile.archived_groups}
          onClose={() => setRestoreOpen(false)}
          onRestored={handleRestored}
          onStale={handleStale}
        />
      )}
      {toastNode}
    </div>
  );
}
