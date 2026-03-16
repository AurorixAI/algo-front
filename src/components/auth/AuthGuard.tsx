"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

type UserRole = "owner" | "admin" | "teacher" | "superadmin";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Allowed roles. If empty, any authenticated user is allowed. */
  allowedRoles?: UserRole[];
  /** Where to redirect if not authenticated */
  loginPath?: string;
  /** Where to redirect if authenticated but wrong role */
  forbiddenPath?: string;
}

/**
 * Client-side auth guard. Wraps protected pages/layouts.
 * 
 * - Checks if user is authenticated via Zustand store
 * - Optionally checks user role against allowedRoles
 * - Shows loading spinner while checking
 * - Redirects to login if unauthenticated
 * - Redirects to forbidden path if role mismatch
 */
export function AuthGuard({
  children,
  allowedRoles = [],
  loginPath = "/login",
  forbiddenPath = "/",
}: AuthGuardProps) {
  const router = useRouter();
  const { user, token, isAuthenticated, refreshProfile } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const rolesKey = JSON.stringify(allowedRoles);

  useEffect(() => {
    async function checkAuth() {
      // No token AND not authenticated → redirect to login
      if (!token && !isAuthenticated) {
        router.replace(loginPath);
        return;
      }

      // If we don't have user data yet, try to refresh profile (cookies handle auth)
      if (!user) {
        try {
          await refreshProfile();
        } catch {
          router.replace(loginPath);
          return;
        }
      }

      // Get fresh user from store after potential refresh
      const currentUser = useAuthStore.getState().user;

      if (!currentUser) {
        router.replace(loginPath);
        return;
      }

      // Check role if allowedRoles specified (check both role and org_role)
      if (allowedRoles.length > 0) {
        const hasRole = allowedRoles.includes(currentUser.role as UserRole) ||
          allowedRoles.includes(currentUser.org_role as UserRole);
        if (!hasRole) {
          router.replace(forbiddenPath);
          return;
        }
      }

      setIsAuthorized(true);
      setIsChecking(false);
    }

    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, user, rolesKey, loginPath, forbiddenPath, router, refreshProfile]);

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
