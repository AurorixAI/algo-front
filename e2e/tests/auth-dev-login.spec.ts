import { test, expect } from "../support/fixtures";
import { devLogin } from "../support/api";

/**
 * The harness signs people in with /auth/dev-login (APP_ENV=development, no password anywhere). This spec
 * proves that this door works for the three roles AND that the cookie policy is the http-friendly one
 * (httpOnly, NOT Secure - Secure is for staging/production only), so every other spec can rely on it.
 */
test.describe("dev-login", () => {
  for (const [role, home, heading] of [
    ["owner", /\/owner\/dashboard/, /Добрый .*, Владелец/],
    ["teacher", /\/teacher\/dashboard/, /Добрый .*, Учитель/],
  ] as const) {
    test(`${role}: cookie session opens the workspace`, async ({ signIn }) => {
      const session = await devLogin(role);
      const page = await signIn(session);
      await page.goto(`/${role}/dashboard`);
      await expect(page).toHaveURL(home);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(heading);

      const cookies = await page.context().cookies();
      const access = cookies.find((c) => c.name === "algo_auth_token");
      expect(access, "access cookie").toBeTruthy();
      expect(access!.httpOnly).toBe(true);
      expect(access!.secure, "no Secure flag on http://localhost").toBe(false);
    });
  }

  test("admin: lands in the admin workspace", async ({ signIn }) => {
    const page = await signIn(await devLogin("admin"));
    await page.goto("/admin/diagnostics");
    await expect(page).toHaveURL(/\/admin\//);
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "Ученики" })).toBeVisible();
  });

  test("no session: a protected page sends to the login", async ({ anonymous }) => {
    const page = await anonymous();
    await page.goto("/owner/payments");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(page.getByRole("button", { name: /Войти/ })).toBeVisible();
  });
});
