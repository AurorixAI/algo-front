import { test, expect } from "../support/fixtures";
import { Org, type Staff, type GroupInfo, type StudentInfo, type LessonInfo } from "../support/api";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * Teacher: the day of a lesson. Dashboard shows the lesson -> «Начать урок» -> marks (Был / Ув. with a reason)
 * -> «Сохранить отметки» -> «Завершить урок» -> completed. Checked in the UI and, for the marks, in the journal API.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Урок");
});

async function arrange(label: string) {
  const teacher: Staff = await org.addStaff("teacher", `Урокин${label}`);
  const group: GroupInfo = await org.createGroup({ name: `Группа ${label}`, teacherId: teacher.userId });
  const anvar: StudentInfo = await org.addStudent(group, "Анвар", `Каримов${label}`);
  const madina: StudentInfo = await org.addStudent(group, "Мадина", `Рахимова${label}`);
  const lesson: LessonInfo = await org.createLessonStartingNow(group.id);
  return { teacher, group, anvar, madina, lesson };
}

test("teacher runs a lesson from the dashboard to «Завершён» @mobile", async ({ signIn }) => {
  const { teacher, group, anvar, madina, lesson } = await arrange("Т1");
  const page = await signIn(teacher);

  // 1. the dashboard offers the lesson
  await page.goto("/teacher/dashboard");
  await expect(page.getByRole("heading", { name: "Начните урок" })).toBeVisible();
  await expect(page.getByText(`${group.name} · ${lesson.startTime} — ${lesson.endTime}`)).toBeVisible();

  // 2. open it and start
  await page.getByRole("button", { name: "Открыть урок" }).click();
  await page.getByRole("button", { name: "Начать урок" }).click();
  await expect(page.getByRole("heading", { name: /Отметка посещаемости \(0 из 2\)/ })).toBeVisible();

  // 3. «Был» for the first student, «Ув.» for the second - with a reason of at least 3 characters
  const row = (fullName: string) =>
    page.getByText(fullName, { exact: true }).locator('xpath=ancestor::div[.//button[normalize-space()="Ув."]][1]');
  await row(`Каримов${"Т1"} Анвар`).getByRole("button", { name: "Был", exact: true }).click();
  await row(`Рахимова${"Т1"} Мадина`).getByRole("button", { name: "Ув.", exact: true }).click();
  const reason = page.getByRole("textbox", { name: /Причина уважительного пропуска/ });
  await reason.fill("ab");
  await page.getByRole("button", { name: "Сохранить отметки" }).click();
  await expect(page.getByText(/Укажите причину \(не короче 3 символов\)/)).toBeVisible(); // too short: refused
  await expect(reason).toHaveAttribute("aria-invalid", "true");

  await reason.fill("Болела, температура");
  await page.getByRole("button", { name: "Сохранить отметки" }).click();
  await expect(page.getByText("Идёт урок · Посещаемость отмечена")).toBeVisible();
  await expect(page.getByText("Присутствовали: 1 · Ув.: 1")).toBeVisible();

  // the journal holds exactly what was clicked
  const journal = await teacher.api.get(`/auth/org/groups/${group.id}/attendance`, { month: lesson.date.slice(0, 7) });
  const key = Object.keys(journal.records).find((k) => k.includes(lesson.id))!;
  expect(journal.records[key]).toEqual({ [anvar.id]: "present", [madina.id]: "excused" });

  // 4. finish
  const finish = page.getByRole("button", { name: "Завершить урок" });
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(page.getByRole("heading", { name: "На сегодня всё закрыто" })).toBeVisible();
  await expect(page.getByText("Завершён", { exact: true })).toBeVisible();

  const after = await teacher.api.get(`/auth/org/groups/${group.id}/attendance`, { month: lesson.date.slice(0, 7) });
  expect(Object.values(after.statuses)).toContain("completed");
  await expectNoHorizontalScroll(page);
});

test("an unstarted lesson offers only «Начать урок»: no marks, no finish", async ({ signIn }) => {
  const { teacher } = await arrange("Т2");
  const page = await signIn(teacher);
  await page.goto("/teacher/dashboard");
  await page.getByRole("button", { name: "Открыть урок" }).click();
  // the panel offers only the start; no marking buttons yet
  await expect(page.getByRole("button", { name: "Начать урок" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Был", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Завершить урок" })).toHaveCount(0);
  await expect(page.getByText("Состав группы (2 ученика)")).toBeVisible();
});
