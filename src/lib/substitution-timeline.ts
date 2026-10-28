/**
 * #157: the history of a row for the panel «Подробнее» - the events of the whole chain (`detail.events`) as lines: when, what, who.
 * The words are those of `analysis/substitutions-page-ux.md` §5.4; every action of `P157_API.md` §4 has its line, an unknown action has none
 * (a line of an unknown event would be a technical word on the screen, LESSONS 1.1 / 46).  An author is «Фамилия И., роль»; the role comes from the KIND of
 * the action, never by default (LESSONS 17).  Pure functions: no React and no network.
 */
import { CLOSED_REASON_TEXT, movedToLabel, reasonLabelOf, suggestedLine } from "./substitutions";
import { authorLine, eventMoment, type ActionKind, type Audience } from "./substitution-outcome";
import type { ClosedReasonCode, SubstitutionDetailOut, SubstitutionEvent, SubstitutionItem } from "./substitution-types";

export interface TimelineRow {
  key: string;
  requestId: string;
  action: string;
  /** Naive UTC, as the server sent it (`<time dateTime>` and the sort keep it). */
  at: string | null;
  /** «28.10, 12:10» on the clock of the centre. */
  when: string;
  title: string;
  /** Quiet lines under the title (the reason, the comment, who with whom). */
  details: string[];
  /** «Фамилия И., роль» (a teacher reads «Вы» / «Администратор»); null for the system. */
  author: string | null;
  /** The record the line leads to («Открыт новый запрос ›», «Заменена на …›»). */
  openRequestId: string | null;
}

export interface Timeline {
  rows: TimelineRow[];
  /** The chain or the events were longer than the limits: the panel says so. */
  truncated: boolean;
}

export const TRUNCATED_TEXT = "Показаны последние записи";

const CLEARED_WHY: Record<string, string> = {
  cancel: "урок отменён",
  move: "урок перенесён",
  member_removed: "заменяющий больше не работает в центре",
  role_changed: "роль заменяющего изменена, он больше не ведёт уроки",
  group_teacher_changed: "заменяющий стал преподавателем группы",
  schedule_changed: "расписание изменено",
  schedule_ended: "занятия по расписанию закончились",
};

