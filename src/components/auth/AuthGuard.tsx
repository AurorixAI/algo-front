"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { REFRESH_UNAVAILABLE_MESSAGE } from "@/lib/api";
import { forbiddenTarget, isRoleAllowed } from "@/lib/role-home";
import { loginUrlForPage } from "@/lib/safe-redirect";

type UserRole = "owner" | "admin" | "teacher" | "superadmin";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Allowed roles. If empty, any authenticated user is allowed. */
  allowedRoles?: UserRole[];
  /** Where to redirect if not authenticated */
  loginPath?: string;
  /** Last resort if authenticated but wrong role and the role has no home of its own */
  forbiddenPath?: string;
  /** Overrides for the role's own home (login's role -> home table) on a direct link to the wrong workspace. */
  forbiddenRolePaths?: Partial<Record<UserRole, string>>;
}

/**
 * Client-side auth guard. Wraps protected pages/layouts.
 * 
 * - Checks if user is authenticated via Zustand store
 * - Optionally checks user role against allowedRoles
 * - Shows loading spinner while checking
 * - Redirects to login if unauthenticated - with the page asked for as `?redirect=` (the sign-in page returns there)
 * - No answer from the server (no network, rate limit, server error) is NOT "unauthenticated": the stored
 *   sign-in stays, the page shows a retry instead of throwing the user out
 * - Wrong role: redirects to that role's own home (the sign-in table), not the landing page
 */
export function AuthGuard({
  children,
  allowedRoles = [],
  loginPath = "/login",
  forbiddenPath = "/",
  forbiddenRolePaths,
}: AuthGuardProps) {
  const router = useRouter();
  const { refreshProfile } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const rolesKey = JSON.stringify(allowedRoles);

  useEffect(() => {
    // The sign-in address for a visitor without a session: the page asked for travels along.
    const signIn = () =>
      loginPath === "/login" ? loginUrlForPage(window.location.pathname, window.location.search) : loginPath;

    async function checkAuth() {
      // Always ask the server via the httpOnly-cookie-backed /auth/me —
      // never gate on the zustand-persisted `user`/`isAuthenticated` first.
      // After a full page reload (e.g. window.location.href on login),
      // zustand's persist middleware rehydrates from localStorage
      // asynchronously, so those fields can still be at their default
      // (false/null) the instant this effect runs — gating on them here
      // was bouncing a freshly-logged-in user straight back to /login
      // before refreshProfile() ever got a chance to run.
      try {
        const outcome = await refreshProfile();
        if (outcome === "unavailable") {
          // No verdict on the session: stay put, keep the stored sign-in, offer a retry.
          setUnavailable(true);
          return;
        }
      } catch {
        router.replace(signIn());
        return;
      }

      const currentUser = useAuthStore.getState().user;

      if (!currentUser) {
        router.replace(signIn());
        return;
      }

      // Imported teacher accounts start with a temporary password and must
      // set their own before doing anything else.
      if (currentUser.must_change_password) {
        router.replace("/change-password");
        return;
      }

      // Check role if allowedRoles specified
      if (allowedRoles.length > 0) {
        // The live membership role decides (org_role, else the account role).
        if (!isRoleAllowed(allowedRoles, currentUser)) {
          const orgRole = currentUser.org_role as UserRole;
          const accountRole = currentUser.role as UserRole;
          router.replace(
            forbiddenTarget(
              { orgRole, accountRole },
              { forbiddenPath, forbiddenRolePaths, currentPath: window.location.pathname },
            ),
          );
          return;
        }
      }

      setIsAuthorized(true);
      setIsChecking(false);
    }

    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey, loginPath, forbiddenPath, router, refreshProfile, attempt]);

  if (unavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-center px-6" role="alert">
          <p className="text-sm text-slate-600">{REFRESH_UNAVAILABLE_MESSAGE}</p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            onClick={() => {
              setUnavailable(false);
              setAttempt((n) => n + 1);
            }}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (isChecking && !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
          </div>
          <p className="text-sm text-slate-500">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
