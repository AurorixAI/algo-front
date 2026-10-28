/**
 * #154 «Разовые уроки: отработка / дополнительный» - the pure part of the front: the shapes of the server (artifacts/analysis/P154_API.md v2),
 * the words of every refusal, the rights of each role, the lines of a lesson and of a row «Ждут решения».
 *
 * The rule (SPEC §0): a one-off lesson has a PURPOSE.  «Отработка» (`makeup`) is a lesson made up for one cancelled lesson of the group; its
 * money is that of an ordinary lesson.  «Дополнительный» (`extra`) is free for the students whatever the way of payment; the teacher gets
 * nothing (`none`), asks to be paid (`wait`: the owner / administrator decides after the lesson) or is paid (`paid`).  A copy made by a move
 * is `moved`: nothing is said about it.
 *
 * LESSONS 16 / 17 (no role by default), 45 (a teacher sees neither amounts nor decisions), 46 (every code of the server has words here, a test
 * for each), 48 (one line of a lesson for every list).
 */
import { formatIsoDateLabel, monthYearLabelRu } from "./business-time";
import { dayAndDateLabel, errorMessageOf, opsErrorCode, opsErrorDetail, teacherConflictLine } from "./ops-errors";
import type { TeacherConflict } from "./ops-b-types";

// ── shapes of the server ────────────────────────────────────────────────────────────────────────────────

export type OneOffPurpose = "makeup" | "extra" | "moved";
export type OneOffMoney = "none" | "wait" | "paid";

/** The lesson a make-up is for (`madeUpFor`), or the make-up of a cancelled lesson (`madeUpBy`, with its `label`). */
export interface MadeUpRef {
  lessonId: string;
  date: string;
  startTime: string;
  endTime: string;
  label?: string | null;
}

/** The fields of a lesson that say what it is for: in the schedule, the journal of a group and the card of a student. */
export interface LessonPurposeFields {
  purpose?: OneOffPurpose | null;
  purposeLabel?: string | null;
  madeUpFor?: MadeUpRef | null;
  madeUpBy?: MadeUpRef | null;
  /** Owner / administrator, and a teacher for the lesson of his group or one he created; never a student or a parent. */
  money?: OneOffMoney | null;
  moneyLabel?: string | null;
}

/** `GET /org/groups/{id}/makeup-candidates`: `reason` only for an owner / administrator (and, from the round of fixes, a teacher of his group), `null` otherwise. */
export interface MakeupCandidate {
  lessonId: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  label: string;
  reason: string | null;
}
export interface MakeupCandidates {
  items: MakeupCandidate[];
  emptyReason: string | null;
}

/** The sheet of a teacher for the month of a lesson; `status` is the owner's only (an administrator gets `null`: the amounts are the owner's). */
export interface DecisionPayrollSheet {
  month: string;
  status: "unpaid" | "due" | "settled" | "overpaid" | null;
}

export interface OneOffDecisionItem {
  lessonId: string;
  groupId: string;
  groupName: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  purpose: "extra" | "makeup";
  /** «Дополнительный урок — оплатить преподавателю?» / «Отработка без учеников — оплатить преподавателю?» */
  title: string;
  teacher: { id: string; name: string } | null;
  createdBy: { id: string; name: string; role: string } | null;
  studentsPresent: number;
  studentsTotal: number;
  payrollSheet: DecisionPayrollSheet | null;
}
export interface OneOffDecisionsOut {
  total: number;
  items: OneOffDecisionItem[];
}
export type OneOffDecision = "pay" | "skip";
export interface MoneyDecisionOut {
  lessonId: string;
  money: "paid" | "none";
  payrollSheet: DecisionPayrollSheet | null;
}

// ── roles ───────────────────────────────────────────────────────────────────────────────────────────────

/** Who adds the lesson: the owner / administrator (`manager`) or the teacher.  Anyone else (or nobody) gets `null`: the form is not offered. */
export type OneOffRole = "manager" | "teacher";

