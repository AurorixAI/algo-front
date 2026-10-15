/**
 * Password recovery (N13): the pure parts - texts, the token in the address bar, who may hand out a link.
 *
 * No React, no window: node:test loads this file as it is.
 */

/** The same limits as the change-password page; the server accepts 6..128 (the client is stricter). */
export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_MAX_LENGTH = 128;

/** The new-password rule shared by /change-password and /reset-password: the message to show, or null. */
export function validateNewPassword(next: string, confirm: string): string | null {
  if (next.length < NEW_PASSWORD_MIN_LENGTH) return "Новый пароль должен быть не короче 8 символов.";
  if (next.length > NEW_PASSWORD_MAX_LENGTH) return "Новый пароль должен быть не длиннее 128 символов.";
  if (next !== confirm) return "Пароли не совпадают.";
  return null;
}

// ---- «Забыли пароль?» ----------------------------------------------------------------------

export const FORGOT_SENT_TEXT = "Если такой аккаунт есть, мы отправили ссылку на почту.";
export const FORGOT_NOT_CONFIGURED_TEXT =
  "Отправка писем пока не настроена. Попросите владельца или администратора центра выдать ссылку для нового пароля.";

/**
 * What the page says after the request. The server answers the same for every address and tells only
 * whether e-mail can be sent at all (`email_delivery`), so this text never depends on the account.
 */
export function forgotPasswordNotice(emailDelivery: boolean): { kind: "sent" | "not-configured"; text: string } {
  return emailDelivery
    ? { kind: "sent", text: FORGOT_SENT_TEXT }
    : { kind: "not-configured", text: FORGOT_NOT_CONFIGURED_TEXT };
}

// ---- the link: /reset-password#token=... ----------------------------------------------------

export const RESET_INVALID_TEXT = "Ссылка недействительна или устарела. Попросите новую.";
export const RESET_DONE_TEXT = "Пароль изменён. Войдите с новым паролем.";
export const RESET_PATH = "/reset-password";

/** What the server's `secrets.token_urlsafe(32)` looks like; anything else is not worth a request. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * The `token` of the address-bar FRAGMENT (`#token=...`), only when it can be one of ours. The token travels
 * in the fragment because a browser never sends a fragment to any server: it cannot reach an access log or
 * a Referer. A `?token=` in the query is deliberately NOT read (that form is never issued, and it would be logged).
 */
export function readResetToken(hash: string | null | undefined): string | null {
  if (!hash || hash.startsWith("?")) return null;
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return value && TOKEN_SHAPE.test(value) ? value : null;
}

/**
 * The address to leave in the bar once the token was read: the same page and the same query, without the
 * fragment (and without a `token` parameter, should somebody have typed one). Used with
 * history.replaceState so the secret does not stay in the history, in a bookmark or in a screenshot.
 */
export function addressWithoutToken(pathname: string, search: string | null | undefined): string {
  const params = new URLSearchParams(search || "");
  params.delete("token");
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

// ---- the link an owner / admin hands over ---------------------------------------------------------

export const RESET_LINK_NOTE =
  "Ссылка одноразовая, действует 24 часа. Старые входы сотрудника будут завершены после смены пароля.";
export const RESET_LINK_MENU_LABEL = "Ссылка для нового пароля";

/**
 * Whether the signed-in `actorRole` may hand a link to a colleague whose role is `memberRole`.
 * The same table as the server (the server enforces it; the menu only avoids offering what would be refused):
 * owner -> admins and teachers, admin -> teachers.
 */
export function canIssueResetLink(actorRole: string | null | undefined, memberRole: string | null | undefined): boolean {
  if (actorRole === "owner") return memberRole === "admin" || memberRole === "teacher";
  if (actorRole === "admin") return memberRole === "teacher";
  return false;
}

/** The Telegram share page for a link (the link is the only thing put into the address). */
export function telegramShareUrl(link: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}`;
}

/** «до 16 октября, 15:42» - the moment the link stops working, in the viewer's own time zone. */
export function resetLinkExpiryText(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "";
  // Date and time formatted apart: a single "long date + time" pattern differs between ICU versions («16 октября в 15:42»).
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `до ${day}, ${time}`;
}
