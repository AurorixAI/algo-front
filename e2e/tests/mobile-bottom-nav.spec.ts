import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * Phones (under 768 px): the left rail is gone and a bar at the bottom edge carries the role's four main sections plus «Ещё».
 * «Ещё» is a sheet with the rest of the menu, the profile, the settings and «Выйти из системы».  The tests are @mobile and
 * skip themselves on the desktop project (the rail is the menu there; permissions.spec.ts covers it).
 *   owner:   Панель, Группы, Ученики, Оплаты | Ещё: Посещаемость, Зарплата, Сотрудники
 *   admin:   Диагностика, Ученики, Группы + Посещения (= Посещаемость; without the payments right) | Ещё: Экзамены
 *   teacher: Дашборд, Расписание, Экзамены, Группы | Ещё: Создать экзамен
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Нижнее меню");
});

const isPhone = (width: number | undefined) => (width ?? 1280) < 768;

test("@mobile owner: the bottom bar replaces the rail; «Ещё» opens the sheet and Escape closes it", async ({ signIn }) => {
  const page = await signIn(org.owner);
  test.skip(!isPhone(page.viewportSize()?.width), "the bottom bar exists only under 768 px");
  await page.goto("/owner/students");

  const bar = page.getByRole("navigation", { name: "Основное меню" });
  await expect(bar).toBeVisible();
  await expect(page.locator("aside")).toBeHidden();
  for (const name of ["Панель", "Группы", "Ученики", "Оплаты"]) {
    await expect(bar.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(bar.getByRole("link", { name: /^Ученики/ })).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { name: /^Посещаемость/ })).toHaveCount(0); // lives in «Ещё»

  await bar.getByRole("button", { name: /^Ещё/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ещё" });
  await expect(sheet).toBeVisible();
  for (const name of ["Посещаемость", "Зарплата", "Сотрудники", "Настройки"]) {
    await expect(sheet.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(sheet.getByRole("button", { name: "Выйти из системы" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // a link of the sheet navigates and closes it
  await bar.getByRole("button", { name: /^Ещё/ }).click();
  await sheet.getByRole("link", { name: /^Посещаемость/ }).click();
  await expect(page).toHaveURL(/\/owner\/attendance/);
  await expect(sheet).toHaveCount(0);
  // the page lives inside the sheet: «Ещё» is the current place of the bar
  await expect(bar.getByRole("button", { name: /^Ещё/ })).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalScroll(page);

  // a bar link navigates too and is the current page afterwards
  await bar.getByRole("link", { name: /^Группы/ }).click();
  await expect(page).toHaveURL(/\/owner\/groups/);
  await expect(bar.getByRole("link", { name: /^Группы/ })).toHaveAttribute("aria-current", "page");
});

test("@mobile admin: four sections in the bar, «Экзамены» in «Ещё»", async ({ signIn }) => {
  await org.setPaymentSettings({ admin_can_manage: false });
  const admin = await org.addStaff("admin", "Нижнин");
  const page = await signIn(admin);
  test.skip(!isPhone(page.viewportSize()?.width), "the bottom bar exists only under 768 px");
  await page.goto("/admin/students");

  const bar = page.getByRole("navigation", { name: "Основное меню" });
  // «Посещаемость» is written «Посещения» under the icon (it is too long for a quarter of a phone)
  for (const name of ["Диагностика", "Ученики", "Группы", "Посещения"]) {
    await expect(bar.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(bar.getByRole("link", { name: /^Оплаты/ })).toHaveCount(0); // the owner has not given the right
  await bar.getByRole("button", { name: /^Ещё/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ещё" });
  await expect(sheet.getByRole("link", { name: /^Экзамены/ })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /^Зарплата/ })).toHaveCount(0); // payroll is the owner's alone
  await page.keyboard.press("Escape");
  await expectNoHorizontalScroll(page);
});

test("@mobile teacher: all four sections in the bar; «Ещё» has the quick «Создать экзамен» and the sign-out", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Нижнев");
  const page = await signIn(teacher);
  test.skip(!isPhone(page.viewportSize()?.width), "the bottom bar exists only under 768 px");
  await page.goto("/teacher/groups");

  const bar = page.getByRole("navigation", { name: "Основное меню" });
  for (const name of ["Дашборд", "Расписание", "Экзамены", "Группы"]) {
    await expect(bar.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(bar.getByRole("link", { name: /^Группы/ })).toHaveAttribute("aria-current", "page");
  await bar.getByRole("button", { name: /^Ещё/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ещё" });
  await expect(sheet.getByRole("link", { name: "Создать экзамен" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Выйти из системы" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoHorizontalScroll(page);
});
