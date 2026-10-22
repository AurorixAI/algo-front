import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { expectNoHorizontalScroll, groupMenuItem, moneyPattern, openPriceMode, toast } from "../support/ui";

/**
 * ROADMAP #126: the tab «Оплаты» of the group page - who pays what, who has an individual price (and why).
 *   group -> «Оплаты» -> filter «Индивидуальная цена» -> «⋯» «Индивидуальная цена…» -> the badge «индивидуальная» appears
 *   -> «Цены групп»: «N учеников» is a link that opens the tab with the filter (?tab=payments&filter=individual).
 * An administrator without the money right gets no tab; a teacher's group page has none.
 * Also (owner feedback): the header of the group has no «Изменить…»; a changed «Тип занятий» in the edit form shows the impact dialog.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Оплаты группы");
});

test("group -> «Оплаты» -> filter -> individual price via «⋯» -> badge -> «Цены групп» link opens the filtered tab", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Групповой");
  const group = await org.createGroup({ name: "Группа Г1", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 500000);
  await org.addStudent(group, "Анвар", "Платёжный");
  const madina = await org.addStudent(group, "Мадина", "Льготная", { amount: 400000, reason: "Сестра ученика" });
  const timur = await org.addStudent(group, "Тимур", "Должников");
  const page = await signIn(org.owner);

  // --- the 4th tab, the answer first
  await page.goto(`/owner/groups/${group.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await expect(page).toHaveURL(/tab=payments/);
  const summary = page.getByTestId("group-payments-summary");
  await expect(summary).toContainText(new RegExp(`Цена группы\\s*${moneyPattern(500000)}`));
  await expect(summary).toContainText("1 ученик с индивидуальной ценой");
  await expect(page.getByTestId("group-payment-row")).toHaveCount(3);

  // --- the filter: only the student with an individual price, and the badge says why
  await page.getByTestId("payments-filter-individual").click();
  await expect(page).toHaveURL(/filter=individual/);
  await expect(page.getByTestId("payments-filter-individual")).toContainText("(1)");
  const rows = page.getByTestId("group-payment-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Льготная");
  await expect(rows.first().getByTestId("group-payment-price")).toContainText(new RegExp(moneyPattern(400000)));
  await expect(rows.first().getByTestId("individual-badge")).toHaveText("индивидуальная");
  await expect(rows.first().getByTestId("membership-chip")).toBeVisible(); // the same chip as on the student card

  // --- «⋯» -> «Назначить индивидуальную цену» for another student (a reason is required)
  await page.getByTestId("payments-filter-all").click();
  await expect(page.getByTestId("group-payment-row")).toHaveCount(3);
  const row = page.locator(`[data-membership-id="${await org.membershipId(timur.id, group.id)}"]`);
  await expect(row.getByTestId("individual-badge")).toHaveCount(0);
  await openPriceMode(page, "assign", row); // «⋯» -> «Индивидуальная цена…» -> «Назначить индивидуальную цену» (the same menu as on the student card)
  const dialog = page.getByRole("dialog", { name: "Назначить индивидуальную цену" });
  await dialog.getByLabel(/Индивидуальная цена в месяц/).fill("350000");
  await dialog.getByLabel("Причина").fill("ab");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Укажите причину");
  await dialog.getByLabel("Причина").fill("Скидка за двоих");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Индивидуальная цена назначена")).toBeVisible();

  // --- the chip appears, the count grows, the server agrees
  await expect(row.getByTestId("individual-badge")).toBeVisible();
  await expect(row.getByTestId("group-payment-price")).toContainText(new RegExp(moneyPattern(350000)));
  await expect(page.getByTestId("payments-filter-individual")).toContainText("(2)");
  await expect(page.getByTestId("group-payments-summary")).toContainText("2 ученика с индивидуальной ценой");
  const mine = await org.owner.api.get(`/auth/org/memberships/${await org.membershipId(timur.id, group.id)}/price-override`);
  expect(mine.price).toMatchObject({ amount: 350000, source: "override", reason: "Скидка за двоих" });

  // --- the count on «Цены групп» is the same, and it is a link to the filtered tab
  await page.goto("/owner/payments/prices");
  const block = page.locator(`[data-group-id="${group.id}"]`);
  const link = block.getByTestId("group-individual-link");
  await expect(link).toHaveText("2 ученика");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/owner/groups/${group.id}\\?tab=payments&filter=individual`));
  await expect(page.getByRole("tab", { name: "Оплаты", selected: true })).toBeVisible();
  await expect(page.getByTestId("payments-filter-individual")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("group-payment-row")).toHaveCount(2);

  // --- «Вернуть цену группы» takes the badge back
  const back = page.locator(`[data-membership-id="${await org.membershipId(madina.id, group.id)}"]`);
  await openPriceMode(page, "return", back);
  await page.getByRole("dialog", { name: "Вернуть цену группы" }).getByRole("button", { name: "Вернуть" }).click();
  await expect(toast(page, "Ученик снова платит по цене группы")).toBeVisible();
  await expect(page.getByTestId("payments-filter-individual")).toContainText("(1)");
});

test("an administrator without the money right gets no «Оплаты» tab (a deep link falls back to «Ученики»); a teacher has none", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Без денег");
  const group = await org.createGroup({ name: "Группа Г2", teacherId: teacher.userId });
  await org.addStudent(group, "Булат", "Скрытый");
  const admin = await org.addStaff("admin", "Безденежный");
  const adminPage = await signIn(admin);
  await adminPage.goto(`/admin/groups/${group.id}?tab=payments&filter=individual`);
  await expect(adminPage.getByRole("tab", { name: /Ученики/ })).toBeVisible();
  await expect(adminPage.getByRole("tab", { name: "Оплаты" })).toHaveCount(0);
  await expect(adminPage.getByTestId("group-payments-tab")).toHaveCount(0);
  await expect(teacher.api.get(`/auth/org/payments/status`, { group_id: group.id })).rejects.toMatchObject({ status: 403 });
  const teacherPage = await signIn(teacher);
  await teacherPage.goto(`/teacher/groups/${group.id}`);
  await expect(teacherPage.getByRole("tab", { name: "Оплаты" })).toHaveCount(0);
});

test("@mobile the tab fits a phone: cards, no horizontal scroll, the badge opens on a tap", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Мобильный");
  const group = await org.createGroup({ name: "Группа Г3 с довольно длинным названием", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 500000);
  for (let i = 0; i < 9; i += 1) await org.addStudent(group, `Ученик${i}`, i === 0 ? "Длиннофамильный-Двойной" : `Фамилия${i}`, i === 0 ? { amount: 400000, reason: "Сестра ученика" } : undefined);
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=payments`);
  await expect(page.getByTestId("group-payment-row")).toHaveCount(9);
  await expectNoHorizontalScroll(page);
  await expect(page.getByLabel("Поиск ученика")).toBeVisible(); // from 9 rows
  await page.getByTestId("individual-badge").first().tap();
  await expect(page.getByRole("tooltip")).toContainText("Сестра ученика");
  await expectNoHorizontalScroll(page);
});

test("the header of the group has no «Изменить…»; a changed «Тип занятий» in the edit form shows the impact dialog, an unchanged one saves at once", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Типовой");
  const group = await org.createGroup({ name: "Группа Г4", teacherId: teacher.userId });
  await org.addStudent(group, "Ильдар", "Типовой");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByTestId("group-lesson-type-line")).toHaveText("Тип занятий: Группа");
  await expect(page.getByRole("button", { name: "Изменить…" })).toHaveCount(0);

  // unchanged: a plain save (the edit form opens from «⋯» -> «Изменить группу…»)
  await groupMenuItem(page, group.name, "Изменить группу…");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(toast(page, "Группа обновлена")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Тип занятий" })).toHaveCount(0);

  // changed: the impact step first (date, payroll, history), then the saved type
  await groupMenuItem(page, group.name, "Изменить группу…");
  await page.getByRole("combobox", { name: /Тип занятий/ }).click();
  await page.getByRole("option", { name: "Парный" }).click();
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  const dialog = page.getByRole("dialog", { name: "Тип занятий" });
  await expect(dialog.getByLabel("Тип занятий меняется с")).toBeVisible();
  await expect(dialog.getByTestId("lesson-type-impact")).toContainText("Что изменится");
  await expect(dialog.getByTestId("lesson-type-history")).toBeVisible();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, /тип занятий изменён/)).toBeVisible();
  await expect(page.getByTestId("group-lesson-type-line")).toHaveText("Тип занятий: Парный");
  expect((await org.owner.api.get(`/auth/org/groups/${group.id}/lesson-types`)).current).toBe("pair");
});

test("the header of the group: the price chip and «Цена группы…» in «⋯» (the same dialog as «Цены групп»), «Долг N» leads to the tab «Оплаты»", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Ценовой");
  const group = await org.createGroup({ name: "Группа Г5", teacherId: teacher.userId });
  await org.addStudent(group, "Тимур", "Должников");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByTestId("group-price-chip")).toContainText("Цена группы не задана");
  await groupMenuItem(page, group.name, "Цена группы…");
  const dialog = page.getByRole("dialog", { name: "Задать цену группы" });
  await dialog.getByLabel("Цена в месяц").fill("500000");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Цена группы задана")).toBeVisible();
  await expect(page.getByTestId("group-price-chip")).toContainText(new RegExp(moneyPattern(500000)));
  // the student has not paid: the debt of the group is a chip, a link to the filtered tab
  await expect(page.getByTestId("group-debt-chip")).toContainText(/Долг/);
  await page.getByTestId("group-debt-chip").click();
  await expect(page).toHaveURL(new RegExp(`/owner/groups/${group.id}\\?tab=payments&filter=debt`));
  await expect(page.getByTestId("group-payments-tab")).toBeVisible();
});
