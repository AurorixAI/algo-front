/**
 * LOGIC-B2 («Замены»): pure helpers of the screens - the words of the spec (§5.2), the deadline, the status lines, the bodies of the
 * requests, the reading of a refusal, who may ask for a substitute, whose roster comes from where.  No React and no network,
 * so node:test loads this file directly.
 */
import type { GroupDetail, StudentInGroup } from "./api";
import { DEFAULT_CANCELLATION_KIND, type CancellationKind } from "./payf";
import { payrollSheetsNote } from "./lesson-teacher";
import { addIsoDays, formatUtcNaiveAsBusinessDateTime, parseUtcNaive } from "./business-time";
import { dayAndDateLabel, errorMessageOf, opsErrorCode, opsErrorDetail, teacherConflictLine } from "./ops-errors";
import type { OpsErrorDetail, TeacherBusyDetail, TeacherConflict } from "./ops-b-types";
import type {
  AlreadyDecidedDetail,
  BulkSkipped,
  CandidateBusy,
  ClosedReasonCode,
  CreateSubstitutionBody,
  CreateSubstitutionOut,
  DecideBody,
  DecideBulkBody,
  DecideBulkOut,
  DecideOut,
  LessonRosterStudent,
  MoveCheckOut,
  MoveCheckParams,
  MovedFrom,
  MyLesson,
  MyLessonBlockReason,
  StudentNotice,
  SubstitutionCandidate,
  SubstitutionItem,
  SubstitutionListParams,
  SubstitutionMovedTo,
  SubstitutionOutcome,
  SubstitutionReasonCode,
  SubstitutionRequestMark,
} from "./substitution-types";

// ── reasons ────────────────────────────────────────────────────────────────────────────────────

export const REASON_OPTIONS: ReadonlyArray<{ code: SubstitutionReasonCode; label: string }> = [
  { code: "sick", label: "Болезнь" },
  { code: "personal", label: "Личное" },
  { code: "other", label: "Другое" },
];

export function reasonLabelOf(code: SubstitutionReasonCode | string | null | undefined): string {
  return REASON_OPTIONS.find((option) => option.code === code)?.label ?? "";
}

export const COMMENT_MIN = 3;
export const COMMENT_MAX = 500;
export const MAX_RANGE_DAYS = 62;

/** The range of «Другие мои уроки»: both dates, in order, not longer than the server takes. */
export function rangeError(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Укажите даты «С» и «По»";
  if (from > to) return "Дата «С» не может быть позже даты «По»";
  return addIsoDays(from, MAX_RANGE_DAYS) < to ? "Период не может превышать 63 дня" : null;
}

export const COMMENT_REQUIRED_TEXT = "Опишите причину — не менее 3 символов";

/** The comment is optional except for «Другое»; a typed one is cut to the limit by the field. */
export function commentError(reasonCode: SubstitutionReasonCode, comment: string): string | null {
  const length = comment.trim().length;
  if (reasonCode === "other" && length < COMMENT_MIN) return COMMENT_REQUIRED_TEXT;
  if (length > COMMENT_MAX) return `Комментарий — не более ${COMMENT_MAX} символов`;
  return null;
}

// ── time and words of a lesson ───────────────────────────────────────────────────────────────────

/** «пн, 26.10» + «10:00–11:30»: the day and the time of a lesson. */
export function lessonWhen(date: string, startTime: string, endTime: string): string {
  return `${dayAndDateLabel(date)} · ${startTime}–${endTime}`;
}

/** «9-А · пн, 26.10 · 10:00–11:30». */
export function lessonLine(groupName: string, date: string, startTime: string, endTime: string): string {
  return `${groupName} · ${lessonWhen(date, startTime, endTime)}`;
}

export function itemLessonLine(item: Pick<SubstitutionItem, "group" | "lesson">): string {
  return lessonLine(item.group.name, item.lesson.date, item.lesson.startTime, item.lesson.endTime);
}

/** «чт, 29.10, 16:00» - where a lesson was moved to. */
export function movedToLabel(movedTo: Pick<SubstitutionMovedTo, "date" | "startTime">): string {
  return `${dayAndDateLabel(movedTo.date)}, ${movedTo.startTime}`;
}

export const movedText = (movedTo: Pick<SubstitutionMovedTo, "date" | "startTime">): string => `Урок перенесён на ${movedToLabel(movedTo)}`;
export const LESSON_CANCELLED_LABEL = "Урок отменён";
/** The lesson of a row is gone from the schedule: the row has no link to it (#157). */
export const LESSON_DELETED_TEXT = "урок удалён из расписания";

/** «Перенесён с 25.10, 10:00» on the new lesson of a move (#124); null on any other lesson. */
export function movedFromLabel(movedFrom: Pick<MovedFrom, "date" | "startTime"> | null | undefined): string | null {
  if (!movedFrom?.date || !/^\d{4}-\d{2}-\d{2}/.test(movedFrom.date)) return null;
  return `Перенесён с ${movedFrom.date.slice(8, 10)}.${movedFrom.date.slice(5, 7)}${movedFrom.startTime ? `, ${movedFrom.startTime}` : ""}`;
}
export const REQUESTED_LABEL = "Вы запросили замену";
export const WITHDRAW_ACTION = "Отозвать запрос";
export const REQUEST_ACTION = "Не смогу провести";
export const REQUEST_REJECTED_LABEL = "Запрос отклонён";

// ── deadline of a request ────────────────────────────────────────────────────────────────────────

export const URGENT_LABEL = "Срочно";

/**
 * «до начала 40 мин» / «до начала 5 ч» / «до начала 5 дн.»: under an hour in minutes, under 72 hours in hours (rounded),
 * further in days (rounded).  Null once the lesson has started: the row says so in words (`startedLabel`).
 */
export function deadlineText(minutesToStart: number): string | null {
  const minutes = Math.trunc(Number(minutesToStart));
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `до начала ${minutes} мин`;
  if (minutes < 72 * 60) return `до начала ${Math.round(minutes / 60)} ч`;
  return `до начала ${Math.round(minutes / 1440)} дн.`;
}

/** The length of a lesson in minutes (from its «HH:MM» ends); 0 when unreadable. */
export function lessonMinutes(startTime: string, endTime: string): number {
  const read = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  const length = read(endTime) - read(startTime);
  return Number.isFinite(length) && length > 0 ? length : 0;
}

/** «Урок уже начался» while it runs, «Урок прошёл» once its end has passed. */
export function startedLabel(item: Pick<SubstitutionItem, "minutesToStart" | "lesson">): string {
  const passedFor = -Math.trunc(Number(item.minutesToStart));
  const length = lessonMinutes(item.lesson.startTime, item.lesson.endTime);
  return length > 0 && passedFor >= length ? "Урок прошёл" : "Урок уже начался";
}

/** A request the lesson of which has started: the administrator can only name who taught, cancel or reject. */
export function isLateRequest(item: Pick<SubstitutionItem, "status" | "overdue">): boolean {
  return item.status === "pending" && Boolean(item.overdue);
}

export const LATE_BANNER_TEXT = "Урок уже начался или прошёл. Можно назначить того, кто его провёл, отменить урок или отклонить запрос. Перенести нельзя.";

export type DeadlineChip = { text: string; tone: "danger" | "dark" | "neutral" };

/** What the «Срок» cell shows: the dark-red «Урок уже начался» / «Урок прошёл», the red «Срочно» (< 24 h), else the quiet count. */
export function deadlineChips(item: SubstitutionItem): DeadlineChip[] {
  if (item.status !== "pending") return [];
  if (item.overdue) return [{ text: startedLabel(item), tone: "dark" }];
  const chips: DeadlineChip[] = [];
  if (item.urgent) chips.push({ text: URGENT_LABEL, tone: "danger" });
  const text = deadlineText(item.minutesToStart);
  if (text) chips.push({ text, tone: "neutral" });
  return chips;
}

