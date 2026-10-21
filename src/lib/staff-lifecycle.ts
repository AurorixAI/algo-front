/**
 * O2 / O10 (LOGIC-B): removing a member, handing his groups over, bringing him back; the invitations.
 * Pure helpers behind the «Сотрудники» screen: what the removal dialog says and when it may send,
 * who a group can be handed to, the state and the wording of an invitation.
 */
import { formatUtcNaiveAsBusinessDayTime, parseUtcNaive } from "./business-time";
import { dayAndDateLabel, opsErrorCode, opsErrorDetail, teacherConflictLines } from "./ops-errors";
import type {
  HandoverAssignment,
  HandoverBody,
  InvitationRow,
  OrgMemberRow,
  RemovalImpact,
  TeacherBusyDetail,
  TeacherConflict,
} from "./ops-b-types";
import { pluralRu } from "./plural";
import { staffDisplayName } from "./staff-name";

// ── removal dialog ──────────────────────────────────────────────────────────────────────────────

export const UNASSIGNED = "__unassigned__";

export const KEEP_UNASSIGNED_LABEL = "Оставить без преподавателя";
export const UNASSIGNED_CONFIRM_TEXT = "Я понимаю: у уроков этой группы не будет преподавателя";

export function removeConfirmText(name: string): string {
  return `Удалить сотрудника «${name}»? Он потеряет доступ в систему. Вернуть можно в разделе «Бывшие сотрудники».`;
}

export function groupsBlockTitle(): string {
  return "У сотрудника есть группы";
}

export function groupsBlockText(name: string, groupCount: number): string {
  return `Чтобы удалить «${name}», сначала передайте его группы другому преподавателю (${groupCount} гр.).`;
}

export function roleChangeBlockText(name: string, groupCount: number): string {
  return `Чтобы изменить роль «${name}», сначала передайте его группы другому преподавателю (${groupCount} гр.).`;
}

export function inProgressText(groupName: string): string {
  return `Сейчас идёт урок «${groupName}». Завершите или отмените его, затем повторите.`;
}

export function futureSubstitutionsText(count: number): string {
  return `Будущие замены этого сотрудника (${count}) будут сняты: уроки вернутся преподавателям групп.`;
}

export function missedLessonsText(count: number): string {
  return `Пропущенных уроков: ${count}. Их разберёт администратор.`;
}

/** «У {имя} уже есть урок «{группа}» {день} {начало}–{конец}. Выберите другого преподавателя.» */
export function handoverConflictText(teacherName: string, conflict: TeacherConflict): string {
  return `У ${teacherName} уже есть урок «${conflict.withGroupName}» ${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}. Выберите другого преподавателя.`;
}

/** One line per group whose new teacher is busy (the first clash of each group; `groupId` of a conflict is the group handed over). */
export function handoverConflictLines(
  detail: TeacherBusyDetail | null,
  teacherOfGroup: (groupId: string) => string | null,
): Array<{ groupId: string; text: string }> {
  const seen = new Set<string>();
  const lines: Array<{ groupId: string; text: string }> = [];
  for (const conflict of detail?.conflicts ?? []) {
    if (seen.has(conflict.groupId)) continue;
    seen.add(conflict.groupId);
    const teacher = teacherOfGroup(conflict.groupId);
    lines.push({
      groupId: conflict.groupId,
      text: teacher ? handoverConflictText(teacher, conflict) : `${teacherConflictLines({ conflicts: [conflict] } as TeacherBusyDetail, 1)[0]}. Выберите другого преподавателя.`,
    });
  }
  return lines;
}

/** `MEMBER_HAS_ASSIGNMENTS` carries the impact at the top of `detail`: read it as a `RemovalImpact`. */
export function impactFromRefusal(error: unknown, memberId: string): RemovalImpact | null {
  if (opsErrorCode(error) !== "MEMBER_HAS_ASSIGNMENTS") return null;
  const detail = opsErrorDetail(error) as Record<string, unknown> | null;
  if (!detail) return null;
  const nested = detail.removal as Partial<RemovalImpact> | undefined;
  const source = (nested && typeof nested === "object" ? { ...detail, ...nested } : detail) as Partial<RemovalImpact>;
  return {
    memberId: String(source.memberId ?? memberId),
    userId: source.userId,
    name: source.name ?? null,
    orgRole: source.orgRole,
    canRemove: false,
    groups: source.groups ?? [],
    inProgressLessons: source.inProgressLessons ?? [],
    futureSubstitutions: source.futureSubstitutions ?? { count: 0 },
    missedLessons: source.missedLessons ?? { count: 0 },
  };
}

export interface HandoverChoice {
  /** teacher user id, `UNASSIGNED`, or "" when nothing is chosen yet */
  value: string;
  /** the checkbox «Я понимаю…» of a group left without a teacher */
  confirmed: boolean;
}

export type HandoverChoices = Record<string, HandoverChoice>;

export function emptyChoices(groupIds: string[]): HandoverChoices {
  return Object.fromEntries(groupIds.map((id) => [id, { value: "", confirmed: false }]));
}

