import { mkdirSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";
import { businessNow, payrollLine } from "../support/time";
import { seedNextMonthSheet } from "../support/payroll-seed";
import { readZip } from "../support/xlsx-lite";
import { moneyPattern, toast } from "../support/ui";

/**
 * Wave B / P4, MN-32: «Выплата зарплаты сверх остатка» on the real stack.
 *
 * One teacher, one paying student, rate 50 %: the sheet is 25 000. The owner marks a payout of 40 000:
 *   - the SERVER refuses (409, `OVERPAY_CONFIRM_REQUIRED`) and the window asks «Выплата больше остатка на 15 000 сум — записать как аванс?»;
 *     nothing is written yet (the payouts list stays empty);
 *   - «Отмена» returns to the form (the amount is still there);
 *   - «Записать как аванс» writes it: the sheet says «Переплачено 15 000 сум», the history holds the payout, the month row says the same;
 *   - a payout of exactly what is left needs no question (the balance of an unpaid sheet).
 * Screenshots: desktop 1280 and phone 375 -> WBP4_SHOTS.
 */
const SHOTS = process.env.WBP4_SHOTS || "/Users/arslan/Desktop/ALGO/artifacts/code_audit_2410/shots-wb-p4";

async function shot(page: Page, project: string, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450); // let the dialog finish sliding in
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png`, fullPage: false });
}

let org: Org;
let teacherId = "";
test.beforeAll(async () => {
  org = await Org.create("Выплата сверх остатка");
});

test("a payout above the balance: the window asks, «Отмена» writes nothing, «Записать как аванс» writes it and the sheet says «Переплачено» @mobile", async ({ signIn }, info) => {
  const project = info.project.name;
  const month = businessNow().date.slice(0, 7);
  const teacher = await org.addStaff("teacher", "Авансов");
  teacherId = teacher.userId;
  const group = await org.createGroup({ name: "Группа Выплат", teacherId: teacher.userId, lessonType: "group" });
  await org.setGroupPrice(group.id, 600000);
  const student = await org.addStudent(group, "Анвар", "Платящий");
  await org.pay(student.id, 600000);
  const lesson = await org.createLessonStartingNow(group.id);
  await runLesson(teacher, lesson, { records: { [student.id]: "present" }, complete: true });
  await org.setPayrollRate(teacher.userId, { group: "50" });
  const sheetTotal = payrollLine(600000, "50", 1);
  expect(sheetTotal).toBe(25000);

  // --- the sheet is saved from the month page, then opened
  const page = await signIn(org.owner);
  await page.goto(`/owner/payroll?month=${month}`);
  await page.getByRole("button", { name: "Рассчитать всех" }).click();
  const preview = page.getByRole("region", { name: "Предпросмотр расчёта" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Ведомость сохранена · версия 1")).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Авансов" }).getByRole("button", { name: /Открыть: .*Авансов/ }).click();
  await expect(page).toHaveURL(/\/owner\/payroll\/[0-9a-f-]{36}$/);
  const block = page.getByTestId("sheet-payout");
  await expect(block).toContainText("Не выплачено");
  await shot(page, project, "01-sheet-unpaid");

  // --- 40 000 against 25 000: the server asks
  await block.getByRole("button", { name: "Отметить выплату" }).click();
  const dialog = page.getByRole("dialog", { name: "Отметить выплату" });
  await expect(dialog.getByLabel("Сумма")).toHaveValue(new RegExp(`^${moneyPattern(sheetTotal)}$`)); // the default is what is left
  await dialog.getByLabel("Сумма").fill("40 000");
  await dialog.getByRole("radio", { name: "Наличные" }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  const question = dialog.getByTestId("payout-overpay");
  await expect(question).toContainText(new RegExp(`Выплата больше остатка на\\s*${moneyPattern(15000)}\\s*сум — записать как аванс\\?`));
  await expect(dialog.getByRole("button", { name: "Записать как аванс" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeVisible();
  await expect(question).toContainText("Аванс уменьшит выплату следующего месяца");       // R3 3: what the advance does
  await shot(page, project, "02-overpay-question");
  const none = await org.owner.api.get("/auth/org/payroll/payouts", { month });
  expect(none, "the refusal writes nothing").toEqual([]);

  // --- «Отмена»: back to the form, the typed amount is still there, nothing was written
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(question).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Сумма")).toHaveValue(new RegExp(`^${moneyPattern(40000)}$`)); // the typed amount is still there
  expect(await org.owner.api.get("/auth/org/payroll/payouts", { month })).toEqual([]);

  // --- again, and this time «Записать как аванс»
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(question).toBeVisible();
  await dialog.getByRole("button", { name: "Записать как аванс" }).click();
  await expect(toast(page, new RegExp(`Выплата внесена: ${moneyPattern(40000)}`))).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(block).toContainText(new RegExp(`Переплачено\\s*${moneyPattern(15000)}\\s*сум`));
  await expect(block.getByTestId("payout-advance")).toContainText(new RegExp(`Аванс\\s*${moneyPattern(15000)}\\s*сум зачтётся в выплате следующего месяца`));
  await expect(block.getByRole("list", { name: "Выплаты" })).toContainText(new RegExp(`${moneyPattern(40000)}\\s*сум`));
  await shot(page, project, "03-sheet-overpaid");
  const written = await org.owner.api.get("/auth/org/payroll/payouts", { month });
  expect(written).toHaveLength(1);
  expect(written[0].amount).toBe(40000);

  // --- the statement of the month (the sheet list) tells the same
  await page.goto(`/owner/payroll?month=${month}`);
  const row = page.getByRole("listitem").filter({ hasText: "Авансов" });
  await expect(row).toContainText(new RegExp(`Переплачено\\s*${moneyPattern(15000)}`));
  await shot(page, project, "04-month-overpaid");

  // --- one more sum when nothing is left is a question again (the balance is 0 for the question, not negative)
  await row.getByRole("button", { name: /Открыть: .*Авансов/ }).click();
  await page.getByTestId("sheet-payout").getByRole("button", { name: "Отметить выплату" }).click();
  const again = page.getByRole("dialog", { name: "Отметить выплату" });
  await again.getByLabel("Сумма").fill("1 000");
  await again.getByRole("radio", { name: "Наличные" }).click();
  await again.getByRole("button", { name: "Сохранить" }).click();
  await expect(again.getByTestId("payout-overpay")).toContainText(new RegExp(`Выплата больше остатка на\\s*${moneyPattern(1000)}\\s*сум`));
  await again.getByRole("button", { name: "Отмена" }).click();
  await again.getByRole("button", { name: "Отмена" }).click(); // the second «Отмена» closes the window
  await expect(again).toHaveCount(0);
  expect(await org.owner.api.get("/auth/org/payroll/payouts", { month })).toHaveLength(1);
});

test("the advance is carried: next month's sheet says «Аванс прошлого месяца», «К выплате» is smaller by it, the exact rest needs no question, the Excel file has the line @mobile", async ({ signIn }, info) => {
  const project = info.project.name;
  const now = businessNow().date;                                            // YYYY-MM-DD
  const [year, month] = now.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const sheetId = seedNextMonthSheet(org.owner.userId, teacherId, `${next}-01`, 100000);
  const page = await signIn(org.owner);
  await page.goto(`/owner/payroll/${sheetId}`);
  const block = page.getByTestId("sheet-payout");
  // the 15 000 advance of this month is taken off: «К выплате» 85 000, the line says why
  await expect(block).toContainText(new RegExp(`К выплате\\s*${moneyPattern(85000)}\\s*сум`));
  await expect(block).toContainText(new RegExp(`Аванс прошлого месяца\\s*${moneyPattern(15000)}\\s*сум`));
  await expect(block.getByTestId("payout-advance")).toContainText("«К выплате» уменьшена на него");
  await shot(page, project, "05-next-month-with-advance");
  const state = (await org.owner.api.get(`/auth/org/payroll/sheets/${sheetId}`)).payout;
  expect([state.carry_in, state.carry_used, state.target, state.balance]).toEqual([15000, 15000, 85000, 85000]);
  // the Excel file of the sheet carries the line
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Скачать Excel/ }).click()]);
  const file = info.outputPath("sheet.xlsx");
  await download.saveAs(file);
  const strings = [...readZip(readFileSync(file)).values()].map((part) => part.toString("utf8")).join("\n");     // the text of the cells (shared or inline strings)
  expect(strings, "the Excel file of the sheet has the line of the advance").toContain("Аванс прошлого месяца: 15 000 сум");
  // paying exactly what is left (85 000) is no question and settles the month
  await block.getByRole("button", { name: "Отметить выплату" }).click();
  const dialog = page.getByRole("dialog", { name: "Отметить выплату" });
  await dialog.getByRole("radio", { name: "Наличные" }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, new RegExp(`Выплата внесена: ${moneyPattern(85000)}`))).toBeVisible();
  await expect(block).toContainText("Выплачено полностью");
  // voiding the advance payout of this month takes the carry away from next month at once (nothing was stored)
  const month0 = now.slice(0, 7);
  const first = (await org.owner.api.get("/auth/org/payroll/payouts", { month: month0 }))[0];
  await org.owner.api.post(`/auth/org/payroll/payouts/${first.id}/void`, { reason: "внесли по ошибке" });
  const after = (await org.owner.api.get(`/auth/org/payroll/sheets/${sheetId}`)).payout;
  expect([after.carry_in, after.carry_used, after.target]).toEqual([0, 0, 100000]);
  await page.reload();
  await expect(block.getByTestId("payout-advance")).toHaveCount(0);
  await shot(page, project, "06-advance-voided");
});