/** «Предложил: Рахимов Т.»; an inactive colleague: the spec's sentence. */
export function suggestedLine(item: Pick<SubstitutionItem, "suggestedTeacher">): string | null {
  const suggested = item.suggestedTeacher;
  if (!suggested) return null;
  return suggested.active === false ? "Предложенный сотрудник больше не ведёт уроки" : `Предложил: ${suggested.name}`;
}

// ── status lines ───────────────────────────────────────────────────────────────────────────────

export const CLOSED_REASON_TEXT: Record<ClosedReasonCode, string> = {
  LESSON_STARTED: "Урок начат — запрос закрыт",
  LESSON_CANCELLED: "Урок отменён",
  LESSON_REMOVED: "Урока больше нет в расписании",
  GROUP_ARCHIVED: "Группа закрыта",
  GROUP_TEACHER_CHANGED: "Преподаватель группы изменён",
  TEACHER_REMOVED: "Преподаватель больше не работает в центре",
  LESSON_OUTSIDE_WINDOW: "Не решено вовремя",
  ASSIGNMENT_CLEARED: "Замена снята",
  LESSON_RESTORED: "Урок возвращён",
  KIND_CHANGED: "Вид отмены изменён",
  ONE_OFF_ADDED: "Разовый урок добавил преподаватель",
  ROLE_CHANGED: "Сотрудник стал администратором",
};

/** The words of a closing: the server's own text as it is (it is built for the viewer: `GROUP_TEACHER_CHANGED` names the new teacher to a manager only), else the table. */
export function closedReasonText(item: Pick<SubstitutionItem, "decision">): string {
  const decision = item.decision;
  const code = String(decision?.closedReason ?? "");
  const own = (decision?.closedReasonText ?? "").trim();
  if (own) return own;
  return CLOSED_REASON_TEXT[code as ClosedReasonCode] ?? "Запрос закрыт";
}

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────

/** The `item` a 409 SUBSTITUTION_ALREADY_DECIDED carries, with the sentence for the person; null for any other failure. */
export function alreadyDecided(error: unknown): { item: SubstitutionItem | null; message: string } | null {
  if (opsErrorCode(error) !== "SUBSTITUTION_ALREADY_DECIDED") return null;
  const detail = opsErrorDetail<AlreadyDecidedDetail>(error);
  const item = detail?.item && typeof detail.item === "object" && detail.item.id ? detail.item : null;
  return { item, message: alreadyDecidedText(item) };
}

/** «Запрос уже решён» (withdrawn: «Учитель отозвал запрос», closed: «Запрос закрыт: <причина>»). */
export function alreadyDecidedText(item: SubstitutionItem | null | undefined): string {
  if (item?.status === "withdrawn") return "Учитель отозвал запрос";
  if (item?.status === "closed") {
    // the text of the server already says «Запрос закрыт …» (or names a person: no lower case, no second prefix)
    const own = closedReasonText(item);
    return item.decision?.closedReason === "GROUP_TEACHER_CHANGED" || /^Запрос закрыт/.test(own) ? own : `Запрос закрыт: ${own.toLowerCase()}`;
  }
  return "Запрос уже решён";
}

export interface ErrorContext {
  /** The teacher the administrator picked: «У {имя} уже есть урок…». */
  teacherName?: string | null;
  /** The teacher who teaches the lesson: «Этот урок ведёт {имя}». */
  lessonTeacherName?: string | null;
  /** W1: the viewer's org role.  «Обратитесь к администратору» is for the teacher's cabinet alone: the owner / administrator get the neutral sentence. */
  role?: string | null;
}

/** «У Рахимов Т. уже есть урок «8-В» вт, 27.10 10:00–11:30. Выберите другого преподавателя.» */
export function teacherBusyText(detail: TeacherBusyDetail | null, teacherName: string | null | undefined, fallback: string): string {
  const first = detail?.conflicts?.[0];
  const name = (teacherName ?? "").trim();
  if (!first || !name) return fallback;
  return `У ${name} уже есть урок «${first.withGroupName}» ${dayAndDateLabel(first.date)} ${first.startTime}–${first.endTime}. Выберите другого преподавателя.`;
}

/** The refusals of the substitution endpoints in the words of the spec (T1, M3); the server's own text for the rest. */
export function substitutionErrorText(error: unknown, fallback = "Не удалось выполнить действие. Повторите попытку.", context: ErrorContext = {}): string {
  const detail = opsErrorDetail<OpsErrorDetail & { teacher_name?: string }>(error);
  const server = errorMessageOf(error, fallback);
  switch (opsErrorCode(error)) {
    case "SUBSTITUTION_ALREADY_DECIDED": return alreadyDecided(error)?.message ?? "Запрос уже решён";
    case "SUBSTITUTION_NOT_FOUND": return "Запрос на замену не найден";
    case "NOT_REQUEST_OWNER": return "Это запрос другого преподавателя";
    case "MANAGER_ASSIGNS_DIRECTLY": return "Вы можете назначить замену сами: меню урока «Заменить преподавателя»";
    case "LESSON_ALREADY_STARTED": {
      const own = detail?.message?.trim() || "Урок уже начался или прошёл";
      return context.role === "teacher" ? `${own.replace(/\.$/, "")}. Обратитесь к администратору` : own;
    }
    // W1 (S2-S7): one road of a cancellation, in the words of the screen (the server texts are the same; these stay if an older answer has none)
    case "TEACHER_CANNOT_CANCEL": return "Отменить урок может администратор. Нажмите «Не смогу провести»";
    case "ALREADY_CANCELLED": return "Урок уже отменён. Обновите страницу";
    case "ALREADY_MOVED": return detail?.message?.trim() || "Урок уже перенесён: отменить его нельзя. Отмените урок на новой дате";
    case "LESSON_HAS_MARKS": return "У урока есть отметки или справки. Сначала снимите отметки";
    case "LESSON_CHANGED": return "Урок уже изменили: обновите страницу и повторите";
    case "REQUEST_REJECTED": return MOVE_REJECTED_HINT;
    case "LESSON_IN_PROGRESS": return "Урок идёт: сначала завершите его, затем назначьте того, кто провёл";
    case "DAY_OFF_EXISTS": return detail?.message?.trim() || "На эти даты уже назначен выходной с другой причиной";
    case "NO_CHANGES": return "Укажите хотя бы одно изменение постоянного расписания";
    case "DECISION_FAILED": return "Не удалось выполнить это решение. Остальные не затронуты — повторите позже";
    case "GROUP_NOT_FOUND": return "Группа не найдена: возможно, она удалена или принадлежит другому центру";
    case "EXAMS_NEED_CONFIRMATION": return "К урокам, которые сдвинутся, привязаны экзамены: подтвердите, что они вернутся в черновики";
    case "LESSON_TOO_OLD": return "Урок старше 7 дней — его закрывает администратор или владелец.";
    case "SERIES_ENDED": return detail?.message?.trim() || "Постоянный урок прекращается раньше этой даты: перенесите на более раннюю дату";
    case "CANCELLED_BY_DAY_OFF": return "Урок отменён выходным днём: чтобы изменить причину, измените сам выходной";
    case "REASON_CHANGE_TOO_OLD": return "Причину можно изменить только у недавней отмены: урок вне окна «Незакрытых»";
    // «Вернуть урок» (S5)
    case "RESTORE_NOT_CANCELLED": return "Урок уже не отменён. Обновите страницу";
    case "RESTORE_MOVED": return detail?.message?.trim() || "Урок перенесён: чтобы вернуть его, отмените урок на новой дате и перенесите его обратно";
    case "RESTORE_PAST": return "Урок уже должен был начаться: вернуть его нельзя";
    case "RESTORE_DAY_OFF": return "Урок отменён выходным днём: чтобы вернуть его, отмените сам выходной";
    case "RESTORE_LESSON_GONE": return "Этого урока больше нет в расписании: серию изменили или прекратили";
    case "NO_LESSONS_REQUESTABLE": return "Ни один из выбранных уроков нельзя запросить";
    case "TOO_MANY_LESSONS": return "Не более 60 уроков в одном запросе";
    case "LESSON_TOO_FAR": return "Запрос можно подать не дальше чем на 90 дней вперёд";
    case "COMMENT_REQUIRED": return COMMENT_REQUIRED_TEXT;
    case "REASON_REQUIRED": return "Укажите причину (не менее 3 символов)";
    case "TEACHER_REQUIRED": return "Выберите преподавателя";
    case "TARGET_NOT_TEACHER": return "Выберите преподавателя центра";
    case "SUBSTITUTE_IS_REQUESTER": return "Нельзя назначить заменой того, кто запросил замену";
    case "MOVE_SAME_SLOT": return "Выберите другую дату или время";
    case "MOVE_IN_PAST": return "Новое время урока уже прошло";
    case "MOVE_TOO_FAR": return "Перенести можно не дальше чем на 60 дней";
    case "MOVE_FIELDS_REQUIRED": return "Укажите новую дату и время урока";
    case "PERIOD_TOO_LONG": return "Период не может превышать 63 дня";
    case "GROUP_BUSY": return "У группы уже есть урок в это время";
    case "TEACHER_BUSY": return teacherBusyText(opsErrorDetail<TeacherBusyDetail>(error), context.teacherName, server);
    case "NOT_LESSON_TEACHER": {
      const name = (context.lessonTeacherName ?? "").trim();
      return name ? `Этот урок ведёт ${name}${name.endsWith(".") ? "" : "."}` : server;
    }
    case "GROUP_ARCHIVED": return "Группа в архиве: действие недоступно";
    case "LESSON_CANCELLED": return "Урок уже отменён";
    case "LESSON_NOT_FOUND": return "Урока больше нет в расписании";
    case "LESSON_HAS_LIVE_EXAM": return detail?.message?.trim() || "У урока идёт экзамен: отменить его нельзя";
    case "EXAM_SERVICE_UNAVAILABLE": return "Не удалось проверить экзамены группы. Повторите попытку.";
    case "LESSON_OUTSIDE_WINDOW": return "Урок старше окна незакрытых уроков: назначить или отменить его нельзя — можно только отклонить запрос";
    default: return server;
  }
}

