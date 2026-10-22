import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow } from "../support/time";
import { cardMenuItem, dmy, expectNoHorizontalScroll, money, moneyPattern, toast } from "../support/ui";

/**
 * Owner: «Оплаты» (PAY-2: a payment is money; the server distributes it).  A brand-new student of a group WITHOUT a price is
 * shown with «цена группы не задана» and a link to the group; once the price is set on the group the quick-pay row says what
 * is due and starts the amount with it.  The row has an amount and a method, no dates.  The payment lands in «Оплачено», the
 * history numbers it («№ N») and says where the money went, the receipt spells the amount in words and shows the snapshot,
 * the statement lists it with the running balance and «Сходится», and a cancelled payment stays in the history with its
 * reason (and the receipt is stamped).
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
  await expect(row()).toContainText(new RegExp(`Цена группы: ${moneyPattern(450000)}\\s*сум/мес`));
  await expect(row().getByRole("textbox", { name: "Оплата в месяц, сум" })).toHaveCount(0);
  await expect(row().getByRole("textbox", { name: "Дата оплаты" })).toHaveCount(0); // PAY-2: no dates, the server distributes the money
  await expect(row().getByRole("textbox", { name: "Оплачено до" })).toHaveCount(0);
  await expect(row().getByTestId("quick-due")).toContainText("Всего к оплате"); // the server says what is due
  const amount = row().getByRole("textbox", { name: "Сумма оплаты, сум" });
  await expect(amount).not.toHaveValue(""); // the amount starts as everything that is due
  await amount.fill("450000");
  // the method is chosen, not guessed
  await row().getByRole("button", { name: "Сохранить" }).click();
  await expect(row().getByRole("alert")).toContainText("Выберите способ оплаты");
  await row().getByRole("combobox", { name: "Способ оплаты" }).selectOption("cash");
  await row().getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Оплата внесена")).toBeVisible();
  await expect(row()).toHaveCount(0); // left «Должники» (Ещё не платил)

  // --- it is now under «Оплачено»
  await page.getByRole("tab", { name: "Оплачено" }).click();
  await expect(row()).toContainText(money(450000));
  await expect(row()).toContainText("Оплачено"); // the grey chip ...
  await expect(row()).toContainText("оплачено до"); // ... and the date under it (the server worked it out from the money)
  await expect(row().getByRole("button", { name: "Внести оплату" })).toBeVisible(); // one verb, also for a running payment
  await expect(page.getByRole("tab", { name: /^Оплачено \(\d+\)$/ })).toBeVisible(); // every tab carries its number

  // --- history: «№ N»
  const membership = await org.membershipId(student.id);
  const [payment] = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payment.amount).toBe(450000);
  expect(payment.method).toBe("cash");
  expect(payment.receipt_no).toBeGreaterThan(0);
  expect(payment.allocation.items.length).toBeGreaterThan(0);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await cardMenuItem(page, "История оплат");
  await expect(page.getByText(new RegExp(`№\\s*${payment.receipt_no}\\b`))).toBeVisible();
  await expect(page.getByText(new RegExp(`оплачено ${dmy(today).replace(/\./g, "\\.")}`))).toBeVisible();
  await expect(page.getByText("Наличные").first()).toBeVisible(); // the method
  await expect(page.getByRole("list", { name: "Куда пошли деньги" }).first()).toBeVisible(); // where the money went

  // --- the statement: the payment on the timeline, the balance after it, «Сходится»
  await page.getByRole("link", { name: "Выписка" }).click();
  await expect(page).toHaveURL(new RegExp(`/owner/payments/statement/${membership}$`));
  await expect(page.getByRole("heading", { name: "Выписка" })).toBeVisible();
  await expect(page.getByTestId("statement-row-payment")).toContainText(`№ ${payment.receipt_no}`);
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page).toHaveURL(new RegExp(`/owner/students/${student.id}`));
  await page.getByRole("tab", { name: "Оплаты" }).click();
  if (!(await page.getByRole("region", { name: "История оплат" }).isVisible())) await cardMenuItem(page, "История оплат");

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
  await expect(receipt).toContainText("Способ оплаты");
  await expect(receipt.getByRole("region", { name: "Куда пошли деньги" })).toBeVisible(); // the snapshot at the moment of payment
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
  await expect(page.getByText(`Причина отмены: Ошибочно внесена сумма · ${org.ownerName}`)).toBeVisible();

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
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(page.getByText(/не задана цена/)).toBeVisible(); // the group has no price yet: the warning above the list, no row
  await expectNoHorizontalScroll(page);
  await org.setGroupPrice(group.id, 450000);
  await page.reload();
  await page.getByRole("tab", { name: /Должники/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Телефонова Мадина", exact: true }) });
  await expect(row.getByText(/Цена группы:/)).toBeVisible();
  await expect(row.getByRole("textbox", { name: "Сумма оплаты, сум" })).toBeVisible();
  await expect(row.getByRole("combobox", { name: "Способ оплаты" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
