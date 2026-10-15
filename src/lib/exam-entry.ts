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

/**
 * What the start request sends.  The confirmed (canonical) name and ID win over what was
 * typed, so an ID-only entry never goes out with an empty name; when the pre-check could
 * not run, the typed ID stands in for the name instead of an empty string.
 */
export function startIdentity(
  typed: { name: string; id: string },
  confirmed?: ConfirmedStudent | null,
): { student_name: string; student_id: string | undefined; display_id: string | undefined } {
  const typedName = typed.name.trim();
  const typedId = typed.id.trim();
  const id = confirmed?.display_id || typedId || undefined;
  return {
    student_name: confirmed?.name?.trim() || typedName || typedId,
    student_id: id,
    display_id: id,
  };
}
