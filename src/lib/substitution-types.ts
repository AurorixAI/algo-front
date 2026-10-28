/**
 * LOGIC-B2 («Замены»): the shapes of the frozen contract (artifacts/partner_doc_check/logicB2_contract.json, golden
 * answers in tests/fixtures/logB2).  Types only.  Every key the server may leave out is optional: an older server
 * answers with the old shape and the screens must read it without surprises.
 */
import type { OpsErrorDetail, TeacherConflict } from "./ops-b-types";
import type { CancellationKind } from "./payf";

export type SubstitutionReasonCode = "sick" | "personal" | "other";

export type SubstitutionStatus =
  | "pending"
  | "substituted"
  | "rescheduled"
  | "cancelled"
  | "rejected"
  | "withdrawn"
  | "closed";

export type SubstitutionDecisionKind = "substitute" | "reschedule" | "cancel" | "reject";

export type ClosedReasonCode =
  | "LESSON_STARTED"
  | "LESSON_CANCELLED"
  | "LESSON_REMOVED"
  | "GROUP_ARCHIVED"
  | "GROUP_TEACHER_CHANGED"
  | "TEACHER_REMOVED"
  | "LESSON_OUTSIDE_WINDOW"
  | "ASSIGNMENT_CLEARED"
  | "LESSON_RESTORED"
  | "KIND_CHANGED"
  | "ONE_OFF_ADDED"
  | "ROLE_CHANGED";

export interface PersonRef {
  id: string;
  name: string;
  /** Where the server says it (`owner` | `admin` | `teacher`): the journal then says «владелец» instead of «администратор». */
  role?: string | null;
}

export interface SubstitutionMovedTo {
  date: string;
  startTime: string;
  endTime: string;
  lessonId?: string | null;
}

