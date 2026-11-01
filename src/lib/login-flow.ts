/** Where a successful sign-in leads (pure, so that node:test loads it as it is). */
import { postLoginTarget } from "./safe-redirect";

/**
 * The page after a sign-in: the page the visitor was bounced from when this role may open it, else the home of the role THE ACCOUNT HAS (`org_role`, else `role`
 * of the answer). The sign-in page has no role choice (owner 01.11): the account decides the cabinet.
 */
export function loginDestination(rawRedirect: unknown, user: { org_role?: string | null; role?: string | null } | null | undefined): string {
  return postLoginTarget(rawRedirect, user?.org_role || user?.role);
}
