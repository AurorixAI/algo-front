import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { billingPeriod, businessNow, countWeeklyLessons, round1000 } from "../support/time";
import { dmy, groupedDigits, money, toast } from "../support/ui";

/**
 * Owner: settings «Оплаты» -> «Единый день оплаты». A student who joined today owes an INCOMPLETE month (PAY-2: the
 * server charges the part of the period since he joined): the quick-pay row says «Всего к оплате» with the price of the group
 * prorated by its lessons - round_1000( price * lessons_in_part / lessons_in_period ) - and the amount starts as that sum.
 * Paying it closes the period (no debt); the statement shows one charge of the same sum.
 * The expected numbers are computed here from the seeded weekly schedule and the calendar, not read from the API.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("День");
});

test("fixed payment day: a student who joined today owes a prorated amount, and paying it closes the period", async ({ signIn }) => {
  const now = businessNow();
  const fee = 900000;
  const billingDay = now.day === 1 ? 2 : 1; // never the day the student joins: the month is then really incomplete

  // seeded schedule: three lessons a week, starting with today's weekday (tonight at 23:00, still ahead of the clock;
  // when the run happens at 22:56+ today's slot cannot be created any more, so the pattern shifts by a day)
  const shift = now.minutes <= 22 * 60 + 55 ? 0 : 1;
  const weekdays = [0, 2, 4].map((k) => ((now.isoWeekday - 1 + k + shift) % 7) + 1);
  const teacher = await org.addStaff("teacher", "Расписанин");
  const group = await org.createGroup({ name: "Группа Д1", teacherId: teacher.userId });
  for (const dayOfWeek of weekdays) {
    await teacher.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek, startTime: "23:00", endTime: "23:30" });
  }
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

  // --- expected, from the seeded schedule
  const period = billingPeriod(now.date, billingDay);
  const inPart = countWeeklyLessons(weekdays, now.date, period.end);
  const inPeriod = countWeeklyLessons(weekdays, period.start, period.end);
  expect(inPart, "seeded schedule has lessons in the covered part").toBeGreaterThan(0);
  const expectedAmount = round1000(fee * inPart, inPeriod);

  // --- the quick-pay row: the server says what is due, the amount starts as that
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Новичков Анвар", exact: true }) });
  await expect(row).toContainText(new RegExp(`Цена группы: ${groupedDigits(fee).replace(/ /g, "\\s")}\\s*сум/мес`));
  await expect(row.getByRole("textbox", { name: "Оплата в месяц, сум" })).toHaveCount(0); // no per-student fee field
  await expect(row.getByRole("textbox", { name: "Оплачено до" })).toHaveCount(0); // PAY-2: no period to pick
  await expect(row.getByTestId("quick-due")).toContainText(new RegExp(`Всего к оплате\\s*${String(expectedAmount).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s")}\\s*сум`));
  await expect(row.getByRole("textbox", { name: "Сумма оплаты, сум" })).toHaveValue(new RegExp(`^${groupedDigits(expectedAmount).replace(/ /g, "\\s")}$`));

  // --- save: the payment is what was due, the period is closed
  await row.getByRole("combobox", { name: "Способ оплаты" }).selectOption("card");
  await row.getByRole("button", { name: "Сохранить" }).click();
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
  expect(period.end >= now.date).toBe(true);
});
