import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { billingPeriod, businessNow, countWeeklyLessons, lessonsWord, round1000, addDays } from "../support/time";
import { dmy, groupedDigits, money, toast } from "../support/ui";

/**
 * Owner: settings «Оплаты» -> «Единый день оплаты». A student who joined today then pays for an INCOMPLETE
 * month: the quick-pay row suggests today..end of the centre's period, the caption says «Неполный месяц»,
 * and the amount is the price of the group prorated by its lessons:  round_1000( price * lessons_in_part / lessons_in_period ).
 * The expected numbers are computed here from the seeded weekly schedule and the calendar, not read from the API.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("День");
});

test("fixed payment day: a student who joined today pays a prorated, «Неполный месяц» amount", async ({ signIn }) => {
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
  await org.setGroupPrice(group.id, fee); // #105: the price lives on the group, valid from today = the day the student joins
  const student = await org.addStudent(group, "Анвар", "Новичков"); // joined today, follows the price of the group

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

  // --- the quick-pay row
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Без оплат/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Новичков Анвар", exact: true }) });
  await expect(row).toContainText(new RegExp(`Цена группы: ${groupedDigits(fee).replace(/ /g, "\\s")}\\s*сум/мес`));
  await expect(row.getByRole("textbox", { name: "Оплата в месяц, сум" })).toHaveCount(0); // no per-student fee field

  await expect(row).toContainText(
    new RegExp(`Неполный месяц: ${inPart} ${lessonsWord(inPart)} из ${inPeriod} по расписанию — ${String(expectedAmount).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s")} сум из ${String(fee).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s")}`),
  );
  await expect(row.getByText("Неполный месяц", { exact: true })).toBeVisible(); // the tag
  await expect(row.getByRole("textbox", { name: "Оплачено до" })).toHaveValue(period.end);
  await expect(row.getByRole("textbox", { name: "Сумма оплаты, сум" })).toHaveValue(new RegExp(`^${groupedDigits(expectedAmount).replace(/ /g, "\\s")}$`));

  // "+ следующий месяц" adds one complete period: its fee in full
  const nextEnd = billingPeriod(addDays(period.end, 1), billingDay).end;
  await row.getByRole("button", { name: /следующий месяц/ }).click();
  await expect(row.getByRole("textbox", { name: "Оплачено до" })).toHaveValue(nextEnd);
  await expect(row.getByRole("textbox", { name: "Сумма оплаты, сум" })).toHaveValue(new RegExp(`^${groupedDigits(expectedAmount + fee).replace(/ /g, "\\s")}$`));
  await row.getByRole("button", { name: /До конца месяца/ }).click(); // back to the incomplete month only

  // --- save: the payment is what the hint said
  await row.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Оплата внесена")).toBeVisible();
  const membership = await org.membershipId(student.id);
  const [payment] = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payment).toMatchObject({ amount: expectedAmount, valid_from: now.date, valid_to: period.end, partial_period: true });

  // --- the receipt carries the same incomplete-month mark
  await page.goto(`/owner/payments/receipt/${payment.id}`);
  const receipt = page.getByRole("article", { name: /Квитанция №/ });
  await expect(receipt).toContainText("неполный месяц");
  await expect(receipt).toContainText(money(expectedAmount));
  await expect(receipt).toContainText(`${dmy(now.date)}`);
});
