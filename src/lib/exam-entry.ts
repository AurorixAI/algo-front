/** Who may press «Начать» on the public exam page: the full name or an ID, never a single word. */

/** Words of a typed name (surrounding and repeated spaces ignored). */
export function nameWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

/**
 * The server accepts an exact ID, or first + last name as whole words.  Enable the
 * button for either; a one-word name would only be refused, so it does not enable it.
 */
export function canSubmitIdentity(name: string, id: string): boolean {
  return nameWords(name).length >= 2 || id.trim().length > 0;
}

export const IDENTITY_HINT = "Введите имя и фамилию полностью или ID из карточки ученика";

/** Generic on purpose: no centre prefix is assumed; the match is decided by the server. */
export const ID_PLACEHOLDER = "ID из карточки ученика";

/** The student the server confirmed in the pre-check (canonical name and ID). */
export interface ConfirmedStudent {
  name?: string | null;
  display_id?: string | null;
}

/** Fallback when a 429 comes without a readable wait (the server's own text is used first). */
export const RATE_LIMIT_MESSAGE = "Слишком много попыток. Подождите минуту и попробуйте снова.";

/** The server refused for too many attempts (429): the form stays open, nothing about the exam is broken. */
export function isRateLimited(error: unknown): boolean {
  return ((error ?? {}) as { status?: unknown }).status === 429;
}

/** «минуту» up to a minute and a half, then whole minutes rounded up («5 мин»). */
export function waitPhrase(seconds: number): string {
  const wait = Math.max(1, Math.ceil(seconds));
  return wait <= 90 ? "минуту" : `${Math.ceil(wait / 60)} мин`;
}

/**
 * What the student reads after a 429: the wait from `Retry-After` when the response carried it, else the
 * server's own text (it names the wait too), else the fixed fallback.
 */
export function rateLimitMessage(error: unknown): string {
  const { retryAfter, message } = (error ?? {}) as { retryAfter?: unknown; message?: unknown };
  if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0) {
    return `Слишком много попыток. Подождите ${waitPhrase(retryAfter)} и попробуйте снова.`;
  }
  return typeof message === "string" && message.trim() ? message : RATE_LIMIT_MESSAGE;
}

/** Shown when the roster pre-check could not run (network error, 5xx): nothing is started. */
export const CHECK_FAILED_MESSAGE = "Не удалось проверить данные. Повторите попытку.";

/**
 * Text for a failed pre-check. A refusal with a reason from the server (4xx) is shown as is; a
 * network error or a server failure (no status, 0, 5xx) gets the fixed retry message.
 */
export function checkFailureMessage(error: unknown): string {
  if (isRateLimited(error)) return rateLimitMessage(error);
  const { status, message } = (error ?? {}) as { status?: unknown; message?: unknown };
  const clientError = typeof status === "number" && status >= 400 && status < 500;
  return clientError && typeof message === "string" && message.trim() ? message : CHECK_FAILED_MESSAGE;
}

/**
 * What the start request sends.  The confirmed (canonical) name and ID win over what was
 * typed, so an ID-only entry never goes out with an empty name.  Without a confirmation a
 * typed ID is NOT turned into a name (a failed pre-check must not start the exam under a typed ID):
 * the result is `null` and the caller stays on the form.  Only an exam without a group, which
 * has no roster to check against, lets the typed ID stand in for the name (`idStandsInForName`).
 */
export function startIdentity(
  typed: { name: string; id: string },
  confirmed?: ConfirmedStudent | null,
  options: { idStandsInForName?: boolean } = {},
): { student_name: string; student_id: string | undefined; display_id: string | undefined } | null {
  const typedName = typed.name.trim();
  const typedId = typed.id.trim();
  const id = confirmed?.display_id || typedId || undefined;
  const name = confirmed?.name?.trim() || typedName || (options.idStandsInForName ? typedId : "");
  if (!name) return null;
  return { student_name: name, student_id: id, display_id: id };
}
