/**
 * LESSON-RULES (26.11): the words and the small decisions of the cancellations that WAIT for the owner (`unconfirmed`), of the entries of the history and of the rules of the lessons of a centre.
 * The money and the numbers are the server's (LESSONS 143): the screen shows the words and the numbers of its answers; the number of days of the window is NEVER a copy here - it is `windowDays` /
 * `window_days` of the answer.  Pure functions: no React, no network.
 */
import { formatMoney } from "./money-format";
import { pluralRu } from "./plural";
import { monthLabel } from "./ru-calendar";
import { formatDayMonthRu } from "./business-time";
import { dayAndDateLabel } from "./ops-errors";
import { lessonLine, shortWhen } from "./substitutions";
import type { AuditEntryItem, PersonRef, SubstitutionItem, SubstitutionListRow, WaitingCancellationItem } from "./substitution-types";
import { isAuditRow, isRequestRow, isWaitingRow } from "./list-rows";

// ── the row of «Ждут решения» ─────────────────────────────────────────────────────────────

/** «ждёт 2 дня»: the days the cancellation has waited since the teacher wrote it (0 = written today). */
export function waitingChipText(days: number): string {
  const n = Math.max(0, Math.trunc(Number(days) || 0));
  return n === 0 ? "сообщено сегодня" : `ждёт ${n} ${pluralRu(n, "день", "дня", "дней")}`;
}

export const WAITING_REASON_PREFIX = "Урока не было";

