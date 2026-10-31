/**
 * «Поддержка» (K4a): the rules and the words of the form and of «Мои обращения».  Pure (tested without a browser).
 * The server judges everything again; the page template and the errors are cleaned here AND there (the server never trusts the client).
 */

import { TOKEN_SEGMENTS } from "./public-pages";

export const SUPPORT_TEXT_MIN = 10;
export const SUPPORT_TEXT_MAX = 2000;
export const SUPPORT_REPLY_MAX = 2000;
export const SUPPORT_MAX_FILES = 3;
export const SUPPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
/** What the browser sends is kept a little under the limit, so the frame of the form never pushes it over. */
export const SUPPORT_TARGET_FILE_BYTES = Math.floor(1.9 * 1024 * 1024);
export const SUPPORT_MAX_SIDE = 2560;

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

/** The size of the redrawn picture: the long side is at most 2560. */
export function scaledSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= SUPPORT_MAX_SIDE) return { width, height };
  const k = SUPPORT_MAX_SIDE / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export const JPEG_QUALITIES = [0.85, 0.7, 0.5] as const;
/** When even the lowest quality is over the limit the picture is made smaller by this factor and tried again (twice at most). */
export const SHRINK_STEP = 0.7;
export const SHRINK_ROUNDS = 2;

// ── the page and the last errors: no personal data ────────────────────────────────────────────────────

const STATIC_SEGMENT = /^(?:[a-z][a-z-]{0,23}|v[0-9]{1,2})$/;
/** The segment after these is a one-time code or a token: ONE list, `public-pages.ts` (the same words are in `support_rules._TOKEN_PREFIXES` and the masks of nginx). */
export const TOKEN_PREFIXES: ReadonlySet<string> = new Set<string>(TOKEN_SEGMENTS);
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

let ringOwner: string | null = null;

/** The ring belongs to ONE person: when another one signs in (or nobody does) the failed calls of the first are forgotten - a shared computer must not hand them to the next request. */
export function bindClientErrorsTo(userId: string | null | undefined): void {
  const next = userId ?? null;
  if (next !== ringOwner) resetClientErrors();
  ringOwner = next;
}

/** A key the server remembers: the same key returns the same request (a double click, a retry after a lost answer). */
export function newClientKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

// ── why a screenshot did not go (R3-13) ───────────────────────────────────────────────────────────────

/** In words, for the plate «снимок не загрузился»: the size, the format, the limit of 3, the network.  `error` is an `ApiError` of the server, or an `Error` of the redrawing. */
export function lostReason(error: unknown): string {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
  const message = error instanceof Error ? error.message : "";
  if (status === 413) return "больше 2 МБ";
  if (status === 415) return /слишком большое/i.test(message) ? "слишком большое изображение" : "формат не подходит (нужен JPEG или PNG)";
  if (status === 409) return /не больше 3/.test(message) ? "уже приложено 3 снимка" : "обращение закрыто";
  if (status === 429) return "слишком много запросов — повторите позже";
  if (status === 0 || /Не удалось подключиться/.test(message)) return "нет связи";
  if (status === undefined && message) return message.replace(/[.\s]+$/, "").replace(/^./, (c) => c.toLowerCase());
  return "не удалось загрузить";
}
