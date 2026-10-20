import { encodePathId } from "./encode-id";
import { loginUrlForPage } from "./safe-redirect";
import { STAFF_BUSY_MESSAGE, isStaffWriteBusy, staffBusyDelayMs, staffBusyRepeats } from "./staff-busy";
import type {
  EnrolPriceOverride,
  GroupPriceBrief,
  GroupPriceRequest,
  GroupPriceResult,
  GroupPrices,
  MembershipPrice,
  MembershipPriceChanged,
  PriceOverrideRequest,
} from "./group-price";
import type {
  MembershipPaymentRow,
  PaymentCreate,
  PaymentFileOut,
  PaymentOut,
  PaymentQuote,
  PaymentQuoteQuery,
  PaymentSaveResult,
  PaymentSettings,
  PaymentSettingsUpdate,
  PaymentsStatusList,
  PaymentsSummary,
  PaymentBucket,
  PaymentWarning,
  ReceiptOut,
} from "./payments";
import {
  filenameFromContentDisposition,
  type LessonType,
  type PayrollCalculateBody,
  type PayrollCalculateResponse,
  type PayrollDiff,
  type PayrollMonthOverview,
  type PayrollPatchBody,
  type PayrollRevision,
  type PayrollSaveBody,
  type PayrollSettings,
  type PayrollSheet,
  type PayrollSheetBrief,
} from "./payroll";

/**
 * #105 audit trail of the money: `changes` of the items of `GET /org/groups/{id}/prices` (GroupPriceChange) and of
 * `GET /org/memberships/{id}/price-override` (PriceOverrideChange); the shapes are declared next to their renderers.
 */
export type { GroupPriceCancelled, GroupPriceChange, GroupPriceRow, PriceOverrideCancelled, PriceOverrideChange, PriceOverrideRow } from "./group-price";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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
  /** `detail` is the server's `detail` object (`{code, message, ...extra}`), kept for the extra fields (`missing[]`, `current_revision`). */
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public action?: string,
    public detail?: unknown,
    /** Seconds from the `Retry-After` header of a 429 (the exam entry limits) or a 503 (a busy server); absent when the header is. */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** `Retry-After` in whole seconds ("120"); an HTTP-date or garbage is not used.  Read for a 429 and a 503 only. */
function retryAfterSeconds(response: Response): number | undefined {
  if (response.status !== 429 && response.status !== 503) return undefined;
  const raw = response.headers?.get?.("Retry-After")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const seconds = Number(raw);
  return seconds > 0 ? seconds : undefined;
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

  // Handle 401: the access JWT in the (30-day) cookie has expired. Refresh once, repeat the request once.
  if (response.status === 401 && !noAuth) {
    const refresh = await tryRefreshToken();
    if (refresh.kind === "transient") {
      // The session is NOT known to be over (refresh limiter, server hiccup, no network): keep the
      // sign-in, the cookies and the page, and let the caller show the message.
      throw new ApiError(refresh.status, REFRESH_UNAVAILABLE_MESSAGE);
    }
    if (refresh.kind === "ok") {
      // Retry with the new cookie (and the new token as a header, in case the cookie jar did not take it)
      headers["Authorization"] = `Bearer ${refresh.accessToken}`;
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
    }
    if (refresh.kind === "dead" || response.status === 401) {
      // The session is over (refresh refused with 401/403, or the retry is refused too) — to the login
      await endDeadSession();
      return undefined as any;
    }
    // Refreshed: any other answer of the retry (200, but also 403/404/409/422) is the answer to the
    // request itself and is handled below like any response - it must not look like a lost session.
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
    throw new ApiError(response.status, message, code, undefined, error?.detail);
  }

  return response.json();
}

/** Shown when the session could not be renewed for a reason that does not end it (limiter, server, network). */
export const REFRESH_UNAVAILABLE_MESSAGE = "Не удалось продлить вход — проверьте связь и повторите";

/** One /auth/refresh must not hang a page: after this the attempt counts as a network failure. */
const REFRESH_TIMEOUT_MS = 15_000;
/** Longest a tab waits for another tab's refresh before refreshing on its own. */
const REFRESH_LOCK_WAIT_MS = 20_000;
/** The best-effort logout that clears the stale cookies must not delay the redirect to the login. */
const CLEAR_COOKIES_TIMEOUT_MS = 4_000;

/**
 * What /auth/refresh said. ONLY a 401 (or 403) means the session is dead; anything else (429 from the
 * limiter, 5xx, no network, a timeout) is "unavailable right now" and must neither sign the user out nor
 * touch the stored sign-in.
 */
export type RefreshOutcome =
  | { kind: "ok"; accessToken: string }
  | { kind: "dead" }
  | { kind: "transient"; status: number };

/** A request failure that says nothing about the session itself: no answer, the limiter, a server error. */
export function isTransientApiError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" && (status === 0 || status === 408 || status === 429 || status >= 500);
}

/** `AbortSignal.timeout` where it exists, an AbortController timer elsewhere; `done` clears the timer. */
function timeoutSignal(ms: number): { signal: AbortSignal | undefined; done: () => void } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), done: () => {} };
  }
  if (typeof AbortController === "undefined") return { signal: undefined, done: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** Name of the Web Lock that serialises the refresh of one browser profile (all its tabs). */
const REFRESH_LOCK_NAME = "algo-auth-refresh";

/** The refresh in progress: every request that gets a 401 meanwhile waits for this one call. */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * Refresh the session through the httpOnly refresh cookie. ONE call at a time:
 * - in this tab: a page that wakes up after an idle hour fires several API calls at once, all get 401.
 *   The refresh token ROTATES, so a second parallel /auth/refresh with the same (already used) token is
 *   refused with 401 and would throw the user out of a session that the first call has just renewed;
 * - across tabs (browser restore, two tabs of the app): the Web Lock makes the second tab wait and then
 *   refresh with the cookie the first tab has just received. Browsers without Web Locks keep the
 *   per-tab behaviour. The lock is held only while the (time-limited) request runs.
 */
function tryRefreshToken(): Promise<RefreshOutcome> {
  if (typeof window === "undefined") return Promise.resolve({ kind: "dead" });
  if (!refreshInFlight) {
    const run = async (): Promise<RefreshOutcome> => {
      const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
      if (!locks?.request) return requestRefresh();
      const wait = timeoutSignal(REFRESH_LOCK_WAIT_MS);
      try {
        const options = wait.signal ? { signal: wait.signal } : {};
        return (await locks.request(REFRESH_LOCK_NAME, options, () => requestRefresh())) as RefreshOutcome;
      } catch {
        // The lock could not be taken (a sandboxed frame, or the other tab took too long): refresh without it
        return requestRefresh();
      } finally {
        wait.done();
      }
    };
    refreshInFlight = run().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function requestRefresh(): Promise<RefreshOutcome> {
  const timeout = timeoutSignal(REFRESH_TIMEOUT_MS);
  try {
    // Refresh via httpOnly cookie (sent automatically with credentials: include)
    const resp = await fetch(`${AUTH_API_V1}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
      signal: timeout.signal,
    });

    if (resp.status === 401 || resp.status === 403) return { kind: "dead" };
    if (!resp.ok) return { kind: "transient", status: resp.status };

    const data = await resp.json();
    // New cookies are set by the backend response.
    // Return access_token for the immediate retry.
    if (!data || typeof data.access_token !== "string") return { kind: "transient", status: 502 };
    return { kind: "ok", accessToken: data.access_token };
  } catch {
    // network error, timeout (AbortError) or an unreadable body: no verdict on the session
    return { kind: "transient", status: 0 };
  } finally {
    timeout.done();
  }
}

/** The page's own address as the sign-in page's return target (nothing for public pages). */
function loginUrlHere(): string {
  return loginUrlForPage(window.location.pathname, window.location.search);
}

let sessionEnding: Promise<void> | null = null;

/**
 * The session is over (the refresh was refused, or the retried request was): ask the server to drop the stale
 * cookies (the access cookie lives 30 days - left alone it would keep letting the middleware wave the user
 * through to a page that cannot load), forget the stored sign-in and go to the login WITH the page the user
 * was on as `?redirect=`. Several failing requests share one run.
 */
function endDeadSession(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!sessionEnding) {
    sessionEnding = (async () => {
      const timeout = timeoutSignal(CLEAR_COOKIES_TIMEOUT_MS);
      try {
        await fetch(`${AUTH_API_V1}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          signal: timeout.signal,
        });
      } catch {
        // best effort: the redirect below happens anyway
      } finally {
        timeout.done();
      }
      try {
        localStorage.removeItem("algo-auth");
      } catch {
        // storage can be unavailable: the redirect still happens
      }
      window.location.href = loginUrlHere();
    })();
    // The page is leaving; if it does not (a blocked navigation), a later dead session may run again.
    setTimeout(() => {
      sessionEnding = null;
    }, 3000);
  }
  return sessionEnding;
}

