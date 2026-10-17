/**
 * «Ученик ушёл из центра»: archive a student and bring him back.
 * Pure: no React and no network, so node:test can load this file.
 *
 * The server owns the rules (a student in the archive has no active membership, the old groups are
 * offered back by `archived_groups`, a full or archived group is skipped with a reason).  This file
 * only turns those answers into what the owner reads and clicks.
 */
import { formatUtcNaiveAsBusinessDate } from "./business-time";

/** The server accepts a reason of up to this many characters. */
export const ARCHIVE_REASON_MAX = 300;

/** Toast after a successful archiving. */
export const ARCHIVED_TOAST = "Ученик в архиве";
/** Toast after a successful return (no group skipped). */
export const RESTORED_TOAST = "Ученик возвращён из архива";
/** The line of the archive dialog about what stays. */
export const ARCHIVE_KEEPS_NOTE = "История уроков, оплат и квитанций сохранится";

export function isArchivedStatus(status: string | null | undefined): boolean {
  return status === "archived";
}

// ── who may do what ───────────────────────────────────────────────────────

export interface StudentArchiveAccess {
  /** «⋯» → «В архив» in the header. */
  canArchive: boolean;
  /** «Вернуть из архива» in the banner. */
  canRestore: boolean;
  /** The «В архиве с …» banner (information only for a role that cannot restore). */
  showBanner: boolean;
  /** «Добавить в группу», «Перевести», «Зачислить в группу». */
  groupActions: boolean;
  /** «Внести», «Продлить», fee and payment corrections: the archived card shows the history only. */
  paymentActions: boolean;
}

/**
 * Owner and administrator archive and restore; a teacher gets nothing new (the server never gives him
 * an archived student).  While a student is archived the group and payment actions are hidden for everyone.
 * The public demo has no archive endpoints: `demo` hides «В архив» / «Вернуть из архива» there (like payments).
 */
export function studentArchiveAccess(input: { isTeacher: boolean; status: string | null | undefined; demo?: boolean }): StudentArchiveAccess {
  const archived = isArchivedStatus(input.status);
  const staff = !input.isTeacher;
  const live = !input.demo;
  return {
    canArchive: staff && live && !archived,
    canRestore: staff && live && archived,
    showBanner: archived,
    groupActions: staff && !archived,
    paymentActions: staff && !archived,
  };
}

// ── archiving ──────────────────────────────────────────────────────────────

/** Trimmed reason, or undefined when blank (the server's field is optional). */
export function normalizeArchiveReason(raw: string | null | undefined): string | undefined {
  const text = (raw ?? "").trim();
  return text ? text : undefined;
}

/** null when the reason fits; otherwise the line to show under the field. */
export function validateArchiveReason(raw: string | null | undefined): string | null {
  const text = normalizeArchiveReason(raw);
  return text && text.length > ARCHIVE_REASON_MAX ? `Причина не длиннее ${ARCHIVE_REASON_MAX} символов` : null;
}

/** «12 / 300». */
export function archiveReasonCounter(raw: string | null | undefined): string {
  return `${(raw ?? "").length} / ${ARCHIVE_REASON_MAX}`;
}

/** «Он будет убран из групп:» for several, «…из группы:» for one, or the line for a student without groups. */
export function archiveGroupsHeading(count: number): string {
  if (count <= 0) return "Ученик не состоит ни в одной группе — будет только перенесён в архив.";
  return count === 1 ? "Он будет убран из группы:" : "Он будет убран из групп:";
}

