const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function demoApiV1(): string {
  if (typeof window !== "undefined") return "/api/demo/v1";
  const origin = process.env.NEXT_PUBLIC_DEMO_ORIGIN ?? "http://localhost:3000";
  return `${origin}/api/demo/v1`;
}

const AUTH_API_V1 = DEMO_MODE
  ? demoApiV1()
  : `${process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:8000"}/api/v1`;

const EXAM_API_V1 = DEMO_MODE
  ? demoApiV1()
  : `${process.env.NEXT_PUBLIC_EXAM_API_URL || "http://localhost:8003"}/api/v1`;

const DIAG_API_V1 = DEMO_MODE
  ? demoApiV1()
  : `${process.env.NEXT_PUBLIC_DIAG_API_URL || "http://localhost:8002"}/api/v1`;

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  token?: string;
  noAuth?: boolean;
  /** Opaque, per-attempt capability for public student exam actions. */
  sessionToken?: string;
  /** Unpredictable diagnostic invite used only by the public student flow. */
  inviteCode?: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Get in-memory access token (NOT from localStorage — XSS safe).
 * Primary auth uses httpOnly cookies via credentials: "include".
 * This is a fallback for edge cases where cookie isn't available.
 */
function getStoredToken(): string | null {
  // Tokens are no longer persisted to localStorage.
  // httpOnly cookies handle auth via credentials: "include".
  return null;
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, token, noAuth = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Auto-inject token if not provided
  const authToken = token || (!noAuth ? getStoredToken() : null);
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${AUTH_API_V1}${endpoint}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Не удалось подключиться к сервису. Проверьте соединение и повторите попытку.");
  }

  // Handle 401: token expired
  if (response.status === 401 && !noAuth) {
    // Try refresh
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry with new token
      headers["Authorization"] = `Bearer ${refreshed}`;
      const retryResponse = await fetch(`${AUTH_API_V1}${endpoint}`, {
        method,
        headers,
        credentials: "include",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (retryResponse.ok) {
        return retryResponse.json();
      }
    }
    // Refresh failed — redirect to login
    if (typeof window !== "undefined") {
      localStorage.removeItem("algo-auth");
      window.location.href = "/login";
    }
    return undefined as any;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    let message = "Сервис временно недоступен. Повторите попытку.";
    let code: string | undefined;
    if (typeof error?.detail === "string") {
      message = error.detail;
    } else if (Array.isArray(error?.detail)) {
      message = error.detail.map((e: any) => e.msg || String(e)).join("; ");
    } else if (error?.detail && typeof error.detail === "object") {
      message = error.detail.message || message;
      code = error.detail.code;
    }
    throw new ApiError(response.status, message, code);
  }

  return response.json();
}

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    // Refresh via httpOnly cookie (sent automatically with credentials: include)
    const resp = await fetch(`${AUTH_API_V1}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    // New cookies are set by the backend response.
    // Return access_token for the immediate retry.
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Lightweight fetch wrapper for exam-service (no auth refresh cycle needed
 * since most exam endpoints are public or handled by exam-service internally).
 */
async function examApi<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, sessionToken } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionToken) {
    headers["X-Exam-Session-Token"] = sessionToken;
  }

  let response: Response;
  try {
    response = await fetch(`${EXAM_API_V1}${endpoint}`, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Не удалось подключиться к сервису. Проверьте соединение и повторите попытку.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    let message = "Сервис временно недоступен. Повторите попытку.";
    if (typeof error?.detail === "string") {
      message = error.detail;
    } else if (Array.isArray(error?.detail)) {
      message = error.detail.map((e: any) => e.msg || String(e)).join("; ");
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

async function diagServiceApi<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, inviteCode } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (inviteCode) {
    headers["X-Diagnostic-Invite-Code"] = inviteCode;
  }

  let response: Response;
  try {
    response = await fetch(`${DIAG_API_V1}${endpoint}`, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Не удалось подключиться к сервису. Проверьте соединение и повторите попытку.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    let message = "Сервис временно недоступен. Повторите попытку.";
    if (typeof error?.detail === "string") {
      message = error.detail;
    } else if (typeof error?.detail === "object" && error.detail !== null) {
      message = (error.detail as any).message || JSON.stringify(error.detail);
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

// ============================================================================
// AUTH API
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: "owner" | "admin" | "teacher" | "superadmin";
  default_org_id: string | null;
  org_role: string | null;
  org_name: string | null;
  language: string;
  is_active: boolean;
  is_verified: boolean;
  must_change_password?: boolean;
  created_at: string | null;
}

export interface OrgInfo {
  id: string;
  name: string;
  org_type: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
  org: OrgInfo | null;
}

export interface OrgApplicationPendingResponse {
  message: string;
  org_id: string;
  org_name: string;
  status: string;
  success: boolean;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export interface GroupInfo {
  id: string;
  org_id: string;
  name: string;
  class_level: number | null;
  teacher_id: string | null;
  teacher_name: string | null;
  description: string | null;
  schedule?: Array<{
    id?: string;
    dayOfWeek?: number;
    day_of_week?: number;
    startTime?: string;
    start_time?: string;
    endTime?: string;
    end_time?: string;
    room?: string;
    format?: "offline" | "online";
    subject?: string;
    color?: "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose";
    topic?: string;
  }> | null;
  status: string;
  max_students: number;
  student_count: number;
  students_count?: number;
  created_at: string | null;
}

export type Group = GroupInfo;

export interface LessonEvent {
  id: string;
  groupId: string;
  groupName: string;
  classLevel: number;
  subject: string;
  dayOfWeek: number; // 1 (Mon) .. 7 (Sun)
  startTime: string; // "14:00"
  endTime: string; // "15:30"
  room: string;
  format: "offline" | "online";
  color: "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose";
  topic?: string;
}

export interface ScheduleOccurrence extends LessonEvent {
  occurrenceDate: string;
  isRescheduled: boolean;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  originalRoom?: string | null;
  rescheduleReason?: string | null;
}

export interface StudentInGroup {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  class_level: number;
  status: string;
  display_id: string | null;   // публичный ID вида "AL15-001" (null пока не зачислен)
  student_phone: string | null;
  joined_at: string | null;
  last_theta: number | null;
  last_level: "below_grade" | "at_grade" | "above_grade" | null;
  last_diagnosed_at: string | null;
}

export interface GroupDetail extends GroupInfo {
  students: StudentInGroup[];
}

export interface ThetaDistribution {
  below_grade: number;
  at_grade: number;
  above_grade: number;
}

export interface GroupStats {
  group_id: string;
  total_students: number;
  diagnosed_count: number;
  undiagnosed_count: number;
  avg_theta: number | null;
  theta_distribution: ThetaDistribution;
  weak_skills: string[];
}

export type AttendanceStatus = "present" | "absent" | "excused" | "late";
export type LessonAttendanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface Lesson {
  id: string;
  instanceKey?: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  start_time?: string;
  startTime?: string;
  endTime?: string;
  status?: LessonAttendanceStatus;
  /** One-off transfer of this concrete date; the raw schedule remains unchanged. */
  isRescheduled?: boolean;
  /** Current resolved location/format of this concrete lesson occurrence. */
  room?: string | null;
  format?: "offline" | "online";
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  originalRoom?: string | null;
  rescheduleReason?: string | null;
}

export interface AttendanceRecord {
  student_id: string;
  status: AttendanceStatus;
}

export interface GroupAttendance {
  groupId?: string;
  month?: string | null;
  lessons: Lesson[];
  records: Record<string, Record<string, AttendanceStatus>>; // instance_key -> student_id -> status
  statuses?: Record<string, LessonAttendanceStatus>; // instance_key -> status
  cancellationReasons?: Record<string, string>; // instance_key -> teacher-provided reason
  /** Roster frozen when the concrete lesson was started. */
  rosterStudentIds?: Record<string, string[]>;
  /** Transferred-out students with attendance in the selected period. */
  historicalStudents?: Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    class_level?: number | null;
    display_id?: string | null;
    left_at?: string | null;
    transferred_to_group_name?: string | null;
  }>;
  /** Entry into the currently opened group during the selected period. */
  membershipEvents?: Array<{
    student_id: string;
    kind: "transferred";
    joined_at: string | null;
    source_group_name?: string | null;
  }>;
  /** Shown only until the current group teacher opens the initial report. */
  diagnosticReportNotices?: Array<{
    student_id: string;
    invite_id: string;
    completed_at?: string | null;
  }>;
}

export interface AttendancePeriod {
  month?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface StudentProfile {
  student: {
    id: string;
    org_id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    class_level: number;
    group_id: string | null;
    student_number?: string | null;
    display_id: string | null;
    sequence_number?: number | null;
    student_phone: string | null;
    comment: string | null;
    status: string;
    created_at: string | null;
  };
  group: {
    id: string;
    name: string;
    class_level: number;
    teacher_id: string | null;
    teacher_name: string | null;
    description?: string | null;
  } | null;
  group_history: Array<{
    group_id: string;
    group_name: string;
    class_level?: number | null;
    is_active: boolean;
    joined_at: string | null;
    left_at: string | null;
  }>;
  diagnostics: Array<{
    invite_id: string;
    code: string;
    class_level: number;
    diagnostic_type: string;
    status: string;
    created_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    result?: {
      id: string;
      theta?: number | null;
      accuracy?: number | null;
      recommended_level?: string | null;
      total_questions?: number | null;
      correct_answers?: number | null;
      duration_seconds?: number | null;
      diagnosed_at?: string | null;
      recommended_load?: string | null;
      identified_gaps?: any[];
    } | null;
  }>;
  diagnostic_results: Array<any>;
  exams?: Array<{
    id: string;
    exam_id: string;
    exam_title?: string;
    score?: number;
    max_score?: number;
    correct_count?: number;
    total_tasks?: number;
    time_spent_seconds?: number;
    status?: string;
    submitted_at?: string | null;
    started_at?: string | null;
  }>;
}

export interface StudentAttendanceSummary {
  student_id: string;
  period: { month: string; date_from: string; date_to: string };
  totals: {
    total_lessons: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    not_marked: number;
    attended: number;
    attendance_rate: number | null;
  };
  groups: Array<{
    group_id: string;
    group_name: string;
    class_level: number | null;
    teacher_name: string | null;
    total_lessons: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    not_marked: number;
    attendance_rate: number | null;
  }>;
  lessons: Array<{
    lesson_id: string | null;
    date: string;
    topic: string;
    group_id: string;
    group_name: string;
    status: AttendanceStatus | "not_marked";
    attendance_status: LessonAttendanceStatus;
  }>;
}

export const authApi = {
  apply: (data: {
    org_name: string;
    org_type?: string;
    city?: string;
    phone?: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    language?: string;
  }) =>
    api<OrgApplicationPendingResponse>("/auth/apply", {
      method: "POST",
      body: data,
      noAuth: true,
    }),

  activate: (token: string) =>
    api<AuthResponse>("/auth/activate", {
      method: "POST",
      body: { token },
      noAuth: true,
    }),

  login: (email: string, password: string) =>
    api<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      noAuth: true,
    }),

  getInviteInfo: (code: string) =>
    api<{ org_name: string; org_role: string; email: string | null }>(
      `/auth/invite/${code}`,
      { noAuth: true }
    ),

  acceptInvite: (data: {
    code: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) =>
    api<AuthResponse>("/auth/invite/accept", {
      method: "POST",
      body: data,
      noAuth: true,
    }),

  refresh: (refresh_token: string) =>
    api<{ access_token: string; refresh_token: string }>("/auth/refresh", {
      method: "POST",
      body: { refresh_token },
      noAuth: true,
    }),

  me: () => api<AuthUser>("/auth/me"),

  updateProfile: (data: {
    first_name?: string;
    last_name?: string;
    language?: string;
  }) =>
    api<AuthUser>("/auth/me", { method: "PUT", body: data }),

  changePassword: (old_password: string, new_password: string) =>
    api<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: { old_password, new_password },
    }),

  logout: () =>
    api<{ message: string }>("/auth/logout", { method: "POST" }),
};

// ============================================================================
// ORG API
// ============================================================================

export const orgApi = {
  get: () => api<OrgInfo>("/auth/org"),
  stats: () => api<Record<string, any>>("/auth/org/stats"),
  update: (data: { name?: string; city?: string; phone?: string }) =>
    api<OrgInfo>("/auth/org", { method: "PUT", body: data }),

  // Invitations
  createInvitation: (data: { email?: string; org_role: string }) =>
    api<{ code: string; org_role: string; expires_at: string }>("/auth/org/invitations", {
      method: "POST", body: data
    }),
  listInvitations: () => api<any[]>("/auth/org/invitations"),
  revokeInvitation: (id: string) =>
    api<{ message: string }>(`/auth/org/invitations/${id}`, { method: "DELETE" }),

  // Members
  listMembers: () => api<any[]>("/auth/org/members"),
  updateMemberRole: (memberId: string, role: string) =>
    api<any>(`/auth/org/members/${memberId}/role?role=${role}`, { method: "PUT" }),
  removeMember: (memberId: string) =>
    api<{ message: string }>(`/auth/org/members/${memberId}`, { method: "DELETE" }),

  // Students
  createStudent: (data: { first_name: string; last_name: string; class_level: number; student_phone: string; comment?: string }) =>
    api<any>("/auth/org/students", { method: "POST", body: data }),
  listStudents: (params?: { class_level?: number; group_id?: string; teacher_id?: string; has_group?: boolean; status?: string; exclude_status?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.class_level) query.set("class_level", String(params.class_level));
    if (params?.group_id) query.set("group_id", params.group_id);
    if (params?.teacher_id) query.set("teacher_id", params.teacher_id);
    if (params?.has_group !== undefined) query.set("has_group", String(params.has_group));
    if (params?.status) query.set("status", params.status);
    if (params?.exclude_status) query.set("exclude_status", params.exclude_status);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return api<any[]>(`/auth/org/students${qs ? `?${qs}` : ""}`);
  },
  getStudent: (id: string) => api<any>(`/auth/org/students/${id}`),
  getStudentProfile: (id: string) => api<StudentProfile>(`/auth/org/students/${id}/profile`),
  getStudentAttendanceSummary: (id: string, month?: string) =>
    api<StudentAttendanceSummary>(
      `/auth/org/students/${id}/attendance${month ? `?month=${encodeURIComponent(month)}` : ""}`
    ),
  updateStudent: (id: string, data: any) =>
    api<any>(`/auth/org/students/${id}`, { method: "PUT", body: data }),

  // Diagnostics
  createDiagnostic: (data: { student_id: string; class_level: number; diagnostic_type?: string }) =>
    api<any>("/auth/org/diagnostics", { method: "POST", body: data }),
  createQuickDiagnostic: (data: { first_name: string; last_name: string; class_level: number }) =>
    api<any>("/auth/org/diagnostics/quick", { method: "POST", body: data }),
  listDiagnostics: async (status?: string) => {
    const pageSize = 100;
    const allItems: any[] = [];
    let offset = 0;

    while (true) {
      const query = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        include_meta: "true",
      });
      if (status) query.set("status", status);

      const response = await api<
        { items: any[]; total: number; limit: number; offset: number } | any[]
      >(`/auth/org/diagnostics?${query.toString()}`);

      // During a rolling update the auth-service can briefly still expose
      // the former array response. Do not break the admin queue in that case.
      if (Array.isArray(response)) return response;

      const pageItems = Array.isArray(response.items) ? response.items : [];
      allItems.push(...pageItems);
      offset += pageItems.length;

      if (offset >= response.total || pageItems.length === 0) return allItems;
    }
  },
  getDiagnostic: (id: string) => api<any>(`/auth/org/diagnostics/${id}`),
  acknowledgeDiagnosticReport: (id: string) =>
    api<{ acknowledged: boolean }>(`/auth/org/diagnostics/${id}/acknowledge-report`, { method: "POST" }),

  // Groups
  createGroup: (data: { name: string; class_level?: number; teacher_id?: string; description?: string; max_students?: number }) =>
    api<GroupInfo>("/auth/org/groups", { method: "POST", body: data }),
  listGroups: (params?: { teacher_id?: string; class_level?: number }) => {
    const query = new URLSearchParams();
    if (params?.teacher_id) query.set("teacher_id", params.teacher_id);
    if (params?.class_level) query.set("class_level", String(params.class_level));
    const qs = query.toString();
    return api<GroupInfo[]>(`/auth/org/groups${qs ? `?${qs}` : ""}`);
  },
  getGroup: (id: string) => api<GroupDetail>(`/auth/org/groups/${id}`),
  getGroupStats: (id: string) => api<GroupStats>(`/auth/org/groups/${id}/stats`),
  updateGroup: (id: string, data: Partial<{ name: string; class_level: number | null; teacher_id: string | null; description: string; max_students: number; status: string }>) =>
    api<GroupInfo>(`/auth/org/groups/${id}`, { method: "PUT", body: data }),
  archiveGroup: (id: string) =>
    // No dedicated /archive route — the PUT endpoint already accepts status.
    api<GroupInfo>(`/auth/org/groups/${id}`, { method: "PUT", body: { status: "archived" } }),
  unarchiveGroup: (id: string) =>
    api<GroupInfo>(`/auth/org/groups/${id}`, { method: "PUT", body: { status: "active" } }),
  addStudentToGroup: (groupId: string, studentId: string) =>
    api<{
      student_id: string;
      group_id: string;
      status: "added" | "unchanged";
      reason?: "already_in_target_group";
      display_id?: string | null;
    }>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "POST" }),
  removeStudentFromGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "DELETE" }),
  bulkAddStudents: (groupId: string, studentIds: string[]) =>
    api<{ group_id: string; added: number; skipped: number }>(
      `/auth/org/groups/${groupId}/students/bulk`,
      { method: "POST", body: { student_ids: studentIds } }
    ),

  // ── Schedule ──────────────────────────────────────────────────────────
  getSchedule: (teacherId?: string) =>
    api<LessonEvent[]>(`/auth/org/schedule${teacherId ? `?teacher_id=${teacherId}` : ""}`),
  getScheduleOccurrences: (period: { dateFrom: string; dateTo: string }, teacherId?: string) => {
    const query = new URLSearchParams({ date_from: period.dateFrom, date_to: period.dateTo });
    if (teacherId) query.set("teacher_id", teacherId);
    return api<ScheduleOccurrence[]>(`/auth/org/schedule/occurrences?${query.toString()}`);
  },
  createLesson: (data: Omit<LessonEvent, "id" | "groupName" | "classLevel">) =>
    api<LessonEvent>(`/auth/org/schedule/lessons`, { method: "POST", body: data }),
  updateLesson: (lessonId: string, data: Partial<LessonEvent>) =>
    api<LessonEvent>(`/auth/org/schedule/lessons/${lessonId}`, { method: "PUT", body: data }),
  rescheduleLessonOccurrence: (
    lessonId: string,
    data: {
      lessonDate: string;
      startTime?: string;
      endTime?: string;
      room?: string;
      format?: "offline" | "online";
      topic?: string;
      reason: string;
    },
  ) => api<ScheduleOccurrence>(`/auth/org/schedule/lessons/${lessonId}/reschedule`, { method: "POST", body: data }),
  reviseRecurringLesson: (
    lessonId: string,
    data: Partial<LessonEvent> & { effectiveFrom: string; reason: string },
  ) => api<LessonEvent>(`/auth/org/schedule/lessons/${lessonId}/recurrence`, { method: "PUT", body: data }),
  deleteLesson: (lessonId: string) =>
    api<{ ok: boolean }>(`/auth/org/schedule/lessons/${lessonId}`, { method: "DELETE" }),

  // ── Attendance ────────────────────────────────────────────────────────
  getGroupAttendance: (groupId: string, period?: string | AttendancePeriod) => {
    const params = new URLSearchParams();
    if (typeof period === "string") {
      params.set("month", period);
    } else if (period?.dateFrom && period?.dateTo) {
      params.set("date_from", period.dateFrom);
      params.set("date_to", period.dateTo);
    } else if (period?.month) {
      params.set("month", period.month);
    }
    const query = params.toString();
    return api<GroupAttendance>(`/auth/org/groups/${groupId}/attendance${query ? `?${query}` : ""}`);
  },
  saveGroupAttendance: (
    groupId: string,
    data: {
      lessonDate: string;
      lessonId: string;
      topic?: string;
      status?: Exclude<LessonAttendanceStatus, "scheduled">;
      records: Record<string, AttendanceStatus>;
      correctionReason?: string;
      cancellationReason?: string;
    }
  ) =>
    api<{ ok: boolean; saved: boolean }>(`/auth/org/groups/${groupId}/attendance`, { method: "POST", body: data }),

  startGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; topic?: string },
  ) =>
    api<{ ok: boolean; started: boolean }>(`/auth/org/groups/${groupId}/attendance/start`, { method: "POST", body: data }),

  // ── Bulk import (xlsx) ────────────────────────────────────────────────
  downloadImportTemplate: async (): Promise<Blob> => {
    const res = await fetch(`${AUTH_API_V1}/auth/org/import/template`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(res.status, "Не удалось скачать шаблон");
    return res.blob();
  },
  importPreview: (file: File) => uploadImport<ImportPreviewResult>("/auth/org/import/preview", file),
  importCommit: (file: File) => uploadImport<ImportCommitResult>("/auth/org/import/commit", file),
};

// ── Import types + multipart helper ─────────────────────────────────────────
export interface ImportIssue {
  sheet: string;
  row: number;
  field?: string | null;
  level: "error" | "warning";
  message: string;
}

export interface ImportCounts {
  teachers_new: number;
  teachers_existing: number;
  groups_new: number;
  groups_existing: number;
  students_new: number;
  students_existing: number;
}

export interface ImportPreviewResult {
  ok: boolean;
  counts: ImportCounts;
  issues: ImportIssue[];
  teachers_preview: Array<{ name: string; email: string; role: string; action: string }>;
  groups_preview: Array<{ name: string; class_level: number | null; teacher_email: string; action: string }>;
  students_preview: Array<{ name: string; class_level: number; phone: string | null; group: string; action: string }>;
}

export interface TeacherCredential {
  full_name: string;
  email: string;
  role: string;
  temp_password: string;
}

export interface ImportCommitResult {
  ok: boolean;
  counts: ImportCounts;
  issues: ImportIssue[];
  credentials: TeacherCredential[];
}

async function uploadImport<T>(endpoint: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  // No Content-Type header — the browser sets the multipart boundary itself.
  const res = await fetch(`${AUTH_API_V1}${endpoint}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: form,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    throw new ApiError(res.status, data?.detail || "Ошибка импорта");
  }
  return data as T;
}

