import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { expectNoHorizontalScroll, fillDate, fillTime, pickOption, toast } from "../support/ui";

/**
 * P1: the owner and the administrator add lessons to a group right in «Группа → Расписание» (until now only the teacher could):
 * a weekly lesson on one or SEVERAL weekdays at once, or a one-off lesson - the form of the teacher's schedule.  A lesson card opens
 * the sheet of the lesson: for a weekly lesson «Изменить постоянный урок» (from a date, the earlier lessons stay) and «Прекратить урок»;
 * a one-off lesson only moves / cancels.  A busy teacher is a calm sentence that names the refused day (no silent partial success),
 * a busy room is a note of the toast, a group without a teacher can be scheduled and says what to do next.
 */
const DAY_NAMES = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const chipName = (day: number) => `${SHORT[day]} ${DAY_NAMES[day]}`; // the accessible name of a day chip: the visible text first
const SHOTS = process.env.P1_SHOTS;
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Расписание");
});

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450); // let the dialog finish sliding in
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const today = () => businessNow().date;
const tomorrow = () => addDays(today(), 1);
const mondayOf = (iso: string) => addDays(iso, 1 - weekdayOf(iso));
const plus90 = (time: string) => {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 90;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** The week grid of the group page: moves to the week of `date` (the page opens on this week). */
function weeks(page: Page) {
  let shown = mondayOf(today());
  return {
    async to(date: string) {
      const target = mondayOf(date);
      while (shown < target) { await page.getByRole("button", { name: "Следующая неделя" }).click(); shown = addDays(shown, 7); }
      while (shown > target) { await page.getByRole("button", { name: "Предыдущая неделя" }).click(); shown = addDays(shown, -7); }
    },
  };
}

type Draft = { days?: number[]; oneOff?: string; start?: string; end?: string; room?: string; topic?: string };

/** Opens «Добавить в расписание» and fills the form (the start first: it moves the end 90 minutes after it, a typed end stays). */
async function openAdd(page: Page, opts: Draft) {
  await page.getByRole("button", { name: "Добавить в расписание" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить в расписание" });
  await expect(dialog).toBeVisible();
  if (opts.oneOff) {
    await dialog.getByRole("button", { name: /Разовое занятие/ }).click();
    await fillDate(dialog.getByLabel("Дата занятия"), opts.oneOff);
  }
  for (const day of opts.days ?? []) await dialog.getByRole("button", { name: chipName(day), exact: true }).click();
  if (opts.start) {
    await fillTime(dialog.getByLabel("Начало"), opts.start);
    await expect(dialog.getByLabel("Окончание")).toHaveValue(plus90(opts.start));
  }
  if (opts.end) await fillTime(dialog.getByLabel("Окончание"), opts.end);
  if (opts.room) await dialog.getByLabel(/Кабинет/).fill(opts.room);
  if (opts.topic) await dialog.getByLabel(/Тема занятия/).fill(opts.topic);
  return dialog;
}

test("the owner adds Mon+Wed-style lessons at once, changes one weekly lesson from next week and stops the other @mobile", async ({ signIn }, info) => {
  const teacher = await org.addStaff("teacher", "Основной");
  const group = await org.createGroup({ name: "Группа П1", teacherId: teacher.userId });
  const d1 = tomorrow();
  const d2 = addDays(d1, 1);
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  await expect(page.getByText("Еженедельные уроки")).toHaveCount(0); // no separate block: the one section «Расписание группы»
  await expect(page.getByTestId("weekly-no-teacher")).toHaveCount(0);
  await shot(page, `01-schedule-${info.project.name}`);

  const dialog = await openAdd(page, { days: [weekdayOf(d1), weekdayOf(d2)], start: "15:00", room: "12", topic: "Алгебра" });
  await expect(dialog.getByRole("button", { name: chipName(weekdayOf(d1)), exact: true })).toHaveAttribute("aria-pressed", "true");
  await shot(page, `02-add-form-${info.project.name}`);
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, `Уроки добавлены в расписание группы: ${SHORT[Math.min(weekdayOf(d1), weekdayOf(d2))]}`)).toBeVisible();

  // both days stand in the week grid
  const grid = weeks(page);
  await grid.to(d1);
  const card1 = page.getByTestId("schedule-card").filter({ hasText: "Алгебра" }).filter({ hasText: "15:00–16:30" });
  if (mondayOf(d1) === mondayOf(d2)) await expect(card1).toHaveCount(2);
  else await expect(card1).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await shot(page, `03-added-${info.project.name}`);
  // the teacher has both in his schedule
  for (const date of [d1, d2]) {
    const mine = await teacher.api.get("/auth/org/schedule/occurrences", { date_from: date, date_to: date });
    expect(mine.filter((l: any) => l.groupId === group.id && l.startTime === "15:00" && l.room === "12")).toHaveLength(1);
  }

  // open the lesson of d1: the sheet has the usual actions and the two of the weekly lesson
  await grid.to(d1);
  const firstCard = page.getByTestId("schedule-card").filter({ hasText: "15:00–16:30" }).first();
  await firstCard.click();
  const sheet = page.getByRole("dialog", { name: "Алгебра" });
  await expect(sheet).toContainText("каб. 12");
  await expect(sheet.getByRole("button", { name: "Перенести урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Отменить урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Изменить постоянный урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Прекратить урок" })).toBeVisible();
  await shot(page, `04-lesson-sheet-${info.project.name}`);

  // «Изменить постоянный урок»: 16:00 from next week; this week's lesson keeps 15:00
  await sheet.getByRole("button", { name: "Изменить постоянный урок" }).click();
  const edit = page.getByRole("dialog", { name: "Изменить постоянное расписание" });
  const nextWeek = addDays(d1, 7);
  await fillDate(edit.getByLabel("Изменения действуют с"), nextWeek);
  await fillTime(edit.getByLabel("Начало"), "16:00");
  await shot(page, `05-edit-series-${info.project.name}`);
  await edit.getByRole("button", { name: "Изменить расписание" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, /Расписание изменено с/)).toBeVisible();
  const occ = async (date: string) => (await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: date, date_to: date })).filter((l: any) => l.groupId === group.id).map((l: any) => l.startTime);
  expect(await occ(d1)).toEqual(["15:00"]);
  expect(await occ(nextWeek)).toEqual(["16:00"]);
  expect(await occ(d2)).toEqual(["15:00"]); // the other weekly lesson is not touched

  // «Прекратить урок» on the lesson of d2: it stops from that date
  await grid.to(d2);
  await page.getByTestId("schedule-card").filter({ hasText: "15:00–16:30" }).last().click();
  await page.getByRole("dialog", { name: "Алгебра" }).getByRole("button", { name: "Прекратить урок" }).click();
  const end = page.getByRole("dialog", { name: "Прекратить занятия" });
  await expect(end).toContainText("Прошедшие уроки, посещаемость и журнал останутся без изменений");
  await expect(end.getByRole("button", { name: "Прекратить занятия" })).toBeDisabled(); // no reason yet
  await end.getByLabel("Причина").fill("Группа закончила курс");
  await expect(end).toContainText("Связанных будущих экзаменов нет");
  await shot(page, `06-end-series-${info.project.name}`);
  await end.getByRole("button", { name: "Прекратить занятия" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Занятия прекращены")).toBeVisible();
  expect(await occ(d2)).toEqual([]);
  expect(await occ(addDays(d2, 7))).toEqual([]);
  expect(await occ(d1)).toEqual(["15:00"]);
});

test("the administrator adds a one-off lesson: it can be moved or cancelled, not changed as a weekly one", async ({ signIn }, info) => {
  const admin = await org.addStaff("admin");
  const teacher = await org.addStaff("teacher", "Второй");
  const group = await org.createGroup({ name: "Группа П1-А", teacherId: teacher.userId });
  const date = addDays(today(), 3);
  const page = await signIn(admin);
  await page.goto(`/admin/groups/${group.id}?tab=schedule`);
  const dialog = await openAdd(page, { oneOff: date, start: "13:00", topic: "Разовое" });
  await shot(page, `07-add-one-off-${info.project.name}`);
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Разовое занятие добавлено в расписание группы")).toBeVisible();

  const mine = await teacher.api.get("/auth/org/schedule/occurrences", { date_from: date, date_to: date });
  expect(mine.filter((l: any) => l.groupId === group.id && l.startTime === "13:00")).toHaveLength(1);
  // a one-off lesson is on its date only: the next week has nothing
  const later = await teacher.api.get("/auth/org/schedule/occurrences", { date_from: addDays(date, 7), date_to: addDays(date, 7) });
  expect(later.filter((l: any) => l.groupId === group.id)).toHaveLength(0);

  await weeks(page).to(date);
  await page.getByTestId("schedule-card").filter({ hasText: "Разовое" }).click();
  const sheet = page.getByRole("dialog", { name: "Разовое" });
  await expect(sheet.getByRole("button", { name: "Перенести урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Отменить урок" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Изменить постоянный урок" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Прекратить урок" })).toHaveCount(0);
  await shot(page, `08-one-off-sheet-${info.project.name}`);
});

test("the administrator adds a weekly lesson too; a change keeps the lessons before its date", async ({ signIn }) => {
  const admin = await org.addStaff("admin");
  const teacher = await org.addStaff("teacher", "Четвёртый");
  const group = await org.createGroup({ name: "Группа П1-Д", teacherId: teacher.userId });
  const d1 = tomorrow();
  const d2 = addDays(d1, 7);
  const page = await signIn(admin);
  await page.goto(`/admin/groups/${group.id}?tab=schedule`);
  const dialog = await openAdd(page, { days: [weekdayOf(d1)], start: "15:00", topic: "Админский" });
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(toast(page, "Урок добавлен в расписание группы")).toBeVisible();
  await weeks(page).to(d1);
  await page.getByTestId("schedule-card").filter({ hasText: "Админский" }).click();
  await page.getByRole("dialog", { name: "Админский" }).getByRole("button", { name: "Изменить постоянный урок" }).click();
  const edit = page.getByRole("dialog", { name: "Изменить постоянное расписание" });
  await expect(edit.getByRole("button", { name: "Изменить расписание" })).toBeDisabled(); // nothing changed yet
  await fillDate(edit.getByLabel("Изменения действуют с"), d2);
  await fillTime(edit.getByLabel("Начало"), "16:00");
  await edit.getByRole("button", { name: "Изменить расписание" }).click();
  await expect(toast(page, /Расписание изменено с/)).toBeVisible();
  const at = async (date: string) => (await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: date, date_to: date })).filter((l: any) => l.groupId === group.id).map((l: any) => l.startTime);
  expect(await at(d1)).toEqual(["15:00"]);
  expect(await at(d2)).toEqual(["16:00"]);
});