const NETWORK_ERROR_MESSAGE = "Не удалось подключиться к сервису. Проверьте соединение и повторите попытку.";

/** fetch whose network failure (no answer at all) is an ApiError with status 0 and the friendly message. */
async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
}

/**
 * WHO sends a request to the exam / diagnostic service. Every wrapper call must say it (no default):
 * - `staff`: the request carries the staff session (the cookie). A 401 (the 60-minute JWT inside the 30-day
 *   cookie has run out) refreshes the session once through the shared single-flight tryRefreshToken() and
 *   repeats the request (fetchAuthed); a dead session ends like api(); a transient refresh failure is an error
 *   and keeps the session.
 * - `student`: the public flow of a class code, an attempt token (`X-Exam-Session-Token`) or an invite code. No
 *   staff session travels with it, so a 401 there is sent on as it is and must neither refresh nor end the
 *   staff session of the browser.
 */
type ApiAudience = "staff" | "student";

function fetchService(url: string, init: RequestInit, audience: ApiAudience): Promise<Response> {
  return audience === "staff" ? fetchAuthed(url, init) : fetchOrThrow(url, init);
}

const staffBusySleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A staff request to the exam service.  The service answers 503 + Retry-After at once when its staff capacity is used
 * up (nothing was done): a read is asked again up to twice, a change that cannot be doubled once (see staff-busy.ts);
 * the answer after the last try is handed on like any other.  The body of a refused answer is not read here.
 */
async function fetchExamStaff(url: string, init: RequestInit, endpoint: string): Promise<Response> {
  const method = init.method ?? "GET";
  for (let repeats = 0; ; repeats += 1) {
    const response = await fetchAuthed(url, init);
    const retryAfter = retryAfterSeconds(response);
    if (repeats >= staffBusyRepeats(method, endpoint, response.status, retryAfter)) return response;
    await staffBusySleep(staffBusyDelayMs(retryAfter));
  }
}

/** Fetch wrapper for exam-service: see ApiAudience for what `audience` changes. */
async function examApi<T>(endpoint: string, audience: ApiAudience, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, sessionToken } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionToken) {
    headers["X-Exam-Session-Token"] = sessionToken;
  }

  const url = `${EXAM_API_V1}${endpoint}`;
  const init: RequestInit = { method, headers, credentials: "include", body: body ? JSON.stringify(body) : undefined };
  const response = audience === "staff" ? await fetchExamStaff(url, init, endpoint) : await fetchOrThrow(url, init);

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    let message = "Сервис временно недоступен. Повторите попытку.";
    if (typeof error?.detail === "string") {
      message = error.detail;
    } else if (Array.isArray(error?.detail)) {
      message = error.detail.map((e: any) => e.msg || String(e)).join("; ");
    }
    // A change refused as «busy» (503 + Retry-After) and not repeated, or still refused after its repeat: say so briefly.
    if (audience === "staff" && isStaffWriteBusy(method, response.status, retryAfterSeconds(response))) {
      message = STAFF_BUSY_MESSAGE;
    }
    throw new ApiError(response.status, message, undefined, undefined, undefined, retryAfterSeconds(response));
  }

  return response.json();
}

/** Download an authenticated, staff-only print artifact without exposing it through a public exam URL. */
async function downloadExamPrintPdf(
  examId: string,
  kind: "student" | "teacher-key",
  variantNumber: number,
): Promise<void> {
  // staff-only: a 401 refreshes the session once and repeats the request (fetchAuthed); a busy 503 is asked again
  const path = `/exams/${encodeURIComponent(examId)}/print-package/${kind}/${variantNumber}.pdf`;
  const response = await fetchExamStaff(`${EXAM_API_V1}${path}`, { credentials: "include", cache: "no-store" }, path);

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = typeof error?.detail === "string"
      ? error.detail
      : "Не удалось сформировать печатный файл. Повторите попытку.";
    throw new ApiError(response.status, message);
  }

  const file = await response.blob();
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${kind === "teacher-key" ? "algo-key" : "algo-exam"}-${examId}-v${variantNumber}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Load a staff-only draft PDF for the embedded preview.  Unlike the download
 * endpoint this does not require an assigned lesson and never creates a
 * printable package, public code, lobby, or student session.
 */
async function previewExamPrintPdf(
  examId: string,
  kind: "student" | "teacher-key",
  variantNumber: number,
): Promise<Blob> {
  // staff-only: a 401 refreshes the session once and repeats the request (fetchAuthed); a busy 503 is asked again
  const path = `/exams/${encodeURIComponent(examId)}/print-preview/${kind}/${variantNumber}.pdf`;
  const response = await fetchExamStaff(`${EXAM_API_V1}${path}`, { credentials: "include", cache: "no-store" }, path);

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = typeof error?.detail === "string"
      ? error.detail
      : "Не удалось сформировать предпросмотр печатного бланка. Повторите попытку.";
    throw new ApiError(response.status, message);
  }

  return response.blob();
}

/** Fetch wrapper for diagnostic-service: see ApiAudience for what `audience` changes. */
async function diagServiceApi<T>(endpoint: string, audience: ApiAudience, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, inviteCode } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (inviteCode) {
    headers["X-Diagnostic-Invite-Code"] = inviteCode;
  }

  const response = await fetchService(
    `${DIAG_API_V1}${endpoint}`,
    { method, headers, credentials: "include", cache: "no-store", body: body ? JSON.stringify(body) : undefined },
    audience,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    let message = "Сервис временно недоступен. Повторите попытку.";
    if (typeof error?.detail === "string") {
      message = error.detail;
    } else if (typeof error?.detail === "object" && error.detail !== null) {
      message = (error.detail as any).message || JSON.stringify(error.detail);
    }
    throw new ApiError(response.status, message, error?.detail?.code, error?.detail?.action);
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
  /** Kind of lessons (N13 P3). An answer of an older server has none: treat it as «group». */
  lesson_type?: LessonType;
  /**
   * The price of the group today (#105): `null` - not set.  The key is there ONLY for roles that may see money
   * (owner; administrator when the owner allowed it); for everybody else it is absent - never render a price then.
   */
  price_current?: GroupPriceBrief | null;
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
  /** A concrete lesson added for one calendar date, not a recurring slot. */
  isOneOff?: boolean;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  originalRoom?: string | null;
  rescheduleReason?: string | null;
}

/** Server-verified attendance state for a concrete lesson on the dashboard. */
export interface TeacherDashboardLessonAttendanceState {
  lessonId: string;
  groupId: string;
  status: LessonAttendanceStatus | null;
  hasSavedRecords: boolean;
}