/** True when a refusal means «the list of candidates changed / look again»: the dialog reads the candidates once more. */
export function needsFreshCandidates(error: unknown): boolean {
  const code = opsErrorCode(error);
  return code === "TEACHER_BUSY" || code === "SUBSTITUTE_IS_REQUESTER" || code === "TARGET_NOT_TEACHER";
}

// ── the request of a teacher ─────────────────────────────────────────────────────────────────────

export const REQUEST_DIALOG_TITLE = "Не смогу провести урок";
export const SUGGEST_HINT = "Решение принимает администратор. Коллега ничего не подтверждает — администратор договорится с ним сам.";
export const REQUEST_EXPLAIN = "Администратор назначит замену, перенесёт или отменит урок. Статус запроса — на дашборде, в разделе «Запросы на замену».";

export const MY_LESSON_BLOCK_TEXT: Record<MyLessonBlockReason, string> = {
  LESSON_ALREADY_STARTED: "Урок уже начался",
  ALREADY_REQUESTED: "Запрос уже подан",
  LESSON_CANCELLED: "Урок отменён",
};

/** «пн, 26.10 · 10:00–11:30 · 9-А» - a row of «Другие мои уроки». */
export function myLessonLabel(lesson: Pick<MyLesson, "lessonDate" | "startTime" | "endTime" | "groupName">): string {
  return `${lessonWhen(lesson.lessonDate, lesson.startTime, lesson.endTime)} · ${lesson.groupName}`;
}

export function lessonKeyOfRef(ref: { groupId: string; lessonId: string; lessonDate: string }): string {
  return `${ref.groupId}|${ref.lessonDate}|${ref.lessonId}`;
}

/** «Отправить запрос» / «Отправить запрос (3 урока)». */
export function sendLabel(count: number): string {
  return count > 1 ? `Отправить запрос (${count} ${pluralLessons(count)})` : "Отправить запрос";
}

function pluralLessons(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return "уроков";
  if (last === 1) return "урок";
  if (last >= 2 && last <= 4) return "урока";
  return "уроков";
}

export function buildCreate(input: {
  lessons: Array<{ groupId: string; lessonId: string; lessonDate: string }>;
  reasonCode: SubstitutionReasonCode;
  comment: string;
  suggestedTeacherId?: string | null;
}): CreateSubstitutionBody {
  const comment = input.comment.trim();
  return {
    lessons: input.lessons.map(({ groupId, lessonId, lessonDate }) => ({ groupId, lessonId, lessonDate })),
    reasonCode: input.reasonCode,
    ...(comment ? { comment } : {}),
    ...(input.suggestedTeacherId ? { suggestedTeacherId: input.suggestedTeacherId } : {}),
  };
}

const SKIP_REASON_TEXT: Record<string, string> = {
  LESSON_ALREADY_STARTED: "урок уже начался",
  LESSON_CANCELLED: "урок отменён",
  ALREADY_REQUESTED: "запрос уже подан",
  NOT_LESSON_TEACHER: "урок ведёт другой преподаватель",
  GROUP_ARCHIVED: "группа в архиве",
  LESSON_TOO_FAR: "слишком далеко вперёд",
  LESSON_NOT_FOUND: "урока нет в расписании",
};

/** The toast after a request: one, several, or a part of them (the rest and why). */
export function createToast(out: Pick<CreateSubstitutionOut, "created" | "alreadyRequested" | "skipped">): { text: string; type: "success" | "warning" } {
  const sent = out.created.length;
  const skipped = out.skipped ?? [];
  if (skipped.length > 0) {
    const reasons = Array.from(new Set(skipped.map((entry) => SKIP_REASON_TEXT[entry.code] ?? entry.message.toLowerCase())));
    return { text: `Отправлено: ${sent}. Не отправлено: ${skipped.length} — ${reasons.join(", ")}`, type: "warning" };
  }
  if (sent === 0 && out.alreadyRequested.length > 0) return { text: "Запрос уже ждёт решения", type: "success" };
  return { text: sent > 1 ? `Запросов отправлено: ${sent}` : "Запрос отправлен администратору", type: "success" };
}

/** The request cards already shown on the lessons the person picks: a lesson of another day cannot be asked for from here when the server says no. */
export function requestableSelection(lessons: MyLesson[], picked: ReadonlySet<string>): MyLesson[] {
  return lessons.filter((lesson) => lesson.canRequest && picked.has(lessonKeyOfRef(lesson)));
}

// ── the lesson panel: who may ask, and what the lesson says ──────────────────────────────────────

export type RequestControl =
  | { kind: "none" }
  | { kind: "button" }
  | { kind: "pending"; requestId: string }
  | { kind: "rejected"; requestId: string };

/**
 * «Не смогу провести» is on the teacher's own future lesson that is not started and not cancelled.  A waiting request replaces the
 * button with the plate «Вы запросили замену» and «Отозвать запрос»; a rejected one leaves the words «Запрос отклонён».
 * Owner and administrator never ask (they assign the substitute themselves).
 */
