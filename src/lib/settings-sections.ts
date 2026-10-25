/**
 * Sections of the owner's settings (`/owner/settings?section=…`).  Pure: no React and no network,
 * so node:test can load this file.
 */

export type SettingsSection = "organization" | "payments" | "attendance" | "days_off" | "payroll" | "profile" | "security";

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "organization";

/** In menu order.  «Зарплата» (N13 P3) is the owner's alone and has no payment settings behind it. */
export const SETTINGS_SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: "organization", label: "Организация" },
  { key: "payments", label: "Оплаты" },
  { key: "attendance", label: "Посещаемость" },
  { key: "days_off", label: "Выходные дни" },
  { key: "payroll", label: "Зарплата" },
  { key: "profile", label: "Профиль" },
  { key: "security", label: "Безопасность" },
];

/**
 * `?section=` of the page.  A missing, unknown or not shown (no rights) value opens the default
 * section; `available` is the list of sections this user may see.
 */
export function parseSettingsSection(
  value: string | null | undefined,
  available: ReadonlyArray<SettingsSection> = SETTINGS_SECTIONS.map((section) => section.key),
): SettingsSection {
  const found = SETTINGS_SECTIONS.find((section) => section.key === value)?.key;
  return found && available.includes(found) ? found : DEFAULT_SETTINGS_SECTION;
}

/**
 * Sections shown to this user: the payment ones only when the server let him read the payment settings,
 * «Зарплата» only to the owner (the server answers 403 to everybody else); «Выходные дни» (PAY-F) are the owner's here, the administrator has them on his own settings page.
 */
export function visibleSettingsSections(input: { isOwner: boolean; paymentSettingsReadable: boolean }): SettingsSection[] {
  return SETTINGS_SECTIONS.map((section) => section.key).filter((key) => {
    if (key === "payments" || key === "attendance") return input.isOwner && input.paymentSettingsReadable;
    if (key === "payroll" || key === "days_off") return input.isOwner;
    return true;
  });
}

export function settingsSectionHref(section: SettingsSection): string {
  return `?section=${section}`;
}

/**
 * The next value of a form that is filled from the server's record.  A form the user has not touched (it still equals
 * the record it was last filled from, `base`) takes the new record; a form with unsaved typing is returned as it is.
 * `base` is null before the first fill.
 */
export function reconcileDraft<T extends Record<string, unknown>>(draft: T, base: T | null, next: T): T {
  if (base === null) return next;
  const untouched = (Object.keys(base) as Array<keyof T>).every((key) => draft[key] === base[key]);
  return untouched ? next : draft;
}
