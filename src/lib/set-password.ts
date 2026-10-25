/**
 * «Задать пароль» (/set-password/[token]): the states of the link and the rules of the password, as plain functions.
 */
import { HttpError } from "./http-json";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordRule {
  id: "length" | "match";
  text: string;
  ok: boolean;
}

/** The rules a person sees under the field, with the state of each one. */
export function passwordRules(password: string, confirm: string): PasswordRule[] {
  return [
    { id: "length", text: `Не меньше ${MIN_PASSWORD_LENGTH} символов`, ok: password.length >= MIN_PASSWORD_LENGTH },
    { id: "match", text: "Пароли совпадают", ok: password.length > 0 && password === confirm },
  ];
}

export function canSetPassword(password: string, confirm: string): boolean {
  return password.length <= MAX_PASSWORD_LENGTH && passwordRules(password, confirm).every((rule) => rule.ok);
}

/** What the link is, as the server describes it (`GET /auth/password-links/{token}`, API_CONTRACT.md §2). */
export interface PasswordLinkInfo {
  valid?: boolean;
  /** `centre_invite` (the owner of a newly approved centre, 72 h) | `reset` (1 h). */
  purpose?: "centre_invite" | "reset" | string;
  first_name?: string | null;
  last_name?: string | null;
  /** «Иван Петрович»: the way to address the person. */
  greeting?: string | null;
  org_name?: string | null;
  email?: string | null;
  expires_at?: string | null;
}

export type DeadLinkKind = "used" | "expired" | "revoked" | "invalid";

export type LinkState =
  | { kind: "loading" }
  | { kind: "valid"; name: string; centre: string; email: string; purpose: "centre_invite" | "reset" }
  | { kind: DeadLinkKind }
  | { kind: "blocked"; message: string }
  | { kind: "unavailable"; message: string };

/** The greeting name: the server's `greeting`, else the first name. */
export function greetingName(info: PasswordLinkInfo): string {
  return (info.greeting ?? "").trim() || (info.first_name ?? "").trim();
}

/** A 200 answer of the link check. */
export function linkStateFromInfo(info: PasswordLinkInfo): LinkState {
  return {
    kind: "valid",
    name: greetingName(info),
    centre: (info.org_name ?? "").trim(),
    email: (info.email ?? "").trim(),
    purpose: info.purpose === "reset" ? "reset" : "centre_invite",
  };
}

/** A failed answer of the link check or of setting the password: 404 `link_not_found`, 410 `link_used|link_expired|link_revoked`, 403 `org_blocked`. */
export function linkStateFromError(error: unknown): LinkState {
  if (!(error instanceof HttpError)) return { kind: "unavailable", message: "Не удалось проверить ссылку. Повторите попытку." };
  const code = (error.code ?? "").toLowerCase();
  if (code === "link_used") return { kind: "used" };
  if (code === "link_expired") return { kind: "expired" };
  if (code === "link_revoked") return { kind: "revoked" };
  if (code === "link_not_found" || error.status === 404) return { kind: "invalid" };
  if (error.status === 410) return { kind: "expired" };
  if (code === "org_blocked") return { kind: "blocked", message: error.message };
  return { kind: "unavailable", message: error.message };
}

/** The sentence under a dead link: what happened and what to do (a new link is issued by the ALGO team). */
export const DEAD_LINK_COPY: Record<DeadLinkKind, { title: string; text: string }> = {
  used: {
    title: "Ссылка уже использована",
    text: "Пароль по этой ссылке уже задан. Войдите с вашей почтой и паролем. Если пароль забыт — напишите нам, мы пришлём новую ссылку.",
  },
  expired: {
    title: "Срок ссылки истёк",
    text: "Ответьте на письмо с приглашением — мы сразу пришлём новую ссылку.",
  },
  revoked: {
    title: "Выдана новая ссылка",
    text: "Эта ссылка заменена новой. Используйте ссылку из самого последнего письма от ALGO.",
  },
  invalid: {
    title: "Ссылка не найдена",
    text: "Возможно, она скопирована не полностью. Откройте письмо от ALGO ещё раз или ответьте на него — мы поможем.",
  },
};
