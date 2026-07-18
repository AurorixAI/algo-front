const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function demoApiV1(): string {
  if (typeof window !== "undefined") return "/api/demo/v1";
  const origin = process.env.NEXT_PUBLIC_DEMO_ORIGIN ?? "http://localhost:3000";
  return `${origin}/api/demo/v1`;
}

const AUTH_API_V1 = DEMO_MODE
  ? demoApiV1()
  : `${process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:8000"}/api/v1`;

const EXAM_API_V1 = DEMO_MODE
  ? demoApiV1()
  : `${process.env.NEXT_PUBLIC_EXAM_API_URL ?? "http://localhost:8003"}/api/v1`;

const DIAG_API_V1 = DEMO_MODE
  ? demoApiV1()
  : `${process.env.NEXT_PUBLIC_DIAG_API_URL ?? "http://localhost:8002"}/api/v1`;

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  token?: string;
  noAuth?: boolean;
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

  const response = await fetch(`${AUTH_API_V1}${endpoint}`, {
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });

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
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    let message = "Request failed";
    let code: string | undefined;
    if (typeof error.detail === "string") {
      message = error.detail;
    } else if (Array.isArray(error.detail)) {
      message = error.detail.map((e: any) => e.msg || String(e)).join("; ");
    } else if (error.detail && typeof error.detail === "object") {
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
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const response = await fetch(`${EXAM_API_V1}${endpoint}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    let message = "Request failed";
    if (typeof error.detail === "string") {
      message = error.detail;
    } else if (Array.isArray(error.detail)) {
      message = error.detail.map((e: any) => e.msg || String(e)).join("; ");
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

async function diagServiceApi<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const response = await fetch(`${DIAG_API_V1}${endpoint}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    let message = "Request failed";
    if (typeof error.detail === "string") {
      message = error.detail;
    } else if (typeof error.detail === "object" && error.detail !== null) {
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
  status: string;
  max_students: number;
  student_count: number;
  created_at: string | null;
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

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  start_time?: string;
}

export interface AttendanceRecord {
  student_id: string;
  status: AttendanceStatus;
}

export interface GroupAttendance {
  lessons: Lesson[];
  records: Record<string, Record<string, AttendanceStatus>>; // lesson_id -> student_id -> status
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
  listStudents: (params?: { class_level?: number; group_id?: string; teacher_id?: string; status?: string; exclude_status?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.class_level) query.set("class_level", String(params.class_level));
    if (params?.group_id) query.set("group_id", params.group_id);
    if (params?.teacher_id) query.set("teacher_id", params.teacher_id);
    if (params?.status) query.set("status", params.status);
    if (params?.exclude_status) query.set("exclude_status", params.exclude_status);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return api<any[]>(`/auth/org/students${qs ? `?${qs}` : ""}`);
  },
  getStudent: (id: string) => api<any>(`/auth/org/students/${id}`),
  updateStudent: (id: string, data: any) =>
    api<any>(`/auth/org/students/${id}`, { method: "PUT", body: data }),

  // Diagnostics
  createDiagnostic: (data: { student_id: string; class_level: number; diagnostic_type?: string }) =>
    api<any>("/auth/org/diagnostics", { method: "POST", body: data }),
  createQuickDiagnostic: (data: { first_name: string; last_name: string; class_level: number }) =>
    api<any>("/auth/org/diagnostics/quick", { method: "POST", body: data }),
  listDiagnostics: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return api<any[]>(`/auth/org/diagnostics${qs}`);
  },

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
  addStudentToGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "POST" }),
  removeStudentFromGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "DELETE" }),
  bulkAddStudents: (groupId: string, studentIds: string[]) =>
    api<{ group_id: string; added: number; skipped: number }>(
      `/auth/org/groups/${groupId}/students/bulk`,
      { method: "POST", body: { student_ids: studentIds } }
    ),

  // Attendance (MOCK for now)
  getGroupAttendance: async (groupId: string, month: string): Promise<GroupAttendance> => {
    // Return mock data for demonstration
    const d = new Date(month + "-01");
    const year = d.getFullYear();
    const m = d.getMonth();
    const lessons: Lesson[] = [];
    // Generate lessons for the month (Mon/Fri pattern as requested)
    for (let day = 1; day <= 28; day++) {
      const date = new Date(year, m, day);
      if (date.getDay() === 1 || date.getDay() === 5) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;

        lessons.push({
          id: `lesson_${dateStr}`,
          date: dateStr,
          topic: "Тема урока",
        });
      }
    }
    return {
      lessons,
      records: {},
    };
  },
  updateAttendance: async (groupId: string, lessonId: string, records: AttendanceRecord[]): Promise<{ success: boolean }> => {
    return { success: true };
  },

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
  start: (code: string) =>
    api<any>(`/auth/diagnostic/${code}/start`, {
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
  studentReport: (studentId: string) =>
    diagApi<any>(`/analytics/students/${studentId}/report`),

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
  ) =>
    diagServiceApi<DiagAnswerResult>(
      `/diagnostic/sessions/${sessionId}/answer`,
      { method: "POST", body: data },
    ),

  getReport: (sessionId: string) =>
    diagServiceApi<DiagReport>(`/diagnostic/sessions/${sessionId}/report`),
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
  sessions_count?: number;
  created_at: string;
}

