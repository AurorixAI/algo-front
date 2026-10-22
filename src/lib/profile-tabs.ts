/**
 * Tabs of the student card (`?tab=diagnostics|learning|payments|contacts`).  Pure: no React and no
 * network, so node:test can load this file.
 */

export type ProfileTab = "diagnostics" | "learning" | "payments" | "contacts";

export const PROFILE_TAB_LABEL: Record<ProfileTab, string> = {
  diagnostics: "Диагностика и отчёты",
  learning: "Обучение",
  payments: "Оплаты",
  contacts: "Контакты и заметки",
};

/** Below `sm` the tab strip uses these whole short words so no label is cut mid-word (the full ones are the accessible names from `sm` up). */
export const PROFILE_TAB_SHORT_LABEL: Record<ProfileTab, string> = {
  diagnostics: "Отчёты",
  learning: "Обучение",
  payments: "Оплаты",
  contacts: "Контакты",
};

/**
 * The tab a card opens on without `?tab=`, and the one an unknown or not allowed `?tab=` falls back to: «Обучение» (IA audit F35: the
 * centre's work is the groups, the attendance and the money, not the diagnostics; it used to be two different «defaults»).
 */
export const DEFAULT_PROFILE_TAB: ProfileTab = "learning";

/**
 * Tabs this user may see, in order.  A teacher never sees money, but reads the contacts (phone and
 * service notes) as before - only staff edit them; «Оплаты» needs the server to have said the user
 * may see payments (owner, or an administrator with the right).
 */
export function visibleProfileTabs(input: { isTeacher: boolean; paymentsVisible: boolean }): ProfileTab[] {
  if (input.isTeacher) return ["diagnostics", "learning", "contacts"];
  return input.paymentsVisible
    ? ["diagnostics", "learning", "payments", "contacts"]
    : ["diagnostics", "learning", "contacts"];
}

/**
 * `?tab=` of the card.  Missing, unknown or not allowed (`?tab=payments` without the right) -> the one default, «Обучение».
 */
export function parseProfileTab(
  value: string | null | undefined,
  visible: ReadonlyArray<ProfileTab>,
  _isTeacher = false,
): ProfileTab {
  if (value === null || value === undefined || value === "") return DEFAULT_PROFILE_TAB;
  const known = (Object.keys(PROFILE_TAB_LABEL) as ProfileTab[]).find((tab) => tab === value);
  return known && visible.includes(known) ? known : DEFAULT_PROFILE_TAB;
}
