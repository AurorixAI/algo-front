import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";

/**
 * LESSON-RULES (26.11): «Урока не было» of a PAST lesson said by a teacher waits for the owner.
 *  1. the teacher reports -> the owner sees the row in «Замены → Ждут решения» (the words of the teacher, «Решить») -> confirms «По вине центра» -> the teacher reads the outcome in «Запросы и изменения уроков»;
 *  2. the teacher reports and takes his report back («Отозвать») before the owner decides -> the owner's list is empty again and the lesson is back among the lessons without a mark.
 * Written for the gate of the screens (run by the lead: `npm run e2e`); the stand's business clock gives the lesson «this very minute» (it has begun, so its cancellation is a REPORT).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Правила уроков");
});

async function worldWithPastLesson(label: string) {
  const teacher = await org.addStaff("teacher", `Отчитавшийся${label}`);
  const group = await org.createGroup({ name: `Группа П${label}`, teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600000);
  await org.addStudent(group, "Анвар", `Ученик${label}`);
  const lesson = await org.createLessonStartingNow(group.id, org.owner, 10);
  return { teacher, group, lesson };
}

const report = (teacher: { api: { post: (path: string, body: unknown) => Promise<unknown> } }, group: { id: string }, lesson: { id: string; date: string }, reason: string) =>
  teacher.api.post(`/auth/org/groups/${group.id}/attendance/reconcile/cancel`, { lessonDate: lesson.date, lessonId: lesson.id, cancellationReason: reason });

test("the teacher reports «урока не было» -> the owner confirms «По вине центра» -> the teacher sees the outcome", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { teacher, group, lesson } = await worldWithPastLesson("1");
  await report(teacher as never, group, lesson, "Отключили свет");

  // the owner: the row of the waiting cancellation, then the window with three outcomes
  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  const row = ownerPage.getByTestId("waiting-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Урока не было: отключили свет");   // the words of the teacher, as the server gave them
  await expect(row).toContainText(group.name);
  await expect(ownerPage.getByRole("tab", { name: /Ждут решения \(1\)/ })).toBeVisible();   // the number of the tab is the server's waitingTotal
  await row.getByRole("button", { name: /Решить отмену/ }).click();
  const dialog = ownerPage.getByRole("dialog");
  await expect(dialog.getByText("Что произошло на самом деле?")).toBeVisible();
  await expect(dialog.getByTestId("waiting-confirm")).toBeDisabled();
  await dialog.getByText("По вине центра", { exact: true }).click();
  await expect(dialog.getByTestId("waiting-caption")).toContainText("Преподавателю урок не оплачивается");
  await dialog.getByRole("button", { name: "Подтвердить: по вине центра" }).click();
  await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);
  await expect(ownerPage.getByRole("tab", { name: /Ждут решения \(0\)/ })).toBeVisible();

  // the history of the owner names the outcome in ONE chip
  await ownerPage.getByRole("tab", { name: "История" }).click();
  await expect(ownerPage.getByTestId("outcome-chip").first()).toHaveText("Отменён: по вине центра");

  // the teacher: the block «Запросы и изменения уроков» says the outcome, nothing to take back any more
  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/dashboard");
  const mine = teacherPage.getByRole("region", { name: "Запросы и изменения уроков" });
  await expect(mine.getByText("Отменён: по вине центра")).toBeVisible();
  await expect(mine.getByRole("button", { name: /Отозвать отмену/ })).toHaveCount(0);
});

test("the teacher reports and takes the report back -> nothing waits for the owner, the lesson is without a mark again", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { teacher, group, lesson } = await worldWithPastLesson("2");
  await report(teacher as never, group, lesson, "Ошибся датой");

  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/dashboard");
  const mine = teacherPage.getByRole("region", { name: "Запросы и изменения уроков" });
  await expect(mine.getByText("Отмена ждёт подтверждения")).toBeVisible();
  // «Отозвать» stands only where the server says canWithdraw: the lesson of this minute is inside the window
  await expect(mine.getByRole("button", { name: /Отозвать отмену/ })).toHaveCount(1);
  await mine.getByRole("button", { name: /Отозвать отмену/ }).click();
  await expect(mine.getByText("Отмена ждёт подтверждения")).toHaveCount(0);

  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);
  // the lesson is among the lessons without a mark again (the teacher's «Ближайшее действие» asks him to settle it)
  await teacherPage.reload();
  await expect(teacherPage.getByTestId("next-action-card")).toContainText(group.name);
});

/**
 * The journal of a group on a PHONE (375; the project @mobile): the «⋯» of the first column of a lesson lies wholly inside the window and opens its menu with an ordinary press
 * (it lay beyond the edge of the screen: the press scrolled the table and that scroll closed the menu).
 */
test("@mobile the journal on a phone: the «⋯» of the first column is inside the window and the menu opens with an ordinary press and stays", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { group } = await worldWithPastLesson("3");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=attendance`);
  const trigger = page.locator("th[data-lesson-key] [data-column-menu-trigger]").first();
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  const width = page.viewportSize()?.width ?? 375;
  expect(box, "the trigger has a box").not.toBeNull();
  expect(box!.x, "«⋯» starts inside the window").toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `«⋯» ends inside the window (${width})`).toBeLessThanOrEqual(width);
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByRole("menu"), "no scroll closed the menu").toBeVisible();
});