export interface PublishExamResult {
  exam_id: string;
  title: string;
  status: string;
  access_code: string;
  tasks_per_variant: number;
  variants_count: number;
  created_at: string;
  url: string;
}

export const examsApi = {
  // ── Teacher: create / manage ─────────────────────────────────────────────

  generate: (data: {
    title: string;
    textbook_id?: string;
    skill_ids?: string[];
    paragraph_ids?: string[];
    tasks_count?: number;
    difficulty_distribution?: Record<string, number>;
    time_minutes?: number;
    variants_count?: number;
    generate_variants?: boolean;
    shuffle_tasks?: boolean;
    shuffle_options?: boolean;
    mc_mode?: string;
  }) =>
    examApi<{ exam_id: string; access_code?: string; status: string; tasks_count: number; variants_count: number; skills_covered: string[] }>(
      "/exams/generate",
      { method: "POST", body: data },
    ),

  /** List all exams (teacher view) */
  list: () => examApi<ExamSummary[]>("/exams"),

  /** Full draft with tasks & correct answers (teacher only) */
  getDraft: (examId: string) =>
    examApi<{
      exam_id: string;
      title: string;
      status: string;
      total_time_minutes: number;
      variants_count: number;
      tasks_per_variant: number;
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
            explanation: string;
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
  replaceTask: (examId: string, data: { variant_number: number; task_id: string }) =>
    examApi<{ status: string; new_task: any }>(`/exams/${examId}/draft/replace-task`, {
      method: "POST",
      body: data,
    }),

  /** Publish draft → active, returns access_code + url */
  publish: (examId: string, data?: { teacher_name?: string; subject?: string }) =>
    examApi<PublishExamResult>(`/exams/${examId}/publish`, {
      method: "POST",
      body: data ?? {},
    }),

  /** Close an active exam */
  close: (examId: string) =>
    examApi<{ exam_id: string; status: string }>(`/exams/${examId}/close`, { method: "POST" }),

  /** Get sessions list for an exam (teacher) */
  getSessions: (examId: string) => examApi<any[]>(`/exams/${examId}/sessions`),

  /** Get analytics for an exam (teacher) */
  getAnalytics: (examId: string) => examApi<any>(`/exams/${examId}/analytics`),

  // ── Student: public (no auth) ────────────────────────────────────────────

  /** Exam info by access code — shown on lobby screen */
  getByCode: (code: string) =>
    examApi<{
      exam_id: string;
      title: string;
      subject: string;
      teacher_name: string | null;
      total_time_minutes: number;
      tasks_per_variant: number;
      variants_count: number;
      status: string;
    }>(`/exams/by-code/${code}`),

  /** Start exam session — returns tasks without correct answers */
  startSession: (code: string, data: { student_name: string; class_level: number }) =>
    examApi<{
      session_id: string;
      variant_number: number;
      time_minutes: number;
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

  /** Submit answers — called with session_id, not code */
  submit: (sessionId: string, data: { answers: Record<string, string>; time_spent_seconds: number }) =>
    examApi<{
      session_id: string;
      score: number;
      max_score: number;
      correct_count: number;
      answered_count: number;
      total_tasks: number;
      percentage: number;
    }>(`/exam-sessions/${sessionId}/submit`, { method: "POST", body: data }),

  /** Detailed session results (shown after submission) */
  getResult: (sessionId: string) =>
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
    }>(`/exam-sessions/${sessionId}/results`),
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
