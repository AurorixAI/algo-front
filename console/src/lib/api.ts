/**
 * The ONE client of the console: every call to the accounting server's `/api/v1/platform/*` (API_CONTRACT.md v1).
 * The console has no server and no data of its own; the session is the HttpOnly cookie `algo_console_session` that the
 * browser sends by itself (`credentials: "include"`), so no token is ever read, stored or sent from here.
 */
import { HttpError, createJsonClient, seg, type JsonClientConfig } from "@/lib/http-json";
import type {
  ApproveBody,
  ApproveResult,
  AuditAction,
  AuditRow,
  DemoRequestCard,
  DemoRequestList,
  LimitsResult,
  LinkSent,
  Me,
  Org,
  OrgCard,
  Page,
  PermissionInfo,
  PlatformUser,
  RequestNote,
  RequestStatus,
  Role,
  Staff,
  StaffCreateBody,
  SupportList,
  SupportStatus,
  SupportTicketCard,
  UserCard,
} from "./types";

/** Same origin in production (nginx proxies `/api/v1/platform/` of the console host); a full URL for local development. */
export const CONSOLE_API_BASE = `${process.env.NEXT_PUBLIC_CONSOLE_API_URL ?? ""}/api/v1/platform`;

export type Query = Record<string, string | number | boolean | null | undefined>;

