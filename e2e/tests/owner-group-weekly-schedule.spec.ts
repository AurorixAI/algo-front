import { mkdirSync } from "node:fs";
import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { expectNoHorizontalScroll, fillDate, fillTime, pickOption, toast } from "../support/ui";

/**
 * P1: the owner and the administrator add, change and stop the WEEKLY lessons of a group on «Группа → Расписание»
 * (until now only the teacher could).  One form for everybody (the teacher's own): the day, the time, the room, «Действует с»;
 * a change acts from a future date and leaves the past alone, a stop keeps the journal; a busy teacher is a calm sentence,
 * a busy room is a note after the save; a group without a teacher can be scheduled and says what to do next.
 */
const DAY_NAMES = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const SHOTS = process.env.P1_SHOTS;
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Расписание");
});

async function shot(page: import("@playwright/test").Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const tomorrow = () => addDays(businessNow().date, 1);

/** Opens «Добавить в расписание» and fills the day and the time (the day first: choosing it suggests a time). */
async function openAdd(page: import("@playwright/test").Page, opts: { day?: number; start?: string; end?: string; room?: string }) {
  await page.getByRole("button", { name: "Добавить в расписание" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить в расписание" });
  await expect(dialog).toBeVisible();
  if (opts.day) await pickOption(page, dialog.getByRole("combobox", { name: "День недели" }), DAY_NAMES[opts.day]);
  if (opts.start) await fillTime(dialog.getByLabel("Начало"), opts.start);
  if (opts.end) await fillTime(dialog.getByLabel("Окончание"), opts.end);
  if (opts.room) await dialog.getByLabel(/Кабинет/).fill(opts.room);
  return dialog;
}

test("the owner adds a weekly lesson to a group, sees it in the tab and the teacher gets it @mobile", async ({ signIn }, info) => {
  const teacher = await org.addStaff("teacher", "Основной");
  const group = await org.createGroup({ name: "Группа П1", teacherId: teacher.userId });
  const day = weekdayOf(tomorrow());
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const slots = page.getByTestId("weekly-slots");
  await expect(slots.getByTestId("weekly-empty")).toBeVisible();
  await expect(page.getByTestId("weekly-no-teacher")).toHaveCount(0);
  await shot(page, `01-empty-${info.project.name}`);

  const dialog = await openAdd(page, { day, start: "15:00", end: "16:30", room: "12" });
  await shot(page, `02-add-form-${info.project.name}`);
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Урок добавлен в расписание группы")).toBeVisible();

  const row = slots.getByTestId("weekly-slot");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(DAY_NAMES[day]);
  await expect(row).toContainText("15:00–16:30");
  await expect(row).toContainText("12");
  await expectNoHorizontalScroll(page);

  // the week below shows the lesson too (tomorrow stands in the next week on a Sunday)
  if (weekdayOf(businessNow().date) === 7) await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(page.getByTestId("schedule-card").filter({ hasText: "15:00–16:30" })).toHaveCount(1);
  await shot(page, `03-added-${info.project.name}`);

  // the teacher of the group has it in his schedule (the server's own answer, as his screen reads it)
  const mine = await teacher.api.get("/auth/org/schedule/occurrences", { date_from: tomorrow(), date_to: tomorrow() });
  expect(mine.filter((l: any) => l.groupId === group.id && l.startTime === "15:00" && l.endTime === "16:30" && l.room === "12")).toHaveLength(1);
});

test("the administrator does the same; a change acts from a future date and leaves the earlier lessons alone", async ({ signIn }) => {
  const admin = await org.addStaff("admin");
  const teacher = await org.addStaff("teacher", "Второй");
  const group = await org.createGroup({ name: "Группа П1-А", teacherId: teacher.userId });
  const d1 = tomorrow();
  const d2 = addDays(d1, 7);
  const page = await signIn(admin);
  await page.goto(`/admin/groups/${group.id}?tab=schedule`);
  const dialog = await openAdd(page, { day: weekdayOf(d1), start: "15:00", end: "16:30" });
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  const row = page.getByTestId("weekly-slot");
  await expect(row).toHaveCount(1);

  // edit: 16:00 from the second lesson on; the first one keeps 15:00
  await row.getByRole("button", { name: /^Изменить урок/ }).click();
  const edit = page.getByRole("dialog", { name: "Изменить постоянное расписание" });
  await expect(edit.getByRole("button", { name: "Изменить расписание" })).toBeDisabled(); // nothing changed yet
  await fillDate(edit.getByLabel("Изменения действуют с"), d2);
  await fillTime(edit.getByLabel("Начало"), "16:00");
  await edit.getByRole("button", { name: "Изменить расписание" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, /Расписание изменено с/)).toBeVisible();
  await expect(page.getByTestId("weekly-slot-next")).toHaveCount(0); // the next lesson is still the old one
  const first = await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: d1, date_to: d1 });
  const second = await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: d2, date_to: d2 });
  expect(first.filter((l: any) => l.groupId === group.id).map((l: any) => l.startTime)).toEqual(["15:00"]);
  expect(second.filter((l: any) => l.groupId === group.id).map((l: any) => l.startTime)).toEqual(["16:00"]);
});