export function requestControl(input: {
  role: string | null | undefined;
  userId: string | null | undefined;
  /** Who teaches the lesson (journal `lessonTeachers`); absent = the lesson is the viewer's own as far as we know. */
  lessonTeacherId?: string | null;
  lessonStatus: string | null | undefined;
  startsAtMs: number | null;
  nowMs: number;
  mark?: Pick<SubstitutionRequestMark, "id" | "status"> | null;
}): RequestControl {
  if (input.role !== "teacher") return { kind: "none" };
  const mark = input.mark;
  if (mark?.status === "pending") return { kind: "pending", requestId: mark.id };
  if (input.lessonTeacherId && input.userId && input.lessonTeacherId !== input.userId) return { kind: "none" };
  if (mark?.status === "rejected") return { kind: "rejected", requestId: mark.id };
  if (input.lessonStatus && input.lessonStatus !== "scheduled") return { kind: "none" };
  if (input.startsAtMs === null || input.startsAtMs <= input.nowMs) return { kind: "none" };
  return { kind: "button" };
}

/** P1.1: the teacher moves his own lesson only while more than this is left before it starts (the server's `MOVE_TOO_LATE`). */
export const TEACHER_MOVE_LEAD_MS = 60 * 60_000;
export const MOVE_TOO_LATE_HINT = "Перенести можно не позднее чем за 60 минут до начала";

/** W1 F2 (S4): the administrator rejected the teacher's request for this lesson - he does not move it himself afterwards (the server: 409 REQUEST_REJECTED). */
export const MOVE_REJECTED_HINT = "Администратор отклонил заявку по этому уроку";

export type TeacherMoveControl = { kind: "none" } | { kind: "button" } | { kind: "late" } | { kind: "rejected" };

/**
 * «Перенести урок» is on the teacher's own future lesson (not a substitution of one lesson, not started, not cancelled): a button while more than
 * 60 minutes are left, then the hint `MOVE_TOO_LATE_HINT` (and «Не смогу провести» stays).  A waiting request of his own does not hide it: the move closes it.
 */
export function teacherMoveControl(input: {
  role: string | null | undefined;
  userId: string | null | undefined;
  /** Who teaches the lesson; absent = the lesson is the viewer's own as far as we know (the server has the last word). */
  lessonTeacherId?: string | null;
  isSubstitution?: boolean;
  lessonStatus: string | null | undefined;
  startsAtMs: number | null;
  nowMs: number;
  /** The request of this lesson as the panel knows it: a rejected one switches «Перенести урок» off with the reason (W1 F2). */
  mark?: Pick<SubstitutionRequestMark, "status"> | null;
}): TeacherMoveControl {
  if (input.role !== "teacher" || input.isSubstitution) return { kind: "none" };
  if (input.lessonTeacherId && input.userId && input.lessonTeacherId !== input.userId) return { kind: "none" };
  if (input.lessonStatus && input.lessonStatus !== "scheduled") return { kind: "none" };
  if (input.startsAtMs === null || input.startsAtMs <= input.nowMs) return { kind: "none" };
  if (input.mark?.status === "rejected") return { kind: "rejected" };
  return input.startsAtMs - input.nowMs > TEACHER_MOVE_LEAD_MS ? { kind: "button" } : { kind: "late" };
}

/** The planned start of a lesson as an instant (the organisation's clock); null when the date or the time is unreadable. */
export function lessonStartMs(date: string, startTime: string, parse: (date: string, time: string) => Date | null): number | null {
  const instant = parse(date, startTime);
  return instant ? instant.getTime() : null;
}

/** «Замена: 9-А» - the chip of the lesson of a substitute in his own schedule. */
export function substituteGroupLabel(groupName: string | null | undefined): string {
  const name = (groupName ?? "").trim();
  return name ? `Замена: ${name}` : "Замена";
}

export const RECENT_DAYS = 14;

/**
 * The block «Запросы на замену» of the dashboard: every waiting request (the nearest lesson first) and the decided ones of the last
 * 14 days (the latest decision first).  The server sends the last 60 days; the rest is cut here.
 */
export function recentRequests(items: SubstitutionItem[], nowMs: number): SubstitutionItem[] {
  const decidedAt = (item: SubstitutionItem) => parseUtcNaive(item.decision?.at ?? item.createdAt)?.getTime() ?? 0;
  const limit = nowMs - RECENT_DAYS * 86_400_000;
  const pending = items
    .filter((item) => item.status === "pending")
    .sort((a, b) => (startsAtMsOf(a) ?? 0) - (startsAtMsOf(b) ?? 0));
  const decided = items
    .filter((item) => item.status !== "pending" && decidedAt(item) >= limit)
    .sort((a, b) => decidedAt(b) - decidedAt(a));
  return [...pending, ...decided];
}

export const ASSIGNED_TITLE = "Вам назначена замена";
export const MY_REQUESTS_TITLE = "Запросы на замену";
export const NEW_REQUEST_LINK = "Новый запрос";

/** The case of a short name «Фамилия И.» for a sentence («вместо Иванова А.», «за Ивановым А.»). */
export type NameCase = "genitive" | "instrumental";

const MASCULINE = /(ов|ев|ёв|ин|ын)$/i;
const FEMININE = /(ова|ева|ёва|ина|ына)$/i;

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

/** For «вместо …». */
export function genitiveShortName(name: string | null | undefined): string | null {
  return declineShortName(name, "genitive");
}

/** «Замена: 9-А — пн, 26.10, 10:00–11:30 (вместо Иванова А.)»; an indeclinable surname: «(вместо: Ким А.)». */
export function assignedLine(entry: { groupName: string; lessonDate: string; startTime: string; endTime: string; replacing?: { name: string } | null }): string {
  const head = `Замена: ${entry.groupName} — ${dayAndDateLabel(entry.lessonDate)}, ${entry.startTime}–${entry.endTime}`;
  const who = (entry.replacing?.name ?? "").trim();
  if (!who) return head;
  const genitive = genitiveShortName(who);
  return genitive ? `${head} (вместо ${genitive})` : `${head} (вместо: ${who})`;
}

/** One substitute lesson in one row, no opening needed: «Вам назначена замена: вс, 15.11 · 10:00 · Группа». */
export function assignedSingleLine(entry: { groupName: string; lessonDate: string; startTime: string }): string {
  return `${ASSIGNED_TITLE}: ${dayAndDateLabel(entry.lessonDate)} · ${entry.startTime} · ${entry.groupName}`;
}

/**
 * W1 F11 (S22): «Вам назначена замена» stays until the lesson STARTS (not all day: the server keeps the whole date), at the horizon the server gives (the same as the schedule).
 * The start is the planned one in the business clock; a lesson without a readable start stays (the server has the last word).
 */
export function assignedAhead<T extends { lessonDate: string; startTime?: string | null }>(entries: readonly T[], nowMs: number, parse: (date: string, time: string) => Date | null): T[] {
  return entries.filter((entry) => {
    const start = entry.startTime ? parse(entry.lessonDate, entry.startTime) : null;
    return start === null || start.getTime() > nowMs;
  });
}

/** «ДД.ММ ЧЧ:ММ» of a moment the server sends as UTC without a zone («28.10 12:24»). */
export function shortWhen(at: string | null | undefined): string {
  return formatUtcNaiveAsBusinessDateTime(at).replace(/^(\d{2}\.\d{2})\.\d{4}/, "$1");
}