/** The words of the cancelling person in a row: «Урока не было: отключили свет» (an empty reason or the bare «Урока не было» is said once). */
export function waitingReasonText(item: Pick<WaitingCancellationItem, "reason">): string {
  const reason = (item.reason ?? "").trim();
  if (!reason || reason.toLowerCase() === WAITING_REASON_PREFIX.toLowerCase()) return WAITING_REASON_PREFIX;
  return `${WAITING_REASON_PREFIX}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}

/** «Решить» of a waiting cancellation: named by the lesson (fifty rows must not read alike, LESSONS 142). */
export function waitingDecideLabel(item: Pick<WaitingCancellationItem, "group" | "lesson" | "teacher">): string {
  return `Решить отмену: ${item.group.name}, ${item.teacher.name}, ${formatDayMonthRu(item.lesson.date)}`;
}

// ── the window of the decision ────────────────────────────────────────────────────────

/**
 * What the window of the decision needs of a cancellation that waits: the row of «Замены» gives all of it, the journal and the lesson sheet know the lesson and the group only (who wrote it, when and what is
 * then not said - the window never invents it).
 */
export interface WaitingTarget {
  group: { id: string; name: string };
  lesson: { lessonId: string; date: string; startTime?: string | null; endTime?: string | null };
  cancelledBy?: PersonRef | null;
  cancelledAt?: string | null;
  reason?: string | null;
  waitingDays?: number | null;
}

/** Who wrote the cancellation, in the title of the window: «Преподаватель сообщил: урока не было» (the lesson sheet does not know who: «Отмена урока ждёт подтверждения»). */
export function waitingDialogTitle(item: Pick<WaitingTarget, "cancelledBy">): string {
  const role = item.cancelledBy?.role;
  if (!item.cancelledBy) return "Отмена урока ждёт подтверждения";
  const who = role === "admin" ? "Администратор" : role === "owner" ? "Владелец" : "Преподаватель";
  return `${who} сообщил: урока не было`;
}

/** «Математика 7 · пн, 23.11 · 17:00–18:00» under the title. */
export function waitingDialogSubtitle(item: Pick<WaitingTarget, "group" | "lesson">): string {
  const { date, startTime, endTime } = item.lesson;
  if (startTime && endTime) return lessonLine(item.group.name, date, startTime, endTime);
  return `${item.group.name} · ${formatDayMonthRu(date)}`;
}

/** «Эргашев К., 24.11 в 12:50: «Отключили свет»»: who, when and what he wrote - ONE sentence of the head of the window. */
export function waitingDialogHead(item: Pick<WaitingTarget, "cancelledBy" | "cancelledAt" | "reason">): string {
  const when = item.cancelledAt ? shortWhen(item.cancelledAt).replace(" ", " в ") : "";
  const reason = (item.reason ?? "").trim();
  const said = reason && reason.toLowerCase() !== WAITING_REASON_PREFIX.toLowerCase() ? `: «${reason}»` : "";
  return [item.cancelledBy?.name ?? "", when].filter(Boolean).join(", ") + said;
}

export type WaitingOutcome = "centre" | "holiday" | "held";

export const WAITING_QUESTION = "Что произошло на самом деле?";
export const WAITING_OUTCOMES: ReadonlyArray<{ key: WaitingOutcome; label: string; button: string }> = [
  { key: "centre", label: "По вине центра", button: "Подтвердить: по вине центра" },
  { key: "holiday", label: "Праздник, выходной", button: "Подтвердить: праздник, выходной" },
  { key: "held", label: "Урок был", button: "Вернуть урок на отметку" },
];
export const WAITING_PICK_WHY = "Выберите, что произошло";
const TEACHER_NOT_PAID = "Преподавателю урок не оплачивается.";

/** What the dry run of the confirmation says (`PUT …/cancellation-kind?dry_run=true`): the numbers of the server, nothing is added. */
export interface WaitingPreview {
  students: number;
  per_student: number | null;
  total: number;
  recalc_off: boolean;
  /** Why the recalculation is zero (`packages` / `nobody_charged` / `one_off`; null when it is not) and the server's own sentence for it. */
  zero_reason?: "packages" | "nobody_charged" | "one_off" | null;
  zero_text?: string | null;
  restore_allowed: boolean;
  window_days: number;
  teacher_can_mark: boolean;
  age_days: number;
}

/** The outcomes the window offers: the lesson of an archived group cannot be given back (`restore_allowed: false`) - two outcomes. */
export function offeredOutcomes(preview: Pick<WaitingPreview, "restore_allowed"> | null): ReadonlyArray<(typeof WAITING_OUTCOMES)[number]> {
  return WAITING_OUTCOMES.filter((outcome) => outcome.key !== "held" || preview === null || preview.restore_allowed !== false);
}

/** «9 ученикам по 50 000 сум, всего 450 000 сум» - the recalculation as the server counted it (no guess for another amount per student: only the total). */
function recalcSentence(preview: WaitingPreview): string {
  const n = preview.students;
  const students = `${n} ${pluralRu(n, "ученику", "ученикам", "ученикам")}`;
  return preview.per_student !== null
    ? `Перерасчёт ${students} по ${formatMoney(preview.per_student)}, всего ${formatMoney(preview.total)}.`
    : `Перерасчёт ${students}, всего ${formatMoney(preview.total)}.`;
}

/** The line under the cards for the chosen outcome: its OWN consequence for the students and for the pay of the teacher. */
export function outcomeCaption(outcome: WaitingOutcome, preview: WaitingPreview | null): string | null {
  if (outcome === "holiday") return `Ученикам: без перерасчёта. ${TEACHER_NOT_PAID}`;
  if (outcome === "held") {
    if (preview === null) return null;
    return preview.teacher_can_mark === false
      ? `Отмена снимается. Урок старше ${preview.window_days} дн.: отметит администратор или владелец.`
      : "Отмена снимается, преподаватель отметит посещаемость. Деньги считаются как за обычный урок.";
  }
  if (preview === null) return null;
  if (preview.recalc_off) return `Перерасчёт за отмены в центре выключен — ученикам ничего не изменится. ${TEACHER_NOT_PAID}`;
  if (preview.students <= 0 || preview.total <= 0) return `${preview.zero_text || "Ученикам: без перерасчёта."} ${TEACHER_NOT_PAID}`;   // the sentence of the server says WHY it is zero; never «Перерасчёт 0 ученикам»
  return `${recalcSentence(preview)} ${TEACHER_NOT_PAID}`;
}

/** The words of the toast after the decision. */
export function waitingDecidedToast(outcome: WaitingOutcome): string {
  return outcome === "centre" ? "Отмена подтверждена: по вине центра" : outcome === "holiday" ? "Отмена подтверждена: праздник, выходной" : "Урок возвращён на отметку";
}

/** The reason that «Урок был» writes into the journal of the lesson (the restore needs one; the window does not ask the owner for it). */
export const WAITING_HELD_REASON = "Урок был: отмена не подтверждена";

// ── «Решает владелец» (a role without the money right) ───────────────────────────────────────

export const OWNER_DECIDES_NOTE = "Отмену урока и оплату дополнительного урока решает владелец или администратор с доступом к деньгам.";

/** «Решает владелец: 1 дополнительный урок, 1 отмена урока» (a part with the number 0 is not said). */
export function ownerDecidesLine(counts: { oneOffs: number; cancellations: number }): string {
  const parts: string[] = [];
  const one = Math.max(0, Math.trunc(counts.oneOffs || 0));
  const cancel = Math.max(0, Math.trunc(counts.cancellations || 0));
  if (one > 0) parts.push(`${one} ${pluralRu(one, "дополнительный урок", "дополнительных урока", "дополнительных уроков")}`);
  if (cancel > 0) parts.push(`${cancel} ${pluralRu(cancel, "отмена урока", "отмены урока", "отмен урока")}`);
  return `Решает владелец: ${parts.join(", ")}`;
}

/** «Эргашев К. сообщил 24.11, что урока не было · пн, 23.11, Математика 7» - the quiet line of a waiting cancellation for who cannot decide it. */
export function reportedLine(item: Pick<WaitingCancellationItem, "cancelledBy" | "cancelledAt" | "lesson" | "group">): string {
  const day = shortWhen(item.cancelledAt).split(" ")[0] ?? "";
  const who = item.cancelledBy?.name || "Преподаватель";
  return `${who} сообщил ${day}, что урока не было · ${dayAndDateLabel(item.lesson.date)}, ${item.group.name}`;
}

// ── the list ──────────────────────────────────────────────────────────────────────────────────

/** The rows of one page split by what they are: the requests keep their table, the waiting cancellations go to the table (money right) or to the block «Решает владелец» (no right). */
export function splitRows(rows: ReadonlyArray<SubstitutionListRow>): {
  requests: SubstitutionItem[]; waiting: WaitingCancellationItem[]; audit: AuditEntryItem[];
} {
  return {
    requests: rows.filter(isRequestRow),
    waiting: rows.filter(isWaitingRow),
    audit: rows.filter(isAuditRow),
  };
}

// ── the history ───────────────────────────────────────────────────────────────────────────────

export const BACKDATED_FILTER_LABEL = "Только задним числом";
export const HISTORY_TAB_LABEL = "История";
export const BACKDATED_EMPTY_TEXT = "За 30 дней уроки задним числом не оформлялись";
export const HISTORY_LOAD_ERROR_TEXT = "Не удалось загрузить историю";

/** The chip of an entry of the journal: «Задним числом · 2 дн.», «Отметки исправлены», «Добавил урок в расписание». */
export function auditChipText(entry: Pick<AuditEntryItem, "kind" | "lateDays">): string {
  if (entry.kind === "backdated") return entry.lateDays && entry.lateDays > 0 ? `Задним числом · ${entry.lateDays} дн.` : "Задним числом";
  if (entry.kind === "corrected") return "Отметки исправлены";
  return "Добавил урок в расписание";
}

/** «оформил Каримова Д.» under the teacher when the line was written by another person (the neutral verb: the server does not know the gender, LESSONS 17). */
export function auditByLine(entry: Pick<AuditEntryItem, "by" | "teacher">): string | null {
  const by: PersonRef | null | undefined = entry.by;
  if (!by || !by.name || by.id === entry.teacher?.id) return null;
  return `оформление: ${by.name}`;
}

/** The title line of the panel of an entry (the first row of its history). */
export function auditPanelTitle(entry: Pick<AuditEntryItem, "kind">): string {
  if (entry.kind === "backdated") return "Урок оформлен задним числом";
  if (entry.kind === "corrected") return "Отметки исправлены";
  return "Добавил урок в расписание";
}

// ── the rules of the lessons of a centre (Настройки → Уроки) ──────────────────────────────

export interface LessonRuleItem {
  key: "teacher_lesson_window_days" | "past_cancel_needs_confirmation";
  value: number | boolean | null;
  default: number | boolean | null;
  allowed: Array<number | boolean>;
  title: string;
  hint: string;
  words: string;
}

export interface LessonRulesOut {
  items: LessonRuleItem[];
  teacher_lesson_window_days: number;
  past_cancel_needs_confirmation: boolean;
}

export const LESSON_RULES_TITLE = "Уроки";
export const LESSON_RULES_LEDE = "Кто и до какого срока оформляет прошедшие уроки и как подтверждается отмена.";

/** «7 дней» / «1 день» / «3 дня» - the option of the window. */
export function windowOptionLabel(days: number): string {
  return `${days} ${pluralRu(days, "день", "дня", "дней")}`;
}

// ── the history: the words of the teacher and the salary line of the panel ──────────────────────

/** The words the teacher wrote when he cancelled (`trigger: teacher_cancel`): a row of the history shows them as the reason - not a chip (the chips are for the reasons of requests). */
export function teacherWordsOf(item: Pick<SubstitutionItem, "trigger" | "decision">): string | null {
  if (item.trigger !== "teacher_cancel") return null;
  const note = (item.decision?.note ?? "").trim();
  return note || null;
}

/**
 * «В зарплате за ноябрь: +25 000 сум» - what the HELD lesson gave to the salary of its teacher, from the dry run of «Вернуть урок» (`moneyEffects.payroll[].changedBy`: the return takes it away - the line
 * says the sum the lesson gave).  Only the money right sees it (the server sends the sums to nobody else); null when the dry run moves no sheet.
 */
export function salaryLineOf(effects: { payroll: ReadonlyArray<{ month: string; changedBy: number | null }> } | null, today: string): string | null {
  const line = effects?.payroll.find((entry) => entry.changedBy !== null && entry.changedBy < 0);
  if (!line || line.changedBy === null) return null;
  return `В зарплате за ${monthLabel(line.month, today)}: +${formatMoney(-line.changedBy)}`;
}

// ── the teacher's own lessons ─────────────────────────────────────────────────────────────────

/** «Не закрыт 2 дня» over the date of the card «Ближайшее действие»: a lesson that waits for its close for a day or more (`ageDays` of the server); nothing for today. */
export function notClosedText(ageDays: number | null | undefined): string | null {
  const n = Math.trunc(Number(ageDays) || 0);
  return n >= 1 ? `Не закрыт ${n} ${pluralRu(n, "день", "дня", "дней")}` : null;
}

/** «Урок 23 ноября не отмечен. Что произошло?» - the question of the panel «Урока не было» of a lesson that has started: the teacher says what happened, the owner confirms it. */
export function pastCancelQuestion(dateLabel: string): string {
  return `Урок ${dateLabel} не отмечен. Что произошло?`;
}
export const PAST_CANCEL_BUTTON = "Сообщить, что урока не было";
export const PAST_CANCEL_BUSY = "Сообщаем…";
