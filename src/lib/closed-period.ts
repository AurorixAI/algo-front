/**
 * «Деньги-1» A1 (frontend): the closed month of a teacher and «Переоткрыть месяц».  Contract: `GET /auth/org/payroll-periods?month=YYYY-MM`,
 * `POST /auth/org/payroll-periods/{YYYY-MM}/reopen`, the refusal `409 PERIOD_CLOSED {month, teacherId, teacherName, closedOn}` (server `closed_period.py`).
 *
 * A month of a teacher is CLOSED when the last sheet of it was saved after the month ended; a sheet saved in the middle of the month does not close it; the owner (an
 * administrator with the payments right) may REOPEN it with a reason - until the sheet is saved again.  The screens only show the state the server gives and the one
 * action; the rule itself is the server's.
 *
 * Pure: no React, no network.
 */
import { formatBusinessDate, formatDateRu } from "./business-time";
import { REASON_MAX, REASON_MIN } from "./payments";
import { monthInSentence, monthLabel, type PeriodState } from "./money-effects";
import { genitiveShortName } from "./name-case";
import { CHIP_TONE_CLASS, type ChipTone } from "./chip-tone";

export interface PeriodReopened {
  /** Naive UTC timestamp of the reopening. */
  at: string | null;
  by: string | null;
  reason: string | null;
}

export interface PayrollPeriodItem {
  teacherId: string;
  teacherName: string | null;
  /** `YYYY-MM` */
  month: string;
  state: PeriodState;
  /** The business day the closing sheet was saved (`YYYY-MM-DD`); null while the month is open. */
  closedOn: string | null;
  sheetId: string | null;
  /** R3 #11: the revision of the saved sheet the screen saw: «Переоткрыть месяц» sends it back (`sheet_revision`), so a late duplicate after a re-save is refused (409 `SHEET_CHANGED`). */
  sheetRevision: number | null;
  reopened: PeriodReopened | null;
}

export interface PayrollPeriods {
  month: string;
  items: PayrollPeriodItem[];
}

export interface ReopenResult {
  ok: boolean;
  /** false: the month was open already (a repeat, a double click): nothing was written. */
  changed: boolean;
  teacherId: string;
  month: string;
  state: PeriodState;
  closedOn: string | null;
  sheetId: string | null;
  reopened: PeriodReopened | null;
}

export function normalizePeriods(raw: Partial<PayrollPeriods> | null | undefined): PayrollPeriods {
  const items = (Array.isArray(raw?.items) ? raw!.items! : [])
    .filter((item) => item && item.teacherId)
    .map((item): PayrollPeriodItem => ({
      teacherId: String(item.teacherId),
      teacherName: item.teacherName ?? null,
      month: String(item.month ?? raw?.month ?? ""),
      state: item.state === "open" || item.state === "closed" || item.state === "reopened" ? item.state : "none",
      closedOn: item.closedOn ?? null,
      sheetId: item.sheetId ?? null,
      sheetRevision: typeof item.sheetRevision === "number" && Number.isFinite(item.sheetRevision) ? item.sheetRevision : null,
      reopened: item.reopened ? { at: item.reopened.at ?? null, by: item.reopened.by ?? null, reason: item.reopened.reason ?? null } : null,
    }));
  return { month: String(raw?.month ?? ""), items };
}

/** The state of one teacher's month in the list, or null when the teacher has no sheet (nothing to close). */
export function periodOf(periods: PayrollPeriods | null | undefined, teacherId: string | null | undefined): PayrollPeriodItem | null {
  if (!periods || !teacherId) return null;
  const item = periods.items.find((candidate) => candidate.teacherId === teacherId);
  return item && item.state !== "none" ? item : null;
}

export type PeriodTone = "open" | "closed" | "reopened";

export interface PeriodView {
  tone: PeriodTone;
  /** The short chip: «Месяц закрыт» / «Месяц переоткрыт» / «Месяц открыт». */
  label: string;
  /** What it means and what to do (a tooltip, a line under the sheet). */
  hint: string;
  /** «Переоткрыть месяц» is offered. */
  canReopen: boolean;
}

