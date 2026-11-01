/**
 * WB-P5 (F-A23): «Имя и фамилия» typed in ONE field -> the two fields of the profile.  The first word is the first name, the rest
 * is the last name.  A name of one word is NOT a name and a surname at once: the old code copied the word into both («Иван Иван»),
 * and that went into the profile, the statements and the invitation without anyone noticing.  One word is refused with a clear text.
 */
export interface FullName {
  first_name: string;
  last_name: string;
}

export const FULL_NAME_NEEDS_TWO_WORDS = "Укажите имя и фамилию - два слова через пробел";

export function splitFullName(raw: string | null | undefined): FullName | null {
  const words = (raw ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return { first_name: words[0], last_name: words.slice(1).join(" ") };
}
