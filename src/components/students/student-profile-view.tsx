"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Brain,
  Phone, Edit2, ExternalLink,
  GraduationCap, AlertCircle,
  ChevronRight, Plus, Wallet, Archive, ArchiveRestore, Copy
} from "lucide-react";
import Link from "next/link";
import { DEMO_MODE, examsApi, orgApi, StudentAttendanceSummary, StudentProfile, type StudentArchiveResult } from "@/lib/api";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { StudentGroupsBlock, profileMemberships } from "@/components/students/student-groups-block";
import { StudentPaymentsBlock } from "@/components/students/student-payments-block";
import { StudentArchiveModal } from "@/components/students/student-archive-modal";
import { StudentRestoreModal } from "@/components/students/student-restore-modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { StudentDiagnosticDialog } from "@/components/students/student-diagnostic-dialog";
import { useCopy } from "@/lib/use-copy";
import { checkStudentData, studentDataForm, studentDataPatch, studentEditHref, studentMenuKeys, studentMoneyChip, STUDENT_MENU_LABEL, type StudentDataForm, type StudentMoneyChip } from "@/lib/student-card";
import { defaultDiagnosticKind, diagnosticLink, diagnosticsAllowed, isShareableInvite, NEW_DIAGNOSTIC_LABEL } from "@/lib/student-diagnostic";
import { type MembershipPaymentRow } from "@/lib/payments";
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

