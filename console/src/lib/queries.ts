/** Filter state of each list -> the query string parameters of the API (pure, so the mapping is tested). */
import { onlyDate } from "./format";

export const PAGE_SIZE = 25;

export interface RequestFilters {
  q: string;
  status: string;
  city: string;
  source: string;
  repeat: "" | "true";
  dateFrom: string;
  dateTo: string;
}
export const EMPTY_REQUEST_FILTERS: RequestFilters = { q: "", status: "", city: "", source: "", repeat: "", dateFrom: "", dateTo: "" };

const text = (value: string) => value.trim() || undefined;

export function requestsQuery(f: RequestFilters, page: number, sort: { key: string; order: "asc" | "desc" }) {
  return {
    page,
    page_size: PAGE_SIZE,
    sort: sort.key,
    order: sort.order,
    q: text(f.q),
    status: f.status || undefined,
    city: text(f.city),
    source: text(f.source),
    repeat: f.repeat === "true" ? true : undefined,
    date_from: onlyDate(f.dateFrom) || undefined,
    date_to: onlyDate(f.dateTo) || undefined,
  };
}

export interface OrgFilters {
  q: string;
  status: string;
  city: string;
}
export const EMPTY_ORG_FILTERS: OrgFilters = { q: "", status: "", city: "" };

export function orgsQuery(f: OrgFilters, page: number, sort: { key: string; order: "asc" | "desc" }) {
  return { page, page_size: PAGE_SIZE, sort: sort.key, order: sort.order, q: text(f.q), status: f.status || undefined, city: text(f.city) };
}

export interface UserFilters {
  q: string;
  role: string;
  status: string;
}
export const EMPTY_USER_FILTERS: UserFilters = { q: "", role: "", status: "" };
/** The user search starts from two characters: a list of every account of the platform is never shown unprompted. */
export const USER_SEARCH_MIN = 2;

export function usersQuery(f: UserFilters, page: number, sort: { key: string; order: "asc" | "desc" }) {
  return { page, page_size: PAGE_SIZE, sort: sort.key, order: sort.order, q: text(f.q), role: f.role || undefined, status: f.status || undefined };
}

export function canSearchUsers(f: UserFilters): boolean {
  return f.q.trim().length >= USER_SEARCH_MIN || Boolean(f.role || f.status);
}

export interface AuditFilters {
  q: string;
  actorId: string;
  action: string;
  targetType: string;
  dateFrom: string;
  dateTo: string;
}
export const EMPTY_AUDIT_FILTERS: AuditFilters = { q: "", actorId: "", action: "", targetType: "", dateFrom: "", dateTo: "" };

export function auditQuery(f: AuditFilters, page: number, order: "asc" | "desc") {
  return {
    page,
    page_size: 50,
    sort: "created_at",
    order,
    q: text(f.q),
    actor_id: f.actorId || undefined,
    action: f.action || undefined,
    target_type: f.targetType || undefined,
    date_from: onlyDate(f.dateFrom) || undefined,
    date_to: onlyDate(f.dateTo) || undefined,
  };
}

export function hasFilters(f: object): boolean {
  return Object.values(f).some((value) => typeof value === "string" && value.trim() !== "");
}

export interface SupportFilters {
  q: string;
  status: string;
  org: string;
  role: string;
}
export const EMPTY_SUPPORT_FILTERS: SupportFilters = { q: "", status: "", org: "", role: "" };

export function supportQuery(f: SupportFilters, page: number, sort: { key: string; order: "asc" | "desc" }) {
  return { page, page_size: PAGE_SIZE, sort: sort.key, order: sort.order, q: text(f.q), status: f.status || undefined, org: text(f.org), role: f.role || undefined };
}
