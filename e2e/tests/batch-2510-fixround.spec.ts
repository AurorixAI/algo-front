import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org, type GroupInfo } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { expectNoHorizontalScroll, expectWithinViewport, fillDate, fillTime, toast } from "../support/ui";

/**
 * «Пакет 25.10», the round after the stage walk:
 *  2. the dialog «Преподаватель урока»: the role of everybody, the reason field and the error are in the window (1280 and 375), «Вернуть преподавателя группы»
 *     without a reason says why, in the dialog, and sends nothing;
 *  3/4. A → B → C and the removal: the owner's journal and the teacher's list say the same («Заменена на … — решил(а) …», «Замену снял(а) …, ДД.ММ ЧЧ:ММ»), no stale
 *     «Администратор заменил»;
 *  5/6. a day off: the dry run lists the lessons «группа · дата · время»; the days off are «Действующие» and «Отменённые и прошедшие»;
 *  7/8. three weekdays saved at once: ONE POST per weekday (no double submit) and ONE line of the toast about a busy room, with the days.
 * The lessons stand on weekdays that are not today, so the run does not depend on the time of the day.
 */
const SHOTS = process.env.B2510_SHOTS || "/Users/arslan/Desktop/ALGO/artifacts/batch_2510/shots";
const SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const SHORT_CAP = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAY_NAMES = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const chipName = (day: number) => `${SHORT_CAP[day]} ${DAY_NAMES[day]}`;

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const today = () => businessNow().date;
const wrap = (weekday: number) => ((weekday - 1 + 7) % 7) + 1;
const mondayOf = (iso: string) => addDays(iso, 1 - weekdayOf(iso));
const dmShort = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** The first date after today on the weekday `shift` days from today. */
const ahead = (shift: number) => addDays(today(), shift);

async function openWeek(page: Page, group: GroupInfo, date: string) {
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const weeks = (Date.parse(mondayOf(date)) - Date.parse(mondayOf(today()))) / (7 * 24 * 3600 * 1000);
  for (let i = 0; i < weeks; i++) await page.getByRole("button", { name: "Следующая неделя" }).click();
}

