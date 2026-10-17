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

/** Short label of the status in lists and badges. */
export const INVITE_CANCELLED_LABEL = "Отменено";
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

/** The 410 `INVITE_CANCELLED` of the public diagnostic paths (an `ApiError` carries it as `code`). */
export function isInviteCancelledError(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === INVITE_CANCELLED_CODE;
}
