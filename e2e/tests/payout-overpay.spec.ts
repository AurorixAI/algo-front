import { mkdirSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";
import { businessNow, payrollLine } from "../support/time";
import { seedSheet } from "../support/payroll-seed";
import { readZip } from "../support/xlsx-lite";
import { moneyPattern, toast } from "../support/ui";

/**
 * Wave B / P4, MN-32: «Выплата зарплаты сверх остатка» on the real stack.  The rule (server, `payroll_payouts.state_of`, Money-1 R3 #20):
 *   - an OPEN month (not saved after its end) is paid by what is accrued NOW and hands NO advance on (`advance_out = 0`): its sheet says «Месяц открыт: начислено сейчас N, выплачено M…»;
 *   - an advance is carried («Аванс прошлого месяца») only out of a CLOSED month - a sheet saved after the end of the month.
 *
 * Test 1 - the current month, open.  One teacher, one paying student, rate 50 %: the sheet is 25 000. The owner marks a payout of 40 000:
 *   - the SERVER refuses (409, `OVERPAY_CONFIRM_REQUIRED`) and the window asks «Выплата больше начисленного сейчас на 15 000 сум — записать как аванс?» with the hint of an open month;
 *     nothing is written yet (the payouts list stays empty);
 *   - «Отмена» returns to the form (the amount is still there);
 *   - «Записать как аванс» writes it: the sheet says what the server says of an open month, the history holds the payout, the month row says «Переплачено»;
 *   - the overpay of an OPEN month is NOT carried into the next month (`carry_in = 0`).
 * Test 2 - a CLOSED past month: the overpay is carried; the current month says «Аванс прошлого месяца», «К выплате» is smaller by it, the exact rest needs no question, the Excel file has the line,
 *   cancelling the advance payout takes the carry away at once.  Self-contained: its own teacher, its own sheets (seeded after the end of the past month).
 * Screenshots: desktop 1280 and phone 375 -> WBP4_SHOTS.
 */
const SHOTS = process.env.WBP4_SHOTS || "/Users/arslan/Desktop/ALGO/artifacts/code_audit_2410/shots-wb-p4";

async function shot(page: Page, project: string, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450); // let the dialog finish sliding in
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png`, fullPage: false });
}

let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Выплата сверх остатка");
});

test("an OPEN month: a payout above what is accrued - the window asks, «Отмена» writes nothing, «Записать как аванс» writes it, the sheet says what the server says, nothing is carried on @mobile", async ({ signIn }, info) => {
  const project = info.project.name;
  const month = businessNow().date.slice(0, 7);
  const teacher = await org.addStaff("teacher", "Авансов");
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
  await expect(question).toContainText(new RegExp(`Выплата больше начисленного сейчас на\\s*${moneyPattern(15000)}\\s*сум — записать как аванс\\?`));
  await expect(dialog.getByRole("button", { name: "Записать как аванс" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeVisible();
  await expect(question).toContainText("Месяц ещё идёт: если к его концу начислится меньше выплаченного, разница уменьшит выплату следующего месяца");       // R3 3 / #20: what the advance does in a month that is still going
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
  // D-2 / D-3 (walk of 05.11): every number once.  The card says what is accrued now, the chip what was overpaid, the list the payout; the sentence of the server («Месяц открыт: начислено сейчас…») is not repeated
  await expect(page.getByTestId("payroll-total-label")).toHaveText("Начислено сейчас");
  await expect(page.getByTestId("payroll-total")).toContainText(new RegExp(`${moneyPattern(25000)}\\s*сум`));
  await expect(block).toContainText(new RegExp(`Переплачено\\s*${moneyPattern(15000)}\\s*сум`));
  await expect(block).not.toContainText("Месяц открыт: начислено сейчас");
  await expect(block.getByTestId("payout-advance"), "an open month hands no advance on: the line says the overpay may still be earned back").toHaveCount(1);
  await expect(block.getByTestId("payout-advance")).toContainText("Месяц ещё идёт: если к его концу начислится меньше выплаченного");
  await expect(block.getByRole("list", { name: "Выплаты" })).toContainText(new RegExp(`${moneyPattern(40000)}\\s*сум`));
  await shot(page, project, "03-sheet-overpaid-open-month");
  const written = await org.owner.api.get("/auth/org/payroll/payouts", { month });
  expect(written).toHaveLength(1);
  expect(written[0].amount).toBe(40000);

  // --- the statement of the month (the sheet list) tells the same
  await page.goto(`/owner/payroll?month=${month}`);
  const row = page.getByRole("listitem").filter({ hasText: "Авансов" });
  await expect(row).toContainText(new RegExp(`Переплачено\\s*${moneyPattern(15000)}`, "i"));
  await shot(page, project, "04-month-overpaid");

  // --- one more sum when nothing is left is a question again (the balance is 0 for the question, not negative)
  await row.getByRole("button", { name: /Открыть: .*Авансов/ }).click();
  await page.getByTestId("sheet-payout").getByRole("button", { name: "Отметить выплату" }).click();
  const again = page.getByRole("dialog", { name: "Отметить выплату" });
  await again.getByLabel("Сумма").fill("1 000");
  await again.getByRole("radio", { name: "Наличные" }).click();
  await again.getByRole("button", { name: "Сохранить" }).click();
  await expect(again.getByTestId("payout-overpay")).toContainText(new RegExp(`Выплата больше начисленного сейчас на\\s*${moneyPattern(1000)}\\s*сум`));
  await again.getByRole("button", { name: "Отмена" }).click();
  await again.getByRole("button", { name: "Отмена" }).click(); // the second «Отмена» closes the window
  await expect(again).toHaveCount(0);
  expect(await org.owner.api.get("/auth/org/payroll/payouts", { month })).toHaveLength(1);

  // --- the overpay of an OPEN month is NOT carried into the next month: nothing is frozen yet (the month may still accrue what was paid)
  const [year, monthNumber] = businessNow().date.split("-").map(Number);
  const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  const nextSheetId = seedSheet(org.owner.userId, teacher.userId, `${next}-01`, 100000);
  const nextState = (await org.owner.api.get(`/auth/org/payroll/sheets/${nextSheetId}`)).payout;
  expect([nextState.carry_in, nextState.carry_used, nextState.target], "no advance from an open month").toEqual([0, 0, 100000]);
  await page.goto(`/owner/payroll/${nextSheetId}`);
  await expect(page.getByTestId("payroll-total")).toContainText(new RegExp(`${moneyPattern(100000)}\\s*сум`));   // the sum is the card's (the block says only what is left)
  await expect(page.getByTestId("sheet-payout").getByTestId("payout-advance")).toHaveCount(0);
  await expect(page.getByTestId("sheet-payout")).not.toContainText("Аванс прошлого месяца");
});

test("a CLOSED past month: the advance is carried - the current month says «Аванс прошлого месяца», «К выплате» is smaller by it, the exact rest needs no question, the Excel file has the line, cancelling the advance takes it away @mobile", async ({ signIn }, info) => {
  const project = info.project.name;
  const now = businessNow().date;                                            // YYYY-MM-DD
  const [year, monthNumber] = now.split("-").map(Number);
  const past = monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
  // its own teacher and its own sheets: nothing from the other test.  Both sheets are saved NOW: the sheet of the past month is saved after the end of that month - the month is CLOSED
  const teacher = await org.addStaff("teacher", "Переносов");
  const pastSheetId = seedSheet(org.owner.userId, teacher.userId, `${past}-01`, 100000);
  const sheetId = seedSheet(org.owner.userId, teacher.userId, `${now.slice(0, 7)}-01`, 100000);
  const pastState = (await org.owner.api.get(`/auth/org/payroll/sheets/${pastSheetId}`)).payout;
  expect(pastState.basis, "the past month is closed: paid by its saved sheet").toBe("saved");

  // --- the overpay of the CLOSED month: the window asks (the hint of a closed month), the advance is written and is promised to the next month
  const page = await signIn(org.owner);
  await page.goto(`/owner/payroll/${pastSheetId}`);
  const pastBlock = page.getByTestId("sheet-payout");
  await pastBlock.getByRole("button", { name: "Отметить выплату" }).click();
  const overpay = page.getByRole("dialog", { name: "Отметить выплату" });
  await overpay.getByLabel("Сумма").fill("115 000");
  await overpay.getByRole("radio", { name: "Наличные" }).click();
  await overpay.getByRole("button", { name: "Сохранить" }).click();
  const question = overpay.getByTestId("payout-overpay");
  await expect(question).toContainText(new RegExp(`Выплата больше остатка на\\s*${moneyPattern(15000)}\\s*сум — записать как аванс\\?`));
  await expect(question).toContainText("Аванс уменьшит выплату следующего месяца");
  await shot(page, project, "05-closed-month-overpay-question");
  await overpay.getByRole("button", { name: "Записать как аванс" }).click();
  await expect(toast(page, new RegExp(`Выплата внесена: ${moneyPattern(115000)}`))).toBeVisible();
  await expect(pastBlock).toContainText(new RegExp(`Переплачено\\s*${moneyPattern(15000)}\\s*сум`));
  await expect(pastBlock.getByTestId("payout-advance")).toHaveText("Переплата зачтётся в выплате следующего месяца");   // the chip says 15 000, the line only what happens to it
  await expect(pastBlock.getByTestId("payout-advance")).not.toContainText(/\d/);
  await shot(page, project, "06-closed-month-overpaid");

  // --- the current month: the 15 000 advance of the past month is taken off: «К выплате» 85 000, the line says why
  await page.goto(`/owner/payroll/${sheetId}`);
  const block = page.getByTestId("sheet-payout");
  await expect(page.getByTestId("payroll-total")).toContainText(new RegExp(`${moneyPattern(100000)}\\s*сум`));             // the card: the sheet
  await expect(block).toContainText(new RegExp(`Осталось выплатить\\s*${moneyPattern(85000)}\\s*сум`));                  // the chip: what is payable after the advance
  await expect(block).toContainText(new RegExp(`Аванс прошлого месяца:\\s*${moneyPattern(15000)}\\s*сум`));
  await expect(block.getByTestId("payout-advance")).toContainText("к выплате меньше на эту сумму");
  await shot(page, project, "07-current-month-with-advance");
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
  // voiding the advance payout of the PAST month takes the carry away from this month at once (nothing was stored)
  const advance = (await org.owner.api.get("/auth/org/payroll/payouts", { month: past }))[0];
  await org.owner.api.post(`/auth/org/payroll/payouts/${advance.id}/void`, { reason: "внесли по ошибке" });
  const after = (await org.owner.api.get(`/auth/org/payroll/sheets/${sheetId}`)).payout;
  expect([after.carry_in, after.carry_used, after.target]).toEqual([0, 0, 100000]);
  await page.reload();
  await expect(block.getByTestId("payout-advance")).toHaveCount(0);
  await shot(page, project, "08-advance-voided");
});
