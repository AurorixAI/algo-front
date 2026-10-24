import { encodePathId } from "./encode-id";
import { listQuery } from "./substitutions";
import type {
  CandidatesOut,
  CreateSubstitutionBody,
  CreateSubstitutionOut,
  DecideBody,
  DecideBulkBody,
  DecideBulkOut,
  DecideOut,
  ExamBinding,
  LessonMoveBody,
  MovedFrom,
  LessonRosterStudent,
  MineOut,
  MoveCheckOut,
  MoveCheckParams,
  MyLessonsOut,
  StudentNotice,
  SubstitutionDetailOut,
  SubstitutionItem,
  SubstitutionListOut,
  SubstitutionListParams,
  SubstitutionOutcome,
  SubstitutionRequestMark,
  SubstitutionSummary,
  WithdrawBatchOut,
} from "./substitution-types";
import { loginUrlForPage } from "./safe-redirect";
import { STAFF_BUSY_MESSAGE, isStaffWriteBusy, staffBusyDelayMs, staffBusyRepeats } from "./staff-busy";
import type {
  EnrolPriceOverride,
  GroupPriceBrief,
  GroupPriceRequest,
  GroupPriceResult,
  GroupPriceList,
  GroupPrices,
  MembershipPrice,
  MembershipPriceChanged,
  PriceOverrideRequest,
} from "./group-price";
import type {
  BalancesPage,
  BalancesQuery,
  MembershipPaymentRow,
  PaymentCreate,
  PaymentFileOut,
  PaymentOut,
  PaymentPreview,
  PaymentSaveResult,
  PaymentSettings,
  PaymentSettingsChanged,
  PaymentSettingsUpdate,
  PaymentsStatusList,
  PaymentsSummary,
  PaymentBucket,
  PaymentWarning,
  PreviewQuery,
  ReceiptItems,
  ReceiptItemsQuery,
  ReceiptOut,
  ReceiptsQuery,
  ReceiptsReport,
  RefundCreate,
  RefundCreated,
  RefundVoided,
  StatementOut,
  StatementQuery,
  WriteoffCreate,
  WriteoffCreated,
  WriteoffVoided,
} from "./payments";
import { normalizePreview, normalizeRow, normalizeSaveResult, normalizeStatement } from "./payments-ledger";
import {
  normalizeApplied as normalizeOpeningApplied,
  normalizeImport as normalizeOpeningsImport,
  normalizeList as normalizeOpeningsList,
  normalizePreview as normalizeOpeningPreview,
  normalizeSummary as normalizeOpeningsSummary,
  OPENINGS_EXPORT_FALLBACK,
  type OpeningBatchApplied,
  type OpeningBatchItem,
  type OpeningBatchPreview,
  type OpeningsImportPreview,
  type OpeningsList,
  type OpeningsSummary,
} from "./openings";
import { normalizeBalances, normalizeItems, normalizeReport } from "./payments-income";
import {
  normalizeJournal,
  normalizeOverview,
  type IncomeOverview,
  type IncomeQuery,
  type JournalQuery,
  type PaymentsJournal,
} from "./payments-income-v2";
import { normalizeLessonTypeChanged, normalizeLessonTypes, type GroupLessonTypeChanged, type GroupLessonTypes, type LessonTypeRequest } from "./group-lesson-type";
import {
  filenameFromContentDisposition,
  type LessonType,
  type PayrollCalculateBody,
  type PayrollCalculateResponse,
  type PayrollDiff,
  type PayrollMonthOverview,
  type PayrollRateHistoryItem,
  type PayrollRateItem,
  type PayrollRatesPutBody,
  type PayrollRatesResponse,
  type PayrollPatchBody,
  type PayrollRevision,
  type PayrollSaveBody,
  type PayrollSettings,
  type PayrollSheet,
  type PayrollSheetBrief,
} from "./payroll";
// LOGIC-A («деньги»): the types and readers of its routes live in two files of their own (a separate section below).
import {
  normalizeImpact,
  normalizeLeavePreview,
  type LeavePreview,
  type OpeningIn,
  type OpeningOut,
  type OpeningPut,
  type OpeningSaved,
  type OpeningVoided,
  type PauseOut,
  type PauseSaved,
  type PauseVoided,
  type SettleItem,
  type SettledOut,
} from "./payments-logica";
import {
  normalizePayout,
  normalizePayoutState,
  type PayoutCreate,
  type PayoutCreated,
  type PayoutOut,
  type PayoutVoided,
  type PayrollSettingsFull,
} from "./payroll-logica";

import type {
  ArchiveGroupBody,
  ArchiveGroupResult,
  ArchiveImpact,
  HandoverBody,
  HandoverResult,
  ImportCountsB,
  ImportIssueB,
  ImportSkipped,
  InvitationRow,
  InviteInfo,
  LessonTeacherCandidates,
  LessonTeacherInfo,
  LessonTeacherPut,
  LessonTeacherResult,
  MemberListStatus,
  OpsWarning,
  OrgMemberRow,
  RemoveMemberResult,
  RemovalImpact,
  SaveAttendanceResult,
} from "./ops-b-types";

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
  /** Extra request headers (`Idempotency-Key` of a payment). */
  headers?: Record<string, string>;
  /** Cancels the request (a stale preview): the call then rejects with an `AbortError`. */
  signal?: AbortSignal;
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

/** `Retry-After` in whole seconds ("120") or as an HTTP-date (turned into the seconds left); garbage is not used.  Read for a 429 and a 503 only. */
function retryAfterSeconds(response: Response, anyStatus = false): number | undefined {
  if (!anyStatus && response.status !== 429 && response.status !== 503) return undefined;
  const raw = response.headers?.get?.("Retry-After")?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return seconds > 0 ? seconds : undefined;
  }
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return undefined;
  const left = Math.ceil((at - Date.now()) / 1000);
  return left > 0 ? left : undefined;
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
  const { method = "GET", body, token, noAuth = false, signal } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
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
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
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
          signal,
        });
      } catch (cause) {
        if (signal?.aborted) throw cause;
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
    // The exam service names an expected refusal next to its text: `{detail: "...", code: "EXAM_NOT_ARCHIVED"}`.
    const code = typeof error?.code === "string" ? error.code : undefined;
    throw new ApiError(response.status, message, code, undefined, undefined, retryAfterSeconds(response, response.status === 409));
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
  const path = `/exams/${encodePathId(examId)}/print-package/${encodePathId(String(kind))}/${encodePathId(String(variantNumber))}.pdf`;
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
  const path = `/exams/${encodePathId(examId)}/print-preview/${encodePathId(String(kind))}/${encodePathId(String(variantNumber))}.pdf`;
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
  /** GET/PUT /auth/me: may this user see money (owner; an administrator the owner allowed)?  Absent from an older server and from login answers. */
  payments_access?: boolean | null;
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
    /** LOGIC-B (O1): the date the slot starts acting. */
    validFrom?: string | null;
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
  /** LOGIC-B (O4): when the group went to the archive (naive UTC) and why; absent on an older server / for a live group. */
  archivedAt?: string | null;
  archiveReason?: string | null;
  /** LOGIC-B (O5): in the teacher's «Мои группы» only because of a substitution. */
  substitution?: boolean;
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
  /** LOGIC-B (O11): `null` when no room was given - the screens say «Кабинет не указан» (see `roomLabel`). */
  room: string | null;
  format: "offline" | "online";
  color: "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose";
  topic?: string;
  /** LOGIC-B (O1): the date a recurring slot starts acting («Действует с»); absent on an older server. */
  validFrom?: string | null;
  /** LOGIC-B (O11): non-blocking notes of a write (`ROOM_BUSY`). */
  warnings?: OpsWarning[];
}

