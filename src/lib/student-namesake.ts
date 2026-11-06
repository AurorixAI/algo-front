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

export function namesakeDetail(student: NamesakeInput, all: NamesakeInput[]): string | null {
  const name = nameOf(student);
  if (!name || all.filter((other) => nameOf(other) === name).length < 2) return null;
  const digits = String(student.student_phone ?? student.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return `тел. …${digits.slice(-4, -2)} ${digits.slice(-2)}`;
  const added = student.joined_at ?? student.created_at;
  if (added) return `добавлен ${formatDateRu(added.slice(0, 10))}`;
  return student.display_id ? `ID ${student.display_id}` : null;
}
