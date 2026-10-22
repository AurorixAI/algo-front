/**
 * IA audit 22.10 (F26-F31, F9, F33): where a screen of the money / groups / students area leads, in ONE place.  Pure: no React, so node:test
 * loads it.  The owner workspace never links into `/admin/*` (diagnostics and exams belong to the administrator only); a link is built from the
 * workspace the user is in, never typed as a string at the call site.
 */

export type Workspace = "owner" | "admin";

export interface WorkspaceBases {
  students: string;
  groups: string;
  payments: string;
  attendance: string;
  substitutions: string;
}

/** `/owner` or `/admin` of a path; the owner is the default (the shared components of the money area live under both). */
export function workspaceOfPath(pathname: string | null | undefined): Workspace {
  return typeof pathname === "string" && pathname.startsWith("/admin") ? "admin" : "owner";
}

export function workspaceBases(workspace: Workspace): WorkspaceBases {
  const root = workspace === "admin" ? "/admin" : "/owner";
  return {
    students: `${root}/students`,
    groups: `${root}/groups`,
    payments: `${root}/payments`,
    attendance: `${root}/attendance`,
    substitutions: `${root}/substitutions`,
  };
}

/** `/owner/payments` or `/owner/payments/` -> the bases of that workspace. */
export function basesOfPayments(paymentsBase: string): WorkspaceBases {
  return workspaceBases(workspaceOfPath(paymentsBase.replace(/\/+$/, "")));
}

const trim = (base: string) => base.replace(/\/+$/, "");

/** A student's card on a tab: money screens lead to the payments tab, never to «Диагностика» (F29). */
export function studentHref(studentsBase: string, studentId: string, tab: "payments" | "learning" | "contacts" | "diagnostics" | null = "payments"): string {
  return `${trim(studentsBase)}/${encodeURIComponent(studentId)}${tab ? `?tab=${tab}` : ""}`;
}

/** A group page; `tab` opens one of its tabs (`?tab=payments|schedule|attendance|students`). */
export function groupHref(groupsBase: string, groupId: string, tab: "students" | "schedule" | "attendance" | "payments" | null = null): string {
  return `${trim(groupsBase)}/${encodeURIComponent(groupId)}${tab ? `?tab=${tab}` : ""}`;
}

/** A lesson in the schedule of its group (a substitution row leads here, F31): `?tab=schedule&lesson=…&date=…`. */
export function groupLessonHref(groupsBase: string, groupId: string, lessonId: string | null | undefined, date: string | null | undefined): string {
  const params = new URLSearchParams({ tab: "schedule" });
  if (lessonId) params.set("lesson", lessonId);
  if (date) params.set("date", date.slice(0, 10));
  return `${trim(groupsBase)}/${encodeURIComponent(groupId)}?${params.toString()}`;
}

/** The payments list narrowed to one group (`?bucket=&group_id=`). */
export function groupPaymentsListHref(paymentsBase: string, groupId: string, bucket: "debt" | "expiring" | "active" | "paused" = "debt"): string {
  return `${trim(paymentsBase)}?bucket=${bucket}&group_id=${encodeURIComponent(groupId)}`;
}

/** The teachers page opens the rate dialog of one teacher (`?teacher=`): owner only. */
export function teacherHref(teacherId: string): string {
  return `/owner/teachers?teacher=${encodeURIComponent(teacherId)}`;
}

/** True when `href` is an owner-workspace path that must not point into the administrator's workspace. */
export function pointsIntoAdmin(href: string): boolean {
  return /^\/admin(\/|\?|$)/.test(href);
}

/**
 * IA audit F34: `?status=confirmed` and the like - the current query with some keys set (`null` / "" removes one); the other keys (`tab`,
 * `request`...) stay.  Returns "?" when nothing is left, so `router.replace` keeps the path.
 */
export function queryWith(current: string | null | undefined, patch: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams((current ?? "").replace(/^\?/, ""));
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "?";
}
