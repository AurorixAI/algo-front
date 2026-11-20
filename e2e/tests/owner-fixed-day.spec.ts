import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow, sharedMonthCharge } from "../support/time";
import { dmy, groupedDigits, money, pickOption, toast } from "../support/ui";

/**
 * Owner: settings «Оплаты» -> «Единый день оплаты». LOGIC-A (F12): a change of the mode never touches a running period - the new mode
 * starts for each student at the beginning of his NEXT period (the screen says so before and after saving).  A new centre is already in «Общий месяц» (day 1,
 * Money-2 T16), so the owner moves the day to the 2nd (the 3rd on the 2nd of a month: never today, never the current day, on any date).  A student who joined today keeps his current period (the SHARE of the month he owes, not a price of
 * a month by the new day); paying it closes the period (no debt) and the statement shows one charge of the same sum.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("День");
});

test("fixed payment day: the new mode waits for the next period; the running one is not touched, and paying it closes it", async ({ signIn }) => {
  const now = businessNow();
  const fee = 900000;
  // a new centre is already in «Общий месяц» with the 1st (Money-2 T16): the owner moves the day to one that is neither the 1st nor today (2 or 3, 2 is skipped on the 2nd), so the change is real on any date
  const billingDay = [2, 3].find((day) => day !== now.day)!;

  const teacher = await org.addStaff("teacher", "Расписанин");
  const group = await org.createGroup({ name: "Группа Д1", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, fee); // #105: the price lives on the group, valid from today = the day the student joins (PAY-2 prices a period on its first billable day)
  const student = await org.addStudent(group, "Анвар", "Новичков"); // joined today, follows the price of the group

  // PAY-2: money is counted from the start of the accounting (a new centre has none yet, so nothing is due before it is set)
  await org.setPaymentSettings({ accounting_start_date: now.date });
  const page = await signIn(org.owner);

  // --- the setting, through the settings page
  await page.goto("/owner/settings?section=payments");
  const section = page.getByRole("region", { name: "Оплаты" });
  await expect(section.getByTestId("regime-hint")).toHaveCount(0);                    // a calm section: the warning is only for a change that is not saved yet
  await expect(section.getByRole("radio", { name: /Общий месяц для всех/ })).toBeChecked();          // the default of a new centre: nothing to choose, only the day
  await pickOption(page, section.getByRole("combobox", { name: "День, с которого начинается общий месяц" }), String(billingDay));
  await expect(section.getByText(/Новый режим начнёт действовать/).first()).toBeVisible();   // the screen says when the new mode starts: not for the running periods
  await section.getByRole("button", { name: "Сохранить" }).click();
  // Money-1 B3: a change of the mode is confirmed in the window that shows every student «было → станет»
  await expect(page.getByTestId("regime-confirm")).toBeEnabled();
  await page.getByTestId("regime-confirm").click();
  await expect(section.getByRole("button", { name: "Сохранено" })).toBeVisible(); // the button itself confirms
  const saved = await org.owner.api.get("/auth/org/settings/payments");
  expect(saved).toMatchObject({ billing_anchor: "fixed_day", billing_day: billingDay });

  await expect(section.getByTestId("regime-hint")).toHaveCount(0);                    // saved: the warning is gone

  // --- the running period is not touched: the share of the running month is due, the amount starts as that
  const expectedAmount = sharedMonthCharge(fee, now.date, now.date);       // the share of the days from today to the end of the month

  // PAY-DUE: the period began today - the term is running, he is not a debtor: «Должники» says so in its empty state (not a list that failed to load), «К оплате» holds his row
  const summary = await org.owner.api.get("/auth/org/payments/summary");
  expect(summary).toMatchObject({ debtors: 0, due_students: 1 });
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(page.getByText("Должников нет")).toBeVisible();
  await page.getByRole("tab", { name: /К оплате/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Новичков Анвар", exact: true }) });
  await expect(row).toContainText(new RegExp(`${groupedDigits(expectedAmount).replace(/ /g, "\\s")}\\s*сум`));
  await row.getByRole("button", { name: "Внести оплату" }).click();
  const dialog = page.getByRole("dialog", { name: "Внести оплату" });
  await expect(dialog.getByTestId("payment-due")).toContainText(new RegExp(`${groupedDigits(expectedAmount).replace(/ /g, "\\s")}\\s*сум`));
  await expect(dialog.getByLabel("Сумма", { exact: true })).toHaveValue(new RegExp(`^${groupedDigits(expectedAmount).replace(/ /g, "\\s")}$`));

  // --- save: the payment is what was due, the period is closed
  await dialog.getByRole("radio", { name: "Карта" }).click();
  await dialog.getByRole("button", { name: new RegExp(`^Внести\\s*${groupedDigits(expectedAmount).replace(/ /g, "\\s")}`) }).click();
  await expect(toast(page, "Оплата внесена")).toBeVisible();
  const membership = await org.membershipId(student.id);
  const [payment] = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payment).toMatchObject({ amount: expectedAmount, method: "card" });
  expect(payment.allocation.items.reduce((total: number, item: { amount: number }) => total + item.amount, 0)).toBe(expectedAmount);
  const statement = await org.owner.api.get(`/auth/org/memberships/${membership}/statement`);
  expect(statement.summary).toMatchObject({ charged: expectedAmount, paid: expectedAmount, debt: 0, reconciles: true });

  // --- the receipt shows where the money went, not a period
  await page.goto(`/owner/payments/receipt/${payment.id}`);
  const receipt = page.getByRole("article", { name: /Квитанция №/ });
  await expect(receipt).toContainText("Куда пошли деньги");
  await expect(receipt).toContainText(money(expectedAmount));
  await expect(receipt).toContainText(`${dmy(now.date)}`);
});
