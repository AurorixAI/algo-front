"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, PauseCircle, Plus, PlayCircle, UserMinus, Users } from "lucide-react";
import { orgApi, type StudentGroupMembership, type StudentProfile } from "@/lib/api";
import { formatBusinessDate, formatUtcNaiveAsBusinessDate } from "@/lib/business-time";
import { formatMembershipPeriods } from "@/lib/membership-periods";
import { studentArchiveAccess } from "@/lib/student-archive";
import { ENROL_ACTION_LABEL, TRANSFER_ACTION_LABEL } from "@/lib/enrol-labels";
import { END_PAUSE_MENU_LABEL, groupMenuItems, pauseChipOf } from "@/lib/membership-learning";
import { livePauses, type PauseOut } from "@/lib/payments-logica";
import { LeaveStudentDialog } from "@/components/groups/leave-student-dialog";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";

/** Active memberships of the profile; an older server sends only the single `group`. */
export function profileMemberships(profile: Pick<StudentProfile, "groups" | "group" | "student">): StudentGroupMembership[] {
  if (profile.groups && profile.groups.length > 0) return profile.groups;
  if (!profile.group) return [];
  return [{
    membership_id: "",
    group_id: profile.group.id,
    group_name: profile.group.name,
    teacher_id: profile.group.teacher_id,
    teacher_name: profile.group.teacher_name,
    class_level: profile.group.class_level,
    is_primary: true,
    joined_at: null,
  }];
}

interface StudentGroupsBlockProps {
  profile: StudentProfile;
  groupsBasePath: string;
  /** A teacher never sees (and never requests) money. */
  isTeacher: boolean;
  onAssign: (mode: "transfer" | "add") => void;
  /** A toast of the card (a pause set, a student taken out of a group). */
  onNotify?: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
  /** A pause was set / ended, or the student left a group: the card refreshes what depends on it (the money counters; after leaving, the profile). */
  onChanged?: (kind: "pause" | "left") => void;
}

/**
 * «Группы» of the «Обучение» tab: every active membership with the main one marked, the teacher and the join date.  Money lives in
 * its own tab (`StudentPaymentsBlock`), never here.  What belongs to the enrolment itself is here (IA audit 22.10: F2, F8): the pause
 * («Пауза…» / «Закончить паузу», the chip «На паузе до …») and «Убрать из группы…» are in the «⋯» of the group's card;
 * «Зачислить в группу» and «Перевести в другую группу» are the two buttons of the block.
 */
export function StudentGroupsBlock({ profile, groupsBasePath, isTeacher, onAssign, onNotify, onChanged }: StudentGroupsBlockProps) {
  const memberships = profileMemberships(profile);
  // Staff add and transfer; nobody does it while the student is in the archive (he is brought back first).
  const { groupActions, showBanner: archived } = studentArchiveAccess({ isTeacher, status: profile.student.status });

  const sorted = [...memberships].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const studentName = profile.student.full_name;
  const today = useMemo(() => formatBusinessDate(), []);
  const [pauses, setPauses] = useState<Record<string, PauseOut[]>>({});
  const [pauseFor, setPauseFor] = useState<StudentGroupMembership | null>(null);
  const [leaveFor, setLeaveFor] = useState<StudentGroupMembership | null>(null);
  const membershipIds = memberships.map((item) => item.membership_id).filter(Boolean).join(",");

  const loadPauses = useCallback(async () => {
    if (!groupActions || !membershipIds) { setPauses({}); return; }
    const entries = await Promise.all(membershipIds.split(",").map(async (id) => {
      try { return [id, livePauses(await orgApi.listPauses(id))] as const; } catch { return [id, [] as PauseOut[]] as const; }
    }));
    setPauses(Object.fromEntries(entries));
  }, [groupActions, membershipIds]);
  useEffect(() => { void loadPauses(); }, [loadPauses]);

  const menuFor = (item: StudentGroupMembership): RowMenuItem[] =>
    groupMenuItems({ pauses: pauses[item.membership_id], today, hasMembershipId: Boolean(item.membership_id) }).map((entry) =>
      entry.key === "pause"
        ? { key: "pause", label: entry.label, icon: entry.label === END_PAUSE_MENU_LABEL ? PlayCircle : PauseCircle, onSelect: () => setPauseFor(item) }
        : { key: "leave", label: entry.label, icon: UserMinus, danger: true, onSelect: () => setLeaveFor(item) });

  return (
    <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">Группы</h2>
        {groupActions && memberships.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAssign("add")}
              data-testid="enrol-add"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {ENROL_ACTION_LABEL}
            </button>
            <button
              type="button"
              onClick={() => onAssign("transfer")}
              data-testid="enrol-transfer"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {TRANSFER_ACTION_LABEL}
            </button>
          </div>
        )}
      </div>

      {memberships.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-amber-200/60 bg-amber-50/60 p-6 text-center">
          <p className="text-sm font-medium text-amber-900">
            {archived ? "Ученик в архиве и не состоит в группах" : "Ученик ещё не зачислен ни в одну группу"}
          </p>
          {archived && !isTeacher && (
            <p className="text-xs text-amber-800">Чтобы вернуть его в группу, нажмите «Вернуть из архива» вверху карточки.</p>
          )}
          {groupActions && (
            <button
              type="button"
              onClick={() => onAssign("transfer")}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <Users className="h-4 w-4" /> {ENROL_ACTION_LABEL}
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((item) => (
            <li key={item.membership_id || item.group_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-base font-bold text-slate-900">{item.group_name}</span>
                    {item.class_level ? (
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{item.class_level} класс</span>
                    ) : null}
                    {item.is_primary && memberships.length > 1 && (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">основная</span>
                    )}
                    {pauseChipOf(pauses[item.membership_id], today) && (
                      <span data-testid="learning-pause-chip" className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{pauseChipOf(pauses[item.membership_id], today)}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    Преподаватель: <span className="font-medium text-slate-800">{item.teacher_name || "Не назначен"}</span>
                    {item.periods && item.periods.length > 1 ? (
                      <span className="text-slate-400"> · в группе {formatMembershipPeriods(item.periods)}</span>
                    ) : item.joined_at && <span className="text-slate-400"> · в группе с {formatUtcNaiveAsBusinessDate(item.joined_at)}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`${groupsBasePath}/${item.group_id}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Перейти в группу
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {groupActions && <RowMenu items={menuFor(item)} label={`Действия по группе: ${item.group_name}`} width={220} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pauseFor && (
        <PauseDialog
          open
          membershipId={pauseFor.membership_id}
          studentName={studentName}
          groupName={pauseFor.group_name}
          onClose={() => setPauseFor(null)}
          onChanged={(_row, text) => { onNotify?.(text, "success"); void loadPauses(); onChanged?.("pause"); }}
        />
      )}
      {leaveFor && (
        <LeaveStudentDialog
          open
          groupId={leaveFor.group_id}
          studentId={profile.student.id}
          studentName={studentName}
          onClose={() => setLeaveFor(null)}
          onLeft={(lines) => { onNotify?.("Ученик убран из группы", "success", lines); onChanged?.("left"); }}
          onLegacy={async () => { await orgApi.removeStudentFromGroup(leaveFor.group_id, profile.student.id); }}
        />
      )}
    </div>
  );
}