export function oneOffRoleOf(user: { org_role?: string | null; role?: string | null } | null | undefined): OneOffRole | null {
  const role = user?.org_role ?? user?.role ?? null;
  if (role === "owner" || role === "admin") return "manager";
  if (role === "teacher") return "teacher";
  return null;
}

// ── the choice in the form «Добавить занятие» ────────────────────────────────────────────────────────────

export interface OneOffChoice {
  purpose: "makeup" | "extra" | null;
  money: "none" | "wait" | "paid" | null;
  /** The cancelled lesson of a make-up: `<lessonId>|<date>` (see {@link candidateKey}); "" = not chosen. */
  target: string;
}

export function emptyChoice(role: OneOffRole | null): OneOffChoice {
  // a teacher's money is «Прошу оплатить» until he says otherwise; an owner / administrator chooses, nothing is chosen for him (his choice is money)
  return { purpose: null, money: role === "teacher" ? "wait" : null, target: "" };
}

export interface MoneyChoice {
  value: "none" | "wait" | "paid";
  label: string;
  hint: string;
}

/** The money of an additional lesson by the role (SPEC §2): a teacher asks (`wait`) or says nothing is due (`none`); an owner / administrator sets `none` or `paid`. */
export function moneyChoicesFor(role: OneOffRole | null): MoneyChoice[] {
  if (role === "teacher") {
    return [
      { value: "wait", label: "Прошу оплатить", hint: "Владелец или администратор решит после урока" },
      { value: "none", label: "Без оплаты", hint: "За этот урок вы ничего не получите" },
    ];
  }
  if (role === "manager") {
    return [
      { value: "none", label: "Без оплаты", hint: "Преподавателю за этот урок не платят" },
      { value: "paid", label: "Оплачивается", hint: "Преподавателю платят, как за обычный урок" },
    ];
  }
  return [];
}

export const PURPOSE_QUESTION = "Что это за урок?";
export const PURPOSE_CHOICES: ReadonlyArray<{ value: "makeup" | "extra"; title: string; hint: string }> = [
  { value: "makeup", title: "Отработка отменённого урока", hint: "Взамен урока, который отменил центр" },
  { value: "extra", title: "Дополнительный урок", hint: "Сверх расписания" },
];
export const EXTRA_FREE_FOR_STUDENTS = "Ученикам дополнительный урок бесплатен: с них за него ничего не списывается.";
export const MONEY_QUESTION = "Оплата преподавателю";
export const MAKEUP_TARGET_LABEL = "Какой урок отрабатываем";
export const MAKEUP_TARGET_PLACEHOLDER = "Выберите отменённый урок";
export const MAKEUP_MONEY_NOTE = "Отработка оплачивается, как обычный урок. Вычет за отменённый урок снимется с тех, кто придёт на отработку.";
export const MAKEUP_LOADING_TEXT = "Ищем отменённые уроки…";
export const MAKEUP_LOAD_ERROR_TEXT = "Не удалось загрузить отменённые уроки. Повторите попытку.";
export const MAKEUP_EMPTY_FALLBACK = "Нет отменённых уроков, которые можно отработать";
export const PURPOSE_REQUIRED_TEXT = "Выберите, что это за урок: отработка или дополнительный";
export const MONEY_REQUIRED_TEXT = "Выберите оплату преподавателю: без оплаты или оплачивается";
export const MAKEUP_TARGET_REQUIRED_TEXT = "Выберите отменённый урок, который отрабатывается";
export const NO_ONE_OFF_RIGHT_TEXT = "Добавить разовое занятие может преподаватель группы, администратор или владелец";

export const candidateKey = (candidate: Pick<MakeupCandidate, "lessonId" | "lessonDate">): string => `${candidate.lessonId}|${candidate.lessonDate}`;

/** «пн 02.11, 10:00–11:30 · Преподаватель заболел» - the cancelled lesson as the list of the form shows it (the reason only when the server sent one). */
export function candidateOptionLabel(candidate: MakeupCandidate): string {
  const reason = (candidate.reason ?? "").trim();
  return reason ? `${candidate.label} · ${reason}` : candidate.label;
}

