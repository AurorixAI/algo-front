import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow } from "../support/time";
import { dmy, expectNoHorizontalScroll, money, moneyPattern, toast } from "../support/ui";

/**
 * Owner: «Оплаты» (PAY-2: a payment is money; the server distributes it).  A brand-new student of a group WITHOUT a price is
 * is not in the list (the page says «не задана цена»); once the price is set on the group the debtor row is a plain row
 * (name, group, price, the chip «Ещё не платил» with the debt, «Внести оплату») and the dialog says what is due and starts the amount with it.  The payment lands in «Оплачено», the
 * history numbers it («№ N») and says where the money went, the receipt spells the amount in words and shows the snapshot,
 * the statement lists it with the running balance and «Сходится», and a cancelled payment stays in the history with its
 * reason (and the receipt is stamped).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Оплаты");
});

test("pay from a debtor row -> «Оплачено» -> history «№ N» -> receipt in words -> void with a reason", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Оплатин");
  const group = await org.createGroup({ name: "Группа О1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Платёжкин"); // the group has no price yet
  const page = await signIn(org.owner);
  const row = () => page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Платёжкин Анвар", exact: true }) });

  // --- the group has no price: nobody is owed yet, the list says so above itself and leads to «Цены групп»
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(page.getByText("У 1 ученика не задана цена")).toBeVisible();
  await expect(page.getByRole("link", { name: "Задать", exact: true })).toHaveAttribute("href", /\/owner\/payments\/prices$/);
  await expect(row()).toHaveCount(0);

  // --- the price is set ON THE GROUP (its own spec covers the screen); the row now suggests the sum from it
  await org.setGroupPrice(group.id, 450000);
  await page.reload();
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(row()).toContainText(student.displayId!);
  await expect(row()).toContainText(money(450000)); // «Цена в месяц»
  await expect(row()).toContainText("Ещё не платил");
  await expect(row()).toContainText(new RegExp(`Долг ${moneyPattern(450000)}`));
  await expect(row().getByRole("textbox")).toHaveCount(0); // no inline form: every debtor row is a plain row
  await row().getByRole("button", { name: "Внести оплату" }).click();
  const payDialog = page.getByRole("dialog", { name: "Внести оплату" });
  await expect(payDialog.getByTestId("payment-chips")).toContainText(new RegExp(moneyPattern(450000))); // the quick amount says what is due
  await expect(payDialog.getByLabel("Сумма", { exact: true })).not.toHaveValue(""); // the amount starts as everything that is due
  await payDialog.getByLabel("Сумма", { exact: true }).fill("450000");
  await expect(payDialog.getByTestId("payment-plan-sentence")).toContainText(/Закроет|Оплатит/); // what saving will do, in the future tense
  // the method is chosen, not guessed: the button waits for it and says why
  await expect(payDialog.getByRole("button", { name: /^Внести/ })).toBeDisabled();
  await expect(payDialog.getByTestId("payment-blocker")).toContainText("Выберите способ оплаты");
  await expect(payDialog.getByRole("radio", { name: "Другое" })).toHaveCount(0);
  await payDialog.getByRole("radio", { name: "Наличные" }).click();
  await payDialog.getByRole("button", { name: new RegExp(`^Внести\\s*${moneyPattern(450000)}`) }).click(); // the amount is in the button
  await expect(toast(page, "Оплата внесена")).toBeVisible();
  await expect(row()).toHaveCount(0); // left «Должники» (Ещё не платил)

  // --- it is now under «Оплачено»
  await page.getByRole("tab", { name: "Без долга" }).click();
  await expect(row()).toContainText(money(450000));
  await expect(row()).toContainText("Оплачено"); // the grey chip ...
  await expect(row()).toContainText("оплачено до"); // ... and the date under it (the server worked it out from the money)
  await expect(row().getByRole("button", { name: "Внести оплату" })).toBeVisible(); // one verb, also for a running payment
  await expect(page.getByRole("tab", { name: /^Без долга \(\d+\)$/ })).toBeVisible(); // every tab carries its number

  // --- history: «№ N»
  const membership = await org.membershipId(student.id);
  const [payment] = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payment.amount).toBe(450000);
  expect(payment.method).toBe("cash");
  expect(payment.receipt_no).toBeGreaterThan(0);
  expect(payment.allocation.items.length).toBeGreaterThan(0);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  // IA audit F10: the card keeps ONE line of the history; the history itself is the statement
  await expect(page.getByTestId("membership-last-payment")).toContainText(new RegExp(`Последняя оплата: ${moneyPattern(450000)}`));
  await expect(page.getByTestId("membership-last-payment")).toContainText(dmy(today));

  // --- the statement: the payment on the timeline («№ N», the method, where the money went), the balance after it, «Сходится»
  await page.getByRole("link", { name: "Выписка" }).click();
  await expect(page).toHaveURL(new RegExp(`/owner/payments/statement/${membership}$`));
  await expect(page.getByRole("heading", { name: "Выписка" })).toBeVisible();
  const paymentRow = page.getByTestId("statement-row-payment");
  await expect(paymentRow).toContainText(`№ ${payment.receipt_no}`);
  await expect(paymentRow).toContainText("Наличные"); // the method
  await expect(paymentRow.getByRole("list", { name: "Куда пошли деньги" })).toBeVisible(); // where the money went
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");
  // the statement leads on: the student's «Оплаты» tab and the group
  await expect(page.getByTestId("statement-student-link")).toHaveAttribute("href", new RegExp(`/owner/students/${student.id}\\?tab=payments$`));
  await expect(page.getByTestId("statement-group-link")).toHaveAttribute("href", new RegExp(`/owner/groups/${group.id}$`));

  // --- the receipt: amount in words, who, what
  await paymentRow.getByRole("button", { name: /^Действия:/ }).click();
  await page.getByRole("menuitem", { name: "Квитанция" }).dispatchEvent("click"); // a scroll closes the menu: the event goes to the item itself
  const receipt = page.getByRole("article", { name: `Квитанция № ${payment.receipt_no}` });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Четыреста пятьдесят тысяч сум");
  await expect(receipt).toContainText("Платёжкин Анвар");
  await expect(receipt).toContainText(student.displayId!);
  await expect(receipt).toContainText(group.name);
  await expect(receipt).toContainText(org.ownerName);
  await expect(receipt).toContainText("Способ оплаты");
  await expect(receipt.getByRole("region", { name: "Куда пошли деньги" })).toBeVisible(); // the snapshot at the moment of payment
  await expect(receipt.getByRole("note")).toHaveCount(0); // not voided yet: no stamp

  // --- void (from the statement): a reason of 3+ characters is mandatory
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page).toHaveURL(new RegExp(`/owner/payments/statement/${membership}$`));
  await page.getByTestId("statement-row-payment").getByRole("button", { name: /^Действия:/ }).click();
  await page.getByRole("menuitem", { name: "Отменить оплату", exact: true }).dispatchEvent("click"); // a scroll closes the menu: the event goes to the item itself
  const dialog = page.getByRole("dialog", { name: "Отменить оплату?" });
  await dialog.getByLabel("Причина").fill("ab");
  await dialog.getByRole("button", { name: "Отменить оплату" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Укажите причину (не короче 3 символов)");
  await dialog.getByLabel("Причина").fill("Ошибочно внесена сумма");
  await dialog.getByRole("button", { name: "Отменить оплату" }).click();
  await expect(toast(page, "Оплата отменена")).toBeVisible();
  await page.getByLabel("Показать отменённые").check();
  await expect(page.getByText(`Отменено: Ошибочно внесена сумма · ${org.ownerName}`)).toBeVisible();

  // the record is kept (grey) and the receipt of a cancelled payment is stamped
  const afterVoid = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(afterVoid).toHaveLength(1);
  expect(afterVoid[0].voided_at).toBeTruthy();
  expect(afterVoid[0].void_reason).toBe("Ошибочно внесена сумма");
  await page.goto(`/owner/payments/receipt/${payment.id}`);
  const stamped = page.getByRole("article", { name: `Квитанция № ${payment.receipt_no}` });
  await expect(stamped.getByRole("note")).toContainText("АННУЛИРОВАНА");
  await expect(stamped.getByRole("note")).toContainText("Ошибочно внесена сумма");

  // the student has no live payment again: he is not under «Оплачено» any more
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: "Без долга" }).click();
  await expect(row()).toHaveCount(0);
});

test("@mobile the payments list and the debtor row fit a phone", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Мобилин");
  const group = await org.createGroup({ name: "Группа О2", teacherId: teacher.userId });
  await org.addStudent(group, "Мадина", "Телефонова");
  const page = await signIn(org.owner);
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(page.getByText(/не задана цена/)).toBeVisible(); // the group has no price yet: the warning above the list, no row
  await expectNoHorizontalScroll(page);
  await org.setGroupPrice(group.id, 450000);
  await page.reload();
  await page.getByRole("tab", { name: /Должники/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Телефонова Мадина", exact: true }) });
  await expect(row).toContainText("Ещё не платил");
  await expect(row.getByRole("textbox")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Внести оплату" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