/** One reading of the state for every screen (the month list, the sheet, the lesson windows). */
export function periodView(item: Pick<PayrollPeriodItem, "state" | "closedOn" | "reopened"> | null | undefined): PeriodView | null {
  if (!item) return null;
  if (item.state === "closed") {
    const day = item.closedOn ? formatDateRu(item.closedOn) : "";
    return {
      tone: "closed",
      label: "Месяц закрыт",
      // §1: ONE help text for the closed month everywhere («зарплата сохранена», not «закрыт ведомостью»)
      hint: `Зарплата за месяц сохранена${day ? ` ${day}` : ""} — уроки этого месяца менять нельзя, пока месяц не переоткрыт.`,
      canReopen: true,
    };
  }
  if (item.state === "reopened") {
    const who = item.reopened?.by ? ` Переоткрыл(а) ${item.reopened.by}.` : "";
    return {
      tone: "reopened",
      label: "Месяц переоткрыт",
      hint: `Уроки этого месяца можно исправлять.${who} Когда закончите, нажмите «Сохранить и закрыть месяц» — месяц закроется снова.`,
      canReopen: false,
    };
  }
  if (item.state === "open") {
    return {
      tone: "open",
      label: "Месяц открыт",
      hint: "Зарплата сохранена до конца месяца или ещё не сохранена: уроки этого месяца можно исправлять.",
      canReopen: false,
    };
  }
  return null;
}

/**
 * L2 (UX pack): the row of a month that is RUNNING does not say «Месяц открыт» - the header of the page already says the month is going; the row shows only what differs («Месяц закрыт», «Месяц переоткрыт»).
 * In a finished month an open one IS a difference (the sheet was saved before the month ended, nothing closes it yet) and stays.
 */
export function monthPeriodView(view: PeriodView | null, monthRunning: boolean): PeriodView | null {
  return monthRunning && view?.tone === "open" ? null : view;
}

export const PERIOD_CHIP_TONE: Record<PeriodTone, ChipTone> = { open: "neutral", closed: "neutral", reopened: "warn" };
export const PERIOD_CHIP_CLASS: Record<PeriodTone, string> = {
  open: CHIP_TONE_CLASS.neutral,
  closed: CHIP_TONE_CLASS.neutral,
  reopened: CHIP_TONE_CLASS.warn,
};

// ── «Переоткрыть месяц» ───────────────────────────────────────────────────────────────────────────

export const REOPEN_TITLE = "Переоткрыть месяц?";
export const REOPEN_BUTTON = "Переоткрыть месяц";
export const REOPEN_REASON_LABEL = "Причина (обязательно)";
export const REOPEN_REASON_PLACEHOLDER = "Например: ошибочно отметили «Урока не было», нужно исправить";
export const REOPEN_EXPLAIN = "Пока месяц открыт, уроки этого месяца можно исправлять: отметки, справки, паузы, смену преподавателя. Зарплата и выплата сами не меняются — после исправлений нажмите «Сохранить и закрыть месяц».";
/**
 * The one button of a REOPENED month (walk of 05.11, round 3): the month is closed again only by a save of the sheet - also when nothing has changed since (the lessons were put back as they were), so the button
 * is there always, not only when the data moved.  The server takes the save without changes (`PATCH … recalculate`), and the save after the reopening is what closes the month.
 */
export const CLOSE_MONTH_LABEL = "Сохранить и закрыть месяц";
/** The toast after it. */
export const CLOSE_MONTH_DONE = "Зарплата сохранена, месяц закрыт";
export const REOPEN_DONE_TEXT = "Месяц переоткрыт";
export const REOPEN_ALREADY_TEXT = "Месяц уже открыт";
export const REOPEN_NO_SHEET_TEXT = "Зарплата за этот месяц не сохранена: переоткрывать нечего";

export function reopenDescription(teacherName: string | null | undefined, month: string): string {
  return [teacherName?.trim(), monthInSentence(month)].filter(Boolean).join(" · ");
}