/** Why the make-up cannot be chosen: the server's own sentence, else the short one. */
export function makeupUnavailableText(candidates: Pick<MakeupCandidates, "emptyReason"> | null | undefined): string {
  return (candidates?.emptyReason ?? "").trim() || MAKEUP_EMPTY_FALLBACK;
}

/** What is wrong with the choice (the text under the form), or null.  The server checks all of it again. */
export function choiceProblem(choice: OneOffChoice, role: OneOffRole | null, candidates: MakeupCandidates | null): string | null {
  if (role === null) return NO_ONE_OFF_RIGHT_TEXT;
  if (choice.purpose === null) return PURPOSE_REQUIRED_TEXT;
  if (choice.purpose === "makeup") {
    if (!choice.target) return MAKEUP_TARGET_REQUIRED_TEXT;
    if (candidates && !candidates.items.some((item) => candidateKey(item) === choice.target)) return MAKEUP_TARGET_REQUIRED_TEXT;
    return null;
  }
  if (!choice.money || !moneyChoicesFor(role).some((item) => item.value === choice.money)) return MONEY_REQUIRED_TEXT;
  return null;
}

/** The fields of `POST /org/schedule/occurrences` that the choice adds; the front always sends the purpose (SPEC §2). */
export function choicePayload(choice: OneOffChoice): { purpose: "makeup" | "extra"; money?: OneOffMoney; madeUpLessonId?: string; madeUpDate?: string } {
  if (choice.purpose === "makeup") {
    const [madeUpLessonId, madeUpDate] = choice.target.split("|");
    return { purpose: "makeup", madeUpLessonId, madeUpDate };
  }
  if (choice.purpose === "extra" && choice.money) return { purpose: "extra", money: choice.money };
  throw new Error(PURPOSE_REQUIRED_TEXT);
}

/** The text after a save: what was added. */
export function oneOffAddedText(choice: Pick<OneOffChoice, "purpose">): string {
  return choice.purpose === "makeup" ? "Отработка добавлена в расписание группы" : "Дополнительный урок добавлен в расписание группы";
}

// ── the words of every refusal ──────────────────────────────────────────────────────────────────────────

export const MAKEUP_DAYS = 60;

const MAKEUP_NOT_ALLOWED_TEXT: Readonly<Record<string, string>> = {
  NOT_FOUND: "Этого урока уже нет в расписании группы: отработать его нельзя",
  NOT_CANCELLED: "Урок не отменён — отрабатывать нечего",
  ONE_OFF: "Разовый урок отработать нельзя. Добавьте новый урок",
  HOLIDAY: "Урок отменён как праздник или выходной: вычета нет, отрабатывать нечего. Добавьте дополнительный урок",
  NO_KIND: "Это отмена до обновления: отработать её нельзя. Добавьте дополнительный урок",
  MOVED: "Урок перенесён — отрабатывать нечего",
  TOO_OLD: `Отработать можно урок, отменённый не позже ${MAKEUP_DAYS} дней назад`,
};
const MAKEUP_NOT_ALLOWED_FALLBACK = "Этот урок отработать нельзя";

export const MAKEUP_EXISTS_TEXT = "По уроку уже назначена отработка: сначала отмените её";
export const RESTORE_MAKEUP_TARGET_TEXT = "Отменённый урок, который отрабатывался, уже изменён или у него другая отработка: вернуть отработку нельзя";

/** «У группы уже есть урок в это время: пн, 05.11 16:00–17:00» - the first clash named; the server lists up to 20 and a `total`. */
function groupBusyText(error: unknown): string {
  const detail = opsErrorDetail<{ code: string; message: string; conflicts?: Array<{ date?: string; startTime?: string; endTime?: string }>; total?: number }>(error);
  const first = detail?.conflicts?.[0];
  const head = "У группы уже есть урок в это время";
  if (!first?.date || !first.startTime || !first.endTime) return head;
  const more = Math.max(detail?.total ?? 0, detail?.conflicts?.length ?? 0) - 1;
  return `${head}: ${dayAndDateLabel(first.date)} ${first.startTime}–${first.endTime}${more > 0 ? ` и ещё ${more}` : ""}`;
}

