import type { OrgStatus, RequestStatus, SupportMail, SupportStatus, UserStatus } from "./types";

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
    case "suspended": return { label: "Приостановлен", tone: "amber" };
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
  { value: "support_ticket", label: "Обращение" },
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

// ---- K3: the closed lists of the demo request, in the very words of the landing form and of the server's letter -------------
// (auth `demo_request_choices.py`, landing `demo-apply.ts`).  An unknown code is never shown in Latin letters: it is dropped.

const POSITION_LABEL: Readonly<Record<string, string>> = { owner: "Владелец", director: "Директор", admin: "Администратор", other: "Другое" };
const NEED_LABEL: Readonly<Record<string, string>> = {
  payments: "Оплаты и долги",
  attendance: "Посещаемость",
  payroll: "Зарплата учителей",
  diagnostics: "Диагностика",
  exams: "Экзамены",
};
const TOOL_LABEL: Readonly<Record<string, string>> = { excel: "Excel", notebook: "Тетрадь", other_system: "Другая система", none: "Ничего" };
const LOCALE_LABEL: Readonly<Record<string, string>> = { ru: "Русский", uz: "Узбекский", en: "Английский" };

const word = (table: Readonly<Record<string, string>>, code: string | null | undefined): string | null => {
  const key = typeof code === "string" ? code.trim() : "";
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
};

export const positionLabel = (code: string | null | undefined) => word(POSITION_LABEL, code);
export const toolLabel = (code: string | null | undefined) => word(TOOL_LABEL, code);
export const localeLabel = (code: string | null | undefined) => word(LOCALE_LABEL, code);
/** «Оплаты и долги, Посещаемость»; `null` when nothing is known (an empty list or only unknown codes). */
export function needsLabel(codes: readonly string[] | null | undefined): string | null {
  const words = (codes ?? []).map((code) => word(NEED_LABEL, code)).filter((w): w is string => w !== null);
  return words.length ? words.join(", ") : null;
}
/** `0` -> «Филиалов нет», `3` -> «3»; `null` (not answered) -> `null`. */
export function branchesLabel(count: number | null | undefined): string | null {
  if (count === null || count === undefined) return null;
  return count === 0 ? "Филиалов нет" : String(count);
}

// ---- K4a «Поддержка» ---------------------------------------------------------------------------------------------------------

export const SUPPORT_STATUSES: { value: SupportStatus; label: string; tone: Tone }[] = [
  { value: "new", label: "Новое", tone: "blue" },
  { value: "in_progress", label: "В работе", tone: "amber" },
  { value: "waiting", label: "Ждём ответа", tone: "violet" },
  { value: "resolved", label: "Решено", tone: "green" },
];

export function supportStatus(status: string): { label: string; tone: Tone } {
  return SUPPORT_STATUSES.find((item) => item.value === status) ?? { label: status, tone: "slate" };
}

/** The statuses the team sets by hand («Новое» is only the state of a ticket nobody has touched, or one the author opened again). */
export const SETTABLE_SUPPORT_STATUSES = SUPPORT_STATUSES.filter((item) => item.value !== "new");

export const SUPPORT_ROLES: { value: string; label: string }[] = [
  { value: "owner", label: "Владелец" },
  { value: "admin", label: "Администратор" },
  { value: "teacher", label: "Преподаватель" },
];

/** The outcome of a letter in words; `null` = nothing to say (sent, or not applicable).  A letter that did not go is a red mark, the answer is in the cabinet anyway. */
export function supportMailMark(mail: SupportMail | null | undefined, toAuthor: boolean): { text: string; problem: boolean } | null {
  switch (mail) {
    case "failed": return { text: toAuthor ? "письмо автору не ушло" : "письмо команде не ушло", problem: true };
    case "skipped": return { text: toAuthor ? "письмо не отправлялось (суточный предел или нет доступа)" : "письмо не отправлялось (суточный предел)", problem: true };
    case "throttled": return { text: toAuthor ? "письмо не отправлялось: недавно уже было" : "письмо не отправлялось: по этому обращению недавно уже писали", problem: false };
    case "pending": return { text: "письмо отправляется", problem: false };
    default: return null;
  }
}

/** «Решено …» under the status: WHO closed it only when it was a person and the name is known; the clock only when the kind says so (the name of a deleted employee is gone, the kind stays). */
export function supportResolvedNote(kind: "manual" | "auto" | null | undefined, whenText: string, byName?: string | null): string {
  if (kind === "auto") return `Решено ${whenText} автоматически: 14 дней без ответа`;
  return byName ? `Решено ${whenText}, ${byName}` : `Решено ${whenText}`;
}
