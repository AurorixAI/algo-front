import { formatUtcNaiveAsBusinessDateTime } from "./business-time";
import { toCsv } from "./csv";

export interface ExamSessionCsvRow {
  student_name: string;
  variant_number: number;
  score: number;
  max_score: number;
  correct_count: number;
  total_tasks: number;
  percentage: number;
  time_spent_seconds: number;
  status: string;
  submitted_at?: string | null;
}

export const EXAM_SESSIONS_CSV_HEADER = ["Студент", "Вариант", "Балл", "Макс", "Правильных", "Всего", "Процент", "Время", "Статус", "Сдано"];

/** The status as the teacher reads it on the screen («Сдал» / «Проходит»), never the raw `submitted`. */
export function examSessionStatusLabel(status: string): string {
  return status === "submitted" ? "Сдал" : "Проходит";
}

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The whole file of «Результаты экзамена»: header + one record per session. */
export function buildExamSessionsCsv(sessions: ExamSessionCsvRow[]): string {
  return toCsv([
    EXAM_SESSIONS_CSV_HEADER,
    ...sessions.map((s) => [
      s.student_name,
      s.variant_number,
      s.score,
      s.max_score,
      s.correct_count,
      s.total_tasks,
      s.percentage.toFixed(1),
      formatMinutes(s.time_spent_seconds),
      examSessionStatusLabel(s.status),
      // naive-UTC server stamp shown on the Tashkent clock
      formatUtcNaiveAsBusinessDateTime(s.submitted_at) || "—",
    ]),
  ]);
}
