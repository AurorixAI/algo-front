"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, isTransientApiError, type AuthUser, type OrgInfo } from "./api";

/**
 * How the check of the stored sign-in against the server ended:
 * - ok: the server knows the user (the store holds the fresh profile);
 * - ended: the server says the session is over (the store was cleared; api() is sending the tab to the login);
 * - unavailable: no verdict (no network, the limiter, a server error): the store is left exactly as it was.
 */
export type ProfileRefresh = "ok" | "ended" | "unavailable";

/** K2-2 (F): `/auth/me` answered 403 (the centre is not active / blocked / the access was withdrawn): the text the screen «Доступ закрыт» shows instead of the loop through the sign-in. */
export const ACCESS_CLOSED_TEXT = "Доступ закрыт. Обратитесь к руководству центра";

export function accessProblemOf(error: unknown): string | null {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  if (status !== 403) return null;
  // K2-2 R3 (13): the server's own Russian text is shown as it is; anything else (a proxy's «Forbidden», an empty body) becomes the standard sentence
  return typeof message === "string" && /[а-яё]/i.test(message) ? message.trim() : ACCESS_CLOSED_TEXT;
}

interface AuthState {
  user: AuthUser | null;
  org: OrgInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;
  /** Set when `/auth/me` said 403 (see `accessProblemOf`); cleared by the next good answer. */
  accessProblem: string | null;

  // Actions
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  applyOrg: (data: {
    org_name: string;
    org_type?: string;
    city?: string;
    phone?: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) => Promise<void>;
  acceptInvite: (data: {
    code: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }) => Promise<void>;
  /** Resolves `true` when the SERVER confirmed the sign-out (the cookies are gone); the stored sign-in is dropped either way. */
  logout: () => Promise<boolean>;
  refreshProfile: () => Promise<ProfileRefresh>;
  updateUser: (updates: Partial<AuthUser>) => void;
  clearError: () => void;
  /** The sign-in is known from an answer that set the cookies (a link): K2-1 (A2) - no token is ever read or kept here. */
  setSession: (user: AuthUser, org?: OrgInfo | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      org: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      errorCode: null,
      accessProblem: null,

      login: async (email, password, remember = false) => {
        set({ isLoading: true, error: null, errorCode: null });
        try {
          const response = await authApi.login(email, password, remember);
          set({
            user: response.user,
            org: response.org,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            errorCode: null,
          });
        } catch (err: any) {
          set({
            isLoading: false,
            error: err.message || "Ошибка авторизации",
            errorCode: err.code || null,
          });
          throw err;
        }
      },

      applyOrg: async (data) => {
        set({ isLoading: true, error: null });
        try {
          await authApi.apply(data);
          // Registration now returns a pending response — no tokens issued.
          // The user will receive an activation email after admin approval.
          set({
            isLoading: false,
            error: null,
          });
        } catch (err: any) {
          set({
            isLoading: false,
            error: err.message || "Ошибка регистрации",
          });
          throw err;
        }
      },

      acceptInvite: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.acceptInvite(data);
          set({
            user: response.user,
            org: response.org,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err: any) {
          set({
            isLoading: false,
            error: err.message || "Ошибка принятия приглашения",
          });
          throw err;
        }
      },

      logout: async () => {
        let confirmed = true;
        try {
          await authApi.logout();
        } catch {
          confirmed = false; // the page leaves all the same; the caller tells the person that the server did not confirm
        }
        set({
          user: null,
          org: null,
          isAuthenticated: false,
          error: null,
        });
        return confirmed;
      },

      refreshProfile: async () => {
        const signedOut = {
          user: null,
          org: null,
          isAuthenticated: false,
        };
        try {
          const user = await authApi.me();
          // a dead session is a 401 ApiError (caught below); an empty answer is treated the same way
          if (!user) {
            set(signedOut);
            return "ended";
          }
          set({ user, isAuthenticated: true, accessProblem: null });
          return "ok";
        } catch (err) {
          // A hiccup says nothing about the session: keep the stored sign-in and let the caller retry.
          if (isTransientApiError(err)) return "unavailable";
          set({ ...signedOut, accessProblem: accessProblemOf(err) });
          return "ended";
        }
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      clearError: () => set({ error: null, errorCode: null }),

      setSession: (user, org = null) => {
        set({
          user,
          org,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: "algo-auth",
      partialize: (state) => ({
        user: state.user,
        org: state.org,
        // K2-1 (A2): no token exists in the page at all (the cookies are httpOnly); this record only remembers who the
        // cookies belong to, and /auth/me decides whether they are still alive
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ============================================================================
// DIAGNOSTIC SESSION STORE (for CAT)
// ============================================================================

interface DiagnosticState {
  sessionId: string | null;
  currentTask: any | null;
  itemNumber: number;
  isComplete: boolean;
  startedAt: number | null;

  // Actions
  startSession: (sessionId: string, firstTask: any, itemNumber?: number) => void;
  setNextTask: (task: any, itemNumber: number) => void;
  complete: () => void;
  restoreCompleted: (sessionId: string) => void;
  reset: () => void;
}

export const useDiagnosticStore = create<DiagnosticState>()((set) => ({
  sessionId: null,
  currentTask: null,
  itemNumber: 0,
  isComplete: false,
  startedAt: null,

  startSession: (sessionId, firstTask, itemNumber = 1) =>
    set({
      sessionId,
      currentTask: firstTask,
      itemNumber,
      isComplete: false,
      startedAt: Date.now(),
    }),

  setNextTask: (task, itemNumber) => set({ currentTask: task, itemNumber }),

  complete: () => set({ isComplete: true, currentTask: null }),
  restoreCompleted: (sessionId) => set({ sessionId, isComplete: true, currentTask: null }),

  reset: () =>
    set({
      sessionId: null,
      currentTask: null,
      itemNumber: 0,
      isComplete: false,
      startedAt: null,
    }),
}));
