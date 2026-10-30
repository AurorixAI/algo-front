/**
 * The public call of the invitation-only onboarding that stays in the product: the «set a password» link.
 * (The demo request form moved to the landing in K3 P2; its field logic is `lib/portable/demo-form.ts`.)
 * ONE typed module: when API_CONTRACT.md changes a path or a field, this file is the only place to touch.
 */
import { createJsonClient, seg, type JsonClientConfig } from "./http-json";
import { serviceApiV1 } from "./api-base";
import type { PasswordLinkInfo } from "./set-password";

// An empty NEXT_PUBLIC_AUTH_API_URL = the site the page was opened from (K3 P1): see lib/api-base.ts.
export const AUTH_API_BASE = serviceApiV1(process.env.NEXT_PUBLIC_AUTH_API_URL, "http://localhost:8000");

/** What the server returns when a link is used to set the password (the same shape as a sign-in: who signed in; the cookies carry the session). */
export interface PasswordSetResult {
  user?: { role?: string; org_role?: string | null; [key: string]: unknown };
  org?: Record<string, unknown> | null;
}

export function createOnboardingApi(config: Partial<JsonClientConfig> = {}) {
  const request = createJsonClient({ baseUrl: AUTH_API_BASE, ...config });
  return {
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
