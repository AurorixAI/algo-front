import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow, sharedMonthCharge } from "../support/time";
import { expectNoHorizontalScroll, moneyPattern } from "../support/ui";

/**
 * Money-2 T16: a NEW centre is in «Общий месяц» (a calendar month, the payment day the 1st).  A student who joins in the middle of the month owes a SHARE of the
 * price, not the whole of it: price x the days left of the month / the days of the month, in whole thousands, a half goes up (the group has no schedule yet, so
 * the share is counted by days).  The oracle is written from that rule and today's date, not read from the API.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Новый центр");   // no mode is set here on purpose: the default of a new centre is what this check is about
});

test("a new centre: the mode is «Общий месяц»; a student who joins today is asked the share of the month, not the whole price @mobile", async ({ signIn }) => {
  const now = businessNow();
  const price = 300000;
  const share = sharedMonthCharge(price, now.date, now.date);                   // the days left of the month (today counts) / the days of the month, whole thousands

  const teacher = await org.addStaff("teacher", "Месяцев");
  const group = await org.createGroup({ name: "Группа Н1", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, price);
  await org.addStudent(group, "Анвар", "Серединный");                            // joins today

  // --- the mode the screen shows is the one the server wrote for a new centre
  expect(await org.owner.api.get("/auth/org/settings/payments")).toMatchObject({ period_mode: "calendar", billing_anchor: "fixed_day", billing_day: 1 });
  const page = await signIn(org.owner);
  await page.goto("/owner/settings?section=payments");
  const section = page.getByRole("region", { name: "Оплаты" });
  await expect(section.getByRole("radio", { name: /Общий месяц для всех/ })).toBeChecked();
  await expect(section.getByRole("radio", { name: /Свой месяц/ })).not.toBeChecked();

  // --- the row says the share
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Ждём оплату/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Серединный Анвар", exact: true }) });
  await expect(row).toContainText(new RegExp(`К оплате ${moneyPattern(share)}`));
  await expectNoHorizontalScroll(page);
});
