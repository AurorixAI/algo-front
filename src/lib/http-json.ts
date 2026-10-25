/**
 * A small JSON-over-fetch client shared by the two public surfaces that talk to the accounting server without the
 * cabinet session machinery: the app's onboarding pages (request-demo, set-password) and the ALGO console (a static
 * export with no server of its own).  Pure TypeScript: no React, no window, so node:test loads it as is.
 *
 * One place decides how a failure reads to a person: calm Russian text, the server's own Russian message when it sent one,
 * per-field messages of a 422, the seconds of a 429.
 */

export interface HttpErrorInit {
  status: number;
  message: string;
  code?: string;
  fields?: Record<string, string>;
  retryAfter?: number;
  detail?: unknown;
}

export class HttpError extends Error {
  status: number;
  code?: string;
  /** Field name -> message (a 422); empty when the failure is not about a field. */
  fields: Record<string, string>;
  /** Seconds, from `Retry-After` (a 429 / 503). */
  retryAfter?: number;
  detail?: unknown;
  constructor(init: HttpErrorInit) {
    super(init.message);
    this.name = "HttpError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? {};
    this.retryAfter = init.retryAfter;
    this.detail = init.detail;
  }
  /** 0 = the request never reached the server. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export const NETWORK_MESSAGE = "Нет связи с сервером. Проверьте интернет и повторите попытку.";
export const SERVER_MESSAGE = "Сервис временно недоступен. Повторите попытку чуть позже.";

/** «через 40 с» / «через 5 мин» / «через 2 ч» for a wait in seconds. */
export function retryText(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return "чуть позже";
  if (seconds < 60) return `через ${Math.ceil(seconds)} с`;
  if (seconds < 3600) return `через ${Math.ceil(seconds / 60)} мин`;
  return `через ${Math.ceil(seconds / 3600)} ч`;
}

const CYRILLIC = /[а-яё]/i;

function fallbackMessage(status: number, retryAfter?: number): string {
  if (status === 401) return "Сессия закончилась. Войдите снова.";
  if (status === 403) return "Недостаточно прав для этого действия.";
  if (status === 404) return "Не найдено.";
  if (status === 409) return "Действие уже выполнено или невозможно в текущем состоянии. Обновите страницу.";
  if (status === 410) return "Эта возможность отключена.";
  if (status === 422) return "Проверьте заполнение полей.";
  if (status === 429) return `Слишком много попыток. Повторите ${retryText(retryAfter)}.`;
  return SERVER_MESSAGE;
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers?.get?.("Retry-After")?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return seconds > 0 ? seconds : undefined;
  }
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return undefined;
  const left = Math.ceil((at - Date.now()) / 1000);
  return left > 0 ? left : undefined;
}

/** Field name of a FastAPI `loc` (`["body", "email"]` -> `email`; `["body", "items", 0, "name"]` -> `items.0.name`). */
function fieldOf(loc: unknown): string | null {
  if (!Array.isArray(loc)) return typeof loc === "string" ? loc : null;
  const parts = loc.filter((part) => part !== "body" && part !== "query" && part !== "path").map(String);
  return parts.length ? parts.join(".") : null;
}

/** Turn the JSON body of a failed response into an error.  Understands FastAPI (`detail` string / list / object) and `{message, fields}`. */
export function errorFromBody(status: number, body: unknown, retryAfter?: number): HttpError {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const detail = "detail" in root ? root.detail : body;
  let message = "";
  let code: string | undefined;
  const fields: Record<string, string> = {};

  const takeFields = (source: unknown) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return;
    for (const [name, text] of Object.entries(source as Record<string, unknown>)) {
      const value = Array.isArray(text) ? text.map(String).join(" ") : typeof text === "string" ? text : "";
      if (value && CYRILLIC.test(value)) fields[name] = value;
      else if (value) fields[name] = "Проверьте это поле";
    }
  };

  if (typeof detail === "string") {
    message = detail;
  } else if (Array.isArray(detail)) {
    for (const item of detail) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const field = fieldOf(entry.loc);
      const text = typeof entry.msg === "string" ? entry.msg : "";
      const shown = CYRILLIC.test(text) ? text : "Проверьте это поле";
      if (field && !(field in fields)) fields[field] = shown;
    }
  } else if (detail && typeof detail === "object") {
    const entry = detail as Record<string, unknown>;
    if (typeof entry.message === "string") message = entry.message;
    if (typeof entry.code === "string") code = entry.code;
    takeFields(entry.fields);
    takeFields(entry.errors);
  }
  takeFields(root.fields);
  // The accounting server's new endpoints put `code` / `fields` / `retry_after` next to `detail` (API_CONTRACT.md §0).
  if (typeof root.code === "string") code = root.code;
  if (retryAfter === undefined && typeof root.retry_after === "number" && root.retry_after > 0) retryAfter = root.retry_after;

  if (status === 429 && !message) message = fallbackMessage(429, retryAfter);
  // A message that is not Russian (a framework default such as «Not Found») is never shown to a person.
  if (!message || !CYRILLIC.test(message)) message = fallbackMessage(status, retryAfter);
  return new HttpError({ status, message, code, fields, retryAfter, detail });
}

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** A 401 of this call is its own answer (a wrong password on the sign-in form), not a lost session: `onUnauthorized` stays quiet. */
  skipUnauthorizedHook?: boolean;
  /** Query string values; `undefined`, `null` and "" are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
}

export interface JsonClientConfig {
  /** `https://host/api/v1` or `/api/v1` (same origin). No trailing slash. */
  baseUrl: string;
  /** Default: the global `fetch`.  Tests pass a recorder. */
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
  /** Called on every 401 before the error is thrown (the console sends the person to its login). */
  onUnauthorized?: (error: HttpError) => void;
}

export function buildQuery(query: JsonRequestOptions["query"]): string {
  if (!query) return "";
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length ? `?${pairs.join("&")}` : "";
}

/** A path segment from user data (a token, an id): never lets `/`, `?`, `#`, `..` through. */
export function seg(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function createJsonClient(config: JsonClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  return async function request<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
    const doFetch = config.fetchImpl ?? fetch;
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}${buildQuery(options.query)}`, {
        method,
        headers,
        credentials: config.credentials ?? "include",
        cache: "no-store",
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      throw new HttpError({ status: 0, message: NETWORK_MESSAGE });
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = errorFromBody(response.status, body, retryAfterSeconds(response));
      if (response.status === 401 && !options.skipUnauthorizedHook) config.onUnauthorized?.(error);
      throw error;
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text().catch(() => "");
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError({ status: response.status, message: SERVER_MESSAGE });
    }
  };
}
