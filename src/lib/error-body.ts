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

function takeFields(into: Record<string, string>, source: unknown): void {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  for (const [name, text] of Object.entries(source as Record<string, unknown>)) {
    const value = Array.isArray(text) ? text.filter((part) => typeof part === "string").join(" ") : typeof text === "string" ? text : "";
    if (value) into[name] = value;
  }
}

export function parseErrorBody(body: unknown): ParsedErrorBody {
  const root = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const detail: unknown = "detail" in root ? root.detail : body;
  const result: ParsedErrorBody = { message: "", issues: [], fields: {}, detail: "detail" in root ? root.detail : undefined };

  if (typeof detail === "string") {
    result.message = detail.trim();
  } else if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item === "string") {
        if (item.trim()) result.issues.push(item.trim());
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const text = typeof entry.msg === "string" ? entry.msg.trim() : "";
      if (text) result.issues.push(text);
      const field = fieldOf(entry.loc);
      if (field && !(field in result.fields)) result.fields[field] = text;
    }
  } else if (detail && typeof detail === "object") {
    const entry = detail as Record<string, unknown>;
    if (typeof entry.message === "string") result.message = entry.message.trim();
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

/** The text to show: the server's own, else the joined validation list, else `fallback`.  Always a string, never an object. */
export function errorMessageOf(parsed: ParsedErrorBody, fallback: string): string {
  return parsed.message || parsed.issues.join("; ") || fallback;
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