// ============================================================================
// DIAGNOSTIC INVITE API (public - no auth)
// ============================================================================

export const diagnosticInviteApi = {
  getInfo: (code: string) =>
    api<any>(`/auth/diagnostic/${code}`, { noAuth: true }),
  confirm: (code: string) =>
    api<any>(`/auth/diagnostic/${code}/confirm`, {
      method: "POST",
      noAuth: true,
    }),
};

// ============================================================================
// ANALYTICS API
// ============================================================================

const diagApi = diagServiceApi;

export const analyticsApi = {
  // Student progress — diagnostic-service (DIAG_API_V1)
  studentSkillMap: (studentId: string) =>
    diagApi<any>(`/analytics/students/${studentId}/skill-map`),
  studentTimeline: (studentId: string) =>
    diagApi<any>(`/analytics/students/${studentId}/timeline`),
  studentReport: (studentId: string, sessionId?: string | null) => {
    const query = new URLSearchParams({ _t: String(Date.now()) });
    if (sessionId) query.set("session_id", sessionId);
    return diagApi<any>(`/analytics/students/${studentId}/report?${query.toString()}`);
  },

  // Group analytics — передаём student_ids списком
  groupOverview: (studentIds: string[]) =>
    diagApi<any>(`/analytics/groups/overview?${studentIds.map(id => `student_ids=${id}`).join("&")}`),
  groupHeatmap: (studentIds: string[]) =>
    diagApi<any>(`/analytics/groups/heatmap?${studentIds.map(id => `student_ids=${id}`).join("&")}`),

  // Org analytics
  orgLiveQueue: (hours?: number) =>
    diagApi<any>(`/analytics/org/live-queue${hours ? `?hours=${hours}` : ""}`),
  orgStats: () => diagApi<any>("/analytics/org/stats"),
  orgOverview: () => diagApi<any>("/analytics/org/overview"),
  orgEnrollment: (days?: number) =>
    diagApi<any>(`/analytics/org/enrollment${days ? `?days=${days}` : ""}`),
  orgProblemSkills: () => diagApi<any>("/analytics/org/problem-skills"),
};

