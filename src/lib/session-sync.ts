/**
 * Several tabs share one sign-in (the `algo-auth` localStorage record and the cookies). When another
 * tab signs in as somebody else, an open tab keeps the old role's menu while its requests already run
 * as the new user. Pure decision helpers - no React, no window - so node:test can load this file.
 *
 * A storage event is only a HINT: it can come from a transient 401 in another tab (which wipes the
 * record) or from a half-written login. The tab therefore asks the server (`/auth/me`) who is signed
 * in and decides from that answer, never from the event alone.
 */
import { effectiveRole, roleHome } from "./role-home";

/** The zustand-persist key of the auth store. */
export const AUTH_STORAGE_KEY = "algo-auth";
/** sessionStorage key: the notice survives the hard redirect inside this tab only. */
export const SESSION_NOTICE_KEY = "algo-session-notice";
/** Another person signed in in another tab. */
export const SESSION_CHANGED_NOTICE = "Вы вошли как другой пользователь в другой вкладке";
/** The same person, but the role in the organisation changed. */
export const ROLE_CHANGED_NOTICE = "Ваша роль изменилась";

/**
 * Only the staff workspaces follow a sign-in change. A public page (a student's exam or diagnostic,
 * the invite, the login) must never be torn away from under somebody, even in a browser where a
 * teacher happens to be signed in.
 */
export function isWorkspacePath(pathname: string | null | undefined): boolean {
  return /^\/(owner|admin|teacher)(\/|$)/.test(pathname ?? "");
}

export interface SessionUser {
  id?: string | null;
  role?: string | null;
  org_role?: string | null;
}

/** The user inside a persisted `algo-auth` value (`{"state":{"user":{...}}}`); null when absent or unreadable. */
export function parsePersistedUser(raw: string | null | undefined): SessionUser | null {
  if (!raw) return null;
  try {
    const user = (JSON.parse(raw) as { state?: { user?: unknown } } | null)?.state?.user;
    if (!user || typeof user !== "object") return null;
    const { id, role, org_role } = user as SessionUser;
    return id ? { id, role: role ?? null, org_role: org_role ?? null } : null;
  } catch {
    return null;
  }
}

export type IdentityChange = "none" | "signed_out" | "other_user" | "other_role";

/**
 * How `newUser` differs from what the tab shows (`oldUser`). A tab that was not signed in has nothing
 * to correct; the same person with the same effective role (org_role, else role) is no change, so a
 * profile edit or a token refresh can never cause a redirect.
 */
export function identityChange(
  oldUser: SessionUser | null | undefined,
  newUser: SessionUser | null | undefined,
): IdentityChange {
  if (!oldUser?.id) return "none";
  if (!newUser?.id) return "signed_out";
  if (oldUser.id !== newUser.id) return "other_user";
  return effectiveRole(oldUser) === effectiveRole(newUser) ? "none" : "other_role";
}

/** Whether a storage event (the persisted user it carries) is worth asking the server about. */
export function eventNeedsVerification(
  tabUser: SessionUser | null | undefined,
  eventUser: SessionUser | null | undefined,
): boolean {
  return identityChange(tabUser, eventUser) !== "none";
}

/** What `/auth/me` answered: a user, or a failure with its HTTP status (null = no answer at all). */
export type MeOutcome =
  | { ok: true; user: SessionUser | null | undefined }
  | { ok: false; status: number | null };

/** Failure of the `/auth/me` call as an outcome: only an HTTP status is kept, a network error has none. */
export function meOutcomeFromError(error: unknown): MeOutcome {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return { ok: false, status: typeof status === "number" && Number.isFinite(status) ? status : null };
}

export type SessionVerdict =
  | { action: "none" }
  | { action: "redirect"; target: string; notice: string | null };

/**
 * What the tab does once the server has answered:
 * - the tab was not signed in: nothing;
 * - the server says "not signed in / forbidden" (401, 403): to the login, quietly;
 * - no answer (network error), a server failure (5xx) or anything else unexpected: nothing - the page
 *   stays as it is, a hiccup must not throw anybody out;
 * - another user id: to the new role's home («Вы вошли как другой пользователь в другой вкладке»);
 * - the same user with another effective role: to the new role's home («Ваша роль изменилась»);
 * - the same user and role: nothing (so a redirect never repeats on the page it led to).
 */
export function sessionVerdict(
  tabUser: SessionUser | null | undefined,
  me: MeOutcome,
): SessionVerdict {
  if (!tabUser?.id) return { action: "none" };
  if (!me.ok) {
    return me.status === 401 || me.status === 403
      ? { action: "redirect", target: "/login", notice: null }
      : { action: "none" };
  }
  const change = identityChange(tabUser, me.user);
  if (change === "none" || change === "signed_out") return { action: "none" }; // no id in the answer: unreadable
  return {
    action: "redirect",
    // a role without a workspace of its own (superadmin) signs in again
    target: roleHome(effectiveRole(me.user)) ?? "/login",
    notice: change === "other_user" ? SESSION_CHANGED_NOTICE : ROLE_CHANGED_NOTICE,
  };
}
