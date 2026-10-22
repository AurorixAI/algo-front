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
  if (input.hasMembershipId) items.push({ key: "pause", label: runningPause(input.pauses, input.today) ? END_PAUSE_MENU_LABEL : PAUSE_MENU_LABEL });
  items.push({ key: "leave", label: LEAVE_MENU_LABEL });
  return items;
}