// ============================================================================
// DIAGNOSTIC SERVICE API  — calls diagnostic-service directly (NEXT_PUBLIC_DIAG_API_URL)
// ============================================================================

export interface DiagTaskOut {
  task_id: string;
  skill_id: string;
  topic_id: string;
  question_text: string;
  question_latex: string | null;
  question_image_url: string | null;
  answer_type: string;
  answer_options: string[] | null;
  answer_options_latex?: string[] | null;
  hints: string[] | null;
  phase: string;
  items_answered: number;
  items_max: number;
  is_deep_scan: boolean;
}

export interface DiagAnswerResult {
  is_correct: boolean;
  outcome: number;
  eval_category: string;
  theta: number;
  se: number;
  next_task: DiagTaskOut | null;
  session_completed: boolean;
}

export interface DiagReport {
  session_id: string;
  student_id: string;
  grade_level: number;
  overall_theta: number;
  overall_level: string;
  confidence_interval: [number, number];
  topic_breakdown: Record<string, any>;
  weak_skills: string[];
  recommended_start: string | null;
  items_total: number;
  has_full_report?: boolean;
  report_json?: Record<string, any>;
  report_generation?: {
    status: "pending" | "generating" | "ready" | "failed" | string;
    stage?: string | null;
    attempts?: number;
    is_current_schema?: boolean;
  };
}