/** A reload of the card that keeps it on screen (no spinner): after saving the data. */
const QUIET_RELOAD = { silent: true } as const;

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
  // Diagnostics and exams are the administrator's (owner decision 22.10): the owner's card has no button and no link into /admin/*.
  const workspace: "owner" | "admin" | "teacher" = isTeacher ? "teacher" : isOwnerPath ? "owner" : "admin";
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
  const { copied: copiedInvite, copy } = useCopy();
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

  // «Изменить данные…»: the surname, the name, the class, the phone and the note in one form of the «Контакты» tab
  const [editingNotes, setEditingNotes] = useState(false);
  const [dataForm, setDataForm] = useState<StudentDataForm | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  // «Новая диагностика…» (administrator) and the money chip of the header
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [moneyChip, setMoneyChip] = useState<StudentMoneyChip | null>(null);

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
    // A new student never opens with the previous student's data editor / draft.
    setEditingNotes(false);
    setDataForm(null);
    setDataError(null);
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

  const startEdit = () => {
    if (!profile) return;
    setDataForm(studentDataForm(profile.student));
    setDataError(null);
    setEditingNotes(true);
  };

  const handleSaveNotes = async () => {
    if (!profile || !dataForm) return;
    const problem = checkStudentData(dataForm);
    if (problem) { setDataError(problem); return; }
    const patch = studentDataPatch(dataForm, profile.student);
    if (Object.keys(patch).length === 0) { setEditingNotes(false); return; }
    // The save may resolve after the user opened another student: it must not
    // close that student's editor (discarding unsaved text) or clear a
    // newer save's "saving" flag.  loadProfile below guards itself.
    const token = notesSeq.next();
    const stillOnScreen = () => canStartRequest(studentId, currentStudentIdRef.current);
    setSavingNotes(true);
    setDataError(null);
    try {
      await orgApi.updateStudent(studentId, patch);
      if (stillOnScreen()) { setEditingNotes(false); showToast("Данные ученика сохранены"); }
      await loadProfile(QUIET_RELOAD);
    } catch (e: any) {
      // A failed save is always reported, whichever student is on screen now.
      if (stillOnScreen()) setDataError(e?.message || "Ошибка сохранения");
      else showToast(e?.message || "Ошибка сохранения", "error");
    } finally {
      if (notesSeq.isCurrent(token)) setSavingNotes(false);
    }
  };

  // `?tab=contacts&edit=1` (the «⋯» → «Изменить данные…» of another screen) opens the form once the card is there
  const editRequested = searchParams?.get("edit") === "1";
  useEffect(() => {
    if (!profile || !editRequested || isTeacher || editingNotes || activeTab !== "contacts") return;
    setDataForm(studentDataForm(profile.student));
    setEditingNotes(true);
    // once per request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.student.id, editRequested, activeTab]);

  const onMoneyRows = useCallback((rows: MembershipPaymentRow[]) => setMoneyChip(studentMoneyChip(rows)), []);

  // The money chip of the header: the same rows the «Оплаты» tab shows (only a role that sees money; nothing is requested otherwise)
  useEffect(() => {
    if (!paymentsVisible || !profile) { setMoneyChip(null); return undefined; }
    let cancelled = false;
    orgApi.getStudentMemberships(studentId)
      .then((rows: MembershipPaymentRow[]) => { if (!cancelled) setMoneyChip(studentMoneyChip(Array.isArray(rows) ? rows : [])); })
      .catch(() => { if (!cancelled) setMoneyChip(null); });
    return () => { cancelled = true; };
  }, [paymentsVisible, studentId, profile]);

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

  const diagnosticsEnabled = diagnosticsAllowed({ workspace, archived: access.showBanner });
  const headerMenu: RowMenuItem[] = isTeacher ? [] : studentMenuKeys({
    canEdit: true, diagnostics: diagnosticsEnabled, hasDisplayId: Boolean(student.display_id), canArchive: access.canArchive,
  }).map((key): RowMenuItem => {
    if (key === "edit") return { key, label: STUDENT_MENU_LABEL.edit, icon: Edit2, onSelect: () => { startEdit(); if (activeTab !== "contacts") router.replace(studentEditHref(pathname ?? ""), { scroll: false }); } };
    if (key === "diagnostic") return { key, label: NEW_DIAGNOSTIC_LABEL, icon: Brain, onSelect: () => setDiagnosticOpen(true) };
    if (key === "copyId") return { key, label: STUDENT_MENU_LABEL.copyId, icon: Copy, onSelect: () => { void copy(student.display_id ?? "", "id").then((ok) => showToast(ok ? "ID ученика скопирован" : "Не удалось скопировать", ok ? "success" : "error")); } };
    return { key, label: STUDENT_MENU_LABEL.archive, icon: Archive, danger: true, onSelect: () => setArchiveOpen(true) };
  });

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
                {/* IA audit F35: the money of the student in one chip, a link to «Оплаты» */}
                {moneyChip && paymentsVisible && (
                  <Link
                    href={`${pathname}?tab=payments`}
                    data-testid="student-money-chip"
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold hover:underline ${moneyChip.tone === "danger" ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                  >
                    {moneyChip.label}
                  </Link>
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

          {/* IA audit F3: «⋯» holds the actions about the PERSON only - «Изменить данные…», «Новая диагностика…» (administrator), «Копировать ID»,
              «В архив» last.  Money lives in «Оплаты», the groups and the pause in «Обучение». */}
          {headerMenu.length > 0 && (
            <div className="shrink-0">
              <RowMenu label={`Действия: ${student.full_name}`} width={220} items={headerMenu} />
            </div>
          )}
        </div>

        {/* ── Navigation Tabs: scroll sideways on a phone, never widen the page ── */}
        <div ref={tabStrip} data-testid="student-tabs" className="relative mt-6 sm:mt-8 -mb-2 flex items-center gap-0 sm:gap-2 overflow-x-auto overscroll-x-contain border-b border-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Разделы карточки ученика">
          {tabs.map((id) => {
            const Icon = TAB_ICON[id];
            const isActive = activeTab === id;
            const count = id === "diagnostics" ? diagnostics.length : id === "payments" && moneyChip && moneyChip.debtGroups > 0 ? moneyChip.debtGroups : undefined;
            const countTone = id === "payments" ? "bg-rose-100 text-rose-700" : isActive ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500";
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`student-tab-${id}`}
                aria-selected={isActive}
                aria-controls="student-tab-panel"
                onClick={() => selectTab(id)}
                className={`flex flex-1 sm:flex-none shrink-0 justify-center items-center gap-1.5 sm:gap-2 whitespace-nowrap px-1.5 sm:px-4 py-3 text-[13px] sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
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
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${countTone}`}
                    title={id === "payments" ? "Группы с долгом" : undefined}
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
                  {/* the administrator creates the invite for THIS student (F32); the owner has no diagnostic buttons (owner decision 22.10) */}
                  {diagnosticsEnabled && (
                    <button
                      type="button"
                      onClick={() => setDiagnosticOpen(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-primary-600 text-white rounded-xl text-xs font-medium hover:bg-primary-700 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Назначить диагностику
                    </button>
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
                            // the report is the administrator's (and the teacher's) page: no link from the owner's card
                            workspace === "owner" ? (
                              <DiagnosticStatusBadge testId="student-diagnostic-status" tone="bg-emerald-50 text-emerald-700 border-emerald-200" dot="bg-emerald-400">Пройдена</DiagnosticStatusBadge>
                            ) : (
                              <Link href={`${diagnosticsBasePath}/${diag.invite_id}/report`} className={diagnosticActionClass("solid")}>
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Полный отчёт</span>
                              </Link>
                            )
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {/* IA audit F15: a waiting invite can be sent again from the card (administrator) */}
                              {diagnosticsEnabled && isShareableInvite(diag.status) && diag.code && (
                                <button
                                  type="button"
                                  data-testid="student-diagnostic-copy-link"
                                  onClick={() => { void copy(diagnosticLink(window.location.origin, diag.code), `invite-${diag.invite_id}`).then((ok) => showToast(ok ? "Ссылка на диагностику скопирована" : "Не удалось скопировать", ok ? "success" : "error")); }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  <Copy className="h-3.5 w-3.5" aria-hidden />
                                  {copiedInvite === `invite-${diag.invite_id}` ? "Скопировано" : "Скопировать ссылку"}
                                </button>
                              )}
                              <DiagnosticStatusBadge
                                testId="student-diagnostic-status"
                                tone={isDead ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-amber-50 text-amber-700 border-amber-200"}
                                dot={isDead ? "bg-slate-400" : "bg-amber-400"}
                              >
                                {studentCardInviteLabel(diag.status)}
                              </DiagnosticStatusBadge>
                            </div>
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
              onNotify={showToast}
              onChanged={(kind) => { void usePaymentsSummary.getState().refresh(true); if (kind === "left") void loadProfile(); }}
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
            onRowsChange={onMoneyRows}
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
                    onClick={startEdit}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Изменить данные
                  </button>
                )}
              </div>

              {editingNotes && dataForm ? (
                <form
                  className="space-y-4 max-w-lg"
                  data-testid="student-data-form"
                  onSubmit={(event) => { event.preventDefault(); void handleSaveNotes(); }}
                  noValidate
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="student-profile-familiya" className="block text-xs font-semibold text-slate-700 mb-1">Фамилия</label>
                      <input
                        id="student-profile-familiya"
                        type="text"
                        value={dataForm.last_name}
                        onChange={(e) => { setDataError(null); setDataForm({ ...dataForm, last_name: e.target.value }); }}
                        className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="student-profile-imya" className="block text-xs font-semibold text-slate-700 mb-1">Имя</label>
                      <input
                        id="student-profile-imya"
                        type="text"
                        value={dataForm.first_name}
                        onChange={(e) => { setDataError(null); setDataForm({ ...dataForm, first_name: e.target.value }); }}
                        className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="student-profile-klass" className="block text-xs font-semibold text-slate-700 mb-1">Класс</label>
                    <select
                      id="student-profile-klass"
                      value={dataForm.class_level}
                      onChange={(e) => { setDataError(null); setDataForm({ ...dataForm, class_level: e.target.value }); }}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none sm:w-1/2"
                    >
                      {[...new Set([5, 6, 7, 8, 9, 10, 11, student.class_level])].sort((x, y) => x - y).map((level) => <option key={level} value={String(level)}>{level} класс</option>)}
                    </select>
                    {Number(dataForm.class_level) !== student.class_level && (
                      <p className="mt-1 text-xs text-amber-800" role="note">Класс влияет на диагностику и уровни: новые диагностики пойдут по выбранному классу.</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="student-profile-nomer-telefona" className="block text-xs font-semibold text-slate-700 mb-1">Номер телефона</label>
                    <input
                      id="student-profile-nomer-telefona"
                      type="text"
                      value={dataForm.student_phone}
                      onChange={(e) => setDataForm({ ...dataForm, student_phone: e.target.value })}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="student-profile-kommentariy-zametka" className="block text-xs font-semibold text-slate-700 mb-1">Комментарий / Заметка</label>
                    <textarea
                      id="student-profile-kommentariy-zametka"
                      rows={4}
                      value={dataForm.comment}
                      onChange={(e) => setDataForm({ ...dataForm, comment: e.target.value })}
                      placeholder="Особенности ученика, пожелания родителей, цели..."
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  {dataError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{dataError}</p>}

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={savingNotes}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
                    >
                      {savingNotes ? "Сохранение..." : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingNotes(false); setDataError(null); }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
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
      {diagnosticOpen && diagnosticsEnabled && (
        <StudentDiagnosticDialog
          open
          studentId={student.id}
          studentName={student.full_name}
          classLevel={student.class_level}
          initialKind={defaultDiagnosticKind(diagnostics)}
          onClose={() => setDiagnosticOpen(false)}
          onCreated={() => { void loadProfile(QUIET_RELOAD); }}
        />
      )}
      {toastNode}
    </div>
  );
}
