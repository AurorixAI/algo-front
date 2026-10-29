import { randomBytes } from "node:crypto";
import { test, expect } from "../support/fixtures";
import { AUTH_API, CONSOLE_ORIGIN } from "../support/env";
import { createPlatformOwner, issueSetPasswordToken, startConsoleServer } from "../support/console";

/**
 * Pack «Консоль-1», the whole invitation chain through the real screens:
 *
 *   demo request (since K3 P2 the form is on the landing: here the same public POST) -> console login (own session, own host) -> «Заявки» -> «Одобрить»
 *   -> «Задать пароль» (/set-password/<token>) -> the owner's cabinet.
 *
 * Seeding: the first console owner is created by the product's own `create_owner` inside the auth container (the e2e
 * helper; in production the owner runs scripts/create_platform_owner.py by hand).  The «Задать пароль» token is issued by the
 * product's `password_links.issue()` inside the container, because this stack has no SMTP and an unsent letter is not logged
 * with its body (the letters themselves are covered by the backend tests).  Everything a person does is done in the browser.
 */
const rand = (n: number) => randomBytes(n).toString("hex");

test.describe.serial("Консоль-1: заявка → одобрение → «Задать пароль» → кабинет", () => {
  const tag = rand(3);
  const demo = {
    fullName: `Каримов Алишер ${tag}`,
    centre: `Учебный центр «К1-${tag}»`,
    city: "Ташкент",
    email: `k1-${tag}@e2e.algo.test`,
  };
  const staffEmail = `console-owner-${tag}@e2e.algo.test`;
  const staffPassword = `Console-${rand(10)}`;
  const newPassword = `Cabinet-${rand(8)}`;
  let closeConsole: () => Promise<void>;
  let token = "";

  test.beforeAll(async () => {
    ({ close: closeConsole } = await startConsoleServer());
    createPlatformOwner(staffEmail, staffPassword);
  });
  test.afterAll(async () => {
    await closeConsole?.();
  });

  test("closed registration: the old demo addresses lead to the landing (SITE_URL/#demo), the sign-in offers «Запросить демо» and no registration", async ({ anonymous }) => {
    const page = await anonymous();
    // the e2e build has no NEXT_PUBLIC_SITE_URL: «the landing» is this origin, `/#demo`, and `/` has no page of its own -> the sign-in
    await page.goto("/register?utm_source=e2e&token=nope");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/request-demo");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    const footer = page.getByText("Нет доступа?");
    await expect(footer).toContainText("Запросить демо");
    await expect(page.getByRole("link", { name: "Запросить демо" })).toHaveAttribute("href", "/#demo");
    await expect(page.getByRole("link", { name: /Зарегистрировать/ })).toHaveCount(0);
    await expect(page.locator('a[href="/register"]')).toHaveCount(0);
  });

  test("a visitor sends the demo request (the landing's POST): validation is the server's, then the request is accepted", async ({ anonymous }) => {
    const page = await anonymous();
    const bad = await page.request.post(`${AUTH_API}/public/demo-requests`, { data: { contact_name: "", website: "" } });
    expect(bad.status()).toBe(422);

    const ok = await page.request.post(`${AUTH_API}/public/demo-requests`, {
      data: {
        contact_name: demo.fullName,
        centre_name: demo.centre,
        city: demo.city,
        phone: "+998901234567",
        email: demo.email,
        students_count: 120,
        comment: "Проверка сквозного сценария K1",
        source: { utm_source: "e2e", utm_campaign: "k1" },
        website: "",
      },
    });
    expect(ok.status()).toBe(201);
  });

  test("console: no session -> sign-in; a wrong password is refused calmly; the owner signs in and sees the request", async ({ anonymous }) => {
    const page = await anonymous();
    await page.goto(`${CONSOLE_ORIGIN}/requests/`);
    await expect(page).toHaveURL(/\/login\//);

    await page.getByLabel("Почта").fill(staffEmail);
    await page.getByLabel("Пароль").fill("definitely-wrong-1");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByText("Неверная почта или пароль")).toBeVisible();

    await page.getByLabel("Пароль").fill(staffPassword);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/requests\/$/);
    await expect(page.getByRole("navigation", { name: "Разделы консоли" }).getByRole("link", { name: /Заявки/ })).toBeVisible();

    const row = page.getByRole("button", { name: new RegExp(`Открыть заявку: ${demo.centre}`) });
    await expect(row).toBeVisible();
    await expect(page.getByTestId("new-requests-badge")).toBeVisible();

    // the card, then the approval through its confirmation dialog
    await row.click();
    await expect(page.getByRole("dialog", { name: demo.centre })).toContainText("+998 90 123 45 67");
    await page.getByRole("button", { name: "Одобрить", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Одобрить заявку" });
    await expect(dialog.getByLabel("Почта владельца (логин)")).toHaveValue(demo.email);
    await dialog.getByRole("button", { name: "Одобрить и отправить приглашение" }).click();
    await expect(page.getByText(/Центр создан:/)).toBeVisible();

    // the card is final now: no second approval; the list shows «Одобрена»
    await expect(page.getByRole("button", { name: "Одобрить", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("row", { name: new RegExp(demo.centre) })).toContainText("Одобрена");

    // the centre exists in «Центры»
    await page.getByRole("navigation", { name: "Разделы консоли" }).getByRole("link", { name: "Центры" }).click();
    await expect(page.getByRole("row", { name: new RegExp(demo.centre) })).toContainText("Активен");

    // «Выйти»: the session ends, the panel is closed again
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login\//);
    await page.goto(`${CONSOLE_ORIGIN}/centres/`);
    await expect(page).toHaveURL(/\/login\//);
  });

  test("the new owner follows «Задать пароль», sets the password and lands in the cabinet; the link works once", async ({ anonymous }) => {
    token = issueSetPasswordToken(demo.email);
    const page = await anonymous();
    await page.goto(`/set-password/${token}`);
    await expect(page.getByTestId("set-password-greeting")).toContainText("Здравствуйте");
    await expect(page.getByText(demo.centre)).toBeVisible();
    await expect(page.getByText(demo.email)).toBeVisible();

    await page.getByLabel("Пароль", { exact: true }).fill(newPassword);
    await page.getByLabel("Повторите пароль").fill(`${newPassword}x`);
    await expect(page.getByRole("button", { name: /Задать пароль и войти/ })).toBeDisabled();
    await page.getByLabel("Повторите пароль").fill(newPassword);
    await page.getByRole("button", { name: /Задать пароль и войти/ }).click();

    await expect(page).toHaveURL(/\/owner\/dashboard/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toContainText(/Доброй ночи|Доброе утро|Добрый день|Добрый вечер/);

    // the same link in a fresh browser: already used
    const other = await anonymous();
    await other.goto(`/set-password/${token}`);
    await expect(other.getByTestId("link-used")).toBeVisible();
    // and a made-up one: not found
    await other.goto(`/set-password/${rand(24)}`);
    await expect(other.getByTestId("link-invalid")).toBeVisible();
  });

  test("the new owner can sign in to the cabinet with the new password", async ({ anonymous }) => {
    const page = await anonymous();
    await page.goto("/login");
    await page.getByLabel("Email").fill(demo.email);
    await page.getByLabel("Пароль").fill(newPassword);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/owner\/dashboard/);
  });
});
