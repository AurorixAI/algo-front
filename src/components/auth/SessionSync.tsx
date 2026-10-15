"use client";

import { useEffect, useRef } from "react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { useExcuseBadge } from "@/lib/excuse-badge";
import { useToast } from "@/components/ui/toast";
import {
  AUTH_STORAGE_KEY,
  SESSION_NOTICE_KEY,
  isWorkspacePath,
  parsePersistedUser,
  sessionChange,
  type SessionUser,
} from "@/lib/session-sync";

/** A returning tab asks the server who is signed in at most this often. */
const RECHECK_MIN_GAP_MS = 30_000;

/**
 * Keeps an open tab honest when the shared sign-in changes in another tab: a different user or role,
 * or a sign-out, sends this tab to the right home (or /login) with a one-line notice. The decision is
 * `sessionChange` (pure, tested); this component only listens and navigates. One redirect per page
 * life (`handled`), and a same-user/same-role change does nothing, so there is no loop.
 */
export function SessionSync() {
  const { showToast, toastNode } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    // The notice written before the redirect of the previous page of this tab.
    try {
      const notice = window.sessionStorage.getItem(SESSION_NOTICE_KEY);
      if (notice) {
        window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
        showToast(notice, "warning");
      }
    } catch {
      // sessionStorage can be unavailable (private mode): the redirect still happens, only the notice is lost.
    }

    const apply = (next: SessionUser | null) => {
      if (handled.current || !isWorkspacePath(window.location.pathname)) return;
      const decision = sessionChange(useAuthStore.getState().user, next);
      if (decision.action === "none") return;
      handled.current = true;
      // Whatever was counted for the previous user is not the new user's.
      usePaymentsSummary.getState().reset();
      useExcuseBadge.getState().reset();
      try {
        if (decision.notice) window.sessionStorage.setItem(SESSION_NOTICE_KEY, decision.notice);
      } catch {
        // see above
      }
      window.location.replace(decision.target);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      // key === null: localStorage.clear() - signed out.
      if (event.key !== null && event.key !== AUTH_STORAGE_KEY) return;
      apply(event.key === null ? null : parsePersistedUser(event.newValue));
    };

    let lastCheck = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || handled.current) return;
      if (!useAuthStore.getState().user) return;
      const now = Date.now();
      if (now - lastCheck < RECHECK_MIN_GAP_MS) return;
      lastCheck = now;
      authApi.me().then(apply).catch(() => undefined); // offline / signed out: the guards deal with it
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // showToast is stable (useCallback); the listeners must be attached once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{toastNode}</>;
}
