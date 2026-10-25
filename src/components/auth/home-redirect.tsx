"use client";

import { useEffect } from "react";
import { loginHome } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";

/** A visitor with a session cookie opens `/`: to the cabinet home of the stored profile's role; without a stored profile - the sign-in. */
export function HomeRedirect() {
  useEffect(() => {
    const user = useAuthStore.getState().user;
    // A hard navigation, as the sign-in page does: the middleware sees the cookie, no stale router cache.
    window.location.replace(user ? loginHome(user.org_role || user.role) : "/login");
  }, []);
  return null;
}
