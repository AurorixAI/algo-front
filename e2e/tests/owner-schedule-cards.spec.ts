import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { expectNoHorizontalScroll, fillDate, toast } from "../support/ui";

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
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(day), startTime: "19:00", endTime: "20:00", topic: "Для переноса" });
  // #124: a lesson that the owner moves from the sheet, and a clash of the teacher on the day it is moved to
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(day), startTime: "11:00", endTime: "12:00", topic: "Для сдвига" });
  const other = await org.createGroup({ name: "Группа К2", teacherId: teacher.userId });
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: other.id, dayOfWeek: weekdayOf(addDays(day, 1)), startTime: "12:00", endTime: "13:00", topic: "Занято" });
  // a lesson of the teacher moved to the next day on his request (the original stays as «Перенесён»)
  const mine = await teacher.api.get("/auth/org/substitutions/my-lessons", { dateFrom: day, dateTo: day });
  const toMove = mine.lessons.find((l: any) => l.startTime === "19:00");
  const request = await teacher.api.post("/auth/org/substitutions", { lessons: [{ groupId: group.id, lessonDate: day, lessonId: toMove.lessonId }], reasonCode: "other", comment: "Курсы повышения" });
  await org.owner.api.post(`/auth/org/substitutions/${request.created[0].id}/decide`, { decision: "reschedule", newDate: addDays(day, 1), startTime: "19:00", endTime: "20:00", reason: "Перенос по просьбе преподавателя", expectedStatus: "pending" });

  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  // the lesson of tomorrow stands in the next week on a Sunday
  const cards = page.getByTestId("schedule-card");
  if (weekdayOf(today) === 7) await page.getByRole("button", { name: "Следующая неделя" }).click();
  const card = cards.filter({ hasText: "Квадратные уравнения и неравенства" });
  await expect(card).toHaveCount(1);

  // --- information only: the status, the whole topic, the time, the teacher - and nothing to press inside
  await expect(card).toContainText("Запланирован");
  await expect(card).toContainText("15:00–16:00");
  await expect(card).not.toContainText("Кабинет не указан"); // the room only when it is set
  await expect(card).not.toContainText("Основной"); // the group's own teacher is in the header, not on every card
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Заменить преподавателя" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // --- a click opens the sheet with the actions of a future lesson
  await card.click();
  const sheet = page.getByRole("dialog", { name: "Квадратные уравнения и неравенства" });
  await expect(sheet).toContainText(/Запланирован/);
  await expect(sheet).toContainText("Ведёт: Основной");
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
  await card.click();
  await expect(page.getByRole("dialog", { name: "Квадратные уравнения и неравенства" })).toContainText(/Ведёт: Коллега .* — замена за Основной/);
  await page.keyboard.press("Escape");

  // --- the cancellation asks for a reason; the card keeps its topic and opens a sheet with the reason in full
  const second = cards.filter({ hasText: "Вторая" });
  await second.click();
  await page.getByRole("dialog", { name: "Вторая" }).getByRole("button", { name: "Отменить урок" }).click();
  const cancelSheet = page.getByRole("dialog", { name: "Вторая" });
  await cancelSheet.getByRole("button", { name: "Отменить урок" }).click(); // without a reason
  await expect(cancelSheet.getByRole("alert")).toContainText("Укажите причину");
  await cancelSheet.getByLabel("Причина отмены").fill("Каникулы центра");
  await cancelSheet.getByRole("button", { name: "Отменить урок" }).click();
  await expect(toast(page, "Урок отменён")).toBeVisible();
  await expect(second).toContainText("Отменён");
  await expect(second).toContainText("Вторая"); // the server keeps the topic the dialog sends
  await expect(second).toContainText("Каникулы центра");
  await second.click();
  const cancelled = page.getByRole("dialog", { name: "Вторая" });
  await expect(cancelled).toContainText("Причина: Каникулы центра");
  await expect(cancelled.getByRole("button", { name: "Отменить урок" })).toHaveCount(0); // nothing left to do
  await page.keyboard.press("Escape");

  // --- a moved lesson: «Перенесён», where it went in one line, no reason block on the card; the sheet has the reason
  const moved = cards.filter({ hasText: "Для переноса" }).first(); // the original of Friday; its new lesson stands on the next day
  await expect(moved).toContainText("Перенесён");
  await expect(moved).toContainText(/на \S+, \d\d\.\d\d, 19:00/);
  await expect(moved).not.toContainText("Причина");
  await expect(moved).not.toContainText("Отменён");
  await moved.click();
  const movedSheet = page.getByRole("dialog", { name: "Для переноса" });
  await expect(movedSheet).toContainText(/Перенесён на \S+, \d\d\.\d\d, 19:00/);
  await expect(movedSheet).toContainText("Причина: Перенос по просьбе преподавателя");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // --- #124: «Перенести урок» moves to ANY date, with a live check; the old card says «Перенесён», the new one «Перенесён с …»
  const shift = cards.filter({ hasText: "Для сдвига" });
  await shift.click();
  const moveSheet = page.getByRole("dialog", { name: "Для сдвига" });
  await moveSheet.getByRole("button", { name: "Перенести урок" }).click();
  const target = addDays(day, 1);
  await fillDate(moveSheet.getByLabel("Новая дата"), target);
  await moveSheet.getByLabel("Начало").fill("1200");
  await moveSheet.getByLabel("Окончание").fill("13:00");
  await expect(moveSheet.getByTestId("move-check")).toContainText("Преподаватель занят в это время"); // the clash of the other group
  await expect(moveSheet.getByRole("button", { name: "Перенести урок" })).toBeDisabled();
  await moveSheet.getByLabel("Начало").fill("1300");
  await moveSheet.getByLabel("Окончание").fill("14:00");
  await expect(moveSheet.getByTestId("move-check")).toContainText("Время свободно");
  await moveSheet.getByLabel("Причина переноса").fill("Пересечение с другим мероприятием");
  await moveSheet.getByRole("button", { name: "Перенести урок" }).click();
  await expect(toast(page, "Урок перенесён")).toBeVisible();
  await expect(cards.filter({ hasText: "Для сдвига" }).first()).toContainText("Перенесён");
  await expect(cards.filter({ hasText: "Для сдвига" }).first()).not.toContainText("Отменён");
  // the new lesson stands on the next day (the next week when the day is a Sunday)
  if (weekdayOf(day) === 7) await page.getByRole("button", { name: "Следующая неделя" }).click();
  const fresh = cards.filter({ has: page.getByTestId("moved-from"), hasText: "13:00–14:00" });
  await expect(fresh).toHaveCount(1);
  await expect(fresh.getByTestId("moved-from")).toHaveText(new RegExp(`^Перенесён с ${day.slice(8, 10)}\\.${day.slice(5, 7)}, 11:00$`));
  await fresh.click();
  await expect(page.getByRole("dialog", { name: "Для сдвига" })).toContainText(`Перенесён с ${day.slice(8, 10)}.${day.slice(5, 7)}, 11:00`);
});
