import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { expectNoHorizontalScroll, toast } from "../support/ui";

/**
 * Owner: «Группа → Расписание».  The week cards are information only (status chip, the whole topic, time, room, the teacher): no
 * buttons on them.  A click opens the sheet of the lesson with the actions of its situation: a future lesson «Назначить замену» /
 * «Перенести урок» / «Отменить урок»; the colleague chosen there teaches the lesson («Замена: …» on the card); a cancelled one
 * has nothing to do and is not clickable.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Карточки");
});

test("week cards carry no buttons; the lesson sheet offers the actions by situation @mobile", async ({ signIn }) => {
  const today = businessNow().date;
  const day = addDays(today, 1);
  const teacher = await org.addStaff("teacher", "Основной");
  const colleague = await org.addStaff("teacher", "Коллега");
  const group = await org.createGroup({ name: "Группа К1", teacherId: teacher.userId });
  await org.addStudent(group, "Анвар", "Карточкин");
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(day), startTime: "15:00", endTime: "16:00", topic: "Квадратные уравнения и неравенства" });
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(day), startTime: "17:00", endTime: "18:00", topic: "Вторая" });

  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  // the lesson of tomorrow stands in the next week on a Sunday
  const cards = page.getByTestId("schedule-card");
  if (weekdayOf(today) === 7) await page.getByRole("button", { name: "Следующая неделя" }).click();
  const card = cards.filter({ hasText: "Квадратные уравнения и неравенства" });
  await expect(card).toHaveCount(1);

  // --- information only: the status, the whole topic, the time, the teacher - and nothing to press inside
  await expect(card).toContainText("Запланирован");
  await expect(card).toContainText("15:00 — 16:00");
  await expect(card).toContainText("Основной");
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Заменить преподавателя" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // --- a click opens the sheet with the actions of a future lesson
  await card.click();
  const sheet = page.getByRole("dialog", { name: /^Урок / });
  await expect(sheet.getByRole("button", { name: "Назначить замену" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Перенести урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Отменить урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Открыть в журнале" })).toHaveCount(0);

  // --- «Назначить замену» is the dialog of the assignment: the colleague, the reason
  await sheet.getByRole("button", { name: "Назначить замену" }).click();
  const assign = page.getByRole("dialog", { name: /^Преподаватель урока/ });
  await assign.getByRole("radio", { name: /Коллега/ }).check();
  await assign.getByLabel("Причина замены").fill("Основной преподаватель в отъезде");
  await assign.getByRole("button", { name: "Назначить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toContainText("Замена: ");
  await expect(card).toContainText("Коллега");
  await expect(card.getByRole("button")).toHaveCount(0);

  // --- the cancellation asks for a reason and leaves a card with nothing to do
  const second = cards.filter({ hasText: "Вторая" });
  await second.click();
  await page.getByRole("dialog", { name: /^Урок / }).getByRole("button", { name: "Отменить урок" }).click();
  const cancelSheet = page.getByRole("dialog", { name: /^Урок / });
  await cancelSheet.getByRole("button", { name: "Отменить урок" }).click(); // without a reason
  await expect(cancelSheet.getByRole("alert")).toContainText("Укажите причину");
  await cancelSheet.getByLabel("Причина отмены").fill("Каникулы центра");
  await cancelSheet.getByRole("button", { name: "Отменить урок" }).click();
  await expect(toast(page, "Урок отменён")).toBeVisible();
  await expect(second).toContainText("Отменён");
  await expect(second).not.toHaveAttribute("role", "button");
});
