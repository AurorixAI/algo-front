import type { OrgStatus, RequestStatus, UserStatus } from "./types";

export type Tone = "slate" | "blue" | "amber" | "green" | "red" | "violet";

export const REQUEST_STATUSES: { value: RequestStatus; label: string; tone: Tone }[] = [
  { value: "new", label: "Новая", tone: "blue" },
  { value: "contacted", label: "Связались", tone: "amber" },
  { value: "demo_done", label: "Демо проведено", tone: "violet" },
  { value: "approved", label: "Одобрена", tone: "green" },
  { value: "declined", label: "Отказ", tone: "red" },
  { value: "spam", label: "Спам", tone: "slate" },
];

export function requestStatus(status: string): { label: string; tone: Tone } {
  return REQUEST_STATUSES.find((item) => item.value === status) ?? { label: status, tone: "slate" };
}

/** Statuses a person may set by hand (approved / declined only through their own dialogs). */
export const MANUAL_REQUEST_STATUSES = REQUEST_STATUSES.filter((item) => item.value !== "approved" && item.value !== "declined");

export function isFinalRequest(status: string): boolean {
  return status === "approved" || status === "declined";
}

export function orgStatus(status: OrgStatus | string): { label: string; tone: Tone } {
  switch (status) {
    case "active": return { label: "Активен", tone: "green" };
    case "blocked": return { label: "Заблокирован", tone: "red" };
    case "pending": return { label: "Ожидает", tone: "amber" };
    case "rejected": return { label: "Отклонён", tone: "slate" };
    default: return { label: status, tone: "slate" };
  }
}

export function userStatus(status: UserStatus | string): { label: string; tone: Tone } {
  switch (status) {
    case "active": return { label: "Активен", tone: "green" };
    case "never_logged_in": return { label: "Не входил", tone: "amber" };
    case "blocked": return { label: "Заблокирован", tone: "red" };
    case "inactive": return { label: "Отключён", tone: "slate" };
    default: return { label: status, tone: "slate" };
  }
}

export function orgRoleLabel(role: string): string {
  switch (role) {
    case "owner": return "Владелец";
    case "admin": return "Администратор";
    case "teacher": return "Учитель";
    default: return role;
  }
}

export const TARGET_TYPES: { value: string; label: string }[] = [
  { value: "demo_request", label: "Заявка" },
  { value: "org", label: "Центр" },
  { value: "user", label: "Пользователь" },
  { value: "staff", label: "Сотрудник" },
  { value: "role", label: "Роль" },
  { value: "console", label: "Вход в консоль" },
];

export function targetTypeLabel(type: string): string {
  return TARGET_TYPES.find((item) => item.value === type)?.label ?? type;
}

/** Group titles of the permission catalogue (the server sends the group as a key or as a title). */
export function permissionGroupLabel(group: string): string {
  const known: Record<string, string> = {
    requests: "Заявки", orgs: "Центры", users: "Пользователи", audit: "Журнал", team: "Команда и роли",
    support: "Поддержка", impersonate: "Войти как", content: "Контент", finance: "Финансы", ai_costs: "Расходы на ИИ", analytics: "Аналитика",
  };
  return known[group] ?? group;
}
