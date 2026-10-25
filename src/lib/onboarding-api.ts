/**
 * The two public calls of the invitation-only onboarding: the demo request and the «set a password» link.
 * ONE typed module: when API_CONTRACT.md changes a path or a field, this file (and `demo-request.ts` for the body) is the only place to touch.
 */
import { createJsonClient, seg, type JsonClientConfig } from "./http-json";
import type { DemoRequestBody } from "./demo-request";
import type { PasswordLinkInfo } from "./set-password";

export const AUTH_API_BASE = `${process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:8000"}/api/v1`;

export interface DemoRequestAccepted {
  id?: number | string;
  /** The same e-mail applied within 30 days: the person sees the usual screen anyway. */
  repeat?: boolean;
}

/** What the server returns when a link is used to set the password (the same shape as a sign-in). */
export interface PasswordSetResult {
  user?: { role?: string; org_role?: string | null; [key: string]: unknown };
  org?: Record<string, unknown> | null;
  tokens?: { access_token: string; refresh_token: string } | null;
}

export function createOnboardingApi(config: Partial<JsonClientConfig> = {}) {
  const request = createJsonClient({ baseUrl: AUTH_API_BASE, ...config });
  return {
    /** `POST /public/demo-requests` -> 201. */
    submitDemoRequest: (body: DemoRequestBody) =>
      request<DemoRequestAccepted>("/public/demo-requests", { method: "POST", body }),
    /** `GET /auth/password-links/{token}`: whose link it is. 404 / 410 / `status: used|expired` for a dead one. */
    inspectPasswordLink: (token: string, signal?: AbortSignal) =>
      request<PasswordLinkInfo>(`/auth/password-links/${seg(token)}`, { signal }),
    /** `POST /auth/password-links/{token}`: sets the password, burns the link, signs the person in. */
    setPasswordByLink: (token: string, password: string, passwordConfirm: string) =>
      request<PasswordSetResult>(`/auth/password-links/${seg(token)}`, {
        method: "POST",
        body: { password, password_confirm: passwordConfirm },
      }),
  };
}

export const onboardingApi = createOnboardingApi();