export interface ScheduleOccurrence extends LessonEvent, Partial<LessonTeacherInfo> {
  occurrenceDate: string;
  isRescheduled: boolean;
  /** A concrete lesson added for one calendar date, not a recurring slot. */
  isOneOff?: boolean;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  originalRoom?: string | null;
  rescheduleReason?: string | null;
  /** LOGIC-B2: the waiting / last request for this lesson (owner, administrator and the teacher who asked). */
  substitutionRequest?: SubstitutionRequestMark | null;
  /** LOGIC-B2: a cancelled original says where it went («Урок перенесён на …») or that it is cancelled. */
  substitutionOutcome?: SubstitutionOutcome | null;
  /** #124: the new lesson of a move says where it came from («Перенесён с 25.10, 10:00»). */
  movedFrom?: MovedFrom | null;
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
  /** Decided excuses: the decision was made after the confirmation deadline. null / absent: not known, nothing is shown. */
  decided_after_deadline?: boolean | null;
  /** The day the deadline was (YYYY-MM-DD) when the decision was made; null for a lessons package or when not known. */
  deadline_at_decision?: string | null;
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
  /** LOGIC-A: the student is on a pause today (not in the class); `paused_until` = the last day of the live pause (ISO). Older servers do not send them. */
  on_pause?: boolean | null;
  paused_until?: string | null;
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
  /** LOGIC-B2: a cancelled original says where it went (optional in the journal). */
  substitutionOutcome?: SubstitutionOutcome | null;
  /** #124: the new lesson of a move says where it came from. */
  movedFrom?: MovedFrom | null;
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
  /** The decision was made after the confirmation deadline (owner / administrator only). null / absent: not known, nothing is shown. */
  decided_after_deadline?: boolean | null;
  /** The day the deadline was (YYYY-MM-DD) when the decision was made; null for a lessons package or when not known. */
  deadline_at_decision?: string | null;
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
  /** LOGIC-B (O7): lessonKey -> version of the lesson record; send it back as `expectedVersion`. */
  versions?: Record<string, number>;
  /** LOGIC-B (O5): lessonKey -> who teaches this lesson (a substitute or the group's teacher). */
  lessonTeachers?: Record<string, LessonTeacherInfo>;
  /** LOGIC-B2: lessonKey -> the request for this lesson (owner, administrator and the teacher who asked). */
  substitutionRequests?: Record<string, SubstitutionRequestMark>;
  /** LOGIC-B2: for a substitute only - the students of HIS lesson (the group page is closed to him). */
  lessonRoster?: LessonRosterStudent[] | null;
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
  /** LOGIC-B (O7): version of an `in_progress` record (the next save's `expectedVersion`). */
  version?: number | null;
  /** LOGIC-B (decision 7): the lesson is older than 7 days and only an administrator or the owner closes it. */
  requiresAdmin?: boolean;
  ageDays?: number;
  isSubstitution?: boolean;
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
    /** LOGIC-B2: who taught it and whether it was a substitute (never the reason). */
    teacherName?: string | null;
    isSubstitution?: boolean;
    /** #124: a lesson that a move created says where it came from. */
    movedFrom?: MovedFrom | null;
  }>;
  /** LOGIC-B2: cancelled / moved lessons of the month, without a reason. */
  notices?: StudentNotice[];
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
    api<InviteInfo>(
      `/auth/invite/${encodePathId(code)}`,
      { noAuth: true }
    ),

  acceptInvite: (data: {
    code: string;
    email: string;
    password: string;
    /** Absent for a returning member (the server keeps his name). */
    first_name?: string;
    last_name?: string;
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
  /** LOGIC-B (O10): the e-mail is required (422 EMAIL_REQUIRED); only the owner invites an administrator. */
  createInvitation: (data: { email: string; org_role: string }) =>
    api<InvitationRow>("/auth/org/invitations", {
      method: "POST", body: data
    }),
  listInvitations: () => api<InvitationRow[]>("/auth/org/invitations"),
  revokeInvitation: (id: string) =>
    api<{ message: string }>(`/auth/org/invitations/${encodePathId(id)}`, { method: "DELETE" }),

  // Members
  /** `status`: `active` (the default), `removed` (the former staff) or `all` (LOGIC-B O2). */
  listMembers: (status?: MemberListStatus) =>
    api<any[]>(`/auth/org/members${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  updateMemberRole: (memberId: string, role: string) =>
    api<any>(`/auth/org/members/${encodePathId(memberId)}/role?role=${encodeURIComponent(role)}`, { method: "PUT" }),
  removeMember: (memberId: string) =>
    api<RemoveMemberResult>(`/auth/org/members/${encodePathId(memberId)}`, { method: "DELETE" }),

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
    class_level?: number; group_id?: string; teacher_id?: string; has_group?: boolean; has_primary_group?: boolean;
    status?: string; exclude_status?: string; search?: string; limit?: number; offset?: number;
  }) => {
    const query = new URLSearchParams({ include_meta: "true" });
    if (params.class_level) query.set("class_level", String(params.class_level));
    if (params.group_id) query.set("group_id", params.group_id);
    if (params.teacher_id) query.set("teacher_id", params.teacher_id);
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
  getStudent: (id: string) => api<any>(`/auth/org/students/${encodePathId(id)}`),
  getStudentProfile: (id: string) => api<StudentProfile>(`/auth/org/students/${encodePathId(id)}/profile`),
  getStudentAttendanceSummary: (id: string, month?: string) =>
    api<StudentAttendanceSummary>(
      `/auth/org/students/${encodePathId(id)}/attendance${month ? `?month=${encodeURIComponent(month)}` : ""}`
    ),
  updateStudent: (id: string, data: any) =>
    api<any>(`/auth/org/students/${encodePathId(id)}`, { method: "PUT", body: data }),
  /** «Ученик ушёл из центра»: owner / administrator; closes every active membership. 409 when already archived. */
  archiveStudent: (id: string, reason?: string) =>
    api<StudentArchiveResult>(`/auth/org/students/${encodePathId(id)}/archive`, { method: "POST", body: reason ? { reason } : {} }),
  /** «Вернуть из архива» into the chosen groups (none = without a group). 409 when the student is not archived. */
  restoreStudent: (id: string, groupIds: string[]) =>
    api<StudentRestoreResult>(`/auth/org/students/${encodePathId(id)}/restore`, { method: "POST", body: { group_ids: groupIds } }),

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
  getGroup: (id: string) => api<GroupDetail>(`/auth/org/groups/${encodePathId(id)}`),
  getGroupStats: (id: string) => api<GroupStats>(`/auth/org/groups/${encodePathId(id)}/stats`),
  updateGroup: (id: string, data: Partial<{ name: string; class_level: number | null; teacher_id: string | null; description: string; max_students: number; lesson_type: LessonType }>) =>
    api<GroupInfo>(`/auth/org/groups/${encodePathId(id)}`, { method: "PUT", body: data }),
  /** LOGIC-B (O4): archiving is an operation of its own (`POST …/archive` after `GET …/archive-impact`); `PUT status` answers 422. */
  archiveGroup: (id: string, body: ArchiveGroupBody = {}) =>
    api<ArchiveGroupResult & GroupInfo>(`/auth/org/groups/${encodePathId(id)}/archive`, { method: "POST", body }),
  unarchiveGroup: (id: string, teacherId?: string | null) =>
    api<GroupInfo>(`/auth/org/groups/${encodePathId(id)}/restore`, {
      method: "POST",
      body: teacherId === undefined ? {} : { teacherId },
    }),
  /**
   * `mode: "transfer"` (default) closes the other memberships and makes this group the main one;
   * `"add"` keeps them.  The student takes the price of the group; `price_override` is an explicit individual
   * price (sum + reason) and is sent only by roles that may see money (the server answers 403 otherwise).
   */
  addStudentToGroup: (groupId: string, studentId: string, options?: { mode?: GroupJoinMode; price_override?: EnrolPriceOverride | null; opening_balance?: OpeningIn | null }) => {
    const query = options?.mode ? `?mode=${encodeURIComponent(options.mode)}` : "";
    // LOGIC-A decision 1: «оплачено до» / «долг на дату» of the new membership ride along (needs access to money).
    const extra = {
      ...(options?.price_override ? { price_override: options.price_override } : {}),
      ...(options?.opening_balance ? { opening_balance: options.opening_balance } : {}),
    };
    const body = Object.keys(extra).length > 0 ? extra : undefined;
    return api<{
      student_id: string;
      group_id: string;
      status: "added" | "unchanged";
      reason?: "already_in_target_group";
      display_id?: string | null;
      /** Server hints (third group, class mismatch); never a refusal. */
      warnings?: PaymentWarning[];
    }>(`/auth/org/groups/${encodePathId(groupId)}/students/${encodePathId(studentId)}${query}`, { method: "POST", body });
  },
  removeStudentFromGroup: (groupId: string, studentId: string) =>
    api<any>(`/auth/org/groups/${encodePathId(groupId)}/students/${encodePathId(studentId)}`, { method: "DELETE" }),
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
      `/auth/org/groups/${encodePathId(groupId)}/students/bulk${options?.mode ? `?mode=${encodeURIComponent(options.mode)}` : ""}`,
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
    api<LessonEvent[]>(`/auth/org/schedule${teacherId ? `?teacher_id=${encodeURIComponent(teacherId)}` : ""}`),
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
    room?: string | null;
    format?: "offline" | "online";
    color?: LessonEvent["color"];
    topic?: string;
  }) => api<ScheduleOccurrence>(`/auth/org/schedule/occurrences`, { method: "POST", body: data }),
  updateLesson: (lessonId: string, data: Partial<LessonEvent>) =>
    api<LessonEvent>(`/auth/org/schedule/lessons/${encodePathId(lessonId)}`, { method: "PUT", body: data }),
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
  ) => api<ScheduleOccurrence>(`/auth/org/schedule/lessons/${encodePathId(lessonId)}/reschedule`, { method: "POST", body: data }),
  reviseRecurringLesson: (
    lessonId: string,
    data: Partial<LessonEvent> & { effectiveFrom: string; reason: string },
  ) => api<LessonEvent>(`/auth/org/schedule/lessons/${encodePathId(lessonId)}/recurrence`, { method: "PUT", body: data }),
  getRecurringLessonEndImpact: (lessonId: string, effectiveFrom: string) => {
    const query = new URLSearchParams({ effective_from: effectiveFrom });
    return api<RecurringLessonEndImpact>(
      `/auth/org/schedule/lessons/${encodePathId(lessonId)}/recurrence/end-impact?${query.toString()}`,
    );
  },
  endRecurringLesson: (
    lessonId: string,
    data: { effectiveFrom: string; reason: string; releaseAffectedExams: boolean },
  ) => api<EndRecurringLessonResult>(
    `/auth/org/schedule/lessons/${encodePathId(lessonId)}/recurrence/end`,
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
    return api<GroupAttendance>(`/auth/org/groups/${encodePathId(groupId)}/attendance${query ? `?${query}` : ""}`);
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
      /** LOGIC-B (O7): the version this screen saw; another one on the server answers 409 ATTENDANCE_CONFLICT. */
      expectedVersion?: number;
      /** LOGIC-B (O8): the person confirmed that an exam is still running (409 LESSON_HAS_LIVE_EXAM asked for it). */
      acknowledgeLiveExam?: boolean;
    }
  ) =>
    api<SaveAttendanceResult & { ok: boolean; saved: boolean }>(`/auth/org/groups/${encodePathId(groupId)}/attendance`, { method: "POST", body: data }),

  startGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; topic?: string },
  ) =>
    api<{ ok: boolean; started: boolean; version?: number }>(`/auth/org/groups/${encodePathId(groupId)}/attendance/start`, { method: "POST", body: data }),

  reconcileMissedGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; topic?: string },
  ) =>
    api<{ ok: boolean; reconciled: boolean; version?: number }>(`/auth/org/groups/${encodePathId(groupId)}/attendance/reconcile`, { method: "POST", body: data }),

  cancelMissedGroupAttendance: (
    groupId: string,
    data: { lessonDate: string; lessonId: string; cancellationReason: string },
  ) =>
    api<{ ok: boolean; cancelled: boolean; version?: number }>(`/auth/org/groups/${encodePathId(groupId)}/attendance/reconcile/cancel`, { method: "POST", body: data }),

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
  /**
   * `expected_status` is the status the person SAW when deciding (optimistic concurrency): if somebody changed the excuse
   * meanwhile the server answers 409 `{code: "EXCUSE_CHANGED", message, item}` and writes nothing (see lib/excuse-conflict.ts).
   */
  reviewAttendanceExcuse: (id: string, data: { decision: "confirmed" | "rejected"; note?: string; expected_status?: ExcuseReviewStatus }) =>
    api<AttendanceExcuseItem>(`/auth/org/attendance/excuses/${encodePathId(id)}/review`, { method: "POST", body: data }),
  resetAttendanceExcuse: (id: string, data?: { expected_status?: ExcuseReviewStatus }) =>
    api<AttendanceExcuseItem>(`/auth/org/attendance/excuses/${encodePathId(id)}/reset`, { method: "POST", ...(data ? { body: data } : {}) }),
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
  getPaymentsStatus: (q: { bucket: PaymentBucket | "all" | "debt"; groupId?: string; teacherId?: string; search?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams({ bucket: q.bucket });
    if (q.groupId) params.set("group_id", q.groupId);
    if (q.teacherId) params.set("teacher_id", q.teacherId);
    if (q.search) params.set("search", q.search);
    params.set("limit", String(q.limit ?? 50));
    params.set("offset", String(q.offset ?? 0));
    return api<PaymentsStatusList>(`/auth/org/payments/status?${params.toString()}`)
      .then((page) => ({ ...page, items: (page?.items ?? []).map(normalizeRow) }));
  },
  getStudentMemberships: (studentId: string) =>
    api<MembershipPaymentRow[]>(`/auth/org/students/${encodePathId(studentId)}/memberships`)
      .then((rows) => (Array.isArray(rows) ? rows.map(normalizeRow) : [])),
  // ── Price of a group and the exception of one student (#105; money roles only) ──
  /** «Оплаты -> Цены групп»: every group that is not archived with its price today, the next scheduled price and the count of individual prices. */
  listGroupPrices: () => api<GroupPriceList>("/auth/org/group-prices"),
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
  setMembershipPrice: (membershipId: string, body: PriceOverrideRequest, options?: { dryRun?: boolean }) =>
    api<MembershipPriceChanged>(`/auth/org/memberships/${encodePathId(membershipId)}/price-override${options?.dryRun ? "?dry_run=true" : ""}`, {
      method: "PUT", body,
    }),
  listMembershipPayments: (membershipId: string, includeVoided = true) =>
    api<PaymentOut[]>(`/auth/org/memberships/${encodePathId(membershipId)}/payments?include_voided=${includeVoided}`),
  /** `Idempotency-Key`: one per opening of the dialog, so a double click or a retry cannot enter the money twice (409 `DUPLICATE_PAYMENT`). */
  createPayment: (membershipId: string, data: PaymentCreate, idempotencyKey?: string) =>
    api<PaymentSaveResult>(`/auth/org/memberships/${encodePathId(membershipId)}/payments`, {
      method: "POST", body: data, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    }).then(normalizeSaveResult),
  replacePayment: (paymentId: string, data: PaymentCreate & { reason?: string }, idempotencyKey?: string) =>
    api<PaymentSaveResult>(`/auth/org/payments/${encodePathId(paymentId)}/replace`, {
      method: "POST", body: data, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    }).then(normalizeSaveResult),
  voidPayment: (paymentId: string, reason: string) =>
    api<{ payment: PaymentOut; row: MembershipPaymentRow }>(`/auth/org/payments/${encodePathId(paymentId)}/void`, {
      method: "POST", body: { reason },
    }).then((result) => ({ ...result, row: normalizeRow(result.row) })),
  /** «Что закроет»: what is due now and, with `amount`, where exactly that money would go.  Pass a `signal` to drop a stale ask. */
  getPaymentPreview: (membershipId: string, q: PreviewQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (q.amount !== undefined) params.set("amount", String(q.amount));
    if (q.paid_on) params.set("paid_on", q.paid_on);
    if (q.replace_payment_id) params.set("replace_payment_id", q.replace_payment_id);
    const query = params.toString();
    return api<PaymentPreview>(`/auth/org/memberships/${encodePathId(membershipId)}/payments/preview${query ? `?${query}` : ""}`, { signal })
      .then(normalizePreview);
  },
  /** Writes off a part of the debt (or all of it) with a reason; the owner and the administrator. */
  createWriteoff: (membershipId: string, data: WriteoffCreate) =>
    api<WriteoffCreated>(`/auth/org/memberships/${encodePathId(membershipId)}/writeoffs`, { method: "POST", body: data })
      .then((result) => ({ ...result, row: normalizeRow(result.row) })),
  voidWriteoff: (writeoffId: string, reason: string) =>
    api<WriteoffVoided>(`/auth/org/writeoffs/${encodePathId(writeoffId)}/void`, { method: "POST", body: { reason } })
      .then((result) => ({ ...result, row: normalizeRow(result.row) })),
  /** Gives an advance back (a record of a refund, the payment stays). */
  createRefund: (membershipId: string, data: RefundCreate) =>
    api<RefundCreated>(`/auth/org/memberships/${encodePathId(membershipId)}/refunds`, { method: "POST", body: data })
      .then((result) => ({ ...result, row: normalizeRow(result.row) })),
  voidRefund: (refundId: string, reason: string) =>
    api<RefundVoided>(`/auth/org/refunds/${encodePathId(refundId)}/void`, { method: "POST", body: { reason } })
      .then((result) => ({ ...result, row: normalizeRow(result.row) })),
  /** The account of a student in a group: charges, payments, write-offs, refunds with the running balance. */
  getStatement: (membershipId: string, q: StatementQuery = {}) => {
    const params = new URLSearchParams();
    if (q.from) params.set("from", q.from);
    if (q.to) params.set("to", q.to);
    if (q.include_voided) params.set("include_voided", "true");
    const query = params.toString();
    return api<StatementOut>(`/auth/org/memberships/${encodePathId(membershipId)}/statement${query ? `?${query}` : ""}`).then(normalizeStatement);
  },
  /** The same statement as an .xlsx file (the server builds it). */
  exportStatement: (membershipId: string, q: StatementQuery = {}, fallbackName = "Выписка.xlsx") => {
    const params = new URLSearchParams({ format: "xlsx" });
    if (q.from) params.set("from", q.from);
    if (q.to) params.set("to", q.to);
    if (q.include_voided) params.set("include_voided", "true");
    return fetchFile(`/auth/org/memberships/${encodePathId(membershipId)}/statement/export?${params.toString()}`, fallbackName, "Не удалось скачать Excel");
  },
  /** «Поступления»: money received in a period, where it went, what is owed today; `reconciliation` says whether it adds up. */
  getReceiptsReport: (q: ReceiptsQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams({ from: q.from, to: q.to, group_by: q.group_by });
    if (q.method) params.set("method", q.method);
    if (q.group_id) params.set("group_id", q.group_id);
    if (q.teacher_id) params.set("teacher_id", q.teacher_id);
    return api<ReceiptsReport>(`/auth/org/payments/receipts?${params.toString()}`, { signal }).then(normalizeReport);
  },
  /** «Поступления» v2: everything above the journal in one answer (the cards, the sentence, the chart, the till, the groups of the month). */
  getIncomeOverview: (q: IncomeQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams({ from: q.from, to: q.to, period: q.period });
    if (q.method) params.set("method", q.method);
    return api<IncomeOverview>(`/auth/org/payments/income?${params.toString()}`, { signal }).then(normalizeOverview);
  },
  /** The journal of payments of a period: newest first, paged by the server; live payments (`status=active`) unless the screen asks for `status=all` (cancelled and corrected ones too); `kind` narrows to a part of «Куда ушли деньги». */
  getPaymentsJournal: (q: JournalQuery, signal?: AbortSignal) =>
    api<PaymentsJournal>(`/auth/org/payments/journal?${journalParams(q).toString()}`, { signal }).then(normalizeJournal),
  /** The same journal as an .xlsx file (the server builds it from every row of the filtered set). */
  exportPaymentsJournal: (q: Omit<JournalQuery, "page" | "size">, fallbackName = "Оплаты.xlsx") => {
    const params = journalParams(q);
    params.set("format", "xlsx");
    return fetchFile(`/auth/org/payments/journal/export?${params.toString()}`, fallbackName, "Не удалось скачать Excel");
  },
  /** The payments (write-offs, refunds) behind one figure of the report. */
  getReceiptItems: (q: ReceiptItemsQuery) => {
    const params = new URLSearchParams({ from: q.from, to: q.to, column: q.column });
    if (q.bucket) params.set("bucket", q.bucket);
    if (q.method) params.set("method", q.method);
    if (q.group_id) params.set("group_id", q.group_id);
    if (q.teacher_id) params.set("teacher_id", q.teacher_id);
    params.set("limit", String(q.limit ?? 50));
    params.set("offset", String(q.offset ?? 0));
    return api<ReceiptItems>(`/auth/org/payments/receipts/items?${params.toString()}`).then(normalizeItems);
  },
  /** Students with a debt / an advance today, for the position figures of the report. */
  getBalances: (q: BalancesQuery) => {
    const params = new URLSearchParams({ kind: q.kind });
    if (q.group_id) params.set("group_id", q.group_id);
    if (q.teacher_id) params.set("teacher_id", q.teacher_id);
    if (q.search) params.set("search", q.search);
    params.set("limit", String(q.limit ?? 50));
    params.set("offset", String(q.offset ?? 0));
    return api<BalancesPage>(`/auth/org/payments/balances?${params.toString()}`).then(normalizeBalances);
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
    api<PaymentSettingsChanged>("/auth/org/settings/payments", { method: "PUT", body: data }),
  /** What a new start of the accounting would change (`dry_run`: nothing is saved; the answer holds the CURRENT settings and the impact). */
  previewPaymentSettings: (data: PaymentSettingsUpdate) =>
    api<PaymentSettingsChanged>("/auth/org/settings/payments?dry_run=true", { method: "PUT", body: data }),

  // ── Payroll (owner only; every route answers 403 to anyone else) ───────
  // Errors: `detail: {code, message, ...}` - ApiError.message is `detail.message`, ApiError.code is `detail.code`.
  getPayrollSettings: () => api<PayrollSettings>("/auth/org/payroll/settings"),
  updatePayrollSettings: (data: { divisor: number }) =>
    api<PayrollSettings>("/auth/org/payroll/settings", { method: "PUT", body: data }),
  /** Rates of the teachers (UX-2): by type, in force in `month` (YYYY-MM), and the ones scheduled for later. */
  getPayrollRates: (month: string) =>
    api<PayrollRatesResponse>(`/auth/org/payroll/rates?month=${encodeURIComponent(month)}`),
  /** Sets the rates of one teacher from the month `valid_from` (YYYY-MM); saved sheets do not change. Answers with his item. */
  putPayrollRates: (teacherId: string, body: PayrollRatesPutBody) =>
    api<PayrollRateItem>(`/auth/org/payroll/rates/${encodePathId(teacherId)}`, { method: "PUT", body }),
  /** Every rate ever set for the teacher, newest first. */
  getPayrollRateHistory: (teacherId: string) =>
    api<PayrollRateHistoryItem[]>(`/auth/org/payroll/rates/${encodePathId(teacherId)}/history`),
  /** Teachers with completed lessons in the month (`month` = YYYY-MM): types, the rate of the month, saved sheet, warnings. */
  getPayrollMonth: (month: string) => api<PayrollMonthOverview>(`/auth/org/payroll/months/${encodePathId(month)}`),
  /** Preview only: nothing is written.  The rates are the stored ones (set in «Сотрудники»), `body` only narrows the teachers. */
  calculatePayroll: async (month: string, body: PayrollCalculateBody): Promise<PayrollSheet[]> =>
    (await api<PayrollCalculateResponse>(`/auth/org/payroll/months/${encodePathId(month)}/calculate`, { method: "POST", body })).sheets,
  /** Saves a sheet; when the teacher already has one for the month `revision` (the one the owner saw) is required. */
  savePayrollSheet: (body: PayrollSaveBody) => api<PayrollSheet>("/auth/org/payroll/sheets", { method: "POST", body }),
  listPayrollSheets: (month: string) =>
    api<PayrollSheetBrief[]>(`/auth/org/payroll/sheets?month=${encodeURIComponent(month)}`),
  getPayrollSheet: (sheetId: string) => api<PayrollSheet>(`/auth/org/payroll/sheets/${encodePathId(sheetId)}`),
  /** A new version; 409 `SHEET_REVISION_CONFLICT` when somebody else saved first. `recalculate: true` is «Пересчитать». */
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

  // ── LOGIC-A «деньги»: opening balance, pause, leave / archive with the money, payouts, lesson type ──
  // Contract: tests/fixtures/logicA (the frozen logicA_contract.json).  Errors carry `detail.{code, message, dates, students, fresh}`.
  /** The live opening balance of a membership («оплачено до» / «долг на дату»); null when there is none. */
  getOpeningBalance: (membershipId: string) =>
    api<OpeningOut | null>(`/auth/org/memberships/${encodePathId(membershipId)}/opening-balance`),
  /** `dryRun`: nothing is written, the answer holds the `impact` (the ledger before / after).  All three fields empty: the live one is voided. */
  putOpeningBalance: (membershipId: string, body: OpeningPut, options?: { dryRun?: boolean }) =>
    api<OpeningSaved>(`/auth/org/memberships/${encodePathId(membershipId)}/opening-balance${options?.dryRun ? "?dry_run=true" : ""}`, { method: "PUT", body })
      .then((result) => ({ ...result, impact: normalizeImpact(result.impact), row: result.row ? normalizeRow(result.row) : null })),
  voidOpeningBalance: (openingId: string, reason: string) =>
    api<OpeningVoided>(`/auth/org/opening-balances/${encodePathId(openingId)}/void`, { method: "POST", body: { reason } })
      .then((result) => ({ ...result, impact: normalizeImpact(result.impact), row: result.row ? normalizeRow(result.row) : null })),
  // ── ROADMAP #125 «Остатки на начало»: the table, the batch (preview -> apply), the checklist state, the Excel round trip ──
  // Contract: tests/fixtures/openings (openings_contract.json of the backend).  Money roles only (403 for everybody else).
  /** The table of every membership of the centre by group; `include_left`: the students who left before the accounting start (only a debt). */
  listOpenings: (params: { group_id?: string; include_left?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.group_id) query.set("group_id", params.group_id);
    if (params.include_left) query.set("include_left", "true");
    const suffix = query.toString();
    return api<OpeningsList>(`/auth/org/opening-balances${suffix ? `?${suffix}` : ""}`).then(normalizeOpeningsList);
  },
  /** No rows: the banner of «Должники», the checklist of the settings, the button of «Оплаты». */
  getOpeningsSummary: () => api<OpeningsSummary>("/auth/org/opening-balances/summary").then(normalizeOpeningsSummary),
  /** The dry run: nothing is written; the answer holds the summary, the effect on the debts, the errors per row and the `digest`. */
  previewOpeningBatch: (body: { items: OpeningBatchItem[]; reason?: string | null }, options?: { signal?: AbortSignal }) =>
    api<OpeningBatchPreview>("/auth/org/opening-balances/batch/preview", { method: "POST", body: { items: body.items, ...(body.reason ? { reason: body.reason } : {}) }, signal: options?.signal })
      .then(normalizeOpeningPreview),
  /** All or nothing.  The same `idempotency_key` with the same body gives the same answer (`replayed`). */
  applyOpeningBatch: (body: { items: OpeningBatchItem[]; reason?: string | null; idempotency_key: string; digest: string }) =>
    api<OpeningBatchApplied>("/auth/org/opening-balances/batch", { method: "POST", body: { items: body.items, ...(body.reason ? { reason: body.reason } : {}), idempotency_key: body.idempotency_key, digest: body.digest } })
      .then(normalizeOpeningApplied),
  /** «Готово» / «Не нужно» of the banner and the checklist (`pending` is set by the release script only). */
  setOpeningsState: (state: "done" | "skipped") =>
    api<OpeningsSummary>("/auth/org/opening-balances/state", { method: "POST", body: { state } }).then(normalizeOpeningsSummary),
  exportOpenings: (params: { group_id?: string; missing_only?: boolean; q?: string; include_left?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.group_id) query.set("group_id", params.group_id);
    if (params.missing_only) query.set("missing_only", "true");
    if (params.q) query.set("q", params.q);
    if (params.include_left) query.set("include_left", "true");
    const suffix = query.toString();
    return fetchFile(`/auth/org/opening-balances/export${suffix ? `?${suffix}` : ""}`, OPENINGS_EXPORT_FALLBACK, "Не удалось скачать файл");
  },
  /** The file is read and compared; `batch_items` + `digest` go to `applyOpeningBatch` (the file is never uploaded twice). */
  importOpeningsPreview: (file: File) =>
    uploadMultipart<OpeningsImportPreview>("/auth/org/opening-balances/import/preview", file, file.name, "Не удалось прочитать файл").then(normalizeOpeningsImport),
  listPauses: (membershipId: string) =>
    api<PauseOut[]>(`/auth/org/memberships/${encodePathId(membershipId)}/pauses`).then((list) => (Array.isArray(list) ? list : [])),
  /** `dryRun`: the calculation and the warnings without writing; `Idempotency-Key` is optional (a repeat of the same range is a no-op). */
  createPause: (membershipId: string, body: { first_day: string; last_day: string; reason?: string }, options?: { dryRun?: boolean; idempotencyKey?: string }) =>
    api<PauseSaved>(`/auth/org/memberships/${encodePathId(membershipId)}/pauses${options?.dryRun ? "?dry_run=true" : ""}`, {
      method: "POST", body, headers: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    }).then((result) => ({ ...result, impact: normalizeImpact(result.impact), row: result.row ? normalizeRow(result.row) : null })),
  /** Shortens (or moves) a pause: «Закончить паузу» sends `last_day` = yesterday. */
  patchPause: (pauseId: string, body: { first_day?: string | null; last_day?: string | null; reason?: string | null }, options?: { dryRun?: boolean }) =>
    api<PauseSaved>(`/auth/org/pauses/${encodePathId(pauseId)}${options?.dryRun ? "?dry_run=true" : ""}`, { method: "PATCH", body })
      .then((result) => ({ ...result, impact: normalizeImpact(result.impact), row: result.row ? normalizeRow(result.row) : null })),
  voidPause: (pauseId: string, reason: string) =>
    api<PauseVoided>(`/auth/org/pauses/${encodePathId(pauseId)}/void`, { method: "POST", body: { reason } })
      .then((result) => ({ ...result, impact: normalizeImpact(result.impact), row: result.row ? normalizeRow(result.row) : null })),
  /** What leaving the group would leave on the account of the student (`money` is null for a role without access to money). */
  getLeavePreview: (groupId: string, studentId: string) =>
    api<LeavePreview>(`/auth/org/groups/${encodePathId(groupId)}/students/${encodePathId(studentId)}/leave-preview`).then(normalizeLeavePreview),
  /** Takes the student out of the group and settles the money in one transaction (`settle` per membership); 409 `BALANCE_CHANGED` carries the fresh numbers. */
  leaveStudent: (groupId: string, studentId: string, body: { reason?: string | null; settle?: SettleItem[] }) =>
    api<{ message: string; settled: SettledOut[] }>(`/auth/org/groups/${encodePathId(groupId)}/students/${encodePathId(studentId)}/leave`, { method: "POST", body }),
  getArchivePreview: (studentId: string) =>
    api<LeavePreview>(`/auth/org/students/${encodePathId(studentId)}/archive-preview`).then(normalizeLeavePreview),
  /** The archive with the money settled: `reason` + `settle` (the answer is the archived student + `settled`). */
  archiveStudentSettled: (studentId: string, body: { reason?: string | null; settle?: SettleItem[] }) =>
    api<StudentArchiveResult & { settled?: SettledOut[] }>(`/auth/org/students/${encodePathId(studentId)}/archive`, { method: "POST", body }),
  /** F14: the type of the lessons of a group by date (the current one and the history). */
  getGroupLessonTypes: (groupId: string) =>
    api<GroupLessonTypes>(`/auth/org/groups/${encodePathId(groupId)}/lesson-types`).then(normalizeLessonTypes),
  /** `dryRun`: nothing is written, the answer holds the `impact` (the saved sheets that will say «Есть изменения»; the list is for the owner). */
  setGroupLessonType: (groupId: string, body: LessonTypeRequest, options?: { dryRun?: boolean }) =>
    api<GroupLessonTypeChanged>(`/auth/org/groups/${encodePathId(groupId)}/lesson-type${options?.dryRun ? "?dry_run=true" : ""}`, { method: "PUT", body })
      .then(normalizeLessonTypeChanged),
  /** The divisor by month (F7): the current one and the history. */
  getPayrollSettingsHistory: () => api<PayrollSettingsFull>("/auth/org/payroll/settings"),
  setPayrollDivisor: (body: { divisor: number; valid_from?: string }) =>
    api<PayrollSettingsFull>("/auth/org/payroll/settings", { method: "PUT", body }),
  /** Payouts of the month (live and cancelled), optionally of one teacher. */
  listPayrollPayouts: (month: string, teacherId?: string) =>
    api<PayoutOut[]>(`/auth/org/payroll/payouts?month=${encodeURIComponent(month)}${teacherId ? `&teacher_id=${encodeURIComponent(teacherId)}` : ""}`)
      .then((list) => (Array.isArray(list) ? list.map(normalizePayout).filter((item): item is PayoutOut => item !== null) : [])),
  /** «Отметить выплату»; `Idempotency-Key`: one per opening of the dialog (409 `DUPLICATE_PAYOUT` carries `payout_id`). */
  createPayrollPayout: (sheetId: string, body: PayoutCreate, idempotencyKey?: string) =>
    api<PayoutCreated>(`/auth/org/payroll/sheets/${encodePathId(sheetId)}/payouts`, {
      method: "POST", body, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    }).then((result) => ({ payout: normalizePayout(result.payout) as PayoutOut, state: normalizePayoutState(result.state)! })),
  voidPayrollPayout: (payoutId: string, reason: string) =>
    api<PayoutVoided>(`/auth/org/payroll/payouts/${encodePathId(payoutId)}/void`, { method: "POST", body: { reason } })
      .then((result) => ({ payout: normalizePayout(result.payout) as PayoutOut, state: normalizePayoutState(result.state)! })),

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
  /** LOGIC-B (O9): a code of a blocking issue (`TEACHER_NOT_FOUND`, `TEACHER_NOT_TEACHER`, `TEACHER_INACTIVE`, …). */
  code?: ImportIssueB["code"];
}

export interface ImportCounts {
  teachers_new: number;
  teachers_existing: number;
  groups_new: number;
  groups_existing: number;
  students_new: number;
  students_existing: number;
  /** LOGIC-A decision 1: students whose row carries an opening balance («оплачено до» / «долг на дату»). */
  openings?: number;
  /** LOGIC-B (O9): what the import did with the students of the file. */
  students_enrolled?: ImportCountsB["students_enrolled"];
  students_unchanged?: ImportCountsB["students_unchanged"];
  students_skipped?: ImportCountsB["students_skipped"];
}

export interface ImportPreviewResult {
  ok: boolean;
  counts: ImportCounts;
  issues: ImportIssue[];
  /** LOGIC-B (O9): rows that are not imported and why. */
  skipped?: ImportSkipped[];
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
  skipped?: ImportSkipped[];
  /** LOGIC-B (O9): the groups this import created (there is no roll-back: the list is the way back). */
  created_groups?: Array<{ id: string; name: string }>;
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

/** The query string of the payments journal (and of its export): only what is set. */
function journalParams(q: Omit<JournalQuery, "page" | "size"> & { page?: number; size?: number }): URLSearchParams {
  const params = new URLSearchParams({ from: q.from, to: q.to });
  if (q.page) params.set("page", String(q.page));
  if (q.size) params.set("size", String(q.size));
  for (const key of ["method", "created_by", "q", "status", "kind"] as const) {
    const value = q[key];
    if (value) params.set(key, value);
  }
  return params;
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
    api<any>(`/auth/diagnostic/${encodePathId(code)}`, { noAuth: true }),
  confirm: (code: string) =>
    api<any>(`/auth/diagnostic/${encodePathId(code)}/confirm`, {
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
    diagApi<any>(`/analytics/students/${encodePathId(studentId)}/skill-map`, "staff"),
  studentTimeline: (studentId: string) =>
    diagApi<any>(`/analytics/students/${encodePathId(studentId)}/timeline`, "staff"),
  studentReport: (studentId: string, sessionId?: string | null) => {
    const query = new URLSearchParams({ _t: String(Date.now()) });
    if (sessionId) query.set("session_id", sessionId);
    return diagApi<any>(`/analytics/students/${encodePathId(studentId)}/report?${query.toString()}`, "staff");
  },

  // Group analytics — передаём student_ids списком
  groupOverview: (studentIds: string[]) =>
    diagApi<any>(`/analytics/groups/overview?${new URLSearchParams(studentIds.map((id) => ["student_ids", id])).toString()}`, "staff"),
  groupHeatmap: (studentIds: string[]) =>
    diagApi<any>(`/analytics/groups/heatmap?${new URLSearchParams(studentIds.map((id) => ["student_ids", id])).toString()}`, "staff"),

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
      `/diagnostic/sessions/${encodePathId(sessionId)}/answer`, "student",
      { method: "POST", body: data, inviteCode },
    ),

  getReport: (sessionId: string, inviteCode: string) =>
    diagServiceApi<DiagReport>(
      // the invite code is a capability: in a header (like `answer`), not in the URL (history, proxy logs)
      `/diagnostic/sessions/${encodePathId(sessionId)}/report`, "student",
      { inviteCode },
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
  getAdminView: (examId: string) => examApi<AdminExamView>(`/admin/exams/${encodePathId(examId)}/view`, "staff"),

  /** Read-only exam metadata. Safe for the admin monitoring surface. */
  getSummary: (examId: string) => examApi<ExamSummary>(`/exams/${encodePathId(examId)}`, "staff"),

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
    }>(`/exams/${encodePathId(examId)}/delivery/cancel`, "staff", { method: "POST", body: data }),

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
    }>(`/exams/${encodePathId(examId)}/draft`, "staff"),

  /** Persist the paper-only answer/work-space layout before it is frozen. */
  updatePrintLayout: (examId: string, layout: PrintExamLayout) =>
    examApi<{ exam_id: string; layout: PrintExamLayout }>(`/exams/${encodePathId(examId)}/print-layout`, "staff", {
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
    }>(`/exams/${encodePathId(examId)}/print-package/prepare`, "staff", { method: "POST", body: data }),

  /** Mark a scheduled paper exam as physically handed out/in progress. */
  startPrintPackage: (examId: string) =>
    examApi<{ exam_id: string; status: "active"; print_package: PrintPackageMetadata }>(
      `/exams/${encodePathId(examId)}/print-package/start`, "staff",
      { method: "POST" },
    ),

  getPrintPackage: (examId: string) =>
    examApi<{ exam_id: string; status: string; print_package: PrintPackageMetadata }>(
      `/exams/${encodePathId(examId)}/print-package`, "staff",
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
    }>>(`/exams/${encodePathId(examId)}/draft/alternatives?variant_number=${variantNumber}&task_id=${encodeURIComponent(taskId)}`, "staff"),

  /** Replace a task in a draft variant */
  replaceTask: (examId: string, data: { variant_number: number; task_id: string; old_task_id?: string; new_task_id?: string }) =>
    examApi<{ status: string; new_task: any }>(`/exams/${encodePathId(examId)}/draft/replace-task`, "staff", {
      method: "POST",
      body: data,
    }),

  /** Schedule a draft for one concrete lesson and open its lobby. */
  publish: (examId: string, data: { lesson_id: string; lesson_date: string; teacher_name?: string; subject?: string; group_id?: string; group_name?: string; class_level?: number }) =>
    examApi<PublishExamResult>(`/exams/${encodePathId(examId)}/publish`, "staff", {
      method: "POST",
      body: data,
    }),

  /** Close an active exam */
  close: (examId: string) =>
    examApi<{ exam_id: string; status: string }>(`/exams/${encodePathId(examId)}/close`, "staff", { method: "POST" }),

  /** Get sessions list for an exam (teacher) */
  getSessions: (examId: string) => examApi<any[]>(`/exams/${encodePathId(examId)}/sessions`, "staff"),

  /** Completed online attempts for one student, scoped by current staff access. */
  getStudentHistory: (studentId: string) =>
    examApi<NonNullable<StudentProfile["exams"]>>(
      `/students/${encodePathId(studentId)}/exam-history`
    , "staff"),

  /** Get analytics for an exam (teacher) */
  getAnalytics: (examId: string) => examApi<any>(`/exams/${encodePathId(examId)}/analytics`, "staff"),

  /** Get cached narrative report for an exam (teacher) */
  getReport: (examId: string) => examApi<any>(`/exams/${encodePathId(examId)}/report`, "staff"),

  /** Generate on-demand LLM narrative report for an exam (teacher) */
  generateReport: (examId: string, force = true) =>
    examApi<any>(`/exams/${encodePathId(examId)}/report?force=${force}`, "staff", { method: "POST" }),

  /** Toggle is_pinned (Library favourite) */
  pin: (examId: string) =>
    examApi<{ exam_id: string; is_pinned: boolean }>(`/exams/${encodePathId(examId)}/pin`, "staff", { method: "POST" }),

  /** Clone a template, optionally binding it to a new group */
  clone: (examId: string, data?: { title?: string; group_id?: string; group_name?: string; class_level?: number }) =>
    examApi<{ exam_id: string; title: string; status: string; source_exam_id: string; group_id?: string | null; group_name?: string | null }>(
      `/exams/${encodePathId(examId)}/clone`, "staff",
      { method: "POST", body: data ?? {} },
    ),

  /** Rename an editable draft. Prepared and conducted runs stay immutable. */
  rename: (examId: string, title: string) =>
    examApi<{ exam_id: string; title: string; status: string }>(`/exams/${encodePathId(examId)}/title`, "staff", {
      method: "PATCH",
      body: { title },
    }),

  /** Assign a draft to a group; publishing additionally requires one lesson occurrence. */
  assign: (examId: string, data: { group_id: string; group_name?: string; class_level?: number; teacher_name?: string; subject?: string; publish?: boolean; lesson_id?: string; lesson_date?: string }) =>
    examApi<{ exam_id: string; status: string; group_id: string; group_name?: string | null; access_code?: string | null; scheduled_lesson_id?: string | null; scheduled_lesson_date?: string | null; url?: string | null }>(
      `/exams/${encodePathId(examId)}/assign`, "staff",
      { method: "POST", body: data },
    ),

  /** Delete an exam (soft archive by default, or permanent) */
  delete: (examId: string, permanent: boolean = false) =>
    examApi<{ ok: boolean; action: string; id: string }>(`/exams/${encodePathId(examId)}?permanent=${permanent}`, "staff", { method: "DELETE" }),

  /** Restore an archived exam */
  restore: (examId: string) =>
    examApi<{ ok: boolean; action: string; id: string; status: string }>(`/exams/${encodePathId(examId)}/restore`, "staff", { method: "POST" }),

  // ── Student: public (no auth) ────────────────────────────────────────────

  /** Exam info by access code — shown on lobby screen */
  getByCode: (code: string) =>
    examApi<{
      exam_id: string;
      title: string;
      subject: string;
      teacher_name: string | null;
      /** the exam is tied to a group (the page then asks for the student's ID); the group's own id is not public */
      has_group?: boolean;
      /** Deprecated: an exam service older than this release answers with the group's id instead of `has_group` (one release). */
      group_id?: string | null;
      group_name?: string | null;
      class_level?: number | null;
      total_time_minutes: number;
      tasks_per_variant: number;
      variants_count: number;
      status: string;
      time_remaining_seconds?: number | null;
      started_at?: string | null;
    }>(`/exams/by-code/${encodePathId(code)}`, "student"),

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
    }>(`/exams/by-code/${encodePathId(code)}/check-student`, "student", {
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
    }>(`/exams/by-code/${encodePathId(code)}/start`, "student", { method: "POST", body: data }),

  /** Auto-save student progress in real-time */
  saveProgress: (
    sessionId: string,
    data: { answers: Record<string, string>; time_spent_seconds?: number },
    sessionToken: string,
  ) =>
    examApi<{ ok: boolean; answered_count: number }>(`/exam-sessions/${encodePathId(sessionId)}/progress`, "student", {
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
    }>(`/exams/by-code/${encodePathId(code)}/session-status/${encodePathId(sessionId)}`, "student", { sessionToken }),

  /** Teacher: bind a concrete lesson and open the lobby. */
  openLobby: (examId: string, data: { lesson_id: string; lesson_date: string }) =>
    examApi<{ status: string; access_code: string; url: string }>(`/exams/${encodePathId(examId)}/open-lobby`, "staff", {
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
    examApi<{ status: string; started_count: number }>(`/exams/${encodePathId(examId)}/start-live`, "staff", {
      method: "POST",
    }),

  /** Teacher: clear the entry rate limits of an open exam (a classmate used up the failure budget of the school address) */
  resetEntryLimits: (examId: string) =>
    examApi<{ exam_id: string; reset: boolean }>(`/exams/${encodePathId(examId)}/entry-limits/reset`, "staff", {
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
    }>(`/exams/${encodePathId(examId)}/lobby-status`, "staff"),

  /** Teacher: Kick / remove student from lobby */
  kickStudent: (examId: string, sessionId: string) =>
    examApi<{ ok: boolean; kicked_session_id: string }>(`/exams/${encodePathId(examId)}/sessions/${encodePathId(sessionId)}`, "staff", {
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
    }>(`/exam-sessions/${encodePathId(sessionId)}/submit`, "student", { method: "POST", body: data, sessionToken }),

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
    }>(`/exam-sessions/${encodePathId(sessionId)}/results`, "student", { sessionToken }),
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
    examApi<TOCNode[]>(`/textbooks/${encodePathId(textbookId)}/toc/tree`, "staff"),

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
    return examApi<TextbookTask[]>(`/textbooks/${encodePathId(textbookId)}/tasks${qs ? `?${qs}` : ""}`, "staff");
  },

  /** Дерево навыков (для режима "По программе") */
  skillTree: (classLevel?: number) => {
    const qs = classLevel ? `?class_level=${encodeURIComponent(classLevel)}` : "";
    return examApi<SkillTreeNode[]>(`/textbooks/skills/tree${qs}`, "staff");
  },
};

// ── LOGIC-B («операции»): endpoints added by the pack, kept in one section ────────────────────────────────────────────
// Prefix `/auth` as everywhere in this file (the contract says `/api/v1/auth`).  Refusals arrive as `ApiError` with `code`
// and `detail` (`{code, message, ...fields}`); see `lib/ops-errors.ts`.

export const opsApi = {
  // O5 / F6 — the teacher of one lesson
  lessonTeacherCandidates: (groupId: string, lessonId: string, lessonDate: string) => {
    const query = new URLSearchParams({ lessonId, lessonDate });
    return api<LessonTeacherCandidates>(`/auth/org/groups/${encodePathId(groupId)}/lesson-teacher-candidates?${query.toString()}`);
  },
  setLessonTeacher: (groupId: string, body: LessonTeacherPut) =>
    api<LessonTeacherResult>(`/auth/org/groups/${encodePathId(groupId)}/lesson-teacher`, { method: "PUT", body }),

  // O4 / F2 — archive of a group
  archiveImpact: (groupId: string) =>
    api<ArchiveImpact>(`/auth/org/groups/${encodePathId(groupId)}/archive-impact`),

  // O2 — removal of a member, handover of his groups, return to the team
  removalImpact: (memberId: string) =>
    api<RemovalImpact>(`/auth/org/members/${encodePathId(memberId)}/removal-impact`),
  handover: (memberId: string, body: HandoverBody) =>
    api<HandoverResult>(`/auth/org/members/${encodePathId(memberId)}/handover`, { method: "POST", body }),
  restoreMember: (memberId: string) =>
    api<{ member_id: string; is_active: boolean }>(`/auth/org/members/${encodePathId(memberId)}/restore`, { method: "POST" }),
  listMembersByStatus: (status: MemberListStatus) =>
    api<OrgMemberRow[]>(`/auth/org/members?status=${encodeURIComponent(status)}`),
};

// ── LOGIC-B2 («Замены»): the request of a teacher and the decision of an administrator ──────────────────────────────

export const substitutionsApi = {
  // teacher
  myLessons: (dateFrom: string, dateTo: string) =>
    api<MyLessonsOut>(`/auth/org/substitutions/my-lessons?${new URLSearchParams({ dateFrom, dateTo }).toString()}`),
  create: (body: CreateSubstitutionBody) =>
    api<CreateSubstitutionOut>("/auth/org/substitutions", { method: "POST", body }),
  mine: (status: "pending" | "all" = "all") =>
    api<MineOut>(`/auth/org/substitutions/mine?status=${encodeURIComponent(status)}`),
  withdraw: (requestId: string) =>
    api<SubstitutionItem>(`/auth/org/substitutions/${encodePathId(requestId)}/withdraw`, { method: "POST" }),
  withdrawMany: (ids: string[]) =>
    api<WithdrawBatchOut>("/auth/org/substitutions/withdraw", { method: "POST", body: { ids } }),

  /** «Предложить коллегу»: the active staff who can teach, except the caller (id, name, role; any member of the centre may read it). */
  colleagues: () =>
    api<Array<{ id: string; name: string; role: "teacher" | "owner" | "admin" }>>("/auth/org/substitutions/colleagues"),

  // owner / administrator
  summary: () => api<SubstitutionSummary>("/auth/org/substitutions/summary"),
  list: (params: SubstitutionListParams) =>
    api<SubstitutionListOut>(`/auth/org/substitutions?${listQuery(params)}`),
  detail: (requestId: string) =>
    api<SubstitutionDetailOut>(`/auth/org/substitutions/${encodePathId(requestId)}`),
  candidates: (requestId: string) =>
    api<CandidatesOut>(`/auth/org/substitutions/${encodePathId(requestId)}/candidates`),
  moveCheck: (requestId: string, params: MoveCheckParams) =>
    api<MoveCheckOut>(`/auth/org/substitutions/${encodePathId(requestId)}/move-check?${new URLSearchParams({ newDate: params.newDate, startTime: params.startTime, endTime: params.endTime }).toString()}`),
  decide: (requestId: string, body: DecideBody) =>
    api<DecideOut>(`/auth/org/substitutions/${encodePathId(requestId)}/decide`, { method: "POST", body }),

  // #124: the lesson sheet moves / cancels a lesson without a request of a teacher (owner / administrator)
  lessonMoveCheck: (groupId: string, params: { lessonId: string; lessonDate: string; newDate: string; startTime: string; endTime: string }) =>
    api<MoveCheckOut>(`/auth/org/groups/${encodePathId(groupId)}/lesson-move-check?${new URLSearchParams(params).toString()}`),
  lessonMove: (groupId: string, body: LessonMoveBody) =>
    api<DecideOut>(`/auth/org/groups/${encodePathId(groupId)}/lesson-move`, { method: "POST", body }),
  lessonExamBinding: (groupId: string, lessonId: string, lessonDate: string) =>
    api<ExamBinding>(`/auth/org/groups/${encodePathId(groupId)}/lesson-exam-binding?${new URLSearchParams({ lessonId, lessonDate }).toString()}`),
  decideBulk: (body: DecideBulkBody) =>
    api<DecideBulkOut>("/auth/org/substitutions/decide-bulk", { method: "POST", body }),
};

export { api, ApiError };
