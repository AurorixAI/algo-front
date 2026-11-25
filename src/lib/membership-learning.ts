/**
 * IA audit F2 / F8: what belongs to the ENROLMENT of a student in a group lives on the «Обучение» tab of his card: the pause and leaving the
 * group.  Pure: no React, so node:test loads it.
 */
import { pausedChipText } from "./payments";
import type { PauseOut } from "./payments-logica";

export const PAUSE_MENU_LABEL = "Пауза…";
export const END_PAUSE_MENU_LABEL = "Закончить паузу";
export const LEAVE_MENU_LABEL = "Убрать из группы…";

export type GroupMenuKey = "pause" | "leave";

/** The first item of a «⋯» of an enrolment (the card of the student and the roster of a group say it by one rule): «Закончить паузу» while a pause runs today, else «Пауза…». */
export const pauseMenuLabel = (running: boolean): string => (running ? END_PAUSE_MENU_LABEL : PAUSE_MENU_LABEL);

/** The live pause that covers `today` (both ends included); `pauses` come from `livePauses`. */
export function runningPause(pauses: ReadonlyArray<Pick<PauseOut, "first_day" | "last_day">> | null | undefined, today: string): Pick<PauseOut, "first_day" | "last_day"> | null {
  return (pauses ?? []).find((pause) => pause.first_day <= today && pause.last_day >= today) ?? null;
}

/** «На паузе до 01.11» for a running pause, else null. */
export function pauseChipOf(pauses: ReadonlyArray<Pick<PauseOut, "first_day" | "last_day">> | null | undefined, today: string): string | null {
  const running = runningPause(pauses, today);
  return running ? pausedChipText({ on_pause: true, paused_until: running.last_day }) : null;
}

/** The «⋯» of a group's card on «Обучение»: «Пауза…» (or «Закончить паузу» while one runs) and «Убрать из группы…» - at most two items. */
export function groupMenuItems(input: { pauses: ReadonlyArray<Pick<PauseOut, "first_day" | "last_day">> | null | undefined; today: string; hasMembershipId: boolean }): Array<{ key: GroupMenuKey; label: string }> {
  const items: Array<{ key: GroupMenuKey; label: string }> = [];
  // an older server sends no membership id: nothing to put on pause, leaving the group still works by the group
  if (input.hasMembershipId) items.push({ key: "pause", label: pauseMenuLabel(Boolean(runningPause(input.pauses, input.today))) });
  items.push({ key: "leave", label: LEAVE_MENU_LABEL });
  return items;
}

/**
 * PAY-TAILS Б11.50 Э7: does a FORMER stay (left, transferred, archived) have a pause worth opening - one with locked days (a leaving / transfer cut it: it can still be taken off whole) or one whose last day is not
 * before today.  `pauses` come from `livePauses`.  Without such a pause the history row has no action.
 */
export function formerStayHasPauses(pauses: ReadonlyArray<{ last_day: string; days_locked?: boolean; voided_at?: string | null }> | null | undefined, today: string): boolean {
  return (pauses ?? []).some((pause) => !pause.voided_at && (pause.days_locked === true || pause.last_day >= today));
}
