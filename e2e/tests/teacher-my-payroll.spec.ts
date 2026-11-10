import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow } from "../support/time";
import { seedSheet } from "../support/payroll-seed";
import { expectNoHorizontalScroll, money } from "../support/ui";

/**
 * Money-1 V8 (Ф2): «Моя зарплата» of a teacher - his own numbers (засчитано уроков, зарплата, выплачено, остаток), the current month «Предварительно», the saved month with what is left to pay.
 * No prices and no debts of students on the screen; the owner has no such page (redirect), the API answers 403 to him.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Моя зарплата");
});

const pastMonth = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
};

test("teacher: a saved month of the owner is in «Прошлые месяцы» with «К выплате», the current month is «Предварительно»; no prices, no debts; a phone has no sideways scroll @mobile", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Зарплатов");
  const past = pastMonth(businessNow().date);
  seedSheet(org.owner.userId, teacher.userId, `${past}-01`, 300000);
  const page = await signIn(teacher);
  await page.goto("/teacher/payroll");

  await expect(page.getByRole("heading", { level: 1, name: "Моя зарплата" })).toBeVisible();
  const card = page.getByTestId("my-month-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("my-month-chip")).toHaveText("Предварительно");
  const row = page.getByTestId("my-month-row").first();
  await expect(row).toContainText(money(300000));
  await expect(row).toContainText("К выплате");

  await row.click();
  await expect(page.getByTestId("my-month-chip")).toHaveText("Сохранена");
  await expect(page.getByTestId("my-total")).toContainText(money(300000));
  await expect(page.getByTestId("my-rest")).toContainText("К выплате");
  await expect(page.getByTestId("my-payroll")).not.toContainText(/цена|долг|ученик/i);
  await expectNoHorizontalScroll(page);

  await page.getByTestId("my-payroll-back").click();
  await expect(page.getByTestId("my-month-chip")).toHaveText("Предварительно");
});

test("the owner has no «Моя зарплата»: the page sends him away, the API answers 403; the teacher reads only his own months", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Своёв");
  await expect(org.owner.api.get("/auth/org/me/payroll/months")).rejects.toMatchObject({ status: 403 });
  const months = await teacher.api.get("/auth/org/me/payroll/months");
  expect(months.items[0].month).toBe(businessNow().date.slice(0, 7));
  const page = await signIn(org.owner);
  await page.goto("/teacher/payroll");
  await expect(page).not.toHaveURL(/\/teacher\/payroll/);
});