/** One consistent teacher-only operational dashboard snapshot. */
export interface TeacherDashboardSummary {
  businessDate: string;
  groups: GroupInfo[];
  /** Distinct active students across the teacher's active groups (absent on an older server). */
  studentCount?: number;
  todayLessons: ScheduleOccurrence[];
  scheduleWindow: ScheduleOccurrence[];
  openAttendanceActions: OpenAttendanceAction[];
  attendanceStates: TeacherDashboardLessonAttendanceState[];
}

export interface RecurringLessonEndExamImpact {
  examId: string;
  title: string;
  lessonDate: string;
  deliveryMode: "online" | "print" | "hybrid" | string;
  status: string;
  canRelease: boolean;
  blockerReason?: string | null;
}

export interface RecurringLessonEndImpact {
  groupId: string;
  lessonId: string;
  effectiveFrom: string;
  affectedExamCount: number;
  releasableExamCount: number;
  blockedExamCount: number;
  canEnd: boolean;
  exams: RecurringLessonEndExamImpact[];
}

export interface EndRecurringLessonResult extends RecurringLessonEndImpact {
  ended: boolean;
  releasedExamIds: string[];
}

export type ExcuseReviewStatus = "pending" | "confirmed" | "rejected";

export interface AttendanceExcuseFile {
  id: string;
  filename: string | null;
  content_type: string;
  size_bytes: number;
}

export type ExcuseServerDeadline =
  | { kind: "date"; date: string; overdue: boolean; days_left: number }
  // N = excuse_deadline_lessons: lessons_left > N normal, == N `due_now`, < N `overdue`; `urgent` = lessons_left <= N.
  | { kind: "lessons"; lessons_left: number; urgent: boolean; due_now?: boolean; overdue: boolean };

export interface AttendanceExcuseItem {
  id: string;
  attendance_id: string;
  lesson_date: string; // YYYY-MM-DD
  lesson_key: string;
  group: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  student: { id: string; full_name: string; display_id: string | null; phone?: string | null };
  reason: string;
  reason_by: { id: string; name: string } | null;
  reason_at: string | null;
  status: ExcuseReviewStatus;
  reviewed_by: { id: string; name: string } | null;
  reviewed_at: string | null;
  review_note: string | null;
  files: AttendanceExcuseFile[];
  /** Pending excuses: when to confirm by (a date or the lessons left in a package). Absent on an older server. */
  deadline?: ExcuseServerDeadline | null;
  /** How the student's latest live payment in this group is billed; null: no payment. Absent on an older server. */
  billing_mode?: ExcuseBillingModeValue | null;
}

/** `billing_mode` of an excuse: a lessons package or a calendar period. */
export type ExcuseBillingModeValue = "calendar" | "package";

/** Sidebar counters: excuses to decide and lessons to close. */
export interface AttendanceExcuseSummary {
  pending_total: number;
  /** null/absent: not counted right now; keep the previous value. */
  open_lessons_total?: number | null;
}

export interface AttendanceExcuseList {
  items: AttendanceExcuseItem[];
  total: number;
  pending_total: number;
}

export interface AttendanceExcuseQuery {
  status?: ExcuseReviewStatus | "all";
  dateFrom?: string;
  dateTo?: string;
  groupId?: string;
  teacherId?: string;
  limit?: number;
  offset?: number;
}