function teacherBusyText(error: unknown): string {
  const detail = opsErrorDetail<{ code: string; message: string; conflicts?: TeacherConflict[]; total?: number }>(error);
  const first = detail?.conflicts?.[0];
  const head = "У преподавателя в это время уже есть урок";
  if (!first) return head;
  const more = Math.max(detail?.total ?? 0, detail?.conflicts?.length ?? 0) - 1;
  return `${head}. ${teacherConflictLine(first)}${more > 0 ? ` и ещё ${more}` : ""}`;
}

/** Codes whose words are written here; every other code is left to the caller. */
export const ONE_OFF_CODES: readonly string[] = [
  "MAKEUP_NOT_ALLOWED", "MAKEUP_EXISTS", "MOVE_IN_PAST", "MOVE_TOO_FAR", "MOVE_SAME_SLOT", "SERIES_ENDED", "GROUP_BUSY", "TEACHER_BUSY", "STUDENT_BUSY",
  "TEACHER_REQUIRED", "LESSON_ALREADY_STARTED", "PURPOSE_REQUIRED", "PURPOSE_INVALID", "MONEY_REQUIRED", "MONEY_INVALID", "MAKEUP_TARGET_REQUIRED",
  "MAKEUP_TARGET_NOT_ALLOWED", "RESTORE_MAKEUP_TARGET", "ONE_OFF_NOT_FOUND", "DECISION_NOT_ALLOWED", "LESSON_NOT_COMPLETED", "ALREADY_DECIDED",
];

/**
 * The refusals of the new lesson and of the decision in plain words (never the code).  Null when the code is not one of #154: the caller
 * words it as it did before.  A make-up and a move share the codes of the slot, so those sentences speak of «урок», not of «перенос».
 */
export function oneOffErrorText(error: unknown): string | null {
  const code = opsErrorCode(error);
  if (!code) return null;
  switch (code) {
    case "MAKEUP_NOT_ALLOWED": {
      const reason = (opsErrorDetail<{ code: string; message: string; reasonCode?: string }>(error)?.reasonCode ?? "").trim();
      return MAKEUP_NOT_ALLOWED_TEXT[reason] ?? MAKEUP_NOT_ALLOWED_FALLBACK;
    }
    case "MAKEUP_EXISTS": return MAKEUP_EXISTS_TEXT;
    case "MOVE_IN_PAST": return "Это время уже прошло. Выберите дату и время впереди";
    case "MOVE_TOO_FAR": return `Назначить можно не дальше чем на ${MAKEUP_DAYS} дней вперёд`;
    case "MOVE_SAME_SLOT": return "Это дата и время отменённого урока. Выберите другую дату или время";
    case "SERIES_ENDED": return "Постоянный урок прекращается раньше этой даты. Выберите более раннюю дату";
    case "GROUP_BUSY": return groupBusyText(error);
    case "TEACHER_BUSY": return teacherBusyText(error);
    case "STUDENT_BUSY": return "В это время у учеников группы есть другой урок";
    case "TEACHER_REQUIRED": return "У группы нет преподавателя. Выберите преподавателя в карточке группы";
    case "LESSON_ALREADY_STARTED": return "Урок уже начался: удалить его нельзя";
    case "PURPOSE_REQUIRED": return PURPOSE_REQUIRED_TEXT;
    case "PURPOSE_INVALID": return PURPOSE_REQUIRED_TEXT;
    case "MONEY_REQUIRED": return MONEY_REQUIRED_TEXT;
    case "MONEY_INVALID": return "Такой вариант оплаты вам недоступен. Выберите другой";
    case "MAKEUP_TARGET_REQUIRED": return MAKEUP_TARGET_REQUIRED_TEXT;
    case "MAKEUP_TARGET_NOT_ALLOWED": return "Отменённый урок указывается только у отработки";
    case "RESTORE_MAKEUP_TARGET": return RESTORE_MAKEUP_TARGET_TEXT;
    case "ONE_OFF_NOT_FOUND": return "Урок не найден: возможно, его уже удалили. Обновите страницу";
    case "DECISION_NOT_ALLOWED": return "По этому уроку решение не нужно";
    case "LESSON_NOT_COMPLETED": return "Урок ещё не проведён: решить можно после урока";
    case "ALREADY_DECIDED": return "Решение по этому уроку уже принято. Обновите страницу";
    default: return null;
  }
}

