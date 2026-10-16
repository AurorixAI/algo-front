/**
 * «Ученик ушёл из центра»: archive a student and bring him back.
 * Pure: no React and no network, so node:test can load this file.
 *
 * The server owns the rules (a student in the archive has no active membership, the old groups are
 * offered back by `archived_groups`, a full or archived group is skipped with a reason).  This file
 * only turns those answers into what the owner reads and clicks.
 */
import { formatUtcNaiveAsBusinessDate, parseUtcNaive } from "./business-time";

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
 */
export function studentArchiveAccess(input: { isTeacher: boolean; status: string | null | undefined }): StudentArchiveAccess {
  const archived = isArchivedStatus(input.status);
  const staff = !input.isTeacher;
  return {
    canArchive: staff && !archived,
    canRestore: staff && archived,
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

/** Where the server may put the archive date and reason; the first present one wins. */
export interface ArchiveInfoSource {
  student?: { archived_at?: string | null; archive_reason?: string | null } | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  archive?: { archived_at?: string | null; reason?: string | null } | null;
  archived_groups?: ReadonlyArray<{ group_id: string }> | null;
  group_history?: ReadonlyArray<{ group_id: string; left_at: string | null }> | null;
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * When and why the student went to the archive.  The date is the server's field when it sends one; else
 * the time the groups of `archived_groups` were closed (the server closes them in the same transaction as
 * the archiving).  A student archived without groups and without a field has no date: the banner then
 * says only «В архиве».
 */
export function studentArchiveInfo(source: ArchiveInfoSource | null | undefined): { archivedAt: string; reason: string } {
  if (!source) return { archivedAt: "", reason: "" };
  const explicit = firstText(source.student?.archived_at, source.archived_at, source.archive?.archived_at);
  const reason = firstText(source.student?.archive_reason, source.archive_reason, source.archive?.reason);
  if (explicit) return { archivedAt: explicit, reason };
  const closed = new Set((source.archived_groups ?? []).map((group) => group.group_id));
  let latest = "";
  let latestTime = -Infinity;
  for (const entry of source.group_history ?? []) {
    if (!closed.has(entry.group_id) || !entry.left_at) continue;
    const time = parseUtcNaive(entry.left_at)?.getTime();
    if (time !== undefined && time > latestTime) { latestTime = time; latest = entry.left_at; }
  }
  return { archivedAt: latest, reason };
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

/** The server's reason of a skipped group in words; its own text is kept when it is not a known code. */
export function skipReasonLabel(reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  if (!text) return "не удалось вернуть";
  const code = text.toLowerCase();
  if (code === "group_full" || code === "full") return "группа заполнена";
  if (code === "group_archived" || code === "archived") return "группа в архиве";
  return text;
}

export interface RestoreSkip {
  group_id: string;
  reason: string;
}

/** «Группа А — группа заполнена» for every skipped group; the name comes from the dialog's own rows. */
export function restoreSkippedLines(
  skipped: ReadonlyArray<RestoreSkip> | null | undefined,
  options: ReadonlyArray<Pick<RestoreOption, "groupId" | "name">>,
): string[] {
  return (skipped ?? []).map((item) => {
    const name = options.find((option) => option.groupId === item.group_id)?.name ?? "Группа";
    return `«${name}» — ${skipReasonLabel(item.reason)}`;
  });
}

export interface RestoreOutcome {
  text: string;
  type: "success" | "warning";
  lines: string[];
}

/** The answer to the owner: plain success, or a warning that lists the groups the server skipped. */
export function restoreOutcome(
  result: { skipped?: ReadonlyArray<RestoreSkip> | null } | null | undefined,
  requestedCount: number,
  options: ReadonlyArray<Pick<RestoreOption, "groupId" | "name">>,
): RestoreOutcome {
  const skipped = result?.skipped ?? [];
  if (skipped.length === 0) return { text: RESTORED_TOAST, type: "success", lines: [] };
  const lines = restoreSkippedLines(skipped, options);
  const none = skipped.length >= requestedCount;
  return {
    text: none ? "Ученик возвращён из архива, но ни в одну группу" : "Ученик возвращён из архива, но не во все группы",
    type: "warning",
    lines,
  };
}
