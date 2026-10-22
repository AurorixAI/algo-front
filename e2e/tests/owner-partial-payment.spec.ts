import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { expectNoHorizontalScroll, moneyPattern } from "../support/ui";

/**
 * PAY-2 «Баланс»: a PARTIAL payment.  The server distributes the money; the owner sees where it went and how much is still
 * due - on the debtors list («Не доплачено за …: 300 000»), on the card, and on the statement: the payment row says
 * «за <период> — 200 000 (осталось 300 000)», the month header «осталось 300 000», the balance «Долг 300 000», «Сходится».
 * The rest paid later closes the debt (the row leaves «Должники»; the second payment does not say «осталось»).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Частичная оплата");
});

test("partial payment: debtors row -> statement shows the allocation and «осталось» -> the rest closes the debt @mobile", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Платёжный");
  const group = await org.createGroup({ name: "Группа ЧО", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 500000);
  const student = await org.addStudent(group, "Дилдора", "Частичная");
  await org.pay(student.id, 200000, { method: "cash" });
  const membership = await org.membershipId(student.id, group.id);

  const page = await signIn(org.owner);
  const row = () => page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Частичная Дилдора", exact: true }) });

  // --- «Должники»: the reason line says what is missing in the server's words
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(row()).toContainText(new RegExp(`Не доплачено за [^:]+: ${moneyPattern(300000)}`));
  await expect(row()).toContainText(new RegExp(`Долг ${moneyPattern(300000)}`));

  // --- the card: the group block carries the debt and the link to the statement
  await page.goto(`/owner/students/${student.id}?tab=payments`);
  await expect(page.getByText(new RegExp(`Долг ${moneyPattern(300000)}`)).first()).toBeVisible();
  await page.getByRole("link", { name: "Выписка" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/owner/payments/statement/${membership}$`));

  // --- the statement: the allocation of the payment and what is left
  await expect(page.getByRole("heading", { name: "Выписка" })).toBeVisible();
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");
  const payment = page.getByTestId("statement-row-payment");
  await expect(payment).toContainText(new RegExp(`за \\d\\d\\.\\d\\d–\\d\\d\\.\\d\\d — ${moneyPattern(200000)} \\(осталось ${moneyPattern(300000)}\\)`));
  await expect(page.getByText(new RegExp(`стоимость ${moneyPattern(500000)} · оплачено ${moneyPattern(200000)} · осталось ${moneyPattern(300000)}`))).toBeVisible();
  await expect(page.getByText(new RegExp(`Долг ${moneyPattern(300000)}`)).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // --- the rest is paid: the debt is closed, the second payment leaves nothing «осталось»
  await org.pay(student.id, 300000, { method: "card" });
  await page.reload();
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");
  await expect(page.getByTestId("statement-row-payment")).toHaveCount(2);
  // the first payment keeps its history («осталось 300 000» was true when it was made); the second one closes the period
  await expect(page.getByTestId("statement-row-payment").filter({ hasText: "Оплата № 1" })).toContainText(new RegExp(`\\(осталось ${moneyPattern(300000)}\\)`));
  await expect(page.getByTestId("statement-row-payment").filter({ hasText: "Оплата № 2" })).not.toContainText("осталось");
  await expect(page.getByText(new RegExp(`стоимость ${moneyPattern(500000)} · оплачено ${moneyPattern(500000)}`))).toBeVisible();
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");

  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(row()).toHaveCount(0);
  await page.getByRole("tab", { name: /^Без долга/ }).click();
  await expect(row()).toContainText("Оплачено");
});