export function validateReopenReason(reason: string | null | undefined): string | null {
  const text = (reason ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

export function buildReopenBody(teacherId: string, reason: string, sheetRevision: number): { teacher_id: string; reason: string; sheet_revision: number } {
  return { teacher_id: teacherId, reason: reason.trim(), sheet_revision: sheetRevision };
}

/** 409 `SHEET_CHANGED` (the sheet was saved again after the screen read it): the screen reads the revision again and asks once more, with the server's sentence. */
export function isSheetChanged(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === "SHEET_CHANGED";
}

/** The revision to send: the sheet's revision of the row of this teacher in the list of months; null when the teacher has no saved sheet there. */
export function revisionOf(periods: PayrollPeriods | null | undefined, teacherId: string): number | null {
  return periods?.items.find((item) => item.teacherId === teacherId)?.sheetRevision ?? null;
}

export function reopenToast(result: Pick<ReopenResult, "changed">): string {
  return result.changed ? REOPEN_DONE_TEXT : REOPEN_ALREADY_TEXT;
}

/**
 * The words of the refusals of the reopening: the SERVER's own sentence for every coded refusal (`SHEET_NOT_FOUND`, `REASON_REQUIRED`, `REVISION_REQUIRED`, `SHEET_CHANGED`, `MONTH_INVALID`,
 * `MONEY_RIGHT_REQUIRED`) - the catalogue of the server is the one source (R3 #16); ours only for a failure that has no text at all.
 */
export function reopenErrorText(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  const message = error instanceof Error ? error.message.trim() : "";
  if (message) return message;
  if (code === "SHEET_NOT_FOUND") return REOPEN_NO_SHEET_TEXT;
  return "Не удалось переоткрыть месяц. Данные не изменены.";
}

// ── the refusal «месяц закрыт» on the screens of lessons ──────────────────────────────────────────

export interface PeriodClosedInfo {
  /** `YYYY-MM` */
  month: string;
  teacherId: string | null;
  teacherName: string | null;
  /** `YYYY-MM-DD` */
  closedOn: string | null;
  /** The server's sentence (it says who reopens the month). */
  message: string;
}

/**
 * `409 PERIOD_CLOSED` (and the pause's `422 PAUSE_LOCKED` which carries the same fields): the month the action touches is closed.  null for any other failure.
 * The window then shows the server's sentence and - for a person with the money right - the button «Переоткрыть месяц» with this teacher and month.
 */
export function periodClosedOf(error: unknown): PeriodClosedInfo | null {
  const source = error as { code?: unknown; message?: unknown; detail?: unknown } | null | undefined;
  if (!source || (source.code !== "PERIOD_CLOSED" && source.code !== "PAUSE_LOCKED")) return null;
  const detail = source.detail && typeof source.detail === "object" ? (source.detail as Record<string, unknown>) : {};
  const month = typeof detail.month === "string" && /^\d{4}-\d{2}$/.test(detail.month) ? detail.month : "";
  const teacherId = typeof detail.teacherId === "string" && detail.teacherId ? detail.teacherId : null;
  const message = typeof source.message === "string" ? source.message.trim() : "";
  return {
    month,
    teacherId,
    teacherName: typeof detail.teacherName === "string" && detail.teacherName.trim() ? detail.teacherName.trim() : null,
    closedOn: typeof detail.closedOn === "string" ? detail.closedOn : null,
    message,
  };
}

/** Can the closed month be reopened from here: the person has the right AND the refusal named the teacher and the month. */
export function canReopenFrom(info: PeriodClosedInfo | null, hasMoneyRight: boolean): info is PeriodClosedInfo & { teacherId: string } {
  return Boolean(info && hasMoneyRight && info.teacherId && info.month);
}

/** After a reopening the person repeats the action: the line that says so. */
export const REOPENED_THEN_REPEAT = "Месяц открыт. Повторите действие.";

// ── the block «Месяц закрыт» of a window (UX pack, rule 2) ───────────────────────────────────────────

/** What the person wanted to do when the closed month refused it: the second sentence of the block («Чтобы изменить урок, переоткройте месяц»). */
export type ClosedPurpose = "lesson" | "pause" | "decision";
const CLOSED_TO: Record<ClosedPurpose, string> = { lesson: "изменить урок", pause: "изменить паузу", decision: "изменить решение" };

/**
 * The amber block of a closed month in a window, from the FACTS the refusal carries (month, teacher, the day the sheet was saved), not from the sentence of the server (it speaks in other words):
 *   «Октябрь у Эргашева К. закрыт (зарплата сохранена 03.10.2026).» - the surname is declined only when it is reliable (`genitiveShortName`); otherwise
 *   «Преподаватель: Эргашев К. · октябрь закрыт (…)».  The second sentence says what to do - or who can: a person without the money access is sent to the owner.
 * Without a month in the refusal (an older server) the sentence of the server is shown as it came.
 */
export function periodClosedText(info: PeriodClosedInfo, options: { canReopen: boolean; purpose?: ClosedPurpose; today?: string }): { head: string; advice: string } {
  const today = options.today ?? formatBusinessDate();
  const saved = info.closedOn ? ` (зарплата сохранена ${formatDateRu(info.closedOn)})` : "";
  const advice = options.canReopen
    ? `Чтобы ${CLOSED_TO[options.purpose ?? "lesson"]}, переоткройте месяц.`
    : "Месяц переоткрывает владелец или администратор с доступом к деньгам.";
  if (!info.month) return { head: info.message || "Месяц закрыт", advice: "" };
  const genitive = genitiveShortName(info.teacherName);
  const month = monthLabel(info.month, today, true);
  const head = !info.teacherName
    ? `${month} закрыт${saved}.`
    : genitive
      ? `${month} у ${genitive} закрыт${saved}.`
      : `Преподаватель: ${info.teacherName} · ${monthLabel(info.month, today)} закрыт${saved}.`;
  return { head, advice };
}
