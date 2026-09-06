"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, type AuthUser, type OrgInfo } from "./api";

interface AuthState {
  user: AuthUser | null;
  org: OrgInfo | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
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
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  clearError: () => void;
  setFromTokens: (user: AuthUser, accessToken: string, refreshToken: string, org?: OrgInfo | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      org: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      errorCode: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null, errorCode: null });
        try {
          const response = await authApi.login(email, password);
          set({
            user: response.user,
            org: response.org,
            token: response.tokens.access_token,
            refreshToken: response.tokens.refresh_token,
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
            token: response.tokens.access_token,
            refreshToken: response.tokens.refresh_token,
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
        try {
          await authApi.logout();
        } catch {
          // ignore error on logout
        }
        set({
          user: null,
          org: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshProfile: async () => {
        try {
          const user = await authApi.me();
          set({ user, isAuthenticated: true });
        } catch {
          set({
            user: null,
            org: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      clearError: () => set({ error: null, errorCode: null }),

      setFromTokens: (user, accessToken, refreshToken, org = null) => {
        set({
          user,
          org,
          token: accessToken,
          refreshToken,
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
        // token and refreshToken intentionally NOT persisted to localStorage
        // — httpOnly cookies handle auth, keeping tokens out of XSS reach
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
  phase: string | null;
  currentTask: any | null;
  itemNumber: number;
  theta: number;
  thetaSe: number;
  accuracy: number;
  isComplete: boolean;
  startedAt: number | null;

  // Actions
  startSession: (sessionId: string, phase: string, firstTask: any, itemNumber?: number) => void;
  setNextTask: (task: any, theta: number, thetaSe: number, accuracy: number, phase: string, itemNumber: number) => void;
  complete: () => void;
  reset: () => void;
}

export const useDiagnosticStore = create<DiagnosticState>()((set) => ({
  sessionId: null,
  phase: null,
  currentTask: null,
  itemNumber: 0,
  theta: 0,
  thetaSe: 1.0,
  accuracy: 0,
  isComplete: false,
  startedAt: null,

  startSession: (sessionId, phase, firstTask, itemNumber = 1) =>
    set({
      sessionId,
      phase,
      currentTask: firstTask,
      itemNumber,
      theta: 0,
      thetaSe: 1.0,
      accuracy: 0,
      isComplete: false,
      startedAt: Date.now(),
    }),

  setNextTask: (task, theta, thetaSe, accuracy, phase, itemNumber) =>
    set({
      currentTask: task,
      theta,
      thetaSe,
      accuracy,
      phase,
      itemNumber,
    }),

  complete: () => set({ isComplete: true, currentTask: null }),

  reset: () =>
    set({
      sessionId: null,
      phase: null,
      currentTask: null,
      itemNumber: 0,
      theta: 0,
      thetaSe: 1.0,
      accuracy: 0,
      isComplete: false,
      startedAt: null,
    }),
}));
