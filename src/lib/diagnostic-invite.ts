/**
 * Statuses of a diagnostic invite.  Besides the four of its life it can be «expired» (its time passed) and
 * «cancelled» (the centre switched it off - today: the student went to the archive).  A cancelled invite is
 * never waiting, never running and never done; it is only history with a reason.
 * Pure: no React and no network, so node:test can load this file.
 */
import { formatUtcNaiveAsBusinessDate } from "./business-time";

export type DiagnosticInviteStatus = "pending" | "confirmed" | "in_progress" | "completed" | "expired" | "cancelled";

/** `cancel_reason` of an invite cancelled by archiving the student. */
export const CANCEL_REASON_STUDENT_ARCHIVED = "student_archived";

/** Short label of the status in lists and badges; agrees with its siblings «Завершён» / «Истёк». */
export const INVITE_CANCELLED_LABEL = "Отменён";
/** What the student reads on the public page (the server's own text, kept for a server that sends none). */
export const INVITE_CANCELLED_MESSAGE = "Приглашение отменено";
/** Under the message: only the centre can help. */
export const INVITE_CANCELLED_CENTER_HINT = "Эта ссылка больше не действует. Обратитесь в учебный центр.";
/** Code of the 410 of diagnostic-service (and of the `detail` object it carries). */
export const INVITE_CANCELLED_CODE = "INVITE_CANCELLED";

export function isInviteCancelled(status: string | null | undefined): boolean {
  return status === "cancelled";
}

/** pending / confirmed: the student has not started yet.  The «Ожидают старта» counter counts exactly these. */
export function isInviteWaiting(status: string | null | undefined): boolean {
  return status === "pending" || status === "confirmed";
}

export function isInviteRunning(status: string | null | undefined): boolean {
  return status === "in_progress";
}

/**
 * «Зачислен» / «Зачислены» is about the student, not the invite: any invite of a student who is in a group counts,
 * except a cancelled one, which keeps its own status and is never listed as enrolled.
 */
export function isInviteAssigned(invite: {
  status?: string | null;
  is_assigned?: boolean | null;
  group_id?: string | null;
  student_status?: string | null;
}): boolean {
  return !isInviteCancelled(invite.status) && Boolean(invite.is_assigned || invite.group_id || invite.student_status === "active");
}

/** An invite that can no longer be used and will never be finished: cancelled or expired (neutral colours). */
export function isInviteDead(status: string | null | undefined): boolean {
  return status === "cancelled" || status === "expired";
}

/**
 * «ученик в архиве · 17.10.2026»: why and when (the business date of `cancelled_at`).  A reason we do not know
 * is not guessed, the date alone stays; "" when the invite is not cancelled or says nothing.
 */
export function inviteCancelHint(invite: { status?: string | null; cancel_reason?: string | null; cancelled_at?: string | null }): string {
  if (!isInviteCancelled(invite.status)) return "";
  const parts: string[] = [];
  if (invite.cancel_reason === CANCEL_REASON_STUDENT_ARCHIVED) parts.push("ученик в архиве");
  const date = formatUtcNaiveAsBusinessDate(invite.cancelled_at);
  if (date) parts.push(date);
  return parts.join(" · ");
}

/** The badge on the student card (his diagnostics list) for an invite that is not done. */
export function studentCardInviteLabel(status: string | null | undefined): string {
  if (status === "in_progress") return "В процессе";
  if (status === "cancelled") return INVITE_CANCELLED_LABEL;
  if (status === "expired") return "Истёк";
  return "Ожидает прохождения";
}

/**
 * Does the entry page end on «Приглашение отменено»?  A cancelled invite is not closed at once: a session that started
 * BEFORE the cancellation may finish (diagnostic-service decides - `GET /sessions/by-invite` answers it or refuses), so
 * the page asks.  It ends cancelled when the service says so (410 `INVITE_CANCELLED`) or when there is nothing to
 * resume (403 / 404 / 410 for an invite the auth-service reports as cancelled).  Anything else (a network error, a
 * 5xx, a 429) is a failure to ask, not an answer: the page offers to check again.
 */
export function inviteEndsCancelled(inviteStatus: string | null | undefined, error: unknown): boolean {
  if (isInviteCancelledError(error)) return true;
  if (!isInviteCancelled(inviteStatus)) return false;
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return status === 403 || status === 404 || status === 410;
}

/** The 410 `INVITE_CANCELLED` of the public diagnostic paths (an `ApiError` carries it as `code`). */
export function isInviteCancelledError(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === INVITE_CANCELLED_CODE;
}