export const diagnosticApi = {
  createSession: (data: {
    student_id: string;
    grade_level: number;
    invite_code?: string;
    prior_theta?: number;
  }) =>
    diagServiceApi<{ session_id: string; first_task: DiagTaskOut }>(
      "/diagnostic/sessions",
      { method: "POST", body: data },
    ),

  submitAnswer: (
    sessionId: string,
    data: { task_id: string; student_answer: string; time_ms?: number },
    inviteCode: string,
  ) =>
    diagServiceApi<DiagAnswerResult>(
      `/diagnostic/sessions/${sessionId}/answer`,
      { method: "POST", body: data, inviteCode },
    ),

  getReport: (sessionId: string, inviteCode: string) =>
    diagServiceApi<DiagReport>(
      `/diagnostic/sessions/${sessionId}/report?invite_code=${encodeURIComponent(inviteCode)}`,
    ),

  /** Check if an unfinished session exists for this invite code.
   *  Returns null (via 404) when no active session found.
   */
  getActiveSession: (inviteCode: string) =>
    diagServiceApi<{
      session_id: string;
      items_answered: number;
      current_task: DiagTaskOut;
      total_time_ms?: number;
    }>(`/diagnostic/sessions/active?invite_code=${encodeURIComponent(inviteCode)}`),
};

