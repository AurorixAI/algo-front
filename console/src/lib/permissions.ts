import type { Me } from "./types";

type Rights = Pick<Me, "is_owner" | "permissions"> | null | undefined;

/** Does the signed-in staff member have the permission?  The platform owner has everything, whatever the role says. */
export function can(me: Rights, key: string): boolean {
  if (!me) return false;
  return me.is_owner || me.permissions.includes(key);
}

export interface NavItem {
  key: "requests" | "support" | "centres" | "users" | "team" | "roles" | "audit";
  label: string;
  href: string;
  /** The permission that shows the item (the server checks it again on every call). */
  permission: string;
}

/** The sections of the sidebar, in order. */
export const NAV_ITEMS: NavItem[] = [
  { key: "requests", label: "Заявки", href: "/requests/", permission: "requests.view" },
  { key: "support", label: "Обращения", href: "/support/", permission: "support.manage" },
  { key: "centres", label: "Центры", href: "/centres/", permission: "orgs.view" },
  { key: "users", label: "Пользователи", href: "/users/", permission: "users.view" },
  { key: "team", label: "Команда", href: "/team/", permission: "team.manage" },
  { key: "roles", label: "Роли", href: "/roles/", permission: "team.manage" },
  { key: "audit", label: "Журнал", href: "/audit/", permission: "audit.view" },
];

export function visibleNav(me: Rights): NavItem[] {
  return NAV_ITEMS.filter((item) => can(me, item.permission));
}

/** Where `/` goes: the first section the person may open, else the page that says there is none. */
export function homePath(me: Rights): string {
  return visibleNav(me)[0]?.href ?? "/no-access/";
}

/** The nav item of the current path (`/centres/` and `/centres` both), or null. */
export function activeNav(pathname: string): NavItem["key"] | null {
  const clean = pathname.replace(/\/+$/, "");
  return NAV_ITEMS.find((item) => item.href.replace(/\/+$/, "") === clean)?.key ?? null;
}
