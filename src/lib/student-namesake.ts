/**
 * Namesakes in a list of students to add («Иванов Иван» twice): the row of a student whose name is not unique in the list says what tells him apart - the end of his phone («тел. …12 34»), else the day he was
 * added («добавлен 12.10.2026»), else his ID.  A unique name says nothing (the line stays as it was).  Pure.
 */
import { formatDateRu } from "./business-time";

export interface NamesakeInput {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  student_phone?: string | null;
  phone?: string | null;
  joined_at?: string | null;
  created_at?: string | null;
  display_id?: string | null;
}

const nameOf = (s: NamesakeInput) => (s.full_name || `${s.last_name ?? ""} ${s.first_name ?? ""}`).trim().toLowerCase().replace(/\s+/g, " ");

const tailOf = (s: NamesakeInput): string => {
  const digits = String(s.student_phone ?? s.phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
};
const dayOf = (s: NamesakeInput): string => (s.created_at ?? s.joined_at ?? "").slice(0, 10);
const allDistinct = (values: string[]): boolean => values.every(Boolean) && new Set(values).size === values.length;

/**
 * The detail must really TELL the namesakes apart, in this order: the end of the phone if the ends of ALL of them differ; else the day each was added if those differ; else the ID.
 * (Two students with the same name and phones that end in the same four digits are told apart by the day, then by the ID.)
 */
export function namesakeDetail(student: NamesakeInput, all: NamesakeInput[]): string | null {
  const name = nameOf(student);
  if (!name) return null;
  const group = all.filter((other) => nameOf(other) === name);
  if (group.length < 2) return null;
  if (allDistinct(group.map(tailOf))) { const tail = tailOf(student); return `тел. …${tail.slice(0, 2)} ${tail.slice(2)}`; }
  if (allDistinct(group.map(dayOf))) return `добавлен ${formatDateRu(dayOf(student))}`;
  // the public ID is given at the enrolment: while one of the namesakes has none, the ID cannot tell them apart - the minute of adding does
  if (group.every((other) => other.display_id)) return `ID ${student.display_id}`;
  const stamp = (x: NamesakeInput) => (x.created_at ?? x.joined_at ?? "").slice(0, 16);
  if (allDistinct(group.map(stamp))) return `добавлен ${formatDateRu(dayOf(student))} ${stamp(student).slice(11)}`;
  return student.display_id ? `ID ${student.display_id}` : null;
}