// ============================================================================
// CAT API (Shadow CAT Engine — monolith, kept for backward compat)
// ============================================================================
// EXAMS API  — calls exam-service directly (NEXT_PUBLIC_EXAM_API_URL)
// ============================================================================

export interface ExamSummary {
  exam_id: string;
  title: string;
  status: string;
  access_code: string | null;
  tasks_per_variant: number;
  tasks_count?: number;
  variants_count: number;
  total_time_minutes?: number;
  sessions_count?: number;
  total_sessions?: number;
  group_id?: string | null;
  group_name?: string | null;
  class_level?: number | null;
  teacher_name?: string | null;
  scheduled_lesson_id?: string | null;
  scheduled_lesson_date?: string | null;
  is_pinned?: boolean;
  source_exam_id?: string | null;
  skills_covered?: string[];
  recent_events?: Array<{
    type: string;
    at: string;
    lesson_id?: string | null;
    lesson_date?: string | null;
    previous_lesson_id?: string | null;
    previous_lesson_date?: string | null;
    group_id?: string | null;
    group_name?: string | null;
    reason?: string | null;
    details?: Record<string, unknown>;
  }>;
  created_at: string;
}

export type AdminExamMonitorState = "all" | "active" | "lobby" | "closed" | "changes";

export interface AdminExamMonitorResponse {
  items: ExamSummary[];
  total: number;
  limit: number;
  offset: number;
  period_from?: string | null;
  period_to?: string | null;
  counts: Record<AdminExamMonitorState, number>;
}

export interface AdminExamView extends ExamSummary {
  answer_key_available: boolean;
  lifecycle_events: NonNullable<ExamSummary["recent_events"]>;
  variants: Array<{
    variant_id: string;
    variant_number: number;
    total_points: number;
    tasks: Array<{
      task_id: string;
      skill_id: string;
      skill_name: string;
      difficulty: string;
      question_text: string;
      question_latex?: string | null;
      question_image_url?: string | null;
      answer_type: string;
      answer_options?: string[] | null;
      correct_answer?: string | null;
      correct_answer_latex?: string | null;
      distractor_meta?: Array<{
        value: string;
        value_latex?: string | null;
        error_type?: string;
        explanation?: string | null;
        error_logic?: string | null;
        error_logic_latex?: string | null;
      }> | null;
    }>;
  }>;
}