/** Names of the groups the dialog lists, in the order of the card, without blanks and repeats. */
export function archiveGroupNames(memberships: ReadonlyArray<{ group_name?: string | null }> | null | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of memberships ?? []) {
    const name = (item.group_name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

// ── the archived card ─────────────────────────────────────────────────────

export interface ArchivedGroupLike {
  group_id: string;
  group_name: string;
  group_status?: string | null;
  is_full?: boolean | null;
}

/** The part of the profile the banner reads: `student.archived_at` (ISO, naive UTC) and `student.archive_reason`. */
export interface ArchiveInfoSource {
  student?: { archived_at?: string | null; archive_reason?: string | null } | null;
}

/**
 * When and why the student went to the archive, as the server stamped it.  No date (an old archived
 * student, or a server that does not send it) means no date: the banner then says only «В архиве».
 */
export function studentArchiveInfo(source: ArchiveInfoSource | null | undefined): { archivedAt: string; reason: string } {
  const archivedAt = source?.student?.archived_at;
  const reason = source?.student?.archive_reason;
  return {
    archivedAt: typeof archivedAt === "string" ? archivedAt.trim() : "",
    reason: typeof reason === "string" ? reason.trim() : "",
  };
}

/** «В архиве с 14.10.2026»; without a date just «В архиве». */
export function archiveBannerTitle(archivedAt: string | null | undefined): string {
  const date = formatUtcNaiveAsBusinessDate(archivedAt);
  return date ? `В архиве с ${date}` : "В архиве";
}

// ── returning ─────────────────────────────────────────────────────────────

/** Why a group cannot take the student back; empty when it can.  A missing status is not a block (the server decides). */
export function restoreBlockedNote(group: ArchivedGroupLike): string {
  if (typeof group.group_status === "string" && group.group_status !== "active") return "группа в архиве";
  if (group.is_full) return "группа заполнена";
  return "";
}

export interface RestoreOption {
  groupId: string;
  name: string;
  disabled: boolean;
  /** «группа в архиве» / «группа заполнена»; empty for a group that can be chosen. */
  note: string;
}

/** One row of the dialog per former group (a repeated id is shown once). */
export function restoreOptions(groups: ReadonlyArray<ArchivedGroupLike> | null | undefined): RestoreOption[] {
  const seen = new Set<string>();
  const options: RestoreOption[] = [];
  for (const group of groups ?? []) {
    if (!group.group_id || seen.has(group.group_id)) continue;
    seen.add(group.group_id);
    const note = restoreBlockedNote(group);
    options.push({ groupId: group.group_id, name: (group.group_name ?? "").trim() || "Группа", disabled: note !== "", note });
  }
  return options;
}

/** Every group that can take him back is ticked at the start. */
export function defaultRestoreSelection(options: ReadonlyArray<RestoreOption>): string[] {
  return options.filter((option) => !option.disabled).map((option) => option.groupId);
}

/** Tick / untick one group; a disabled or unknown group never changes the selection. */
export function toggleRestoreGroup(selected: ReadonlyArray<string>, options: ReadonlyArray<RestoreOption>, groupId: string): string[] {
  const option = options.find((item) => item.groupId === groupId);
  if (!option || option.disabled) return [...selected];
  return selected.includes(groupId) ? selected.filter((id) => id !== groupId) : [...selected, groupId];
}

/** The ids sent to the server: only ticked, choosable groups, in the order of the dialog. */
export function restoreGroupIds(selected: ReadonlyArray<string>, options: ReadonlyArray<RestoreOption>): string[] {
  const ticked = new Set(selected);
  return options.filter((option) => !option.disabled && ticked.has(option.groupId)).map((option) => option.groupId);
}

/** Line under the list: what the button will do. */
export function restoreSummary(selectedCount: number, optionCount: number): string {
  if (optionCount === 0) return "Прежних групп нет: ученик вернётся без группы, зачислить его можно позже.";
  if (selectedCount === 0) return "Группы не выбраны: ученик вернётся без группы.";
  return selectedCount === 1 ? "Ученик вернётся в 1 группу." : `Ученик вернётся в группы: ${selectedCount}.`;
}

/**
 * The reason code of a skipped group in words.  Only a fallback: the server sends the Russian `message`
 * with every skipped group, and that is what the owner reads.
 */
export function skipReasonLabel(reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  switch (text) {
    case "group_full": return "группа заполнена";
    case "group_archived": return "группа в архиве";
    case "not_found": return "группа не найдена";
    case "lesson_in_progress": return "в группе идёт урок";
    case "busy": return "ученика одновременно меняли в другом окне";
    case "refused": return "не удалось вернуть";
    default: return text || "не удалось вернуть";
  }
}

export interface RestoreSkip {
  group_id: string;
  group_name?: string | null;
  reason?: string | null;
  message?: string | null;
}

export interface RestoreWarning {
  group_id?: string;
  code?: string;
  message?: string;
}

type NamedOption = Pick<RestoreOption, "groupId" | "name">;

function groupLabel(groupId: string | undefined, serverName: string | null | undefined, options: ReadonlyArray<NamedOption>): string {
  const own = (serverName ?? "").trim();
  if (own) return own;
  return options.find((option) => option.groupId === groupId)?.name ?? "Группа";
}

/** «Группа А» — the server's Russian message (the code in words when it sent none), for every skipped group. */
export function restoreSkippedLines(skipped: ReadonlyArray<RestoreSkip> | null | undefined, options: ReadonlyArray<NamedOption>): string[] {
  return (skipped ?? []).map((item) => {
    const text = (item.message ?? "").trim() || skipReasonLabel(item.reason);
    return `«${groupLabel(item.group_id, item.group_name, options)}» — ${text}`;
  });
}

/** Hints of the enrolment («Группа А» — message); a hint without text is dropped. */
export function restoreWarningLines(warnings: ReadonlyArray<RestoreWarning> | null | undefined, options: ReadonlyArray<NamedOption>): string[] {
  const lines: string[] = [];
  for (const warning of warnings ?? []) {
    const text = (warning.message ?? "").trim();
    if (text) lines.push(`«${groupLabel(warning.group_id, null, options)}» — ${text}`);
  }
  return lines;
}

export interface RestoreOutcome {
  text: string;
  type: "success" | "warning";
  /** Skipped groups with the server's reason. */
  lines: string[];
  /** Hints of the enrolment of the groups he is back in. */
  warnings: string[];
}

/** The answer to the owner: plain success, or a warning that lists the groups the server skipped and its hints. */
export function restoreOutcome(
  result: { skipped?: ReadonlyArray<RestoreSkip> | null; warnings?: ReadonlyArray<RestoreWarning> | null } | null | undefined,
  requestedCount: number,
  options: ReadonlyArray<NamedOption>,
): RestoreOutcome {
  const skipped = result?.skipped ?? [];
  const warnings = restoreWarningLines(result?.warnings, options);
  if (skipped.length === 0) return { text: RESTORED_TOAST, type: "success", lines: [], warnings };
  const none = skipped.length >= requestedCount;
  return {
    text: none ? "Ученик возвращён из архива, но ни в одну группу" : "Ученик возвращён из архива, но не во все группы",
    type: "warning",
    lines: restoreSkippedLines(skipped, options),
    warnings,
  };
}

/**
 * True when the owner has something to read after a return (skipped groups or hints): the dialog then stays open
 * as the notice.  The card is refreshed at once either way; «Готово» only closes the dialog.
 */
export function restoreNeedsReading(outcome: Pick<RestoreOutcome, "lines" | "warnings">): boolean {
  return outcome.lines.length > 0 || outcome.warnings.length > 0;
}

/**
 * 409 of «В архив» / «Вернуть» is "the card is out of date" only for «Ученик уже в архиве» / «Ученик не в архиве»:
 * the card is read again.  Any other refusal (for example a lesson of his group is in progress) leaves the
 * dialog open with the server's text.
 */
export function isStaleArchiveConflict(kind: "archive" | "restore", message: string | null | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  return kind === "archive" ? text.includes("уже в архиве") : text.includes("не в архиве");
}
