import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";
import { moneyPattern, toast } from "../support/ui";

/**
 * «Деньги-1 / В» (front): the new flows of the money of the students - a refund with a reason and its receipt «В-n», a corrected payment in «Решения», a cancelled payment in the journal of payments,
 * an unusual price asked once more, a payment without a method that does not go.  Written to run once with the release E2E (not run by the author).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Деньги В");
});

async function world(name: string, price = 300000) {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", `Учитель${name}`);
  const group = await org.createGroup({ name: `Группа ${name}`, teacherId: teacher.userId });
  await org.setPaymentSettings({ accounting_start_date: addDays(today, -60) });
  await org.setGroupPrice(group.id, price);
  const student = await org.addStudent(group, "Вадим", `Платёжный${name}`);
  const membership = await org.membershipId(student.id, group.id);
  return { today, group, student, membership };
}

test("refund: the reason and the method are required -> «Аванс возвращён · В-n» -> the receipt of the refund opens", async ({ signIn }) => {
  const { student, group } = await world("Возврат");
  await org.pay(student.id, 1500000, {}, group.id);   // far more than is due: the rest is an advance that can be given back
  const page = await signIn(org.owner);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await page.getByRole("button", { name: /^Действия по оплате:/ }).click();
  await page.getByRole("menuitem", { name: "Вернуть аванс" }).click();
  const dialog = page.getByRole("dialog", { name: "Вернуть аванс" });
  await expect(dialog.getByText(/^Можно вернуть:/)).toBeVisible();
  const submit = dialog.getByRole("button", { name: /^Вернуть аванс\s/ });
  await expect(submit).toBeDisabled();   // no method, no reason
  await dialog.getByRole("radio", { name: "Наличные" }).click();
  await expect(submit).toBeDisabled();
  await expect(dialog.getByTestId("refund-why")).toContainText("Укажите причину");
  await dialog.getByLabel(/^Причина/).fill("Ученик ушёл из центра");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(toast(page, /Аванс возвращён · В-\d+/)).toBeVisible();
  await page.getByRole("link", { name: "Квитанция" }).click();
  const sheet = page.getByRole("article", { name: /^Квитанция о возврате В-\d+$/ });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Ученик ушёл из центра");
  await expect(sheet).toContainText("Не является фискальным чеком");
  await expect(sheet).toContainText("Получил(а):");
});

test("corrected payment: the reason is required -> the line «Оплата исправлена» is in «Решения» with the reason", async ({ signIn }) => {
  const { student, group, membership } = await world("Исправление");
  await org.pay(student.id, 300000, {}, group.id);
  const page = await signIn(org.owner);
  await page.goto(`/owner/payments/statement/${membership}`);
  await page.getByTestId("statement-row-payment").getByRole("button", { name: /^Действия:/ }).click();
  await page.getByRole("menuitem", { name: "Исправить оплату", exact: true }).dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Исправить оплату" });
  await dialog.getByLabel("Сумма", { exact: true }).fill("200000");
  const save = dialog.getByRole("button", { name: /^Исправить на/ });
  await expect(save).toBeDisabled();
  await expect(dialog.getByTestId("payment-blocker")).toContainText("Укажите причину");
  await dialog.getByLabel(/^Причина исправления/).fill("Ошибся в сумме");
  await save.click();
  await expect(toast(page, "Оплата исправлена")).toBeVisible();
  await page.goto("/owner/payments/income?tab=decisions");
  const row = page.getByTestId("decision-row").filter({ hasText: "Оплата исправлена" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(new RegExp(`${moneyPattern(300000)} → ${moneyPattern(200000)}`));
  await row.getByRole("button").click();
  await expect(page.getByTestId("decision-details")).toContainText("Ошибся в сумме");
  await expect(page.getByTestId("decisions-since")).toContainText("Журнал ведётся с");
});

test("cancelled payment: the journal of payments shows it as «отменена» under «Показать отменённые»", async ({ signIn }) => {
  const { student, group, membership } = await world("Отмена");
  await org.pay(student.id, 300000, {}, group.id);
  const page = await signIn(org.owner);
  await page.goto(`/owner/payments/statement/${membership}`);
  await page.getByTestId("statement-row-payment").getByRole("button", { name: /^Действия:/ }).click();
  await page.getByRole("menuitem", { name: "Отменить оплату", exact: true }).dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Отменить оплату?" });
  await dialog.getByLabel(/^Причина/).fill("Внесена по ошибке");
  await dialog.getByRole("button", { name: "Отменить оплату" }).click();
  await expect(toast(page, "Оплата отменена")).toBeVisible();
  await page.goto("/owner/payments/income");
  await page.getByTestId("journal-voided-toggle").click();
  await expect(page.getByTestId("journal-tag").filter({ hasText: "отменена" })).toBeVisible();
  await page.getByRole("tab", { name: "Решения" }).click();
  await expect(page.getByTestId("decision-row").filter({ hasText: "Оплата отменена" })).toBeVisible();
});

test("price x3: the question of the server, «Да, цена верная» before saving, then it is saved", async ({ signIn }) => {
  const { group } = await world("Цена", 300000);
  const page = await signIn(org.owner);
  await page.goto(`/owner/payments/prices?group=${group.id}`);
  await page.getByRole("button", { name: /Изменить цену|Задать цену/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /цену/i });
  await dialog.getByLabel("Цена в месяц").fill("900000");
  await expect(dialog.getByTestId("price-unusual")).toContainText("Вы уверены");
  const save = dialog.getByRole("button", { name: /^Сохранить цену/ });
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Да, цена верная").check();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toBeHidden();
  const prices = await org.owner.api.get(`/auth/org/groups/${group.id}/prices`);
  expect(prices.current).toMatchObject({ amount: 900000 });
});

test("a payment without a method does not go: the button waits and says why; the method is never chosen for the person", async ({ signIn }) => {
  const { student } = await world("Способ");
  const page = await signIn(org.owner);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await page.getByRole("button", { name: "Внести оплату" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Оплата от ученика" });
  await dialog.getByLabel("Сумма", { exact: true }).fill("100000");
  await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Внести/ })).toBeDisabled();
  await expect(dialog.getByTestId("payment-blocker")).toContainText("Выберите способ оплаты");
});
