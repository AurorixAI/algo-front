/**
 * «Поддержка» (K4a): the rules and the words of the form and of «Мои обращения».  Pure (tested without a browser).
 * The server judges everything again; the page template and the errors are cleaned here AND there (the server never trusts the client).
 */

import { CODE_PAGES, TOKEN_PAGES } from "./public-pages";

export const SUPPORT_TEXT_MIN = 10;
export const SUPPORT_TEXT_MAX = 2000;
export const SUPPORT_REPLY_MAX = 2000;
export const SUPPORT_MAX_FILES = 3;
export const SUPPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
/** What the browser sends is kept a little under the limit, so the frame of the form never pushes it over. */
export const SUPPORT_TARGET_FILE_BYTES = Math.floor(1.9 * 1024 * 1024);
export const SUPPORT_MAX_SIDE = 1600;

export type SupportStatus = "new" | "in_progress" | "waiting" | "resolved";

export interface SupportItem {
  id: string;
  number: number;
  status: SupportStatus;
  preview: string;
  created_at: string;
  updated_at: string;
  last_reply_at: string | null;
}

export interface SupportFileInfo { id: string; content_type: string; size: number; index: number }
export interface SupportMessage { id: string; from: "me" | "team"; text: string; created_at: string }

export interface SupportCard extends SupportItem {
  text: string;
  resolved_at: string | null;
  messages: SupportMessage[];
  attachments: SupportFileInfo[];
  can_reply: boolean;
  can_reopen: boolean;
  can_attach: boolean;
}

export interface SupportCreated { id: string; number: number; status: SupportStatus; created_at: string }

export interface ClientError { status: number; method: string; route_template: string; at: string }

export interface SupportCreateBody {
  text: string;
  client_key: string;
  page: string;
  errors: ClientError[];
}

// ── words ─────────────────────────────────────────────────────────────────────────────────────────────

export const SUPPORT_LABEL = "Поддержка";
export const SUPPORT_MY_LABEL = "Мои обращения";
export const SUPPORT_FORM_HINT = "Опишите, что случилось и на какой странице. Пароли не пишите.";
export const SUPPORT_AUTO_NOTE = "К обращению приложатся страница, роль и браузер — без личных данных.";
export const SUPPORT_EMPTY_TITLE = "Обращений нет";
export const SUPPORT_EMPTY_TEXT = "Нажмите «Поддержка», если что-то не работает.";
export const SUPPORT_CLOSED_NOTE = "Обращение закрыто. Если вопрос остался, нажмите «Поддержка» и напишите новое.";

/** What the author sees as the status (the console says «Новое / В работе / Ждём ответа / Решено»). */
export const SUPPORT_STATUS_WORDS: Record<SupportStatus, string> = {
  new: "Отправлено",
  in_progress: "В работе",
  waiting: "Нужен ваш ответ",
  resolved: "Решено",
};
export const SUPPORT_STATUS_TONES: Record<SupportStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-50 text-blue-700",
  waiting: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-700",
};

export function supportStatusWord(status: string): string {
  return SUPPORT_STATUS_WORDS[status as SupportStatus] ?? status;
}

export function supportSentTitle(number: number): string {
  return `Обращение №${number} принято`;
}
export const SUPPORT_SENT_NOTE = "Ответ придёт сюда — в «Мои обращения».";

/** The text problem under the field, or null. */
export function supportTextProblem(text: string): string | null {
  const length = text.trim().length;
  if (length < SUPPORT_TEXT_MIN) return `Напишите подробнее — минимум ${SUPPORT_TEXT_MIN} символов`;
  if (length > SUPPORT_TEXT_MAX) return `Слишком длинно — максимум ${SUPPORT_TEXT_MAX} символов`;
  return null;
}

export function supportFileSizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** «Снимок 1 · PNG · 120 КБ» */
export function supportFileLabel(file: SupportFileInfo): string {
  return `Снимок ${file.index} · ${file.content_type === "image/png" ? "PNG" : "JPEG"} · ${supportFileSizeText(file.size)}`;
}

