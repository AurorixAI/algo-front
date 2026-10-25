import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { dm, expectNoHorizontalScroll, fillDate, fillTime, toast } from "../support/ui";

/**
 * P1.1: the teacher moves HIS OWN lesson ahead of time (the administrator's dialog): next Monday -> Wednesday 15:00.  The dialog stands above the lesson
 * panel and Escape closes only the dialog; the toast, the week grid (the Monday card is muted, the Wednesday one says where it came from); the owner reads
 * «Перенёс: преподаватель …» in «Замены и переносы»; the student's card says the lesson moved.
 */
const SHOTS = process.env.P11_SHOTS;
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Перенос");
});

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450); // let the dialog finish sliding in
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const mondayOf = (iso: string) => addDays(iso, 1 - weekdayOf(iso));

test("the teacher moves next Monday to Wednesday 15:00; the owner reads who moved it, the student card says it moved @mobile", async ({ signIn }, info) => {
  test.setTimeout(240_000);
  const project = info.project.name;
  const teacher = await org.addStaff("teacher", "Переносов");
  const group = await org.createGroup({ name: "Группа П11", teacherId: teacher.userId });
  const pupil = await org.addStudent(group, "Анвар", "Ученик");
  const nextMonday = addDays(mondayOf(businessNow().date), 7);
  const nextWednesday = addDays(nextMonday, 2);
  const lesson = await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: 1, startTime: "10:00", endTime: "11:30", topic: "Алгебра" });

  // --- 1. the teacher: the week -> next week -> the Monday lesson -> «Перенести урок»
  const page = await signIn(teacher);
  await page.goto("/teacher/schedule");
  await page.getByRole("button", { name: /На неделю/ }).click();
  await page.getByTitle("Следующая неделя").click();
  await page.getByRole("heading", { name: group.name, level: 4 }).click();
  const panelButton = page.getByRole("button", { name: "Не смогу провести" });
  await expect(panelButton).toBeVisible();
  await expect(page.getByTestId("teacher-move")).toBeVisible();
  await shot(page, `01-panel-${project}`);

  // --- 2. the dialog stands ABOVE the panel; Escape closes only the dialog
  await page.getByTestId("teacher-move").click();
  const sheet = page.getByRole("dialog").filter({ has: page.getByLabel("Новая дата") });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="dialog"]')?.textContent?.includes("Новая дата") ?? false, { x: box!.x + box!.width / 2, y: box!.y + 40 });
  expect(hit, "the dialog is the top layer at its own centre").toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(panelButton).toBeVisible(); // the lesson panel is still there

  // --- 3. fill it in: Wednesday 15:00-16:30, a reason; the live check says the time is free
  await page.getByTestId("teacher-move").click();
  await fillDate(sheet.getByLabel("Новая дата"), nextWednesday);
  await fillTime(sheet.getByLabel("Начало"), "15:00");
  await fillTime(sheet.getByLabel("Окончание"), "16:30");
  await sheet.getByLabel("Причина переноса").fill("Олимпиада у школы");
  await expect(sheet.getByTestId("move-check")).toContainText("Время свободно");
  await expectNoHorizontalScroll(page);
  await shot(page, `02-dialog-${project}`);
  await sheet.getByRole("button", { name: "Перенести урок" }).click();

  // --- 4. the toast, the panel is gone, the week grid changed
  await expect(toast(page, "Урок перенесён")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("week-card-muted")).toHaveCount(1);
  await expect(page.getByTestId("week-card-muted")).toContainText(`Перенесён на`);
  await expect(page.getByText(`Перенесён с ${dm(nextMonday)}, 10:00`)).toBeVisible();
  await expect(page.getByText("15:00–16:30")).toBeVisible();
  await shot(page, `03-week-${project}`);
  const mine = await teacher.api.get("/auth/org/schedule/occurrences", { date_from: nextMonday, date_to: addDays(nextMonday, 7) });
  expect(mine.filter((o: any) => o.groupId === group.id && o.occurrenceDate === nextWednesday && o.startTime === "15:00" && o.movedFrom?.date === nextMonday)).toHaveLength(1);
  const following = mine.find((o: any) => o.id === lesson.id && o.occurrenceDate === addDays(nextMonday, 7));
  expect(following).toMatchObject({ startTime: "10:00", endTime: "11:30" }); // the week after is the usual Monday

  // --- 5. the owner: «Замены и переносы» says WHO moved it
  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  await ownerPage.getByRole("tab", { name: /Решённые/ }).click();
  const row = ownerPage.getByRole("listitem").filter({ hasText: group.name });
  await expect(row).toContainText(/Перенёс: преподаватель Переносов/);
  await expect(row).toContainText("Олимпиада у школы");
  await expect(row).toContainText(/Урок перенесён на/);
  await shot(ownerPage, `04-journal-${project}`);

  // --- 6. the student's card: the lesson moved
  await ownerPage.goto(`/owner/students/${pupil.id}`);
  await expect(ownerPage.getByText(/Урок перенесён на/).first()).toBeVisible();
  await shot(ownerPage, `05-student-${project}`);
});