/** `movedFrom` of the new lesson that a move created (#124): the slot of the original - no reason, no comment. */
export interface MovedFrom {
  lessonId: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** `POST /org/groups/{id}/lesson-move` (#124): the administrator moves a lesson straight from the lesson sheet. */
export interface LessonMoveBody {
  lessonId: string;
  lessonDate: string;
  newDate: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: "offline" | "online" | null;
  reason: string;
  /** What the sheet showed: another time on the server answers 409 LESSON_CHANGED. */
  expectedStartTime?: string | null;
  expectedEndTime?: string | null;
}

export interface SubstitutionLessonInfo {
  lessonId: string;
  /** YYYY-MM-DD (the business calendar). */
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: string | null;
  /** Naive UTC. */
  startsAtUtc?: string | null;
  exists?: boolean;
}

export interface SubstitutionDecision {
  kind: SubstitutionDecisionKind | "withdraw" | "closed";
  by?: PersonRef | null;
  /** Naive UTC. */
  at?: string | null;
  via?: "request" | "teacher_move" | "lesson_teacher_put" | "system" | "withdraw" | "teacher_cancel" | "manager_restore" | "reason_change" | string | null;
  /** The reason of a rejection / a cancellation / a move, or the comment of a substitution. */
  note?: string | null;
  substitute?: PersonRef | null;
  movedTo?: SubstitutionMovedTo | null;
  closedReason?: ClosedReasonCode | string | null;
  closedReasonText?: string | null;
}

export interface SubstitutionPrevious {
  id: string;
  status: SubstitutionStatus;
  teacherName?: string | null;
  substituteName?: string | null;
}

export interface SubstitutionItem {
  id: string;
  batchId?: string | null;
  status: SubstitutionStatus;
  origin?: "teacher" | "system" | string;
  group: { id: string; name: string; studentCount?: number };
  lesson: SubstitutionLessonInfo;
  teacher: PersonRef;
  reasonCode: SubstitutionReasonCode;
  reasonLabel?: string;
  comment?: string | null;
  suggestedTeacher?: (PersonRef & { active?: boolean }) | null;
  /** Naive UTC. */
  createdAt?: string | null;
  /** Negative after the start. */
  minutesToStart: number;
  urgent: boolean;
  overdue: boolean;
  decision?: SubstitutionDecision | null;
  previous?: SubstitutionPrevious | null;
  /** P1.2: how a record the system made came to be: `manager_assign` (a substitution set on the lesson sheet), `manager_move`, `teacher_move`; null for a request of a teacher. */
  trigger?: "manager_assign" | "manager_move" | "teacher_move" | "manager_cancel" | "teacher_cancel" | "manager_restore" | "manager_reason_change" | "teacher_one_off" | "window_expired" | "day_off" | "role_changed" | string | null;
  /** P1.2: the substitution of the record stopped later (taken off, replaced, released, the lesson cancelled / moved); the status of the record does not change. Naive UTC. */
  clearedAt?: string | null;
  clearedBy?: PersonRef | null;
  /** The teacher who took the lesson over; null = the main teacher leads again. */
  clearedTo?: PersonRef | null;
  clearedTrigger?: "put" | "member_removed" | "role_changed" | "group_teacher_changed" | "cancel" | "move" | "release" | string | null;
}

// ── teacher ───────────────────────────────────────────────────────────────────

export type MyLessonStatus = "scheduled" | "requested" | "started" | "passed" | "cancelled";
export type MyLessonBlockReason = "LESSON_ALREADY_STARTED" | "LESSON_CANCELLED" | "ALREADY_REQUESTED";

export interface MyLesson {
  groupId: string;
  groupName: string;
  lessonId: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: string;
  isSubstitution?: boolean;
  status: MyLessonStatus;
  requestId?: string | null;
  canRequest: boolean;
  blockReason?: MyLessonBlockReason | null;
}

export interface MyLessonsOut {
  dateFrom: string;
  dateTo: string;
  lessons: MyLesson[];
}

export interface SubstitutionLessonRef {
  groupId: string;
  lessonId: string;
  lessonDate: string;
}

export interface CreateSubstitutionBody {
  lessons: SubstitutionLessonRef[];
  reasonCode: SubstitutionReasonCode;
  comment?: string | null;
  suggestedTeacherId?: string | null;
}

export interface SkippedLesson extends SubstitutionLessonRef {
  code: string;
  message: string;
}

export interface CreateSubstitutionOut {
  batchId: string;
  created: SubstitutionItem[];
  alreadyRequested: SubstitutionItem[];
  skipped: SkippedLesson[];
}

export interface AssignedToMe {
  groupId: string;
  groupName: string;
  lessonId: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  replacing: PersonRef;
  assignedAt?: string | null;
}

/** W1 S22 (F11): a lesson where the person WAS the substitute and the assignment was taken off in the last 14 days - who did it and when. */
export interface ClearedForMe {
  groupId: string;
  groupName: string;
  lessonId: string;
  lessonDate: string;
  startTime?: string | null;
  endTime?: string | null;
  /** UTC naive */
  clearedAt: string;
  clearedBy?: PersonRef | null;
}

export interface MineOut {
  items: SubstitutionItem[];
  pendingTotal: number;
  assignedToMe: AssignedToMe[];
  clearedForMe?: ClearedForMe[];
}

export interface WithdrawBatchOut {
  withdrawn: SubstitutionItem[];
  skipped: Array<{ id: string; code: string; message: string }>;
}

// ── owner / admin ─────────────────────────────────────────────────────────────

export interface SubstitutionSummary {
  pendingTotal: number;
  urgentTotal: number;
  overdueTotal: number;
  /** W1 S20: see `SubstitutionListOut`. */
  expiringTotal?: number;
}

export type SubstitutionListStatus = "pending" | "decided" | "all";

export interface SubstitutionListParams {
  status: SubstitutionListStatus;
  groupId?: string;
  teacherId?: string;
  dateFrom?: string;
  dateTo?: string;
  urgent?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SubstitutionListOut {
  items: SubstitutionItem[];
  total: number;
  pendingTotal: number;
  urgentTotal: number;
  /** W1 S20: waiting requests of the last month that drop out of the window on the 1st - non-zero only in the last 3 days before it. */
  expiringTotal?: number;
}

export interface SubstitutionEvent {
  action: string;
  actor?: PersonRef | null;
  at?: string | null;
  snapshot?: Record<string, unknown> | null;
}

export interface ExamBinding {
  state: "ok" | "none" | "unavailable";
  title?: string | null;
  canCancel?: boolean;
  /** The server's sentence when it refuses (`lesson-exam-binding`, #124). */
  message?: string | null;
}

export interface SubstitutionDetailOut {
  item: SubstitutionItem;
  chain?: SubstitutionItem[];
  events?: SubstitutionEvent[];
  examBinding?: ExamBinding | null;
}

export interface CandidateBusy {
  kind: "lesson" | "substitution";
  groupName: string;
  startTime: string;
  endTime: string;
  pendingRequest?: boolean;
}

export interface SubstitutionCandidate {
  teacherId: string;
  name: string;
  orgRole: "teacher" | "admin" | "owner" | string;
  suggested?: boolean;
  isDefaultTeacher?: boolean;
  busy?: boolean;
  busyWith?: CandidateBusy | null;
  /** W1: the owner and the administrator both read the yes / no (the rates themselves are the owner's alone). */
  rateMissing?: boolean | null;
  /** W1 F5: an estimate in sum of what the lesson would pay him; null / absent - nothing to show. */
  substitutePayEstimate?: number | null;
  substitutePayEstimateReason?: string | null;
}

export interface CandidatesOut {
  requestId: string;
  lesson: { groupId: string; groupName: string; lessonId: string; date: string; startTime: string; endTime: string };
  requesterId: string;
  candidates: SubstitutionCandidate[];
}

export interface MoveCheckOut {
  ok: boolean;
  teacherId?: string | null;
  teacherName?: string | null;
  teacherConflicts: TeacherConflict[];
  groupConflicts: TeacherConflict[];
  warnings: Array<{ code: string; message: string }>;
  /** A refusal of the origin lesson (`ok:false`): LESSON_ALREADY_STARTED, LESSON_CANCELLED, GROUP_ARCHIVED, LESSON_NOT_FOUND; absent on an older server. */
  code?: string | null;
  message?: string | null;
}

export interface MoveCheckParams {
  newDate: string;
  startTime: string;
  endTime: string;
}

export type DecideBody =
  | { decision: "substitute"; teacherId: string; note?: string | null; expectedStatus?: "pending" }
  | {
      decision: "reschedule";
      newDate: string;
      startTime: string;
      endTime: string;
      room?: string | null;
      format?: "offline" | "online" | null;
      reason: string;
      expectedStatus?: "pending";
    }
  | { decision: "cancel"; reason: string; cancellationKind?: CancellationKind; expectedStatus?: "pending" }
  | { decision: "reject"; reason: string; expectedStatus?: "pending" };

export interface DecideResult {
  kind: SubstitutionDecisionKind;
  /** W1 S2: what the cancellation became (a date under a day off is a holiday whatever was asked); `null` for the other decisions. */
  cancellationKind?: CancellationKind | null;
  teacherId?: string | null;
  teacherName?: string | null;
  isSubstitution?: boolean | null;
  attendanceUpdated?: boolean | null;
  payrollSheetsAffected?: Array<{ sheet_id?: string | null; teacher_id?: string; month?: string | null; status?: string | null }> | null;
  cancelledVersion?: number | null;
  newLesson?: { id: string; groupId: string; date: string; startTime: string; endTime: string; room?: string | null; format?: string | null } | null;
  warnings?: Array<{ code: string; message: string }> | null;
  version?: number | null;
}

export interface DecideOut {
  item: SubstitutionItem;
  result: DecideResult;
}

export interface DecideBulkBody {
  ids: string[];
  decision: "substitute" | "cancel" | "reject";
  /** W1 F4: only with `cancel` - one kind for the whole pack (default `centre`). */
  cancellationKind?: CancellationKind;
  teacherId?: string | null;
  reason?: string | null;
  note?: string | null;
}

export interface BulkSkipped {
  id: string;
  code: string;
  message: string;
  conflicts?: TeacherConflict[];
  total?: number;
}

export interface DecideBulkOut {
  updated: number;
  items: SubstitutionItem[];
  skipped: BulkSkipped[];
  /** W1 (server R3): one row per decided request, in the order of `items`, with what the server said about it (a holiday instead of «по вине центра», a substitute released). */
  results?: Array<{ id: string; kind: string; cancellationKind?: CancellationKind | null; warnings?: Array<{ code: string; message: string }> | null }>;
  warningsTotal?: number;
}

export interface AlreadyDecidedDetail extends OpsErrorDetail {
  item?: SubstitutionItem | null;
}

// ── additive fields of the existing answers ───────────────────────────────────

/** `substitutionRequest` of an occurrence / `substitutionRequests[<date>_<lessonId>]` of the journal. */
export interface SubstitutionRequestMark {
  id: string;
  status: SubstitutionStatus;
  reasonCode: SubstitutionReasonCode;
  teacherName?: string | null;
}

/** `substitutionOutcome` of the cancelled original of a lesson. */
export interface SubstitutionOutcome {
  kind: "rescheduled" | "cancelled";
  movedTo?: SubstitutionMovedTo | null;
}

/** The roster of the lesson of a substitute (`lessonRoster` of the journal): no phone, no diagnostics. */
export interface LessonRosterStudent {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  display_id?: string | null;
  class_level?: number | null;
}

/** `notices[]` of the attendance of a student: no reason, ever. */
export interface StudentNotice {
  lessonId: string;
  date: string;
  groupId: string;
  groupName: string;
  kind: "cancelled" | "rescheduled";
  movedTo?: SubstitutionMovedTo | null;
  /** PAY-F: the reason of the day off of the centre that cancelled the lesson («Хайит»); the reason of any other cancellation is never sent. */
  holiday?: string | null;
}

export interface RequestClosed {
  id: string;
  status: SubstitutionStatus;
}