/** «Замена снята: 9-А — пн, 28.10, 10:00–11:30 (администратор, 26.10 09:30)» - the new event of the substitute: the assignment was taken off; by whom - by the role alone (another person's name is not for a teacher). */
export function clearedForMeLine(entry: { groupName: string; lessonDate: string; startTime?: string | null; endTime?: string | null; clearedAt?: string | null; clearedBy?: { name?: string | null; role?: string | null } | null }): string {
  const time = entry.startTime ? `, ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ""}` : "";
  const by = entry.clearedBy?.role === "owner" ? "владелец" : entry.clearedBy?.role === "admin" ? "администратор" : "";
  const when = shortWhen(entry.clearedAt);
  const tail = [by, when].filter(Boolean).join(", ");
  return `Замена снята: ${entry.groupName} — ${dayAndDateLabel(entry.lessonDate)}${time}${tail ? ` (${tail})` : ""}`;
}

// ── who reads which roster ───────────────────────────────────────────────────────────────────────

/**
 * The lead's rule (21.10): a substitute and a former teacher have no group page (`GET /org/groups/{id}` is 403 for them).  The roster of
 * their lesson comes with the journal (`lessonRoster`), and the screens show no link to the group, no phones, no diagnostics.
 * The group's own teacher and the managers read the group page as before.
 */
export type RosterSource = "group" | "journal";

export function rosterSource(input: {
  isManager: boolean;
  groupId: string;
  /** The groups the viewer teaches (the dashboard / schedule group list; a substituted lesson's group is not among them). */
  ownGroupIds: ReadonlyArray<string>;
}): RosterSource {
  if (input.isManager) return "group";
  return input.ownGroupIds.includes(input.groupId) ? "group" : "journal";
}

/**
 * Reads what a lesson panel needs: the group page (members) for those who may read it, the journal of the day for everybody.  A substitute's
 * source is the journal alone - `getGroup` is never called for him (the server would answer 403), and `lessonRoster` of the journal is his roster.
 */
export function readLessonRoster<Journal>(input: {
  source: RosterSource;
  groupId: string;
  getGroup: (groupId: string) => Promise<GroupDetail>;
  getJournal: () => Promise<Journal>;
}): Promise<[GroupDetail | null, Journal]> {
  return Promise.all([
    input.source === "group" ? input.getGroup(input.groupId) : Promise.resolve(null),
    input.getJournal(),
  ]);
}

/** The group link and the student cards are for those who read the group page. */
export function showsGroupLinks(source: RosterSource): boolean {
  return source === "group";
}

/** Students of the group list who are NOT on a pause today (`on_pause` comes with `GET /org/groups/{id}`); the list of a lesson of today. */
export function withoutPaused<T extends { on_pause?: boolean | null }>(students: T[]): T[] {
  return students.filter((student) => !student.on_pause);
}

/**
 * The roster the server froze when the lesson was started (`rosterStudentIds[<date>_<lessonId>]`): the group's list is read before
 * the start and still holds a student who is on a pause that day (he is not in the class and is not marked).  No frozen roster yet:
 * the list stays as it is.
 */
export function narrowToFrozenRoster<T extends { id: string }>(students: T[], frozenIds: string[] | null | undefined): T[] {
  if (!Array.isArray(frozenIds)) return students;
  const frozen = new Set(frozenIds);
  return students.filter((student) => frozen.has(student.id));
}

/** `lessonRoster` of the journal as the students of the panel: the shape of a group member, without a phone and without a level. */
export function rosterFromJournal(roster: LessonRosterStudent[] | null | undefined): StudentInGroup[] {
  return (roster ?? []).map((student) => ({
    id: student.id,
    first_name: student.first_name || "",
    last_name: student.last_name || "",
    full_name: student.full_name || `${student.last_name} ${student.first_name}`.trim() || "Ученик",
    class_level: student.class_level ?? 0,
    status: "active",
    display_id: student.display_id ?? null,
    student_phone: null,
    joined_at: null,
    last_theta: null,
    last_level: null,
    last_diagnosed_at: null,
  }));
}

// ── owner / admin: the list ───────────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 50;

export function listQuery(params: SubstitutionListParams): string {
  const query = new URLSearchParams();
  query.set("status", params.status);
  if (params.groupId) query.set("groupId", params.groupId);
  if (params.teacherId) query.set("teacherId", params.teacherId);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.urgent) query.set("urgent", "true");
  const search = (params.search ?? "").trim();
  if (search) query.set("search", search);
  query.set("limit", String(params.limit ?? PAGE_SIZE));
  query.set("offset", String(params.offset ?? 0));
  return query.toString();
}

export const EMPTY_TEXT = "Запросов на замену нет";
/** #157: the journal is every change of a lesson, not only the requests of teachers. */
export const PAGE_HINT = "Запросы преподавателей и все изменения уроков: замены, переносы, отмены";
/** The tab «Решённые» is the days of the EVENT (the last 30), not the date of the lesson. */
export const DECIDED_EMPTY_HINT = "Здесь появятся события за последние 30 дней.";
export const LOAD_ERROR_TEXT = "Не удалось загрузить запросы. Повторите попытку.";

/** «Ждут решения (3)» / «Решённые». */
export function tabLabel(tab: "pending" | "decided", pendingTotal: number): string {
  return tab === "pending" ? `Ждут решения (${pendingTotal})` : "Решённые";
}

/** «В запросе ещё 2 урока» for the other requests of the batch on screen. */
export function batchSiblings(item: SubstitutionItem, items: SubstitutionItem[]): SubstitutionItem[] {
  if (!item.batchId) return [];
  return items.filter((other) => other.batchId === item.batchId && other.id !== item.id);
}

export function moreLessonsText(count: number): string {
  return `В запросе ещё ${count} ${pluralLessons(count)}`;
}

/**
 * Replace the row of the list by the fresh item the server sent (a decision answer, or the 409 body), keeping the order; an item that
 * left the open tab leaves the list, and the counter of the tab follows.
 */
export function applyFreshItem(
  state: { items: SubstitutionItem[]; total: number; pendingTotal: number },
  fresh: SubstitutionItem,
  tab: "pending" | "decided",
): { items: SubstitutionItem[]; total: number; pendingTotal: number } {
  const index = state.items.findIndex((item) => item.id === fresh.id);
  if (index < 0) return state;
  const was = state.items[index];
  const pendingTotal = was.status === "pending" && fresh.status !== "pending" ? Math.max(0, state.pendingTotal - 1) : state.pendingTotal;
  const leaves = tab === "pending" ? fresh.status !== "pending" : false;
  if (leaves) {
    return { items: state.items.filter((item) => item.id !== fresh.id), total: Math.max(0, state.total - 1), pendingTotal };
  }
  const items = state.items.slice();
  items[index] = fresh;
  return { items, total: state.total, pendingTotal };
}

// ── the decision ────────────────────────────────────────────────────────────────────────────────

export const DECISION_CARDS: ReadonlyArray<{ kind: "substitute" | "reschedule" | "cancel" | "reject"; title: string; late?: string }> = [
  { kind: "substitute", title: "Назначить замену", late: "Назначить того, кто провёл урок" },
  { kind: "reschedule", title: "Перенести урок" },
  { kind: "cancel", title: "Отменить урок" },
  { kind: "reject", title: "Отклонить запрос" },
];

export function decisionCardTitle(kind: string, late: boolean): string {
  const card = DECISION_CARDS.find((entry) => entry.kind === kind);
  return (late && card?.late) || card?.title || "";
}

/** The cards on offer: «Перенести» is off for a lesson that has started. */
export function availableDecisions(item: Pick<SubstitutionItem, "status" | "overdue">): Array<"substitute" | "reschedule" | "cancel" | "reject"> {
  const late = isLateRequest(item);
  return DECISION_CARDS.map((card) => card.kind).filter((kind) => !(late && kind === "reschedule"));
}

