import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addMonthMinusDay, businessNow } from "../support/time";
import { cardMenuItem, dmy, expectNoHorizontalScroll, money, moneyPattern, toast } from "../support/ui";

/**
 * Owner: «Оплаты». A brand-new student of a group WITHOUT a price is shown with «цена группы не задана» and a link to the
 * group (#105: there is no per-student fee field any more); once the price is set on the group the quick-pay row suggests
 * the sum from it, the payment lands in «Оплачено», the history numbers it («№ N»), the receipt spells the amount in
 * words, and a cancelled payment stays in the history with its reason (and the receipt is stamped).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Оплаты");
});

test("quick pay -> «Оплачено» -> history «№ N» -> receipt in words -> void with a reason", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Оплатин");
  const group = await org.createGroup({ name: "Группа О1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Платёжкин"); // the group has no price yet
  const page = await signIn(org.owner);
  const row = () => page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Платёжкин Анвар", exact: true }) });

  // --- a student without data waits in «Без оплат»; the group has no price: the row says so and links to the group
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Без оплат/ }).click();
  await expect(row()).toContainText(student.displayId!);
  await expect(row()).toContainText("Цена группы не задана");
  await expect(row().getByRole("link", { name: "задать цену группы" })).toHaveAttribute("href", new RegExp(`/owner/groups/${group.id}#price$`));
  await expect(row().getByRole("textbox", { name: "Оплата в месяц, сум" })).toHaveCount(0); // no per-student fee field
  await expect(row().getByRole("textbox", { name: "Сумма оплаты, сум" })).toBeVisible(); // the sum is typed by hand

  // --- the price is set ON THE GROUP (its own spec covers the screen); the row now suggests the sum from it
  await org.setGroupPrice(group.id, 450000);
  await page.reload();
  await page.getByRole("tab", { name: /Без оплат/ }).click();
  await expect(row()).toContainText(new RegExp(`Цена группы: ${moneyPattern(450000)}\\s*сум/мес`));
  await expect(row().getByRole("textbox", { name: "Оплата в месяц, сум" })).toHaveCount(0);
  await expect(row()).toContainText("Полный месяц — 450 000 сум");
  await expect(row().getByRole("textbox", { name: "Оплачено до" })).toHaveValue(addMonthMinusDay(today));
  await row().getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Оплата внесена")).toBeVisible();
  await expect(row()).toHaveCount(0); // left «Без оплат»

  // --- it is now under «Оплачено»
  await page.getByRole("tab", { name: "Оплачено" }).click();
  const paidUntil = dmy(addMonthMinusDay(today));
  await expect(row()).toContainText(money(450000));
  await expect(row()).toContainText("Оплачено"); // the grey chip ...
  await expect(row()).toContainText(`оплачено до ${paidUntil}`); // ... and the date under it
  await expect(row().getByRole("button", { name: "Продлить" })).toBeVisible(); // a running payment is extended, not entered again
  await expect(page.getByRole("tab", { name: /^Оплачено \(\d+\)$/ })).toBeVisible(); // every tab carries its number

  // --- history: «№ N»
  const membership = await org.membershipId(student.id);
  const [payment] = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payment.amount).toBe(450000);
  expect(payment.receipt_no).toBeGreaterThan(0);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await cardMenuItem(page, "История оплат");
  await expect(page.getByText(new RegExp(`№\\s*${payment.receipt_no}\\b`))).toBeVisible();
  await expect(page.getByText(new RegExp(`оплачено ${dmy(today).replace(/\./g, "\\.")}`))).toBeVisible();

  // --- the receipt: amount in words, who, what
  await page.getByRole("button", { name: /Действия с оплатой/ }).click();
  await page.getByRole("menuitem", { name: "Квитанция" }).click();
  const receipt = page.getByRole("article", { name: `Квитанция № ${payment.receipt_no}` });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Четыреста пятьдесят тысяч сум");
  await expect(receipt).toContainText("Платёжкин Анвар");
  await expect(receipt).toContainText(student.displayId!);
  await expect(receipt).toContainText(group.name);
  await expect(receipt).toContainText(org.ownerName);
  await expect(receipt.getByRole("note")).toHaveCount(0); // not voided yet: no stamp

  // --- void: a reason of 3+ characters is mandatory
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page).toHaveURL(new RegExp(`/owner/students/${student.id}`));
  await page.getByRole("tab", { name: "Оплаты" }).click();
  if (!(await page.getByRole("region", { name: "История оплат" }).isVisible())) await cardMenuItem(page, "История оплат");
  await page.getByRole("button", { name: /Действия с оплатой/ }).click();
  await page.getByRole("menuitem", { name: "Отменить", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Отменить оплату?" });
  await dialog.getByLabel("Причина").fill("ab");
  await dialog.getByRole("button", { name: "Отменить оплату" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Укажите причину (не короче 3 символов)");
  await dialog.getByLabel("Причина").fill("Ошибочно внесена сумма");
  await dialog.getByRole("button", { name: "Отменить оплату" }).click();
  await expect(toast(page, "Оплата отменена")).toBeVisible();
  await expect(page.getByText(`Отменена: Ошибочно внесена сумма · ${org.ownerName}`)).toBeVisible();

  // the record is kept (grey) and the receipt of a cancelled payment is stamped
  const afterVoid = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(afterVoid).toHaveLength(1);
  expect(afterVoid[0].voided_at).toBeTruthy();
  expect(afterVoid[0].void_reason).toBe("Ошибочно внесена сумма");
  await page.getByRole("button", { name: /Действия с оплатой/ }).click();
  await page.getByRole("menuitem", { name: "Квитанция" }).click();
  const stamped = page.getByRole("article", { name: `Квитанция № ${payment.receipt_no}` });
  await expect(stamped.getByRole("note")).toContainText("АННУЛИРОВАНА");
  await expect(stamped.getByRole("note")).toContainText("Ошибочно внесена сумма");

  // the student has no live payment again: he is not under «Оплачено» any more
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: "Оплачено" }).click();
  await expect(row()).toHaveCount(0);
});

test("@mobile the payments list and the quick-pay row fit a phone", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Мобилин");
  const group = await org.createGroup({ name: "Группа О2", teacherId: teacher.userId });
  await org.addStudent(group, "Мадина", "Телефонова");
  const page = await signIn(org.owner);
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Без оплат/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Телефонова Мадина", exact: true }) });
  await expect(row.getByText("Цена группы не задана")).toBeVisible();
  await expect(row.getByRole("textbox", { name: "Дата оплаты" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
