"use client";

import { Select } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarClock, Loader2, Users } from "lucide-react";
import { orgApi, opsApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { dayAndDateLabel, errorMessageOf, opsErrorCode, opsErrorDetail } from "@/lib/ops-errors";
import type { OrgMemberRow, RemovalImpact, TeacherBusyDetail } from "@/lib/ops-b-types";
import { staffDisplayName } from "@/lib/staff-name";
import { removalRequestsText } from "@/lib/substitutions";
import {
  KEEP_UNASSIGNED_LABEL,
  UNASSIGNED,
  UNASSIGNED_CONFIRM_TEXT,
  applyToAll,
  buildHandoverBody,
  canSubmitHandover,
  emptyChoices,
  futureSubstitutionsText,
  groupsBlockText,
  groupsBlockTitle,
  handoverConflictLines,
  handoverTargets,
  impactFromRefusal,
  inProgressText,
  missedLessonsText,
  removeConfirmText,
  roleChangeBlockText,
  type HandoverChoices,
} from "@/lib/staff-lifecycle";

export type MemberAction = { kind: "remove" } | { kind: "role"; role: string };

/**
 * O2 (LOGIC-B): «Удалить сотрудника» and the change of a role that would leave groups without their teacher.
 * Asks `removal-impact` first: a member without groups is removed after a plain confirmation; one with groups
 * (and lessons in progress) gets the handover - a teacher per group («Передать всем» on top), or «Оставить без преподавателя»
 * with a ticked «Я понимаю…».  «Передать и удалить» hands the groups over (all or none, on the server) and then removes.
 */
export function RemoveMemberDialog({
  member,
  action,
  members,
  onClose,
  onDone,
}: {
  member: OrgMemberRow | null;
  action: MemberAction;
  /** Active staff: the teachers among them are the targets of the handover. */
  members: OrgMemberRow[];
  onClose: () => void;
  /** After the server did it (the dialog is closed by the caller): the text for the toast. */
  onDone: (message: string) => void;
}) {
  const memberId = member?.member_id ?? null;
  const name = member ? staffDisplayName(member, "Без имени") : "";
  const [impact, setImpact] = useState<RemovalImpact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<HandoverChoices>({});
  const [everyone, setEveryone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, string>>({});
  const requestRef = useRef(0);

  const targets = useMemo(() => handoverTargets(members, member?.user_id || member?.id), [members, member]);
  const targetName = useCallback((id: string) => targets.find((target) => target.id === id)?.name ?? null, [targets]);

  const load = useCallback(async () => {
    if (!memberId) return;
    const token = ++requestRef.current;
    setImpact(null);
    setLoadError(null);
    setError(null);
    setConflicts({});
    try {
      const result = await opsApi.removalImpact(memberId);
      if (token !== requestRef.current) return;
      setImpact(result);
      setChoices(emptyChoices((result.groups ?? []).map((group) => group.id)));
      setEveryone("");
    } catch (failure) {
      if (token !== requestRef.current) return;
      setLoadError(errorMessageOf(failure, "Не удалось проверить, что связано с сотрудником. Повторите попытку."));
    }
  }, [memberId]);

  useEffect(() => {
    if (memberId) void load();
    else { requestRef.current += 1; setImpact(null); }
  }, [memberId, load]);

  if (!member) return null;

  const groups = impact?.groups ?? [];
  const inProgress = impact?.inProgressLessons ?? [];
  const hasGroups = groups.length > 0;
  const isRole = action.kind === "role";

  const setChoice = (groupId: string, patch: Partial<{ value: string; confirmed: boolean }>) => {
    setChoices((previous) => ({ ...previous, [groupId]: { ...(previous[groupId] ?? { value: "", confirmed: false }), ...patch } }));
    setConflicts((previous) => {
      if (!(groupId in previous)) return previous;
      const rest = { ...previous };
      delete rest[groupId];
      return rest;
    });
    setError(null);
  };

  const chooseEveryone = (value: string) => {
    setEveryone(value);
    setChoices((previous) => applyToAll(previous, value));
    setConflicts({});
    setError(null);
  };

  const finish = async () => {
    if (isRole) {
      await orgApi.updateMemberRole(member.member_id, action.role);
      onDone(`Роль изменена: ${name}`);
    } else {
      const result = await orgApi.removeMember(member.member_id);
      onDone(result?.message || "Сотрудник удалён");
    }
  };

  const submit = async () => {
    if (!impact || busy) return;
    if (hasGroups && !canSubmitHandover(impact, choices)) return;
    setBusy(true);
    setError(null);
    setConflicts({});
    let handedOver = false;
    try {
      if (hasGroups) {
        await opsApi.handover(member.member_id, buildHandoverBody(impact, choices));
        handedOver = true;
      }
      await finish();
    } catch (failure) {
      const refusedImpact = impactFromRefusal(failure, member.member_id);
      if (refusedImpact) {
        // the world changed under the dialog: show what the server says is in the way now
        setImpact(refusedImpact);
        setChoices(emptyChoices((refusedImpact.groups ?? []).map((group) => group.id)));
        setEveryone("");
        setError(refusedImpact.inProgressLessons?.length ? null : "Данные изменились. Проверьте группы и повторите.");
      } else if (opsErrorCode(failure) === "TEACHER_BUSY") {
        const lines = handoverConflictLines(opsErrorDetail<TeacherBusyDetail>(failure), (groupId) => {
          const value = choices[groupId]?.value;
          return value && value !== UNASSIGNED ? targetName(value) : null;
        });
        setConflicts(Object.fromEntries(lines.map((line) => [line.groupId, line.text])));
        if (lines.length === 0) setError(errorMessageOf(failure, "У преподавателя уже есть урок в это время. Выберите другого."));
      } else if (opsErrorCode(failure) === "TARGET_NOT_TEACHER") {
        setError("Выберите преподавателя центра");
      } else if (opsErrorCode(failure) === "UNASSIGNED_NOT_CONFIRMED") {
        setError("Подтвердите, что группа останется без преподавателя.");
      } else {
        setError(errorMessageOf(failure, handedOver ? "Группы переданы, но завершить не удалось. Повторите." : "Не удалось выполнить. Данные не изменены."));
        if (handedOver) void load();
      }
    } finally {
      setBusy(false);
    }
  };

  const plainConfirm = impact !== null && !hasGroups && inProgress.length === 0;
  const submitDisabled = busy || !impact || (hasGroups ? !canSubmitHandover(impact, choices) : inProgress.length > 0);
  const submitLabel = hasGroups
    ? (isRole ? "Передать и изменить роль" : "Передать и удалить")
    : (isRole ? "Изменить роль" : "Удалить");

  return (
    <Modal
      open
      title={isRole ? "Изменить роль" : (hasGroups ? groupsBlockTitle() : "Удалить сотрудника")}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitDisabled}
            className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              isRole || hasGroups ? "bg-primary-600 hover:bg-primary-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <RemovalDialogBody
        name={name}
        impact={impact}
        loadError={loadError}
        isRole={isRole}
        targets={targets}
        choices={choices}
        everyone={everyone}
        conflicts={conflicts}
        busy={busy}
        error={error}
        onRetry={() => void load()}
        onChoice={setChoice}
        onEveryone={chooseEveryone}
      />
    </Modal>
  );
}

/**
 * The inside of the dialog, apart from the shell (the Modal): what the server's `removal-impact` says and the handover form.
 * Presentational - the state lives in the dialog; the fixtures of the contract render through it in the tests.
 */
export function RemovalDialogBody({
  name, impact, loadError, isRole, targets, choices, everyone, conflicts, busy, error, onRetry, onChoice, onEveryone,
}: {
  name: string;
  impact: RemovalImpact | null;
  loadError: string | null;
  isRole: boolean;
  targets: Array<{ id: string; name: string; label?: string }>;
  choices: HandoverChoices;
  everyone: string;
  conflicts: Record<string, string>;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onChoice: (groupId: string, patch: Partial<{ value: string; confirmed: boolean }>) => void;
  onEveryone: (value: string) => void;
}) {
  const groups = impact?.groups ?? [];
  const inProgress = impact?.inProgressLessons ?? [];
  const hasGroups = groups.length > 0;
  const futureCount = impact?.futureSubstitutions?.count ?? 0;
  const missedCount = impact?.missedLessons?.count ?? 0;
  const requestsCount = impact?.pendingSubstitutionRequests?.count ?? 0;
  const plainConfirm = impact !== null && !hasGroups && inProgress.length === 0;
  const handoverOptions = [
    { value: "", label: "Выберите преподавателя" },
    ...targets.map((target) => ({ value: target.id, label: target.label ?? target.name })),
    { value: UNASSIGNED, label: KEEP_UNASSIGNED_LABEL },
  ];
  return (
      <div className="space-y-4 pb-1">
        {!impact && !loadError && (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Проверяем группы и уроки…
          </div>
        )}
        {loadError && (
          <div role="alert" className="space-y-2">
            <p className="text-sm font-medium text-rose-700">{loadError}</p>
            <button type="button" onClick={onRetry} className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Повторить
            </button>
          </div>
        )}

        {impact && plainConfirm && (
          <p className="text-sm leading-6 text-slate-700">
            {isRole ? `Изменить роль «${name}»?` : removeConfirmText(name)}
          </p>
        )}

        {impact && !plainConfirm && (
          <>
            {hasGroups && (
              <p className="text-sm leading-6 text-slate-700">
                {isRole ? roleChangeBlockText(name, groups.length) : groupsBlockText(name, groups.length)}
              </p>
            )}

            {inProgress.map((lesson) => (
              <div key={`${lesson.groupId}-${lesson.lessonDate}`} role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm font-medium text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{inProgressText(lesson.groupName)}</span>
              </div>
            ))}

            {hasGroups && (
              <div className="space-y-3">
                {groups.length > 1 && (
                  <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                    <label htmlFor="handover-everyone" className="mb-1.5 block text-[13px] font-semibold text-slate-500">Передать всем</label>
                    <Select
                      id="handover-everyone"
                      value={everyone}
                      onChange={(event) => onEveryone(event.target.value)}
                      disabled={busy}
                      options={handoverOptions}
                      buttonClassName="bg-white py-2.5"
                    />
                  </div>
                )}

                <ul className="space-y-2.5">
                  {groups.map((group) => {
                    const choice = choices[group.id] ?? { value: "", confirmed: false };
                    const conflict = conflicts[group.id];
                    return (
                      <li key={group.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                            <Users className="h-4 w-4 text-slate-400" /> {group.name}
                            {typeof group.studentCount === "number" && (
                              <span className="font-normal text-slate-500">· {group.studentCount} уч.</span>
                            )}
                          </p>
                          {group.nextLesson && (
                            <p className="flex items-center gap-1 text-xs text-slate-500">
                              <CalendarClock className="h-3.5 w-3.5" />
                              Ближайший урок: {dayAndDateLabel(group.nextLesson.date)} {group.nextLesson.startTime}
                            </p>
                          )}
                        </div>
                        <label htmlFor={`handover-${group.id}`} className="sr-only">Преподаватель группы «{group.name}»</label>
                        <Select
                          id={`handover-${group.id}`}
                          value={choice.value}
                          onChange={(event) => onChoice(group.id, { value: event.target.value, confirmed: false })}
                          disabled={busy}
                          invalid={Boolean(conflict)}
                          options={handoverOptions}
                          className="mt-2.5"
                          buttonClassName={`py-2.5 ${conflict ? "!border-rose-300" : ""}`}
                        />
                        {choice.value === UNASSIGNED && (
                          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={choice.confirmed}
                              onChange={(event) => onChoice(group.id, { confirmed: event.target.checked })}
                              disabled={busy}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>{UNASSIGNED_CONFIRM_TEXT}</span>
                          </label>
                        )}
                        {conflict && <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{conflict}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(futureCount > 0 || missedCount > 0 || requestsCount > 0) && (
              <div className="space-y-1 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
                {futureCount > 0 && <p>{futureSubstitutionsText(futureCount)}</p>}
                {missedCount > 0 && <p>{missedLessonsText(missedCount)}</p>}
                {requestsCount > 0 && <p>{removalRequestsText(requestsCount)}</p>}
              </div>
            )}
          </>
        )}

        {impact && plainConfirm && (futureCount > 0 || missedCount > 0 || requestsCount > 0) && (
          <div className="space-y-1 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
            {futureCount > 0 && <p>{futureSubstitutionsText(futureCount)}</p>}
            {missedCount > 0 && <p>{missedLessonsText(missedCount)}</p>}
            {requestsCount > 0 && <p>{removalRequestsText(requestsCount)}</p>}
          </div>
        )}

        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      </div>
  );
}