export const SUBSTITUTE_NOTE_HINT = "Заменяющий ничего не подтверждает: договоритесь с ним сами. Урок появится у него в расписании.";
export const NO_FREE_TEACHERS_TEXT = "Свободных преподавателей на это время нет. Перенесите или отмените урок.";
export const CANCEL_CONSEQUENCES = "Ученики не отмечаются, из пакета урок не списывается, преподавателю не оплачивается. Вернуть урок можно, пока он не начался.";
export const REJECT_REASON_LABEL = "Причина отказа (её увидит преподаватель)";
export const CANCEL_REASON_LABEL = "Причина отмены";
export const MOVE_REASON_LABEL = "Причина переноса";
export const MOVE_EXPLAIN_TEXT = "Исходный урок будет отменён как перенесённый — ученики на нём не отмечаются.";

export function moveExplain(groupTeacherName: string | null | undefined): string {
  const name = (groupTeacherName ?? "").trim();
  return `${MOVE_EXPLAIN_TEXT} Новый урок проведёт преподаватель группы${name ? ` (${name})` : ""}. Замена, назначенная на исходный урок, на новый не переходит. Отменённый урок вернуть нельзя.`;
}

/** «Урок остаётся за Ивановым И. Если он не придёт, урок попадёт в «Незакрытые».» - a surname that cannot be declined by rule gets the neutral wording. */
export function rejectConsequence(teacherName: string): string {
  const instrumental = declineShortName(teacherName, "instrumental");
  // a short name already ends with the full stop of the initial
  const stop = (text: string) => (text.endsWith(".") ? text : `${text}.`);
  if (!instrumental) return `Урок остаётся за преподавателем: ${stop(teacherName.trim())} Если урок не будет проведён, он попадёт в «Незакрытые».`;
  const she = FEMININE.test(teacherName.trim().split(/\s+/)[0]);
  return `Урок остаётся за ${stop(instrumental)} Если ${she ? "она" : "он"} не придёт, урок попадёт в «Незакрытые».`;
}
export const examDraftText = (title: string): string => `Экзамен «${title}» вернётся в черновик — привяжите его к новому уроку.`;
export const examDraftCancelText = (title: string): string => `Экзамен «${title}» вернётся в черновик, код доступа будет закрыт.`;
/** A move releases a draft exam bound to the lesson (the server, #124): say it before, not after. */
export const examDraftMoveText = (title: string): string => `К уроку привязан экзамен «${title}». После переноса он вернётся в черновик — назначьте его на новый урок.`;
export const examRunningText = (title: string): string => `Экзамен «${title}» уже идёт — отменить урок нельзя`;

/** «{Имя} не сможет провести урок». */
export function decisionHeader(item: Pick<SubstitutionItem, "teacher">): string {
  return `${item.teacher.name} не сможет провести урок`;
}

/** Candidate ranking per the contract: suggested first (even busy), free ones, then the busy ones. */
export function orderedCandidates(candidates: SubstitutionCandidate[]): SubstitutionCandidate[] {
  const rank = (candidate: SubstitutionCandidate) => (candidate.suggested ? 0 : candidate.busy ? 2 : 1);
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => rank(a.candidate) - rank(b.candidate) || a.index - b.index)
    .map((entry) => entry.candidate);
}

/** «Занят: 8-В, 10:00–11:30» / «Занят: замена в 8-В, 10:00–11:30» / «… (сам запросил замену)». */
export function candidateBusyLine(busy: CandidateBusy | null | undefined): string {
  if (!busy) return "Занят";
  const where = busy.kind === "substitution" ? `замена в ${busy.groupName}` : busy.groupName;
  return `Занят: ${where}, ${busy.startTime}–${busy.endTime}${busy.pendingRequest ? " (сам запросил замену)" : ""}`;
}

export const SUGGESTED_CHIP = "Предложил учитель";

export function canPickCandidate(candidate: SubstitutionCandidate, requesterId: string | null | undefined): boolean {
  return !candidate.busy && candidate.teacherId !== requesterId;
}

export function noFreeCandidates(candidates: SubstitutionCandidate[], requesterId: string | null | undefined): boolean {
  return candidates.every((candidate) => !canPickCandidate(candidate, requesterId));
}

export const DECIDE_REASON_MIN = 3;

export function decisionReasonError(kind: "reschedule" | "cancel" | "reject", reason: string): string | null {
  const length = reason.trim().length;
  const max = kind === "reject" ? 300 : 500;
  if (length < DECIDE_REASON_MIN) return "Укажите причину — не менее 3 символов";
  if (length > max) return `Причина — не более ${max} символов`;
  return null;
}

export interface MoveForm {
  newDate: string;
  startTime: string;
  endTime: string;
  room: string;
  format: "offline" | "online";
  reason: string;
}

export function moveFormError(form: MoveForm, item: Pick<SubstitutionItem, "lesson">, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.newDate)) return "Укажите новую дату и время урока";
  if (!/^\d{1,2}:\d{2}$/.test(form.startTime) || !/^\d{1,2}:\d{2}$/.test(form.endTime)) return "Укажите новую дату и время урока";
  if (lessonMinutes(form.startTime, form.endTime) === 0) return "Окончание должно быть позже начала";
  if (form.newDate < today) return "Новое время урока уже прошло";
  if (form.newDate === item.lesson.date && form.startTime === item.lesson.startTime && form.endTime === item.lesson.endTime) return "Выберите другую дату или время";
  return decisionReasonError("reschedule", form.reason);
}

export function moveCheckParams(form: MoveForm): MoveCheckParams | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.newDate)) return null;
  if (!/^\d{1,2}:\d{2}$/.test(form.startTime) || !/^\d{1,2}:\d{2}$/.test(form.endTime)) return null;
  if (lessonMinutes(form.startTime, form.endTime) === 0) return null;
  return { newDate: form.newDate, startTime: form.startTime, endTime: form.endTime };
}

/** The live check under the move form: free, or the clashes in the words of the spec. */
export function moveCheckLines(check: MoveCheckOut, groupName: string): { ok: boolean; lines: string[]; warnings: string[] } {
  const teacher = (check.teacherName ?? "").trim() || "преподавателя";
  const lines: string[] = [];
  for (const conflict of check.teacherConflicts ?? []) {
    lines.push(`У ${teacher} в это время урок «${conflict.withGroupName}» (${dayAndDateLabel(conflict.date)}, ${conflict.startTime}–${conflict.endTime})`);
  }
  for (const conflict of check.groupConflicts ?? []) {
    lines.push(`У группы «${groupName}» уже есть урок ${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}`);
  }
  const warnings = (check.warnings ?? []).map((warning) => (warning.message ?? "").trim()).filter(Boolean);
  if (lines.length === 0 && check.ok) {
    return { ok: true, lines: [`Время свободно: у ${teacher} и группы «${groupName}» пересечений нет`], warnings };
  }
  return { ok: false, lines, warnings };
}

export function buildDecide(
  kind: "substitute" | "reschedule" | "cancel" | "reject",
  form: { teacherId?: string | null; note?: string; reason?: string; move?: MoveForm; cancellationKind?: CancellationKind },
): DecideBody {
  const expectedStatus = "pending" as const;
  if (kind === "substitute") {
    const note = (form.note ?? "").trim();
    return { decision: "substitute", teacherId: form.teacherId ?? "", ...(note ? { note } : {}), expectedStatus };
  }
  if (kind === "reschedule") {
    const move = form.move as MoveForm;
    const room = move.room.trim();
    return {
      decision: "reschedule",
      newDate: move.newDate,
      startTime: move.startTime,
      endTime: move.endTime,
      room: room || null,
      format: move.format,
      reason: move.reason.trim(),
      expectedStatus,
    };
  }
  // W1 F4 (S11): a cancellation says its kind (the default of the server is «по вине центра»; the field is the choice of the administrator)
  if (kind === "cancel") return { decision: kind, reason: (form.reason ?? "").trim(), cancellationKind: form.cancellationKind ?? DEFAULT_CANCELLATION_KIND, expectedStatus };
  return { decision: kind, reason: (form.reason ?? "").trim(), expectedStatus };
}

