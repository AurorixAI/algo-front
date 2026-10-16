/**
 * How a staff member (owner, admin, teacher) is written on screen: «Имя Фамилия» (owner decision 15.10).
 * Students keep the journal order «Фамилия Имя»; this helper is for staff only.
 *
 * The server's `User.full_name` is «Фамилия Имя [Отчество]» - the student order - so it must never be shown
 * for a staff member while `first_name` / `last_name` are known.  It stays only as the last fallback for a
 * payload that carries nothing else (it is never split: the order of its words is not ours to guess).
 * No React and no network, so node:test can load this file directly.
 */

export interface StaffNameSource {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

/** «Дилноза Каримова»: first + last; the server's `full_name` when both are empty; `fallback` ("" by default) otherwise. */
export function staffDisplayName(person: StaffNameSource | null | undefined, fallback = ""): string {
  if (!person) return fallback;
  const byParts = [clean(person.first_name), clean(person.last_name)].filter(Boolean).join(" ");
  return byParts || clean(person.full_name) || fallback;
}