/** Operational snapshot for active or recently completed live exams. */
export interface LiveExamDashboardSummary {
  exam_id: string;
  title: string;
  status: "lobby" | "active" | "closed";
  group_id?: string | null;
  group_name?: string | null;
  scheduled_lesson_id?: string | null;
  scheduled_lesson_date?: string | null;
  total_time_seconds: number;
  time_remaining_seconds: number;
  connected_count: number;
  solving_count: number;
  submitted_count: number;
  started_at?: string | null;
}

export interface PublishExamResult {
  exam_id: string;
  title: string;
  status: string;
  access_code: string;
  tasks_per_variant: number;
  variants_count: number;
  group_id?: string | null;
  group_name?: string | null;
  class_level?: number | null;
  created_at: string;
  url: string;
}

export const examsApi = {
  // ── Teacher: create / manage ─────────────────────────────────────────────

  generate: (data: {
    title: string;
    textbook_id?: string;
    skill_ids?: string[];
    paragraph_ids?: (string | number)[];
    group_id?: string;
    group_name?: string;
    class_level?: number;
    tasks_count?: number;
    difficulty_distribution?: Record<string, number>;
    time_minutes?: number;
    variants_count?: number;
    generate_variants?: boolean;
    shuffle_tasks?: boolean;
    shuffle_options?: boolean;
    mc_mode?: string;
    teacher_name?: string;
  }) =>
    examApi<{ exam_id: string; access_code?: string; status: string; tasks_count: number; variants_count: number; group_id?: string; group_name?: string; class_level?: number; skills_covered: string[] }>(
      "/exams/generate",
      { method: "POST", body: data },
    ),

  /** List all exams (teacher view, with optional filters) */
  list: (opts?: { groupId?: string; unassigned?: boolean; status?: string; includeArchived?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.groupId) params.set("group_id", opts.groupId);
    if (opts?.unassigned) params.set("unassigned", "true");
    if (opts?.status) params.set("status", opts.status);
    if (opts?.includeArchived) params.set("include_archived", "true");
    const qs = params.toString();
    return examApi<ExamSummary[]>(qs ? `/exams?${qs}` : "/exams");
  },

  /**
   * Full organisation catalog for the admin console. The teacher library
   * intentionally stays limited and scoped; admin KPIs must not silently
   * omit older exams.
   */
  listAllForAdmin: async () => {
    const pageSize = 100;
    const allItems: ExamSummary[] = [];
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        include_meta: "true",
      });
      const response = await examApi<
        { items: ExamSummary[]; total: number; limit: number; offset: number } | ExamSummary[]
      >(`/exams?${params.toString()}`);

      // Tolerate a short rolling-deployment window while a previous service
      // version still exposes the original array response.
      if (Array.isArray(response)) return response;

      const pageItems = Array.isArray(response.items) ? response.items : [];
      allItems.push(...pageItems);
      offset += pageItems.length;
      if (offset >= response.total || pageItems.length === 0) return allItems;
    }
  },

  /** Authoritative, paginated history for the organisation admin monitor. */
  getAdminMonitor: (opts: {
    state: AdminExamMonitorState;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams({
      state: opts.state,
      limit: String(opts.limit ?? 50),
      offset: String(opts.offset ?? 0),
    });
    if (opts.dateFrom) params.set("date_from", opts.dateFrom);
    if (opts.dateTo) params.set("date_to", opts.dateTo);
    return examApi<AdminExamMonitorResponse>(`/admin/exams/monitor?${params.toString()}`);
  },

  /** Teacher-profile visual data for an administrator, without any controls or access code. */
  getAdminView: (examId: string) => examApi<AdminExamView>(`/admin/exams/${examId}/view`),

  /** Read-only exam metadata. Safe for the admin monitoring surface. */
  getSummary: (examId: string) => examApi<ExamSummary>(`/exams/${examId}`),

  /** Compact server-authoritative state for Dashboard live exam cards. */
  getLiveDashboardSummary: () =>
    examApi<LiveExamDashboardSummary[]>("/exams/live-summary"),

  /** Full draft with tasks & correct answers (teacher only) */
  getDraft: (examId: string) =>
    examApi<{
      exam_id: string;
      title: string;
      status: string;
      access_code?: string | null;
      total_time_minutes: number;
      variants_count: number;
      tasks_per_variant: number;
      group_id?: string | null;
      group_name?: string | null;
      class_level?: number | null;
      scheduled_lesson_id?: string | null;
      scheduled_lesson_date?: string | null;
      settings: Record<string, any>;
      skills_covered: string[];
      created_at: string;
      variants: Array<{
        variant_id: string;
        variant_number: number;
        total_points: number;
        tasks: Array<{
          task_id: string;
          skill_id: string;
          skill_name: string;
          difficulty: string;
          question_text: string;
          question_latex: string | null;
          question_image_url: string | null;
          answer_type: string;
          correct_answer: string;
          correct_answer_latex?: string | null;
          answer_options: string[] | null;
          distractor_meta: Array<{
            value: string;
            value_latex?: string | null;
            error_type: string;
            explanation?: string | null;
            error_logic?: string | null;
            error_logic_latex?: string | null;
            plausibility: number;
          }> | null;
          is_template_generated: boolean;
        }>;
      }>;
    }>(`/exams/${examId}/draft`),

  /** Get alternative tasks for replacing one task in a draft variant */
  getAlternatives: (examId: string, variantNumber: number, taskId: string) =>
    examApi<Array<{
      task_id: string;
      question_text: string;
      question_latex: string | null;
      difficulty: string;
      correct_answer: string;
      answer_type: string;
    }>>(`/exams/${examId}/draft/alternatives?variant_number=${variantNumber}&task_id=${taskId}`),

  /** Replace a task in a draft variant */
  replaceTask: (examId: string, data: { variant_number: number; task_id: string; old_task_id?: string; new_task_id?: string }) =>
    examApi<{ status: string; new_task: any }>(`/exams/${examId}/draft/replace-task`, {
      method: "POST",
      body: data,
    }),

  /** Schedule a draft for one concrete lesson and open its lobby. */
  publish: (examId: string, data: { lesson_id: string; lesson_date: string; teacher_name?: string; subject?: string; group_id?: string; group_name?: string; class_level?: number }) =>
    examApi<PublishExamResult>(`/exams/${examId}/publish`, {
      method: "POST",
      body: data,
    }),

  /** Close an active exam */
  close: (examId: string) =>
    examApi<{ exam_id: string; status: string }>(`/exams/${examId}/close`, { method: "POST" }),

  /** Get sessions list for an exam (teacher) */
  getSessions: (examId: string) => examApi<any[]>(`/exams/${examId}/sessions`),

  /** Get analytics for an exam (teacher) */
  getAnalytics: (examId: string) => examApi<any>(`/exams/${examId}/analytics`),

  /** Get cached narrative report for an exam (teacher) */
  getReport: (examId: string) => examApi<any>(`/exams/${examId}/report`),

  /** Generate on-demand LLM narrative report for an exam (teacher) */
  generateReport: (examId: string, force = true) =>
    examApi<any>(`/exams/${examId}/report?force=${force}`, { method: "POST" }),

  /** Toggle is_pinned (Library favourite) */
  pin: (examId: string) =>
    examApi<{ exam_id: string; is_pinned: boolean }>(`/exams/${examId}/pin`, { method: "POST" }),

  /** Clone a template, optionally binding it to a new group */
  clone: (examId: string, data?: { title?: string; group_id?: string; group_name?: string; class_level?: number }) =>
    examApi<{ exam_id: string; title: string; status: string; source_exam_id: string; group_id?: string | null; group_name?: string | null }>(
      `/exams/${examId}/clone`,
      { method: "POST", body: data ?? {} },
    ),

  /** Assign a draft to a group; publishing additionally requires one lesson occurrence. */
  assign: (examId: string, data: { group_id: string; group_name?: string; class_level?: number; teacher_name?: string; subject?: string; publish?: boolean; lesson_id?: string; lesson_date?: string }) =>
    examApi<{ exam_id: string; status: string; group_id: string; group_name?: string | null; access_code?: string | null; scheduled_lesson_id?: string | null; scheduled_lesson_date?: string | null; url?: string | null }>(
      `/exams/${examId}/assign`,
      { method: "POST", body: data },
    ),

  /** Delete an exam (soft archive by default, or permanent) */
  delete: (examId: string, permanent: boolean = false) =>
    examApi<{ ok: boolean; action: string; id: string }>(`/exams/${examId}?permanent=${permanent}`, { method: "DELETE" }),

  /** Restore an archived exam */
  restore: (examId: string) =>
    examApi<{ ok: boolean; action: string; id: string; status: string }>(`/exams/${examId}/restore`, { method: "POST" }),

  // ── Student: public (no auth) ────────────────────────────────────────────

  /** Exam info by access code — shown on lobby screen */
  getByCode: (code: string) =>
    examApi<{
      exam_id: string;
      title: string;
      subject: string;
      teacher_name: string | null;
      group_id?: string | null;
      group_name?: string | null;
      class_level?: number | null;
      total_time_minutes: number;
      tasks_per_variant: number;
      variants_count: number;
      status: string;
      time_remaining_seconds?: number | null;
      started_at?: string | null;
    }>(`/exams/by-code/${code}`),

  /** Fast student roster check before starting exam */
  checkStudent: (
    code: string,
    params: string | { identifier?: string; student_id?: string; student_name?: string }
  ) => {
    const body = typeof params === "string" ? { identifier: params } : params;
    return examApi<{
      enrolled: boolean;
      group_required: boolean;
      group_name?: string | null;
      student?: {
        id?: string;
        first_name?: string;
        last_name?: string;
        full_name?: string;
        display_id?: string;
        class_level?: number;
      } | null;
      already_submitted?: boolean;
      session_id?: string | null;
      message?: string | null;
    }>(`/exams/by-code/${code}/check-student`, {
      method: "POST",
      body,
    });
  },

  /** Start exam session or enter waiting lobby */
  startSession: (
    code: string,
    data: { student_name: string; class_level?: number; student_id?: string; display_id?: string }
  ) =>
    examApi<{
      session_id: string;
      variant_number: number;
      time_minutes: number;
      time_remaining_seconds?: number | null;
      status: "waiting" | "in_progress" | "submitted";
      session_token?: string;
      already_submitted?: boolean;
      saved_answers?: Record<string, string>;
      message?: string | null;
      tasks: Array<{
        task_id: string;
        text: string;
        question_latex?: string | null;
        options: string[];
        options_latex?: string[] | null;
        image_url?: string;
        difficulty: string;
        skill_name: string;
        answer_type?: string;
      }>;
    }>(`/exams/by-code/${code}/start`, { method: "POST", body: data }),

  /** Auto-save student progress in real-time */
  saveProgress: (
    sessionId: string,
    data: { answers: Record<string, string>; time_spent_seconds?: number },
    sessionToken: string,
  ) =>
    examApi<{ ok: boolean; answered_count: number }>(`/exam-sessions/${sessionId}/progress`, {
      method: "POST",
      body: data,
      sessionToken,
    }),

  /** Poll session status for students waiting in lobby */
  getSessionStatus: (code: string, sessionId: string, sessionToken: string) =>
    examApi<{
      status: "waiting" | "in_progress" | "kicked" | "closed" | "submitted";
      exam_status?: string;
      variant_number?: number;
      time_minutes?: number;
      time_remaining_seconds?: number | null;
      saved_answers?: Record<string, string>;
      already_submitted?: boolean;
      message?: string;
      tasks?: Array<{
        task_id: string;
        text: string;
        question_latex?: string | null;
        options: string[];
        options_latex?: string[] | null;
        image_url?: string;
        difficulty: string;
        skill_name: string;
        answer_type?: string;
      }>;
    }>(`/exams/by-code/${code}/session-status/${sessionId}`, { sessionToken }),

  /** Teacher: bind a concrete lesson and open the lobby. */
  openLobby: (examId: string, data: { lesson_id: string; lesson_date: string }) =>
    examApi<{ status: string; access_code: string; url: string }>(`/exams/${examId}/open-lobby`, {
      method: "POST",
      body: data,
    }),

  /** Linked exam state used before a teacher cancels a lesson. */
  getLessonBinding: (data: { groupId: string; lessonId: string; lessonDate: string }) => {
    const params = new URLSearchParams({
      group_id: data.groupId,
      lesson_id: data.lessonId,
      lesson_date: data.lessonDate,
    });
    return examApi<{
      attached: boolean;
      can_cancel: boolean;
      exam: { id: string; title: string; status: string } | null;
      message: string | null;
    }>(`/exams/lesson-binding?${params.toString()}`);
  },

  /** Teacher: Synchronously start exam from lobby */
  startLive: (examId: string) =>
    examApi<{ status: string; started_count: number }>(`/exams/${examId}/start-live`, {
      method: "POST",
    }),

  /** Teacher: Get live lobby status and connected students */
  getLobbyStatus: (examId: string) =>
    examApi<{
      exam_id: string;
      title: string;
      access_code: string;
      status: string;
      group_id?: string | null;
      group_name?: string | null;
      total_time_minutes: number;
      total_time_seconds?: number;
      time_remaining_seconds?: number;
      time_elapsed_seconds?: number;
      tasks_per_variant: number;
      connected_count: number;
      students: Array<{
        session_id: string;
        student_id?: string | null;
        display_id?: string | null;
        student_name: string;
        status: "waiting" | "in_progress" | "submitted";
        variant_number: number;
        answered_count: number;
        total_tasks: number;
        score: number;
        max_score: number;
        started_at?: string | null;
        submitted_at?: string | null;
      }>;
    }>(`/exams/${examId}/lobby-status`),

  /** Teacher: Kick / remove student from lobby */
  kickStudent: (examId: string, sessionId: string) =>
    examApi<{ ok: boolean; kicked_session_id: string }>(`/exams/${examId}/sessions/${sessionId}`, {
      method: "DELETE",
    }),

  /** Submit answers — called with session_id, not code */
  submit: (
    sessionId: string,
    data: { answers: Record<string, string>; time_spent_seconds: number },
    sessionToken: string,
  ) =>
    examApi<{
      session_id: string;
      score: number;
      max_score: number;
      correct_count: number;
      answered_count: number;
      total_tasks: number;
      percentage: number;
    }>(`/exam-sessions/${sessionId}/submit`, { method: "POST", body: data, sessionToken }),

  /** Detailed session results (shown after submission) */
  getResult: (sessionId: string, sessionToken: string) =>
    examApi<{
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
      tasks: Array<{
        task_id: string;
        text: string;
        question_latex?: string | null;
        options: string[];
        student_answer: string | null;
        correct_answer: string;
        correct_answer_latex?: string | null;
        is_correct: boolean;
        skill_name: string;
      }>;
    }>(`/exam-sessions/${sessionId}/results`, { sessionToken }),
};