test("a busy teacher names the refused day and keeps the added ones; a busy room is a note of the toast", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Занятой");
  const g1 = await org.createGroup({ name: "Группа П1-1", teacherId: teacher.userId });
  const g2 = await org.createGroup({ name: "Группа П1-2", teacherId: teacher.userId });
  const other = await org.createGroup({ name: "Группа П1-3", teacherId: (await org.addStaff("teacher", "Другой")).userId });
  const d1 = tomorrow();
  const d2 = addDays(d1, 1);
  // the teacher is busy on d2's weekday at 15:00-16:30; the room 7 is taken on d1's weekday at 10:00
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: g1.id, dayOfWeek: weekdayOf(d2), startTime: "15:00", endTime: "16:30" });
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: other.id, dayOfWeek: weekdayOf(d1), startTime: "10:00", endTime: "11:30", room: "7" });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${g2.id}?tab=schedule`);

  const dialog = await openAdd(page, { days: [weekdayOf(d1), weekdayOf(d2)], start: "15:30", end: "17:00" });
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  const busyDay = weekdayOf(d2);
  const okDay = weekdayOf(d1);
  const error = dialog.getByTestId("weekly-add-error");
  await expect(error).toContainText(`${SHORT[okDay]} добавлен, ${SHORT[busyDay]} — преподаватель занят`);
  await expect(error).toContainText("У преподавателя в это время уже есть урок");
  await expect(dialog).toBeVisible(); // nothing is lost silently: the dialog stays with the refused day chosen
  await expect(dialog.getByRole("button", { name: chipName(busyDay), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: chipName(okDay), exact: true })).toHaveAttribute("aria-pressed", "false");
  await error.scrollIntoViewIfNeeded();
  await shot(page, "09-teacher-busy");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  const saved = (await org.owner.api.get("/auth/org/schedule")).filter((l: any) => l.groupId === g2.id);
  expect(saved.map((l: any) => l.dayOfWeek)).toEqual([okDay]);

  // the room 7 is taken by another group at that time: saved, with a note in the toast
  const second = await openAdd(page, { days: [okDay], start: "10:00", room: "7" });
  await second.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Урок добавлен в расписание группы")).toContainText(/Кабинет «7» в это время занят группой «Группа П1-3»/);
});

test("validation: no day says «Выберите день»; the end before the start; a typed end stays when the start moves", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Проверяемый");
  const group = await org.createGroup({ name: "Группа П1-В", teacherId: teacher.userId });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const dialog = await openAdd(page, {});
  await expect(dialog.getByTestId("weekly-add-days-hint")).toHaveText("Выберите день");
  await expect(dialog.getByRole("group", { name: "Дни недели" })).toBeVisible();
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Выберите день недели" })).toBeVisible();

  await dialog.getByRole("button", { name: chipName(weekdayOf(tomorrow())), exact: true }).click();
  await fillTime(dialog.getByLabel("Начало"), "15:00");
  await expect(dialog.getByLabel("Окончание")).toHaveValue("16:30");
  // an empty date of a one-off lesson asks for a date, it does not call it a past one
  await dialog.getByRole("button", { name: /Разовое занятие/ }).click();
  await dialog.getByLabel("Дата занятия").fill("");
  await expect(dialog.getByRole("alert").filter({ hasText: "Выберите дату" })).toBeVisible();
  await dialog.getByRole("button", { name: /Еженедельный урок/ }).click();
  await fillTime(dialog.getByLabel("Окончание"), "14:00");
  await expect(dialog.getByRole("alert").filter({ hasText: "Окончание должно быть позже начала" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Сохранить урок" })).toBeDisabled();
  // the end typed by the user is never overwritten by a later change of the start
  await fillTime(dialog.getByLabel("Окончание"), "18:00");
  await fillTime(dialog.getByLabel("Начало"), "16:00");
  await expect(dialog.getByLabel("Окончание")).toHaveValue("18:00");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  const all = await org.owner.api.get("/auth/org/schedule");
  expect(all.filter((l: any) => l.groupId === group.id)).toHaveLength(0);
});

test("a group without a teacher can be scheduled; the hint stands by the button @mobile", async ({ signIn }, info) => {
  const group = await org.createGroup({ name: "Группа П1-Б" });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const hint = "Назначьте преподавателя группе, чтобы уроки появились у него в расписании";
  await expect(page.getByTestId("weekly-no-teacher")).toContainText(hint);
  const dialog = await openAdd(page, { days: [weekdayOf(tomorrow())], start: "12:00", topic: "Без учителя" });
  await expect(dialog.getByTestId("weekly-no-teacher-hint")).toContainText(hint);
  await shot(page, `10-no-teacher-${info.project.name}`);
  await dialog.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await weeks(page).to(tomorrow());
  await expect(page.getByTestId("schedule-card").filter({ hasText: "Без учителя" })).toHaveCount(1);
  await expectNoHorizontalScroll(page);
});

test("the teacher's own form is the same: two weekdays at once, an own overlap is stopped before the click @mobile", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Свой");
  const group = await org.createGroup({ name: "Группа П1-Т", teacherId: teacher.userId });
  const other = await org.createGroup({ name: "Группа П1-Т2", teacherId: teacher.userId });
  const d1 = tomorrow();
  const d2 = addDays(d1, 1);
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: other.id, dayOfWeek: weekdayOf(d2), startTime: "15:00", endTime: "16:30" });
  const page = await signIn(teacher);
  await page.goto("/teacher/schedule");
  await page.getByRole("button", { name: "Добавить в расписание" }).click();
  const form = page.locator("form").filter({ hasText: "Как добавить занятие" });
  await expect(form).toBeVisible();
  await pickOption(page, form.getByRole("combobox", { name: "Группа" }), "Группа П1-Т (7 класс)");
  await form.getByRole("button", { name: /Еженедельный урок/ }).click();
  await expect(form.getByTestId("sched-add-days-hint")).toHaveText("Выберите день");
  for (const day of [weekdayOf(d1), weekdayOf(d2)]) await form.getByRole("button", { name: chipName(day), exact: true }).click();
  await fillTime(form.getByLabel("Начало"), "15:30");
  await expect(form.getByLabel("Окончание")).toHaveValue("17:00");
  // the teacher already has 15:00-16:30 on the second weekday: the form says so and does not save
  await expect(form.getByText(/накладка по времени/).first()).toBeVisible();
  await expect(form.getByRole("button", { name: "Сохранить урок" })).toBeDisabled();
  // later in the day the two weekdays go through
  await fillTime(form.getByLabel("Начало"), "17:00");
  await expect(form.getByLabel("Окончание")).toHaveValue("18:30");
  await form.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.locator("form").filter({ hasText: "Как добавить занятие" })).toHaveCount(0);
  const saved = (await teacher.api.get("/auth/org/schedule")).filter((l: any) => l.groupId === group.id);
  expect(saved.map((l: any) => l.dayOfWeek).sort()).toEqual([weekdayOf(d1), weekdayOf(d2)].sort());
});

test("«Изменить постоянный урок»: the day as chips; the same change goes to the ticked days of the group, a refused one is named and stays ticked", async ({ signIn }, info) => {
  const teacher = await org.addStaff("teacher", "Мультидневный");
  const group = await org.createGroup({ name: "Группа П1-М", teacherId: teacher.userId });
  const other = await org.createGroup({ name: "Группа П1-М2", teacherId: teacher.userId });
  const d1 = tomorrow();
  const d2 = addDays(d1, 1);
  const from = addDays(d1, 7);
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(d1), startTime: "14:00", endTime: "15:30", topic: "Первый" });
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(d2), startTime: "14:00", endTime: "15:30", topic: "Второй" });
  // the teacher teaches another group on the second weekday at 16:00-17:00: moving that lesson to 16:00 will be refused
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: other.id, dayOfWeek: weekdayOf(d2), startTime: "16:00", endTime: "17:00" });
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  await weeks(page).to(d1);
  await page.getByTestId("schedule-card").filter({ hasText: "Первый" }).click();
  await page.getByRole("dialog", { name: "Первый" }).getByRole("button", { name: "Изменить постоянный урок" }).click();
  const edit = page.getByRole("dialog", { name: "Изменить постоянное расписание" });
  // the day is a radio group of chips; the block of the other days does not show while nothing but the day could change
  await expect(edit.getByRole("radiogroup", { name: "День недели" })).toBeVisible();
  await expect(edit.getByRole("radio", { name: chipName(weekdayOf(d1)), exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(edit.getByTestId("apply-to-others")).toHaveCount(0);
  await fillDate(edit.getByLabel("Изменения действуют с"), from);
  await fillTime(edit.getByLabel("Начало"), "16:00");
  const block = edit.getByTestId("apply-to-others");
  await expect(block).toContainText("Применить также к другим дням группы");
  await expect(block).toContainText(`${SHORT[weekdayOf(d2)]} 14:00–15:30`);
  await expect(block.getByRole("checkbox")).not.toBeChecked(); // off by default
  await block.getByRole("checkbox").check();
  await shot(page, `13-edit-series-chips-${info.project.name}`);
  await edit.getByRole("button", { name: "Изменить расписание" }).click();
  const error = edit.getByTestId("weekly-edit-error");
  await expect(error).toContainText(`${SHORT[weekdayOf(d1)]} изменён, ${SHORT[weekdayOf(d2)]} — преподаватель занят`);
  await expect(block.getByRole("checkbox")).toBeChecked(); // only the refused one stays ticked
  const at = async (date: string) => (await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: date, date_to: date })).filter((l: any) => l.groupId === group.id).map((l: any) => l.startTime);
  expect(await at(d1)).toEqual(["14:00"]); // before the date: untouched
  expect(await at(from)).toEqual(["16:00"]); // from the date: the first lesson moved
  expect(await at(addDays(d2, 7))).toEqual(["14:00"]); // the refused one stays as it was
  await edit.getByRole("button", { name: "Отмена" }).click();
});

test("teacher: «Ещё -> Прекратить» opens the stop dialog above the lesson panel; Escape closes only the dialog @mobile", async ({ signIn }, info) => {
  const teacher = await org.addStaff("teacher", "Останавливающий");
  const group = await org.createGroup({ name: "Группа П1-Ост", teacherId: teacher.userId });
  const d1 = tomorrow();
  await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(d1), startTime: "15:00", endTime: "16:30", topic: "Для остановки" });
  const page = await signIn(teacher);
  await page.goto("/teacher/schedule");
  await page.getByRole("button", { name: /Неделя/ }).first().click();
  if (mondayOf(d1) !== mondayOf(today())) await page.getByTitle("Следующая неделя").click();
  await page.getByText("Для остановки").first().click();
  const panel = page.getByRole("dialog").first();
  await expect(panel).toContainText("Для остановки");
  await page.getByRole("button", { name: "Дополнительные действия с уроком" }).click();
  await page.getByRole("menuitem", { name: /Прекратить регулярные занятия/ }).click();
  const end = page.getByRole("dialog", { name: "Прекратить занятия" });
  await expect(end).toBeVisible();
  // it is ON TOP: a click on its field reaches it (under the panel the click would be intercepted)
  await end.getByLabel("Причина").click();
  await end.getByLabel("Причина").fill("Группа закончила курс");
  await expect(end).toContainText("Связанных будущих экзаменов нет");
  await expect(end.getByRole("button", { name: "Прекратить занятия" })).toBeEnabled();
  await shot(page, `14-teacher-end-over-panel-${info.project.name}`);
  // Escape closes the topmost layer only: the stop dialog goes, the lesson panel stays
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Прекратить занятия" })).toHaveCount(0);
  await expect(panel).toContainText("Для остановки");
  // and the stop itself goes through from the same place
  await page.getByRole("button", { name: "Дополнительные действия с уроком" }).click();
  await page.getByRole("menuitem", { name: /Прекратить регулярные занятия/ }).click();
  const again = page.getByRole("dialog", { name: "Прекратить занятия" });
  await again.getByLabel("Причина").fill("Группа закончила курс");
  await expect(again).toContainText("Связанных будущих экзаменов нет");
  await again.getByRole("button", { name: "Прекратить занятия" }).click();
  await expect(page.getByRole("dialog", { name: "Прекратить занятия" })).toHaveCount(0);
  const left = (await org.owner.api.get("/auth/org/schedule/occurrences", { date_from: d1, date_to: addDays(d1, 14) })).filter((l: any) => l.groupId === group.id);
  expect(left).toHaveLength(0);
});

test("teacher screenshots: the add form with Пн+Ср+Пт and the week after saving @mobile", async ({ signIn }, info) => {
  const teacher = await org.addStaff("teacher", "Скриншотный");
  const group = await org.createGroup({ name: "Группа П1-Ш", teacherId: teacher.userId });
  const page = await signIn(teacher);
  await page.goto("/teacher/schedule");
  await page.getByRole("button", { name: "Добавить в расписание" }).click();
  const form = page.locator("form").filter({ hasText: "Как добавить занятие" });
  await expect(form).toBeVisible();
  await pickOption(page, form.getByRole("combobox", { name: "Группа" }), "Группа П1-Ш (7 класс)");
  await form.getByRole("button", { name: /Еженедельный урок/ }).click();
  for (const day of [1, 3, 5]) await form.getByRole("button", { name: chipName(day), exact: true }).click();
  await fillTime(form.getByLabel("Начало"), "22:00");
  await expect(form.getByLabel("Окончание")).toHaveValue("23:30");
  await form.getByLabel(/Тема занятия/).fill("Алгебра");
  await shot(page, `11-teacher-add-days-${info.project.name}`);
  await form.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page.locator("form").filter({ hasText: "Как добавить занятие" })).toHaveCount(0);
  await page.getByRole("button", { name: /Неделя/ }).first().click();
  await expect(page.getByText("Алгебра").first()).toBeVisible();
  await shot(page, `12-teacher-added-week-${info.project.name}`);
  const saved = (await teacher.api.get("/auth/org/schedule")).filter((l: any) => l.groupId === group.id);
  expect(saved.map((l: any) => l.dayOfWeek).sort()).toEqual([1, 3, 5]);
});
