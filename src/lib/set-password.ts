/**
 * «Задать пароль» (/set-password/[token]): the states of the link and the rules of the password, as plain functions.
 */
import { formatUtcNaiveAsBusinessTime } from "./business-time";
import { HttpError } from "./http-json";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** The hint under the field: one wording on every form that sets a password (K2-2, F). */
export const PASSWORD_HINT = `Минимум ${MIN_PASSWORD_LENGTH} символов`;

export interface PasswordRule {
  id: "length" | "match";
  text: string;
  ok: boolean;
}

/** The rules a person sees under the field, with the state of each one. */
export function passwordRules(password: string, confirm: string): PasswordRule[] {
  return [
    { id: "length", text: PASSWORD_HINT, ok: password.length >= MIN_PASSWORD_LENGTH },
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
  | { kind: "valid"; name: string; centre: string; email: string; purpose: "centre_invite" | "reset"; expiresAt: string | null }
  | { kind: DeadLinkKind; purpose?: "centre_invite" | "reset" | null }
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
    expiresAt: info.expires_at ?? null,
  };
}

/** «до 14:35»: the time the link works until, in the business time zone of the centres (Tashkent), as the letter says it. */
export function linkValidUntilText(expiresAt: string | null | undefined): string {
  const time = formatUtcNaiveAsBusinessTime(expiresAt);
  return time ? `Ссылка действует до ${time}` : "";
}

/** What the link was for, read from the answer of the server (`purpose` is in the body of a 410). */
function purposeOf(error: HttpError): "centre_invite" | "reset" | null {
  const body = error.body as { purpose?: unknown } | null | undefined;
  const raw = body && typeof body === "object" ? body.purpose : null;
  return raw === "reset" ? "reset" : raw === "centre_invite" ? "centre_invite" : null;
}

/** A failed answer of the link check or of setting the password: 404 `link_not_found`, 410 `link_used|link_expired|link_revoked`, 403 `org_blocked`. */
export function linkStateFromError(error: unknown): LinkState {
  if (!(error instanceof HttpError)) return { kind: "unavailable", message: "Не удалось проверить ссылку. Повторите попытку." };
  const code = (error.code ?? "").toLowerCase();
  const purpose = purposeOf(error);
  if (code === "link_used") return { kind: "used", purpose };
  if (code === "link_expired") return { kind: "expired", purpose };
  if (code === "link_revoked") return { kind: "revoked", purpose };
  if (code === "link_not_found" || error.status === 404) return { kind: "invalid" };
  if (error.status === 410) return { kind: "expired", purpose };
  if (code === "org_blocked" || code === "user_blocked") return { kind: "blocked", message: error.message };
  return { kind: "unavailable", message: error.message };
}

/** The sentence under a dead link: what happened and what to do. A forgotten password: «Запросить новую ссылку» on the page of the form; a welcome link of a new owner: write to ALGO. */
export const DEAD_LINK_COPY: Record<DeadLinkKind, { title: string; text: string }> = {
  used: {
    title: "Ссылка уже использована",
    text: "Пароль по этой ссылке уже задан. Войдите с вашей почтой и паролем. Если пароль забыт — запросите новую ссылку.",
  },
  expired: {
    title: "Срок ссылки истёк",
    text: "Запросите новую ссылку — она придёт на вашу почту.",
  },
  revoked: {
    title: "Выдана новая ссылка",
    text: "Эта ссылка заменена новой. Используйте ссылку из самого последнего письма от ALGO.",
  },
  invalid: {
    title: "Ссылка не найдена",
    text: "Возможно, она скопирована не полностью. Откройте письмо от ALGO ещё раз или запросите новую ссылку.",
  },
};

/** A dead link of the first password of a new owner cannot be asked for again on the sign-in page: the team sends it. */
export const DEAD_WELCOME_LINK_TEXT = "Напишите нам — мы пришлём новую ссылку.";

/** The text under a dead link: «запросите новую» for a reset, «напишите нам» for the welcome link of a new owner. */
export function deadLinkText(state: { kind: DeadLinkKind; purpose?: string | null }): string {
  if (state.purpose !== "centre_invite") return DEAD_LINK_COPY[state.kind].text;
  if (state.kind === "used") return "Пароль по этой ссылке уже задан. Войдите с вашей почтой и паролем.";
  if (state.kind === "revoked") return DEAD_LINK_COPY.revoked.text;
  return `${state.kind === "expired" ? "Срок действия ссылки истёк." : "Ссылка не найдена."} ${DEAD_WELCOME_LINK_TEXT}`;
}

/** Whether the page offers «Запросить новую ссылку» (the link was a reset, or nobody knows what it was). */
export function canRequestNewLink(state: { kind: string; purpose?: string | null }): boolean {
  return state.purpose !== "centre_invite";
}