/** One stay of a student in a group (naive-UTC ISO); a returning student has several, oldest first. */
export interface MembershipPeriodDto {
  joined_at: string | null;
  left_at: string | null;
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
  /** Every stay in this group, oldest first; `joined_at` is the current one. Older servers do not send it. */
  periods?: MembershipPeriodDto[] | null;
  last_theta: number | null;
  last_level: "below_grade" | "at_grade" | "above_grade" | null;
  last_level_status?: "critical" | "below" | "partial_gap" | "on_level" | "above" | null;
  last_level_provisional?: boolean | null;
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

/** Review state of one "excused" mark (N13 P1). `review_note` is hidden from teachers. */
export interface AttendanceExcuseInfo {
  id: string;
  status: "pending" | "confirmed" | "rejected";
  reason: string;
  reason_by_name: string | null;
  reason_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note?: string | null;
  has_files: boolean;
  /** Owner / administrator only (the key is absent for a teacher): billing mode of the student's latest payment in the group, null = none. */
  billing_mode?: ExcuseBillingModeValue | null;
}

/** Last correction of a completed lesson. */
export interface AttendanceCorrectionInfo {
  by_name: string | null;
  at: string | null;
  reason: string | null;
}

export interface GroupAttendance {
  groupId?: string;
  /** lessonKey -> student_id -> excuse. */
  excuses?: Record<string, Record<string, AttendanceExcuseInfo>>;
  /** lessonKey -> last correction. */
  corrections?: Record<string, AttendanceCorrectionInfo>;
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
    periods?: MembershipPeriodDto[] | null;
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

/** A concrete lesson that needs a teacher's explicit operational decision. */
export interface OpenAttendanceAction {
  /** A real open journal, or a past occurrence that was never started. */
  actionType: "in_progress" | "missed";
  groupId: string;
  groupName: string;
  classLevel: number;
  lessonId: string;
  lessonDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: "offline" | "online" | string;
  topic?: string | null;
  markedCount: number;
  rosterCount: number;
  remainingCount: number;
  /** Lesson snapshot teacher, else the group's teacher (administrators' list). */
  teacherId?: string | null;
  teacherName?: string | null;
}

export interface AttendancePeriod {
  month?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type GroupJoinMode = "transfer" | "add";

export interface StudentGroupMembership {
  membership_id: string;
  group_id: string;
  group_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  class_level: number | null;
  is_primary: boolean;
  joined_at: string | null;
  /** Every stay in this group, oldest first (a returning student has several). */
  periods?: MembershipPeriodDto[] | null;
}

/** A group the archiving closed: the restore dialog offers it back (`group_status !== "active"` or `is_full` block it). */
export interface StudentArchivedGroup {
  group_id: string;
  group_name: string;
  group_status: string;
  is_full: boolean;
}

/** `POST /auth/org/students/{id}/archive`: the updated student plus the groups he was removed from. */
export type StudentArchiveResult = Record<string, any> & {
  id: string;
  status: string;
  closed_groups: Array<{ group_id: string; group_name: string }>;
  /** pending / confirmed diagnostic invites the archiving cancelled; absent on an older server. */
  diagnostic_invites_cancelled?: number;
  /** in_progress invites left running: the student may finish them. */
  diagnostic_invites_in_progress?: number;
};

/** Why the server did not return the student to a group (`message` is the Russian text for the administrator). */
export type StudentRestoreSkipReason = "group_full" | "group_archived" | "not_found" | "lesson_in_progress" | "refused" | "busy";

/** `POST /auth/org/students/{id}/restore`: the updated student, the groups he is back in and the ones the server skipped. */
export type StudentRestoreResult = Record<string, any> & {
  id: string;
  status: string;
  restored_groups?: Array<{ group_id: string; group_name: string }>;
  skipped: Array<{ group_id: string; group_name: string | null; reason: StudentRestoreSkipReason | string; message: string }>;
  /** Hints of the enrolment (third group, class mismatch), per group; never a refusal. */
  warnings?: Array<{ group_id: string; code?: string; message?: string }>;
};

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
    /** Only an archived student: when (ISO, naive UTC - show it on the center's clock) and why; both null otherwise. */
    archived_at?: string | null;
    archive_reason?: string | null;
  };
  group: {
    id: string;
    name: string;
    class_level: number;
    teacher_id: string | null;
    teacher_name: string | null;
    description?: string | null;
  } | null;
  /** Only for an archived student: the groups the last archiving closed, offered back by «Вернуть из архива» (null otherwise). */
  archived_groups?: StudentArchivedGroup[] | null;
  /** All active memberships (N13 P2); older servers do not send it. No money here. */
  groups?: StudentGroupMembership[];
  group_history: Array<{
    group_id: string;
    group_name: string;
    class_level?: number | null;
    is_active: boolean;
    joined_at: string | null;
    left_at: string | null;
    /** Every stay in this group, oldest first; `joined_at` / `left_at` are the last one. */
    periods?: MembershipPeriodDto[] | null;
  }>;
  diagnostics: Array<{
    invite_id: string;
    code: string;
    class_level: number;
    diagnostic_type: string;
    /** pending | confirmed | in_progress | completed | expired | cancelled */
    status: string;
    created_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    /** Only a cancelled invite: when (naive UTC) and why ("student_archived"). */
    cancelled_at?: string | null;
    cancel_reason?: string | null;
    result?: {
      id: string;
      theta?: number | null;
      accuracy?: number | null;
      recommended_level?: string | null;
      level_status?: string | null;
      level_provisional?: boolean | null;
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
      `/auth/invite/${encodeURIComponent(code)}`,
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
  /** Groups with their average θ (latest result of every active student) - owner dashboard. */
  groupsOverview: () =>
    api<{
      groups: Array<{
        group_id: string;
        name: string;
        class_level: number | null;
        student_count: number;
        diagnosed_count: number;
        avg_theta: number | null;
      }>;
      /** Centre-wide figures: every diagnosed student counted once, however many groups he is in. */
      avg_theta?: number | null;
      diagnosed_count?: number;
      student_count?: number;
    }>("/auth/org/groups-overview"),
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
  /** One server-side page of students plus the exact total of the filtered set. */
  listStudentsPage: async (params: {
    class_level?: number; group_id?: string; has_group?: boolean; has_primary_group?: boolean;
    status?: string; exclude_status?: string; search?: string; limit?: number; offset?: number;
  }) => {
    const query = new URLSearchParams({ include_meta: "true" });
    if (params.class_level) query.set("class_level", String(params.class_level));
    if (params.group_id) query.set("group_id", params.group_id);
    if (params.has_group !== undefined) query.set("has_group", String(params.has_group));
    if (params.has_primary_group !== undefined) query.set("has_primary_group", String(params.has_primary_group));
    if (params.status) query.set("status", params.status);
    if (params.exclude_status) query.set("exclude_status", params.exclude_status);
    if (params.search) query.set("search", params.search);
    query.set("limit", String(params.limit ?? 50));
    query.set("offset", String(params.offset ?? 0));
    const response = await api<{ items: any[]; total: number } | any[]>(`/auth/org/students?${query.toString()}`);
    // Rolling update: an older auth-service still answers with a bare array.
    if (Array.isArray(response)) return { items: response, total: response.length };
    return { items: response.items ?? [], total: response.total ?? (response.items ?? []).length };
  },
  getStudent: (id: string) => api<any>(`/auth/org/students/${id}`),
  getStudentProfile: (id: string) => api<StudentProfile>(`/auth/org/students/${id}/profile`),
  getStudentAttendanceSummary: (id: string, month?: string) =>
    api<StudentAttendanceSummary>(
      `/auth/org/students/${id}/attendance${month ? `?month=${encodeURIComponent(month)}` : ""}`
    ),
  updateStudent: (id: string, data: any) =>
    api<any>(`/auth/org/students/${id}`, { method: "PUT", body: data }),
  /** «Ученик ушёл из центра»: owner / administrator; closes every active membership. 409 when already archived. */
  archiveStudent: (id: string, reason?: string) =>
    api<StudentArchiveResult>(`/auth/org/students/${id}/archive`, { method: "POST", body: reason ? { reason } : {} }),
  /** «Вернуть из архива» into the chosen groups (none = without a group). 409 when the student is not archived. */
  restoreStudent: (id: string, groupIds: string[]) =>
    api<StudentRestoreResult>(`/auth/org/students/${id}/restore`, { method: "POST", body: { group_ids: groupIds } }),

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
  getDiagnostic: (id: string) => api<any>(`/auth/org/diagnostics/${encodePathId(id)}`),
  acknowledgeDiagnosticReport: (id: string) =>
    api<{ acknowledged: boolean }>(`/auth/org/diagnostics/${encodePathId(id)}/acknowledge-report`, { method: "POST" }),

  // Groups
  createGroup: (data: { name: string; class_level?: number; teacher_id?: string; description?: string; max_students?: number; lesson_type?: LessonType }) =>
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
  updateGroup: (id: string, data: Partial<{ name: string; class_level: number | null; teacher_id: string | null; description: string; max_students: number; status: string; lesson_type: LessonType }>) =>
    api<GroupInfo>(`/auth/org/groups/${id}`, { method: "PUT", body: data }),
  archiveGroup: (id: string) =>
    // No dedicated /archive route — the PUT endpoint already accepts status.
    api<GroupInfo>(`/auth/org/groups/${id}`, { method: "PUT", body: { status: "archived" } }),
  unarchiveGroup: (id: string) =>
    api<GroupInfo>(`/auth/org/groups/${id}`, { method: "PUT", body: { status: "active" } }),
  /**
   * `mode: "transfer"` (default) closes the other memberships and makes this group the main one;
   * `"add"` keeps them.  The student takes the price of the group; `price_override` is an explicit individual
   * price (sum + reason) and is sent only by roles that may see money (the server answers 403 otherwise).
   */
  addStudentToGroup: (groupId: string, studentId: string, options?: { mode?: GroupJoinMode; price_override?: EnrolPriceOverride | null }) => {
    const query = options?.mode ? `?mode=${options.mode}` : "";
    const body = options?.price_override ? { price_override: options.price_override } : undefined;
    return api<{
      student_id: string;
      group_id: string;
      status: "added" | "unchanged";
      reason?: "already_in_target_group";
      display_id?: string | null;
      /** Server hints (third group, class mismatch); never a refusal. */
      warnings?: PaymentWarning[];
    }>(`/auth/org/groups/${groupId}/students/${studentId}${query}`, { method: "POST", body });
  },
  removeStudentFromGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${groupId}/students/${studentId}`, { method: "DELETE" }),
  /** One `price_override` (sum + reason) for everybody added, or none: the students follow the price of the group. */
  bulkAddStudents: (groupId: string, studentIds: string[], options?: { mode?: GroupJoinMode; price_override?: EnrolPriceOverride | null }) =>
    api<{
      group_id: string;
      added: number;
      skipped: number;
      /** Older servers do not send it. */
      skipped_details?: Array<{ student_id: string; reason: string }>;
      /** Hints per student (`student_id` when the server names one). */
      warnings?: Array<PaymentWarning & { student_id?: string }>;
    }>(
      `/auth/org/groups/${groupId}/students/bulk${options?.mode ? `?mode=${options.mode}` : ""}`,
      {
        method: "POST",
        body: {
          student_ids: studentIds,
          ...(options?.price_override ? { price_override: options.price_override } : {}),
        },
      }
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
  createOneOffLesson: (data: {
    groupId: string;
    lessonDate: string;
    startTime: string;
    endTime: string;
    room?: string;
    format?: "offline" | "online";
    color?: LessonEvent["color"];
    topic?: string;
  }) => api<ScheduleOccurrence>(`/auth/org/schedule/occurrences`, { method: "POST", body: data }),
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
  getRecurringLessonEndImpact: (lessonId: string, effectiveFrom: string) => {
    const query = new URLSearchParams({ effective_from: effectiveFrom });
    return api<RecurringLessonEndImpact>(
      `/auth/org/schedule/lessons/${lessonId}/recurrence/end-impact?${query.toString()}`,
    );
  },
  endRecurringLesson: (
    lessonId: string,
    data: { effectiveFrom: string; reason: string; releaseAffectedExams: boolean },
  ) => api<EndRecurringLessonResult>(
    `/auth/org/schedule/lessons/${lessonId}/recurrence/end`,
    { method: "POST", body: data },
  ),

  /** Replaces one attendance read per lesson on the teacher dashboard. */
  getTeacherDashboardSummary: (businessDate: string) => {
    const params = new URLSearchParams({ business_date: businessDate });
    return api<TeacherDashboardSummary>(`/auth/org/teacher/dashboard/summary?${params.toString()}`);
  },

  // ── Attendance ────────────────────────────────────────────────────────
  getOpenAttendanceActions: () =>
    api<OpenAttendanceAction[]>("/auth/org/attendance/open-actions"),
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
      /** student_id -> reason (3..300) for every newly "excused" student. */
      excuseReasons?: Record<string, string>;
    }
  ) =>
    api<{ ok: boolean; saved: boolean }>(`/auth/org/groups/${groupId}/attendance`, { method: "POST", body: data }),

  startGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; topic?: string },
  ) =>
    api<{ ok: boolean; started: boolean }>(`/auth/org/groups/${groupId}/attendance/start`, { method: "POST", body: data }),

  reconcileMissedGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; topic?: string },
  ) =>
    api<{ ok: boolean; reconciled: boolean }>(`/auth/org/groups/${groupId}/attendance/reconcile`, { method: "POST", body: data }),

  cancelMissedGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; cancellationReason: string },
  ) =>
    api<{ ok: boolean; cancelled: boolean }>(`/auth/org/groups/${groupId}/attendance/reconcile/cancel`, { method: "POST", body: data }),

  // ── Excused absences (admin / owner) ──────────────────────────────────
  listAttendanceExcuses: (q: AttendanceExcuseQuery = {}) => {
    const params = new URLSearchParams();
    params.set("status", q.status ?? "pending");
    if (q.dateFrom) params.set("date_from", q.dateFrom);
    if (q.dateTo) params.set("date_to", q.dateTo);
    if (q.groupId) params.set("group_id", q.groupId);
    if (q.teacherId) params.set("teacher_id", q.teacherId);
    params.set("limit", String(q.limit ?? 50));
    params.set("offset", String(q.offset ?? 0));
    return api<AttendanceExcuseList>(`/auth/org/attendance/excuses?${params.toString()}`);
  },
  getAttendanceExcuseSummary: () =>
    api<AttendanceExcuseSummary>("/auth/org/attendance/excuses/summary"),
  reviewAttendanceExcuse: (id: string, data: { decision: "confirmed" | "rejected"; note?: string }) =>
    api<AttendanceExcuseItem>(`/auth/org/attendance/excuses/${encodePathId(id)}/review`, { method: "POST", body: data }),
  resetAttendanceExcuse: (id: string) =>
    api<AttendanceExcuseItem>(`/auth/org/attendance/excuses/${encodePathId(id)}/reset`, { method: "POST" }),
  uploadAttendanceExcuseFile: (id: string, file: Blob, filename: string) =>
    uploadMultipart<AttendanceExcuseFile>(
      `/auth/org/attendance/excuses/${encodePathId(id)}/files`,
      file,
      filename,
      "Не удалось загрузить файл",
    ),
  deleteAttendanceExcuseFile: (fileId: string) =>
    api<{ ok: boolean }>(`/auth/org/attendance/excuses/files/${encodePathId(fileId)}`, { method: "DELETE" }),
  /** Binary certificate for the viewer; private, never cached by the browser. */
  fetchAttendanceExcuseFile: (fileId: string) =>
    fetchBinary(`/auth/org/attendance/excuses/files/${encodePathId(fileId)}`, "Не удалось открыть файл"),

  // ── Payments (owner; admin only when the owner enabled it) ─────────────
  getPaymentsSummary: () => api<PaymentsSummary>("/auth/org/payments/summary"),
  getPaymentsStatus: (q: { bucket: PaymentBucket | "all"; groupId?: string; teacherId?: string; search?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams({ bucket: q.bucket });
    if (q.groupId) params.set("group_id", q.groupId);
    if (q.teacherId) params.set("teacher_id", q.teacherId);
    if (q.search) params.set("search", q.search);
    params.set("limit", String(q.limit ?? 50));
    params.set("offset", String(q.offset ?? 0));
    return api<PaymentsStatusList>(`/auth/org/payments/status?${params.toString()}`);
  },
  getStudentMemberships: (studentId: string) =>
    api<MembershipPaymentRow[]>(`/auth/org/students/${encodePathId(studentId)}/memberships`),
  // ── Price of a group and the exception of one student (#105; money roles only) ──
  /** The price today and the history of the group, newest first. */
  getGroupPrices: (groupId: string) => api<GroupPrices>(`/auth/org/groups/${encodePathId(groupId)}/prices`),
  /** Sets the price from a day; `dryRun` writes nothing and answers only `impact` (what the change touches). */
  setGroupPrice: (groupId: string, body: GroupPriceRequest, options?: { dryRun?: boolean }) =>
    api<GroupPriceResult>(`/auth/org/groups/${encodePathId(groupId)}/price${options?.dryRun ? "?dry_run=1" : ""}`, {
      method: "PUT", body,
    }),
  /** Takes back a SCHEDULED group price (a row with a day after today): 409 once it is in force, 404 when it is gone. Answers like the GET. */
  cancelGroupPrice: (groupId: string, rowId: string) =>
    api<GroupPrices>(`/auth/org/groups/${encodePathId(groupId)}/prices/${encodePathId(rowId)}`, { method: "DELETE" }),
  /** Takes back a SCHEDULED individual price; answers like the GET plus the updated `row`. */
  cancelMembershipPrice: (membershipId: string, rowId: string) =>
    api<MembershipPriceChanged>(`/auth/org/memberships/${encodePathId(membershipId)}/price-override/${encodePathId(rowId)}`, { method: "DELETE" }),
  /** The price of a membership today and the history of its individual prices. */
  getMembershipPrice: (membershipId: string) =>
    api<MembershipPrice>(`/auth/org/memberships/${encodePathId(membershipId)}/price-override`),
  /** `amount` a sum (+ `reason`): the individual price from `valid_from`; `amount` null: the price of the group again. */
  setMembershipPrice: (membershipId: string, body: PriceOverrideRequest) =>
    api<MembershipPriceChanged>(`/auth/org/memberships/${encodePathId(membershipId)}/price-override`, {
      method: "PUT", body,
    }),
  listMembershipPayments: (membershipId: string, includeVoided = true) =>
    api<PaymentOut[]>(`/auth/org/memberships/${encodePathId(membershipId)}/payments?include_voided=${includeVoided}`),
  createPayment: (membershipId: string, data: PaymentCreate) =>
    api<PaymentSaveResult>(`/auth/org/memberships/${encodePathId(membershipId)}/payments`, { method: "POST", body: data }),
  replacePayment: (paymentId: string, data: PaymentCreate & { reason?: string }) =>
    api<PaymentSaveResult>(`/auth/org/payments/${encodePathId(paymentId)}/replace`, { method: "POST", body: data }),
  voidPayment: (paymentId: string, reason: string) =>
    api<{ payment: PaymentOut; row: MembershipPaymentRow }>(`/auth/org/payments/${encodePathId(paymentId)}/void`, {
      method: "POST", body: { reason },
    }),
  /** Suggested dates and amount for the next payment of a membership (same rules as creating it). */
  getPaymentQuote: (membershipId: string, q: PaymentQuoteQuery) => {
    const params = new URLSearchParams({ paid_on: q.paid_on });
    if (q.valid_from) params.set("valid_from", q.valid_from);
    if (q.valid_to) params.set("valid_to", q.valid_to);
    if (q.lessons_count !== undefined) params.set("lessons_count", String(q.lessons_count));
    if (q.monthly_fee !== undefined) params.set("monthly_fee", String(q.monthly_fee));
    return api<PaymentQuote>(`/auth/org/memberships/${encodePathId(membershipId)}/payments/quote?${params.toString()}`);
  },
  getPaymentReceipt: (paymentId: string) =>
    api<ReceiptOut>(`/auth/org/payments/${encodePathId(paymentId)}/receipt`),
  uploadPaymentFile: (paymentId: string, file: Blob, filename: string) =>
    uploadMultipart<PaymentFileOut>(
      `/auth/org/payments/${encodePathId(paymentId)}/files`,
      file,
      filename,
      "Не удалось загрузить файл",
    ),
  /** Binary cheque for the viewer; private, never cached by the browser. */
  fetchPaymentFile: (paymentId: string, fileId: string) =>
    fetchBinary(`/auth/org/payments/${encodePathId(paymentId)}/files/${encodePathId(fileId)}`, "Не удалось открыть файл"),
  deletePaymentFile: (paymentId: string, fileId: string) =>
    deleteAuthed(`/auth/org/payments/${encodePathId(paymentId)}/files/${encodePathId(fileId)}`, "Не удалось удалить файл"),
  getPaymentSettings: () => api<PaymentSettings>("/auth/org/settings/payments"),
  updatePaymentSettings: (data: PaymentSettingsUpdate) =>
    api<PaymentSettings>("/auth/org/settings/payments", { method: "PUT", body: data }),

  // ── Payroll (owner only; every route answers 403 to anyone else) ───────
  // Errors: `detail: {code, message, ...}` - ApiError.message is `detail.message`, ApiError.code is `detail.code`.
  getPayrollSettings: () => api<PayrollSettings>("/auth/org/payroll/settings"),
  updatePayrollSettings: (data: { divisor: number }) =>
    api<PayrollSettings>("/auth/org/payroll/settings", { method: "PUT", body: data }),
  /** Teachers with completed lessons in the month (`month` = YYYY-MM): types, suggested percents, saved sheet, warnings. */
  getPayrollMonth: (month: string) => api<PayrollMonthOverview>(`/auth/org/payroll/months/${encodePathId(month)}`),
  /** Preview only: nothing is written. */
  calculatePayroll: async (month: string, body: PayrollCalculateBody): Promise<PayrollSheet[]> =>
    (await api<PayrollCalculateResponse>(`/auth/org/payroll/months/${encodePathId(month)}/calculate`, { method: "POST", body })).sheets,
  /** Saves a sheet; when the teacher already has one for the month `revision` (the one the owner saw) is required. */
  savePayrollSheet: (body: PayrollSaveBody) => api<PayrollSheet>("/auth/org/payroll/sheets", { method: "POST", body }),
  listPayrollSheets: (month: string) =>
    api<PayrollSheetBrief[]>(`/auth/org/payroll/sheets?month=${encodeURIComponent(month)}`),
  getPayrollSheet: (sheetId: string) => api<PayrollSheet>(`/auth/org/payroll/sheets/${encodePathId(sheetId)}`),
  /** A new revision; 409 `SHEET_REVISION_CONFLICT` when somebody else saved first. `recalculate: true` is «Пересчитать». */
  patchPayrollSheet: (sheetId: string, body: PayrollPatchBody) =>
    api<PayrollSheet>(`/auth/org/payroll/sheets/${encodePathId(sheetId)}`, { method: "PATCH", body }),
  getPayrollRevisions: (sheetId: string) =>
    api<PayrollRevision[]>(`/auth/org/payroll/sheets/${encodePathId(sheetId)}/revisions`),
  /** What a recalculation by the current data would change in the saved sheet, line by line. */
  getPayrollDiff: (sheetId: string) => api<PayrollDiff>(`/auth/org/payroll/sheets/${encodePathId(sheetId)}/diff`),
  downloadPayrollSheet: (sheetId: string, fallbackName: string) =>
    fetchFile(`/auth/org/payroll/sheets/${encodePathId(sheetId)}/export.xlsx`, fallbackName, "Не удалось скачать Excel"),
  downloadPayrollMonth: (month: string, fallbackName: string) =>
    fetchFile(`/auth/org/payroll/months/${encodePathId(month)}/export.xlsx`, fallbackName, "Не удалось скачать Excel"),

  // ── Bulk import (xlsx) ────────────────────────────────────────────────
  downloadImportTemplate: async (): Promise<Blob> => {
    const res = await fetchAuthed(`${AUTH_API_V1}/auth/org/import/template`, {
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

/** Server error text for a non-OK Response: string detail, {message}, or validation list. */
async function readErrorMessage(res: Response, fallback: string): Promise<{ message: string; code?: string }> {
  const text = await res.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  const detail = data?.detail;
  if (typeof detail === "string") return { message: detail };
  if (Array.isArray(detail)) return { message: detail.map((e: any) => e?.msg || String(e)).join("; ") || fallback };
  if (detail && typeof detail === "object") return { message: detail.message || fallback, code: detail.code };
  return { message: fallback };
}

/**
 * fetch with one token refresh on 401, like api(): after a successful refresh
 * the same request is repeated once; a second 401 sends the user to the login.
 */
async function fetchAuthed(url: string, init: RequestInit): Promise<Response> {
  let res = await fetchOrThrow(url, init);
  if (res.status !== 401) return res;
  const refresh = await tryRefreshToken();
  if (refresh.kind === "transient") throw new ApiError(refresh.status, REFRESH_UNAVAILABLE_MESSAGE);
  if (refresh.kind === "ok") {
    res = await fetchOrThrow(url, init);
    if (res.status !== 401) return res;
  }
  await endDeadSession();
  return res;
}

/** Multipart upload of one file field named "file" (the browser sets the boundary). */
async function uploadMultipart<T>(endpoint: string, file: Blob, filename: string, fallback: string): Promise<T> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetchAuthed(`${AUTH_API_V1}${endpoint}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: form,
  });
  if (!res.ok) {
    const { message, code } = await readErrorMessage(res, fallback);
    throw new ApiError(res.status, message, code);
  }
  return (await res.json()) as T;
}

/** Authenticated binary GET, modelled on downloadExamPrintPdf. */
async function fetchBinary(endpoint: string, fallback: string): Promise<Blob> {
  const res = await fetchAuthed(`${AUTH_API_V1}${endpoint}`, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const { message, code } = await readErrorMessage(res, fallback);
    throw new ApiError(res.status, message, code);
  }
  return res.blob();
}

/**
 * Authenticated file download (an .xlsx): the bytes and the name from `Content-Disposition`.  A cross-origin
 * answer hides that header unless the server lists it in `Access-Control-Expose-Headers`; `fallbackName` is
 * used then.
 */
async function fetchFile(endpoint: string, fallbackName: string, fallbackError: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetchAuthed(`${AUTH_API_V1}${endpoint}`, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const { message, code } = await readErrorMessage(res, fallbackError);
    throw new ApiError(res.status, message, code);
  }
  const blob = await res.blob();
  return { blob, filename: filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackName) };
}