export function buildBulk(
  ids: string[],
  kind: "substitute" | "cancel" | "reject",
  form: { teacherId?: string | null; reason?: string; note?: string; cancellationKind?: CancellationKind },
): DecideBulkBody {
  if (kind === "substitute") {
    const note = (form.note ?? "").trim();
    return { ids, decision: kind, teacherId: form.teacherId ?? null, ...(note ? { note } : {}) };
  }
  if (kind === "cancel") return { ids, decision: kind, reason: (form.reason ?? "").trim(), cancellationKind: form.cancellationKind ?? DEFAULT_CANCELLATION_KIND };
  return { ids, decision: kind, reason: (form.reason ?? "").trim() };
}

/** The toast after one decision. */
export function decisionToast(out: Pick<DecideOut, "item" | "result">): string {
  const result = out.result;
  switch (result?.kind) {
    case "substitute": return `Замена назначена: ${result.teacherName ?? out.item.decision?.substitute?.name ?? ""}`.trim();
    case "reschedule": {
      const moved = result.newLesson ?? out.item.decision?.movedTo;
      return moved ? movedText(moved) : "Урок перенесён";
    }
    case "cancel": return LESSON_CANCELLED_LABEL;
    case "reject": return "Запрос отклонён";
    default: return "Решение сохранено";
  }
}

/** «Решено: 5. Не удалось: 2» and a line per refusal. */
export function bulkToast(out: Pick<DecideBulkOut, "updated" | "skipped"> & { results?: DecideBulkOut["results"] }, items: SubstitutionItem[]): { text: string; type: "success" | "warning"; details: string[] } {
  const skipped = out.skipped ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const prefixOf = (id: string) => { const item = byId.get(id); return item ? `${item.group.name}, ${dayAndDateLabel(item.lesson.date)} ${item.lesson.startTime}: ` : ""; };
  const details = skipped.map((entry) => bulkSkippedLine(entry, byId.get(entry.id)));
  // W1: what the server said about a DECIDED item (a holiday instead of «по вине центра», a released substitute) is never lost in a pack
  const notes = (out.results ?? []).flatMap((row) => (row.warnings ?? []).map((warning) => `${prefixOf(row.id)}${(warning.message ?? "").trim()}`).filter((line) => !line.endsWith(": ")));
  const lines = [...details, ...notes];
  return { text: `Решено: ${out.updated}. Не удалось: ${skipped.length}`, type: lines.length > 0 ? "warning" : "success", details: lines };
}

/** W1: the refusals of one pack item that have their own words (the same as the single decision). */
const BULK_CANCEL_CODES: readonly string[] = ["ALREADY_CANCELLED", "ALREADY_MOVED", "LESSON_HAS_MARKS", "LESSON_CHANGED", "LESSON_ALREADY_STARTED", "LESSON_HAS_LIVE_EXAM", "EXAM_SERVICE_UNAVAILABLE"];

export function bulkSkippedLine(entry: BulkSkipped, item?: SubstitutionItem): string {
  const prefix = item ? `${item.group.name}, ${dayAndDateLabel(item.lesson.date)} ${item.lesson.startTime}: ` : "";
  let text = entry.message;
  if (entry.code === "SUBSTITUTION_ALREADY_DECIDED") text = "Запрос уже решён";
  else if (entry.code === "TEACHER_BUSY" && entry.conflicts?.[0]) {
    const first: TeacherConflict = entry.conflicts[0];
    text = `преподаватель занят: ${teacherConflictLine(first)}`;
  } else if (entry.code === "LESSON_OUTSIDE_WINDOW") text = "урок старше окна незакрытых уроков";
  else if (BULK_CANCEL_CODES.includes(entry.code)) text = substitutionErrorText(Object.assign(new Error(entry.message), { code: entry.code, detail: { code: entry.code, message: entry.message } }));
  return `${prefix}${text}`;
}

// ── the numbers of the menu ──────────────────────────────────────────────────────────────────────

export const BADGE_LABEL = "Ждут решения";

/** The tooltip of the menu counter: «Ждут решения: 3, срочных: 1». */
export function badgeTitle(summary: { pendingTotal: number; urgentTotal: number; overdueTotal?: number; expiringTotal?: number }): string {
  const extra = (summary.urgentTotal > 0 ? `, срочных: ${summary.urgentTotal}` : "") + ((summary.expiringTotal ?? 0) > 0 ? `, ${EXPIRING_LABEL}: ${summary.expiringTotal}` : "");
  return `${BADGE_LABEL}: ${summary.pendingTotal}${extra}`;
}

/** W1 S20: the requests of the last month that the server will close on the 1st («Не решено вовремя»). */
export const EXPIRING_LABEL = "истекают через ≤3 дня";
export function expiringLine(count: number | null | undefined): string | null {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 0 ? `Истекают через ≤3 дня: ${n}. Решите до 1-го числа — потом запрос закроется.` : null;
}

// ── marks on the lessons of the journal / schedule (owner, administrator) ─────────────────────────

/**
 * The toast after «Заменить преподавателя» (a direct assignment): the request of the teacher that this assignment answered is closed by it,
 * and the administrator is told so.
 */
export function directAssignToast(result: { isSubstitution?: boolean; teacherName?: string | null; defaultTeacherId?: string | null; requestClosed?: { id: string; status: string } | null }): string {
  // a lesson of a group without a main teacher has nobody to replace: it is simply led by the one assigned
  const leads = !result.isSubstitution && result.defaultTeacherId === null && result.teacherName;
  const head = result.isSubstitution ? `Замена назначена: ${result.teacherName ?? ""}`.trim() : leads ? `Ведёт: ${result.teacherName}` : "Преподаватель урока возвращён";
  return result.requestClosed ? `${head}${head.endsWith(".") ? "" : "."} Запрос преподавателя закрыт.` : head;
}

/** W1 F5: the notes under the toast of an assignment - a payroll sheet that is already written changes (`payrollSheetsAffected`); nothing the server said is lost. */
export function assignmentNotes(result: { payrollSheetsAffected?: ReadonlyArray<{ month?: string | null; status?: string | null }> | null; warnings?: ReadonlyArray<{ message?: string | null }> | null }): string[] {
  const sheets = payrollSheetsNote(result.payrollSheetsAffected as ReadonlyArray<{ month?: string | null }> | null);
  const warnings = (result.warnings ?? []).map((warning) => (warning?.message ?? "").trim()).filter(Boolean);
  return [...warnings, ...(sheets ? [sheets] : [])];
}

/** The archive dialog of a group: its waiting requests are closed by the archive. */
export function archiveRequestsText(count: number): string {
  return `Запросов на замену: ${count} — они будут закрыты.`;
}

/** The removal dialog of a member: his waiting requests are closed with the removal. */
export function removalRequestsText(count: number): string {
  return `Запросов на замену этого сотрудника (${count}) будут закрыты.`;
}

export const WAITING_MARK = "Ждёт замены";

export interface LessonMark {
  text: string;
  tone: "amber" | "blue" | "gray" | "violet" | "red";
  /** The request the mark leads to (only a waiting request has a page of its own). */
  requestId?: string;
}

/**
 * «Ждёт замены» (a link to the request) on a lesson with a waiting request for the manager, «Вы запросили замену» for the teacher who asked;
 * «Урок перенесён на …» / «Урок отменён» on the original.
 */
