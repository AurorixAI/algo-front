/**
 * How a failed exam-history request is shown on the student profile.
 *
 * `ApiError` (src/lib/api.ts) carries the HTTP status in `status` (0 = no
 * connection).  A 403 comes from exam-service `require_student_history_access`:
 * the current staff member cannot see this student, and repeating the request
 * can never change that — so it is not retryable.  Network failures and 5xx
 * stay retryable.
 */
export const EXAM_HISTORY_FORBIDDEN_TITLE = "Нет доступа к истории экзаменов";
export const EXAM_HISTORY_FORBIDDEN_MESSAGE = "У вашей учётной записи нет прав на просмотр экзаменов этого ученика.";
export const EXAM_HISTORY_FAILED_TITLE = "Не удалось загрузить экзамены";
const GENERIC_MESSAGE = "Проверьте соединение с интернетом и повторите попытку.";

export interface ExamHistoryError {
  title: string;
  message: string;
  retryable: boolean;
}

export function toExamHistoryError(err: unknown): ExamHistoryError {
  const status = err instanceof Error ? (err as Error & { status?: unknown }).status : undefined;
  if (status === 403) {
    return { title: EXAM_HISTORY_FORBIDDEN_TITLE, message: EXAM_HISTORY_FORBIDDEN_MESSAGE, retryable: false };
  }
  return {
    title: EXAM_HISTORY_FAILED_TITLE,
    message: err instanceof Error && err.message ? err.message : GENERIC_MESSAGE,
    retryable: true,
  };
}
