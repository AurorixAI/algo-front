import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";
import { dm, expectNoHorizontalScroll, expectStatementReconciles, fillDate, studentLink } from "../support/ui";

/**
 * LOGIC-A «Пауза»: «Пауза…» in the menu of a group of the «Обучение» tab (IA audit 22.10: a pause is a property of the enrolment, not of the
 * money) puts a student on pause «с … по …».  He moves to the tab
 * «На паузе», the paused days cost nothing (the statement says «Пауза … — стоимость не считается» and shows no charge, while the same
 * group's other student is charged the whole period), and a lesson inside the pause does not have him on its list.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Пауза");
  await org.setPersonalPeriod(); // «Свой месяц у каждого ученика» BEFORE the first student: in an empty centre the change acts from the very beginning (Money-2 Г3); the default of a new centre is «Общий месяц»
  await org.setPaymentSettings({ accounting_start_date: addDays(businessNow().date, -60) });
});

const costOf = async (page: import("@playwright/test").Page, membership: string): Promise<number> => {
  await page.goto(`/owner/payments/statement/${membership}`);
  await expect(page.getByRole("heading", { name: "Выписка" })).toBeVisible();
  await expectStatementReconciles(page);
  const text = (await page.locator("body").innerText()).replace(/ /g, " ");
  const match = /Стоимость обучения\s+([\d ]+) сум/.exec(text);
  if (!match) throw new Error("no «Стоимость обучения» on the statement");
  return Number(match[1].replace(/ /g, ""));
};

test("pause: «На паузе» tab, no charge for the paused days, the lesson list leaves the student out @mobile", async ({ signIn }) => {
  const today = businessNow().date;
  const last = addDays(today, 9); // ten days of pause
  const teacher = await org.addStaff("teacher", "Паузин");
  const group = await org.createGroup({ name: "Группа П1", teacherId: teacher.userId });
  const away = await org.addStudent(group, "Достон", "Уехавший");
  // Money-1 B7: the one who stays is a real debtor (charged from ten days ago), so «Должники» has a row to check next to the paused one
  const stays = await org.addStudent(group, "Малика", "Оставшаяся", undefined, addDays(today, -10));
  await org.setGroupPrice(group.id, 500000);
  const awayMembership = await org.membershipId(away.id, group.id);
  const staysMembership = await org.membershipId(stays.id, group.id);

  const page = await signIn(org.owner);

  // --- the dialog «Пауза ученика»: from today to the 10th day
  await page.goto(`/owner/students/${away.id}?tab=learning`);
  await page.waitForLoadState("networkidle"); // the card still loads the pauses: a menu opened meanwhile is closed by the re-render
  await page.getByRole("button", { name: /^Действия по группе:/ }).click();
  await page.getByRole("menuitem", { name: /^Пауза/ }).dispatchEvent("click"); // a scroll closes the menu: the event goes to the item itself
  const dialog = page.getByRole("dialog", { name: "Пауза ученика" });
  await expect(dialog).toBeVisible();
  await fillDate(dialog.locator("#pause-first"), today);
  await fillDate(dialog.locator("#pause-last"), last);
  await dialog.getByLabel(/Причина/).fill("Уехал к бабушке");
  await dialog.getByRole("button", { name: "Поставить на паузу" }).click();
  await expect(dialog).toHaveCount(0);

  // --- the tab «На паузе» holds him, «Должники» does not
  await page.goto("/owner/payments");
  const rowOf = (name: string) => page.getByRole("listitem").filter({ has: studentLink(page, name) });
  // the tabs read «Название N» (the count is a separate badge, no brackets): the tab «На паузе» with the count 1 is there and leads to the list of the paused
  const pausedTab = page.getByRole("tab", { name: /^На паузе\s*1$/ });
  await expect(pausedTab).toBeVisible();
  await pausedTab.click();
  await expect(pausedTab).toHaveAttribute("aria-selected", "true");
  await expect(rowOf("Уехавший Достон")).toContainText(`На паузе до ${dm(last)}`);
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(rowOf("Уехавший Достон")).toHaveCount(0);
  await expect(rowOf("Оставшаяся Малика")).toHaveCount(1);

  // --- no charge for the paused days: the statement names the pause and the other student is charged 500 000, he is not charged
  await page.goto(`/owner/payments/statement/${awayMembership}`);
  await expect(page.getByText(new RegExp(`Пауза ${dm(today)}–${dm(last)} — стоимость не считается`))).toBeVisible();
  await expectNoHorizontalScroll(page);
  const paused = await costOf(page, awayMembership);
  const full = await costOf(page, staysMembership);
  expect(full).toBe(500000);
  expect(paused).toBe(0); // the pause starts on the first day: the period begins after it, the paused days cost nothing

  // --- the group roster says who is on a pause
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByText(`На паузе до ${dm(last)}`)).toBeVisible();

  // --- a lesson inside the pause: the teacher's list has one student, not two
  await org.createLessonStartingNow(group.id);
  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/dashboard");
  await teacherPage.getByRole("button", { name: "Открыть урок" }).click();
  await teacherPage.getByRole("button", { name: "Начать урок" }).click();
  await expect(teacherPage.getByRole("heading", { name: /Отметка посещаемости \(0 из 1\)/ })).toBeVisible();
  await expect(teacherPage.getByText("Оставшаяся Малика", { exact: true })).toBeVisible();
  await expect(teacherPage.getByText("Уехавший Достон", { exact: true })).toHaveCount(0);

  // --- the card says it too: «Оплаты» shows the chip and points to «Обучение», where the pause is ended
  await page.goto(`/owner/students/${away.id}?tab=payments`);
  await expect(page.getByTestId("membership-chip")).toContainText(`На паузе до ${dm(last)}`);
  await expect(page.getByTestId("membership-pause-link")).toBeVisible();
  await page.getByTestId("membership-pause-link").click();
  await expect(page.getByTestId("learning-pause-chip")).toContainText(`На паузе до ${dm(last)}`);
  await page.getByRole("button", { name: /^Действия по группе:/ }).click();
  await expect(page.getByRole("menuitem", { name: "Закончить паузу" })).toBeVisible();

  // --- the same window (PAY-TAILS Б11.39-Б11.41): a live pause is a CARD (no form), it began today, so it is taken off whole with a reason; the last pause is gone - the window closes by itself
  await page.getByRole("menuitem", { name: "Закончить паузу" }).dispatchEvent("click");
  const card = page.getByRole("dialog", { name: "Пауза ученика" });
  await expect(card.getByTestId("pause-card")).toHaveCount(1);
  await expect(card.getByTestId("pause-state")).toContainText("Сейчас на паузе");
  await expect(card.locator("#pause-first")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Закончить сегодня" })).toHaveCount(0);
  await card.getByRole("button", { name: "Снять паузу целиком" }).click();
  await card.getByTestId("pause-act-reason").fill("Ошиблись в датах");
  await expect(card.getByTestId("pause-act-confirm")).toBeEnabled();
  await card.getByTestId("pause-act-confirm").click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("learning-pause-chip")).toHaveCount(0);
});
