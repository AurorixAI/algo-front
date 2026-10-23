import { test, expect } from "../support/fixtures";
import { readFileSync } from "node:fs";
import { Org } from "../support/api";
import { readSheet, readZip } from "../support/xlsx-lite";
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
  await expect(page.getByTestId("statement-month")).not.toContainText("стоимость"); // the month row is only the name (owner 23.10): the figures are in the columns
  await expect(page.getByText(new RegExp(`Долг ${moneyPattern(300000)}`)).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // --- no «Печать»; the statement opens on the current month and «Все месяцы» is a toggle (owner 23.10)
  await expect(page.getByRole("button", { name: "Печать" })).toHaveCount(0);
  await expect(page.getByTestId("statement-months")).toContainText(/(январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь) \d{4}/i);
  await expect(page.getByRole("button", { name: "Все месяцы" })).toHaveAttribute("aria-pressed", "false");
  await expect(payment.getByTestId("statement-row-icon")).toHaveAttribute("data-icon", "payment");
  await expect(payment).toContainText(new RegExp(`\\+${moneyPattern(200000)}`));
  await page.getByRole("button", { name: "Все месяцы" }).click();
  await expect(page).toHaveURL(/\?month=all$/);
  await expect(page.getByRole("button", { name: "Все месяцы" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Все месяцы" }).click(); // the toggle goes back to the month it opened on
  await expect(page).toHaveURL(new RegExp(`/statement/${membership}$`));

  // --- «Excel»: the file of the month on screen; the header cells and the payment row are those of the page
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^Выписка_.*_\d{4}-\d{2}\.xlsx$/); // one month: its name is in the file name
  const file = test.info().outputPath("vypiska.xlsx");
  await download.saveAs(file);
  const sheet = readSheet(readZip(readFileSync(file)), "Выписка");
  // the layout: a compact title block (row 1 «Выписка — …»), the table header further down (found by its content, not by a row number)
  const HEADER = ["Дата", "Операция", "Стоимость", "Оплачено", "Баланс", "Подробности"];
  const header = sheet.find((r) => HEADER.every((h, i) => Object.values(r.cells)[i] === h));
  expect(header, "the header row of the file: Дата | Операция | Стоимость | Оплачено | Баланс | Подробности").toBeTruthy();
  expect(header!.row, "the header sits below the title block").toBeGreaterThan(1);
  const title = sheet.find((r) => r.row === 1);
  expect(Object.values(title?.cells ?? {})[0] ?? "", "row 1 is the title").toMatch(/^Выписка — /);
  expect(JSON.stringify(sheet)).not.toMatch(/Начисл/); // the owner's vocabulary
  const paymentRow = sheet.find((r) => r.row > header!.row && Object.values(r.cells).some((t) => /^Оплата № 1/.test(t)));
  expect(paymentRow, "the payment of the page is a row of the file").toBeTruthy();
  const paymentCells = Object.values(paymentRow!.cells);
  expect(paymentCells.some((t) => /^\d+(\.\d+)?$/.test(t)), "a numeric amount cell").toBe(true);
  expect(paymentCells).toContain("200000"); // a number, not a text with spaces
  expect(paymentCells.join(" | "), "the method is a Russian word").toMatch(/наличные/i);
  expect(paymentCells.join(" | ")).not.toMatch(/\bcash\b/i);

  // --- the rest is paid: the debt is closed, the second payment leaves nothing «осталось»
  await org.pay(student.id, 300000, { method: "card" });
  await page.reload();
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");
  await expect(page.getByTestId("statement-row-payment")).toHaveCount(2);
  // the first payment keeps its history («осталось 300 000» was true when it was made); the second one closes the period
  await expect(page.getByTestId("statement-row-payment").filter({ hasText: "Оплата № 1" })).toContainText(new RegExp(`\\(осталось ${moneyPattern(300000)}\\)`));
  await expect(page.getByTestId("statement-row-payment").filter({ hasText: "Оплата № 2" })).not.toContainText("осталось");
  await expect(page.getByTestId("statement-cell-balance").last()).toContainText("0"); // the period is closed: the chip says «0»
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");

  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(row()).toHaveCount(0);
  await page.getByRole("tab", { name: /^Без долга/ }).click();
  await expect(row()).toContainText("Оплачено");
});
