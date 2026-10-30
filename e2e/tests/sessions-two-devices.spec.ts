import { test, expect } from "../support/fixtures";
import { devLogin } from "../support/api";
import { AUTH_API } from "../support/env";
import type { Page } from "@playwright/test";

/**
 * ROADMAP #101: one session per signed-in device. Before, a user had ONE refresh token: a sign-in or a refresh on
 * device B signed device A out at A's next refresh. Now every sign-in is its own session; a refresh rotates the token of
 * ITS session only, the token it replaces keeps working for a 60 s grace (two tabs of one browser racing), a logout
 * revokes only the session of that device.
 *
 * Two isolated browser contexts are the two devices; both are the SAME owner, signed in by /auth/dev-login (it issues a
 * separate session per call; no password is typed anywhere). The cookies are the product's: `algo_auth_token` and
 * `algo_refresh_token` (httpOnly, path / since K2-1: the `__Host-` rule needs the root path; a refresh request that carries it proves the
 * cookie reached the route; without it the route answers 401).
 */
const REFRESH_URL = `${AUTH_API}/auth/refresh`;
const REFRESH_COOKIE = "algo_refresh_token";
const greeting = /^(Доброй ночи|Доброе утро|Добрый день|Добрый вечер), Владелец/;

interface Device {
  name: string;
  page: Page;
  /** The address the harness plays the reverse proxy for (X-Real-IP): the device's own rate-limit bucket. */
  ip: string;
}

/** The refresh cookie as the browser would send it to /auth/refresh (undefined = not sent). */
async function refreshCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies(REFRESH_URL);
  return cookies.find((cookie) => cookie.name === REFRESH_COOKIE)?.value;
}

function postRefresh(device: Device) {
  // The body is empty: the route takes the token from the httpOnly cookie, exactly as the app's own refresh does.
  return device.page.request.post(REFRESH_URL, { data: {}, headers: { "X-Real-IP": device.ip } });
}

/** One sequential refresh of a device: 200, a rotated token in the cookie jar, the new cookie set on the auth path. */
async function refresh(device: Device) {
  const before = await refreshCookie(device.page);
  expect(before, `${device.name}: the refresh cookie is sent to ${REFRESH_URL}`).toBeTruthy();
  const res = await postRefresh(device);
  expect(res.status(), `${device.name}: POST /auth/refresh`).toBe(200);
  expect(res.headers()["set-cookie"] ?? "", `${device.name}: the answer sets the refresh cookie`).toMatch(
    /algo_refresh_token=[^\n]*Path=\/(;|$)/i,
  );
  const after = await refreshCookie(device.page);
  expect(after, `${device.name}: the jar holds the new refresh token`).toBeTruthy();
  expect(after, `${device.name}: the refresh token is rotated`).not.toBe(before);
}

async function expectDashboard(device: Device) {
  await device.page.goto("/owner/dashboard");
  await expect(device.page, `${device.name}: still signed in (no redirect to /login)`).toHaveURL(/\/owner\/dashboard/);
  await expect(device.page.getByRole("main").getByRole("heading", { level: 1 }), `${device.name}: the dashboard opens`).toHaveText(greeting);
}

test("two devices of one user: interleaved refreshes keep both signed in, a logout ends only its own device, parallel refreshes survive", async ({ signIn, request }) => {
  test.setTimeout(150_000); // about 20 dashboard loads and 12 refreshes in a row
  const sessionA = await devLogin("owner");
  const sessionB = await devLogin("owner");
  const a: Device = { name: "device A", page: await signIn(sessionA), ip: sessionA.api.clientIp };
  const b: Device = { name: "device B", page: await signIn(sessionB), ip: sessionB.api.clientIp };

  // --- two sessions, not one: each device holds its own refresh token
  const startA = await refreshCookie(a.page);
  const startB = await refreshCookie(b.page);
  expect(startA, "A has a refresh cookie").toBeTruthy();
  expect(startB, "B has a refresh cookie").toBeTruthy();
  expect(startA, "the two sign-ins hold different refresh tokens").not.toBe(startB);
  await expectDashboard(a);
  await expectDashboard(b);

  // --- A, B, A, B ... four rounds: every refresh is 200 and after every step BOTH devices still open the dashboard
  for (let round = 1; round <= 4; round++) {
    for (const device of [a, b]) {
      await refresh(device);
      await expectDashboard(a);
      await expectDashboard(b);
    }
  }

  // --- logout on A (the UI's «Выйти из системы»): A lands on /login with no cookie, B is untouched
  const lastTokenOfA = await refreshCookie(a.page);
  await expectDashboard(a);
  const loggedOut = a.page.waitForResponse((res) => res.url().endsWith("/auth/logout") && res.request().method() === "POST");
  await a.page.locator("aside button[aria-expanded]").click();
  await a.page.locator("#sidebar-profile-menu").getByRole("button", { name: "Выйти из системы" }).click();
  expect((await loggedOut).status(), "POST /auth/logout of A").toBe(200);
  await expect(a.page, "A lands on the login page").toHaveURL(/\/login/);
  await expect.poll(() => refreshCookie(a.page), { message: "A's refresh cookie is cleared" }).toBeUndefined();
  await a.page.goto("/owner/dashboard");
  await expect(a.page, "A is signed out: a protected page sends to the login").toHaveURL(/\/login\?redirect=/);
  // the session of A is revoked on the server, not only forgotten by the browser: its last token no longer refreshes
  const revoked = await request.post(REFRESH_URL, { data: {}, headers: { "X-Real-IP": a.ip, Cookie: `${REFRESH_COOKIE}=${lastTokenOfA}` } }); // (K2-1: the refresh token is read from the cookie only)
  expect(revoked.status(), "A's last refresh token after its logout").toBe(401);

  await expectDashboard(b);
  await refresh(b);
  await expectDashboard(b);

  // --- two refreshes at the same moment from ONE device (two tabs): both are answered, and the device goes on
  const [first, second] = await Promise.all([postRefresh(b), postRefresh(b)]);
  expect(first.status(), "parallel refresh 1 of B").toBe(200);
  expect(second.status(), "parallel refresh 2 of B").toBe(200);
  await refresh(b); // with whichever token the jar kept after the race: the grace sibling is a live token of the session
  await expectDashboard(b);
});
