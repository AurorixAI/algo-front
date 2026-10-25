/**
 * Route guards of the console.  The pages are static files that carry no data, so the decision is made from the answer of
 * `GET /platform/auth/me`: a 401 sends to the sign-in, `must_change_password` to the password change, a network failure
 * keeps the person where they are with a retry (a lost connection is not a lost session).
 */
import { HttpError } from "@/lib/http-json";
import { homePath } from "./permissions";
import type { Me } from "./types";

export type GuardPage = "panel" | "change-password" | "login";

export type GuardDecision =
  | { kind: "allow"; me: Me }
  | { kind: "redirect"; to: string; reason?: "expired" | "no_access" }
  | { kind: "stay" }
  | { kind: "error"; message: string };

export const LOGIN_PATH = "/login/";
export const CHANGE_PASSWORD_PATH = "/change-password/";

export type SessionCheck = { me: Me } | { error: unknown };

export function guardDecision(check: SessionCheck, page: GuardPage): GuardDecision {
  if ("me" in check) {
    const { me } = check;
    if (page === "login") return { kind: "redirect", to: me.must_change_password ? CHANGE_PASSWORD_PATH : homePath(me) };
    if (page === "change-password") return me.must_change_password ? { kind: "allow", me } : { kind: "redirect", to: homePath(me) };
    return me.must_change_password ? { kind: "redirect", to: CHANGE_PASSWORD_PATH } : { kind: "allow", me };
  }
  const { error } = check;
  if (error instanceof HttpError) {
    if (error.status === 401) return page === "login" ? { kind: "stay" } : { kind: "redirect", to: LOGIN_PATH, reason: error.code === "session_expired" ? "expired" : undefined };
    if (error.status === 403 && error.code === "must_change_password") return page === "change-password" ? { kind: "stay" } : { kind: "redirect", to: CHANGE_PASSWORD_PATH };
    // not a staff member / switched off: the sign-in page is the right place to say so
    if (error.status === 403) return page === "login" ? { kind: "stay" } : { kind: "redirect", to: LOGIN_PATH, reason: "no_access" };
    if (page === "login") return { kind: "stay" };
    return { kind: "error", message: error.message };
  }
  return page === "login" ? { kind: "stay" } : { kind: "error", message: "Не удалось проверить вход. Повторите попытку." };
}

/** The text above the sign-in form for `?reason=`. */
export function loginNotice(reason: string | null | undefined): string | null {
  if (reason === "expired") return "Сессия закончилась. Войдите снова.";
  if (reason === "no_access") return "У этой учётной записи нет доступа к консоли.";
  if (reason === "signed_out") return "Вы вышли из консоли.";
  return null;
}
