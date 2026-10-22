import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";
import { cardMenuItem, dm, expectNoHorizontalScroll } from "../support/ui";

/**
 * LOGIC-A «Пауза»: «Пауза…» in the menu of the payment block puts a student on pause «с … по …».  He moves to the tab
 * «На паузе», the paused days cost nothing (the statement says «Пауза … — начислений нет» and the period costs less than
 * the same period of a student who did not pause), and a lesson inside the pause does not have him on its list.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Пауза");
});

const costOf = async (page: import("@playwright/test").Page, membership: string): Promise<number> => {
  await page.goto(`/owner/payments/statement/${membership}`);
  await expect(page.getByRole("heading", { name: "Выписка" })).toBeVisible();
  await expect(page.getByTestId("statement-reconciles")).toBeVisible();
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
  await org.setGroupPrice(group.id, 500000);
  const away = await org.addStudent(group, "Достон", "Уехавший");
  const stays = await org.addStudent(group, "Малика", "Оставшаяся");
  const awayMembership = await org.membershipId(away.id, group.id);
  const staysMembership = await org.membershipId(stays.id, group.id);

  const page = await signIn(org.owner);

  // --- the dialog «Пауза ученика»: from today to the 10th day
  await page.goto(`/owner/students/${away.id}?tab=payments`);
  await cardMenuItem(page, /^Пауза/);
  const dialog = page.getByRole("dialog", { name: "Пауза ученика" });
  await expect(dialog).toBeVisible();
  const dates = dialog.locator('input[type="date"]');
  await dates.nth(0).fill(today);
  await dates.nth(1).fill(last);
  await dialog.getByLabel(/Причина/).fill("Уехал к бабушке");
  await dialog.getByRole("button", { name: "Поставить на паузу" }).click();
  await expect(dialog).toHaveCount(0);

  // --- the tab «На паузе» holds him, «Должники» does not
  await page.goto("/owner/payments");
  const rowOf = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(page.getByRole("tab", { name: /^На паузе \(1\)$/ })).toBeVisible();
  await page.getByRole("tab", { name: /^На паузе/ }).click();
  await expect(rowOf("Уехавший Достон")).toContainText(`На паузе до ${dm(last)}`);
  await page.getByRole("tab", { name: /Должники/ }).click();
  await expect(rowOf("Уехавший Достон")).toHaveCount(0);
  await expect(rowOf("Оставшаяся Малика")).toHaveCount(1);

  // --- no charge for the paused days: the statement names the pause and the period is cheaper than the other student's
  await page.goto(`/owner/payments/statement/${awayMembership}`);
  await expect(page.getByText(new RegExp(`Пауза ${dm(today)}–${dm(last)} — начислений нет`))).toBeVisible();
  await expectNoHorizontalScroll(page);
  const paused = await costOf(page, awayMembership);
  const full = await costOf(page, staysMembership);
  expect(full).toBe(500000);
  const saved = full - paused; // ten days of a period of 28..31 days: 500 000 x 10 / 28..31 (rounded to 1 000)
  expect(saved).toBeGreaterThan(150000);
  expect(saved).toBeLessThan(185000);

  // --- a lesson inside the pause: the teacher's list has one student, not two
  await org.createLessonStartingNow(group.id);
  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/dashboard");
  await teacherPage.getByRole("button", { name: "Открыть урок" }).click();
  await teacherPage.getByRole("button", { name: "Начать урок" }).click();
  await expect(teacherPage.getByRole("heading", { name: /Отметка посещаемости \(0 из 1\)/ })).toBeVisible();
  await expect(teacherPage.getByText("Оставшаяся Малика", { exact: true })).toBeVisible();
  await expect(teacherPage.getByText("Уехавший Достон", { exact: true })).toHaveCount(0);

  // --- the card says it too, and offers to end the pause
  await page.goto(`/owner/students/${away.id}?tab=payments`);
  await expect(page.getByText(`На паузе до ${dm(last)}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Закончить паузу" })).toBeVisible();
});