test("both week grids carry the date under the day name; the status chip of the owner's cells fits at 1280 and 1440 @mobile", async ({ signIn }, info) => {
  test.setTimeout(120_000);
  const project = info.project.name;
  const teacher = await org.addStaff("teacher", "Сеткин");
  const group = await org.createGroup({ name: "Группа П11-С", teacherId: teacher.userId });
  for (let day = 1; day <= 7; day++) {
    await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: day, startTime: "16:00", endTime: "17:30", topic: "Геометрия", room: day % 2 ? "Кабинет 5" : "21" });
  }
  const dateOf = (iso: string) => `${Number(iso.slice(8, 10))} ${["", "янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."][Number(iso.slice(5, 7))]}`;
  const monday = addDays(businessNow().date, 1 - weekdayOf(businessNow().date));
  const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

  // --- the teacher's week: «Пн» and under it «26 окт.» in every column; today is the solid column; the rooms are written «каб. N»
  const page = await signIn(teacher);
  await page.goto("/teacher/schedule");
  await page.getByRole("button", { name: /На неделю/ }).click();
  for (let i = 0; i < 7; i++) await expect(page.locator(`div[title="${days[i]}"]`)).toContainText(dateOf(addDays(monday, i)));
  await expect(page.locator(`div[title="${days[weekdayOf(businessNow().date) - 1]}"]`)).toContainText("Сегодня");
  await expect(page.getByText("каб. 5").first()).toBeVisible();
  await expect(page.getByText("Кабинет 5")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await shot(page, `06-teacher-grid-${project}`);

  // --- the owner's group schedule: the same head; the chip «Запланирован» is whole in its cell
  const ownerPage = await signIn(org.owner);
  await ownerPage.goto(`/owner/groups/${group.id}?tab=schedule`);
  await expect(ownerPage.getByTestId("schedule-card")).toHaveCount(7);
  await expect(ownerPage.getByText("каб. 5").first()).toBeVisible();
  await expect(ownerPage.getByText("Кабинет 5")).toHaveCount(0);
  const sizes = project === "mobile" ? [null] : [{ width: 1280, height: 900 }, { width: 1440, height: 900 }];
  for (const size of sizes) {
    if (size) await ownerPage.setViewportSize(size);
    await ownerPage.waitForTimeout(300);
    const clipped = await ownerPage.getByTestId("schedule-card").evaluateAll((cards) => cards.flatMap((card) => {
      const chip = card.querySelector("span[title]") as HTMLElement | null;
      if (!chip) return ["no chip"];
      const c = card.getBoundingClientRect(), r = chip.getBoundingClientRect();
      return r.right <= c.right - 1 && chip.scrollWidth <= chip.clientWidth + 1 ? [] : [`${chip.textContent}: chip ${Math.round(r.right)} card ${Math.round(c.right)} scroll ${chip.scrollWidth}/${chip.clientWidth}`];
    }));
    expect(clipped, `chips fit at ${size?.width ?? "phone"}`).toEqual([]);
    for (let i = 0; i < 7; i++) await expect(ownerPage.getByText(dateOf(addDays(monday, i)), { exact: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(ownerPage);
    await shot(ownerPage, `07-owner-grid-${size?.width ?? "375"}-${project}`);
  }
});
