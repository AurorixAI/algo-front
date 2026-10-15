/**
 * Several tabs share one sign-in (the `algo-auth` localStorage record and the cookies). When another
 * tab signs in as somebody else, an open tab keeps the old role's menu while its requests already run
 * as the new user. Pure decision helpers - no React, no window - so node:test can load this file.
 */
import { effectiveRole, roleHome } from "./role-home";

/** The zustand-persist key of the auth store. */
export const AUTH_STORAGE_KEY = "algo-auth";
/** sessionStorage key: the notice survives the hard redirect inside this tab only. */
export const SESSION_NOTICE_KEY = "algo-session-notice";
export const SESSION_CHANGED_NOTICE = "Вы вошли как другой пользователь в другой вкладке";

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

export type SessionAction =
  | { action: "none" }
  | { action: "redirect"; target: string; notice: string | null };

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

/**
 * What a tab does when the shared sign-in changes from `oldUser` (what the tab shows) to `newUser`:
 * - the tab was signed out: nothing (the login page and the guards deal with it);
 * - the user signed out elsewhere: to /login, silently;
 * - another person, or the same person with another effective role (org_role, else role):
 *   to the new role's home, with a notice;
 * - the same person and role (profile edits, token refresh): nothing, so no loop is possible.
 */
export function sessionChange(
  oldUser: SessionUser | null | undefined,
  newUser: SessionUser | null | undefined,
): SessionAction {
  if (!oldUser?.id) return { action: "none" };
  if (!newUser?.id) return { action: "redirect", target: "/login", notice: null };
  const sameUser = oldUser.id === newUser.id;
  const sameRole = effectiveRole(oldUser) === effectiveRole(newUser);
  if (sameUser && sameRole) return { action: "none" };
  const role = effectiveRole(newUser);
  return {
    action: "redirect",
    target: roleHome(role) ?? "/login", // a role without a workspace of its own signs in again
    notice: SESSION_CHANGED_NOTICE,
  };
}
