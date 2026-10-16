import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addMonthMinusDay, businessNow } from "../support/time";
import { dmy, expectNoHorizontalScroll, money, toast } from "../support/ui";

/**
 * Owner: «Оплаты». A brand-new student without a fee is paid in the quick-pay row (the fee is typed there),
 * lands in «Оплачено», the history numbers the payment («№ N»), the receipt spells the amount in words, and a
 * cancelled payment stays in the history with its reason (and the receipt is stamped).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Оплаты");
});

test("quick pay -> «Оплачено» -> history «№ N» -> receipt in words -> void with a reason", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Оплатин");
  const group = await org.createGroup({ name: "Группа О1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Платёжкин"); // no fee yet
  const page = await signIn(org.owner);
  const row = () => page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Платёжкин Анвар", exact: true }) });

  // --- quick pay: a student without data waits in «Нет данных»; the fee is typed in the row
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Нет данных/ }).click();
  await expect(row()).toContainText(student.displayId!);
  await row().getByRole("textbox", { name: "Оплата в месяц, сум" }).fill("450000");
  await expect(row()).toContainText("Полный месяц — 450 000 сум");
  await expect(row().getByRole("textbox", { name: "Оплачено до" })).toHaveValue(addMonthMinusDay(today));
  await row().getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Оплата внесена")).toBeVisible();
  await expect(row()).toHaveCount(0); // left «Нет данных»

  // --- it is now under «Оплачено»
  await page.getByRole("tab", { name: "Оплачено" }).click();
  const paidUntil = dmy(addMonthMinusDay(today));
  await expect(row()).toContainText(money(450000));
  await expect(row()).toContainText(`Оплачено до ${paidUntil}`);

  // --- history: «№ N»
  const membership = await org.membershipId(student.id);
  const [payment] = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payment.amount).toBe(450000);
  expect(payment.receipt_no).toBeGreaterThan(0);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await page.getByRole("button", { name: "История оплат" }).click();
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
  const history = page.getByRole("button", { name: "История оплат" });
  if ((await history.getAttribute("aria-expanded")) !== "true") await history.click();
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
  await page.getByRole("tab", { name: /Нет данных/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Телефонова Мадина", exact: true }) });
  await expect(row.getByRole("textbox", { name: "Оплата в месяц, сум" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