/** «Передать всем»: the same teacher for every group (a group the choice cannot serve keeps its own). */
export function applyToAll(choices: HandoverChoices, value: string): HandoverChoices {
  return Object.fromEntries(Object.entries(choices).map(([id, choice]) => [
    id,
    { value, confirmed: value === UNASSIGNED ? choice.confirmed : false },
  ]));
}

/** True when every group has a teacher chosen, or «без преподавателя» with its checkbox ticked. */
export function canSubmitHandover(impact: RemovalImpact, choices: HandoverChoices): boolean {
  const groups = impact.groups ?? [];
  if (groups.length === 0) return false;
  if ((impact.inProgressLessons ?? []).length > 0) return false;
  return groups.every((group) => {
    const choice = choices[group.id];
    if (!choice || !choice.value) return false;
    return choice.value !== UNASSIGNED || choice.confirmed;
  });
}

export function buildHandoverBody(impact: RemovalImpact, choices: HandoverChoices): HandoverBody {
  const assignments: HandoverAssignment[] = (impact.groups ?? []).map((group) => {
    const value = choices[group.id]?.value ?? "";
    return { groupId: group.id, teacherId: value === UNASSIGNED || !value ? null : value };
  });
  return { assignments, confirmUnassigned: assignments.some((assignment) => assignment.teacherId === null) };
}

/** Who a group may be handed to: active teachers other than the one who leaves, by name. */
export function handoverTargets(members: OrgMemberRow[], leavingUserId: string | undefined): Array<{ id: string; name: string }> {
  return members
    .filter((member) => member.org_role === "teacher" && member.is_active !== false && (member.user_id || member.id) !== leavingUserId)
    .map((member) => ({
      id: member.user_id || member.id,
      name: staffDisplayName(member, member.email),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

// ── former members ──────────────────────────────────────────────────────────────────────────────

export const RESTORE_TITLE = "Вернуть в команду";

export function restoreConfirmText(name: string): string {
  return `Вернуть «${name}» в команду? Группы ему не вернутся — передайте их вручную.`;
}

/** «Удалён 21.10.2026»: the day of the removal on the Tashkent calendar ("" when the server sent none). */
export function removedOnText(removedAt: string | null | undefined): string {
  const label = formatUtcNaiveAsBusinessDayTime(removedAt, { day: "2-digit", month: "2-digit", year: "numeric" });
  return label ? `Удалён ${label}` : "Удалён";
}

// ── invitations (O10) ───────────────────────────────────────────────────────────────────────────

export const INVITE_ADMIN_HINT = "Приглашать администраторов может только владелец.";
export const INVITE_EMAIL_REQUIRED_TEXT = "Укажите email: приглашение выдаётся на него.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** null when the e-mail may be sent; else the sentence under the field. */
export function inviteEmailError(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email) return INVITE_EMAIL_REQUIRED_TEXT;
  if (!EMAIL_PATTERN.test(email)) return "Проверьте email: он записан неверно.";
  return null;
}

/** The state an invitation is shown in: the server turns the lapsed ones into `expired` itself, but a list read a minute ago may lag. */
export function inviteState(invitation: Pick<InvitationRow, "status" | "expires_at">, now = new Date()): "pending" | "expired" | "accepted" | "cancelled" {
  const status = invitation.status;
  if (status === "accepted" || status === "cancelled" || status === "expired") return status;
  const until = parseUtcNaive(invitation.expires_at);
  if (until && until.getTime() <= now.getTime()) return "expired";
  return "pending";
}

/** «Действует до 28.10, 14:00» - the expiry on the Tashkent clock (the server sends UTC, naive or with `+00:00`). */
export function inviteValidUntilText(expiresAt: string | null | undefined): string {
  const label = formatUtcNaiveAsBusinessDayTime(expiresAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // ru-RU prints «28.10, 14:00»
  return label ? `Действует до ${label}` : "";
}

export const INVITE_EXPIRED_BADGE = "Истекло";
export const INVITE_AGAIN_LABEL = "Пригласить заново";

/** Lists on the invitations tab: those that act first (soonest to lapse first), then the expired ones. */
export function sortInvitations(rows: InvitationRow[], now = new Date()): InvitationRow[] {
  const rank = (row: InvitationRow) => (inviteState(row, now) === "pending" ? 0 : 1);
  return rows
    .filter((row) => {
      const state = inviteState(row, now);
      return state === "pending" || state === "expired";
    })
    .sort((a, b) => rank(a) - rank(b) || String(a.expires_at).localeCompare(String(b.expires_at)));
}

/** The refusals of «Пригласить» in the words of the spec; the server text for the others. */
export function inviteErrorText(error: unknown, fallback = "Не удалось создать приглашение"): string {
  switch (opsErrorCode(error)) {
    case "EMAIL_REQUIRED": return INVITE_EMAIL_REQUIRED_TEXT;
    case "ONLY_OWNER_INVITES_ADMIN": return INVITE_ADMIN_HINT;
    case "ALREADY_MEMBER": return "Этот email уже работает в центре";
    default: return (error instanceof Error && error.message.trim()) || fallback;
  }
}

/** Count of the tabs: «Сотрудники (3)» etc. */
export function membersTabCount(active: number): string {
  return `Сотрудники (${active})`;
}

export function groupsCountText(count: number): string {
  return `${count} ${pluralRu(count, ["группа", "группы", "групп"])}`;
}
