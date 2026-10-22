import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow } from "../support/time";
import { dmy, groupedDigits, money, toast } from "../support/ui";

/**
 * Owner: settings «Оплаты» -> «Единый день оплаты». LOGIC-A (F12): a change of the mode never touches a running period - the new mode
 * starts for each student at the beginning of his NEXT period (the screen says so before and after saving).  A student who already
 * pays keeps his current period (here the price of the whole period is due, not a part of it); paying it closes the period (no
 * debt) and the statement shows one charge of the same sum.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("День");
});

test("fixed payment day: the new mode waits for the next period; the running one is not touched, and paying it closes it", async ({ signIn }) => {
  const now = businessNow();
  const fee = 900000;
  const billingDay = now.day === 1 ? 2 : 1;

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
  await section.getByRole("radio", { name: /Единый день оплаты/ }).check();
  await section.getByRole("combobox", { name: "Единый день оплаты" }).selectOption(String(billingDay));
  await section.getByRole("button", { name: "Сохранить" }).click();
  await expect(section.getByRole("button", { name: "Сохранено" })).toBeVisible(); // the button itself confirms
  const saved = await org.owner.api.get("/auth/org/settings/payments");
  expect(saved).toMatchObject({ billing_anchor: "fixed_day", billing_day: billingDay });

  // --- the screen says when the new mode starts: not for the running periods
  await expect(section.getByText(/Новый режим начнёт действовать/).first()).toBeVisible();

  // --- the running period is not touched: the whole price of the period is due, the amount starts as that
  const expectedAmount = fee;

  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Новичков Анвар", exact: true }) });
  await expect(row).toContainText(new RegExp(`${groupedDigits(fee).replace(/ /g, "\\s")}\\s*сум`));
  await row.getByRole("button", { name: "Внести оплату" }).click();
  const dialog = page.getByRole("dialog", { name: "Внести оплату" });
  await expect(dialog.getByTestId("payment-chips")).toContainText(new RegExp(`${groupedDigits(expectedAmount).replace(/ /g, "\\s")}\\s*сум`));
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
