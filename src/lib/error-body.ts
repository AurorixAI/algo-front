/**
 * WB-P5 (BUG-4, BUG-5, DUP-1): the ONE reader of the body of a failed answer.
 *
 * Every client of the app (the accounting API, the exam service, the diagnostic service, the uploads and downloads, the
 * public onboarding client of `http-json.ts`) used to read `detail` on its own, and each copy forgot a shape: an import with a
 * bad file showed «[object Object]» (`detail` was a list), the exam service lost `{code, message}`, the diagnostic service
 * showed raw JSON.  Pure TypeScript (no React, no window): node:test loads it as is.
 *
 * Understood shapes (FastAPI and the accounting server's contract):
 * - `{detail: "text"}`;
 * - `{detail: [{loc: ["body", "email"], msg: "text"}, ...]}` - the 422 list: a text per field;
 * - `{detail: {code, message, action, fields, errors, ...}}`;
 * - `{code, message, fields, retry_after}` next to or instead of `detail`.
 * A value that is not a string is NEVER turned into text (no «[object Object]», no raw JSON).
 */
import { tidyMoneyText } from "./money-format";

export interface ParsedErrorBody {
  /** The text the server wrote for the person ("" when the body has none of its own). */
  message: string;
  /** The texts of a validation list, in order ("" entries are dropped); the message of an error with no text of its own. */
  issues: string[];
  code?: string;
  action?: string;
  /** Field name -> text (a 422 or `fields`).  The texts are the server's, not yet checked for language. */
  fields: Record<string, string>;
  /** `detail` as the server sent it (the extra keys: `missing[]`, `current_revision`). */
  detail: unknown;
  /** `retry_after` of the body, when it is a positive number. */
  retryAfter?: number;
}

/** Field name of a FastAPI `loc` (`["body", "email"]` -> `email`; `["body", "items", 0, "name"]` -> `items.0.name`). */
export function fieldOf(loc: unknown): string | null {
  if (!Array.isArray(loc)) return typeof loc === "string" ? loc : null;
  const parts = loc.filter((part) => part !== "body" && part !== "query" && part !== "path").map(String);
  return parts.length ? parts.join(".") : null;
}

const CYRILLIC = /[а-яё]/i;

/** The framework puts «Value error, » in front of the text a validator raised: it is not part of the sentence. */
export function stripValueError(text: string): string {
  return text.replace(/^\s*Value error,\s*/i, "").trim();
}

function takeFields(into: Record<string, string>, source: unknown): void {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  for (const [name, text] of Object.entries(source as Record<string, unknown>)) {
    const value = stripValueError(Array.isArray(text) ? text.filter((part) => typeof part === "string").join(" ") : typeof text === "string" ? text : "");
    if (value) into[name] = value;
  }
}

export function parseErrorBody(body: unknown): ParsedErrorBody {
  const root = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const detail: unknown = "detail" in root ? root.detail : body;
  const result: ParsedErrorBody = { message: "", issues: [], fields: {}, detail: "detail" in root ? root.detail : undefined };

  if (typeof detail === "string") {
    result.message = stripValueError(detail);
  } else if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item === "string") {
        if (stripValueError(item)) result.issues.push(stripValueError(item));
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const text = typeof entry.msg === "string" ? stripValueError(entry.msg) : "";
      if (text) result.issues.push(text);
      const field = fieldOf(entry.loc);
      if (field && !(field in result.fields)) result.fields[field] = text;
    }
  } else if (detail && typeof detail === "object") {
    const entry = detail as Record<string, unknown>;
    if (typeof entry.message === "string") result.message = stripValueError(entry.message);
    if (typeof entry.code === "string") result.code = entry.code;
    if (typeof entry.action === "string") result.action = entry.action;
    takeFields(result.fields, entry.fields);
    takeFields(result.fields, entry.errors);
  }
  takeFields(result.fields, root.fields);
  // the new routes put `code` / `retry_after` next to `detail` (API_CONTRACT.md §0)
  if (typeof root.code === "string") result.code = root.code;
  if (typeof root.retry_after === "number" && root.retry_after > 0) result.retryAfter = root.retry_after;
  return result;
}

/** What a person is told when the server sent no sentence in Russian: by the machine code of the answer when we know it, else by the status. */
const CODE_TEXT: Record<string, string> = {
  IMPORT_IN_PROGRESS: "Импорт уже идёт. Подождите минуту и повторите.",
  EXAM_NOT_ARCHIVED: "Экзамен уже не в архиве. Обновите страницу.",
  DUPLICATE_PAYMENT: "Эта оплата уже внесена",
  DUPLICATE_PAYOUT: "Эта выплата уже внесена",
};

/** A calm phrase for a status (the server's own English default is never shown); null for a status with no common meaning. */
export function statusPhrase(status: number | undefined): string | null {
  if (status === undefined) return null;
  if (status === 401) return "Сессия закончилась. Войдите снова.";
  if (status === 403) return "Нет доступа";
  if (status === 404) return "Не найдено";
  if (status === 409) return "Данные изменились — обновите страницу";
  if (status === 400 || status === 422) return "Проверьте заполнение полей";
  if (status === 429) return "Слишком много попыток. Повторите позже.";
  if (status === 0 || status >= 500) return "Сервис временно недоступен";
  return null;
}

/**
 * The text to show a person.  Only a sentence with Cyrillic in it is shown (a framework default such as «Not Found», «Field required»
 * is not for people); the validators' «Value error, » prefix is cut.  Order: the server's own Russian sentence, the Russian items
 * of a validation list, the text of the machine `code`, `specific` (a screen's own sentence, e.g. «Не удалось скачать шаблон»),
 * the phrase of the status, the plain `fallback`.
 */
export function errorMessageOf(parsed: ParsedErrorBody, fallback: string, status?: number, specific = false): string {
  // re-audit В5: a sentence of the server about money never breaks inside «360 000 сум»
  if (parsed.message && CYRILLIC.test(parsed.message)) return tidyMoneyText(parsed.message);
  const russian = parsed.issues.filter((item) => CYRILLIC.test(item));
  if (russian.length) return tidyMoneyText(russian.join("; "));
  if (parsed.code && CODE_TEXT[parsed.code]) return CODE_TEXT[parsed.code];
  if (specific) return fallback;
  return statusPhrase(status) ?? fallback;
}

/** The JSON body of a non-OK response (`null` when it is empty, not JSON or unreadable).  Works with a bare `{json}` fake as well. */
export async function readErrorBody(response: { text?: () => Promise<string>; json?: () => Promise<unknown> }): Promise<unknown> {
  try {
    if (typeof response.text === "function") {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    if (typeof response.json === "function") return (await response.json()) ?? null;
  } catch {
    /* not JSON */
  }
  return null;
}