/** DELETE that does not care what (if anything) the server answers on success. */
async function deleteAuthed(endpoint: string, fallback: string): Promise<void> {
  const res = await fetchAuthed(`${AUTH_API_V1}${endpoint}`, { method: "DELETE", credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const { message, code } = await readErrorMessage(res, fallback);
    throw new ApiError(res.status, message, code);
  }
}

async function uploadImport<T>(endpoint: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  // No Content-Type header — the browser sets the multipart boundary itself.
  const res = await fetchAuthed(`${AUTH_API_V1}${endpoint}`, {
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
    api<any>(`/auth/diagnostic/${encodeURIComponent(code)}`, { noAuth: true }),
  confirm: (code: string) =>
    api<any>(`/auth/diagnostic/${encodeURIComponent(code)}/confirm`, {
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
    diagApi<any>(`/analytics/students/${studentId}/skill-map`, "staff"),
  studentTimeline: (studentId: string) =>
    diagApi<any>(`/analytics/students/${studentId}/timeline`, "staff"),
  studentReport: (studentId: string, sessionId?: string | null) => {
    const query = new URLSearchParams({ _t: String(Date.now()) });
    if (sessionId) query.set("session_id", sessionId);
    return diagApi<any>(`/analytics/students/${encodePathId(studentId)}/report?${query.toString()}`, "staff");
  },

  // Group analytics — передаём student_ids списком
  groupOverview: (studentIds: string[]) =>
    diagApi<any>(`/analytics/groups/overview?${studentIds.map(id => `student_ids=${id}`).join("&")}`, "staff"),
  groupHeatmap: (studentIds: string[]) =>
    diagApi<any>(`/analytics/groups/heatmap?${studentIds.map(id => `student_ids=${id}`).join("&")}`, "staff"),

  // Org analytics
  orgLiveQueue: (hours?: number) =>
    diagApi<any>(`/analytics/org/live-queue${hours ? `?hours=${hours}` : ""}`, "staff"),
  orgStats: () => diagApi<any>("/analytics/org/stats", "staff"),
  orgOverview: () => diagApi<any>("/analytics/org/overview", "staff"),
  orgEnrollment: (days?: number) =>
    diagApi<any>(`/analytics/org/enrollment${days ? `?days=${days}` : ""}`, "staff"),
  orgProblemSkills: () => diagApi<any>("/analytics/org/problem-skills", "staff"),
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
  attested_fields?: string[] | null;
  content_quality?: Record<string, unknown> | null;
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

export interface ResolvedDiagnosticSession {
  session_id: string;
  status: "active" | "completed";
  items_answered: number;
  current_task: DiagTaskOut | null;
  total_time_ms: number;
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
  total_time_ms?: number;
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
  resolveSession: (inviteCode: string) =>
    diagServiceApi<ResolvedDiagnosticSession>(
      `/diagnostic/sessions/by-invite?invite_code=${encodeURIComponent(inviteCode)}`, "student",
    ),
  createSession: (data: {
    student_id: string;
    grade_level: number;
    invite_code?: string;
    prior_theta?: number;
  }) =>
    diagServiceApi<{ session_id: string; first_task: DiagTaskOut }>(
      "/diagnostic/sessions", "student",
      { method: "POST", body: data },
    ),

  submitAnswer: (
    sessionId: string,
    data: { task_id: string; student_answer: string; time_ms?: number },
    inviteCode: string,
  ) =>
    diagServiceApi<DiagAnswerResult>(
      `/diagnostic/sessions/${sessionId}/answer`, "student",
      { method: "POST", body: data, inviteCode },
    ),

  getReport: (sessionId: string, inviteCode: string) =>
    diagServiceApi<DiagReport>(
      `/diagnostic/sessions/${sessionId}/report?invite_code=${encodeURIComponent(inviteCode)}`, "student",
    ),
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
  /** Delivery controls the assignment lifecycle: print packages never open a lobby. */
  delivery_mode: "online" | "print";
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
  status: "lobby" | "print_ready" | "active" | "closed";
  delivery_mode: "online" | "print" | "hybrid";
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

/**
 * Presentation settings for a single task in a printed exam.  They are
 * intentionally independent from the original task record: changing a paper
 * layout must never rewrite a task, its answer, or its distractors.
 */
export interface PrintTaskLayout {
  response_kind: "choice" | "open";
  answer_location: "inline" | "answer_sheet";
  answer_lines: number;
  work_lines: number;
}

export interface PrintExamLayout {
  schema_version: number;
  answer_sheet_enabled: boolean;
  variants: Record<string, Record<string, PrintTaskLayout>>;
}

export interface PrintPackageMetadata {
  id?: string;
  version: number;
  status: "ready" | "released" | "completed" | "voided";
  created_at?: string | null;
  released_at?: string | null;
  snapshot_sha256?: string;
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
    shuffle_options?: boolean;
    mc_mode?: string;
    teacher_name?: string;
    delivery_mode?: "online" | "print";
  }) =>
    examApi<{ exam_id: string; access_code?: string; status: string; tasks_count: number; variants_count: number; group_id?: string; group_name?: string; class_level?: number; skills_covered: string[] }>(
      "/exams/generate", "staff",
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
    return examApi<ExamSummary[]>(qs ? `/exams?${qs}` : "/exams", "staff");
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
      >(`/exams?${params.toString()}`, "staff");

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
    return examApi<AdminExamMonitorResponse>(`/admin/exams/monitor?${params.toString()}`, "staff");
  },

  /** Teacher-profile visual data for an administrator, without any controls or access code. */
  getAdminView: (examId: string) => examApi<AdminExamView>(`/admin/exams/${examId}/view`, "staff"),

  /** Read-only exam metadata. Safe for the admin monitoring surface. */
  getSummary: (examId: string) => examApi<ExamSummary>(`/exams/${examId}`, "staff"),

  /** Compact server-authoritative state for Dashboard live exam cards. */
  getLiveDashboardSummary: () =>
    examApi<LiveExamDashboardSummary[]>("/exams/live-summary", "staff"),

  /** Revoke an unstarted concrete lesson delivery without mutating task history. */
  cancelDelivery: (examId: string, data: { reason: string }) =>
    examApi<{
      exam_id: string;
      status: "draft" | "variants_ready";
      delivery_mode: "online" | "print" | "hybrid";
      requires_clone_for_print: boolean;
    }>(`/exams/${examId}/delivery/cancel`, "staff", { method: "POST", body: data }),

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
      delivery_mode: "online" | "print";
      print_package?: PrintPackageMetadata | null;
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
    }>(`/exams/${examId}/draft`, "staff"),

  /** Persist the paper-only answer/work-space layout before it is frozen. */
  updatePrintLayout: (examId: string, layout: PrintExamLayout) =>
    examApi<{ exam_id: string; layout: PrintExamLayout }>(`/exams/${examId}/print-layout`, "staff", {
      method: "PUT",
      body: { layout },
    }),

  /** Freeze a staff-only printable package for one concrete lesson. */
  preparePrintPackage: (examId: string, data: { group_id: string; lesson_id: string; lesson_date: string }) =>
    examApi<{
      exam_id: string;
      status: "print_ready";
      group_id: string;
      group_name?: string | null;
      scheduled_lesson_id: string;
      scheduled_lesson_date: string;
      print_package: PrintPackageMetadata;
    }>(`/exams/${examId}/print-package/prepare`, "staff", { method: "POST", body: data }),

  /** Mark a scheduled paper exam as physically handed out/in progress. */
  startPrintPackage: (examId: string) =>
    examApi<{ exam_id: string; status: "active"; print_package: PrintPackageMetadata }>(
      `/exams/${examId}/print-package/start`, "staff",
      { method: "POST" },
    ),

  getPrintPackage: (examId: string) =>
    examApi<{ exam_id: string; status: string; print_package: PrintPackageMetadata }>(
      `/exams/${examId}/print-package`, "staff",
    ),

  downloadStudentPrintPdf: (examId: string, variantNumber = 1) =>
    downloadExamPrintPdf(examId, "student", variantNumber),

  downloadTeacherPrintKey: (examId: string, variantNumber = 1) =>
    downloadExamPrintPdf(examId, "teacher-key", variantNumber),

  previewStudentPrintPdf: (examId: string, variantNumber = 1) =>
    previewExamPrintPdf(examId, "student", variantNumber),

  previewTeacherPrintKey: (examId: string, variantNumber = 1) =>
    previewExamPrintPdf(examId, "teacher-key", variantNumber),

  /** Get alternative tasks for replacing one task in a draft variant */
  getAlternatives: (examId: string, variantNumber: number, taskId: string) =>
    examApi<Array<{
      task_id: string;
      question_text: string;
      question_latex: string | null;
      difficulty: string;
      correct_answer: string;
      answer_type: string;
    }>>(`/exams/${examId}/draft/alternatives?variant_number=${variantNumber}&task_id=${encodeURIComponent(taskId)}`, "staff"),

  /** Replace a task in a draft variant */
  replaceTask: (examId: string, data: { variant_number: number; task_id: string; old_task_id?: string; new_task_id?: string }) =>
    examApi<{ status: string; new_task: any }>(`/exams/${examId}/draft/replace-task`, "staff", {
      method: "POST",
      body: data,
    }),

  /** Schedule a draft for one concrete lesson and open its lobby. */
  publish: (examId: string, data: { lesson_id: string; lesson_date: string; teacher_name?: string; subject?: string; group_id?: string; group_name?: string; class_level?: number }) =>
    examApi<PublishExamResult>(`/exams/${examId}/publish`, "staff", {
      method: "POST",
      body: data,
    }),

  /** Close an active exam */
  close: (examId: string) =>
    examApi<{ exam_id: string; status: string }>(`/exams/${examId}/close`, "staff", { method: "POST" }),

  /** Get sessions list for an exam (teacher) */
  getSessions: (examId: string) => examApi<any[]>(`/exams/${examId}/sessions`, "staff"),

  /** Completed online attempts for one student, scoped by current staff access. */
  getStudentHistory: (studentId: string) =>
    examApi<NonNullable<StudentProfile["exams"]>>(
      `/students/${encodeURIComponent(studentId)}/exam-history`
    , "staff"),

  /** Get analytics for an exam (teacher) */
  getAnalytics: (examId: string) => examApi<any>(`/exams/${examId}/analytics`, "staff"),

  /** Get cached narrative report for an exam (teacher) */
  getReport: (examId: string) => examApi<any>(`/exams/${examId}/report`, "staff"),

  /** Generate on-demand LLM narrative report for an exam (teacher) */
  generateReport: (examId: string, force = true) =>
    examApi<any>(`/exams/${examId}/report?force=${force}`, "staff", { method: "POST" }),

  /** Toggle is_pinned (Library favourite) */
  pin: (examId: string) =>
    examApi<{ exam_id: string; is_pinned: boolean }>(`/exams/${examId}/pin`, "staff", { method: "POST" }),

  /** Clone a template, optionally binding it to a new group */
  clone: (examId: string, data?: { title?: string; group_id?: string; group_name?: string; class_level?: number }) =>
    examApi<{ exam_id: string; title: string; status: string; source_exam_id: string; group_id?: string | null; group_name?: string | null }>(
      `/exams/${examId}/clone`, "staff",
      { method: "POST", body: data ?? {} },
    ),

  /** Rename an editable draft. Prepared and conducted runs stay immutable. */
  rename: (examId: string, title: string) =>
    examApi<{ exam_id: string; title: string; status: string }>(`/exams/${examId}/title`, "staff", {
      method: "PATCH",
      body: { title },
    }),

  /** Assign a draft to a group; publishing additionally requires one lesson occurrence. */
  assign: (examId: string, data: { group_id: string; group_name?: string; class_level?: number; teacher_name?: string; subject?: string; publish?: boolean; lesson_id?: string; lesson_date?: string }) =>
    examApi<{ exam_id: string; status: string; group_id: string; group_name?: string | null; access_code?: string | null; scheduled_lesson_id?: string | null; scheduled_lesson_date?: string | null; url?: string | null }>(
      `/exams/${examId}/assign`, "staff",
      { method: "POST", body: data },
    ),

  /** Delete an exam (soft archive by default, or permanent) */
  delete: (examId: string, permanent: boolean = false) =>
    examApi<{ ok: boolean; action: string; id: string }>(`/exams/${examId}?permanent=${permanent}`, "staff", { method: "DELETE" }),

  /** Restore an archived exam */
  restore: (examId: string) =>
    examApi<{ ok: boolean; action: string; id: string; status: string }>(`/exams/${examId}/restore`, "staff", { method: "POST" }),

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
    }>(`/exams/by-code/${encodeURIComponent(code)}`, "student"),

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
    }>(`/exams/by-code/${encodeURIComponent(code)}/check-student`, "student", {
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
    }>(`/exams/by-code/${encodeURIComponent(code)}/start`, "student", { method: "POST", body: data }),

  /** Auto-save student progress in real-time */
  saveProgress: (
    sessionId: string,
    data: { answers: Record<string, string>; time_spent_seconds?: number },
    sessionToken: string,
  ) =>
    examApi<{ ok: boolean; answered_count: number }>(`/exam-sessions/${sessionId}/progress`, "student", {
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
    }>(`/exams/by-code/${encodeURIComponent(code)}/session-status/${encodeURIComponent(sessionId)}`, "student", { sessionToken }),

  /** Teacher: bind a concrete lesson and open the lobby. */
  openLobby: (examId: string, data: { lesson_id: string; lesson_date: string }) =>
    examApi<{ status: string; access_code: string; url: string }>(`/exams/${examId}/open-lobby`, "staff", {
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
    }>(`/exams/lesson-binding?${params.toString()}`, "staff");
  },

  /** Teacher: Synchronously start exam from lobby */
  startLive: (examId: string) =>
    examApi<{ status: string; started_count: number }>(`/exams/${examId}/start-live`, "staff", {
      method: "POST",
    }),

  /** Teacher: clear the entry rate limits of an open exam (a classmate used up the failure budget of the school address) */
  resetEntryLimits: (examId: string) =>
    examApi<{ exam_id: string; reset: boolean }>(`/exams/${examId}/entry-limits/reset`, "staff", {
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
    }>(`/exams/${examId}/lobby-status`, "staff"),

  /** Teacher: Kick / remove student from lobby */
  kickStudent: (examId: string, sessionId: string) =>
    examApi<{ ok: boolean; kicked_session_id: string }>(`/exams/${examId}/sessions/${sessionId}`, "staff", {
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
    }>(`/exam-sessions/${sessionId}/submit`, "student", { method: "POST", body: data, sessionToken }),

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
      /** false until the whole exam is over: key / verdicts are withheld (null) */
      answer_key_available?: boolean;
      message?: string | null;
      tasks: Array<{
        task_id: string;
        text: string;
        question_latex?: string | null;
        options: string[];
        student_answer: string | null;
        correct_answer?: string | null;
        correct_answer_latex?: string | null;
        is_correct?: boolean | null;
        skill_name: string;
      }>;
    }>(`/exam-sessions/${sessionId}/results`, "student", { sessionToken }),
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
    , "staff").then((d) => (Array.isArray(d) ? d : []));
  },

  /** Оглавление учебника (дерево) */
  toc: (textbookId: string) =>
    examApi<TOCNode[]>(`/textbooks/${textbookId}/toc/tree`, "staff"),

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
    return examApi<TextbookTask[]>(`/textbooks/${textbookId}/tasks${qs ? `?${qs}` : ""}`, "staff");
  },

  /** Дерево навыков (для режима "По программе") */
  skillTree: (classLevel?: number) => {
    const qs = classLevel ? `?class_level=${classLevel}` : "";
    return examApi<SkillTreeNode[]>(`/textbooks/skills/tree${qs}`, "staff");
  },
};

export { api, ApiError };
