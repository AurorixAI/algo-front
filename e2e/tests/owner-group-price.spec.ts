import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";
import { cardMenuItem, cardMenuLabels, dmy, expectNoHorizontalScroll, expectWithinViewportWidth, moneyPattern, openPriceMode, toast } from "../support/ui";

/**
 * #105 «цена группы»: the price is set on the GROUP (owner), the students of the group take it from there; the student
 * card only shows it, and an individual price is an explicit exception with a reason.
 *   groups list «Цена не задана» -> «Без цены» -> «задать» -> the page «Оплаты -> Цены групп»: «Задать цену» -> the consequences are shown before saving
 *   -> a past day warns -> the student card: «Цена … · цена группы» (no field to type a fee) -> «⋯» -> «Назначить
 *   индивидуальную цену» (reason required) -> «Вернуть цену группы».
 * The group page has no price line any more. A teacher gets no price anywhere (the API sends no `price_current`).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Цена");
});

const priceText = (amount: number, unit = "сум/мес") => new RegExp(`${moneyPattern(amount)}\\s*${unit}`);

test("price of the group -> consequences before saving -> student card shows it -> individual price with a reason -> back", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Ценников");
  const group = await org.createGroup({ name: "Группа Ц1", teacherId: teacher.userId });
  const anvar = await org.addStudent(group, "Анвар", "Ценный");
  await org.addStudent(group, "Мадина", "Ценная");
  const page = await signIn(org.owner);

  // --- the list: the group has no price, the card says so and the filter finds it
  await page.goto("/owner/groups");
  const card = page.getByTestId("group-card-price").filter({ hasText: "Цена не задана" });
  await expect(card.first()).toBeVisible();
  await page.getByRole("button", { name: /Без цены/ }).click();
  await expect(page).toHaveURL(/price=none/);
  await expect(page.getByRole("link", { name: /Открыть группу Группа Ц1/ })).toBeVisible();
  await page.getByRole("link", { name: "задать" }).first().click();

  // --- the page «Цены групп»: the row of the group, no price yet
  await expect(page).toHaveURL(new RegExp(`/owner/payments/prices\\?group=${group.id}`));
  const block = page.locator(`[data-group-id="${group.id}"]`);
  await expect(block).toContainText("Не задана");
  await block.getByRole("button", { name: "Задать цену" }).click();

  // --- the dialog: the consequences are on screen before «Сохранить»
  const dialog = page.getByRole("dialog", { name: "Задать цену группы" });
  await dialog.getByLabel("Цена в месяц").fill("500000");
  await expect(dialog).toContainText("Цену получат 2 ученика");
  await expect(dialog).toContainText("Внесённые оплаты не меняются, но долг и аванс пересчитываются");
  await expect(dialog.getByLabel("Действует с")).toHaveValue(today);

  // a past day: an explicit warning (the calculations change, the recorded payments never do)
  await dialog.getByLabel("Действует с").fill(addDays(today, -1));
  await expect(dialog).toContainText("Дата в прошлом");
  await dialog.getByLabel("Действует с").fill(today);
  await expect(dialog).not.toContainText("Дата в прошлом");

  await dialog.getByLabel("Примечание").fill("Новый учебный год");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Цена группы задана")).toBeVisible();
  await expect(block).toContainText(new RegExp(moneyPattern(500000)));
  await expect(block).toContainText(`с ${dmy(today)}`);
  await block.getByRole("button", { name: /^История цены: / }).click(); // IA audit F3: an icon button, not a «⋯» with one item
  const history = page.getByRole("dialog", { name: "История цены" });
  await expect(history.getByRole("list", { name: "История цены" })).toContainText("Новый учебный год");
  await page.keyboard.press("Escape");
  await expect(history).toHaveCount(0);

  const prices = await org.owner.api.get(`/auth/org/groups/${group.id}/prices`);
  expect(prices.current).toMatchObject({ amount: 500000, valid_from: today });
  const groupRow = await org.owner.api.get(`/auth/org/groups/${group.id}`);
  expect(groupRow.price_current).toMatchObject({ amount: 500000 });

  // --- a SCHEDULED group price shows only from its day and can be taken back (the row is gone, the cancellation stays in the history)
  await block.getByRole("button", { name: "Изменить цену" }).click();
  const plan = page.getByRole("dialog", { name: "Изменить цену группы" });
  await plan.getByLabel("Цена в месяц").fill("550000");
  await plan.getByLabel("Действует с").fill(addDays(today, 30));
  await expect(plan).toContainText("Новая цена начнёт действовать с");
  await plan.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Цена группы изменена")).toBeVisible();
  await expect(block.getByTestId("group-price-current")).toContainText(new RegExp(moneyPattern(500000))); // today it is still the old price
  const plannedDay = addDays(today, 30);
  await expect(block.getByTestId("group-price-scheduled")).toContainText(new RegExp(`${moneyPattern(550000)}\\s*сум\\s*с ${dmy(plannedDay).replace(/\./g, "\\.")}`));
  await block.getByRole("button", { name: "Отменить", exact: true }).click();
  await page.getByRole("dialog", { name: "Отменить запланированную цену?" }).getByRole("button", { name: "Отменить цену" }).click();
  await expect(toast(page, "Запланированная цена отменена")).toBeVisible();
  await expect(block.getByTestId("group-price-scheduled")).toHaveCount(0);
  await block.getByRole("button", { name: /^История цены: / }).click();
  await expect(page.getByRole("dialog", { name: "История цены" }).getByRole("list", { name: "Отменённые цены" })).toContainText("отменил запланированную цену");
  await page.keyboard.press("Escape");
  const afterGroupCancel = await org.owner.api.get(`/auth/org/groups/${group.id}/prices`);
  expect(afterGroupCancel.current).toMatchObject({ amount: 500000 });
  expect(afterGroupCancel.history.some((r: any) => r.valid_from === addDays(today, 30))).toBe(false);
  expect(afterGroupCancel.cancelled[0]).toMatchObject({ amount: 550000, valid_from: addDays(today, 30) });

  // --- the student card: the price of the group, no field to type a fee
  await page.goto(`/owner/students/${anvar.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  const price = page.getByTestId("membership-price");
  await expect(price).toContainText(/^Цена\s/);
  await expect(price).toContainText("· цена группы");
  await expect(price).toContainText(priceText(500000));
  await expect(page.getByRole("textbox", { name: /Цена в месяц/ })).toHaveCount(0);
  // IA audit F1: the menu has ONE item for the price; the history of the prices and of the payments are not in it
  const menuLabels = await cardMenuLabels(page);
  expect(menuLabels).toContain("Индивидуальная цена…");
  for (const gone of ["Вернуть цену группы", "Назначить индивидуальную цену", "История цены", "История оплат", "Пауза…"]) expect(menuLabels).not.toContain(gone);
  expect(menuLabels.length).toBeLessThanOrEqual(3);

  // --- an individual price: a reason is required
  await openPriceMode(page, "assign");
  const own = page.getByRole("dialog", { name: "Назначить индивидуальную цену" });
  await own.getByLabel(/Индивидуальная цена в месяц/).fill("400000");
  await own.getByLabel("Причина").fill("ab");
  await own.getByRole("button", { name: "Сохранить" }).click();
  await expect(own.getByRole("alert")).toContainText("Укажите причину");
  await own.getByLabel("Причина").fill("Сестра ученика");
  await own.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Индивидуальная цена назначена")).toBeVisible();
  await expect(page.getByTestId("membership-price")).toContainText("Индивидуальная цена");
  await expect(page.getByTestId("membership-price")).toContainText(priceText(400000));
  await expect(page.getByTestId("membership-price")).toContainText("· Сестра ученика"); // the reason follows the price
  const membership = await org.membershipId(anvar.id);
  const mine = await org.owner.api.get(`/auth/org/memberships/${membership}/price-override`);
  expect(mine.price).toMatchObject({ amount: 400000, source: "override", group_amount: 500000, reason: "Сестра ученика" });

  // --- and back to the price of the group
  await openPriceMode(page, "return");
  await page.getByRole("dialog", { name: "Вернуть цену группы" }).getByRole("button", { name: "Вернуть" }).click();
  await expect(toast(page, "Ученик снова платит по цене группы")).toBeVisible();
  await expect(page.getByTestId("membership-price")).toContainText("· цена группы");
  await expect(page.getByTestId("membership-price")).toContainText(priceText(500000));
  expect((await org.owner.api.get(`/auth/org/memberships/${membership}/price-override`)).price).toMatchObject({ amount: 500000, source: "group" });

  // --- a SCHEDULED individual price shows only from its day and can be taken back
  await openPriceMode(page, "assign");
  const planned = page.getByRole("dialog", { name: "Назначить индивидуальную цену" });
  await planned.getByLabel(/Индивидуальная цена в месяц/).fill("350000");
  await planned.getByLabel("Действует с").fill(addDays(today, 30));
  await planned.getByLabel("Причина").fill("С нового месяца");
  await planned.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, /действует с/)).toBeVisible();
  await expect(page.getByTestId("membership-price")).toContainText("· цена группы"); // today it is still the price of the group
  await openPriceMode(page, "cancel");
  await page.getByRole("dialog", { name: "Отменить запланированную цену?" }).getByRole("button", { name: "Отменить цену" }).click();
  await expect(toast(page, "Запланированная индивидуальная цена отменена")).toBeVisible();
  // the window of the individual price offers no «Отменить запланированную…» any more, and keeps the history inside
  await cardMenuItem(page, "Индивидуальная цена…");
  const hub = page.getByRole("dialog", { name: "Индивидуальная цена", exact: true });
  await expect(hub.getByTestId("price-mode-cancel")).toHaveCount(0);
  await expect(hub.getByRole("region", { name: "История цены" })).toContainText("Отменённые");
  await page.keyboard.press("Escape");
  const afterCancel = await org.owner.api.get(`/auth/org/memberships/${membership}/price-override`);
  expect(afterCancel.price).toMatchObject({ amount: 500000, source: "group" });
  expect(afterCancel.history.some((r: any) => r.valid_from === addDays(today, 30))).toBe(false); // the row is gone
  expect(afterCancel.cancelled[0]).toMatchObject({ amount: 350000, valid_from: addDays(today, 30), reason: "С нового месяца" });

  // --- a teacher gets no price anywhere
  expect(await org.owner.api.get(`/auth/org/groups/${group.id}`)).toHaveProperty("price_current"); // the owner has it ...
  const forTeacher = await teacher.api.get(`/auth/org/groups/${group.id}`);
  expect(forTeacher).not.toHaveProperty("price_current");
  await expect(teacher.api.get(`/auth/org/groups/${group.id}/prices`)).rejects.toMatchObject({ status: 403 });
  const teacherPage = await signIn(teacher);
  await teacherPage.goto(`/teacher/groups/${group.id}`);
  await expect(teacherPage.getByText(group.name).first()).toBeVisible();
  await expect(teacherPage.getByText("Цена группы")).toHaveCount(0);
  await expect(teacherPage.getByText(/\d\s*сум/)).toHaveCount(0);
});

test("@mobile the page «Цены групп» and its dialog fit a phone; the group page has no price line", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Мобильников");
  const group = await org.createGroup({ name: "Группа Ц2", teacherId: teacher.userId });
  await org.addStudent(group, "Булат", "Телефонный");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByRole("heading", { name: group.name }).first()).toBeVisible();
  await expect(page.getByTestId("group-price-current")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Цена группы" })).toHaveCount(0);
  await page.goto("/owner/payments");
  await page.getByRole("link", { name: "Цены групп" }).click();
  await expect(page).toHaveURL(/\/owner\/payments\/prices$/);
  const block = page.locator(`[data-group-id="${group.id}"]`);
  await expect(block).toContainText("Не задана");
  await expectNoHorizontalScroll(page);
  await block.getByRole("button", { name: "Задать цену" }).click();
  const dialog = page.getByRole("dialog", { name: "Задать цену группы" });
  await dialog.getByLabel("Цена в месяц").fill("350000");
  await expect(dialog).toContainText("Цену получит 1 ученик");
  await expectWithinViewportWidth(page, dialog);
  await expectNoHorizontalScroll(page);
});
