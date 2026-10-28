/**
 * #157 «Замены: понятный журнал»: the ONE result of a row and the ONE way to name an author - for the list, the panel «Подробнее»,
 * the window «уже решено» and the block of the teacher (LESSONS 0.7, 46).
 *
 * The server sends `outcome` (a code, one function for the list / the detail / `mine` / the answers of the actions); the words and the
 * colours are here: one chip per row, one to three words, no names inside (the names are in the row and in the panel).
 * Pure functions: no React and no network, so node:test loads this file directly.
 */
import type { ChipTone } from "./chip-tone";
import { formatBusinessDate } from "./business-time";
import { movedToLabel, reasonLabelOf, shortWhen, startsAtMsOf } from "./substitutions";
import type { EventActor, MaskedPersonRef, SubstitutionItem, SubstitutionOutcomeCode } from "./substitution-types";

/** The screen reads the row as a manager (owner / administrator: full names) or as a teacher (his own requests: short words, other people by role only). */
export type Audience = "manager" | "teacher";

export interface OutcomeView {
  code: SubstitutionOutcomeCode;
  text: string;
  /** ok = decided, muted = taken off / closed without a decision / an event, warn = needs attention. */
  tone: ChipTone;
}

/** The 25 codes of `P157_API.md` §2: the chip and its colour. */
export const OUTCOME_CHIP: Record<SubstitutionOutcomeCode, { text: string; tone: ChipTone }> = {
  pending: { text: "Ждёт решения", tone: "warn" },
  substituted: { text: "Замена назначена", tone: "ok" },
  rescheduled: { text: "Урок перенесён", tone: "ok" },
  cancelled: { text: "Урок отменён", tone: "ok" },
  lesson_not_held: { text: "Урока не было", tone: "ok" },
  rejected: { text: "Запрос отклонён", tone: "ok" },
  substitution_cleared: { text: "Замена снята", tone: "muted" },
  substitution_replaced: { text: "Заменён другим", tone: "muted" },
  lesson_later_cancelled: { text: "Урок позже отменён", tone: "muted" },
  lesson_later_moved: { text: "Урок позже перенесён", tone: "muted" },
  cancelled_by_day_off: { text: "Отменён выходным", tone: "muted" },
  day_off_voided: { text: "Выходной отменён", tone: "muted" },
  withdrawn: { text: "Преподаватель отозвал", tone: "muted" },
  not_resolved_in_time: { text: "Не решено вовремя", tone: "warn" },
  lesson_started: { text: "Урок начался без решения", tone: "warn" },
  lesson_already_cancelled: { text: "Урок уже отменён", tone: "muted" },
  lesson_removed: { text: "Урока нет в расписании", tone: "muted" },
  group_archived: { text: "Группа в архиве", tone: "muted" },
  group_teacher_changed: { text: "Сменился преподаватель", tone: "muted" },
  teacher_removed: { text: "Преподаватель ушёл", tone: "muted" },
  role_changed: { text: "Стал администратором", tone: "muted" },
  lesson_restored: { text: "Урок возвращён", tone: "muted" },
  kind_changed: { text: "Вид отмены изменён", tone: "muted" },
  one_off_added: { text: "Разовый урок", tone: "muted" },
  closed: { text: "Запрос закрыт", tone: "muted" },
};

export const OUTCOME_CODES = Object.keys(OUTCOME_CHIP) as SubstitutionOutcomeCode[];

/** Where the teacher's block says it shorter (the reason and the fate of the substitution are in the panel, not in a long chip). */
const TEACHER_TEXT: Partial<Record<SubstitutionOutcomeCode, string>> = {
  rejected: "Отклонено",
  withdrawn: "Отозван",
};

function isKnownCode(code: unknown): code is SubstitutionOutcomeCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(OUTCOME_CHIP, code);
}

/**
 * The result of a row as a chip: `{ text, tone }`.  An unknown or missing code is the last row of the table, «Запрос закрыт»
 * (a new server code never shows as an empty chip; the test on every code is in `p157-substitutions-front.test.cjs`, LESSONS 46).
 * «Выходной отменён» is yellow while the lesson is still ahead (the substitution did not come back: it needs a decision), grey after it.
 */
export function outcomeOf(item: Pick<SubstitutionItem, "outcome" | "lesson" | "decision">, audience: Audience, nowMs: number = Date.now()): OutcomeView {
  const code: SubstitutionOutcomeCode = isKnownCode(item.outcome) ? item.outcome : "closed";
  const chip = OUTCOME_CHIP[code];
  let text = chip.text;
  let tone = chip.tone;
  if (audience === "teacher") {
    const substitute = (item.decision?.substitute?.name ?? "").trim();
    text = code === "substituted" && substitute ? `Замена: ${substitute}` : TEACHER_TEXT[code] ?? text;
  }
  if (code === "day_off_voided") {
    const starts = startsAtMsOf(item);
    // without the instant of the start the day decides (a lesson of a later day is still ahead)
    const ahead = starts !== null ? starts > nowMs : (item.lesson?.date ?? "") > formatBusinessDate(new Date(nowMs));
    tone = ahead ? "warn" : "muted";
  }
  return { code, text, tone };
}