test("the dialog «Преподаватель урока»: roles, the reason in the window, a clear error; A → B → C and the removal read the same for the owner and the teacher @mobile", async ({ signIn }, info) => {
  test.setTimeout(300_000);
  const project = info.project.name;
  const org = await Org.create("Замены 25.10");
  const main = await org.addStaff("teacher", "Основной");
  const second = await org.addStaff("teacher", "Вторая");
  const third = await org.addStaff("teacher", "Третья");
  for (const n of ["Первый", "Четвёртый", "Пятый", "Шестой", "Седьмой"]) await org.addStaff("teacher", `${n}Тест`);
  await org.addStaff("admin", "Админова");
  const group = await org.createGroup({ name: "Группа З-25", teacherId: main.userId });
  const date = ahead(1);
  const lesson = await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(date), startTime: "10:00", endTime: "11:00", topic: "Тема Сменная" });
  const put = (teacherId: string | null, expected: string, reason: string) =>
    org.owner.api.put(`/auth/org/groups/${group.id}/lesson-teacher`, { lessonDate: date, lessonId: lesson.id, teacherId, reason, expectedTeacherId: expected });

  const page = await signIn(org.owner);
  const puts: string[] = [];
  page.on("request", (request) => { if (request.method() === "PUT" && /lesson-teacher$/.test(request.url())) puts.push(request.url()); });

  // --- 2. «Назначить замену»: every row says who the person is; the reason and the buttons are in the window
  await openWeek(page, group, date);
  await page.getByTestId("schedule-card").filter({ hasText: "Тема Сменная" }).click();
  await page.getByRole("dialog", { name: "Тема Сменная" }).getByRole("button", { name: "Назначить замену" }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("radiogroup", { name: "Преподаватель урока" }) });
  await expect(dialog).toBeVisible();
  const roles = await dialog.getByTestId("candidate-role").allTextContents();
  expect(roles.length).toBeGreaterThanOrEqual(9);
  expect(new Set(roles)).toEqual(new Set(["Владелец", "Администратор", "Преподаватель"]));
  await expectWithinViewport(page, dialog.getByLabel("Причина замены"));
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("radio", { name: new RegExp(`^${second.lastName}`) }).click();
  await dialog.getByLabel("Причина замены").fill("Основной на конференции");
  await shot(page, `15-teacher-dialog-roles-${project}`);
  await dialog.getByRole("button", { name: "Назначить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(puts).toHaveLength(1);

  // --- A -> B (done) -> C (by the API: the same endpoint), then «Вернуть преподавателя группы»: first without a reason
  await put(third.userId, second.userId, "Вторая заболела");
  await openWeek(page, group, date);
  await page.getByTestId("schedule-card").filter({ hasText: "Тема Сменная" }).click();
  await page.getByRole("dialog", { name: "Тема Сменная" }).getByRole("button", { name: "Заменить преподавателя" }).click();
  const again = page.getByRole("dialog").filter({ has: page.getByRole("radiogroup", { name: "Преподаватель урока" }) });
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: "Вернуть преподавателя группы" }).click();
  const problem = again.getByRole("alert").filter({ hasText: "Укажите причину" });
  await expect(problem).toBeVisible();
  await expectWithinViewport(page, problem);
  await expectNoHorizontalScroll(page);
  expect(puts).toHaveLength(1); // nothing was sent
  await shot(page, `16-return-without-reason-${project}`);
  await again.getByLabel("Причина замены").fill("Основной вернулся");
  await again.getByRole("button", { name: "Вернуть преподавателя группы" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(puts).toHaveLength(2);

  // --- 3/4. the owner's journal: one line per fact, in the words of the spec
  await page.goto("/owner/substitutions");
  await page.getByRole("tab", { name: /Решённые/ }).click();
  const rows = page.getByRole("listitem").filter({ hasText: group.name });
  await expect(rows.filter({ hasText: /Заменена на .+ — решил\(а\) .+, \d\d\.\d\d \d\d:\d\d/ })).toHaveCount(1);
  await expect(rows.filter({ hasText: /Замену снял\(а\) .+, \d\d\.\d\d \d\d:\d\d/ })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Замена снята:" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await shot(page, `17-owner-journal-chain-${project}`);

  // --- 3. the teacher's own list says the same: no stale «Администратор заменил» next to «Замену снял(а)»
  const mine = await signIn(main);
  await mine.goto("/teacher/dashboard");
  const block = mine.getByRole("region", { name: "Запросы на замену" });
  await expect(block).toContainText(/Заменена на .+ — решил\(а\)/);
  await expect(block).toContainText(/Замену снял\(а\)/);
  await expect(block).not.toContainText("Администратор заменил");
  await expectNoHorizontalScroll(mine);
  await shot(mine, `18-teacher-requests-chain-${project}`);
});

test("a day off: the dry run lists the lessons «группа · дата · время»; the days off are «Действующие» and «Отменённые и прошедшие» @mobile", async ({ signIn }, info) => {
  test.setTimeout(240_000);
  const project = info.project.name;
  const org = await Org.create("Выходные 25.10");
  const t1 = await org.addStaff("teacher", "Первая");
  const t2 = await org.addStaff("teacher", "Вторая");
  const g1 = await org.createGroup({ name: "Группа В-1", teacherId: t1.userId });
  const g2 = await org.createGroup({ name: "Группа В-2", teacherId: t2.userId });
  const d1 = ahead(2);
  const d2 = ahead(3);
  for (const g of [g1, g2]) await org.owner.api.post("/auth/org/schedule/lessons", { groupId: g.id, dayOfWeek: weekdayOf(d1), startTime: "10:00", endTime: "11:00", topic: "Тема" });
  const page = await signIn(org.owner);

  await page.goto("/owner/settings?section=days_off");
  await page.getByTestId("day-off-new").click();
  const dialog = page.getByRole("dialog", { name: "Выходной день центра" });
  await fillDate(dialog.getByLabel("Первый день"), d1);
  await dialog.getByLabel("Причина").fill("Хайит");
  const summary = dialog.getByTestId("day-off-plan-text");
  await expect(summary).toHaveText("Будут отменены 2 урока в 2 группах");               // the sentence has no names of groups in it any more
  const list = dialog.getByTestId("day-off-cancellable").getByRole("listitem");
  await expect(list).toHaveCount(2);
  for (const name of ["Группа В-1", "Группа В-2"]) await expect(list.filter({ hasText: `${name} · ${dmShort(d1)} · 10:00–11:00` })).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await shot(page, `19-day-off-list-preview-${project}`);
  await dialog.getByTestId("day-off-apply").click();
  await expect(page.getByTestId("days-off-list")).toContainText("Хайит");

  // a second day off (nothing to cancel), then the first one is taken back
  await page.getByTestId("day-off-new").click();
  const second = page.getByRole("dialog", { name: "Выходной день центра" });
  await fillDate(second.getByLabel("Первый день"), d2);
  await second.getByLabel("Причина").fill("Навруз");
  await expect(second.getByTestId("day-off-apply")).toHaveText("Сохранить выходной");
  await second.getByTestId("day-off-apply").click();
  await expect(page.getByTestId("days-off-list")).toContainText("Навруз");
  await page.getByTestId("days-off-list").getByRole("listitem").filter({ hasText: "Хайит" }).getByRole("button", { name: "Отменить выходной" }).click();
  await page.getByTestId("day-off-void-apply").click();
  await expect(page.getByTestId("days-off-list")).not.toContainText("Хайит");
  await expect(page.getByText("Действующие")).toBeVisible();
  const past = page.getByTestId("days-off-past");
  await expect(past).toContainText("Отменённые и прошедшие (1)");
  await past.getByText(/Отменённые и прошедшие/).click();
  await expect(page.getByTestId("days-off-past-list")).toContainText("Хайит");
  await expectNoHorizontalScroll(page);
  await shot(page, `20-days-off-two-lists-${project}`);
});

test("three weekdays at once: one request per weekday and ONE line about a busy room, with the days @mobile", async ({ signIn }, info) => {
  test.setTimeout(240_000);
  const project = info.project.name;
  const org = await Org.create("Кабинет 25.10");
  const t1 = await org.addStaff("teacher", "Первая");
  const t2 = await org.addStaff("teacher", "Вторая");
  const g1 = await org.createGroup({ name: "Группа К-1", teacherId: t1.userId });
  const g2 = await org.createGroup({ name: "Группа К-2", teacherId: t2.userId });
  const base = weekdayOf(today());
  const days = [wrap(base + 1), wrap(base + 3), wrap(base + 5)].sort((a, b) => a - b);
  for (const day of days) await org.owner.api.post("/auth/org/schedule/lessons", { groupId: g2.id, dayOfWeek: day, startTime: "16:00", endTime: "17:30", room: "12", topic: "Занято" });
  const page = await signIn(org.owner);
  const posts: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && /\/org\/schedule\/lessons$/.test(request.url())) posts.push(request.url()); });

  await page.goto(`/owner/groups/${g1.id}?tab=schedule`);
  await page.getByRole("button", { name: "Добавить в расписание" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить в расписание" });
  for (const day of days) await dialog.getByRole("button", { name: chipName(day), exact: true }).click();
  await fillTime(dialog.getByLabel("Начало"), "16:00");
  await fillTime(dialog.getByLabel("Окончание"), "17:30");
  await dialog.getByLabel(/Кабинет/).fill("12");
  await dialog.getByLabel(/Тема занятия/).fill("Сразу три");
  await dialog.getByRole("button", { name: "Сохранить урок" }).dblclick();      // a double click: still one request per weekday
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, /Уроки добавлены в расписание группы/)).toBeVisible();
  const line = page.getByText(/Кабинет «12»/);
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(`занят группой «Группа К-2»: ${days.map((d) => SHORT[d]).join(", ")}`);
  expect(posts).toHaveLength(3);
  await expectNoHorizontalScroll(page);
  await shot(page, `21-room-busy-one-line-${project}`);
});