export function lessonMarks(
  mark: SubstitutionRequestMark | null | undefined,
  outcome: SubstitutionOutcome | null | undefined,
  options: { manager?: boolean } = {},
): LessonMark[] {
  const manager = options.manager !== false;
  const marks: LessonMark[] = [];
  if (mark?.status === "pending") marks.push(manager ? { text: WAITING_MARK, tone: "amber", requestId: mark.id } : { text: REQUESTED_LABEL, tone: "amber" });
  if (outcome?.kind === "rescheduled") marks.push({ text: outcome.movedTo ? movedText(outcome.movedTo) : "Урок перенесён", tone: "blue" });
  else if (outcome?.kind === "cancelled") marks.push({ text: LESSON_CANCELLED_LABEL, tone: "gray" });
  return marks;
}

export const MARK_TONE_CLASS: Record<LessonMark["tone"], string> = {
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
};

/**
 * The chips on a lesson of the teacher's own schedule: «Замена: 9-А» on the lesson of a substitute, «Замена: Рахимов Т.» on the
 * lesson of the teacher who was replaced, «Вы запросили замену» / «Запрос отклонён» for his request, and where a cancelled original went.
 */
export function occurrenceChips(
  occurrence: {
    groupName?: string | null;
    isSubstitution?: boolean;
    teacherId?: string | null;
    teacherName?: string | null;
    defaultTeacherId?: string | null;
    substitutionRequest?: SubstitutionRequestMark | null;
    substitutionOutcome?: SubstitutionOutcome | null;
    /** #124: the new lesson of a move says where it came from. */
    movedFrom?: MovedFrom | null;
  },
  viewerId: string | null | undefined,
  options: { manager?: boolean } = {},
): LessonMark[] {
  const chips: LessonMark[] = [];
  if (occurrence.isSubstitution) {
    if (viewerId && occurrence.teacherId === viewerId) chips.push({ text: substituteGroupLabel(occurrence.groupName), tone: "violet" });
    else {
      const name = (occurrence.teacherName ?? "").trim();
      if (viewerId && occurrence.defaultTeacherId === viewerId) chips.push({ text: name ? `Замена: ${name}` : "Замена: другой преподаватель", tone: "violet" });
      else chips.push({ text: name ? `Замена: ${name}` : "Замена", tone: "violet" });
    }
  }
  else if (occurrence.teacherId && occurrence.defaultTeacherId === null && (occurrence.teacherName ?? "").trim()) chips.push({ text: `Ведёт: ${occurrence.teacherName!.trim()}`, tone: "violet" });     // a group without a main teacher: nobody to replace
  const mark = occurrence.substitutionRequest;
  // the teacher who asked reads «Вы запросили замену», the administrator «Ждёт замены» (a link to the request)
  if (mark?.status === "pending") chips.push({ text: options.manager ? WAITING_MARK : REQUESTED_LABEL, tone: "amber", requestId: mark.id });
  else if (mark?.status === "rejected" && !options.manager) chips.push({ text: REQUEST_REJECTED_LABEL, tone: "red" });
  const outcome = occurrence.substitutionOutcome;
  if (outcome?.kind === "rescheduled") chips.push({ text: outcome.movedTo ? movedText(outcome.movedTo) : "Урок перенесён", tone: "blue" });
  else if (outcome?.kind === "cancelled") chips.push({ text: LESSON_CANCELLED_LABEL, tone: "gray" });
  const from = movedFromLabel(occurrence.movedFrom);
  if (from) chips.push({ text: from, tone: "blue" });
  return chips;
}

/** The page of the requests of the role, opened on one request: `/owner/substitutions?request=<id>`. */
export function substitutionsHref(basePath: string, requestId?: string | null): string {
  return requestId ? `${basePath}?request=${encodeURIComponent(requestId)}` : basePath;
}

export const SUBSTITUTIONS_PATH: Record<"owner" | "admin", string> = { owner: "/owner/substitutions", admin: "/admin/substitutions" };

/** The page of the requests for the signed-in manager: the owner's own, else the administrator's. */
export function substitutionsPathFor(user: { org_role?: string | null; role?: string | null } | null | undefined): string {
  return user?.org_role === "owner" || user?.role === "owner" ? SUBSTITUTIONS_PATH.owner : SUBSTITUTIONS_PATH.admin;
}

// ── the card of a student ────────────────────────────────────────────────────────────────────────

/** The labels under a lesson in the student's attendance: «Замена: Рахимов Т.»; never a reason. */
export function studentLessonLabel(lesson: { isSubstitution?: boolean | null; teacherName?: string | null }): string | null {
  if (!lesson.isSubstitution) return null;
  const name = (lesson.teacherName ?? "").trim();
  return name ? `Замена: ${name}` : "Замена";
}

/** «Урок отменён» / «Урок отменён: выходной (Хайит)» (PAY-F: a day off of the centre is public) / «Урок перенесён на чт, 29.10, 16:00». */
export function studentNoticeLabel(notice: Pick<StudentNotice, "kind" | "movedTo"> & { holiday?: string | null }): string {
  if (notice.kind === "rescheduled") return notice.movedTo ? movedText(notice.movedTo) : "Урок перенесён";
  return notice.holiday ? `${LESSON_CANCELLED_LABEL}: выходной (${notice.holiday})` : LESSON_CANCELLED_LABEL;
}

export interface StudentLessonRow {
  key: string;
  date: string;
  groupName: string;
  /** The mark of the lesson («Был», «Не был»…) - none for a cancelled / moved one. */
  markText: string | null;
  /** «Замена: Рахимов Т.» on a lesson a substitute held. */
  substituteText: string | null;
  /** «Урок отменён» / «Урок перенесён на …» - the row of a lesson that did not take place. */
  noticeText: string | null;
  /** «Перенесён с 25.10, 10:00» on the new lesson of a move. */
  movedFromText: string | null;
}

/**
 * The month of a student as a list of days: the lessons he had (with the mark and the teacher if it was a substitute) and the lessons that
 * did not take place (cancelled / moved, without a reason), by date.  `markLabel` turns a status into its words.
 */
export function studentLessonRows(
  lessons: Array<{ lesson_id?: string | null; date: string; group_name: string; status?: string | null; teacherName?: string | null; isSubstitution?: boolean; movedFrom?: MovedFrom | null }> | null | undefined,
  notices: StudentNotice[] | null | undefined,
  markLabel: (status: string) => string | null,
): StudentLessonRow[] {
  const rows: StudentLessonRow[] = [];
  for (const lesson of lessons ?? []) {
    rows.push({
      key: `lesson:${lesson.lesson_id ?? ""}:${lesson.date}:${lesson.group_name}`,
      date: lesson.date,
      groupName: lesson.group_name,
      markText: lesson.status ? markLabel(lesson.status) : null,
      substituteText: studentLessonLabel(lesson),
      noticeText: null,
      movedFromText: movedFromLabel(lesson.movedFrom),
    });
  }
  for (const notice of sortedNotices(notices)) {
    rows.push({ key: `notice:${notice.lessonId}:${notice.date}`, date: notice.date, groupName: notice.groupName, markText: null, substituteText: null, noticeText: studentNoticeLabel(notice), movedFromText: null });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.groupName.localeCompare(b.groupName, "ru"));
}

export const STUDENT_NOTICE_FOOTNOTE = "Отменённые и перенесённые уроки в посещаемость не входят.";

/** The notices of the month in the order of the calendar. */
export function sortedNotices(notices: StudentNotice[] | null | undefined): StudentNotice[] {
  return (notices ?? []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.groupName.localeCompare(b.groupName, "ru"));
}

// ── time helpers used by the screens ─────────────────────────────────────────────────────────────

/** The instant a request item says the lesson starts (naive UTC), or null. */
export function startsAtMsOf(item: Pick<SubstitutionItem, "lesson">): number | null {
  const instant = parseUtcNaive(item.lesson.startsAtUtc);
  return instant ? instant.getTime() : null;
}
