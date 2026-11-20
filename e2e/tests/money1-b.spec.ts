import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * «Деньги-1 / Б» (расчёт оплат), the screens against the real server:
 *  - the window of a price change names EVERY student the change moves, «было → станет», with the next period («следующий период с …: 300 000 → 400 000 сум (+100 000)»), the individual prices apart;
 *  - PAY-DUE: «К оплате» is a tab of its own: a student whose period has just begun (the term of 5 days is running) is NOT among «Должники»; the red card and the badge count the debtors only; there is NO red notice any more;
 *  - «Оплата с» in adding a student: the owner sees the date (the first lesson by default), the quiet line without the money right is the server's `billing.text`.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Деньги Б");
  await org.setPersonalPeriod(); // «Свой месяц у каждого ученика» BEFORE the first student: in an empty centre the change acts from the very beginning (Money-2 Г3); the default of a new centre is «Общий месяц»
  await org.setPaymentSettings({ accounting_start_date: addDays(businessNow().date, -60) });
});

const post = (path: string, body: unknown) => org.owner.api.post(path, body);

test("Б3: the price window lists every moved student with the next period; PAY-DUE: «К оплате» is apart from «Должники», the cards count each part, no notice above the page", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Ждунов");
  const group = await org.createGroup({ name: "Группа Б", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 300000, { validFrom: addDays(today, -60) });
  const waiter = await org.createStudent("Пётр", "Ждущий");
  const debtor = await org.createStudent("Иван", "Долгов");
  const payer = await org.createStudent("Алия", "Платящая");
  // «Оплата с» yesterday: the period began yesterday (inside the term of 5 days: «К оплате»); ten days ago: the term has passed («Долг»); paid in time
  await post(`/auth/org/groups/${group.id}/students/${waiter.id}`, { pay_from: addDays(today, -1) });
  await post(`/auth/org/groups/${group.id}/students/${debtor.id}`, { pay_from: addDays(today, -10) });
  await post(`/auth/org/groups/${group.id}/students/${payer.id}`, { pay_from: addDays(today, -1) });
  await org.pay(payer.id, 300000);

  // --- the server's split, the same numbers on the screen
  const summary = await org.owner.api.get("/auth/org/payments/summary");
  expect(summary).toMatchObject({ debtors: 1, due_students: 1, debt_total: 300000, due_total: 300000 });

  const page = await signIn(org.owner);
  await page.goto("/owner/payments?bucket=debtors");
  const tabs = page.getByRole("tab");
  await expect(tabs.nth(0)).toHaveText("Должники 1");
  await expect(tabs.nth(1)).toHaveText("К оплате 1");
  await expect(page.getByRole("list").filter({ hasText: "Долгов Иван" })).toContainText(/Долг 300\s000\sсум/);
  await expect(page.getByRole("list").filter({ hasText: "Долгов Иван" })).toContainText(/просрочено \d+ дн/);
  await expect(page.getByText("Ждущий Пётр")).toHaveCount(0);       // the student within his term is not a debtor
  await expect(page.getByTestId("position-debt")).toContainText(/300\s000\sсум/);
  await expect(page.getByTestId("position-due")).toContainText(/300\s000\sсум/);
  await expect(page.getByTestId("position-due")).toContainText("1 ученик");
  await expectNoHorizontalScroll(page);

  await page.goto("/owner/payments?bucket=to_pay");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("К оплате 1");
  const row = page.getByRole("listitem").filter({ hasText: "Ждущий Пётр" });
  await expect(row).toContainText(/К оплате 300\s000\sсум/);
  await expect(row).toContainText(/до (сегодня|завтра, \d\d\.\d\d|\d\d\.\d\d)/);
  await expect(row).not.toContainText("просрочено");
  await expect(page.getByText("Долгов Иван")).toHaveCount(0);

  // --- no red notice above the page (PAY-DUE 9.7): the same fact is in the card, the tab and the badge of the menu
  await page.goto("/owner/dashboard");
  await expect(page.getByTestId("payments-alert-banner")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-tile-debt")).toContainText(/300\s000\sсум/);
  await expect(page.getByTestId("dashboard-tile-due")).toContainText(/300\s000\sсум/);

  // --- the price window: every moved student, the next period, in the table «было → станет»
  await page.goto(`/owner/payments/prices?group=${group.id}`);
  const block = page.locator(`[data-group-id="${group.id}"]`);
  await block.getByRole("button", { name: "Изменить цену" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить цену группы" });
  await dialog.getByLabel("Цена в месяц").fill("400000");
  const table = dialog.getByTestId("price-impact-money-students");
  await expect(table).toBeVisible();
  await expect(table).toContainText("Платящая Алия");
  await expect(table).toContainText(/Следующий период с \d\d\.\d\d/);
  await expect(table).toContainText(/\+100\s000\sсум/);
  await expect(dialog.getByTestId("price-impact-money-summary")).toHaveText("Изменится у 3 учеников");
  await expect(dialog.getByTestId("price-impact-money-totals")).toContainText(/Следующий период дороже в сумме, 3 ученика\s*\+300\s000\sсум/);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("dialog", { name: "Изменить цену группы" })).toHaveCount(0);
});

test("Б1: «Оплата с» - the owner sees the date with the first lesson by default and a past day charges at once; the new group form has a price", async ({ signIn }) => {
  const today = businessNow().date;
  const group = await org.createGroup({ name: "Группа Б1" });
  await org.setGroupPrice(group.id, 300000, { validFrom: addDays(today, -60) });
  const student = await org.createStudent("Ольга", "Новая");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await page.getByRole("button", { name: /Добавить ученика|Зачислить/ }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByPlaceholder(/Поиск по имени/).fill("Нов");
  // a row of the list is a label with a box that is never ticked: the click takes the student out of the list into a label with a cross under the search - so the click, then the label and the bar prove the choice (a box that vanishes cannot be «checked»)
  await drawer.getByRole("checkbox", { name: /Новая Ольга/ }).click();
  await expect(drawer.getByTestId("picked-chips")).toContainText("Новая Ольга");
  await expect(drawer.getByRole("button", { name: /^Убрать: Новая Ольга/ })).toBeVisible();
  await expect(drawer.getByRole("checkbox", { name: /Новая Ольга/ })).toHaveCount(0);
  // the conditions are ONE line («Оплата с 19 ноября, по цене группы»); the date opens under «Изменить»
  await expect(drawer.getByTestId("enrol-terms-line")).toContainText(/^Оплата с \d{1,2} [а-яё]+, по цене группы/);
  await drawer.getByTestId("enrol-terms-toggle").click();
  const field = drawer.getByTestId("pay-from");
  await expect(field).toBeVisible();
  await expect(field.getByLabel("Оплата с")).toHaveValue(/\d\d\.\d\d\.\d{4}/);
  // the DEFAULT day is proved by the value of the field = the day the server names; the sentence is the server's (the reason is shown muted under the line), no «?» in the window
  const def = await org.owner.api.get(`/auth/org/groups/${group.id}/pay-from-default`);
  expect(def.text).toMatch(/^Оплата с \d\d\.\d\d\.\d{4} — (сегодня у группы занятие|ближайшее занятие группы|у группы нет занятий в ближайшие дни|начало учёта центра)$/);   // one of the four sentences of the server (`billing_start.default_text`; fix 11, S2); which one depends on the schedule of the group on the day of the run
  await expect(field.getByLabel("Оплата с")).toHaveValue(def.default_pay_from.split("-").reverse().join("."));
  await expect(field).toContainText("По умолчанию");
  await expect(drawer.getByLabel("Пояснение")).toHaveCount(0);
  // a day in the past: the server says how much is charged at once, in the bar before the button
  const input = field.getByLabel("Оплата с");
  await input.fill(addDays(today, -5).split("-").reverse().join("."));
  await input.press("Tab");
  // the BAR under the window: the words of the server over the sum (PAY-DUE 10.4: «К оплате до ДД.ММ» / «К оплате сегодня» / «Долг сразу · срок был ДД.ММ», by the term of the centre), ONE big sum (its own test id) and one line that explains it, made of the fields of the server's answer
  const bar = drawer.getByTestId("summary-bar");
  await expect(bar.getByTestId("summary-bar-label").first()).toHaveText(/^(К оплате до \d\d\.\d\d|К оплате сегодня|Долг сразу( · срок был \d\d\.\d\d)?|Долг \d.*|К оплате \d.*)$/);
  await expect(bar.getByTestId("summary-bar-sum")).toHaveText(/^\d[\d\s\u00a0]*\sсум$/);
  // one period: «5 уроков из 12 в ноябре» (a whole period by dates: «13 уроков · весь период 20.11–19.12»); the past days cross a month: «за октябрь и ноябрь» and «По ученикам» (one student: the periods in the line)
  await expect(bar.getByTestId("summary-bar-line")).toContainText(/(\d+ (урок|урока|уроков) (из \d+ (в [а-яё]+|за период)|· весь период)|^за [а-яё]+( и [а-яё]+)?)/);
  await expect(drawer.getByTestId("enrol-submit")).toBeEnabled();
  await drawer.getByTestId("enrol-submit").click();
  await expect(drawer).toHaveCount(0);
  const membership = await org.membershipId(student.id, group.id);
  const status = await org.owner.api.get("/auth/org/payments/status", { bucket: "all", search: "Новая" });
  expect(status.items.find((row: any) => row.membership_id === membership)).toBeTruthy();

  // Б2: the form of a new group has the price for the owner
  await page.goto("/owner/groups");
  await page.getByRole("button", { name: /Создать группу|Новая группа/ }).first().click();
  const form = page.getByRole("dialog", { name: "Новая группа" });
  await expect(form.getByLabel(/Цена в месяц/)).toBeVisible();
});
