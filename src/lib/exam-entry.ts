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

/** Example text only - the match is decided by the server; a centre prefix is used when the exam exposes one. */
export function idPlaceholder(prefix?: string | null): string {
  const clean = (prefix || "").trim().replace(/[-_\s]+$/, "");
  return `Например, ${clean || "TE"}-031`;
}
