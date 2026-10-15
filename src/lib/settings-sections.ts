/**
 * Sections of the owner's settings (`/owner/settings?section=…`).  Pure: no React and no network,
 * so node:test can load this file.
 */

export type SettingsSection = "organization" | "payments" | "attendance" | "profile" | "security";

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "organization";

/** In menu order.  «Зарплата» is not listed until it exists: no «скоро» (owner, 15.10). */
export const SETTINGS_SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: "organization", label: "Организация" },
  { key: "payments", label: "Оплаты" },
  { key: "attendance", label: "Посещаемость" },
  { key: "profile", label: "Личный профиль" },
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

/** Sections shown to this user: the payment ones only when the server let him read the payment settings. */
export function visibleSettingsSections(input: { isOwner: boolean; paymentSettingsReadable: boolean }): SettingsSection[] {
  return SETTINGS_SECTIONS.map((section) => section.key).filter((key) =>
    key === "payments" || key === "attendance" ? input.isOwner && input.paymentSettingsReadable : true,
  );
}

export function settingsSectionHref(section: SettingsSection): string {
  return `?section=${section}`;
}