/** The kind of a cancellation in a line of the history (the manager only: a student's money; the server does not send it to a teacher). */
function kindLabel(kind: unknown): string | null {
  return kind === "centre" ? "по вине центра" : kind === "holiday" ? "праздник" : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function movedLabelOf(value: unknown): string | null {
  const moved = value && typeof value === "object" ? value as { date?: unknown; startTime?: unknown } : null;
  return moved && typeof moved.date === "string" && typeof moved.startTime === "string" ? movedToLabel({ date: moved.date, startTime: moved.startTime }) : null;
}

/** «Выходной отменён: …» - by what the server says of the event (`subject`, `reopened`, `needsDecision`); nothing is guessed from the status of the record. */
export function dayOffVoidedTitle(snapshot: Record<string, unknown>): string {
  const needs = snapshot.needsDecision === true;
  if (snapshot.subject === "request") return snapshot.reopened === true ? `Выходной отменён: запрос открыт заново${needs ? " — нужно решение" : ""}` : "Выходной отменён: урок вернулся";
  if (snapshot.subject === "substitution") return needs ? "Выходной отменён: замена не вернулась — назначьте заново" : "Выходной отменён: замена не вернулась";
  return "Выходной отменён";
}

/** The last `day_off_voided` of the open row says whether a decision is needed (the chip of the panel is yellow only then); null when there is no such event. */
export function dayOffNeedsDecision(out: Pick<SubstitutionDetailOut, "item" | "events">): boolean | null {
  const events = (out.events ?? []).filter((event) => event.action === "day_off_voided" && (event.requestId ?? out.item.id) === out.item.id);
  const last = events[events.length - 1];
  return last ? last.snapshot?.needsDecision === true : null;
}

function closedWhy(code: string): string {
  return CLOSED_REASON_TEXT[code as ClosedReasonCode] ?? "Запрос закрыт";
}

/** «Урока не было» of a teacher: the record's trigger or the way it was decided (the chip and the history must say the same). */
export function isTeacherCancel(record: Pick<SubstitutionItem, "trigger" | "decision">): boolean {
  return record.trigger === "teacher_cancel" || record.decision?.via === "teacher_cancel";
}

/** Who acts in an event: the teacher for his own request / withdrawal / «Урока не было» / move of his own / one-off lesson, otherwise a manager. */
export function actionKindOf(event: SubstitutionEvent, record: Pick<SubstitutionItem, "origin" | "trigger" | "decision">): ActionKind {
  const snapshot = event.snapshot ?? {};
  switch (event.action) {
    case "requested":
    case "withdrawn":
      return "teacher";
    case "rescheduled":
      return snapshot.via === "teacher_move" ? "teacher" : "manager";
    case "cancelled":
      return isTeacherCancel(record) ? "teacher" : "manager";
    case "closed":
      return snapshot.trigger === "teacher_one_off" ? "teacher" : "manager";
    default:
      return "manager";
  }
}

interface Line { title: string; details?: string[]; openRequestId?: string | null; author?: boolean }

function lineOf(event: SubstitutionEvent, record: SubstitutionItem, current: SubstitutionItem, records: Map<string, SubstitutionItem>): Line | null {
  const snapshot = event.snapshot ?? {};
  const reason = text(snapshot.reason);
  switch (event.action) {
    case "requested": {
      // the action itself is the first line of a record made without a request: there is no «запрос» to show
      if (text(snapshot.trigger)) return null;
      // the reason and the comment of the OPEN row are the facts of the head of the panel: not said twice (LESSONS 0.5); the request of another record of the chain says them
      const label = reasonLabelOf(text(snapshot.reasonCode) || record.reasonCode);
      const comment = text(record.comment);
      const reasonLine = record.id === current.id ? "" : [label, comment ? `«${comment}»` : ""].filter(Boolean).join(" · ");
      return { title: "Запрос на замену", details: [reasonLine, suggestedLine(record) ?? ""].filter(Boolean) };
    }
    case "reopened": {
      const successor = record.id !== current.id;
      return { title: successor ? "Открыт новый запрос" : "Открыт заново", details: [text(record.comment)].filter(Boolean), openRequestId: successor ? record.id : null, author: false };
    }
    case "substituted": {
      const from = text(record.teacher?.name);
      const to = text(event.substituteName) || text(record.decision?.substitute?.name);
      const withoutRequest = record.origin === "system" && Boolean(record.trigger);
      return { title: withoutRequest ? "Замена назначена без запроса" : "Замена назначена", details: [from && to ? `${from} → ${to}` : to].filter(Boolean) };
    }
    case "rescheduled": {
      const where = movedLabelOf(snapshot.movedTo);
      return { title: where ? `Урок перенесён на ${where}` : "Урок перенесён", details: [reason].filter(Boolean) };
    }
    case "cancelled":
      return { title: isTeacherCancel(record) ? "Урока не было" : "Урок отменён", details: [reason, kindLabel(snapshot.cancellationKind) ?? ""].filter(Boolean) };
    case "rejected":
      return { title: "Запрос отклонён", details: [reason].filter(Boolean) };
    case "withdrawn":
      return { title: "Запрос отозван" };
    case "assignment_cleared": {
      const trigger = text(snapshot.trigger);
      const pair = Array.isArray(snapshot.teacherId) ? snapshot.teacherId : [];
      const merged = event.mergedRequestId ? records.get(event.mergedRequestId) : undefined;
      // who took the lesson: the record keeps the last one (`clearedTo`); the merged half knows it too
      const toName = text(event.substituteName) || text(merged?.decision?.substitute?.name) || (record.clearedTo && record.clearedTo.id === pair[1] ? text(record.clearedTo.name) : "");
      const openRequestId = event.mergedRequestId ?? null;
      if (snapshot.byDayOff) return { title: "Замена снята: урок отменён выходным днём", openRequestId };
      // a pair the server merged (the lesson sheet replaced the substitution) is «Новая замена»; a replacement without the pair is «Заменена на …»
      if (pair[1] || toName) {
        if (event.mergedRequestId) return { title: toName ? `Новая замена: ${toName}` : "Новая замена", openRequestId };
        return { title: toName ? `Заменена на ${toName}` : "Заменена другим", openRequestId };
      }
      if (trigger === "put") return { title: "Замена снята: урок снова ведёт основной преподаватель", openRequestId };
      return { title: CLEARED_WHY[trigger] ? `Замена снята: ${CLEARED_WHY[trigger]}` : "Замена снята", openRequestId };
    }
    case "closed": {
      const code = text(snapshot.closedReason);
      const trigger = text(snapshot.trigger);
      if (code === "KIND_CHANGED") {
        const change = snapshot.cancellationKind && typeof snapshot.cancellationKind === "object" ? snapshot.cancellationKind as { from?: unknown; to?: unknown } : null;
        const was = kindLabel(change?.from);
        const now = kindLabel(change?.to);
        return { title: "Вид отмены изменён", details: [was && now ? `было: ${was}, стало: ${now}` : "", reason].filter(Boolean) };
      }
      if (code === "LESSON_RESTORED") return { title: "Урок возвращён", details: [reason].filter(Boolean) };
      if (code === "ONE_OFF_ADDED") return { title: "Разовый урок добавлен" };
      if (code === "LESSON_CANCELLED" && (trigger === "day_off" || trigger === "day_off_void")) return { title: "Запрос закрыт: урок отменён выходным днём" };
      // the text of this closing is the server's, built for the viewer («Запрос закрыт: группу передали другому преподавателю» / «Группу передали: Имя Ф.»): nothing is added to it
      if (code === "GROUP_TEACHER_CHANGED" && text(record.decision?.closedReasonText)) return { title: text(record.decision?.closedReasonText) };
      return { title: "Запрос закрыт", details: [closedWhy(code)] };
    }
    case "suggestion_unavailable":
      return { title: "Предложенный коллега больше не ведёт уроки", author: false };
    case "lesson_restored":
      return { title: "Урок возвращён", details: [reason].filter(Boolean) };
    case "day_off_voided":
      return { title: dayOffVoidedTitle(snapshot) };
    default:
      return null;
  }
}

/**
 * «Вернуть урок»: the server merges the two halves itself (`lesson_restored` of the original record carries `mergedRequestId` = the record of the return; the `closed` of that record is not sent).
 * This is only a guard against a second «Урок возвращён» if one comes anyway: the `closed` record that a `lesson_restored` names is dropped (its reason goes to the kept line). No guess by time.
 */
export function withoutRestoreDuplicates(events: readonly SubstitutionEvent[]): SubstitutionEvent[] {
  const named = new Map<string, SubstitutionEvent>();
  for (const event of events) if (event.action === "lesson_restored" && event.mergedRequestId) named.set(event.mergedRequestId, event);
  if (named.size === 0) return [...events];
  const dropped = new Map<SubstitutionEvent, SubstitutionEvent>();
  const kept = events.filter((event) => {
    const first = event.action === "closed" && text(event.snapshot?.closedReason) === "LESSON_RESTORED" ? named.get(event.requestId ?? "") : undefined;
    if (!first) return true;
    dropped.set(first, event);
    return false;
  });
  return kept.map((event) => {
    const closed = dropped.get(event);
    const reason = text(closed?.snapshot?.reason);
    return closed && reason && !text(event.snapshot?.reason) ? { ...event, snapshot: { ...(event.snapshot ?? {}), reason } } : event;
  });
}

/**
 * The lines of the panel, by time.  `detail.events` already come in the order of the server (time, place in the chain, id): this function keeps it.
 * Without `events` (an answer of an action, a list item) the history is empty - the panel reads the detail itself.
 */
export function timelineOf(out: SubstitutionDetailOut, audience: Audience): Timeline {
  const records = new Map<string, SubstitutionItem>();
  for (const record of [...(out.chain ?? []), ...(out.next ?? []), out.item]) records.set(record.id, record);
  const rows: TimelineRow[] = [];
  const events = withoutRestoreDuplicates(out.events ?? []);
  events.forEach((event, index) => {
    const record = records.get(event.requestId ?? out.item.id) ?? out.item;
    const line = lineOf(event, record, out.item, records);
    if (!line) return;
    rows.push({
      key: `${event.requestId ?? out.item.id}:${event.action}:${event.at ?? ""}:${index}`,
      requestId: event.requestId ?? out.item.id,
      action: event.action,
      at: event.at ?? null,
      when: eventMoment(event.at),
      title: line.title,
      details: line.details ?? [],
      author: line.author === false ? null : authorLine(event.actor, actionKindOf(event, record), audience),
      openRequestId: line.openRequestId ?? null,
    });
  });
  return { rows, truncated: Boolean(out.truncated) };
}