/** The words of any refusal on these screens: one of ours, else the server's own text, else `fallback`. */
export function oneOffRefusalText(error: unknown, fallback: string): string {
  return oneOffErrorText(error) ?? errorMessageOf(error, fallback);
}

/** The decision was already taken (by the other administrator, or twice): the row is gone, the list is read again. */
export function isAlreadyDecided(error: unknown): boolean {
  const code = opsErrorCode(error);
  return code === "ALREADY_DECIDED" || code === "DECISION_NOT_ALLOWED" || code === "ONE_OFF_NOT_FOUND";
}

// ── the lines of a lesson (one function for every list: LESSONS 48) ───────────────────────────────────────

/** «пн 05.11» - the weekday and the date. */
export function shortDay(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate ?? "")) return isoDate ?? "";
  return formatIsoDateLabel(isoDate, { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "");
}

/** «7-А · пн 05.11 · 16:00–17:00» - the lesson of a row «Ждут решения». */
export function decisionLessonLine(item: Pick<OneOffDecisionItem, "groupName" | "lessonDate" | "startTime" | "endTime">): string {
  return `${item.groupName} · ${shortDay(item.lessonDate)} · ${item.startTime}–${item.endTime}`;
}

/** «Провёл Рахимов Т. · были 3 из 10» - who held the lesson and how many students came. */
export function decisionWhoLine(item: Pick<OneOffDecisionItem, "teacher" | "studentsPresent" | "studentsTotal">): string {
  const who = item.teacher?.name ? `Провёл ${item.teacher.name}` : "Преподаватель не указан";
  return `${who} · были ${item.studentsPresent} из ${item.studentsTotal}`;
}

/** The filter of the page «Замены» (a group, a teacher) and its search (a group or a teacher) applied to a row of money. */
export function decisionMatches(item: Pick<OneOffDecisionItem, "groupId" | "groupName" | "teacher">, query: { groupId?: string; teacherId?: string; search?: string }): boolean {
  if (query.groupId && item.groupId !== query.groupId) return false;
  if (!query.groupId && query.teacherId && item.teacher?.id !== query.teacherId) return false;
  const text = (query.search ?? "").trim().toLowerCase();
  return !text || item.groupName.toLowerCase().includes(text) || (item.teacher?.name ?? "").toLowerCase().includes(text);
}

/** «Просил оплатить: Рахимов Т.» when a teacher asked; null for a make-up and for a lesson an owner / administrator added. */
export function decisionAskedLine(item: Pick<OneOffDecisionItem, "purpose" | "createdBy">): string | null {
  if (item.purpose !== "extra" || item.createdBy?.role !== "teacher" || !item.createdBy.name) return null;
  return `Просит оплатить: ${item.createdBy.name}`;
}

// ── the sheet that is already paid ───────────────────────────────────────────────────────────────────────

const SUM_CHANGES = "изменится сумма: доплатить или переплата";

/**
 * SPEC §4.5: a decision after the payment of the sheet is not blocked, but it is said.  The owner's `status` tells: anything but `unpaid` means the
 * sheet is (partly) paid.  An administrator gets `status: null` with the sheet's month (the amounts are the owner's): there is a saved sheet, so
 * the sum of the teacher will change, and the sentence does not claim «выплачена».  No saved sheet - nothing to say.
 */
