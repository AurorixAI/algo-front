/**
 * LOGIC-B («операции», O1-O17): the shapes of the frozen contract (artifacts/partner_doc_check/logicB_contract.json,
 * golden answers in tests/fixtures/logB).  Types only - kept in this file so that the merge with the money pack
 * (LOGIC-A) never touches the same lines.  Every key the server may leave out is optional: an older server answers
 * with the old shape and the screens must read it without surprises.
 */

/** The `detail` of a refusal in the unified format of the pack: `{code, message, ...fields}`. */
export interface OpsErrorDetail {
  code: string;
  message: string;
}

// ── schedule (O1, O11) ──────────────────────────────────────────────────────────────────────────

export interface OpsWarning {
  code: string;
  message: string;
}

/** One clash of the teacher's lessons (`TEACHER_BUSY`): a lesson of `groupName` meets the teacher's own lesson of `withGroupName`. */
export interface TeacherConflict {
  date: string;
  startTime: string;
  endTime: string;
  groupId: string;
  groupName: string;
  withGroupName: string;
}

export interface TeacherBusyDetail extends OpsErrorDetail {
  conflicts?: TeacherConflict[];
  total?: number;
}

// ── lesson teacher (O5, F6) ─────────────────────────────────────────────────────────────────────

export interface LessonTeacherInfo {
  teacherId?: string | null;
  teacherName?: string | null;
  isSubstitution?: boolean;
  defaultTeacherId?: string | null;
  defaultTeacherName?: string | null;
}

export interface LessonTeacherCandidate {
  teacherId: string;
  name: string;
  /** `owner` | `admin` | `teacher`: the line under the name says who it is. */
  orgRole?: string;
  busy?: boolean;
  busyWith?: { groupName: string; startTime: string; endTime: string } | null;
  /** W1 F5: no payroll rate for this type of lessons in the month of the lesson (owner and administrator both read the yes / no). */
  rateMissing?: boolean | null;
  /** W1 F5: an estimate in sum of what the lesson would pay him; null / absent - nothing to show (`substitutePayEstimateReason`: `RATE_MISSING` | `NO_STUDENTS`). */
  substitutePayEstimate?: number | null;
  substitutePayEstimateReason?: string | null;
}

export interface LessonTeacherCandidates {
  lessonId: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  currentTeacherId?: string | null;
  defaultTeacherId?: string | null;
  candidates?: LessonTeacherCandidate[];
}

export interface LessonTeacherPut {
  lessonDate: string;
  lessonId: string;
  /** null - take the substitute off. */
  teacherId: string | null;
  /** 3..300, required also when the substitute is taken off. */
  reason: string;
  /** The teacher the dialog was opened with: another one now means somebody changed it first (409). */
  expectedTeacherId?: string | null;
}

export interface LessonTeacherResult extends LessonTeacherInfo {
  groupId: string;
  lessonId: string;
  lessonDate: string;
  attendanceUpdated?: boolean;
  version?: number | null;
  payrollSheetsAffected?: Array<{ sheet_id?: string | null; teacher_id: string; month: string; status?: string | null }>;
  /** LOGIC-B2: this assignment closed a waiting request. */
  requestClosed?: { id: string; status: string } | null;
}

// ── attendance (O6, O7, O8, decision 7) ─────────────────────────────────────────────────────────

export interface ExamSync {
  released?: string[];
  leftRunning?: string[];
  warning?: string | null;
}

export interface SaveAttendanceResult {
  ok?: boolean;
  saved?: boolean;
  /** W1: the notes of a cancellation (`CANCELLED_AS_HOLIDAY`, `SUBSTITUTE_RELEASED`): shown, never lost. */
  warnings?: OpsWarning[];
  /** Version of the lesson record after this write; send it back as `expectedVersion` of the next save. */
  version?: number;
  examSync?: ExamSync | null;
}

export interface AttendanceConflictDetail extends OpsErrorDetail {
  currentVersion: number;
  updatedBy?: { id?: string | null; name?: string | null };
  /** Naive UTC. */
  updatedAt?: string | null;
  /** student_id -> status, as the other person saved it. */
  records?: Record<string, string>;
}

export interface LiveExamItem {
  examId: string;
  title: string;
  status: "active" | "lobby" | "print_ready";
  remainingSeconds?: number | null;
  waitingCount?: number;
}

export interface LiveExamDetail extends OpsErrorDetail {
  exams?: LiveExamItem[];
}

// ── group archive (O4, F2) ──────────────────────────────────────────────────────────────────────

export type ArchiveBlockerCode = "ACTIVE_STUDENTS" | "OPEN_LESSON" | "MISSED_LESSONS" | "LIVE_EXAMS";

export interface ArchiveBlocker {
  code: ArchiveBlockerCode;
  count: number;
  students?: Array<{ id: string; name: string; displayId?: string | null }> | null;
  lessons?: Array<{ lessonId: string; lessonDate: string; startTime?: string; endTime?: string; teacherName?: string | null }> | null;
  exams?: Array<{ examId: string; title: string; status: string; lessonDate?: string | null; blockerReason?: string | null }> | null;
}