/** Paging and sorting every list takes. */
export interface ListQuery extends Query {
  page?: number;
  page_size?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface SessionHooks {
  /** 401: there is no (more a) session. */
  unauthorized?: (error: HttpError) => void;
  /** 403 `must_change_password`: only the password change is allowed. */
  mustChangePassword?: () => void;
}

export function createConsoleApi(config: Partial<JsonClientConfig> = {}, hooks: SessionHooks = {}) {
  const raw = createJsonClient({
    baseUrl: CONSOLE_API_BASE,
    credentials: "include",
    ...config,
    onUnauthorized: (error) => {
      config.onUnauthorized?.(error);
      hooks.unauthorized?.(error);
    },
  });

  const request: typeof raw = async (path, options) => {
    try {
      return await raw(path, options);
    } catch (error) {
      if (error instanceof HttpError && error.status === 403 && error.code === "must_change_password") hooks.mustChangePassword?.();
      throw error;
    }
  };
  const get = <T,>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal });
  const send = <T,>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => request<T>(path, { method, body });

  return {
    auth: {
      login: (email: string, password: string) =>
        request<Me>("/auth/login", { method: "POST", body: { email, password }, skipUnauthorizedHook: true }),
      logout: () => send<{ ok: boolean }>("POST", "/auth/logout"),
      logoutAll: () => send<{ ok: boolean; revoked: number }>("POST", "/auth/logout-all"),
      /** The session check of every page.  Its 401 is the answer, so the global hook is left to the guard. */
      me: (signal?: AbortSignal) => request<Me>("/auth/me", { signal, skipUnauthorizedHook: true }),
      changePassword: (currentPassword: string, newPassword: string) =>
        send<{ ok: boolean }>("POST", "/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
    },
    permissions: (signal?: AbortSignal) => get<{ items: PermissionInfo[] }>("/permissions", undefined, signal),

    requests: {
      list: (query: ListQuery & { status?: string; city?: string; q?: string; source?: string; repeat?: boolean; date_from?: string; date_to?: string }, signal?: AbortSignal) =>
        get<DemoRequestList>("/demo-requests", query, signal),
      get: (id: string, signal?: AbortSignal) => get<DemoRequestCard>(`/demo-requests/${seg(id)}`, undefined, signal),
      setStatus: (id: string, status: Exclude<RequestStatus, "approved" | "declined">) =>
        send<DemoRequestCard>("PATCH", `/demo-requests/${seg(id)}/status`, { status }),
      addNote: (id: string, text: string) => send<RequestNote>("POST", `/demo-requests/${seg(id)}/notes`, { text }),
      approve: (id: string, body: ApproveBody = {}) => send<ApproveResult>("POST", `/demo-requests/${seg(id)}/approve`, body),
      decline: (id: string, reason: string, sendEmail: boolean) =>
        send<DemoRequestCard>("POST", `/demo-requests/${seg(id)}/decline`, { reason, send_email: sendEmail }),
    },

    support: {
      summary: (signal?: AbortSignal) => get<{ new: number; open: number }>("/support/summary", undefined, signal),
      list: (query: ListQuery & { status?: string; org?: string; role?: string; q?: string }, signal?: AbortSignal) => get<SupportList>("/support/tickets", query, signal),
      get: (id: string, signal?: AbortSignal) => get<SupportTicketCard>(`/support/tickets/${seg(id)}`, undefined, signal),
      setStatus: (id: string, status: Exclude<SupportStatus, "new">) => send<SupportTicketCard>("PATCH", `/support/tickets/${seg(id)}/status`, { status }),
      reply: (id: string, text: string) => send<SupportTicketCard>("POST", `/support/tickets/${seg(id)}/messages`, { text }),
      /** The address of a screenshot for an `<img>` (same origin as the console: the cookie of the session goes with it). */
      fileUrl: (fileId: string) => `${CONSOLE_API_BASE}/support/attachments/${seg(fileId)}`,
    },

    orgs: {
      list: (query: ListQuery & { q?: string; status?: string; city?: string }, signal?: AbortSignal) => get<Page<Org>>("/orgs", query, signal),
      get: (id: string, signal?: AbortSignal) => get<OrgCard>(`/orgs/${seg(id)}`, undefined, signal),
      block: (id: string, reason: string) => send<Org>("POST", `/orgs/${seg(id)}/block`, { reason }),
      unblock: (id: string, reason?: string) => send<Org>("POST", `/orgs/${seg(id)}/unblock`, reason ? { reason } : {}),
      setLimits: (id: string, limits: { max_students?: number; max_teachers?: number }) =>
        send<LimitsResult>("PATCH", `/orgs/${seg(id)}/limits`, limits),
    },

    users: {
      list: (query: ListQuery & { q?: string; org_id?: string; role?: string; status?: string }, signal?: AbortSignal) =>
        get<Page<PlatformUser>>("/users", query, signal),
      get: (id: string, signal?: AbortSignal) => get<UserCard>(`/users/${seg(id)}`, undefined, signal),
      resendInvite: (id: string) => send<LinkSent>("POST", `/users/${seg(id)}/resend-invite`, {}),
      sendReset: (id: string) => send<LinkSent>("POST", `/users/${seg(id)}/send-reset`, {}),
      block: (id: string, reason: string) => send<PlatformUser>("POST", `/users/${seg(id)}/block`, { reason }),
      unblock: (id: string) => send<PlatformUser>("POST", `/users/${seg(id)}/unblock`, {}),
    },

    roles: {
      list: (signal?: AbortSignal) => get<{ items: Role[] }>("/roles", undefined, signal),
      create: (name: string, permissions: string[]) => send<Role>("POST", "/roles", { name, permissions }),
      update: (id: string, patch: { name?: string; permissions?: string[] }) => send<Role>("PATCH", `/roles/${seg(id)}`, patch),
      remove: (id: string) => send<{ ok: boolean }>("DELETE", `/roles/${seg(id)}`),
    },

    staff: {
      list: (signal?: AbortSignal) => get<{ items: Staff[] }>("/staff", undefined, signal),
      create: (body: StaffCreateBody) => send<Staff>("POST", "/staff", body),
      update: (userId: string, patch: { role_id?: string; is_active?: boolean; is_owner?: boolean; first_name?: string; last_name?: string }) =>
        send<Staff>("PATCH", `/staff/${seg(userId)}`, patch),
      resetPassword: (userId: string, password: string) => send<{ ok: boolean }>("POST", `/staff/${seg(userId)}/reset-password`, { password }),
    },

    audit: {
      list: (
        query: ListQuery & { actor_id?: string; action?: string; target_type?: string; target_id?: string; q?: string; date_from?: string; date_to?: string },
        signal?: AbortSignal,
      ) => get<Page<AuditRow>>("/audit", query, signal),
      actions: (signal?: AbortSignal) => get<{ items: AuditAction[] }>("/audit/actions", undefined, signal),
    },
  };
}

export type ConsoleApi = ReturnType<typeof createConsoleApi>;

/** The hooks the panel shell sets: one place decides what a lost session or a forced password change does. */
const hooks: SessionHooks = {};
export function setSessionHooks(next: SessionHooks) {
  hooks.unauthorized = next.unauthorized;
  hooks.mustChangePassword = next.mustChangePassword;
}

export const consoleApi: ConsoleApi = createConsoleApi({}, hooks);
