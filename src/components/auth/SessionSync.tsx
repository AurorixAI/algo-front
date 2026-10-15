"use client";

import { useEffect, useRef } from "react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { loginUrlForPage } from "@/lib/safe-redirect";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { useExcuseBadge } from "@/lib/excuse-badge";
import { useToast } from "@/components/ui/toast";
import {
  AUTH_STORAGE_KEY,
  SESSION_NOTICE_KEY,
  eventNeedsVerification,
  isWorkspacePath,
  meOutcomeFromError,
  parsePersistedUser,
  sessionVerdict,
  type MeOutcome,
  type SessionVerdict,
} from "@/lib/session-sync";

/** A returning tab asks the server who is signed in at most this often (focus and visibilitychange share it). */
const RECHECK_MIN_GAP_MS = 30_000;

/**
 * The login keeps the page the user was on (`?redirect=`): api() has sent the tab there already when the
 * session is dead, and this must not undo it with a bare /login.
 */
function withReturnUrl(verdict: Extract<SessionVerdict, { action: "redirect" }>): Extract<SessionVerdict, { action: "redirect" }> {
  return verdict.target === "/login"
    ? { ...verdict, target: loginUrlForPage(window.location.pathname, window.location.search) }
    : verdict;
}

async function askServer(): Promise<MeOutcome> {
  try {
    const user = await authApi.me();
    // api() answers `undefined` after it has sent the tab to the login itself (401 and no refresh).
    return user?.id ? { ok: true, user } : { ok: false, status: 401 };
  } catch (error) {
    return meOutcomeFromError(error);
  }
}

/**
 * Keeps an open tab honest when the shared sign-in changes in another tab. A storage event or the tab
 * coming back is only a hint: the tab asks `/auth/me` and `sessionVerdict` (pure, tested) decides - to
 * the login only when the server says 401/403, to the new role's home only when the server reports
 * another user or role, and nothing at all on a network error or a 5xx. One redirect per page life
 * (`handled`), one check at a time (a hint that arrives meanwhile re-runs it), so there is no loop.
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

    const redirect = (verdict: Extract<SessionVerdict, { action: "redirect" }>) => {
      handled.current = true;
      // Whatever was counted for the previous user is not the new user's.
      usePaymentsSummary.getState().reset();
      useExcuseBadge.getState().reset();
      try {
        if (verdict.notice) window.sessionStorage.setItem(SESSION_NOTICE_KEY, verdict.notice);
      } catch {
        // see above
      }
      window.location.replace(verdict.target);
    };

    let inFlight = false;
    let rerun = false;
    let lastCheck = 0;

    const check = () => {
      if (handled.current || !isWorkspacePath(window.location.pathname)) return;
      const tabUser = useAuthStore.getState().user;
      if (!tabUser?.id) return;
      if (inFlight) {
        rerun = true; // a hint that came while the answer was on its way may be newer than the answer
        return;
      }
      inFlight = true;
      lastCheck = Date.now();
      void askServer()
        .then((outcome) => {
          const verdict = sessionVerdict(tabUser, outcome);
          if (verdict.action === "redirect" && !handled.current) redirect(withReturnUrl(verdict));
        })
        .finally(() => {
          inFlight = false;
          if (rerun && !handled.current) {
            rerun = false;
            check();
          }
        });
    };

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      // key === null: localStorage.clear().
      if (event.key !== null && event.key !== AUTH_STORAGE_KEY) return;
      const eventUser = event.key === null ? null : parsePersistedUser(event.newValue);
      if (eventNeedsVerification(useAuthStore.getState().user, eventUser)) check();
    };

    // Coming back to the tab fires both "focus" and "visibilitychange": one shared, throttled check.
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < RECHECK_MIN_GAP_MS) return;
      check();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  // showToast is stable (useCallback); the listeners must be attached once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{toastNode}</>;
}