/** One quiet phrase under «Сейчас» in the panel for a result that needs one; null for the rest. */
export function outcomeNote(item: Pick<SubstitutionItem, "outcome">): string | null {
  switch (item.outcome) {
    case "not_resolved_in_time": return "Запрос не решён до начала урока.";
    case "lesson_started": return "Урок начался, пока запрос ждал решения.";
    case "day_off_voided": return "Выходной отменён, замена не вернулась. Назначьте её заново.";
    default: return null;
  }
}

// ── the author ─────────────────────────────────────────────────────────────────────────────────────

/** `owner` -> «владелец», `admin` -> «администратор»; any other role or none -> null (the person is no longer in the centre or it is not known: no guess, LESSONS 17). */
export function managerRoleWord(role: string | null | undefined): "владелец" | "администратор" | null {
  return role === "owner" ? "владелец" : role === "admin" ? "администратор" : null;
}

/** Who acts in an event: a teacher (his own request, withdrawal, «Урока не было», a move of his own) or a manager (a decision, a cancellation, a taking off, a return). */
export type ActionKind = "teacher" | "manager";

/**
 * «Фамилия И., роль» for a manager («Тестов О., владелец»; «Каримова Н.» when the role is not known), «Фамилия И., преподаватель» for a teacher.
 * A teacher reading his own history gets the role alone («Администратор», «Владелец») - another person's name never reaches him; his own action is «Вы».
 * Null when there is nobody to name (the system) or nothing is known.
 */
export function authorLine(actor: EventActor | MaskedPersonRef | null | undefined, kind: ActionKind, audience: Audience): string | null {
  if (!actor) return null;
  const name = (actor.name ?? "").trim();
  if (audience === "teacher") {
    if (kind === "teacher") return actor.role === "teacher" || !actor.role ? "Вы" : null;
    const word = managerRoleWord(actor.role);
    return word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : null;
  }
  const role = kind === "teacher" ? "преподаватель" : managerRoleWord(actor.role);
  return [name, role].filter(Boolean).join(", ") || null;
}

// ── the row ────────────────────────────────────────────────────────────────────────────────────────

/** A record the system made after an action nobody asked for: «без запроса». */
export const NO_REQUEST_BADGE = "без запроса";
/** A request the system reopened (the substitute left, the day off was voided, ...): «открыт заново». */
export const REOPENED_BADGE = "открыт заново";

/** The quiet badge of a row: «без запроса» (an action of an administrator or a teacher), «открыт заново» (reopened by the system); null for a request of a teacher. */
export function originBadge(item: Pick<SubstitutionItem, "origin" | "trigger">): string | null {
  if (item.origin !== "system") return null;
  return item.trigger ? NO_REQUEST_BADGE : REOPENED_BADGE;
}

/** The reason as a short label - for a request of a teacher only («Болезнь», «Личное», «Другое»); a record without a request has no reason. */
export function reasonShort(item: Pick<SubstitutionItem, "origin" | "reasonCode" | "reasonLabel">): string | null {
  if (item.origin === "system") return null;
  return (item.reasonLabel || reasonLabelOf(item.reasonCode)) || null;
}

/** «28.10 12:24»: the moment of the last event of the row (the column «Когда»); the decision or the creation when the server did not send it. */
export function lastActivityLabel(item: Pick<SubstitutionItem, "lastActivityAt" | "decision" | "createdAt">): string {
  return shortWhen(item.lastActivityAt ?? item.decision?.at ?? item.createdAt);
}

/** «28.10, 12:24» (the time of an event in the panel). */
export function eventMoment(at: string | null | undefined): string {
  return shortWhen(at).replace(" ", ", ");
}

/**
 * «Кто → кто» of a row: the teacher, and under him the one who took the lesson («Петров Б.»: a substitution, also after it was taken off - it is what the row decided)
 * or the new time of a moved lesson («чт, 29.10, 16:00»); null when there is nothing under the teacher (a cancellation, a rejection, a closing).
 */
export function peopleOf(item: Pick<SubstitutionItem, "teacher" | "decision" | "status">): { teacher: string; to: string | null } {
  const teacher = (item.teacher?.name ?? "").trim();
  const decision = item.decision;
  if (item.status === "rescheduled" && decision?.movedTo) return { teacher, to: movedToLabel(decision.movedTo) };
  const substitute = (decision?.substitute?.name ?? "").trim();
  return { teacher, to: substitute || null };
}