export interface ArchiveAutoAction {
  code: "RELEASE_EXAMS" | "STOP_FUTURE_LESSONS";
  count: number;
}

export interface ArchiveWarning {
  code: string;
  count?: number;
  message?: string;
}

export interface ArchiveImpact {
  groupId: string;
  groupName: string;
  status: string;
  canArchive: boolean;
  examService?: "ok" | "unavailable";
  blockers?: ArchiveBlocker[];
  autoActions?: ArchiveAutoAction[];
  warnings?: ArchiveWarning[];
  /** Students still in an ALREADY archived group (the banner of the legacy case). */
  legacyStudentsLeft?: number;
}

export interface ArchiveGroupBody {
  reason?: string | null;
  /** "cancel": close every missed lesson as «не было» together with the archive. */
  missedLessonsAction?: "cancel" | null;
}

export interface ArchiveGroupResult {
  id: string;
  status?: string;
  archivedAt?: string | null;
  archiveReason?: string | null;
  releasedExamIds?: string[];
  cancelledMissedLessons?: number;
  /** LOGIC-B2: waiting substitution requests of the group closed by the archive. */
  closedSubstitutionRequests?: number;
}

export interface TeacherInactiveDetail extends OpsErrorDetail {
  teacherName?: string | null;
}

// ── staff (O2, O10) ─────────────────────────────────────────────────────────────────────────────

export interface RemovalGroup {
  id: string;
  name: string;
  studentCount?: number;
  nextLesson?: { date: string; startTime: string } | null;
}

export interface RemovalLesson {
  groupId: string;
  groupName: string;
  lessonDate: string;
  lessonId: string;
}

export interface RemovalImpact {
  memberId: string;
  userId?: string;
  name?: string | null;
  orgRole?: string;
  canRemove: boolean;
  groups?: RemovalGroup[];
  inProgressLessons?: RemovalLesson[];
  futureSubstitutions?: { count?: number };
  missedLessons?: { count?: number };
  /** LOGIC-B2: waiting «Не смогу провести» requests of this member: they are closed with the removal. */
  pendingSubstitutionRequests?: { count?: number };
}

export interface HandoverAssignment {
  groupId: string;
  /** null - leave the group without a teacher (needs `confirmUnassigned`). */
  teacherId: string | null;
}

export interface HandoverBody {
  assignments: HandoverAssignment[];
  confirmUnassigned?: boolean;
}

export interface HandoverResult {
  handedOver?: Array<{ groupId: string; groupName: string; fromTeacherId?: string | null; toTeacherId?: string | null }>;
  remainingGroups?: unknown[];
  releasedSubstitutions?: number;
  /** LOGIC-B2 */
  closedSubstitutionRequests?: number;
}

export interface RemoveMemberResult {
  message: string;
  releasedSubstitutions?: number;
  /** LOGIC-B2 */
  closedSubstitutionRequests?: number;
}

export type MemberListStatus = "active" | "removed" | "all";

export interface OrgMemberRow {
  /** User id. */
  id: string;
  /** OrganizationMember.id (what remove / restore / role take). */
  member_id: string;
  user_id?: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string | null;
  org_role: string;
  is_active?: boolean;
  /** Naive UTC of the last removal. */
  removed_at?: string | null;
  joined_at?: string | null;
}

export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface InvitationRow {
  id: string;
  code: string;
  email?: string | null;
  org_role: string;
  status: InvitationStatus | string;
  /** UTC: naive in lists, with `+00:00` in the answer of the creation. */
  expires_at: string;
  created_at?: string | null;
  is_returning?: boolean;
}

export interface InviteInfo {
  org_name: string;
  org_role: string;
  email?: string | null;
  is_returning?: boolean;
}

// ── import (O9) ─────────────────────────────────────────────────────────────────────────────────

export interface ImportSkipped {
  sheet: string;
  row: number;
  code: string;
  message: string;
  student?: string | null;
  group?: string | null;
}

export interface ImportIssueB {
  sheet: string;
  row: number;
  level: string;
  message: string;
  field?: string | null;
  code?: string | null;
}

export interface ImportCountsB {
  groups_existing?: number;
  groups_new?: number;
  /** LOGIC-A: students whose row carried an opening balance (columns G-I); 0 without the columns. */
  openings?: number;
  students_enrolled?: number;
  students_existing?: number;
  students_new?: number;
  students_skipped?: number;
  students_unchanged?: number;
  teachers_existing?: number;
  teachers_new?: number;
}

/** W1 F3 (S5): the answer of «Вернуть урок». */
export interface RestoreLessonResult {
  ok: boolean;
  restored: boolean;
  lessonId: string;
  lessonDate: string;
  previousKind: "centre" | "holiday" | null;
  /** «Экзамены, снятые с урока при его отмене, не вернутся — назначьте их заново» */
  examsNote?: string | null;
  warnings?: OpsWarning[];
}