export function payrollWarning(sheet: DecisionPayrollSheet | null | undefined): string | null {
  if (!sheet || !/^\d{4}-\d{2}$/.test(sheet.month ?? "")) return null;
  const month = monthYearLabelRu(sheet.month);
  if (sheet.status === "unpaid") return null;
  if (sheet.status === null) return `Ведомость за ${month} уже сохранена — ${SUM_CHANGES}`;
  return `Ведомость за ${month} выплачена — ${SUM_CHANGES}`;
}

export const DECISION_PAY_LABEL = "Оплатить";
export const DECISION_SKIP_LABEL = "Не оплачивать";
export const DECISIONS_GROUP_TITLE = "Дополнительные уроки и отработки без учеников";
export const DECISIONS_GROUP_HINT = "Оплатить преподавателю или нет — решаете вы. Решение принимается один раз.";
export const DECISION_PAY_TOAST = "Преподавателю будет оплачено";
export const DECISION_SKIP_TOAST = "Решено: без оплаты";
export function decisionToast(decision: OneOffDecision): string {
  return decision === "pay" ? DECISION_PAY_TOAST : DECISION_SKIP_TOAST;
}
export const DECISIONS_LOAD_ERROR_TEXT = "Не удалось загрузить уроки, которые ждут решения. Повторите попытку.";

/** The question of the window of a decision: the title the server sent, else by the purpose. */
export function decisionQuestion(item: Pick<OneOffDecisionItem, "title" | "purpose">): string {
  return (item.title ?? "").trim() || (item.purpose === "makeup" ? "Отработка без учеников — оплатить преподавателю?" : "Дополнительный урок — оплатить преподавателю?");
}

/** The counter of the tab and of the menu: the requests for a substitute plus the lessons that wait for a decision of money. */
export function waitingTotal(summary: { pendingTotal?: number; oneOffDecisionsTotal?: number; waitingTotal?: number } | null | undefined): number {
  const own = Number(summary?.waitingTotal);
  if (Number.isFinite(own) && own >= 0) return Math.floor(own);
  return Math.max(0, Math.floor(Number(summary?.pendingTotal) || 0)) + Math.max(0, Math.floor(Number(summary?.oneOffDecisionsTotal) || 0));
}

// ── the marks of a lesson: the schedule, the journal, the card of a student ───────────────────────────────

export interface PurposeMark {
  text: string;
  tone: "amber" | "blue" | "gray" | "violet" | "red";
}

/**
 * «Отработка за пн 03.11» / «Дополнительный» + «без оплаты» / «оплата: не решено» / «оплачивается»; on a cancelled original «Отработан → чт 06.11».
 * The words of the money come from the server (they differ by role: LESSONS 45); a student never gets `money`, so no money chip appears for him.
 */
export function purposeMarks(lesson: LessonPurposeFields | null | undefined): PurposeMark[] {
  if (!lesson) return [];
  const marks: PurposeMark[] = [];
  const label = (lesson.purposeLabel ?? "").trim();
  if (label && lesson.purpose !== "moved") marks.push({ text: label, tone: lesson.purpose === "makeup" ? "blue" : "violet" });
  const money = (lesson.moneyLabel ?? "").trim();
  if (money && lesson.money) marks.push({ text: money, tone: lesson.money === "wait" ? "amber" : "gray" });
  const by = (lesson.madeUpBy?.label ?? "").trim();
  if (by) marks.push({ text: by, tone: "blue" });
  return marks;
}

/** The two lines of the card of a student's lesson (no money): the purpose and where the cancelled lesson was made up. */
export function studentPurposeText(lesson: LessonPurposeFields | null | undefined): string | null {
  const texts = purposeMarks({ ...lesson, money: null, moneyLabel: null }).map((mark) => mark.text);
  return texts.length ? texts.join(" · ") : null;
}
