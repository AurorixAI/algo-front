import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * «Деньги-1 / Б» (расчёт оплат), the screens against the real server:
 *  - the window of a price change names EVERY student the change moves, «было → станет», with the next period («следующий период с …: 300 000 → 400 000 сум (+100 000)»), the individual prices apart;
 *  - «Ждём оплату» is a tab of its own: a student whose period has just begun is NOT among «Должники», the red banner and the red card count the debtors only;
 *  - «Оплата с» in adding a student: the owner sees the date (the first lesson by default), the quiet line without the money right is the server's `billing.text`.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Деньги Б");
  await org.setPaymentSettings({ accounting_start_date: addDays(businessNow().date, -60) });
});

const post = (path: string, body: unknown) => org.owner.api.post(path, body);

test("Б3: the price window lists every moved student with the next period; Б7: «Ждём оплату» is apart from «Должники», the banner counts the debtors only", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Ждунов");
  const group = await org.createGroup({ name: "Группа Б", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 300000, { validFrom: addDays(today, -60) });
  const waiter = await org.createStudent("Пётр", "Ждущий");
  const debtor = await org.createStudent("Иван", "Долгов");
  const payer = await org.createStudent("Алия", "Платящая");
  // «Оплата с» yesterday: the period began yesterday (within the 3 days of grace); ten days ago: it is overdue; paid in time
  await post(`/auth/org/groups/${group.id}/students/${waiter.id}`, { pay_from: addDays(today, -1) });
  await post(`/auth/org/groups/${group.id}/students/${debtor.id}`, { pay_from: addDays(today, -10) });
  await post(`/auth/org/groups/${group.id}/students/${payer.id}`, { pay_from: addDays(today, -1) });
  await org.pay(payer.id, 300000);

  // --- the server's split, the same numbers on the screen
  const summary = await org.owner.api.get("/auth/org/payments/summary");
  expect(summary.debt_split).toMatchObject({ debtors: 1, waiting_students: 1, debtors_debt_total: 300000, waiting_debt_total: 300000 });

  const page = await signIn(org.owner);
  await page.goto("/owner/payments?bucket=debt");
  const tabs = page.getByRole("tab");
  await expect(tabs.nth(0)).toHaveText("Должники (1)");
  await expect(tabs.nth(1)).toHaveText("Ждём оплату (1)");
  await expect(page.getByRole("list").filter({ hasText: "Долгов Иван" })).toContainText(/Просрочено|Ещё не платил/);
  await expect(page.getByText("Ждущий Пётр")).toHaveCount(0);       // the waiting student is not a debtor
  await expect(page.getByTestId("position-debt")).toContainText(/300\s000\sсум/);
  await expect(page.getByTestId("position-waiting")).toContainText("Ждём оплату: 300 000 сум · 1 ученик");
  await expectNoHorizontalScroll(page);

  await page.goto("/owner/payments?bucket=waiting");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("Ждём оплату (1)");
  const row = page.getByRole("listitem").filter({ hasText: "Ждущий Пётр" });
  await expect(row).toContainText(/Ждём оплату до \d\d\.\d\d/);
  await expect(row).not.toContainText("Просрочено");
  await expect(page.getByText("Долгов Иван")).toHaveCount(0);

  // --- the red banner (on the home page) counts the debtors: one student, 300 000 сум - not the waiting one
  await page.goto("/owner/dashboard");
  const banner = page.getByTestId("payments-alert-banner");
  await expect(banner).toContainText(/1 ученик с долгом — 300\s000\sсум/);

  // --- the price window: every moved student, the next period, in the table «было → станет»
  await page.goto(`/owner/payments/prices?group=${group.id}`);
  const block = page.locator(`[data-group-id="${group.id}"]`);
  await block.getByRole("button", { name: "Изменить цену" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить цену группы" });
  await dialog.getByLabel("Цена в месяц").fill("400000");
  const table = dialog.getByTestId("price-impact-money-students");
  await expect(table).toBeVisible();
  await expect(table).toContainText("Платящая Алия");
  await expect(table).toContainText(/Следующий период с \d\d\.\d\d/);
  await expect(table).toContainText(/\+100\s000\sсум/);
  await expect(dialog.getByTestId("price-impact-money-summary")).toHaveText("Изменится у 3 учеников");
  await expect(dialog.getByTestId("price-impact-money-totals")).toContainText(/Следующий период дороже в сумме, 1 ученик\s*\+100\s000\sсум/);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("dialog", { name: "Изменить цену группы" })).toHaveCount(0);
});

test("Б1: «Оплата с» - the owner sees the date with the first lesson by default and a past day charges at once; the new group form has a price", async ({ signIn }) => {
  const today = businessNow().date;
  const group = await org.createGroup({ name: "Группа Б1" });
  await org.setGroupPrice(group.id, 300000, { validFrom: addDays(today, -60) });
  const student = await org.createStudent("Ольга", "Новая");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await page.getByRole("button", { name: /Добавить ученика|Зачислить/ }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByPlaceholder(/Поиск по имени/).fill("Нов");
  await drawer.getByRole("button", { name: /Новая Ольга/ }).click();
  const field = drawer.getByTestId("pay-from");
  await expect(field).toBeVisible();
  await expect(field.getByLabel("Оплата с")).toHaveValue(/\d\d\.\d\d\.\d{4}/);
  await expect(drawer.getByTestId("pay-from-hint")).toContainText(/Оплата с \d\d\.\d\d\.\d{4} — /);   // the sentence of the server
  // a day in the past: the server says how much is charged at once, before the button
  const input = field.getByLabel("Оплата с");
  await input.fill(addDays(today, -5).split("-").reverse().join("."));
  await input.press("Tab");
  await expect(drawer.getByTestId("pay-from-immediate")).toContainText(/Сразу начислится \d[\d\s\u00a0]*\sсум/);
  await drawer.getByTestId("enrol-submit").click();
  await expect(drawer).toHaveCount(0);
  const membership = await org.membershipId(student.id, group.id);
  const status = await org.owner.api.get("/auth/org/payments/status", { bucket: "all", search: "Новая" });
  expect(status.items.find((row: any) => row.membership_id === membership)).toBeTruthy();

  // Б2: the form of a new group has the price for the owner
  await page.goto("/owner/groups");
  await page.getByRole("button", { name: /Создать группу|Новая группа/ }).first().click();
  const form = page.getByRole("dialog", { name: "Новая группа" });
  await expect(form.getByLabel(/Цена в месяц/)).toBeVisible();
});
