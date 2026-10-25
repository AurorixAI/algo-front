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

/** What the link is, as the server describes it (`GET /auth/password-links/{token}`). */
export interface PasswordLinkInfo {
  /** `valid` | `used` | `expired` (the server may also answer these with an HTTP error: see `linkStateFromError`). */
  status?: "valid" | "used" | "expired";
  purpose?: string;
  user_name?: string | null;
  first_name?: string | null;
  org_name?: string | null;
  email?: string | null;
  expires_at?: string | null;
}

export type LinkState =
  | { kind: "loading" }
  | { kind: "valid"; name: string; centre: string; email: string }
  | { kind: "used" }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "unavailable"; message: string };

/** The greeting name: first name if the server has it, else the first word of the full name. */
export function greetingName(info: PasswordLinkInfo): string {
  const first = (info.first_name ?? "").trim();
  if (first) return first;
  return (info.user_name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** A 200 answer of the link check. */
export function linkStateFromInfo(info: PasswordLinkInfo): LinkState {
  if (info.status === "used") return { kind: "used" };
  if (info.status === "expired") return { kind: "expired" };
  return { kind: "valid", name: greetingName(info), centre: (info.org_name ?? "").trim(), email: (info.email ?? "").trim() };
}

/** A failed answer of the link check or of setting the password. */
export function linkStateFromError(error: unknown): LinkState {
  if (!(error instanceof HttpError)) return { kind: "unavailable", message: "Не удалось проверить ссылку. Повторите попытку." };
  const code = (error.code ?? "").toLowerCase();
  if (code.includes("used")) return { kind: "used" };
  if (code.includes("expired")) return { kind: "expired" };
  if (error.status === 410) return code.includes("used") ? { kind: "used" } : { kind: "expired" };
  if (error.status === 404 || code.includes("invalid") || code.includes("not_found")) return { kind: "invalid" };
  return { kind: "unavailable", message: error.message };
}

/** The sentence under a dead link: what happened and what to do (a new link is issued by the ALGO team). */
export const DEAD_LINK_COPY: Record<"used" | "expired" | "invalid", { title: string; text: string }> = {
  used: {
    title: "Ссылка уже использована",
    text: "Пароль по этой ссылке уже задан. Войдите с вашей почтой и паролем. Если пароль забыт — напишите нам, мы пришлём новую ссылку.",
  },
  expired: {
    title: "Срок ссылки истёк",
    text: "Ссылка действует 72 часа. Ответьте на письмо с приглашением — мы сразу пришлём новую.",
  },
  invalid: {
    title: "Ссылка не найдена",
    text: "Возможно, она скопирована не полностью или заменена новой. Откройте самое свежее письмо от ALGO или ответьте на него — мы поможем.",
  },
};
