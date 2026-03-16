const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_V1 = `${API_BASE_URL}/api/v1`;

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  token?: string;
  noAuth?: boolean;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
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

  const response = await fetch(`${API_V1}${endpoint}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401: token expired
  if (response.status === 401 && !noAuth) {
    // Try refresh
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry with new token
      headers["Authorization"] = `Bearer ${refreshed}`;
      const retryResponse = await fetch(`${API_V1}${endpoint}`, {
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
    if (typeof error.detail === "string") {
      message = error.detail;
    } else if (Array.isArray(error.detail)) {
      message = error.detail.map((e: any) => e.msg || String(e)).join("; ");
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    // Refresh via httpOnly cookie (sent automatically with credentials: include)
    const resp = await fetch(`${API_V1}/auth/refresh`, {
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
    api<AuthResponse>("/auth/apply", {
      method: "POST",
      body: data,
      noAuth: true,
    }),

  login: (email: string, password: string) =>
    api<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      noAuth: true,
    }),

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

  devLogin: (role: string) =>
    api<AuthResponse>(`/auth/dev-login?role=${role}`, {
      method: "POST",
      noAuth: true,
    }),
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
  listStudents: (params?: { class_level?: number; group_id?: string; status?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.class_level) query.set("class_level", String(params.class_level));
    if (params?.group_id) query.set("group_id", params.group_id);
    if (params?.status) query.set("status", params.status);
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
  createGroup: (data: { name: string; class_level?: number; teacher_id?: string; max_students?: number }) =>
    api<any>("/auth/org/groups", { method: "POST", body: data }),
  listGroups: (params?: { teacher_id?: string; class_level?: number }) => {
    const query = new URLSearchParams();
    if (params?.teacher_id) query.set("teacher_id", params.teacher_id);
    if (params?.class_level) query.set("class_level", String(params.class_level));
    const qs = query.toString();
    return api<any[]>(`/auth/org/groups${qs ? `?${qs}` : ""}`);
  },
  updateGroup: (id: string, data: any) =>
    api<any>(`/auth/org/groups/${id}`, { method: "PUT", body: data }),
  addStudentToGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "POST" }),
  removeStudentFromGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "DELETE" }),
};

// ============================================================================
// DIAGNOSTIC INVITE API (public - no auth)
// ============================================================================

export const diagnosticInviteApi = {
  getInfo: (code: string) =>
    api<any>(`/auth/diagnostic/${code}`, { noAuth: true }),
  confirm: (code: string, first_name: string, last_name: string) =>
    api<any>(`/auth/diagnostic/${code}/confirm`, {
      method: "POST",
      body: { first_name, last_name },
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

export const analyticsApi = {
  // Student progress
  studentSkillMap: (studentId: string) =>
    api<any>(`/analytics/students/${studentId}/skill-map`),
  studentTimeline: (studentId: string) =>
    api<any>(`/analytics/students/${studentId}/timeline`),
  studentWeaknesses: (studentId: string) =>
    api<any>(`/analytics/students/${studentId}/weaknesses`),
  studentDiagnostics: (studentId: string) =>
    api<any>(`/analytics/students/${studentId}/diagnostics`),

  // Group analytics
  groupOverview: (groupId: string) =>
    api<any>(`/analytics/groups/${groupId}/overview`),
  groupHeatmap: (groupId: string) =>
    api<any>(`/analytics/groups/${groupId}/heatmap`),
  groupProblemSkills: (groupId: string) =>
    api<any>(`/analytics/groups/${groupId}/problem-skills`),

  // Org analytics
  orgProblemSkills: () => api<any>("/analytics/org/problem-skills"),
  orgEnrollment: (days?: number) =>
    api<any>(`/analytics/org/enrollment${days ? `?days=${days}` : ""}`),
  orgLiveQueue: () => api<any>("/analytics/org/live-queue"),
  orgOverview: () => api<any>("/analytics/org/overview"),
};

// ============================================================================
// CAT API (Shadow CAT Engine)
// ============================================================================

export interface CATTask {
  task_id: string;
  skill_id: string;
  difficulty: string;
  question_text: string;
  question_latex: string | null;
  question_image_url: string | null;
  answer_type: string;
  phase: string;
  item_number: number;
  options?: string[];  // MC options (WARMUP phase only)
}

export interface CATStartResponse {
  session_id: string;
  phase: string;
  config: Record<string, any>;
  first_task: CATTask;
}

export interface CATAnswerResponse {
  is_correct: boolean;
  correct_answer: string | null;
  theta: number;
  theta_se: number;
  phase: string;
  item_number: number;
  accuracy: number;
  next_task: CATTask | null;
  is_complete: boolean;
  flags: string[];
}

export interface CATResultResponse {
  session_id: string;
  theta_eap: number;
  theta_mle: number | null;
  se: number;
  ci_low: number;
  ci_high: number;
  total_items: number;
  correct: number;
  accuracy: number;
  skills_tested: string[];
  difficulty_distribution: Record<string, number>;
  response_pattern: string;
  theta_trajectory: number[];
  se_trajectory: number[];
  integrity: {
    is_valid: boolean;
    overall_confidence: number;
    person_fit_lz: number | null;
    person_fit_verdict: string;
    anomalies: Array<{
      type: string;
      severity: string;
      confidence: number;
      description: string;
    }>;
  };
}

export const catApi = {
  start: (data: {
    class_level?: number;
    skill_ids?: string[];
    max_items?: number;
    prior_theta?: number;
    diagnostic_code?: string;
  }) =>
    api<CATStartResponse>("/cat/start", { method: "POST", body: data }),

  answer: (session_id: string, task_id: string, answer: string, time_ms: number) =>
    api<CATAnswerResponse>(`/cat/${session_id}/answer`, {
      method: "POST",
      body: { task_id, answer, time_ms },
    }),

  result: (session_id: string) =>
    api<CATResultResponse>(`/cat/${session_id}/result`),

  progress: (session_id: string) =>
    api<Record<string, any>>(`/cat/${session_id}/progress`),
};

// ============================================================================
// SKILLS API
// ============================================================================

export const skillsApi = {
  list: (params?: { level?: string; class_level?: number }) => {
    const query = new URLSearchParams();
    if (params?.level) query.set("level", params.level);
    if (params?.class_level) query.set("class_level", String(params.class_level));
    const qs = query.toString();
    return api<any[]>(`/skills${qs ? `?${qs}` : ""}`);
  },

  get: (skill_id: string) => api<any>(`/skills/${skill_id}`),

  prerequisites: (skill_id: string) => api<any[]>(`/skills/${skill_id}/prerequisites`),
};

// ============================================================================
// EXAMS API
// ============================================================================

export const examsApi = {
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
    api<any>("/exams/generate", { method: "POST", body: data }),

  // --- Draft management (teacher) ---

  /** Get exam draft with all answers/distractors */
  getDraft: (examId: string) =>
    api<{
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
          answer_options: string[] | null;
          distractor_meta: Array<{
            value: string;
            error_type: string;
            explanation: string;
            plausibility: number;
          }> | null;
          is_template_generated: boolean;
        }>;
      }>;
    }>(`/exams/${examId}/draft`),

  /** Replace a task in draft */
  replaceTask: (examId: string, data: { variant_number: number; task_id: string }) =>
    api<{ status: string; new_task: any }>(`/exams/${examId}/draft/replace-task`, {
      method: "POST",
      body: data,
    }),

  /** Get alternative tasks for replacement */
  getAlternatives: (examId: string, variantNumber: number, taskId: string) =>
    api<Array<{
      task_id: string;
      question_text: string;
      question_latex: string | null;
      difficulty: string;
      correct_answer: string;
      answer_type: string;
    }>>(`/exams/${examId}/draft/alternatives?variant_number=${variantNumber}&task_id=${taskId}`),

  /** Publish draft exam → active */
  publish: (examId: string) =>
    api<{ status: string; access_code: string; exam_id: string; url: string }>(
      `/exams/${examId}/publish`,
      { method: "POST" }
    ),

  /** Close exam */
  close: (examId: string) =>
    api<{ status: string }>(`/exams/${examId}/close`, { method: "POST" }),

  // --- Public exam-taking endpoints (no auth required) ---

  /** Get exam info by access code (lobby screen) */
  getByCode: (code: string) =>
    api<{
      title: string;
      teacher_name: string;
      subject: string;
      total_time_minutes: number;
      tasks_per_variant: number;
      variants_count: number;
      status: string;
    }>(`/exams/by-code/${code}`),

  /** Start an exam session */
  startSession: (code: string, data: { student_name: string; class_level: number }) =>
    api<{
      session_id: string;
      variant_number: number;
      tasks: Array<{
        task_id: string;
        text: string;
        options: string[];
        image_url?: string;
        difficulty: string;
        skill_name: string;
        answer_type?: string;
      }>;
      time_minutes: number;
    }>(`/exams/by-code/${code}/start`, { method: "POST", body: data }),

  /** Submit exam answers */
  submit: (code: string, data: { session_id: string; answers: Record<string, string>; time_spent_seconds: number }) =>
    api<{
      session_id: string;
      score: number;
      max_score: number;
      correct_count: number;
      answered_count: number;
      total_tasks: number;
      percentage: number;
    }>(`/exams/by-code/${code}/submit`, { method: "POST", body: data }),

  /** Get session result */
  getResult: (sessionId: string) =>
    api<{
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
        options: string[];
        student_answer: string | null;
        correct_answer: string;
        is_correct: boolean;
        skill_name: string;
      }>;
    }>(`/exams/sessions/${sessionId}/result`),

  // --- Teacher endpoints (auth required) ---

  /** List all exams for current teacher */
  list: () => api<any[]>("/exams"),

  /** Get sessions for an exam */
  getSessions: (examId: string) => api<any[]>(`/exams/${examId}/sessions`),
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
    return api<{ textbooks: TextbookBrief[]; total: number }>(
      `/textbooks${qs ? `?${qs}` : ""}`
    ).then((d) => d.textbooks);
  },

  /** Оглавление учебника (дерево) */
  toc: (textbookId: string) =>
    api<TOCNode[]>(`/textbooks/${textbookId}/toc/tree`),

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
    return api<TextbookTask[]>(`/textbooks/${textbookId}/tasks${qs ? `?${qs}` : ""}`);
  },

  /** Дерево навыков (для режима "По программе") */
  skillTree: (classLevel?: number) => {
    const qs = classLevel ? `?class_level=${classLevel}` : "";
    return api<SkillTreeNode[]>(`/textbooks/skills/tree${qs}`);
  },
};

export { api, ApiError };