/** The «Мои обращения» page of the cabinet the person is in (by the first segment of the address). */
export function supportPathOf(pathname: string | null | undefined): string {
  const first = (pathname ?? "").split("/").filter(Boolean)[0];
  return `/${first === "owner" || first === "admin" ? first : "teacher"}/support`;
}

// ── the screenshots ───────────────────────────────────────────────────────────────────────────────────

/** Can this file be attached at all (the browser must be able to draw it)?  The server reads the bytes again. */
export function screenshotProblem(file: { type: string; size: number }, already: number): string | null {
  if (already >= SUPPORT_MAX_FILES) return `Можно приложить не больше ${SUPPORT_MAX_FILES} снимков`;
  if (!file.type.startsWith("image/")) return "Приложите снимок экрана: JPEG или PNG";
  return null;
}

/** Does the picture go as it is?  A PNG of the screen within the limit does; anything else (a photo with its place and time, HEIC, a big file) is drawn again as a JPEG. */
export function sendAsIs(file: { type: string; size: number }): boolean {
  return file.type === "image/png" && file.size <= SUPPORT_TARGET_FILE_BYTES;
}

/** The size of the redrawn picture: the long side is at most 1600. */
export function scaledSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= SUPPORT_MAX_SIDE) return { width, height };
  const k = SUPPORT_MAX_SIDE / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export const JPEG_QUALITIES = [0.85, 0.7, 0.5] as const;

// ── the page and the last errors: no personal data ────────────────────────────────────────────────────

const STATIC_SEGMENT = /^(?:[a-z][a-z-]{0,23}|v[0-9]{1,2})$/;
/**
 * The segment after these is a one-time code or a token: the token pages and the code pages of the product (ONE list: `public-pages.ts`) and the API routes that carry a code
 * (`/exams/by-code/<code>/session-status/<session>`).  The auth-service keeps the same words in `support_rules._TOKEN_PREFIXES`: change both together.
 */
const TOKEN_PREFIXES = new Set<string>([
  ...[...TOKEN_PAGES, ...CODE_PAGES].map((page) => page.replace(/\//g, "")),
  "support-login", "reset", "by-code", "session-status",
]);
const MAX_SEGMENTS = 8;
export const ID_SEGMENT = "[id]";

/** `/teacher/students/<uuid>?redirect=…#x` -> `/teacher/students/[id]`: lower-case words stay, everything else (ids, numbers, codes, tokens) becomes `[id]`; no query, no fragment.  The same rule is on the server. */
export function pageTemplate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  let path = value.trim().slice(0, 2000);
  if (path.slice(0, 12).includes("://") || path.startsWith("//")) {
    try { path = new URL(path.startsWith("//") ? `https:${path}` : path).pathname; } catch { return ""; }
  } else {
    path = path.split("?")[0].split("#")[0];
  }
  const out: string[] = [];
  let afterToken = false;
  for (const segment of path.split("/").filter(Boolean).slice(0, MAX_SEGMENTS)) {
    const keep: boolean = STATIC_SEGMENT.test(segment) && !afterToken;
    out.push(keep ? segment : ID_SEGMENT);
    afterToken = keep && TOKEN_PREFIXES.has(segment);
  }
  return out.length ? `/${out.join("/")}` : "/";
}

export const MAX_CLIENT_ERRORS = 5;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** The ring of the last failed calls: status, method and the TEMPLATE of the route - never the text or the body of an answer. */
const ring: ClientError[] = [];

export function recordClientError(status: number, method: string, endpoint: string, at: Date = new Date()): void {
  const m = method.toUpperCase();
  if (!Number.isInteger(status) || status < 100 || status > 599 || !METHODS.has(m)) return;
  const route = pageTemplate(endpoint);
  if (route.startsWith("/auth/support")) return; // the support's own calls are not what the person is writing about
  ring.push({ status, method: m, route_template: route, at: at.toISOString() });
  while (ring.length > MAX_CLIENT_ERRORS) ring.shift();
}

export function recentClientErrors(): ClientError[] {
  return ring.map((item) => ({ ...item }));
}

export function resetClientErrors(): void {
  ring.length = 0;
}

/** A key the server remembers: the same key returns the same request (a double click, a retry after a lost answer). */
export function newClientKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
