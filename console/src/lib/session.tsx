"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { consoleApi, setSessionHooks } from "./api";
import { CHANGE_PASSWORD_PATH, LOGIN_PATH, guardDecision, type GuardPage } from "./guard";
import type { Me } from "./types";

interface SessionValue {
  me: Me;
  signOut: (everywhere?: boolean) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside of <SessionGate>");
  return value;
}

/**
 * Holds a page back until the server has said who is signed in (`GET /auth/me`): nothing of the panel renders and no panel
 * data is requested before that.  A lost session (a 401 of any later call) sends to the sign-in, a forced password change
 * to its page.
 */
export function SessionGate({ page, children }: { page: GuardPage; children: (me: Me) => ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSessionHooks({
      unauthorized: () => router.replace(`${LOGIN_PATH}?reason=expired`),
      mustChangePassword: () => router.replace(CHANGE_PASSWORD_PATH),
    });
    return () => setSessionHooks({});
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    setFailure(null);
    consoleApi.auth
      .me(controller.signal)
      .then((result) => ({ me: result }) as const)
      .catch((error: unknown) => ({ error }) as const)
      .then((check) => {
        if (controller.signal.aborted) return;
        const decision = guardDecision(check, page);
        if (decision.kind === "allow") setMe(decision.me);
        else if (decision.kind === "redirect") {
          router.replace(decision.reason ? `${decision.to}?reason=${decision.reason}` : decision.to);
        } else if (decision.kind === "error") setFailure(decision.message);
      });
    return () => controller.abort();
  }, [page, router, attempt]);

  if (failure) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div role="alert" className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-slate-900">Не удалось проверить вход</p>
          <p className="mt-1 text-sm text-slate-600">{failure}</p>
          <Button className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
            Повторить
          </Button>
        </div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-label="Проверяем вход">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  const signOut = async (everywhere = false) => {
    try {
      if (everywhere) await consoleApi.auth.logoutAll();
      else await consoleApi.auth.logout();
    } catch {
      /* the server answers 200 even for a dead session; a network failure still leaves the panel */
    }
    setSessionHooks({});
    router.replace(`${LOGIN_PATH}?reason=signed_out`);
  };

  return <SessionContext.Provider value={{ me, signOut }}>{children(me)}</SessionContext.Provider>;
}