// ============================================================================
// TEXTBOOK & CURRICULUM API
// ============================================================================

export interface TextbookBrief {
  textbook_id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  class_level: number;
  publisher?: string;
  cover_image_url?: string;
  digitization_status: string;
  digitization_progress: number;
  tasks_extracted: number;
}

export interface TOCNode {
  id: number;
  parent_id: number | null;
  node_type: string;
  display_number?: string;
  display_name: string;
  full_title?: string;
  page_start?: number;
  page_end?: number;
  sort_order: number;
  mapped_skill_id?: string;
  mapped_topic_id?: string;
  mapping_confidence?: number;
  tasks_count: number;
  children: TOCNode[];
}

export interface SkillTreeNode {
  id: string;
  level: string;
  name: string;
  name_ru: string;
  parent_id?: string;
  class_level_start?: number;
  class_level_end?: number;
  importance: number;
  children: SkillTreeNode[];
  tasks_count: number;
}

export interface TextbookTask {
  task_id: string;
  structure_id?: number;
  exercise_number?: string;
  skill_id: string;
  difficulty: string;
  question_text: string;
  question_latex?: string;
  answer_type: string;
  has_template: boolean;
}

export const textbookApi = {
  /** Список учебников с фильтрацией */
  list: (params?: { class_level?: number; country?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.class_level) query.set("class_level", String(params.class_level));
    if (params?.country) query.set("country", params.country);
    if (params?.status) query.set("status", params.status);
    const qs = query.toString();
    return examApi<TextbookBrief[]>(
      `/textbooks${qs ? `?${qs}` : ""}`
    ).then((d) => (Array.isArray(d) ? d : []));
  },

  /** Оглавление учебника (дерево) */
  toc: (textbookId: string) =>
    examApi<TOCNode[]>(`/textbooks/${textbookId}/toc/tree`),

  /** Задачи из учебника */
  tasks: (
    textbookId: string,
    params?: { structure_id?: number; skill_id?: string; difficulty?: string; limit?: number; offset?: number }
  ) => {
    const query = new URLSearchParams();
    if (params?.structure_id) query.set("structure_id", String(params.structure_id));
    if (params?.skill_id) query.set("skill_id", params.skill_id);
    if (params?.difficulty) query.set("difficulty", params.difficulty);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return examApi<TextbookTask[]>(`/textbooks/${textbookId}/tasks${qs ? `?${qs}` : ""}`);
  },

  /** Дерево навыков (для режима "По программе") */
  skillTree: (classLevel?: number) => {
    const qs = classLevel ? `?class_level=${classLevel}` : "";
    return examApi<SkillTreeNode[]>(`/textbooks/skills/tree${qs}`);
  },
};

export { api, ApiError };
