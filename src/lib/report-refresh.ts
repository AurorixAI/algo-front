/**
 * Loading / refreshing the pedagogical report of an exam (teacher/exams/[id]/report).
 *
 * The server answers `POST /exams/{id}/report?force=true` with 409 `REPORT_COOLDOWN` (the report was rebuilt a
 * moment ago; `Retry-After`) or 409 `REPORT_IN_PROGRESS` (someone is building it right now). Neither is a failure of
 * the report: the report the teacher is looking at is still the current one, so it STAYS on the screen and the
 * server's own Russian sentence is shown calmly above it.
 */

export interface ReportLoadResult<R> {
  /** What the page shows now (the previous report is kept when a refresh was refused). */
  report: R | null;
  /** A calm one-line explanation to show above the report, or null. */
  notice: string | null;
}

interface ReportErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  retryAfter?: unknown;
}

const REFUSAL_CODES = new Set(["REPORT_COOLDOWN", "REPORT_IN_PROGRESS"]);

export function isReportRefusal(error: unknown): boolean {
  const e = (error ?? {}) as ReportErrorLike;
  return typeof e.code === "string" && REFUSAL_CODES.has(e.code);
}

function waitText(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.ceil(seconds))} сек.`;
  return `${Math.ceil(seconds / 60)} мин.`;
}

/** The server's sentence; the wait of `Retry-After` is added only when the sentence does not name a time itself. */
export function reportRefusalNotice(error: unknown): string {
  const e = (error ?? {}) as ReportErrorLike;
  const message = typeof e.message === "string" && e.message.trim() ? e.message.trim() : "Не удалось обновить отчёт. Попробуйте позже.";
  const wait = typeof e.retryAfter === "number" && Number.isFinite(e.retryAfter) && e.retryAfter > 0 ? e.retryAfter : null;
  if (wait === null || /\d+\s*(мин|сек)|минут/i.test(message)) return message;
  return `${message} Повторите через ${waitText(wait)}`;
}

export async function loadExamReport<R>(args: {
  force: boolean;
  examStatus: string | undefined;
  previous: R | null;
  getReport: () => Promise<R>;
  generateReport: (force: boolean) => Promise<R>;
}): Promise<ReportLoadResult<R>> {
  const { force, examStatus, previous } = args;
  if (force) {
    try {
      return { report: await args.generateReport(true), notice: null };
    } catch (err) {
      // a refused / failed refresh never wipes the report that is on the screen
      return { report: previous, notice: reportRefusalNotice(err) };
    }
  }
  try {
    return { report: await args.getReport(), notice: null };
  } catch {
    if (examStatus === "closed" || examStatus === "archived") {
      try {
        return { report: await args.generateReport(false), notice: null };
      } catch (genErr) {
        // being built right now (another tab, the sweeper): say so instead of an unexplained empty page
        return { report: null, notice: isReportRefusal(genErr) ? reportRefusalNotice(genErr) : null };
      }
    }
    return { report: null, notice: null };
  }
}