test("stopping a weekly lesson keeps the past and removes the coming lessons @mobile", async ({ signIn }, info) => {
  const teacher = await org.addStaff("teacher", "Третий");
  const group = await org.createGroup({ name: "Группа П1-С", teacherId: teacher.userId });
  const d1 = tomorrow();
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(d1), startTime: "17:00", endTime: "18:30", topic: "Прекращаемый" });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const row = page.getByTestId("weekly-slot");
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /^Прекратить урок/ }).click();
  const end = page.getByRole("dialog", { name: "Прекратить занятия" });
  await expect(end).toContainText("Прошедшие уроки, посещаемость и журнал останутся без изменений");
  await expect(end.getByRole("button", { name: "Прекратить занятия" })).toBeDisabled(); // no reason yet
  await end.getByLabel("Причина").fill("Группа закончила курс");
  await expect(end).toContainText("Связанных будущих экзаменов нет");
  await shot(page, `04-stop-${info.project.name}`);
  await end.getByRole("button", { name: "Прекратить занятия" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("weekly-slot-stopped")).toBeVisible();
  const after = await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: d1, date_to: addDays(d1, 14) });
  expect(after.filter((l: any) => l.groupId === group.id)).toHaveLength(0);
});

test("a busy teacher is a calm sentence and nothing is saved; a busy room is a note after the save", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Занятой");
  const g1 = await org.createGroup({ name: "Группа П1-1", teacherId: teacher.userId });
  const g2 = await org.createGroup({ name: "Группа П1-2", teacherId: teacher.userId });
  const other = await org.createGroup({ name: "Группа П1-3", teacherId: (await org.addStaff("teacher", "Другой")).userId });
  const d1 = tomorrow();
  const day = weekdayOf(d1);
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: g1.id, dayOfWeek: day, startTime: "15:00", endTime: "16:30" });
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: other.id, dayOfWeek: day, startTime: "10:00", endTime: "11:30", room: "7" });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${g2.id}?tab=schedule`);

  // the same teacher at the same time in another group
  let dialog = await openAdd(page, { day, start: "15:30", end: "17:00" });
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "У преподавателя" })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("weekly-empty")).toBeVisible();
  await shot(page, "05-teacher-busy");
  await dialog.getByRole("button", { name: "Отмена" }).click();

  // the room 7 is taken by another group at that time: saved, with a note
  dialog = await openAdd(page, { day, start: "10:00", end: "11:30", room: "7" });
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("weekly-slot")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: /Кабинет «7» в это время занят группой «Группа П1-3»/ })).toBeVisible();
});

test("validation: no day, the end before the start; the form says it and saves nothing", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Проверяемый");
  const group = await org.createGroup({ name: "Группа П1-В", teacherId: teacher.userId });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const dialog = await openAdd(page, {});
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Выберите день недели" })).toBeVisible();

  await pickOption(page, dialog.getByRole("combobox", { name: "День недели" }), DAY_NAMES[weekdayOf(tomorrow())]);
  await fillTime(dialog.getByLabel("Начало"), "15:00");
  await fillTime(dialog.getByLabel("Окончание"), "14:00");
  await expect(dialog.getByRole("alert").filter({ hasText: "Окончание должно быть позже начала" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Сохранить урок" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  const all = await org.owner.api.get("/auth/org/schedule");
  expect(all.filter((l: any) => l.groupId === group.id)).toHaveLength(0);
});

test("a group without a teacher can be scheduled and says whom to assign @mobile", async ({ signIn }, info) => {
  const group = await org.createGroup({ name: "Группа П1-Б" });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const hint = "Назначьте преподавателя группе, чтобы уроки появились у него в расписании";
  await expect(page.getByTestId("weekly-no-teacher")).toContainText(hint);
  const dialog = await openAdd(page, { day: weekdayOf(tomorrow()), start: "12:00", end: "13:30" });
  await expect(dialog.getByTestId("weekly-no-teacher-hint")).toContainText(hint);
  await shot(page, `06-no-teacher-${info.project.name}`);
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByTestId("weekly-slot")).toHaveCount(1);
  await expectNoHorizontalScroll(page);
});
