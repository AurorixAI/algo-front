/**
 * The type of an organisation in words.  The server accepts six (`CreateOrg.org_type`): center, private_school, university,
 * tutoring_center, tutor, other.  ONE function says them on every screen; a value nobody knows is never shown in Latin letters.
 */
const ORG_TYPE_LABEL: Readonly<Record<string, string>> = {
  center: "Учебный центр",
  private_school: "Частная школа",
  university: "Университет",
  tutoring_center: "Репетиторский центр",
  tutor: "Репетитор",
  other: "Другое",
};

/** What is shown when the type is empty or unknown. */
export const ORG_TYPE_UNKNOWN_LABEL = "Не указан";

/** The six types the server allows, in the order of the sign-up form. */
export const ORG_TYPES: readonly string[] = Object.keys(ORG_TYPE_LABEL);

/** «Учебный центр» for `center`; «Не указан» for an empty or unknown value (never the raw code). */
export function orgTypeLabel(type: string | null | undefined): string {
  const key = typeof type === "string" ? type.trim() : "";
  return Object.prototype.hasOwnProperty.call(ORG_TYPE_LABEL, key) ? ORG_TYPE_LABEL[key] : ORG_TYPE_UNKNOWN_LABEL;
}
