// The case of a short name «Фамилия И.» for a sentence: one small module with no imports, so the money screens and the substitutions share it without a cycle.

/** The case of a short name «Фамилия И.» for a sentence («вместо Иванова А.», «за Ивановым А.»). */
export type NameCase = "genitive" | "instrumental";

const MASCULINE = /(ов|ев|ёв|ин|ын)$/i;
export const FEMININE = /(ова|ева|ёва|ина|ына)$/i;

/**
 * «Иванов А.» -> «Иванова А.» / «Ивановым А.»; «Каримова Н.» -> «Каримовой Н.» (both cases end in «ой»).  Only the plain -ов/-ев/-ин and
 * -ова/-ева/-ина surnames are declined; any other surname is returned as null, so the caller words the sentence without a case.
 */
export function declineShortName(name: string | null | undefined, grammarCase: NameCase): string | null {
  const text = (name ?? "").trim();
  const match = /^(\S+)(\s.+)?$/.exec(text);
  if (!match) return null;
  const [, surname, rest = ""] = match;
  if (FEMININE.test(surname)) return `${surname.slice(0, -1)}ой${rest}`;
  if (MASCULINE.test(surname)) return `${surname}${grammarCase === "genitive" ? "а" : "ым"}${rest}`;
  return null;
}

/** For «вместо …», «у …», «в зарплату …». */
export function genitiveShortName(name: string | null | undefined): string | null {
  return declineShortName(name, "genitive");
}

