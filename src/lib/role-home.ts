/**
 * Where each role lands: after login, and when it opens another role's
 * workspace by a direct link. One table, so the sign-in page, the password
 * change page and the layout guards cannot drift apart.
 */
export const ROLE_HOME: Record<string, string> = {
  owner: "/owner/dashboard",
  admin: "/admin/diagnostics",
  teacher: "/teacher/dashboard",
};

/** Sign-in fallback for an unknown role (kept as it was before the table was shared). */
export const DEFAULT_HOME = "/admin/diagnostics";

/** Home of a known role, or ``null`` (unknown, missing). */
export function roleHome(role?: string | null): string | null {
  return (role && Object.prototype.hasOwnProperty.call(ROLE_HOME, role) && ROLE_HOME[role]) || null;
}

/** Home right after sign-in: the role's own, else the admin default. */
export function loginHome(role?: string | null): string {
  return roleHome(role) ?? DEFAULT_HOME;
}

/**
 * Where a signed-in user goes after opening a workspace their role may not
 * use (a teacher on /owner/payments): their own home, never the public
 * landing page. An explicit per-role override wins; a role with no home of
 * its own falls back to ``forbiddenPath``.
 */
export function forbiddenTarget(
  roles: { orgRole?: string | null; accountRole?: string | null },
  options: {
    forbiddenPath: string;
    forbiddenRolePaths?: Partial<Record<string, string>>;
    /** Current path: never "redirect" a user onto the page that just refused them. */
    currentPath?: string | null;
  },
): string {
  const { orgRole, accountRole } = roles;
  const overrides = options.forbiddenRolePaths;
  const target =
    (orgRole && overrides?.[orgRole]) ||
    (accountRole && overrides?.[accountRole]) ||
    roleHome(orgRole) ||
    roleHome(accountRole) ||
    options.forbiddenPath;
  const here = options.currentPath || "";
  if (here && (target === here || here.startsWith(`${target}/`))) return options.forbiddenPath;
  return target;
}

/**
 * The role a signed-in user acts with: the live membership role of the organisation
 * (`org_role`) wins, the account role is the fallback.
 */
export function effectiveRole(user?: { role?: string | null; org_role?: string | null } | null): string | null {
  return user?.org_role || user?.role || null;
}

/** Whether `user` may open a workspace that allows `allowedRoles` (empty list: any signed-in user). */
export function isRoleAllowed(
  allowedRoles: readonly string[],
  user?: { role?: string | null; org_role?: string | null } | null,
): boolean {
  if (allowedRoles.length === 0) return true;
  const role = effectiveRole(user);
  return role !== null && allowedRoles.includes(role);
}

/**
 * Workspaces and who may enter them. `/owner/*` is for the owner only: an administrator has his
 * own `/admin/*` (same screens that he is allowed to use), a teacher has `/teacher/*`.
 */
export const WORKSPACE_ROLES = {
  owner: ["owner"],
  admin: ["admin", "owner"],
  teacher: ["teacher"],
} as const;
