/** Shapes of the accounting server's `/api/v1/platform/*` answers (API_CONTRACT.md v1). One file: a contract change is edited here and in api.ts. */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Named {
  id: string;
  name: string;
}

export interface Me {
  user: { id: string; email: string; first_name: string; last_name: string; name: string };
  role: Named | null;
  is_owner: boolean;
  permissions: string[];
  must_change_password: boolean;
  totp_enabled: boolean;
  session: { expires_at: string };
}

export type RequestStatus = "new" | "contacted" | "demo_done" | "approved" | "declined" | "spam";

/** K3 (A8): how the two letters of a request went. `null` = no letter / a request made before K3. */
export type MailStatus = "pending" | "sent" | "failed";
export interface RequestMail {
  team: MailStatus | null;
  applicant: MailStatus | "cap" | null;
}

/**
 * K3 fields of a request (K3_API.md §4).  All optional on the client: a server that is a step behind sends none of them,
 * and the console must still draw the card (an absent value is simply not shown).
 */
export interface DemoRequestDetails {
  org_type?: string | null;
  address?: string | null;
  branches_count?: number | null;
  position?: string | null;
  preferred_contact_time?: string | null;
  needs?: string[] | null;
  current_tool?: string | null;
  heard_from?: string | null;
  locale?: string | null;
  consent_at?: string | null;
  mail?: RequestMail | null;
  /** The mailbox of an OPEN request already belongs to a user of ALGO (approve would answer 409 email_in_use). */
  email_in_algo?: boolean;
}

export interface DemoRequest extends DemoRequestDetails {
  id: string;
  contact_name: string;
  centre_name: string;
  city: string;
  phone: string;
  email: string;
  students_count: number | null;
  status: RequestStatus;
  is_repeat: boolean;
  source: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  handled_by: Named | null;
  org_id: string | null;
}

export type RequestCounts = Record<RequestStatus | "all", number>;

export interface DemoRequestList extends Page<DemoRequest> {
  counts: RequestCounts;
}

export interface RequestNote {
  id: string;
  author: Named;
  text: string;
  created_at: string;
}

export interface AuditRow {
  id: string;
  created_at: string;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  label: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
}

export interface DemoRequestCard extends DemoRequest {
  comment: string | null;
  decline_reason: string | null;
  notes: RequestNote[];
  history: AuditRow[];
  same_email: { id: string; created_at: string; status: RequestStatus; centre_name: string }[];
  org: Named | null;
}

export interface ApproveBody {
  org_name?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_email?: string;
}

export interface ApproveResult {
  request: DemoRequestCard;
  org: Named;
  owner: { id: string; email: string; name: string };
  invite: { expires_at: string; email_sent: boolean };
}

export type OrgStatus = "active" | "blocked" | "pending" | "rejected" | "suspended";

export interface Org {
  id: string;
  name: string;
  city: string | null;
  status: OrgStatus;
  blocked_at: string | null;
  plan: string | null;
  owner: { id: string; name: string; email: string } | null;
  students: number;
  teachers: number;
  groups: number;
  active_users_7d: number;
  active_users_30d: number;
  last_login_at: string | null;
  max_students: number | null;
  max_teachers: number | null;
  created_at: string;
}

export interface OrgMember {
  user_id: string;
  name: string;
  email: string;
  org_role: string;
  is_active: boolean;
  last_login_at: string | null;
}

/** The «Из заявки» block of a centre: present ONLY for a role with `requests.view` and a centre that came from a request. */
export interface OrgRequestInfo {
  id: string;
  created_at: string;
  needs: string[] | null;
  current_tool: string | null;
  heard_from: string | null;
  branches_count: number | null;
  position: string | null;
  preferred_contact_time: string | null;
}

export interface OrgCard extends Org {
  org_type?: string | null;
  /** Absent: the role has no `requests.view` (or an older server).  `null`: the centre has no source request. */
  request?: OrgRequestInfo | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  blocked_reason: string | null;
  members: OrgMember[];
  usage_30d: { attendance_marks: number | null; payments: number | null; exams: number | null; diagnostics: number | null };
  history: AuditRow[];
}

export interface LimitsResult {
  org: Org;
  warnings: string[];
}

export type UserStatus = "active" | "never_logged_in" | "blocked" | "inactive";

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: string;
  org: { id: string; name: string; org_role: string; blocked: boolean } | null;
  is_active: boolean;
  blocked: boolean;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
}

export interface UserCard extends PlatformUser {
  memberships: { org_id: string; org_name: string; org_role: string; is_active: boolean; org_blocked: boolean }[];
  login_count: number;
  active_sessions: number;
  pending_link: { purpose: string; expires_at: string } | null;
  block: { blocked_at: string; reason: string } | null;
  history: AuditRow[];
}

export interface LinkSent {
  expires_at: string;
  email_sent: boolean;
}

export interface PermissionInfo {
  key: string;
  label: string;
  group: string;
  active: boolean;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  is_template: boolean;
  is_system: boolean;
  staff_count: number;
}

export interface Staff {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
  role: Named | null;
  is_owner: boolean;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  locked_until: string | null;
  created_at: string;
}

export interface StaffCreateBody {
  email: string;
  first_name: string;
  last_name: string;
  role_id: string;
  password: string;
  is_owner?: boolean;
}

export interface AuditAction {
  action: string;
  label: string;
}
